import { BoxGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { framingSphere, loadModel, paintModel } from './models';

const loads = vi.hoisted(() => ({ count: 0, flaky: 0 }));
vi.mock('three/addons/loaders/GLTFLoader.js', async () => {
  const three = await import('three');
  return {
    GLTFLoader: vi.fn(function () {
      return {
        loadAsync: vi.fn(async (url: string) => {
          loads.count += 1;
          if (url.includes('flaky') && loads.flaky++ === 0) throw new Error('404');
          const scene = new three.Group();
          scene.add(new three.Mesh(new three.BoxGeometry(), new three.MeshStandardMaterial()));
          return { scene };
        }),
      };
    }),
  };
});

describe('models', () => {
  it('paintModel tints plain metal and keeps textured', () => {
    const plain = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: '#ffffff' }));
    const texturedMaterial = new MeshStandardMaterial({ map: new Texture() });
    const textured = new Mesh(new BoxGeometry(), texturedMaterial);
    const group = new Group();
    const inner = new Group();
    inner.add(textured);
    group.add(plain, inner);
    paintModel(group, 'bronze');
    const painted = plain.material as MeshStandardMaterial;
    expect(painted).toBeInstanceOf(MeshStandardMaterial);
    expect(`#${painted.color.getHexString().toUpperCase()}`).toBe('#B0703A');
    expect(painted.metalness).toBe(1);
    expect(painted.roughness).toBe(0.35);
    expect(textured.material).toBe(texturedMaterial);
  });

  it('loadModel clones', async () => {
    const first = await loadModel('/models/cup.glb');
    const second = await loadModel('/models/cup.glb');
    expect(loads.count).toBe(1);
    expect(first).not.toBe(second);
    expect(first.children).toHaveLength(1);
    expect(second.children).toHaveLength(1);
  });

  it('a failed load is retried on the next call', async () => {
    await expect(loadModel('/models/flaky.glb')).rejects.toThrow('404');
    const group = await loadModel('/models/flaky.glb');
    expect(group.children).toHaveLength(1);
  });

  it('framingSphere is centred on the box and reaches the farthest vertex, not the box corner', () => {
    // Як model-viewer: куля з центру рамки до найдальшої вершини; куля навколо кута рамки завелика.
    const group = new Group();
    const ball = new Mesh(new SphereGeometry(1, 32, 16), new MeshStandardMaterial());
    ball.position.set(0, 2, 0);
    group.add(ball);
    group.position.x = 5;
    const sphere = framingSphere(group);
    expect(sphere.center.x).toBeCloseTo(5);
    expect(sphere.center.y).toBeCloseTo(2);
    expect(sphere.radius).toBeCloseTo(1, 2);
  });

  it('framingSphere of an empty group is a point', () => {
    expect(framingSphere(new Group()).radius).toBe(0);
  });
});
