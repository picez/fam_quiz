import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SNIPPET_SHARES, SNIPPET_STEPS, pageSlice, snippetSeconds, snippetShare, type PlayerSnippets, type PublicQuestion, type SnippetRow, type SubmittedAnswer } from '@quiz/shared';
import { signed } from '../format';
import { errorText, t } from '../i18n';
import type { Send, SendResult } from '../live/types';
import { AnswerInput } from './AnswerInput';
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

/** Програвач шматків: звук «Мелодії» (useMelodyClip) чи відео (useVideoClip). playing — секунди шматка, що грає. */
export interface SnippetClip {
  play(seconds: number): void;
  stop(): void;
  playing: number | null;
}

export interface SnippetLadderOptions {
  info: PlayerSnippets;
  /** Власна (командна) відповідь, якщо вже є. */
  answer: string | null | undefined;
  paused: boolean;
  live: boolean;
  send: Send;
  /** Номер запитання в раунді — його чекає сервер у player:melody. */
  questionIndex: number;
  /** Текст відмови melody_step, якщо тип має власний (відео: «Спершу перегляньте…»). */
  stepError?: () => string;
}

/**
 * Стан драбинки шматків на телефоні (29e → 36): відкритий локально шматок до ack, що можна відкрити, що грає, і дотик.
 * Дотик до наступної комірки: clip.play — синхронно в обробнику (iOS), потім player:melody; відмова гасить саме той шматок і закриває комірку.
 */
export function useSnippetLadder(clip: SnippetClip, { info, answer, paused, live, send, questionIndex, stepError }: SnippetLadderOptions) {
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const sendNow = useRef(send);
  sendNow.current = send;
  const stopNow = useRef(clip.stop);
  stopNow.current = clip.stop;
  const stepErrorNow = useRef(stepError);
  stepErrorNow.current = stepError;
  // Програвач гасимо за запізнілою відмовою лише тоді, коли грає саме той шматок: інший, відкритий пізніше, не чіпаємо.
  const playingNow = useRef(clip.playing);
  playingNow.current = clip.playing;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Шматок, який зріз уже відкрив, більше не «чекає».
  const pending = pendingStep !== null && pendingStep > info.heard ? pendingStep : null;
  const heard = Math.max(info.heard, pending ?? 0);
  const answered = answer != null;
  const canOpen = info.canOpen && !answered && !paused && live && heard < SNIPPET_STEPS.length;
  const playingStep = clip.playing === null ? null : SNIPPET_STEPS.indexOf(clip.playing as (typeof SNIPPET_STEPS)[number]) + 1 || null;

  const onPlay = (step: number) => {
    if (step <= heard) {
      clip.play(SNIPPET_STEPS[step - 1]);
      return;
    }
    // Поки попередній шматок чекає ack, наступний не йде (кнопку не притлумлюємо — без блимання).
    if (!canOpen || pending !== null || step !== heard + 1) return;
    // iOS: програвач — синхронно в обробнику дотику, подія — після.
    clip.play(SNIPPET_STEPS[step - 1]);
    setPendingStep(step);
    setError(null);
    void withTimeout(sendNow.current('player:melody', { questionIndex, step })).then((result) => {
      if (!alive.current || result.ok) return;
      if (playingNow.current === SNIPPET_STEPS[step - 1]) stopNow.current();
      setPendingStep((now) => (now === step ? null : now));
      const own = result.error === 'melody_step' ? stepErrorNow.current : undefined;
      setError(own !== undefined ? own() : errorText(result.error));
    });
  };

  return { heard, pending, answered, canOpen, playingStep, onPlay, error };
}

/**
 * Низ телефона під драбинкою (29e → 36): частка ціни (до першого шматка — firstLine), хто з команди відкрив, рядок стану й поле
 * відповіді (після відповіді — сама відповідь).
 */
export function SnippetAnswer({
  info,
  ladder,
  answer,
  firstLine,
  status,
  question,
  onSubmit,
  onDraft,
}: {
  info: PlayerSnippets;
  ladder: Pick<ReturnType<typeof useSnippetLadder>, 'heard' | 'pending' | 'answered'>;
  answer: string | null | undefined;
  firstLine: string;
  status: string;
  question: PublicQuestion;
  onSubmit: (answer: SubmittedAnswer) => void;
  onDraft?: (answer: SubmittedAnswer | null) => void;
}) {
  const shareLine = ladder.answered ? t('melodyAnswered', { seconds: snippetSeconds(info.heard) }) : ladder.heard >= 1 ? t('melodyShareNow', { share: percent(snippetShare(ladder.heard)) }) : firstLine;
  return (
    <>
      <p className="meta melody-share">{shareLine}</p>
      {info.openedBy !== null && info.heard >= 1 && (
        <p className="meta melody-by" dir="auto">
          {t('melodyOpenedBy', { name: info.openedBy, seconds: snippetSeconds(info.heard) })}
        </p>
      )}
      <p className="puzzle-status melody-status" role="status" aria-live="polite">
        {status}
      </p>
      {ladder.answered ? (
        <p className="melody-mine" dir="auto">
          {answer}
        </p>
      ) : (
        <AnswerInput question={question} onSubmit={(value) => onSubmit(value as SubmittedAnswer)} onDraft={onDraft} autoFocus={false} disabled={!info.canAnswer && ladder.pending === null} />
      )}
    </>
  );
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
