import { useEffect, useId, useRef, useState } from 'react';
import type { Question, QuestionBankItem, QuestionType } from '@quiz/shared';
import { searchQuestionBank } from '../api';
import { errorText, t } from '../i18n';
import { typeIcon } from '../guide-text';
import type { BankFit } from './draft';

const SEARCH_DELAY = 300;
const keyOf = (item: QuestionBankItem) => `${item.quizId}:${item.question.id}`;
const imageOf = (question: Question): string | null => ('imageUrl' in question && typeof question.imageUrl === 'string' ? question.imageUrl : null);

/**
 * Панель «Банк запитань» (38f): пошук по власних вікторинах, вибір кількох запитань (хоч із різних сторінок)
 * і копіювання їх у кінець раунду. Що не пасує до раунду — показано вимкненим із причиною.
 */
export function QuestionBank({
  types,
  room,
  quizId,
  fit,
  onCopy,
  onClose,
}: {
  /** questionTypesFor раунду. */
  types: readonly QuestionType[];
  /** Скільки копій ще вміщається в раунд і вікторину. */
  room: number;
  /** Поточна вікторина: рядки з неї позначені «ця вікторина». */
  quizId?: string;
  fit: (question: Question) => BankFit;
  /** Позначені запитання в порядку позначення. */
  onCopy: (items: QuestionBankItem[]) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [typeChoice, setTypeChoice] = useState<QuestionType | ''>('');
  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Map<string, QuestionBankItem>>(new Map());
  const request = useRef(0);
  const typesKey = types.join(',');

  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // Кнопка, що відкрила панель, отримає фокус назад, коли панель закриється.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    heading.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      // Відкрита довідка закривається своїм Escape — панель лишається.
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('.help-pop') !== null) return;
      close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, []);

  // Пошук іде із затримкою, щоб не питати сервер після кожної літери.
  useEffect(() => {
    if (query === q) return;
    const timer = setTimeout(() => setQ(query), SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [query, q]);

  const wanted = (): readonly QuestionType[] => (typeChoice === '' ? types : [typeChoice]);

  // Новий пошук чи фільтр — з першої сторінки.
  useEffect(() => {
    const mine = ++request.current;
    setLoading(true);
    setError(null);
    void searchQuestionBank({ q, types: wanted(), page: 1 }).then((result) => {
      if (mine !== request.current) return;
      setLoading(false);
      if (!result.ok) {
        setItems([]);
        return setError(errorText(result.error));
      }
      setItems(result.data.items);
      setPage(result.data.page);
      setPages(result.data.pages);
    });
  }, [q, typeChoice, typesKey]);

  const more = () => {
    const mine = ++request.current;
    setLoading(true);
    setError(null);
    void searchQuestionBank({ q, types: wanted(), page: page + 1 }).then((result) => {
      if (mine !== request.current) return;
      setLoading(false);
      if (!result.ok) return setError(errorText(result.error));
      setItems((list) => {
        const seen = new Set(list.map(keyOf));
        return [...list, ...result.data.items.filter((item) => !seen.has(keyOf(item)))];
      });
      setPage(result.data.page);
      setPages(result.data.pages);
    });
  };

  const toggle = (item: QuestionBankItem) =>
    setPicked((map) => {
      const next = new Map(map);
      if (!next.delete(keyOf(item))) next.set(keyOf(item), item);
      return next;
    });

  const count = picked.size;
  const tooMany = count > room;

  return (
    <div className="group-picker-backdrop">
      <div className="group-picker question-bank" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="group-picker-head">
          <h2 id={titleId} ref={heading} tabIndex={-1}>
            {t('bankTitle')}
          </h2>
          <button type="button" className="btn btn-small group-picker-close" aria-label={t('bankClose')} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="group-picker-body">
          <div className="question-bank-filters">
            <input type="search" value={query} placeholder={t('bankSearch')} aria-label={t('bankSearch')} onChange={(event) => setQuery(event.target.value)} />
            <label className="question-bank-type">
              <span>{t('bankType')}</span>
              <select value={typeChoice} onChange={(event) => setTypeChoice(event.target.value as QuestionType | '')}>
                <option value="">{t('bankAllTypes')}</option>
                {types.map((type) => (
                  <option key={type} value={type}>
                    {typeIcon(type)} {t(`type_${type}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {items.length > 0 && (
            <ul className="question-bank-list">
              {items.map((item) => {
                const result = fit(item.question);
                const reason = 'issue' in result ? result.text : null;
                const key = keyOf(item);
                const image = imageOf(item.question);
                return (
                  <li key={key}>
                    <label className={reason === null ? 'question-bank-item' : 'question-bank-item is-disabled'}>
                      <input
                        type="checkbox"
                        checked={picked.has(key)}
                        disabled={reason !== null}
                        aria-label={t('bankPick', { text: item.question.text })}
                        onChange={() => toggle(item)}
                      />
                      <span className="question-bank-body">
                        <span className="group-picker-item-text">
                          <span aria-hidden="true">{typeIcon(item.question.type)}</span> {item.question.text}
                        </span>
                        <span className="meta">
                          «{item.quizTitle}» · {item.roundTitle === '' ? t('roundN', { index: item.roundIndex + 1 }) : item.roundTitle}
                          {item.quizId === quizId && (
                            <>
                              {' · '}
                              <span className="question-bank-here">{t('bankThisQuiz')}</span>
                            </>
                          )}
                        </span>
                        <span className="meta">{t('bankPoints', { points: item.question.points })}</span>
                        {reason !== null && <span className="group-template-why">{reason}</span>}
                      </span>
                      {image !== null && <img className="question-bank-thumb" src={image} alt="" loading="lazy" width={48} height={48} />}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {loading && <p className="meta">{t('loading')}</p>}
          {error !== null && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {!loading && error === null && items.length === 0 && <p className="meta">{q !== '' ? t('bankEmpty') : t('bankNone')}</p>}
          {!loading && error === null && page < pages && (
            <button type="button" className="btn" onClick={more}>
              {t('bankMore')}
            </button>
          )}
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={count === 0 || tooMany} onClick={() => onCopy([...picked.values()])}>
            {t('bankCopy', { count })}
          </button>
          <p className="meta question-bank-room" role="status">
            {tooMany ? t('bankRoomLeft', { count: room }) : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
