import type { CSSProperties } from 'react';
import { SNIPPET_SHARES, SNIPPET_STEPS, pageSlice, snippetSeconds, type SnippetRow } from '@quiz/shared';
import { signed } from '../format';
import { t } from '../i18n';
import type { SendResult } from '../live/types';
import { jigsawTablePageSize } from './JigsawView';
import { puzzleGrid, puzzlePageSize, usePage } from './PuzzleView';

/** Без ack так довго — обрив: шматок знову закритий, звук чи відео зупинено (як MEMORY_ACK_MS). */
export const SNIPPET_ACK_MS = 5000;

export const percent = (share: number) => Math.round(share * 100);

export function withTimeout(promise: Promise<SendResult>): Promise<SendResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<SendResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: 'offline' }), SNIPPET_ACK_MS);
  });
  return Promise.race([promise.catch((): SendResult => ({ ok: false, error: 'offline' })), late]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

/** Тексти, якими «Мелодія» (29e) і «Відео за фрагментами» (36) відрізняються в драбинці, плитках і таблиці. */
export interface SnippetTexts {
  /** Головна дія першої комірки: «Слухати 1 с» / «Дивитись 1 с». */
  first(seconds: number): string;
  /** Наступна комірка: «Ще: 4 с». */
  more(seconds: number): string;
  /** Відкрита комірка: «Переслухати 2 с» / «Переглянути 2 с». */
  replay(seconds: number): string;
  /** Плитка без шматка: «ще не слухав» / «ще не дивився». */
  none: string;
  /** Плитка зі шматком: «🎧 2 с» / «👁 2 с». */
  seen(seconds: number): string;
  /** aria-label таблиці розкриття. */
  table: string;
}

export interface SnippetStepsProps {
  /** Скільки шматків відкрито (разом із тим, що чекає ack). */
  heard: number;
  /** Наступний шматок можна відкрити. */
  canOpen: boolean;
  /** Номер шматка (1…5), що грає зараз; null — тиша. */
  playing: number | null;
  onPlay: (step: number) => void;
  texts: SnippetTexts;
}

/**
 * Драбинка шматків (29e → 36): 5 комірок в один ряд, у кожній — секунди й частка ціни. Відкрита — «переслухати / переглянути»,
 * наступна — головна («Слухати 1 с», далі «Ще: 2 с»), решта неактивні. Та, що грає, — aria-pressed і анімація.
 */
export function SnippetSteps({ heard, canOpen, playing, onPlay, texts }: SnippetStepsProps) {
  return (
    <ol className="melody-steps" dir="ltr">
      {SNIPPET_STEPS.map((seconds, i) => {
        const step = i + 1;
        const share = percent(SNIPPET_SHARES[i]);
        const opened = step <= heard;
        const next = !opened && canOpen && step === heard + 1;
        const pressed = opened || next ? playing === step : undefined;
        const className = `melody-step${opened ? ' is-open' : next ? ' is-next' : ' is-locked'}${playing === step ? ' is-playing' : ''}`;
        const label = opened ? `${texts.replay(seconds)} · ${share} %` : next ? `${step === 1 ? texts.first(seconds) : texts.more(seconds)} · ${share} %` : t('melodyStep', { seconds, share });
        return (
          <li key={step}>
            <button type="button" className={className} aria-label={label} aria-pressed={pressed} disabled={!opened && !next} data-step={step} onClick={() => onPlay(step)}>
              {/* Напис дії («Слухати 1 с», «Ще: 4 с») — в aria-label: у комірці ~41 px на 320 px він ламався б посеред слова. */}
              <span className="melody-step-main" aria-hidden="true">
                {(opened || next) && <span className="melody-step-icon">{opened ? '↺' : '▶'}</span>}
                {t('jigsawSeconds', { time: String(seconds) })}
              </span>
              <span className="melody-step-share" aria-hidden="true">
                {share} %
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Плитки «нік · шматок» усіх гравців (команд) на сцені й пульті: на якому шматку кожен зупинився і чи відповів (✓ без
 * правильності). Звуку, відео й відповіді тут немає. Сцена — рівні сторінки (puzzleGrid, puzzlePageSize, usePage) і рядок «Відповіли: x з N»;
 * пульт (host) — уся сітка без сторінок (лічильник у нього в шапці).
 */
export function SnippetBoards({ rows, host = false, texts }: { rows: readonly SnippetRow[]; host?: boolean; texts: SnippetTexts }) {
  const size = puzzlePageSize(rows.length, false);
  const page = usePage(rows.length, size, !host);
  const shown = host ? rows : pageSlice(rows, page, size);
  const grid = puzzleGrid(shown.length, false);
  const answered = rows.filter((row) => row.answered).length;
  return (
    <>
      {!host && (
        <p className="lead melody-answered" aria-live="polite">
          {t('melodyPlayersAnswered', { count: answered, total: rows.length })}
        </p>
      )}
      <div className={host ? 'melody-boards-fit is-host' : grid.dense ? 'melody-boards-fit is-dense' : 'melody-boards-fit'}>
        <ul className="melody-boards" style={host ? undefined : ({ '--cols': grid.cols, '--rows': grid.rows } as CSSProperties)}>
          {shown.map((row) => (
            <li key={row.playerId} className={row.answered ? 'melody-board is-answered' : 'melody-board'} data-player={row.playerId}>
              <span className="melody-board-name" dir="auto" title={row.nickname}>
                {row.nickname}
              </span>
              <span className="melody-board-heard">
                {row.heard > 0 ? texts.seen(snippetSeconds(row.heard)) : texts.none}
                {row.answered ? ' ✓' : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/**
 * Таблиця розкриття: «місце · нік · шматок · бали» у порядку сервера. Місце — лише в тих, хто відповів правильно (однаковий шматок
 * і час — однакове місце); решта — «—». Шматок із ✓ чи ✗; без відповіді — шматок, який відкрив, або «—». Сторінки й шрифт — як у JigsawTable.
 */
export function SnippetTable({ rows, host = false, texts }: { rows: readonly SnippetRow[]; host?: boolean; texts: SnippetTexts }) {
  const places = rows.map((row, i) => {
    let at = i;
    while (at > 0 && row.correct === true && rows[at - 1].correct === true && rows[at - 1].heard === row.heard && rows[at - 1].timeMs === row.timeMs) at -= 1;
    return at + 1;
  });
  const size = jigsawTablePageSize(rows.length);
  const page = usePage(rows.length, size, !host);
  const from = host ? 0 : page * size;
  const shown = host ? rows : pageSlice(rows, page, size);
  return (
    <table className={host ? 'jigsaw-table melody-table is-host' : 'jigsaw-table melody-table'} aria-label={texts.table} style={host ? undefined : ({ '--rows': shown.length } as CSSProperties)}>
      <thead>
        <tr>
          <th scope="col">{t('jigsawTablePlace')}</th>
          <th scope="col">{t('jigsawTableWho')}</th>
          <th scope="col">{t('melodyTableChunk')}</th>
          <th scope="col">{t('jigsawTablePoints')}</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((row, i) => (
          <tr key={row.playerId} className={row.correct === true ? 'is-done' : 'is-undone'}>
            <td className="rank">{row.correct === true ? places[from + i] : '—'}</td>
            <td className="name" dir="auto">
              {row.nickname}
            </td>
            <td className="jigsaw-table-time">{row.heard > 0 ? `${row.answered ? (row.correct === true ? '✓ ' : '✗ ') : ''}${t('jigsawSeconds', { time: String(snippetSeconds(row.heard)) })}` : '—'}</td>
            <td className="score">{signed(row.points ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
