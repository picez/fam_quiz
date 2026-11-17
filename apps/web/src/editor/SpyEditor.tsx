import { LIMITS, answerKey, type Question } from '@quiz/shared';
import { t } from '../i18n';
import { NumberField, Rows } from './QuestionEditor';

type Spy = Extract<Question, { type: 'spy' }>;

/**
 * Шпигун: слово гравців (перше написання) з іншими написаннями для останнього шансу шпигуна, слово шпигуна й час голосування.
 * Час асоціацій — загальне поле часу запитання, текст — загальне завдання; обидва в QuestionEditor.
 */
export function SpyEditor({ question, onChange }: { question: Spy; onChange: (q: Question) => void }) {
  const { accepted, spyWord } = question;
  const [playersWord = '', ...others] = accepted;
  const same = answerKey(spyWord) !== '' && accepted.map(answerKey).includes(answerKey(spyWord));

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

      <label className="field compact">
        <span>{t('spySpyWord')}</span>
        <input value={spyWord} maxLength={LIMITS.thinkWord} onChange={(event) => onChange({ ...question, spyWord: event.target.value })} />
      </label>
      <p className="meta">{t('spySpyWordHint')}</p>
      {same && (
        <p className="meta" role="alert">
          {t('problemSpySame')}
        </p>
      )}

      <NumberField label={t('spyVoteTime')} value={question.voteTime} onChange={(voteTime) => onChange({ ...question, voteTime })} />
      <p className="meta">{t('spyEditorHint')}</p>
    </>
  );
}
