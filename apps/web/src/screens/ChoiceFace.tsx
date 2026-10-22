import { useState } from 'react';
import type { Choice } from '@quiz/shared';
import { t } from '../i18n';

/** Чи є серед варіантів картинка: тоді список стає сіткою. */
export function hasImages(choices: Choice[]): boolean {
  return choices.some((choice) => choice.imageUrl !== undefined);
}

/** Клас списку варіантів: «choices has-images», коли є хоч одна картинка. */
export function choicesClass(choices: Choice[]): string {
  return hasImages(choices) ? 'choices has-images' : 'choices';
}

/** Вміст варіанта: літера, картинка (не завантажилася — «Картинка Б»), текст. */
export function ChoiceFace({ choice, letter }: { choice: Choice; letter?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const label = t('imageChoice', { letter: letter ?? '' }).trim();
  const url = choice.imageUrl;
  return (
    <>
      {letter && <span className="letter">{letter}</span>}
      {url !== undefined &&
        (failed === url ? (
          <span className="choice-text">{label}</span>
        ) : (
          <img className="choice-image" src={url} alt={choice.text || label} onError={() => setFailed(url)} />
        ))}
      {choice.text !== '' && <span className="choice-text">{choice.text}</span>}
    </>
  );
}
