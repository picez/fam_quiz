import { useEffect, useRef, useState, type JSX } from 'react';
import type { AwardCard, Showcase as ShowcaseData } from '@quiz/shared';
import { formatDate } from '../format';
import { t } from '../i18n';
import { diplomaFileName, renderDiploma, shareDiploma } from '../trophy/diploma';
import { TROPHY_EMOJI, trophyLabel } from '../trophy/trophy-meta';
import { TrophyView } from '../trophy/TrophyView';

/** Чи картка в видимій області: без IntersectionObserver — завжди так. 3D живе лише поки картка видима. */
function useVisible(): [React.RefObject<HTMLElement | null>, boolean] {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const node = ref.current;
    if (node === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last !== undefined) setVisible(last.isIntersecting);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, visible];
}

function Award({ award }: { award: AwardCard }): JSX.Element {
  const [ref, visible] = useVisible();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const { content } = award;

  const diploma = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const blob = await renderDiploma({
        nickname: award.nickname,
        place: award.place,
        quizTitle: award.quizTitle,
        date: new Date(award.awardedAt),
        engraving: content.engraving,
        trophy: content.trophy,
      });
      await shareDiploma(blob, diplomaFileName(award.nickname));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="award-card" ref={ref as React.RefObject<HTMLLIElement>}>
      {content.trophy &&
        (visible ? (
          <TrophyView trophy={content.trophy} size="card" interactive spin={false} />
        ) : (
          <span className="award-emoji" role="img" aria-label={trophyLabel(content.trophy)}>
            {TROPHY_EMOJI[content.trophy.kind]}
          </span>
        ))}
      {content.engraving && <p className="engraving">{content.engraving}</p>}
      <p className="award-line">{t('awardLine', { place: award.place, quiz: award.quizTitle, date: formatDate(award.awardedAt) })}</p>
      {content.real && (
        <div className="podium-real">
          {content.real.photoUrl !== null && <img src={content.real.photoUrl} alt="" loading="lazy" />}
          <span>{`🎁 ${content.real.text}`}</span>
        </div>
      )}
      {content.diploma && (
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => void diploma()}>
          {t('diplomaButton')}
        </button>
      )}
      {failed && (
        <p className="error" role="alert">
          {t('diplomaFailed')}
        </p>
      )}
    </li>
  );
}

/** Розділ «Нагороди»: null, коли немає ні титулу, ні нагород. */
export function Showcase({ showcase, own }: { showcase: ShowcaseData; own: boolean }): JSX.Element | null {
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
            <Award key={award.id} award={award} />
          ))}
        </ul>
      )}
    </section>
  );
}
