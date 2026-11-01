import { useRef } from 'react';
import type { PrizesView, StageView, PlayerView } from '@quiz/shared';
import { t } from '../i18n';
import { TROPHY_EMOJI, prizeSummary, titleBadge, trophyLabel } from '../trophy/trophy-meta';

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
            {content.title && <span>{titleBadge(content.title)}</span>}
            {!content.trophy && !content.real && !content.title && <span>{prizeSummary(content)}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Показувати «Граємо за» на заставці: першого раунду, а також першої заставки після лобі
 * (гра, продовжена з іншого раунду, 13b). Сцена й телефон не знають про продовження, тож
 * пам'ятають, що бачили лобі.
 */
export function useShowPrizesAtIntro(view: Pick<StageView | PlayerView, 'phase' | 'round' | 'questionIndex' | 'prizes'>): boolean {
  const seen = useRef<{ lobby: boolean; round: number | null }>({ lobby: false, round: null });
  if (view.phase === 'lobby') seen.current = { lobby: true, round: null };
  if (view.phase !== 'intro' || view.round === null) return false;
  if (seen.current.lobby && seen.current.round === null) seen.current.round = view.round.index;
  if (view.prizes === undefined || view.prizes.places.length === 0) return false;
  return (view.round.index === 0 && view.questionIndex === 0) || (seen.current.lobby && seen.current.round === view.round.index);
}
