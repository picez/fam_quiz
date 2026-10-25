import { describe, expect, it } from 'vitest';
import { debuffLines, ladderLines, ladderPrizeLines, survivalBonusLines, survivalLines, wipeoutLines } from './GameHistory';

describe('debuffLines', () => {
  it('lists purchases as «Оля купує 🌫️ Туман для гравця Петро: −200»', () => {
    expect(
      debuffLines([
        { seq: 1, roundIndex: 0, afterQuestion: 0, nickname: 'Оля', points: -100, source: 'host' },
        { seq: 2, roundIndex: 0, afterQuestion: 1, nickname: 'Оля', points: -200, source: 'debuff', debuff: 'fog', target: 'Петро' },
        { seq: 3, roundIndex: 0, afterQuestion: 2, nickname: 'Іра', points: -150, source: 'debuff', debuff: 'mud', target: null },
      ]),
    ).toEqual(['Оля купує 🌫️ Туман для гравця Петро: −200', 'Іра купує 🟫 Брудний екран: −150']);
  });
});

describe('wipeoutLines', () => {
  it('describes every participant after the rung', () => {
    expect(
      wipeoutLines({
        price: 300,
        rows: [
          { nickname: 'Оля', status: 'burned', bank: 0 },
          { nickname: 'Петро', status: 'took', bank: 300 },
          { nickname: 'Віра', status: 'in', bank: 300 },
          { nickname: 'Іра', status: 'survived', bank: 1500 },
        ],
      }).map((line) => line.replace(/\s/g, ' ')),
    ).toEqual(['Оля — банк згорів', 'Петро — забрав(-ла) 300', 'Віра — у грі, 300', 'Іра — доніс(-ла) 1500']);
  });
});

describe('survivalLines', () => {
  it('a survival question trial: the question, who is safe or out, the ghosts', () => {
    expect(
      survivalLines({
        verdict: 'trial',
        ghosts: { answered: 2, right: 1 },
        trial: {
          kind: 'question',
          fellBack: false,
          question: 'Перлина біля моря?',
          trialQuestion: {
            id: 't1',
            type: 'single',
            text: 'Перлина біля моря?',
            imageUrl: null,
            video: null,
            timeLimit: 20,
            points: 100,
            correctId: 'a',
            options: [
              { id: 'a', text: 'Одеса' },
              { id: 'b', text: 'Київ' },
            ],
          },
          rows: [
            { nickname: 'Оля', out: false, answer: { type: 'single', optionId: 'a' }, door: null, auto: false, trap: null },
            { nickname: 'Петро', out: true, answer: null, door: null, auto: false, trap: null },
          ],
        },
        alive: ['Оля'],
        end: false,
      }),
    ).toEqual(['Питання на виживання: Перлина біля моря?', 'Оля — вижив(-ла), відповідь: Одеса', 'Петро — вибув(-ла), відповідь: —', 'Привиди: 1 з 2 відгадали']);
  });

  it('luck with doors, picked by themselves and a fallback note', () => {
    expect(
      survivalLines({
        verdict: 'trial',
        ghosts: { answered: 0, right: 0 },
        trial: {
          kind: 'luck',
          fellBack: true,
          question: null,
          rows: [
            { nickname: 'Оля', out: false, answer: null, door: 0, auto: false, trap: 2 },
            { nickname: 'Петро', out: true, answer: null, door: 1, auto: true, trap: 1 },
          ],
        },
        alive: ['Оля'],
        end: false,
      }),
    ).toEqual(['Удача (питань не лишилося)', 'Оля — вижив(-ла), двері 1, пастка 3', 'Петро — вибув(-ла), двері 2 (самі), пастка 2']);
  });

  it('no verdict line when the round ended on the reveal', () => {
    expect(survivalLines({ ghosts: { answered: 0, right: 0 }, trial: null, alive: ['Оля'], end: true })).toEqual([]);
  });

  it('verdicts without a trial', () => {
    const base = { ghosts: { answered: 0, right: 0 }, trial: null, alive: [], end: false };
    expect(survivalLines({ ...base, verdict: 'all_wrong' })).toEqual(['Помилилися всі — ніхто не вибув']);
    expect(survivalLines({ ...base, verdict: 'all_right' })).toEqual(['Усі вціліли']);
  });
});

describe('survivalBonusLines', () => {
  it('lists the survival bonus of every survivor', () => {
    expect(
      survivalBonusLines([
        { seq: 1, roundIndex: 0, afterQuestion: 3, nickname: 'Оля', points: 500, source: 'host' },
        { seq: 2, roundIndex: 0, afterQuestion: 3, nickname: 'Оля', points: 500, source: 'survival' },
        { seq: 3, roundIndex: 0, afterQuestion: 3, nickname: 'Іра', points: 500, source: 'survival' },
      ]),
    ).toEqual(['Бонус виживання: Оля +500', 'Бонус виживання: Іра +500']);
  });
});

describe('ladderLines', () => {
  const choices = [
    { id: 'a', text: 'Львів' },
    { id: 'b', text: 'Київ' },
    { id: 'c', text: 'Одеса' },
    { id: 'd', text: 'Харків' },
  ];
  const question = { id: 'q1', type: 'single' as const, text: 'Столиця?', imageUrl: null, video: null, timeLimit: 20, points: 0, options: choices, correctId: 'b' };
  const base = { contestant: 'Оля', step: 2, level: 1000, safe: true, lifelines: [], decision: null, outcome: null, hall: { answered: 3, right: 2 } };
  const flat = (lines: string[]) => lines.map((line) => line.replace(/\s/g, ' '));

  it('the step with its level and the safe mark, the hall hits', () => {
    expect(flat(ladderLines(base, question))).toEqual(['Оля · сходинка 3 · 1000 (неспалима)', 'Зал: 2 з 3 відгадали']);
    expect(flat(ladderLines({ ...base, safe: false }, question))[0]).toBe('Оля · сходинка 3 · 1000');
  });

  it('no hall line when nobody in the hall answered', () => {
    expect(flat(ladderLines({ ...base, hall: { answered: 0, right: 0 } }, question))).toEqual(['Оля · сходинка 3 · 1000 (неспалима)']);
  });

  it('lifelines: 50/50 removed options, the hall percents, the host hint text or aloud', () => {
    const lines = flat(
      ladderLines(
        {
          ...base,
          lifelines: [
            { kind: 'fifty', removed: ['a', 'c'], tally: null, hint: null, aloud: false },
            { kind: 'audience', removed: null, tally: { cast: 4, counts: { b: 3, d: 1 } }, hint: null, aloud: false },
            { kind: 'hint', removed: null, tally: null, hint: 'Річка Дніпро', aloud: false },
          ],
        },
        question,
      ),
    );
    expect(lines).toContain('50/50: прибрано Львів, Одеса');
    expect(lines).toContain('Зал: Львів 0 %, Київ 75 %, Одеса 0 %, Харків 25 %');
    expect(lines).toContain('Підказка ведучого: Річка Дніпро');
    expect(flat(ladderLines({ ...base, lifelines: [{ kind: 'hint', removed: null, tally: null, hint: null, aloud: true }] }, question))).toContain('Підказка ведучого — уголос');
  });

  it('the decision and the outcome', () => {
    expect(flat(ladderLines({ ...base, decision: 'go' }, question))).toContain('Грає далі');
    const out = (kind: 'took' | 'wrong' | 'top' | 'stopped', points: number) => flat(ladderLines({ ...base, outcome: { kind, passed: 2, points } }, question));
    expect(out('took', 300)).toContain('Оля забрав(-ла) 300');
    expect(out('wrong', 100)).toContain('Помилка — Оля отримує 100');
    expect(out('top', 10000)).toContain('Оля пройшов(-ла) драбину: 10000');
    expect(out('stopped', 300)).toContain('Драбину зупинено: 300');
  });
});

describe('ladderPrizeLines', () => {
  it('lists the ladder prize', () => {
    expect(
      ladderPrizeLines([
        { seq: 1, roundIndex: 0, afterQuestion: 4, nickname: 'Оля', points: 100, source: 'host' },
        { seq: 2, roundIndex: 0, afterQuestion: 4, nickname: 'Оля', points: 1000, source: 'ladder' },
      ]).map((line) => line.replace(/\s/g, ' ')),
    ).toEqual(['Виграш драбини: Оля +1000']);
  });
});
