import { betsTeaser, betsWords, LIMITS } from '@quiz/shared';
import { t } from '../i18n';

/** «Увесь текст»: найбільший зріз зі схеми — більший за будь-яку кількість слів, тож видно весь текст і після правок. */
export const BETS_CUT_ALL = LIMITS.questionText;

interface Props {
  text: string;
  /** Скільки перших слів видно під час ставок; undefined — ще не обрано. */
  cut: number | undefined;
  onChange: (cut: number) => void;
  /** «Ставки» (типово) чи «Аукціон»: від раунду залежать підписи. */
  phase?: 'bets' | 'auction';
}

/** Слова тексту кнопками: «Нічого», кожне слово («обрізати після»), «Увесь текст»; під ними — що видно під час ставок. */
export function BetsCutField({ text, cut, onChange, phase = 'bets' }: Props) {
  const auction = phase === 'auction';
  const words = betsWords(text);
  const count = words.length;
  const none = cut === 0;
  const all = cut !== undefined && cut > 0 && cut >= count;
  const shown = cut === undefined ? null : betsTeaser(text, cut);
  const chip = (on: boolean) => (on ? 'chip is-on' : 'chip');
  return (
    <div className="bets-cut">
      <span className="bets-cut-label">{t(auction ? 'auctionCutLabel' : 'betsCutLabel')}</span>
      <div className="type-chips bets-cut-words" role="radiogroup" aria-label={t(auction ? 'auctionCutLabel' : 'betsCutLabel')}>
        <button type="button" role="radio" aria-checked={none} className={chip(none)} onClick={() => onChange(0)}>
          {t('betsCutNone')}
        </button>
        {words.map((word, index) => {
          const on = cut === index + 1 && index + 1 < count;
          return (
            <button key={index} type="button" role="radio" aria-checked={on} className={chip(on)} onClick={() => onChange(index + 1)}>
              {word}
            </button>
          );
        })}
        <button type="button" role="radio" aria-checked={all} className={chip(all)} onClick={() => onChange(BETS_CUT_ALL)}>
          {t('betsCutAll')}
        </button>
      </div>
      {shown !== null && <p className="meta bets-cut-preview">{shown === '' ? t(auction ? 'auctionCutPreviewNone' : 'betsCutPreviewNone') : t(auction ? 'auctionCutPreview' : 'betsCutPreview', { text: shown })}</p>}
      <p className="meta bets-cut-hidden">{t(auction ? 'auctionCutHidden' : 'betsCutHidden')}</p>
    </div>
  );
}
