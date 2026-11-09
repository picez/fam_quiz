import type { TrophyMaterial } from '@quiz/shared';
import { Color, MeshPhysicalMaterial, MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import { MATERIAL_LOOK, type MaterialLook } from '../trophy-meta';

type PatternKind = NonNullable<MaterialLook['pattern']>['kind'];

/**
 * Візерунок у координатах об'єкта (UV у моделей немає): p — позиція вершини моделі, pattern — колір прожилок / кілець.
 * diffuseColor уже в лінійному просторі, колір uniform (Color) — теж.
 */
const PATTERN: Record<PatternKind, string> = {
  marble: `float t = abs(sin((p.x + p.y * 0.6 + 0.35 * sin(p.z * 9.0 + p.y * 7.0)) * 14.0));
    diffuseColor.rgb = mix(trophyPattern, diffuseColor.rgb, smoothstep(0.0, 0.35, t));`,
  wood: `float t = fract(length(p.xz) * 36.0 + sin(p.y * 5.0) * 1.2);
    diffuseColor.rgb = mix(diffuseColor.rgb, trophyPattern, smoothstep(0.75, 1.0, t) * 0.8);`,
};

function withPattern(material: MeshStandardMaterial, pattern: NonNullable<MaterialLook['pattern']>): void {
  const color = new Color(pattern.color);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.trophyPattern = { value: color };
    shader.vertexShader = `varying vec3 vTrophyPos;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vTrophyPos = position;',
    );
    shader.fragmentShader = `varying vec3 vTrophyPos;\nuniform vec3 trophyPattern;\n${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `#include <color_fragment>\n  {\n    vec3 p = vTrophyPos;\n    ${PATTERN[pattern.kind]}\n  }`,
    );
  };
  // Один шейдер на вид візерунка: ключ стабільний, тож three не збирає програму заново для кожного трофея.
  material.customProgramCacheKey = () => `trophy-${pattern.kind}`;
}

/**
 * Перелив перламутру: плівка iridescence фарбує лише відблиск (у діелектрика F0 ≈ 0.04), і на майже білому кубку
 * її не видно (e2e 25e — рівно кремовий). Тож і сам колір ледь відтінюється рожевим, блакитним і зеленим: сильніше
 * до країв (кут до погляду) і хвилями вздовж тіла (координати об'єкта), лице лишається кремовим.
 */
const NACRE = `{
    float trophyFacing = 1.0 - abs(dot(normal, normalize(vViewPosition)));
    float trophyPhase = trophyFacing * 1.3 + sin(vTrophyPos.y * 11.0 + vTrophyPos.x * 5.0) * 0.15;
    vec3 trophyHue = mix(vec3(1.0), 0.5 + 0.5 * cos(6.28318 * (trophyPhase + vec3(0.0, 0.33, 0.67))), 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * trophyHue, 0.25 + 0.5 * smoothstep(0.1, 0.8, trophyFacing));
  }`;

function withNacre(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = `varying vec3 vTrophyPos;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vTrophyPos = position;',
    );
    // Після normal_fragment_maps: normal уже в просторі камери, а світло ще не пораховане.
    shader.fragmentShader = `varying vec3 vTrophyPos;\n${shader.fragmentShader}`.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>\n  ${NACRE}`,
    );
  };
  material.customProgramCacheKey = () => 'trophy-nacre';
}

function make(look: MaterialLook): MeshStandardMaterial {
  const params = { color: look.color, metalness: look.metallic, roughness: look.roughness };
  // Фізичний (дорожчий) — лише для перламутру; решта, зокрема старі чотири, — звичайний стандартний, як був.
  const material =
    look.iridescence === undefined ? new MeshStandardMaterial(params) : new MeshPhysicalMaterial({ ...params, iridescence: look.iridescence });
  if (look.emissive !== undefined) {
    material.emissive.set(look.emissive);
    material.emissiveIntensity = look.emissiveIntensity ?? 1;
    // Світіння понад 1 тон-мапінг (Neutral) вибілює до лососевого; без нього — насичений неон, як вивіска.
    material.toneMapped = false;
  }
  if (look.pattern !== undefined) withPattern(material, look.pattern);
  else if (look.iridescence !== undefined) withNacre(material);
  material.userData.shared = true;
  return material;
}

const cache = new Map<TrophyMaterial, MeshStandardMaterial>();

/**
 * Матеріал моделі трофея за MATERIAL_LOOK: один на TrophyMaterial для всієї сторінки (userData.shared — рушій
 * його не звільняє), тож три трофеї з неоном — одна програма й один матеріал, а не новий на кожен.
 */
export function trophyMaterial(material: TrophyMaterial): MeshStandardMaterial {
  let made = cache.get(material);
  if (made === undefined) {
    made = make(MATERIAL_LOOK[material]);
    cache.set(material, made);
  }
  return made;
}
