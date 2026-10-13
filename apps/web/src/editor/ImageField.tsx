import { IMAGE_LIMITS } from '@quiz/shared';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { uploadImage } from '../api';
import { errorText, t } from '../i18n';
import { QuestionImage } from '../screens/QuestionImage';

interface Props {
  url: string | null;
  /** Викликається з адресою завантаженого зображення або з null, коли його прибрали. */
  onChange: (url: string | null) => void;
}

const ACCEPT = IMAGE_LIMITS.types.join(',');
const isAllowed = (type: string) => (IMAGE_LIMITS.types as readonly string[]).includes(type);

/** Зображення до запитання: вибрати файл, побачити його, замінити або прибрати. */
export function ImageField({ url, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Завантаження триває довше за один кадр: відповідь має потрапити в актуальний обробник
  // і нікуди, якщо ведучий уже перейшов до іншого запитання.
  const latest = useRef(onChange);
  latest.current = onChange;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Той самий файл можна вибрати ще раз після помилки.
    event.target.value = '';
    if (file === undefined) return;
    if (!isAllowed(file.type)) return setError(errorText('bad_image'));
    if (file.size > IMAGE_LIMITS.maxBytes) return setError(errorText('too_large'));
    setError(null);
    setBusy(true);
    const result = await uploadImage(file);
    if (!mounted.current) return;
    setBusy(false);
    if (result.ok) latest.current(result.url);
    else setError(errorText(result.error));
  };

  return (
    <div className="image-field">
      <QuestionImage url={url} alt={t('imageAlt')} />
      <div className="toolbar">
        <label className={busy ? 'btn btn-small file-pick is-busy' : 'btn btn-small file-pick'}>
          <span>{t(busy ? 'uploading' : url === null ? 'addImage' : 'replaceImage')}</span>
          <input type="file" accept={ACCEPT} disabled={busy} onChange={pick} />
        </label>
        {url !== null && (
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              setError(null);
              onChange(null);
            }}
          >
            {t('removeImage')}
          </button>
        )}
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
