import type { LibraryCard } from '@quiz/shared';
import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { ROUND_NAMES } from '../guide-text';
import { countText, t } from '../i18n';
import { LOCALE_NAMES } from '../locales/locales';

/** Автор картки: порожній нік (його скинув адмін) показується як «Гравець». */
export const authorText = (author: string): string => t('libraryBy', { name: author === '' ? t('defaultNickname') : author });

/** Усе, що каталог каже про вікторину: без запитань і відповідей. */
export function LibraryFacts({ card }: { card: LibraryCard }): JSX.Element {
  return (
    <>
      <p className="meta library-author" dir="auto">
        {authorText(card.author)}
      </p>
      <p className="meta">
        {countText('libraryQuestions', card.questionCount, { count: card.questionCount })}
        {' · '}
        {card.roundTypes.map((type) => t(ROUND_NAMES[type])).join(', ')}
      </p>
      <p className="meta">
        {LOCALE_NAMES[card.language]}
        {' · '}
        <span>❤️ {card.likes}</span>
        {' · '}
        {countText('libraryPlays', card.plays, { count: card.plays })}
      </p>
    </>
  );
}

/** Картка каталогу (li у ul.library-list): уся — посилання на сторінку вікторини. */
export function LibraryCardView({ card }: { card: LibraryCard }): JSX.Element {
  return (
    <li>
      <Link className="panel library-card" to={`/library/${encodeURIComponent(card.id)}`}>
        <h2 dir="auto">{card.title}</h2>
        <LibraryFacts card={card} />
      </Link>
    </li>
  );
}
