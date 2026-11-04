import { LOOK_IDS, lookLevel, type LevelReward, type LookSlot, type NickFont, type NickLooks, type OwnLevel, type PhotoFrame, type ProfileCard } from '@quiz/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { saveLooks } from '../api';
import { errorText, t, type TextKey } from '../i18n';
import { loadNickFont } from '../nick-fonts';
import { nickNameClass, Nick } from '../screens/Nick';
import { Avatar } from './Avatar';
import { AvatarFrame } from './AvatarFrame';

/** Назва нагороди для списків «відкрито» й «далі». */
export function rewardText(reward: LevelReward): string {
  switch (reward.kind) {
    case 'stickers':
      return t('reward_stickers', { series: reward.series });
    case 'color':
      return t('reward_color', { name: t(`color_${reward.id}` as TextKey) });
    case 'frame':
      return t('reward_frame', { name: t(`frame_${reward.id}` as TextKey) });
    case 'badge':
      return t('reward_badge', { id: reward.id });
    case 'photo':
      return t('reward_photo', { name: t(`photo_${reward.id}` as TextKey) });
    case 'font':
      return t('reward_font', { name: t(`font_${reward.id}` as TextKey) });
    case 'perk':
      return t('reward_perk', { name: t(`perk_${reward.perk}` as TextKey) });
    case 'perk_boost':
      return t('reward_perk_boost');
  }
}

function dateText(iso: string | null): string {
  if (iso === null) return t('levelLongAgo');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return t('levelLongAgo');
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** Значок профілю й «Рів. N» біля ніку в шапці профілю. */
export function ProfileLevelMark({ level, badge }: { level: number; badge: string | null }) {
  return (
    <span className="profile-mark">
      {badge !== null && (
        <span className="profile-badge" aria-hidden="true">
          {badge}
        </span>
      )}
      <span className="nick-level" aria-label={t('levelAria', { n: level })}>
        {t('levelBadge', { n: level })}
      </span>
    </span>
  );
}

/**
 * Шкала рівня з правилами досвіду в підказці (не текстом під шкалою): наведення мишею, фокус на «ⓘ» з клавіатури,
 * дотик до шкали чи «ⓘ» на телефоні. Видимість — лише стан open (клас is-open), без :hover/:focus-within у CSS: відкривають наведення,
 * фокус з клавіатури і дотик; закривають відведення миші, втрата фокусу, Escape, другий дотик і дотик поза підказкою.
 * Підказка — role=tooltip, пов'язана з «ⓘ» через aria-describedby.
 */
function LevelMeter({ value, max, level, xp }: { value: number; max: number; level: number; xp: string }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const box = useRef<HTMLDivElement>(null);
  // Фокус від дотику чи кліку не відкриває підказку сам: інакше той самий дотик її одразу й закрив би (фокус → click-перемикач).
  const pointerFocus = useRef(false);
  // Мишею підказку вже відкрило наведення: клік її не перемикає (інакше клік по шкалі закривав би щойно показане); дотик і клавіатура — перемикають.
  const toggle = (event: { nativeEvent: Event }) => {
    const mouse = (event.nativeEvent as PointerEvent).pointerType === 'mouse';
    setOpen((was) => (mouse ? true : !was));
  };
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (box.current !== null && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  return (
    <div
      ref={box}
      className={open ? 'level-meter is-open' : 'level-meter'}
      onClick={toggle}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <progress value={value} max={max} aria-label={t('levelTitle', { n: level })} />
      <div className="level-meter-row">
        <p className="meta">{xp}</p>
        <button
          type="button"
          className="level-info"
          aria-label={t('levelRulesHint')}
          aria-describedby={tipId}
          aria-expanded={open}
          onPointerDown={() => {
            pointerFocus.current = true;
          }}
          onFocus={() => {
            if (!pointerFocus.current) setOpen(true);
            pointerFocus.current = false;
          }}
          onBlur={() => setOpen(false)}
          onClick={(event) => {
            event.stopPropagation();
            toggle(event);
          }}
        >
          <span aria-hidden="true">ⓘ</span>
        </button>
      </div>
      <div id={tipId} role="tooltip" className="level-tip">
        {t('xpRules')}
      </div>
    </div>
  );
}

const GROUPS: { slot: LookSlot; title: TextKey; none: TextKey }[] = [
  { slot: 'photo', title: 'lookPhoto', none: 'lookNoPhoto' },
  { slot: 'font', title: 'lookFont', none: 'lookNoFont' },
  { slot: 'color', title: 'lookColor', none: 'lookNoColor' },
  { slot: 'frame', title: 'lookFrame', none: 'lookNoFrame' },
  { slot: 'badge', title: 'lookBadge', none: 'lookNoBadge' },
];

function lookName(slot: LookSlot, id: string): string {
  return slot === 'badge' ? id : t(`${slot}_${id}` as TextKey);
}

/** Вміст плитки: рамка фото в мініатюрі, нік потрібним шрифтом/кольором/рамкою, емодзі. */
function TileFace({ slot, id }: { slot: LookSlot; id: string }) {
  const name = lookName(slot, id);
  switch (slot) {
    case 'photo':
      return (
        <span className="look-face">
          <AvatarFrame frame={id as PhotoFrame}>
            <span className="look-swatch" aria-hidden="true" />
          </AvatarFrame>
          <span>{name}</span>
        </span>
      );
    case 'font':
      return <span className={nickNameClass(null, id as NickFont)}>{name}</span>;
    case 'color':
      return <Nick nickname={name} levels={{ [name]: { level: 1, color: id as NickLooks['color'], frame: null, font: null } }} />;
    case 'frame':
      return <Nick nickname={name} levels={{ [name]: { level: 1, color: null, frame: id as NickLooks['frame'], font: null } }} />;
    case 'badge':
      return <span className="look-emoji">{name}</span>;
  }
}

/** Власний профіль, одразу під ніком: «Рівень N», шкала, «X / Y досвіду» і правила досвіду в підказці «ⓘ». */
export function LevelBar({ progress }: { progress: OwnLevel['progress'] }) {
  const span = Math.max(1, progress.nextAt - progress.levelAt);
  return (
    <section className="profile-section level-bar">
      <h2>{t('levelTitle', { n: progress.level })}</h2>
      <LevelMeter value={progress.xp - progress.levelAt} max={span} level={progress.level} xp={t('levelXp', { xp: progress.xp, next: progress.nextAt })} />
    </section>
  );
}

/** Власний профіль, нижче статистики: «Нагороди рівнів» — відкрите з датами, 3 наступні, вибір вбрання. */
export function LevelCard({ level, nickname, profile, onSaved }: { level: OwnLevel; nickname: string; profile?: ProfileCard; onSaved: (looks: NickLooks) => void }) {
  const [looks, setLooks] = useState<NickLooks>(level.looks);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const current = level.progress.level;
  // Плитки шрифтів показують нік їхнім шрифтом: вантажимо лише відкриті.
  useEffect(() => {
    for (const id of LOOK_IDS.font) if (lookLevel('font', id) <= current) void loadNickFont(id as NickFont);
  }, [current]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const result = await saveLooks(looks);
    setBusy(false);
    if (result.ok) onSaved(result.data.looks);
    else setProblem(errorText(result.error));
  }

  return (
    <section className="profile-section level-card">
      <h2>{t('levelRewardsTitle')}</h2>
      <h3>{t('levelUnlockedTitle')}</h3>
      <ul className="profile-list level-list">
        {level.unlocked.map((row, index) => (
          <li key={`${row.level}-${index}`} data-testid="level-unlocked">
            {`${t('levelAria', { n: row.level })} · ${rewardText(row.reward)} · ${dateText(row.at)}`}
          </li>
        ))}
      </ul>
      {level.next.length > 0 && (
        <>
          <h3>{t('levelNextTitle')}</h3>
          <ul className="profile-list level-list">
            {level.next.map((row, index) => (
              <li key={`${row.level}-${index}`} data-testid="level-next">
                {`${rewardText(row.reward)} · ${t('levelFromLevel', { n: row.level })}`}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>{t('looksTitle')}</h3>
      <div className="look-preview-box" data-testid="look-preview" aria-live="polite">
        <p className="meta">{t('lookPreview')}</p>
        <div className="look-preview-row">
          <AvatarFrame frame={looks.photo}>
            <Avatar profile={profile ?? { id: '', nickname, avatar: null }} size="large" />
          </AvatarFrame>
          <span className="look-preview">
            {looks.badge !== null && <span className="profile-badge">{looks.badge} </span>}
            <Nick nickname={nickname} levels={{ [nickname]: { level: 1, color: looks.color, frame: looks.frame, font: looks.font } }} />
          </span>
        </div>
      </div>
      {GROUPS.map(({ slot, title, none }) => (
        <div key={slot} role="radiogroup" aria-label={t(title)} className={slot === 'badge' ? 'look-group look-group-badge' : 'look-group'}>
          <label className="look-option">
            <input type="radio" name={`look-${slot}`} checked={looks[slot] === null} onChange={() => setLooks({ ...looks, [slot]: null })} />
            <span>{t(none)}</span>
          </label>
          {LOOK_IDS[slot].map((id) => {
            const need = lookLevel(slot, id);
            const locked = need > current;
            return (
              <label key={id} className={locked ? 'look-option is-locked' : 'look-option'}>
                <input type="radio" name={`look-${slot}`} disabled={locked} checked={looks[slot] === id} onChange={() => setLooks({ ...looks, [slot]: id } as NickLooks)} />
                <TileFace slot={slot} id={id} />
                {locked && <span className="look-lock">{t('lookLocked', { level: t('levelFromLevel', { n: need }) })}</span>}
              </label>
            );
          })}
        </div>
      ))}
      {problem !== null && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="toolbar">
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => void save()}>
          {t('lookSave')}
        </button>
      </div>
    </section>
  );
}
