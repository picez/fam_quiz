/**
 * Перевірка частини вікторини автора: npx tsx apps/server/scripts/evening/check.ts <name>
 * Перевіряє схему кожного запитання, таймери ≥ 20 с, заборонені корені, кількості слотів і повтори з іншими вікторинами.
 */
import { boardCellSchema, questionSchema, type Question } from '@quiz/shared';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EveningPart } from './kit';

const name = process.argv[2];
const mod = (await import(`./${name}.ts`)) as { part: (img: (k: string) => string) => EveningPart; IMAGES: Record<string, string> };
const used = new Set<string>();
const p = mod.part((key) => {
  if (!(key in mod.IMAGES)) throw new Error(`img('${key}') is not in IMAGES`);
  used.add(key);
  return `/uploads/${'a'.repeat(16)}.jpg`;
});
const problems: string[] = [];
const BANNED = ['росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін', 'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол', 'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'менделєєв', 'тетріс', 'russia', 'moscow', 'soviet', 'ussr', 'kremlin'];
const all: [string, Question][] = [
  ...p.warmup.map((q) => ['warmup', q] as [string, Question]),
  ...p.main.map((q) => ['main', q] as [string, Question]),
  ...p.media.map((q) => ['media', q] as [string, Question]),
  ...p.blitz.map((q) => ['blitz', q] as [string, Question]),
  ...Object.entries(p.board).flatMap(([th, c]) => [...c!.cells.map((x) => [`board:${th}`, x.question] as [string, Question]), [`board:${th}:spare`, c!.spare] as [string, Question]]),
  ...p.wipeout.map((q) => ['wipeout', q] as [string, Question]),
  ...p.survival.map((q) => ['survival', q] as [string, Question]),
  ...p.trials.map((q) => ['trial', q] as [string, Question]),
  ...Object.entries(p.ladder).map(([lvl, q]) => [`ladder:${lvl}`, q] as [string, Question]),
  ...p.spares.map((q) => ['spare', q] as [string, Question]),
];
for (const [slot, q] of all) {
  const r = questionSchema.safeParse(q);
  if (!r.success) problems.push(`${slot} «${q.text.slice(0, 50)}»: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  if (q.timeLimit < 20) problems.push(`${slot} «${q.text.slice(0, 50)}»: timeLimit ${q.timeLimit} < 20`);
  const blob = JSON.stringify(q).toLocaleLowerCase('uk');
  for (const b of BANNED) if (new RegExp(`(^|[^a-zа-яіїєґ'’])${b}`, 'u').test(blob)) problems.push(`${slot} «${q.text.slice(0, 50)}»: banned root ${b}`);
  if (slot.startsWith('ladder') && (q.type !== 'single' || q.options.length !== 4)) problems.push(`${slot}: ladder needs single with 4 options`);
}
for (const [th, c] of Object.entries(p.board)) {
  for (const x of c!.cells) {
    const r = boardCellSchema.safeParse(x);
    if (!r.success) problems.push(`board:${th} cell: ${r.error.issues.map((i) => i.message).join('; ')}`);
  }
  const pts = c!.cells.map((x) => x.question.points);
  if (JSON.stringify(pts) !== JSON.stringify([100, 200, 300, 400])) problems.push(`board:${th} points ${pts} must be 100,200,300,400`);
}
for (const key of Object.keys(mod.IMAGES)) if (!used.has(key)) problems.push(`IMAGES.${key} is never used`);
// Повтори з іншими вікторинами (точний текст).
const scripts = join(import.meta.dirname, '..');
const other = readdirSync(scripts).filter((f) => f.endsWith('-quiz.ts')).map((f) => readFileSync(join(scripts, f), 'utf8')).join('\n');
for (const [slot, q] of all) if (other.includes(q.text)) problems.push(`${slot} «${q.text.slice(0, 50)}»: same text exists in another quiz`);
const texts = all.map(([, q]) => q.text);
texts.forEach((x, i) => texts.indexOf(x) !== i && problems.push(`duplicate text «${x.slice(0, 50)}»`));
const bools = all.filter(([, q]) => q.type === 'boolean').map(([, q]) => (q as { correct: boolean }).correct);
console.log(`questions: ${all.length}; types: ${[...new Set(all.map(([, q]) => q.type))].join(', ')}; yes/no true=${bools.filter(Boolean).length} false=${bools.filter((b) => !b).length}`);
console.log(`slots: warmup ${p.warmup.length}, main ${p.main.length}, media ${p.media.length}, blitz ${p.blitz.length}, board ${Object.keys(p.board).join('/')}, wipeout ${p.wipeout.length}, survival ${p.survival.length}, trials ${p.trials.length}, ladder ${Object.keys(p.ladder).join(',')}, spares ${p.spares.length}`);
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'OK');
process.exit(problems.length ? 1 : 0);
