/**
 * 剖面精确相交轮廓 —— 数值验证脚本（bun scripts/verify-section-contour.ts）
 *
 * 验证 sampleSectionContour 与"类型形状函数 × FBM"（cellSurf 同源公式）的几何一致性:
 *   1. 表面一致性: 每个命中 rim 顶点 |p−center| ≈ radial(p̂)（二分残差 ≤ 1e-3）
 *   2. 外侧性: rim+ε 在实体外（轮廓是最外边界, 不是内部空洞边界）
 *   3. 内侧性: rim−ε 在实体内（未提前收敛）
 *   4. 命中完备性: 未命中方向（ρ=0）验证该整条射线确实在实体外
 *   5. 轴向解析对照: 关键形状在过心切面的 maxRho 与 SHAPE_EXTENT 解析值吻合（±噪声容差）
 *   6. 端点鲁棒性: depth 0.02/0.98 不产生 NaN
 *   7. 核轮廓偏移: columnar 基底核的剖面垂足位于核中心投影（−y 方向）
 */
import * as THREE from 'three';
import { sampleSectionContour, SECTION_ORIENTS, AXIS_N, type SectionAxis } from '../src/components/cell3d/section-view';
import {
  MORPH_SHAPE,
  SHAPE_EXTENT,
  SHAPE_NOISE,
  nucleusCenter,
  nucleusRadius,
  shapeRadius,
  type ShapeKind,
} from '../src/lib/simulation/cell-shape';
import { fbm3 } from '../src/components/cell3d/procedural';

const R = 14;
const N = 5.2;
const CYTO_S = 168;
const NUC_S = 116;

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

function memRadial(shape: ShapeKind) {
  const { freq, amp } = SHAPE_NOISE[shape];
  return (ux: number, uy: number, uz: number) =>
    shapeRadius({ x: ux, y: uy, z: uz }, shape, R) +
    (fbm3(ux * freq, uy * freq, uz * freq, 3, 3) - 0.5) * 2 * amp;
}

function nucRadial(shape: ShapeKind) {
  return (ux: number, uy: number, uz: number) =>
    nucleusRadius({ x: ux, y: uy, z: uz }, shape, N) +
    (fbm3(ux * 1.5, uy * 1.5, uz * 1.5, 3, 7) - 0.5) * 2 * 0.07;
}

/** 完整性检查一套轮廓（表面一致/外/内/未命中）
 *  未命中判定容差: 窄于 1.4 单位的掠射薄月牙（亚像素级）不计失败 —— 与采样器 30 步粗扫同量级 */
function checkContour(
  tag: string,
  n: THREE.Vector3,
  constant: number,
  center: THREE.Vector3,
  radial: (ux: number, uy: number, uz: number) => number,
  S: number,
  rhos: Float64Array,
): { maxRho: number; hitCount: number } {
  const delta = center.dot(n) + constant;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  const e1 = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const e2 = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const dirAt = (i: number) => {
    const a = (i / S) * Math.PI * 2;
    return {
      dx: e1.x * Math.cos(a) + e2.x * Math.sin(a),
      dy: e1.y * Math.cos(a) + e2.y * Math.sin(a),
      dz: e1.z * Math.cos(a) + e2.z * Math.sin(a),
    };
  };
  const dist = (rho: number) => Math.sqrt(delta * delta + rho * rho);
  const radialAt = (rho: number, i: number) => {
    const { dx, dy, dz } = dirAt(i);
    const len = Math.sqrt(delta * delta + rho * rho) || 1e-9;
    return radial((-delta * n.x + rho * dx) / len, (-delta * n.y + rho * dy) / len, (-delta * n.z + rho * dz) / len);
  };
  let maxRho = 0;
  let hit = 0;
  let surfErr = 0;
  for (let i = 0; i < S; i++) {
    const rho = rhos[i];
    if (rho > maxRho) maxRho = rho;
    if (rho <= 0) {
      // 未命中方向: 检查射线上是否存在【宽于感知阈值】的实体段（掠射薄月牙可豁免）
      let inStart = -1;
      let maxW = 0;
      for (let k = 0; k <= 80; k++) {
        const rk = (R * 2.6 * k) / 80;
        const isIn = dist(rk) <= radialAt(rk, i);
        if (isIn) {
          if (inStart < 0) inStart = rk;
        } else if (inStart >= 0) {
          maxW = Math.max(maxW, rk - inStart);
          inStart = -1;
        }
      }
      if (maxW > 1.4) fail(`${tag}[${i}] 未命中但射线上有宽 ${maxW.toFixed(2)} 实体段`);
      continue;
    }
    hit++;
    const e0 = Math.abs(dist(rho) - radialAt(rho, i));
    if (e0 > surfErr) surfErr = e0;
    if (e0 > 1e-3) fail(`${tag}[${i}] 表面残差 ${e0.toFixed(5)}`);
    if (dist(rho + 0.05) <= radialAt(rho + 0.05, i)) fail(`${tag}[${i}] rim+0.05 仍在实体内`);
    if (rho > 0.25 && dist(rho - 0.05) > radialAt(rho - 0.05, i)) fail(`${tag}[${i}] rim−0.05 已在实体外`);
    if (!Number.isFinite(rho)) fail(`${tag}[${i}] NaN`);
  }
  return { maxRho, hitCount: hit };
}

/* ---- 1-6: 全形状 × 三方位 × 多深度 膜轮廓 ---- */
const axes: SectionAxis[] = ['front', 'top', 'side'];
const depths = [0.02, 0.15, 0.5, 0.85, 0.98];
const morphs = Object.keys(MORPH_SHAPE);
console.log(`膜轮廓完整性: ${morphs.length} 形状 × ${axes.length} 方位 × ${depths.length} 深度`);

for (const morph of morphs) {
  const shape = MORPH_SHAPE[morph] as ShapeKind;
  const radial = memRadial(shape);
  const extent = SHAPE_EXTENT[shape];
  for (const axis of axes) {
    const n = SECTION_ORIENTS[axis].normal;
    const Rn = R * extent[AXIS_N[axis]];
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const e1 = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const e2 = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    for (const depth of depths) {
      const constant = Rn - depth * 2 * Rn;
      const rhos = new Float64Array(CYTO_S);
      const maxRho = sampleSectionContour(n, constant, new THREE.Vector3(0, 0, 0), radial, R * 2.6, CYTO_S, e1, e2, rhos);
      const res = checkContour(`${morph}/${axis}/d${depth}`, n, constant, new THREE.Vector3(0, 0, 0), radial, CYTO_S, rhos);
      if (Math.abs(res.maxRho - maxRho) > 1e-6) fail(`${morph}/${axis}/d${depth} maxRho 不一致`);
      if (depth === 0.5 && maxRho === 0) fail(`${morph}/${axis} 过心切面为空`);
    }
    // 过心切面（δ=0）解析锚: 轮廓半径恒等于 radial(d̂) → 解析 max = 面内圆细扫 720 的最大径向
    // 采样器 168 方位 ≤ 解析 720 方位 → 允许 1.2% 离散差
    let analytic = 0;
    for (let k = 0; k < 720; k++) {
      const a = (k / 720) * Math.PI * 2;
      const dx = e1.x * Math.cos(a) + e2.x * Math.sin(a);
      const dy = e1.y * Math.cos(a) + e2.y * Math.sin(a);
      const dz = e1.z * Math.cos(a) + e2.z * Math.sin(a);
      const r = radial(dx, dy, dz);
      if (r > analytic) analytic = r;
    }
    const rhosC = new Float64Array(CYTO_S);
    const mC = sampleSectionContour(n, 0, new THREE.Vector3(0, 0, 0), radial, R * 2.6, CYTO_S, e1, e2, rhosC);
    if (mC < analytic * 0.988 || mC > analytic * 1.002) {
      fail(`${morph}/${axis} 过心 maxRho=${mC.toFixed(2)} 偏离解析锚 ${analytic.toFixed(2)}`);
    } else {
      ok(`${morph}/${axis} 过心 maxRho=${mC.toFixed(2)} ≈ 解析锚 ${analytic.toFixed(2)}`);
    }
  }
}

/* ---- 7: 核轮廓（全形状过心）+ columnar 基底核偏移方向 ---- */
console.log('核轮廓完整性 + 偏移:');
for (const morph of morphs) {
  const shape = MORPH_SHAPE[morph] as ShapeKind;
  const radial = nucRadial(shape);
  const nc = nucleusCenter(shape, R);
  const center = new THREE.Vector3(nc.x, nc.y, nc.z);
  for (const axis of axes) {
    const n = SECTION_ORIENTS[axis].normal;
    const Rn = R * SHAPE_EXTENT[shape][AXIS_N[axis]];
    const constant = Rn - 0.5 * 2 * Rn;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const rhos = new Float64Array(NUC_S);
    sampleSectionContour(n, constant, center, radial, N * 2.4, NUC_S,
      new THREE.Vector3(1, 0, 0).applyQuaternion(q),
      new THREE.Vector3(0, 1, 0).applyQuaternion(q),
      rhos);
    checkContour(`nuc/${morph}/${axis}`, n, constant, center, radial, NUC_S, rhos);
  }
}
{
  // columnar 上皮基底核: 正剖(front)下核剖面垂足应在 −y 侧（world）→ disc local y 因 front 镜像为 +
  const shape = 'columnar' as ShapeKind;
  const nc = nucleusCenter(shape, R);
  const n = SECTION_ORIENTS.front.normal;
  const Rn = R * SHAPE_EXTENT[shape][AXIS_N.front];
  const constant = Rn - 0.5 * 2 * Rn;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  const foot = new THREE.Vector3(nc.x, nc.y, nc.z).addScaledVector(n, -(nc.x * n.x + nc.y * n.y + nc.z * n.z + constant));
  const e1 = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const e2 = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const localY = foot.x * e2.x + foot.y * e2.y + foot.z * e2.z;
  // disc local y ≈ world −y（front 镜像）: 基底核 world y = −0.17R → local y > 0
  if (nc.y < -0.1 * R && localY <= 0) fail(`columnar 基底核垂足 local y=${localY.toFixed(2)} 符号错误`);
  else ok(`columnar 基底核垂足 local y=${localY.toFixed(2)}（核中心 world y=${nc.y.toFixed(2)}）`);
}

/* ---- 汇总 ---- */
if (failures > 0) {
  console.error(`\n✗ ${failures} 项失败`);
  process.exit(1);
}
console.log('\n✓ 剖面精确轮廓全部数值验证通过');
