import { useRef, useState, type FormEvent } from 'react';
import { LIMITS, type PlayerSpy, type SpyInfo } from '@quiz/shared';
import { errorText, t, type TextKey } from '../i18n';
import { useAnswerFocus } from '../live/useAnswerFocus';
import type { Send } from '../live/types';

/** Одне слово й «Відповісти»: асоціація (words) чи здогадка шпигуна (guess). Відмову сервера видно під полем, текст лишається. */
function SpyTextForm({ event, label, send }: { event: 'player:spy-word' | 'player:spy-guess'; label: TextKey; send: Send }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  useAnswerFocus(field);
  const submit = (formEvent?: FormEvent) => {
    formEvent?.preventDefault();
    const value = text.trim();
    if (value === '' || pending) return;
    setPending(true);
    void send(event, { text: value })
      .then((result) => setError(result.ok ? null : errorText(result.error)))
      .catch(() => setError(errorText('network')))
      .finally(() => setPending(false));
  };
  return (
    <form className="spy-input" onSubmit={submit}>
      <input
        value={text}
        onChange={(change) => {
          setText(change.target.value);
          setError(null);
        }}
        aria-label={t(label)}
        placeholder={t(label)}
        maxLength={LIMITS.thinkWord}
        enterKeyHint="send"
        autoComplete="off"
        ref={field}
        dir="auto"
      />
      <button type="submit" className="btn btn-primary" disabled={text.trim() === '' || pending}>
        {t('submit')}
      </button>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** Голос: кнопки-імена інших учасників з їхніми асоціаціями (себе немає); відмову сервера видно під кнопками. */
function SpyVote({ info, meId, send }: { info: SpyInfo; meId: string; send: Send }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const vote = (playerId: string) => {
    if (pending) return;
    setPending(true);
    void send('player:spy-vote', { playerId })
      .then((result) => setError(result.ok ? null : errorText(result.error)))
      .catch(() => setError(errorText('network')))
      .finally(() => setPending(false));
  };
  return (
    <>
      <ul className="spy-vote">
        {(info.rows ?? [])
          .filter((row) => row.id !== meId)
          .map((row) => (
            <li key={row.id}>
              <button type="button" className="btn" disabled={pending} onClick={() => vote(row.id)}>
                <span className="name" dir="auto">
                  {row.nickname}
                </span>
                <span className={row.word === null ? 'spy-word is-empty' : 'spy-word'} dir="auto">
                  {row.word ?? t('spyNoWord')}
                </span>
              </button>
            </li>
          ))}
      </ul>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/**
 * «Шпигун» (38) на телефоні у фазі question. words — своє слово великим і поле асоціації (шпигун бачить лише «Ви — шпигун», підказку ведучого й як писати);
 * vote — «Хто шпигун?» і кнопки інших учасників; guess — поле й підказка лише викритому шпигунові, решта чекає «Останній шанс шпигуна…».
 * Глядач (автор автопілота) — лише «Ви автор…», без поля й кнопок.
 */
export function SpyPhone({ info, mine, meId, send }: { info: SpyInfo; mine: PlayerSpy; meId: string; send: Send }) {
  if (mine.spectator) {
    return (
      <section className="spy-phone">
        <p className="lead spy-spectator">{t('spySpectator')}</p>
        <p className="meta">{info.stage === 'words' ? t('answeredOf', { answered: info.written, total: info.total }) : t('votedOf', { voted: info.voted, total: info.total })}</p>
      </section>
    );
  }
  const hintLine = mine.hint !== null && (
    <p className="spy-hint" dir="auto">
      {t('spyHintLine', { hint: mine.hint })}
    </p>
  );
  const own = mine.spy ? (
    <div className="spy-me">
      <strong className="spy-you-role">{t('spyYouAreSpy')}</strong>
      {hintLine}
    </div>
  ) : (
    <p className="spy-me">
      <span className="meta">{t('spyYourWord')}</span>
      <strong className="spy-me-word" dir="auto">
        {mine.word ?? ''}
      </strong>
    </p>
  );
  if (info.stage === 'words') {
    return (
      <section className="spy-phone">
        {own}
        {mine.spy && mine.wrote === null && <p className="meta spy-you-how">{t('spyYouHow')}</p>}
        {mine.wrote === null ? (
          <SpyTextForm key="word" event="player:spy-word" label="spyWordPrompt" send={send} />
        ) : (
          <>
            <p className="lead spy-wrote" dir="auto">
              {mine.wrote}
            </p>
            <p className="meta">{t('spyWaitVote')}</p>
          </>
        )}
        <p className="meta">{t('answeredOf', { answered: info.written, total: info.total })}</p>
      </section>
    );
  }
  if (info.stage === 'vote') {
    return (
      <section className="spy-phone">
        {own}
        <h2 className="spy-title">{t('spyVoteTitle')}</h2>
        {mine.vote === null ? (
          <>
            <p className="meta">{t('spyVoteHint')}</p>
            <SpyVote info={info} meId={meId} send={send} />
          </>
        ) : (
          <p className="lead spy-voted">{t('spyVoted')}</p>
        )}
        <p className="meta">{t('votedOf', { voted: info.voted, total: info.total })}</p>
      </section>
    );
  }
  if (info.stage === 'guess') {
    return (
      <section className="spy-phone">
        {mine.guessing ? (
          <>
            {hintLine}
            <p className="lead spy-caught-you">{t('spyCaughtYou')}</p>
            {mine.guess === null && <SpyTextForm key="guess" event="player:spy-guess" label="spyPlayersWord" send={send} />}
          </>
        ) : (
          <>
            {own}
            <p className="lead spy-guess-stage">{t('spyGuessStage')}</p>
          </>
        )}
      </section>
    );
  }
  return null;
}
