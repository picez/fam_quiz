import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  NormalBlending,
  Object3D,
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { createParticles, mulberry32, stepParticles, type EffectFrame, type EffectPlan, type Particles, type ParticleKind } from '../effect-plan';

export interface BuiltEffect {
  object: Object3D;
  /** animated: крок симуляції або пульсу; static нічого не робить. */
  update(delta: number): void;
  animated: boolean;
  /** Звільняє геометрії й матеріали; спільні текстури лишаються. */
  dispose(): void;
}

const GLOW_SCALE = 2.6;
const RAYS_SCALE = 3.2;
const RAYS_COLOR = '#fff4c2';
const RAYS_OPACITY = 0.6;
const RAYS_SPEED = 0.25;
const GLOW_BASE = 0.75;
const GLOW_AMPLITUDE = 0.15;
const GLOW_HZ = 0.8;
/** Світовий розмір частинки, у r. */
const POINT_SIZE: Record<ParticleKind, number> = { sparks: 0.06, fire: 0.14, snow: 0.07 };

const textures: { dot: Texture | null; glow: Texture | null; rays: Texture | null; flash: Texture | null } = {
  dot: null,
  glow: null,
  rays: null,
  flash: null,
};

function paintTexture(size: number, draw: (context: CanvasRenderingContext2D, size: number) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context !== null) draw(context, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function radial(context: CanvasRenderingContext2D, size: number, stops: [number, string][]): void {
  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
}

/** М'яка біла крапка для частинок: одна текстура на сторінку. */
export function dotTexture(): Texture {
  textures.dot ??= paintTexture(64, (context, size) =>
    radial(context, size, [
      [0, 'rgba(255,255,255,1)'],
      [0.4, 'rgba(255,255,255,0.8)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
  );
  return textures.dot;
}

/**
 * Половина висоти кадру в r: камера стоїть на fitDistance (сфера радіуса r з запасом 1.05 при 30°), тож край полотна —
 * 1.05 / cos 15° ≈ 1.09r від центру. Сяйво й промені тануть до нуля раніше, інакше край полотна зрізає їх у квадрат.
 */
const FRAME_HALF = 1.05 / Math.cos(Math.PI / 12);

/** Біле радіальне сяйво (колір дає матеріал), прозоре вже до краю кадру: одна текстура на сторінку. */
export function glowTexture(): Texture {
  const end = (0.95 * FRAME_HALF) / (GLOW_SCALE / 2);
  textures.glow ??= paintTexture(256, (context, size) =>
    radial(context, size, [
      [0, 'rgba(255,255,255,1)'],
      [0.3, 'rgba(255,255,255,0.45)'],
      [end, 'rgba(255,255,255,0)'],
    ]),
  );
  return textures.glow;
}

/** Найбільший масштаб спалаху появи, у r: 3r·(0.5 + 1) на піку. */
export const FLASH_MAX_SCALE = 4.5;

/**
 * Білий спалах появи: на піку спрайт — 4.5r, тож власна текстура (не сяйва) тане до нуля всередині кадру, інакше край
 * полотна зрізає спалах у квадрат. Одна текстура на сторінку.
 */
export function flashTexture(): Texture {
  const end = (0.95 * FRAME_HALF) / (FLASH_MAX_SCALE / 2);
  textures.flash ??= paintTexture(256, (context, size) =>
    radial(context, size, [
      [0, 'rgba(255,255,255,1)'],
      [0.4 * end, 'rgba(255,255,255,0.55)'],
      [end, 'rgba(255,255,255,0)'],
    ]),
  );
  return textures.flash;
}

/** 12 клинів-променів, що тануть до краю кадру: одна текстура на сторінку. */
export function raysTexture(): Texture {
  const end = (0.95 * FRAME_HALF) / (RAYS_SCALE / 2);
  textures.rays ??= paintTexture(256, (context, size) => {
    const half = size / 2;
    const wedges = 12;
    const gradient = context.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(end, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    for (let w = 0; w < wedges; w++) {
      const from = (w / wedges) * Math.PI * 2;
      context.beginPath();
      context.moveTo(half, half);
      context.arc(half, half, half, from, from + (Math.PI * 2) / wedges / 2);
      context.closePath();
      context.fill();
    }
  });
  return textures.rays;
}

function buildSprite(plan: EffectPlan, frame: EffectFrame): BuiltEffect {
  const rays = plan.kind === 'rays';
  const material = new SpriteMaterial({
    map: rays ? raysTexture() : glowTexture(),
    color: new Color(rays ? RAYS_COLOR : plan.color),
    transparent: true,
    opacity: rays ? RAYS_OPACITY : GLOW_BASE,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new Sprite(material);
  sprite.name = rays ? 'effect-rays' : 'effect-glow';
  sprite.renderOrder = -1;
  sprite.position.set(...frame.center);
  sprite.scale.setScalar((rays ? RAYS_SCALE : GLOW_SCALE) * frame.radius);
  const animated = plan.mode === 'animated';
  let time = 0;
  return {
    object: sprite,
    animated,
    update(delta) {
      if (!animated) return;
      time += delta;
      if (rays) material.rotation += RAYS_SPEED * delta;
      else material.opacity = GLOW_BASE + GLOW_AMPLITUDE * Math.sin(Math.PI * 2 * GLOW_HZ * time);
    },
    dispose() {
      material.dispose();
    },
  };
}

function buildPoints(plan: EffectPlan, frame: EffectFrame, seed: number, fovDeg: number): BuiltEffect {
  const kind = plan.kind as ParticleKind;
  const rng = mulberry32(seed);
  const particles: Particles = createParticles(kind, plan.count, frame, rng);
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(particles.positions, 3);
  const color = new BufferAttribute(particles.colors, 3);
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', color);
  const material = new PointsMaterial({
    // three малює крапку розміром size·(висота/2)/відстань пікселів, без tan(fov/2) перспективи: без поправки при 30° вона
    // вчетверо менша за світовий розмір (вогонь — двопіксельні тьмяні цятки).
    size: (POINT_SIZE[kind] * frame.radius) / Math.tan(((fovDeg / 2) * Math.PI) / 180),
    sizeAttenuation: true,
    map: dotTexture(),
    vertexColors: true,
    transparent: true,
    opacity: kind === 'snow' ? 0.9 : 1,
    depthWrite: false,
    blending: kind === 'snow' ? NormalBlending : AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.name = `effect-${kind}`;
  // Частинки виходять за початкову сферу, тож відсікання за межами не потрібне.
  points.frustumCulled = false;
  const animated = plan.mode === 'animated';
  return {
    object: points,
    animated,
    update(delta) {
      if (!animated) return;
      stepParticles(particles, frame, delta, rng);
      position.needsUpdate = true;
      color.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/** Об'єкт ефекту для плану; режим 'off' нічого не будує. fovDeg — кут поля зору камери (розмір частинок на екрані). */
export function buildEffect(plan: EffectPlan, frame: EffectFrame, seed: number, fovDeg: number): BuiltEffect | null {
  if (plan.mode === 'off' || plan.kind === 'none') return null;
  if (plan.kind === 'glow' || plan.kind === 'rays') return buildSprite(plan, frame);
  return buildPoints(plan, frame, seed, fovDeg);
}
