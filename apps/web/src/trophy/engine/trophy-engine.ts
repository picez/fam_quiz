import {
  Box3,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Scene,
  Vector3,
  type Material,
  type Texture,
} from 'three';
import { clamp } from '@quiz/shared';
import type { TrophyDecor } from '@quiz/shared';
import { reducedMotion } from '../../motion';
import { APPEAR_SECONDS, NEUTRAL_POSE, appearancePose, type AppearancePose } from '../appearance-pose';
import { decorSummary, fitDistance } from '../decor-layout';
import { effectPlan, type EffectPlan } from '../effect-plan';
import type { TrophyEngine, TrophyHandle, TrophyMount, TrophySnapshot } from '../engine-types';
import { modelUrl, type TrophyLook } from '../trophy-meta';
import { buildAppearanceProps, type AppearanceProps } from './appearance-props';
import { buildDecor } from './decor-meshes';
import { buildEffect, type BuiltEffect } from './effect-meshes';
import { framingSphere, loadModel, paintModel, surfaceOf } from './models';
import { getStage, type StageView } from './stage';
import { domTextures } from './textures';

/** Кут поля зору камери, градуси. */
const FOV = 30;
/** Швидкість обертання, рад/с. */
const SPIN_SPEED = 0.55;
/** Межа нахилу камери, рад. */
const MAX_PITCH = 0.35;
/** Початковий нахил: камера трохи згори (як типова орбіта model-viewer, 75° від осі). */
const START_PITCH = Math.PI / 12;
/** Крок стрілок ←/→: 15°. */
const KEY_STEP = Math.PI / 12;
/** Поворот на піксель тягу, рад. */
const DRAG_SPEED = 0.01;
/** Прозорість тіні під трофеєм (як shadow-intensity 0.6). */
const SHADOW_OPACITY = 0.6;
/** Найбільший крок ефекту, с: вкладка з фону не ламає симуляцію одним величезним кроком. */
const MAX_EFFECT_DELTA = 0.1;
/** «Підйом» відсікає все нижче підлоги y = 0. */
const FLOOR_CLIP: readonly Plane[] = [new Plane(new Vector3(0, 1, 0), 0)];

/** Лічильник mount: сід генератора частинок, щоб сусідні трофеї не іскрили однаково. */
let mountCount = 0;

type AppearanceState = 'pending' | 'playing' | 'done' | 'skipped';

let shadowTexture: Texture | null = null;

/** М'яка кругла тінь: радіальний градієнт, одна текстура на сторінку. */
function shadow(): Texture {
  if (shadowTexture === null) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (context !== null) {
      const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(0,0,0,0.85)');
      gradient.addColorStop(0.5, 'rgba(0,0,0,0.35)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    shadowTexture = new CanvasTexture(canvas);
  }
  return shadowTexture;
}

type BuiltDecor = Awaited<ReturnType<typeof buildDecor>>;

/**
 * Що звільнити з оформлення: геометрії й матеріали — наші (dispose), полотна — спільні за ключем, тож кожне взяте
 * посилання з built.textures віддається через release (останнє звільняє GPU). Текстури наліпок і геометрії
 * з userData.shared (декалі й смуги з модульного кешу) спільні й лишаються.
 */
function decorResources(built: BuiltDecor): { dispose(): void }[] {
  const resources: { dispose(): void }[] = [];
  built.group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (object.geometry.userData.shared !== true) resources.push(object.geometry);
    for (const material of [object.material].flat() as Material[]) resources.push(material);
  });
  // Кожне посилання — окремий об'єкт: Set у dispose не зливає два посилання на ту саму текстуру.
  for (const texture of built.textures) resources.push({ dispose: () => domTextures.release(texture) });
  return resources;
}

function disposeDecor(built: BuiltDecor): void {
  for (const resource of new Set(decorResources(built))) resource.dispose();
}

/** Одна збірка вигляду: модель з оформленням, тінь, ефект і реквізит появи — усе, що update міняє за один кадр. */
interface Build {
  look: TrophyLook;
  label: string;
  spec: TrophyDecor | null;
  plan: EffectPlan | null;
  model: Group;
  floor: Mesh;
  floorMaterial: MeshBasicMaterial;
  effect: BuiltEffect | null;
  props: AppearanceProps | null;
  backdrop: Texture | null;
  center: Vector3;
  radius: number;
  /** Усе, що збірка звільняє: свої матеріали й геометрії і по одному release на кожне взяте полотно. */
  resources: { dispose(): void }[];
  /** Оформлення неповне: збій збірки decor або щось намальовано запасним (фото, шрифт, наліпка). */
  partial: boolean;
}

function release(built: Build): void {
  for (const resource of new Set(built.resources)) resource.dispose();
}

/** Внутрішні події mount: знімку треба знати, чи вигляд у сцені повний. */
interface MountEvents {
  onReady(): void;
  onError(): void;
  /** Збірку поставлено в сцену; partial — оформлення неповне. */
  onBuilt?(partial: boolean): void;
}

function mount(host: HTMLElement, options: TrophyMount, events: MountEvents, offscreen = false): TrophyHandle {
  const { look } = options;
  const canvas = document.createElement('canvas');
  canvas.className = 'trophy-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', options.label);
  canvas.dataset.decor = decorSummary(look.kind, look.decor);
  if (options.interactive) canvas.tabIndex = 0;
  host.append(canvas);

  const stage = getStage();
  let disposed = false;
  let failed = false;
  const fail = () => {
    if (disposed || failed) return;
    failed = true;
    events.onError();
  };

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.01, 100);
  // Трофей лишається тим самим між збірками: на ньому поворот і поза, update міняє лише модель усередині.
  const trophy = new Group();
  scene.add(trophy);
  const target = new Vector3();
  let radius = 1;
  let yaw = 0;
  let pitch = START_PITCH;
  let dragging: { id: number; x: number; y: number } | null = null;
  let ready = false;
  const calm = reducedMotion();
  const spinning = options.spin && !calm;
  const seed = ++mountCount;

  // Покоління збірок: update піднімає generation, у сцену йде лише збірка останнього; shown — покоління в сцені.
  let generation = 0;
  let shown = -1;
  let current: Build | null = null;
  // replayAppearance, поки нова збірка ще не в сцені: поява нового вигляду почнеться з t = 0 після заміни.
  let replayQueued = false;

  // Ефект і поява — лише з decor; без нього все як у 25a (без атрибутів і нових об'єктів).
  // spec — оформлення вигляду в сцені (до першої заміни — з mount).
  let spec = look.decor ?? null;
  let effect: BuiltEffect | null = null;
  let props: AppearanceProps | null = null;
  let shadowMaterial: MeshBasicMaterial | null = null;
  let state: AppearanceState | null = spec === null ? null : options.appear && !calm ? 'pending' : 'skipped';
  // Годинник появи, с: рахує лише намальовані кадри; fresh — наступний кадр почне з t = 0.
  let clock = 0;
  let fresh = true;
  const setState = (next: AppearanceState) => {
    state = next;
    if (spec !== null) canvas.dataset.appearance = `${spec.appearance}:${next}`;
  };
  if (spec !== null && state !== null) {
    const plan = effectPlan(spec.effect, options.size, calm);
    canvas.dataset.effect = `${plan.kind}:${plan.mode}`;
    setState(state);
  }

  /** Поза цього кадру: годинник іде, поки анімація грає. */
  const advance = (delta: number): AppearancePose => {
    if (spec === null) return NEUTRAL_POSE;
    if (state === 'pending') setState('playing');
    if (state !== 'playing') return NEUTRAL_POSE;
    if (fresh) {
      clock = 0;
      fresh = false;
    } else clock += delta;
    const t = clock / APPEAR_SECONDS[spec.appearance];
    const pose = appearancePose(spec.appearance, t);
    if (t >= 1) setState('done');
    return pose;
  };

  const view: StageView = {
    canvas,
    scene,
    camera,
    offscreen,
    needsFrame: () =>
      (spinning && dragging === null) || effect?.animated === true || state === 'playing' || state === 'pending',
    onLost: fail,
    beforeRender(width, height, delta) {
      if (spinning && dragging === null) yaw += SPIN_SPEED * delta;
      if (spec === null) trophy.rotation.y = yaw;
      else {
        const pose = advance(delta);
        trophy.position.y = pose.lift * radius;
        trophy.scale.set(pose.scale, pose.scale * pose.squash, pose.scale);
        trophy.rotation.y = yaw + pose.turn;
        trophy.visible = pose.visible;
        view.clippingPlanes = pose.clip ? FLOOR_CLIP : undefined;
        if (shadowMaterial !== null) {
          shadowMaterial.opacity = SHADOW_OPACITY * (pose.visible ? 1 - 0.7 * clamp(pose.lift / 3, 0, 1) : 0);
        }
        props?.apply(pose, radius);
        effect?.update(Math.min(delta, MAX_EFFECT_DELTA));
      }
      const aspect = width / height;
      const distance = fitDistance(radius, FOV, aspect);
      if (!Number.isFinite(distance)) return;
      camera.aspect = aspect;
      camera.near = distance / 100;
      camera.far = distance * 10;
      camera.position.set(target.x, target.y + distance * Math.sin(pitch), target.z + distance * Math.cos(pitch));
      camera.lookAt(target);
      camera.updateProjectionMatrix();
    },
    afterDraw() {
      if (ready || disposed) return;
      ready = true;
      events.onReady();
    },
  };

  /** Збірку цього покоління вже не покажуть: dispose, збій чи новіший update. */
  const stale = (gen: number) => disposed || failed || gen !== generation;

  /**
   * Зібрати вигляд поза сценою: модель, оформлення, тінь, ефект, реквізит появи й кадрування. Застаріла збірка
   * звільняє своє оформлення тут (рівно раз) і дає null. Збій моделі останньої збірки — onError, як при mount;
   * збій лише decor — кубок без оформлення.
   */
  const build = (next: TrophyLook, label: string, gen: number): Promise<Build | null> => {
    const nextSpec = next.decor ?? null;
    const url = modelUrl(next);
    // Одна копія моделі: вона йде в сцену, а її геометрія — поверхнею для декалей оформлення.
    const loaded = loadModel(url);
    // Оформлення будується разом із моделлю; його збій не ховає кубок — той показується без оформлення.
    // Без decor (зокрема сімейний грааль) поверхня не потрібна.
    const decor =
      nextSpec === null
        ? Promise.resolve(null)
        : buildDecor(
            next.kind,
            next.material,
            nextSpec,
            options.size,
            domTextures,
            loaded.then((model) => surfaceOf(model, url)),
          ).catch(() => null);
    return Promise.all([loaded, decor]).then(
      ([model, built]) => {
        if (stale(gen)) {
          // Модель ще не пофарбована, свого в ній нема; оформлення ще ніде не записане — звільняємо тут.
          if (built !== null) disposeDecor(built);
          return null;
        }
        const resources: { dispose(): void }[] = [];
        paintModel(model, next.material);
        model.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          for (const material of [object.material].flat() as Material[]) {
            // Пофарбовані (без текстури) — наші, крім спільних матеріалів трофея (userData.shared); текстури моделі спільні з кешем і лишаються.
            if ((material as { map?: unknown }).map == null && material.userData.shared !== true) resources.push(material);
          }
        });
        // Основа — на y = 0, вісь обертання — через центр моделі.
        const box = new Box3().setFromObject(model);
        const center = box.getCenter(new Vector3());
        model.position.set(-center.x, -box.min.y, -center.z);
        if (built !== null) {
          // У просторі моделі: точки кріплення виміряно за її профілем.
          model.add(built.group);
          resources.push(...decorResources(built));
        }
        const size = box.getSize(new Vector3());
        // Модель ще поза трофеєм: її світові координати ті самі, що в трофеї без пози.
        const sphere = framingSphere(model);
        const frameRadius = Math.max(sphere.radius, 0.01);
        const footprint = Math.max(size.x, size.z) * 1.6;
        const shadowGeometry = new PlaneGeometry(footprint, footprint);
        const floorMaterial = new MeshBasicMaterial({
          map: shadow(),
          transparent: true,
          opacity: SHADOW_OPACITY,
          depthWrite: false,
        });
        resources.push(shadowGeometry, floorMaterial);
        const floor = new Mesh(shadowGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.001;
        const plan = nextSpec === null ? null : effectPlan(nextSpec.effect, options.size, calm);
        let nextEffect: BuiltEffect | null = null;
        let nextProps: AppearanceProps | null = null;
        if (plan !== null) {
          // Після framingSphere: кадрування не бачить ні ефекту, ні реквізиту появи. Ефект — у scene, не крутиться з кубком.
          const frame = { center: [sphere.center.x, sphere.center.y, sphere.center.z] as const, radius: frameRadius };
          nextEffect = buildEffect(plan, frame, seed, FOV);
          if (nextEffect !== null) resources.push(nextEffect);
          if (!calm) {
            nextProps = buildAppearanceProps(frame, Math.max(size.x, size.z));
            resources.push(nextProps);
          }
        }
        return {
          look: next,
          label,
          spec: nextSpec,
          plan,
          model,
          floor,
          floorMaterial,
          effect: nextEffect,
          props: nextProps,
          backdrop: built?.backdrop ?? null,
          center: sphere.center,
          radius: frameRadius,
          resources,
          partial: nextSpec !== null && (built === null || built.partial),
        };
      },
      () => {
        if (gen === generation) fail();
        void decor.then((built) => {
          if (built !== null) disposeDecor(built);
        });
        return null;
      },
    );
  };

  /** Поставити готову збірку замість старої за один кадр; стара звільняється одразу. */
  const swap = (next: Build, gen: number) => {
    if (stale(gen)) {
      release(next);
      return;
    }
    const old = current;
    if (old !== null) {
      trophy.remove(old.model);
      scene.remove(old.floor);
      if (old.effect !== null) scene.remove(old.effect.object);
      if (old.props !== null) scene.remove(old.props.flash, old.props.pedestal);
      release(old);
    }
    current = next;
    shown = gen;
    trophy.add(next.model);
    scene.add(next.floor);
    if (next.effect !== null) scene.add(next.effect.object);
    if (next.props !== null) scene.add(next.props.flash, next.props.pedestal);
    scene.background = next.backdrop;
    target.copy(next.center);
    radius = next.radius;
    effect = next.effect;
    props = next.props;
    shadowMaterial = next.spec === null ? null : next.floorMaterial;
    canvas.dataset.decor = decorSummary(next.look.kind, next.look.decor);
    canvas.setAttribute('aria-label', next.label);

    const replay = replayQueued && !calm;
    replayQueued = false;
    spec = next.spec;
    if (next.spec === null || next.plan === null) {
      // Без decor — як у 25a: без атрибутів, поза нейтральна.
      state = null;
      delete canvas.dataset.effect;
      delete canvas.dataset.appearance;
      trophy.position.y = 0;
      trophy.scale.set(1, 1, 1);
      trophy.visible = true;
      view.clippingPlanes = undefined;
    } else {
      canvas.dataset.effect = `${next.plan.kind}:${next.plan.mode}`;
      // Поява не перезапускається: decor щойно з'явився — 'skipped', інакше стан як був.
      if (replay) fresh = true;
      setState(replay ? 'playing' : (state ?? 'skipped'));
    }
    events.onBuilt?.(next.partial);
    if (old === null) stage?.add(view);
    else stage?.invalidate(view);
  };

  const start = (next: TrophyLook, label: string, gen: number) => {
    void build(next, label, gen).then((built) => {
      if (built !== null) swap(built, gen);
    });
  };

  const onPointerDown = (event: PointerEvent) => {
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (dragging === null || dragging.id !== event.pointerId) return;
    yaw += (event.clientX - dragging.x) * DRAG_SPEED;
    pitch = clamp(pitch + (event.clientY - dragging.y) * DRAG_SPEED, -MAX_PITCH, MAX_PITCH);
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
    stage?.invalidate(view);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (dragging === null || dragging.id !== event.pointerId) return;
    dragging = null;
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    stage?.invalidate(view);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    yaw += event.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP;
    stage?.invalidate(view);
  };
  if (options.interactive) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('keydown', onKeyDown);
  }

  if (stage === null) {
    queueMicrotask(fail);
  } else {
    scene.environment = stage.environment;
    start(look, options.label, generation);
  }

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      stage?.remove(view);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.remove();
      // Збірки, що ще в дорозі, звільнять себе самі (stale).
      if (current !== null) release(current);
      current = null;
    },
    replayAppearance() {
      if (disposed || calm) return;
      if (shown !== generation) {
        // Нова збірка ще не в сцені: грати її появу після заміни.
        replayQueued = true;
        return;
      }
      if (spec === null) return;
      // Ще не намальована поява й так почнеться з нуля.
      if (state !== 'pending') {
        fresh = true;
        setState('playing');
      }
      stage?.invalidate(view);
    },
    update(next, label) {
      if (disposed || failed || stage === null) return;
      generation += 1;
      start(next, label, generation);
    },
  };
}

/** Сторона знімка, CSS-пікселі (Stage множить на devicePixelRatio, до 2). */
export const SNAPSHOT_SIZE = 240;
/** Скільки чекати першого кадру знімка, мс: модель, що не прийшла, не тримає чергу знімків вічно. */
export const SNAPSHOT_TIMEOUT = 20_000;

/**
 * Статичний знімок вигляду: той самий mount (модель, матеріал, оформлення, кадрування як у сцені), але без
 * обертання й появи, у прихованому полотні поза екраном; перший кадр — data URL з прозорим тлом (WebP; старий Safari,
 * що не вміє кодувати WebP, віддає PNG), після чого вигляд одразу звільняється. complete — оформлення повне (див.
 * Build.partial): неповний знімок показують, але не зберігають. Збій моделі, втрата контексту чи тайм-аут — null.
 * Тайм-аут не спрацьовує, поки вкладка прихована (requestAnimationFrame тоді стоїть): відлік починається знову.
 */
function snapshot(look: TrophyLook, label: string): Promise<TrophySnapshot | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    Object.assign(host.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: `${SNAPSHOT_SIZE}px`,
      height: `${SNAPSHOT_SIZE}px`,
      pointerEvents: 'none',
    });
    document.body.append(host);
    let handle: TrophyHandle | null = null;
    let done = false;
    let complete = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (url: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // Звільняємо після поточного кадру Stage: onReady приходить зсередини його циклу.
      queueMicrotask(() => {
        handle?.dispose();
        host.remove();
      });
      resolve(url === null ? null : { url, complete });
    };
    const arm = () => {
      timer = setTimeout(() => {
        if (document.hidden) arm();
        else finish(null);
      }, SNAPSHOT_TIMEOUT);
    };
    arm();
    handle = mount(
      host,
      { look, size: 'view', spin: false, interactive: false, label, appear: false },
      {
        onBuilt: (partial) => {
          complete = !partial;
        },
        onReady: () => {
          const canvas = host.querySelector('canvas');
          try {
            finish(canvas === null ? null : canvas.toDataURL('image/webp'));
          } catch {
            finish(null);
          }
        },
        onError: () => finish(null),
      },
      true,
    );
  });
}

/** Рушій трофеїв: модель у кольорі матеріалу й оформлення decor на точках кріплення форми. */
export const engine: TrophyEngine = { mount: (host, options, events) => mount(host, options, events), snapshot };
