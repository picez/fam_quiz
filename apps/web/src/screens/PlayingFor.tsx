import type { PrizesView } from '@quiz/shared';
import { t } from '../i18n';
import { TROPHY_EMOJI, prizeSummary, trophyLabel } from '../trophy/trophy-meta';

/** «Граємо за»: сцена — блок із рядком на місце (без 3D), телефон — один рядок. */
export function PlayingFor({ prizes, size }: { prizes: PrizesView; size: 'stage' | 'phone' }) {
  if (size === 'phone')
    return <p className="meta playing-for">{t('playingFor', { list: prizes.places.map((shown) => prizeSummary(shown.content)).join(' · ') })}</p>;
  return (
    <section className="playing-for is-stage">
      <h2 className="meta">{t('playingForTitle')}</h2>
      <ol>
        {prizes.places.map(({ place, content }) => (
          <li key={place}>
            <span className="rank">{place}</span>
            {content.trophy && <span>{`${TROPHY_EMOJI[content.trophy.kind]} ${trophyLabel(content.trophy)}`}</span>}
            {content.real && <span>{content.real.text}</span>}
            {content.title && <span>{`👑 ${content.title}`}</span>}
            {!content.trophy && !content.real && !content.title && <span>{prizeSummary(content)}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
