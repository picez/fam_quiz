import type { AuthorCloudWord, HostCloudWord } from '@quiz/shared';
import { t } from '../i18n';

/** Хмара для пульта й меню автора: кожне слово — кнопка (aria-pressed = сховано), поруч кількість і автори (лише на пульті) — видимі й на дотик. */
export function HostCloud({ words, onHide }: { words: (HostCloudWord | AuthorCloudWord)[]; onHide: (key: string, hidden: boolean) => void }) {
  return (
    <ul className="host-cloud">
      {words.map((word) => (
        <li key={word.key}>
          <button
            type="button"
            className={word.hidden ? 'host-cloud-word is-hidden' : 'host-cloud-word'}
            aria-pressed={word.hidden}
            aria-label={word.text}
            title={t(word.hidden ? 'cloudShow' : 'cloudHide', { word: word.text })}
            onClick={() => onHide(word.key, !word.hidden)}
          >
            <span className="host-cloud-text">{word.text}</span>
            <span className="host-cloud-count">{word.count}</span>
            {'by' in word && <span className="host-cloud-by">{word.by.join(', ')}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
