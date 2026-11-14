import { questionSchema, seededRng, type GroupItem, type GroupMember, type Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { problemsOf, questionTypesFor } from '../editor/draft';
import {
  GROUP_TEMPLATES,
  buildGroupQuiz,
  blankOut,
  clip,
  draftFrom,
  fictionOf,
  namePool,
  pickTemplates,
  placeIssue,
  templateIssue,
  type DraftContext,
  type GroupTemplate,
} from './templates';

const photo = `/uploads/${'ab'.repeat(16)}.jpg`;

function member(id: string, nickname: string): GroupMember {
  return { id, nickname, avatar: null, role: id === 'u-olia' ? 'owner' : 'member', joinedAt: '2026-11-14T10:00:00.000Z', you: id === 'u-olia' };
}
const group = {
  name: 'Родина Квіткових',
  members: [member('u-olia', 'Оля Квіткова'), member('u-petro', 'Петро Гай'), member('u-ira', 'Іра Лис')],
};

function item(id: string, over: Partial<GroupItem>): GroupItem {
  return {
    id,
    kind: 'fact',
    text: '',
    about: [],
    answer: null,
    year: null,
    photo: null,
    surprise: false,
    author: null,
    mine: true,
    canDelete: true,
    uses: [],
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:00.000Z',
    ...over,
  };
}

const story = item('i-story', {
  kind: 'story',
  text: 'Як тато заблукав у лісі по гриби й вийшов до сусіднього села. Шукали всім селом. Знайшовся з повним кошиком.',
  about: [{ kind: 'name', name: 'тато' }],
  answer: 'Тато',
  year: 1998,
  photo,
});
const fact = item('i-fact', { text: 'Бабуся Ніна свистить двома пальцями голосніше за всіх', about: [{ kind: 'name', name: 'бабуся Ніна' }] });
const date = item('i-date', { kind: 'date', text: 'Перша поїздка на море всією родиною у 2004 році', answer: 'Затока', year: 2004 });
// Відповідь стоїть у тексті, щоб блеф мав що ховати за «___».
const quote = item('i-quote', {
  kind: 'quote',
  text: '„Хто рано встає, тому кава гаряча“, — каже Петро щоранку',
  about: [{ kind: 'member', userId: 'u-petro', name: 'Петро Гай', former: false }],
  answer: 'Петро',
});
const all = [story, fact, date, quote];
const pool = namePool(group, all);

const context = (seed = 7, over: Partial<DraftContext> = {}): DraftContext => ({ pool, items: all, rng: seededRng(seed), year: 2026, ...over });
const keys = (notes: { key: string }[]) => notes.map((note) => note.key);
const valid = (question: Question) => questionSchema.safeParse(question).success;

describe('group question templates (12l)', () => {
  it('builds the name pool from members and records without repeats', () => {
    expect(pool).toEqual(['Оля Квіткова', 'Петро Гай', 'Іра Лис', 'тато', 'бабуся Ніна']);
  });

  it('every template on the full story is a valid question with the photo, ≥ 25 s and ≤ 300 characters', () => {
    for (const template of GROUP_TEMPLATES) {
      expect(templateIssue(template, story, pool), template).toBeNull();
      const { question } = draftFrom(template, story, context());
      expect(valid(question), template).toBe(true);
      expect(question.imageUrl, template).toBe(photo);
      expect(question.timeLimit, template).toBeGreaterThanOrEqual(25);
      expect(question.text.length, template).toBeLessThanOrEqual(300);
    }
  });

  it('every template keeps the timer at 25 s or more on every record', () => {
    for (const record of all) {
      for (const template of GROUP_TEMPLATES) {
        if (templateIssue(template, record, pool) !== null) continue;
        const { question } = draftFrom(template, record, context());
        expect(question.timeLimit, `${template} ${record.id}`).toBeGreaterThanOrEqual(25);
        if (question.type === 'bluff') expect(question.choiceTime).toBeGreaterThanOrEqual(25);
      }
    }
  });

  describe('«Хто це?»', () => {
    it('hides the hero, one right option as in the record and three more from the pool', () => {
      const { question, notes } = draftFrom('who', story, context());
      if (question.type !== 'single') throw new Error(question.type);
      expect(question.text).toBe('Хто це? Як ___ заблукав у лісі по гриби й вийшов до сусіднього села. Шукали всім селом. Знайшовся з повним кошиком.');
      expect(question.options).toHaveLength(4);
      expect(question.options.filter((option) => option.text === 'тато')).toHaveLength(1);
      expect(question.options.find((option) => option.id === question.correctId)?.text).toBe('тато');
      for (const option of question.options.filter((o) => o.id !== question.correctId)) expect(pool).toContain(option.text);
      expect(keys(notes)).toContain('groupNotePhoto');
    });

    it('the right option is not always first', () => {
      const places = new Set<number>();
      for (let seed = 1; seed <= 20; seed++) {
        const { question } = draftFrom('who', story, context(seed));
        if (question.type !== 'single') throw new Error(question.type);
        places.add(question.options.findIndex((option) => option.id === question.correctId));
      }
      expect(places.size).toBeGreaterThan(1);
    });

    it('a member is named by the nickname and is never a wrong option', () => {
      const { question } = draftFrom('who', quote, context());
      if (question.type !== 'single') throw new Error(question.type);
      expect(question.options.find((option) => option.id === question.correctId)?.text).toBe('Петро Гай');
      expect(question.options.filter((option) => option.text.includes('Петро'))).toHaveLength(1);
    });

    it('says what is missing', () => {
      expect(templateIssue('who', story, ['тато'])).toEqual({ key: 'groupTplNeedNames' });
      expect(templateIssue('who', date, pool)).toEqual({ key: 'groupTplNeedAbout' });
    });

    it('several heroes: each wrong option has as many names', () => {
      const pair = item('i-pair', { text: 'Оля й Іра спекли пиріг', about: [{ kind: 'name', name: 'тато' }, { kind: 'name', name: 'бабуся Ніна' }] });
      const { question } = draftFrom('who', pair, context());
      if (question.type !== 'single') throw new Error(question.type);
      expect(question.options.find((option) => option.id === question.correctId)?.text).toBe('тато й бабуся Ніна');
      for (const option of question.options) expect(option.text).toMatch(/ (й|і|та) /);
    });
  });

  describe('«Правда чи вигадка?»', () => {
    it('true keeps the record, made up takes the given text', () => {
      const yes = draftFrom('truth', story, context(7, { truth: { correct: true } })).question;
      expect(yes).toMatchObject({ type: 'boolean', correct: true });
      expect(yes.text.startsWith('Правда чи вигадка? Як тато заблукав')).toBe(true);
      const made = draftFrom('truth', date, context(7, { truth: { correct: false, text: 'Перша поїздка на море всією родиною у 2008 році' } }));
      expect(made.question).toMatchObject({ type: 'boolean', correct: false, text: 'Правда чи вигадка? Перша поїздка на море всією родиною у 2008 році' });
      expect(keys(made.notes)).toContain('groupNoteFiction');
    });

    it('swaps the year, else a name, else an answer of the same kind', () => {
      const byName = fictionOf(story, pool, all, seededRng(7));
      expect(byName?.from).toBe('тато');
      expect(pool).toContain(byName?.to);
      expect(byName?.to).not.toBe('тато');
      expect(byName?.text).toBe(story.text.replace('тато', byName!.to));

      for (let seed = 1; seed <= 20; seed++) {
        const byYear = fictionOf(date, pool, all, seededRng(seed));
        expect(byYear?.from).toBe('2004');
        const year = Number(byYear?.to);
        expect((year >= 2006 && year <= 2011) || (year >= 1997 && year <= 2002), String(year)).toBe(true);
        expect(byYear?.text).toBe(`Перша поїздка на море всією родиною у ${year} році`);
      }

      const grandma = fictionOf(fact, pool, all, seededRng(7));
      expect(grandma?.from).toBe('Бабуся Ніна');
      expect(grandma?.to).not.toMatch(/Ніна/);
      expect(grandma?.text.endsWith('свистить двома пальцями голосніше за всіх')).toBe(true);

      const cats = [item('c1', { kind: 'date', text: 'Наше море — це Затока, і крапка', answer: 'Затока' }), item('c2', { kind: 'date', text: 'Літо', answer: 'Коблеве' })];
      expect(fictionOf(cats[0]!, [], cats, seededRng(7))).toMatchObject({ from: 'Затока', to: 'Коблеве' });
      expect(fictionOf(item('none', { text: 'Ми любимо вареники' }), pool, all, seededRng(7))).toBeNull();
    });
  });

  describe('«Коли це було?»', () => {
    it('hides the year on a 30-year scale where the year is not in the middle', () => {
      let middle = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const { question } = draftFrom('when', date, context(seed));
        if (question.type !== 'slider') throw new Error(question.type);
        expect(question.text).toBe('Коли це було? Перша поїздка на море всією родиною у ___ році');
        expect(question.min).toBeLessThanOrEqual(2004);
        expect(question.max).toBeGreaterThanOrEqual(2004);
        expect(question.max - question.min).toBe(30);
        expect(question.max).toBeLessThanOrEqual(2026);
        expect(question).toMatchObject({ step: 1, tolerance: 0, zeroBeyond: 5, correct: 2004 });
        if (2004 - question.min === 15) middle += 1;
        expect(valid(question)).toBe(true);
      }
      expect(middle).toBeLessThan(10);
    });

    it('a recent year never pushes the scale past this year; an old one never below 1800', () => {
      const recent = draftFrom('when', item('r', { text: 'Новий дім у 2024', year: 2024 }), context()).question;
      if (recent.type !== 'slider') throw new Error(recent.type);
      expect(recent.max).toBe(2026);
      const old = draftFrom('when', item('o', { text: 'Прадід народився у 1803', year: 1803 }), context()).question;
      if (old.type !== 'slider') throw new Error(old.type);
      expect(old.min).toBeGreaterThanOrEqual(1800);
      expect(old.max - old.min).toBe(30);
    });

    it('needs a year', () => {
      expect(templateIssue('when', fact, pool)).toEqual({ key: 'groupTplNeedYear' });
    });
  });

  describe('«Хто я?»', () => {
    it('clues are the sentences from the last to the first with the hero hidden', () => {
      const { question, notes } = draftFrom('whoami', story, context());
      if (question.type !== 'clues') throw new Error(question.type);
      expect(question.text).toBe('Хто я?');
      expect(question.clues).toEqual(['Знайшовся з повним кошиком.', 'Шукали всім селом.', 'Як ___ заблукав у лісі по гриби й вийшов до сусіднього села.']);
      expect(question.accepted).toEqual(['тато']);
      expect((question.clues.length - 1) * question.interval + 5).toBeLessThanOrEqual(question.timeLimit);
      expect(keys(notes)).not.toContain('groupNoteClues');
    });

    it('one sentence leaves two empty clues and a reminder; the quiz will not save until they are written', () => {
      const { question, notes } = draftFrom('whoami', fact, context());
      if (question.type !== 'clues') throw new Error(question.type);
      expect(question.clues).toHaveLength(3);
      expect(question.clues.filter((clue) => clue === '')).toHaveLength(2);
      expect(question.clues).toContain('___ свистить двома пальцями голосніше за всіх');
      expect(keys(notes)).toContain('groupNoteClues');
      const parsed = questionSchema.safeParse(question);
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues.every((issue) => issue.path[0] === 'clues')).toBe(true);
      const quiz = buildGroupQuiz(group, [story], all, 'truth', seededRng(1), 2026).quiz;
      const round = quiz.rounds[0]!;
      if (round.type !== 'classic') throw new Error(round.type);
      expect(problemsOf({ ...quiz, rounds: [{ ...round, questions: [question] }] }).join(' ')).toMatch(/підказку/);
    });

    it('a long sentence is clipped with «…»; several heroes get a reminder', () => {
      const long = item('l', { text: `${'Дуже довге речення про родинне свято '.repeat(6)}. Друге. Третє.`, about: [{ kind: 'name', name: 'тато' }, { kind: 'name', name: 'мама' }] });
      const { question, notes } = draftFrom('whoami', long, context());
      if (question.type !== 'clues') throw new Error(question.type);
      const last = question.clues.at(-1)!;
      expect(last.length).toBeLessThanOrEqual(150);
      expect(last.endsWith('…')).toBe(true);
      expect(keys(notes)).toContain('groupNoteManyAbout');
    });
  });

  describe('«Відкрите запитання» and «Блеф»', () => {
    it('open: the answer goes to accepted; if it is not in the text, a reminder', () => {
      const { question, notes } = draftFrom('open', date, context());
      expect(question).toMatchObject({ type: 'text', text: 'Перша поїздка на море всією родиною у 2004 році', accepted: ['Затока'] });
      expect(keys(notes)).toContain('groupNoteBlankAnswer');
      expect(templateIssue('open', fact, pool)).toEqual({ key: 'groupTplNeedAnswer' });
    });

    it('bluff: the truth hides behind «___», spare fibs come from other answers', () => {
      const { question } = draftFrom('bluff', quote, context());
      if (question.type !== 'bluff') throw new Error(question.type);
      expect(question.text).toBe('„Хто рано встає, тому кава гаряча“, — каже ___ щоранку');
      expect(question.accepted).toEqual(['Петро']);
      expect(question.lies).toEqual(['Тато', 'Затока']);
      expect(valid(question)).toBe(true);
    });

    it('bluff without other answers leaves empty fibs and a reminder; a long answer does not fit', () => {
      const { question, notes } = draftFrom('bluff', quote, context(7, { items: [quote] }));
      if (question.type !== 'bluff') throw new Error(question.type);
      expect(question.lies).toEqual(['', '']);
      expect(keys(notes)).toContain('groupNoteLies');
      expect(templateIssue('bluff', item('x', { answer: 'а'.repeat(61) }), pool)).toEqual({ key: 'groupTplAnswerLong', vars: { max: 60 } });
    });
  });

  it('a 1000-character record is clipped to 300 with «…» and a reminder', () => {
    const long = item('long', { text: 'Родинна історія про літо '.repeat(40).slice(0, 1000) });
    const { question, notes } = draftFrom('truth', long, context());
    expect(question.text.length).toBeLessThanOrEqual(300);
    expect(question.text.endsWith('…')).toBe(true);
    expect(notes).toContainEqual({ key: 'groupNoteClipped', vars: { max: 300 } });
  });

  it('helpers: blankOut keeps word borders and ignores case; clip cuts by a word', () => {
    expect(blankOut('Тато й татова кава', ['тато'])).toEqual({ text: '___ й татова кава', hit: true });
    expect(blankOut('Нікого', ['Оля'])).toEqual({ text: 'Нікого', hit: false });
    expect(clip('раз два три', 9)).toEqual({ text: 'раз два…', clipped: true });
    expect(clip('раз', 9)).toEqual({ text: 'раз', clipped: false });
  });

  it('placeIssue: a template must fit the round', () => {
    expect(placeIssue('bluff', questionTypesFor('board'))).toEqual({ key: 'groupTplNotHere' });
    expect(placeIssue('whoami', questionTypesFor('blitz'))).toEqual({ key: 'groupTplNotHere' });
    for (const template of GROUP_TEMPLATES) expect(placeIssue(template, questionTypesFor('classic')), template).toBeNull();
  });

  it('pickTemplates: «Змішано» goes round the six, one template falls back to «Правда чи вигадка?»', () => {
    expect(pickTemplates([story, fact, date, quote], 'mixed', pool)).toEqual(['who', 'truth', 'when', 'whoami']);
    // Бабусі бракує року — «Коли це було?» пропускається, бере наступний доступний.
    expect(pickTemplates([story, date, fact, quote], 'mixed', pool)).toEqual(['who', 'truth', 'whoami', 'open']);
    expect(pickTemplates([story, fact, date], 'when', pool)).toEqual(['when', 'truth', 'when']);
  });

  it('buildGroupQuiz: one classic round named after the group, about half «ні», drafts per question', () => {
    const { quiz, drafts } = buildGroupQuiz(group, [story, fact, date], all, 'mixed', seededRng(5), 2026);
    expect(quiz.title).toBe('Вікторина: Родина Квіткових');
    expect(quiz.rounds).toHaveLength(1);
    const round = quiz.rounds[0]!;
    if (round.type !== 'classic') throw new Error(round.type);
    expect(round.title).toBe('Родина Квіткових');
    expect(round.questions.map((q) => q.type)).toEqual(['single', 'boolean', 'slider']);
    expect(new Set(round.questions.map((q) => q.id)).size).toBe(3);
    expect(drafts.map((d) => [d.questionId, d.itemId])).toEqual(round.questions.map((q, i) => [q.id, [story, fact, date][i]!.id]));
    for (const question of round.questions) expect(question.timeLimit).toBeGreaterThanOrEqual(25);

    const six = Array.from({ length: 6 }, (_, i) => item(`y${i}`, { kind: 'date', text: `Переїзд у новий дім у ${2000 + i} році`, year: 2000 + i }));
    const truths = buildGroupQuiz(group, six, six, 'truth' as GroupTemplate, seededRng(9), 2026).quiz.rounds[0]!;
    if (truths.type !== 'classic') throw new Error(truths.type);
    const answers = truths.questions.map((q) => (q.type === 'boolean' ? q.correct : null));
    expect(answers).toEqual([false, true, false, true, false, true]);

    const plain = buildGroupQuiz(group, [item('p', { text: 'Ми любимо вареники' })], all, 'truth', seededRng(9), 2026).quiz.rounds[0]!;
    if (plain.type !== 'classic') throw new Error(plain.type);
    expect(plain.questions[0]).toMatchObject({ type: 'boolean', correct: true });
  });
});
