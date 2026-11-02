import { t } from '../i18n';

/** «❤️ N» біля запитання в редакторі; нуль чи невідомо — нічого. */
export function LikeCount({ count }: { count: number | undefined }) {
  if (count === undefined || count <= 0) return null;
  return (
    <span className="like-count" role="img" aria-label={t('likesCount', { count })}>
      {`❤️ ${count}`}
    </span>
  );
}
