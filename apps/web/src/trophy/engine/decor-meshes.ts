import { shownDecor } from '@quiz/shared';
import type { DecorPhoto, Inscription, TrophyDecor, TrophyKind, TrophyMaterial } from '@quiz/shared';
import {
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Texture,
} from 'three';
import { TROPHY_ANCHORS, profileRadius, type BandAnchor, type Plate, type Spot, type Vec3 } from '../anchors';
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
import { PHOTO_BOX, gemSpots, ringAtlasSize } from '../decor-layout';
import type { TrophySize } from '../engine-types';
import { MATERIAL_LOOK } from '../trophy-meta';
import type { DecorTextures } from './textures';

/** Зсув наліпки й медальйона від поверхні по нормалі. */
const LIFT = 0.004;
/** Розмір текстури кружечка: медальйон і зворот / самоцвіт. */
const DISC_PX = 512;
const GEM_PX = 256;
const PLAQUE = PHOTO_BOX.plaque;
const BACKDROP = PHOTO_BOX.backdrop;
const BIG_SIZES: readonly TrophySize[] = ['stage', 'view'];

/** Роздільність полотен оформлення за розміром вигляду: на картці й телефоні вдвічі менше (GPU-пам'ять вітрини). */
export const TEXTURE_SCALE: Record<TrophySize, number> = { stage: 1, view: 1, phone: 0.5, card: 0.5 };

/** Полотна одного buildDecor: спільні за ключем, кожне взяте записується в taken (звільнити — release). */
interface Painter {
  kind: TrophyKind;
  material: TrophyMaterial;
  decor: TrophyDecor;
  size: TrophySize;
  textures: DecorTextures;
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

function mesh(name: string, geometry: BufferGeometry, material: MeshStandardMaterial): Mesh {
  const result = new Mesh(geometry, material);
  result.name = name;
  return result;
}

/** Лицем (+Z площини) по нормалі, піднято над поверхнею на lift. */
function placeOnSpot(object: Mesh, position: Vec3, normal: Vec3, lift: number): void {
  object.position.set(position[0] + normal[0] * lift, position[1] + normal[1] * lift, position[2] + normal[2] * lift);
  object.lookAt(new Vector3(...position).add(new Vector3(...normal).multiplyScalar(lift + 1)));
}

/** Підйом смуги над профілем форми. */
const BAND_LIFT = 0.003;

/**
 * Смуга оформлення. Тимчасовий перехідник 25d (до задачі 5): profile — колишній відкритий циліндр з радіусами
 * профілю на краях + BAND_LIFT, raised — як було, face — пластина на грані. ringSegments — сегменти кільця фото (n×8).
 */
function band(
  group: Group,
  name: string,
  kind: TrophyKind,
  anchor: BandAnchor,
  map: Texture,
  look: MetalLook,
  metal: MeshStandardMaterial,
  ringSegments?: number,
): void {
  if (anchor.shape === 'face') {
    plate(group, anchor.plate, map, look, name);
    return;
  }
  let shape: { y: number; height: number; radiusTop: number; radiusBottom: number; segments: number };
  let tori: readonly { y: number; radius: number; tube: number }[];
  if (anchor.shape === 'raised') {
    shape = anchor;
    tori = anchor.tori;
  } else {
    const profile = TROPHY_ANCHORS[kind].profile!;
    const radius = (y: number) => profileRadius(profile, y) + BAND_LIFT;
    shape = {
      y: (anchor.y0 + anchor.y1) / 2,
      height: anchor.y1 - anchor.y0,
      radiusTop: radius(anchor.y1),
      radiusBottom: radius(anchor.y0),
      segments: ringSegments ?? profile.segments * 3,
    };
    tori = anchor.tori.map((edge) => {
      const y = edge === 'bottom' ? anchor.y0 : anchor.y1;
      return { y, radius: radius(y) + anchor.tube, tube: anchor.tube };
    });
  }
  const segments = shape.segments;
  const strip = mesh(
    name,
    new CylinderGeometry(shape.radiusTop, shape.radiusBottom, shape.height, segments, 1, true),
    new MeshStandardMaterial({ map, ...look }),
  );
  strip.position.y = shape.y;
  group.add(strip);
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
    new MeshStandardMaterial({ map, ...look, transparent: true }),
  );
  card.position.set(...anchor.position);
  card.rotation.x = anchor.tiltX;
  group.add(card);
}

function disc(name: string, spot: Spot, map: Texture, look: MetalLook, lift: number): Mesh {
  const result = mesh(name, new CircleGeometry(spot.size / 2, 64), new MeshStandardMaterial({ map, ...look, transparent: true }));
  placeOnSpot(result, spot.position, spot.normal, lift);
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
      band(group, 'decor-ring', kind, anchors.ring, map, BAKED_RING, metal, photos.length * 8);
      return null;
    }
    case 'medallion': {
      const spot = anchors.medallion;
      if (spot === undefined) return null;
      const [image] = await load(photos.slice(0, 1));
      const map = paint(painter, 'photo-medallion', photoData(photos[0]!), loadedFlags([image]), DISC_PX, DISC_PX, (ctx) =>
        drawPhotoDisc(ctx, image ?? null, photos[0]!, decor, DISC_PX, material),
      );
      group.add(disc('decor-medallion', spot, map, BAKED_RING, LIFT));
      const bezel = mesh('decor-medallion-bezel', new TorusGeometry(spot.size / 2, spot.size * 0.035, 12, 64), metal);
      placeOnSpot(bezel, spot.position, spot.normal, LIFT);
      group.add(bezel);
      return null;
    }
    case 'gems': {
      const circle = anchors.gems;
      if (circle === undefined) return null;
      const images = await load(photos);
      gemSpots(circle, photos.length).forEach((spot, i) => {
        const map = paint(painter, 'photo-gem', photoData(photos[i]!), loadedFlags([images[i]]), GEM_PX, GEM_PX, (ctx) =>
          drawPhotoDisc(ctx, images[i] ?? null, photos[i]!, decor, GEM_PX, material),
        );
        group.add(disc('decor-gem', { ...spot, size: circle.size, surface: circle.surface }, map, BAKED_RING, 0));
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

async function addInscription(group: Group, painter: Painter, inscription: Inscription, metal: MeshStandardMaterial): Promise<void> {
  const { kind, material } = painter;
  const anchors = TROPHY_ANCHORS[kind];
  // Запасний шрифт (збій чи таймаут) — інший малюнок: окремий ключ, щоб пізніша збірка після шрифту малювала знову.
  const fontLoaded = await loadInscriptionFont(inscription.font, inscription.text);
  const text = (width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) =>
    paint(painter, `text-${inscription.place}`, inscription, [fontLoaded], width, height, draw);
  switch (inscription.place) {
    case 'rim': {
      if (anchors.rim === undefined) return;
      const map = text(2048, 96, (ctx) => drawRim(ctx, inscription, material));
      band(group, 'decor-rim', kind, anchors.rim, map, BAKED_RIM, metal);
      return;
    }
    case 'band': {
      if (anchors.band === undefined) return;
      const map = text(1024, 64, (ctx) => drawBand(ctx, inscription, material));
      band(group, 'decor-band', kind, anchors.band, map, BAKED_RIM, metal);
      return;
    }
    case 'plaque': {
      if (anchors.plaque === undefined) return;
      const map = text(PLAQUE.width, PLAQUE.height, (ctx) => drawPlaque(ctx, inscription, material));
      plate(group, anchors.plaque, map, BAKED_PLATE);
      return;
    }
    case 'back': {
      if (anchors.back === undefined) return;
      const map = text(DISC_PX, DISC_PX, (ctx) => drawBack(ctx, inscription, material));
      group.add(disc('decor-back', anchors.back, map, BAKED_PLATE, LIFT));
      return;
    }
  }
}

async function addSticker(
  group: Group,
  kind: TrophyKind,
  sticker: TrophyDecor['stickers'][number],
  textures: DecorTextures,
): Promise<void> {
  const spot = TROPHY_ANCHORS[kind].stickers[sticker.place];
  if (spot === undefined) return;
  const map = await textures.sticker(sticker.id).catch(() => null);
  if (map === null) return;
  const result = mesh(
    `decor-sticker-${sticker.place}`,
    new PlaneGeometry(spot.size, spot.size),
    new MeshStandardMaterial({
      map,
      metalness: 0,
      roughness: 0.7,
      transparent: true,
      alphaTest: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  placeOnSpot(result, spot.position, spot.normal, LIFT);
  group.add(result);
}

/**
 * Меші оформлення в просторі моделі (основа на y = 0, лице до +Z) за точками кріплення форми.
 * Місця, яких форма не має, мовчки пропускаються; effect і appearance тут не малюються (25b).
 * backdrop — фото для scene.background, лише в розмірах stage і view.
 * textures — усі полотна, взяті через textures.canvas (backdrop серед них): кожне звільняти через textures.release.
 * Текстури наліпок спільні й сюди не входять.
 */
export async function buildDecor(
  kind: TrophyKind,
  material: TrophyMaterial,
  decor: TrophyDecor,
  size: TrophySize,
  textures: DecorTextures,
): Promise<{ group: Group; backdrop: Texture | null; textures: Texture[] }> {
  const shown = shownDecor(kind, decor);
  const group = new Group();
  group.name = 'decor';
  const look = MATERIAL_LOOK[material];
  const metal = new MeshStandardMaterial({ color: look.color, metalness: look.metallic, roughness: look.roughness });
  // Кожна частина — своя підгрупа: порядок у сцені не залежить від того, що довантажилось першим.
  const parts = [shown.photos, ...shown.inscriptions, ...shown.stickers].map(() => new Group());
  group.add(...parts);
  const painter: Painter = { kind, material, decor: shown, size, textures, taken: [] };
  const photos = addPhotos(parts[0]!, painter, metal);
  const results = await Promise.allSettled([
    photos,
    ...shown.inscriptions.map((inscription, i) => addInscription(parts[1 + i]!, painter, inscription, metal)),
    ...shown.stickers.map((sticker, i) => addSticker(parts[1 + shown.inscriptions.length + i]!, kind, sticker, textures)),
  ]);
  const failed = results.find((result) => result.status === 'rejected');
  if (failed !== undefined) {
    // Збій однієї частини не тримає полотен решти: усі вже дочекались, тож нових не візьмуть.
    for (const texture of painter.taken) textures.release(texture);
    throw failed.reason;
  }
  return { group, backdrop: await photos, textures: painter.taken };
}
