import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { GIFT_NOTE_MAX, type AdminAward, type AdminPrize, type PrizeItem } from '@quiz/shared';
import { myPrizes, type ApiResult } from '../../api';
import { formatDate } from '../../format';
import { errorText, t } from '../../i18n';
import { nickText } from '../../nick';
import { deleteAwardAsAdmin, deletePrizeAsAdmin, giftPrize, revokeGift } from '../admin-api';
import type { CardProps } from '../AdminUser';
import { runEach } from './bulk';
import { CardFold } from './CardFold';
import { PickList, type PickItem } from './PickList';

/** Призи гравця: склад, вітрина (подарунок адміна — «Забрати подарунок») і подарунок зі свого складу адміна (58). */
export function CardPrizes({ detail, act, busy }: CardProps): JSX.Element {
  const { user, stock, awards } = detail;
  const [error, setError] = useState<string | null>(null);
  const nickname = nickText(user.nickname);
  const report = setError;
  const [notice, setNotice] = useState('');
  const giftIds = new Set(awards.filter((award) => award.gift !== null).map((award) => award.id));
  const names = (picked: PickItem[]) => picked.map((item) => item.name).join(', ');
  // Масова дія: одне підтвердження, запити по черзі; те, чого вже немає, — пропуск з рядком стану.
  const bulk = (confirmText: string, picked: PickItem[], run: (item: PickItem) => Promise<ApiResult<object>>) => {
    setNotice('');
    return act(
      confirmText,
      async () => {
        const result = await runEach(picked, run);
        if (result.ok && result.skipped > 0) setNotice(t('adminCardPickedPartial', { done: result.done, count: picked.length }));
        return result;
      },
      report,
    );
  };
  return (
    <CardFold title={t('adminPrizes')} count={stock.length + awards.length}>
      <h3>{t('adminStock')}</h3>
      {stock.length === 0 ? (
        <p className="meta">{t('adminNoPrizes')}</p>
      ) : (
        <PickList
          title={t('adminStock')}
          items={stock.map((prize: AdminPrize) => ({ id: prize.id, name: prize.content.name }))}
          action={t('adminCardDeletePicked')}
          danger
          busy={busy}
          onRun={(picked) => bulk(t('adminCardDeletePickedConfirm', { nickname, count: picked.length, names: names(picked) }), picked, (item) => deletePrizeAsAdmin(item.id))}
        />
      )}
      <h3>{t('adminShowcase')}</h3>
      {awards.length === 0 ? (
        <p className="meta">{t('adminNoPrizes')}</p>
      ) : (
        <PickList
          title={t('adminShowcase')}
          items={awards.map((award: AdminAward) => ({ id: award.id, name: award.gift !== null ? award.content.name : `«${award.quizTitle}»`, meta: awardMeta(award) }))}
          action={t('adminCardRemovePicked')}
          danger
          busy={busy}
          onRun={(picked) =>
            bulk(t('adminCardRemovePickedConfirm', { nickname, count: picked.length, names: names(picked) }), picked, (item) => (giftIds.has(item.id) ? revokeGift(item.id) : deleteAwardAsAdmin(item.id)))
          }
        />
      )}
      <GiftForm detail={detail} act={act} busy={busy} report={report} />
      <p className="error admin-card-line" role="alert">
        {error ?? ''}
      </p>
      <p className="meta admin-card-line" role="status">
        {notice}
      </p>
    </CardFold>
  );
}

/** Підпис рядка вітрини: подарунок — дата й примітка, нагорода з гри — місце, гравіювання, титул (в один рядок). */
function awardMeta(award: AdminAward): string {
  if (award.gift !== null) return [t('awardGiftLine', { date: formatDate(award.awardedAt) }), award.gift.note].filter((part) => part !== null && part !== '').join(' · ');
  return [t('adminPlace', { place: award.place }), award.content.engraving, award.content.title].filter((part) => part !== null && part !== '').join(' · ');
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
