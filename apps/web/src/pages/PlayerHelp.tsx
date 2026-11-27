import type { JSX, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { BuffKind, Question } from '@quiz/shared';
import { BUFF_ICONS, buffName } from '../buff-meta';
import { EasyModeSwitch } from '../EasyModeSwitch';
import { TYPE_ICONS } from '../guide-text';
import { t, type TextKey } from '../i18n';
import { BackLink } from '../nav/BackLink';

/** Типи запитань за тим, як на них відповідають: торкнутися, ввести, розставити. */
const TYPE_GROUPS: [line: TextKey, types: Question['type'][]][] = [
  ['playHelpAnswerTap', ['single', 'multi', 'boolean']],
  ['playHelpAnswerType', ['text', 'numeric']],
  ['playHelpAnswerMove', ['order', 'match', 'slider', 'pin']],
];

/** Кілька частих бафів; повний список — у довідці ведучого. */
const BUFFS: BuffKind[] = ['fifty', 'double', 'retry', 'time', 'shield', 'hint'];

/** 81: рядки бафів з гри (buffGuide_*) звертаються на «ви»; сторінка поза грою — на «ти», тож три з них мають свої ключі. */
const BUFF_LINES: Partial<Record<BuffKind, TextKey>> = { retry: 'playHelpBuff_retry', time: 'playHelpBuff_time', hint: 'playHelpBuff_hint' };

/** Розділ сторінки: значок, заголовок, текст і (за бажанням) маленький макет телефона праворуч. */
function Part({ id, icon, title, picture, children }: { id: string; icon: string; title: TextKey; picture?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <section className="panel player-help-part" aria-labelledby={`play-help-${id}`}>
      <div className="player-help-text">
        <h2 id={`play-help-${id}`}>
          <span className="player-help-icon" aria-hidden="true">
            {icon}
          </span>{' '}
          <span>{t(title)}</span>
        </h2>
        {children}
      </div>
      {picture !== undefined && (
        <div className="help-phone" aria-hidden="true">
          {picture}
        </div>
      )}
    </section>
  );
}

/**
 * «Як грати» (80, /help/play): коротко для гравця — вхід за кодом, відповіді з телефона, бафи, оскарження, «не виходь з гри»,
 * легкий режим і що буде після гри. Картинки — CSS-макети телефона (для читача екрана приховані, усе сказано текстом).
 */
export function PlayerHelp(): JSX.Element {
  return (
    <main className="app player-help">
      <BackLink parent="/" />
      <h1 className="brand">{t('playHelpTitle')}</h1>
      <p className="lead">{t('playHelpLead')}</p>

      <Part
        id="join"
        icon="🔢"
        title="playHelpJoinTitle"
        picture={
          <>
            <span className="help-phone-label">{t('codeLabel')}</span>
            <span className="help-phone-code" dir="ltr">
              123 456
            </span>
            <span className="help-phone-button is-primary">{t('joinButton')}</span>
          </>
        }
      >
        <p>{t('playHelpJoinCode')}</p>
        <p>{t('playHelpJoinOpen')}</p>
        <p className="meta">{t('playHelpJoinNick')}</p>
      </Part>

      <Part
        id="answer"
        icon="📱"
        title="playHelpAnswerTitle"
        picture={
          <>
            <span className="help-phone-timer" />
            {['A', 'B', 'C', 'D'].map((letter) => (
              <span key={letter} className={letter === 'B' ? 'help-phone-button is-picked' : 'help-phone-button'}>
                {letter}
              </span>
            ))}
          </>
        }
      >
        <p>{t('playHelpAnswerLead')}</p>
        {TYPE_GROUPS.map(([line, types]) => (
          <div key={line} className="player-help-types">
            <ul className="player-help-chips">
              {types.map((type) => (
                <li key={type}>
                  <span aria-hidden="true">{TYPE_ICONS[type]}</span> <span>{t(`type_${type}` as TextKey)}</span>
                </li>
              ))}
            </ul>
            <p>{t(line)}</p>
          </div>
        ))}
        <p className="meta">{t('playHelpAnswerGuide')}</p>
      </Part>

      <Part id="buffs" icon="✨" title="playHelpBuffsTitle">
        <p>{t('playHelpBuffsLead')}</p>
        <p className="meta">{t('playHelpBuffsMore')}</p>
        <ul className="player-help-buffs">
          {BUFFS.map((kind) => (
            <li key={kind}>
              <span className="player-help-buff" aria-hidden="true">
                {BUFF_ICONS[kind]}
              </span>
              <span>
                <strong>{buffName(kind)}</strong> <span>{t(BUFF_LINES[kind] ?? (`buffGuide_${kind}` as TextKey))}</span>
              </span>
            </li>
          ))}
        </ul>
      </Part>

      <Part
        id="appeal"
        icon="⚖️"
        title="playHelpAppealTitle"
        picture={
          <>
            <span className="help-phone-verdict">✗</span>
            <span className="help-phone-button">{t('appealButton', { left: 2 })}</span>
          </>
        }
      >
        <p>{t('playHelpAppealText')}</p>
        <p className="meta">{t('playHelpAppealLimit')}</p>
      </Part>

      <Part
        id="away"
        icon="🙈"
        title="playHelpAwayTitle"
        picture={
          <>
            <span className="help-phone-alarm">🚨</span>
            <span className="help-phone-label">{t('awayAlarmPenalty')}</span>
          </>
        }
      >
        <p>{t('playHelpAwayText')}</p>
        <p className="meta">{t('playHelpAwayScreen')}</p>
      </Part>

      <Part id="easy" icon="👓" title="playHelpEasyTitle">
        <p>{t('playHelpEasyText')}</p>
        <EasyModeSwitch />
      </Part>

      <Part id="after" icon="🏆" title="playHelpAfterTitle">
        <p>{t('playHelpAfterText')}</p>
        <p>{t('playHelpAfterAccount')}</p>
      </Part>

      <p className="player-help-host">
        {t('playHelpHostLead')} <Link to="/help">{t('helpLink')}</Link>
      </p>
    </main>
  );
}
