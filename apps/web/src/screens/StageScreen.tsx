import { QRCodeSVG } from 'qrcode.react';
import type { StageView } from '@quiz/shared';
import { LETTERS, correctText, questionClass, questionLabel, roundLabel, streaksOf } from '../format';
import { t } from '../i18n';
import { Timer } from '../live/Timer';
import { QuestionImage } from './QuestionImage';
import { Standings } from './Standings';

interface Props {
  view: StageView;
  code: string;
  /** Повна адреса входу гравця; з неї будується QR-код. */
  joinUrl: string;
  offsetMs: number;
  hostOnline: boolean;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function Lobby({ view, code, joinUrl }: Pick<Props, 'view' | 'code' | 'joinUrl'>) {
  return (
    <div className="stage-lobby">
      <div className="invite">
        <p className="meta">{t('joinAt')}</p>
        <p className="address">{hostOf(joinUrl)}</p>
        <p className="meta">{t('joinCode')}</p>
        <p className="code">{`${code.slice(0, 3)} ${code.slice(3)}`}</p>
      </div>
      <div className="qr">
        <QRCodeSVG value={joinUrl} size={256} bgColor="#F5F1E6" fgColor="#0E1020" marginSize={2} />
      </div>
      <div className="roster">
        <p className="meta">{view.playerCount === 0 ? t('noPlayersYet') : t('playersIn', { count: view.playerCount })}</p>
        <ul className="chips">
          {view.players.map((player) => (
            <li key={player.id} className={player.connected ? undefined : 'is-away'}>
              {player.nickname}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Question({ view, offsetMs }: Pick<Props, 'view' | 'offsetMs'>) {
  const { question, reveal, stats } = view;
  if (question === null) return null;
  const correctIds =
    reveal === null
      ? []
      : reveal.type === 'single'
        ? [reveal.correctId]
        : reveal.type === 'multi'
          ? reveal.correctIds
          : [];
  const showChoices = question.type === 'single' || question.type === 'multi';
  const hint = question.type === 'order' ? t('orderOnPhone') : showChoices || question.type === 'boolean' ? null : t('typeOnPhone');

  return (
    <div className="stage-question">
      <header className="bar">
        <span>{questionLabel(view.round, view.questionIndex, view.total)}</span>
        <span>{t('answeredOf', { answered: view.answeredCount, total: view.playerCount })}</span>
      </header>
      <div className="stage-main">
        <h1 className={questionClass(question.text)}>{question.text}</h1>
        {view.phase === 'question' && <Timer view={view} offsetMs={offsetMs} />}
      </div>
      <QuestionImage url={question.imageUrl} />
      {showChoices && (
        <ul className="choices">
          {question.choices.map((choice, index) => (
            <li key={choice.id} className={correctIds.includes(choice.id) ? 'choice is-correct' : 'choice'}>
              <span className="letter">{LETTERS[index]}</span>
              <span>{choice.text}</span>
              {stats !== null && <span className="count">{stats.counts[choice.id] ?? 0}</span>}
            </li>
          ))}
        </ul>
      )}
      {reveal === null && hint !== null && <p className="lead">{hint}</p>}
      {reveal !== null && <p className="lead answer">{t('correctAnswer', { answer: correctText(reveal, question.choices) })}</p>}
    </div>
  );
}

function Intro({ view }: { view: StageView }) {
  if (view.round === null) return null;
  return (
    <div className="stage-board">
      <p className="meta">{t('roundOf', { index: view.round.index + 1, total: view.round.total })}</p>
      <h1 className="question">{roundLabel(view.round.title, view.round.index, view.round.type)}</h1>
    </div>
  );
}

export function StageScreen({ view, code, joinUrl, offsetMs, hostOnline }: Props) {
  const { phase, standings } = view;
  return (
    <main className="app stage">
      {view.paused && (
        <p className="banner" role="status">
          {t(hostOnline ? 'paused' : 'waitingHost')}
        </p>
      )}
      {phase === 'lobby' && <Lobby view={view} code={code} joinUrl={joinUrl} />}
      {(phase === 'question' || phase === 'locked' || phase === 'reveal') && <Question view={view} offsetMs={offsetMs} />}
      {phase === 'intro' && <Intro view={view} />}
      {(phase === 'leaderboard' || phase === 'round_end' || phase === 'finished') && standings !== null && (
        <div className={phase === 'finished' ? 'stage-board is-final' : 'stage-board'}>
          <h1 className="question">
            {phase === 'finished'
              ? t('podium')
              : phase === 'round_end' && view.round !== null
                ? t('roundResults', { index: view.round.index + 1 })
                : t('leaderboard')}
          </h1>
          <Standings
            standings={standings}
            limit={phase === 'finished' ? undefined : 8}
            streaks={phase === 'finished' ? undefined : streaksOf(view.players)}
          />
        </div>
      )}
    </main>
  );
}
