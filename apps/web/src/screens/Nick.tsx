import type { NickLevel } from '@quiz/shared';
import { t } from '../i18n';

/**
 * Нік людини: колір і рамка з levels, «Рів. N» (лише з рівнем вище першого: перший є в кожного акаунта, то був би шум),
 * титул 14a. Без levels і titles — просто нік.
 */
export function Nick({ nickname, levels, titles }: { nickname: string; levels?: Record<string, NickLevel>; titles?: Record<string, string> }) {
  const look = levels?.[nickname];
  const title = titles?.[nickname];
  if (look === undefined && title === undefined) return <>{nickname}</>;
  const frame = look?.frame ?? null;
  const color = look?.color ?? null;
  return (
    <span className={frame === null ? 'nick' : `nick nick-f-${frame}`}>
      <span className={color === null ? 'nick-name' : `nick-name nick-c-${color}`}>{nickname}</span>
      {look !== undefined && look.level > 1 && (
        <span className="nick-level" aria-label={t('levelAria', { n: look.level })}>
          {t('levelBadge', { n: look.level })}
        </span>
      )}
      {title !== undefined && <span className="nick-title">{title}</span>}
    </span>
  );
}
