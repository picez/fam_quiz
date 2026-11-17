import { useEffect, useRef } from 'react';
import { SNIPPET_REVEAL_SECONDS, type PlayerSnippets, type PublicQuestion, type PublicVideoclip, type SnippetInfo, type SubmittedAnswer } from '@quiz/shared';
import { t } from '../i18n';
import type { AudioCommand } from '../live/useGame';
import type { Send } from '../live/types';
import { useVideoClip } from '../live/useVideoClip';
import { SnippetAnswer, SnippetBoards, SnippetSteps, SnippetTable, useSnippetLadder, type SnippetTexts } from './SnippetView';

/** Тексти «Відео за фрагментами» (36) для спільних драбинки, плиток і таблиці. */
export const VIDEOCLIP_TEXTS: SnippetTexts = {
  first: (seconds) => t('videoclipWatch', { seconds }),
  more: (seconds) => t('melodyMore', { seconds }),
  replay: (seconds) => t('videoclipReplay', { seconds }),
  get none() {
    return t('videoclipStageNone');
  },
  seen: (seconds) => t('videoclipStageSeen', { seconds }),
  get table() {
    return t('videoclipTableLabel');
  },
};

export interface VideoclipPlayProps {
  info: PlayerSnippets;
  question: PublicQuestion & { videoclip: PublicVideoclip };
  /** Номер запитання в раунді (view.questionIndex) — його чекає сервер у player:melody. */
  questionIndex: number;
  /** Пауза гри чи заставка: відео мовчить, дотики не йдуть. */
  paused: boolean;
  /** Запитання ще йде (не сплив час): коли false, відео зупиняється. */
  live: boolean;
  send: Send;
  onSubmit: (answer: SubmittedAnswer) => void;
  onDraft?: (answer: SubmittedAnswer | null) => void;
  /** Власна (командна) відповідь, якщо вже є: драбинка лише для перегляду, поля немає. */
  answer: string | null;
}

/** «Відео за фрагментами» (36) на телефоні: рамка під затулкою, драбинка шматків, частка ціни, поле; у командах — хто відкрив шматок. */
export function VideoclipPlay(props: VideoclipPlayProps) {
  // Інше відео під тим самим номером — інше запитання: локальний шматок і помилка з нуля.
  return <VideoclipBoard key={`${props.questionIndex}:${props.question.videoclip.id}`} {...props} />;
}

function VideoclipBoard({ info, question, questionIndex, paused, live, send, onSubmit, onDraft, answer }: VideoclipPlayProps) {
  const { videoclip } = question;
  const clip = useVideoClip(videoclip.clip, { muted: videoclip.muted, paused, live });
  // «Спершу послухайте…» тут не до речі: у відео — власний текст.
  const ladder = useSnippetLadder(clip, { info, answer, paused, live, send, questionIndex, stepError: () => t('videoclipStepFirst') });
  const status = ladder.error ?? (clip.state === 'blocked' ? t('videoclipBlocked') : clip.state === 'failed' ? t('videoclipFailed') : '');

  return (
    <div className="melody-play videoclip-play">
      {clip.element}
      {videoclip.muted && <p className="meta videoclip-muted">{t('videoclipMutedNote')}</p>}
      <SnippetSteps heard={ladder.heard} canOpen={ladder.canOpen} playing={ladder.playingStep} onPlay={ladder.onPlay} texts={VIDEOCLIP_TEXTS} />
      <SnippetAnswer info={info} ladder={ladder} answer={answer} firstLine={t('videoclipWatchFirst')} status={status} question={question} onSubmit={onSubmit} onDraft={onDraft} />
    </div>
  );
}

export interface VideoclipRevealProps {
  videoclip: PublicVideoclip;
  /** Можна грати: етап reveal (сцена — ще й без заставки й паузи). */
  ready: boolean;
  paused: boolean;
  /** «Ще раз / Стоп» ведучого (host:audio → audioCommand). */
  command?: AudioCommand | null;
  /** Телефон: не вмикається сам, лише дотиком до «Переглянути ще раз». */
  onDemand?: boolean;
}

/**
 * Відео на розкритті (36): SNIPPET_REVEAL_SECONDS секунд від початку фрагмента, завжди зі звуком. Сцена й пульт без сцени вмикають його
 * самі, щойно ready, і слухають «Ще раз / Стоп»; телефон (onDemand) — лише дотиком. Якщо браузер не дав звук без жесту, відео грає
 * без звуку, а кнопка «🔊 Увімкнути звук» вмикає звук дотиком.
 */
export function VideoclipReveal({ videoclip, ready, paused, command = null, onDemand = false }: VideoclipRevealProps) {
  const clip = useVideoClip(videoclip.clip, { muted: videoclip.muted, paused, live: ready, reveal: true });
  const playNow = useRef(clip.play);
  playNow.current = clip.play;
  const stopNow = useRef(clip.stop);
  stopNow.current = clip.stop;
  const playingNow = useRef(clip.playing);
  playingNow.current = clip.playing;
  // «Ще раз» ведучого грає лише на готовому розкритті; на паузі — відкладається до її кінця.
  const readyNow = useRef(ready);
  readyNow.current = ready;
  const pausedNow = useRef(paused);
  pausedNow.current = paused;
  const started = useRef(false);
  // Відео грало, коли гру поставили на паузу: після паузи сцена (і пульт без сцени) вмикає його знову, як QuestionAudio.
  const held = useRef(false);
  // Команда, що вже була до монтування, — не нова.
  const lastSeq = useRef<number | null>(command?.seq ?? null);

  // Автостарт — раз, коли розкриття готове (сцена, пульт без сцени).
  useEffect(() => {
    if (onDemand || !ready || paused || started.current) return;
    started.current = true;
    // Відкладене на паузі «Ще раз» уже не потрібне: відео вмикається тут.
    held.current = false;
    playNow.current(SNIPPET_REVEAL_SECONDS);
  }, [onDemand, ready, paused]);

  // Пауза гри: хук глушить відео сам; тут лише запам'ятовуємо, що воно грало, і після паузи вмикаємо знову (з початку фрагмента).
  useEffect(() => {
    if (onDemand) return;
    if (paused) {
      if (playingNow.current !== null) held.current = true;
    } else if (held.current) {
      held.current = false;
      if (ready) playNow.current(SNIPPET_REVEAL_SECONDS);
    }
  }, [onDemand, paused, ready]);

  useEffect(() => {
    if (command === null || command.seq === lastSeq.current) return;
    lastSeq.current = command.seq;
    if (command.action === 'stop') {
      held.current = false;
      stopNow.current();
    } else if (readyNow.current && pausedNow.current) held.current = true;
    else if (readyNow.current) playNow.current(SNIPPET_REVEAL_SECONDS);
  }, [command]);

  const status = clip.state === 'failed' ? t('videoclipFailed') : clip.state === 'blocked' ? t('videoclipBlocked') : '';

  return (
    <div className="videoclip-reveal">
      {clip.element}
      {clip.state === 'muted-fallback' && (
        <button type="button" className="btn videoclip-sound" onClick={() => clip.unmute()}>
          {t('videoclipSoundTap')}
        </button>
      )}
      {onDemand && (
        <button type="button" className="btn videoclip-again" aria-pressed={clip.playing !== null} disabled={!ready || paused} onClick={() => clip.play(SNIPPET_REVEAL_SECONDS)}>
          {t('videoclipWatchAgain')}
        </button>
      )}
      <p className="puzzle-status videoclip-status" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

export interface VideoclipStageProps {
  info: SnippetInfo;
  videoclip: PublicVideoclip;
  reveal: boolean;
  /** Пульт: уся сітка без сторінок, без назви (правильну відповідь ведучий бачить у власному рядку) і без відео (воно — у панелі host-audio). */
  host?: boolean;
  /** Сцена: розкриття готове (без заставки й паузи) — відео вмикається саме. */
  ready?: boolean;
  paused?: boolean;
  /** «Ще раз / Стоп» ведучого. */
  command?: AudioCommand | null;
}

/**
 * «Відео за фрагментами» на сцені й пульті (36). До розкриття — плитки «нік · 👁 шматок · ✓», жодної рамки YouTube; на розкритті — назва
 * (лише на сцені), таблиця з балами й відео зі звуком (лише на сцені). Назва береться лише з publicVideoclip.answer (на reveal).
 */
export function VideoclipStage({ info, videoclip, reveal, host = false, ready = false, paused = false, command = null }: VideoclipStageProps) {
  if (!reveal) return <SnippetBoards rows={info.rows} host={host} texts={VIDEOCLIP_TEXTS} />;
  return (
    <>
      {!host && videoclip.answer !== null && (
        <p className="lead melody-title videoclip-title" dir="auto">
          {t('videoclipRevealTitle', { title: videoclip.answer })}
        </p>
      )}
      {!host && (
        <div className="videoclip-stage-video">
          <VideoclipReveal key={videoclip.id} videoclip={videoclip} ready={ready} paused={paused} command={command} />
        </div>
      )}
      <div className="jigsaw-stage-table">
        <SnippetTable rows={info.rows} host={host} texts={VIDEOCLIP_TEXTS} />
      </div>
    </>
  );
}
