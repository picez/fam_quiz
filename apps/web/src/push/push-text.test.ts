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
});
