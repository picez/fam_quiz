import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MELODY_SHARES, MELODY_STEPS, melodySeconds, melodyShare, type MelodyInfo, type MelodyRow, type PlayerMelody, type PublicMelody, type PublicQuestion, type SubmittedAnswer } from '@quiz/shared';
import { signed } from '../format';
import { errorText, t } from '../i18n';
import type { Send, SendResult } from '../live/types';
import { useMelodyClip } from '../live/useMelodyClip';
import { AnswerInput } from './AnswerInput';
import { jigsawTablePageSize } from './JigsawView';
import { puzzleGrid, puzzlePageSize, usePage } from './PuzzleView';

/** Без ack так довго — обрив: шматок знову закритий, звук зупинено (як MEMORY_ACK_MS). */
export const MELODY_ACK_MS = 5000;

const percent = (share: number) => Math.round(share * 100);

function withTimeout(promise: Promise<SendResult>): Promise<SendResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<SendResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: 'offline' }), MELODY_ACK_MS);
  });
  return Promise.race([promise.catch((): SendResult => ({ ok: false, error: 'offline' })), late]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

export interface MelodyStepsProps {
  /** Скільки шматків відкрито (разом із тим, що чекає ack). */
  heard: number;
  /** Наступний шматок можна відкрити. */
  canOpen: boolean;
  /** Номер шматка (1…5), що грає зараз; null — тиша. */
  playing: number | null;
  onPlay: (step: number) => void;
}

/**
 * Драбинка «Мелодії» (29e): 5 комірок в один ряд, у кожній — секунди й частка ціни. Відкрита — «переслухати», наступна — головна
 * («Слухати 1 с», далі «Ще: 2 с»), решта неактивні. Та, що грає, — aria-pressed і анімація.
 */
export function MelodySteps({ heard, canOpen, playing, onPlay }: MelodyStepsProps) {
  return (
    <ol className="melody-steps" dir="ltr">
      {MELODY_STEPS.map((seconds, i) => {
        const step = i + 1;
        const share = percent(MELODY_SHARES[i]);
        const opened = step <= heard;
        const next = !opened && canOpen && step === heard + 1;
        const pressed = opened || next ? playing === step : undefined;
        const className = `melody-step${opened ? ' is-open' : next ? ' is-next' : ' is-locked'}${playing === step ? ' is-playing' : ''}`;
        const label = opened ? t('melodyReplay', { seconds }) : next ? t(step === 1 ? 'melodyListen' : 'melodyMore', { seconds }) : t('melodyStep', { seconds, share });
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

export interface MelodyPlayProps {
  info: PlayerMelody;
  question: PublicQuestion & { melody: PublicMelody };
  /** Номер запитання в раунді (view.questionIndex) — його чекає сервер у player:melody. */
  questionIndex: number;
  /** Пауза гри чи заставка: звук мовчить, дотики не йдуть. */
  paused: boolean;
  /** Запитання ще йде (не сплив час): коли false, звук зупиняється. */
  live: boolean;
  send: Send;
  onSubmit: (answer: SubmittedAnswer) => void;
  onDraft?: (answer: SubmittedAnswer | null) => void;
  /** Власна (командна) відповідь, якщо вже є: драбинка лише для переслуховування, поля немає. */
  answer?: string | null;
}

/** «Мелодія за нотами» (29e) на телефоні: драбинка шматків, частка ціни, поле відповіді; у командах — хто відкрив шматок. */
export function MelodyPlay(props: MelodyPlayProps) {
  // Інша «Мелодія» під тим самим номером — інший трек: локальний шматок і помилка з нуля.
  return <MelodyBoard key={`${props.questionIndex}:${props.question.melody.id}`} {...props} />;
}

function MelodyBoard({ info, question, questionIndex, paused, live, send, onSubmit, onDraft, answer }: MelodyPlayProps) {
  const clip = useMelodyClip(question.melody.track, { paused, live });
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const sendNow = useRef(send);
  sendNow.current = send;
  const stopNow = useRef(clip.stop);
  stopNow.current = clip.stop;

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
  const canOpen = info.canOpen && !answered && !paused && live && heard < MELODY_STEPS.length;
  const playingStep = clip.playing === null ? null : MELODY_STEPS.indexOf(clip.playing as (typeof MELODY_STEPS)[number]) + 1 || null;

  const onPlay = (step: number) => {
    if (step <= heard) {
      clip.play(MELODY_STEPS[step - 1]);
      return;
    }
    // Поки попередній шматок чекає ack, наступний не йде (кнопку не притлумлюємо — без блимання).
    if (!canOpen || pending !== null || step !== heard + 1) return;
    // iOS: звук — синхронно в обробнику дотику, подія — після.
    clip.play(MELODY_STEPS[step - 1]);
    setPendingStep(step);
    setError(null);
    void withTimeout(sendNow.current('player:melody', { questionIndex, step })).then((result) => {
      if (!alive.current || result.ok) return;
      stopNow.current();
      setPendingStep((now) => (now === step ? null : now));
      setError(errorText(result.error));
    });
  };

  const shareLine = answered ? t('melodyAnswered', { seconds: melodySeconds(info.heard) }) : heard >= 1 ? t('melodyShareNow', { share: percent(melodyShare(heard)) }) : t('melodyListenFirst');
  const status = error ?? (clip.state === 'blocked' ? t('melodyBlocked') : clip.state === 'failed' ? t('melodyFailed') : '');

  return (
    <div className="melody-play">
      {clip.element}
      <MelodySteps heard={heard} canOpen={canOpen} playing={playingStep} onPlay={onPlay} />
      <p className="meta melody-share" aria-live="polite">
        {shareLine}
      </p>
      {info.openedBy !== null && info.heard >= 1 && (
        <p className="meta melody-by" dir="auto" aria-live="polite">
          {t('melodyOpenedBy', { name: info.openedBy, seconds: melodySeconds(info.heard) })}
        </p>
      )}
      <p className="puzzle-status melody-status" role="status" aria-live="polite">
        {status}
      </p>
      {answered ? (
        <p className="melody-mine" dir="auto">
          {answer}
        </p>
      ) : (
        <AnswerInput question={question} onSubmit={(value) => onSubmit(value as SubmittedAnswer)} onDraft={onDraft} autoFocus={false} disabled={!info.canAnswer && pending === null} />
      )}
    </div>
  );
}

/**
 * Плитки «нік · 🎧 2 с» усіх гравців (команд) на сцені й пульті (29e): на якому шматку кожен зупинився і чи відповів (✓ без
 * правильності). Звуку й назви тут немає. Сцена — рівні сторінки (puzzleGrid, puzzlePageSize, usePage) і рядок «Відповіли: x з N»;
 * пульт (host) — уся сітка без сторінок (лічильник у нього в шапці).
 */
export function MelodyBoards({ rows, host = false }: { rows: readonly MelodyRow[]; host?: boolean }) {
  const size = puzzlePageSize(rows.length, false);
  const page = usePage(rows.length, size, !host);
  const shown = host ? rows : rows.slice(page * size, page * size + size);
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
                {row.heard > 0 ? t('melodyStageHeard', { seconds: melodySeconds(row.heard) }) : t('melodyStageNone')}
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
 * і час — однакове місце); решта — «—». Шматок із ✓ чи ✗; без відповіді — шматок, який слухав, або «—». Сторінки й шрифт — як у JigsawTable.
 */
export function MelodyTable({ rows, host = false }: { rows: readonly MelodyRow[]; host?: boolean }) {
  const places = rows.map((row, i) => {
    let at = i;
    while (at > 0 && row.correct === true && rows[at - 1].correct === true && rows[at - 1].heard === row.heard && rows[at - 1].timeMs === row.timeMs) at -= 1;
    return at + 1;
  });
  const size = jigsawTablePageSize(rows.length);
  const page = usePage(rows.length, size, !host);
  const from = host ? 0 : page * size;
  const shown = host ? rows : rows.slice(from, from + size);
  return (
    <table className={host ? 'jigsaw-table melody-table is-host' : 'jigsaw-table melody-table'} aria-label={t('melodyTableLabel')} style={host ? undefined : ({ '--rows': shown.length } as CSSProperties)}>
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
            <td className="jigsaw-table-time">{row.heard > 0 ? `${row.answered ? (row.correct === true ? '✓ ' : '✗ ') : ''}${t('jigsawSeconds', { time: String(melodySeconds(row.heard)) })}` : '—'}</td>
            <td className="score">{signed(row.points ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * «Мелодія за нотами» на сцені й пульті (29e). До розкриття — плитки «нік · шматок»; на розкритті — назва (лише на сцені: пульт бачить
 * правильну відповідь у власному рядку) і таблиця з балами. Назва береться лише з publicMelody.answer (на reveal).
 */
export function MelodyStage({ info, melody, reveal, host = false }: { info: MelodyInfo; melody: PublicMelody; reveal: boolean; host?: boolean }) {
  if (!reveal) return <MelodyBoards rows={info.rows} host={host} />;
  return (
    <>
      {!host && melody.answer !== null && (
        <p className="lead melody-title" dir="auto">
          {t('melodyRevealTitle', { title: melody.answer })}
        </p>
      )}
      <div className="jigsaw-stage-table">
        <MelodyTable rows={info.rows} host={host} />
      </div>
    </>
  );
}
