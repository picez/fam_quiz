import type { CSSProperties } from 'react';
import type { BlitzRow, PublicQuestion } from '@quiz/shared';
import { pickedText, secondsText, shownChoices } from '../format';
import { t } from '../i18n';

interface Props {
  rows: BlitzRow[];
  /** Скільки рядків резервувати: кількість гравців (у CSS не більше 6). */
  reserve: number;
  /** Для підпису вибору літерою показу. */
  question: PublicQuestion | null;
  blinking: ReadonlySet<string>;
  /** Ведучий: перша неперевірена відповідь помаранчева. */
  highlightHead?: boolean;
  /** Запитання закрите: неперевірені рядки — «не перевірено», голови вже немає. */
  closed?: boolean;
}

/** Позначка рядка: вердикт, «Перевіряємо» для голови, «не перевірено» після закриття. */
function Mark({ row, head, closed, blinking }: { row: BlitzRow; head: boolean; closed: boolean; blinking: boolean }) {
  if (row.grade !== null) {
    const correct = row.grade === 'correct';
    return (
      <span className={`blitz-mark ${correct ? 'is-correct' : 'is-wrong'}${blinking ? ' is-blinking' : ''}`} aria-label={t(correct ? 'blitzRowCorrect' : 'blitzRowWrong')}>
        {correct ? '✓' : '✗'}
      </span>
    );
  }
  if (closed) return <span className="blitz-mark is-unchecked">{t('blitzUnchecked')}</span>;
  if (head) return <span className="blitz-mark is-pending">{t('blitzChecking')}</span>;
  return <span className="blitz-mark" />;
}

/**
 * Жива черга миттєвого бліцу: «1 · Оля · 2,4 с · ✗». Блок фіксованої висоти: поява рядків не зсуває
 * нічого над ним і під ним, зайві рядки прокручуються всередині.
 */
export function BlitzQueue({ rows, reserve, question, blinking, highlightHead = false, closed = false }: Props) {
  const style = { '--rows': Math.min(Math.max(reserve, 1), 6) } as CSSProperties;
  const head = closed ? -1 : rows.findIndex((row) => row.grade === null);
  const choices = question === null ? [] : shownChoices(question);
  return (
    <ol className="rows blitz-queue is-reserved" aria-label={t('blitzQueueLabel')} style={style}>
      {rows.length === 0 ? (
        <li className="is-empty">{t('blitzQueueEmpty')}</li>
      ) : (
        rows.map((row, index) => (
          <li key={row.playerId} className={index === head ? `is-head${highlightHead ? ' is-pending' : ''}` : undefined}>
            <span className="rank">{index + 1}</span>
            <span className="name">{row.nickname}</span>
            {row.answer !== null && <span className="given">{pickedText(row.answer, choices)}</span>}
            <span className="time">{t('blitzRowTime', { time: secondsText(row.timeMs) })}</span>
            <Mark row={row} head={index === head} closed={closed} blinking={blinking.has(row.playerId)} />
          </li>
        ))
      )}
    </ol>
  );
}
