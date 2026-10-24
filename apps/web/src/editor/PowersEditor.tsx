import { useState } from 'react';
import { allowedBuffs, allowedDebuffs, BUFF_KINDS, DEBUFF_KINDS, LIMITS, READY_BUFFS, type BuffKind, type DebuffKind, type Question, type QuizSettings } from '@quiz/shared';
import { BUFF_ICONS, buffName } from '../buff-meta';
import { DEBUFF_ICONS, debuffName } from '../debuff-meta';
import { t, type TextKey } from '../i18n';

type Prices = Partial<Record<DebuffKind, number>>;

interface Powers {
  debuffs: DebuffKind[];
  buffs: BuffKind[];
  debuffPrices: Prices | undefined;
  /** false — гравці не купують; увімкнено зберігається як відсутність ключа. */
  debuffShop: false | undefined;
}

interface Props {
  settings: QuizSettings;
  /** Пул запасних: «Заміна запитання» без нього не збережеться. */
  spares: Question[] | undefined;
  onChange: (powers: Powers) => void;
}

const toggled = <K extends string>(all: readonly K[], list: K[], kind: K, on: boolean) =>
  all.filter((item) => (item === kind ? on : list.includes(item)));

/** Ціни лише дозволених дебафів; порожній набір — undefined. */
const pricesFor = (prices: Prices | undefined, allowed: DebuffKind[]): Prices | undefined => {
  const kept = DEBUFF_KINDS.filter((kind) => allowed.includes(kind) && prices?.[kind] !== undefined);
  return kept.length === 0 ? undefined : Object.fromEntries(kept.map((kind) => [kind, prices?.[kind]]));
};

/** Розділ «Бафи й дебафи»: прапорці, ціни дебафів і «Усі / Жодного»; onChange завжди дає всі поля у порядку списків. */
export function PowersEditor({ settings, spares, onChange }: Props) {
  const debuffs = allowedDebuffs({ settings });
  const buffs = allowedBuffs({ settings });
  const prices = settings.debuffPrices;
  const shopOn = settings.debuffShop !== false;

  const emit = (next: { debuffs?: DebuffKind[]; buffs?: BuffKind[]; prices?: Prices | undefined; shopOn?: boolean }) => {
    const nextDebuffs = next.debuffs ?? debuffs;
    onChange({
      debuffs: nextDebuffs,
      buffs: next.buffs ?? buffs,
      debuffPrices: pricesFor('prices' in next ? next.prices : prices, nextDebuffs),
      debuffShop: (next.shopOn ?? shopOn) ? undefined : false,
    });
  };

  /** Сирий текст полів ціни, поки поле у фокусі: «2000» набирається через «200», тож нормалізуємо лише на blur. */
  const [drafts, setDrafts] = useState<Partial<Record<DebuffKind, string>>>({});

  const setPrice = (kind: DebuffKind, raw: string) => {
    setDrafts((current) => ({ ...current, [kind]: raw }));
    const value = raw.trim() === '' ? NaN : Number(raw);
    const rest: Prices = { ...prices };
    if (Number.isNaN(value)) delete rest[kind];
    else rest[kind] = value;
    emit({ prices: rest });
  };

  /** На blur порожнє чи рівне типовому поле прибирає ключ; решта (і поза межами) лишається видимою. */
  const settlePrice = (kind: DebuffKind) => {
    setDrafts(({ [kind]: _dropped, ...current }) => current);
    if (prices?.[kind] === LIMITS.defaultDebuffPrice) {
      const rest: Prices = { ...prices };
      delete rest[kind];
      emit({ prices: rest });
    }
  };

  return (
    <>
      <fieldset className="powers-group">
        <legend>{t('powersDebuffs')}</legend>
        <div className="powers-bulk">
          <button type="button" className="btn btn-small" onClick={() => emit({ debuffs: [...DEBUFF_KINDS] })}>
            {t('powersAll')}
          </button>
          <button type="button" className="btn btn-small" onClick={() => emit({ debuffs: [] })}>
            {t('powersNone')}
          </button>
        </div>
        <div className="powers-list">
          {DEBUFF_KINDS.map((kind) => {
            const on = debuffs.includes(kind);
            const price = prices?.[kind];
            const bad =
              price !== undefined && (!Number.isInteger(price) || price < LIMITS.minDebuffPrice || price > LIMITS.maxDebuffPrice);
            return (
              <div className="powers-row" key={kind}>
                <label className="powers-item">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(event) => emit({ debuffs: toggled(DEBUFF_KINDS, debuffs, kind, event.target.checked) })}
                  />
                  <span aria-hidden="true">{DEBUFF_ICONS[kind]}</span>
                  <span>{debuffName(kind)}</span>
                </label>
                {on && (
                  <label className="powers-price">
                    {t('powersPrice')}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={LIMITS.minDebuffPrice}
                      max={LIMITS.maxDebuffPrice}
                      step={50}
                      placeholder={String(LIMITS.defaultDebuffPrice)}
                      value={drafts[kind] ?? price ?? ''}
                      aria-invalid={bad ? true : undefined}
                      onChange={(event) => setPrice(kind, event.target.value)}
                      onBlur={() => settlePrice(kind)}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      <label className="powers-item">
        <input type="checkbox" checked={shopOn} onChange={(event) => emit({ shopOn: event.target.checked })} />
        <span>{t('powersShop')}</span>
      </label>

      <fieldset className="powers-group">
        <legend>{t('powersBuffs')}</legend>
        <div className="powers-bulk">
          <button type="button" className="btn btn-small" onClick={() => emit({ buffs: [...READY_BUFFS] })}>
            {t('powersAll')}
          </button>
          <button type="button" className="btn btn-small" onClick={() => emit({ buffs: [] })}>
            {t('powersNone')}
          </button>
        </div>
        <div className="powers-list">
          {BUFF_KINDS.map((kind) => (
            <label className="powers-item" key={kind}>
              <input
                type="checkbox"
                checked={buffs.includes(kind)}
                onChange={(event) => emit({ buffs: toggled(BUFF_KINDS, buffs, kind, event.target.checked) })}
              />
              <span aria-hidden="true">{BUFF_ICONS[kind]}</span>
              <span>{buffName(kind)}</span>
            </label>
          ))}
        </div>
        {buffs.map((kind) => (
          <p className="meta" key={kind}>
            {`${BUFF_ICONS[kind]} ${buffName(kind)} — ${t(`buffTip_${kind}` as TextKey)}`}
          </p>
        ))}
        {buffs.includes('swap') && (spares === undefined || spares.length === 0) && (
          <p className="meta powers-warn">{t('powersSwapNeedsSpares')}</p>
        )}
      </fieldset>
    </>
  );
}
