import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react';
import { BOT_PLAN_AUTO_MAX, BOT_PLAN_AUTO_MIN, BOT_PLAN_PEOPLE_MAX, type AdminBot, type AdminBotGroup, type AdminBotPerson, type AdminBotPlan, type AdminBotPlanTo, type AdminBotQuiz, type BotPlanInput, type BotPlanStatus } from '@quiz/shared';
import type { ApiResult } from '../api';
import { isoToLocalInput, KYIV_ZONE, localInputToIso } from '../calendar/calendar-time';
import { errorText, t, type TextKey } from '../i18n';
import { nickText } from '../nick';
import { cancelBotPlan, createBotPlan, searchBotPeople, updateBotPlan } from './admin-api';
import { botPlanReasonText, kyivWhenText } from './admin-text';

const AUTO_DEFAULT = 10;
const SEARCH_MIN = 2;
const SEARCH_DELAY_MS = 300;

const STATUS_KEY: Record<BotPlanStatus, TextKey> = {
  scheduled: 'adminBotPlan_scheduled',
  opened: 'adminBotPlan_opened',
  played: 'adminBotPlan_played',
  nobody: 'adminBotPlan_nobody',
  cancelled: 'adminBotPlan_cancelled',
  failed: 'adminBotPlan_failed',
};

/** Колір стану (56): тема-залежні змінні; nobody, cancelled і not_started — приглушені, не червоні. */
const STATUS_TONE: Record<BotPlanStatus, string> = {
  scheduled: 'is-pending',
  opened: 'is-opened',
  played: 'is-correct',
  nobody: 'is-muted',
  cancelled: 'is-muted',
  failed: 'is-wrong',
};

type ToKind = AdminBotPlanTo['kind'];
const TO_KINDS: { kind: ToKind; key: TextKey }[] = [
  { kind: 'none', key: 'adminBotPlanToNone' },
  { kind: 'all', key: 'adminBotPlanToAll' },
  { kind: 'group', key: 'adminBotPlanToGroup' },
  { kind: 'people', key: 'adminBotPlanToPeople' },
];

interface Person {
  id: string;
  nickname: string;
}

/** Стан форми; `editing` — id плану, який змінюють (null — новий план). `when` — значення datetime-local у Києві. */
interface Form {
  editing: string | null;
  quizId: string;
  when: string;
  to: ToKind;
  groupId: string;
  people: Person[];
  auto: boolean;
  autoMin: string;
  weekly: boolean;
  /** 62: відкрита кімната — у списку лобі (типово так). */
  listed: boolean;
}

const known = <T extends { id: string }>(list: T[], wanted: string | null): string => (wanted !== null && list.some((item) => item.id === wanted) ? wanted : (list[0]?.id ?? ''));

const blank = (quizzes: AdminBotQuiz[], groups: AdminBotGroup[]): Form => ({
  editing: null,
  quizId: known(quizzes, null),
  when: '',
  to: 'none',
  groupId: known(groups, null),
  people: [],
  auto: false,
  autoMin: String(AUTO_DEFAULT),
  weekly: false,
  listed: true,
});

/** План у форму; видалена група (groupId '') чи вікторина — перша наявна, щоб форма не ламалась. */
function fromPlan(plan: AdminBotPlan, quizzes: AdminBotQuiz[], groups: AdminBotGroup[]): Form {
  const { to } = plan;
  return {
    editing: plan.id,
    quizId: known(quizzes, plan.quizId),
    when: isoToLocalInput(plan.startsAt, KYIV_ZONE),
    to: to.kind,
    groupId: known(groups, to.kind === 'group' ? to.groupId : null),
    people: to.kind === 'people' ? to.people : [],
    auto: plan.autoStartMin !== null,
    autoMin: String(plan.autoStartMin ?? AUTO_DEFAULT),
    weekly: plan.weekly,
    // Сервер до 62 поля не шле — такий план видимий.
    listed: plan.listed !== false,
  };
}

function autoMinutes(form: Form): number | null | undefined {
  if (!form.auto) return null;
  const minutes = Number(form.autoMin);
  return Number.isInteger(minutes) && minutes >= BOT_PLAN_AUTO_MIN && minutes <= BOT_PLAN_AUTO_MAX ? minutes : undefined;
}

/** Готовий запит або null, поки форма неповна (немає часу, групи, людей чи хвилини поза 5–30). */
function toInput(form: Form): BotPlanInput | null {
  const startsAt = localInputToIso(form.when, KYIV_ZONE);
  const autoStartMin = autoMinutes(form);
  if (form.quizId === '' || startsAt === null || autoStartMin === undefined) return null;
  const recipients: BotPlanInput['recipients'] | null =
    form.to === 'group'
      ? form.groupId === ''
        ? null
        : { kind: 'group', groupId: form.groupId }
      : form.to === 'people'
        ? form.people.length === 0
          ? null
          : { kind: 'people', userIds: form.people.map((person) => person.id) }
        : { kind: form.to };
  if (recipients === null) return null;
  return { quizId: form.quizId, startsAt, recipients, autoStartMin, weekly: form.weekly, listed: form.listed };
}

function toText(to: AdminBotPlanTo): string {
  switch (to.kind) {
    case 'none':
      return t('adminBotPlanToShownNone');
    case 'all':
      return t('adminBotPlanToShownAll');
    case 'group':
      return to.name === null ? t('adminBotPlanGroupGone') : t('adminBotPlanToShownGroup', { name: to.name });
    case 'people':
      return t('adminBotPlanToShownPeople', { names: to.people.map((person) => nickText(person.nickname)).join(', ') });
  }
}

/** «Ніхто не почав гру» — не збій сервера: власний текст замість «Не вдалося: …». */
const notStarted = (plan: AdminBotPlan): boolean => plan.status === 'failed' && plan.reason === 'not_started';

function statusText(plan: AdminBotPlan): string {
  if (notStarted(plan)) return t('adminBotPlan_not_started');
  return plan.status === 'failed' ? t('adminBotPlan_failed', { reason: botPlanReasonText(plan.reason) }) : t(STATUS_KEY[plan.status]);
}

const toneOf = (plan: AdminBotPlan): string => (notStarted(plan) ? 'is-muted' : STATUS_TONE[plan.status]);

/** Пошук людей за ніком: від двох символів, із затримкою; помилка — текстом. */
function usePeopleSearch(query: string): { found: AdminBotPerson[]; error: string | null } {
  const [state, setState] = useState<{ found: AdminBotPerson[]; error: string | null }>({ found: [], error: null });
  useEffect(() => {
    const q = query.trim();
    if (q.length < SEARCH_MIN) {
      setState({ found: [], error: null });
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      void searchBotPeople(q).then((result) => {
        if (current) setState(result.ok ? { found: result.data, error: null } : { found: [], error: errorText(result.error) });
      });
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);
  return state;
}

export function AdminBotSchedule({ schedule, quizzes, onChanged }: { schedule: AdminBot['schedule']; quizzes: AdminBotQuiz[]; onChanged: () => void }): JSX.Element {
  const { plans, groups, max } = schedule;
  const [draft, setForm] = useState<Form>(() => blank(quizzes, groups));
  /** Після перечитування вікторина чи група могла зникнути — тоді форма бере першу наявну. */
  const form: Form = { ...draft, quizId: known(quizzes, draft.quizId), groupId: known(groups, draft.groupId) };
  const [query, setQuery] = useState('');
  const search = usePeopleSearch(form.to === 'people' ? query : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Форма згорнута за кнопкою «Запланувати гру»: на 360 px список видно одразу (56). */
  const [open, setOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const wantFocus = useRef(false);

  const patch = (change: Partial<Form>) => setForm((prev) => ({ ...prev, ...change }));
  const reset = () => {
    setForm(blank(quizzes, groups));
    setQuery('');
    setOpen(false);
  };
  /** Форму щойно відкрили («Запланувати гру» чи «Змінити») — фокус на її заголовок. */
  useEffect(() => {
    if (!open || !wantFocus.current) return;
    wantFocus.current = false;
    heading.current?.focus();
  }, [open, draft.editing]);
  /** План, який змінюють, тим часом відкрив прогін (чи скасували деінде): форма його відпускає з поясненням замість 409. */
  const stale = draft.editing !== null && !plans.some((plan) => plan.id === draft.editing && plan.status === 'scheduled');
  useEffect(() => {
    if (!stale) return;
    reset();
    setNotice(null);
    setError(t('err_plan_locked'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- лише коли план став незмінним
  }, [stale]);
  const input = toInput(form);
  const active = plans.filter((plan) => plan.status === 'scheduled').length;
  const found = search.found.filter((person) => !form.people.some((chosen) => chosen.id === person.id));
  const peopleFull = form.people.length >= BOT_PLAN_PEOPLE_MAX;
  const autoBad = form.auto && autoMinutes(form) === undefined;

  /** Одна дія за раз; після будь-якої відповіді вкладка перечитує розклад. */
  const run = async (send: () => Promise<ApiResult<unknown>>, done: string | null, clear: boolean) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await send();
    setBusy(false);
    if (result.ok) {
      setNotice(done);
      if (clear) reset();
    } else setError(errorText(result.error));
    onChanged();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (input === null || busy) return;
    const editing = form.editing;
    void run(() => (editing === null ? createBotPlan(input) : updateBotPlan(editing, input)), t('adminBotPlanSaved'), true);
  };
  const change = (plan: AdminBotPlan) => {
    setForm(fromPlan(plan, quizzes, groups));
    setQuery('');
    setError(null);
    setNotice(null);
    setOpen(true);
    wantFocus.current = true;
    heading.current?.focus();
  };
  const openNew = () => {
    setError(null);
    setNotice(null);
    setOpen(true);
    wantFocus.current = true;
  };
  const cancel = (plan: AdminBotPlan) => {
    if (!window.confirm(t('adminBotPlanCancelConfirm', { title: plan.title, when: kyivWhenText(plan.startsAt) }))) return;
    void run(() => cancelBotPlan(plan.id), null, form.editing === plan.id);
  };

  return (
    <section className="admin-bot-schedule" aria-labelledby="admin-bot-schedule">
      <h2 id="admin-bot-schedule">{t('adminBotSchedule')}</h2>
      <p className="meta">{t('adminBotScheduleLead')}</p>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice !== null && (
        <p className="meta" role="status">
          {notice}
        </p>
      )}
      <p className="meta">{t('adminBotPlansCount', { count: active, max })}</p>
      {plans.length === 0 ? (
        <p className="meta">{t('adminBotPlansEmpty')}</p>
      ) : (
        <ul className="admin-list">
          {plans.map((plan) => (
            <li key={plan.id} className={plan.id === form.editing ? 'admin-card is-editing' : 'admin-card'}>
              <h3 dir="auto">{plan.title}</h3>
              <p>{kyivWhenText(plan.startsAt)}</p>
              <p className={`admin-mark tag ${toneOf(plan)}`}>{statusText(plan)}</p>
              {plan.status === 'opened' && plan.code !== null && <p className="admin-bot-code">{t('adminBotCode', { code: plan.code })}</p>}
              <p className="meta" dir="auto">
                {toText(plan.to)}
              </p>
              {plan.autoStartMin !== null && <p className="meta">{t('adminBotPlanAutoShown', { minutes: plan.autoStartMin })}</p>}
              {plan.weekly && <p className="meta">{t('adminBotPlanWeeklyShown')}</p>}
              {plan.listed === false && <p className="meta">{t('adminBotPlanUnlisted')}</p>}
              {plan.status === 'scheduled' && (
                <div className="admin-actions">
                  <button type="button" className="btn" disabled={busy} onClick={() => change(plan)}>
                    {t('adminBotPlanChange')}
                  </button>
                  <button type="button" className="btn btn-danger" disabled={busy} onClick={() => cancel(plan)}>
                    {t('adminBotPlanCancel')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {quizzes.length === 0 ? (
        <p className="meta">{t('adminBotPlanNoQuizzes')}</p>
      ) : !open ? (
        <div className="admin-actions">
          <button type="button" className="btn btn-primary" aria-expanded={false} onClick={openNew}>
            {t('adminBotPlanNew')}
          </button>
        </div>
      ) : (
        <form className="admin-card admin-bot-plan-form" aria-labelledby="admin-bot-plan-form" onSubmit={submit}>
          <h3 id="admin-bot-plan-form" ref={heading} tabIndex={-1}>
            {t(form.editing === null ? 'adminBotPlanNew' : 'adminBotPlanEdit')}
          </h3>
          <label className="field compact" htmlFor="bot-plan-quiz">
            <span>{t('adminBotPlanQuiz')}</span>
            <select id="bot-plan-quiz" value={form.quizId} onChange={(e) => patch({ quizId: e.target.value })}>
              {quizzes.map((quiz) => (
                <option key={quiz.id} value={quiz.id}>
                  {quiz.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field compact" htmlFor="bot-plan-when">
            <span>{t('adminBotPlanWhen')}</span>
            <input id="bot-plan-when" type="datetime-local" required value={form.when} min={isoToLocalInput(new Date().toISOString(), KYIV_ZONE)} onChange={(e) => patch({ when: e.target.value })} />
          </label>
          <fieldset className="admin-bot-plan-to">
            <legend>{t('adminBotPlanTo')}</legend>
            {TO_KINDS.map(({ kind, key }) => (
              <label key={kind} className="field field-check" htmlFor={`bot-plan-to-${kind}`}>
                <input id={`bot-plan-to-${kind}`} type="radio" name="bot-plan-to" checked={form.to === kind} disabled={kind === 'group' && groups.length === 0} onChange={() => patch({ to: kind })} />
                {t(key)}
              </label>
            ))}
            {groups.length === 0 && <p className="meta">{t('adminBotPlanNoGroups')}</p>}
            {form.to === 'group' && groups.length > 0 && (
              <label className="field compact" htmlFor="bot-plan-group">
                <span>{t('adminBotPlanGroup')}</span>
                <select id="bot-plan-group" value={form.groupId} onChange={(e) => patch({ groupId: e.target.value })}>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {`${group.emoji} ${group.name}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {form.to === 'people' && (
              <>
                {form.people.length > 0 && (
                  <ul className="admin-bot-people">
                    {form.people.map((person) => (
                      <li key={person.id}>
                        <span dir="auto">{nickText(person.nickname)}</span>
                        <button type="button" className="btn btn-small" aria-label={t('adminBotPlanRemove', { name: nickText(person.nickname) })} onClick={() => patch({ people: form.people.filter((chosen) => chosen.id !== person.id) })}>
                          <span aria-hidden="true">×</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="field compact" htmlFor="bot-plan-search">
                  <span>{t('adminBotPlanSearch')}</span>
                  <input id="bot-plan-search" type="search" value={query} maxLength={40} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
                </label>
                {search.error !== null && <p className="error">{search.error}</p>}
                {found.length > 0 && (
                  <ul className="admin-bot-found">
                    {found.map((person) => (
                      <li key={person.id}>
                        <button type="button" className="btn btn-small" dir="auto" disabled={peopleFull} onClick={() => patch({ people: [...form.people, { id: person.id, nickname: person.nickname }] })}>
                          {nickText(person.nickname)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </fieldset>
          <label className="field field-check" htmlFor="bot-plan-auto">
            <input id="bot-plan-auto" type="checkbox" checked={form.auto} onChange={(e) => patch({ auto: e.target.checked })} />
            {t('adminBotPlanAuto')}
          </label>
          {form.auto && (
            <label className="field compact" htmlFor="bot-plan-auto-min">
              <span>{t('adminBotPlanAutoAfter')}</span>
              <input id="bot-plan-auto-min" type="number" inputMode="numeric" min={BOT_PLAN_AUTO_MIN} max={BOT_PLAN_AUTO_MAX} step={1} required aria-invalid={autoBad} value={form.autoMin} onChange={(e) => patch({ autoMin: e.target.value })} />
            </label>
          )}
          <label className="field field-check" htmlFor="bot-plan-weekly">
            <input id="bot-plan-weekly" type="checkbox" checked={form.weekly} onChange={(e) => patch({ weekly: e.target.checked })} />
            {t('adminBotPlanWeekly')}
          </label>
          <label className="field field-check" htmlFor="bot-plan-listed">
            <input id="bot-plan-listed" type="checkbox" checked={form.listed} onChange={(e) => patch({ listed: e.target.checked })} />
            {t('adminBotListed')}
          </label>
          <div className="admin-actions">
            <button type="submit" className="btn btn-primary" disabled={busy || input === null} aria-describedby={input === null ? 'bot-plan-missing' : undefined}>
              {t(form.editing === null ? 'adminBotPlanSave' : 'adminBotPlanSaveEdit')}
            </button>
            {form.editing !== null && (
              <button type="button" className="btn" disabled={busy} onClick={reset}>
                {t('adminBotPlanKeep')}
              </button>
            )}
          </div>
          {input === null && (
            <p className="meta" id="bot-plan-missing">
              {t('adminBotPlanMissing')}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
