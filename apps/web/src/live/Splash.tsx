import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { BoardInfo, GameView, SplashView } from '@quiz/shared';
import { splashLeft } from '../clock';
import { markText, roundLabel } from '../format';
import { t } from '../i18n';

/** Поточна заставка, поки годинник сервера < until і гра не на паузі; elapsed — скільки мс уже минуло. */
export function useSplash(splash: SplashView | null, paused: boolean, offsetMs: number): { splash: SplashView; elapsed: number } | null {
  // Стан лише будить перемальовування; видимість читається під час кожного рендера (як у Timer).
  const [tick, setTick] = useState(0);
  const at = splash?.at ?? null;
  const until = splash?.until ?? null;

  useEffect(() => {
    if (until === null || paused) return;
    const left = splashLeft({ until }, offsetMs, Date.now());
    if (left <= 0) return;
    // tick у залежностях: таймер, що спрацював на мить раніше за годинник, ставиться знову.
    const id = setTimeout(() => setTick((value) => value + 1), left);
    return () => clearTimeout(id);
  }, [until, paused, offsetMs, tick]);

  // elapsed рахується раз на заставку: зміна animation-delay на живому шарі зсунула б анімацію вперед.
  // Від кінця, а не від at: після зсуву паузою анімація продовжується з місця зупинки.
  const elapsed = useMemo(
    () => (at === null || until === null ? 0 : until - at - splashLeft({ until }, offsetMs, Date.now())),
    [at, until, offsetMs, paused],
  );

  if (splash === null || paused) return null;
  if (splashLeft(splash, offsetMs, Date.now()) <= 0) return null;
  return { splash, elapsed };
}

/** Перегортання вибраної клітинки поля: лице — ціна, зворот — категорія, ціна й позначки. */
function CellFlip({ cell }: { cell: NonNullable<BoardInfo['cell']> }) {
  const kind = cell.kind === 'blitz' ? ' is-blitz' : cell.answerMode === 'voice' ? ' is-voice' : '';
  return (
    <div className="splash-flip">
      <div className={`splash-face is-front${kind}`}>
        <span className="price">{cell.price}</span>
      </div>
      <div className={`splash-face is-back${kind}`}>
        <span className="splash-cell-title">{t('cellTitle', { category: cell.category, price: cell.price })}</span>
        {(cell.mark !== 'none' || cell.kind === 'blitz') && (
          <span className="splash-cell-marks">
            {cell.mark !== 'none' && <span className="splash-cell-mark">{markText(cell.mark)}</span>}
            {cell.kind === 'blitz' && <span className="splash-cell-mark">{t('cellBlitz')}</span>}
          </span>
        )}
      </div>
    </div>
  );
}

function SplashContent({ view, kind }: { view: GameView; kind: SplashView['kind'] }) {
  switch (kind) {
    case 'round':
      return (
        <div className="splash-card">
          <p className="splash-title">{t('splashRound', { index: (view.round?.index ?? 0) + 1 })}</p>
          {view.round !== null && <p className="splash-sub">{roundLabel(view.round.title, view.round.index, view.round.type)}</p>}
        </div>
      );
    case 'final': {
      const theme = view.final?.theme.trim() ?? '';
      return (
        <>
          <div className="splash-rays" aria-hidden="true" />
          <div className="splash-sparks" aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index} style={{ '--spark': index } as CSSProperties} />
            ))}
          </div>
          <div className="splash-card">
            <p className="splash-title">{t('splashFinal')}</p>
            {theme !== '' && <p className="splash-sub">{theme}</p>}
          </div>
        </>
      );
    }
    case 'question':
      return (
        <div className="splash-card">
          {view.round?.type === 'final' ? (
            <p className="splash-title is-long">{t('splashFinalQuestion')}</p>
          ) : (
            <>
              <p className="splash-title">{t('splashQuestion', { index: view.questionIndex + 1 })}</p>
              <p className="splash-sub">{t('splashQuestionOf', { total: view.total })}</p>
            </>
          )}
        </div>
      );
    case 'cell':
      return view.board?.cell ? <CellFlip cell={view.board.cell} /> : null;
    case 'duel':
      return view.duel === null ? null : (
        <div className="splash-card">
          <p className="splash-title">{t('splashDuel')}</p>
          <p className="splash-pair">
            <span className="splash-side is-challenger">{view.duel.challenger.nickname}</span>
            <span className="splash-cross">⚔</span>
            <span className="splash-side is-opponent">{view.duel.opponent.nickname}</span>
          </p>
        </div>
      );
    case 'podium':
      return (
        <div className="splash-card">
          <p className="splash-title">{t('splashPodium')}</p>
          <p className="splash-sub">{t('splashPodiumSub')}</p>
        </div>
      );
  }
}

/** Шар заставки на весь екран (position: fixed); size phone — менший вигляд. */
export function Splash({ view, offsetMs, size }: { view: GameView; offsetMs: number; size: 'stage' | 'phone' }) {
  const current = useSplash(view.splash, view.paused, offsetMs);
  if (current === null) return null;
  const { splash, elapsed } = current;
  const style = {
    '--splash-ms': `${splash.until - splash.at}ms`,
    '--splash-elapsed': `${-elapsed}ms`,
  } as CSSProperties;
  // aria-hidden: той самий зміст уже стоїть у розкладці етапу під шаром.
  return (
    // key: нова заставка або новий годинник — свіжий шар, тож анімація починається з потрібного місця.
    <div key={`${splash.at}:${splash.until}:${offsetMs}`} className={`splash is-${splash.kind} is-${size}`} aria-hidden="true" style={style}>
      <SplashContent view={view} kind={splash.kind} />
    </div>
  );
}

/** Значок «На екрані заставка» для пульта; поки заставки немає — null. */
export function SplashChip({ view, offsetMs }: { view: GameView; offsetMs: number }) {
  const current = useSplash(view.splash, view.paused, offsetMs);
  if (current === null) return null;
  return <p className="splash-chip">{t('splashChip')}</p>;
}
