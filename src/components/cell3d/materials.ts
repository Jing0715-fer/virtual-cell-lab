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

/* ============ 参照图配色系统（v12 —— 用户参考插画像素测量提取） ============
 * 参照图特征: 纯黑背景 + 低饱和有机色族 + 左侧暖白主光 + 选择性冷蓝高光。
 * 实测色族（1228×841 像素分析）:
 *   线粒体区 (100,74,69) 暖古铜 · ER/膜系 (93,99,104) 石板蓝灰 · 核 (105,100,111) 熏衣草灰
 *   高光 (145,175,207) 浅蓝 · 暖 accents (110,76,54) 琥珀棕
 * 全部 organelle 颜色从旧"高饱和生物荧光"迁移到该低饱和家族 —— 科研插画的沉稳质感。 */
export const REF = {
  /* 线粒体（暖古铜族） */
  mitoOuter: '#5d4640',
  mitoCristae: '#93705f',
  mitoMatrix: '#392b27',
  mitoAtp: '#c9a227',
  mtdna: '#a8889a',
  /* 内质网（v17 参照图严格还原: 薰衣草紫族 —— 像素实测核周 ER 亮带 199,189,218 / 136,135,167 / 140,142,178,
   * 与核同色系（内膜系统同源性科学叙事: 外核膜连续于 rER）; 核糖体亮金「黄沙」实测 207,189,164 族） */
  erSheet: '#948fae',
  erSheetHi: '#a29dbd',
  erLumen: '#9c96b8',
  ribosome: '#c9a54e',
  /* 高尔基（v17 参照图严格还原: 淡藕荷紫族 —— VLM 实测 #D8BFD8/#E6CEE7 淡粉紫半透明;
   * cis 饱和藕荷 → trans 亮粉紫梯度, 与 ER 蓝紫形成「同系不同调」的内膜家族层次） */
  golgiCis: '#9a90b4',
  golgiTrans: '#cfc6dd',
  golgiVesicle: '#ada4c4',
  /* 溶酶体（暗红棕 —— 酸性水解酶仓） */
  lyso: '#7a4a41',
  lysoHi: '#a06255',
  lysoGranule: '#a06a3a',
  /* 过氧化物酶体（冷灰蓝 + 结晶核心琥珀） */
  peroxi: '#5a6874',
  peroxiCore: '#c9a227',
  /* 脂滴（琥珀金） */
  lipid: '#9a7434',
  lipidHi: '#b8904a',
  /* 核（熏衣草灰紫族） */
  nucEnv: '#6b6575',
  nucInner: '#575065',
  chromatin: '#6a5a78',
  hetero: '#4a3d58',
  nucleolus: '#584a6e',
  nucleolusHi: '#6e5a8a',
  npc: '#9aa0ae',
  /* 囊泡/骨架（石板族 + 浅蓝高光族） */
  vesicle: '#6a7684',
  vesicleHi: '#8494a8',
  microtubule: '#8494a8',
  interFil: '#7a8598',
  actin: '#94a0b2',
  sheen: '#a8c4d8',
  /* 自噬流（低饱和绿族 —— LC3 生物学标记色保留可辨性） */
  autophago: '#4a6a62',
  lc3: '#6a8a5a',
  autophagoFlash: '#a07a3a',
} as const;

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
    mat.transmission = o.transmission ?? 0;
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

/* ============ 半透明原生质体积（v11 —— 图片级精细度核心） ============ */

export interface VolumeOpts {
  /** 核心深色（盘心读感 —— 光程最长的"厚"区） */
  coreColor: string;
  /** 边缘亮色（剪影边 —— 薄区透光） */
  rimColor: string;
  /** 流光色（胞质环流微光） */
  flowColor: string;
  baseAlpha: number;
  /** 盘心密度增益（厚体积读感） */
  coreBoost: number;
  /** 剪影边透光增益 */
  rimBoost: number;
  flowStrength: number;
  /** 噪声尺度（对象空间频率） */
  scale: number;
  speed: number;
  uTime: TimeUniform;
  dim?: number;
}

const VOLUME_VERT = /* glsl */ `
#include <clipping_planes_pars_vertex>
varying vec3 vVolNormal;
varying vec3 vVolView;
varying vec3 vVolObj;
void main() {
  vVolObj = position;
  #include <begin_vertex>
  #include <project_vertex>
  vVolNormal = normalize(normalMatrix * normal);
  vVolView = normalize(-mvPosition.xyz);
  #include <clipping_planes_vertex>
}`;

const VOLUME_FRAG = /* glsl */ `
#include <clipping_planes_pars_fragment>
varying vec3 vVolNormal;
varying vec3 vVolView;
varying vec3 vVolObj;
uniform float uTime;
uniform float uDim;
uniform vec3 uCore;
uniform vec3 uRim;
uniform vec3 uFlowCol;
uniform float uBaseAlpha;
uniform float uCoreBoost;
uniform float uRimBoost;
uniform float uFlowStrength;
uniform float uScale;
uniform float uSpeed;

float vHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
float vNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = vHash(i);
  float n100 = vHash(i + vec3(1.0, 0.0, 0.0));
  float n010 = vHash(i + vec3(0.0, 1.0, 0.0));
  float n110 = vHash(i + vec3(1.0, 1.0, 0.0));
  float n001 = vHash(i + vec3(0.0, 0.0, 1.0));
  float n101 = vHash(i + vec3(1.0, 0.0, 1.0));
  float n011 = vHash(i + vec3(0.0, 1.0, 1.0));
  float n111 = vHash(i + vec3(1.0, 1.0, 1.0));
  float x00 = mix(n000, n100, f.x);
  float x10 = mix(n010, n110, f.x);
  float x01 = mix(n001, n101, f.x);
  float x11 = mix(n011, n111, f.x);
  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
}
float vFbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vNoise(p);
    p = p * 2.03 + vec3(9.2, 4.1, 7.7);
    a *= 0.5;
  }
  return s / 0.875;
}

void main() {
  #include <clipping_planes_fragment>
  // 视线-法向夹角因子: BackSide 渲染下盘心处 |dot|→1（光程厚）, 剪影边→0（薄）
  float ndv = abs(dot(normalize(vVolNormal), normalize(vVolView)));
  float center = pow(ndv, 1.35);
  float rim = pow(1.0 - ndv, 2.6);
  // 胞质环流: 双频 FBM 上升流 + 时间流动（亚感知的活体呼吸感）
  vec3 fp = vVolObj * uScale + vec3(0.0, uTime * uSpeed, uTime * uSpeed * 0.6);
  float n = vFbm(fp);
  float n2 = vFbm(fp * 2.4 + 27.0);
  float flow = smoothstep(0.3, 0.82, n * 0.7 + n2 * 0.3);

  vec3 col = mix(uRim, uCore, center);
  col += uFlowCol * flow * uFlowStrength;

  float alpha = (uBaseAlpha + center * uCoreBoost + rim * uRimBoost + flow * 0.045) * uDim;
  alpha = min(alpha, 0.96);
  gl_FragColor = vec4(col, alpha);
}`;

/** 半透明原生质体体积材质（BackSide 背景层）—— 替代平面色填充:
 *  盘心厚/边缘薄的物理光程读感 + FBM 环流微光, 参照高保真科学插画的"果冻状半透明细胞质"。
 *  用于胞质（青系）与核质（玫瑰系）两处体积层。 */
export function volumeMaterial(o: VolumeOpts): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VOLUME_VERT,
    fragmentShader: VOLUME_FRAG,
    uniforms: {
      uTime: o.uTime,
      uDim: { value: o.dim ?? 1 },
      uCore: { value: new THREE.Color(o.coreColor) },
      uRim: { value: new THREE.Color(o.rimColor) },
      uFlowCol: { value: new THREE.Color(o.flowColor) },
      uBaseAlpha: { value: o.baseAlpha },
      uCoreBoost: { value: o.coreBoost },
      uRimBoost: { value: o.rimBoost },
      uFlowStrength: { value: o.flowStrength },
      uScale: { value: o.scale },
      uSpeed: { value: o.speed },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
    // 全局裁剪平面（剖面模式）支持: 让 renderer 注入 NUM_CLIPPING_PLANES 定义与 clippingPlanes uniform
    clipping: true,
  });
  return mat;
}
