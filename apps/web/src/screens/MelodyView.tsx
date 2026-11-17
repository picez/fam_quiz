import { useEffect, useRef, useState } from 'react';
import { MELODY_STEPS, melodySeconds, melodyShare, type MelodyInfo, type MelodyRow, type PlayerMelody, type PublicMelody, type PublicQuestion, type SubmittedAnswer } from '@quiz/shared';
import { errorText, t } from '../i18n';
import type { Send } from '../live/types';
import { useMelodyClip } from '../live/useMelodyClip';
import { AnswerInput } from './AnswerInput';
import { SNIPPET_ACK_MS, SnippetBoards, SnippetSteps, SnippetTable, percent, withTimeout, type SnippetStepsProps, type SnippetTexts } from './SnippetView';

/** Без ack так довго — обрив: шматок знову закритий, звук зупинено (36: спільне SNIPPET_ACK_MS). */
export const MELODY_ACK_MS = SNIPPET_ACK_MS;

/** Тексти «Мелодії» для спільних драбинки, плиток і таблиці (36). */
export const MELODY_TEXTS: SnippetTexts = {
  first: (seconds) => t('melodyListen', { seconds }),
  more: (seconds) => t('melodyMore', { seconds }),
  replay: (seconds) => t('melodyReplay', { seconds }),
  get none() {
    return t('melodyStageNone');
  },
  seen: (seconds) => t('melodyStageHeard', { seconds }),
  get table() {
    return t('melodyTableLabel');
  },
};

export type MelodyStepsProps = Omit<SnippetStepsProps, 'texts'>;

/** Драбинка «Мелодії» (29e): SnippetSteps з текстами «Слухати / Переслухати». */
export function MelodySteps(props: MelodyStepsProps) {
  return <SnippetSteps {...props} texts={MELODY_TEXTS} />;
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
  // Звук гасимо за запізнілою відмовою лише тоді, коли грає саме той шматок: інший, переслуханий пізніше, не чіпаємо.
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
      if (playingNow.current === MELODY_STEPS[step - 1]) stopNow.current();
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
      <p className="meta melody-share">
        {shareLine}
      </p>
      {info.openedBy !== null && info.heard >= 1 && (
        <p className="meta melody-by" dir="auto">
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

/** Плитки «нік · 🎧 2 с» «Мелодії» (29e) на сцені й пульті: SnippetBoards з її текстами. */
export function MelodyBoards({ rows, host = false }: { rows: readonly MelodyRow[]; host?: boolean }) {
  return <SnippetBoards rows={rows} host={host} texts={MELODY_TEXTS} />;
}

/** Таблиця розкриття «Мелодії» (29e): SnippetTable з її текстами. */
export function MelodyTable({ rows, host = false }: { rows: readonly MelodyRow[]; host?: boolean }) {
  return <SnippetTable rows={rows} host={host} texts={MELODY_TEXTS} />;
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
