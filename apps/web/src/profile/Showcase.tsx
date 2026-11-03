import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import type { AwardCard, Showcase as ShowcaseData } from '@quiz/shared';
import { formatDate } from '../format';
import { t } from '../i18n';
import { diplomaFileName, renderDiploma, shareDiploma } from '../trophy/diploma';
import { TROPHY_EMOJI, trophyLabel } from '../trophy/trophy-meta';
import { PrizeViewer, canViewPrize, prizeViewLabel } from '../trophy/PrizeViewer';
import { TrophyView } from '../trophy/TrophyView';

/** Скільки 3D-карток живе одночасно; решта лишається значком, доки на неї не натиснуть. */
export const LIVE_3D_MAX = 6;

/** Чи картка хоч раз була у видимій області (защіпка: 3D не перемонтовується від прокрутки). Без IntersectionObserver — ніколи. */
function useSeen(): [React.RefObject<HTMLElement | null>, boolean] {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (node === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setSeen(true);
        observer.disconnect();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, seen];
}

/** Диплом нагороди: малює й віддає (поділитися чи завантажити); помилку кидає далі. */
export async function downloadDiploma(award: AwardCard): Promise<void> {
  const blob = await renderDiploma({
    nickname: award.nickname,
    place: award.place,
    quizTitle: award.quizTitle,
    date: new Date(award.awardedAt),
    engraving: award.content.engraving,
    trophy: award.content.trophy,
  });
  await shareDiploma(blob, diplomaFileName(award.nickname));
}

function Award({ award, live, onLive, pin }: { award: AwardCard; live: boolean; onLive: () => void; pin: ReactNode }): JSX.Element {
  const [ref, seen] = useSeen();
  const [opened, setOpened] = useState(false);
  const show = opened || (seen && live);
  useEffect(() => {
    if (seen && live) onLive();
  }, [seen, live, onLive]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Перегляд призу на весь екран: кнопка з видом трофея («Кубок», …) або дотик фото.
  const [viewing, setViewing] = useState(false);
  const { content } = award;

  const diploma = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await downloadDiploma(award);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="award-card" ref={ref as React.RefObject<HTMLLIElement>}>
      {content.trophy &&
        (show ? (
          <TrophyView trophy={content.trophy} size="card" interactive spin={false} />
        ) : (
          <button type="button" className="award-emoji" aria-label={trophyLabel(content.trophy)} onClick={() => setOpened(true)}>
            {TROPHY_EMOJI[content.trophy.kind]}
          </button>
        ))}
      {content.engraving && <p className="engraving">{content.engraving}</p>}
      <p className="award-line">{t('awardLine', { place: award.place, quiz: award.quizTitle, date: formatDate(award.awardedAt) })}</p>
      {content.real && (
        <div className="podium-real">
          {content.real.photoUrl !== null && (
            <button type="button" className="prize-photo-open" aria-label={t('prizeViewPhoto', { name: prizeViewLabel(content) })} onClick={() => setViewing(true)}>
              <img src={content.real.photoUrl} alt="" loading="lazy" />
            </button>
          )}
          <span>{`🎁 ${content.real.text}`}</span>
        </div>
      )}
      {(content.diploma || canViewPrize(content) || pin !== null) && (
        <div className="prize-actions">
          {canViewPrize(content) && (
            <button type="button" className="btn btn-small" onClick={() => setViewing(true)}>
              {prizeViewLabel(content)}
            </button>
          )}
          {content.diploma && (
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => void diploma()}>
              {t('diplomaButton')}
            </button>
          )}
          {pin}
        </div>
      )}
      {viewing && <PrizeViewer content={content} place={award.place} onClose={() => setViewing(false)} />}
      {failed && (
        <p className="error" role="alert">
          {t('diplomaFailed')}
        </p>
      )}
    </li>
  );
}

/** Розділ «Нагороди»: null, коли немає ні титулу, ні нагород. renderPin — кнопка 📌 біля дій кожної нагороди (свої призи). */
export function Showcase({ showcase, own, renderPin }: { showcase: ShowcaseData; own: boolean; renderPin?: (award: AwardCard) => ReactNode }): JSX.Element | null {
  // Першим LIVE_3D_MAX побаченим карткам дозволено 3D; пізніші — значок, доки не натиснуть.
  const [lives, setLives] = useState<string[]>([]);
  if (showcase.title === null && showcase.awards.length === 0) return null;
  return (
    <section className={own ? 'profile-section showcase is-own' : 'profile-section showcase'}>
      <h2>{t('showcaseTitle')}</h2>
      {showcase.title !== null && (
        <p className="showcase-title">
          <span className="nick-title">{showcase.title.text}</span> <span className="meta">{t('showcaseUntil', { date: formatDate(showcase.title.until) })}</span>
        </p>
      )}
      {showcase.awards.length > 0 && (
        <ul className="award-grid">
          {showcase.awards.map((award) => (
            <Award
              key={award.id}
              award={award}
              live={lives.includes(award.id) || lives.length < LIVE_3D_MAX}
              onLive={() => setLives((list) => (list.includes(award.id) || list.length >= LIVE_3D_MAX ? list : [...list, award.id]))}
              pin={renderPin === undefined ? null : (renderPin(award) ?? null)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
