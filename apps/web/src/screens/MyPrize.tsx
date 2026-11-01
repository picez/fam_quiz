import { useEffect, useState, type JSX } from 'react';
import type { PrizesView } from '@quiz/shared';
import { checkCode } from '../api';
import { t } from '../i18n';
import { diplomaFileName, renderDiploma, shareDiploma } from '../trophy/diploma';
import { TrophyView } from '../trophy/TrophyView';

/** Телефон у finished: «Твій приз» для prizes.mine; кнопка «Диплом» — якщо content.diploma; гість — «Ти граєш як гість: у вітрину приз не потрапить.». */
export function MyPrize({ prizes, nickname, quizTitle }: { prizes: PrizesView; nickname: string; quizTitle: string }): JSX.Element | null {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const mine = prizes.mine;
  const shown = mine === null ? undefined : prizes.places.find((item) => item.place === mine.place);
  if (mine === null || shown === undefined) return null;
  const { content } = shown;

  const diploma = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const blob = await renderDiploma({ nickname, place: mine.place, quizTitle, date: new Date(), engraving: content.engraving, trophy: content.trophy });
      await shareDiploma(blob, diplomaFileName(nickname));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel my-prize">
      <h2>{t('myPrizeTitle')}</h2>
      <p className="meta">{t('ceremonyPlace', { place: mine.place })}</p>
      {content.trophy && <TrophyView trophy={content.trophy} size="card" spin interactive />}
      {content.engraving && <p className="engraving">{content.engraving}</p>}
      {content.real && (
        <div className="podium-real">
          {content.real.photoUrl !== null && <img src={content.real.photoUrl} alt="" />}
          <span>{`🎁 ${content.real.text}`}</span>
        </div>
      )}
      {content.title && <p className="podium-title">{`👑 ${content.title}`}</p>}
      {!mine.account && <p className="meta">{t('myPrizeGuest')}</p>}
      {content.diploma && (
        <button type="button" className="btn" disabled={busy} onClick={() => void diploma()}>
          {t('diplomaButton')}
        </button>
      )}
      {failed && (
        <p className="error" role="alert">
          {t('diplomaFailed')}
        </p>
      )}
    </section>
  );
}

/**
 * «Призи»: хто взяв яке місце. Пульт (host) бачить і місця без нікого — «приз повернеться на склад»;
 * телефон (player) — лише місця з переможцем. Нічого показати — null.
 */
export function PrizeResults({ prizes, role }: { prizes: PrizesView; role: 'host' | 'player' }): JSX.Element | null {
  const rows = prizes.places.filter((shown) => role === 'host' || shown.winner !== null);
  if (rows.length === 0) return null;
  return (
    <section className="prize-results">
      <h2>{t('prizeResultsTitle')}</h2>
      <ul className="rows">
        {rows.map(({ place, winner }) => (
          <li key={place}>{winner === null ? t('prizeNobody', { place }) : t('prizeResult', { place, name: winner.name })}</li>
        ))}
      </ul>
    </section>
  );
}

/** Назва вікторини для диплома: телефон її не має в зрізі, тож питає кімнату раз, коли треба; поки нема — ''. */
export function useQuizTitle(code: string, enabled: boolean): string {
  const [title, setTitle] = useState('');
  useEffect(() => {
    if (!enabled || code === '' || title !== '') return;
    let live = true;
    void checkCode(code).then((result) => {
      if (live && result.ok) setTitle(result.title);
    });
    return () => {
      live = false;
    };
  }, [code, enabled, title]);
  return title;
}
