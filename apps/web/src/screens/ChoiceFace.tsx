import { useState, type ReactNode } from 'react';
import type { Choice } from '@quiz/shared';
import { t } from '../i18n';
import { ImageZoom } from './ImageZoom';

/** Чи є серед варіантів картинка: тоді список стає сіткою. */
export function hasImages(choices: Choice[]): boolean {
  return choices.some((choice) => choice.imageUrl !== undefined);
}

/** Клас списку варіантів: «choices has-images», коли є хоч одна картинка. */
export function choicesClass(choices: Choice[]): string {
  return hasImages(choices) ? 'choices has-images' : 'choices';
}

/** Кнопка-лупа в куті картинки варіанта: відкриває її на весь екран (ImageZoom). */
export function ChoiceZoom({ choice, letter }: { choice: Choice; letter?: string }) {
  const [open, setOpen] = useState(false);
  const url = choice.imageUrl;
  if (url === undefined) return null;
  const label = t('imageZoomChoice', { letter: letter ?? '' }).replace(/s+$/, '');
  return (
    <>
      <button type="button" className="choice-zoom" aria-label={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span aria-hidden="true">⤢</span>
      </button>
      {open && <ImageZoom url={url} alt={choice.text || label} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Варіант-кнопка з картинкою: лупа не може лежати всередині кнопки (вкладені кнопки), тож обоє — у div.choice-cell,
 * і лупа стоїть поверх кута картинки. Без картинки — сама кнопка, як була.
 */
export function ZoomCell({ choice, letter, children }: { choice: Choice; letter?: string; children: ReactNode }) {
  if (choice.imageUrl === undefined) return <>{children}</>;
  return (
    <div className="choice-cell">
      {children}
      <ChoiceZoom choice={choice} letter={letter} />
    </div>
  );
}

/**
 * Вміст варіанта: літера, картинка (не завантажилася — «Картинка Б»), текст.
 * zoom — лупа на картинці; лише коли сам варіант не кнопка (li/div глядача), для кнопок — ZoomCell.
 */
export function ChoiceFace({ choice, letter, zoom = false }: { choice: Choice; letter?: string; zoom?: boolean }) {
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
          <img className="choice-image" src={url} alt={choice.text || label} decoding="async" onError={() => setFailed(url)} />
        ))}
      {zoom && url !== undefined && failed !== url && <ChoiceZoom choice={choice} letter={letter} />}
      {choice.text !== '' && (
        <span className="choice-text" dir="auto">
          {choice.text}
        </span>
      )}
    </>
  );
}
