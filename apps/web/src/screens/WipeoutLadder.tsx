import { Fragment } from 'react';
import type { WipeoutInfo, WipeoutRow, WipeoutStatus } from '@quiz/shared';
import { num } from '../format';
import { t } from '../i18n';

type Size = 'stage' | 'host' | 'phone';

/** Скільки пар «ім'я банк» у смужці телефону (11e). */
export const WIPEOUT_STRIP_MAX = 8;
/** Скільки рядків у колонці сцени (11e). */
export const WIPEOUT_SIDE_MAX = 12;

/** Позначка вибору на екрані рішень (11e): «Забрано 600» / «Далі з 600» / «Без вибору — забрано 600». */
export function choiceText(row: WipeoutRow): string {
  const bank = num(row.bank);
  if (row.choice === 'stay') return t('wipeoutChoiceStay', { bank });
  if (row.choice === 'auto') return t('wipeoutChoiceAuto', { bank });
  return t('wipeoutChoiceTook', { bank });
}

/** Ті, хто в грі, за спаданням банку (за рівного — у порядку гравців); max і highlightId — свій рядок завжди видно. */
export function inByBank(info: WipeoutInfo, max: number, highlightId?: string): { rows: WipeoutRow[]; more: number } {
  const sorted = info.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.status === 'in')
    .sort((a, b) => b.row.bank - a.row.bank || a.index - b.index)
    .map(({ row }) => row);
  const rows = sorted.slice(0, max);
  const own = highlightId === undefined ? undefined : sorted.slice(max).find((row) => row.playerId === highlightId);
  if (own !== undefined) rows.push(own);
  return { rows, more: sorted.length - rows.length };
}

/** Телефон на question / locked (11e): «У грі: Оля 600 · Петро 300 · ще 2». */
export function WipeoutStrip({ info, highlightId }: { info: WipeoutInfo; highlightId?: string }) {
  const { rows, more } = inByBank(info, WIPEOUT_STRIP_MAX, highlightId);
  if (rows.length === 0) return null;
  return (
    <p className="wipeout-strip-phone">
      <span className="meta">{t('wipeoutStripIn')}</span>{' '}
      {rows.map((row, i) => (
        <Fragment key={row.playerId}>
          {i > 0 && ' · '}
          <span className={row.playerId === highlightId ? 'is-me' : undefined}>
            {row.nickname} {num(row.bank)}
          </span>
        </Fragment>
      ))}
      {more > 0 && <span className="meta"> · {t('wipeoutMore', { n: more })}</span>}
    </p>
  );
}

/** Розкриття (11e): хто грав сходинку — «✓ 100 → 300» або «✗ банк 100 згорів». */
export function WipeoutStepList({ info, size, highlightId, max }: { info: WipeoutInfo; size: 'stage' | 'phone'; highlightId?: string; max?: number }) {
  const played = info.rows.filter((row) => row.prev !== null);
  const right = played.filter((row) => row.status === 'in').sort((a, b) => b.bank - a.bank);
  const burned = played.filter((row) => row.status === 'burned' && row.step === info.current);
  const all = [...right, ...burned];
  if (all.length === 0) return null;
  const shown = max === undefined ? all : all.slice(0, max);
  return (
    <section className={`wipeout-step-list is-${size}`}>
      {size === 'phone' && <h3 className="meta">{t('wipeoutStepTitle')}</h3>}
      <ul>
        {shown.map((row) => {
          const ok = row.status === 'in';
          const prev = num(row.prev ?? 0);
          return (
            <li key={row.playerId} className={`${ok ? 'is-right' : 'is-burned'}${row.playerId === highlightId ? ' is-me' : ''}`}>
              <span className="wipeout-verdict" aria-label={t(ok ? 'wipeoutVerdictRight' : 'wipeoutVerdictBurned')}>
                {ok ? '✓' : '✗'}
              </span>
              <span className="name">{row.nickname}</span>
              <span className="wipeout-change">{ok ? t('wipeoutStepRight', { prev, bank: num(row.bank) }) : t('wipeoutStepBurned', { prev })}</span>
            </li>
          );
        })}
        {shown.length < all.length && <li className="meta">{t('wipeoutMore', { n: all.length - shown.length })}</li>}
      </ul>
    </section>
  );
}

/** Колонка сцени поруч із запитанням (11e): на question / locked — банки тих, хто в грі; на reveal — список сходинки. */
export function WipeoutSide({ info, reveal }: { info: WipeoutInfo; reveal: boolean }) {
  if (reveal) {
    return (
      <aside className="wipeout-side" aria-label={t('wipeoutSideLabel')}>
        <WipeoutStepList info={info} size="stage" max={WIPEOUT_SIDE_MAX} />
      </aside>
    );
  }
  const { rows, more } = inByBank(info, WIPEOUT_SIDE_MAX);
  const inCount = info.rows.filter((row) => row.status === 'in').length;
  const took = info.rows.filter((row) => row.status === 'took' || row.status === 'survived').length;
  const burned = info.rows.filter((row) => row.status === 'burned').length;
  return (
    <aside className="wipeout-side" aria-label={t('wipeoutSideLabel')}>
      <h2 className="meta">{t('wipeoutSideTitle', { n: inCount })}</h2>
      <ul>
        {rows.map((row) => (
          <li key={row.playerId}>
            <span className="name">{row.nickname}</span>
            <span className="score">{num(row.bank)}</span>
          </li>
        ))}
        {more > 0 && <li className="meta">{t('wipeoutMore', { n: more })}</li>}
      </ul>
      {took + burned > 0 && <p className="meta wipeout-side-out">{t('wipeoutSideOut', { took, burned })}</p>}
    </aside>
  );
}

const GROUPS: { status: WipeoutStatus; title: 'wipeoutGroupIn' | 'wipeoutGroupTook' | 'wipeoutGroupBurned' | 'wipeoutGroupSurvived' }[] = [
  { status: 'in', title: 'wipeoutGroupIn' },
  { status: 'took', title: 'wipeoutGroupTook' },
  { status: 'survived', title: 'wipeoutGroupSurvived' },
  { status: 'burned', title: 'wipeoutGroupBurned' },
];

/** Позначка рішення у вікні: сцена й телефон бачать лише «вирішив», пульт — вибір наживо. */
function decisionMark(row: WipeoutRow, size: Size): string | null {
  if (row.decision === 'decided') return t('wipeoutDecidedMark');
  // Вибір наживо лише на пульті, навіть якщо зріз його містить.
  if (size !== 'host') return row.decision === 'pending' ? t('wipeoutPendingMark') : null;
  if (row.decision === 'take') return t('wipeoutChoseTake');
  if (row.decision === 'stay') return t('wipeoutChoseStay');
  if (row.decision === 'pending') return t('wipeoutPendingMark');
  return null;
}

/** Гравці за станом: у грі (банк), забрали, донесли, згоріли; у вікні рішення — позначка. */
export function WipeoutPlayers({ info, size, highlightId }: { info: WipeoutInfo; size: Size; highlightId?: string }) {
  const choices = info.rows.filter((row) => row.choice !== null);
  return (
    <div className={`wipeout-players is-${size}`}>
      {info.decide !== null && <p className="meta wipeout-decided">{t('wipeoutDecided', { n: info.decide.decided, total: info.decide.total })}</p>}
      {choices.length > 0 && (
        <section className="wipeout-group is-choices">
          <h3 className="meta">{t('wipeoutGroupChoices')}</h3>
          <ul>
            {choices.map((row) => (
              <li key={row.playerId} className={row.playerId === highlightId ? 'is-me' : undefined}>
                <span className="name">{row.nickname}</span>
                <span className={`wipeout-choice is-${row.choice}`}>{choiceText(row)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {GROUPS.map(({ status, title }) => {
        const rows = info.rows.filter((row) => row.status === status && row.choice === null);
        if (rows.length === 0) return null;
        return (
          <section key={status} className={`wipeout-group is-${status}`}>
            <h3 className="meta">{t(title)}</h3>
            <ul>
              {rows.map((row) => {
                const mark = status === 'in' || status === 'took' ? decisionMark(row, size) : null;
                return (
                  <li key={row.playerId} className={row.playerId === highlightId ? 'is-me' : undefined}>
                    <span className="name">{row.nickname}</span>
                    {mark !== null && <span className={`wipeout-mark is-${row.decision}`}>{mark}</span>}
                    {status !== 'burned' && <span className="score">{num(row.bank)}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Драбина «Ва-банк»: сходинки цін знизу вгору з поточною, а під нею гравці за станом. */
export function WipeoutLadder({ info, size, highlightId, players = true }: { info: WipeoutInfo; size: Size; highlightId?: string; players?: boolean }) {
  const steps = info.ladder.map((price, index) => ({ price, index })).reverse();
  return (
    <section className={`wipeout-ladder is-${size}`} aria-label={t('wipeoutLadderTitle')}>
      <ol className="wipeout-steps">
        {steps.map(({ price, index }) => {
          const current = index === info.current;
          const done = index < info.done;
          return (
            <li
              key={index}
              className={`wipeout-step${done ? ' is-done' : ''}${current ? ' is-current' : ''}`}
              aria-current={current ? 'step' : undefined}
            >
              <span className="wipeout-price">{num(price)}</span>
              <span className="sr-only">{t('wipeoutStepOf', { index: index + 1, total: info.ladder.length })}</span>
            </li>
          );
        })}
      </ol>
      {players && <WipeoutPlayers info={info} size={size} highlightId={highlightId} />}
    </section>
  );
}
