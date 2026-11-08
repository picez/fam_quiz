// Типів node у вебі немає, тож fs описано тут вручну.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
// @ts-expect-error node:crypto без @types/node
import { createHash } from 'node:crypto';
import { TROPHY_KINDS } from '@quiz/shared';
import { describe, expect, it } from 'vitest';

const dir = ['apps/web/public/models', 'public/models'].find((path) => existsSync(`${path}/cup.glb`) as boolean)!;

interface Gltf {
  meshes: unknown[];
  materials: { name: string; pbrMetallicRoughness?: { baseColorTexture?: unknown } }[];
  images?: unknown[];
  accessors: { min?: number[]; max?: number[] }[];
}
interface Bytes {
  length: number;
  readUInt32LE(at: number): number;
  subarray(from: number, to: number): { toString(encoding: string): string };
}
const bytes = (name: string) => readFileSync(`${dir}/${name}.glb`) as Bytes;
function gltf(name: string): Gltf {
  const file = bytes(name);
  const length = file.readUInt32LE(12);
  return JSON.parse(file.subarray(20, 20 + length).toString('utf8')) as Gltf;
}
const sha = (name: string) => createHash('sha256').update(bytes(name)).digest('hex') as string;

describe('trophy models', () => {
  it.each(TROPHY_KINDS)('%s.glb is one mesh with one plain metal material', (kind) => {
    const model = gltf(kind);
    expect(model.meshes).toHaveLength(1);
    expect(model.materials).toHaveLength(1);
    expect(model.materials[0]!.name).toBe('metal');
    expect(model.materials[0]!.pbrMetallicRoughness?.baseColorTexture).toBeUndefined();
    expect(model.images).toBeUndefined();
  });

  it('grail.glb is the grail body, small', () => {
    const { min, max } = gltf('grail').accessors[0]!;
    [-0.44, 0, -0.44].forEach((v, i) => expect(Math.abs(min![i]! - v)).toBeLessThanOrEqual(0.005));
    [0.44, 1.48, 0.44].forEach((v, i) => expect(Math.abs(max![i]! - v)).toBeLessThanOrEqual(0.005));
    expect(bytes('grail').length).toBeLessThanOrEqual(200_000);
  });

  // Тимчасово: задача 12 перевертає цю перевірку.
  it('grail-family.glb keeps the 3 baked images', () => {
    expect(gltf('grail-family').images).toHaveLength(3);
  });

  it('the five other models are byte-identical to main', () => {
    expect({
      cup: sha('cup'),
      medal: sha('medal'),
      crown: sha('crown'),
      star: sha('star'),
      statuette: sha('statuette'),
    }).toEqual({
      cup: 'f971bb41109c4a67a29db610d5e95d58035259ef4a9e232ca70ed1c4bf3837b2',
      medal: '89a1206b474c33106b7d1f9e8bc0171cfee90cffee6d8b41cbcd268b0307e244',
      crown: '3fef339fca06e528744f4e1bc70ece15ac160bd2474f09de653b1016be49a042',
      star: 'db5c1122c2fff841097b1b587ba95cd5c3bc7577184f109dd90d6719843f7f3a',
      statuette: '97c14e308e29a004dd3a508a2f5f5e97adf261fac0191c912549fc7f363fdc7b',
    });
  });
});
