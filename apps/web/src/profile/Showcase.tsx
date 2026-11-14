import { useState, type JSX, type ReactNode } from 'react';
import type { AwardCard, Showcase as ShowcaseData } from '@quiz/shared';
import { formatDate } from '../format';
import { t } from '../i18n';
import { diplomaFileName, renderDiploma, shareDiploma } from '../trophy/diploma';
import { trophyLabel } from '../trophy/trophy-meta';
import { PrizeViewer, canViewPrize, prizeViewLabel } from '../trophy/PrizeViewer';
import { TrophyPicture } from '../trophy/TrophyPicture';

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

/**
 * Картка нагороди: статична картинка справжнього трофея (без живого 3D на сторінці); дотик картинки відкриває
 * 3D-трофей на весь екран.
 */
function Award({ award, pin }: { award: AwardCard; pin: ReactNode }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Перегляд призу на весь екран: кнопка з видом трофея («Кубок», …), дотик фото чи дотик картинки трофея ('trophy').
  const [viewing, setViewing] = useState<false | 'prize' | 'trophy'>(false);
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
    <li className="award-card">
      {content.trophy && (
        <button type="button" className="award-emoji" aria-label={trophyLabel(content.trophy)} onClick={() => setViewing('trophy')}>
          <TrophyPicture trophy={content.trophy} />
        </button>
      )}
      {content.engraving && <p className="engraving">{content.engraving}</p>}
      <p className="award-line">{t('awardLine', { place: award.place, quiz: award.quizTitle, date: formatDate(award.awardedAt) })}</p>
      {content.real && (
        <div className="podium-real">
          {content.real.photoUrl !== null && (
            <button type="button" className="prize-photo-open" aria-label={t('prizeViewPhoto', { name: prizeViewLabel(content) })} onClick={() => setViewing('prize')}>
              <img src={content.real.photoUrl} alt="" loading="lazy" decoding="async" />
            </button>
          )}
          <span>{`🎁 ${content.real.text}`}</span>
        </div>
      )}
      {(content.diploma || canViewPrize(content) || pin !== null) && (
        <div className="prize-actions">
          {canViewPrize(content) && (
            <button type="button" className="btn btn-small" onClick={() => setViewing('prize')}>
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
      {viewing !== false && <PrizeViewer content={content} place={award.place} trophyFirst={viewing === 'trophy'} onClose={() => setViewing(false)} />}
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
            <Award key={award.id} award={award} pin={renderPin === undefined ? null : (renderPin(award) ?? null)} />
          ))}
        </ul>
      )}
    </section>
  );
}
