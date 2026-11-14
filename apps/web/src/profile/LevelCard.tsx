import { LOOK_IDS, lookLevel, PACK_ACHIEVEMENTS, type LevelReward, type LookSlot, type NickEffect, type NickFont, type NickLooks, type OwnLevel, type PhotoFrame, type ProfileCard } from '@quiz/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { saveLooks } from '../api';
import { errorText, t, type TextKey } from '../i18n';
import { loadNickFont } from '../nick-fonts';
import { nickNameClass, Nick, NickFx } from '../screens/Nick';
import { Avatar } from './Avatar';
import { AvatarFrame } from './AvatarFrame';

/** Назва нагороди для списків «відкрито» й «далі». */
export function rewardText(reward: LevelReward): string {
  switch (reward.kind) {
    case 'stickers': {
      // Набір за досягнення (34) відкривається й раніше — це видно в назві нагороди.
      const name = t(`pack_${reward.pack}` as TextKey);
      const by = PACK_ACHIEVEMENTS[reward.pack];
      return by === undefined ? t('reward_stickers', { name }) : t('reward_stickersOr', { name, achievement: t(`achievement_${by}` as TextKey) });
    }
    case 'effect':
      return t('reward_effect', { name: t(`effect_${reward.id}` as TextKey) });
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
    case 'shape':
      return t('reward_shape', { name: t(`trophy_${reward.id}` as TextKey) });
    case 'material':
      return t('reward_material', { name: t(`material_${reward.id}` as TextKey) });
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
  { slot: 'effect', title: 'lookEffect', none: 'lookNoEffect' },
  { slot: 'badge', title: 'lookBadge', none: 'lookNoBadge' },
];

function lookName(slot: LookSlot, id: string): string {
  return slot === 'badge' ? id : t(`${slot}_${id}` as TextKey);
}

/** Вміст плитки: власне фото в рамці, нік власним шрифтом, назва кольором/рамкою, емодзі. Підпис — назва вигляду. */
function TileFace({ slot, id, nickname, avatar }: { slot: LookSlot; id: string | null; nickname: string; avatar: ProfileCard }) {
  const name = id === null ? null : lookName(slot, id);
  switch (slot) {
    case 'photo':
      return (
        <span className="look-art" aria-hidden="true">
          <AvatarFrame frame={id as PhotoFrame | null}>
            <Avatar profile={avatar} size="medium" />
          </AvatarFrame>
        </span>
      );
    case 'font':
      return (
        <span className="look-art look-art-font" aria-hidden="true">
          <span className={nickNameClass(null, id as NickFont | null)} dir="auto">
            {nickname}
          </span>
        </span>
      );
    case 'color':
      return name === null ? null : <Nick nickname={name} levels={{ [name]: { level: 1, color: id as NickLooks['color'], frame: null, font: null } }} />;
    case 'frame':
      return name === null ? null : <Nick nickname={name} levels={{ [name]: { level: 1, color: null, frame: id as NickLooks['frame'], font: null } }} />;
    case 'effect':
      // Нік власника з ефектом (34); закрита плитка стоїть нерухомо (CSS .look-option.is-locked).
      return (
        <span className="look-art look-art-font" aria-hidden="true">
          <NickFx effect={id as NickEffect | null}>
            <span className={nickNameClass(null, null)} dir="auto">
              {nickname}
            </span>
          </NickFx>
        </span>
      );
    case 'badge':
      return <span className="look-emoji">{name}</span>;
  }
}

/** Відкрите, згруповане за рівнем, найновіше першим: «Рівень 17 · Значок 🧠, Рамка фото: Вогонь · 04.11.2026». */
export function unlockedByLevel(rows: OwnLevel['unlocked']): { level: number; text: string }[] {
  const byLevel = new Map<number, OwnLevel['unlocked']>();
  for (const row of rows) byLevel.set(row.level, [...(byLevel.get(row.level) ?? []), row]);
  return [...byLevel.entries()]
    .sort(([a], [b]) => b - a)
    .map(([lvl, group]) => {
      const at = group.find((row) => row.at !== null)?.at ?? null;
      return { level: lvl, text: `${t('levelAria', { n: lvl })} · ${group.map((row) => rewardText(row.reward)).join(', ')} · ${dateText(at)}` };
    });
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
  const groupId = useId();
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

  const avatar = profile ?? { id: '', nickname, avatar: null };
  const unlocked = unlockedByLevel(level.unlocked);
  return (
    <section className="profile-section level-card">
      <h2>{t('levelRewardsTitle')}</h2>
      <h3>{t('looksTitle')}</h3>
      <div className="look-preview-box" data-testid="look-preview" aria-live="polite">
        <p className="meta">{t('lookPreview')}</p>
        <div className="look-preview-row">
          <AvatarFrame frame={looks.photo}>
            <Avatar profile={avatar} size="large" />
          </AvatarFrame>
          <span className="look-preview">
            {looks.badge !== null && <span className="profile-badge">{looks.badge} </span>}
            <Nick nickname={nickname} levels={{ [nickname]: { level: 1, color: looks.color, frame: looks.frame, font: looks.font, ...(looks.effect === null ? {} : { effect: looks.effect }) } }} />
          </span>
        </div>
      </div>
      {GROUPS.map(({ slot, title, none }) => (
        <div key={slot} className="look-group-box">
          <h4 id={`${groupId}-${slot}`} className="look-group-title">
            {t(title)}
          </h4>
          <div role="radiogroup" aria-labelledby={`${groupId}-${slot}`} data-slot={slot} className={`look-group look-group-${slot}`}>
            {[null, ...LOOK_IDS[slot]].map((id) => {
              const need = id === null ? 1 : lookLevel(slot, id);
              const locked = need > current;
              const face = <TileFace slot={slot} id={id} nickname={nickname} avatar={avatar} />;
              return (
                <label key={id ?? ''} className={`look-option${id === null ? ' is-none' : ''}${locked ? ' is-locked' : ''}`}>
                  <input type="radio" name={`look-${slot}`} disabled={locked} checked={looks[slot] === id} onChange={() => setLooks({ ...looks, [slot]: id } as NickLooks)} />
                  {(id !== null || slot === 'photo' || slot === 'font' || slot === 'effect') && <span className="look-face-wrap">{face}</span>}
                  {(id === null || slot === 'photo' || slot === 'font' || slot === 'effect') && <span className="look-name">{id === null ? t(none) : lookName(slot, id)}</span>}
                  {locked && slot === 'badge' && (
                    <span className="look-lock">
                      <span aria-hidden="true">{`🔒 ${need}`}</span>
                      <span className="sr-only">{t('lookLocked', { level: t('levelFromLevel', { n: need }) })}</span>
                    </span>
                  )}
                  {locked && slot !== 'badge' && <span className="look-lock">{t('lookLocked', { level: t('levelFromLevel', { n: need }) })}</span>}
                </label>
              );
            })}
          </div>
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
      {level.next.length === 0 && <p className="meta">{t('levelAllOpen')}</p>}
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
      <details className="level-unlocked">
        <summary>
          <h3>{`${t('levelUnlockedTitle')} · ${unlocked.length}`}</h3>
        </summary>
        <ul className="profile-list level-list">
          {unlocked.map((row) => (
            <li key={row.level} data-testid="level-unlocked">
              {row.text}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
