import type { JSX } from 'react';
import { t } from '../../i18n';

/**
 * Невидима кома перед позначкою: читач екрана чує «тарілка-трофей, 🔒 з рівня 24», а не все разом.
 * Кома — у прихованому span, пробіл — окремим текстом: кінцевий пробіл усередині span обрізається, а пробіл між дітьми flex не малює.
 */
const Separator = (): JSX.Element => (
  <>
    <span className="sr-only">,</span>{' '}
  </>
);

/** Позначки плитки вибору: «🔒 з рівня N» для закритого й «преміум»; спільні для форм, матеріалів і шрифтів. */
export function TileMarks({ need, locked, premium = false }: { need: number; locked: boolean; premium?: boolean }): JSX.Element {
  return (
    <>
      {locked && (
        <>
          <Separator />
          <span className="look-lock">{t('lookLocked', { level: t('levelFromLevel', { n: need }) })}</span>
        </>
      )}
      {premium && (
        <>
          <Separator />
          <span className="studio-premium">{t('studioPremium')}</span>
        </>
      )}
    </>
  );
}
