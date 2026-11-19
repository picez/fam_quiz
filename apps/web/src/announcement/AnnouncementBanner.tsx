import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { Announcement } from '@quiz/shared';
import { getAnnouncement } from '../api';
import { loadAnnouncementSeen, saveAnnouncementSeen } from '../storage';
import { AnnouncementView } from './AnnouncementView';

/** Довше за добу один таймер не ставимо (setTimeout обмежений): за добу він спрацьовує, і строк перевіряється знову. */
const TIMER_HORIZON_MS = 24 * 60 * 60 * 1000;

/**
 * 53: оголошення адміна над сторінкою (не в грі). Один запит на монтування WithMenu; помилка — без банера.
 * Хрестик запам'ятовує id на пристрої; нове оголошення має новий id і з'являється знову.
 */
export function AnnouncementBanner(): JSX.Element | null {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  useEffect(() => {
    let alive = true;
    void getAnnouncement()
      .then((result) => {
        if (!alive || !result.ok) return;
        // Тіло без поля чи з null — оголошення немає (а не виняток у промісі).
        const found = result.data?.announcement ?? null;
        if (found === null || found.id === loadAnnouncementSeen()) return;
        if (found.expiresAt !== null && Date.parse(found.expiresAt) <= Date.now()) return;
        setAnnouncement(found);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const expiresAt = announcement?.expiresAt ?? null;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (expiresAt === null) return;
    const left = Date.parse(expiresAt) - Date.now();
    if (left <= 0) {
      setAnnouncement(null);
      return;
    }
    const timer = setTimeout(() => setTick((n) => n + 1), Math.min(left, TIMER_HORIZON_MS));
    return () => clearTimeout(timer);
  }, [expiresAt, tick]);
  if (announcement === null) return null;
  const close = () => {
    saveAnnouncementSeen(announcement.id);
    setAnnouncement(null);
  };
  return <AnnouncementView announcement={announcement} onClose={close} />;
}
