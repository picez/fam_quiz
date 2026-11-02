import type { LevelReward, NickLooks, OwnLevel } from '@quiz/shared';
import { useState } from 'react';
import { saveLooks } from '../api';
import { errorText, t, type TextKey } from '../i18n';
import { Nick } from '../screens/Nick';

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

type Slot = 'color' | 'frame' | 'badge';
const GROUPS: { slot: Slot; title: TextKey; none: TextKey }[] = [
  { slot: 'color', title: 'lookColor', none: 'lookNoColor' },
  { slot: 'frame', title: 'lookFrame', none: 'lookNoFrame' },
  { slot: 'badge', title: 'lookBadge', none: 'lookNoBadge' },
];

/** Власний профіль: рівень, шкала, правила досвіду, відкрите з датами, 3 наступні, вибір вбрання. */
export function LevelCard({ level, nickname, onSaved }: { level: OwnLevel; nickname: string; onSaved: (looks: NickLooks) => void }) {
  const [looks, setLooks] = useState<NickLooks>(level.looks);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { progress } = level;
  const span = Math.max(1, progress.nextAt - progress.levelAt);

  const options = (slot: Slot): { id: string; name: string }[] =>
    level.unlocked.flatMap(({ reward }): { id: string; name: string }[] => {
      if (reward.kind === 'color' && slot === 'color') return [{ id: reward.id, name: t(`color_${reward.id}` as TextKey) }];
      if (reward.kind === 'frame' && slot === 'frame') return [{ id: reward.id, name: t(`frame_${reward.id}` as TextKey) }];
      if (reward.kind === 'badge' && slot === 'badge') return [{ id: reward.id, name: reward.id }];
      return [];
    });

  const preview = (slot: Slot, id: string | null) => {
    const next = { ...looks, [slot]: id };
    return (
      <span className="look-preview" aria-hidden="true">
        {slot === 'badge' && next.badge !== null && `${next.badge} `}
        <Nick nickname={nickname} levels={{ [nickname]: { level: 1, color: next.color, frame: next.frame } }} />
      </span>
    );
  };

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
      <h2>{t('levelTitle', { n: progress.level })}</h2>
      <progress value={progress.xp - progress.levelAt} max={span} aria-label={t('levelTitle', { n: progress.level })} />
      <p className="meta">{t('levelXp', { xp: progress.xp, next: progress.nextAt })}</p>
      <p className="meta">{t('xpRules')}</p>
      <h3>{t('levelUnlockedTitle')}</h3>
      <ul className="profile-list level-list">
        {level.unlocked.map((row) => (
          <li key={row.level} data-testid="level-unlocked">
            {`${t('levelAria', { n: row.level })} · ${rewardText(row.reward)} · ${dateText(row.at)}`}
          </li>
        ))}
      </ul>
      {level.next.length > 0 && (
        <>
          <h3>{t('levelNextTitle')}</h3>
          <ul className="profile-list level-list">
            {level.next.map((row) => (
              <li key={row.level} data-testid="level-next">
                {`${rewardText(row.reward)} · ${t('levelFromLevel', { n: row.level })}`}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>{t('looksTitle')}</h3>
      {GROUPS.map(({ slot, title, none }) => (
        <div key={slot} role="radiogroup" aria-label={t(title)} className="look-group">
          <label className="look-option">
            <input type="radio" name={`look-${slot}`} checked={looks[slot] === null} onChange={() => setLooks({ ...looks, [slot]: null })} />
            <span>{t(none)}</span>
          </label>
          {options(slot).map((option) => (
            <label key={option.id} className="look-option">
              <input type="radio" name={`look-${slot}`} checked={looks[slot] === option.id} onChange={() => setLooks({ ...looks, [slot]: option.id } as NickLooks)} />
              <span>{option.name}</span>
              {preview(slot, option.id)}
            </label>
          ))}
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
