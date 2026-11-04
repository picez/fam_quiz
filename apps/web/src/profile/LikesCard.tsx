import type { LikeTotals } from '@quiz/shared';
import { num } from '../format';
import { t } from '../i18n';

/** «Вподобання» (17a): скільки лайків людина зібрала як автор, ведучий і гравець. Три плитки показуються завжди, навіть із нулями. */
/** heading={false} — на сторінці «Вподобання», де той самий заголовок уже є в шапці сторінки. */
export function LikesCard({ likes, heading = true }: { likes: LikeTotals; heading?: boolean }) {
  const tiles: [value: number, label: string][] = [
    [likes.author, t('likesAsAuthor')],
    [likes.host, t('likesAsHost')],
    [likes.player, t('likesAsPlayer')],
  ];
  return (
    <section className="profile-section likes-card">
      {heading && <h2>{t('likesTitle')}</h2>}
      <div className="likes-tiles">
        {tiles.map(([value, label]) => (
          <div className="likes-tile" key={label}>
            <strong>
              <span aria-hidden="true">❤️</span> {num(value)}
            </strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
