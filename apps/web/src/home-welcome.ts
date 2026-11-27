/**
 * Чи акаунт справді новий (78): жодної своєї вікторини, жодної проведеної й жодної зіграної гри.
 * null — збій запиту: тоді нічого не відомо, і картки «З чого почати» не показуємо.
 */
export function isNewAccount(quizzes: readonly unknown[] | null, hosted: readonly unknown[] | null, played: readonly unknown[] | null): boolean {
  return quizzes !== null && hosted !== null && played !== null && quizzes.length === 0 && hosted.length === 0 && played.length === 0;
}
