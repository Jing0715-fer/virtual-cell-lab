/**
 * 有机材质工厂 —— MeshPhysicalMaterial + GLSL 注入（onBeforeCompile）
 * 真实感来源:
 *   - transmission 折射（湿润透光的生物膜质感）
 *   - iridescence 虹彩（脂质/膜蛋白的油性光泽）
 *   - Fresnel 边缘光 + 3D FBM 流光着色器注入（活体膜流动感, 细胞呼吸般的微光起伏）
 *   - 程序化法线/粗糙度贴图（微观起伏）
 */
import * as THREE from 'three';

/* ============ 共享时间 uniform（帧驱动） ============ */

export interface TimeUniform {
  value: number;
}

export function createTimeUniform(): TimeUniform {
  return { value: 0 };
}

/* ============ GLSL 有机流光注入 ============ */

export interface FlowOpts {
  /** 流光颜色 */
  color: string;
  /** 总强度 */
  strength: number;
  /** 噪声尺度（对象空间频率） */
  scale: number;
  /** 流速 */
  speed: number;
  /** Fresnel 边缘增强系数 */
  rim?: number;
}

/** 注入 value-noise FBM + 沿时间流动的 emissive + Fresnel 边缘微光 */
export function patchOrganicFlow(
  mat: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial,
  uTime: TimeUniform,
  opts: FlowOpts,
): void {
  const uFlowColor = { value: new THREE.Color(opts.color) };
  const uFlowStrength = { value: opts.strength };
  const uFlowScale = { value: opts.scale };
  const uFlowSpeed = { value: opts.speed };
  const uFlowRim = { value: opts.rim ?? 0.35 };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uFlowColor = uFlowColor;
    shader.uniforms.uFlowStrength = uFlowStrength;
    shader.uniforms.uFlowScale = uFlowScale;
    shader.uniforms.uFlowSpeed = uFlowSpeed;
    shader.uniforms.uFlowRim = uFlowRim;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vObjPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vObjPos = (instanceMatrix * vec4(position, 1.0)).xyz;
#else
  vObjPos = position;
#endif`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vObjPos;
uniform float uTime;
uniform vec3 uFlowColor;
uniform float uFlowStrength;
uniform float uFlowScale;
uniform float uFlowSpeed;
uniform float uFlowRim;

float oHash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}
float oNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = oHash(i);
  float n100 = oHash(i + vec3(1.0, 0.0, 0.0));
  float n010 = oHash(i + vec3(0.0, 1.0, 0.0));
  float n110 = oHash(i + vec3(1.0, 1.0, 0.0));
  float n001 = oHash(i + vec3(0.0, 0.0, 1.0));
  float n101 = oHash(i + vec3(1.0, 0.0, 1.0));
  float n011 = oHash(i + vec3(0.0, 1.0, 1.0));
  float n111 = oHash(i + vec3(1.0, 1.0, 1.0));
  float x00 = mix(n000, n100, f.x);
  float x10 = mix(n010, n110, f.x);
  float x01 = mix(n001, n101, f.x);
  float x11 = mix(n011, n111, f.x);
  float y0 = mix(x00, x10, f.y);
  float y1 = mix(x01, x11, f.y);
  return mix(y0, y1, f.z);
}
float oFbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * oNoise(p);
    p = p * 2.03 + vec3(11.7, 5.3, 7.1);
    a *= 0.5;
  }
  return s / 0.875;
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  vec3 fp = vObjPos * uFlowScale + vec3(0.0, uTime * uFlowSpeed, uTime * uFlowSpeed * 0.55);
  float n = oFbm(fp);
  float n2 = oFbm(fp * 2.7 + 40.0);
  float flow = smoothstep(0.28, 0.85, n * 0.72 + n2 * 0.28);
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewPosition);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);
  totalEmissiveRadiance += uFlowColor * uFlowStrength * (flow * 0.75 + fres * uFlowRim);
}`,
      );
  };
  mat.customProgramCacheKey = () => 'organicflow-v1';
}

/* ============ 材质工厂 ============ */

export interface OrganelleMatOpts {
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  /** 透明度（<1 时启用 transparent） */
  opacity?: number;
  /** 专注模式亮度系数 */
  dim?: number;
  uTime?: TimeUniform;
  flow?: FlowOpts;
  /** 折射（湿润玻璃感; 高端模式专用, 低端降级为普通透明） */
  transmission?: number;
  thickness?: number;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  iridescence?: number;
  sheen?: number;
  sheenColor?: string;
  normalMap?: THREE.Texture;
  normalScale?: number;
  roughnessMap?: THREE.Texture;
  side?: THREE.Side;
  /** 顶点色（合并几何渐变, 如高尔基池） */
  vertexColors?: boolean;
  flatShading?: boolean;
}

export function organelleMaterial(o: OrganelleMatOpts): THREE.MeshPhysicalMaterial {
  const dim = o.dim ?? 1;
  const useTransmission = (o.transmission ?? 0) > 0 && dim > 0.9;
  const opacity = (o.opacity ?? 1) * (useTransmission ? 1 : Math.max(0.02, dim));
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(o.color),
    emissive: new THREE.Color(o.emissive ?? '#000000'),
    emissiveIntensity: (o.emissiveIntensity ?? 0) * dim,
    roughness: o.roughness ?? 0.45,
    metalness: o.metalness ?? 0,
    clearcoat: o.clearcoat ?? 0,
    clearcoatRoughness: o.clearcoatRoughness ?? 0.25,
    iridescence: (o.iridescence ?? 0) * dim,
    iridescenceIOR: 1.32,
    sheen: (o.sheen ?? 0) * dim,
    sheenColor: new THREE.Color(o.sheenColor ?? '#ffffff'),
    normalMap: o.normalMap ?? null,
    roughnessMap: o.roughnessMap ?? null,
    side: o.side ?? THREE.FrontSide,
    vertexColors: o.vertexColors ?? false,
    flatShading: o.flatShading ?? false,
    transparent: opacity < 1 || !!o.opacity && o.opacity < 1,
    opacity,
    depthWrite: opacity >= 0.999,
  });
  if (o.normalMap) mat.normalScale.set(o.normalScale ?? 0.5, o.normalScale ?? 0.5);
  if (useTransmission) {
    mat.transmission = o.transmission;
    mat.thickness = o.thickness ?? 0.8;
    mat.ior = 1.38;
  }
  mat.envMapIntensity = Math.min(1.2, 0.55 * dim + 0.45);
  if (o.flow && o.uTime) patchOrganicFlow(mat, o.uTime, o.flow);
  return mat;
}

/** 纯发光壳（Additive, 不受雾影响） */
export function glowMaterial(color: string, opacity: number, side: THREE.Side = THREE.BackSide): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    side,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  return mat;
}
