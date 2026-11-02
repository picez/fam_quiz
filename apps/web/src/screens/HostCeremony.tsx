import { useState, type JSX } from 'react';
import type { PrizePlace, PrizesView } from '@quiz/shared';
import { t } from '../i18n';
import { Ceremony } from '../trophy/Ceremony';
import { PrizeViewer } from '../trophy/PrizeViewer';
import { ceremonyOrder } from '../trophy/trophy-meta';

const noop = () => {};

/**
 * Нагородження на пульті (14a): сцени може не бути, а приз з переможцем має бути де показати. «Церемонія тут» вмикає
 * той самий подіум, що на телефоні, з кнопкою виду трофея («Кубок», …) під кожним місцем (PrizeViewer). Без сцени — підказка й посилання
 * на сцену: відкрита знову у finished, вона показує церемонію спочатку. Місць з переможцем немає — null.
 */
export function HostCeremony({ prizes, stageGone, stageUrl }: { prizes: PrizesView; stageGone: boolean; stageUrl: string }): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<PrizePlace | null>(null);
  if (ceremonyOrder(prizes).length === 0) return null;
  const shown = viewing === null ? undefined : prizes.places.find((item) => item.place === viewing);
  return (
    <section className="host-ceremony">
      {stageGone && <p className="meta">{t('ceremonyNoStage')}</p>}
      <div className="prize-actions">
        <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((was) => !was)}>
          {t(open ? 'ceremonyHide' : 'ceremonyHere')}
        </button>
        {stageGone && (
          <a className="btn" href={stageUrl} target="_blank" rel="noreferrer">
            {t('stageReopen')}
          </a>
        )}
      </div>
      {open && <Ceremony prizes={prizes} size="phone" hold={false} onDone={noop} onView={setViewing} />}
      {shown !== undefined && <PrizeViewer content={shown.content} place={shown.place} onClose={() => setViewing(null)} />}
    </section>
  );
}
