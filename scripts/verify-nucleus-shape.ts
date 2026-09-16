/**
 * 细胞核形状体系 v6 数值验证（bun scripts/verify-nucleus-shape.ts）
 * 验证目标:
 *   1. nucleusRadius: 各类型核面半径在 NUCLEUS_FORM.axes 预期内（杆状核沿 x 延伸 ~1.85N, 窄轴 ~0.6N）
 *   2. nucleusRayExit: 射线避核边界 > 0 当且仅当方向与核相交; 从细胞中心发射的远交点 ≥ 近交点
 *   3. insidePos 区间语义: 采样点 t 严格在 [核边界, 膜面] 之间（用纯函数复刻 organelles.tsx 的实现）
 *   4. 与旧球形对比: 杆状/梭状/柱状窄轴处旧采样穿膜（organelle r > surface), 新采样必然在内
 */
import {
  MORPH_SHAPE, NUCLEUS_EXTENT, NUCLEUS_FORM, SHAPE_NOISE,
  nucleusCenter, nucleusFactor, nucleusRadius, nucleusRayExit, shapeRadius,
  type ShapeKind,
} from '../src/lib/simulation/cell-shape';

// 复刻 organelles.tsx 的 CELL_BODY_SPECS 关键参数（R/N）
const SPECS: Record<string, { R: number; N: number }> = {
  hepatocyte: { R: 10, N: 4.1 },
  neuron: { R: 10, N: 3.9 },
  tcell: { R: 8.6, N: 5.2 },
  epithelial: { R: 11, N: 4.0 },
  cardiomyocyte: { R: 9, N: 3.6 },
  fibroblast: { R: 10.5, N: 3.9 },
  cancer: { R: 10.2, N: 4.5 },
};

// 复刻 procedural.ts hash01/fbm3（确定性, 验证语义足够）
function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}
function fbm3(x: number, y: number, z: number, oct = 3, seed = 3): number {
  let v = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) {
    const s = Math.sin(x * f * 12.9898 + y * f * 78.233 + z * f * 37.719 + seed * 17.13) * 43758.5453;
    v += a * (s - Math.floor(s));
    a *= 0.5; f *= 2.05;
  }
  return v / (1 - Math.pow(0.5, oct));
}

// 复刻 cellSurf（无噪声版 —— 噪声幅度 ≤ amp, 验证留裕量）
const cellSurfBase = (d: { x: number; y: number; z: number }, kind: ShapeKind, R: number): number =>
  shapeRadius(d, kind, R);

let failures = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) { failures++; console.error('  ✗ FAIL:', msg); }
};

console.log('=== 1) nucleusRadius 轴向预期（含分叶容差） ===');
for (const [morph, { N }] of Object.entries(SPECS)) {
  const kind = MORPH_SHAPE[morph];
  const axes = NUCLEUS_FORM[kind].axes;
  const lobes = NUCLEUS_FORM[kind].lobes;
  const tol = N * (0.02 + lobes * 1.25);
  const rx = nucleusRadius({ x: 1, y: 0, z: 0 }, kind, N);
  const ry = nucleusRadius({ x: 0, y: 1, z: 0 }, kind, N);
  const rz = nucleusRadius({ x: 0, y: 0, z: 1 }, kind, N);
  const [ex, ey, ez] = axes;
  check(Math.abs(rx - ex * N) < tol, `${morph} rx≈${(ex * N).toFixed(2)} got ${rx.toFixed(2)}`);
  check(Math.abs(ry - ey * N) < tol, `${morph} ry≈${(ey * N).toFixed(2)} got ${ry.toFixed(2)}`);
  check(Math.abs(rz - ez * N) < tol, `${morph} rz≈${(ez * N).toFixed(2)} got ${rz.toFixed(2)}`);
}
console.log('  核轴向半径全部符合 NUCLEUS_FORM 预期（含分叶 ±小幅偏差容差）');

console.log('=== 2) nucleusRayExit 交点语义 ===');
for (const [morph, { R, N }] of Object.entries(SPECS)) {
  const kind = MORPH_SHAPE[morph];
  // 正向轴: 必相交 → exit > 0
  const ex = nucleusRayExit({ x: 1, y: 0, z: 0 }, kind, N, R);
  check(ex > 0, `${morph} +x ray should hit nucleus, exit=${ex}`);
  // T 细胞核几乎充满细胞: 中心在核内 → 远交点应 ≥ 核最大半轴
  if (morph === 'tcell') check(ex >= N * 0.9, `tcell exit ${ex} ≥ 0.9N`);
  // 癌细胞核偏移 (0.05R, 0.04R, 0): 反向 -x 略偏可能仍相交或掠过 —— 只验证非负
  const bx = nucleusRayExit({ x: -1, y: 0, z: 0 }, kind, N, R);
  check(bx >= 0, `${morph} -x exit non-negative`);
}

console.log('=== 3) insidePos 区间语义（复刻 organelles 实现） ===');
for (const [morph, { R, N }] of Object.entries(SPECS)) {
  const kind = MORPH_SHAPE[morph];
  const amp = SHAPE_NOISE[kind].amp;
  let worst = 0; // 采样点超出膜面内边界（-噪声裕量）的最大量
  for (let i = 0; i < 400; i++) {
    const lat = (hash01(`v${i}`, 5) - 0.5) * 2.4;
    const lon = hash01(`v${i}`, 7) * Math.PI * 2;
    const d = {
      x: Math.cos(lat) * Math.cos(lon),
      y: Math.sin(lat),
      z: Math.cos(lat) * Math.sin(lon),
    };
    const frac = hash01(`v${i}`, 3);
    const r = 0.4;
    const outer = cellSurfBase(d, kind, R) - (r + 0.35);
    const lo = nucleusRayExit(d, kind, N, R) + 0.5 + r;
    const hi = Math.max(lo + 0.25, outer);
    // 与 organelles.tsx v6 一致: 硬钳至膜面内（挤压方向宁擦核不穿膜）
    const t = Math.min(lo + (hi - lo) * frac, outer);
    const surf = cellSurfBase(d, kind, R);
    // 采样点 + 细胞器半径 + 噪声幅度 必须 ≤ 膜面
    worst = Math.max(worst, t + r + amp - surf);
    // 采样点不得深入核内（硬钳挤压方向允许 0.35 轻擦）
    const nExit = nucleusRayExit(d, kind, N, R);
    if (nExit > 0) check(t >= nExit - 0.4, `${morph} sample deep inside nucleus! t=${t} exit=${nExit}`);
  }
  check(worst <= 0.01, `${morph} 有机体采样越界膜外 ${worst.toFixed(3)}（应 ≤0, 噪声裕量内）`);
  console.log(`  ${morph}: 400 采样点全部满足 [核外+pad, 膜内-margin], 最大越界余量 ${worst.toFixed(3)}`);
}

console.log('=== 4) 旧球形 vs 新采样 对比（杆状/梭状/柱状窄轴穿膜修复实证） ===');
for (const morph of ['cardiomyocyte', 'fibroblast', 'epithelial', 'tcell']) {
  const { R, N } = SPECS[morph];
  const kind = MORPH_SHAPE[morph];
  let oldViolations = 0;
  let newViolations = 0;
  const testDirs = [
    { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 },
    { x: -1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: -1 },
  ];
  for (const d of testDirs) {
    const surf = cellSurfBase(d, kind, R);
    // 旧: 线粒体球形壳 0.46-0.76R
    const oldR = R * (0.46 + 0.3 * 0.5);
    if (oldR + 1.15 > surf) oldViolations++;
    // 新: insidePos frac=0.5, r=1.15（含硬钳）
    const outer = surf - (1.15 + 0.35);
    const lo = nucleusRayExit(d, kind, N, R) + 0.5 + 1.15;
    const hi = Math.max(lo + 0.25, outer);
    const t = Math.min(lo + (hi - lo) * 0.5, outer);
    if (t + 1.15 + SHAPE_NOISE[kind].amp > surf) newViolations++;
  }
  console.log(`  ${morph}: 旧球形壳 6 主方向穿膜 ${oldViolations} 处 → 新采样 ${newViolations} 处`);
  check(newViolations === 0, `${morph} 新采样仍有穿膜`);
}

console.log('=== 5) 核中心偏移落位 ===');
for (const [morph, { R }] of Object.entries(SPECS)) {
  const kind = MORPH_SHAPE[morph];
  const c = nucleusCenter(kind, R);
  const n = Math.hypot(c.x, c.y, c.z);
  check(n < R * 0.25, `${morph} 核偏移 |c|=${n.toFixed(2)} < 0.25R（核仍在细胞中央区）`);
}

if (failures) {
  console.error(`\n${failures} FAILURES`);
  process.exit(1);
}
console.log('\n全部通过 ✓ —— 核形状体系/体内采样/避核语义数值验证');
