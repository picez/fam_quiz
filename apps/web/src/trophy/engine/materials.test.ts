import { Material, MeshPhysicalMaterial, MeshStandardMaterial, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { MATERIAL_LOOK } from '../trophy-meta';
import { trophyMaterial } from './materials';

/** Шейдер-заглушка: лише рядки, які доповнює візерунок. */
function compile(material: MeshStandardMaterial): WebGLProgramParametersWithUniforms {
  const shader = {
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <color_fragment>',
    uniforms: {},
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

describe('trophy materials', () => {
  it('old materials are plain standard materials as before', () => {
    for (const id of ['bronze', 'silver', 'gold', 'diamond'] as const) {
      const material = trophyMaterial(id);
      const look = MATERIAL_LOOK[id];
      expect(material.constructor).toBe(MeshStandardMaterial);
      expect(`#${material.color.getHexString().toUpperCase()}`).toBe(look.color);
      expect(material.metalness).toBe(look.metallic);
      expect(material.roughness).toBe(look.roughness);
      expect(material.emissive.getHex()).toBe(0);
      expect(material.emissiveIntensity).toBe(1);
      expect(material.toneMapped).toBe(true);
      expect(material.onBeforeCompile).toBe(Material.prototype.onBeforeCompile);
      expect(material.customProgramCacheKey).toBe(Material.prototype.customProgramCacheKey);
    }
  });

  it('pearl is iridescent', () => {
    const pearl = trophyMaterial('pearl');
    expect(pearl).toBeInstanceOf(MeshPhysicalMaterial);
    expect((pearl as MeshPhysicalMaterial).iridescence).toBe(1);
  });

  it('pearl tints its colour towards the edges so the nacre shows on a pale cup', () => {
    const shader = {
      vertexShader: '#include <begin_vertex>',
      fragmentShader: '#include <normal_fragment_maps>',
      uniforms: {},
    } as unknown as WebGLProgramParametersWithUniforms;
    trophyMaterial('pearl').onBeforeCompile(shader, {} as WebGLRenderer);
    expect(shader.vertexShader).toContain('vTrophyPos = position;');
    expect(shader.fragmentShader).toContain('#include <normal_fragment_maps>\n');
    expect(shader.fragmentShader).toContain('dot(normal, normalize(vViewPosition))');
    expect(trophyMaterial('pearl').customProgramCacheKey()).toBe('trophy-nacre');
  });

  it('neon glows', () => {
    const neon = trophyMaterial('neon');
    expect(neon.constructor).toBe(MeshStandardMaterial);
    expect(neon.emissive.getHexString()).toBe('ff2e63');
    expect(neon.emissiveIntensity).toBe(1.4);
    // Без тон-мапінгу: інакше світіння вибілюється до блідо-рожевого.
    expect(neon.toneMapped).toBe(false);
  });

  it('the new materials take colour, metalness and roughness from MATERIAL_LOOK', () => {
    for (const id of ['rosegold', 'platinum', 'copper', 'obsidian', 'jade', 'pearl', 'ruby', 'sapphire', 'neon', 'marble', 'wood'] as const) {
      const material = trophyMaterial(id);
      const look = MATERIAL_LOOK[id];
      expect(`#${material.color.getHexString().toUpperCase()}`).toBe(look.color);
      expect(material.metalness).toBe(look.metallic);
      expect(material.roughness).toBe(look.roughness);
    }
  });

  it('marble and wood paint a pattern', () => {
    const marble = compile(trophyMaterial('marble'));
    const wood = compile(trophyMaterial('wood'));
    for (const shader of [marble, wood]) {
      expect(shader.vertexShader).toContain('varying vec3 vTrophyPos;');
      expect(shader.vertexShader).toContain('vTrophyPos = position;');
      expect(shader.fragmentShader).toContain('varying vec3 vTrophyPos;');
      expect(shader.uniforms.trophyPattern).toBeDefined();
    }
    expect(marble.fragmentShader).toContain('sin(p.z * 9.0');
    expect(wood.fragmentShader).toContain('fract(length(p.xz) * 36.0');
    expect(marble.fragmentShader).not.toContain('fract(length(p.xz)');
    expect(`#${(marble.uniforms.trophyPattern!.value as MeshStandardMaterial['color']).getHexString().toUpperCase()}`).toBe('#8C8A86');
    expect(trophyMaterial('marble').customProgramCacheKey()).toBe('trophy-marble');
    expect(trophyMaterial('wood').customProgramCacheKey()).toBe('trophy-wood');
    // Без візерунка шейдер не доповнюється.
    expect(compile(trophyMaterial('neon')).fragmentShader).toBe('#include <color_fragment>');
  });

  it('one material per kind is shared', () => {
    for (const id of ['gold', 'neon', 'pearl', 'marble'] as const) {
      expect(trophyMaterial(id)).toBe(trophyMaterial(id));
      expect(trophyMaterial(id).userData.shared).toBe(true);
    }
    expect(trophyMaterial('gold')).not.toBe(trophyMaterial('silver'));
  });
});
