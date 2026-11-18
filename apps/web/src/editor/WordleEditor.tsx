import { LIMITS, wordleKey, wordleLetters, wordleWordIssue, type Question } from '@quiz/shared';
import { useEffect, useId, useState } from 'react';
import { checkLadderWords } from '../api';
import { t } from '../i18n';
import { UK_WORD_INPUT } from './QuestionEditor';

type Wordle = Extract<Question, { type: 'wordle' }>;

/** Скільки чекати після останньої зміни, перш ніж питати словник. */
const CHECK_DELAY_MS = 600;

/**
 * «Вгадай слово»: одне слово ведучого. Редактор лічить літери й, коли слово придатне, питає словник наживо;
 * попередження не заважає писати, але сервер такого слова не збереже.
 */
export function WordleEditor({ question, onChange }: { question: Wordle; onChange: (next: Wordle) => void }) {
  const id = useId();
  const word = question.word.normalize('NFC').trim();
  const key = wordleKey(word);
  const count = key === null ? 0 : wordleLetters(key).length;
  // Питаємо словник лише про слово, що пройшло б перевірку редактора.
  const ready = word !== '' && wordleWordIssue(word) === null;
  const asked = ready ? word : '';
  const [result, setResult] = useState<{ word: string; unknown: string[] } | null>(null);

  useEffect(() => {
    if (asked === '') return;
    let current = true;
    const timer = setTimeout(() => {
      void checkLadderWords([asked]).then((unknown) => {
        // Збій мережі чи сервера — без попередження; застаріла відповідь (слово вже інше) — теж.
        if (current && unknown !== null) setResult({ word: asked, unknown });
      });
    }, CHECK_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [asked]);

  const unknown = result !== null && result.word === asked ? result.unknown : [];

  return (
    <div className="wordle-edit">
      <label className="field">
        <span>{t('wordleWord')}</span>
        <input value={question.word} maxLength={LIMITS.wordleWord} aria-describedby={`${id}-hint`} {...UK_WORD_INPUT} onChange={(event) => onChange({ ...question, word: event.target.value })} />
      </label>
      <p className="meta" id={`${id}-hint`}>
        {t('wordleWordHint')}
      </p>
      <p className="meta">{t('wordleLetterCount', { count })}</p>
      {/* Завжди в DOM: поява попередження озвучується. */}
      <p className={unknown.length > 0 ? 'wordladder-unknown' : 'wordladder-unknown is-empty'} role="status">
        {unknown.length > 0 ? t('wordleUnknown', { word: unknown.join(', ') }) : ''}
      </p>
    </div>
  );
}
