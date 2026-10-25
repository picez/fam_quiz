import { useEffect, useRef } from 'react';
import type { Answer, PlayerView, PublicQuestion } from '@quiz/shared';
import { LETTERS, pickedText, shownChoices } from '../format';
import { t } from '../i18n';
import { ChoiceFace, choicesClass } from './ChoiceFace';
import type { Send } from '../live/types';
import { ChainWords } from './ChainView';
import { PinBoard } from './PinBoard';
import { SortWatch } from './SortView';
import { WallGrid } from './WallGrid';
import { memberName, teamOf } from './TeamBar';

/** Не частіше за раз на стільки мс. */
export const DRAFT_MS = 250;

/**
 * Чернетка відповіді для товаришів: останнє значення йде не частіше ніж раз на DRAFT_MS, однакове двічі поспіль не шлеться.
 * active = false (не мій хід, відповідь подано) скасовує те, що ще чекає; з новим запитанням (key) лічильник «вже надіслано» скидається.
 */
export function useDraftSender(send: Send, active: boolean, key: number): (draft: Answer | null) => void {
  const pending = useRef<{ draft: Answer | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sent = useRef('null');
  const sendRef = useRef(send);
  sendRef.current = send;
  const stop = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  };
  useEffect(() => {
    sent.current = 'null';
    stop();
  }, [key]);
  useEffect(() => {
    if (!active) stop();
    return stop;
  }, [active]);
  return (draft) => {
    if (!active) return;
    pending.current = { draft };
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const next = pending.current;
      pending.current = null;
      if (next === null) return;
      const text = JSON.stringify(next.draft);
      if (text === sent.current) return;
      sent.current = text;
      void sendRef.current('player:draft', { draft: next.draft });
    }, DRAFT_MS);
  };
}

/** Які варіанти капітан позначив чернеткою (single / multi). */
function draftIds(draft: Answer | null): string[] {
  if (draft === null) return [];
  if (draft.type === 'single') return [draft.optionId];
  if (draft.type === 'multi') return draft.optionIds;
  return [];
}

/** Варіанти без дотиків; позначені капітаном — пунктирною рамкою й підписом (це не вердикт). */
function DraftChoices({ question, draft }: { question: PublicQuestion; draft: Answer | null }) {
  const marked = draftIds(draft);
  return (
    <div className={choicesClass(question.choices)}>
      {question.choices.map((choice, index) => {
        const on = marked.includes(choice.id);
        return (
          <div key={choice.id} className={on ? 'choice is-draft' : 'choice'}>
            <ChoiceFace choice={choice} letter={LETTERS[index]} />
            {on && <span className="draft-mark">{t('teamDraftMark')}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Так / ні без дотиків. */
function DraftBoolean({ draft }: { draft: Answer | null }) {
  return (
    <div className="choices">
      {[true, false].map((value) => {
        const on = draft?.type === 'boolean' && draft.value === value;
        return (
          <div key={String(value)} className={on ? 'choice is-draft' : 'choice'}>
            <span>{t(value ? 'yes' : 'no')}</span>
            {on && <span className="draft-mark">{t('teamDraftMark')}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Режим перегляду некапітана: чернетка капітана наживо або відповідь команди, коли її подано. */
export function TeamWatch({ view }: { view: PlayerView }) {
  const { question, me, team } = view;
  if (question === null || team === null) return <></>;
  // У бліці з кнопкою відповідає той, хто натиснув.
  const lead = t('teamWatchLead', { name: memberName(view, team.buzzerId ?? team.captainId) });
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
      <p className="lead team-watch-lead">{lead}</p>
      {/* Сортування, стіна й ланцюжок ідуть хід за ходом: поступ команди видно зі стану, чернетки немає. */}
      {question.type === 'sort' && view.sort !== null && <SortWatch question={question} info={view.sort} />}
      {question.type === 'wall' && question.wall !== null && <WallGrid wall={question.wall} found={me.wall?.found ?? []} />}
      {question.type === 'chain' && question.chain !== null && me.chain !== null && <ChainWords first={question.chain.first} masks={me.chain.masks} />}
      {question.type === 'bluff' && <p className="meta">{t('teamCaptainDecides')}</p>}
      {question.type === 'boolean' ? (
        <DraftBoolean draft={draft} />
      ) : (question.type === 'single' || question.type === 'multi') && question.choices.length > 0 ? (
        <DraftChoices question={question} draft={draft} />
      ) : null}
      {draft !== null && question.type !== 'boolean' && question.type !== 'single' && question.type !== 'multi' && (
        <div className="team-draft is-draft">
          <span className="draft-mark">{t('teamDraftMark')}</span>
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
