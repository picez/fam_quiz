import { useEffect, useRef, useState } from 'react';
import type { Video } from '@quiz/shared';
import { t } from '../i18n';

export const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com';
const LISTEN_INTERVAL_MS = 250;

/** Адреса вбудовування: start, rel=0, playsinline=1, enablejsapi=1, iv_load_policy=3, fs=0, origin; ніколи autoplay. */
export function youtubeEmbedUrl(video: Video, origin: string): string {
  const query = new URLSearchParams({
    start: String(video.start),
    rel: '0',
    playsinline: '1',
    enablejsapi: '1',
    iv_load_policy: '3',
    fs: '0',
    origin,
  });
  return `${YOUTUBE_ORIGIN}/embed/${video.id}?${query.toString()}`;
}

/**
 * Плеєр відео до запитання; null без відео. Недоступне відео (onError від плеєра
 * або немає мережі) замінюється написом, гра йде далі.
 * `masked` закриває верхню смугу плеєра з назвою ролика до розкриття; рамка не
 * перемонтовується, тож після розкриття відео грає далі. Повноекранного режиму
 * немає (fs=0, без allowFullScreen): у ньому маска лишилася б поза плеєром.
 * Чого маска не закриває: кінцевий екран і «Більше відео» на паузі показують
 * інші ролики; логотип YouTube у смузі керування відкриває сторінку ролика.
 */
export function YouTubePlayer({ video, masked = false }: { video: Video | null; masked?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const id = video?.id ?? null;
  const [failedId, setFailedId] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (poll.current !== null) clearInterval(poll.current);
    poll.current = null;
  };
  // Рамка YouTube відповідає, лише поки батьківська сторінка повторює «listening» і підписується на onError.
  const startPolling = () => {
    stopPolling();
    const send = () => {
      const target = frame.current?.contentWindow;
      if (!target) return;
      target.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YOUTUBE_ORIGIN);
      target.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onError'], id: 1, channel: 'widget' }), YOUTUBE_ORIGIN);
    };
    send();
    poll.current = setInterval(send, LISTEN_INTERVAL_MS);
  };

  useEffect(() => {
    if (id === null) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== YOUTUBE_ORIGIN) return;
      stopPolling();
      try {
        const data: unknown = JSON.parse(String(event.data));
        if (typeof data === 'object' && data !== null && (data as { event?: unknown }).event === 'onError') setFailedId(id);
      } catch {
        // не JSON: не повідомлення плеєра
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      stopPolling();
    };
  }, [id]);

  if (video === null) return null;
  if (failedId === video.id || navigator.onLine === false) {
    return (
      <p className="video-unavailable" role="status">
        {t('videoUnavailable')}
      </p>
    );
  }
  return (
    <div className="question-video">
      <iframe
        ref={frame}
        key={`${video.id}-${video.start}`}
        src={youtubeEmbedUrl(video, window.location.origin)}
        title={t('videoTitle')}
        allow="encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
        onLoad={startPolling}
      />
      {masked && <div className="video-mask">{t('videoTitleHidden')}</div>}
    </div>
  );
}
