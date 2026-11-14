import type { NickColor, NickEffect, NickFont, NickLevel } from '@quiz/shared';
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { t } from '../i18n';
import { useNickFont } from '../nick-fonts';

/** Клас імені: колір і шрифт (рамка живе на зовнішньому span). */
export function nickNameClass(color: NickColor | null, font: NickFont | null): string {
  return `nick-name${color === null ? '' : ` nick-c-${color}`}${font === null ? '' : ` nick-font-${font}`}`;
}

/**
 * Ефект ніку (34): обгортка .nick-fx.nick-x-<id> навколо імені; шари малює CSS у псевдоелементах.
 * Обгортка, а не клас на самому імені: шар за літерами тоді лежить під градієнтним кольором ніку й не бруднить його.
 * Ім'я дістає data-fx-text — з нього CSS малює розмиту копію літер для сяйва (з порожнім alt-текстом: читач екрана її не чує).
 */
export function NickFx({ effect, children }: { effect: NickEffect | null | undefined; children: ReactNode }) {
  if (effect === null || effect === undefined) return <>{children}</>;
  const only = Children.only(children);
  const name =
    isValidElement<{ children?: ReactNode }>(only) && typeof only.props.children === 'string'
      ? cloneElement(only as ReactElement<Record<string, unknown>>, { 'data-fx-text': only.props.children })
      : only;
  return <span className={`nick-fx nick-x-${effect}`}>{name}</span>;
}

/**
 * Нік людини: колір і рамка з levels, «Рів. N» (лише з рівнем вище першого: перший є в кожного акаунта, то був би шум),
 * титул 14a. Без levels і titles — просто нік.
 */
export function Nick({ nickname, levels, titles }: { nickname: string; levels?: Record<string, NickLevel>; titles?: Record<string, string> }) {
  const look = levels?.[nickname];
  const title = titles?.[nickname];
  const font = look?.font ?? null;
  useNickFont(font);
  if (look === undefined && title === undefined) return <>{nickname}</>;
  const frame = look?.frame ?? null;
  const color = look?.color ?? null;
  return (
    <span className={frame === null ? 'nick' : `nick nick-f-${frame}`}>
      <NickFx effect={look?.effect}>
        <span className={nickNameClass(color, font)} dir="auto">{nickname}</span>
      </NickFx>
      {look !== undefined && look.level > 1 && (
        <span className="nick-level" aria-label={t('levelAria', { n: look.level })}>
          {t('levelBadge', { n: look.level })}
        </span>
      )}
      {title !== undefined && <span className="nick-title">{title}</span>}
    </span>
  );
}
