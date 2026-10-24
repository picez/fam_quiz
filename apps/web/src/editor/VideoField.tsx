import { parseYouTubeLink, videoLink, type Video } from '@quiz/shared';
import { useState } from 'react';
import { t } from '../i18n';
import { YouTubePlayer } from '../screens/YouTubePlayer';

interface Props {
  video: Video | null;
  /** Викликається з розібраним відео або з null (порожнє чи неправильне посилання). */
  onChange: (video: Video | null) => void;
  /** «Лише звук»: перенести розібране відео в аудіо (картинку сховано). Без пропа прапорця немає. */
  onAudioOnly?: (video: Video) => void;
}

/** Поле посилання YouTube з помилкою під ним і попереднім переглядом. */
export function VideoField({ video, onChange, onAudioOnly }: Props) {
  const [text, setText] = useState(() => (video === null ? '' : videoLink(video)));
  const [invalid, setInvalid] = useState(false);

  const edit = (next: string) => {
    setText(next);
    if (next.trim() === '') {
      setInvalid(false);
      return onChange(null);
    }
    const parsed = parseYouTubeLink(next);
    setInvalid(parsed === null);
    onChange(parsed);
  };

  return (
    <div className="video-field">
      <label className="field">
        <span>{t('videoLabel')}</span>
        <input
          type="url"
          value={text}
          maxLength={200}
          placeholder={t('videoPlaceholder')}
          aria-invalid={invalid}
          onChange={(event) => edit(event.target.value)}
        />
      </label>
      {invalid && (
        <p className="error" role="alert">
          {t('videoInvalid')}
        </p>
      )}
      <YouTubePlayer video={video} />
      {video !== null && onAudioOnly !== undefined && (
        <label className="check">
          <input type="checkbox" checked={false} onChange={() => onAudioOnly(video)} />
          <span>{t('audioOnly')}</span>
        </label>
      )}
      {video !== null && (
        <div className="toolbar">
          <button type="button" className="btn btn-small" onClick={() => edit('')}>
            {t('removeVideo')}
          </button>
        </div>
      )}
    </div>
  );
}
