import { useCallback, useEffect, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { checkCode, createGame, createQuiz } from './api';
import { demoQuiz } from './demo-quiz';
import { t } from './i18n';
import { clearLastGame, loadAuthor, loadHost, loadLastGame, saveHost, saveLastGame } from './storage';

/**
 * «Почати гру» з вікторини (спільне для «Мої вікторини» і /create): createGame → saveHost → saveLastGame → пульт ведучого.
 * Повертає null після переходу або код помилки сервера.
 */
export function useStartGame(): (quizId: string) => Promise<string | null> {
  const navigate = useNavigate();
  return useCallback(
    async (quizId: string) => {
      const result = await createGame(quizId);
      if (!result.ok) return result.error;
      saveHost(result.code, { hostToken: result.hostToken, stageToken: result.stageToken });
      saveLastGame(result.code);
      navigate(`/host/${result.code}`);
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
export function useRunningGame(enabled: boolean): string | null {
  const [running, setRunning] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const code = loadLastGame();
    if (code === null || (loadHost(code) === null && loadAuthor(code) === null)) return;
    let current = true;
    void checkCode(code).then((result) => {
      if (!current) return;
      if (result.ok && result.phase !== 'finished') setRunning(code);
      else if (!result.ok && result.error === 'offline') return;
      else clearLastGame();
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
    <Link className="banner" to={loadHost(running) === null && loadAuthor(running) !== null ? `/play/${running}` : `/host/${running}`}>
      {t('backToGame', { code: `${running.slice(0, 3)} ${running.slice(3)}` })}
    </Link>
  );
}
