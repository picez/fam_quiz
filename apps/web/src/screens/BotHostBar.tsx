import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BOT_MANUAL_GRACE_MS, BOT_MANUAL_IDLE_MS, type HostView } from '@quiz/shared';
import { botManual } from '../admin/admin-api';
import { errorText, t } from '../i18n';

/**
 * 68: смуга над пультом адміна в кімнаті бота: хто веде гру («Допомагаю» — бот веде темп, будь-яка кнопка діє одразу;
 * «Керую сам» — бот не робить кроків) і кнопка «Взяти керування» / «Віддати боту». На фініші — лише «Віддати боту», якщо керує адмін.
 */
export function BotHostBar({ view, code }: { view: HostView; code: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = view.botHost;
  if (state === undefined) return null;
  const finished = view.phase === 'finished';
  const text = state.manual ? (state.mine ? t('botHostManualMine', { idle: BOT_MANUAL_IDLE_MS / 60_000, grace: BOT_MANUAL_GRACE_MS / 60_000 }) : t('botHostManualOther')) : t('botHostAuto');
  const flip = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void botManual(code, !state.manual)
      .then((result) => setError(result.ok ? null : errorText(result.error)))
      .catch(() => setError(errorText('network')))
      .finally(() => setBusy(false));
  };
  return (
    <div className="bot-host-bar">
      {!finished && (
        <p className="bot-host-state" role="status">
          {text}
        </p>
      )}
      <div className="bot-host-actions">
        {(!finished || state.manual) && (
        <button type="button" className={state.manual ? 'btn btn-small' : 'btn btn-small btn-primary'} disabled={busy} onClick={flip}>
          {t(state.manual ? 'botHostGiveBack' : 'botHostTakeOver')}
        </button>
        )}
        <Link className="quiet-link" to="/admin/bot">
          {t('botHostBack')}
        </Link>
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
