import { PACK_ACHIEVEMENTS, packLevel, STICKER_PACKS, STICKERS_BY_PACK, stickerPath, type Sticker, type StickerPackId } from '@quiz/shared';
import { t, type TextKey } from '../i18n';

/** Набір у вибирачі (34): відкриті стікери — кнопками, закриті — одним рядком. */
export interface PackView {
  pack: StickerPackId;
  open: readonly Sticker[];
  locked: readonly Sticker[];
}

/** Скільки закритих стікерів показує попередній перегляд набору: решта gif на телефон не вантажиться. */
export const PACK_PREVIEW = 4;

/** Набори для показу: відкриті цілком — першими в порядку STICKER_PACKS, з закритими стікерами — нижче в тому ж порядку. */
export function packViews(isOpen: (sticker: Sticker) => boolean): PackView[] {
  const views = STICKER_PACKS.map((pack) => {
    const all = STICKERS_BY_PACK[pack];
    return { pack, open: all.filter(isOpen), locked: all.filter((s) => !isOpen(s)) };
  });
  return [...views.filter((v) => v.locked.length === 0), ...views.filter((v) => v.locked.length > 0)];
}

export const packName = (pack: StickerPackId): string => t(`pack_${pack}` as TextKey);

/** «Звірята — відкриється з рівня 12» чи «Моторошики — за досягнення «Нічна сова» або з рівня 36». */
export function packLockText(pack: StickerPackId): string {
  const by = PACK_ACHIEVEMENTS[pack];
  const name = packName(pack);
  const level = packLevel(pack);
  return by === undefined ? t('stickerPackLocked', { name, level }) : t('stickerPackLockedOr', { name, achievement: t(`achievement_${by}` as TextKey), level });
}

/** Згорнутий рядок закритої частини набору: текст (не лише 🔒), попередній перегляд перших закритих і «ще N». */
export function LockedPackLine({ view, id }: { view: PackView; id?: string }) {
  const preview = view.locked.slice(0, PACK_PREVIEW);
  const more = view.locked.length - preview.length;
  return (
    <p className="sticker-pack-locked">
      <span aria-hidden="true">🔒</span>
      <span id={id} className="sticker-pack-lock-text">
        {packLockText(view.pack)}
      </span>
      <span className="sticker-pack-preview" aria-hidden="true">
        {preview.map((sticker) => (
          <img key={sticker.id} src={stickerPath(sticker)} alt="" loading="lazy" decoding="async" width={32} height={32} />
        ))}
      </span>
      {more > 0 && <span className="sticker-pack-more">{t('stickerPackMore', { n: more })}</span>}
    </p>
  );
}
