import { CylinderGeometry, Mesh, MeshStandardMaterial, PlaneGeometry, Texture, TorusGeometry, type Group, type Object3D } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrophyDecor } from '@quiz/shared';
import { TROPHY_ANCHORS } from '../anchors';
import { gemSpots, ringAtlasSize } from '../decor-layout';
import { TEXTURE_SCALE, buildDecor } from './decor-meshes';
import type { DecorTextures, Img } from './textures';

/** null — справжній loadInscriptionFont; true/false — підмінений результат (шрифт завантажився чи ні). */
const font = vi.hoisted(() => ({ loaded: null as boolean | null }));
vi.mock('../decor-canvas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../decor-canvas')>();
  return {
    ...actual,
    loadInscriptionFont: (...args: Parameters<typeof actual.loadInscriptionFont>) =>
      font.loaded === null ? actual.loadInscriptionFont(...args) : Promise.resolve(font.loaded),
  };
});

const url = (i: number) => `/uploads/${'a'.repeat(15)}${i.toString(16)}.jpg`;

function stub(options: { failing?: string[]; stickers?: string[] } = {}) {
  const canvases: [number, number][] = [];
  const keys: string[] = [];
  const textures: DecorTextures = {
    image: async (u) => (options.failing?.includes(u) ? null : ({ width: 800, height: 600 } as unknown as Img)),
    canvas: (key, width, height) => {
      keys.push(key);
      canvases.push([width, height]);
      return new Texture();
    },
    release: () => {},
    sticker: async (id) => (options.stickers === undefined || options.stickers.includes(id) ? new Texture() : null),
  };
  return { textures, canvases, keys };
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

describe('buildDecor', () => {
  it('grail decor matches the bake', async () => {
    const { textures, canvases } = stub();
    const { group } = await buildDecor('grail', 'gold', yasya, 'view', textures);

    const [ring] = named(group, 'decor-ring');
    expect(ring).toBeDefined();
    const ringGeometry = ring!.geometry as CylinderGeometry;
    expect(ringGeometry).toBeInstanceOf(CylinderGeometry);
    expect(ringGeometry.parameters).toMatchObject({
      radiusTop: 0.49,
      radiusBottom: 0.475,
      height: 0.52,
      radialSegments: 104,
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
    expect(plaque!.position.toArray()).toEqual([0, 0.085, 0.235]);
    expect(plaque!.rotation.x).toBeCloseTo(-0.32);
    expect((plaque!.material as MeshStandardMaterial).transparent).toBe(true);

    expect(canvases).toEqual(expect.arrayContaining([[1950, 204], [2048, 96], [1024, 400]]));
  });

  it('star ignores ring and rim', async () => {
    const { group } = await buildDecor('star', 'gold', yasya, 'view', stub().textures);
    expect(named(group, 'decor-ring')).toHaveLength(0);
    expect(named(group, 'decor-ring-torus')).toHaveLength(0);
    expect(named(group, 'decor-rim')).toHaveLength(0);
    expect(named(group, 'decor-plaque')).toHaveLength(1);
  });

  it('builds with a failed image', async () => {
    const { textures } = stub({ failing: [url(3)] });
    const { group } = await buildDecor('grail', 'gold', yasya, 'card', textures);
    expect(named(group, 'decor-ring')).toHaveLength(1);
  });

  it('backdrop only in big sizes', async () => {
    const decor: TrophyDecor = { ...yasya, photoPlace: 'backdrop', photos: yasya.photos.slice(0, 1), inscriptions: [] };
    for (const size of ['view', 'stage'] as const) {
      expect((await buildDecor('cup', 'gold', decor, size, stub().textures)).backdrop).not.toBeNull();
    }
    for (const size of ['card', 'phone'] as const) {
      expect((await buildDecor('cup', 'gold', decor, size, stub().textures)).backdrop).toBeNull();
    }
  });

  it('gems follow the anchor', async () => {
    const decor: TrophyDecor = { ...yasya, photoPlace: 'gems', photos: yasya.photos.slice(0, 5), inscriptions: [] };
    const { group } = await buildDecor('cup', 'gold', decor, 'view', stub().textures);
    const gems = named(group, 'decor-gem');
    expect(gems).toHaveLength(5);
    const spots = gemSpots(TROPHY_ANCHORS.cup.gems!, 5);
    gems.forEach((gem, i) => {
      const expected = spots[i]!.position;
      expect(gem.position.x).toBeCloseTo(expected[0]);
      expect(gem.position.y).toBeCloseTo(expected[1]);
      expect(gem.position.z).toBeCloseTo(expected[2]);
    });
  });

  it('stickers sit on their spots', async () => {
    const decor: TrophyDecor = {
      ...yasya,
      photos: [],
      inscriptions: [],
      stickers: [
        { id: 'cat', place: 'front' },
        { id: 'cat', place: 'base-right' },
        { id: 'gone', place: 'back' },
      ],
    };
    const { group } = await buildDecor('cup', 'gold', decor, 'view', stub({ stickers: ['cat'] }).textures);
    for (const place of ['front', 'base-right'] as const) {
      const [mesh] = named(group, `decor-sticker-${place}`);
      expect(mesh).toBeDefined();
      const spot = TROPHY_ANCHORS.cup.stickers[place]!;
      [0, 1, 2].forEach((axis) => {
        expect(mesh!.position.getComponent(axis)).toBeCloseTo(spot.position[axis]! + spot.normal[axis]! * 0.004);
      });
    }
    expect(named(group, 'decor-sticker-back')).toHaveLength(0);
  });

  it('effect and appearance are ignored', async () => {
    const plain = await buildDecor('grail', 'gold', yasya, 'view', stub().textures);
    const fancy = await buildDecor(
      'grail',
      'gold',
      { ...yasya, effect: { kind: 'fire' }, appearance: 'drop' },
      'view',
      stub().textures,
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
    const decor: TrophyDecor = { ...yasya, photos: yasya.photos.slice(0, 3), inscriptions: [] };
    const atlas = ringAtlasSize(3);
    const card = stub();
    const built = await buildDecor('cup', 'gold', decor, 'card', card.textures);
    expect(card.canvases).toEqual([[atlas.width * 0.5, atlas.height * 0.5]]);
    expect(built.textures).toHaveLength(1);
    const view = stub();
    await buildDecor('cup', 'gold', decor, 'view', view.textures);
    expect(view.canvases).toEqual([[atlas.width, atlas.height]]);
  });

  it('card drawing is scaled to the smaller canvas', async () => {
    const decor: TrophyDecor = { ...yasya, photos: yasya.photos.slice(0, 3), inscriptions: [] };
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
    await buildDecor('cup', 'gold', decor, 'card', textures);
    expect(scaled[0]).toEqual([0.5, 0.5]);
  });

  it('same decor shares textures', async () => {
    const { textures, build } = await realTextures();
    const first = await build('grail', 'gold', yasya, 'view', textures);
    const second = await build('grail', 'gold', yasya, 'view', textures);
    expect(first.textures.length).toBeGreaterThan(0);
    expect(second.textures).toEqual(first.textures);
    second.textures.forEach((texture, i) => expect(texture).toBe(first.textures[i]));
    // Інший розмір — інше полотно.
    const card = await build('grail', 'gold', yasya, 'card', textures);
    for (const texture of card.textures) expect(first.textures).not.toContain(texture);
  });

  it('a changed inscription redraws only itself', async () => {
    const { textures, build } = await realTextures();
    const decor: TrophyDecor = { ...yasya, inscriptions: [yasya.inscriptions[0]!] };
    const before = await build('grail', 'gold', decor, 'view', textures);
    const changed: TrophyDecor = { ...decor, inscriptions: [{ ...decor.inscriptions[0]!, text: 'Інший напис' }] };
    const after = await build('grail', 'gold', changed, 'view', textures);
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
    await buildDecor('grail', 'gold', decor, 'view', timedOut.textures);
    font.loaded = true;
    const loaded = stub();
    await buildDecor('grail', 'gold', decor, 'view', loaded.textures);
    expect(timedOut.keys).toHaveLength(1);
    expect(loaded.keys).toHaveLength(1);
    expect(loaded.keys[0]).not.toBe(timedOut.keys[0]);
  });
});
