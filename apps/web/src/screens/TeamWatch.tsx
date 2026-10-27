import { useEffect, useLayoutEffect, useRef } from 'react';
import { clipDraft, type Answer, type DraftValue, type PlayerView, type PublicQuestion, type SortTilt } from '@quiz/shared';
import { LETTERS, pickedText, shownChoices } from '../format';
import { t } from '../i18n';
import { ChoiceFace, choicesClass } from './ChoiceFace';
import type { Send } from '../live/types';
import { ChainWords } from './ChainView';
import { PinBoard } from './PinBoard';
import { SortWatch } from './SortView';
import { WallGrid } from './WallGrid';
import { BluffBoard } from './BluffBoard';
import { buzzerOf, memberName, teamOf } from './TeamBar';

export type DraftSender = ((draft: DraftValue | null) => void) & { cancel: () => void };
/** Поле з живим вибором (12b): кожна зміна — onDraft; перед власною подією (спроба стіни, слово, вигадка) — cancel, якщо є. */
export type DraftInput = ((draft: DraftValue | null) => void) & { cancel?: () => void };

/** Не частіше за раз на стільки мс. */
export const DRAFT_MS = 250;

/**
 * Живий вибір (10j, 12b): останнє значення йде не частіше ніж раз на DRAFT_MS, однакове двічі поспіль не шлеться, текст обрізано до DRAFT_TEXT_MAX.
 * Відмова too_soon ставить те саме значення в чергу ще раз (якщо за цей час не прийшло нове).
 * active = false (не мій хід, відповідь подано) скасовує те, що ще чекає; з новим запитанням (key) лічильник «вже надіслано» скидається.
 * cancel (перед спробою стіни, словом ланцюжка, вигадкою) теж забуває «вже надіслано»: сервер міг скинути чернетку, і після
 * відхиленої спроби поле шле своє значення знову.
 */
export function useDraftSender(send: Send, active: boolean, key: string | number): DraftSender {
  const pending = useRef<{ draft: DraftValue | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // undefined — що лежить на сервері, невідомо: наступне значення йде завжди.
  const sent = useRef<string | undefined>('null');
  // Росте з кожним скасуванням: відповідь сервера на скасоване вже нічого не повторює.
  const epoch = useRef(0);
  const sendRef = useRef(send);
  sendRef.current = send;
  const stop = () => {
    sent.current = undefined;
    epoch.current += 1;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  };
  const schedule = () => {
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const next = pending.current;
      pending.current = null;
      if (next === null) return;
      const text = JSON.stringify(next.draft);
      if (text === sent.current) return;
      sent.current = text;
      const at = epoch.current;
      void Promise.resolve(sendRef.current('player:draft', { draft: next.draft })).then((result) => {
        // Сервер не взяв (понад DRAFTS_PER_SECOND): те саме ще раз, якщо новішого немає і нічого не скасовано.
        if (!result || result.ok || result.error !== 'too_soon' || at !== epoch.current) return;
        sent.current = undefined;
        if (pending.current === null) pending.current = next;
        schedule();
      }, () => undefined);
    }, DRAFT_MS);
  };
  // Нове запитання, спроба чи етап — чернетка на сервері вже інша; перехід права діяти теж скидає «вже надіслано».
  // useLayoutEffect: скидання йде до звичайних ефектів полів, тож значення, яке поле шле знову після зміни ключа (підказка ланцюжка), не губиться.
  useLayoutEffect(() => {
    stop();
    sent.current = 'null';
  }, [key]);
  useEffect(() => {
    sent.current = undefined;
    if (!active) stop();
    return stop;
  }, [active]);
  const push = ((draft: DraftValue | null) => {
    if (!active) return;
    pending.current = { draft: draft === null ? null : clipDraft(draft) };
    schedule();
  }) as DraftSender;
  push.cancel = stop;
  return push;
}

/** Які варіанти капітан позначив чернеткою (single / multi). */
function draftIds(draft: Answer | null): string[] {
  if (draft === null) return [];
  if (draft.type === 'single') return [draft.optionId];
  if (draft.type === 'multi') return draft.optionIds;
  return [];
}

/** Варіанти без дотиків; позначені капітаном — пунктирною рамкою й підписом (це не вердикт). */
function DraftChoices({ question, draft, mark }: { question: PublicQuestion; draft: Answer | null; mark: string }) {
  const marked = draftIds(draft);
  return (
    <div className={choicesClass(question.choices)}>
      {question.choices.map((choice, index) => {
        const on = marked.includes(choice.id);
        return (
          <div key={choice.id} className={on ? 'choice is-draft' : 'choice'}>
            <ChoiceFace choice={choice} letter={LETTERS[index]} />
            {on && <span className="draft-mark">{mark}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Так / ні без дотиків. */
function DraftBoolean({ draft, mark }: { draft: Answer | null; mark: string }) {
  return (
    <div className="choices">
      {[true, false].map((value) => {
        const on = draft?.type === 'boolean' && draft.value === value;
        return (
          <div key={String(value)} className={on ? 'choice is-draft' : 'choice'}>
            <span>{t(value ? 'yes' : 'no')}</span>
            {on && <span className="draft-mark">{mark}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Режим перегляду некапітана: чернетка капітана наживо або відповідь команди, коли її подано. */
export function TeamWatch({ view, tilts = {}, offsetMs = 0 }: { view: PlayerView; tilts?: Record<string, SortTilt>; offsetMs?: number }) {
  const { question, me, team } = view;
  if (question === null || team === null) return <></>;
  // У бліці з кнопкою відповідає той, хто натиснув.
  const buzzer = buzzerOf(view);
  const lead = buzzer !== null ? t('teamWatchBuzzer', { name: memberName(view, buzzer) }) : t('teamWatchLead', { name: memberName(view, team.captainId) });
  const mark = t(buzzer !== null ? 'teamDraftNeutral' : 'teamDraftMark');
  if (me.answer !== null) {
    return (
      <section className="sent team-watch">
        <h2>{t('teamAnswered')}</h2>
        {me.answer.type === 'pin' && question.pin !== null ? (
          <PinBoard pin={question.pin} imageUrl={question.imageUrl} marks={[{ playerId: me.id, nickname: me.nickname, x: me.answer.x, y: me.answer.y }]} highlight={me.id} />
        ) : (
          <p>{pickedText(me.answer, shownChoices(question), question.slider)}</p>
        )}
      </section>
    );
  }
  const draft = team.draft;
  return (
    <section className={`team-watch team-${teamOf(view)?.color ?? 0}`}>
      {/* Живий регіон: зміна того, хто відповідає, озвучується. */}
      <p className="lead team-watch-lead" aria-live="polite">
        {lead}
      </p>
      {draft !== null && (
        <p className="sr-only" aria-live="polite">
          {t('teamDraftLive', { mark, text: pickedText(draft, shownChoices(question), question.slider) })}
        </p>
      )}
      {/* Сортування, стіна й ланцюжок ідуть хід за ходом: поступ команди видно зі стану, чернетки немає. */}
      {question.type === 'sort' && view.sort !== null && (
        <SortWatch question={question} info={view.sort} live={me.sort?.live ?? null} tilts={tilts} paused={view.paused} offsetMs={offsetMs} team />
      )}
      {question.type === 'wall' && question.wall !== null && <WallGrid wall={question.wall} found={me.wall?.found ?? []} />}
      {question.type === 'chain' && question.chain !== null && me.chain !== null && <ChainWords first={question.chain.first} masks={me.chain.masks} />}
      {question.type === 'bluff' && view.bluff !== null && view.bluff.stage === 'choice' && <BluffBoard info={view.bluff} autopilot={view.autopilot} />}
      {question.type === 'bluff' && <p className="meta">{t('teamCaptainDecides')}</p>}
      {question.type === 'boolean' ? (
        <DraftBoolean draft={draft} mark={mark} />
      ) : (question.type === 'single' || question.type === 'multi') && question.choices.length > 0 ? (
        <DraftChoices question={question} draft={draft} mark={mark} />
      ) : null}
      {draft !== null && question.type !== 'boolean' && question.type !== 'single' && question.type !== 'multi' && (
        <div className="team-draft is-draft">
          <span className="draft-mark">{mark}</span>
          {draft.type === 'pin' && question.pin !== null ? (
            <PinBoard pin={question.pin} imageUrl={question.imageUrl} marks={[{ playerId: 'draft', nickname: '', x: draft.x, y: draft.y }]} highlight="draft" />
          ) : (
            <p>{pickedText(draft, shownChoices(question), question.slider)}</p>
          )}
        </div>
      )}
    </section>
  );
}
