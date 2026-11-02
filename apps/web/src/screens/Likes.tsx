import type { LikePayload, LikesView } from '@quiz/shared';
import { t } from '../i18n';

/** Пігулка в шапці на reveal: 🤍 / ❤️, aria-pressed; liked undefined — нічого не малює. Висота як у «Таблиці», тож шапка не росте. */
export function LikeButton({ liked, onToggle, busy }: { liked: boolean | undefined; onToggle: (liked: boolean) => void; busy: boolean }) {
  if (liked === undefined) return null;
  return (
    <button
      type="button"
      className="table-button like-button"
      aria-pressed={liked}
      aria-label={t(liked ? 'unlikeQuestion' : 'likeQuestion')}
      disabled={busy}
      onClick={() => onToggle(!liked)}
    >
      {liked ? '❤️' : '🤍'}
    </button>
  );
}

function Chip({ liked, label, busy, onToggle }: { liked: boolean; label: string; busy: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="like-chip" aria-pressed={liked} disabled={busy} onClick={onToggle}>
      <span aria-hidden="true">{liked ? '❤️' : '🤍'}</span>
      <span className="like-chip-name">{label}</span>
    </button>
  );
}

/** Блок фіналу: «Вікторина», «Ведучий», люди; нічого — null. */
export function LikePanel({ likes, onLike, busy }: { likes: LikesView | undefined; onLike: (payload: LikePayload) => void; busy: boolean }) {
  if (likes === undefined) return null;
  const people = likes.people ?? [];
  if (likes.quiz === undefined && likes.host === undefined && people.length === 0) return null;
  return (
    <section className="like-panel" aria-label={t('likesPanelTitle')}>
      <h2 className="like-panel-title">{t('likesPanelTitle')}</h2>
      <div className="like-chips">
        {likes.quiz !== undefined && <Chip liked={likes.quiz} label={t('likeQuiz')} busy={busy} onToggle={() => onLike({ target: 'quiz', liked: !likes.quiz })} />}
        {likes.host !== undefined && <Chip liked={likes.host} label={t('likeHost')} busy={busy} onToggle={() => onLike({ target: 'host', liked: !likes.host })} />}
        {people.map((p) => (
          <Chip key={p.id} liked={p.liked} label={p.nickname} busy={busy} onToggle={() => onLike({ target: 'player', id: p.id, liked: !p.liked })} />
        ))}
      </div>
    </section>
  );
}
