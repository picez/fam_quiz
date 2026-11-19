import { useEffect, useState, type CSSProperties, type JSX } from 'react';
import { LEVEL_XP, type GameXpMoment, type LevelProgress, type PlayerXpView, type XpLine, type XpReason } from '@quiz/shared';
import { num, signed } from '../format';
import { countText, t, type TextKey } from '../i18n';
import { reducedMotion } from '../motion';
import { rewardText } from '../profile/LevelCard';
import { loginFor } from '../profile/ProfileSubpage';

const REASON_VARS: Record<XpReason, Record<string, number>> = {
  few_questions: { n: LEVEL_XP.minQuestions },
  few_accounts: { n: LEVEL_XP.minAccounts },
  author: {},
  repeat_quiz: {},
  cap: { cap: LEVEL_XP.dailyCap },
};

/** Назва рядка розбивки досвіду (без числа). */
export function xpLineText(line: XpLine): string {
  switch (line.kind) {
    case 'join':
      return t('xpLineJoin');
    case 'correct':
      return countText('xpLineCorrect', line.count, { count: num(line.count) });
    case 'place':
      return t('xpLinePlace', { place: num(line.place) });
    case 'cap':
      return t('xpLineCap');
    case 'achievement':
      return t('xpLineAchievement', { name: t(`achievement_${line.id}` as TextKey) });
  }
}

/** Частка шкали рівня, 0…100. */
function pct(p: LevelProgress): number {
  const span = p.nextAt - p.levelAt;
  return span > 0 ? Math.min(100, Math.max(0, ((p.xp - p.levelAt) / span) * 100)) : 100;
}

/** Текст для читача з екрана: «Новий рівень N!» або підсумок гри; порожній, поки картки немає. */
function announcement(xp: PlayerXpView): string {
  if (!xp.account || xp.moment === null) return '';
  const { before, after, gained } = xp.moment;
  return after.level > before.level ? t('xpMomentLevelUp', { n: after.level }) : t('xpMomentGained', { xp: num(gained) });
}

/** «Досвід за гру» (49): рядки, підсумок, шкала від «до» до «після», новий рівень, причина нуля; гість — одне запрошення.
 *  Область оголошень стоїть від початку порожньою й наповнюється після появи картки — інакше читач екрана її не озвучить. */
export function XpMoment({ xp }: { xp: PlayerXpView | undefined }): JSX.Element | null {
  const text = xp === undefined ? '' : announcement(xp);
  const [said, setSaid] = useState('');
  useEffect(() => {
    setSaid(text);
  }, [text]);
  if (xp === undefined) return null;
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">
        {said}
      </div>
      <XpBody xp={xp} />
    </>
  );
}

function XpBody({ xp }: { xp: PlayerXpView }): JSX.Element {
  if (!xp.account) {
    return (
      <p className="xp-moment-guest">
        {t('xpMomentGuest')} <a href={loginFor('/profile')}>{t('xpMomentGuestLink')}</a>
      </p>
    );
  }
  if (xp.moment === null) return <p className="xp-moment-pending">{t('xpMomentPending')}</p>;
  return <XpCard moment={xp.moment} />;
}

function XpCard({ moment }: { moment: GameXpMoment }): JSX.Element {
  const { before, after } = moment;
  const still = reducedMotion();
  const leveled = after.level > before.level;
  const style = { '--xp-from': `${pct(before)}%`, '--xp-to': `${pct(after)}%` } as CSSProperties;
  const classes = ['xp-moment', still ? 'is-still' : 'is-animated', leveled ? 'is-levelup' : ''].filter(Boolean).join(' ');
  const toNext = after.nextAt - after.xp;
  return (
    <section className={classes} style={style} aria-labelledby="xp-moment-title">
      <h2 id="xp-moment-title">{t('xpMomentTitle')}</h2>
      {moment.lines.length > 0 && (
        <ul className="xp-moment-lines">
          {moment.lines.map((line, index) => (
            <li key={`${line.kind}-${index}`} className={line.xp < 0 ? 'is-minus' : undefined}>
              <span>{xpLineText(line)}</span>
              <b>{signed(line.xp)}</b>
            </li>
          ))}
        </ul>
      )}
      <p className="xp-moment-sum">{t('xpMomentGained', { xp: num(moment.gained) })}</p>
      {moment.reason !== null && <p className="xp-moment-reason">{t(`xpReason_${moment.reason}` as TextKey, REASON_VARS[moment.reason])}</p>}
      <progress
        className="xp-moment-bar"
        value={after.xp - after.levelAt}
        max={after.nextAt - after.levelAt}
        aria-label={t('levelTitle', { n: after.level })}
        aria-valuetext={t('xpMomentToNext', { xp: num(toNext), n: after.level + 1 })}
      />
      {leveled && (
        <div className="xp-moment-levelup">
          <h3>{t('xpMomentLevelUp', { n: after.level })}</h3>
          {moment.unlocked.length > 0 && <p>{t('xpMomentUnlocked', { list: moment.unlocked.map((u) => rewardText(u.reward)).join(', ') })}</p>}
          {/* Звичайне посилання, як MenuLinks: повне перезавантаження закриває сокет гри. */}
          <a href="/profile/levels">{t('xpMomentAllRewards')}</a>
        </div>
      )}
      <p className="xp-moment-next">{t('xpMomentToNext', { xp: num(toNext), n: after.level + 1 })}</p>
    </section>
  );
}
