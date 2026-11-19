/** Префікс id згенерованого запитання раунду «Правда про гравця» (28b): `truth-<номер у колоді>`, непрозорий — не id автора. */
export const TRUTH_QUESTION_PREFIX = 'truth-';

/** Факт про себе: пробіли й переноси зведено до одного пробілу, краї обрізано (довжину міряє рушій). */
export function truthText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Префікс id вигадки ведучого (52): `fake-1`, `fake-2`, …; id людей — UUID, тож не перетинаються. */
export const TRUTH_FAKE_PREFIX = 'fake-';
/** id варіанта «Вигадка» в кожному запитанні раунду з вигадками (52); не id вигадки. */
export const TRUTH_FAKE_OPTION = 'fake';
/** Текст варіанта «Вигадка» в стані й журналі; веб показує перекладений за id. */
export const TRUTH_FAKE_TEXT = 'Вигадка';

/** Це id вигадки ведучого (запис колоди), а не людини й не варіанта «Вигадка». */
export function isTruthFake(id: string): boolean {
  return id.startsWith(TRUTH_FAKE_PREFIX) && id.length > TRUTH_FAKE_PREFIX.length;
}
