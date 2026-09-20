/**
 * 数值验证 v18c+v58: 分裂演示染色体不变量
 *   1. 每帧每染色体: 单体世界位（= local 偏移 × 组缩放, 含臂展球）恒在质膜回转面内
 *   2. 动粒微管端点（世界分离量 cZW）与单体世界位重合
 *   3. [v58] 两两互斥分离不变量: 染色体中心距 ≥ K(t)·(armR_i+armR_j)+GAP（用户
 *      「染色质之间也要避免穿模, 彼此分离一定距离」—— 与 mitosis.tsx chrSolve 同源求解器）
 *   4. [v58] 核被膜存活期: 染色体中心恒在核球域内（凝聚前期不出核）
 *   5. 对照: 旧行为（local cZ 未除组缩放 → 世界分离 ~1.85×）在后期即穿膜（根因复证）
 * 运行: bunx tsx scripts/verify-mitosis-containment.ts
 */
import { hash01 } from '../src/components/cell3d/procedural';

const FAIL = (msg: string) => { console.error('✗ ' + msg); process.exitCode = 1; };
const OK = (msg: string) => console.log('✓ ' + msg);

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const ramp = (t: number, a: number, b: number) => smooth(clamp01((t - a) / (b - a)));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
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
  // v58b 与 chromatidGeo 新臂长族镜像同步
  const armLocal = Math.max(0.27 + hash01(`pchr${ci}`) * 0.19 + 0.13, 0.53 + hash01(`qchr${ci}`) * 0.42 + 0.13) + 0.15;
  return { plate, home, spin, delay, armLocal, ci };
});

/* ---------- v58 同源求解器（mitosis.tsx chrSolve 的脚本镜像 —— 口径同步） ---------- */
const CHR_GAP = 0.26;
const SEP_ITERS = 26;
const solve = (t: number) => {
  const condense = ramp(t, 0.42, 1.45);
  const decondense = ramp(t, 4.3, 5.5);
  const congress = ramp(t, 1.4, 2.75);
  const segregate = ramp(t, 3.05, 3.85);
  const clusterTight = ramp(t, 4.0, 4.6);
  const PZA = poleZ(t);
  const { L: memL, r: rProfile } = membrane(t);
  const neAlive = clamp01(1 - ramp(t, 1.1, 1.85));
  let kk = lerp(0.55, 0.92, ramp(t, 0.5, 2.4));
  kk = lerp(kk, 0.78, ramp(t, 3.0, 4.0));
  kk = lerp(kk, 0.45, ramp(t, 4.6, 5.4));
  const X = new Float64Array(CHR_N), Y = new Float64Array(CHR_N), Z = new Float64Array(CHR_N);
  const SCL = new Float64Array(CHR_N), ARMR = new Float64Array(CHR_N), CZW = new Float64Array(CHR_N), STAG = new Float64Array(CHR_N);
  for (let i = 0; i < CHR_N; i++) {
    const chr = chrs[i];
    const scl = (0.98 + hash01(`cs${i}`) * 0.26) * (0.55 + condense * 0.45) * (1 + decondense * 0.12);
    const armR = chr.armLocal * scl + 0.16;
    const k = clamp01(congress + chr.delay * 0.12);
    const tightXY = Math.max(0.1, 1 - clusterTight * 0.42 - segregate * 0.34 - decondense * 0.45);
    const yFac = 1 - clusterTight * 0.3 - segregate * 0.18;
    const flatZ = 1 - ramp(t, 1.4, 2.6) * 0.92;
    const sepA = clamp01(segregate - chr.delay * 0.3);
    const stagW = (0.14 + sepA * 0.09) * scl;
    const zCapW = Math.max(0.6, memL * 0.9 - armR);
    const cZW = Math.min(0.08 + sepA * PZA * 0.92, zCapW);
    const gx0 = chr.home.x + (chr.plate.x - chr.home.x) * k;
    const gy0 = chr.home.y + (chr.plate.y - chr.home.y) * k;
    const gz0 = (chr.home.z + (chr.plate.z - chr.home.z) * k) * flatZ;
    const xyLim = Math.max(0.55, rProfile(((gz0 + cZW) / memL + 1) / 2) * 0.96 - armR - stagW);
    SCL[i] = scl; ARMR[i] = armR; CZW[i] = cZW; STAG[i] = stagW;
    X[i] = clamp(gx0 * tightXY, -xyLim, xyLim);
    Y[i] = clamp(gy0 * yFac, -xyLim, xyLim);
    Z[i] = gz0;
  }
  for (let it = 0; it < SEP_ITERS; it++) {
    for (let i = 0; i < CHR_N; i++) {
      for (let j = i + 1; j < CHR_N; j++) {
        const need = kk * (ARMR[i] + ARMR[j]) + CHR_GAP;
        let dx = X[j] - X[i], dy = Y[j] - Y[i], dz = Z[j] - Z[i];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= need * need) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) {
          const ang = hash01(`chsep${i}_${j}`) * Math.PI * 2;
          dx = Math.cos(ang); dy = Math.sin(ang); dz = 0.35;
          d = Math.hypot(dx, dy, dz);
        }
        const push = ((need - d) / 2) * 0.85;
        const ux = dx / d, uy = dy / d, uz = dz / d;
        X[i] -= ux * push; Y[i] -= uy * push; Z[i] -= uz * push;
        X[j] += ux * push; Y[j] += uy * push; Z[j] += uz * push;
      }
    }
    if ((it & 3) === 3 || it === SEP_ITERS - 1) {
      for (let i = 0; i < CHR_N; i++) {
        const armR = ARMR[i];
        const zCap = Math.max(0.6, memL * 0.9 - CZW[i] - armR);
        Z[i] = clamp(Z[i], -zCap, zCap);
        const lim = Math.max(0.55, rProfile(((Z[i] + CZW[i]) / memL + 1) / 2) * 0.96 - armR - STAG[i]);
        X[i] = clamp(X[i], -lim, lim);
        Y[i] = clamp(Y[i], -lim, lim);
        if (neAlive > 0.01) {
          const rl = Math.hypot(X[i], Y[i], Z[i]);
          const nLim = NUC_R * 0.96;
          if (rl > nLim && rl > 1e-4) {
            const f = lerp(1, nLim / rl, neAlive);
            X[i] *= f; Y[i] *= f; Z[i] *= f;
          }
        }
      }
    }
  }
  return { X, Y, Z, SCL, ARMR, CZW, STAG, kk, neAlive };
};

/* [v58] 不变量 3+4: 两两净空 + 核球域（可见窗全时轴扫描） */
let worstSep = Infinity;
let worstSepAt = '';
let worstNuc = Infinity;
let worstNucAt = '';
let metaNN = Infinity; // 中期最邻近对距离（可读性指标）
for (let t = 0; t <= 6.0001; t += 0.02) {
  const chrOpacity = clamp01(ramp(t, 0.5, 1.25) * (1 - ramp(t, 4.4, 5.6) * 0.7));
  if (chrOpacity < 0.15) continue;
  const { X, Y, Z, ARMR, kk, neAlive } = solve(t);
  for (let i = 0; i < CHR_N; i++) {
    for (let j = i + 1; j < CHR_N; j++) {
      const need = kk * (ARMR[i] + ARMR[j]) + CHR_GAP;
      const d = Math.hypot(X[j] - X[i], Y[j] - Y[i], Z[j] - Z[i]);
      const m = d - need;
      if (m < worstSep) { worstSep = m; worstSepAt = `t=${t.toFixed(2)} ${i}-${j}`; }
      if (t >= 2.4 && t <= 3.0 && d < metaNN) metaNN = d;
    }
  }
  if (neAlive > 0.5) {
    for (let i = 0; i < CHR_N; i++) {
      const m = NUC_R * 0.96 - Math.hypot(X[i], Y[i], Z[i]);
      if (m < worstNuc) { worstNuc = m; worstNucAt = `t=${t.toFixed(2)} ci=${i}`; }
      if (m < 0) FAIL(`前期染色体出核: margin=${m.toFixed(2)} @t=${t.toFixed(2)} ci=${i}`);
    }
  }
}
if (worstSep < -0.08) FAIL(`染色体两两穿模: minClear=${worstSep.toFixed(3)} @ ${worstSepAt}`);
OK(`v58 两两互斥分离（最差净空 ${worstSep.toFixed(3)} @ ${worstSepAt} — 钳位竞争下 ≥-0.08 容差, 中期最邻近对 ${metaNN.toFixed(2)}）`);
OK(`v58 核被膜存活期中心恒在核内（最差余量 ${worstNuc.toFixed(3)} @ ${worstNucAt}）`);

/* 不变量 1+2: 单体世界位 + 臂展球恒在膜内（分离后位置重验 —— 旧 v18c 口径升级为求解器解） */
let worstArm = Infinity;
let worstZ = Infinity;
let worstAt = '';
for (let t = 0; t <= 6.0001; t += 0.02) {
  const chrOpacity = clamp01(ramp(t, 0.5, 1.25) * (1 - ramp(t, 4.4, 5.6) * 0.7));
  if (chrOpacity < 0.05) continue; // 不可见窗口不计
  const { L: memL, r: rProfile } = membrane(t);
  const { X, Y, Z, SCL, ARMR, CZW, STAG } = solve(t);
  for (let ci = 0; ci < CHR_N; ci++) {
    const sclEff = Math.max(0.001, SCL[ci] * clamp01(ramp(t, 0.05, 0.6)));
    const armR = ARMR[ci];
    const gx = X[ci], gy = Y[ci], gz = Z[ci];
    const stagW = STAG[ci];
    for (const side of [-1, 1]) {
      const cz = gz + side * CZW[ci]; // 单体世界 z（= local·scl 补偿后）
      const u = (cz / memL + 1) / 2;
      const rr = rProfile(u);
      const cxy = Math.hypot(gx, gy) + stagW;
      const m1 = rr - (cxy + armR);
      const m2 = memL - Math.abs(cz) - armR;
      if (m1 < worstArm) { worstArm = m1; worstAt = `xy@t=${t.toFixed(2)} ci=${ci}`; }
      if (m2 < worstZ) { worstZ = m2; worstAt = `z@t=${t.toFixed(2)} ci=${ci}`; }
      if (m1 < 0) FAIL(`单体+臂展穿膜(xy): margin=${m1.toFixed(2)} @t=${t.toFixed(2)} ci=${ci}`);
      if (m2 < 0) FAIL(`单体 z 穿极帽: margin=${m2.toFixed(2)} @t=${t.toFixed(2)} ci=${ci}`);
    }
  }
}
OK(`v18c 全相位单体世界位+臂展球恒在膜内（含分离后重验; xy 最差余量 ${worstArm.toFixed(2)} / z 最差余量 ${worstZ.toFixed(2)} @ ${worstAt}）`);

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
  for (const chr of chrs) {
    const scl = (0.98 + hash01(`cs${chr.ci}`) * 0.26) * (0.55 + condense * 0.45) * (1 + decondense * 0.12); // v58b 同步
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
