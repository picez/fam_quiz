import { useCallback, useEffect, useRef, useState, type CSSProperties, type JSX } from 'react';
import { CEREMONY_MS, type Phase, type PrizePlace, type PrizeShown, type PrizesView } from '@quiz/shared';
import { t } from '../i18n';
import { reducedMotion } from '../motion';
import { canViewPrize, prizeViewLabel } from './PrizeViewer';
import { TrophyView } from './TrophyView';
import { ceremonyOrder, podiumColumns, titleBadge } from './trophy-meta';

const CONFETTI = 24;
const CONFETTI_COLORS = ['#E8B84A', '#F2545B', '#4FC3F7', '#7ED957', '#C9CED6', '#B794F6'];

/** Шматок конфеті: місце, затримка, тривалість і колір — сталі від номера, щоб перемальовування нічого не зсувало. */
function confettiStyle(index: number): CSSProperties {
  return {
    '--x': `${(index * 37 + 11) % 100}%`,
    '--d': `${((index * 173) % 1500) / 1000}s`,
    '--t': `${2.4 + ((index * 61) % 160) / 100}s`,
    '--r': `${(index * 47) % 360}deg`,
    '--c': CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  } as CSSProperties;
}

function Column({ shown, size, onView }: { shown: PrizeShown & { winner: NonNullable<PrizeShown['winner']> }; size: 'stage' | 'phone'; onView?: (place: PrizePlace) => void }) {
  const { place, content, winner } = shown;
  return (
    <>
      <div className="podium-info">
        <p className="podium-place">{t('ceremonyPlace', { place })}</p>
        {content.trophy && <TrophyView trophy={content.trophy} size={size} spin interactive={size === 'phone'} />}
        <p className="podium-name">{winner.name}</p>
        {winner.members.length > 0 && <p className="podium-members">{winner.members.join(', ')}</p>}
        {content.engraving && <p className="engraving">{content.engraving}</p>}
        {content.real && (
          <div className="podium-real">
            {content.real.photoUrl !== null && <img src={content.real.photoUrl} alt="" />}
            <span>{content.real.text}</span>
          </div>
        )}
        {content.title && <p className="podium-title">{titleBadge(content.title)}</p>}
        {onView !== undefined && canViewPrize(content) && (
          <button type="button" className="btn btn-small podium-view" onClick={() => onView(place)}>
            {prizeViewLabel(content)}
          </button>
        )}
      </div>
      <div className="podium-step" aria-hidden="true">
        {place}
      </div>
    </>
  );
}

/**
 * Місця з winner по черзі 3 → 2 → 1 (CEREMONY_MS.step, переможець — winner); hold — заставка ще йде, таймери стоять; onDone — раз.
 * onView (пульт) — під кожним відкритим місцем кнопка з видом трофея («Кубок», …), що відкриває перегляд призу цього місця.
 * Конфеті — CEREMONY_MS.winner після переможця, і стоп: пульт тримає подіум, доки ведучий його не сховає.
 */
export function Ceremony({ prizes, size, hold, onDone, onView }: { prizes: PrizesView; size: 'stage' | 'phone'; hold: boolean; onDone: () => void; onView?: (place: PrizePlace) => void }): JSX.Element {
  const order = ceremonyOrder(prizes);
  const total = order.length;
  // Стовпці зліва направо 2 — 1 — 3, лише місця церемонії: подіум без третього місця не з'їжджає вбік.
  const columns = podiumColumns(order);
  // Менше руху: читається раз на церемонію, щоб посеред показу вона не перескакувала.
  const [calm] = useState(reducedMotion);
  // Скільки місць уже відкрито (з кінця черги 3 → 2 → 1).
  const [count, setCount] = useState(0);
  const finished = useRef(false);
  // Час переможця сплив: конфеті більше не сиплеться (подіум на пульті лишається).
  const [over, setOver] = useState(false);
  const latest = useRef(onDone);
  latest.current = onDone;

  useEffect(() => {
    const finish = () => {
      if (finished.current) return;
      finished.current = true;
      setOver(true);
      latest.current();
    };
    if (total === 0) {
      finish();
      return;
    }
    if (hold) return;
    if (count === 0) {
      setCount(calm ? total : 1);
      return;
    }
    const last = count >= total;
    const timer = setTimeout(() => (last ? finish() : setCount(count + 1)), last ? CEREMONY_MS.winner : CEREMONY_MS.step);
    return () => clearTimeout(timer);
  }, [hold, count, total, calm]);

  if (total === 0) return <></>;
  const open = order.slice(0, Math.min(count, total));
  const now = !calm && open.length > 0 ? open[open.length - 1]!.place : null;
  const climax = !calm && count >= total && !over;
  return (
    <section className={`ceremony is-${size}`} aria-label={t('ceremonyTitle')}>
      <p className="meta ceremony-title">{t('ceremonyTitle')}</p>
      <div className="podium" aria-live="polite" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0,1fr))` }}>
        {columns.map((place) => {
          const shown = open.find((item) => item.place === place);
          const classes = ['podium-col', `is-place-${place}`, shown ? 'is-shown' : '', place === now ? 'is-now' : ''].filter(Boolean).join(' ');
          return (
            <div key={place} className={classes} data-place={place}>
              {shown && <Column shown={shown} size={size} onView={onView} />}
            </div>
          );
        })}
        {climax &&
          Array.from({ length: CONFETTI }, (_, index) => <span key={index} className="confetti" aria-hidden="true" style={confettiStyle(index)} />)}
      </div>
    </section>
  );
}

/**
 * Церемонія екрана (сцена, телефон): onDone, поки її ще належить показати у finished; null — призів з переможцем немає
 * або церемонія вже була. Поза finished стан скидається: наступна гра кімнати матиме свою.
 */
export function useCeremony(view: { phase: Phase; prizes?: PrizesView }): (() => void) | null {
  const [done, setDone] = useState(false);
  const finish = useCallback(() => setDone(true), []);
  useEffect(() => {
    if (view.phase !== 'finished') setDone(false);
  }, [view.phase]);
  const due = view.phase === 'finished' && ceremonyOrder(view.prizes).length > 0;
  return due && !done ? finish : null;
}
