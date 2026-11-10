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
  nodes: unknown[];
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

/** 25e: нові форми (переліки доповнює задача 2). */
const NEW_KINDS = [
  'lovingcup', 'vase', 'plate', 'goblet',
  'starmedal', 'cross', 'octagon', 'ribbon',
  'diadem', 'laurel', 'olive',
  'figure', 'flame', 'wings', 'fist',
] as const;
/** Кубки й статуетки: висота не менша за ширину × 0.9. */
const UPRIGHT = new Set<string>(['lovingcup', 'vase', 'plate', 'goblet', 'figure', 'flame', 'wings', 'fist']);
/** Несиметричні по X (полум'я, великий палець кулака). */
const LOPSIDED = new Set<string>(['flame', 'fist']);

describe('trophy models', () => {
  it.each([...TROPHY_KINDS, ...NEW_KINDS])('%s.glb is one mesh with one plain metal material', (kind) => {
    const model = gltf(kind);
    expect(model.meshes).toHaveLength(1);
    expect(model.materials).toHaveLength(1);
    expect(model.materials[0]!.name).toBe('metal');
    expect(model.materials[0]!.pbrMetallicRoughness?.baseColorTexture).toBeUndefined();
    expect(model.images).toBeUndefined();
  });

  it.each(NEW_KINDS)('%s.glb has one node without a transform (decor projects onto the raw mesh)', (kind) => {
    const { nodes } = gltf(kind);
    expect(nodes).toEqual([{ mesh: 0, name: kind }]);
  });

  it.each(NEW_KINDS)('%s.glb fits the size budget', (kind) => {
    expect(bytes(kind).length).toBeLessThanOrEqual(80_000);
  });

  it('the fifteen new models fit 800 000 B together', () => {
    const total = NEW_KINDS.reduce((sum, kind) => sum + bytes(kind).length, 0);
    expect(total).toBeLessThanOrEqual(800_000);
  });

  it.each(NEW_KINDS)('%s.glb stands on the floor facing front', (kind) => {
    const { min, max } = gltf(kind).accessors[0]!;
    expect(min![1]).toBeGreaterThanOrEqual(-0.005);
    expect(min![1]).toBeLessThanOrEqual(0.005);
    expect(max![1]).toBeGreaterThanOrEqual(0.8);
    expect(max![1]).toBeLessThanOrEqual(1.1);
    expect(Math.abs(min![0]! + max![0]!)).toBeLessThanOrEqual(LOPSIDED.has(kind) ? 0.08 : 0.02);
    if (UPRIGHT.has(kind)) expect(max![1]! - min![1]!).toBeGreaterThanOrEqual((max![0]! - min![0]!) * 0.9);
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

  it('crown.glb stands on a tall plinth, so the flared crown sits above the plaque', () => {
    const { min, max } = gltf('crown').accessors[0]!;
    expect(min![1]).toBe(0);
    // Ширина — як була (основи зубців до 0.4); зубці з кульками — до 0.725 + 0.12.
    expect(max![0]).toBeCloseTo(0.4, 2);
    expect(max![1]).toBeCloseTo(0.845, 2);
  });

  it('the old models are byte-identical to main', () => {
    expect({
      cup: sha('cup'),
      medal: sha('medal'),
      crown: sha('crown'),
      star: sha('star'),
      statuette: sha('statuette'),
      grail: sha('grail'),
      'grail-family': sha('grail-family'),
    }).toEqual({
      grail: '13e2788bb80322e2574f5f7ecb0f1c26c48adf3fdeae51f17f8b07855932267e',
      'grail-family': '83c1941abc17e40c6e7c1c44bfa0ea768e919b0a0279e2979ed48d4920cfb76c',
      cup: 'f971bb41109c4a67a29db610d5e95d58035259ef4a9e232ca70ed1c4bf3837b2',
      medal: '89a1206b474c33106b7d1f9e8bc0171cfee90cffee6d8b41cbcd268b0307e244',
      // Корону змінено свідомо: висока широка основа, щоб розтруб не ховав табличку.
      crown: 'b1319f9a206f361bb86a32676489cd665bfd578f5928b17a55778ca53b59ffd6',
      star: 'db5c1122c2fff841097b1b587ba95cd5c3bc7577184f109dd90d6719843f7f3a',
      statuette: '97c14e308e29a004dd3a508a2f5f5e97adf261fac0191c912549fc7f363fdc7b',
    });
  });
});
