import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { Announcement } from '@quiz/shared';
import { getAnnouncement } from '../api';
import { loadAnnouncementSeen, saveAnnouncementSeen } from '../storage';
import { AnnouncementView } from './AnnouncementView';

/** Далі за добу таймер не ставимо: setTimeout обмежений, а сторінка так довго не живе. */
const TIMER_HORIZON_MS = 24 * 60 * 60 * 1000;

/**
 * 53: оголошення адміна над сторінкою (не в грі). Один запит на монтування WithMenu; помилка — без банера.
 * Хрестик запам'ятовує id на пристрої; нове оголошення має новий id і з'являється знову.
 */
export function AnnouncementBanner(): JSX.Element | null {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  useEffect(() => {
    let alive = true;
    void getAnnouncement().then((result) => {
      if (!alive || !result.ok) return;
      const found = result.data.announcement;
      if (found === null || found.id === loadAnnouncementSeen()) return;
      if (found.expiresAt !== null && Date.parse(found.expiresAt) <= Date.now()) return;
      setAnnouncement(found);
    });
    return () => {
      alive = false;
    };
  }, []);
  const expiresAt = announcement?.expiresAt ?? null;
  useEffect(() => {
    if (expiresAt === null) return;
    const left = Date.parse(expiresAt) - Date.now();
    if (left > TIMER_HORIZON_MS) return;
    const timer = setTimeout(() => setAnnouncement(null), Math.max(left, 0));
    return () => clearTimeout(timer);
  }, [expiresAt]);
  if (announcement === null) return null;
  const close = () => {
    saveAnnouncementSeen(announcement.id);
    setAnnouncement(null);
  };
  return <AnnouncementView announcement={announcement} onClose={close} />;
}
