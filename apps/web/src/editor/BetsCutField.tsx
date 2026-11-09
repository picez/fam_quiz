import { betsTeaser, betsWords } from '@quiz/shared';
import { t } from '../i18n';

interface Props {
  text: string;
  /** Скільки перших слів видно під час ставок; undefined — ще не обрано. */
  cut: number | undefined;
  onChange: (cut: number) => void;
}

/** Слова тексту кнопками: «Нічого», кожне слово («обрізати після»), «Увесь текст»; під ними — що видно під час ставок. */
export function BetsCutField({ text, cut, onChange }: Props) {
  const words = betsWords(text);
  const count = words.length;
  const none = cut === 0;
  const all = cut !== undefined && cut > 0 && cut >= count;
  const shown = cut === undefined ? null : betsTeaser(text, cut);
  const chip = (on: boolean) => (on ? 'chip is-on' : 'chip');
  return (
    <div className="bets-cut">
      <span className="bets-cut-label">{t('betsCutLabel')}</span>
      <div className="type-chips bets-cut-words" role="radiogroup" aria-label={t('betsCutLabel')}>
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
        <button type="button" role="radio" aria-checked={all} className={chip(all)} onClick={() => onChange(count)}>
          {t('betsCutAll')}
        </button>
      </div>
      {shown !== null && <p className="meta bets-cut-preview">{shown === '' ? t('betsCutPreviewNone') : t('betsCutPreview', { text: shown })}</p>}
      <p className="meta bets-cut-hidden">{t('betsCutHidden')}</p>
    </div>
  );
}
