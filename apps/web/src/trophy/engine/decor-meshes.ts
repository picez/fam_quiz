import { shownDecor } from '@quiz/shared';
import type { DecorPhoto, TrophyDecor, TrophyKind, TrophyMaterial } from '@quiz/shared';
import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Texture,
} from 'three';
import { TROPHY_ANCHORS, type BandAnchor, type Plate, type Spot } from '../anchors';
import {
  drawBack,
  drawBand,
  drawPhotoCard,
  drawPhotoDisc,
  drawPhotoRing,
  drawPlaque,
  drawRim,
  loadInscriptionFont,
} from '../decor-canvas';
import { BAND_PX, PHOTO_BOX, gemSpots, ringAtlasSize } from '../decor-layout';
import { layoutDecor, type PlacedInscription, type PlacedSticker } from '../decor-places';
import type { TrophySize } from '../engine-types';
import { MATERIAL_LOOK } from '../trophy-meta';
import { bandEdgeRadius, profileBand, projectDecal, sharedGeometry, type Surface } from './surface-geometry';
import type { DecorTextures } from './textures';

/** Розмір текстури кружечка: медальйон і зворот / самоцвіт. */
const DISC_PX = 512;
const GEM_PX = 256;
const PLAQUE = PHOTO_BOX.plaque;
const BACKDROP = PHOTO_BOX.backdrop;
const BIG_SIZES: readonly TrophySize[] = ['stage', 'view'];

/** Роздільність полотен оформлення за розміром вигляду: на картці й телефоні вдвічі менше (GPU-пам'ять вітрини). */
export const TEXTURE_SCALE: Record<TrophySize, number> = { stage: 1, view: 1, phone: 0.5, card: 0.5 };

/** Оформлення ближче до камери за модель під ним: без z-fighting на підйомі 0.0015–0.003. */
const OFFSET = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 } as const;
/** Декалі прозорі по краях і не пишуть глибину; після моделі їх малює прохід прозорих (від z-fighting — OFFSET). */
const DECAL = { ...OFFSET, transparent: true, alphaTest: 0.05, depthWrite: false } as const;
/**
 * Порядок декалей серед прозорих: нижчий за частинки ефекту (PARTICLE_RENDER_ORDER), бо частинки не пишуть глибину
 * й інакше зникали б за медальйоном чи наліпкою, пролітаючи перед ними.
 */
export const DECAL_RENDER_ORDER = 0;

/** Полотна одного buildDecor: спільні за ключем, кожне взяте записується в taken (звільнити — release). */
interface Painter {
  kind: TrophyKind;
  material: TrophyMaterial;
  decor: TrophyDecor;
  size: TrophySize;
  textures: DecorTextures;
  surface: Promise<Surface>;
  taken: Texture[];
}

/**
 * Спільне полотно width×height (у пікселях повного розміру) зменшене на TEXTURE_SCALE[size]; draw малює у повних
 * координатах. data — усе, від чого залежить малюнок частини (фото з crop чи напис), loaded — чи завантажилась кожна картинка.
 */
function paint(
  painter: Painter,
  part: string,
  data: unknown,
  loaded: boolean[],
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Texture {
  const { kind, material, decor, size, textures } = painter;
  const scale = TEXTURE_SCALE[size];
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const key = JSON.stringify([part, kind, material, decor.frame, decor.photoStyle, data, loaded, w, h]);
  const texture = textures.canvas(key, w, h, (ctx) => {
    ctx.scale(scale, scale);
    draw(ctx);
  });
  painter.taken.push(texture);
  return texture;
}

const photoData = (photo: DecorPhoto) => ({ url: photo.url, crop: photo.crop });
const loadedFlags = (images: readonly (unknown | null)[]) => images.map((image) => image != null);

type MetalLook = { metalness: number; roughness: number };
const BAKED_RING: MetalLook = { metalness: 0, roughness: 0.6 };
const BAKED_RIM: MetalLook = { metalness: 1, roughness: 0.34 };
const BAKED_PLATE: MetalLook = { metalness: 0.9, roughness: 0.34 };
const STICKER_LOOK: MetalLook = { metalness: 0, roughness: 0.7 };

function mesh(name: string, geometry: BufferGeometry, material: MeshStandardMaterial): Mesh {
  const result = new Mesh(geometry, material);
  result.name = name;
  return result;
}

/**
 * Смуга оформлення: profile — смуга з профілю форми (спільна геометрія), raised — піднятий конус запеченого вигляду,
 * face — пластина на грані. Обідки-тори — на краях смуги. centerFront — середина текстури (u = 0.5) спереду, а не ззаду:
 * для напису одним шматком по центру полотна (поясок); атлас кільця й повтори вінця лишаються з u = 0 спереду.
 */
function band(
  group: Group,
  name: string,
  kind: TrophyKind,
  anchor: BandAnchor,
  map: Texture,
  look: MetalLook,
  metal: MeshStandardMaterial,
  centerFront = false,
): void {
  if (anchor.shape === 'face') {
    plate(group, anchor.plate, map, look, name);
    return;
  }
  const material = new MeshStandardMaterial({ map, ...look, ...OFFSET });
  let tori: readonly { y: number; radius: number; tube: number }[];
  let segments: number;
  if (anchor.shape === 'raised') {
    segments = anchor.segments;
    const strip = mesh(
      name,
      new CylinderGeometry(anchor.radiusTop, anchor.radiusBottom, anchor.height, segments, 1, true),
      material,
    );
    strip.position.y = anchor.y;
    if (centerFront) strip.rotation.y = Math.PI;
    group.add(strip);
    tori = anchor.tori;
  } else {
    const profile = TROPHY_ANCHORS[kind].profile!;
    segments = profile.segments * 3;
    // Від даних не залежить: ключ — форма й слот.
    const geometry = sharedGeometry(JSON.stringify(['band', kind, name]), () => profileBand(profile, anchor.y0, anchor.y1))!;
    const strip = mesh(name, geometry, material);
    // Поворот на півоберту: вершини смуги лишаються на вершинах моделі (сегменти кратні 4).
    if (centerFront) strip.rotation.y = Math.PI;
    group.add(strip);
    tori = anchor.tori.map((edge) => {
      const y = edge === 'bottom' ? anchor.y0 : anchor.y1;
      return { y, radius: bandEdgeRadius(profile, y, anchor.tube), tube: anchor.tube };
    });
  }
  for (const torus of tori) {
    const ring = mesh(`${name}-torus`, new TorusGeometry(torus.radius, torus.tube, 12, Math.max(segments, 64)), metal);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = torus.y;
    group.add(ring);
  }
}

function plate(group: Group, anchor: Plate, map: Texture, look: MetalLook, name = 'decor-plaque'): void {
  const card = mesh(
    name,
    new PlaneGeometry(anchor.width, anchor.height),
    new MeshStandardMaterial({ map, ...look, transparent: true, ...OFFSET }),
  );
  card.position.set(...anchor.position);
  card.rotation.x = anchor.tiltX;
  group.add(card);
}

/**
 * Декаль плями на поверхні моделі, спільна між збірками: ключ — модель, слот і пляма (скінченний набір: місця форми,
 * самоцвіти за кількістю фото). null — під плямою немає поверхні.
 */
async function decalGeometry(painter: Painter, slot: string, spot: Spot): Promise<BufferGeometry | null> {
  const surface = await painter.surface;
  return sharedGeometry(JSON.stringify([surface.key, slot, spot]), () => projectDecal(surface.geometry, spot));
}

function decal(name: string, geometry: BufferGeometry, map: Texture, look: MetalLook): Mesh {
  const result = mesh(name, geometry, new MeshStandardMaterial({ map, ...look, ...DECAL }));
  result.renderOrder = DECAL_RENDER_ORDER;
  return result;
}

async function addPhotos(group: Group, painter: Painter, metal: MeshStandardMaterial): Promise<Texture | null> {
  const { kind, material, decor, size, textures } = painter;
  const anchors = TROPHY_ANCHORS[kind];
  const photos = decor.photos;
  if (photos.length === 0) return null;
  const load = (list: DecorPhoto[]) => Promise.all(list.map((photo) => textures.image(photo.url).catch(() => null)));
  switch (decor.photoPlace) {
    case 'ring': {
      if (anchors.ring === undefined) return null;
      const images = await load(photos);
      const atlas = ringAtlasSize(photos.length);
      const map = paint(painter, 'photo-ring', photos.map(photoData), loadedFlags(images), atlas.width, atlas.height, (ctx) =>
        drawPhotoRing(ctx, images, decor, material),
      );
      band(group, 'decor-ring', kind, anchors.ring, map, BAKED_RING, metal);
      return null;
    }
    case 'medallion': {
      const spot = anchors.medallion;
      if (spot === undefined) return null;
      const [[image], geometry] = await Promise.all([load(photos.slice(0, 1)), decalGeometry(painter, 'medallion', spot)]);
      if (geometry === null) return null;
      // Обідок медальйона — у текстурі (bezel завжди true, тож у ключі полотна його немає).
      const map = paint(painter, 'photo-medallion', photoData(photos[0]!), loadedFlags([image]), DISC_PX, DISC_PX, (ctx) =>
        drawPhotoDisc(ctx, image ?? null, photos[0]!, decor, DISC_PX, material, true),
      );
      group.add(decal('decor-medallion', geometry, map, BAKED_RING));
      return null;
    }
    case 'gems': {
      const circle = anchors.gems;
      if (circle === undefined) return null;
      const spots = gemSpots(circle, photos.length);
      const [images, geometries] = await Promise.all([
        load(photos),
        Promise.all(spots.map((spot) => decalGeometry(painter, 'gem', spot))),
      ]);
      spots.forEach((_, i) => {
        const geometry = geometries[i];
        if (geometry == null) return;
        const map = paint(painter, 'photo-gem', photoData(photos[i]!), loadedFlags([images[i]]), GEM_PX, GEM_PX, (ctx) =>
          drawPhotoDisc(ctx, images[i] ?? null, photos[i]!, decor, GEM_PX, material),
        );
        group.add(decal('decor-gem', geometry, map, BAKED_RING));
      });
      return null;
    }
    case 'plaque': {
      if (anchors.plaque === undefined) return null;
      const [image] = await load(photos.slice(0, 1));
      const map = paint(painter, 'photo-plaque', photoData(photos[0]!), loadedFlags([image]), PLAQUE.width, PLAQUE.height, (ctx) =>
        drawPhotoCard(ctx, image ?? null, photos[0]!, decor, PLAQUE, material),
      );
      plate(group, anchors.plaque, map, BAKED_RING);
      return null;
    }
    case 'backdrop': {
      if (!BIG_SIZES.includes(size)) return null;
      const [image] = await load(photos.slice(0, 1));
      return paint(painter, 'photo-backdrop', photoData(photos[0]!), loadedFlags([image]), BACKDROP.width, BACKDROP.height, (ctx) =>
        drawPhotoCard(ctx, image ?? null, photos[0]!, decor, BACKDROP, material),
      );
    }
  }
}

async function addInscription(group: Group, painter: Painter, placed: PlacedInscription, metal: MeshStandardMaterial): Promise<void> {
  const { kind, material } = painter;
  const { inscription, at } = placed;
  if (at === null) return;
  const anchors = TROPHY_ANCHORS[kind];
  // Запасний шрифт (збій чи таймаут) — інший малюнок: окремий ключ, щоб пізніша збірка після шрифту малювала знову.
  const fontLoaded = loadInscriptionFont(inscription.font, inscription.text);
  const text = async (width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) =>
    paint(painter, `text-${inscription.place}`, inscription, [await fontLoaded], width, height, draw);
  switch (inscription.place) {
    case 'rim': {
      if (anchors.rim === undefined) return;
      const map = await text(2048, 96, (ctx) => drawRim(ctx, inscription, material));
      band(group, 'decor-rim', kind, anchors.rim, map, BAKED_RIM, metal);
      return;
    }
    case 'band': {
      if (anchors.band === undefined) return;
      const size = anchors.band.shape === 'face' ? BAND_PX.face : BAND_PX.ring;
      const map = await text(size.width, size.height, (ctx) => drawBand(ctx, inscription, material, size));
      band(group, 'decor-band', kind, anchors.band, map, BAKED_RIM, metal, true);
      return;
    }
    case 'plaque': {
      if (anchors.plaque === undefined) return;
      const map = await text(PLAQUE.width, PLAQUE.height, (ctx) => drawPlaque(ctx, inscription, material));
      plate(group, anchors.plaque, map, BAKED_PLATE);
      return;
    }
    case 'back': {
      // Зворот під іншою частиною — на задній грані постаменту.
      const slot = at === 'base-back' ? 'base-back' : 'back';
      const spot = at === 'base-back' ? anchors.baseBack : anchors.back;
      if (spot === undefined) return;
      const geometry = await decalGeometry(painter, slot, spot);
      if (geometry === null) return;
      const map = await text(DISC_PX, DISC_PX, (ctx) => drawBack(ctx, inscription, material));
      group.add(decal('decor-back', geometry, map, BAKED_PLATE));
      return;
    }
  }
}

async function addSticker(group: Group, painter: Painter, sticker: PlacedSticker): Promise<void> {
  // Не вміщується — не малюється й текстури не бере.
  if (sticker.at === null) return;
  const spot = TROPHY_ANCHORS[painter.kind].stickers[sticker.at];
  if (spot === undefined) return;
  const [map, geometry] = await Promise.all([
    painter.textures.sticker(sticker.id).catch(() => null),
    decalGeometry(painter, `sticker-${sticker.at}`, spot),
  ]);
  if (map === null || geometry === null) return;
  group.add(decal(`decor-sticker-${sticker.at}`, geometry, map, STICKER_LOOK));
}

/**
 * Меші оформлення в просторі моделі (основа на y = 0, лице до +Z): місця — з layoutDecor (зайняте місце — переїзд
 * чи пропуск), смуги — з профілю форми, плями — декалі на поверхні моделі surface (вантажиться паралельно з фото).
 * Місця, яких форма не має, і плями без поверхні під ними мовчки пропускаються; effect і appearance тут не малюються.
 * backdrop — фото для scene.background, лише в розмірах stage і view.
 * textures — усі полотна, взяті через textures.canvas (backdrop серед них): кожне звільняти через textures.release.
 * Текстури наліпок і геометрії з userData.shared спільні й не звільняються.
 */
export async function buildDecor(
  kind: TrophyKind,
  material: TrophyMaterial,
  decor: TrophyDecor,
  size: TrophySize,
  textures: DecorTextures,
  surface: Promise<Surface>,
): Promise<{ group: Group; backdrop: Texture | null; textures: Texture[] }> {
  // Без плям поверхню ніхто не чекає: збій моделі обробляє той, хто її вантажив.
  surface.catch(() => {});
  const shown = shownDecor(kind, decor);
  const layout = layoutDecor(kind, decor);
  const group = new Group();
  group.name = 'decor';
  const look = MATERIAL_LOOK[material];
  const metal = new MeshStandardMaterial({ color: look.color, metalness: look.metallic, roughness: look.roughness });
  // Кожна частина — своя підгрупа: порядок у сцені не залежить від того, що довантажилось першим.
  const parts = [shown.photos, ...layout.inscriptions, ...layout.stickers].map(() => new Group());
  group.add(...parts);
  const painter: Painter = { kind, material, decor: shown, size, textures, surface, taken: [] };
  const photos = layout.photos === null ? Promise.resolve(null) : addPhotos(parts[0]!, painter, metal);
  const results = await Promise.allSettled([
    photos,
    ...layout.inscriptions.map((placed, i) => addInscription(parts[1 + i]!, painter, placed, metal)),
    ...layout.stickers.map((sticker, i) => addSticker(parts[1 + layout.inscriptions.length + i]!, painter, sticker)),
  ]);
  const failed = results.find((result) => result.status === 'rejected');
  if (failed !== undefined) {
    // Збій однієї частини не тримає полотен решти: усі вже дочекались, тож нових не візьмуть.
    for (const texture of painter.taken) textures.release(texture);
    throw failed.reason;
  }
  return { group, backdrop: await photos, textures: painter.taken };
}
