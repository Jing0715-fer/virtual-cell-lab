/**
 * 细胞形状实现比例 —— 数值验证脚本（bun scripts/verify-cell-shape.ts）
 *
 * v7 形状重设计后, 验证"声明形态学 ↔ 实现轮廓"一致（旧版 spindle 声明 3:1 实测 1.15:1 的教训）:
 *   1. 各形状实现长宽比落在教材参照带内（Ross Histology / Alberts MBoC）
 *   2. SHAPE_EXTENT 表与实测轴向延伸一致（偏差 ≤ 0.28 —— 旧表 rod 声明 2.05 实测 1.41）
 *   3. 形状求解器（shapeXExtent/shapeCrossRadius）与形状函数一致（贴膜结构布局基准）
 */
import {
  MORPH_SHAPE,
  SHAPE_EXTENT,
  SHAPE_NOISE,
  shapeCrossRadius,
  shapeXExtent,
  shapeFactor,
  type ShapeKind,
  type Dir3,
} from '../src/lib/simulation/cell-shape';
import { fbm3 } from '../src/components/cell3d/procedural';

const R = 14;

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

/** 教材参照带: [最小, 最大, 描述] */
const EXPECTED: Record<string, { ratio: [number, number]; note: string }> = {
  hepatocyte: { ratio: [0.9, 1.2], note: '多边形圆角立方 ≈ 等径' },
  neuron: { ratio: [1.2, 1.6], note: '锥体泪滴（顶窄底宽）' },
  tcell: { ratio: [0.9, 1.15], note: '小球' },
  epithelial: { ratio: [0.9, 1.2], note: '柱状（高宽比另测 y:min(y,z)）' },
  cardiomyocyte: { ratio: [2.3, 2.9], note: '杆状 ~2.7:1' },
  fibroblast: { ratio: [2.5, 3.1], note: '梭形 ~2.9:1' },
  cancer: { ratio: [1.0, 1.35], note: '变形虫样不规则' },
};

console.log('形状实现比例（含 FBM 噪声, 8000 采样）:');
const realized: Record<string, number[]> = {};
for (const morph of Object.keys(MORPH_SHAPE)) {
  const shape = MORPH_SHAPE[morph] as ShapeKind;
  const { freq, amp } = SHAPE_NOISE[shape];
  const radial = (d: Dir3) => shapeFactor(d, shape) + (fbm3(d.x * freq, d.y * freq, d.z * freq, 3, 3) - 0.5) * 2 * amp;
  const ext = [0, 0, 0];
  const N = 8000;
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1;
    const ph = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const d = { x: s * Math.cos(ph), y: u, z: s * Math.sin(ph) };
    const r = radial(d);
    for (let a = 0; a < 3; a++) {
      const c = r * (a === 0 ? d.x : a === 1 ? d.y : d.z);
      if (Math.abs(c) > ext[a]) ext[a] = Math.abs(c);
    }
  }
  realized[morph] = ext;
  const ratio = (ext[0] * 2) / (Math.min(ext[1], ext[2]) * 2);
  const band = EXPECTED[morph];
  if (ratio < band.ratio[0] || ratio > band.ratio[1]) {
    fail(`${morph} 长宽比 ${ratio.toFixed(2)} 超出参照带 [${band.ratio[0]}, ${band.ratio[1]}]（${band.note}）`);
  } else {
    ok(`${morph.padEnd(14)} ${ratio.toFixed(2)}:1 ∈ [${band.ratio[0]}, ${band.ratio[1]}]（${band.note}）`);
  }
}

console.log('柱状高宽比 + SHAPE_EXTENT 一致性:');
{
  const epi = realized.epithelial;
  const hw = (epi[1] * 2) / (Math.min(epi[0], epi[2]) * 2);
  if (hw < 1.75 || hw > 2.3) fail(`epithelial 高宽比 ${hw.toFixed(2)} 超出 [1.75, 2.3]`);
  else ok(`epithelial 高:宽 = ${hw.toFixed(2)}:1（教材 ~2:1）`);
}
for (const morph of Object.keys(MORPH_SHAPE)) {
  const shape = MORPH_SHAPE[morph] as ShapeKind;
  const ext = SHAPE_EXTENT[shape];
  const real = realized[morph];
  for (let a = 0; a < 3; a++) {
    const gap = ext[a] - real[a];
    if (gap < -0.03) fail(`${morph} 轴${a} extent ${ext[a]} < 实测 ${real[a].toFixed(2)}（表不足）`);
    if (gap > 0.28) fail(`${morph} 轴${a} extent ${ext[a]} 虚高（实测 ${real[a].toFixed(2)}, 差 ${gap.toFixed(2)}）`);
  }
  ok(`${morph.padEnd(14)} extent 表与实测偏差 ∈ [-0.03, 0.28]`);
}

console.log('形状求解器（贴膜结构布局基准）:');
{
  // 旋转体形状: shapeCrossRadius(0) ≈ 中央横截面半径; shapeXExtent(y,z) ≤ 轴向延伸
  for (const morph of ['cardiomyocyte', 'fibroblast'] as const) {
    const shape = MORPH_SHAPE[morph] as ShapeKind;
    const w = SHAPE_EXTENT[shape][1];
    const mid = shapeCrossRadius(shape, 0, R);
    if (Math.abs(mid / R - w) > 0.14) fail(`${morph} shapeCrossRadius(0)=${mid.toFixed(2)} 偏离宽度 ${w}·R`);
    else ok(`${morph} 中央横截面半径 ${mid.toFixed(2)} ≈ ${w}R`);
    // 高度 (y,z)=(0.3R,0.2R) 处的 x 范围应小于中央范围（锥形收缩）
    const x0 = shapeXExtent(shape, 0, 0, R);
    const x1 = shapeXExtent(shape, 0.3 * R, 0.2 * R, R);
    if (x1 >= x0) fail(`${morph} 偏心处 x 范围 ${x1.toFixed(2)} 未收缩（中央 ${x0.toFixed(2)}）`);
    else ok(`${morph} 偏心 (0.3R, 0.2R) 处 x 范围 ${x1.toFixed(2)} < 中央 ${x0.toFixed(2)}（锥形收缩 ✓）`);
    // 求解结果应严格在体内（下一小步即出界）
    const eps = 0.05;
    const inside = (p: Dir3) => {
      const l = Math.hypot(p.x, p.y, p.z) || 1e-9;
      return l <= shapeFactor({ x: p.x / l, y: p.y / l, z: p.z / l }, shape) * R;
    };
    if (!inside({ x: x0 - eps, y: 0, z: 0 })) fail(`${morph} xExtent−ε 不在体内`);
    if (inside({ x: x0 + 0.3, y: 0, z: 0 })) fail(`${morph} xExtent+0.3 仍在体内`);
  }
}

if (failures > 0) {
  console.error(`\n✗ ${failures} 项失败`);
  process.exit(1);
}
console.log('\n✓ 细胞形状实现比例全部数值验证通过');
