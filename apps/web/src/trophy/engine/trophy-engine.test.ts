// @vitest-environment jsdom
import { Object3D, Points, Texture, type Material, type Mesh, type Scene } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrophyAppearance, TrophyDecor, TrophyEffect } from '@quiz/shared';
import type { TrophyHandle, TrophyMount, TrophySize } from '../engine-types';
import type { StageView } from './stage';
import { engine } from './trophy-engine';

const fake = vi.hoisted(() => ({
  stage: null as null | {
    view: StageView | null;
    add(view: StageView): void;
    remove: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.fn>;
    environment: unknown;
    lost: boolean;
  },
}));

vi.mock('./models', async () => {
  const three = await import('three');
  return {
    loadModel: async () => {
      const group = new three.Group();
      group.add(new three.Mesh(new three.BoxGeometry(0.5, 1, 0.5), new three.MeshStandardMaterial()));
      return group;
    },
    paintModel: () => {},
    framingSphere: () => new three.Sphere(new three.Vector3(0, 0.5, 0), 0.6),
  };
});
vi.mock('./stage', () => ({ getStage: () => fake.stage }));
vi.mock('./decor-meshes', async () => {
  const three = await import('three');
  return { buildDecor: async () => ({ group: new three.Group(), backdrop: null }) };
});

/** Радіус кадрування зі stub framingSphere. */
const R = 0.6;

function decor(appearance: TrophyAppearance, effect: TrophyEffect = 'none'): TrophyDecor {
  return {
    photos: [],
    photoPlace: 'ring',
    frame: 'none',
    photoStyle: 'normal',
    inscriptions: [],
    effect: { kind: effect },
    appearance,
    stickers: [],
  };
}

let reduce = false;
let handles: TrophyHandle[] = [];

beforeEach(() => {
  reduce = false;
  handles = [];
  fake.stage = {
    view: null,
    add(view) {
      this.view = view;
    },
    remove: vi.fn(),
    invalidate: vi.fn(),
    environment: new Texture(),
    lost: false,
  };
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), media: query }));
  const gradient = { addColorStop: vi.fn() };
  const context = new Proxy({} as Record<string, unknown>, {
    get: (target, key: string) => (key === 'createRadialGradient' ? () => gradient : (target[key] ??= vi.fn())),
    set: (target, key: string, value) => ((target[key] = value), true),
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => context) as never);
});
afterEach(() => {
  for (const handle of handles) handle.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function mount(over: Partial<TrophyMount> & { decor?: TrophyDecor; size?: TrophySize } = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const { decor: spec, ...rest } = over;
  const options: TrophyMount = {
    look: { kind: 'cup', material: 'gold', ...(spec === undefined ? {} : { decor: spec }) },
    size: 'stage',
    spin: false,
    interactive: false,
    label: 'cup',
    appear: true,
    ...rest,
  };
  const onReady = vi.fn();
  const handle = engine.mount(host, options, { onReady, onError: vi.fn() });
  handles.push(handle);
  await vi.waitFor(() => expect(fake.stage!.view).not.toBeNull());
  const view = fake.stage!.view!;
  const canvas = host.querySelector('canvas')!;
  const trophy = view.scene.children[0]!;
  const frame = (delta: number) => {
    view.beforeRender!(300, 300, delta);
    view.afterDraw!();
  };
  /** Кадри по step с, поки сума не дійде до total. */
  const run = (total: number, step = 0.1) => {
    for (let spent = 0; spent < total - 1e-9; spent += step) frame(Math.min(step, total - spent));
  };
  return { handle, view, canvas, trophy, frame, run, scene: view.scene as Scene, onReady };
}

const named = (root: Object3D, prefix: string): Object3D[] => {
  const found: Object3D[] = [];
  root.traverse((object) => {
    if (object.name.startsWith(prefix)) found.push(object);
  });
  return found;
};

describe('trophy engine: effect and appearance', () => {
  it('no decor renders as before', async () => {
    for (const spin of [false, true]) {
      const { canvas, trophy, run, view, scene } = await mount({ spin });
      expect(canvas.dataset.effect).toBeUndefined();
      expect(canvas.dataset.appearance).toBeUndefined();
      run(0.5);
      expect(trophy.position.y).toBe(0);
      expect(trophy.scale.toArray()).toEqual([1, 1, 1]);
      expect(trophy.visible).toBe(true);
      expect(view.clippingPlanes).toBeUndefined();
      expect(view.needsFrame()).toBe(spin);
      expect(named(scene, 'effect-')).toEqual([]);
      expect(named(scene, 'appear-')).toEqual([]);
      fake.stage!.view = null;
    }
  });

  it('the appearance waits for the first drawn frame', async () => {
    const { canvas, view, frame, run, trophy, onReady } = await mount({ decor: decor('drop') });
    expect(canvas.dataset.effect).toBe('none:off');
    expect(canvas.dataset.appearance).toBe('drop:pending');
    expect(view.needsFrame()).toBe(true);
    // Невидимий вигляд кадрів не має: годинник стоїть.
    expect(onReady).not.toHaveBeenCalled();
    frame(0);
    expect(canvas.dataset.appearance).toBe('drop:playing');
    expect(trophy.position.y).toBeCloseTo(3 * R);
    run(1.3);
    expect(canvas.dataset.appearance).toBe('drop:done');
    expect(trophy.position.y).toBe(0);
    expect(view.needsFrame()).toBe(false);
  });

  it('the first drawn frame is t = 0 even with a running loop delta', async () => {
    const { frame, trophy } = await mount({ decor: decor('drop') });
    frame(0.05);
    expect(trophy.position.y).toBeCloseTo(3 * R);
  });

  it('spin appearance adds turns', async () => {
    const { frame, run, trophy, canvas } = await mount({ decor: decor('spin') });
    frame(0);
    run(0.7);
    expect(trophy.rotation.y).toBeGreaterThan(0);
    expect(trophy.rotation.y).toBeLessThan(4 * Math.PI);
    expect(trophy.scale.x).toBeLessThan(1);
    run(0.7);
    expect(canvas.dataset.appearance).toBe('spin:done');
    const rest = trophy.rotation.y % (2 * Math.PI);
    expect(Math.min(rest, 2 * Math.PI - rest)).toBeCloseTo(0);
    expect(trophy.scale.x).toBeCloseTo(1);
  });

  it('rise clips the floor only while playing', async () => {
    const { frame, run, view, scene, canvas, trophy } = await mount({ decor: decor('rise') });
    frame(0);
    run(0.5);
    expect(canvas.dataset.appearance).toBe('rise:playing');
    expect(view.clippingPlanes).toHaveLength(1);
    expect(trophy.position.y).toBeLessThan(0);
    const [pedestal] = named(scene, 'appear-pedestal');
    expect(pedestal!.parent).toBe(scene);
    expect(pedestal!.visible).toBe(true);
    run(1.1);
    expect(canvas.dataset.appearance).toBe('rise:done');
    expect(view.clippingPlanes).toBeUndefined();
    expect(pedestal!.visible).toBe(false);
  });

  it('flash hides the trophy first and dims the shadow while it is hidden', async () => {
    const { frame, scene, trophy } = await mount({ decor: decor('flash') });
    frame(0);
    expect(trophy.visible).toBe(false);
    const shadow = scene.children.find((child) => (child as Mesh).isMesh && child.name === '') as Mesh;
    expect((shadow.material as Material).opacity).toBe(0);
    frame(0.1);
    expect(named(scene, 'appear-flash')[0]!.visible).toBe(true);
  });

  it('reduced motion skips', async () => {
    reduce = true;
    const { canvas, frame, trophy, scene, view } = await mount({ decor: decor('flash', 'fire') });
    expect(canvas.dataset.appearance).toBe('flash:skipped');
    expect(canvas.dataset.effect).toBe('fire:off');
    frame(0);
    expect(trophy.visible).toBe(true);
    expect(trophy.scale.toArray()).toEqual([1, 1, 1]);
    expect(named(scene, 'effect-fire')).toEqual([]);
    expect(view.needsFrame()).toBe(false);
  });

  it('appear false skips', async () => {
    const { canvas, view } = await mount({ decor: decor('spin'), appear: false });
    expect(canvas.dataset.appearance).toBe('spin:skipped');
    expect(view.needsFrame()).toBe(false);
  });

  it('effect in the scene, not in the trophy', async () => {
    const { canvas, scene, trophy, run, frame, view } = await mount({ decor: decor('drop', 'snow'), size: 'stage' });
    expect(canvas.dataset.effect).toBe('snow:animated');
    const [snow] = named(scene, 'effect-snow');
    expect(snow).toBeInstanceOf(Points);
    expect(snow!.parent).toBe(scene);
    expect(named(trophy, 'effect-')).toEqual([]);
    frame(0);
    run(1.3);
    expect(canvas.dataset.appearance).toBe('drop:done');
    expect(view.needsFrame()).toBe(true);
  });

  it('a huge delta does not jump the effect', async () => {
    const { scene, frame } = await mount({ decor: decor('spin', 'snow'), appear: false });
    const snow = named(scene, 'effect-snow')[0] as Points;
    frame(0);
    frame(30);
    const y = snow.geometry.getAttribute('position');
    // Сніг нижче підлоги переноситься нагору лише при кроці, коротшому за висоту коробки.
    for (let i = 0; i < y.count; i++) expect(y.getY(i)).toBeGreaterThanOrEqual(0);
  });

  it('a card with an effect does not keep the loop', async () => {
    const { canvas, view } = await mount({ decor: decor('spin', 'fire'), size: 'card', appear: false });
    expect(canvas.dataset.effect).toBe('fire:static');
    expect(view.needsFrame()).toBe(false);
  });

  it('replay restarts, and is a no-op after dispose, when calm or without decor', async () => {
    const played = await mount({ decor: decor('drop') });
    played.frame(0);
    played.run(1.3);
    expect(played.canvas.dataset.appearance).toBe('drop:done');
    fake.stage!.invalidate.mockClear();
    played.handle.replayAppearance();
    expect(played.canvas.dataset.appearance).toBe('drop:playing');
    expect(fake.stage!.invalidate).toHaveBeenCalledWith(played.view);
    expect(played.view.needsFrame()).toBe(true);
    played.frame(0.05);
    expect(played.trophy.position.y).toBeCloseTo(3 * R);
    // Посеред гри — знову з нуля.
    played.run(0.4);
    expect(played.trophy.position.y).toBeLessThan(3 * R - 0.1);
    played.handle.replayAppearance();
    played.frame(0.05);
    expect(played.trophy.position.y).toBeCloseTo(3 * R);

    fake.stage!.view = null;
    const bare = await mount();
    fake.stage!.invalidate.mockClear();
    bare.handle.replayAppearance();
    expect(bare.canvas.dataset.appearance).toBeUndefined();
    expect(fake.stage!.invalidate).not.toHaveBeenCalled();

    fake.stage!.view = null;
    reduce = true;
    const calm = await mount({ decor: decor('spin') });
    fake.stage!.invalidate.mockClear();
    calm.handle.replayAppearance();
    expect(calm.canvas.dataset.appearance).toBe('spin:skipped');
    expect(fake.stage!.invalidate).not.toHaveBeenCalled();

    fake.stage!.invalidate.mockClear();
    played.handle.dispose();
    expect(() => played.handle.replayAppearance()).not.toThrow();
    expect(fake.stage!.invalidate).not.toHaveBeenCalled();
  });

  it('dispose frees effect resources', async () => {
    const { handle, scene } = await mount({ decor: decor('rise', 'snow') });
    const spies = ['effect-snow', 'appear-pedestal'].flatMap((name) => {
      const mesh = named(scene, name)[0] as Mesh;
      return [vi.spyOn(mesh.geometry, 'dispose'), vi.spyOn(mesh.material as Material, 'dispose')];
    });
    handle.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalled();
  });
});
