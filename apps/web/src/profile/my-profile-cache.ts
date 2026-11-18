import type { OwnProfile } from '@quiz/shared';

/**
 * Останній свій профіль, спільний для підсторінок. Лише в пам'яті (там email, друзі) і лише для одного акаунта:
 * мітка — id із самої відповіді сервера, а не з useAccount, який може відставати. Модуль нічого не імпортує,
 * тож api.ts і useAccount.ts можуть його скидати без циклів.
 */
let shared: OwnProfile | null = null;

/** Забуває останній профіль: вихід і вхід, правка, що змінює вітрину, друзів, квізи чи рахунок, та тести. */
export function forgetMyProfile(): void {
  shared = null;
}

export function rememberMyProfile(data: OwnProfile): void {
  shared = data;
}

/** Закешований профіль, лише якщо він належить саме цьому акаунтові. */
export function cachedMyProfile(accountId: string): OwnProfile | null {
  return shared !== null && shared.id === accountId ? shared : null;
}
