import {
  NeutralToneMapping,
  PMREMGenerator,
  SRGBColorSpace,
  WebGLRenderer,
  type PerspectiveCamera,
  type Plane,
  type Scene,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Один трофей на сторінці: власне 2D-полотно, у яке Stage копіює кадр спільного рендерера. */
export interface StageView {
  canvas: HTMLCanvasElement;
  scene: Scene;
  camera: PerspectiveCamera;
  /** true — вигляд змінюється сам (обертання, тяг): цикл кадрів не зупиняється. */
  needsFrame(): boolean;
  /** WebGL-контекст втрачено: вигляд повертає значок. */
  onLost(): void;
  /** Перед render: розмір полотна в CSS-пікселях і час від попереднього кадру, с. */
  beforeRender?(width: number, height: number, delta: number): void;
  /** Кадр скопійовано в полотно. */
  afterDraw?(): void;
  /** Площини відсікання цього вигляду; немає — без відсікання. */
  clippingPlanes?: readonly Plane[];
}

/** Спільний порожній масив: вигляд без відсікання не лишає чужих площин у рендерері. */
const NO_PLANES: Plane[] = [];

/** Найбільший devicePixelRatio, з яким малюємо. */
const MAX_PIXEL_RATIO = 2;
/** Після паузи циклу час кадру не стрибає: обертання не перескакує. */
const MAX_DELTA = 0.1;

/**
 * Один WebGLRenderer на всю сторінку: кожен видимий вигляд по черзі малюється в нього і одразу копіюється
 * (drawImage) у власне полотно. Цикл requestAnimationFrame іде, лише поки комусь треба кадр.
 */
export class Stage {
  private readonly renderer: WebGLRenderer;
  private readonly pixelRatio: number;
  private readonly views = new Set<StageView>();
  private readonly visible = new Set<StageView>();
  private readonly dirty = new Set<StageView>();
  private readonly byCanvas = new Map<Element, StageView>();
  private readonly contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D | null>();
  private readonly observer: IntersectionObserver | null;
  private readonly resizer: ResizeObserver | null;
  private scheduled = false;
  private lastTime: number | null = null;
  private env: Texture | null = null;
  private size = { width: 0, height: 0 };
  private isLost = false;

  constructor(makeRenderer: () => WebGLRenderer) {
    this.renderer = makeRenderer();
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.observer =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            for (const entry of entries) {
              const view = this.byCanvas.get(entry.target);
              if (view === undefined) continue;
              if (entry.isIntersecting) {
                this.visible.add(view);
                this.invalidate(view);
              } else {
                this.visible.delete(view);
              }
            }
          })
        : null;
    // Полотно змінило розмір (чи вперше його отримало): перемалювати.
    this.resizer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver((entries) => {
            for (const entry of entries) {
              const view = this.byCanvas.get(entry.target);
              if (view !== undefined) this.invalidate(view);
            }
          })
        : null;
  }

  /** Контекст втрачено: сцена більше нічого не малює. */
  get lost(): boolean {
    return this.isLost;
  }

  /** Світло кімнати (RoomEnvironment через PMREM): без нього метал чорний. Створюється раз, при першому зверненні. */
  get environment(): Texture {
    if (this.env === null) {
      const pmrem = new PMREMGenerator(this.renderer);
      this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }
    return this.env;
  }

  add(view: StageView): void {
    if (this.isLost) {
      view.onLost();
      return;
    }
    this.views.add(view);
    this.byCanvas.set(view.canvas, view);
    if (this.observer === null) this.visible.add(view);
    else this.observer.observe(view.canvas);
    this.resizer?.observe(view.canvas);
    this.invalidate(view);
  }

  remove(view: StageView): void {
    this.views.delete(view);
    this.visible.delete(view);
    this.dirty.delete(view);
    this.byCanvas.delete(view.canvas);
    this.observer?.unobserve(view.canvas);
    this.resizer?.unobserve(view.canvas);
  }

  /** Вигляд змінився: перемалювати в найближчому кадрі. */
  invalidate(view: StageView): void {
    if (!this.views.has(view)) return;
    this.dirty.add(view);
    this.schedule();
  }

  private schedule(): void {
    if (this.scheduled || this.isLost) return;
    this.scheduled = true;
    requestAnimationFrame(this.frame);
  }

  private readonly frame = (time: number): void => {
    this.scheduled = false;
    if (this.isLost) return;
    const delta = this.lastTime === null ? 0 : Math.min(Math.max((time - this.lastTime) / 1000, 0), MAX_DELTA);
    this.lastTime = time;
    let again = false;
    const due: StageView[] = [];
    // Буфер рендерера — за найбільшим видимим виглядом з розміром: за кадр він перевиділяється щонайбільше раз.
    let needWidth = 0;
    let needHeight = 0;
    for (const view of this.visible) {
      const moving = view.needsFrame();
      const width = view.canvas.clientWidth;
      const height = view.canvas.clientHeight;
      const sized = width > 0 && height > 0;
      if (sized) {
        needWidth = Math.max(needWidth, width);
        needHeight = Math.max(needHeight, height);
      }
      // Вигляд без розміру нічого не намалює: ResizeObserver зробить invalidate, коли розмір з'явиться.
      if (moving && sized) again = true;
      if (moving || this.dirty.has(view)) due.push(view);
    }
    if (due.length > 0 && needWidth > 0 && (this.size.width !== needWidth || this.size.height !== needHeight)) {
      // setPixelRatio уже множить на dpr: буфер — width·dpr × height·dpr.
      this.renderer.setSize(needWidth, needHeight, false);
      this.size = { width: needWidth, height: needHeight };
    }
    for (const view of due) {
      if (this.draw(view, delta)) this.dirty.delete(view);
    }
    // Невидимі (і ще без розміру) лишаються «брудними», доки не з'являться на екрані чи не отримають розмір.
    if (again) this.schedule();
    else this.lastTime = null;
  };

  /** Малює вигляд і копіює кадр у його полотно; false — малювати нікуди (нульовий розмір, без 2D-контексту). */
  private draw(view: StageView, delta: number): boolean {
    const width = view.canvas.clientWidth;
    const height = view.canvas.clientHeight;
    if (width === 0 || height === 0) return false;
    let context = this.contexts.get(view.canvas);
    if (context === undefined) {
      context = view.canvas.getContext('2d');
      this.contexts.set(view.canvas, context);
    }
    if (context === null) return false;
    view.beforeRender?.(width, height, delta);
    // Вигляд малюється в кут буфера (CSS-пікселі; рендерер сам множить на dpr). Ножиці — щоб очищення не зачепило решту.
    this.renderer.setViewport(0, 0, width, height);
    this.renderer.setScissor(0, 0, width, height);
    this.renderer.setScissorTest(true);
    this.renderer.clippingPlanes = view.clippingPlanes ? [...view.clippingPlanes] : NO_PLANES;
    this.renderer.render(view.scene, view.camera);
    const viewWidth = Math.floor(width * this.pixelRatio);
    const viewHeight = Math.floor(height * this.pixelRatio);
    const bufferHeight = Math.floor(this.size.height * this.pixelRatio);
    if (view.canvas.width !== viewWidth) view.canvas.width = viewWidth;
    if (view.canvas.height !== viewHeight) view.canvas.height = viewHeight;
    context.clearRect(0, 0, viewWidth, viewHeight);
    // WebGL рахує від низу: кут (0, 0) вікна — це нижній лівий кут буфера.
    context.drawImage(this.renderer.domElement, 0, bufferHeight - viewHeight, viewWidth, viewHeight, 0, 0, viewWidth, viewHeight);
    view.afterDraw?.();
    return true;
  }

  private readonly onContextLost = (): void => {
    this.isLost = true;
    this.observer?.disconnect();
    this.resizer?.disconnect();
    const views = [...this.views];
    this.views.clear();
    this.visible.clear();
    this.dirty.clear();
    this.byCanvas.clear();
    for (const view of views) view.onLost();
  };
}

let stage: Stage | null | undefined;

/** Сцена сторінки (одна); null — рендерер не створився або контекст втрачено (тоді — значки). */
export function getStage(): Stage | null {
  if (stage === undefined) {
    try {
      stage = new Stage(() => new WebGLRenderer({ antialias: true, alpha: true }));
    } catch {
      stage = null;
    }
  }
  if (stage?.lost) stage = null;
  return stage;
}
