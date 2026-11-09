// @vitest-environment jsdom
import { AdditiveBlending, BufferAttribute, NormalBlending, Points, Sprite, type PointsMaterial, type SpriteMaterial } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEUTRAL_POSE } from '../appearance-pose';
import type { EffectFrame, EffectPlan } from '../effect-plan';
import { buildAppearanceProps } from './appearance-props';
import { buildEffect, flashTexture, glowTexture } from './effect-meshes';

const FRAME: EffectFrame = { center: [0, 1, 0], radius: 2 };
/** Кут поля зору камери рушія, градуси. */
const FOV = 30;
const plan = (kind: EffectPlan['kind'], mode: EffectPlan['mode'], count = 0, color = '#ffd36b'): EffectPlan => ({ kind, mode, count, color });

let gradient: { addColorStop: ReturnType<typeof vi.fn> };

beforeEach(() => {
  gradient = { addColorStop: vi.fn() };
  const context = new Proxy({} as Record<string, unknown>, {
    get: (target, key: string) => (key === 'createRadialGradient' ? () => gradient : (target[key] ??= vi.fn())),
    set: (target, key: string, value) => ((target[key] = value), true),
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => context) as never);
});
afterEach(() => vi.restoreAllMocks());

describe('effect meshes', () => {
  it('off builds nothing', () => {
    expect(buildEffect(plan('fire', 'off', 32), FRAME, 1, FOV)).toBeNull();
    expect(buildEffect(plan('none', 'off'), FRAME, 1, FOV)).toBeNull();
  });

  it('particles are one Points', () => {
    const fire = buildEffect(plan('fire', 'animated', 32), FRAME, 1, FOV)!;
    const points = fire.object as Points;
    expect(points).toBeInstanceOf(Points);
    expect(points.name).toBe('effect-fire');
    expect(points.geometry.getAttribute('position').count).toBe(32);
    expect(points.geometry.getAttribute('color').count).toBe(32);
    const material = points.material as Points['material'] & { blending: number; depthWrite: boolean };
    expect(material.blending).toBe(AdditiveBlending);
    expect(material.depthWrite).toBe(false);
    const snow = buildEffect(plan('snow', 'animated', 32), FRAME, 1, FOV)!;
    expect(((snow.object as Points).material as { blending: number }).blending).toBe(NormalBlending);
  });

  it('a particle is its size in r on screen, not shrunk by the field of view', () => {
    // three малює крапку розміром size·(висота/2)/відстань пікселів, без tan(fov/2) перспективи; тож size = світовий розмір / tan(fov/2).
    const tan = Math.tan(((FOV / 2) * Math.PI) / 180);
    for (const [kind, size] of [['sparks', 0.06], ['fire', 0.14], ['snow', 0.07]] as const) {
      const built = buildEffect(plan(kind, 'animated', 8), FRAME, 1, FOV)!;
      expect(((built.object as Points).material as PointsMaterial).size, kind).toBeCloseTo((size * FRAME.radius) / tan);
    }
  });

  it('animated moves, static stands', () => {
    const moving = buildEffect(plan('sparks', 'animated', 16), FRAME, 3, FOV)!;
    const attribute = (moving.object as Points).geometry.getAttribute('position') as BufferAttribute;
    const before = Array.from(attribute.array);
    const version = attribute.version;
    moving.update(0.1);
    expect(moving.animated).toBe(true);
    expect(Array.from(attribute.array)).not.toEqual(before);
    expect(attribute.version).toBeGreaterThan(version);

    const still = buildEffect(plan('sparks', 'static', 16), FRAME, 3, FOV)!;
    const fixed = (still.object as Points).geometry.getAttribute('position') as BufferAttribute;
    const fixedBefore = Array.from(fixed.array);
    const fixedVersion = fixed.version;
    still.update(0.1);
    expect(still.animated).toBe(false);
    expect(Array.from(fixed.array)).toEqual(fixedBefore);
    expect(fixed.version).toBe(fixedVersion);
  });

  it('glow and rays are additive and behind', () => {
    const glow = buildEffect(plan('glow', 'animated', 0, '#4fc3f7'), FRAME, 1, FOV)!;
    const sprite = glow.object as Sprite;
    const material = sprite.material as SpriteMaterial;
    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite.name).toBe('effect-glow');
    expect(material.color.getHexString()).toBe('4fc3f7');
    expect(material.blending).toBe(AdditiveBlending);
    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
    expect(sprite.renderOrder).toBe(-1);
    expect(sprite.scale.x).toBeCloseTo(2.6 * 2);
    expect(sprite.position.y).toBe(1);

    const rays = buildEffect(plan('rays', 'animated'), FRAME, 1, FOV)!;
    expect((rays.object as Sprite).name).toBe('effect-rays');
    expect((rays.object as Sprite).scale.x).toBeCloseTo(3.2 * 2);
    rays.update(1);
    expect(((rays.object as Sprite).material as SpriteMaterial).rotation).toBeCloseTo(0.25);
    const staticRays = buildEffect(plan('rays', 'static'), FRAME, 1, FOV)!;
    staticRays.update(1);
    expect(((staticRays.object as Sprite).material as SpriteMaterial).rotation).toBe(0);
  });

  it('glow, rays and the appearance flash at its peak are clear before the edge of the frame, so the canvas does not cut them into a square', async () => {
    // Край кадру — 1.05 / cos 15° ≈ 1.087r від центру (fitDistance при 30°); у частках радіуса спрайта це 1.087 / (scale / 2).
    const edge = 1.05 / Math.cos(Math.PI / 12);
    // Спалах на піку — 3r·(0.5 + 1) = 4.5r.
    for (const [name, scale] of [['glowTexture', 2.6], ['raysTexture', 3.2], ['flashTexture', 4.5]] as const) {
      vi.resetModules();
      const fresh = await import('./effect-meshes');
      gradient.addColorStop.mockClear();
      fresh[name]();
      const stops = gradient.addColorStop.mock.calls as [number, string][];
      const clear = stops.find(([, color]) => color === 'rgba(255,255,255,0)');
      expect(clear, name).toBeDefined();
      expect(clear![0], name).toBeLessThan(edge / (scale / 2));
      expect(Math.max(...stops.map(([at]) => at)), name).toBe(clear![0]);
    }
  });

  it('glow pulses only when animated', () => {
    const animated = buildEffect(plan('glow', 'animated'), FRAME, 1, FOV)!;
    const seen = new Set<number>();
    for (let i = 0; i < 10; i++) {
      animated.update(0.1);
      const opacity = ((animated.object as Sprite).material as SpriteMaterial).opacity;
      expect(opacity).toBeGreaterThanOrEqual(0.6 - 1e-9);
      expect(opacity).toBeLessThanOrEqual(0.9 + 1e-9);
      seen.add(Math.round(opacity * 1e6));
    }
    expect(seen.size).toBeGreaterThan(3);
    const still = buildEffect(plan('glow', 'static'), FRAME, 1, FOV)!;
    still.update(0.1);
    expect(((still.object as Sprite).material as SpriteMaterial).opacity).toBe(0.75);
  });

  it('dispose keeps shared textures', () => {
    const first = buildEffect(plan('glow', 'static'), FRAME, 1, FOV)!;
    const second = buildEffect(plan('glow', 'static'), FRAME, 1, FOV)!;
    const material = (first.object as Sprite).material as SpriteMaterial;
    expect(material.map).toBe(((second.object as Sprite).material as SpriteMaterial).map);
    const materialDispose = vi.spyOn(material, 'dispose');
    const mapDispose = vi.spyOn(material.map!, 'dispose');
    first.dispose();
    expect(materialDispose).toHaveBeenCalled();
    expect(mapDispose).not.toHaveBeenCalled();

    const fire = buildEffect(plan('fire', 'static', 12), FRAME, 1, FOV)!;
    const points = fire.object as Points;
    const geometryDispose = vi.spyOn(points.geometry, 'dispose');
    const pointsMaterial = points.material as unknown as { dispose(): void; map: { dispose(): void } };
    const pointsMaterialDispose = vi.spyOn(pointsMaterial, 'dispose');
    const dotDispose = vi.spyOn(pointsMaterial.map, 'dispose');
    fire.dispose();
    expect(geometryDispose).toHaveBeenCalled();
    expect(pointsMaterialDispose).toHaveBeenCalled();
    expect(dotDispose).not.toHaveBeenCalled();
  });

  it('appearance props follow the pose', () => {
    const props = buildAppearanceProps(FRAME, 1.5);
    // Спалах має власну текстуру, не сяйва: та тане лише для 2.6r.
    expect((props.flash.material as SpriteMaterial).map).toBe(flashTexture());
    expect((props.flash.material as SpriteMaterial).map).not.toBe(glowTexture());
    expect(props.flash.name).toBe('appear-flash');
    expect(props.pedestal.name).toBe('appear-pedestal');
    props.apply(NEUTRAL_POSE, 1);
    expect(props.flash.visible).toBe(false);
    expect(props.pedestal.visible).toBe(false);
    props.apply({ ...NEUTRAL_POSE, flash: 1 }, 2);
    expect(props.flash.visible).toBe(true);
    expect(props.flash.scale.x).toBeCloseTo(9);
    expect((props.flash.material as SpriteMaterial).opacity).toBe(1);
    props.apply({ ...NEUTRAL_POSE, pedestal: 0.5 }, 1);
    expect(props.pedestal.visible).toBe(true);
    expect((props.pedestal.material as { opacity: number }).opacity).toBe(0.5);
    expect(props.pedestal.position.y).toBe(0.002);
    props.dispose();
  });
});
