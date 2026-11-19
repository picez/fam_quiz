import { useCallback, useEffect, useState, type JSX } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BOT_NICKNAME, BOT_USER_ID, type AdminBotQuiz, type AdminBotRoom, type AdminBotStatus, type BotAction } from '@quiz/shared';
import { listQuizzes, type ApiResult, type QuizSummary } from '../api';
import { formatDay, quizSizeText } from '../format';
import { countText, errorText, t, type TextKey } from '../i18n';
import { Avatar } from '../profile/Avatar';
import { adminBot, botRoomAct, copyToBot, deleteBotQuiz, startBotGame } from './admin-api';
import { AdminBotSchedule } from './AdminBotSchedule';
import { useAdminData } from './useAdminData';

const STATUS_KEY: Record<AdminBotStatus, TextKey> = {
  lobby: 'adminBotLobby',
  playing: 'adminBotPlaying',
  paused: 'adminBotPaused',
  finished: 'adminBotFinished',
};

/** Кнопки кімнати за станом; «Завершити гру» в лобі закриває лобі. Кінець — без кнопок. */
const ROOM_ACTIONS: Record<AdminBotStatus, { action: BotAction; key: TextKey }[]> = {
  lobby: [
    { action: 'start', key: 'adminBotStart' },
    { action: 'end', key: 'adminBotEnd' },
  ],
  playing: [
    { action: 'pause', key: 'adminBotPause' },
    { action: 'end', key: 'adminBotEnd' },
  ],
  paused: [
    { action: 'resume', key: 'adminBotResume' },
    { action: 'end', key: 'adminBotEnd' },
  ],
  finished: [],
};

const sizeText = (quiz: AdminBotQuiz): string =>
  t('adminBotSize', { rounds: countText('adminBotRounds', quiz.rounds, { count: quiz.rounds }), questions: quizSizeText(countText('questionCount', quiz.questions, { count: quiz.questions }), quiz.questions, quiz.truth) });

type Mine = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; quizzes: QuizSummary[] };

/** Свої вікторини адміна для «Передати боту копію». */
function useMine(): Mine & { reload: () => void } {
  const [mine, setMine] = useState<Mine>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    void listQuizzes().then((result) => {
      if (!current) return;
      setMine(result.ok ? { status: 'ready', quizzes: result.data } : { status: 'error', message: errorText(result.error) });
    });
    return () => {
      current = false;
    };
  }, [version]);
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  return { ...mine, reload };
}

export function AdminBot(): JSX.Element {
  const state = useAdminData(adminBot, 'bot', { keep: true });
  const mine = useMine();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { reload } = state;

  /**
   * Одна дія за раз; після будь-якої відповіді списки перечитуються. 404 дії — це кімната, що вже закрилась,
   * чи вікторина, яку вже видалили: показуємо gone. Якщо ж адмінки для акаунта більше немає, 404 повторного
   * читання списку бота (useAdminData) веде додому.
   */
  const run = async <T,>(send: () => Promise<ApiResult<T>>, gone: TextKey, done: (result: { ok: true } & T) => string | null) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await send();
    setBusy(false);
    if (result.ok) setNotice(done(result));
    else setError(result.error === 'not_found' ? t(gone) : errorText(result.error));
    reload();
    if (!result.ok && result.error === 'not_found') mine.reload();
  };

  const act = (room: AdminBotRoom, action: BotAction) => {
    if (action === 'end' && !window.confirm(t('adminBotEndConfirm', { code: room.code, title: room.title }))) return;
    void run(() => botRoomAct(room.code, action), 'err_game_not_found', () => null);
  };
  const launch = (quiz: AdminBotQuiz) => void run(() => startBotGame(quiz.id), 'err_quiz_not_found', (result) => t('adminBotLaunched', { code: result.code }));
  const remove = (quiz: AdminBotQuiz) => {
    if (!window.confirm(t('adminBotDeleteConfirm', { title: quiz.title }))) return;
    void run(() => deleteBotQuiz(quiz.id), 'err_quiz_not_found', () => null);
  };
  const copy = (quiz: QuizSummary) => void run(() => copyToBot(quiz.id), 'err_quiz_not_found', () => t('adminBotCopied', { title: quiz.title }));

  if (state.status === 'home') return <Navigate to="/" replace />;
  return (
    <div className="admin-bot">
      {state.status === 'ready' && (
        <div className="admin-bot-head">
          <Avatar profile={{ id: BOT_USER_ID, nickname: state.data.bot.nickname ?? BOT_NICKNAME, avatar: null }} size="medium" />
          <div>
            <p className="admin-bot-name" dir="auto">
              {state.data.bot.nickname ?? BOT_NICKNAME}
            </p>
            <p className="meta">{t('adminBotLead')}</p>
          </div>
        </div>
      )}
      <div className="admin-actions admin-bot-bar">
        <button type="button" className="btn" onClick={reload}>
          {t('adminBotRefresh')}
        </button>
      </div>
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
      {state.status === 'loading' && <p className="meta">{t('loading')}</p>}
      {state.status === 'error' && (
        <>
          <p className="error" role="alert">
            {state.message}
          </p>
          <button type="button" className="btn" onClick={reload}>
            {t('prizesRetry')}
          </button>
        </>
      )}
      {state.status === 'ready' && (
        <>
          <section aria-labelledby="admin-bot-rooms">
            <h2 id="admin-bot-rooms">{t('adminBotRooms')}</h2>
            <p className="meta">{t('adminBotRoomsCount', { count: state.data.rooms.filter((room) => room.status !== 'finished').length, max: state.data.roomsMax })}</p>
            {state.data.rooms.length === 0 ? (
              <p className="meta">{t('adminBotRoomsEmpty')}</p>
            ) : (
              <ul className="admin-list">
                {state.data.rooms.map((room) => (
                  <li key={room.code} className="admin-card">
                    <p className="admin-bot-code">{t('adminBotCode', { code: room.code })}</p>
                    <h3 dir="auto">{room.title}</h3>
                    <p className="admin-mark">{t(STATUS_KEY[room.status])}</p>
                    <p>{t('adminBotPlayers', { online: room.players.online, total: room.players.total })}</p>
                    <div className="admin-actions">
                      <a className="btn" href={room.stageUrl} target="_blank" rel="noopener noreferrer">
                        {t('adminBotStage')}
                      </a>
                      {room.status !== 'finished' && (
                        <Link className="btn" to={`/play/${encodeURIComponent(room.code)}`}>
                          {t('adminBotJoin')}
                        </Link>
                      )}
                      {ROOM_ACTIONS[room.status].map(({ action, key }) => (
                        <button key={action} type="button" className={action === 'end' ? 'btn btn-danger' : action === 'start' ? 'btn btn-primary' : 'btn'} disabled={busy} onClick={() => act(room, action)}>
                          {t(key)}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <AdminBotSchedule schedule={state.data.schedule} quizzes={state.data.quizzes} onChanged={reload} />
          <section aria-labelledby="admin-bot-quizzes">
            <h2 id="admin-bot-quizzes">{t('adminBotQuizzes')}</h2>
            {state.data.quizzes.length === 0 ? (
              <p className="meta">{t('adminBotQuizzesEmpty')}</p>
            ) : (
              <ul className="admin-list">
                {state.data.quizzes.map((quiz) => (
                  <li key={quiz.id} className="admin-card">
                    <h3 dir="auto">{quiz.title}</h3>
                    <p className="meta">{sizeText(quiz)}</p>
                    <p className="meta">{formatDay(quiz.updatedAt)}</p>
                    <div className="admin-actions">
                      <Link className="btn" to={`/admin/bot/quizzes/${encodeURIComponent(quiz.id)}`}>
                        {t('adminView')}
                      </Link>
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => launch(quiz)}>
                        {t('adminBotLaunch')}
                      </button>
                      <button type="button" className="btn btn-danger" disabled={busy} onClick={() => remove(quiz)}>
                        {t('adminBotDelete')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <section aria-labelledby="admin-bot-copy">
        <h2 id="admin-bot-copy">{t('adminBotCopyTitle')}</h2>
        <p className="meta">{t('adminBotCopyHint')}</p>
        {mine.status === 'loading' && <p className="meta">{t('loading')}</p>}
        {mine.status === 'error' && (
          <>
            <p className="error">{mine.message}</p>
            <button type="button" className="btn" onClick={mine.reload}>
              {t('prizesRetry')}
            </button>
          </>
        )}
        {mine.status === 'ready' &&
          (mine.quizzes.length === 0 ? (
            <p className="meta">{t('adminBotMineEmpty')}</p>
          ) : (
            <ul className="admin-list">
              {mine.quizzes.map((quiz) => (
                <li key={quiz.id} className="admin-card">
                  <h3 dir="auto">{quiz.title}</h3>
                  <p className="meta">{quizSizeText(countText('questionCount', quiz.questionCount, { count: quiz.questionCount }), quiz.questionCount, quiz.truth)}</p>
                  <div className="admin-actions">
                    <button type="button" className="btn" disabled={busy} onClick={() => copy(quiz)}>
                      {t('adminBotCopy')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ))}
      </section>
    </div>
  );
}
