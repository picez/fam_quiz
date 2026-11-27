import { useCallback, useEffect, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { checkCode, continueGame, createGame, createQuiz, pickLeague } from './api';
import { demoQuiz } from './demo-quiz';
import type { RunningGame } from './home-next';
import { t } from './i18n';
import { clearLastGame, loadAuthor, loadHost, loadLastGame, saveAuthor, saveHost, saveLastGame, savePlayer } from './storage';

/**
 * «Почати гру» з вікторини (спільне для «Мої вікторини» і /create): createGame → saveHost → saveLastGame → пульт ведучого.
 * leagueGroupId (79, «Провести гру для групи») — одразу вибрати лігу цієї групи тим самим запитом, що й панель лобі;
 * збій вибору гру не зупиняє: ведучий бачить вибір у лобі. Повертає null після переходу або код помилки сервера.
 */
export function useStartGame(): (quizId: string, leagueGroupId?: string | null) => Promise<string | null> {
  const navigate = useNavigate();
  return useCallback(
    async (quizId: string, leagueGroupId?: string | null) => {
      const result = await createGame(quizId);
      if (!result.ok) return result.error;
      saveHost(result.code, { hostToken: result.hostToken, stageToken: result.stageToken });
      saveLastGame(result.code);
      if (leagueGroupId !== undefined && leagueGroupId !== null) await pickLeague(result.code, leagueGroupId).catch(() => null);
      navigate(`/host/${result.code}`);
      return null;
    },
    [navigate],
  );
}

/**
 * «Продовжити» збережену гру (13b; спільне для «Історії» і головної): continueGame → токени → пульт ведучого,
 * а для автопілота — телефон автора. Повертає null після переходу або код помилки сервера.
 */
export function useContinueSaved(): (gameId: string) => Promise<string | null> {
  const navigate = useNavigate();
  return useCallback(
    async (gameId: string) => {
      const result = await continueGame(gameId);
      if (!result.ok) return result.error;
      saveLastGame(result.code);
      if ('token' in result) {
        savePlayer(result.code, result.token);
        saveAuthor(result.code, { stageToken: result.stageToken });
        navigate(`/play/${result.code}`);
      } else {
        saveHost(result.code, { hostToken: result.hostToken, stageToken: result.stageToken });
        navigate(`/host/${result.code}`);
      }
      return null;
    },
    [navigate],
  );
}

/** «Додати приклад»: кладе демо-вікторину в акаунт; null — успіх, інакше код помилки. */
export async function addDemoQuiz(): Promise<string | null> {
  const result = await createQuiz(demoQuiz);
  return result.ok ? null : result.error;
}

/**
 * Гра, що триває на цьому пристрої (ведучий або автор-автопілот міг закрити вкладку посеред гри).
 * Закінчена чи невідома гра забувається; без зв'язку — нічого не показуємо, але й не забуваємо.
 */
export async function findRunningGame(): Promise<RunningGame | null> {
  const code = loadLastGame();
  if (code === null || (loadHost(code) === null && loadAuthor(code) === null)) return null;
  const result = await checkCode(code);
  // Ведучого — на пульт, а автора-автопілота (лише його ключ тут) — на телефон гравця.
  if (result.ok && result.phase !== 'finished') return { code, title: result.title, to: loadHost(code) === null ? `/play/${code}` : `/host/${code}` };
  if (result.ok || result.error !== 'offline') clearLastGame();
  return null;
}

/** Скільки спільна відповідь findRunningGame лишається свіжою: два монтування головної поспіль (гість → акаунт) питають раз. */
const RUNNING_MEMO_MS = 5_000;
let runningMemo: { code: string | null; at: number; promise: Promise<RunningGame | null> } | null = null;

/**
 * findRunningGame з пам'яттю на кілька секунд за кодом останньої гри: картка головної гостя й та сама картка
 * після входу (вхід розв'язався після 4 с очікування) ділять один checkCode. Інший код чи стара відповідь — питає знову.
 */
export function sharedRunningGame(): Promise<RunningGame | null> {
  const code = loadLastGame();
  const now = Date.now();
  if (runningMemo !== null && runningMemo.code === code && now - runningMemo.at < RUNNING_MEMO_MS) return runningMemo.promise;
  const promise = findRunningGame().catch(() => null);
  runningMemo = { code, at: now, promise };
  return promise;
}

/** Для тестів: забути спільну відповідь. */
export function forgetRunningGame(): void {
  runningMemo = null;
}

/** findRunningGame як стан компонента; enabled = false — нічого не питає. */
export function useRunningGame(enabled: boolean): RunningGame | null {
  const [running, setRunning] = useState<RunningGame | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void findRunningGame().then((game) => {
      if (current && game !== null) setRunning(game);
    });
    return () => {
      current = false;
    };
  }, [enabled]);
  return enabled ? running : null;
}

/** Банер «Повернутися до гри 123 456»: на пульт, а для автора-автопілота — на телефон гравця. */
export function RunningGameBanner({ enabled }: { enabled: boolean }): JSX.Element | null {
  const running = useRunningGame(enabled);
  if (running === null) return null;
  return (
    <Link className="banner" to={running.to}>
      {t('backToGame', { code: `${running.code.slice(0, 3)} ${running.code.slice(3)}` })}
    </Link>
  );
}
