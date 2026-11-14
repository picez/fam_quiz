import { useState } from 'react';
import { t } from '../i18n';
import { ImageZoom } from './ImageZoom';

/**
 * Зображення до запитання. Якщо воно не завантажилося, зникає зовсім: гра не має
 * зупинятися через картинку, а зламана рамка лише відволікала б.
 * Дотик відкриває її на весь екран (ImageZoom), бо на телефоні дрібне не роздивишся;
 * zoomable={false} — лише картинка (сцена на великому екрані).
 */
export function QuestionImage({ url, alt = '', zoomable = true }: { url: string | null; alt?: string; zoomable?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  if (url === null || failed === url) return null;
  const image = <img className="question-image" src={url} alt={alt} decoding="async" fetchPriority="high" onError={() => setFailed(url)} />;
  if (!zoomable) return image;
  return (
    <>
      <button type="button" className="question-image-zoom" aria-label={t('imageZoomOpen')} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {image}
        <span className="question-image-zoom-hint" aria-hidden="true">
          ⤢
        </span>
      </button>
      {open && <ImageZoom url={url} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
