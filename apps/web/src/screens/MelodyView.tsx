import type { MelodyInfo, MelodyRow, PlayerMelody, PublicMelody, PublicQuestion, SubmittedAnswer } from '@quiz/shared';
import { t } from '../i18n';
import type { Send } from '../live/types';
import { useMelodyClip } from '../live/useMelodyClip';
import { SNIPPET_ACK_MS, SnippetAnswer, SnippetBoards, SnippetSteps, SnippetTable, useSnippetLadder, type SnippetStepsProps, type SnippetTexts } from './SnippetView';

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
  const ladder = useSnippetLadder(clip, { info, answer, paused, live, send, questionIndex });
  const status = ladder.error ?? (clip.state === 'blocked' ? t('melodyBlocked') : clip.state === 'failed' ? t('melodyFailed') : '');

  return (
    <div className="melody-play">
      {clip.element}
      <MelodySteps heard={ladder.heard} canOpen={ladder.canOpen} playing={ladder.playingStep} onPlay={ladder.onPlay} />
      <SnippetAnswer info={info} ladder={ladder} answer={answer} firstLine={t('melodyListenFirst')} status={status} question={question} onSubmit={onSubmit} onDraft={onDraft} />
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
