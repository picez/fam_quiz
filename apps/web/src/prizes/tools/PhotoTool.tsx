import { DECOR_SUPPORT, IMAGE_LIMITS, TROPHY_PHOTO_FRAMES, TROPHY_PHOTO_STYLES } from '@quiz/shared';
import { useEffect, useRef, useState, type ChangeEvent, type JSX } from 'react';
import { uploadImage } from '../../api';
import { IMAGE_MAX_SIDE, shrinkImage } from '../../image-shrink';
import { ACCEPT } from '../../editor/ImageField';
import { errorText, t, type TextKey } from '../../i18n';
import type { ToolProps } from '../PrizeStudio';
import { layoutDecor } from '../../trophy/decor-places';
import { photoLimit } from '../studio-draft';
import { CropDialog } from './CropDialog';
import { inscriptionNote, stickerNote } from './StickerPicker';

const isAllowed = (type: string) => (IMAGE_LIMITS.types as readonly string[]).includes(type);

/**
 * «Фото»: місце (лише ті, що має форма), кілька файлів за раз у межах місця, порядок, кадрування кожного фото,
 * рамка і стиль. Видно й рахується лише те, що влазить у місце (як і зберігається). Файли вантажаться по одному: неприйнятий пропускається, помилка сервера (зокрема too_many)
 * зупиняє пачку, а вже завантажені лишаються на кубку. Чернетка живе в PrizeStudio, тож пачка доходить до кінця й тоді,
 * коли інструмент закрили посеред завантаження (перейшли на іншу вкладку).
 */
export function PhotoTool({ draft, dispatch, photoBusy: busy, setPhotoBusy: setBusy }: ToolProps): JSX.Element {
  const { decor } = draft;
  const places = draft.trophy === null ? [] : DECOR_SUPPORT[draft.trophy.kind].photo;
  const placeShown = places.includes(decor.photoPlace);
  const limit = photoLimit(decor.photoPlace);
  // Фото понад межу місця чекають у чернетці (місце можна змінити назад), але не зберігаються й тут не видні.
  const shown = decor.photos.slice(0, limit);
  const count = shown.length;
  const full = count >= limit;
  // Написи й наліпки, що через це місце фото переїхали чи не вміщуються.
  const layout = draft.trophy === null ? null : layoutDecor(draft.trophy.kind, decor);
  const notes =
    layout === null
      ? []
      : [
          ...layout.inscriptions.map(inscriptionNote),
          ...layout.stickers.filter((sticker) => sticker.blockedBy?.type === 'photos').map(stickerNote),
        ].filter((note): note is string => note !== null);
  const [error, setError] = useState<string | null>(null);
  const [cropping, setCropping] = useState<number | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Ті самі файли можна вибрати ще раз після помилки.
    event.target.value = '';
    if (files.length === 0) return;
    let room = limit - count;
    setError(null);
    setBusy(true);
    for (const file of files) {
      if (room <= 0) break;
      if (!isAllowed(file.type)) {
        if (mounted.current) setError(errorText('bad_image'));
        continue;
      }
      // Фото зменшується в браузері до 1600 px (32): великі знімки з телефона більше не відкидаються.
      const shrunk = await shrinkImage(file, IMAGE_MAX_SIDE);
      if (!shrunk.ok) {
        if (mounted.current) setError(errorText(shrunk.error));
        continue;
      }
      const result = await uploadImage(shrunk.file);
      if (!result.ok) {
        if (mounted.current) setError(errorText(result.error));
        break;
      }
      dispatch({ type: 'addPhotos', urls: [result.url] });
      room -= 1;
    }
    // Стан «вантажиться» живе в PrizeStudio: знімаємо його й тоді, коли інструмент уже закрили.
    setBusy(false);
  };

  const label = (action: TextKey, index: number) => `${t(action)}: ${t('studioPhotoN', { n: index + 1 })}`;
  const photo = cropping === null ? undefined : decor.photos[cropping];

  return (
    <div className="studio-tool">
      <fieldset className="studio-choice">
        <legend>{t('studioPhotoPlace')}</legend>
        {places.map((place) => (
          <label key={place}>
            <input
              type="radio"
              name="studio-photo-place"
              checked={decor.photoPlace === place}
              disabled={busy}
              onChange={() => dispatch({ type: 'photoPlace', place })}
            />
            {t(`studioPhotoPlace_${place}` as TextKey)}
          </label>
        ))}
      </fieldset>
      {notes.map((note, index) => (
        <p key={index} className="meta">
          {note}
        </p>
      ))}

      {placeShown && (
        <>
          {decor.photoPlace === 'backdrop' && <p className="meta">{t('studioBackdropHint')}</p>}

          <div className="toolbar studio-photo-add">
            <label className={busy ? 'btn btn-small file-pick is-busy' : 'btn btn-small file-pick'}>
              <span>{t(busy ? 'uploading' : 'studioPhotoAdd')}</span>
              <input type="file" multiple accept={ACCEPT} aria-label={t('studioPhotoAdd')} disabled={busy || full} onChange={pick} />
            </label>
            <span className="meta">{t('studioPhotoCount', { n: count, max: limit })}</span>
          </div>
          {full && <p className="meta">{t('studioPhotoFull')}</p>}
          {error !== null && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {count > 0 && (
            <ol className="studio-photos">
              {shown.map((item, index) => (
                <li key={`${index}:${item.url}`} className="studio-photo">
                  <img className="studio-photo-thumb" src={item.url} alt={t('studioPhotoN', { n: index + 1 })} loading="lazy" decoding="async" />
                  <div className="studio-photo-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      aria-label={label('studioPhotoEarlier', index)}
                      disabled={index === 0}
                      onClick={() => dispatch({ type: 'movePhoto', from: index, to: index - 1 })}
                    >
                      {t('studioPhotoEarlier')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      aria-label={label('studioPhotoLater', index)}
                      disabled={index === count - 1}
                      onClick={() => dispatch({ type: 'movePhoto', from: index, to: index + 1 })}
                    >
                      {t('studioPhotoLater')}
                    </button>
                    <button type="button" className="btn btn-small" aria-label={label('studioPhotoCrop', index)} onClick={() => setCropping(index)}>
                      {t('studioPhotoCrop')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      aria-label={label('studioPhotoRemove', index)}
                      onClick={() => dispatch({ type: 'removePhoto', index })}
                    >
                      {t('studioPhotoRemove')}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <fieldset className="studio-choice">
            <legend>{t('studioFrame')}</legend>
            {TROPHY_PHOTO_FRAMES.map((frame) => (
              <label key={frame}>
                <input type="radio" name="studio-frame" checked={decor.frame === frame} onChange={() => dispatch({ type: 'frame', frame })} />
                {t(`studioFrame_${frame}` as TextKey)}
              </label>
            ))}
          </fieldset>

          <fieldset className="studio-choice">
            <legend>{t('studioPhotoStyle')}</legend>
            {TROPHY_PHOTO_STYLES.map((style) => (
              <label key={style}>
                <input type="radio" name="studio-photo-style" checked={decor.photoStyle === style} onChange={() => dispatch({ type: 'photoStyle', style })} />
                {t(`studioPhotoStyle_${style}` as TextKey)}
              </label>
            ))}
          </fieldset>
        </>
      )}

      {cropping !== null && photo !== undefined && (
        <CropDialog
          url={photo.url}
          crop={photo.crop}
          place={decor.photoPlace}
          frame={decor.frame}
          photoStyle={decor.photoStyle}
          onDone={(crop) => {
            dispatch({ type: 'crop', index: cropping, crop });
            setCropping(null);
          }}
          onClose={() => setCropping(null)}
        />
      )}
    </div>
  );
}
