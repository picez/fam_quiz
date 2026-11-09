import type { TrophyMaterial } from '@quiz/shared';
import { Box3, Mesh, Sphere, Vector3, type BufferGeometry, type Group, type Material, type MeshStandardMaterial, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { trophyMaterial } from './materials';
import type { Surface } from './surface-geometry';

const models = new Map<string, Promise<Group>>();
let loader: GLTFLoader | null = null;

/** Модель за адресою: вантажиться раз (збій — не кешується), кожен виклик отримує власну копію (геометрія й текстури спільні). */
export function loadModel(url: string): Promise<Group> {
  let model = models.get(url);
  if (model === undefined) {
    loader ??= new GLTFLoader();
    model = loader.loadAsync(url).then((gltf) => gltf.scene);
    models.set(url, model);
    model.catch(() => {
      if (models.get(url) === model) models.delete(url);
    });
  }
  return model.then((scene) => scene.clone(true));
}

/** Поверхня для оформлення: геометрія першого меша моделі (у .glb один меш без перетворення вузла; спільна з кешем loadModel). */
export function surfaceOf(model: Group, key: string): Surface {
  // Перетворення вузлів не враховуються: лише для моделей з одним мешем. Сімейний грааль — 8 мешів і без оформлення.
  if (key.includes('grail-family')) throw new Error(`${key} has no decor surface`);
  // Обхід у глибину, як traverse: перший меш.
  const mesh = model.getObjectByProperty('isMesh', true) as Mesh | undefined;
  if (mesh === undefined) throw new Error(`no mesh in ${key}`);
  return { key, geometry: mesh.geometry as BufferGeometry };
}

function hasMap(material: Material): boolean {
  return (material as MeshStandardMaterial).map != null;
}

/** Меші без текстури — у спільний матеріал трофея (trophyMaterial, userData.shared); з текстурою (фото, написи) лишаються як є. */
export function paintModel(group: Group, material: TrophyMaterial): void {
  const painted = trophyMaterial(material);
  const paint = (current: Material): Material => (hasMap(current) ? current : painted);
  group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const mesh = object as Mesh;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(paint) : paint(mesh.material);
  });
}

/**
 * Куля для кадру (як у model-viewer): центр — центр рамки, радіус — до найдальшої вершини. Куля навколо рамки
 * (getBoundingSphere) для кубка з ручками на чверть більша, і трофей виходив дрібнішим, ніж був.
 */
export function framingSphere(object: Object3D): Sphere {
  const box = new Box3().setFromObject(object);
  if (box.isEmpty()) return new Sphere(new Vector3(), 0);
  const center = box.getCenter(new Vector3());
  const vertex = new Vector3();
  let farthest = 0;
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const position = child.geometry.getAttribute('position');
    if (position === undefined) return;
    for (let i = 0; i < position.count; i += 1) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld);
      farthest = Math.max(farthest, vertex.distanceToSquared(center));
    }
  });
  return new Sphere(center, Math.sqrt(farthest));
}

