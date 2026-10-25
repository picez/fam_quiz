import type { SurvivalInfo, SurvivalRow, SurvivalStatus } from '@quiz/shared';
import { t } from '../i18n';

type Size = 'stage' | 'host' | 'phone';

const GROUPS: { status: SurvivalStatus; title: 'survivalAlive' | 'survivalEdgeGroup' | 'survivalGhosts' }[] = [
  { status: 'edge', title: 'survivalEdgeGroup' },
  { status: 'alive', title: 'survivalAlive' },
  { status: 'ghost', title: 'survivalGhosts' },
];

/** Позначка випробування: сцена й телефон бачать лише «відповів / вибрав»; пульт — ще номер дверей наживо. */
function trialMark(row: SurvivalRow, size: Size): string | null {
  if (row.status !== 'edge' || row.trial === null) return null;
  if (row.trial === 'pending') return '…';
  if (row.trial === 'done') return size === 'host' && row.door?.picked != null ? `✓ ${t('survivalDoor', { n: row.door.picked + 1 })}` : '✓';
  return null;
}

/** «Живі / привиди»: групи на межі (підсвічені), живі, привиди (блідо, з «вибув після N»); highlightId — свій рядок. */
export function SurvivalBoard({ info, size, highlightId, hideEdge = false }: { info: SurvivalInfo; size: Size; highlightId?: string; hideEdge?: boolean }) {
  const ghostHits = info.ghosts.right !== null && info.ghosts.answered > 0;
  return (
    <section className={`survival-board is-${size}`} aria-label={t('survivalBoardTitle')}>
      <p className="meta survival-count">{t('survivalCount', { alive: info.aliveCount, ghosts: info.ghostCount })}</p>
      {GROUPS.map(({ status, title }) => {
        if (hideEdge && status === 'edge') return null;
        const rows = info.rows.filter((row) => row.status === status);
        if (rows.length === 0) return null;
        return (
          <section key={status} className={`survival-group is-${status}`}>
            <h3 className="meta">{t(title)}</h3>
            <ul>
              {rows.map((row) => {
                const mark = trialMark(row, size);
                return (
                  <li key={row.playerId} className={row.playerId === highlightId ? 'is-me' : undefined}>
                    {status === 'ghost' && <span aria-hidden="true">👻</span>}
                    <span className="name">{row.nickname}</span>
                    {status === 'ghost' && row.outAfter !== null && <span className="meta">{t('survivalOutAfterShort', { n: row.outAfter })}</span>}
                    {mark !== null && <span className={`survival-mark is-${row.trial}`}>{mark}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {ghostHits && info.ghosts.right !== null && (
        <p className="meta survival-ghost-hits">{t('survivalGhostHits', { right: info.ghosts.right, answered: info.ghosts.answered })}</p>
      )}
    </section>
  );
}
