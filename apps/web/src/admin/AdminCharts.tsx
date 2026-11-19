import { useId, type JSX } from 'react';
import type { AdminBackupInfo, AdminChartDay } from '@quiz/shared';
import { formatDate, formatDay } from '../format';
import { t, type TextKey } from '../i18n';
import { intlTag } from '../locales/current';
import { adminCharts, adminHealth } from './admin-api';
import { bytesText, uptimeText } from './admin-text';
import { useAdminData, type AdminData } from './useAdminData';

const WIDTH = 300;
const TOP = 16;
const BOTTOM = 102;
const SLOT = WIDTH / 30;
const BAR = SLOT * 0.7;

/** «19 лист.»: короткий підпис дня під віссю ('YYYY-MM-DD' — календарний день, без поясу). */
function shortDay(day: string): string {
  return new Intl.DateTimeFormat(intlTag(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
}

/**
 * Стовпчики за днями (старіші ліворуч); null і 0 — без стовпчика (нуль позначає вісь); поруч таблиця тих самих чисел для читачів екрана.
 * Відсоткові графіки масштабовані до 100 %, тож і підпис верху — «100 %». Самі нулі й прогалини — рядок «немає даних» замість порожньої рамки.
 */
export function DayBars({ title, hint, days, value, percent }: { title: TextKey; hint?: TextKey; days: AdminChartDay[]; value: (day: AdminChartDay) => number | null; percent: boolean }): JSX.Element {
  const id = useId();
  const values = days.map(value);
  const max = Math.max(0, ...values.map((v) => v ?? 0));
  const scale = percent ? 100 : max;
  const first = days[0];
  const last = days[days.length - 1];
  const empty = values.every((v) => v === null || v === 0);
  return (
    <figure className="day-bars">
      <h3 id={`${id}-title`}>{t(title)}</h3>
      {hint !== undefined && (
        <p className="meta" id={`${id}-hint`}>
          {t(hint)}
        </p>
      )}
      {empty ? <p className="meta">{t('adminChartNoData')}</p> : <Bars id={id} title={title} hint={hint} days={days} values={values} max={max} scale={scale} percent={percent} first={first} last={last} />}
    </figure>
  );
}

function Bars({ id, title, hint, days, values, max, scale, percent, first, last }: { id: string; title: TextKey; hint?: TextKey; days: AdminChartDay[]; values: (number | null)[]; max: number; scale: number; percent: boolean; first?: AdminChartDay; last?: AdminChartDay }): JSX.Element {
  return (
    <>
      <svg viewBox="0 0 300 120" role="img" aria-labelledby={`${id}-title`} aria-describedby={hint !== undefined ? `${id}-hint` : undefined}>
        <text x={0} y={10} className="day-bars-max">
          {percent ? t('adminChartMaxPercent') : t('adminChartMax', { value: max })}
        </text>
        <line x1={0} x2={WIDTH} y1={BOTTOM + 0.5} y2={BOTTOM + 0.5} className="day-bars-axis" />
        {values.map((v, index) => {
          if (v === null || v === 0 || scale === 0) return null;
          const height = Math.max(1, ((BOTTOM - TOP) * Math.min(v, scale)) / scale);
          return <rect key={days[index]!.day} x={index * SLOT + (SLOT - BAR) / 2} y={BOTTOM - height} width={BAR} height={height} rx={1} />;
        })}
        {first !== undefined && (
          <text x={0} y={117} className="day-bars-day">
            {shortDay(first.day)}
          </text>
        )}
        {last !== undefined && (
          <text x={WIDTH} y={117} textAnchor="end" className="day-bars-day">
            {shortDay(last.day)}
          </text>
        )}
      </svg>
      <table className="sr-only">
        <caption>{t(title)}</caption>
        <thead>
          <tr>
            <th scope="col">{t('adminChartDay')}</th>
            <th scope="col">{t('adminChartValue')}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day, index) => (
            <tr key={day.day}>
              <td>{formatDay(`${day.day}T12:00:00Z`)}</td>
              <td>{values[index] === null ? '—' : String(values[index])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Failed({ state }: { state: AdminData<unknown> & { reload: () => void } }): JSX.Element | null {
  if (state.status === 'loading') return <p className="meta">{t('loading')}</p>;
  if (state.status !== 'error') return null;
  return (
    <>
      <p className="error" role="alert">
        {state.message}
      </p>
      <button type="button" className="btn" onClick={state.reload}>
        {t('prizesRetry')}
      </button>
    </>
  );
}

/** Графіки за 30 київських днів; сервер кешує їх на 10 хв. */
export function AdminCharts(): JSX.Element {
  const state = useAdminData(adminCharts, 'charts');
  return (
    <section className="admin-charts" aria-labelledby="admin-charts-title">
      <h2 id="admin-charts-title">{t('adminChartsTitle')}</h2>
      {state.status === 'ready' ? (
        <>
          <div className="day-bars-grid">
            <DayBars title="adminChartPlayers" days={state.data.days} value={(day) => day.players} percent={false} />
            <DayBars title="adminChartGames" days={state.data.days} value={(day) => day.games} percent={false} />
            <DayBars title="adminChartCompletion" days={state.data.days} value={(day) => day.completion} percent />
            <DayBars title="adminChartReturns" hint="adminChartReturnsHint" days={state.data.days} value={(day) => day.returns} percent />
          </div>
          <p className="meta">{t('adminChartsComputed', { time: formatDate(state.data.computedAt) })}</p>
        </>
      ) : (
        <Failed state={state} />
      )}
    </section>
  );
}

function backupText(backup: AdminBackupInfo): string {
  switch (backup.state) {
    case 'ok':
      return t('adminHealthBackupLine', { date: formatDate(backup.at), size: bytesText(backup.bytes) });
    case 'none':
      return t('adminHealthBackupNone');
    case 'off':
      return t('adminHealthBackupOff');
    default:
      return t('adminHealthBackupError');
  }
}

function Row({ label, value }: { label: TextKey; value: string }): JSX.Element {
  return (
    <div className="admin-stat">
      <dt>{t(label)}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Стан сервера: остання копія бази, час роботи, пам'ять, живі кімнати й з'єднання. */
export function AdminHealth(): JSX.Element {
  const state = useAdminData(adminHealth, 'health');
  return (
    <section className="admin-health" aria-labelledby="admin-health-title">
      <h2 id="admin-health-title">{t('adminHealthTitle')}</h2>
      {state.status === 'ready' ? (
        <dl className="admin-stats">
          <Row label="adminHealthBackup" value={backupText(state.data.backup)} />
          <Row label="adminHealthUptime" value={uptimeText(state.data.uptimeSec)} />
          <Row label="adminHealthMemory" value={t('adminHealthMemoryValue', { rss: bytesText(state.data.memory.rss), heap: bytesText(state.data.memory.heapUsed) })} />
          <Row label="adminHealthRooms" value={String(state.data.rooms)} />
          <Row label="adminHealthConnections" value={String(state.data.connections)} />
        </dl>
      ) : (
        <Failed state={state} />
      )}
    </section>
  );
}
