import { useState } from 'react';

/**
 * Зображення до запитання. Якщо воно не завантажилося, зникає зовсім: гра не має
 * зупинятися через картинку, а зламана рамка лише відволікала б.
 */
export function QuestionImage({ url, alt = '' }: { url: string | null; alt?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (url === null || failed === url) return null;
  return <img className="question-image" src={url} alt={alt} onError={() => setFailed(url)} />;
}
