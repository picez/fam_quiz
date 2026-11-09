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
import { reducedMotion } from '../../motion';
import { APPEAR_SECONDS, NEUTRAL_POSE, appearancePose, type AppearancePose } from '../appearance-pose';
import { decorSummary, fitDistance } from '../decor-layout';
import { effectPlan } from '../effect-plan';
import type { TrophyEngine, TrophyHandle, TrophyMount } from '../engine-types';
import { modelUrl } from '../trophy-meta';
import { buildAppearanceProps, type AppearanceProps } from './appearance-props';
import { buildDecor } from './decor-meshes';
import { buildEffect, type BuiltEffect } from './effect-meshes';
import { framingSphere, loadModel, paintModel } from './models';
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

/** Геометрії, матеріали й текстури оформлення — наші; текстури наліпок спільні (кеш) і лишаються. */
function decorResources(built: BuiltDecor): { dispose(): void }[] {
  const resources: { dispose(): void }[] = [];
  if (built.backdrop !== null) resources.push(built.backdrop);
  built.group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    resources.push(object.geometry);
    for (const material of [object.material].flat() as Material[]) {
      resources.push(material);
      const map = (material as { map?: Texture | null }).map;
      if (map != null && !object.name.startsWith('decor-sticker-')) resources.push(map);
    }
  });
  return resources;
}

function disposeDecor(built: BuiltDecor): void {
  for (const resource of new Set(decorResources(built))) resource.dispose();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mount(host: HTMLElement, options: TrophyMount, events: { onReady(): void; onError(): void }): TrophyHandle {
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
  const owned: { dispose(): void }[] = [];
  const seed = ++mountCount;

  // Ефект і поява — лише з decor; без нього все як у 25a (без атрибутів і нових об'єктів).
  const spec = look.decor ?? null;
  const plan = spec === null ? null : effectPlan(spec.effect, options.size, calm);
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
  if (spec !== null && plan !== null && state !== null) {
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
    // Оформлення будується разом із моделлю; його збій не ховає кубок — той показується без оформлення.
    const decor =
      look.decor == null
        ? Promise.resolve(null)
        : buildDecor(look.kind, look.material, look.decor, options.size, domTextures).catch(() => null);
    Promise.all([loadModel(modelUrl(look)), decor]).then(
      ([model, built]) => {
        if (disposed || failed) {
          if (built !== null) disposeDecor(built);
          return;
        }
        paintModel(model, look.material);
        model.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          for (const material of [object.material].flat() as Material[]) {
            // Пофарбовані (без текстури) — наші; текстури моделі спільні з кешем і лишаються.
            if ((material as { map?: unknown }).map == null) owned.push(material);
          }
        });
        // Основа — на y = 0, вісь обертання — через центр моделі.
        const box = new Box3().setFromObject(model);
        const center = box.getCenter(new Vector3());
        model.position.set(-center.x, -box.min.y, -center.z);
        trophy.add(model);
        if (built !== null) {
          // У просторі моделі: точки кріплення виміряно за її профілем.
          model.add(built.group);
          owned.push(...decorResources(built));
          if (built.backdrop !== null) scene.background = built.backdrop;
        }
        const size = box.getSize(new Vector3());
        const sphere = framingSphere(trophy);
        target.copy(sphere.center);
        radius = Math.max(sphere.radius, 0.01);
        const footprint = Math.max(size.x, size.z) * 1.6;
        const shadowGeometry = new PlaneGeometry(footprint, footprint);
        const floorMaterial = new MeshBasicMaterial({
          map: shadow(),
          transparent: true,
          opacity: SHADOW_OPACITY,
          depthWrite: false,
        });
        owned.push(shadowGeometry, floorMaterial);
        const floor = new Mesh(shadowGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.001;
        scene.add(floor);
        if (spec !== null && plan !== null) {
          // Після framingSphere: кадрування не бачить ні ефекту, ні реквізиту появи. Ефект — у scene, не крутиться з кубком.
          shadowMaterial = floorMaterial;
          const frame = { center: [target.x, target.y, target.z] as const, radius };
          effect = buildEffect(plan, frame, seed);
          if (effect !== null) {
            owned.push(effect);
            scene.add(effect.object);
          }
          if (!calm) {
            props = buildAppearanceProps(frame, Math.max(size.x, size.z));
            owned.push(props);
            scene.add(props.flash, props.pedestal);
          }
        }
        stage.add(view);
      },
      () => {
        fail();
        void decor.then((built) => {
          if (built !== null) disposeDecor(built);
        });
      },
    );
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
      for (const resource of new Set(owned)) resource.dispose();
    },
    replayAppearance() {
      if (disposed || spec === null || calm) return;
      // Ще не намальована поява й так почнеться з нуля.
      if (state !== 'pending') {
        fresh = true;
        setState('playing');
      }
      stage?.invalidate(view);
    },
  };
}

/** Рушій трофеїв: модель у кольорі матеріалу й оформлення decor на точках кріплення форми. */
export const engine: TrophyEngine = { mount };
