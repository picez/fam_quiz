import { useState } from 'react';
import type { Answer, PublicPin, PublicQuestion } from '@quiz/shared';
import { t } from '../i18n';
import { PinFrame } from './PinFrame';

interface Props {
  question: PublicQuestion & { pin: PublicPin };
  onSubmit: (answer: Answer) => void;
  submitLabel?: string;
}

/** Точка на мапі: дотик ставить, повторний переставляє; «Відповісти» — лише з точкою. */
export function PinInput({ question, onSubmit, submitLabel }: Props) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  return (
    <div className="pin-input">
      <PinFrame pin={question.pin} imageUrl={question.imageUrl} point={point} onPlace={setPoint} />
      <p className="meta pin-hint">{t('pinHint')}</p>
      <button
        type="button"
        className="btn btn-primary"
        disabled={point === null}
        onClick={() => {
          if (point !== null) onSubmit({ type: 'pin', x: point.x, y: point.y });
        }}
      >
        {submitLabel ?? t('submit')}
      </button>
    </div>
  );
}
