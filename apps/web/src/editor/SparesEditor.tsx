import { LIMITS, SIMPLE_TYPES, type Question, type QuestionType } from '@quiz/shared';
import { useState } from 'react';
import { t } from '../i18n';
import { newSpare } from './draft';
import { QuestionEditor } from './QuestionEditor';

interface Props {
  spares: Question[] | undefined;
  onChange: (next: Question[] | undefined) => void;
  /** Скільки запасних можна додати (типово — ліміт загального пулу). */
  max?: number;
  /** Підказка над чіпами (типово — про загальний пул). */
  hint?: string;
  /** Дозволені типи (типово SIMPLE_TYPES). */
  types?: readonly QuestionType[];
  /** Показувати час (типово ні). */
  showTime?: boolean;
  /** Підпис чіпа (типово «Запасне N»). */
  chipLabel?: (index: number) => string;
  /** Підпис кнопки додавання (типово «Додати запасне»). */
  addLabel?: string;
  /** Підпис кнопки вилучення (типово «Видалити запасне»). */
  removeLabel?: string;
}

/** Розділ «Запасні запитання»: чіпи запасних і редактор вибраного. Порожній пул — undefined. */
export function SparesEditor({ spares, onChange, max = LIMITS.maxSpares, hint, types = SIMPLE_TYPES, showTime = false, chipLabel, addLabel, removeLabel }: Props) {
  const [picked, setPicked] = useState(0);
  const list = spares ?? [];
  const at = Math.min(picked, list.length - 1);

  const add = () => {
    onChange([...list, newSpare()]);
    setPicked(list.length);
  };
  const remove = () => {
    const next = list.filter((_, i) => i !== at);
    onChange(next.length === 0 ? undefined : next);
    setPicked(Math.max(0, at - 1));
  };

  return (
    <>
      <p className="meta">{hint ?? t('sparesHint')}</p>
      <div className="type-chips">
        {list.map((spare, index) => (
          <button
            key={spare.id}
            type="button"
            className={index === at ? 'chip is-on' : 'chip'}
            aria-pressed={index === at}
            onClick={() => setPicked(index)}
          >
            {`${(chipLabel ?? ((i) => t('spareN', { index: i + 1 })))(index)} · ${t(`typeShort_${spare.type}`)}`}
          </button>
        ))}
        <button type="button" className="chip" disabled={list.length >= max} onClick={add}>
          {addLabel ?? t('addSpare')}
        </button>
      </div>
      {at >= 0 && (
        <>
          <QuestionEditor
            key={list[at].id}
            question={list[at]}
            types={types}
            showPoints={false}
            showHint={false}
            showTime={showTime}
            showVideo={false}
            showAudio={false}
            onChange={(next) => onChange(list.map((spare, i) => (i === at ? next : spare)))}
          />
          <button type="button" className="btn btn-small btn-danger spare-remove" onClick={remove}>
            {removeLabel ?? t('removeSpare')}
          </button>
        </>
      )}
    </>
  );
}
