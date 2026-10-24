import { LIMITS, type Question } from '@quiz/shared';
import { t } from '../i18n';
import { NumberField, Rows } from './QuestionEditor';

type Bluff = Extract<Question, { type: 'bluff' }>;

/**
 * Блеф: правда (перше написання — текст варіанта) з іншими написаннями, 2–3 запасні вигадки й час вибору.
 * Час вигадок — загальне поле часу запитання, його підписує QuestionEditor.
 */
export function BluffEditor({ question, onChange }: { question: Bluff; onChange: (q: Question) => void }) {
  const { accepted, lies } = question;
  const [truth = '', ...others] = accepted;

  const setLie = (index: number, text: string) => onChange({ ...question, lies: lies.map((lie, i) => (i === index ? text : lie)) });

  return (
    <>
      <p className="meta">{t('bluffFactHint')}</p>
      <label className="field compact">
        <span>{t('bluffTruth')}</span>
        <input value={truth} maxLength={LIMITS.bluffLie} onChange={(event) => onChange({ ...question, accepted: [event.target.value, ...others] })} />
      </label>
      <div role="group" aria-label={t('bluffOtherSpellings')}>
        <Rows
          rows={others.map((text, at) => ({ id: String(at), text }))}
          min={0}
          max={LIMITS.maxAccepted - 1}
          maxLength={LIMITS.answerText}
          label="spellingN"
          removeLabel="removeSpelling"
          addLabel="addSpelling"
          rowClass={() => 'is-correct'}
          makeRow={() => ({ id: String(others.length), text: '' })}
          onChange={(next) => onChange({ ...question, accepted: [truth, ...next.map((row) => row.text)] })}
        />
      </div>
      <p className="meta">{t('bluffTruthHint')}</p>

      <div className="bluff-spares">
        {lies.map((lie, index) => (
          <div className="bluff-spare" key={index}>
            <label className="field compact">
              <span className="sr-only">{t('bluffSpareN', { index: index + 1 })}</span>
              <input
                placeholder={t('bluffSpareN', { index: index + 1 })}
                value={lie}
                maxLength={LIMITS.bluffLie}
                onChange={(event) => setLie(index, event.target.value)}
              />
            </label>
            {lies.length > LIMITS.minBluffSpares && (
              <button
                type="button"
                className="row-button"
                aria-label={t('bluffRemoveSpare', { index: index + 1 })}
                onClick={() => onChange({ ...question, lies: lies.filter((_, i) => i !== index) })}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {lies.length < LIMITS.maxBluffSpares && (
          <button type="button" className="btn btn-dashed" onClick={() => onChange({ ...question, lies: [...lies, ''] })}>
            {t('bluffAddSpare')}
          </button>
        )}
      </div>
      <p className="meta">{t('bluffSpareHint')}</p>

      <NumberField label={t('bluffChoiceTime')} value={question.choiceTime} onChange={(choiceTime) => onChange({ ...question, choiceTime })} />
      <p className="meta">{t('bluffPointsHint')}</p>
    </>
  );
}
