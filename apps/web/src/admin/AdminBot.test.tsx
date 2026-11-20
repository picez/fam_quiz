// @vitest-environment jsdom
import type { AdminBot as AdminBotData, AdminBotQuiz, AdminBotRoom } from '@quiz/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorText, t } from '../i18n';
import { AdminBot } from './AdminBot';

const QUIZ_ID = '11111111-1111-4111-8111-111111111111';
const OWN_ID = '22222222-2222-4222-8222-222222222222';

const room = (over: Partial<AdminBotRoom> = {}): AdminBotRoom => ({
  code: '123456',
  title: 'Річки України',
  status: 'lobby',
  players: { online: 1, total: 2 },
  stageUrl: '/stage/123456#tok',
  openedAt: '2026-11-19T09:00:00.000Z',
  question: false,
  inRound: false,
  lobby: { listed: true, password: null },
  people: [],
  teams: null,
  continued: false,
  ...over,
});
const quiz = (over: Partial<AdminBotQuiz> = {}): AdminBotQuiz => ({ id: QUIZ_ID, title: 'Річки України', rounds: 2, questions: 10, truth: false, updatedAt: '2026-11-18T10:00:00.000Z', check: null, ...over });
const bot = (over: Partial<AdminBotData> = {}): AdminBotData => ({ bot: { nickname: 'Квіз-бот', ready: true }, quizzes: [quiz()], rooms: [], roomsMax: 3, schedule: { plans: [], groups: [], max: 20 }, ...over });

type Reply = { status: number; body?: unknown };
let replies: Record<string, Reply | (() => Reply)>;
const calls: { method: string; url: string; body: unknown }[] = [];
const sent = (method: string, url: string) => calls.filter((call) => call.method === method && call.url === url);

beforeEach(() => {
  calls.length = 0;
  replies = {
    'GET /api/admin/bot': { status: 200, body: bot() },
    'GET /api/quizzes': { status: 200, body: [] },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ method, url, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
      const found = replies[`${method} ${url}`];
      const reply = typeof found === 'function' ? found() : (found ?? { status: 404, body: { error: 'not_found' } });
      return { status: reply.status, ok: reply.status < 400, json: async () => reply.body ?? {} };
    }),
  );
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const open = () =>
  render(
    <MemoryRouter initialEntries={['/admin/bot']}>
      <Routes>
        <Route path="/admin/bot" element={<AdminBot />} />
        <Route path="/" element={<p>головна</p>} />
      </Routes>
    </MemoryRouter>,
  );
/** The tab's one live status line, mounted empty from the start. */
const notice = () => document.querySelector('.admin-bot-notice') as HTMLElement;
const card = (code: string) => screen.getByText(`Код ${code}`).closest('li') as HTMLElement;

describe('AdminBot', () => {
  it('lists the bot rooms with actions by state', async () => {
    replies['GET /api/admin/bot'] = { status: 200, body: bot({ rooms: [room(), room({ code: '654321', title: 'Карпати', status: 'paused', stageUrl: '/stage/654321#t2' })] }) };
    open();
    await screen.findByText('Код 123456');
    expect(screen.getByText('2 з 3')).toBeTruthy();
    const lobby = card('123456');
    expect(within(lobby).getByText('Лобі')).toBeTruthy();
    expect(within(lobby).getByText("Гравці: 1 на зв'язку з 2")).toBeTruthy();
    expect(within(lobby).getByRole('button', { name: 'Почати гру' })).toBeTruthy();
    expect(within(lobby).getByRole('button', { name: 'Завершити гру' })).toBeTruthy();
    expect(within(lobby).queryByRole('button', { name: 'Пауза' })).toBeNull();
    expect(within(lobby).getByRole('link', { name: 'Приєднатися як гравець' }).getAttribute('href')).toBe('/play/123456');
    const stage = within(lobby).getByRole('link', { name: 'Відкрити сцену' });
    expect(stage.getAttribute('href')).toBe('/stage/123456#tok');
    expect(stage.getAttribute('target')).toBe('_blank');
    const paused = card('654321');
    expect(within(paused).getByRole('button', { name: 'Продовжити' })).toBeTruthy();
    expect(within(paused).getByRole('button', { name: 'Завершити гру' })).toBeTruthy();
    expect(within(paused).queryByRole('button', { name: 'Почати гру' })).toBeNull();
  });

  it('a playing room pauses, a finished one has no buttons, and an action reloads', async () => {
    replies['GET /api/admin/bot'] = { status: 200, body: bot({ rooms: [room({ status: 'playing' }), room({ code: '654321', status: 'finished' })] }) };
    replies['POST /api/admin/bot/rooms/123456/pause'] = { status: 204 };
    open();
    await screen.findByText('Код 123456');
    expect(within(card('654321')).queryAllByRole('button')).toEqual([]);
    expect(within(card('654321')).getByText('Кінець')).toBeTruthy();
    fireEvent.click(within(card('123456')).getByRole('button', { name: 'Пауза' }));
    await waitFor(() => expect(sent('GET', '/api/admin/bot')).toHaveLength(2));
    expect(sent('POST', '/api/admin/bot/rooms/123456/pause')).toHaveLength(1);
  });

  it('a room command posts its body and reloads', async () => {
    replies['GET /api/admin/bot'] = { status: 200, body: bot({ rooms: [room({ people: [{ id: 'p1', nickname: 'Оля', online: true, team: null }] })] }) };
    replies['POST /api/admin/bot/rooms/123456/kick'] = { status: 204 };
    replies['PUT /api/admin/bot/rooms/123456/lobby'] = { status: 409, body: { error: 'wrong_phase' } };
    open();
    await screen.findByText('Код 123456');
    expect(notice().getAttribute('role')).toBe('status');
    expect(notice().textContent).toBe('');
    fireEvent.click(within(card('123456')).getByRole('button', { name: 'Вилучити' }));
    expect(window.confirm).toHaveBeenLastCalledWith('Вилучити гравця «Оля» із гри?');
    await waitFor(() => expect(sent('GET', '/api/admin/bot')).toHaveLength(2));
    expect(sent('POST', '/api/admin/bot/rooms/123456/kick')[0]?.body).toEqual({ playerId: 'p1' });
    await waitFor(() => expect((within(card('123456')).getByLabelText('Показувати в списку лобі') as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(within(card('123456')).getByLabelText('Показувати в списку лобі'));
    expect((await screen.findByRole('alert')).textContent).toBe(t('err_wrong_phase'));
    expect(sent('PUT', '/api/admin/bot/rooms/123456/lobby')[0]?.body).toEqual({ listed: false, password: null });
    await waitFor(() => expect(sent('GET', '/api/admin/bot')).toHaveLength(3));
  });

  it('a saved lobby says so and the bare actions post no body', async () => {
    replies['GET /api/admin/bot'] = { status: 200, body: bot({ rooms: [room()] }) };
    replies['PUT /api/admin/bot/rooms/123456/lobby'] = { status: 200, body: { listed: true, password: 'сова62' } };
    open();
    await screen.findByText('Код 123456');
    fireEvent.change(within(card('123456')).getByLabelText('Пароль гри (необов’язково)'), { target: { value: 'сова62' } });
    fireEvent.click(within(card('123456')).getByRole('button', { name: 'Зберегти пароль' }));
    await waitFor(() => expect(notice().textContent).toBe('Збережено'));
    expect(sent('PUT', '/api/admin/bot/rooms/123456/lobby')[0]?.body).toEqual({ listed: true, password: 'сова62' });
  });

  it('shows the empty rooms text', async () => {
    open();
    expect(await screen.findByText('Зараз кімнат бота немає.')).toBeTruthy();
    expect(screen.getByText('0 з 3')).toBeTruthy();
  });

  it('starting a quiz shows the new code and reloads', async () => {
    replies[`POST /api/admin/bot/quizzes/${QUIZ_ID}/games`] = { status: 201, body: { code: '654321', stageUrl: '/stage/654321#t' } };
    open();
    const item = (await screen.findByRole('heading', { name: 'Річки України' })).closest('li') as HTMLElement;
    expect(within(item).getByText('2 раунди · 10 запитань')).toBeTruthy();
    fireEvent.click(within(item).getByRole('button', { name: 'Запустити гру' }));
    expect((await screen.findByText('Кімнату 654321 створено.')).getAttribute('role')).toBe('status');
    expect(sent('POST', `/api/admin/bot/quizzes/${QUIZ_ID}/games`)).toHaveLength(1);
    await waitFor(() => expect(sent('GET', '/api/admin/bot')).toHaveLength(2));
  });

  it('a full bot shows the reason', async () => {
    replies[`POST /api/admin/bot/quizzes/${QUIZ_ID}/games`] = { status: 409, body: { error: 'bot_rooms_full' } };
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Запустити гру' }));
    expect((await screen.findByRole('alert')).textContent).toBe(errorText('bot_rooms_full'));
    expect(errorText('bot_rooms_full')).toBe('У бота вже три кімнати. Заверши одну, щоб запустити нову.');
  });

  it('copying an own quiz to the bot', async () => {
    replies['GET /api/quizzes'] = { status: 200, body: [{ id: OWN_ID, title: 'Карпати', description: '', questionCount: 5, truth: false, updatedAt: '2026-11-17T10:00:00.000Z' }] };
    replies['POST /api/admin/bot/copies'] = { status: 201, body: { id: '33333333-3333-4333-8333-333333333333' } };
    open();
    const own = (await screen.findByRole('heading', { name: 'Карпати' })).closest('li') as HTMLElement;
    fireEvent.click(within(own).getByRole('button', { name: 'Передати боту копію' }));
    expect((await screen.findByText('Копію «Карпати» передано боту.')).getAttribute('role')).toBe('status');
    expect(sent('POST', '/api/admin/bot/copies')[0]?.body).toEqual({ quizId: OWN_ID });
    await waitFor(() => expect(sent('GET', '/api/admin/bot')).toHaveLength(2));
  });

  it('shows the hints when the bot and the admin have no quizzes', async () => {
    replies['GET /api/admin/bot'] = { status: 200, body: bot({ quizzes: [] }) };
    open();
    expect(await screen.findByText(/seed:demo --bot/)).toBeTruthy();
    expect(await screen.findByText('У тебе ще немає вікторин.')).toBeTruthy();
  });

  it('ending and deleting ask first', async () => {
    replies['GET /api/admin/bot'] = { status: 200, body: bot({ rooms: [room({ status: 'playing' })] }) };
    replies['POST /api/admin/bot/rooms/123456/end'] = { status: 204 };
    replies[`DELETE /api/admin/bot/quizzes/${QUIZ_ID}`] = { status: 204 };
    const confirm = vi.mocked(window.confirm);
    confirm.mockReturnValue(false);
    open();
    await screen.findByText('Код 123456');
    fireEvent.click(within(card('123456')).getByRole('button', { name: 'Завершити гру' }));
    expect(confirm).toHaveBeenLastCalledWith('Завершити гру 123456 «Річки України»? Гравці побачать кінець гри.');
    fireEvent.click(screen.getByRole('button', { name: 'Видалити' }));
    expect(confirm).toHaveBeenLastCalledWith('Видалити вікторину бота «Річки України»? Це не скасувати.');
    expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
    confirm.mockReturnValue(true);
    fireEvent.click(within(card('123456')).getByRole('button', { name: 'Завершити гру' }));
    await waitFor(() => expect(sent('POST', '/api/admin/bot/rooms/123456/end')).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Видалити' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Видалити' }));
    await waitFor(() => expect(sent('DELETE', `/api/admin/bot/quizzes/${QUIZ_ID}`)).toHaveLength(1));
  });

  it('the schedule sits between the bot rooms and the bot quizzes', async () => {
    open();
    const schedule = await screen.findByRole('heading', { name: 'Розклад' });
    const rooms = screen.getByRole('heading', { name: 'Кімнати бота' });
    const quizzes = screen.getByRole('heading', { name: 'Вікторини бота' });
    expect(rooms.compareDocumentPosition(schedule) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(schedule.compareDocumentPosition(quizzes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(schedule.closest('section')?.classList.contains('admin-bot-schedule')).toBe(true);
  });

  it('each bot quiz has a preview link', async () => {
    const other = '33333333-3333-4333-8333-333333333333';
    replies['GET /api/admin/bot'] = { status: 200, body: bot({ quizzes: [quiz(), quiz({ id: other, title: 'Карпати' })] }) };
    open();
    const first = (await screen.findByRole('heading', { name: 'Річки України' })).closest('li') as HTMLElement;
    expect(within(first).getByRole('link', { name: 'Переглянути: Річки України' }).getAttribute('href')).toBe(`/admin/bot/quizzes/${QUIZ_ID}`);
    const second = screen.getByRole('heading', { name: 'Карпати' }).closest('li') as HTMLElement;
    expect(within(second).getByRole('link', { name: 'Переглянути: Карпати' }).getAttribute('href')).toBe(`/admin/bot/quizzes/${other}`);
  });

  it('the bot avatar is the bot picture', async () => {
    open();
    await screen.findByText('Квіз-бот');
    const img = document.querySelector('.admin-bot-head img[src="/quiz-bot.svg"]');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toContain('Квіз-бот');
  });

  it('a not_found sends the visitor home', async () => {
    replies['GET /api/admin/bot'] = { status: 404, body: { error: 'not_found' } };
    open();
    expect(await screen.findByText('головна')).toBeTruthy();
  });

  it('a room that already closed shows an error and reloads, the admin stays', async () => {
    replies['GET /api/admin/bot'] = { status: 200, body: bot({ rooms: [room({ status: 'playing' })] }) };
    replies['POST /api/admin/bot/rooms/123456/pause'] = { status: 404, body: { error: 'not_found' } };
    open();
    await screen.findByText('Код 123456');
    fireEvent.click(within(card('123456')).getByRole('button', { name: 'Пауза' }));
    expect((await screen.findByRole('alert')).textContent).toBe(t('err_game_not_found'));
    await waitFor(() => expect(sent('GET', '/api/admin/bot')).toHaveLength(2));
    expect(screen.queryByText('головна')).toBeNull();
  });

  it('a bot quiz deleted elsewhere shows an error and reloads, the admin stays', async () => {
    replies[`POST /api/admin/bot/quizzes/${QUIZ_ID}/games`] = { status: 404, body: { error: 'not_found' } };
    replies[`DELETE /api/admin/bot/quizzes/${QUIZ_ID}`] = { status: 404, body: { error: 'not_found' } };
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Запустити гру' }));
    expect((await screen.findByRole('alert')).textContent).toBe(t('err_quiz_not_found'));
    await waitFor(() => expect(sent('GET', '/api/admin/bot')).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Видалити' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Видалити' }));
    await waitFor(() => expect(sent('GET', '/api/admin/bot')).toHaveLength(3));
    expect(screen.getByRole('alert').textContent).toBe(t('err_quiz_not_found'));
    expect(screen.queryByText('головна')).toBeNull();
  });

  it('an own quiz deleted in another tab shows an error and reloads both lists', async () => {
    replies['GET /api/quizzes'] = { status: 200, body: [{ id: OWN_ID, title: 'Карпати', description: '', questionCount: 5, truth: false, updatedAt: '2026-11-17T10:00:00.000Z' }] };
    replies['POST /api/admin/bot/copies'] = { status: 404, body: { error: 'not_found' } };
    open();
    const own = (await screen.findByRole('heading', { name: 'Карпати' })).closest('li') as HTMLElement;
    fireEvent.click(within(own).getByRole('button', { name: 'Передати боту копію' }));
    expect((await screen.findByRole('alert')).textContent).toBe(t('err_quiz_not_found'));
    await waitFor(() => expect(sent('GET', '/api/quizzes')).toHaveLength(2));
    expect(screen.queryByText('головна')).toBeNull();
  });

  it('a lost admin right still goes home after an action', async () => {
    let admin = true;
    replies['GET /api/admin/bot'] = () => (admin ? { status: 200, body: bot({ rooms: [room({ status: 'playing' })] }) } : { status: 404, body: { error: 'not_found' } });
    replies['POST /api/admin/bot/rooms/123456/pause'] = () => {
      admin = false;
      return { status: 404, body: { error: 'not_found' } };
    };
    open();
    await screen.findByText('Код 123456');
    fireEvent.click(within(card('123456')).getByRole('button', { name: 'Пауза' }));
    expect(await screen.findByText('головна')).toBeTruthy();
  });

  it('only start is the main button; pause and resume are plain, end is the danger one', async () => {
    replies['GET /api/admin/bot'] = { status: 200, body: bot({ rooms: [room(), room({ code: '222222', status: 'playing' }), room({ code: '333333', status: 'paused' })] }) };
    open();
    await screen.findByText('Код 123456');
    expect(within(card('123456')).getByRole('button', { name: 'Почати гру' }).className).toBe('btn btn-primary');
    expect(within(card('222222')).getByRole('button', { name: 'Пауза' }).className).toBe('btn');
    expect(within(card('333333')).getByRole('button', { name: 'Продовжити' }).className).toBe('btn');
    expect(within(card('333333')).getByRole('button', { name: 'Завершити гру' }).className).toBe('btn btn-danger');
  });

  it('a bot_unavailable error has its own text', async () => {
    replies['POST /api/admin/bot/copies'] = { status: 409, body: { error: 'bot_unavailable' } };
    replies['GET /api/quizzes'] = { status: 200, body: [{ id: OWN_ID, title: 'Карпати', description: '', questionCount: 5, truth: false, updatedAt: '2026-11-17T10:00:00.000Z' }] };
    open();
    const own = (await screen.findByRole('heading', { name: 'Карпати' })).closest('li') as HTMLElement;
    fireEvent.click(within(own).getByRole('button', { name: 'Передати боту копію' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Акаунт бота недоступний: його пошту займає інший користувач.');
    expect(errorText('bot_unavailable')).not.toBe(t('err_unknown'));
  });

  it('a bot quiz with errors shows ⚠ N', async () => {
    replies['GET /api/admin/bot'] = {
      status: 200,
      body: bot({
        quizzes: [
          quiz({ check: { errors: 3, warnings: 0 } }),
          quiz({ id: '44444444-4444-4444-8444-444444444444', title: 'Карпати', check: { errors: 0, warnings: 2 } }),
          quiz({ id: '55555555-5555-4555-8555-555555555555', title: 'Дніпро', check: null }),
        ],
      }),
    };
    open();
    const item = (await screen.findByRole('heading', { name: 'Річки України' })).closest('li') as HTMLElement;
    const badge = within(item).getByText('⚠ 3');
    expect(badge.getAttribute('aria-label')).toBe(t('adminCheckBadge', { count: 3 }));
    expect(screen.getAllByText(/⚠/)).toHaveLength(1);
    expect(within(item).getByRole('link', { name: 'Переглянути: Річки України' })).toBeTruthy();
  });

  it('launching a quiz with errors asks first', async () => {
    replies['GET /api/admin/bot'] = { status: 200, body: bot({ quizzes: [quiz({ check: { errors: 3, warnings: 0 } })] }) };
    replies[`POST /api/admin/bot/quizzes/${QUIZ_ID}/games`] = { status: 201, body: { code: '654321', stageUrl: '/stage/654321#t' } };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Запустити гру' }));
    expect(confirm).toHaveBeenCalledWith(t('adminCheckLaunchConfirm', { title: 'Річки України', count: 3 }));
    expect(sent('POST', `/api/admin/bot/quizzes/${QUIZ_ID}/games`)).toHaveLength(0);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Запустити гру' }));
    await screen.findByText('Кімнату 654321 створено.');
    expect(sent('POST', `/api/admin/bot/quizzes/${QUIZ_ID}/games`)).toHaveLength(1);
  });

  it('launching a quiz without errors does not ask', async () => {
    replies['GET /api/admin/bot'] = { status: 200, body: bot({ quizzes: [quiz({ check: { errors: 0, warnings: 1 } })] }) };
    replies[`POST /api/admin/bot/quizzes/${QUIZ_ID}/games`] = { status: 201, body: { code: '654321', stageUrl: '/stage/654321#t' } };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Запустити гру' }));
    await screen.findByText('Кімнату 654321 створено.');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('a check from the list reloads the bot list', async () => {
    replies[`POST /api/admin/quizzes/${QUIZ_ID}/check`] = { status: 200, body: { quizId: QUIZ_ID, checkedAt: '2026-11-19T10:00:00.000Z', errors: 1, warnings: 0, issues: [] } };
    open();
    const item = (await screen.findByRole('heading', { name: 'Річки України' })).closest('li') as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Перевірити: Річки України' }));
    await waitFor(() => expect(sent('POST', `/api/admin/quizzes/${QUIZ_ID}/check`)).toHaveLength(1));
    await waitFor(() => expect(sent('GET', '/api/admin/bot')).toHaveLength(2));
  });
});
