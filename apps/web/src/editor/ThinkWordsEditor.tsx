import { LIMITS, type ThinkWord } from '@quiz/shared';
import { useState } from 'react';
import { t } from '../i18n';
import { parseSynonyms } from '../think-words';

/** Найдовший рядок синонімів: усі синоніми слова з комою й пробілом між ними. */
const SYNONYMS_MAX = LIMITS.maxThinkSynonyms * (LIMITS.thinkWord + 2);

/**
 * «Думай інакше» (35): слова ведучого — до 3 рядків «слово + синоніми через кому», «Додати слово», «Прибрати слово».
 * Рядок синонімів живе як його набрали (кома в кінці не зникає), а onChange отримує вже розібраний список.
 * Без жодного слова — попередження thinkNoWordsNote (ведучий впише їх у грі, автопілот такого не запустить).
 */
export function ThinkWordsEditor({ words, onChange }: { words: ThinkWord[]; onChange: (words: ThinkWord[]) => void }) {
  const [synonymTexts, setSynonymTexts] = useState<string[]>(() => words.map((w) => w.synonyms.join(', ')));
  const textOf = (index: number) => synonymTexts[index] ?? words[index]?.synonyms.join(', ') ?? '';

  const setWord = (index: number, patch: Partial<ThinkWord>) => onChange(words.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  const setSynonyms = (index: number, text: string) => {
    setSynonymTexts(words.map((_, i) => (i === index ? text : textOf(i))));
    setWord(index, { synonyms: parseSynonyms(text) });
  };
  const add = () => {
    setSynonymTexts([...words.map((_, i) => textOf(i)), '']);
    onChange([...words, { word: '', synonyms: [] }]);
  };
  const remove = (index: number) => {
    setSynonymTexts(words.map((_, i) => textOf(i)).filter((_, i) => i !== index));
    onChange(words.filter((_, i) => i !== index));
  };

  return (
    <fieldset className="think-words-editor">
      <legend>{t('thinkWordsLabel')}</legend>
      {words.map((word, index) => (
        <div className="think-word-row" key={index}>
          <label className="field">
            <span>{t('thinkWordLabel', { index: index + 1 })}</span>
            <input value={word.word} maxLength={LIMITS.thinkWord} dir="auto" onChange={(event) => setWord(index, { word: event.target.value })} />
          </label>
          <label className="field">
            <span>{t('thinkSynonymsLabel')}</span>
            <input value={textOf(index)} maxLength={SYNONYMS_MAX} dir="auto" onChange={(event) => setSynonyms(index, event.target.value)} />
          </label>
          <button type="button" className="row-button think-word-remove" aria-label={`${t('thinkRemoveWord')} ${index + 1}`} title={t('thinkRemoveWord')} onClick={() => remove(index)}>
            ×
          </button>
        </div>
      ))}
      {words.length < LIMITS.maxThinkWords && (
        <button type="button" className="btn btn-dashed" onClick={add}>
          {t('thinkAddWord')}
        </button>
      )}
      {words.length === 0 && <p className="meta think-no-words">{t('thinkNoWordsNote')}</p>}
    </fieldset>
  );
}
