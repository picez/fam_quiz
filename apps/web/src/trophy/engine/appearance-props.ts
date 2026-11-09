import { AdditiveBlending, CircleGeometry, Color, Mesh, MeshBasicMaterial, Sprite, SpriteMaterial } from 'three';
import type { AppearancePose } from '../appearance-pose';
import type { EffectFrame } from '../effect-plan';
import { FLASH_MAX_SCALE, flashTexture } from './effect-meshes';

export interface AppearanceProps {
  flash: Sprite;
  pedestal: Mesh;
  /** Ставить прозорість і масштаб спалаху та постаменту за позою. */
  apply(pose: AppearancePose, radius: number): void;
  dispose(): void;
}

/** Спалах (спрайт у центрі кадру) і світлий диск-постамент; footprint = max(size.x, size.z). */
export function buildAppearanceProps(frame: EffectFrame, footprint: number): AppearanceProps {
  const flashMaterial = new SpriteMaterial({
    map: flashTexture(),
    color: new Color('#ffffff'),
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const flash = new Sprite(flashMaterial);
  flash.name = 'appear-flash';
  flash.renderOrder = 10;
  flash.position.set(...frame.center);
  flash.visible = false;

  const geometry = new CircleGeometry(0.6 * footprint, 48);
  const pedestalMaterial = new MeshBasicMaterial({
    color: new Color('#f6e3a6'),
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const pedestal = new Mesh(geometry, pedestalMaterial);
  pedestal.name = 'appear-pedestal';
  pedestal.rotation.x = -Math.PI / 2;
  pedestal.position.set(frame.center[0], 0.002, frame.center[2]);
  pedestal.visible = false;

  return {
    flash,
    pedestal,
    apply(pose, radius) {
      flashMaterial.opacity = pose.flash;
      flash.visible = pose.flash > 0;
      flash.scale.setScalar(Math.min(3 * (0.5 + pose.flash), FLASH_MAX_SCALE) * radius);
      pedestalMaterial.opacity = pose.pedestal;
      pedestal.visible = pose.pedestal > 0;
    },
    dispose() {
      flashMaterial.dispose();
      geometry.dispose();
      pedestalMaterial.dispose();
    },
  };
}
