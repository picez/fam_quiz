export type SeedArgs =
  | { mode: 'email'; email: string; seed: string }
  | { mode: 'bot'; seed: string }
  | { mode: 'update'; quizId: string; seed: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Розбирає аргументи seed-demo: «<email> [seed]», «--bot <seed>» або «--update <quizId> <seed>»; хибне — null (друкуємо USAGE). */
export function parseSeedArgs(argv: string[], seeds: readonly string[]): SeedArgs | null {
  // pnpm може передати й сам роздільник «--».
  const args = argv.filter((arg) => arg !== '--');
  const known = (arg: string | undefined): arg is string => arg !== undefined && seeds.includes(arg);
  if (args[0] === '--bot') return known(args[1]) ? { mode: 'bot', seed: args[1] } : null;
  if (args[0] === '--update') {
    const [, quizId, seed] = args;
    return quizId !== undefined && UUID.test(quizId) && known(seed) ? { mode: 'update', quizId, seed } : null;
  }
  const email = args.find((arg) => arg.includes('@'));
  if (email === undefined) return null;
  return { mode: 'email', email, seed: args.find(known) ?? 'demo' };
}
