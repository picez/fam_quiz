import { useId, useState, type ReactNode } from 'react';
import type { StageView } from '@quiz/shared';
import { t } from '../i18n';
import { speechSupported, useStageSpeech } from '../live/speech';
import { LOCALE_NAMES } from '../locales/locales';
import { loadStageSpeech, saveStageSpeech } from '../storage';
import { ThemeToggle } from '../ThemeToggle';

/** Чи вже був дотик на сторінці: без нього браузер не дасть говорити. Немає navigator.userActivation (старий Safari) — не знаємо, тож просимо торкнутися. */
const touched = () => (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive === true;

/** iOS відмикає мову лише висловлюванням, запущеним просто з дотику: порожня фраза в обробнику кліку. */
function unlockSpeech(): void {
  if (!speechSupported()) return;
  window.speechSynthesis.speak(new window.SpeechSynthesisUtterance(''));
}

/**
 * «🔊 Читати вголос» у куті сцени (31): лише тут, бо браузер дозволяє мову тільки після дотику саме на цій сторінці.
 * Вибір пам'ятає пристрій; після перезавантаження без дотику кнопка просить торкнутися ще раз.
 */
export function StageSpeech({ view, splashing, children }: { view: StageView; splashing: boolean; children?: ReactNode }) {
  const [stored, setStored] = useState(loadStageSpeech);
  // Дотик у цій сесії: перший клік або сторінка вже мала дотик (збережене вмикається одразу).
  const [armed, setArmed] = useState(() => stored && touched());
  const enabled = stored && armed;
  const { status, language, repeat } = useStageSpeech({ view, splashing, enabled });

  const toggle = () => {
    if (enabled) {
      setStored(false);
      saveStageSpeech(false);
      return;
    }
    unlockSpeech();
    setArmed(true);
    setStored(true);
    saveStageSpeech(true);
  };

  const unsupportedId = useId();
  const unsupported = status === 'unsupported';
  // Змінні статуси — у role="status"; «не вміє» стале, тож це опис кнопки, а не оголошення.
  const message =
    status === 'no_voice' && language !== null ? t('speechNoVoice', { language: LOCALE_NAMES[language] }) : status === 'media' ? t('speechMedia') : '';
  return (
    <div className="stage-speech">
      <div className="stage-speech-buttons">
        {/* Швидкий перемикач теми сцени: малий значок у тому ж куті, приглушений, поки на нього не наведуть чи не сфокусують. */}
        <ThemeToggle className="stage-theme" />
        {children}
        <button
          type="button"
          className="btn btn-small"
          aria-pressed={enabled}
          disabled={unsupported}
          aria-describedby={unsupported ? unsupportedId : undefined}
          onClick={toggle}
        >
          {t(stored && !armed ? 'speechResume' : 'speechToggle')}
        </button>
        {enabled && (
          <button type="button" className="btn btn-small" onClick={repeat}>
            {t('speechRepeat')}
          </button>
        )}
      </div>
      {unsupported && (
        <p className="meta" id={unsupportedId}>
          {t('speechUnsupported')}
        </p>
      )}
      {/* Порожній статус не займає місця й не плутається з банером паузи сцени. */}
      {message !== '' && (
        <p className="meta" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
