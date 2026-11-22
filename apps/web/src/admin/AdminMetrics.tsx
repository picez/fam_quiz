import { useRef, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ADMIN_METRIC_PERIODS, type AdminMetricBucket, type AdminMetricPeriod, type AdminMetrics as Metrics, type AdminMetricsSummary } from '@quiz/shared';
import { formatDate, formatDay } from '../format';
import { ROUND_NAMES } from '../guide-text';
import { t, type TextKey } from '../i18n';
import { nickText } from '../nick';
import { adminMetrics } from './admin-api';
import { BarChart, isEmptyChart, type ChartLabel, type ChartSeries, type ChartUnit } from './charts/BarChart';
import { ChartCard } from './charts/ChartCard';
import { bucketLabel, bucketRange, decimalNumber, deltaPercent, minutesText, percentText } from './charts/chart-scale';
import { HBarList, type HBarItem } from './charts/HBarList';
import { useAdminData } from './useAdminData';

const DEFAULT_PERIOD: AdminMetricPeriod = 30;
/** Скільки рядків списку видно в картці; решта — у «Розгорнути». */
const LIST_CARD_ROWS = 5;

/** `?period=` адреси; невідоме — 30 днів. */
export function periodFrom(text: string | null): AdminMetricPeriod {
  const value = Number(text);
  return (ADMIN_METRIC_PERIODS as readonly number[]).includes(value) ? (value as AdminMetricPeriod) : DEFAULT_PERIOD;
}

type Kind = 'count' | 'decimal' | 'percent' | 'minutes' | 'hours';
interface Kpi {
  label: TextKey;
  value: (summary: AdminMetricsSummary) => number | null;
  kind: Kind;
}

/** Плитки періоду в порядку специфікації (§4.3). */
const KPIS: Kpi[] = [
  { label: 'adminKpiGames', value: (s) => s.games, kind: 'count' },
  { label: 'adminKpiCompletion', value: (s) => s.completion, kind: 'percent' },
  { label: 'adminKpiAvgPlayers', value: (s) => s.avgPlayers, kind: 'decimal' },
  { label: 'adminKpiMedianGame', value: (s) => s.medianGameMin, kind: 'minutes' },
  { label: 'adminKpiGameHours', value: (s) => s.gameHours, kind: 'hours' },
  { label: 'adminKpiPlayerHours', value: (s) => s.playerHours, kind: 'hours' },
  { label: 'adminKpiNewUsers', value: (s) => s.newUsers, kind: 'count' },
  { label: 'adminKpiActivation', value: (s) => s.activation, kind: 'percent' },
  { label: 'adminKpiDau', value: (s) => s.dau, kind: 'decimal' },
  { label: 'adminKpiWau', value: (s) => s.wau, kind: 'count' },
  { label: 'adminKpiMau', value: (s) => s.mau, kind: 'count' },
  { label: 'adminKpiStickiness', value: (s) => s.stickiness, kind: 'percent' },
  { label: 'adminKpiEditorHours', value: (s) => s.editorHours, kind: 'hours' },
  { label: 'adminKpiEditorSessions', value: (s) => s.editorSessions, kind: 'count' },
  { label: 'adminKpiEditorSession', value: (s) => s.editorSessionMin, kind: 'minutes' },
  { label: 'adminKpiEditors', value: (s) => s.editors, kind: 'count' },
  { label: 'adminKpiNewQuizzes', value: (s) => s.newQuizzes, kind: 'count' },
  { label: 'adminKpiBotGames', value: (s) => s.bot, kind: 'count' },
];

function kpiText(value: number | null, kind: Kind): string {
  if (value === null) return '—';
  switch (kind) {
    case 'percent':
      return percentText(value);
    case 'minutes':
      return minutesText(value);
    case 'count':
      return decimalNumber(value, 0);
    default:
      return decimalNumber(value);
  }
}

function Delta({ now, before }: { now: number | null; before: number | null | undefined }): JSX.Element {
  const delta = before === undefined ? null : deltaPercent(now, before);
  if (delta === null) return <dd className="admin-kpi-delta">{t('adminMetricsNoPrevious')}</dd>;
  if (delta === 0) return <dd className="admin-kpi-delta">{t('adminMetricsSame')}</dd>;
  const up = delta > 0;
  return (
    <dd className={`admin-kpi-delta ${up ? 'is-up' : 'is-down'}`}>
      <span aria-hidden="true">{up ? '▲ ' : '▼ '}</span>
      {t(up ? 'adminMetricsUp' : 'adminMetricsDown', { value: percentText(Math.abs(delta)) })}
    </dd>
  );
}

function KpiTiles({ summary, previous }: { summary: AdminMetricsSummary; previous: AdminMetricsSummary | null }): JSX.Element {
  return (
    <dl className="admin-stats admin-kpis">
      {KPIS.map((kpi) => (
        <div key={kpi.label} className="admin-stat">
          <dt>{t(kpi.label)}</dt>
          <dd>{kpiText(kpi.value(summary), kpi.kind)}</dd>
          <Delta now={kpi.value(summary)} before={previous === null ? undefined : kpi.value(previous)} />
        </div>
      ))}
    </dl>
  );
}

interface BarSpec {
  title: TextKey;
  hint?: string;
  unit: ChartUnit;
  series: ChartSeries[];
  labels: ChartLabel[];
  average?: boolean;
  labelGap?: number;
}

function BarCard({ spec, caption }: { spec: BarSpec; caption: string }): JSX.Element {
  const title = t(spec.title);
  return (
    <ChartCard title={title} hint={spec.hint} caption={caption} empty={isEmptyChart(spec.series)}>
      {({ size, titleId, view }) => <BarChart title={title} titleId={titleId} labels={spec.labels} series={spec.series} unit={spec.unit} size={size} view={view} average={spec.average} labelGap={spec.labelGap} />}
    </ChartCard>
  );
}

function ListCard({ title, hint, items, caption }: { title: TextKey; hint?: string; items: HBarItem[]; caption: string }): JSX.Element {
  const text = t(title);
  return (
    <ChartCard title={text} hint={hint} caption={caption} empty={items.length === 0} bars={false}>
      {({ size, view }) => <HBarList title={text} items={items} view={view} limit={size === 'small' ? LIST_CARD_ROWS : undefined} />}
    </ChartCard>
  );
}

const one = (key: string, label: string, values: (number | null)[]): ChartSeries[] => [{ key, label, color: 1, values }];

/** Картки графіків у порядку специфікації (§4.4) + колишній «Ігор за день» (на нього чекає e2e 53). */
function barSpecs(data: Metrics): BarSpec[] {
  const labels = data.buckets.map((b) => ({ short: bucketLabel(b.start, data.bucket), full: bucketRange(b.start, b.days) }));
  const pick = (value: (b: AdminMetricBucket) => number | null) => data.buckets.map(value);
  const since = data.trackedSince === null ? undefined : t('chartSinceHint', { date: formatDay(`${data.trackedSince}T12:00:00Z`) });
  const series = (title: TextKey, key: string, value: (b: AdminMetricBucket) => number | null) => one(key, t(title), pick(value));
  return [
    { title: 'adminMetricActive', hint: since, unit: 'count', labels, series: series('adminMetricActive', 'active', (b) => b.active) },
    { title: 'adminChartPlayers', unit: 'count', labels, series: series('adminChartPlayers', 'players', (b) => b.players) },
    { title: 'adminChartGames', unit: 'count', labels, series: series('adminChartGames', 'games', (b) => b.games) },
    {
      title: 'adminMetricGamesByHost',
      unit: 'count',
      labels,
      series: [
        { key: 'hosted', label: t('adminMetricHostPeople'), color: 1, values: pick((b) => b.hosted) },
        { key: 'autopilot', label: t('adminMetricHostAutopilot'), color: 2, values: pick((b) => b.autopilot) },
        { key: 'bot', label: t('adminMetricHostBot'), color: 3, values: pick((b) => b.bot) },
      ],
    },
    { title: 'adminChartCompletion', unit: 'percent', labels, series: series('adminChartCompletion', 'completion', (b) => b.completion) },
    { title: 'adminChartReturns', hint: t('adminChartReturnsHint'), unit: 'percent', labels, series: series('adminChartReturns', 'returns', (b) => b.returns) },
    { title: 'adminMetricAvgPlayers', unit: 'decimal', labels, series: series('adminMetricAvgPlayers', 'avgPlayers', (b) => b.avgPlayers) },
    { title: 'adminMetricGameTime', hint: t('adminMetricGameTimeHint'), unit: 'minutes', labels, series: series('adminMetricGameTime', 'gameMin', (b) => b.gameMin) },
    { title: 'adminMetricNewUsers', unit: 'count', labels, series: series('adminMetricNewUsers', 'newUsers', (b) => b.newUsers) },
    {
      title: 'adminMetricEditorTime',
      hint: [t('adminMetricEditorHint'), since].filter((line) => line !== undefined).join(' '),
      unit: 'minutes',
      labels,
      series: series('adminMetricEditorTime', 'editorMin', (b) => b.editorMin),
    },
    { title: 'adminMetricNewQuizzes', unit: 'count', labels, series: series('adminMetricNewQuizzes', 'newQuizzes', (b) => b.newQuizzes) },
    {
      title: 'adminMetricHours',
      unit: 'count',
      average: false,
      // Підписи годин («09») короткі: їм досить меншого проміжку.
      labelGap: 28,
      labels: data.hours.map((_, hour) => ({ short: String(hour).padStart(2, '0'), full: `${t('chartHour')} ${String(hour).padStart(2, '0')}:00` })),
      series: one('hours', t('adminMetricHours'), data.hours),
    },
  ];
}

function Lists({ data, caption }: { data: Metrics; caption: string }): JSX.Element {
  const quizzes: HBarItem[] = data.topQuizzes.map((quiz) => ({
    key: quiz.id,
    name: quiz.title,
    href: `/admin/quizzes/${encodeURIComponent(quiz.id)}`,
    value: quiz.games,
    meta: t('adminMetricTopQuizMeta', { author: nickText(quiz.author || null), players: quiz.avgPlayers === null ? '—' : decimalNumber(quiz.avgPlayers), minutes: quiz.avgMin === null ? '—' : decimalNumber(quiz.avgMin, 0) }),
  }));
  const rounds: HBarItem[] = data.roundTypes.map((row) => ({ key: row.type, name: t(ROUND_NAMES[row.type]), value: row.games }));
  const questions: HBarItem[] = data.questionTypes.map((row) => ({ key: row.type, name: t(`type_${row.type}` as TextKey), value: row.plays }));
  const editors: HBarItem[] = data.topEditors.map((row) => ({
    key: row.userId,
    name: nickText(row.nickname),
    href: `/admin/users/${encodeURIComponent(row.userId)}`,
    value: row.minutes,
    valueText: minutesText(row.minutes),
    meta: t('adminMetricTopEditorMeta', { sessions: row.sessions }),
  }));
  return (
    <div className="day-bars-grid admin-metric-lists">
      <ListCard title="adminMetricTopQuizzes" items={quizzes} caption={caption} />
      <ListCard title="adminMetricRoundTypes" items={rounds} caption={caption} />
      <ListCard title="adminMetricQuestionTypes" hint={data.questionTypesGames > 0 ? t('adminMetricQuestionTypesHint', { count: data.questionTypesGames }) : undefined} items={questions} caption={caption} />
      <ListCard title="adminMetricTopEditors" items={editors} caption={caption} />
    </div>
  );
}

function PeriodPicker({ period, onPick }: { period: AdminMetricPeriod; onPick: (period: AdminMetricPeriod) => void }): JSX.Element {
  return (
    <fieldset className="metric-period">
      <legend>{t('adminMetricsPeriod')}</legend>
      {ADMIN_METRIC_PERIODS.map((value) => (
        <label key={value}>
          <input type="radio" name="admin-metric-period" value={value} checked={period === value} onChange={() => onPick(value)} />
          {t(`adminMetricsPeriod_${value}`)}
        </label>
      ))}
    </fieldset>
  );
}

/** 71: «Метрики за період»: перемикач (у `?period=`), плитки зі зміною до попереднього періоду, графіки й списки, що відкриваються. */
export function AdminMetrics(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const period = periodFrom(params.get('period'));
  const state = useAdminData(() => adminMetrics(period), `metrics:${period}`, { keep: true });
  // Під час перемикання періоду лишаються попередні числа, а не «Завантаження…».
  const last = useRef<Metrics | null>(null);
  if (state.status === 'ready') last.current = state.data;
  const data = state.status === 'ready' ? state.data : state.status === 'loading' ? last.current : null;
  const pick = (next: AdminMetricPeriod) =>
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      out.set('period', String(next));
      return out;
    });
  const caption = t(`adminMetricsPeriod_${period}`);
  return (
    <section className="admin-metrics" aria-labelledby="admin-metrics-title" aria-busy={state.status === 'loading'}>
      <h2 id="admin-metrics-title">{t('adminMetricsTitle')}</h2>
      <PeriodPicker period={period} onPick={pick} />
      {data !== null ? (
        <>
          <KpiTiles summary={data.summary} previous={data.previous} />
          <div className="day-bars-grid admin-metric-charts">
            {barSpecs(data).map((spec) => (
              <BarCard key={spec.title} spec={spec} caption={caption} />
            ))}
          </div>
          <Lists data={data} caption={caption} />
          <p className="meta">{t('adminChartsComputed', { time: formatDate(data.computedAt) })}</p>
        </>
      ) : state.status === 'error' ? (
        <>
          <p className="error" role="alert">
            {state.message}
          </p>
          <button type="button" className="btn" onClick={state.reload}>
            {t('prizesRetry')}
          </button>
        </>
      ) : (
        <p className="meta">{t('loading')}</p>
      )}
    </section>
  );
}
