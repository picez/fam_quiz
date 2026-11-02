import { describe, expect, it } from 'vitest';
import { feedIcon, feedText } from './feed-text';

describe('feedText', () => {
  it('writes a game with a place, a win, no place and a team', () => {
    expect(feedText({ kind: 'game', title: 'Писанки', place: 2, of: 5, team: null })).toBe('зіграв(-ла) «Писанки» — 2 місце з 5');
    expect(feedText({ kind: 'game', title: 'Писанки', place: 1, of: 5, team: null })).toBe('виграв(-ла) «Писанки»!');
    expect(feedIcon({ kind: 'game', title: 'Писанки', place: 1, of: 5, team: null })).toBe('🏆');
    expect(feedIcon({ kind: 'game', title: 'Писанки', place: 2, of: 5, team: null })).toBe('🎲');
    expect(feedText({ kind: 'game', title: 'Писанки', place: null, of: 5, team: null })).toBe('зіграв(-ла) «Писанки»');
    expect(feedText({ kind: 'game', title: 'Писанки', place: 2, of: 5, team: 'Соняшники' })).toBe('зіграв(-ла) «Писанки» — 2 місце з 5 у команді «Соняшники»');
  });

  it('writes achievements, levels and prizes', () => {
    expect(feedText({ kind: 'achievement', achievementId: 'first_win' })).toBe('отримав(-ла) досягнення «Перша перемога»');
    expect(feedText({ kind: 'level', level: 7 })).toBe('досяг(-ла) рівня 7');
    expect(feedIcon({ kind: 'level', level: 7 })).toBe('⭐');
    const prize = { kind: 'prize', place: 1, name: 'Кубок', title: 'Писанки', nickTitle: 'Знавець' } as const;
    expect(feedText(prize)).toBe('отримав(-ла) приз «Кубок» за 1 місце у «Писанки» і титул «Знавець»');
    expect(feedText({ ...prize, nickTitle: null })).toBe('отримав(-ла) приз «Кубок» за 1 місце у «Писанки»');
    expect(feedIcon(prize)).toBe('🎁');
  });

  it('writes likes to me', () => {
    expect(feedText({ kind: 'like', questions: 3, quiz: true, host: true, player: false, title: 'Писанки' })).toBe(
      'вподобав(-ла) 3 твої запитання, твою вікторину і тебе як ведучого у «Писанки»',
    );
    expect(feedText({ kind: 'like', questions: 5, quiz: false, host: false, player: false, title: 'Писанки' })).toBe('вподобав(-ла) 5 твоїх запитань у «Писанки»');
    expect(feedText({ kind: 'like', questions: 1, quiz: false, host: false, player: true, title: null })).toBe('вподобав(-ла) 1 твоє запитання і тебе як гравця');
    expect(feedIcon({ kind: 'like', questions: 1, quiz: false, host: false, player: false, title: null })).toBe('❤️');
  });

  it('writes a planned game in the zone of the viewer', () => {
    const data = { kind: 'planned', eventId: 'e1', title: 'Вечір загадок', startsAt: '2026-11-07T17:00:00.000Z' } as const;
    expect(feedText(data, 'Europe/Kyiv')).toBe('запланував(-ла) «Вечір загадок» на суботу, 7 листопада, 19:00');
    expect(feedIcon(data)).toBe('📅');
  });
});
