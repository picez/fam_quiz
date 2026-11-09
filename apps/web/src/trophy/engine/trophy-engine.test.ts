// @vitest-environment jsdom
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Points, Texture, type Material, type Scene } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrophyAppearance, TrophyDecor, TrophyEffect } from '@quiz/shared';
import { decorSummary } from '../decor-layout';
import type { TrophyHandle, TrophyMount, TrophySize } from '../engine-types';
import type { TrophyLook } from '../trophy-meta';
import type { StageView } from './stage';
import { domTextures } from './textures';
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
  /** Ключі полотен, які бере stub buildDecor через справжній textures.canvas. */
  canvasKeys: [] as string[],
  /** Stub loadModel: тест може підмінити одну збірку відкладеною (mockImplementationOnce). */
  loadModel: null as unknown as ReturnType<typeof vi.fn<(url: string) => Promise<import('three').Group>>>,
}));

vi.mock('./models', async () => {
  const three = await import('three');
  return {
    loadModel: (url: string) => fake.loadModel(url),
    paintModel: () => {},
    framingSphere: () => new three.Sphere(new three.Vector3(0, 0.5, 0), 0.6),
  };
});
vi.mock('./stage', () => ({ getStage: () => fake.stage }));
vi.mock('./decor-meshes', async () => {
  const three = await import('three');
  return {
    buildDecor: async (_kind: unknown, _material: unknown, _decor: unknown, _size: unknown, textures: typeof domTextures) => ({
      group: new three.Group(),
      backdrop: null,
      textures: fake.canvasKeys.map((key) => textures.canvas(key, 4, 4, () => {})),
    }),
  };
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

/** Модель зі stub loadModel: один меш зі своїм (без текстури) матеріалом. */
function model(): Group {
  const group = new Group();
  group.add(new Mesh(new BoxGeometry(0.5, 1, 0.5), new MeshStandardMaterial()));
  return group;
}

/** Збірка, що чекає, доки тест її не відпустить. */
function deferred(): { promise: Promise<Group>; model: Group; resolve(): void } {
  const built = model();
  let resolve: () => void = () => {};
  const promise = new Promise<Group>((done) => {
    resolve = () => done(built);
  });
  return { promise, model: built, resolve };
}

/** Чи пішли всі ланцюжки промісів, що вже розв'язані. */
const settle = () => new Promise<void>((done) => setTimeout(done, 0));

let reduce = false;
let handles: TrophyHandle[] = [];

beforeEach(() => {
  reduce = false;
  handles = [];
  fake.canvasKeys = [];
  fake.loadModel = vi.fn(async () => model());
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
  const onError = vi.fn();
  const handle = engine.mount(host, options, { onReady, onError });
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
  return { handle, view, canvas, trophy, frame, run, scene: view.scene as Scene, onReady, onError };
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

  it('dispose releases shared textures', async () => {
    fake.canvasKeys = ['shared-a', 'shared-b'];
    const release = vi.spyOn(domTextures, 'release');
    const first = await mount({ decor: decor('spin') });
    fake.stage!.view = null;
    const second = await mount({ decor: decor('spin') });
    const shared = [domTextures.canvas('shared-a', 4, 4, () => {}), domTextures.canvas('shared-b', 4, 4, () => {})];
    for (const texture of shared) domTextures.release(texture);
    release.mockClear();
    const disposes = shared.map((texture) => vi.spyOn(texture, 'dispose'));
    first.handle.dispose();
    expect(release.mock.calls.map(([texture]) => texture)).toEqual(shared);
    for (const spy of disposes) expect(spy).not.toHaveBeenCalled();
    second.handle.dispose();
    expect(release).toHaveBeenCalledTimes(4);
    for (const spy of disposes) expect(spy).toHaveBeenCalledTimes(1);
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

describe('trophy engine: update in place', () => {
  const pointer = (type: string, clientX: number) => Object.assign(new Event(type), { pointerId: 1, clientX, clientY: 0 });
  const withDecor = (spec: TrophyDecor): TrophyLook => ({ kind: 'cup', material: 'gold', decor: spec });

  it('update keeps the frame and the pose', async () => {
    const { handle, canvas, trophy, frame, onReady, onError, scene } = await mount({
      decor: decor('spin'),
      appear: false,
      interactive: true,
    });
    frame(0);
    expect(onReady).toHaveBeenCalledTimes(1);
    canvas.dispatchEvent(pointer('pointerdown', 0));
    canvas.dispatchEvent(pointer('pointermove', 100));
    canvas.dispatchEvent(pointer('pointerup', 100));
    frame(0);
    const turned = trophy.rotation.y;
    expect(turned).toBeCloseTo(1);
    const [old] = trophy.children;
    const oldMaterial = (old!.children[0] as Mesh).material as Material;
    const freed = vi.spyOn(oldMaterial, 'dispose');
    const oldShadow = scene.children.find((child) => child instanceof Mesh && child.name === '') as Mesh;

    const next = deferred();
    fake.loadModel.mockImplementationOnce(() => next.promise);
    const spec: TrophyDecor = {
      ...decor('spin'),
      inscriptions: [{ place: 'rim', text: 'Ася', font: null, look: 'engraved', color: '#3a2a0e' }],
    };
    handle.update(withDecor(spec));
    await settle();
    // Доки нова збірка не готова, у сцені стара — без значка й без другого onReady.
    expect(trophy.children).toEqual([old]);
    frame(0);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(freed).not.toHaveBeenCalled();
    expect(canvas.dataset.decor).toBe(decorSummary('cup', decor('spin')));

    next.resolve();
    await vi.waitFor(() => expect(trophy.children).toEqual([next.model]));
    expect(scene.children[0]).toBe(trophy);
    expect(scene.children).not.toContain(oldShadow);
    expect(freed).toHaveBeenCalled();
    expect(trophy.rotation.y).toBe(turned);
    frame(0);
    expect(trophy.rotation.y).toBeCloseTo(turned);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(canvas.dataset.decor).toBe(decorSummary('cup', spec));
    expect(canvas.dataset.decor).not.toBe(decorSummary('cup', decor('spin')));
  });

  it('the latest update wins', async () => {
    const { handle, trophy } = await mount({ decor: decor('spin'), appear: false });
    const release = vi.spyOn(domTextures, 'release');
    fake.canvasKeys = ['late-a'];
    const a = deferred();
    const b = deferred();
    fake.loadModel.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise);
    const aFreed = vi.spyOn((a.model.children[0] as Mesh).material as Material, 'dispose');
    handle.update(withDecor(decor('drop')));
    handle.update(withDecor(decor('rise')));
    b.resolve();
    await vi.waitFor(() => expect(trophy.children).toEqual([b.model]));
    expect(release).not.toHaveBeenCalled();
    a.resolve();
    await settle();
    expect(trophy.children).toEqual([b.model]);
    expect(a.model.parent).toBeNull();
    // Застаріла збірка звільнила своє полотно рівно раз, а свою модель у сцену не поклала.
    expect(release).toHaveBeenCalledTimes(1);
    expect(aFreed).not.toHaveBeenCalled();
    handle.dispose();
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('update does not replay the appearance', async () => {
    const played = await mount({ decor: decor('drop') });
    played.frame(0);
    played.run(1.3);
    expect(played.canvas.dataset.appearance).toBe('drop:done');
    played.handle.update(withDecor(decor('drop', 'sparks')));
    await vi.waitFor(() => expect(played.canvas.dataset.effect).toBe('sparks:animated'));
    expect(played.canvas.dataset.appearance).toBe('drop:done');
    expect(named(played.scene, 'effect-sparks')).toHaveLength(1);
    played.frame(0);
    expect(played.trophy.position.y).toBe(0);

    fake.stage!.view = null;
    const bare = await mount();
    expect(bare.canvas.dataset.appearance).toBeUndefined();
    bare.handle.update(withDecor(decor('rise')));
    await vi.waitFor(() => expect(bare.canvas.dataset.appearance).toBe('rise:skipped'));
    expect(bare.canvas.dataset.effect).toBe('none:off');
    expect(bare.view.needsFrame()).toBe(false);

    // І назад без decor: атрибути зникають, поза нейтральна.
    bare.handle.update({ kind: 'cup', material: 'gold' });
    await vi.waitFor(() => expect(bare.canvas.dataset.appearance).toBeUndefined());
    expect(bare.canvas.dataset.effect).toBeUndefined();
  });

  it('replay after update plays the new appearance', async () => {
    const { handle, canvas, trophy, frame } = await mount({ decor: decor('spin'), appear: false });
    expect(canvas.dataset.appearance).toBe('spin:skipped');
    const next = deferred();
    fake.loadModel.mockImplementationOnce(() => next.promise);
    handle.update(withDecor(decor('drop')));
    handle.replayAppearance();
    await settle();
    expect(canvas.dataset.appearance).toBe('spin:skipped');
    next.resolve();
    await vi.waitFor(() => expect(canvas.dataset.appearance).toBe('drop:playing'));
    frame(0.05);
    expect(trophy.position.y).toBeCloseTo(3 * R);
  });

  it('update after dispose is a no-op', async () => {
    const { handle } = await mount({ decor: decor('spin') });
    handle.dispose();
    fake.loadModel.mockClear();
    expect(() => handle.update(withDecor(decor('drop')))).not.toThrow();
    await settle();
    expect(fake.loadModel).not.toHaveBeenCalled();
  });
});
