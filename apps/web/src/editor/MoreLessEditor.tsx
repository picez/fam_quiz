import { LIMITS, answerKey, type MoreLessPair, type Question } from '@quiz/shared';
import { t } from '../i18n';
import { blankMoreLessPair, moveItem, steppedPoints } from './draft';
import { NumberField } from './QuestionEditor';

type MoreLess = Extract<Question, { type: 'moreless' }>;
type Pair = MoreLessPair;

const SIDES = ['a', 'b'] as const;

/**
 * «Більше чи менше»: ряд порівнянь. У кожному — запитання, два варіанти з текстом і значенням, позначка правильного й бали.
 * Ціна запитання — сума балів порівнянь: редактор переписує її при кожній зміні, окремого поля немає.
 */
export function MoreLessEditor({ question, onChange }: { question: MoreLess; onChange: (q: Question) => void }) {
  const { pairs, step } = question;
  const total = pairs.reduce((sum, pair) => sum + pair.points, 0);

  const setPairs = (next: Pair[], change: { step: number | undefined } = { step }) => {
    const nextStep = change.step;
    const { step: _step, ...rest } = question;
    onChange({ ...rest, ...(nextStep === undefined ? {} : { step: nextStep }), pairs: next, points: next.reduce((sum, pair) => sum + pair.points, 0) });
  };
  /** Лад балів: перше порівняння й крок задають решту; ручні правки живуть, доки не зміниться одне з двох. */
  const ladder = (from: Pair[], first: number, by: number): Pair[] => {
    const points = steppedPoints(first, by, from.length);
    return from.map((pair, at) => ({ ...pair, points: points[at] }));
  };
  const setPair = (id: string, patch: Partial<Pair>) => {
    const next = pairs.map((pair) => (pair.id === id ? { ...pair, ...patch } : pair));
    // Змінили бали першого порівняння при заданому кроці — решта йде за ним.
    setPairs(step !== undefined && 'points' in patch && next[0]?.id === id ? ladder(next, next[0].points, step) : next);
  };
  const setStep = (value: number, raw: string) => {
    if (raw.trim() === '') return setPairs(pairs, { step: undefined });
    if (Number.isNaN(value)) return;
    const by = Math.min(LIMITS.maxPoints, Math.max(0, Math.trunc(value)));
    setPairs(ladder(pairs, pairs[0]?.points ?? 0, by), { step: by });
  };
  const move = (from: number, to: number) => setPairs(moveItem(pairs, from, to));
  const add = () => {
    const previous = pairs[pairs.length - 1];
    const points = previous === undefined ? LIMITS.defaultMoreLessPoints : step === undefined ? previous.points : Math.min(LIMITS.maxPoints, previous.points + step);
    setPairs([...pairs, blankMoreLessPair(points, previous?.prompt ?? '')]);
  };

  return (
    <>
      {pairs.map((pair, at) => {
        const index = at + 1;
        return (
          <div className="moreless-editor-pair" role="group" aria-label={t('morelessPairN', { index })} key={pair.id}>
            <div className="moreless-editor-head">
              <span className="letter">{index}</span>
              <input
                className="moreless-editor-input"
                aria-label={t('morelessPrompt')}
                placeholder={t('morelessPromptPlaceholder')}
                value={pair.prompt}
                maxLength={LIMITS.moreLessPrompt}
                onChange={(event) => setPair(pair.id, { prompt: event.target.value })}
              />
              <button type="button" className="row-button" aria-label={t('moreLessPairUp', { index })} disabled={at === 0} onClick={() => move(at, at - 1)}>
                ↑
              </button>
              <button type="button" className="row-button" aria-label={t('moreLessPairDown', { index })} disabled={at === pairs.length - 1} onClick={() => move(at, at + 1)}>
                ↓
              </button>
              <button
                type="button"
                className="row-button"
                aria-label={t('removeMoreLessPair', { index })}
                disabled={pairs.length <= LIMITS.minMoreLessPairs}
                onClick={() => setPairs(pairs.filter((other) => other.id !== pair.id))}
              >
                ×
              </button>
            </div>
            <div className="moreless-editor-sides">
              {SIDES.map((side) => (
                <div className="moreless-editor-side" key={side}>
                  <input
                    className="moreless-editor-input"
                    aria-label={t(side === 'a' ? 'morelessOptionA' : 'morelessOptionB')}
                    placeholder={t(side === 'a' ? 'morelessOptionA' : 'morelessOptionB')}
                    value={pair[side].text}
                    maxLength={LIMITS.moreLessOption}
                    onChange={(event) => setPair(pair.id, { [side]: { ...pair[side], text: event.target.value } })}
                  />
                  <input
                    className="moreless-editor-input"
                    aria-label={t('morelessValue')}
                    placeholder={t('morelessValuePlaceholder')}
                    value={pair[side].value}
                    maxLength={LIMITS.moreLessValue}
                    onChange={(event) => setPair(pair.id, { [side]: { ...pair[side], value: event.target.value } })}
                  />
                  <label className="check">
                    <input type="radio" name={`moreless-correct-${pair.id}`} checked={pair.correct === side} onChange={() => setPair(pair.id, { correct: side })} />
                    <span>{t('morelessCorrect')}</span>
                  </label>
                </div>
              ))}
            </div>
            {/* Однакові значення — неоднозначне порівняння; лише попередження: «рівно» буває задумом ведучого. */}
            {pair.a.value.trim() !== '' && answerKey(pair.a.value) === answerKey(pair.b.value) && <p className="meta powers-warn">{t('morelessTieWarn')}</p>}
            <NumberField label={t('morelessPoints')} value={pair.points} onChange={(points) => setPair(pair.id, { points })} />
          </div>
        );
      })}
      <button type="button" className="btn btn-dashed" disabled={pairs.length >= LIMITS.maxMoreLessPairs} onClick={add}>
        {t('addMoreLessPair')}
      </button>
      <NumberField label={t('morelessStep')} value={step ?? Number.NaN} onChange={setStep} />
      <p className="meta">{t('morelessStepHint')}</p>
      <button type="button" className="btn" onClick={() => setPairs(pairs.map((pair) => ({ ...pair, points: pairs[0].points })), { step: undefined })}>
        {t('morelessSameAll')}
      </button>
      <p className="meta">{t('morelessTotal', { points: Number.isFinite(total) ? total : '—' })}</p>
      <p className="meta">{t('morelessHint')}</p>
    </>
  );
}
