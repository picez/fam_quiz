/**
 * «Торкнутість» полів (74): червоне з'являється лише після того, як автор змінив поле й вийшов із нього
 * (або спробував зберегти) — на щойно створеному порожньому запитанні червоного немає.
 */
export interface TouchedState {
  /** Після спроби зберегти торкнуте все. */
  all: boolean;
  /** Змінено, але фокус ще не покинув. */
  pending: ReadonlySet<string>;
  /** Змінено й покинуто. */
  done: ReadonlySet<string>;
}

export type TouchAction = { type: 'edit'; key: string } | { type: 'leave'; key: string } | { type: 'all' };

export const UNTOUCHED: TouchedState = { all: false, pending: new Set(), done: new Set() };

export function touchReducer(state: TouchedState, action: TouchAction): TouchedState {
  if (action.type === 'all') return state.all ? state : { ...state, all: true };
  const { key } = action;
  if (action.type === 'edit') {
    if (state.all || state.done.has(key) || state.pending.has(key)) return state;
    return { ...state, pending: new Set(state.pending).add(key) };
  }
  if (!state.pending.has(key)) return state;
  const pending = new Set(state.pending);
  pending.delete(key);
  return { ...state, pending, done: new Set(state.done).add(key) };
}

export function isTouched(state: TouchedState, key: string): boolean {
  return state.all || state.done.has(key);
}

export const touchKey = {
  title: 'title' as const,
  general: 'general' as const,
  round: (roundId: string) => `round:${roundId}`,
  question: (questionId: string) => `question:${questionId}`,
};
