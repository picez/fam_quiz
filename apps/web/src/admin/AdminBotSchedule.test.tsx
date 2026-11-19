// @vitest-environment jsdom
import type { AdminBot, AdminBotPlan, AdminBotQuiz } from '@quiz/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminBotSchedule } from './AdminBotSchedule';

const QUIZ_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_QUIZ_ID = '44444444-4444-4444-8444-444444444444';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const OLYA = 'user-olya';
const OLEH = 'user-oleh';

const quiz = (over: Partial<AdminBotQuiz> = {}): AdminBotQuiz => ({ id: QUIZ_ID, title: 'Поліські озера', rounds: 2, questions: 10, truth: false, updatedAt: '2026-11-18T10:00:00.000Z', ...over });
const plan = (over: Partial<AdminBotPlan> = {}): AdminBotPlan => ({
  id: PLAN_ID,
  quizId: QUIZ_ID,
  title: 'Поліські озера',
  startsAt: '2026-11-20T17:00:00.000Z',
  to: { kind: 'none' },
  autoStartMin: null,
  weekly: false,
  status: 'scheduled',
  reason: null,
  code: null,
  ...over,
});
const schedule = (over: Partial<AdminBot['schedule']> = {}): AdminBot['schedule'] => ({
  plans: [],
  groups: [{ id: GROUP_ID, name: 'Малинські', emoji: '🌻', members: 4 }],
  max: 20,
  ...over,
});

type Reply = { status: number; body?: unknown };
let replies: Record<string, Reply>;
const calls: { method: string; url: string; body: unknown }[] = [];
const sent = (method: string, url: string) => calls.filter((call) => call.method === method && call.url === url);
let onChanged: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T10:00:00Z'));
  calls.length = 0;
  replies = {};
  onChanged = vi.fn<() => void>();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ method, url, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
      const reply = replies[`${method} ${url}`] ?? { status: 404, body: { error: 'not_found' } };
      return { status: reply.status, ok: reply.status < 400, json: async () => reply.body ?? {} };
    }),
  );
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const open = (data: AdminBot['schedule'] = schedule(), quizzes: AdminBotQuiz[] = [quiz(), quiz({ id: OTHER_QUIZ_ID, title: 'Карпати' })]) =>
  render(<AdminBotSchedule schedule={data} quizzes={quizzes} onChanged={onChanged} />);
const card = (title: string) => screen.getByRole('heading', { name: title }).closest('li') as HTMLElement;

describe('AdminBotSchedule', () => {
  it('plans a game for Kyiv time with a group and auto start', async () => {
    replies['POST /api/admin/bot/plans'] = { status: 201, body: plan() };
    open();
    fireEvent.change(screen.getByLabelText('Вікторина'), { target: { value: QUIZ_ID } });
    const when = screen.getByLabelText('Дата й час (за київським часом)');
    expect(when.getAttribute('type')).toBe('datetime-local');
    expect(when.getAttribute('min')).toBe('2026-11-20T12:00');
    fireEvent.change(when, { target: { value: '2026-11-20T19:00' } });
    expect(screen.getByRole('group', { name: 'Кому сповістити' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Родинній групі'));
    fireEvent.change(screen.getByLabelText('Група'), { target: { value: GROUP_ID } });
    fireEvent.click(screen.getByLabelText('Почати автоматично, якщо є гравці'));
    expect((screen.getByLabelText('Через скільки хвилин (5–30)') as HTMLInputElement).value).toBe('10');
    fireEvent.click(screen.getByLabelText('Повторювати щотижня в цей день і час'));
    fireEvent.click(screen.getByRole('button', { name: 'Запланувати' }));
    expect((await screen.findByRole('status')).textContent).toBe('Гру заплановано.');
    expect(sent('POST', '/api/admin/bot/plans')[0]?.body).toEqual({ quizId: QUIZ_ID, startsAt: '2026-11-20T17:00:00.000Z', recipients: { kind: 'group', groupId: GROUP_ID }, autoStartMin: 10, weekly: true });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('chooses people by nickname search and removes one', async () => {
    replies['GET /api/admin/bot/people?q=%D0%9E%D0%BB'] = {
      status: 200,
      body: [
        { id: OLYA, nickname: 'Оля', avatar: null },
        { id: OLEH, nickname: 'Олег', avatar: null },
      ],
    };
    replies['POST /api/admin/bot/plans'] = { status: 201, body: plan() };
    open();
    fireEvent.change(screen.getByLabelText('Дата й час (за київським часом)'), { target: { value: '2026-11-21T19:00' } });
    fireEvent.click(screen.getByLabelText('Вибраним людям'));
    fireEvent.change(screen.getByLabelText('Пошук за ніком'), { target: { value: 'О' } });
    fireEvent.change(screen.getByLabelText('Пошук за ніком'), { target: { value: 'Ол' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Оля' }));
    fireEvent.click(screen.getByRole('button', { name: 'Олег' }));
    expect(calls.filter((call) => call.url.startsWith('/api/admin/bot/people'))).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Прибрати Оля' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати Олег' }));
    expect(screen.queryByRole('button', { name: 'Прибрати Олег' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Запланувати' }));
    await screen.findByRole('status');
    expect(sent('POST', '/api/admin/bot/plans')[0]?.body).toMatchObject({ recipients: { kind: 'people', userIds: [OLYA] }, autoStartMin: null, weekly: false, startsAt: '2026-11-21T17:00:00.000Z' });
  });

  it('lists plans with state, reason, Kyiv time and actions only for scheduled', () => {
    open(
      schedule({
        plans: [
          plan({ title: 'Ранкова', to: { kind: 'group', groupId: GROUP_ID, name: 'Малинські' }, autoStartMin: 10, weekly: true }),
          plan({ id: 'p2', title: 'Відкрита', status: 'opened', code: '123456', to: { kind: 'all' } }),
          plan({ id: 'p3', title: 'Зламана', status: 'failed', reason: 'server_down', to: { kind: 'people', people: [{ id: OLYA, nickname: 'Оля' }, { id: OLEH, nickname: 'Олег' }] } }),
          plan({ id: 'p4', title: 'Порожня', status: 'nobody', to: { kind: 'group', groupId: '', name: null } }),
        ],
      }),
    );
    expect(screen.getByText('Активних: 1 з 20')).toBeTruthy();
    const scheduled = card('Ранкова');
    expect(within(scheduled).getByText('20 листопада 2026, 19:00 (Київ)')).toBeTruthy();
    expect(within(scheduled).getByText('Заплановано')).toBeTruthy();
    expect(within(scheduled).getByText('Група «Малинські»')).toBeTruthy();
    expect(within(scheduled).getByText('Автостарт через 10 хв')).toBeTruthy();
    expect(within(scheduled).getByText('Щотижня')).toBeTruthy();
    expect(within(scheduled).getByRole('button', { name: 'Змінити' })).toBeTruthy();
    expect(within(scheduled).getByRole('button', { name: 'Скасувати' })).toBeTruthy();
    const opened = card('Відкрита');
    expect(within(opened).getByText('Код 123456')).toBeTruthy();
    expect(within(opened).getByText('Відкрито')).toBeTruthy();
    expect(within(opened).getByText('Сповістити всіх')).toBeTruthy();
    expect(within(opened).queryAllByRole('button')).toEqual([]);
    const failed = card('Зламана');
    expect(within(failed).getByText('Не вдалося: сервер був недоступний')).toBeTruthy();
    expect(within(failed).getByText('Люди: Оля, Олег')).toBeTruthy();
    expect(within(failed).queryAllByRole('button')).toEqual([]);
    const nobody = card('Порожня');
    expect(within(nobody).getByText('Ніхто не прийшов')).toBeTruthy();
    expect(within(nobody).getByText('Групу видалено')).toBeTruthy();
    expect(within(nobody).queryAllByRole('button')).toEqual([]);
  });

  it('shows the empty list text', () => {
    open();
    expect(screen.getByText('Запланованих ігор немає.')).toBeTruthy();
    expect(screen.getByText('Активних: 0 з 20')).toBeTruthy();
  });

  it('change fills the form and saves with PUT', async () => {
    replies[`PUT /api/admin/bot/plans/${PLAN_ID}`] = { status: 200, body: plan() };
    open(schedule({ plans: [plan({ quizId: OTHER_QUIZ_ID, title: 'Карпати', to: { kind: 'people', people: [{ id: OLYA, nickname: 'Оля' }] }, autoStartMin: 15, weekly: true })] }));
    fireEvent.click(within(card('Карпати')).getByRole('button', { name: 'Змінити' }));
    expect(screen.getByRole('heading', { name: 'Змінити план' })).toBeTruthy();
    expect((screen.getByLabelText('Вікторина') as HTMLSelectElement).value).toBe(OTHER_QUIZ_ID);
    expect((screen.getByLabelText('Дата й час (за київським часом)') as HTMLInputElement).value).toBe('2026-11-20T19:00');
    expect((screen.getByLabelText('Вибраним людям') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Прибрати Оля' })).toBeTruthy();
    expect((screen.getByLabelText('Через скільки хвилин (5–30)') as HTMLInputElement).value).toBe('15');
    expect((screen.getByLabelText('Повторювати щотижня в цей день і час') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Не змінювати' }));
    expect(screen.getByRole('heading', { name: 'Запланувати гру' })).toBeTruthy();
    expect((screen.getByLabelText('Дата й час (за київським часом)') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Нікому') as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('button', { name: 'Не змінювати' })).toBeNull();
    fireEvent.click(within(card('Карпати')).getByRole('button', { name: 'Змінити' }));
    fireEvent.change(screen.getByLabelText('Дата й час (за київським часом)'), { target: { value: '2026-11-22T18:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти зміни' }));
    await waitFor(() => expect(sent('PUT', `/api/admin/bot/plans/${PLAN_ID}`)).toHaveLength(1));
    expect(sent('PUT', `/api/admin/bot/plans/${PLAN_ID}`)[0]?.body).toEqual({ quizId: OTHER_QUIZ_ID, startsAt: '2026-11-22T16:30:00.000Z', recipients: { kind: 'people', userIds: [OLYA] }, autoStartMin: 15, weekly: true });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('heading', { name: 'Запланувати гру' })).toBeTruthy();
  });

  it('a plan whose group was deleted opens in the form without a crash', () => {
    open(schedule({ plans: [plan({ to: { kind: 'group', groupId: '', name: null } })] }));
    fireEvent.click(screen.getByRole('button', { name: 'Змінити' }));
    expect((screen.getByLabelText('Родинній групі') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Група') as HTMLSelectElement).value).toBe(GROUP_ID);
  });

  it('cancel asks first', async () => {
    replies[`POST /api/admin/bot/plans/${PLAN_ID}/cancel`] = { status: 204 };
    const confirm = vi.mocked(window.confirm);
    confirm.mockReturnValue(false);
    open(schedule({ plans: [plan({ title: 'Карпати', weekly: true })] }));
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(confirm).toHaveBeenLastCalledWith('Скасувати гру «Карпати» 20 листопада 2026, 19:00 (Київ)? Повтор теж зупиниться.');
    expect(calls).toEqual([]);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    await waitFor(() => expect(sent('POST', `/api/admin/bot/plans/${PLAN_ID}/cancel`)).toHaveLength(1));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('errors are shown', async () => {
    replies['POST /api/admin/bot/plans'] = { status: 409, body: { error: 'plans_full' } };
    open();
    fireEvent.change(screen.getByLabelText('Дата й час (за київським часом)'), { target: { value: '2026-11-21T19:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запланувати' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Уже 20 запланованих ігор. Скасуй одну, щоб додати нову.');
    replies['POST /api/admin/bot/plans'] = { status: 400, body: { error: 'plan_time' } };
    await waitFor(() => expect(screen.getByRole('button', { name: 'Запланувати' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Запланувати' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Обери час у майбутньому, не далі ніж за 60 днів.'));
  });

  it('no bot quiz — a hint instead of the form', () => {
    open(schedule(), []);
    expect(screen.getByText('Спершу передай боту вікторину.')).toBeTruthy();
    expect(screen.queryByLabelText('Вікторина')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Запланувати' })).toBeNull();
  });

  it('no groups — the group choice is disabled', () => {
    open(schedule({ groups: [] }));
    expect((screen.getByLabelText('Родинній групі') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Родинних груп ще немає.')).toBeTruthy();
  });
});
