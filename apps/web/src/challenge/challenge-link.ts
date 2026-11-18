/** Посилання на виклик, яке друг відкриває у браузері. */
export function challengeUrl(code: string): string {
  return `${window.location.origin}/challenge/${code}`;
}
