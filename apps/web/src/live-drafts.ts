import type { Choice, DraftValue, HostDrafts, LiveDraft, PublicQuestion, Question } from '@quiz/shared';
import { answerText, choicesOf, num, pairTexts, shownChoices, sliderValueText } from './format';
import { countText, t } from './i18n';

const NONE: Record<string, LiveDraft> = {};

/** Пакет для поточного зрізу: id рядка → живий вибір; інший questionIndex чи trial — порожньо. */
export function draftsById(batch: HostDrafts | null, questionIndex: number, trial: boolean): Record<string, LiveDraft> {
  if (batch === null || batch.questionIndex !== questionIndex || batch.trial !== trial || batch.drafts.length === 0) return NONE;
  return Object.fromEntries(batch.drafts.map((draft) => [draft.id, draft]));
}

/** Назви варіантів: за показом (публічне запитання), а без нього — з самого запитання. */
function namesOf(correct: Question | null, question: PublicQuestion | null): Choice[] {
  return question !== null ? shownChoices(question) : choicesOf(correct);
}

/**
 * «вибирає Юпітер», «позначає Кит, Дельфін», «друкує «Осака»», «порядок: …», «з'єднав: …», «повзунок: 7 см»,
 * «ставить точку», «виділено: …», «пише вигадку «…»», «друкує: …» (хмара, «100 до 1»). Тексти варіантів — як answerText.
 */
export function draftText(draft: DraftValue, correct: Question | null, question: PublicQuestion | null): string {
  const name = (id: string) => namesOf(correct, question).find((choice) => choice.id === id)?.text ?? id;
  switch (draft.type) {
    case 'single':
    case 'poll':
      return t('draftPicks', { text: name(draft.optionId) });
    case 'boolean':
      return t('draftPicks', { text: answerText(draft, null) });
    case 'multi':
      return t('draftMarks', { list: draft.optionIds.map(name).join(', ') });
    case 'text':
    case 'clues':
      return t('draftTypes', { text: draft.value });
    case 'numeric':
      return t('draftTypes', { text: num(draft.value) });
    case 'chainWord':
      return t('draftTypes', { text: draft.word });
    case 'order':
      return t('draftOrder', { list: draft.itemIds.map(name).join(' → ') });
    case 'match':
      return t('draftPairs', { list: pairTexts(draft.links, namesOf(correct, question)).map((pair) => `${pair.left} → ${pair.right}`).join(', ') });
    case 'slider': {
      const scale = correct?.type === 'slider' ? { step: correct.step, unit: correct.unit ?? '' } : question?.slider;
      return t('draftSlider', { value: scale == null ? num(draft.value) : sliderValueText(draft.value, scale) });
    }
    case 'pin':
      return t('draftPin');
    case 'wallPick': {
      const tiles = question?.wall?.tiles ?? [];
      return t('draftWall', { list: draft.tiles.map((position) => tiles[position] ?? String(position + 1)).join(', ') });
    }
    case 'lie':
      return t('draftLie', { text: draft.text });
    case 'survey':
      return t('draftWords', { list: draft.values.filter((value) => value.trim() !== '').join(', ') });
    case 'wordcloud':
      return t('draftWords', { list: draft.words.join(', ') });
  }
}

/** «змінював 2 рази» (лише changes ≥ 1) і «думає 12 с» (now — час сервера). */
export function draftMeta(draft: LiveDraft, now: number): string[] {
  const thinking = t('draftThinking', { seconds: Math.max(0, Math.floor((now - draft.at) / 1000)) });
  return draft.changes >= 1 ? [countText('draftChanges', draft.changes, { count: draft.changes }), thinking] : [thinking];
}
