/** Тексти сповіщень для сервіс-воркера (без i18n.ts, щоб не тягти весь словник у sw.js). Копія в i18n.ts лишається для застосунку. */
const strings = {
  pushReminderTitle: 'Скоро гра «{title}»',
  pushReminderBody: 'Початок о {time}. Не запізнюйся!',
  pushOpenedTitle: 'Гра «{title}» почалась',
  pushOpenedBody: 'Ведучий відкрив гру. Торкнися, щоб приєднатися.',
  pushCancelledTitle: 'Гру «{title}» скасовано',
  pushCancelledBody: 'Ведучий скасував гру {when}.',
  pushFallbackTitle: 'Квіз',
  pushFallbackBody: 'Є оновлення щодо запланованої гри.',
} as const;

export type PushStringKey = keyof typeof strings;

export function pushString(key: PushStringKey, vars: Record<string, string> = {}): string {
  return strings[key].replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}
