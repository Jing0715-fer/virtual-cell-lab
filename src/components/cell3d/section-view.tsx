'use client';

/**
 * 剖面展示模块（v3 —— 剖面轮廓与细胞形态精确贴合；v53 材质局部裁剪改造）
 * ============ 科学定位 ============
 * 基于 Three.js 裁剪平面剖切细胞前半部（v53: 全局 gl.clippingPlanes → 材质局部
 * material.clippingPlanes —— userData.noSectionClip 的分子/药物材质豁免, 节点在切面处恒完整渲染）
 *   1. 剖切深度 0-1 线性扫掠: 切平面从质膜前缘 (constant=+R·extent) 推进到后缘，
 *      途中经过形状轴心 (depth=0.5) —— 与显微切片"逐层切片"语义一致
 *   2. 【v3 核心】剖面填充轮廓 = 切平面与细胞表面的【精确相交轮廓】:
 *      - 旧版用椭圆缩放圆盘近似（SHAPE_EXTENT 轴向倍率）—— 梭形尖端/锥体斜边/
 *        多边形棱面/柱状平底处填充盘溢出或缩进真实切缘, 与细胞轮廓不匹配
 *      - 新版逐方向射线求交: 切面内 168 个方位角, 每方向自轮廓极点外推,
 *        与"类型形状函数 × FBM 有机噪声"（与质膜几何 cellSurf 完全同源）求交,
 *        得到真实相交多边形 —— 填充盘/发光缘带/核盘三件套全部贴合该轮廓
 *      - 核盘同理: 与"核椭球 × 分叶 × FBM"（与 shapedNucleusGeometry 同源）精确求交,
 *        核中心偏移（上皮基底核等）随动
 *   3. 剖面填充纹理（程序化 Canvas 纹理, 电镜切片风格; UV 径向归一 →
 *      纹理膜线/核被膜线严格落在真实轮廓上）:
 *      - v22 去细胞器化: 细胞质纹理仅保留「切面表面」语义（质膜双层线/糖被/颗粒基质底噪）;
 *        旧版烘焙的 2D 线粒体/高尔基/ER/囊泡贴图退役 —— 细胞器由真 3D 实体经全局裁剪面
 *        剖开后呈现于剖面窗口（renderOrder > 96, 随剖切深度实时变化 + 可悬停）
 *      - 核纹理: 核被膜双线+核孔/常染色质纤维/异染色质边集/核仁
 *   4. 剖切方位三预设: 正剖 Coronal / 俯剖 Horizontal / 侧剖 Sagittal（解剖学标准切面）
 *   5. 被剖掉的前半分子 DOM 标签同步隐藏（SimSnapshot.clipPlane 快照广播）
 *   6. 剖面结构标注锚定真实轮廓: 膜标注钉在轮廓缘带外侧, 胞质标注落在轮廓内,
 *      核标注跟随核轮廓上缘 —— 标注与轮廓零漂移
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { CellBodySpec } from '@/lib/simulation/layout3d';
import {
  SHAPE_EXTENT,
  SHAPE_NOISE,
  nucleusInstances,
  nucleusRadius,
  shapeRadius,
} from '@/lib/simulation/cell-shape';
import { fbm3 } from './procedural';

/** 剖切轴向 → 形状延伸轴索引（法向主轴; front≈z / top≈y / side≈x）—— 扫描范围/贴附平面共用 */
export const AXIS_N: Record<SectionAxis, number> = { front: 2, top: 1, side: 0 };

/* ============ 剖面方位预设（解剖学标准切面） ============ */

export type SectionAxis = 'front' | 'top' | 'side';

export const SECTION_ORIENTS: Record<
  SectionAxis,
  { normal: THREE.Vector3; label: { zh: string; en: string }; latin: string; hint: { zh: string; en: string } }
> = {
  front: {
    normal: new THREE.Vector3(0, -0.22, -1).normalize(),
    label: { zh: '正剖', en: 'Front' },
    latin: 'Coronal',
    hint: {
      zh: '冠状面 · 剖开前半部，正对观察者',
      en: 'Coronal plane — anterior half removed, facing viewer',
    },
  },
  top: {
    normal: new THREE.Vector3(0.04, -1, -0.14).normalize(),
    label: { zh: '俯剖', en: 'Top' },
    latin: 'Horizontal',
    hint: {
      zh: '水平面 · 自上而下剖开上半部',
      en: 'Horizontal plane — superior half removed',
    },
  },
  side: {
    normal: new THREE.Vector3(-1, -0.14, -0.32).normalize(),
    label: { zh: '侧剖', en: 'Side' },
    latin: 'Sagittal',
    hint: {
      zh: '矢状面 · 自左侧剖开，纵切细胞长轴',
      en: 'Sagittal plane — lateral section along major axis',
    },
  },
};

/* ============ 伪随机（稳定种子 → 剖面纹理可复现） ============ */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============ 程序化剖面纹理（双层） ============ */

/** 细胞质剖面纹理（基准半径 = R; UV 径向归一 → 外缘膜线严格落在真实轮廓上） */
function makeCytoplasmTexture(R: number, seed = 42): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const SIZE = 640;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const rnd = mulberry32(seed);
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const rMem = SIZE / 2 - 4;

  /* --- 细胞质基质（径向渐变, 外深内浅） --- v12 参照图: 暖石板族 */
  const cyto = ctx.createRadialGradient(cx, cy, rMem * 0.3, cx, cy, rMem);
  cyto.addColorStop(0, 'rgba(58, 54, 50, 0.80)');
  cyto.addColorStop(0.55, 'rgba(46, 42, 40, 0.74)');
  cyto.addColorStop(1, 'rgba(34, 31, 29, 0.90)');
  ctx.fillStyle = cyto;
  ctx.beginPath();
  ctx.arc(cx, cy, rMem, 0, Math.PI * 2);
  ctx.fill();

  /* --- 细胞质颗粒基质（核糖体/糖原弥散点, 全域散布; 核盘将叠于其上） --- */
  for (let i = 0; i < 460; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = rMem * (0.18 + rnd() * 0.8);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.96;
    ctx.fillStyle = rnd() > 0.7 ? 'rgba(145, 175, 207, 0.10)' : 'rgba(94, 110, 130, 0.055)';
    const s = 0.8 + rnd() * 1.6;
    ctx.fillRect(x, y, s, s);
  }

  /* v22 剖面贴图「去细胞器化」（用户反馈: 「剖面上存在一些 2D 贴图, 不随切片深度变化,
   * 悬停也无细胞器信息, 需要改成实际 3D 细胞器」）:
   *   旧版在切面盘上烘焙了 8 颗线粒体 / 1 组高尔基弧 / 4 条 ER 波浪线 / 20 个囊泡的 2D 画作 ——
   *   ① 静态贴图, 不随剖切深度变化; ② 无悬停信息; ③ 与剖面窗口化渲染的真实 3D 细胞器
   *   语义冲突（「双细胞器」读感）。现全部退役: 切面盘仅保留「切面本身的表面」语义 ——
   *   基质颗粒（核糖体/糖原弥散底噪）+ 质膜双层线 + 糖被; 细胞器一律由真 3D 实体经全局
   *   裁剪面剖开后呈现于剖面窗口（renderOrder > 96 盘后渲染, 同高尔基/ER 既有窗口化手法）。 */

  /* --- 质膜剖面（双层磷脂线 + 膜间腔 + 糖被短须） --- v12 参照图: 外缘亮蓝线（实测高光色 145,175,207） */
  ctx.beginPath();
  ctx.arc(cx, cy, rMem, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(145, 175, 207, 0.9)';
  ctx.lineWidth = 3.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rMem - 7, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(80, 100, 120, 0.66)';
  ctx.lineWidth = 1.7;
  ctx.stroke();
  const glyco = Math.floor((rMem * 2 * Math.PI) / 14);
  for (let p = 0; p < glyco; p++) {
    const a = (p / glyco) * Math.PI * 2 + rnd() * 0.05;
    const x1 = cx + Math.cos(a) * (rMem + 1.5);
    const y1 = cy + Math.sin(a) * (rMem + 1.5);
    const x2 = cx + Math.cos(a) * (rMem + 4 + rnd() * 3);
    const y2 = cy + Math.sin(a) * (rMem + 4 + rnd() * 3);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = 'rgba(145, 175, 207, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 核剖面纹理（基准半径 = N; UV 径向归一 → 核被膜双线严格落在真实核轮廓上） */
function makeNucleusTexture(N: number, seed = 7): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const SIZE = 320;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const rnd = mulberry32(seed);
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const rNuc = SIZE / 2 - 4;

  /* --- 常染色质基底（中心浅 → 边缘异染色质深） --- v12 参照图: 熏衣草灰紫族 */
  const nuc = ctx.createRadialGradient(cx, cy, rNuc * 0.08, cx, cy, rNuc);
  nuc.addColorStop(0, 'rgba(106, 90, 120, 0.72)');
  nuc.addColorStop(0.62, 'rgba(90, 74, 104, 0.80)');
  nuc.addColorStop(0.86, 'rgba(74, 61, 88, 0.9)');
  nuc.addColorStop(1, 'rgba(64, 52, 78, 0.96)');
  ctx.fillStyle = nuc;
  ctx.beginPath();
  ctx.arc(cx, cy, rNuc, 0, Math.PI * 2);
  ctx.fill();

  /* --- 异染色质边集环带（核周缘致密, 符合间期核型） --- */
  ctx.beginPath();
  ctx.arc(cx, cy, rNuc - 4.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(64, 52, 78, 0.5)';
  ctx.lineWidth = 8;
  ctx.stroke();

  /* --- 常染色质纤维（细弧线网） --- */
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rNuc - 9, 0, Math.PI * 2);
  ctx.clip();
  for (let f = 0; f < 10; f++) {
    const a0 = rnd() * Math.PI * 2;
    const rr = rNuc * (0.2 + rnd() * 0.55);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a0) * rr * 0.4, cy + Math.sin(a0) * rr * 0.4, rr, a0, a0 + Math.PI * (0.7 + rnd() * 0.9));
    ctx.strokeStyle = 'rgba(138, 122, 155, 0.17)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.restore();

  /* --- 核仁（1-2 个 · 纤维中心 + 颗粒组分） --- */
  const nucleoli = 1 + (rnd() > 0.55 ? 1 : 0);
  for (let k = 0; k < nucleoli; k++) {
    const a = rnd() * Math.PI * 2;
    const rr = rNuc * (0.3 + rnd() * 0.24);
    const nx = cx + Math.cos(a) * rr;
    const ny = cy + Math.sin(a) * rr;
    const nr = rNuc * (0.16 + rnd() * 0.07);
    const gr = ctx.createRadialGradient(nx, ny, 1, nx, ny, nr);
    gr.addColorStop(0, 'rgba(122, 98, 140, 0.88)');
    gr.addColorStop(0.55, 'rgba(94, 74, 110, 0.9)');
    gr.addColorStop(1, 'rgba(66, 50, 80, 0.94)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(nx, ny, nr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(110, 90, 138, 0.4)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  /* --- 核被膜双线（外膜 + 内膜 + 核周间隙） + 核孔复合体剖面 --- */
  ctx.beginPath();
  ctx.arc(cx, cy, rNuc, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(154, 160, 174, 0.78)';
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rNuc - 6.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(110, 101, 133, 0.55)';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  const npores = Math.floor((rNuc * 2 * Math.PI) / 22);
  for (let p = 0; p < npores; p++) {
    const a = (p / npores) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * (rNuc + 3);
    const y1 = cy + Math.sin(a) * (rNuc + 3);
    const x2 = cx + Math.cos(a) * (rNuc - 8.5);
    const y2 = cy + Math.sin(a) * (rNuc - 8.5);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.42)';
    ctx.lineWidth = 1.7;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ============ v3 精确相交轮廓（切平面 × 径向形状体） ============ */

/**
 * 逐方位角射线求交：切平面内自"实体中心在平面上的垂足"出发, 沿面内方向 d̂(θ) 外推,
 * 与径向表面 r(u)（含 FBM 噪声, 与质膜/核几何完全同源）求最远交点。
 * 几何事实（保证求交正确性）:
 *   - 垂足 f ⊥ 一切面内方向 → |p(ρ) − center| = √(δ² + ρ²) 随 ρ 严格单调增
 *   - 表面为以 center 为星的径向体 → 每方向至多一个"最外"交点（扫描取最后一段 inside→outside）
 *   - 未命中方向 ρ = 0（盘收敛到垂足, 退化三角形不渲染）
 */
/** 导出仅供 scripts/verify-section-contour.ts 数值验证使用（运行时为内部工具） */
export function sampleSectionContour(
  n: THREE.Vector3,
  constant: number,
  center: THREE.Vector3,
  radial: (ux: number, uy: number, uz: number) => number,
  rhoMax: number,
  S: number,
  e1: THREE.Vector3,
  e2: THREE.Vector3,
  out: Float64Array,
): number {
  const delta = center.x * n.x + center.y * n.y + center.z * n.z + constant; // 中心→平面有向距离
  const SCAN = 30; // 粗扫分辨率（步距 ≈ rhoMax/30 —— 细于视觉可感知缺口感, 兼顾重算耗时）
  const BISECT = 22;
  let maxRho = 0;
  for (let i = 0; i < S; i++) {
    const a = (i / S) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // 面内方向 d̂ = e1·ca + e2·sa（分量展开）
    const dx = e1.x * ca + e2.x * sa;
    const dy = e1.y * ca + e2.y * sa;
    const dz = e1.z * ca + e2.z * sa;
    // inside(ρ): |p−center| ≤ r(u), u = (−δ·n + ρ·d̂)/|…|
    const inside = (rho: number): boolean => {
      const len = Math.sqrt(delta * delta + rho * rho);
      if (len < 1e-9) return true;
      const ux = (-delta * n.x + rho * dx) / len;
      const uy = (-delta * n.y + rho * dy) / len;
      const uz = (-delta * n.z + rho * dz) / len;
      return len <= radial(ux, uy, uz);
    };
    // 粗扫: 记录最后一段 inside→outside 穿越区间 [lo, hi]
    let lo = -1;
    let hi = -1;
    let prev = 0;
    let prevIn = inside(0);
    if (prevIn) {
      lo = 0;
      hi = rhoMax;
    }
    for (let k = 1; k <= SCAN; k++) {
      const rk = (rhoMax * k) / SCAN;
      const isIn = inside(rk);
      if (prevIn && !isIn) {
        lo = prev;
        hi = rk;
      }
      prev = rk;
      prevIn = isIn;
    }
    if (prevIn) {
      lo = prev;
      hi = rhoMax * 1.001;
    }
    let rho = 0;
    if (lo >= 0) {
      // 二分求交（区间内边界唯一）
      for (let b = 0; b < BISECT; b++) {
        const mid = (lo + hi) * 0.5;
        if (inside(mid)) lo = mid;
        else hi = mid;
      }
      rho = (lo + hi) * 0.5;
    }
    out[i] = rho;
    if (rho > maxRho) maxRho = rho;
  }
  return maxRho;
}

/** 扇形填充盘几何（中心 + S 边缘顶点; UV 径向归一: 边缘映到画布单位圆 → 纹理外缘线严格贴合轮廓） */
function makeFanGeometry(S: number, z: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((S + 1) * 3);
  const uv = new Float32Array((S + 1) * 2);
  const idx = new Uint16Array(S * 3);
  uv[0] = 0.5;
  uv[1] = 0.5;
  for (let i = 0; i < S; i++) {
    const a = (i / S) * Math.PI * 2;
    uv[(i + 1) * 2] = 0.5 + 0.5 * Math.cos(a);
    uv[(i + 1) * 2 + 1] = 0.5 + 0.5 * Math.sin(a);
    pos[(i + 1) * 3 + 2] = z;
  }
  pos[2] = z;
  for (let i = 0; i < S; i++) {
    idx[i * 3] = 0;
    idx[i * 3 + 1] = i + 1;
    idx[i * 3 + 2] = i + 2 > S ? 1 : i + 2;
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** 轮廓发光缘带几何（每方位角内外双顶点三角带; 未命中方向退化不渲染） */
function makeRibbonGeometry(S: number, z: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(S * 2 * 3);
  const uv = new Float32Array(S * 2 * 2);
  const idx = new Uint16Array(S * 6);
  for (let i = 0; i < S * 2; i++) pos[i * 3 + 2] = z;
  for (let i = 0; i < S; i++) {
    const j = (i + 1) % S;
    const o = i * 6;
    idx[o] = i * 2;
    idx[o + 1] = i * 2 + 1;
    idx[o + 2] = j * 2;
    idx[o + 3] = i * 2 + 1;
    idx[o + 4] = j * 2 + 1;
    idx[o + 5] = j * 2;
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** 轮廓半径插值（任意角度 → 相邻采样线性插值） */
function rhoAt(rhos: Float64Array, S: number, ang: number): number {
  const TAU = Math.PI * 2;
  let t = ang % TAU;
  if (t < 0) t += TAU;
  const fi = (t / TAU) * S;
  const i0 = Math.floor(fi) % S;
  const i1 = (i0 + 1) % S;
  const f = fi - Math.floor(fi);
  return rhos[i0] * (1 - f) + rhos[i1] * f;
}

/** 轮廓采样分辨率（细胞质盘 / 缘带 / 核盘） */
const CYTO_S = 168;
const NUC_S = 116;

/* ============ 剖面控制器（v3 精确轮廓版） ============ */

/* eslint-disable react-hooks/immutability -- renderer.clippingPlanes 为 three.js 全局渲染器命令式 API（R3F 标准用法） */

/** v53 剖面平面真源单例: 材质局部裁剪改造后 gl.clippingPlanes 恒为空 —— 原读
 *  gl.clippingPlanes[0] 的消费方（hover-labels 锚点裁剪 / organelles 示教锚贴面吸附）
 *  改读本单例; SectionClipController 每帧写入（与 sim.clipPlane 同源同步, 关闭时置 null） */
export const sectionPlaneSource: { current: THREE.Plane | null } = { current: null };

/** v53 剖面完整性豁免标记: userData.noSectionClip === true 的材质（分子/药物本体、光环、
 *  磷酸化环、P 珠等）不参与剖面裁剪 —— 用户诉求「节点在 50% 剖面处显示完整球体」;
 *  完全落入剖掉前半区的分子由 Molecule3D/DrugMolecule3D 帧门整组隐藏（视觉/标签/悬停一致） */
export function noSectionClipTag<T extends THREE.Material>(m: T): T {
  m.userData.noSectionClip = true;
  return m;
}

export function SectionClipController({
  enabled,
  depth,
  axis,
  spec,
  showAnatomy,
  sim,
  labels,
}: {
  enabled: boolean;
  /** 剖切深度 0-1（切平面从前缘 +R·extent 线性扫到后缘; 0.5 过形状轴心） */
  depth: number;
  axis: SectionAxis;
  spec: CellBodySpec;
  /** 联动解剖标注开关（剖面结构标注） */
  showAnatomy: boolean;
  /** 模拟快照引用（广播 clipPlane → 分子标签层同步隐藏被剖掉的前半分子标签） */
  sim: { current: { clipPlane?: THREE.Plane | null } };
  /** 剖面结构标注文案（i18n） */
  labels: { nucleus: string; cytosol: string; membrane: string; section: string };
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  const R = spec.membraneR;
  const N = spec.nucleusR;
  const shape = spec.shape;
  const nucBumpy = spec.nucleusBumpy;
  // 类型化形状轴向延伸（法向轴有效半径 Rn = 剖切扫描范围）
  const extent = SHAPE_EXTENT[shape] ?? SHAPE_EXTENT.sphere;
  const Rn = R * extent[AXIS_N[axis]];
  // 核实例（v8: 肝细胞双核 —— 每核独立剖面核盘; 稳定元组避免 effect 依赖身份漂移）
  const nucleiList = useMemo(
    () => nucleusInstances(shape, R).map((nu) => ({ cx: nu.center.x, cy: nu.center.y, cz: nu.center.z, scale: nu.scale }) as const),
    [shape, R],
  );

  const plane = useMemo(() => new THREE.Plane(SECTION_ORIENTS.front.normal.clone(), R * 0.35), []);
  const targetNormal = useRef(plane.normal.clone());
  const targetConstant = useRef(R * 0.35);
  const origSides = useRef<Map<THREE.Material, THREE.Side>>(new Map());
  const discGroupRef = useRef<THREE.Group | null>(null);
  const cytoDiscRef = useRef<THREE.Mesh | null>(null);
  const cytoRingRef = useRef<THREE.Mesh | null>(null);
  const nucDiscRefs = useRef<(THREE.Mesh | null)[]>([]);
  const [ready, setReady] = useState(false);
  /** 剖面结构标注锚点（真实轮廓驱动; null = 未计算/盘隐藏） */
  const [annoState, setAnnoState] = useState<{
    mem: [number, number];
    cyto: [number, number];
    nuc: [number, number] | null;
  } | null>(null);

  const cytoTex = useMemo(() => makeCytoplasmTexture(R), [R]);
  const nucTex = useMemo(() => makeNucleusTexture(N), [N]);
  useEffect(() => {
    if (!cytoTex || !nucTex) return;
    setReady(true);
    return () => {
      cytoTex.dispose();
      nucTex.dispose();
    };
  }, [cytoTex, nucTex]);

  /* v3 动态轮廓几何（预分配, 顶点原地改写 —— 深度/方位/细胞变化时重算, 无 GC churn） */
  const cytoFan = useMemo(() => makeFanGeometry(CYTO_S, 0), []);
  const cytoRibbon = useMemo(() => makeRibbonGeometry(CYTO_S, 0.001), []);
  const nucFans = useMemo(() => nucleiList.map(() => makeFanGeometry(NUC_S, 0.008)), [nucleiList]);
  useEffect(
    () => () => {
      cytoFan.dispose();
      cytoRibbon.dispose();
      for (const f of nucFans) f.dispose();
    },
    [cytoFan, cytoRibbon, nucFans],
  );

  /* 方位变化 → 目标法向（平滑过渡在 useFrame 中完成） */
  useEffect(() => {
    targetNormal.current.copy(SECTION_ORIENTS[axis].normal);
  }, [axis]);

  /* 深度 → 平面常数（+Rn 前缘 → -Rn 后缘, 0.5 过形状轴心 = 最大剖面） */
  useEffect(() => {
    targetConstant.current = Rn - depth * 2 * Rn;
  }, [depth, Rn]);

  /* ============ v3 核心: 精确相交轮廓重算 ============
   * 触发: 剖切开/关 · 深度 · 方位 · 细胞类型/规格变化
   * 产出: 细胞质填充扇盘 + 发光缘带 + 核扇盘的顶点位置 + 可见性 + 标注锚点
   * 半径函数与 3D 几何完全同源（cellSurf / shapedNucleusGeometry 同一公式）—— 零漂移 */
  useEffect(() => {
    if (!enabled || !ready) return;
    // 平面参数（与 useFrame 同步逻辑一致, 纯函数可重入）
    const n = SECTION_ORIENTS[axis].normal;
    const constant = Rn - depth * 2 * Rn;
    // 面内正交基（与盘组四元数同源: setFromUnitVectors(ẑ, n) 的 x/y 象）
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const e1 = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const e2 = new THREE.Vector3(0, 1, 0).applyQuaternion(q);

    // ---- 细胞质轮廓（膜径向 = shapeFactor × R + FBM, 与 cellSurf 同源） ----
    const { freq, amp } = SHAPE_NOISE[shape] ?? SHAPE_NOISE.sphere;
    const memRadial = (ux: number, uy: number, uz: number): number =>
      shapeRadius({ x: ux, y: uy, z: uz }, shape, R) +
      (fbm3(ux * freq, uy * freq, uz * freq, 3, 3) - 0.5) * 2 * amp;
    const rhos = new Float64Array(CYTO_S);
    const maxRho = sampleSectionContour(
      n, constant, new THREE.Vector3(0, 0, 0), memRadial, R * 2.6, CYTO_S, e1, e2, rhos,
    );

    // ---- 写入细胞质扇盘 + 缘带 ----
    const cpos = cytoFan.attributes.position as THREE.BufferAttribute;
    cpos.setXYZ(0, 0, 0, 0);
    for (let i = 0; i < CYTO_S; i++) {
      const a = (i / CYTO_S) * Math.PI * 2;
      const r = rhos[i];
      cpos.setXYZ(i + 1, r * Math.cos(a), r * Math.sin(a), 0);
    }
    cpos.needsUpdate = true;
    cytoFan.computeBoundingSphere();
    const rpos = cytoRibbon.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < CYTO_S; i++) {
      const a = (i / CYTO_S) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const r = rhos[i];
      const inner = Math.max(0, r - 0.09);
      const outer = r > 0 ? r + 0.04 : 0;
      rpos.setXYZ(i * 2, inner * ca, inner * sa, 0.001);
      rpos.setXYZ(i * 2 + 1, outer * ca, outer * sa, 0.001);
    }
    rpos.needsUpdate = true;
    cytoRibbon.computeBoundingSphere();

    const discVisible = maxRho > R * 0.1;
    if (cytoDiscRef.current) cytoDiscRef.current.visible = discVisible;
    if (cytoRingRef.current) cytoRingRef.current.visible = discVisible;

    // ---- 核轮廓（核径向 = nucleusFactor × Nn + 分叶 + FBM, 与 shapedNucleusGeometry 同源; v8 多核每盘独立求交） ----
    const nucAmp = nucBumpy ? 0.24 : 0.07;
    let bestNuc: { nx: number; ny: number; maxRho: number } | null = null;
    for (let ni = 0; ni < nucleiList.length; ni++) {
      const nu = nucleiList[ni];
      const nucCenter = new THREE.Vector3(nu.cx, nu.cy, nu.cz);
      const Nn = N * nu.scale;
      const nucRadial = (ux: number, uy: number, uz: number): number =>
        nucleusRadius({ x: ux, y: uy, z: uz }, shape, Nn) +
        (fbm3(ux * 1.5, uy * 1.5, uz * 1.5, 3, 7) - 0.5) * 2 * nucAmp;
      const rhosN = new Float64Array(NUC_S);
      const maxRhoN = sampleSectionContour(
        n, constant, nucCenter, nucRadial, Nn * 2.4, NUC_S, e1, e2, rhosN,
      );
      // 核中心在切平面内的投影 → 盘 local 坐标（e1/e2 分量; 与盘组四元数一致无镜像歧义）
      const nFoot = nucCenter.clone().addScaledVector(
        n, -(nucCenter.dot(n) + constant),
      );
      const nx = nFoot.x * e1.x + nFoot.y * e1.y + nFoot.z * e1.z;
      const ny = nFoot.x * e2.x + nFoot.y * e2.y + nFoot.z * e2.z;
      const fan = nucFans[ni];
      if (!fan) return;
      const npos = fan.attributes.position as THREE.BufferAttribute;
      npos.setXYZ(0, nx, ny, 0.008);
      for (let i = 0; i < NUC_S; i++) {
        const a = (i / NUC_S) * Math.PI * 2;
        const r = rhosN[i];
        npos.setXYZ(i + 1, nx + r * Math.cos(a), ny + r * Math.sin(a), 0.008);
      }
      npos.needsUpdate = true;
      fan.computeBoundingSphere();

      const nucVisible = maxRhoN > Nn * 0.1;
      const disc = nucDiscRefs.current[ni];
      if (disc) {
        disc.visible = nucVisible;
        const m = disc.material as THREE.MeshBasicMaterial;
        m.opacity = Math.min(0.97, (maxRhoN / (Nn * 0.34)) * 0.97); // 切面掠核渐入
      }
      if (nucVisible && (!bestNuc || maxRhoN > bestNuc.maxRho)) bestNuc = { nx, ny, maxRho: maxRhoN };
    }

    // ---- 标注锚点（真实轮廓驱动） ----
    if (discVisible) {
      const thM = -0.38; // 膜标注: 轮廓缘带外侧（右下缘）
      const rM = rhoAt(rhos, CYTO_S, thM);
      const useM = rM > 0.2;
      const mBase = (useM ? rM : maxRho) + 0.3;
      const mAng = useM ? thM : 0;
      const thC = 2.35; // 胞质标注: 轮廓内左上象限
      const rc = Math.max(rhoAt(rhos, CYTO_S, thC), maxRho * 0.5);
      setAnnoState({
        mem: [mBase * Math.cos(mAng), mBase * Math.sin(mAng)],
        cyto: [rc * 0.55 * Math.cos(thC), rc * 0.55 * Math.sin(thC)],
        nuc: bestNuc ? [bestNuc.nx, bestNuc.ny + bestNuc.maxRho * 0.55 + 0.1] : null,
      });
    } else {
      setAnnoState(null);
    }
  }, [enabled, ready, depth, axis, Rn, R, N, shape, nucBumpy, nucleiList, cytoFan, cytoRibbon, nucFans]);

  /* ============ v53 材质局部裁剪（全局 → 局部改造） ============
   * 用户诉求「节点在 50% 剖面处显示完整」: 全局 gl.clippingPlanes 对所有材质生效且无法豁免
   * —— 改为 renderer.localClippingEnabled + 逐材质 material.clippingPlanes:
   *   · userData.noSectionClip === true（分子/药物本体、光环、磷酸化环、P 珠）永不裁剪
   *     → 节点在切面处恒渲染完整球体; 完全落入剖掉前半区的分子由 Molecule3D 帧门整组隐藏
   *   · 其余材质（膜/细胞器/边线）与旧全局裁剪行为严格一致（NUM_CLIPPING_PLANES 同为 1）
   *   · 新建材质由 150ms 补扫覆盖（旧 500ms 双面化补扫同步加密） */
  const planesArr = useMemo(() => [plane], [plane]);
  const clipStats = useRef({ assigned: 0, exempt: 0 });
  const applySectionClipping = useCallback(() => {
    let assigned = 0;
    let exempt = 0;
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!(m instanceof THREE.Material)) continue;
        if ((m.userData as { noSectionClip?: boolean }).noSectionClip === true) {
          exempt += 1;
          if (m.clippingPlanes !== null) m.clippingPlanes = null;
          continue;
        }
        assigned += 1;
        if (!origSides.current.has(m)) {
          origSides.current.set(m, m.side);
          m.side = THREE.DoubleSide;
          m.needsUpdate = true;
        }
        // 共享同一数组引用 → 已赋过的材质零重编译扰动
        if (m.clippingPlanes !== planesArr) {
          m.clippingPlanes = planesArr;
          m.needsUpdate = true;
        }
      }
    });
    clipStats.current = { assigned, exempt };
    // QA 插桩（__cellQaProbe 门控 —— 与全项目探针方法论一致）
    if (typeof window !== 'undefined' && (window as { __cellQaProbe?: boolean }).__cellQaProbe) {
      (window as unknown as Record<string, unknown>).__clipQa = {
        local: gl.localClippingEnabled,
        global: gl.clippingPlanes.length,
        assigned,
        exempt,
        planeC: +plane.constant.toFixed(2),
      };
    }
  }, [scene, planesArr, gl, plane]);

  /* 开/关剖切: 材质局部裁剪挂载 + 结构材质临时双面化（记忆原 side 以还原） */
  useEffect(() => {
    const restore = () => {
      origSides.current.forEach((side, m) => {
        m.side = side;
        if (m.clippingPlanes !== null) {
          m.clippingPlanes = null;
          m.needsUpdate = true;
        }
      });
      origSides.current.clear();
    };
    if (enabled) {
      gl.clippingPlanes = [];
      gl.localClippingEnabled = true;
      applySectionClipping();
    } else {
      gl.clippingPlanes = [];
      gl.localClippingEnabled = false;
      restore();
    }
    return () => {
      gl.clippingPlanes = [];
      gl.localClippingEnabled = false;
      restore();
    };
  }, [enabled, gl, applySectionClipping]);

  /* 新增 mesh 后补局部裁剪 + 双面化（剖面开启时动态生成的分子/事件脉冲等; v53: 500→150ms
   *  局部裁剪必须及时覆盖新建材质, 否则新细胞器短窗内无裁剪闪现） */
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last = 0;
    const tick = () => {
      const now = performance.now();
      if (now - last > 150) {
        last = now;
        applySectionClipping();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, applySectionClipping]);

  /* 帧驱动: 方位/深度与目标同步（即时贴合, 不阻尼）+ 盘组位姿 + clipPlane 广播
   * v3: 轮廓顶点由上面的重算 effect 原地写入（纯函数可重入, 帧内零计算）;
   *     分子贴面投影(layout)使用同一目标平面 → 平面/剖面盘/分子三者零漂移 */
  useFrame(() => {
    plane.normal.copy(targetNormal.current).normalize();
    plane.constant = targetConstant.current;
    if (discGroupRef.current) {
      discGroupRef.current.position
        .copy(plane.normal)
        .multiplyScalar(-plane.constant + 0.035);
      discGroupRef.current.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        plane.normal,
      );
    }
    // 广播裁剪平面（分子标签层读取; 关闭时置 null）; v53: 单例广播（hover 锚点/示教锚消费方）
    sim.current.clipPlane = enabled ? plane : null;
    sectionPlaneSource.current = enabled ? plane : null;
  });

  return (
    <>
      {enabled && ready && cytoTex && nucTex && (
        <group ref={discGroupRef}>
          {/* 细胞质剖面填充盘（真实相交轮廓扇形; 纯视觉 —— 禁用 raycast,
              否则会截获点击便既不选中分子也不触发 onPointerMissed 取消选中） */}
          <mesh ref={cytoDiscRef} geometry={cytoFan} renderOrder={96} raycast={() => null} dispose={null}>
            <meshBasicMaterial
              map={cytoTex}
              transparent
              opacity={0.94}
              side={THREE.DoubleSide}
              depthWrite={false}
              fog={false}
              polygonOffset
              polygonOffsetFactor={-4}
            />
          </mesh>
          {/* 剖面发光边缘（真实轮廓缘带三角条, 随相交轮廓贴合; 纯视觉 —— 不参与拾取） */}
          <mesh ref={cytoRingRef} geometry={cytoRibbon} renderOrder={97} raycast={() => null} dispose={null}>
            <meshBasicMaterial color="#91afcf" transparent opacity={0.65} side={THREE.DoubleSide} depthWrite={false} fog={false} />
          </mesh>
          {/* 核剖面盘（真实核相交轮廓; v8 多核每盘独立 —— 肝细胞双核切面双核盘; 纯视觉 —— 不参与拾取） */}
          {nucleiList.map((_, ni) => (
            <mesh
              key={ni}
              ref={(m) => { nucDiscRefs.current[ni] = m; }}
              geometry={nucFans[ni]}
              renderOrder={98}
              raycast={() => null}
              dispose={null}
            >
              <meshBasicMaterial
                map={nucTex}
                transparent
                opacity={0.97}
                side={THREE.DoubleSide}
                depthWrite={false}
                fog={false}
                polygonOffset
                polygonOffsetFactor={-6}
              />
            </mesh>
          ))}
          {/* 剖面结构标注（锚定真实轮廓; 联动解剖标注开关） */}
          {showAnatomy &&
            annoState &&
            ([
              { p: annoState.nuc, text: labels.nucleus, key: 'nuc' },
              { p: annoState.cyto, text: labels.cytosol, key: 'cyto' },
              { p: annoState.mem, text: labels.membrane, key: 'mem' },
            ] as { p: [number, number] | null; text: string; key: string }[])
              .filter((a): a is { p: [number, number]; text: string; key: string } => a.p !== null)
              .map((a) => (
                <Html
                  key={a.key}
                  position={[a.p[0], a.p[1], 0.02]}
                  center
                  zIndexRange={[30, 0]}
                  pointerEvents="none"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  <div className="mol3d-label is-active section-anno" style={{ whiteSpace: 'nowrap' }}>
                    <span className="mol3d-sym">{a.text}</span>
                  </div>
                </Html>
              ))}
        </group>
      )}
    </>
  );
}
