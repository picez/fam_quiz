import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import { canShareFile, downloadPng, sharePng } from '../share-image';
import type { ResultImageData } from './data';
import { resultFileName } from './layout';
import { renderResultImage } from './render';

interface Preview {
  blob: Blob;
  url: string;
  fileName: string;
  canShare: boolean;
}

/** «📸 Підсумок картинкою»: малює картинку з build() і відкриває прев'ю; помилка — «Не вдалося створити картинку.». */
export function ResultImageButton({ build, className }: { build: () => ResultImageData; className?: string }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const opener = useRef<HTMLButtonElement>(null);

  const open = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const data = build();
      const blob = await renderResultImage(data);
      const fileName = resultFileName(data.quizTitle);
      const canShare = canShareFile(new File([blob], fileName, { type: 'image/png' }));
      setPreview({ blob, url: URL.createObjectURL(blob), fileName, canShare });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (preview !== null) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  return (
    <>
      <button ref={opener} type="button" className={className} disabled={busy} onClick={() => void open()}>
        {t('resultImageButton')}
      </button>
      {failed && (
        <p className="meta" role="alert">
          {t('resultImageFailed')}
        </p>
      )}
      {preview !== null && <PreviewDialog preview={preview} onClose={close} returnTo={opener} />}
    </>
  );
}

function PreviewDialog({ preview, onClose, returnTo }: { preview: Preview; onClose: () => void; returnTo: { current: HTMLButtonElement | null } }): JSX.Element {
  const dialog = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // Фокус — на «Поділитися» чи «Завантажити»; після закриття — назад на кнопку.
  useLayoutEffect(() => {
    first.current?.focus();
    return () => returnTo.current?.focus();
  }, [returnTo]);

  // Escape і Tab слухаємо на документі, як у діалозі кадрування.
  useEffect(() => {
    const keys = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== 'Tab' || dialog.current === null) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button')).filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : index === focusable.length - 1 ? 0 : index + 1;
      event.preventDefault();
      focusable[next]!.focus();
    };
    document.addEventListener('keydown', keys);
    return () => document.removeEventListener('keydown', keys);
  }, []);

  return createPortal(
    <div
      className="result-preview"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={dialog} className="result-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="result-preview-title">
        <h2 id="result-preview-title" className="result-preview-title">
          {t('resultImageTitle')}
        </h2>
        <img className="result-preview-image" src={preview.url} alt={t('resultImageAlt')} />
        <div className="result-preview-actions">
          {preview.canShare && (
            <button ref={first} type="button" className="btn btn-primary" onClick={() => void sharePng(preview.blob, preview.fileName, t('resultImageTitle'))}>
              {t('resultImageShare')}
            </button>
          )}
          <button ref={preview.canShare ? undefined : first} type="button" className="btn" onClick={() => downloadPng(preview.blob, preview.fileName)}>
            {t('resultImageDownload')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t('resultImageClose')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
