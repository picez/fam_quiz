import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CloseReason, SlotOption, SocketAuth } from '@quiz/shared';
import { claimSlot, gameSlots, getMyCard, joinGame } from '../api';
import { errorText, t, type TextKey } from '../i18n';
import { statusTextKey, useGame } from '../live/useGame';
import { useAwayWatch } from '../live/useAwayWatch';
import { useSirenUnlock } from '../live/useSirenUnlock';
import { useWakeLock } from '../live/useWakeLock';
import { PlayerScreen } from '../screens/PlayerScreen';
import { clearAuthor, clearPlayer, loadAuthor, loadPlayer, savePlayer } from '../storage';
import { Menu } from '../menu/Menu';
import { useAccount } from '../useAccount';

const NEW_PLAYER = 'new';

function JoinForm({ code, notice, onJoined }: { code: string; notice: string | null; onJoined: (token: string) => void }) {
  const account = useAccount();
  const [nickname, setNickname] = useState('');
  // Хто увійшов, не вводить ім'я щоразу: поле заповнюється нікнеймом профілю, і його можна змінити перед входом.
  const signedIn = account.status === 'signed-in';
  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    void getMyCard().then((result) => {
      if (current && result.ok) setNickname((typed) => (typed === '' ? (result.data.nickname ?? '').slice(0, 20) : typed));
    });
    return () => {
      current = false;
    };
  }, [signedIn]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice);
  // Місця збереженої гри (13b): поки не прочитано чи їх немає, форма як досі.
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [choice, setChoice] = useState<string | null>(null);
  const [slotReads, setSlotReads] = useState(0);
  const joined = useRef(onJoined);
  joined.current = onJoined;
  useEffect(() => {
    let current = true;
    void gameSlots(code).then(async (result) => {
      if (!current || !result.ok) return;
      const { mine } = result.data;
      setSlots(result.data.slots);
      // Вибране місце, яке тим часом зайняли, знімається.
      setChoice((chosen) => (chosen === NEW_PLAYER || result.data.slots.some((slot) => slot.id === chosen) ? chosen : null));
      if (mine === null) return;
      // Своє місце акаунт займає сам, без вибору; не вийшло — список і помилка.
      setBusy(true);
      const claimed = await claimSlot(code, mine.id);
      if (!current) return;
      setBusy(false);
      if (claimed.ok) joined.current(claimed.token);
      else setError(errorText(claimed.error));
    });
    return () => {
      current = false;
    };
  }, [code, slotReads]);

  const picking = slots.length > 0;
  const newcomer = !picking || choice === NEW_PLAYER;
  const ready = newcomer ? nickname.trim().length >= 2 : choice !== null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const slotId = newcomer ? null : choice;
    const result = slotId === null ? await joinGame(code, nickname) : await claimSlot(code, slotId);
    setBusy(false);
    if (result.ok) return onJoined(result.token);
    setError(errorText(result.error === 'wrong_phase' ? 'game_started' : result.error));
    if (result.error === 'slot_taken') setSlotReads((count) => count + 1);
  };

  // До входу в гру меню є, як на інших сторінках (беклог 24): з форми можна піти куди завгодно.
  return (
    <div className="with-menu">
      <Menu />
      <main className="app narrow">
        <h1 className="brand">
          <span dir="ltr">{`${code.slice(0, 3)} ${code.slice(3)}`}</span>
        </h1>
        <form className="panel" onSubmit={submit}>
          {picking && (
            <fieldset className="slot-list">
              <legend>{t('slotsTitle')}</legend>
              {slots.map((slot) => (
                <label key={slot.id} className="slot-option">
                  <input type="radio" name="slot" value={slot.id} checked={choice === slot.id} onChange={() => setChoice(slot.id)} />
                  <span>{slot.team === null ? slot.nickname : t('slotTeam', { nickname: slot.nickname, team: slot.team })}</span>
                </label>
              ))}
              <label className="slot-option">
                <input type="radio" name="slot" value={NEW_PLAYER} checked={choice === NEW_PLAYER} onChange={() => setChoice(NEW_PLAYER)} />
                <span>{t('slotNew')}</span>
              </label>
            </fieldset>
          )}
          {newcomer && (
            <>
              <label className="field">
                <span>{t('nicknameLabel')}</span>
                <input
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  maxLength={20}
                  autoComplete="nickname"
                  autoFocus={!picking}
                  aria-describedby="nickname-hint"
                />
              </label>
              <p className="meta" id="nickname-hint">
                {t('nicknameHint')}
              </p>
            </>
          )}
          <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
            {t(busy ? 'checking' : 'enterGame')}
          </button>
          {error !== null && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
        {account.status === 'signed-in' && <p className="meta">{t('playingAs', { name: account.account.name })}</p>}
        {account.status === 'anonymous' && (
          <Link className="quiet-link" to={`/login?next=${encodeURIComponent(`/play/${code}`)}`}>
            {t('signInToKeep')}
          </Link>
        )}
        <Link className="quiet-link" to="/">
          {t('joinTitle')}
        </Link>
      </main>
    </div>
  );
}

/** Чому телефон знову на формі входу. */
function lostText(closed: CloseReason | null, auto: boolean): TextKey {
  if (closed === 'saved') return 'gameSaved';
  if (closed === 'released') return 'slotReleased';
  if (closed === 'kicked') return auto ? 'kickedByAuthor' : 'kicked';
  return auto ? 'gameGoneAuto' : 'gameGone';
}

export function Play() {
  const { code = '' } = useParams();
  const [token, setToken] = useState<string | null>(() => loadPlayer(code));
  const [notice, setNotice] = useState<string | null>(null);
  // Гру збережено (13b): форми входу немає — коду, за яким вона була, вже не існує; продовження матиме новий код.
  const [saved, setSaved] = useState(false);
  const auth = useMemo<SocketAuth | null>(() => (token === null ? null : { code, role: 'player', token }), [code, token]);
  const game = useGame(auth);
  // Антигугл (12e): телефон гравця каже серверу, коли виходить із гри й повертається.
  useAwayWatch(game.send, game.status, game.view);
  // Сирена тривоги (12e) розблоковується першим жестом: iOS не дає звуку контексту, створеному поза жестом.
  useSirenUnlock();
  // Екран не гасне від входу до кінця гри: заблокований телефон на столі не має виглядати виходом.
  const screenUnguarded = useWakeLock(game.view !== null && game.view.role === 'player' && game.view.phase !== 'finished');

  // Токен більше не діє: гру закрито або гравця вилучено. Повертаємо форму входу.
  const wasAutopilot = useRef(false);
  if (game.view !== null && game.view.role === 'player') wasAutopilot.current = game.view.autopilot;
  const lost = token !== null && (game.status === 'unauthorized' || game.closed !== null);
  useEffect(() => {
    if (!lost) return;
    setNotice(t(lostText(game.closed, wasAutopilot.current)));
    setSaved(game.closed === 'saved');
    clearPlayer(code);
    clearAuthor(code);
    setToken(null);
  }, [lost, game.closed, code]);

  const author = loadAuthor(code);
  const stageUrl = author === null ? null : `${window.location.origin}/stage/${code}#${author.stageToken}`;

  if (token === null && saved) {
    return (
      <div className="with-menu">
        <Menu />
        <main className="app narrow">
          <p className="lead">{t('gameSaved')}</p>
          <Link className="btn btn-primary" to="/">
            {t('joinTitle')}
          </Link>
        </main>
      </div>
    );
  }

  if (token === null) {
    return (
      <JoinForm
        key={notice ?? 'fresh'}
        code={code}
        notice={notice}
        onJoined={(joined) => {
          savePlayer(code, joined);
          setNotice(null);
          setToken(joined);
        }}
      />
    );
  }

  if (game.view === null || game.view.role !== 'player') {
    return (
      <main className="app narrow">
        <p className="lead">{t(statusTextKey(game.status))}</p>
      </main>
    );
  }

  return (
    <>
      {(game.status === 'offline' || game.status === 'restarting') && (
        <p className="banner is-offline" role="status">
          {t(statusTextKey(game.status))}
        </p>
      )}
      {/* Без Wake Lock (немає чи відмовлено) і зі штрафом: блокування екрана теж рахується виходом — попереджаємо. */}
      {screenUnguarded && game.view.awayPenalty && game.view.phase !== 'lobby' && (
        <p className="banner is-wake" role="note">
          {t('awayWakeWarning')}
        </p>
      )}
      <PlayerScreen
        view={game.view}
        hostOnline={game.hostOnline}
        offsetMs={game.offsetMs}
        send={game.send}
        tilts={game.tilts}
        code={code}
        stageUrl={stageUrl}
        stageOnline={game.stageOnline}
        reactions={game.reactions}
      />
    </>
  );
}
