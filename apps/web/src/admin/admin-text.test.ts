import type { AdminLogEntry, Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { feedText } from '../feed/feed-text';
import { bytesText, durationText, kyivWhenText, logLine, questionConfirm, questionLines, uptimeText } from './admin-text';

const entry = (over: Partial<AdminLogEntry>): AdminLogEntry => ({ id: 'l1', at: '2026-11-01T10:00:00.000Z', admin: 'Адмін', kind: 'ban', target: 'Богдан', details: {}, ...over });
const base = { imageUrl: null, video: null, timeLimit: 30, points: 1000 };
const single: Question = { ...base, id: 'q1', type: 'single', text: 'Столиця?', options: [{ id: 'a', text: 'Київ' }, { id: 'b', text: 'Львів' }], correctId: 'a' };
const bool: Question = { ...base, id: 'q2', type: 'boolean', text: 'Земля кругла?', correct: true };

describe('questionConfirm', () => {
  it('says what goes with the question', () => {
    expect(questionConfirm('question', '')).toBe('Видалити це запитання? Скасувати не можна.');
    expect(questionConfirm('round', 'Розминка')).toContain('«Розминка»');
    expect(questionConfirm('category', '')).toContain('категор');
  });
  it('has no text when the button is off', () => {
    expect(questionConfirm('last_question', '')).toBeNull();
    expect(questionConfirm('not_found', '')).toBeNull();
    expect(questionConfirm('locked', '')).toBeNull();
  });
});

describe('logLine', () => {
  it('writes a ban with and without a reason', () => {
    expect(logLine(entry({ details: { reason: 'спам' } }))).toBe('Адмін заблокував(-ла) Богдан. Причина: спам');
    expect(logLine(entry({ details: { reason: null } }))).toBe('Адмін заблокував(-ла) Богдан');
    expect(logLine(entry({ kind: 'unban' }))).toBe('Адмін розблокував(-ла) Богдан');
  });
  it('writes the player card lines: manual experience with its sign and reason, grants, revokes, gifts, deletion', () => {
    expect(logLine(entry({ kind: 'xp_adjust', target: 'Оля', details: { amount: -50, reason: 'Помилка' } }))).toBe('Адмін змінив(-ла) досвід Оля: −50. Причина: Помилка');
    expect(logLine(entry({ kind: 'xp_adjust', target: 'Оля', details: { amount: 300, reason: 'Нагорода' } }))).toBe('Адмін змінив(-ла) досвід Оля: +300. Причина: Нагорода');
    expect(logLine(entry({ kind: 'achievement_grant', target: 'Оля', details: { achievementId: 'first_win' } }))).toBe('Адмін видав(-ла) Оля досягнення «Перша перемога»');
    expect(logLine(entry({ kind: 'achievement_revoke', target: 'Оля', details: { achievementId: 'first_win' } }))).toBe('Адмін забрав(-ла) у Оля досягнення «Перша перемога»');
    expect(logLine(entry({ kind: 'prize_gift', target: 'Оля', details: { title: 'Кубок' } }))).toBe('Адмін подарував(-ла) Оля приз «Кубок»');
    expect(logLine(entry({ kind: 'gift_revoke', target: 'Оля', details: { title: 'Кубок' } }))).toBe('Адмін забрав(-ла) у Оля подарунок «Кубок»');
    expect(logLine(entry({ kind: 'account_delete', target: 'Оля', details: { text: 'Оля' } }))).toBe('Адмін видалив(-ла) акаунт Оля');
    // Без ніку журнал каже email (нік цілі порожній, а акаунта вже немає); давній рядок без text — нік цілі.
    expect(logLine(entry({ kind: 'account_delete', target: '', details: { text: 'olia@example.com' } }))).toBe('Адмін видалив(-ла) акаунт olia@example.com');
    expect(logLine(entry({ kind: 'account_delete', target: 'Оля', details: {} }))).toBe('Адмін видалив(-ла) акаунт Оля');
    expect(logLine(entry({ kind: 'prize_gift', target: 'Оля', details: { title: 'Кубок', text: 'Вітаємо' } }))).toBe('Адмін подарував(-ла) Оля приз «Кубок». Підпис: «Вітаємо»');
    expect(logLine(entry({ kind: 'achievement_revoke', target: 'Оля', details: { achievementId: 'first_win', amount: 80 } }))).toBe('Адмін забрав(-ла) у Оля досягнення «Перша перемога». Досвід вирівняно до нуля: +80');
  });
  it('writes a quiz view', () => {
    expect(logLine(entry({ kind: 'quiz_view', target: 'Оля', details: { title: 'Карпати' } }))).toBe('Адмін переглянув(-ла) вікторину «Карпати» (Оля)');
  });
  it('writes a quiz delete', () => {
    expect(logLine(entry({ kind: 'quiz_delete', details: { title: 'Карпати' } }))).toBe('Адмін видалив(-ла) вікторину «Карпати» (Богдан)');
  });
});

describe('logLine for moderation', () => {
  it('writes the library and report lines', () => {
    expect(logLine(entry({ kind: 'library_hide', details: { title: 'Карпати' } }))).toBe('Адмін сховав(-ла) вікторину «Карпати» (Богдан)');
    expect(logLine(entry({ kind: 'library_restore', details: { title: 'Карпати' } }))).toBe('Адмін зняв(-ла) приховування з вікторини «Карпати» (Богдан)');
    expect(logLine(entry({ kind: 'report_dismiss' }))).toBe('Адмін відхилив(-ла) скаргу на Богдан');
    expect(logLine(entry({ kind: 'appeal_reject', details: { title: 'Карпати' } }))).toBe('Адмін відхилив(-ла) оскарження «Карпати» (Богдан)');
    expect(logLine(entry({ kind: 'avatar_reset' }))).toBe('Адмін скинув(-ла) аватар Богдан');
  });
  it('adds the old nickname to a nickname reset', () => {
    expect(logLine(entry({ kind: 'nickname_reset', details: { text: 'Ірися' } }))).toBe('Адмін скинув(-ла) нік Богдан (було: «Ірися»)');
    expect(logLine(entry({ kind: 'nickname_reset', details: {} }))).toBe('Адмін скинув(-ла) нік Богдан');
  });
  it('writes the bot lines with the title and the room code', () => {
    expect(logLine(entry({ admin: 'Оля', kind: 'bot_game_start', target: 'Квіз-бот', details: { title: 'Річки України 54', code: '123456' } }))).toBe('Оля запустив(-ла) гру бота «Річки України 54» (код 123456)');
    expect(logLine(entry({ admin: 'Оля', kind: 'bot_copy', target: 'Квіз-бот', details: { title: 'Карпати' } }))).toBe('Оля передав(-ла) боту копію «Карпати»');
    expect(logLine(entry({ admin: 'Оля', kind: 'bot_quiz_delete', target: 'Квіз-бот', details: { title: 'Карпати' } }))).toBe('Оля видалив(-ла) вікторину бота «Карпати»');
  });
  it('writes the bot schedule lines with the Kyiv time, the code and the reason', () => {
    const details = { title: 'Поліські озера 56', when: '2026-11-20T17:00:00.000Z' };
    expect(kyivWhenText('2026-11-20T17:00:00.000Z')).toBe('20 листопада 2026, 19:00 (Київ)');
    expect(logLine(entry({ admin: 'Оля', kind: 'bot_plan_create', target: 'Квіз-бот', details }))).toBe('Оля запланував(-ла) гру бота «Поліські озера 56» на 20 листопада 2026, 19:00 (Київ)');
    expect(logLine(entry({ admin: 'Оля', kind: 'bot_plan_update', target: 'Квіз-бот', details }))).toBe('Оля змінив(-ла) план гри бота «Поліські озера 56»: 20 листопада 2026, 19:00 (Київ)');
    expect(logLine(entry({ admin: 'Оля', kind: 'bot_plan_cancel', target: 'Квіз-бот', details }))).toBe('Оля скасував(-ла) гру бота «Поліські озера 56» (20 листопада 2026, 19:00 (Київ))');
    expect(logLine(entry({ admin: 'Квіз-бот', kind: 'bot_plan_run', target: 'Квіз-бот', details: { title: 'Поліські озера 56', code: '123456' } }))).toBe('Розклад: бот відкрив гру «Поліські озера 56» (код 123456)');
    expect(logLine(entry({ admin: 'Квіз-бот', kind: 'bot_plan_fail', target: 'Квіз-бот', details: { title: 'Поліські озера 56', reason: 'server_down' } }))).toBe('Розклад: гру бота «Поліські озера 56» не відкрито — сервер був недоступний');
  });
  it('62: writes the bot room lines with the code, the person and the lobby without a password', () => {
    const room = { title: 'Річки України 62', code: '123456' };
    expect(logLine(entry({ kind: 'bot_room_kick', target: 'Квіз-бот', details: { ...room, text: 'Оля' } }))).toBe('Адмін вилучив(-ла) Оля з гри бота (код 123456)');
    expect(logLine(entry({ kind: 'bot_room_release', target: 'Квіз-бот', details: { ...room, text: 'Оля' } }))).toBe('Адмін звільнив(-ла) місце Оля у грі бота (код 123456)');
    expect(logLine(entry({ kind: 'bot_room_skip', target: 'Квіз-бот', details: room }))).toBe('Адмін пропустив(-ла) запитання в грі бота (код 123456)');
    expect(logLine(entry({ kind: 'bot_room_time', target: 'Квіз-бот', details: room }))).toBe('Адмін додав(-ла) 30 с у грі бота (код 123456)');
    expect(logLine(entry({ kind: 'bot_room_end_round', target: 'Квіз-бот', details: room }))).toBe('Адмін завершив(-ла) раунд у грі бота (код 123456)');
    expect(logLine(entry({ kind: 'bot_room_lobby', target: 'Квіз-бот', details: { ...room, listed: false, locked: true } }))).toBe('Адмін змінив(-ла) лобі гри бота (код 123456): лише за кодом, з паролем');
    expect(logLine(entry({ kind: 'bot_room_lobby', target: 'Квіз-бот', details: { ...room, listed: true, locked: false } }))).toBe('Адмін змінив(-ла) лобі гри бота (код 123456): у списку лобі, без пароля');
  });
  it('shows a player without a nickname as the default name', () => {
    expect(logLine(entry({ kind: 'avatar_reset', target: '' }))).toBe('Адмін скинув(-ла) аватар Гравець');
  });
});

describe('logLine for games and announcements', () => {
  it('writes the game close with its title and code', () => {
    expect(logLine(entry({ admin: 'Оля', kind: 'game_close', details: { title: 'Карпати', code: '123456' } }))).toBe('Оля закрив(-ла) гру «Карпати» (код 123456)');
  });
  it('writes the announcement set and clear with the text', () => {
    expect(logLine(entry({ kind: 'announcement_set', details: { text: 'Субота — гра' } }))).toContain('«Субота — гра»');
    expect(logLine(entry({ kind: 'announcement_clear', details: { text: 'Субота — гра' } }))).toBe('Адмін прибрав(-ла) оголошення «Субота — гра»');
  });
  it('writes a push broadcast with its title and how many people get it', () => {
    expect(logLine(entry({ kind: 'push_broadcast', target: '', details: { title: 'Нова вікторина', count: 3 } }))).toBe('Адмін надіслав(-ла) розсилку «Нова вікторина», адресатів: 3');
  });
  it('writes the errors and backups lines (64)', () => {
    expect(logLine(entry({ kind: 'server_error_resolve', target: '', details: { title: 'http: boom' } }))).toBe('Адмін позначив(-ла) збій «http: boom» як вирішений');
    expect(logLine(entry({ kind: 'problem_resolve', target: '', details: { text: 'Кнопка не натискається' } }))).toBe('Адмін закрив(-ла) скаргу «Кнопка не натискається»');
    expect(logLine(entry({ kind: 'problem_reply', target: 'Оля', details: { text: 'Виправили, дякуємо!' } }))).toBe('Адмін відповів(-ла) Оля на скаргу: «Виправили, дякуємо!»');
    expect(logLine(entry({ kind: 'backup_now', target: '', details: {} }))).toBe('Адмін зробив(-ла) копію бази вручну');
  });
});

describe('durationText', () => {
  it('says minutes (at least 1) under an hour, then hours and minutes; never «щойно»', () => {
    expect(durationText(30_000)).toBe('1 хв');
    expect(durationText(12 * 60_000)).toBe('12 хв');
    expect(durationText(125 * 60_000)).toBe('2 год 5 хв');
    expect(durationText(-5)).toBe('1 хв');
  });
});

describe('bytesText', () => {
  it('shows megabytes with one decimal in the current language', () => {
    expect(bytesText(3_500_000)).toBe('3,3 МБ');
    expect(bytesText(0)).toBe('0 МБ');
  });
  it('shows «< 0,1 МБ» for tiny sizes and a dash for NaN, infinity or a negative size', () => {
    expect(bytesText(1_000)).toBe('< 0,1 МБ');
    expect(bytesText(104_857)).toBe('< 0,1 МБ');
    expect(bytesText(104_858)).toBe('0,1 МБ');
    expect(bytesText(Number.NaN)).toBe('—');
    expect(bytesText(Number.POSITIVE_INFINITY)).toBe('—');
    expect(bytesText(-1)).toBe('—');
  });
});

describe('uptimeText', () => {
  it('shows days and hours from an hour on, minutes below an hour', () => {
    expect(uptimeText(3 * 86_400 + 4 * 3_600 + 59)).toBe('3 д 4 год');
    expect(uptimeText(3_600)).toBe('0 д 1 год');
    expect(uptimeText(59)).toBe('0 хв');
    expect(uptimeText(42 * 60 + 5)).toBe('42 хв');
  });
});

describe('questionLines', () => {
  it('lists the text and the options', () => {
    expect(questionLines(single)).toEqual([single.text, ...single.options.map((o) => o.text)]);
    expect(questionLines(bool)).toEqual([bool.text]);
  });
});

describe('logLine for feed and group moderation (63)', () => {
  it('writes the feed event in words', () => {
    const feed = { kind: 'level' as const, level: 12 };
    const line = logLine(entry({ kind: 'feed_hide', target: 'Оля', details: { feed } }));
    expect(line).toContain(feedText(feed));
    expect(line).toBe(`Адмін сховав(-ла) подію стрічки Оля: ${feedText(feed)}`);
    expect(logLine(entry({ kind: 'feed_show', target: 'Оля', details: { feed } }))).toContain(feedText(feed));
  });
  it('adds the reason to a group hide', () => {
    expect(logLine(entry({ kind: 'group_hide', target: 'Оля', details: { title: 'Родина', reason: 'Образлива назва' } }))).toBe('Адмін сховав(-ла) групу «Родина» (Оля). Причина: Образлива назва');
    expect(logLine(entry({ kind: 'group_hide', target: 'Оля', details: { title: 'Родина', reason: null } }))).toBe('Адмін сховав(-ла) групу «Родина» (Оля)');
  });
  it('writes the owner transfer from the old owner to the new one', () => {
    expect(logLine(entry({ kind: 'group_owner_transfer', target: 'Петро', details: { title: 'Родина', text: 'Оля' } }))).toBe('Адмін передав(-ла) групу «Родина» від Оля до Петро');
  });
  it('writes the record lines and the other group lines', () => {
    expect(logLine(entry({ kind: 'group_item_hide', target: 'Петро', details: { title: 'Родина', text: 'Бабуся свистить' } }))).toContain('запис «Бабуся свистить» у групі «Родина»');
    for (const kind of ['group_restore', 'group_member_remove', 'group_delete', 'group_item_show'] as const) expect(logLine(entry({ kind, details: { title: 'Родина' } })), kind).toContain('«Родина»');
  });
});
