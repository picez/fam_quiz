import { useState } from 'react';
import type { Answer, Choice, PublicQuestion } from '@quiz/shared';
import type { PairText } from '../format';
import { t } from '../i18n';

/** Телефон: з'єднання пар дотиками. Стан живе тут, тож пауза його не скидає. */
export function MatchInput({ question, onSubmit, onDraft }: { question: PublicQuestion; onSubmit: (answer: Answer) => void; onDraft?: (draft: Answer | null) => void }) {
  // Лівий id → правий id.
  const [links, setLinks] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const left = question.choices;
  const right = question.right;
  const partner = (rightId: string) => left.find((item) => links[item.id] === rightId)?.id ?? null;
  const number = (leftId: string) => left.findIndex((item) => item.id === leftId) + 1;
  const ready = left.every((item) => links[item.id] !== undefined);

  // Чернетка капітана: уся відповідь лише коли пов'язано всі пари; інакше порожньо.
  const change = (next: Record<string, string>) => {
    setLinks(next);
    onDraft?.(left.every((item) => next[item.id] !== undefined) ? { type: 'match', links: left.map((item) => ({ left: item.id, right: next[item.id] })) } : null);
  };

  const unlink = (leftId: string) => {
    const next = { ...links };
    delete next[leftId];
    change(next);
  };

  const tapLeft = (id: string) => {
    if (links[id] !== undefined) unlink(id);
    else setPicked((now) => (now === id ? null : id));
  };

  const tapRight = (id: string) => {
    const owner = partner(id);
    if (owner !== null) unlink(owner);
    else if (picked !== null) {
      change({ ...links, [picked]: id });
      setPicked(null);
    }
  };

  const submit = () => {
    if (!ready) return;
    onSubmit({ type: 'match', links: left.map((item) => ({ left: item.id, right: links[item.id] })) });
  };

  const badge = (leftId: string) => <span className="match-badge">{number(leftId)}</span>;

  return (
    <>
      <p className="match-hint">{t('matchPickHint')}</p>
      <div className="match-columns">
        <div className="match-col">
          {left.map((item) => {
            const linked = links[item.id] !== undefined;
            const cls = ['match-item', 'match-left', picked === item.id ? 'is-picked' : '', linked ? 'is-linked' : ''];
            return (
              <button
                type="button"
                key={item.id}
                className={cls.filter(Boolean).join(' ')}
                aria-pressed={picked === item.id}
                onClick={() => tapLeft(item.id)}
              >
                <span className="match-text">{item.text}</span>
                {linked && badge(item.id)}
              </button>
            );
          })}
        </div>
        <div className="match-col">
          {right.map((item) => {
            const owner = partner(item.id);
            return (
              <button
                type="button"
                key={item.id}
                className={owner !== null ? 'match-item match-right is-linked' : 'match-item match-right'}
                onClick={() => tapRight(item.id)}
              >
                <span className="match-text">{item.text}</span>
                {owner !== null && badge(owner)}
              </button>
            );
          })}
        </div>
      </div>
      <button type="button" className="btn btn-primary" disabled={!ready} onClick={submit}>
        {t('submit')}
      </button>
    </>
  );
}

/** Два стовпчики лише для показу. */
export function MatchColumns({ left, right }: { left: Choice[]; right: Choice[] }) {
  return (
    <div className="match-columns">
      <ul className="match-col">
        {left.map((item) => (
          <li key={item.id} className="match-item match-left">
            <span className="match-text">{item.text}</span>
          </li>
        ))}
      </ul>
      <ul className="match-col">
        {right.map((item) => (
          <li key={item.id} className="match-item match-right">
            <span className="match-text">{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** tone: '' | 'is-correct' | 'is-wrong' | 'is-pending' — клас кожного рядка. */
export function PairList({ pairs, tone }: { pairs: PairText[]; tone: string }) {
  return (
    <ol className="match-list">
      {pairs.map((pair, index) => (
        <li key={index} className={`match-row ${tone}`.trim()}>
          {pair.left} — {pair.right}
        </li>
      ))}
    </ol>
  );
}
