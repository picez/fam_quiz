/**
 * Перевірка «Касети й DVD»: npx tsx apps/server/scripts/movies90/check.ts [--net]
 * Схема, таймери ≥ 20 с (і вікно бліцу, і дуелі), ціни поля 100–300, 35–45 запитань, «Ва-банк» дорожчає, заборонені корені,
 * відповідь не стоїть у тексті запитання чи підказці, баланс «так/ні», повтори з іншими вікторинами.
 * З --net ще й перевіряє, що відео/аудіо YouTube вбудовуються (oEmbed 200), а картинки Вікімедіа віддаються як JPEG/PNG.
 */
import { allSpares, questionsOf, quizSchema, roundTrials, type Question, type Quiz } from '@quiz/shared';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MOVIES90_IMAGES, MOVIES90_THEMES, movies90Quiz, movies90ThemeOf } from '../movies90-quiz';

const used = new Set<string>();
const quiz: Quiz = movies90Quiz((key) => {
  if (!(key in MOVIES90_IMAGES)) throw new Error(`img('${key}') is not in MOVIES90_IMAGES`);
  used.add(key);
  return `/uploads/${key.replace(/[^a-z0-9]/gi, '').toLowerCase().padEnd(16, '0')}.jpg`;
});
const problems: string[] = [];
const short = (q: Question) => `«${q.text.slice(0, 60)}»`;

const parsed = quizSchema.safeParse(quiz);
if (!parsed.success) for (const i of parsed.error.issues) problems.push(`schema ${i.path.join('.')}: ${i.message}`);

const played = [...questionsOf(quiz), ...quiz.rounds.flatMap(roundTrials)];
const everything = [...played, ...allSpares(quiz)];

// Розмір швидкої гри.
if (played.length < 35 || played.length > 45) problems.push(`played ${played.length}: a quick game needs 35–45 questions`);

// Таймери.
for (const q of everything) if (q.timeLimit < 20) problems.push(`${short(q)}: timeLimit ${q.timeLimit} < 20`);
for (const r of quiz.rounds) if (r.type === 'blitz' && (r.answerWindow ?? 0) < 20) problems.push(`blitz answerWindow ${r.answerWindow} < 20`);
if ((quiz.duels?.timeLimit ?? 0) < 20) problems.push(`duel timeLimit ${quiz.duels?.timeLimit} < 20`);

// Ціни.
for (const r of quiz.rounds) {
  if (r.type === 'board')
    for (const c of r.categories) {
      const pts = c.cells.map((x) => x.question.points).join(',');
      if (pts !== '100,200,300') problems.push(`board ${c.title}: points ${pts}`);
      if (c.cells.filter((x) => x.mark !== 'none').length !== 1) problems.push(`board ${c.title}: expected exactly one ×2/×3`);
    }
  if (r.type === 'wipeout') {
    const pts = r.questions.map((q) => q.points);
    if (pts.some((p, i) => i > 0 && p < pts[i - 1])) problems.push(`wipeout prices not ascending: ${pts}`);
  }
  if (r.type === 'ladder') for (const q of r.questions) if (q.type !== 'single' || q.options.length !== 4) problems.push(`ladder ${short(q)}: needs single with 4 options`);
}

// Заборонені корені.
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'менделєєв', 'пажитнов', 'тетріс',
  'чайковськ', 'russia', 'moscow', 'soviet', 'ussr', 'kremlin', 'tetris',
];
const blob = JSON.stringify(quiz);
for (const b of BANNED) if (new RegExp(`(?<!\\p{L})${b}`, 'iu').test(blob)) problems.push(`banned root ${b}`);

// Відповідь у тексті запитання чи підказці.
const norm = (s: string) => s.toLocaleLowerCase('uk').replace(/[«»"’'.,!?]/g, '').trim();
const answersOf = (q: Question): string[] => {
  switch (q.type) {
    case 'single':
      return [q.options.find((o) => o.id === q.correctId)?.text ?? ''];
    case 'multi':
      return q.options.filter((o) => q.correctIds.includes(o.id)).map((o) => o.text);
    case 'text':
    case 'clues':
    case 'bluff':
      return q.accepted;
    default:
      return [];
  }
};
for (const q of everything) {
  const where = norm([q.text, q.hint ?? '', q.type === 'clues' ? q.clues.join(' ') : ''].join(' '));
  for (const a of answersOf(q)) {
    const n = norm(a);
    if (n.length >= 3 && where.includes(n)) problems.push(`${short(q)}: answer «${a}» appears in the question`);
  }
}
for (const c of quiz.duels?.categories ?? []) for (const d of c.questions) for (const a of d.accepted) if (norm(a).length >= 3 && norm(d.text).includes(norm(a))) problems.push(`duel «${d.text}»: answer in text`);

// Так/ні.
const bools = everything.flatMap((q) => (q.type === 'boolean' ? [q.correct] : []));
const no = bools.filter((b) => !b).length;
if (no < Math.floor(bools.length * 0.4) || no > Math.ceil(bools.length * 0.6)) problems.push(`yes/no balance: ${bools.length - no} yes, ${no} no`);

// Повтори.
const ids = everything.map((q) => q.id);
if (new Set(ids).size !== ids.length) problems.push('duplicate ids');
const texts = everything.map((q) => q.text);
texts.forEach((x, i) => texts.indexOf(x) !== i && problems.push(`duplicate text «${x.slice(0, 60)}»`));
const dir = join(import.meta.dirname, '..');
const others = readdirSync(dir)
  .filter((f) => f.endsWith('-quiz.ts') && f !== 'movies90-quiz.ts')
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .concat(readdirSync(join(dir, 'evening')).map((f) => readFileSync(join(dir, 'evening', f), 'utf8')))
  .join('\n');
for (const x of texts) if (others.includes(x)) problems.push(`«${x.slice(0, 60)}» exists in another quiz`);

// Картинки.
for (const key of Object.keys(MOVIES90_IMAGES)) if (!used.has(key)) problems.push(`MOVIES90_IMAGES.${key} is never used`);

// Мережа.
if (process.argv.includes('--net')) {
  const UA = { 'user-agent': 'fam-quiz-seed/1.0 (demo content)' };
  const yt = [...new Set(everything.flatMap((q) => [q.video?.id, q.audio?.source === 'youtube' ? q.audio.id : undefined]).filter((x): x is string => !!x))];
  for (const id of yt) {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (!r.ok) problems.push(`YouTube ${id}: oEmbed ${r.status}`);
    else {
      const meta = (await r.json()) as { title: string; author_name: string };
      console.log(`YouTube ${id}: ${meta.title} — ${meta.author_name}`);
    }
  }
  for (const [key, title] of Object.entries(MOVIES90_IMAGES)) {
    const api = title.startsWith('File:')
      ? `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url&iiurlwidth=1280&format=json&titles=${encodeURIComponent(title)}`
      : `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&pithumbsize=1280&format=json&redirects=1&titles=${encodeURIComponent(title)}`;
    const body = (await (await fetch(api, { headers: UA })).json()) as { query: { pages: Record<string, { thumbnail?: { source: string; width: number }; imageinfo?: { thumburl?: string; thumbwidth?: number }[] }> } };
    const page = Object.values(body.query.pages)[0];
    const source = page?.thumbnail?.source ?? page?.imageinfo?.[0]?.thumburl;
    if (!source) {
      problems.push(`image ${key}: no source`);
      continue;
    }
    const r = await fetch(source, { headers: UA });
    const type = r.headers.get('content-type') ?? '';
    const size = (await r.arrayBuffer()).byteLength;
    if (!r.ok || !/image\/(jpeg|png|webp)/.test(type)) problems.push(`image ${key}: ${r.status} ${type}`);
    else console.log(`image ${key}: ${type}, ${Math.round(size / 1024)} KB, ${page?.thumbnail?.width ?? page?.imageinfo?.[0]?.thumbwidth} px wide`);
  }
}

// Звіт.
const byTheme = new Map<string, Map<string, number>>();
for (const q of played) {
  const th = movies90ThemeOf(q.id) ?? '?';
  const m = byTheme.get(th) ?? new Map<string, number>();
  m.set(q.type, (m.get(q.type) ?? 0) + 1);
  byTheme.set(th, m);
}
for (const th of Object.keys(MOVIES90_THEMES)) {
  const m = byTheme.get(th) ?? new Map();
  console.log(`${th}: ${[...m.values()].reduce((a, b) => a + b, 0)} — ${[...m].map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
const types = new Map<string, number>();
for (const q of played) types.set(q.type, (types.get(q.type) ?? 0) + 1);
console.log(`played ${played.length}, spares ${allSpares(quiz).length}; types: ${[...types].map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`media: images ${played.filter((q) => q.imageUrl).length}, video ${played.filter((q) => q.video).length}, audio ${played.filter((q) => q.audio).length}`);
console.log(`yes/no: ${bools.length - no} yes, ${no} no`);
for (const r of quiz.rounds) if (r.type === 'board') for (const c of r.categories) console.log(`board ${c.title}: ${c.cells.map((x) => `${x.question.points}${x.mark === 'none' ? '' : x.mark}${x.kind === 'blitz' ? ' бліц' : ''}${x.answerMode === 'voice' ? ' вголос' : ''}`).join(' | ')}`);
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'OK');
process.exit(problems.length ? 1 : 0);
