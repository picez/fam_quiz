import type { FactCard, GameCard, OwnRevealFact, RevealFacts, RoundCard } from '@quiz/shared';
import { factBody, factTitle, gameCardLines, ownRevealText, revealFactsText, roundCardParts } from '../facts-text';
import { num } from '../format';
import { t } from '../i18n';

/** Картки цікавинок (12d): заголовок і тіло; big — сцена. Порожній список — нічого. */
export function FactCards({ cards, rounds, big = false, title }: { cards: FactCard[]; rounds: number; big?: boolean; title?: string }) {
  if (cards.length === 0) return null;
  return (
    <section className={big ? 'fact-cards is-big' : 'fact-cards'}>
      {title !== undefined && <h2>{title}</h2>}
      <ul>
        {cards.map((card) => (
          <li key={card.kind} className={`fact-card fact-${card.kind}`}>
            <p className="fact-title">{factTitle(card)}</p>
            <p className="fact-body">{factBody(card, rounds)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Рядок розкриття на сцені й пульті. */
export function RevealFactsLine({ facts, big = false }: { facts: RevealFacts; big?: boolean }) {
  return <p className={big ? 'meta reveal-facts is-big' : 'meta reveal-facts'}>{revealFactsText(facts)}</p>;
}

/** Рядок розкриття на телефоні. */
export function OwnRevealLine({ fact }: { fact: OwnRevealFact }) {
  return <p className="meta reveal-facts">{ownRevealText(fact)}</p>;
}

/** «Твій раунд» на телефоні; team — «Раунд команди». */
export function RoundCardView({ card, team }: { card: RoundCard; team: boolean }) {
  return (
    <section className="own-card round-card">
      <h2>{t(team ? 'roundCardTitleTeam' : 'roundCardTitle')}</h2>
      <p>{roundCardParts(card, team).join(' · ')}</p>
    </section>
  );
}

const pct = (value: number) => `${Math.round(value * 10000) / 100}%`;

/** Стовпчики балів за раундами: нуль — одна лінія, плюс угору, мінус (is-minus) униз. */
function RoundBars({ rounds }: { rounds: number[] }) {
  const up = Math.max(0, ...rounds);
  const down = Math.max(0, ...rounds.map((points) => -points));
  const span = up + down;
  const label = `${t('gameCardRoundsLabel')}: ${rounds.map((points, i) => `${t('scoreRound', { n: i + 1 })} ${num(points)}`).join(', ')}`;
  return (
    <div className="round-bars" role="img" aria-label={label}>
      {rounds.map((points, i) => {
        const minus = points < 0;
        const height = span === 0 ? 0 : Math.abs(points) / span;
        const fill = minus ? { top: pct(up / (span || 1)), height: pct(height) } : { bottom: pct(down / (span || 1)), height: pct(height) };
        return (
          <span key={i} className={minus ? 'round-bar is-minus' : 'round-bar'} aria-hidden="true">
            <span className="round-bar-value">{num(points)}</span>
            <span className="round-bar-track">
              <span className="round-bar-fill" style={fill} />
            </span>
            <span className="round-bar-label">{t('scoreRound', { n: i + 1 })}</span>
          </span>
        );
      })}
    </div>
  );
}

/** «Твоя гра» на телефоні: місце, стовпчики балів за раундами (від'ємні — вниз, клас is-minus; підпис Р1…), рядки gameCardLines. */
export function GameCardView({ card, team }: { card: GameCard; team: boolean }) {
  return (
    <section className="own-card game-card">
      <h2>{t(team ? 'gameCardTitleTeam' : 'gameCardTitle')}</h2>
      {card.rank !== null && <p className="lead">{t('gameCardRank', { rank: card.rank })}</p>}
      {card.rounds.length > 0 && <RoundBars rounds={card.rounds} />}
      <ul>
        {gameCardLines(card, team).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
