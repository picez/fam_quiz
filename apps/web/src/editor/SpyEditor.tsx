import { useId } from 'react';
import { LIMITS, type Question } from '@quiz/shared';
import { t } from '../i18n';
import { spyHintLeaks } from './draft';
import { NumberField, Rows } from './QuestionEditor';

type Spy = Extract<Question, { type: 'spy' }>;

/**
 * Шпигун: загальне слово (перше написання) з іншими написаннями для останнього шансу шпигуна, підказка шпигуну (необов'язкова),
 * старе слово шпигуна (запропонувати як підказку або прибрати) і час голосування.
 * Час асоціацій — загальне поле часу запитання, текст — загальне завдання; обидва в QuestionEditor.
 */
export function SpyEditor({ question, onChange }: { question: Spy; onChange: (q: Question) => void }) {
  const { accepted, spyHint, spyWord } = question;
  const [playersWord = '', ...others] = accepted;
  const hintId = useId();
  const { spyWord: _old, ...withoutOld } = question;
  const hint = spyHint ?? '';

  return (
    <>
      <label className="field compact">
        <span>{t('spyPlayersWord')}</span>
        <input value={playersWord} maxLength={LIMITS.thinkWord} onChange={(event) => onChange({ ...question, accepted: [event.target.value, ...others] })} />
      </label>
      <div role="group" aria-label={t('spyPlayersWord')}>
        <Rows
          rows={others.map((text, at) => ({ id: String(at), text }))}
          min={0}
          max={LIMITS.maxAccepted - 1}
          maxLength={LIMITS.thinkWord}
          label="spellingN"
          removeLabel="removeSpelling"
          addLabel="addSpelling"
          rowClass={() => 'is-correct'}
          makeRow={() => ({ id: String(others.length), text: '' })}
          onChange={(next) => onChange({ ...question, accepted: [playersWord, ...next.map((row) => row.text)] })}
        />
      </div>
      <p className="meta">{t('spyPlayersWordHint')}</p>

      <div className="field compact">
        <label htmlFor={hintId}>{t('spyHintField')}</label>
        <input
          id={hintId}
          value={hint}
          maxLength={LIMITS.spyHint}
          aria-describedby={`${hintId}-meta`}
          onChange={(event) => {
            const { spyHint: _drop, ...rest } = question;
            onChange(event.target.value === '' ? rest : { ...rest, spyHint: event.target.value });
          }}
        />
      </div>
      <p className="meta" id={`${hintId}-meta`}>
        {t('spyHintFieldHint')} {hint.length}/{LIMITS.spyHint}
      </p>
      <p className="meta" role="status" aria-live="polite">
        {spyHintLeaks(question) ? t('spyHintLeak') : ''}
      </p>

      {spyWord !== undefined && spyWord.trim() !== '' && (
        <div className="meta">
          <p>{t('spyLegacyWord', { word: spyWord })}</p>
          {hint === '' && (
            <button type="button" className="ghost" onClick={() => onChange({ ...withoutOld, spyHint: spyWord.trim().slice(0, LIMITS.spyHint) })}>
              {t('spyLegacyToHint')}
            </button>
          )}{' '}
          <button type="button" className="ghost" onClick={() => onChange(withoutOld)}>
            {t('spyLegacyDrop')}
          </button>
        </div>
      )}

      <NumberField label={t('spyVoteTime')} value={question.voteTime} onChange={(voteTime) => onChange({ ...question, voteTime })} />
      <p className="meta">{t('spyEditorHint')}</p>
    </>
  );
}
