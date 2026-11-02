/** Тексти сповіщень: єдине джерело. Сервіс-воркер бере їх звідси (без i18n.ts, щоб не тягти весь словник у sw.js), i18n.ts розгортає їх у словник. */
export const pushStrings = {
  pushReminderTitle: 'Скоро гра «{title}»',
  pushReminderBody: 'Початок о {time}. Не запізнюйся!',
  pushOpenedTitle: 'Гра «{title}» почалась',
  pushOpenedBody: 'Ведучий відкрив гру. Торкнися, щоб приєднатися.',
  pushCancelledTitle: 'Гру «{title}» скасовано',
  pushCancelledBody: 'Ведучий скасував гру {when}.',
  pushFallbackTitle: 'Квіз',
  pushFallbackBody: 'Є оновлення щодо запланованої гри.',
} as const;

export type PushStringKey = keyof typeof pushStrings;

export function pushString(key: PushStringKey, vars: Record<string, string> = {}): string {
  return pushStrings[key].replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}
