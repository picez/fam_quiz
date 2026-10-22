import { Fragment } from 'react';
import type { BoardInfo } from '@quiz/shared';
import { t } from '../i18n';

/** Розклад кіл: «Коло 1: Оля → Петро → Іра». У першому колі виділено того, хто на черзі, і тих, хто вже походив. */
export function TurnSchedule({ board, heading, limit }: { board: BoardInfo; heading: string; limit?: number }) {
  if (board.schedule.length === 0) return null;
  const circles = limit === undefined ? board.schedule : board.schedule.slice(0, limit);
  return (
    <section className="turn-schedule" aria-label={heading}>
      <h2>{heading}</h2>
      <ol className="turn-circles">
        {circles.map((circle, index) => (
          <li key={circle.number} className="turn-circle">
            {/* Пробіли між елементами — лише для тексту рядка: у flex-контейнері їх не видно, відступи дає gap. */}
            <span className="circle-label">{t('circleLabel', { number: circle.number })}</span>
            {circle.order.map((entry, at) => {
              const marked = index === 0 && board.turn !== null;
              const state = !marked ? '' : at === circle.done ? ' is-turn' : at < circle.done ? ' is-done' : '';
              // Стрілка й ім'я переносяться разом: рядок не починається зі стрілки.
              return (
                <Fragment key={entry.playerId}>
                  {' '}
                  <span className="turn-step">
                    {at > 0 && (
                      <>
                        <span className="turn-arrow" aria-hidden="true">
                          →
                        </span>{' '}
                      </>
                    )}
                    <span className={`turn-name${state}`}>{entry.nickname}</span>
                  </span>
                </Fragment>
              );
            })}
          </li>
        ))}
      </ol>
      {board.scheduleRepeats && <p className="meta">{t('scheduleRepeats')}</p>}
    </section>
  );
}
