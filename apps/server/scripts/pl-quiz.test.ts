import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITS, autopilotCheck, questionsOf, quizSchema, roundTrials, type Question, type Quiz } from '@quiz/shared';
import { PL_BIG_MEDIA, PL_BIG_PHOTOS, PL_FUN_MEDIA, PL_GEO_PHOTOS, PL_LIGHT_PHOTOS, plBigQuiz, plFunQuiz, plGeoQuiz, plLightQuiz } from './pl-quiz';
import { MIN_TIMER } from './mix-quiz';

/** Zaślepka wgrywania: każdy klucz — własny adres /uploads/…, jak po uploadImages. */
const photosOf = (seed: string, map: Record<string, string>, used: Set<string>) => (key: string) => {
  if (!(key in map)) throw new Error(`unknown photo ${key}`);
  used.add(key);
  return `/uploads/${seed}${key.toLowerCase().replace(/[^a-z0-9]/g, '')}0000000000000000.jpg`;
};

const used = { light: new Set<string>(), geo: new Set<string>(), big: new Set<string>() };
const QUIZZES: Record<string, { quiz: Quiz; size: [number, number]; photos: Record<string, string>; used: Set<string> | null; media: Record<string, number> }> = {
  'pl-light': { quiz: plLightQuiz(photosOf('pllight', PL_LIGHT_PHOTOS, used.light)), size: [25, 32], photos: PL_LIGHT_PHOTOS, used: used.light, media: {} },
  'pl-geo': { quiz: plGeoQuiz(photosOf('plgeo', PL_GEO_PHOTOS, used.geo)), size: [50, 65], photos: PL_GEO_PHOTOS, used: used.geo, media: {} },
  'pl-big': { quiz: plBigQuiz(photosOf('plbig', PL_BIG_PHOTOS, used.big)), size: [90, 120], photos: PL_BIG_PHOTOS, used: used.big, media: PL_BIG_MEDIA },
  'pl-fun': { quiz: plFunQuiz(), size: [45, 65], photos: {}, used: null, media: PL_FUN_MEDIA },
};

/** Klucz tekstu: małe litery, apostrofy jako «'», cudzysłowy usunięte, spacje ściśnięte. */
const key = (text: string) =>
  text
    .trim()
    .toLocaleLowerCase('pl')
    .replace(/[’ʼ‘`]/g, "'")
    .replace(/[„”«»"]/g, '')
    .replace(/\s+/g, ' ');
const played = (q: Quiz): Question[] => [...questionsOf(q), ...q.rounds.flatMap(roundTrials)];
const of = <T extends Question['type']>(list: Question[], type: T) => list.filter((q): q is Extract<Question, { type: T }> => q.type === type);
/** YouTube w pytaniu: [id, start]. */
const youtube = (q: Question): [string, number] | null =>
  q.type === 'videoclip'
    ? [q.clip.id, q.clip.start]
    : q.type === 'melody' && q.track.source === 'youtube'
      ? [q.track.id, q.track.start]
      : q.audio?.source === 'youtube'
        ? [q.audio.id, q.audio.start]
        : null;

const dir = import.meta.dirname;
/** Teksty innych sidów: wszystkie .ts w scripts i podfolderach oprócz polskich i testów. */
const otherSources = (): string =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.startsWith('pl') && !f.includes('.test.'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');

/** Nic, co wiąże się z rosją (przepis właściciela), także po ukraińsku i angielsku. */
const BANNED = [
  'rosj', 'rosyj', 'ruski', 'moskw', 'moskal', 'kreml', 'putin', 'sowie', 'radziec', 'zsrr', 'stalin', 'lenin', 'bolszew', 'syberi', 'katyń', 'kaliningrad', 'krymsk', 'krymu',
  'росі', 'русск', 'москв', 'russia', 'moscow', 'soviet', 'ussr', 'kremlin',
];

describe.each(Object.entries(QUIZZES))('the Polish quiz %s', (_name, { quiz, size, photos, used: usedPhotos, media }) => {
  const everything = played(quiz);

  it('passes the quiz schema within the limits and has the planned size', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(quiz.rounds.length).toBeLessThanOrEqual(LIMITS.maxRounds);
    expect(everything.length).toBeGreaterThanOrEqual(size[0]);
    expect(everything.length).toBeLessThanOrEqual(size[1]);
    expect(quiz.description.length).toBeLessThanOrEqual(130);
  });

  it('runs on the autopilot without a host: nothing is blocked', () => {
    expect(autopilotCheck(quiz).blocked).toEqual([]);
  });

  it('gives every question and choice phase at least 25 seconds', () => {
    expect(everything.filter((q) => q.timeLimit < MIN_TIMER).map((q) => q.id)).toEqual([]);
    for (const q of of(everything, 'bluff')) expect(q.choiceTime, q.text).toBeGreaterThanOrEqual(MIN_TIMER);
    for (const r of quiz.rounds) if (r.type === 'truth') expect(r.timeLimit).toBeGreaterThanOrEqual(MIN_TIMER);
  });

  it('is written in Polish: no Cyrillic anywhere', () => {
    expect(JSON.stringify(quiz).match(/[Ѐ-ӿ]+/gu)).toBeNull();
  });

  it('prices classic questions 500/1000/1500 and board cells 100…500 by difficulty, with marks on random prices', () => {
    const fixed = new Set(['sort', 'moreless', 'timedlist', 'jigsaw', 'memory', 'poll', 'wordcloud']);
    for (const r of quiz.rounds) {
      if (r.type === 'classic') for (const q of r.questions) if (!fixed.has(q.type)) expect([500, 1000, 1500], q.text).toContain(q.points);
      if (r.type === 'board') {
        const marked: number[] = [];
        for (const c of r.categories) {
          expect(c.cells.map((cell) => cell.question.points), c.title).toEqual([100, 200, 300, 400, 500]);
          expect(c.cells.filter((cell) => cell.mark !== 'none'), c.title).toHaveLength(1);
          marked.push(c.cells.findIndex((cell) => cell.mark !== 'none'));
        }
        // Brak wzoru: ×2/×3 nie stoją na tej samej cenie w każdej kategorii.
        expect(new Set(marked).size).toBeGreaterThan(1);
      }
      if (r.type === 'wipeout' || r.type === 'survival') {
        const prices = r.questions.map((q) => q.points);
        expect(prices, r.title).toEqual([...prices].sort((a, b) => a - b));
      }
    }
  });

  it('uses every listed photo, and every YouTube clip at its verified start with no plain video', () => {
    if (usedPhotos) expect(Object.keys(photos).filter((k) => !usedPhotos.has(k))).toEqual([]);
    for (const file of Object.values(photos)) expect(file).toMatch(/^File:.+\.(jpe?g|png)$/i);
    const clips = Object.fromEntries(everything.map(youtube).filter((x): x is [string, number] => x !== null));
    expect(clips).toEqual(media);
    expect(everything.filter((q) => q.video !== null)).toEqual([]);
    for (const q of of(everything, 'videoclip')) expect(q.muted, q.text).toBe(true);
    // Żadne nagranie ani zdjęcie nie powtarza mediów innych sidów.
    const others = otherSources();
    expect(Object.keys(media).filter((id) => others.includes(id))).toEqual([]);
    expect(Object.values(photos).filter((file) => others.includes(file))).toEqual([]);
  });

  it('has a fair mix of «tak» and «nie» in yes/no questions', () => {
    const bools = of(everything, 'boolean');
    expect(bools.length).toBeGreaterThanOrEqual(4);
    const yes = bools.filter((q) => q.correct).length;
    expect(yes).toBeGreaterThanOrEqual(Math.floor(bools.length * 0.4));
    expect(yes).toBeLessThanOrEqual(Math.ceil(bools.length * 0.6));
  });

  it('leaks no answer into its own question or hint', () => {
    const norm = (s: string) => key(s).replace(/[.,!?…:;—–-]/g, ' ').replace(/\s+/g, ' ').trim();
    const leaks: string[] = [];
    for (const q of everything) {
      const where = ` ${norm(`${q.text} ${q.hint ?? ''}`)} `;
      const answers =
        q.type === 'single'
          ? [q.options.find((o) => o.id === q.correctId)?.text ?? '']
          : q.type === 'text' || q.type === 'videoclip' || q.type === 'bluff' || q.type === 'melody' || q.type === 'clues'
            ? q.accepted
            : [];
      for (const a of answers) if (norm(a).length >= 3 && !/^\d+$/.test(norm(a)) && where.includes(` ${norm(a)} `)) leaks.push(`${q.id}: ${a}`);
    }
    expect(leaks).toEqual([]);
    for (const r of quiz.rounds) {
      if (r.type !== 'quest') continue;
      expect(key(JSON.stringify([r.prompt, r.questions])).includes(key(r.code))).toBe(false);
    }
  });

  it('has no duplicate question texts, here or in other seed quizzes', () => {
    const texts = everything.map((q) => key(q.text));
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
    const others = key(otherSources());
    expect(texts.filter((text) => others.includes(text))).toEqual([]);
  });

  it('contains nothing related to russia', () => {
    const text = JSON.stringify(quiz);
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});

describe('the Polish set', () => {
  it('repeats no question text across its four quizzes', () => {
    const texts = Object.values(QUIZZES).flatMap(({ quiz }) => played(quiz).map((q) => key(q.text)));
    expect(texts.filter((text, i) => texts.indexOf(text) !== i)).toEqual([]);
  });

  it('uses many round and question types together', () => {
    const all = Object.values(QUIZZES).map(({ quiz }) => quiz);
    const rounds = new Set(all.flatMap((q) => q.rounds.map((r) => r.type)));
    const types = new Set(all.flatMap((q) => played(q).map((x) => x.type)));
    expect(rounds.size).toBeGreaterThanOrEqual(11);
    expect(types.size).toBeGreaterThanOrEqual(22);
    // Bez ankiet graczy, „chmur słów”, „100 do 1” i „Myśl jak wszyscy” (przepis właściciela: tylko prawdziwe sondaże, a takich tu nie ma).
    for (const t of ['poll', 'wordcloud', 'survey', 'thinkalike']) expect(types, t).not.toContain(t);
  });
});
