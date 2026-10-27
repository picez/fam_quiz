import { useCallback, useEffect, useState } from 'react';
import { loadLiveWatch, saveLiveWatch } from '../storage';
import type { Send } from './types';
import type { Status } from './useGame';

/**
 * Перемикач «наживо» (12b): значення з пристрою; кожна зміна зберігається й іде на сервер (host:live-watch).
 * Після кожного (пере)підключення (status стає 'live') вибір оголошується знову: сервер типово вважає «вимкнено».
 */
export function useLiveWatch(send: Send, status: Status): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(loadLiveWatch);

  useEffect(() => {
    if (status === 'live') void send('host:live-watch', { on });
  }, [send, status, on]);

  const change = useCallback((next: boolean) => {
    saveLiveWatch(next);
    setOn(next);
  }, []);

  return [on, change];
}
