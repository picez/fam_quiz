import { PUSH_INVITE_GAP_DAYS } from '@quiz/shared';

export const PUSH_INVITE_KEY = 'quiz:push-invite-at';
const DAY_MS = 86_400_000;

/** Пора показати запрошення: запису немає, він зіпсований, чи від останнього показу минуло ≥ PUSH_INVITE_GAP_DAYS днів. */
export function inviteDue(now: number, storage: Pick<Storage, 'getItem'>): boolean {
  try {
    const at = Number(storage.getItem(PUSH_INVITE_KEY));
    if (!Number.isFinite(at) || at <= 0 || at > now) return true;
    return now - at >= PUSH_INVITE_GAP_DAYS * DAY_MS;
  } catch {
    return true;
  }
}

/** Записує мить показу: наступні ігри мають два тижні тиші, навіть якщо людина не натиснула нічого. */
export function rememberInvite(now: number, storage: Pick<Storage, 'setItem'>): void {
  try {
    storage.setItem(PUSH_INVITE_KEY, String(now));
  } catch {
    // сховище недоступне — запрошення просто може з'явитися частіше
  }
}
