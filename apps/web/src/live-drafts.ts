import type { Choice, DraftValue, HostDrafts, LiveDraft, PublicQuestion, Question } from '@quiz/shared';
import { answerText, choicesOf, num, pairTexts, shownChoices, sliderValueText } from './format';
import { countText, t, type TextKey } from './i18n';

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

/** Ключ тексту чернетки: для рядка команди — множиною («позначають», «змінювали»), якщо така форма є. */
type PluralKey = 'draftPicks' | 'draftMarks' | 'draftTypes' | 'draftPairs' | 'draftPin' | 'draftLie' | 'draftWords' | 'draftThinking';
const say = (key: PluralKey, team: boolean, vars: Record<string, string | number> = {}) => t((team ? `${key}Team` : key) as TextKey, vars);

/**
 * «вибирає Юпітер», «позначає Кит, Дельфін», «друкує «Осака»», «порядок: …», «з'єднав: …», «повзунок: 7 см»,
 * «ставить точку», «виділено: …», «пише вигадку «…»», «друкує: …» (хмара, «100 до 1»). Тексти варіантів — як answerText.
 * team — рядок команди: дієслова множиною («позначають», «з’єднали»).
 */
export function draftText(draft: DraftValue, correct: Question | null, question: PublicQuestion | null, team = false): string {
  const name = (id: string) => namesOf(correct, question).find((choice) => choice.id === id)?.text ?? id;
  switch (draft.type) {
    case 'single':
    case 'poll':
      return say('draftPicks', team, { text: name(draft.optionId) });
    case 'boolean':
      return say('draftPicks', team, { text: answerText(draft, null) });
    case 'multi':
      return say('draftMarks', team, { list: draft.optionIds.map(name).join(', ') });
    case 'text':
    case 'clues':
      return say('draftTypes', team, { text: draft.value });
    case 'numeric':
      return say('draftTypes', team, { text: num(draft.value) });
    case 'chainWord':
      return say('draftTypes', team, { text: draft.word });
    case 'order':
      return t('draftOrder', { list: draft.itemIds.map(name).join(' → ') });
    case 'match':
      return say('draftPairs', team, { list: pairTexts(draft.links, namesOf(correct, question)).map((pair) => `${pair.left} → ${pair.right}`).join(', ') });
    case 'slider': {
      const scale = correct?.type === 'slider' ? { step: correct.step, unit: correct.unit ?? '' } : question?.slider;
      return t('draftSlider', { value: scale == null ? num(draft.value) : sliderValueText(draft.value, scale) });
    }
    case 'pin':
      return say('draftPin', team);
    case 'wallPick': {
      const tiles = question?.wall?.tiles ?? [];
      return t('draftWall', { list: draft.tiles.map((position) => tiles[position] ?? String(position + 1)).join(', ') });
    }
    case 'lie':
      return say('draftLie', team, { text: draft.text });
    case 'survey':
      return say('draftWords', team, { list: draft.values.filter((value) => value.trim() !== '').join(', ') });
    case 'wordcloud':
      return say('draftWords', team, { list: draft.words.join(', ') });
  }
}

/** «змінював 2 рази» (лише changes ≥ 1) і «думає 12 с» (now — час сервера); team — «змінювали», «думають». */
export function draftMeta(draft: LiveDraft, now: number, team = false): string[] {
  const thinking = say('draftThinking', team, { seconds: Math.max(0, Math.floor((now - draft.at) / 1000)) });
  return draft.changes >= 1 ? [countText(team ? 'draftChangesTeam' : 'draftChanges', draft.changes, { count: draft.changes }), thinking] : [thinking];
}
