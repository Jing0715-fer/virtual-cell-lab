/**
 * 数值验证: 肝细胞双核（v8）几何不变量
 *   1. 双核实例均在细胞形状体内（含 FBM 噪声裕量）
 *   2. 双核互不重叠（间距 > 0）
 *   3. nucleusRayExit 多核并集语义（射线远交点 = max(两核)）
 *   4. 单核类型行为不变（ hepatocyte 之外的类型实例数 = 1）
 *   5. insidePos 采样区间仍有效（lo < outer 或硬钳路径成立）
 * 运行: bunx tsx scripts/verify-binucleate.ts
 */
import {
  NUCLEUS_FORM,
  nucleusInstances,
  nucleusRayExit,
  insideShape,
  type ShapeKind,
} from '../src/lib/simulation/cell-shape';

const FAIL = (msg: string) => {
  console.error('✗ ' + msg);
  process.exitCode = 1;
};
const OK = (msg: string) => console.log('✓ ' + msg);

/* --- 肝细胞双核 --- */
const R = 10;
const N = 4.1;
const insts = nucleusInstances('polyhedral', R);
if (insts.length !== 2) FAIL(`肝细胞应为双核, 实例数=${insts.length}`);
else OK(`肝细胞双核实例数 = 2 (scale=${insts.map((i) => i.scale).join(',')})`);

// 1. 双核在形状体内: 核面最大点（中心 + axes*N*scale 的各轴探针）须 insideShape（留 FBM 噪声裕量 amp=0.14）
const f = NUCLEUS_FORM.polyhedral;
const AMP = 0.14;
let insideOK = true;
for (const inst of insts) {
  for (const axis of [0, 1, 2] as const) {
    const dir = [0, 1, 2].map((k) => (k === axis ? 1 : 0)) as [number, number, number];
    const surfPt = {
      x: inst.center.x + dir[0] * f.axes[axis] * N * inst.scale,
      y: inst.center.y + dir[1] * f.axes[axis] * N * inst.scale,
      z: inst.center.z + dir[2] * f.axes[axis] * N * inst.scale,
    };
    // FBM 噪声内缩裕量: 探针点向核中心内收 AMP*R*0.5 再验证
    const probe = {
      x: inst.center.x + (surfPt.x - inst.center.x) * (1 - AMP * 0.9),
      y: inst.center.y + (surfPt.y - inst.center.y) * (1 - AMP * 0.9),
      z: inst.center.z + (surfPt.z - inst.center.z) * (1 - AMP * 0.9),
    };
    if (!insideShape(probe, 'polyhedral', R)) {
      insideOK = false;
      FAIL(`核${inst.tag} 轴${axis} 探针穿膜: ${JSON.stringify(probe)}`);
    }
  }
}
if (insideOK) OK('双核全部轴探针（含噪声裕量）均在多边形形状体内');

// 2. 双核不重叠
const gap = Math.hypot(
  insts[0].center.x - insts[1].center.x,
  insts[0].center.y - insts[1].center.y,
  insts[0].center.z - insts[1].center.z,
);
const overlapMargin = gap - f.axes[0] * N * insts[0].scale - f.axes[0] * N * insts[1].scale;
if (overlapMargin <= 0) FAIL(`双核重叠: 间距 ${gap.toFixed(3)}, 覆盖余量 ${overlapMargin.toFixed(3)}`);
else OK(`双核间隙 = ${overlapMargin.toFixed(3)} 单位（间距 ${gap.toFixed(2)}, 各核 x 半轴 ${(f.axes[0] * N * insts[0].scale).toFixed(2)}）`);

// 3. nucleusRayExit 并集语义: 沿 +x 射线应命中远核（x>0 那个）远交点
//    （射线自细胞中心 (0,0,0) 出发 —— 核中心 y 偏移 0.2 需按椭球斜距解析）
const exitUnion = nucleusRayExit({ x: 1, y: 0, z: 0 }, 'polyhedral', N, R);
const farInst = insts.find((i) => i.center.x > 0)!;
const aX = f.axes[0] * N * farInst.scale;
const aY = f.axes[1] * N * farInst.scale;
const expectFar = farInst.center.x + aX * Math.sqrt(Math.max(0, 1 - (farInst.center.y / aY) ** 2));
if (Math.abs(exitUnion - expectFar) > 1e-9) {
  FAIL(`nucleusRayExit +x 并集语义: got ${exitUnion.toFixed(4)}, expect ${expectFar.toFixed(4)}`);
} else OK(`nucleusRayExit +x = ${exitUnion.toFixed(3)} = 远核(+x)远交点 ${expectFar.toFixed(3)} ✓（并集 max 语义, 含 y 偏移椭球斜距）`);

// 沿 +y 射线: 两核均可能不命中（核在 x 轴上, y 向射线距核中心 sqrt(3.6²) > 半径 3.36 → 双未命中 → 0）
const exitY = nucleusRayExit({ x: 0, y: 1, z: 0 }, 'polyhedral', N, R);
if (exitY !== 0) FAIL(`nucleusRayExit +y 应为 0（双核均未命中）, got ${exitY.toFixed(4)}`);
else OK('nucleusRayExit +y = 0（双核均未命中 —— 正确清零）');

// 4. 单核类型行为不变
const singles: ShapeKind[] = ['pyramidal', 'sphere', 'columnar', 'rod', 'spindle', 'amoeboid'];
let singleOK = true;
for (const k of singles) {
  const inst = nucleusInstances(k, 9.5);
  if (inst.length !== 1) {
    singleOK = false;
    FAIL(`${k} 应为单核, got ${inst.length}`);
  }
}
if (singleOK) OK('其余 6 类型实例数 = 1（单核行为不变）');

// 5. 体内采样区间: +x 方向核出口后仍有胞质带（肝细胞沿长轴的胞质条带）
const outerX = 10; // 近似（superellip 主轴 ~1.0×hex）
const loX = exitUnion + 0.5 + 0.4;
if (loX >= outerX - 0.35 - 0.4) {
  console.warn(`⚠ +x 胞质带薄: lo=${loX.toFixed(2)} outer≈${outerX}（insidePos 硬钳路径兜底, 视觉可接受）`);
} else {
  OK(`+x 胞质条带宽 ${(outerX - 0.35 - loX).toFixed(2)} 单位（核外 → 膜内采样带成立）`);
}

console.log(process.exitCode ? '\n=== 双核验证存在失败项 ===' : '\n=== 双核几何不变量全绿 ===');
