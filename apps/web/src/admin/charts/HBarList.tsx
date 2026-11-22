import type { CSSProperties, JSX } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../../i18n';
import { decimalNumber } from './chart-scale';
import type { ChartView } from './BarChart';

/** 71: рядок списку зі смугою: назва, число, необов'язковий підпис під ним. */
export interface HBarItem {
  key: string;
  name: string;
  /** Назва — посилання (сторінка вікторини чи людини в адмінці). */
  href?: string;
  value: number;
  /** Як показати число (за замовчуванням — ціле мовою інтерфейсу). */
  valueText?: string;
  meta?: string;
}

/** Список зі смугами частки від найбільшого; у діалозі — ще й видимою таблицею. */
export function HBarList({ title, items, view = 'chart', limit }: { title: string; items: HBarItem[]; view?: ChartView; limit?: number }): JSX.Element {
  if (items.length === 0) return <p className="meta">{t('adminMetricEmptyList')}</p>;
  const shown = limit === undefined ? items : items.slice(0, limit);
  const max = Math.max(0, ...items.map((item) => item.value));
  const text = (item: HBarItem) => item.valueText ?? decimalNumber(item.value, 0);
  const name = (item: HBarItem) =>
    item.href === undefined ? (
      item.name
    ) : (
      <Link to={item.href} dir="auto">
        {item.name}
      </Link>
    );
  if (view === 'table') {
    return (
      <div className="chart-table-wrap">
        <table className="chart-table">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col">{title}</th>
              <th scope="col">{t('adminChartValue')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key}>
                <td>
                  {name(item)}
                  {item.meta !== undefined && <span className="meta"> · {item.meta}</span>}
                </td>
                <td>{text(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <ol className="hbar-list">
      {shown.map((item) => (
        <li key={item.key} className="hbar" style={{ '--share': max > 0 ? item.value / max : 0 } as CSSProperties}>
          <div className="hbar-head">
            <span className="hbar-name">{name(item)}</span>
            <span className="hbar-value">{text(item)}</span>
          </div>
          <div className="hbar-track" aria-hidden="true">
            <div className="hbar-fill" />
          </div>
          {item.meta !== undefined && <p className="meta">{item.meta}</p>}
        </li>
      ))}
    </ol>
  );
}
