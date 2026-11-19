import type { SpyInfo, SpyRow } from '@quiz/shared';
import { signed } from '../format';
import { countText, t } from '../i18n';
import { MANY_ROWS } from './dense';

/**
 * Рядки «Шпигуна»: «ім'я — асоціація»; що ще видно, вирішує зріз (сцена й телефони — голоси, позначка шпигуна й бали лише на reveal,
 * пульт — усе з відкриття). Понад MANY_ROWS рядків на сцені — щільний вигляд (24 гравці на 1280×720).
 */
export function SpyRows({ rows }: { rows: SpyRow[] }) {
  return (
    <ul className={rows.length > MANY_ROWS ? 'spy-board is-many' : 'spy-board'}>
      {rows.map((row) => (
        <li key={row.id} className={row.spy === true ? 'spy-row is-spy' : 'spy-row'}>
          <span className="spy-line">
            <span className="name" dir="auto">
              {row.nickname}
            </span>
            {' — '}
            <span className={row.word === null ? 'spy-word is-empty' : 'spy-word'} dir="auto">
              {row.word ?? t('spyNoWord')}
            </span>
          </span>
          {row.voters !== null && row.voters.length > 0 && <span className="spy-votes">{countText('spyVotes', row.voters.length, { count: row.voters.length })}</span>}
          {row.points !== null && row.points > 0 && <span className="spy-points">{signed(row.points)}</span>}
          {row.voters !== null && row.voters.length > 0 && (
            <span className="spy-voters" dir="auto">
              {row.voters.join(', ')}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Підсумок: хто шпигун (чи що він вийшов), загальне слово й підказка, викрито чи ні, і останній шанс. Для reveal і пульта. */
export function SpyVerdict({ info }: { info: SpyInfo }) {
  return (
    <>
      {info.spyName === null ? <p className="lead spy-gone">{t('spyGone')}</p> : <h2 className="spy-title" dir="auto">{t('spyRevealSpy', { name: info.spyName })}</h2>}
      {info.playersWord !== null && (
        <p className="spy-words" dir="auto">
          {t('spyRevealWord', { word: info.playersWord })}
        </p>
      )}
      {info.spyHint !== null && (
        <p className="spy-hint" dir="auto">
          {t('spyRevealHint', { hint: info.spyHint })}
        </p>
      )}
      <SpyOutcome info={info} />
    </>
  );
}

/** Викрито чи ні й останній шанс («…і вгадав слово: +N» чи «…але не вгадав слова: здогадка»); шпигун вийшов — нічого. */
export function SpyOutcome({ info }: { info: SpyInfo }) {
  const spyRow = info.rows?.find((row) => row.spy === true) ?? null;
  return (
    <>
      {info.spyName !== null && info.caught !== null && <p className={info.caught ? 'lead spy-caught' : 'lead spy-hidden'}>{t(info.caught ? 'spyCaught' : 'spyHidden')}</p>}
      {info.spyName !== null && info.caught === true && (
        <p className={info.guessed === true ? 'spy-guess is-guessed' : 'spy-guess'} dir="auto">
          {info.guessed === true ? t('spyGuessed', { points: spyRow?.points ?? 0 }) : info.guess !== null ? t('spyMissedGuess', { guess: info.guess }) : t('spyMissed')}
        </p>
      )}
    </>
  );
}

/**
 * «Шпигун» (38) на сцені й на телефоні при розкритті. words — нічого (рядків ще немає; лічильник — у шапці сцени);
 * vote — «Хто шпигун?» і рядки «ім'я — асоціація» без голосів; guess — «Останній шанс шпигуна…» без імені; reveal — підсумок і голоси. locked (час вийшов, чекаємо розкриття) — замість заголовка й підказки «Чекаємо на правильну відповідь».
 */
export function SpyBoard({ info, locked = false }: { info: SpyInfo; locked?: boolean }) {
  const rows = info.rows ?? [];
  return (
    <section className="spy-view">
      {info.stage === 'reveal' ? (
        <SpyVerdict info={info} />
      ) : locked ? (
        <p className="lead">{t('waitReveal')}</p>
      ) : info.stage === 'guess' ? (
        <p className="lead spy-guess-stage">{t('spyGuessStage')}</p>
      ) : (
        info.stage === 'vote' && (
          <>
            <h2 className="spy-title">{t('spyVoteTitle')}</h2>
            <p className="meta">{t('spyVoteHint')}</p>
          </>
        )
      )}
      {rows.length > 0 && <SpyRows rows={rows} />}
    </section>
  );
}
