import type { TrophyMaterial } from '@quiz/shared';
import { Mesh, MeshStandardMaterial, type Group, type Material } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MATERIAL_LOOK } from '../trophy-meta';

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

function hasMap(material: Material): boolean {
  return (material as MeshStandardMaterial).map != null;
}

/** Меші без текстури — у колір матеріалу (MATERIAL_LOOK); з текстурою (фото, написи) лишаються як є. */
export function paintModel(group: Group, material: TrophyMaterial): void {
  const look = MATERIAL_LOOK[material];
  let painted: MeshStandardMaterial | null = null;
  const paint = (current: Material): Material => {
    if (hasMap(current)) return current;
    painted ??= new MeshStandardMaterial({ color: look.color, metalness: look.metallic, roughness: look.roughness });
    return painted;
  };
  group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const mesh = object as Mesh;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(paint) : paint(mesh.material);
  });
}
