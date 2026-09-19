/**
 * 数值验证 v18c: 分裂演示染色体收纳不变量（组缩放放大补偿修复后）
 *   1. 每帧每染色体: 单体世界位（= local 偏移 × 组缩放, 含臂展球）恒在质膜回转面内
 *   2. 动粒微管端点（世界分离量 cZW）与单体世界位重合
 *   3. 对照: 旧行为（local cZ 未除组缩放 → 世界分离 ~1.85×）在后期即穿膜（根因复证）
 * 运行: bunx tsx scripts/verify-mitosis-containment.ts
 */
import { hash01 } from '../src/components/cell3d/procedural';

const FAIL = (msg: string) => { console.error('✗ ' + msg); process.exitCode = 1; };
const OK = (msg: string) => console.log('✓ ' + msg);

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const ramp = (t: number, a: number, b: number) => smooth(clamp01((t - a) / (b - a)));
const R_CELL = 8.5;
const NUC_R = 3.4;
const POLE_Z0 = 5.4;
const CHR_N = 10;

const poleZ = (t: number) => POLE_Z0 * (1 + ramp(t, 3, 4.6) * 0.1 + ramp(t, 4.6, 6) * 0.16);
const membrane = (t: number) => {
  // v56b 双球并集连续缢缩（与 mitosis.tsx membraneProfile 同源公式 —— 校验口径同步）
  const elongK = ramp(t, 2.9, 4.4);
  const constrict = ramp(t, 4.55, 6.05);
  const scission = ramp(t, 5.9, 6.45);
  const zc = R_CELL * (0.16 * elongK + 0.58 * constrict);
  const rho = R_CELL * (1 - 0.26 * constrict);
  const bridge = 0.3 * (1 - scission) + 0.02 * scission;
  const L = zc + rho + 0.02;
  const rFn = (u: number) => {
    const s = 2 * u - 1;
    const z = s * L;
    const near = z >= 0 ? z - zc : z + zc;
    const far = z >= 0 ? z + zc : z - zc;
    const rNear = Math.sqrt(Math.max(0, rho * rho - near * near));
    const rFar = Math.sqrt(Math.max(0, rho * rho - far * far));
    return Math.max(bridge, rNear, rFar);
  };
  return { L, r: rFn };
};

const chrs = Array.from({ length: CHR_N }, (_, ci) => {
  const ang = (ci / CHR_N) * Math.PI * 2 + hash01(`ca${ci}`) * 0.5;
  const rad = 1.3 + hash01(`cr${ci}`) * 1.9;
  const plate = { x: Math.cos(ang) * rad, y: (hash01(`cy${ci}`) - 0.5) * 3.4, z: (hash01(`cz${ci}`) - 0.5) * 0.4 };
  const hl = (hash01(`hl${ci}`) - 0.5) * 1.7;
  const hn = hash01(`hn${ci}`) * Math.PI * 2;
  const hr = NUC_R * (0.35 + hash01(`hr${ci}`) * 0.45);
  const home = { x: Math.cos(hl) * Math.cos(hn) * hr, y: Math.sin(hl) * hr, z: Math.cos(hl) * Math.sin(hn) * hr };
  const spin = hash01(`sp${ci}`) * Math.PI * 2;
  const delay = hash01(`dl${ci}`) * 0.18;
  const armLocal = Math.max(0.3 + hash01(`pchr${ci}`) * 0.22 + 0.14, 0.6 + hash01(`qchr${ci}`) * 0.5 + 0.14) + 0.15;
  return { plate, home, spin, delay, armLocal, ci };
});

/* 新逻辑（v18c: 世界空间分离量 + 组缩放补偿 + 臂展感知钳） */
let worstArm = Infinity;
let worstZ = Infinity;
let worstAt = '';
for (let t = 0; t <= 6.0001; t += 0.02) {
  const PZ = poleZ(t);
  const { L: memL, r: rProfile } = membrane(t);
  const condense = ramp(t, 0.42, 1.45);
  const decondense = ramp(t, 4.3, 5.5);
  const congress = ramp(t, 1.4, 2.75);
  const segregate = ramp(t, 3.05, 3.85);
  const clusterTight = ramp(t, 4.0, 4.6);
  const chrOpacity = clamp01(ramp(t, 0.5, 1.25) * (1 - ramp(t, 4.4, 5.6) * 0.7));
  for (const chr of chrs) {
    if (chrOpacity < 0.05) continue; // 不可见窗口不计
    const scl = (1.62 + hash01(`cs${chr.ci}`) * 0.42) * (0.55 + condense * 0.45) * (1 + decondense * 0.12);
    const sclEff = Math.max(0.001, scl * clamp01(ramp(t, 0.05, 0.6)));
    const armR = chr.armLocal * sclEff + 0.16;
    const k = clamp01(congress + chr.delay * 0.12);
    const vAx = chr.home.x + (chr.plate.x - chr.home.x) * k;
    const vAy = chr.home.y + (chr.plate.y - chr.home.y) * k;
    const vAz = chr.home.z + (chr.plate.z - chr.home.z) * k;
    const tightXY = Math.max(0.1, 1 - clusterTight * 0.42 - segregate * 0.34 - decondense * 0.45);
    const yFac = 1 - clusterTight * 0.3 - segregate * 0.18;
    const flatZ = 1 - ramp(t, 1.4, 2.6) * 0.92;
    const gz = vAz * flatZ;
    const sepA = clamp01(segregate - chr.delay * 0.3);
    const reach = PZ * 0.92;
    const stagW = (0.105 + sepA * 0.1) * sclEff;
    const zCapW = Math.max(0.6, memL * 0.9 - armR);
    const cZW = Math.min(0.08 + sepA * reach, zCapW);
    const xyLim = Math.max(0.55, rProfile(((gz + cZW) / memL + 1) / 2) * 0.96 - armR - stagW);
    const gx = Math.min(xyLim, Math.max(-xyLim, vAx * tightXY));
    const gy = Math.min(xyLim, Math.max(-xyLim, vAy * yFac));
    for (const side of [-1, 1]) {
      const cz = gz + side * cZW; // 单体世界 z（= local·scl 补偿后）
      const u = (cz / memL + 1) / 2;
      const rr = rProfile(u);
      const cxy = Math.hypot(gx, gy) + stagW;
      const m1 = rr - (cxy + armR);
      const m2 = memL - Math.abs(cz) - armR;
      if (m1 < worstArm) { worstArm = m1; worstAt = `xy@t=${t.toFixed(2)} ci=${chr.ci}`; }
      if (m2 < worstZ) { worstZ = m2; worstAt = `z@t=${t.toFixed(2)} ci=${chr.ci}`; }
      if (m1 < 0) FAIL(`单体+臂展穿膜(xy): margin=${m1.toFixed(2)} @t=${t.toFixed(2)} ci=${chr.ci}`);
      if (m2 < 0) FAIL(`单体 z 穿极帽: margin=${m2.toFixed(2)} @t=${t.toFixed(2)} ci=${chr.ci}`);
    }
  }
}
OK(`v18c 全相位单体世界位+臂展球恒在膜内（xy 最差余量 ${worstArm.toFixed(2)} / z 最差余量 ${worstZ.toFixed(2)} @ ${worstAt}）`);

/* 对照: 旧逻辑（v18b: local cZ 未补偿组缩放）—— 复现用户两轮反馈的穿膜 */
let oldWorst = Infinity;
let oldAt = '';
for (let t = 3.1; t <= 5.2; t += 0.02) {
  const PZ = poleZ(t);
  const { L: memL, r: rProfile } = membrane(t);
  const condense = 1;
  const decondense = ramp(t, 4.3, 5.5);
  const segregate = ramp(t, 3.05, 3.85);
  const clusterTight = ramp(t, 4.0, 4.6);
  const chrOpacity = 1;
  for (const chr of chrs) {
    if (chrOpacity < 0.05) continue;
    const scl = (1.62 + hash01(`cs${chr.ci}`) * 0.42) * (0.55 + condense * 0.45) * (1 + decondense * 0.12);
    const armR = chr.armLocal * scl + 0.16;
    const k = 1;
    const vAx = chr.plate.x, vAy = chr.plate.y, vAz = chr.plate.z;
    const tightXY = Math.max(0.1, 1 - clusterTight * 0.42 - segregate * 0.34 - decondense * 0.45);
    const flatZ = 0.08;
    const gz = vAz * flatZ;
    const sepA = clamp01(segregate - chr.delay * 0.3);
    const reach = PZ * 0.92;
    const cZ = 0.08 + sepA * reach; // 旧: 直接作 local 偏移
    const gx = vAx * tightXY, gy = vAy * (1 - clusterTight * 0.3 - segregate * 0.18);
    for (const side of [-1, 1]) {
      const cz = gz + side * cZ * scl; // ← 组缩放放大!
      const u = (cz / memL + 1) / 2;
      const rr = rProfile(u);
      const cxy = Math.hypot(gx, gy);
      const m1 = rr - (cxy + armR);
      const m2 = memL - Math.abs(cz) - armR;
      if (Math.min(m1, m2) < oldWorst) { oldWorst = Math.min(m1, m2); oldAt = `t=${t.toFixed(2)} ci=${chr.ci} margin=${Math.min(m1, m2).toFixed(2)}`; }
    }
  }
}
console.log(`· 旧逻辑对照（未补偿组缩放）: 后期最差余量 ${oldWorst.toFixed(2)} @ ${oldAt} ${oldWorst < 0 ? '← 穿膜（用户两轮反馈根因复证）' : ''}`);
