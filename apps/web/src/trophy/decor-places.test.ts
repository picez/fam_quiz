import { DECOR_SUPPORT } from '@quiz/shared';
import type { Inscription, InscriptionPlace, StickerPlace, TrophyDecor, TrophyKind, TrophyPhotoPlace } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { NEW_KINDS_25E, TROPHY_ANCHORS } from './anchors';
import { layoutDecor, overlaps, spotFootprint, stickerPlaceChoices } from './decor-places';

const base: TrophyDecor = {
  photos: [],
  photoPlace: 'ring',
  frame: 'none',
  photoStyle: 'normal',
  inscriptions: [],
  effect: { kind: 'none' },
  appearance: 'spin',
  stickers: [],
};
const photo = { url: '/uploads/aaaaaaaaaaaaaaaa.jpg', crop: { x: 0.5, y: 0.5, scale: 1 } };
const photos = (n: number) => Array.from({ length: n }, () => photo);
const inscription = (place: InscriptionPlace): Inscription => ({
  place,
  text: 'x',
  font: null,
  look: 'engraved',
  color: '#3a2a0e',
});
const stickers = (...places: StickerPlace[]) => places.map((place, i) => ({ id: `s${i}`, place }));
const decor = (over: Partial<TrophyDecor>): TrophyDecor => ({ ...base, ...over });
const medallion = { photos: [photo], photoPlace: 'medallion' as const };

describe('footprints', () => {
  it('a spot covers its own footprint and the angle wraps behind', () => {
    const back = spotFootprint('cup', TROPHY_ANCHORS.cup.back!);
    expect(back.surface).toBe('bowl');
    expect(overlaps(back, back)).toBe(true);
    const behind = { ...back, u: [-Math.PI - 0.01, -Math.PI + 0.01] as const };
    expect(overlaps(back, behind)).toBe(true);
    expect(overlaps(back, { ...back, surface: 'plinth-back' })).toBe(false);
    expect(overlaps(back, { ...back, u: 'all', v: [0.1, 0.2] })).toBe(false);
  });
});

describe('layoutDecor', () => {
  it('front sticker moves off the cup medallion to the left', () => {
    const layout = layoutDecor('cup', decor({ ...medallion, stickers: stickers('front') }));
    expect(layout.photos).toBe('medallion');
    expect(layout.stickers).toEqual([
      { id: 's0', place: 'front', at: 'left', blockedBy: { type: 'photos', place: 'medallion' } },
    ]);
  });

  it('star front sticker with a medallion goes to the base', () => {
    // left/right зірки теж під медальйоном; зворот без нічого — найближчий, з написом звороту — основа.
    const free = layoutDecor('star', decor({ ...medallion, stickers: stickers('front') }));
    expect(free.stickers[0]!.at).toBe('back');
    const layout = layoutDecor(
      'star',
      decor({ ...medallion, inscriptions: [inscription('back')], stickers: stickers('front') }),
    );
    expect(layout.stickers[0]).toMatchObject({ at: 'base-left', blockedBy: { type: 'photos', place: 'medallion' } });
    for (const side of ['left', 'right'] as const) {
      expect(layoutDecor('star', decor({ ...medallion, stickers: stickers(side) })).stickers[0]!.at).not.toBe(side);
    }
  });

  it('an own place wins over a displaced sticker', () => {
    const layout = layoutDecor('cup', decor({ ...medallion, stickers: stickers('front', 'left') }));
    expect(layout.stickers.map((s) => [s.place, s.at])).toEqual([
      ['front', 'right'],
      ['left', 'left'],
    ]);
    expect(layout.stickers[1]!.blockedBy).toBeNull();
  });

  it('second displaced sticker with no room is dropped', () => {
    const layout = layoutDecor(
      'star',
      decor({
        ...medallion,
        inscriptions: [inscription('back')],
        stickers: stickers('front', 'back', 'left', 'right', 'base-left'),
      }),
    );
    const at = layout.stickers.map((s) => s.at).filter((p) => p !== null);
    expect(new Set(at).size).toBe(at.length);
    expect(layout.stickers.map((s) => [s.place, s.at])).toEqual([
      ['front', 'base-right'],
      ['back', null],
      ['left', null],
      ['right', null],
      ['base-left', 'base-left'],
    ]);
    expect(layout.stickers[1]!.blockedBy).toEqual({ type: 'inscription', place: 'back' });
    expect(layout.stickers[2]!.blockedBy).toEqual({ type: 'photos', place: 'medallion' });
    expect(layout.stickers[4]!.blockedBy).toBeNull();
  });

  it('cup back inscription moves to the base back under the ring', () => {
    const ring = layoutDecor('cup', decor({ photos: photos(3), photoPlace: 'ring', inscriptions: [inscription('back')] }));
    expect(ring.inscriptions).toEqual([
      { inscription: inscription('back'), at: 'base-back', blockedBy: { type: 'photos', place: 'ring' } },
    ]);
    const bare = layoutDecor('cup', decor({ inscriptions: [inscription('back')] }));
    expect(bare.photos).toBeNull();
    expect(bare.inscriptions[0]).toMatchObject({ at: 'own', blockedBy: null });
  });

  it('gems decide by count', () => {
    const at = (n: number) =>
      layoutDecor('cup', decor({ photos: photos(n), photoPlace: 'gems', inscriptions: [inscription('back')] })).inscriptions[0]!
        .at;
    expect(at(1)).toBe('own');
    // Два самоцвіти — спереду й ззаду: задній на місці звороту.
    expect(at(2)).toBe('base-back');
    // Чотири — між ручками (повернуті на 45°): зворот вільний.
    expect(at(4)).toBe('own');
  });

  it('grail back inscription under the raised ring is dropped', () => {
    const layout = layoutDecor('grail', decor({ photos: photos(3), photoPlace: 'ring', inscriptions: [inscription('back')] }));
    expect(layout.inscriptions[0]).toMatchObject({ at: null, blockedBy: { type: 'photos', place: 'ring' } });
  });

  it('only these own places collide', () => {
    const conflicts = (kind: TrophyKind) => {
      const support = DECOR_SUPPORT[kind];
      const found = new Set<string>();
      const photoCases: [TrophyPhotoPlace, number][] = support.photo.flatMap((place) =>
        place === 'gems' ? Array.from({ length: 8 }, (_, i) => [place, i + 1] as [TrophyPhotoPlace, number]) : [[place, 1]],
      );
      // фото × напис (табличка двічі заборонена схемою)
      for (const [place, n] of photoCases) {
        for (const ins of support.inscription) {
          if (place === 'plaque' && ins === 'plaque') continue;
          const layout = layoutDecor(kind, decor({ photos: photos(n), photoPlace: place, inscriptions: [inscription(ins)] }));
          if (layout.inscriptions[0]!.at !== 'own') found.add(`${place}×${ins}`);
        }
      }
      // напис × напис
      for (const a of support.inscription) {
        for (const b of support.inscription) {
          if (a >= b) continue;
          const layout = layoutDecor(kind, decor({ inscriptions: [inscription(a), inscription(b)] }));
          if (layout.inscriptions.some((i) => i.at !== 'own')) found.add(`${a}×${b}`);
        }
      }
      return [...found].sort();
    };
    expect(conflicts('cup')).toEqual(['gems×back', 'ring×back']);
    expect(conflicts('grail')).toEqual(['gems×back', 'ring×back']);
    for (const kind of ['medal', 'crown', 'star', 'statuette'] as const) expect(conflicts(kind)).toEqual([]);
    expect(conflicts('lovingcup')).toEqual(['gems×back', 'ring×back']);
    for (const kind of NEW_KINDS_25E.filter((k) => k !== 'lovingcup')) expect(conflicts(kind), kind).toEqual([]);
  });

  it('25e shapes: inscriptions, stickers, plaque and bands never collide with each other', () => {
    // Фото × наліпка дозволено (наліпка переїжджає); решта власних місць нових форм не накладається.
    for (const kind of NEW_KINDS_25E) {
      const support = DECOR_SUPPORT[kind];
      const found: string[] = [];
      for (const ins of support.inscription) {
        for (const place of support.sticker) {
          const layout = layoutDecor(kind, decor({ inscriptions: [inscription(ins)], stickers: stickers(place) }));
          if (layout.inscriptions[0]!.at !== 'own' || layout.stickers[0]!.at !== place) found.push(`${ins}×${place}`);
        }
      }
      for (const a of support.sticker) {
        for (const b of support.sticker) {
          if (a >= b) continue;
          const layout = layoutDecor(kind, decor({ stickers: stickers(a, b) }));
          if (layout.stickers.some((s) => s.at !== s.place)) found.push(`${a}×${b}`);
        }
      }
      // Фото на табличці не заходить на поясок.
      if (support.photo.includes('plaque') && support.inscription.includes('band')) {
        const layout = layoutDecor(kind, decor({ photos: photos(1), photoPlace: 'plaque', inscriptions: [inscription('band')] }));
        if (layout.inscriptions[0]!.at !== 'own') found.push('plaque×band');
      }
      expect(found, kind).toEqual([]);
    }
  });

  it('every photo place leaves room for a sticker', () => {
    // Для кожної форми й кожного місця фото (самоцвіти — 1…8, кільце — 1 і 16) хоч одне місце наліпки вільне.
    for (const kind of Object.keys(DECOR_SUPPORT) as TrophyKind[]) {
      const support = DECOR_SUPPORT[kind];
      for (const place of support.photo) {
        const counts = place === 'gems' ? [1, 2, 3, 4, 5, 6, 7, 8] : place === 'ring' ? [1, 16] : [1];
        for (const n of counts) {
          const choices = stickerPlaceChoices(kind, decor({ photos: photos(n), photoPlace: place }), null);
          expect(choices.some((c) => c.takenBy === null), `${kind} ${place} ×${n}`).toBe(true);
        }
      }
    }
  });

  it('lovingcup back inscription under the ring moves to the base back', () => {
    const ring = layoutDecor('lovingcup', decor({ photos: photos(3), photoPlace: 'ring', inscriptions: [inscription('back')] }));
    expect(ring.inscriptions).toEqual([
      { inscription: inscription('back'), at: 'base-back', blockedBy: { type: 'photos', place: 'ring' } },
    ]);
    const bare = layoutDecor('lovingcup', decor({ inscriptions: [inscription('back')] }));
    expect(bare.inscriptions[0]).toMatchObject({ at: 'own', blockedBy: null });
  });

  it('a cup decor on the star medal shows only what the star medal has', () => {
    // Зміна форми: base-left і поясок у медалі-зірки немає — їх не видно, розкладка не падає.
    const d = decor({ ...medallion, inscriptions: [inscription('band'), inscription('back')], stickers: stickers('base-left', 'left') });
    const layout = layoutDecor('starmedal', d);
    expect(layout.photos).toBe('medallion');
    expect(layout.inscriptions.map((i) => [i.inscription.place, i.at])).toEqual([['back', 'own']]);
    expect(layout.stickers.map((s) => [s.place, s.at])).toEqual([['left', 'left']]);
  });

  it('layout is the same for the same decor', () => {
    const d = decor({ ...medallion, inscriptions: [inscription('back')], stickers: stickers('front', 'left') });
    const reordered = Object.fromEntries(Object.entries(d).reverse()) as unknown as TrophyDecor;
    expect(layoutDecor('cup', d)).toEqual(layoutDecor('cup', d));
    expect(layoutDecor('cup', reordered)).toEqual(layoutDecor('cup', d));
  });

  it('shows only what the kind has', () => {
    const layout = layoutDecor('medal', decor({ photos: photos(3), photoPlace: 'ring', stickers: stickers('base-left') }));
    expect(layout).toEqual({ photos: null, inscriptions: [], stickers: [] });
  });

  it('backdrop takes no place on the trophy', () => {
    const layout = layoutDecor('cup', decor({ photos: [photo], photoPlace: 'backdrop', inscriptions: [inscription('back')], stickers: stickers('front') }));
    expect(layout.photos).toBe('backdrop');
    expect(layout.inscriptions[0]!.at).toBe('own');
    expect(layout.stickers[0]!.at).toBe('front');
  });
});

describe('stickerPlaceChoices', () => {
  it('choices: own place is free for the sticker being edited', () => {
    const d = decor({ ...medallion, stickers: stickers('front') });
    const editing = stickerPlaceChoices('cup', d, 'front');
    const byPlace = (list: typeof editing, place: StickerPlace) => list.find((c) => c.place === place)!.takenBy;
    expect(editing.map((c) => c.place)).toEqual([...DECOR_SUPPORT.cup.sticker]);
    expect(byPlace(editing, 'left')).toBeNull();
    expect(byPlace(editing, 'front')!.type).toBe('photos');
    const adding = stickerPlaceChoices('cup', d, null);
    expect(byPlace(adding, 'left')).toEqual({ type: 'sticker', place: 'left', id: 's0' });
    expect(byPlace(adding, 'front')!.type).toBe('photos');
    expect(byPlace(adding, 'right')).toBeNull();
  });

  it('an inscription takes the place where it actually lies', () => {
    const d = decor({ photos: photos(3), photoPlace: 'ring', inscriptions: [inscription('back')] });
    const choices = stickerPlaceChoices('cup', d, null);
    expect(choices.find((c) => c.place === 'back')!.takenBy).toEqual({ type: 'photos', place: 'ring' });
    expect(choices.find((c) => c.place === 'base-left')!.takenBy).toBeNull();
    const medal = stickerPlaceChoices('star', decor({ inscriptions: [inscription('back')] }), null);
    expect(medal.find((c) => c.place === 'back')!.takenBy).toEqual({ type: 'inscription', place: 'back' });
  });
});
