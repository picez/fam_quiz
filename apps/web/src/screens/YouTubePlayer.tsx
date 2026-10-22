import { useEffect, useRef, useState } from 'react';
import type { Video } from '@quiz/shared';
import { t } from '../i18n';

export const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com';

/** Адреса вбудовування: start, rel=0, playsinline=1, enablejsapi=1, origin; ніколи autoplay. */
export function youtubeEmbedUrl(video: Video, origin: string): string {
  const query = new URLSearchParams({
    start: String(video.start),
    rel: '0',
    playsinline: '1',
    enablejsapi: '1',
    origin,
  });
  return `${YOUTUBE_ORIGIN}/embed/${video.id}?${query.toString()}`;
}

/**
 * Плеєр відео до запитання; null без відео. Недоступне відео (onError від плеєра
 * або немає мережі) замінюється написом, гра йде далі.
 */
export function YouTubePlayer({ video }: { video: Video | null }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const id = video?.id ?? null;
  const [failedId, setFailedId] = useState<string | null>(null);

  useEffect(() => {
    if (id === null) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== YOUTUBE_ORIGIN) return;
      try {
        const data: unknown = JSON.parse(String(event.data));
        if (typeof data === 'object' && data !== null && (data as { event?: unknown }).event === 'onError') setFailedId(id);
      } catch {
        // не JSON: не повідомлення плеєра
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
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
        allow="encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
        onLoad={() =>
          frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YOUTUBE_ORIGIN)
        }
      />
    </div>
  );
}
