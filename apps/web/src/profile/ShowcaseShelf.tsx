import { useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { shelfAwards, shelfColumns, type AwardCard } from '@quiz/shared';
import { t } from '../i18n';
import { AkatsukiCloud } from '../motifs/Motifs';
import { PrizeViewer, canViewPrize } from '../trophy/PrizeViewer';
import { TrophyPicture } from '../trophy/TrophyPicture';
import { trophyLabel } from '../trophy/trophy-meta';
import { downloadDiploma } from './Showcase';

/** Значок нагороди на полиці: картинка справжнього трофея, 📜 для диплома без трофея, 🎁 для лише справжнього призу. */
const awardIcon = (award: AwardCard) =>
  award.content.trophy !== null ? <TrophyPicture trophy={award.content.trophy} /> : award.content.diploma ? '📜' : '🎁';

/** Підпис нагороди: «Золотий кубок», «Диплом» чи текст справжнього призу. */
export function awardCaption(award: AwardCard): string {
  const { trophy, diploma, real } = award.content;
  if (trophy !== null) return trophyLabel(trophy);
  if (diploma || real === null) return t('diplomaButton');
  return real.text;
}

function ShelfItem({ award, main }: { award: AwardCard; main: boolean }): JSX.Element {
  const [viewing, setViewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const { content } = award;
  const body = (
    <>
      <span className="shelf-icon" aria-hidden="true">
        {awardIcon(award)}
      </span>
      <span className="shelf-caption">{awardCaption(award)}</span>
      <span className="shelf-quiz">{award.quizTitle}</span>
    </>
  );
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
    <li className={main ? 'shelf-item is-main' : 'shelf-item'}>
      {canViewPrize(content) ? (
        <button type="button" className="shelf-cup" onClick={() => setViewing(true)}>
          {body}
        </button>
      ) : content.diploma ? (
        <button type="button" className="shelf-cup" disabled={busy} onClick={() => void diploma()}>
          {body}
        </button>
      ) : (
        <span className="shelf-cup">{body}</span>
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

/**
 * Полиця кубків: закріплені (до 3) або автовибір; перший — у центрі й найбільший. Без живого 3D: дотик відкриває
 * PrizeViewer на весь екран, диплом без трофея — завантаження диплома. allTo — посилання «усі призи ›», onAll — кнопка allLabel.
 */
export function ShowcaseShelf({ awards, pinned, allTo, onAll, allLabel }: { awards: AwardCard[]; pinned: string[]; allTo?: string; onAll?: () => void; allLabel?: string }): JSX.Element {
  const chosen = shelfAwards(awards, pinned);
  const main = chosen[0];
  return (
    <section className="profile-section shelf">
      <div className="profile-section-head">
        <h2>
          <span aria-hidden="true">🏆</span> {t('shelfTitle')}
        </h2>
        {allTo !== undefined ? (
          <Link to={allTo}>
            {t('shelfAll')}{' '}
            <span className="flip-rtl" aria-hidden="true">
              ›
            </span>
          </Link>
        ) : onAll !== undefined ? (
          <button type="button" className="btn btn-small" onClick={onAll}>
            {allLabel}
          </button>
        ) : null}
      </div>
      {chosen.length === 0 ? (
        <div className="showcase-empty">
          <AkatsukiCloud />
          <p className="meta">{t('shelfEmpty')}</p>
        </div>
      ) : (
        <ul className="shelf-stand">
          {shelfColumns(chosen).map((award) => (
            <ShelfItem key={award.id} award={award} main={award === main} />
          ))}
        </ul>
      )}
    </section>
  );
}
