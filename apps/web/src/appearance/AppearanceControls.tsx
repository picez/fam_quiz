import { useId, useSyncExternalStore, type JSX } from 'react';
import { EasyModeSwitch } from '../EasyModeSwitch';
import { t, type TextKey } from '../i18n';
import { setThemeChoice, subscribeTheme, themeChoice, type ThemeChoice } from '../theme-mode';

/** Порядок у «Вигляді сайту» (80): спершу світла — її найчастіше вмикають з типової темної. */
const ORDER: [ThemeChoice, TextKey][] = [
  ['light', 'themeLight'],
  ['dark', 'themeDark'],
  ['system', 'themeSystem'],
];

/**
 * «Вигляд сайту» (80): «Легкий режим» (той самий EasyModeSwitch: з акаунтом зберігається в профілі) і тема (три радіокнопки —
 * кожна одним дотиком). Один блок і в поповері меню, і внизу головної, і в налаштуваннях профілю.
 */
export function AppearanceControls({ className }: { className?: string }): JSX.Element {
  const name = useId();
  const choice = useSyncExternalStore(subscribeTheme, themeChoice);
  return (
    <div className={['appearance-controls', className].filter(Boolean).join(' ')}>
      {/* Легкий режим — першим: заради нього бабуся й відкриває цей блок. */}
      <EasyModeSwitch />
      <fieldset className="appearance-theme" aria-describedby={`${name}-hint`}>
        <legend>{t('themeLabel')}</legend>
        <div className="appearance-options">
          {ORDER.map(([value, label]) => (
            <label key={value} className="appearance-option">
              <input type="radio" name={name} value={value} checked={choice === value} onChange={() => setThemeChoice(value)} />
              <span>{t(label)}</span>
            </label>
          ))}
        </div>
        <p className="meta" id={`${name}-hint`}>
          {t('themeHint')}
        </p>
      </fieldset>
    </div>
  );
}
