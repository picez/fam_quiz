import { LIMITS, ladderPathIssue, type Question } from '@quiz/shared';
import { useEffect, useState } from 'react';
import { checkLadderWords } from '../api';
import { t } from '../i18n';
import { cleanedQuestion } from './draft';
import { NumberField, Rows, UK_WORD_INPUT } from './QuestionEditor';

type WordLadder = Extract<Question, { type: 'wordladder' }>;

/** Скільки чекати після останньої зміни, перш ніж питати словник. */
const CHECK_DELAY_MS = 600;

/**
 * Словесна драбина: стартове слово, проміжні слова шляху ведучого, цільове слово й найбільше кроків.
 * Коли шлях структурно правильний, редактор питає словник і лише попереджає: у грі слова шляху зараховуються завжди.
 */
export function WordLadderEditor({ question, onChange }: { question: WordLadder; onChange: (q: Question) => void }) {
  const { path } = question;
  const start = path[0] ?? '';
  const target = path.length > 1 ? path[path.length - 1] : '';
  const middle = path.slice(1, -1);
  // Слова не мають власних id, тому ключем рядка є його позиція.
  const rows = middle.map((text, index) => ({ id: String(index), text }));
  const setPath = (next: string[]) => onChange({ ...question, path: next });

  // Шлях у тому вигляді, у якому піде на сервер; саме його й перевіряє словник.
  const checked = (cleanedQuestion(question) as WordLadder).path;
  const ready = ladderPathIssue(checked, question.maxSteps) === null;
  const key = ready ? JSON.stringify(checked) : '';
  const [result, setResult] = useState<{ key: string; unknown: string[] } | null>(null);

  useEffect(() => {
    if (key === '') return;
    let current = true;
    const words: string[] = JSON.parse(key);
    const timer = setTimeout(() => {
      void checkLadderWords(words).then((unknown) => {
        // Збій мережі чи сервера — без попередження: збереженню це не заважає.
        if (current && unknown !== null) setResult({ key, unknown });
      });
    }, CHECK_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [key]);

  const unknown = result !== null && result.key === key ? result.unknown : [];

  return (
    <div className="wordladder-edit">
      <label className="field">
        <span>{t('wordLadderStart')}</span>
        <input value={start} maxLength={LIMITS.wordLadderWord} {...UK_WORD_INPUT} onChange={(event) => setPath([event.target.value, ...path.slice(1)])} />
      </label>
      <Rows
        rows={rows}
        min={0}
        max={LIMITS.maxWordLadderSteps - 1}
        maxLength={LIMITS.wordLadderWord}
        ukWords
        label="wordLadderStepN"
        removeLabel="removeWordLadderStep"
        addLabel="addWordLadderStep"
        lead={(_row, index) => (
          <span className="letter" aria-hidden="true">
            {index + 1}
          </span>
        )}
        makeRow={() => ({ id: String(rows.length), text: '' })}
        onChange={(next) => setPath([start, ...next.map((row) => row.text), target])}
      />
      <label className="field">
        <span>{t('wordLadderTarget')}</span>
        <input value={target} maxLength={LIMITS.wordLadderWord} {...UK_WORD_INPUT} onChange={(event) => setPath([start, ...middle, event.target.value])} />
      </label>
      <NumberField label={t('wordLadderMaxSteps')} value={question.maxSteps} onChange={(maxSteps) => onChange({ ...question, maxSteps })} />
      <p className="meta">{t('wordLadderHint')}</p>
      {/* Завжди в DOM: поява попередження озвучується. */}
      <p className={unknown.length > 0 ? 'wordladder-unknown' : 'wordladder-unknown is-empty'} role="status">
        {unknown.length > 0 ? t('wordLadderUnknown', { words: unknown.join(', ') }) : ''}
      </p>
    </div>
  );
}
