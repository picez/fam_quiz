import { useEffect, useRef, type JSX } from 'react';
import { LEVEL_REWARDS, LEVEL_REWARDS_TOP, type LevelReward, type OwnProfile } from '@quiz/shared';
import { t } from '../../i18n';
import { reducedMotion } from '../../motion';
import { nickText } from '../../nick';
import { LevelBar, rewardText, shortDate, TileFace } from '../../profile/LevelCard';
import { SubpageData } from '../../profile/ProfileSubpage';
import { useMyProfile } from '../../profile/useMyProfile';

const EMOJI = { stickers: '💬', perk_boost: '⏩', shape: '🏆', material: '✨' } as const;
const PERK_EMOJI = { time: '⏱️', hint: '💡', ward: '🛡️' } as const;

/** Картинка нагороди: значок — емодзі, вигляд ніка — плитка з «Вигляду», решта — емодзі за видом. Для майбутніх CSS робить силует. */
export function RewardArt({ reward, profile }: { reward: LevelReward; profile: OwnProfile }): JSX.Element {
  const avatar = { id: profile.id, nickname: profile.nickname, avatar: profile.avatar };
  let art: JSX.Element;
  switch (reward.kind) {
    case 'badge':
      art = <span className="look-emoji">{reward.id}</span>;
      break;
    case 'color':
    case 'frame':
    case 'font':
    case 'effect':
    case 'photo':
      art = <TileFace slot={reward.kind} id={reward.id} nickname={nickText(profile.nickname)} avatar={avatar} />;
      break;
    case 'perk':
      art = <span className="look-emoji">{PERK_EMOJI[reward.perk]}</span>;
      break;
    default:
      art = <span className="look-emoji">{EMOJI[reward.kind]}</span>;
  }
  return (
    <span className="reward-art" aria-hidden="true">
      {art}
    </span>
  );
}

/** Дата, коли отримано нагороди рівня: найперший непорожній `at` серед нагород цього рівня; без нього — «давно». */
function gotAt(profile: OwnProfile, level: number): string {
  const at = profile.level.unlocked.find((row) => row.level === level && row.at !== null)?.at ?? null;
  return shortDate(at);
}

function LevelMap({ profile }: { profile: OwnProfile }): JSX.Element {
  const { progress } = profile.level;
  const current = useRef<HTMLLIElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView?.({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, []);
  return (
    <>
      <LevelBar progress={progress} />
      <ol className="level-map">
        {Array.from({ length: LEVEL_REWARDS_TOP }, (_, index) => {
          const level = index + 1;
          const rewards = LEVEL_REWARDS.filter((row) => row.level === level);
          const state = level < progress.level ? 'is-got' : level === progress.level ? 'is-current' : 'is-future';
          return (
            <li key={level} ref={level === progress.level ? current : undefined} className={`level-row ${state}`}>
              <p className="level-row-head">
                <strong>{t('levelAria', { n: level })}</strong>
                {state === 'is-current' && <span className="level-row-here">{t('levelMapHere')}</span>}
                {state === 'is-future' && <span className="level-row-from">{t('levelMapFrom', { n: level })}</span>}
              </p>
              {rewards.length === 0 ? (
                <p className="level-row-none">{t('levelMapNoReward')}</p>
              ) : (
                <ul className="level-row-rewards">
                  {rewards.map(({ reward }, at) => (
                    <li key={at}>
                      <RewardArt reward={reward} profile={profile} />
                      <span>{rewardText(reward)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {state === 'is-current' && <p className="level-row-next">{t('xpMomentToNext', { xp: progress.nextAt - progress.xp, n: level + 1 })}</p>}
              {state !== 'is-future' && rewards.length > 0 && <p className="level-row-date">{t('levelMapGot', { date: gotAt(profile, level) })}</p>}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** /profile/levels: усі рівні з нагородами; майбутні — сірі силуети з підписом «з рівня N», поточний — «Ви тут». */
export function ProfileLevels(): JSX.Element {
  const { state } = useMyProfile();
  return (
    <SubpageData state={state} title={t('levelMapTitle')}>
      {(profile) => <LevelMap profile={profile} />}
    </SubpageData>
  );
}
