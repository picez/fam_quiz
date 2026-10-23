import type { Answer, Choice, PublicQuestion, Question, RevealStats, Spotlight } from '@quiz/shared';
import { LETTERS, choiceLabel, correctPairs, pairTexts, pickedText, shownChoices } from '../format';
import { t } from '../i18n';
import { ChoiceFace, choicesClass } from './ChoiceFace';
import { MatchColumns, PairList } from './MatchView';

interface Props {
  question: PublicQuestion;
  spotlight: Spotlight | null;
  /** Правильна відповідь; не null лише на розкритті. */
  reveal: Question | null;
  /** Лічильники виборів на розкритті (сцена). */
  stats?: RevealStats | null;
  /** Вердикт щойно з'явився: колір відповіді мигає. */
  blink?: boolean;
  /** Відповідь уголос: замість місця для тексту — «Гравець відповідає вголос». */
  voice?: boolean;
  /** Місце для текстової чи числової відповіді; гравцеві, що відповідає вголос сам, воно ні до чого. */
  placeholder?: boolean;
  /** Ведучий на усній клітинці: варіанти single/multi/boolean стають кнопками позначки. */
  onName?: (answer: Answer | null) => void;
  /** 50/50 на клітинці поля: прибрані варіанти закреслені з позначкою «прибрано» (лише показ). */
  removed?: string[];
}

const NONE: string[] = [];

/** Колір відповіді гравця: помаранчевий, поки ведучий не вирішив, потім зелений або червоний. */
function toneOf(spotlight: Spotlight): string {
  if (spotlight.grade === null) return 'is-pending';
  return spotlight.grade === 'correct' ? 'is-correct' : 'is-wrong';
}

/** Запитання для тих, хто не відповідає: варіанти лише для показу з кольором відповіді гравця. */
export function SpotlightChoices({ question, spotlight, reveal, stats = null, blink = false, voice = false, placeholder = true, onName, removed = NONE }: Props) {
  const answer = spotlight?.answer ?? null;
  const blinking = blink && spotlight !== null && spotlight.grade !== null ? ' is-blinking' : '';
  const tone = spotlight === null ? '' : `${toneOf(spotlight)}${blinking}`;
  // Вибраний варіант мигає й тоді, коли на розкритті він зелений як правильний.
  const colorFor = (correct: boolean, picked: boolean) => (correct ? `is-correct${picked ? blinking : ''}` : picked ? tone : '');
  // Усна відповідь з оцінкою, але без позначки ведучого: видно лише вердикт.
  const verdictAlone =
    voice && spotlight !== null && answer === null && spotlight.grade !== null ? (
      <p className={`spotlight-answer ${tone}`}>{t(spotlight.grade === 'correct' ? 'judgeCorrect' : 'judgeWrong')}</p>
    ) : null;

  if (question.type === 'single' || question.type === 'multi') {
    const correctIds = reveal === null ? [] : reveal.type === 'single' ? [reveal.correctId] : reveal.type === 'multi' ? reveal.correctIds : [];
    const pickedIds = answer?.type === 'single' ? [answer.optionId] : answer?.type === 'multi' ? answer.optionIds : [];
    const colorOf = (id: string) => colorFor(correctIds.includes(id), pickedIds.includes(id));
    const classOf = (id: string) => ['choice', colorOf(id), removed.includes(id) ? 'is-removed' : ''].filter(Boolean).join(' ');
    const tag = (id: string) => removed.includes(id) && <span className="removed-tag">{t('removedTag')}</span>;
    // Прибраний варіант читач екрана називає «Львів — прибрано» і як недоступний.
    const a11y = (choice: Choice, index: number) =>
      removed.includes(choice.id) ? { 'aria-label': t('choiceRemoved', { choice: choiceLabel(choice, index) }), 'aria-disabled': true } : {};
    if (onName !== undefined) {
      const tap = (id: string) => {
        if (question.type === 'single') return onName(pickedIds.includes(id) ? null : { type: 'single', optionId: id });
        const next = pickedIds.includes(id) ? pickedIds.filter((picked) => picked !== id) : [...pickedIds, id];
        onName(next.length === 0 ? null : { type: 'multi', optionIds: question.choices.map((c) => c.id).filter((c) => next.includes(c)) });
      };
      return (
        <div className={choicesClass(question.choices)}>
          {question.choices.map((choice, index) => (
            <button
              key={choice.id}
              type="button"
              className={classOf(choice.id)}
              aria-pressed={pickedIds.includes(choice.id)}
              disabled={removed.includes(choice.id)}
              {...a11y(choice, index)}
              onClick={() => tap(choice.id)}
            >
              <ChoiceFace choice={choice} letter={LETTERS[index]} />
              {tag(choice.id)}
            </button>
          ))}
        </div>
      );
    }
    return (
      <>
        <ul className={choicesClass(question.choices)}>
          {question.choices.map((choice, index) => (
            <li key={choice.id} className={classOf(choice.id)} {...a11y(choice, index)}>
              <ChoiceFace choice={choice} letter={LETTERS[index]} />
              {tag(choice.id)}
              {stats !== null && <span className="count">{stats.counts[choice.id] ?? 0}</span>}
            </li>
          ))}
        </ul>
        {verdictAlone}
      </>
    );
  }

  if (question.type === 'boolean') {
    const correct = reveal?.type === 'boolean' ? reveal.correct : null;
    const picked = answer?.type === 'boolean' ? answer.value : null;
    const colorOf = (value: boolean) => colorFor(correct === value, picked === value);
    if (onName !== undefined) {
      return (
        <div className="choices">
          {[true, false].map((value) => (
            <button
              key={String(value)}
              type="button"
              className={`choice ${colorOf(value)}`.trim()}
              aria-pressed={picked === value}
              onClick={() => onName(picked === value ? null : { type: 'boolean', value })}
            >
              <span>{t(value ? 'yes' : 'no')}</span>
            </button>
          ))}
        </div>
      );
    }
    return (
      <>
        <ul className="choices">
          {[true, false].map((value) => (
            <li key={String(value)} className={`choice ${colorOf(value)}`.trim()}>
              <span>{t(value ? 'yes' : 'no')}</span>
              {stats !== null && <span className="count">{stats.counts[String(value)] ?? 0}</span>}
            </li>
          ))}
        </ul>
        {verdictAlone}
      </>
    );
  }

  if (question.type === 'match') {
    const mine = answer?.type === 'match' ? pairTexts(answer.links, shownChoices(question)) : [];
    if (reveal === null) {
      return mine.length === 0 ? <MatchColumns left={question.choices} right={question.right} /> : <PairList pairs={mine} tone={tone} />;
    }
    return (
      <div className="match-reveal">
        {mine.length > 0 && spotlight?.grade !== 'correct' && <PairList pairs={mine} tone={tone} />}
        <h2 className="match-heading">{t('correctPairs')}</h2>
        <PairList pairs={correctPairs(reveal)} tone="is-correct" />
      </div>
    );
  }

  if (verdictAlone !== null) return verdictAlone;
  if (answer === null) {
    if (question.type === 'order') {
      const labels = question.orderLabels;
      return (
        <>
          {labels !== null && labels.top !== '' && <p className="order-label is-top">↑ {labels.top}</p>}
          <ol className="order">
            {question.choices.map((choice, index) => (
              <li key={choice.id}>
                <span className="letter">{index + 1}</span>
                <span className="order-text">{choice.text}</span>
              </li>
            ))}
          </ol>
          {labels !== null && labels.bottom !== '' && <p className="order-label is-bottom">↓ {labels.bottom}</p>}
        </>
      );
    }
    // Місце для відповіді словами чи числом; на розкритті його вже не треба.
    if ((question.type !== 'text' && question.type !== 'numeric') || reveal !== null || !placeholder) return <></>;
    const wait = voice ? 'spotlightVoice' : question.type === 'numeric' ? 'spotlightWaitNumber' : 'spotlightWaitText';
    return <p className="spotlight-answer is-waiting">{t(wait)}</p>;
  }
  return <p className={`spotlight-answer ${tone}`.trim()}>{pickedText(answer, question.choices)}</p>;
}
