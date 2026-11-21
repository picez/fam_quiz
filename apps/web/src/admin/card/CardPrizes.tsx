import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { GIFT_NOTE_MAX, type AdminAward, type AdminPrize, type PrizeItem } from '@quiz/shared';
import { myPrizes } from '../../api';
import { formatDate } from '../../format';
import { errorText, t } from '../../i18n';
import { nickText } from '../../nick';
import { deleteAwardAsAdmin, deletePrizeAsAdmin, giftPrize, revokeGift } from '../admin-api';
import type { CardProps } from '../AdminUser';
import { CardFold } from './CardFold';

/** Призи гравця: склад, вітрина (подарунок адміна — «Забрати подарунок») і подарунок зі свого складу адміна (58). */
export function CardPrizes({ detail, act, busy }: CardProps): JSX.Element {
  const { user, stock, awards } = detail;
  const [error, setError] = useState<string | null>(null);
  const nickname = nickText(user.nickname);
  const report = setError;
  return (
    <CardFold title={t('adminPrizes')} count={stock.length + awards.length}>
      <h3>{t('adminStock')}</h3>
      {stock.length === 0 ? (
        <p className="meta">{t('adminNoPrizes')}</p>
      ) : (
        <ul className="admin-list">
          {stock.map((prize: AdminPrize) => (
            <li key={prize.id} className="admin-card">
              <p dir="auto">{prize.content.name}</p>
              <button type="button" className="btn" disabled={busy} onClick={() => void act(t('adminDeletePrizeConfirm', { name: prize.content.name }), () => deletePrizeAsAdmin(prize.id), report)}>
                {t('adminDeletePrize')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>{t('adminShowcase')}</h3>
      {awards.length === 0 ? (
        <p className="meta">{t('adminNoPrizes')}</p>
      ) : (
        <ul className="admin-list">
          {awards.map((award: AdminAward) =>
            award.gift !== null ? (
              <li key={award.id} className="admin-card">
                <p dir="auto">{award.content.name}</p>
                <p className="meta">{t('awardGiftLine', { date: formatDate(award.awardedAt) })}</p>
                {award.gift.note !== null && <p dir="auto">{award.gift.note}</p>}
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void act(t('adminCardGiftRevokeConfirm', { title: award.content.name, nickname }), () => revokeGift(award.id), report)}>
                  {t('adminCardGiftRevoke')}
                </button>
              </li>
            ) : (
              <li key={award.id} className="admin-card">
                <p>«{award.quizTitle}»</p>
                <p className="meta">{t('adminPlace', { place: award.place })}</p>
                {award.content.engraving !== null && <p>{award.content.engraving}</p>}
                {award.content.title !== null && <p>{award.content.title}</p>}
                <button type="button" className="btn" disabled={busy} onClick={() => void act(t('adminDeleteAwardConfirm', { quiz: award.quizTitle }), () => deleteAwardAsAdmin(award.id), report)}>
                  {t('adminDeleteAward')}
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      <GiftForm detail={detail} act={act} busy={busy} report={report} />
      <p className="error admin-card-line" role="alert">
        {error ?? ''}
      </p>
    </CardFold>
  );
}

/** «Подарувати приз»: зі свого складу адміна (приз копіюється й лишається в адміна) або «Створити новий приз» з поверненням сюди. */
function GiftForm({ detail, act, busy, report }: CardProps & { report: (error: string | null) => void }): JSX.Element {
  const { user } = detail;
  const [mine, setMine] = useState<PrizeItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pick, setPick] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let current = true;
    void myPrizes().then((result) => {
      if (!current) return;
      if (result.ok) setMine(result.data);
      else setLoadError(errorText(result.error));
    });
    return () => {
      current = false;
    };
  }, []);

  const chosen = mine?.find((prize) => prize.id === pick) ?? null;
  const submit = async (prize: PrizeItem) => {
    const text = note.replace(/\s+/g, ' ').trim();
    const done = await act(t('adminCardGiftConfirm', { title: prize.content.name, nickname: nickText(user.nickname) }), () => giftPrize(user.id, prize.id, text === '' ? null : text), report);
    if (done) {
      setPick('');
      setNote('');
    }
  };

  return (
    <div className="admin-card-form">
      <h3>{t('adminCardGift')}</h3>
      {loadError !== null && <p className="meta">{loadError}</p>}
      {mine !== null && mine.length === 0 && <p className="meta">{t('adminCardGiftNone')}</p>}
      {mine !== null && mine.length > 0 && (
        <>
          <label className="field">
            <span>{t('adminCardGiftPick')}</span>
            <select value={pick} onChange={(event) => setPick(event.target.value)}>
              <option value="">—</option>
              {mine.map((prize) => (
                <option key={prize.id} value={prize.id}>
                  {prize.content.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('adminCardGiftNote')}</span>
            <input type="text" value={note} onChange={(event) => setNote(event.target.value)} maxLength={GIFT_NOTE_MAX} />
          </label>
          <button type="button" className="btn" disabled={busy || chosen === null} onClick={() => chosen !== null && void submit(chosen)}>
            {t('adminCardGift')}
          </button>
        </>
      )}
      <Link className="quiet-link" to={`/profile/prizes/new?back=/admin/users/${encodeURIComponent(user.id)}`}>
        {t('adminCardGiftNew')}
      </Link>
    </div>
  );
}
