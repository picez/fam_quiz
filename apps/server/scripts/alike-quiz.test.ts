import { answerKey, autopilotCheck, quizSchema, type Question } from '@quiz/shared';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { alikeQuiz } from './alike-quiz';

/** Слова порівняння: пару ловимо лише в рядку, що теж порівнює, а не в переліку варіантів. */
const COMPARING = /довш|більш|більше|менше|вищ|раніш|давніш|глибш|важч|старш/;

const quiz = alikeQuiz();
const rounds = quiz.rounds.flatMap((r) => ('questions' in r ? [r.questions as Question[]] : []));
const questions = rounds.flat();

/** Як у think-quiz.test.ts: нічого, пов'язаного з росією. */
const BANNED = [
  'росі', 'росс', 'русск', 'москв', 'ссср', 'срср', 'урср', 'радянськ', 'совєт', 'совет', 'кремл', 'путін', 'ленін', 'сталін',
  'більшовик', 'комуніст', 'колгосп', 'толст', 'достоєвськ', 'чехов', 'пушкін', 'лермонтов', 'тургенєв', 'булгаков', 'гогол',
  'сибір', 'байкал', 'волга', 'урал', 'гагарін', 'терешков', 'корольов', 'чорнобил', 'голодомор', 'менделєєв', 'пажитнов', 'тетріс',
  'russia', 'moscow', 'soviet', 'ussr', 'kremlin',
];

describe('the «Думай як усі» seed', () => {
  it('passes the quiz schema and starts the autopilot', () => {
    const result = quizSchema.safeParse(quiz);
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(autopilotCheck(quiz).blocked).toEqual([]);
    expect(quiz.rounds.map((r) => r.type)).toEqual(['classic', 'classic']);
  });

  it('round one is thinkalike only', () => {
    expect(rounds[0]).toHaveLength(6);
    expect(rounds[0]!.every((q) => q.type === 'thinkalike')).toBe(true);
  });

  it('round two has no-overshoot numerics and a stepped more-or-less', () => {
    const numerics = rounds[1]!.filter((q) => q.type === 'numeric');
    expect(numerics).toHaveLength(3);
    for (const q of numerics) expect(q.type === 'numeric' && q.noOvershoot, q.text).toBe(true);
    const more = rounds[1]!.find((q) => q.type === 'moreless');
    expect(more?.type === 'moreless' && more.step).toBe(50);
    expect(more?.type === 'moreless' && more.pairs.map((p) => p.points)).toEqual([100, 150, 200, 250]);
    expect(more?.points).toBe(700);
  });

  it('timers are at least 25 seconds', () => {
    for (const q of questions) expect(q.timeLimit, q.text).toBeGreaterThanOrEqual(25);
  });

  it('points follow difficulty', () => {
    for (const list of rounds) {
      const points = list.map((q) => q.points);
      expect(new Set(points).size).toBeGreaterThan(1);
      points.slice(1).forEach((p, i) => expect(p, list[i + 1]!.text).not.toBe(points[i]));
    }
  });

  it('no answer leaks into the text', () => {
    for (const q of questions) {
      const text = answerKey(q.text);
      if (q.type === 'numeric') expect(text.includes(answerKey(String(q.correct))), q.text).toBe(false);
      if (q.type === 'moreless') {
        for (const p of q.pairs) for (const side of [p.a, p.b]) expect(answerKey(`${q.text} ${p.prompt} ${p.a.text} ${p.b.text}`).includes(answerKey(side.value)), `${p.id} ${side.value}`).toBe(false);
      }
    }
    const texts = questions.map((q) => answerKey(q.text));
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('repeats no question of the other seeds', () => {
    const dir = import.meta.dirname;
    const files = (folder: string): string[] =>
      readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? files(join(folder, entry.name)) : entry.name.endsWith('.ts') && !entry.name.startsWith('alike-quiz') ? [join(folder, entry.name)] : [],
      );
    const others = files(dir).map((file) => readFileSync(file, 'utf8').toLowerCase());
    expect(others.length).toBeGreaterThan(20);
    const probes = [
      ...questions.map((q) => q.text),
      ...questions.flatMap((q) => (q.type === 'moreless' ? q.pairs.map((p) => `${p.a.text}|${p.b.text}`) : [])),
    ];
    const repeated = probes.filter((probe) => {
      // Тема — дослівно; пара — обидва предмети (≥ 4 літер) разом у рядку іншого сіда, що порівнює.
      const words = probe.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !['головне', 'перебільшити'].includes(w));
      return others.some((source) => source.split(/\r?\n/).some((line) => line.includes(probe.toLowerCase()) || (probe.includes('|') && words.every((w) => line.includes(w.slice(0, 5))) && COMPARING.test(line))));
    });
    expect(repeated).toEqual([]);
  });

  it('nothing about russia', () => {
    const text = JSON.stringify(quiz).toLowerCase();
    expect(BANNED.filter((term) => new RegExp(`(?<!\\p{L})${term}`, 'iu').test(text))).toEqual([]);
  });
});
