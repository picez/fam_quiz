import { useEffect, useRef, type JSX } from 'react';
import { LEVEL_REWARDS, LEVEL_REWARDS_TOP, type LevelReward, type NickFont, type NickLevel, type OwnProfile } from '@quiz/shared';
import { signedXp } from '../../admin/admin-text';
import { formatDate, num } from '../../format';
import { t } from '../../i18n';
import { loadNickFont } from '../../nick-fonts';
import { reducedMotion } from '../../motion';
import { nickText } from '../../nick';
import { LevelBar, rewardText, shortDate, TileFace } from '../../profile/LevelCard';
import { SubpageData } from '../../profile/ProfileSubpage';
import { Nick } from '../../screens/Nick';
import { useMyProfile } from '../../profile/useMyProfile';

const EMOJI = { stickers: '💬', perk_boost: '⏩', shape: '🏆', material: '✨' } as const;
const PERK_EMOJI = { time: '⏱️', hint: '💡', ward: '🛡️' } as const;

/** Картинка нагороди: значок — емодзі, вигляд ніка — зразок на перших двох літерах ніка (назву вже каже підпис поруч), фото — мале,
 *  решта — емодзі за видом. Усі в однаковій квадратній рамці; для майбутніх CSS робить силует. */
export function RewardArt({ reward, profile }: { reward: LevelReward; profile: OwnProfile }): JSX.Element {
  const avatar = { id: profile.id, nickname: profile.nickname, avatar: profile.avatar };
  const sample = Array.from(nickText(profile.nickname)).slice(0, 2).join('');
  const looks = (over: Pick<NickLevel, 'color'> | Pick<NickLevel, 'frame'>): Record<string, NickLevel> => ({ [sample]: { level: 1, color: null, frame: null, font: null, ...over } });
  let art: JSX.Element;
  switch (reward.kind) {
    case 'badge':
      art = <span className="look-emoji">{reward.id}</span>;
      break;
    case 'color':
      art = <Nick nickname={sample} levels={looks({ color: reward.id as NickLevel['color'] })} />;
      break;
    case 'frame':
      art = <Nick nickname={sample} levels={looks({ frame: reward.id as NickLevel['frame'] })} />;
      break;
    case 'font':
    case 'effect':
      art = <TileFace slot={reward.kind} id={reward.id} nickname={sample} avatar={avatar} />;
      break;
    case 'photo':
      art = <TileFace slot={reward.kind} id={reward.id} nickname={sample} avatar={avatar} size="small" />;
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
  // Вище за карту (рівень > 40) — «Ви тут» на останньому рядку, а «ще X до рівня» — до справжнього наступного.
  const here = Math.min(progress.level, LEVEL_REWARDS_TOP);
  const current = useRef<HTMLLIElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView?.({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, []);
  // Шрифти ніку вантажаться ліниво й лише відкриті: на карті кожен зразок — своїм шрифтом, і майбутні теж.
  useEffect(() => {
    for (const { reward } of LEVEL_REWARDS) if (reward.kind === 'font') void loadNickFont(reward.id as NickFont);
  }, []);
  return (
    <>
      <LevelBar progress={progress} />
      {profile.level.adminXp.length > 0 && (
        <section className="level-admin-xp">
          <h3>{t('levelAdminTitle')}</h3>
          <ul>
            {profile.level.adminXp.map((line, at) => (
              <li key={at}>
                <strong>{signedXp(line.amount)}</strong> <span>{t('levelAdminLine', { note: line.note })}</span> <span className="meta">{formatDate(line.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ol className="level-map">
        {Array.from({ length: LEVEL_REWARDS_TOP }, (_, index) => {
          const level = index + 1;
          const rewards = LEVEL_REWARDS.filter((row) => row.level === level);
          const state = level < here ? 'is-got' : level === here ? 'is-current' : 'is-future';
          return (
            <li key={level} ref={level === here ? current : undefined} className={`level-row ${state}`}>
              <p className="level-row-head">
                <strong>{t('levelAria', { n: level })}</strong>
                {state === 'is-current' && <span className="level-row-here">{t('levelMapHere')}</span>}
                {/* Картинка прихована від читача з екрана, а «Отримано…» мають лише відкриті рядки: замок каже, що рівень ще закритий. */}
                {state === 'is-future' && (
                  <span className="level-row-lock" role="img" aria-label={t('levelMapLocked')}>
                    🔒
                  </span>
                )}
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
              {state === 'is-current' && <p className="level-row-next">{t('xpMomentToNext', { xp: num(progress.nextAt - progress.xp), n: progress.level + 1 })}</p>}
              {state !== 'is-future' && rewards.length > 0 && <p className="level-row-date">{t('levelMapGot', { date: gotAt(profile, level) })}</p>}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** /profile/levels: усі рівні з нагородами; майбутні — сірі силуети із замком, поточний — «Ви тут». */
export function ProfileLevels(): JSX.Element {
  const { state } = useMyProfile();
  return (
    <SubpageData state={state} title={t('levelMapTitle')}>
      {(profile) => <LevelMap profile={profile} />}
    </SubpageData>
  );
}
