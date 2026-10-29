import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AdjustmentNotice, BlitzPlayer, BuffNotice, DebuffNotice, SplashView } from '@quiz/shared';
import { buffName } from '../buff-meta';
import { signed } from '../format';
import { t } from '../i18n';
import { undoNoticeText } from '../undo-panel';
import { useSplash } from './Splash';

/** Скільки сповіщення (бали від ведучого, баф) видно, мс. */
export const NOTICE_MS = 4000;

/**
 * Видиме сповіщення: нове (seq більший за вже показані) і молодше за NOTICE_MS за часом сервера; ховається таймером.
 * Після вилучення гравця сервер може знову віддати старіше коригування — воно не спливає вдруге.
 */
export function useNotice<T extends { seq: number; at: number }>(notice: T | null, offsetMs: number): T | null {
  const [shown, setShown] = useState<T | null>(null);
  // Зсув годинника доходить після першого зрізу; ефект читає найсвіжіший.
  const offsetRef = useRef(offsetMs);
  offsetRef.current = offsetMs;
  // Найбільший seq, що вже доходив; без сповіщення (нова гра) лічба починається знову.
  const maxSeqRef = useRef(0);
  const key = notice === null ? null : `${notice.seq}-${notice.at}`;
  useEffect(() => {
    if (notice === null) {
      maxSeqRef.current = 0;
      setShown(null);
      return;
    }
    // Старіше за вже показане — лише після вилучення автора новішого: його сповіщення ховається, старе не спливає.
    // Рівний seq — те саме сповіщення (seq у грі не повторюється): повторний запуск ефекту лише ставить таймер знову.
    if (notice.seq < maxSeqRef.current) {
      setShown(null);
      return;
    }
    maxSeqRef.current = notice.seq;
    const left = NOTICE_MS - (Date.now() + offsetRef.current - notice.at);
    if (left <= 0) {
      setShown(null);
      return;
    }
    setShown(notice);
    const timer = setTimeout(() => setShown(null), left);
    return () => clearTimeout(timer);
    // Ключ — єдина ознака нового сповіщення; notice і offsetMs читаються в мить його появи.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return shown;
}

/**
 * Стовпчик сповіщень (position: fixed, flex-колонка): сповіщення стоять одне під одним за своєю висотою,
 * тож і перенесені на два рядки ніколи не накладаються; нічого на екрані не зсувають.
 */
export function LiveNotices({ children }: { children: ReactNode }) {
  return <div className="live-notices">{children}</div>;
}

/** Сповіщення про бали від ведучого; у стовпчику .live-notices. */
export function AdjustmentToast({ notice, offsetMs, teams = false, rounds = 1 }: { notice: AdjustmentNotice | null; offsetMs: number; teams?: boolean; rounds?: number }) {
  const shown = useNotice(notice, offsetMs);
  if (shown === null) return null;
  if (shown.undo !== undefined) {
    return (
      <div className="live-notice is-undo" role="status" aria-live="polite">
        {undoNoticeText({ ...shown, undo: shown.undo }, { teams, rounds })}
      </div>
    );
  }
  return (
    <div className={shown.points > 0 ? 'live-notice is-up' : 'live-notice is-down'} role="status" aria-live="polite">
      {t('adjustNotice', { points: signed(shown.points), name: shown.nickname })}
    </div>
  );
}

/** Що BuffToast читає зі зрізу. */
export interface BuffToastView {
  buffNotice: BuffNotice | null;
  questionIndex: number;
  splash: SplashView | null;
  paused: boolean;
  autopilot: boolean;
}

/**
 * «Оля: 50/50» — хтось узяв баф («👀 Підгляд: Оля → Петро» — з ціллю «Підглянути»); у стовпчику .live-notices під сповіщенням балів.
 * Лише на запитанні, де баф узято, і не поверх заставки; тому, хто взяв баф (selfId), — ні: про це вже каже його рядок бафів.
 */
export function BuffToast({ view, offsetMs, selfId }: { view: BuffToastView; offsetMs: number; selfId?: string }) {
  const shown = useNotice(view.buffNotice, offsetMs);
  const splash = useSplash(view.splash, view.paused, offsetMs);
  if (shown === null || splash !== null) return null;
  if (shown.questionIndex !== view.questionIndex || shown.playerId === selfId) return null;
  return (
    <div className="live-notice is-buff" role="status" aria-live="polite">
      {shown.kind === 'peek' && shown.target !== null
        ? t('buffNoticePeek', { name: shown.nickname, target: shown.target.nickname })
        : t('buffNotice', { name: shown.nickname, buff: buffName(shown.kind, view.autopilot) })}
    </div>
  );
}

/**
 * «Оля насилає дебаф на гравця Петро» — сцена, пульт і телефони; без виду дебафу; у стовпчику .live-notices.
 * Жертві (selfId — ціль) — ні: свіжа покупка для неї означає, що дебаф чекає чи діє, а її банер сам назве покупця.
 */
export function DebuffToast({ notice, offsetMs, selfId }: { notice: DebuffNotice | null; offsetMs: number; selfId?: string }) {
  const shown = useNotice(notice, offsetMs);
  if (shown === null || shown.target.playerId === selfId) return null;
  return (
    <div className="live-notice is-debuff" role="status" aria-live="polite">
      {t('debuffBoughtNotice', { buyer: shown.buyer.nickname, target: shown.target.nickname })}
    </div>
  );
}

/**
 * Сповіщення тому, у кого підглянули (12h): «👀 У вашу відповідь підглянули: Оля» на NOTICE_MS (useNotice);
 * кожен seq — один раз. У командній грі його бачить уся команда-ціль (зріз me.peekedBy).
 */
export function PeekedToast({ peekedBy, offsetMs }: { peekedBy: { seq: number; at: number; nickname: string } | null; offsetMs: number }) {
  const shown = useNotice(peekedBy, offsetMs);
  if (shown === null) return null;
  return (
    <div className="live-notice is-peek" role="status" aria-live="polite">
      {t('peekedYou', { name: shown.nickname })}
    </div>
  );
}

/** Значки сцени: «🐞 Оля» біля кожного гравця з дебафом; без виду дебафу. */
export function StageDebuffs({ debuffs }: { debuffs: BlitzPlayer[] }) {
  if (debuffs.length === 0) return null;
  return (
    <ul className="stage-debuffs" aria-label={t('stageDebuffsLabel')}>
      {debuffs.map((player) => (
        <li key={player.playerId}>{`🐞 ${player.nickname}`}</li>
      ))}
    </ul>
  );
}
