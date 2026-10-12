/**
 * Унікальний ідентифікатор для запитання чи варіанта.
 *
 * crypto.randomUUID є лише в «захищеному контексті» (https або localhost). Коли застосунок
 * відкрито за адресою комп'ютера в локальній мережі на звичайному http, його немає,
 * тож там ідентифікатор складається з випадкових байтів, які доступні всюди.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
