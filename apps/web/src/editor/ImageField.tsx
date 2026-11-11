import { IMAGE_LIMITS } from '@quiz/shared';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { uploadImage } from '../api';
import { errorText, t } from '../i18n';
import { QuestionImage } from '../screens/QuestionImage';

interface Props {
  url: string | null;
  /** Викликається з адресою завантаженого зображення або з null, коли його прибрали. */
  onChange: (url: string | null) => void;
  /**
   * Завантаження, що закінчилось після того, як поле зникло, все одно віддати в onChange (onChange має бути стабільним і
   * писати в стан, що живе довше за поле). Без нього — нікуди: ведучий уже на іншому запитанні.
   */
  keepLate?: boolean;
}

export const ACCEPT = IMAGE_LIMITS.types.join(',');
const isAllowed = (type: string) => (IMAGE_LIMITS.types as readonly string[]).includes(type);

/** Вибір файла, перевірка й завантаження; onChange отримує адресу завантаженого зображення. */
export function useImageUpload(onChange: (url: string | null) => void, { keepLate = false }: { keepLate?: boolean } = {}) {
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
    if (!mounted.current) {
      // Поле зникло: локальний стан уже нічий, але адресу можна віддати далі, якщо її чекають.
      if (keepLate && result.ok) latest.current(result.url);
      return;
    }
    setBusy(false);
    if (result.ok) latest.current(result.url);
    else setError(errorText(result.error));
  };

  return { busy, error, pick, clearError: () => setError(null) };
}

/** Скільки чекати, поки браузер прочитає розміри щойно завантаженої картинки. */
const MEASURE_MS = 3000;

/** Справжні розміри картинки за адресою (naturalWidth × naturalHeight, px); null — не вдалося прочитати вчасно. */
export function measureImage(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const done = (value: { width: number; height: number } | null) => {
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), MEASURE_MS);
    image.onload = () => done(image.naturalWidth > 0 && image.naturalHeight > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null);
    image.onerror = () => done(null);
    image.src = url;
  });
}

/** Пропорція картинки за адресою; null — не вдалося прочитати вчасно. */
export function measureAspect(url: string): Promise<number | null> {
  return measureImage(url).then((size) => (size === null ? null : size.width / size.height));
}

/** Зображення до запитання: вибрати файл, побачити його, замінити або прибрати. */
export function ImageField({ url, onChange, keepLate = false }: Props) {
  const { busy, error, pick, clearError } = useImageUpload(onChange, { keepLate });

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
              clearError();
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
