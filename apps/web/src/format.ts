import { pinDistance, type Answer, type CellMark, type Choice, type LobbyPlayer, type PublicQuestion, type PublicSlider, type Question, type Round, type RoundInfo } from '@quiz/shared';
import { countText, t, type TextKey } from './i18n';

/** Назва раунду для показу: порожню (за замовчуванням) замінює «Раунд N», а в бліці й полі — «Бліц» та «Ігрове поле». */
export const roundLabel = (title: string, index: number, type?: Round['type']): string => {
  if (title.trim() !== '') return title;
  if (type === 'blitz') return t('blitzLabel');
  if (type === 'final') return t('finalLabel');
  return type === 'board' ? t('boardLabel') : t('roundN', { index: index + 1 });
};

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/** Знаків після коми у кроці: 0.5 → 1, 0.25 → 2, 1 → 0. */
export function stepDecimals(step: number): number {
  const [mantissa = '', exponent] = String(step).split('e-');
  const fraction = (mantissa.split('.')[1] ?? '').length;
  return fraction + (exponent === undefined ? 0 : Number(exponent));
}

/** Число повзунка за правилами uk-UA, знаків після коми — як у кроці. */
export function sliderNumber(value: number, step: number): string {
  const digits = Math.min(stepDecimals(step), 20);
  return value.toLocaleString('uk-UA', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
}

/** Значення повзунка з одиницею: «57 %», «2,5 км». */
export function sliderValueText(value: number, slider: { step: number; unit: string }): string {
  return `${sliderNumber(value, slider.step)}${slider.unit === '' ? '' : ` ${slider.unit}`}`;
}

const yesNo = (value: boolean) => t(value ? 'yes' : 'no');

export interface PairText {
  left: string;
  right: string;
}

/** Текст варіанта або «Картинка Б» за літерою; index — місце у списку, з якого береться літера. */
export function choiceLabel(choice: Choice, index: number): string {
  return choice.text !== '' ? choice.text : t('imageChoice', { letter: LETTERS[index] ?? String(index + 1) });
}

/** Варіанти з підписами замість порожнього тексту картинки. */
const labelled = (choices: Choice[]): Choice[] => choices.map((choice, index) => ({ ...choice, text: choiceLabel(choice, index) }));

/**
 * Варіанти запитання для пошуку назв за id; для match — ліві й праві. Порядок показу тут невідомий,
 * а літера автора може не збігтися з тією, яку бачили гравці, тож варіант-картинка — просто «картинка».
 */
export function choicesOf(question: Question | null): Choice[] {
  if (question === null) return [];
  if (question.type === 'single' || question.type === 'multi' || question.type === 'poll') {
    return question.options.map((option) => ({ ...option, text: optionText(option.text) }));
  }
  if (question.type === 'match') return question.pairs.flatMap((pair) => [pair.left, pair.right]);
  return question.type === 'order' ? question.items : [];
}

/** Усі показані варіанти: choices (варіант-картинка підписаний літерою показу) і right. */
export function shownChoices(question: PublicQuestion): Choice[] {
  return [...labelled(question.choices), ...question.right];
}

/** Зв’язки відповіді словами; невідомий id показується як є. */
export function pairTexts(links: { left: string; right: string }[], choices: Choice[]): PairText[] {
  const name = (id: string) => choices.find((choice) => choice.id === id)?.text ?? id;
  return links.map((link) => ({ left: name(link.left), right: name(link.right) }));
}

/** Правильні пари словами; для інших типів []. */
export function correctPairs(question: Question): PairText[] {
  return question.type === 'match' ? question.pairs.map((pair) => ({ left: pair.left.text, right: pair.right.text })) : [];
}

const pairsLine = (pairs: PairText[]) => pairs.map((pair) => `${pair.left} — ${pair.right}`).join('; ');

/** Клас заголовка запитання: довгий текст набирається дрібніше, щоб варіанти лишались на екрані. */
export function questionClass(text: string): string {
  if (text.length > 220) return 'question is-xlong';
  return text.length > 120 ? 'question is-long' : 'question';
}

/** Варіант без тексту в правильній відповіді: «Б. картинка». */
const optionText = (text: string) => (text === '' ? t('imagePlain') : text);

/**
 * Правильна відповідь словами, для розкриття та пульта.
 * presented — варіанти в порядку показу: літери мають збігатися з тим, що бачать гравці.
 */
export function correctText(question: Question, presented?: { id: string }[]): string {
  switch (question.type) {
    case 'single':
    case 'multi': {
      const correct = question.type === 'single' ? [question.correctId] : question.correctIds;
      const shown = presented === undefined ? question.options.map((option) => option.id) : presented.map((c) => c.id);
      return shown
        .map((id, index) => ({ id, letter: LETTERS[index] }))
        .filter(({ id }) => correct.includes(id))
        .map(({ id, letter }) => `${letter}. ${optionText(question.options.find((option) => option.id === id)?.text ?? id)}`)
        .join(', ');
    }
    case 'boolean':
      return yesNo(question.correct);
    case 'text':
    case 'clues':
      return question.accepted[0];
    case 'wall':
      return t('wallCorrect', { groups: question.groups.map((group) => group.name).join('; ') });
    case 'poll':
    case 'wordcloud':
      return t('pollNoCorrect');
    case 'pin':
      return t(question.map === null ? 'pinCorrectImage' : (`pinCorrect_${question.map}` as TextKey));
    case 'numeric':
      return question.tolerance > 0 ? `${question.correct} (± ${question.tolerance})` : String(question.correct);
    case 'slider': {
      const unit = question.unit === undefined ? '' : ` ${question.unit}`;
      const tolerance = question.tolerance > 0 ? ` (± ${sliderNumber(question.tolerance, question.step)})` : '';
      return `${sliderNumber(question.correct, question.step)}${unit}${tolerance}`;
    }
    case 'order': {
      const labels = orderLabelsText({ top: question.topLabel ?? '', bottom: question.bottomLabel ?? '' });
      return question.items.map((item) => item.text).join(' → ') + (labels === '' ? '' : ` (${labels})`);
    }
    case 'match':
      return pairsLine(correctPairs(question));
    case 'chain':
      return question.words.join(' → ');
    case 'sort':
      return question.categories
        .map((category) => `${category.text}: ${question.words.filter((word) => word.categoryId === category.id).map((word) => word.text).join(', ')}`)
        .join('; ');
  }
}

/** Мілісекунди як секунди з однією цифрою після коми: 23400 → «23,4». */
export function secondsText(ms: number): string {
  return (Math.round(ms / 100) / 10).toFixed(1).replace('.', ',');
}

/**
 * Відповідь гравця словами.
 * presented — варіанти в порядку показу: варіант-картинка підписується літерою, яку бачать гравці.
 */
export function answerText(answer: Answer | null, question: Question | null, presented?: { id: string }[]): string {
  if (answer === null) return '—';
  const choices =
    presented !== undefined && question !== null && (question.type === 'single' || question.type === 'multi')
      ? labelled(presented.flatMap(({ id }) => question.options.filter((option) => option.id === id)))
      : choicesOf(question);
  const name = (id: string) => choices.find((choice) => choice.id === id)?.text ?? id;
  switch (answer.type) {
    case 'single':
    case 'poll':
      return name(answer.optionId);
    case 'wordcloud':
      return answer.words.join(', ');
    case 'wall':
      return answer.found === answer.groups
        ? t('wallAnswerDone', { mistakes: answer.mistakes })
        : t('wallAnswerPart', { found: answer.found, groups: answer.groups, mistakes: answer.mistakes });
    case 'multi':
      return answer.optionIds.map(name).join(', ');
    case 'boolean':
      return yesNo(answer.value);
    case 'text':
    case 'clues':
      return answer.value;
    case 'pin':
      return question?.type === 'pin'
        ? t('pinAnswerAt', { distance: pinDistanceText(question, answer.x, answer.y) })
        : t('pinAnswerBare');
    case 'numeric':
      return String(answer.value);
    case 'slider':
      return question?.type === 'slider'
        ? `${sliderNumber(answer.value, question.step)}${question.unit === undefined ? '' : ` ${question.unit}`}`
        : String(answer.value);
    case 'order':
      return answer.itemIds.map(name).join(' → ');
    case 'match':
      return pairsLine(pairTexts(answer.links, choices));
    case 'chain':
      if (question === null || question.type !== 'chain') return t('chainAnswerBare', { solved: answer.solved });
      return answer.solved === question.words.length - 1
        ? t('chainAnswerDone', { time: secondsText(answer.timeMs), hints: answer.hints })
        : t('chainAnswerPart', { solved: answer.solved, total: question.words.length - 1 });
    case 'sort':
      return answer.timeMs !== null && answer.sorted === answer.total
        ? t('sortAnswerDone', { total: answer.total, time: secondsText(answer.timeMs), misses: answer.misses })
        : t('sortAnswerPart', { sorted: answer.sorted, total: answer.total, misses: answer.misses });
  }
}

const dateFormat = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Дата й час гри словами; порожній рядок, якщо значення не є датою. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}

/** Число зі справжнім мінусом «−», а не дефісом: рахунок може бути від’ємним. */
export function num(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

/** Бали запитання зі знаком: «+750», «−1000». */
export function signed(value: number): string {
  return value > 0 ? `+${value}` : num(value);
}

/** Номер запитання в раунді, скільки лишилося й назва раунду, коли раундів кілька. */
export function questionLabel(round: RoundInfo | null, index: number, total: number): string {
  const board = round?.type === 'board';
  const parts = [t(board ? 'cellOf' : 'questionOf', { index: index + 1, total })];
  if (round?.type !== 'final') {
    const left = total - index - 1;
    parts.push(left > 0 ? t('leftCount', { count: left }) : t(board ? 'lastCell' : 'lastQuestion'));
  }
  if (round !== null && round.total > 1) parts.push(t('roundN', { index: round.index + 1 }));
  return parts.join(' · ');
}

/** Факти заставки: «10 запитань · 30–60 с на кожне»; у фіналі їх немає. */
export function roundFacts(round: RoundInfo, total: number): string | null {
  if (round.type === 'final') return null;
  const board = round.type === 'board';
  const count = countText(board ? 'cellCount' : 'questionCount', total, { count: total });
  const { times } = round;
  const suffix = board ? 'Cell' : '';
  const time =
    times === null
      ? t('noTimer')
      : times.min === times.max
      ? t(`timeEach${suffix}` as TextKey, { seconds: times.min })
      : t(`timeRange${suffix}` as TextKey, { min: times.min, max: times.max });
  return `${count} · ${time}`;
}

/** Серії гравців за id; показуються біля імені від двох правильних відповідей підряд. */
export function streaksOf(players: LobbyPlayer[]): Record<string, number> {
  return Object.fromEntries(players.map((player) => [player.id, player.streak]));
}

/** Позначка клітинки поля: «×2», «×3»; для клітинки без позначки порожньо. */
export function markText(mark: CellMark): string {
  return mark === 'x2' ? '×2' : mark === 'x3' ? '×3' : '';
}

/** «зверху — Найбільший, знизу — Найменший»; порожні підписи пропускаються; обидва порожні — ''. */
export function orderLabelsText(labels: { top: string; bottom: string }): string {
  return [
    labels.top === '' ? '' : t('orderTop', { label: labels.top }),
    labels.bottom === '' ? '' : t('orderBottom', { label: labels.bottom }),
  ]
    .filter((part) => part !== '')
    .join(', ');
}

/** Відповідь словами за показаними варіантами: назви беруться з запитання, яке бачить гравець. */
export function pickedText(answer: Answer, choices: Choice[], slider: PublicSlider | null = null): string {
  const named = labelled(choices);
  const name = (id: string) => named.find((choice) => choice.id === id)?.text ?? id;
  switch (answer.type) {
    case 'single':
      return name(answer.optionId);
    case 'multi':
      return answer.optionIds.map(name).join(', ');
    case 'order':
      return answer.itemIds.map(name).join(' → ');
    case 'match':
      return pairsLine(pairTexts(answer.links, named));
    case 'slider':
      return slider === null ? String(answer.value) : sliderValueText(answer.value, slider);
    default:
      return answerText(answer, null);
  }
}

/** Відстань точки від правильної, % довшої сторони, з одним знаком після коми. */
export function pinDistanceText(question: Parameters<typeof pinDistance>[0], x: number, y: number): string {
  return pinDistance(question, x, y).toLocaleString('uk-UA', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
