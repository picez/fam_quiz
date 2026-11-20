import { DELETED_NICKNAME } from '@quiz/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { activateLocaleForTests, t } from '../i18n';
import { eventLine, priceText, replayTime, verdictText } from './replay-text';

// 12:00:05 UTC — у Києві взимку (UTC+2) 14:00:05.
const at = '2026-11-20T12:00:05.000Z';

describe('replayTime', () => {
  it('writes seconds with one decimal or a dash', () => {
    expect(replayTime(4000)).toBe('4,0');
    expect(replayTime(23_450)).toBe('23,5');
    expect(replayTime(null)).toBe('—');
  });
});

describe('verdictText', () => {
  it('names the verdict and marks a manual one', () => {
    expect(verdictText('partial', false)).toBe('частково');
    expect(verdictText('wrong', false)).toBe('не зараховано');
    expect(verdictText('none', false)).toBe('—');
    expect(verdictText('correct', true)).toBe('зараховано (вручну)');
  });
});

describe('priceText', () => {
  it('writes the price with its mark', () => {
    expect(priceText(100, 1)).toBe('Ціна: 100');
    expect(priceText(200, 2)).toBe('Ціна: 200 ×2');
    expect(priceText(300, 3)).toBe('Ціна: 300 ×3');
  });
});

describe('eventLine', () => {
  it('writes a host decision; an old game has a dash for the verdict before', () => {
    const line = eventLine({ kind: 'manual', nickname: 'Петро', from: null, to: 'correct' });
    expect(line).toContain('—');
    expect(line).toContain('зараховано');
    expect(line).toBe('Петро: ведучий вирішив вручну — — → зараховано');
    expect(eventLine({ kind: 'manual', nickname: 'Петро', from: 'wrong', to: 'partial' })).toBe('Петро: ведучий вирішив вручну — не зараховано → частково');
  });

  it('a host decision without an answer before it says so, not a dash', () => {
    expect(eventLine({ kind: 'manual', nickname: 'Петро', from: 'none', to: 'correct' })).toBe('Петро: ведучий вирішив вручну — без відповіді → зараховано');
  });

  it('an adjustment shows its target and what an undo reverses', () => {
    expect(eventLine({ kind: 'adjustment', nickname: 'Оля', source: 'debuff', points: -50, debuff: 'fog', target: 'Петро' })).toBe(`Оля: −50 — ${t('scoreSource_debuff')} (${t('debuff_fog')}) → Петро`);
    expect(eventLine({ kind: 'adjustment', nickname: 'Оля', source: 'duelbet', points: 100, target: DELETED_NICKNAME })).toBe(`Оля: +100 — ${t('scoreSource_duelbet')} → ${t('deletedPlayer')}`);
    expect(eventLine({ kind: 'adjustment', nickname: 'Оля', source: 'undo', points: -100, undoes: { question: 0 } })).toBe('Оля: −100 — Скасовано ведучим (запитання 1)');
    expect(eventLine({ kind: 'adjustment', nickname: 'Оля', source: 'undo', points: 70, undoes: { seq: 3 } })).toBe('Оля: +70 — Скасовано ведучим (коригування #3)');
  });

  it('writes an adjustment with the signed points and its source', () => {
    expect(eventLine({ kind: 'adjustment', nickname: 'Оля', source: 'undo', points: -100 })).toBe('Оля: −100 — Скасовано ведучим');
    expect(eventLine({ kind: 'adjustment', nickname: 'Оля', source: 'carry', points: 300 })).toBe('Оля: +300 — Перенесено з попередньої гри');
    expect(eventLine({ kind: 'adjustment', nickname: 'Оля', source: 'debuff', points: -50, debuff: 'fog' })).toContain(t('debuff_fog'));
  });

  it('writes buffs, debuffs and appeals', () => {
    expect(eventLine({ kind: 'buff', nickname: 'Оля', buff: 'double' })).toContain(t('buff_double'));
    expect(eventLine({ kind: 'debuff', nickname: 'Оля', debuff: 'fog' })).toBe(`Оля: дебаф «${t('debuff_fog')}»`);
    expect(eventLine({ kind: 'appeal', nickname: 'Оля', appeal: { reason: 'grade', yes: 2, no: 0, outcome: 'yes' } })).toBe(`Оля оскаржує: ${t('historyAppealYes', { yes: 2, no: 0 })}`);
  });

  it('writes joins and kicks with the Kyiv time', () => {
    expect(eventLine({ kind: 'join', nickname: 'Оля', at })).toBe('14:00:05 — приєднався(-лася) Оля');
    expect(eventLine({ kind: 'leave', nickname: 'Петро', at, score: -200 })).toBe('14:00:05 — вилучено Петро (рахунок −200)');
    expect(eventLine({ kind: 'leave', nickname: DELETED_NICKNAME, at, score: 0 })).toContain(t('deletedPlayer'));
  });

  it('writes a pause with its length, open to the end, or of unknown length after a save', () => {
    expect(eventLine({ kind: 'pause', at, ms: 30_000, ended: 'resume' })).toContain('30');
    expect(eventLine({ kind: 'pause', at, ms: 30_000, ended: 'resume' })).toBe('14:00:05 — пауза 30 с');
    expect(eventLine({ kind: 'pause', at, ms: null, ended: 'game' })).toBe('14:00:05 — пауза до кінця гри');
    expect(eventLine({ kind: 'pause', at, ms: null, ended: 'unknown' })).toBe('14:00:05 — пауза (тривалість невідома)');
  });

  describe('in a right-to-left language', () => {
    afterEach(() => activateLocaleForTests('uk'));

    it('isolates nicknames so the arrow keeps its direction', () => {
      activateLocaleForTests('ar', { ui: { adminReplayEventManual: '{name}: {from} ← {to}', adminReplayVerdict_wrong: 'w', adminReplayVerdict_correct: 'c' } });
      const fsi = String.fromCharCode(0x2068);
      const pdi = String.fromCharCode(0x2069);
      expect(eventLine({ kind: 'manual', nickname: 'Petro', from: 'wrong', to: 'correct' })).toBe(fsi + 'Petro' + pdi + ': w ← c');
      activateLocaleForTests('en', { ui: {} });
      expect(eventLine({ kind: 'buff', nickname: 'Petro', buff: 'double' })).not.toContain(fsi);
    });
  });
});
