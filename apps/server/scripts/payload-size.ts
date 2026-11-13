/**
 * Вимір ваги зрізів стану (30c): для «Великого шкільного марафону» (mega) і N гравців проходить гру рушієм без сервера
 * та друкує для кожної пари «тип раунду / етап» середній сирий розмір зрізу ведучого, сцени й телефона, розмір одного
 * кадру після deflate і розмір НАСТУПНОГО кадру в спільному потоці (контекст між кадрами, як permessage-deflate у ws).
 * Наприкінці — трафік «однієї відповіді» у кімнаті з N гравцями.
 *
 * Запуск: pnpm --filter @quiz/server exec tsx scripts/payload-size.ts
 */
import { constants, createDeflateRaw, deflateRawSync } from 'node:zlib';
import { addPlayer, createGame, hostView, next, playerView, start, stageView, tick, type GameState } from '@quiz/engine';
import { megaQuiz } from './mega-quiz';

const MAX_STEPS = 300;
const ROLES = ['host', 'stage', 'player'] as const;
type Role = (typeof ROLES)[number];
type Sizes = { raw: number; one: number; next: number };

const kb = (n: number) => (n / 1024).toFixed(1).padStart(6);
const bytes = (view: unknown) => Buffer.byteLength(JSON.stringify(view));
const deflated = (view: unknown) => deflateRawSync(Buffer.from(JSON.stringify(view))).length;

/** Розмір другого кадру в спільному потоці після першого (контекст deflate). */
const followUp = async (first: unknown, second: unknown): Promise<number> => {
  const stream = createDeflateRaw();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const write = (view: unknown) =>
    new Promise<number>((resolve) => {
      chunks.length = 0;
      stream.write(Buffer.from(JSON.stringify(view)));
      stream.flush(constants.Z_SYNC_FLUSH, () => resolve(chunks.reduce((sum, chunk) => sum + chunk.length, 0)));
    });
  await write(first);
  return write(second);
};

const measure = async (view: { answeredCount?: number }): Promise<Sizes> => {
  const bumped = { ...view, answeredCount: (view.answeredCount ?? 0) + 1 };
  return { raw: bytes(view), one: deflated(view), next: await followUp(view, bumped) };
};

const run = async (players: number) => {
  const quiz = megaQuiz((key) => `/uploads/${key}.jpg`);
  let state: GameState = createGame(quiz);
  for (let i = 0; i < players; i++) {
    const added = addPlayer(state, { id: `p${i}`, nickname: `Гравець ${i}` });
    if (added.ok) state = added.state;
  }
  let now = 1_000_000;
  const started = start(state, now);
  if (!started.ok) throw new Error(`start failed: ${started.error}`);
  state = started.state;

  const rng = Math.random;
  const table = new Map<string, Record<Role, Sizes[]>>();
  for (let step = 0; step < MAX_STEPS && state.phase !== 'finished'; step++) {
    const round = state.quiz.rounds[state.roundIndex]?.type ?? '-';
    const key = `${round}/${state.phase}`;
    const views = { host: hostView(state), stage: stageView(state), player: playerView(state, 'p0', now) };
    const row = table.get(key) ?? { host: [], stage: [], player: [] };
    for (const role of ROLES) if (views[role] !== null) row[role].push(await measure(views[role] as { answeredCount?: number }));
    table.set(key, row);
    if (state.phase === 'board') break;
    now += 60_000;
    state = tick(state, now, rng);
    const advanced = next(state, now, rng);
    if (advanced.ok) state = advanced.state;
  }

  const mean = (list: Sizes[], field: keyof Sizes) => (list.length === 0 ? 0 : list.reduce((sum, s) => sum + s[field], 0) / list.length);
  console.log(`\n=== N = ${players} gamers (KB; raw / deflate one frame / next frame in stream) ===`);
  for (const [key, row] of table) {
    const cells = ROLES.map((role) => `${role} ${kb(mean(row[role], 'raw'))}/${kb(mean(row[role], 'one'))}/${kb(mean(row[role], 'next'))}`);
    console.log(`${key.padEnd(24)} n=${String(row.host.length).padStart(3)}  ${cells.join('  ')}`);
  }

  const q = [...table].find(([key]) => key === 'classic/question');
  if (q !== undefined) {
    const total = (field: keyof Sizes) => players * mean(q[1].player, field) + mean(q[1].host, field) + mean(q[1].stage, field);
    console.log(`one answer in a room of ${players}: raw ${kb(total('raw'))} KB, one frame ${kb(total('one'))} KB, next frame ${kb(total('next'))} KB`);
  }
};

(async () => {
  for (const players of [8, 30]) await run(players);
})();
