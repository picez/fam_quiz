import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AWARDS_MS, type FactCard } from '@quiz/shared';
import { factBody, factTitle } from '../facts-text';
import { t } from '../i18n';

/**
 * «Нагороди гри» (12d): слайд 0 — п'єдестал (children), далі по нагороді на AWARDS_MS.slide.
 * Звичайна гра: стоїть на п'єдесталі, доки не прийде новий seq від ведучого; далі сама до кінця й назад на п'єдестал (стоп); кожен новий seq — наступний слайд.
 * autopilot: після AWARDS_MS.podium сама, по колу. hold (заставка «Підсумки») — таймер п'єдесталу автопілота ще не йде.
 * 12j додасть слайд «Нові ачівки» в slides.
 */
export function AwardsCarousel({ awards, rounds, autopilot, seq, hold = false, children }: { awards: FactCard[]; rounds: number; autopilot: boolean; seq: number | null; hold?: boolean; children: ReactNode }) {
  const total = awards.length;
  // step росте з кожною зміною слайда: дотик на тому самому слайді теж починає 4 с знову.
  const [{ slide, step }, setShown] = useState({ slide: 0, step: 0 });
  // Перший seq після монтування — базовий: дотик до відкриття сцени слайд не рушить.
  const lastSeq = useRef(seq);

  useEffect(() => {
    if (seq === null || (lastSeq.current !== null && seq <= lastSeq.current)) return;
    lastSeq.current = seq;
    if (total === 0) return;
    setShown((now) => ({ slide: now.slide >= total ? 1 : now.slide + 1, step: now.step + 1 }));
  }, [seq, total]);

  useEffect(() => {
    if (total === 0) return;
    if (slide === 0 && (!autopilot || hold)) return;
    const timer = setTimeout(
      () => setShown((now) => ({ slide: now.slide >= total ? 0 : now.slide + 1, step: now.step + 1 })),
      slide === 0 ? AWARDS_MS.podium : AWARDS_MS.slide,
    );
    return () => clearTimeout(timer);
  }, [slide, step, total, autopilot, hold]);

  const card = slide > 0 && slide <= total ? awards[slide - 1] : null;
  if (card === null) return <>{children}</>;
  return (
    <div className="stage-board is-award" aria-live="polite">
      <p className="meta">
        {t('awardsTitle')} · {t('awardsSlide', { n: slide, total })}
      </p>
      <h1 className="question award-title">{factTitle(card)}</h1>
      <p className="lead award-body">{factBody(card, rounds)}</p>
    </div>
  );
}
