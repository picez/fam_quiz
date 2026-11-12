import { useEffect, useRef, useState } from 'react';
import { MELODY_SHARES, MELODY_STEPS, melodySeconds, melodyShare, type PlayerMelody, type PublicMelody, type PublicQuestion, type SubmittedAnswer } from '@quiz/shared';
import { errorText, t } from '../i18n';
import type { Send, SendResult } from '../live/types';
import { useMelodyClip } from '../live/useMelodyClip';
import { AnswerInput } from './AnswerInput';

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
