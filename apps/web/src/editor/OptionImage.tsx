import { t } from '../i18n';
import { ACCEPT, useImageUpload } from './ImageField';

interface Props {
  url: string | undefined;
  /** Номер варіанта для підписів, з 1. */
  index: number;
  /** Адреса завантаженої картинки або undefined, коли її прибрали. */
  onChange: (url: string | undefined) => void;
}

/** Картинка варіанта в редакторі: мініатюра, «додати / замінити» і «прибрати». */
export function OptionImage({ url, index, onChange }: Props) {
  const { busy, error, pick, clearError } = useImageUpload((next) => onChange(next ?? undefined));
  return (
    <span className="option-image">
      <span className="option-image-row">
        {url !== undefined && <img className="option-thumb" src={url} alt="" />}
        <label
          className={busy ? 'btn btn-small file-pick is-busy' : 'btn btn-small file-pick'}
          title={t('optionImageAdd', { index })}
        >
          <span aria-hidden="true">{busy ? '…' : '🖼'}</span>
          <input type="file" accept={ACCEPT} disabled={busy} onChange={pick} aria-label={t('optionImageAdd', { index })} />
        </label>
        {url !== undefined && (
          <button
            type="button"
            className="row-button"
            aria-label={t('optionImageRemove', { index })}
            onClick={() => {
              clearError();
              onChange(undefined);
            }}
          >
            ×
          </button>
        )}
      </span>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </span>
  );
}
