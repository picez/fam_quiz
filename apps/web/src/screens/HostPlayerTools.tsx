import { useRef, useState, type FormEvent } from 'react';
import { DEBUFF_KINDS, LIMITS, type HostPlayer } from '@quiz/shared';
import { DEBUFF_ICONS, debuffName } from '../debuff-meta';
import { signed } from '../format';
import { errorText, t } from '../i18n';
import type { Send } from '../live/types';

export const QUICK_POINTS = [-50, -100, -200, 50, 100] as const;

/** Розбір «Своєї суми»: «−150», «-150», «+75», « 75 » → число; 0, дроби, текст і |n| > LIMITS.maxAdjust → null. */
export function parseAdjust(raw: string): number | null {
  const text = raw.trim().replace(/^[−–]/, '-');
  if (!/^[+-]?\d+$/.test(text)) return null;
  const value = Number(text);
  return value === 0 || Math.abs(value) > LIMITS.maxAdjust ? null : value;
}

interface PanelProps {
  player: HostPlayer;
  send: Send;
  onError: (message: string | null) => void;
}

/** Один запит за раз: поки відповіді немає, другий дотик не йде (як reorder/decide у HostScreen). */
function useGuardedSend(send: Send, onError: (message: string | null) => void) {
  const [busy, setBusy] = useState(false);
  const ref = useRef(false);
  const run = async (event: Parameters<Send>[0], payload: unknown): Promise<boolean> => {
    if (ref.current) return false;
    const release = () => {
      ref.current = false;
      setBusy(false);
    };
    ref.current = true;
    setBusy(true);
    const fallback = setTimeout(release, 3000);
    try {
      const result = await send(event, payload);
      onError(result.ok ? null : errorText(result.error));
      return result.ok;
    } finally {
      clearTimeout(fallback);
      release();
    }
  };
  return { busy, run };
}

export function PointsPanel({ player, send, onError }: PanelProps) {
  const { busy, run } = useGuardedSend(send, onError);
  const [raw, setRaw] = useState('');
  const [invalid, setInvalid] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const points = parseAdjust(raw);
    if (points === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    void run('host:adjust', { playerId: player.id, points }).then((ok) => {
      if (ok) setRaw('');
    });
  };

  return (
    <div className="player-tools">
      <div className="quick-points">
        {QUICK_POINTS.map((points) => (
          <button key={points} type="button" className="btn btn-small" disabled={busy} onClick={() => void run('host:adjust', { playerId: player.id, points })}>
            {signed(points)}
          </button>
        ))}
      </div>
      <form className="custom-points" onSubmit={submit}>
        <label className="field">
          {t('adjustCustom')}
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              setInvalid(false);
            }}
          />
        </label>
        <button type="submit" className="btn btn-small" disabled={busy}>
          {t('adjustApply')}
        </button>
      </form>
      {invalid && (
        <p className="error" role="alert">
          {t('adjustInvalid')}
        </p>
      )}
    </div>
  );
}

export function DebuffPanel({ player, send, onError }: PanelProps) {
  const { busy, run } = useGuardedSend(send, onError);
  const current = player.debuff;
  return (
    <div className="player-tools">
      <p className="meta">{t('debuffHint')}</p>
      {current !== null && <p className="meta">{debuffTagText(current)}</p>}
      <div className="debuff-picks">
        {DEBUFF_KINDS.map((kind) => (
          <button key={kind} type="button" className="btn btn-small" disabled={busy || current !== null} onClick={() => void run('host:debuff', { playerId: player.id, kind })}>
            {`${DEBUFF_ICONS[kind]} ${debuffName(kind)}`}
          </button>
        ))}
      </div>
      {current !== null && !current.fired && (
        <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={() => void run('host:undebuff', { playerId: player.id })}>
          {t('debuffCancel')}
        </button>
      )}
    </div>
  );
}

/** «🌫️ Туман · чекає» / «🌫️ Туман · діє». */
export function debuffTagText(debuff: NonNullable<HostPlayer['debuff']>): string {
  return t(debuff.fired ? 'debuffFiring' : 'debuffWaiting', { icon: DEBUFF_ICONS[debuff.kind], name: debuffName(debuff.kind) });
}
