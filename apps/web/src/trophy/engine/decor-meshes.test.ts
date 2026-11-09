import {
  Box3,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Texture,
  TorusGeometry,
  Vector3,
  type Group,
  type Object3D,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrophyDecor, TrophyKind } from '@quiz/shared';
import { TROPHY_ANCHORS, profileRadius } from '../anchors';
import { gemSpots, ringAtlasSize } from '../decor-layout';
import { layoutDecor } from '../decor-places';
import { TEXTURE_SCALE, buildDecor } from './decor-meshes';
import { glbGeometry } from './glb-fixture';
import type { Surface } from './surface-geometry';
import type { DecorTextures, Img } from './textures';

/** null — справжній loadInscriptionFont; true/false — підмінений результат (шрифт завантажився чи ні). */
const font = vi.hoisted(() => ({ loaded: null as boolean | null }));
/** Аргументи кожного виклику drawPhotoDisc (малюнок підмінений: заглушки ctx не вміють градієнтів). */
const discs = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../decor-canvas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../decor-canvas')>();
  return {
    ...actual,
    loadInscriptionFont: (...args: Parameters<typeof actual.loadInscriptionFont>) =>
      font.loaded === null ? actual.loadInscriptionFont(...args) : Promise.resolve(font.loaded),
    drawPhotoDisc: (...args: unknown[]) => {
      discs.calls.push(args);
    },
  };
});

const url = (i: number) => `/uploads/${'a'.repeat(15)}${i.toString(16)}.jpg`;

const geometries = new Map<TrophyKind, BufferGeometry>();
/** Поверхня справжньої моделі форми (як surfaceOf після loadModel). */
function surfaceOf(kind: TrophyKind): Promise<Surface> {
  if (!geometries.has(kind)) geometries.set(kind, glbGeometry(kind));
  return Promise.resolve({ key: `/models/${kind}.glb`, geometry: geometries.get(kind)! });
}

function stub(options: { failing?: string[]; stickers?: string[]; draw?: boolean } = {}) {
  const canvases: [number, number][] = [];
  const keys: string[] = [];
  const stickerIds: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, key: string) => (target[key] ??= () => {}),
    set: (target, key: string, value) => ((target[key] = value), true),
  });
  const textures: DecorTextures = {
    image: async (u) => (options.failing?.includes(u) ? null : ({ width: 800, height: 600 } as unknown as Img)),
    canvas: (key, width, height, draw) => {
      keys.push(key);
      canvases.push([width, height]);
      if (options.draw) draw(ctx as unknown as CanvasRenderingContext2D);
      return new Texture();
    },
    release: vi.fn(),
    sticker: async (id) => {
      stickerIds.push(id);
      return options.stickers === undefined || options.stickers.includes(id) ? new Texture() : null;
    },
  };
  return { textures, canvases, keys, stickerIds };
}

const yasya: TrophyDecor = {
  photos: Array.from({ length: 13 }, (_, i) => ({ url: url(i), crop: { x: 0.5, y: 0.5, scale: 1 } })),
  photoPlace: 'ring',
  frame: 'none',
  photoStyle: 'normal',
  inscriptions: [
    {
      place: 'rim',
      text: "Сімейний Ґрааль сім'ї комендантів · для найрозумнішого Індіани Джонса",
      font: null,
      look: 'engraved',
      color: '#3a2a0e',
    },
    { place: 'plaque', text: 'Хочеш я тобі Ді…\nҐрааль покажу?', font: null, look: 'engraved', color: '#3a2a0e' },
  ],
  effect: { kind: 'none' },
  appearance: 'spin',
  stickers: [],
};

const bare: TrophyDecor = { ...yasya, photos: [], inscriptions: [] };
const back = { place: 'back', text: 'Ася', font: null, look: 'engraved', color: '#3a2a0e' } as const;

const named = (group: Group, name: string): Mesh[] => {
  const found: Mesh[] = [];
  group.traverse((o: Object3D) => {
    if (o instanceof Mesh && o.name === name) found.push(o);
  });
  return found;
};
const names = (group: Group): string[] => {
  const all: string[] = [];
  group.traverse((o) => {
    if (o instanceof Mesh) all.push(o.name);
  });
  return all.sort();
};
const centerOf = (mesh: Mesh) => new Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position') as never).getCenter(new Vector3());

/** Декаль: власна геометрія з uv, не пласка фігура; матеріал не пише глибину й зсунутий до камери. */
function expectDecal(mesh: Mesh | undefined): void {
  expect(mesh).toBeDefined();
  expect(mesh!.geometry.getAttribute('uv')).toBeDefined();
  expect(mesh!.geometry).not.toBeInstanceOf(PlaneGeometry);
  expect(mesh!.geometry).not.toBeInstanceOf(CircleGeometry);
  expect(mesh!.geometry.userData.shared).toBe(true);
  expect(mesh!.renderOrder).toBe(1);
  expect(mesh!.material).toMatchObject({
    transparent: true,
    alphaTest: 0.05,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
}

describe('buildDecor', () => {
  afterEach(() => {
    discs.calls = [];
  });

  it('grail decor matches the bake', async () => {
    const { textures, canvases } = stub();
    const { group } = await buildDecor('grail', 'gold', yasya, 'view', textures, surfaceOf('grail'));

    const [ring] = named(group, 'decor-ring');
    expect(ring).toBeDefined();
    expect((ring!.geometry as CylinderGeometry).parameters).toMatchObject({
      radiusTop: 0.49,
      radiusBottom: 0.475,
      height: 0.52,
      openEnded: true,
    });
    expect(ring!.position.y).toBe(1.0);
    expect(ring!.rotation.y).toBe(0);
    const ringMaterial = ring!.material as MeshStandardMaterial;
    expect(ringMaterial.metalness).toBe(0);
    expect(ringMaterial.roughness).toBe(0.6);

    const ringTori = named(group, 'decor-ring-torus').sort((a, b) => a.position.y - b.position.y);
    expect(ringTori.map((t) => t.position.y)).toEqual([0.73, 1.27]);
    expect(ringTori.map((t) => (t.geometry as TorusGeometry).parameters.radius)).toEqual([0.485, 0.5]);

    const [rim] = named(group, 'decor-rim');
    expect((rim!.geometry as CylinderGeometry).parameters).toMatchObject({
      radiusTop: 0.463,
      radiusBottom: 0.455,
      height: 0.16,
      radialSegments: 220,
      openEnded: true,
    });
    expect(rim!.position.y).toBe(1.37);
    const rimTori = named(group, 'decor-rim-torus').map((t) => t.position.y).sort();
    expect(rimTori).toEqual([1.285, 1.455]);

    const [plaque] = named(group, 'decor-plaque');
    expect((plaque!.geometry as PlaneGeometry).parameters).toMatchObject({ width: 0.46, height: 0.18 });
    expect(plaque!.position.toArray()).toEqual([0, 0.13, 0.225]);
    expect(plaque!.rotation.x).toBeCloseTo(-0.32);
    expect(plaque!.material).toMatchObject({ transparent: true, polygonOffset: true });

    expect(canvases).toEqual(expect.arrayContaining([[1950, 204], [2048, 96], [1024, 400]]));
  });

  it('grail ring stays raised', async () => {
    const { group } = await buildDecor('grail', 'gold', yasya, 'view', stub().textures, surfaceOf('grail'));
    const [ring] = named(group, 'decor-ring');
    expect(ring!.geometry).toBeInstanceOf(CylinderGeometry);
    expect((ring!.geometry as CylinderGeometry).parameters.radialSegments).toBe(120);
  });

  it('ring follows the bowl profile', async () => {
    const decor: TrophyDecor = { ...bare, photos: yasya.photos.slice(0, 5) };
    const { group } = await buildDecor('cup', 'gold', decor, 'view', stub().textures, surfaceOf('cup'));
    const [ring] = named(group, 'decor-ring');
    expect(ring).toBeDefined();
    expect(ring!.geometry).not.toBeInstanceOf(CylinderGeometry);
    expect(ring!.geometry.userData.shared).toBe(true);
    expect(ring!.material).toMatchObject({ polygonOffset: true });
    const profile = TROPHY_ANCHORS.cup.profile!;
    const position = ring!.geometry.getAttribute('position');
    expect(position.count).toBe(17 * (profile.segments * 3 + 1));
    const band = new Vector3();
    for (let i = 0; i < position.count; i++) {
      band.fromBufferAttribute(position, i);
      const gap = Math.hypot(band.x, band.z) - profileRadius(profile, band.y);
      expect(gap).toBeGreaterThanOrEqual(0.0025);
      expect(gap).toBeLessThanOrEqual(0.006);
    }
    // Справжня модель: жодна її вершина у висотах смуги не виходить за смугу (меридіан спереду, по y). Ручки на ±X
    // стирчать крізь смугу навмисно — перевіряємо передню й задню чверті.
    const meridian = Array.from({ length: 17 }, (_, j) => new Vector3().fromBufferAttribute(position, j));
    const bandRadius = (y: number) => {
      const j = meridian.findIndex((p, k) => k < 16 && y <= meridian[k + 1]!.y);
      const [lower, upper] = [meridian[j]!, meridian[j + 1]!];
      return lower.z + ((upper.z - lower.z) * (y - lower.y)) / (upper.y - lower.y);
    };
    const model = (await surfaceOf('cup')).geometry.getAttribute('position');
    const vertex = new Vector3();
    let checked = 0;
    for (let i = 0; i < model.count; i++) {
      vertex.fromBufferAttribute(model, i);
      if (vertex.y < meridian[0]!.y || vertex.y > meridian[16]!.y || Math.abs(vertex.x) >= Math.abs(vertex.z)) continue;
      checked++;
      expect(Math.hypot(vertex.x, vertex.z)).toBeLessThan(bandRadius(vertex.y));
    }
    expect(checked).toBeGreaterThan(0);
    expect(named(group, 'decor-ring-torus')).toHaveLength(2);
  });

  it('cup band is a plate on the plinth face', async () => {
    const decor: TrophyDecor = { ...bare, inscriptions: [{ ...back, place: 'band' }] };
    for (const size of ['view', 'card'] as const) {
      const { textures, canvases } = stub();
      const { group } = await buildDecor('cup', 'gold', decor, size, textures, surfaceOf('cup'));
      const [band] = named(group, 'decor-band');
      expect(band!.geometry).toBeInstanceOf(PlaneGeometry);
      expect(band!.position.z).toBeGreaterThanOrEqual(0.184);
      expect(band!.position.z).toBeLessThanOrEqual(0.188);
      expect(canvases).toEqual([[1024 * TEXTURE_SCALE[size], 128 * TEXTURE_SCALE[size]]]);
    }
  });

  it('star ignores ring and rim', async () => {
    const { group } = await buildDecor('star', 'gold', yasya, 'view', stub().textures, surfaceOf('star'));
    expect(named(group, 'decor-ring')).toHaveLength(0);
    expect(named(group, 'decor-ring-torus')).toHaveLength(0);
    expect(named(group, 'decor-rim')).toHaveLength(0);
    expect(named(group, 'decor-plaque')).toHaveLength(1);
  });

  it('builds with a failed image', async () => {
    const { textures } = stub({ failing: [url(3)] });
    const { group } = await buildDecor('grail', 'gold', yasya, 'card', textures, surfaceOf('grail'));
    expect(named(group, 'decor-ring')).toHaveLength(1);
  });

  it('backdrop only in big sizes', async () => {
    const decor: TrophyDecor = { ...bare, photoPlace: 'backdrop', photos: yasya.photos.slice(0, 1) };
    for (const size of ['view', 'stage'] as const) {
      expect((await buildDecor('cup', 'gold', decor, size, stub().textures, surfaceOf('cup'))).backdrop).not.toBeNull();
    }
    for (const size of ['card', 'phone'] as const) {
      expect((await buildDecor('cup', 'gold', decor, size, stub().textures, surfaceOf('cup'))).backdrop).toBeNull();
    }
  });

  it('gems follow the anchor', async () => {
    const decor: TrophyDecor = { ...bare, photoPlace: 'gems', photos: yasya.photos.slice(0, 5) };
    const { group } = await buildDecor('cup', 'gold', decor, 'view', stub().textures, surfaceOf('cup'));
    const gems = named(group, 'decor-gem');
    expect(gems).toHaveLength(5);
    const spots = gemSpots(TROPHY_ANCHORS.cup.gems!, 5);
    gems.forEach((gem, i) => {
      expectDecal(gem);
      const center = centerOf(gem);
      expect(center.distanceTo(new Vector3(...spots[i]!.position))).toBeLessThan(spots[i]!.size / 2);
    });
  });

  it('stickers sit on their spots', async () => {
    const decor: TrophyDecor = {
      ...bare,
      stickers: [
        { id: 'cat', place: 'front' },
        { id: 'cat', place: 'base-right' },
        { id: 'gone', place: 'back' },
      ],
    };
    const { group } = await buildDecor('cup', 'gold', decor, 'view', stub({ stickers: ['cat'] }).textures, surfaceOf('cup'));
    for (const place of ['front', 'base-right'] as const) {
      const [mesh] = named(group, `decor-sticker-${place}`);
      expectDecal(mesh);
      const spot = TROPHY_ANCHORS.cup.stickers[place]!;
      expect(centerOf(mesh!).distanceTo(new Vector3(...spot.position))).toBeLessThan(spot.size / 2);
    }
    expect(named(group, 'decor-sticker-back')).toHaveLength(0);
  });

  it('stickers and medallion are decals', async () => {
    const decor: TrophyDecor = { ...bare, photoPlace: 'medallion', photos: yasya.photos.slice(0, 1), stickers: [{ id: 'cat', place: 'back' }] };
    const { group } = await buildDecor('cup', 'gold', decor, 'view', stub({ draw: true }).textures, surfaceOf('cup'));
    expectDecal(named(group, 'decor-medallion')[0]);
    expectDecal(named(group, 'decor-sticker-back')[0]);
    expect(named(group, 'decor-medallion-bezel')).toHaveLength(0);
    expect(discs.calls).toHaveLength(1);
    // drawPhotoDisc(ctx, image, photo, decor, px, material, bezel)
    expect(discs.calls[0]![6]).toBe(true);
  });

  it('gems are painted without the medallion bezel', async () => {
    const decor: TrophyDecor = { ...bare, photoPlace: 'gems', photos: yasya.photos.slice(0, 2) };
    await buildDecor('cup', 'gold', decor, 'view', stub({ draw: true }).textures, surfaceOf('cup'));
    expect(discs.calls).toHaveLength(2);
    for (const call of discs.calls) expect(call[6]).toBeFalsy();
  });

  it('front sticker under the medallion is drawn on the left', async () => {
    const decor: TrophyDecor = { ...bare, photoPlace: 'medallion', photos: yasya.photos.slice(0, 1), stickers: [{ id: 'cat', place: 'front' }] };
    const { group } = await buildDecor('cup', 'gold', decor, 'view', stub().textures, surfaceOf('cup'));
    expectDecal(named(group, 'decor-sticker-left')[0]);
    expect(named(group, 'decor-sticker-front')).toHaveLength(0);
  });

  it('a dropped sticker is not drawn and takes no texture', async () => {
    // Кільце займає всю чашу: чотири наліпки чаші — на два вільні місця постаменту.
    const decor: TrophyDecor = {
      ...bare,
      photos: yasya.photos.slice(0, 3),
      stickers: [
        { id: 'a', place: 'front' },
        { id: 'b', place: 'back' },
        { id: 'c', place: 'left' },
      ],
    };
    const layout = layoutDecor('cup', decor);
    const dropped = layout.stickers.filter((s) => s.at === null);
    expect(dropped).toHaveLength(1);
    const { textures, stickerIds } = stub();
    const { group } = await buildDecor('cup', 'gold', decor, 'view', textures, surfaceOf('cup'));
    expect(stickerIds.sort()).toEqual(layout.stickers.filter((s) => s.at !== null).map((s) => s.id).sort());
    expect(stickerIds).not.toContain(dropped[0]!.id);
    const drawn = names(group).filter((name) => name.startsWith('decor-sticker-'));
    expect(drawn.sort()).toEqual(layout.stickers.flatMap((s) => (s.at === null ? [] : [`decor-sticker-${s.at}`])).sort());
  });

  it('cup back inscription under the ring goes to the base back', async () => {
    const decor: TrophyDecor = { ...bare, photos: yasya.photos.slice(0, 3), inscriptions: [back] };
    const { group } = await buildDecor('cup', 'gold', decor, 'view', stub().textures, surfaceOf('cup'));
    const [plate] = named(group, 'decor-back');
    expectDecal(plate);
    const center = centerOf(plate!);
    expect(center.z).toBeLessThan(-0.18);
    expect(center.y).toBeCloseTo(0.1, 2);
  });

  it('decal over no surface is skipped', async () => {
    const decor: TrophyDecor = {
      ...bare,
      photos: yasya.photos.slice(0, 3),
      inscriptions: [back],
      stickers: [{ id: 'cat', place: 'base-left' }],
    };
    const empty = Promise.resolve({ key: '/models/empty.glb', geometry: new BufferGeometry() });
    const { textures } = stub();
    const built = await buildDecor('cup', 'gold', decor, 'view', textures, empty);
    expect(names(built.group).filter((name) => name.startsWith('decor-sticker-') || name === 'decor-back')).toEqual([]);
    expect(named(built.group, 'decor-ring')).toHaveLength(1);
    // Полотно звороту не взяте: лише атлас кільця.
    expect(built.textures).toHaveLength(1);
  });

  it('decal geometry is shared between builds', async () => {
    const decor: TrophyDecor = { ...bare, stickers: [{ id: 'cat', place: 'front' }] };
    const first = await buildDecor('cup', 'gold', decor, 'view', stub().textures, surfaceOf('cup'));
    const second = await buildDecor('cup', 'gold', decor, 'card', stub().textures, surfaceOf('cup'));
    const [a] = named(first.group, 'decor-sticker-front');
    const [b] = named(second.group, 'decor-sticker-front');
    expect(b!.geometry).toBe(a!.geometry);
    expect(a!.geometry.userData.shared).toBe(true);
    // Матеріали — свої в кожної збірки.
    expect(b!.material).not.toBe(a!.material);
  });

  it('effect and appearance are ignored', async () => {
    const plain = await buildDecor('grail', 'gold', yasya, 'view', stub().textures, surfaceOf('grail'));
    const fancy = await buildDecor(
      'grail',
      'gold',
      { ...yasya, effect: { kind: 'fire' }, appearance: 'drop' },
      'view',
      stub().textures,
      surfaceOf('grail'),
    );
    expect(names(fancy.group)).toEqual(names(plain.group));
  });
});

/** Справжній кеш domTextures з полотнами-заглушками (Node без DOM): ctx лише рахує, що малювали. */
async function realTextures() {
  vi.resetModules();
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, key: string) =>
      key === 'measureText'
        ? () => ({ width: 10 })
        : key === 'createLinearGradient' || key === 'createRadialGradient'
          ? () => ({ addColorStop: () => {} })
          : key === 'getImageData'
            ? () => ({ data: new Uint8ClampedArray(4) })
            : (target[key] ??= () => {}),
    set: (target, key: string, value) => ((target[key] = value), true),
  });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
  vi.stubGlobal(
    'Image',
    class {
      width = 800;
      height = 600;
      decoding = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_url: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  const { domTextures } = await import('./textures');
  const { buildDecor: build } = await import('./decor-meshes');
  return { textures: domTextures, build };
}

const mapOf = (group: Group, name: string) => (named(group, name)[0]!.material as MeshStandardMaterial).map;

describe('buildDecor: shared textures and resolution', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('card textures are half size', async () => {
    expect(TEXTURE_SCALE).toEqual({ stage: 1, view: 1, phone: 0.5, card: 0.5 });
    const decor: TrophyDecor = { ...bare, photos: yasya.photos.slice(0, 3) };
    const atlas = ringAtlasSize(3);
    const card = stub();
    const built = await buildDecor('cup', 'gold', decor, 'card', card.textures, surfaceOf('cup'));
    expect(card.canvases).toEqual([[atlas.width * 0.5, atlas.height * 0.5]]);
    expect(built.textures).toHaveLength(1);
    const view = stub();
    await buildDecor('cup', 'gold', decor, 'view', view.textures, surfaceOf('cup'));
    expect(view.canvases).toEqual([[atlas.width, atlas.height]]);
  });

  it('card drawing is scaled to the smaller canvas', async () => {
    const decor: TrophyDecor = { ...bare, photos: yasya.photos.slice(0, 3) };
    const scaled: number[][] = [];
    const { textures } = stub();
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (target, key: string) =>
        key === 'scale' ? (x: number, y: number) => scaled.push([x, y]) : (target[key] ??= () => {}),
      set: (target, key: string, value) => ((target[key] = value), true),
    });
    textures.canvas = (_key, _width, _height, draw) => {
      draw(ctx as unknown as CanvasRenderingContext2D);
      return new Texture();
    };
    await buildDecor('cup', 'gold', decor, 'card', textures, surfaceOf('cup'));
    expect(scaled[0]).toEqual([0.5, 0.5]);
  });

  it('same decor shares textures', async () => {
    const { textures, build } = await realTextures();
    const first = await build('grail', 'gold', yasya, 'view', textures, surfaceOf('grail'));
    const second = await build('grail', 'gold', yasya, 'view', textures, surfaceOf('grail'));
    expect(first.textures.length).toBeGreaterThan(0);
    expect(second.textures).toEqual(first.textures);
    second.textures.forEach((texture, i) => expect(texture).toBe(first.textures[i]));
    // Інший розмір — інше полотно.
    const card = await build('grail', 'gold', yasya, 'card', textures, surfaceOf('grail'));
    for (const texture of card.textures) expect(first.textures).not.toContain(texture);
  });

  it('a changed inscription redraws only itself', async () => {
    const { textures, build } = await realTextures();
    const decor: TrophyDecor = { ...yasya, inscriptions: [yasya.inscriptions[0]!] };
    const before = await build('grail', 'gold', decor, 'view', textures, surfaceOf('grail'));
    const changed: TrophyDecor = { ...decor, inscriptions: [{ ...decor.inscriptions[0]!, text: 'Інший напис' }] };
    const after = await build('grail', 'gold', changed, 'view', textures, surfaceOf('grail'));
    expect(mapOf(after.group, 'decor-ring')).toBe(mapOf(before.group, 'decor-ring'));
    expect(mapOf(after.group, 'decor-rim')).not.toBe(mapOf(before.group, 'decor-rim'));
  });
});

describe('buildDecor: inscription font', () => {
  afterEach(() => {
    font.loaded = null;
  });

  it('a fallback-font inscription does not share the key of the loaded font', async () => {
    const decor: TrophyDecor = {
      ...yasya,
      photos: [],
      inscriptions: [{ ...yasya.inscriptions[0]!, font: 'hand' }],
    };
    font.loaded = false;
    const timedOut = stub();
    await buildDecor('grail', 'gold', decor, 'view', timedOut.textures, surfaceOf('grail'));
    font.loaded = true;
    const loaded = stub();
    await buildDecor('grail', 'gold', decor, 'view', loaded.textures, surfaceOf('grail'));
    expect(timedOut.keys).toHaveLength(1);
    expect(loaded.keys).toHaveLength(1);
    expect(loaded.keys[0]).not.toBe(timedOut.keys[0]);
  });
});
