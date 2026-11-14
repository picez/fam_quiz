import type { AchievementId } from './achievements';
import { compareStickers, seriesOf, stickerOf, STICKERS, type Sticker } from './stickers';

/** Тематичні набори стікерів (34); порядок — порядок показу. */
export const STICKER_PACKS = ['basic', 'food', 'party', 'cozy', 'animals', 'everyday', 'winter', 'love', 'hugs', 'baking', 'spooky', 'mischief', 'extra'] as const;
export type StickerPackId = (typeof STICKER_PACKS)[number];

/** Правила за повним id у порядку перевірки: перше, що збіглося. 'extra' — серія other, 'everyday' — запасний. */
const PACK_RULES: readonly (readonly [StickerPackId, RegExp])[] = [
  ['baking', /^nyasBakingstory/],
  ['hugs', /^nyas(Hug|Cuddle|Snuggl|Comfort|Soothe|Together|Carry|Piggyback|Pat|Massage|Kiss|Smooch|Lick|Xmasxcuddle|Love|Feed)/],
  ['mischief', /Bully|Bite|Smack|Slap|Spank|Poke|Drag|Accuse|Pinch|Tease|Flick|Rawr|Nou|Playful|Knife|Victim/],
  ['spooky', /Pumpkin|Witch|Ghost|Mummy|Vampire|Reaper|Devil|Evil|Ded|Cryinpain|Mask/],
  ['winter', /Xmas|Merry|Stocking|Snow|Scarf|Winter|Gingerbread|Cold|Sneeze|Beanie/],
  ['love', /Valentines|Lovepls|Mwah|Kiss|Giveshearts|Love\d|ILY|^nyaaLove$/],
  ['food', /Boba|Burger|Cake|Chips|Donut|Fries|Icecream|Noodle|Pizza|Popcorn|Sandwich|Suika|KFC|Mooncake|Eggtoast|Breakfast|Nana|Banana|Munch|Nom|Eat|Hungry|Littleapple|Food|Drool|Chef|Cook|Bdaycake/],
  ['cozy', /Chill|Comfy|Cozy|Sleep|Snooze|Snuggie|Relax|Goodnight|Lazy|Bath|Tired|Sit|Smol|Chonk|Purrito|Rain|Morning|Wakeup|Dryhair|Beach/],
  ['party', /Party|Dance|Throwconfetti|Hyper|Spin|Graduation|Sparkles|Magic|Wizard|Announce|King|Flower|Clover|Cheer|Hype|Jam/],
  ['animals', /Bee|Chick|Shiba|Piggy|Cutebunny|Cutecat|Cutepaws|Paw|Giraffe|Meow|Postcat/],
  ['basic', /^(nya|nyaa)(Happy|Yay|Smile|Wave|Thumbsup|Ok|Nod|Peace|Wink|Hearts?|Cool|Laugh|Cry|Sad|Think|Shrug|What|Wat|Hehe|Mhm|Eeh|Hmph|Please|Pls|Sob|Tears|Wow|Mad|Pout|Shy|Blush|Cute|Imfine|Sweat|Look|Thankful|Help|Pray)/],
];

function classify(id: string): StickerPackId {
  if (seriesOf(id) === 'other') return 'extra';
  return PACK_RULES.find(([, re]) => re.test(id))?.[0] ?? 'everyday';
}

/** Кеш для наявних стікерів: packOf кличуть сотні разів на рендер. */
const PACK_BY_ID = new Map<string, StickerPackId>(STICKERS.map((s) => [s.id, classify(s.id)]));

/** Набір стікера: перше правило, що збіглося; без збігу — 'extra' для серії other, інакше 'everyday'. */
export function packOf(id: string): StickerPackId {
  return PACK_BY_ID.get(id) ?? classify(id);
}

/** Набори, які відкриває ще й досягнення (раніше за рівень). Анти-досягнень тут немає. */
export const PACK_ACHIEVEMENTS: Partial<Record<StickerPackId, AchievementId>> = { spooky: 'night_owl', mischief: 'prankster', extra: 'streak_10' };

/** Набори, які відкривають здобуті досягнення. */
export function packsByAchievements(earned: readonly string[]): StickerPackId[] {
  return STICKER_PACKS.filter((p) => {
    const by = PACK_ACHIEVEMENTS[p];
    return by !== undefined && earned.includes(by);
  });
}

/** Набір за порядком STICKER_PACKS, усередині — як compareStickers. */
export function compareByPack(a: Sticker, b: Sticker): number {
  const byPack = STICKER_PACKS.indexOf(packOf(a.id)) - STICKER_PACKS.indexOf(packOf(b.id));
  return byPack !== 0 ? byPack : compareStickers(a, b);
}

/** Набір → його стікери, відсортовані compareStickers. */
export const STICKERS_BY_PACK: { readonly [P in StickerPackId]: readonly Sticker[] } = Object.fromEntries(
  STICKER_PACKS.map((p) => [p, STICKERS.filter((s) => packOf(s.id) === p).sort(compareStickers)]),
) as { [P in StickerPackId]: Sticker[] };

/**
 * Правило 15a до плану 34 (серія за рівнем): лише для успадкування — наявні акаунти зберігають усе, що воно давало
 * на їхньому рівні в мить переходу, а гості — серію nya. Більше ніде не вживати.
 */
export const LEGACY_SERIES_LEVEL = { nya: 1, nyaa: 3, nyas: 6, other: 9 } as const;

export function legacyStickerOpen(id: string, level: number): boolean {
  if (stickerOf(id) === undefined) return false;
  return LEGACY_SERIES_LEVEL[seriesOf(id)] <= level;
}
