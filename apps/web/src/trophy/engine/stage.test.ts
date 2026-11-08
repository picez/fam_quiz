// @vitest-environment jsdom
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Stage, type StageView } from './stage';

interface FakeRenderer {
  render: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  setPixelRatio: ReturnType<typeof vi.fn>;
  domElement: HTMLCanvasElement;
}

const fakes: FakeRenderer[] = [];
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: vi.fn(function () {
      const fake = makeFake();
      fakes.push(fake);
      return fake;
    }),
  };
});

function makeFake(): FakeRenderer {
  return { render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn(), domElement: document.createElement('canvas') };
}

let frames: FrameRequestCallback[] = [];
let observers: { callback: IntersectionObserverCallback; observed: Element[] }[] = [];
const contexts = new Map<HTMLCanvasElement, { clearRect: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> }>();

beforeEach(() => {
  frames = [];
  observers = [];
  contexts.clear();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn(function (callback: IntersectionObserverCallback) {
      const entry = { callback, observed: [] as Element[] };
      observers.push(entry);
      return {
        observe: (element: Element) => entry.observed.push(element),
        unobserve: (element: Element) => entry.observed.splice(entry.observed.indexOf(element), 1),
        disconnect: () => entry.observed.splice(0),
      };
    }),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    let context = contexts.get(this);
    if (context === undefined) {
      context = { clearRect: vi.fn(), drawImage: vi.fn() };
      contexts.set(this, context);
    }
    return context as unknown as CanvasRenderingContext2D;
  } as never);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeView(needsFrame = false): StageView & { onLost: Mock<() => void> } {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'clientWidth', { value: 120 });
  Object.defineProperty(canvas, 'clientHeight', { value: 160 });
  return { canvas, scene: new Scene(), camera: new PerspectiveCamera(30, 1, 0.01, 100), needsFrame: () => needsFrame, onLost: vi.fn<() => void>() };
}

/** Каже спостерігачу, що вигляди (не) на екрані. */
function show(views: StageView[], isIntersecting = true): void {
  for (const { callback } of observers) {
    callback(
      views.map((view) => ({ target: view.canvas, isIntersecting }) as unknown as IntersectionObserverEntry),
      {} as IntersectionObserver,
    );
  }
}

/** Виконує всі кадри, що стоять у черзі зараз (нові — на наступний виклик). */
function runFrame(time = 16): void {
  const queued = frames;
  frames = [];
  for (const callback of queued) callback(time);
}

function stageWithFake(): { stage: Stage; fake: FakeRenderer; factory: ReturnType<typeof vi.fn> } {
  const fake = makeFake();
  const factory = vi.fn(() => fake as unknown as WebGLRenderer);
  return { stage: new Stage(factory as () => WebGLRenderer), fake, factory };
}

describe('Stage', () => {
  it('one renderer for many views', () => {
    const { stage, fake, factory } = stageWithFake();
    const views = [makeView(), makeView(), makeView()];
    for (const view of views) stage.add(view);
    show(views);
    runFrame();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(fake.render).toHaveBeenCalledTimes(3);
    for (const view of views) {
      const context = contexts.get(view.canvas)!;
      expect(context.clearRect).toHaveBeenCalled();
      expect(context.drawImage).toHaveBeenCalledWith(fake.domElement, 0, 0);
    }
  });

  it('offscreen views are not drawn', () => {
    const { stage, fake } = stageWithFake();
    const seen = makeView();
    const hidden = makeView();
    stage.add(seen);
    stage.add(hidden);
    show([seen]);
    show([hidden], false);
    runFrame();
    expect(fake.render).toHaveBeenCalledTimes(1);
    expect(fake.render).toHaveBeenCalledWith(seen.scene, seen.camera);
    expect(contexts.get(hidden.canvas)?.drawImage ?? vi.fn()).not.toHaveBeenCalled();
  });

  it('the loop stops when idle', () => {
    const { stage, fake } = stageWithFake();
    const view = makeView(false);
    stage.add(view);
    show([view]);
    runFrame();
    expect(fake.render).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(0);
    stage.invalidate(view);
    stage.invalidate(view);
    expect(frames).toHaveLength(1);
    runFrame(32);
    expect(fake.render).toHaveBeenCalledTimes(2);
    expect(frames).toHaveLength(0);
  });

  it('keeps the loop while a view needs frames', () => {
    const { stage } = stageWithFake();
    const view = makeView(true);
    stage.add(view);
    show([view]);
    runFrame();
    expect(frames).toHaveLength(1);
  });

  it('pixel ratio is capped', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const { fake } = stageWithFake();
    expect(fake.setPixelRatio).toHaveBeenCalledWith(2);
  });

  it('context loss falls back', async () => {
    const { getStage } = await import('./stage');
    const stage = getStage();
    expect(stage).not.toBeNull();
    expect(getStage()).toBe(stage);
    const views = [makeView(), makeView()];
    for (const view of views) stage!.add(view);
    fakes[0]!.domElement.dispatchEvent(new Event('webglcontextlost'));
    for (const view of views) expect(view.onLost).toHaveBeenCalledTimes(1);
    expect(getStage()).toBeNull();
  });
});
