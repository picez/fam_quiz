// Лише для тестів: справжня модель з диска як BufferGeometry. Типів node у вебі немає, тож fs описано тут вручну.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { BufferAttribute, BufferGeometry } from 'three';

interface Bytes {
  readUInt32LE(at: number): number;
  readUInt16LE(at: number): number;
  readFloatLE(at: number): number;
  subarray(from: number, to: number): { toString(encoding: string): string };
}
interface Accessor {
  bufferView: number;
  byteOffset?: number;
  count: number;
  type: 'SCALAR' | 'VEC3';
}
interface GlbJson {
  accessors: Accessor[];
  bufferViews: { byteOffset?: number }[];
  meshes: { primitives: { attributes: { POSITION: number; NORMAL: number }; indices: number }[] }[];
}

const dir = ['apps/web/public/models', 'public/models'].find((path) => existsSync(`${path}/cup.glb`) as boolean)!;

/** Геометрія першого примітива `<kind>.glb`: позиції, нормалі (float), індекси (uint16) — як їх пише build-trophies.mjs. */
export function glbGeometry(kind: string): BufferGeometry {
  const file = readFileSync(`${dir}/${kind}.glb`) as Bytes;
  const length = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + length).toString('utf8')) as GlbJson;
  // Після JSON-чанка: 8 байт заголовка BIN-чанка.
  const binStart = 20 + length + 8;
  const start = (accessor: Accessor) => binStart + (json.bufferViews[accessor.bufferView]!.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const floats = (index: number) => {
    const accessor = json.accessors[index]!;
    const out = new Float32Array(accessor.count * 3);
    const at = start(accessor);
    for (let i = 0; i < out.length; i++) out[i] = file.readFloatLE(at + i * 4);
    return out;
  };
  const primitive = json.meshes[0]!.primitives[0]!;
  const indexAccessor = json.accessors[primitive.indices]!;
  const indices = new Uint16Array(indexAccessor.count);
  const at = start(indexAccessor);
  for (let i = 0; i < indices.length; i++) indices[i] = file.readUInt16LE(at + i * 2);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(floats(primitive.attributes.POSITION), 3));
  geometry.setAttribute('normal', new BufferAttribute(floats(primitive.attributes.NORMAL), 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}
