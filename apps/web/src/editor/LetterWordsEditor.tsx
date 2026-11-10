import { LIMITS, letterSet, type Question } from '@quiz/shared';
import { useEffect, useState } from 'react';
import { checkLetterWords } from '../api';
import { t } from '../i18n';
import { NumberField, UK_WORD_INPUT } from './QuestionEditor';

type Letters = Extract<Question, { type: 'letterwords' }>;

/** Скільки чекати після останньої зміни, перш ніж питати словник. */
const CHECK_DELAY_MS = 600;
/** Довжина поля власного набору: стільки ж, скільки в схемі (там ще й пробіли між літерами). */
const OWN_MAX_LENGTH = 40;

/** Типова сума способу: за слово чи за літеру. */
const defaultUnit = (per: Letters['per']) => (per === 'word' ? LIMITS.defaultLetterWordPoints : LIMITS.defaultLetterLetterPoints);

/**
 * «Слова з літер»: звідки набір (випадковий з N літер чи свій), ціль, спосіб рахунку й сума за одиницю.
 * Для свого набору редактор питає словник і лише попереджає: набір без слів гра теж приймає.
 */
export function LetterWordsEditor({ question, onChange }: { question: Letters; onChange: (q: Question) => void }) {
  const { set, goal, per, points } = question;
  const longest = goal === 'longest';

  // Сума міняється разом зі способом лише доти, поки ведучий не ставив власної.
  const withPer = (next: Letters['per'], patch: Partial<Letters> = {}) =>
    onChange({ ...question, ...patch, per: next, points: points === defaultUnit(per) ? defaultUnit(next) : points });

  const ownLetters = set.kind === 'fixed' ? letterSet(set.letters) : null;
  // Набір у тому вигляді, у якому ведучий його вписав; нормалізує сервер.
  const key = set.kind === 'fixed' && ownLetters !== null ? set.letters : '';
  const [result, setResult] = useState<{ key: string; possible: number; best: string[] } | null>(null);

  useEffect(() => {
    if (key === '') return;
    let current = true;
    const timer = setTimeout(() => {
      void checkLetterWords(key).then((found) => {
        // Збій мережі чи сервера — без попередження: збереженню це не заважає.
        if (current && found !== null) setResult({ key, ...found });
      });
    }, CHECK_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [key]);

  const checked = result !== null && result.key === key ? result : null;
  const warning = checked === null ? '' : checked.possible === 0 ? t('lettersCheckNone') : t('lettersCheckSome', { n: checked.possible, words: checked.best.join(', ') });

  const chip = (on: boolean) => (on ? 'chip is-on' : 'chip');

  return (
    <div className="letterwords-editor">
      <div className="type-chips letterwords-editor-chips" role="group" aria-label={t('lettersSourceLabel')}>
        <button
          type="button"
          className={chip(set.kind === 'random')}
          aria-pressed={set.kind === 'random'}
          onClick={() => set.kind !== 'random' && onChange({ ...question, set: { kind: 'random', count: LIMITS.defaultLetterSet } })}
        >
          {t('lettersSourceRandom')}
        </button>
        <button
          type="button"
          className={chip(set.kind === 'fixed')}
          aria-pressed={set.kind === 'fixed'}
          onClick={() => set.kind !== 'fixed' && onChange({ ...question, set: { kind: 'fixed', letters: '' } })}
        >
          {t('lettersSourceFixed')}
        </button>
      </div>
      {set.kind === 'random' ? (
        <NumberField label={t('lettersCount')} value={set.count} onChange={(count) => onChange({ ...question, set: { kind: 'random', count } })} />
      ) : (
        <label className="field">
          <span>{t('lettersOwn')}</span>
          <input
            value={set.letters}
            maxLength={OWN_MAX_LENGTH}
            {...UK_WORD_INPUT}
            onChange={(event) => onChange({ ...question, set: { kind: 'fixed', letters: event.target.value } })}
          />
        </label>
      )}

      <div className="type-chips letterwords-editor-chips" role="group" aria-label={t('lettersGoalLabel')}>
        <button type="button" className={chip(!longest)} aria-pressed={!longest} onClick={() => longest && onChange({ ...question, goal: 'most' })}>
          {t('lettersGoalMost')}
        </button>
        <button type="button" className={chip(longest)} aria-pressed={longest} onClick={() => !longest && withPer('letter', { goal: 'longest' })}>
          {t('lettersGoalLongest')}
        </button>
      </div>
      <div className="type-chips letterwords-editor-chips" role="group" aria-label={t('lettersPerLabel')}>
        <button type="button" className={chip(per === 'word')} aria-pressed={per === 'word'} disabled={longest} onClick={() => withPer('word')}>
          {t('lettersPerWord')}
        </button>
        <button type="button" className={chip(per === 'letter')} aria-pressed={per === 'letter'} onClick={() => withPer('letter')}>
          {t('lettersPerLetter')}
        </button>
      </div>
      {longest && <p className="meta">{t('lettersLongestHint')}</p>}

      <NumberField label={t('lettersUnit')} value={points} onChange={(value) => onChange({ ...question, points: value })} />
      <p className="meta">{t('lettersHint')}</p>
      {/* Завжди в DOM: поява попередження озвучується. */}
      <p className={warning === '' ? 'letterwords-editor-check is-empty' : 'letterwords-editor-check'} role="status">
        {warning}
      </p>
    </div>
  );
}
