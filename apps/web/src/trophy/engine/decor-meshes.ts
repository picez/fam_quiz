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
import { TROPHY_ANCHORS, type Band, type Plate, type Spot, type Vec3 } from '../anchors';
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
import { gemSpots, ringAtlasSize } from '../decor-layout';
import type { TrophySize } from '../engine-types';
import { MATERIAL_LOOK } from '../trophy-meta';
import type { DecorTextures } from './textures';

/** Зсув наліпки й медальйона від поверхні по нормалі. */
const LIFT = 0.004;
/** Розмір текстури кружечка: медальйон і зворот / самоцвіт. */
const DISC_PX = 512;
const GEM_PX = 256;
const PLAQUE = { width: 1024, height: 400 } as const;
const BACKDROP = { width: 1024, height: 1024 } as const;
const BIG_SIZES: readonly TrophySize[] = ['stage', 'view'];

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

/** Стрічка навколо осі Y (відкритий циліндр без повороту) з обідками-торами. */
function band(group: Group, name: string, anchor: Band, segments: number, look: MeshStandardMaterial, metal: MeshStandardMaterial): void {
  const strip = mesh(
    name,
    new CylinderGeometry(anchor.radiusTop, anchor.radiusBottom, anchor.height, segments, 1, true),
    look,
  );
  strip.position.y = anchor.y;
  group.add(strip);
  for (const torus of anchor.tori) {
    const ring = mesh(`${name}-torus`, new TorusGeometry(torus.radius, torus.tube, 12, Math.max(segments, 64)), metal);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = torus.y;
    group.add(ring);
  }
}

function plate(group: Group, anchor: Plate, map: Texture, look: MetalLook): void {
  const card = mesh(
    'decor-plaque',
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

async function addPhotos(
  group: Group,
  kind: TrophyKind,
  material: TrophyMaterial,
  decor: TrophyDecor,
  size: TrophySize,
  textures: DecorTextures,
  metal: MeshStandardMaterial,
): Promise<Texture | null> {
  const anchors = TROPHY_ANCHORS[kind];
  const photos = decor.photos;
  if (photos.length === 0) return null;
  const load = (list: DecorPhoto[]) => Promise.all(list.map((photo) => textures.image(photo.url).catch(() => null)));
  switch (decor.photoPlace) {
    case 'ring': {
      if (anchors.ring === undefined) return null;
      const images = await load(photos);
      const atlas = ringAtlasSize(photos.length);
      const map = textures.canvas(atlas.width, atlas.height, (ctx) => drawPhotoRing(ctx, images, decor, material));
      const segments = anchors.ring.segments || photos.length * 8;
      band(group, 'decor-ring', anchors.ring, segments, new MeshStandardMaterial({ map, ...BAKED_RING }), metal);
      return null;
    }
    case 'medallion': {
      const spot = anchors.medallion;
      if (spot === undefined) return null;
      const [image] = await load(photos.slice(0, 1));
      const map = textures.canvas(DISC_PX, DISC_PX, (ctx) =>
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
        const map = textures.canvas(GEM_PX, GEM_PX, (ctx) =>
          drawPhotoDisc(ctx, images[i] ?? null, photos[i]!, decor, GEM_PX, material),
        );
        group.add(disc('decor-gem', { ...spot, size: circle.size }, map, BAKED_RING, 0));
      });
      return null;
    }
    case 'plaque': {
      if (anchors.plaque === undefined) return null;
      const [image] = await load(photos.slice(0, 1));
      const map = textures.canvas(PLAQUE.width, PLAQUE.height, (ctx) =>
        drawPhotoCard(ctx, image ?? null, photos[0]!, decor, PLAQUE, material),
      );
      plate(group, anchors.plaque, map, BAKED_RING);
      return null;
    }
    case 'backdrop': {
      if (!BIG_SIZES.includes(size)) return null;
      const [image] = await load(photos.slice(0, 1));
      return textures.canvas(BACKDROP.width, BACKDROP.height, (ctx) =>
        drawPhotoCard(ctx, image ?? null, photos[0]!, decor, BACKDROP, material),
      );
    }
  }
}

async function addInscription(
  group: Group,
  kind: TrophyKind,
  material: TrophyMaterial,
  inscription: Inscription,
  textures: DecorTextures,
  metal: MeshStandardMaterial,
): Promise<void> {
  const anchors = TROPHY_ANCHORS[kind];
  await loadInscriptionFont(inscription.font, inscription.text);
  switch (inscription.place) {
    case 'rim': {
      if (anchors.rim === undefined) return;
      const map = textures.canvas(2048, 96, (ctx) => drawRim(ctx, inscription, material));
      band(group, 'decor-rim', anchors.rim, anchors.rim.segments, new MeshStandardMaterial({ map, ...BAKED_RIM }), metal);
      return;
    }
    case 'band': {
      if (anchors.band === undefined) return;
      const map = textures.canvas(1024, 64, (ctx) => drawBand(ctx, inscription, material));
      band(group, 'decor-band', anchors.band, anchors.band.segments, new MeshStandardMaterial({ map, ...BAKED_RIM }), metal);
      return;
    }
    case 'plaque': {
      if (anchors.plaque === undefined) return;
      const map = textures.canvas(PLAQUE.width, PLAQUE.height, (ctx) => drawPlaque(ctx, inscription, material));
      plate(group, anchors.plaque, map, BAKED_PLATE);
      return;
    }
    case 'back': {
      if (anchors.back === undefined) return;
      const map = textures.canvas(DISC_PX, DISC_PX, (ctx) => drawBack(ctx, inscription, material));
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
 */
export async function buildDecor(
  kind: TrophyKind,
  material: TrophyMaterial,
  decor: TrophyDecor,
  size: TrophySize,
  textures: DecorTextures,
): Promise<{ group: Group; backdrop: Texture | null }> {
  const shown = shownDecor(kind, decor);
  const group = new Group();
  group.name = 'decor';
  const look = MATERIAL_LOOK[material];
  const metal = new MeshStandardMaterial({ color: look.color, metalness: look.metallic, roughness: look.roughness });
  // Кожна частина — своя підгрупа: порядок у сцені не залежить від того, що довантажилось першим.
  const parts = [shown.photos, ...shown.inscriptions, ...shown.stickers].map(() => new Group());
  group.add(...parts);
  const photos = addPhotos(parts[0]!, kind, material, shown, size, textures, metal);
  await Promise.all([
    photos,
    ...shown.inscriptions.map((inscription, i) => addInscription(parts[1 + i]!, kind, material, inscription, textures, metal)),
    ...shown.stickers.map((sticker, i) =>
      addSticker(parts[1 + shown.inscriptions.length + i]!, kind, sticker, textures),
    ),
  ]);
  return { group, backdrop: await photos };
}
