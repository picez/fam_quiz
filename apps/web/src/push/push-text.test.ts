import { describe, expect, it } from 'vitest';
import { dayHeading } from '../calendar/calendar-time';
import { pushNotice } from './push-text';

const zone = 'Europe/Kyiv';
const now = new Date('2026-11-07T10:00:00.000Z');

describe('pushNotice', () => {
  it('builds the reminder', () => {
    expect(
      pushNotice({ kind: 'reminder', eventId: 'E', title: 'Вечір загадок', startsAt: '2026-11-07T17:00:00.000Z' }, zone, now),
    ).toEqual({
      title: 'Скоро гра «Вечір загадок»',
      body: 'Початок о 19:00. Не запізнюйся!',
      url: '/feed/calendar#event-E',
      tag: 'event-E',
    });
  });

  it('builds the opened notice with the room link', () => {
    expect(pushNotice({ kind: 'opened', eventId: 'E', title: 'Вечір загадок', code: '123456' }, zone, now)).toEqual({
      title: 'Гра «Вечір загадок» почалась',
      body: 'Ведучий відкрив гру. Торкнися, щоб приєднатися.',
      url: '/play/123456',
      tag: 'event-E',
    });
  });

  it('builds the cancelled notice with day and time', () => {
    const startsAt = '2026-11-08T16:30:00.000Z';
    const n = pushNotice({ kind: 'cancelled', eventId: 'E', title: 'Вечір загадок', startsAt }, zone, now);
    expect(n.title).toBe('Гру «Вечір загадок» скасовано');
    expect(n.body).toBe('Ведучий скасував гру ' + dayHeading(startsAt, zone, now) + ', 18:30.');
    expect(n.url).toBe('/feed/calendar#event-E');
  });

  it("a broadcast shows the admin's words as they are", () => {
    const payload = { kind: 'broadcast' as const, broadcastId: 'B', title: 'Нова вікторина', text: 'Заходь у бібліотеку', url: '/library', locale: 'en' as const };
    expect(pushNotice(payload, zone, now)).toEqual({ title: 'Нова вікторина', body: 'Заходь у бібліотеку', url: '/library', tag: 'broadcast-B' });
    expect(pushNotice({ ...payload, url: null }, zone, now).url).toBe('/');
  });

  it('the bot push: soon with the time, then open with the code', () => {
    const soon = { kind: 'bot' as const, planId: 'P', title: 'Поліські озера', startsAt: '2026-11-20T17:00:00.000Z', code: null };
    expect(pushNotice(soon, zone, now)).toEqual({
      title: 'Квіз-бот відкриває гру «Поліські озера» о 19:00 (Київ)',
      body: 'Код прийде окремим сповіщенням, щойно кімната відкриється.',
      url: '/',
      tag: 'bot-P',
    });
    expect(pushNotice({ ...soon, code: '123456' }, zone, now)).toEqual({
      title: 'Квіз-бот відкрив гру «Поліські озера»',
      body: 'Код: 123456. Торкнися, щоб приєднатися.',
      url: '/play/123456',
      tag: 'bot-P',
    });
    const en = pushNotice({ ...soon, locale: 'en' }, zone, now);
    expect(en.title).toContain('Quiz bot');
    expect(en.title).toContain('19:00');
    expect(en.title).toContain('(Kyiv)');
  });

  it('the bot soon push shows Kyiv time with the label on a device in another zone', () => {
    const soon = { kind: 'bot' as const, planId: 'P', title: 'Поліські озера', startsAt: '2026-11-20T17:00:00.000Z', code: null };
    expect(pushNotice(soon, 'Europe/Warsaw', now).title).toBe('Квіз-бот відкриває гру «Поліські озера» о 19:00 (Київ)');
    expect(pushNotice({ ...soon, locale: 'pl' }, 'America/New_York', now).title).toBe('Bot quizu otwiera „Поліські озера” o 19:00 (Kijów)');
  });
});
