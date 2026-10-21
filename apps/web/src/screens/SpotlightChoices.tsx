import type { PublicQuestion, Question, RevealStats, Spotlight } from '@quiz/shared';
import { LETTERS, correctPairs, pairTexts, pickedText, shownChoices } from '../format';
import { t } from '../i18n';
import { MatchColumns, PairList } from './MatchView';

interface Props {
  question: PublicQuestion;
  spotlight: Spotlight | null;
  /** Правильна відповідь; не null лише на розкритті. */
  reveal: Question | null;
  /** Лічильники виборів на розкритті (сцена). */
  stats?: RevealStats | null;
}

/** Колір відповіді гравця: помаранчевий, поки ведучий не вирішив, потім зелений або червоний. */
function toneOf(spotlight: Spotlight): string {
  if (spotlight.grade === null) return 'is-pending';
  return spotlight.grade === 'correct' ? 'is-correct' : 'is-wrong';
}

/** Запитання для тих, хто не відповідає: варіанти лише для показу з кольором відповіді гравця. */
export function SpotlightChoices({ question, spotlight, reveal, stats = null }: Props) {
  const answer = spotlight?.answer ?? null;
  const tone = spotlight === null ? '' : toneOf(spotlight);

  if (question.type === 'single' || question.type === 'multi') {
    const correctIds = reveal === null ? [] : reveal.type === 'single' ? [reveal.correctId] : reveal.type === 'multi' ? reveal.correctIds : [];
    const pickedIds = answer?.type === 'single' ? [answer.optionId] : answer?.type === 'multi' ? answer.optionIds : [];
    return (
      <ul className="choices">
        {question.choices.map((choice, index) => {
          const color = correctIds.includes(choice.id) ? 'is-correct' : pickedIds.includes(choice.id) ? tone : '';
          return (
            <li key={choice.id} className={`choice ${color}`.trim()}>
              <span className="letter">{LETTERS[index]}</span>
              <span>{choice.text}</span>
              {stats !== null && <span className="count">{stats.counts[choice.id] ?? 0}</span>}
            </li>
          );
        })}
      </ul>
    );
  }

  if (question.type === 'boolean') {
    const correct = reveal?.type === 'boolean' ? reveal.correct : null;
    const picked = answer?.type === 'boolean' ? answer.value : null;
    return (
      <ul className="choices">
        {[true, false].map((value) => {
          const color = correct === value ? 'is-correct' : picked === value ? tone : '';
          return (
            <li key={String(value)} className={`choice ${color}`.trim()}>
              <span>{t(value ? 'yes' : 'no')}</span>
              {stats !== null && <span className="count">{stats.counts[String(value)] ?? 0}</span>}
            </li>
          );
        })}
      </ul>
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

  if (answer === null) return <></>;
  return <p className={`spotlight-answer ${tone}`.trim()}>{pickedText(answer, question.choices)}</p>;
}
