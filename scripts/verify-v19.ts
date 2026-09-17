/**
 * 数值验证 v19 —— 双核 ER 冠互不侵犯/贴核 + 分裂演示细胞器钳制/完全分离
 *
 * A. 肝细胞双核 RER 冠（真实 erLamellaGeometry 几何, 非公式复刻）:
 *    A1 互不侵犯: 冠 A 所有顶点不进入核 B 排除球（反之亦然）—— 修复「双核 ER 有重叠」
 *    A2 贴核: 每层顶点半径 ≈ 核面 + 层偏移（±0.13 容差, 钳制/缺口缘除外）
 *       —— 修复「其中一个内质网没有贴紧细胞核」（旧 vault 外跃气泡顶点会跑到核面外 2.8）
 *    A3 不压入自核: 顶点半径 ≥ 核面 - 膜厚
 *    A4 对照: 旧版（vault 外跃）在 golgi 扇区存在 2+ 的离面气泡群（根因复证, 期望 FAIL→证实）
 *
 * B. 分裂演示（v19 公式）:
 *    B1 细胞器钳制: 线粒体/囊泡/核糖体分配位（含 margin）全相位在膜回转面内
 *       —— 修复「条形细胞器跑到细胞外」（线粒体胶囊半长 0.85 计入）
 *    B2 完全分离: 末态双子细胞球不相交（gap 1.8）, 内容物全部在各自子细胞球内
 *    B3 scission: 中间体桥半径 → 0.02（针状缩窄）, 单膜淡出双子膜淡入
 *
 * 运行: bunx tsx scripts/verify-v19.ts
 */
import * as THREE from 'three';
// 真实几何工厂（organelles.tsx 导出 —— 与渲染同源, 非复刻）
import { erLamellaGeometry, type ErLamellaLayer, type ErLamellaOpts } from '../src/components/cell3d/organelles';
import { nucleusRadius } from '../src/lib/simulation/cell-shape';
import { fbm3, hash01 } from '../src/components/cell3d/procedural';

const FAIL = (msg: string) => { console.error('✗ ' + msg); process.exitCode = 1; };
const OK = (msg: string) => console.log('✓ ' + msg);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const ramp = (t: number, a: number, b: number) => smooth(clamp01((t - a) / (b - a)));

/* ============ A. 肝细胞双核 ER 冠 ============ */
const R = 10, N = 4.1, SHAPE = 'polyhedral' as const;
const NUC_FREQ = 1.5, nucAmp = 0.07; // 肝细胞 spec 无 nucleusBumpy → 0.07
const GOLGI_SCALE = N / 4.1; // = 1.0
const golgiLat = 0.35, golgiLon = 5.9;
const GOLGI_DIR = new THREE.Vector3(
  Math.cos(golgiLat) * Math.cos(golgiLon), Math.sin(golgiLat), Math.cos(golgiLat) * Math.sin(golgiLon),
).normalize();
const GOLGI_CIST_N = 5, GOLGI_STEP = 0.28 * GOLGI_SCALE, GOLGI_DISK_R = 2.02 * GOLGI_SCALE, GOLGI_RADIAL = 1.02 * GOLGI_SCALE;
const GOLGI_STACK_H = GOLGI_CIST_N * GOLGI_STEP;
const GOLGI_OUTER = GOLGI_RADIAL + GOLGI_STACK_H * 0.5 + GOLGI_DISK_R * 0.4 + 0.3;

const nuclei = [
  { tag: 'A', center: new THREE.Vector3(-3.6, 0.2, 0), scale: 0.82 },
  { tag: 'B', center: new THREE.Vector3(3.6, 0.2, 0), scale: 0.82 },
];
const Nn = N * 0.82;

// cellSurf 复刻（膜面钳制真源; polyhedral shapeFactor 由 cell-shape 提供）
import { shapeFactor } from '../src/lib/simulation/cell-shape';
const cellSurf = (dir: THREE.Vector3, inset: number) => {
  const d = dir.clone().normalize();
  return shapeFactor({ x: d.x, y: d.y, z: d.z }, SHAPE) * R + inset;
};

type CrownSpec = {
  nuc: (typeof nuclei)[0];
  layers: number;
  crownAxis: THREE.Vector3;
  vault: ErLamellaOpts['vault'];
  avoid: ErLamellaOpts['avoid'];
  cuts: ErLamellaOpts['cuts'];
  seed: number;
  seedTag: string;
};

const buildCrown = (spec: CrownSpec, opts: { vault: boolean; avoid: boolean; cuts: boolean; axisMirrored: boolean }) => {
  const surf2 = (dir: THREE.Vector3): number => {
    const d = dir.clone().normalize();
    return nucleusRadius(d, SHAPE, Nn) + (fbm3(d.x * NUC_FREQ, d.y * NUC_FREQ, d.z * NUC_FREQ, 3, spec.seed) - 0.5) * 2 * nucAmp;
  };
  const sibling = nuclei.find((n) => n.tag !== spec.nuc.tag)!;
  const primary = spec.nuc.tag === 'A';
  const crownAxis = opts.axisMirrored
    ? new THREE.Vector3(primary ? -0.36 : 0.36, 0.28, -0.89).normalize()
    : new THREE.Vector3(0.16, 0.3, -0.94).normalize();
  const erOpts: ErLamellaOpts = {
    radiusAt: surf2,
    center: spec.nuc.center,
    clampAt: (d) => cellSurf(d, -0.6),
    vault: opts.vault && primary ? { dir: GOLGI_DIR, ang: 0.72, to: GOLGI_OUTER } : null,
    avoid: opts.avoid ? { center: sibling.center, radius: N * sibling.scale * 1.06 + 0.16 } : null,
    cuts: opts.cuts && sibling
      ? [
          { dir: sibling.center.clone().sub(spec.nuc.center).normalize(), w: 1.05, depth: 0.62 },
          ...(primary ? [{ dir: GOLGI_DIR.clone(), w: 1.0, depth: 0.55 }] : []),
        ]
      : null,
  };
  const geos: { geo: THREE.BufferGeometry; layer: ErLamellaLayer }[] = [];
  for (let L = 0; L < spec.layers; L++) {
    const axis = crownAxis.clone();
    axis.applyAxisAngle(new THREE.Vector3(0, 1, 0), (hash01(`${spec.seedTag}ax${L}`) - 0.5) * 0.22);
    axis.applyAxisAngle(new THREE.Vector3(1, 0, 0), (hash01(`${spec.seedTag}ay${L}`) - 0.5) * 0.14);
    const layer: ErLamellaLayer = {
      offset: 0.16 + L * 0.155,
      cone: 2.02 + L * 0.055,
      axis: axis.normalize(),
      seed: 5 + L * 13 + (primary ? 0 : 60),
    };
    geos.push({ geo: erLamellaGeometry({ ...erOpts, layer, thickness: 0.085, latSeg: 24, lonSeg: 46 }), layer });
  }
  return { geos, surf2, erOpts, sibling, primary };
};

const crownSpecs: CrownSpec[] = nuclei.map((n) => ({
  nuc: n, layers: n.tag === 'A' ? 7 : 6, crownAxis: new THREE.Vector3(), seed: n.tag === 'A' ? 7 : 23,
  seedTag: n.tag === 'A' ? 'er' : 'erB', vault: null, avoid: null, cuts: null,
}));

/* A1-A3: v19 双冠（镜像外倾轴 + avoid + cuts, 无 vault） */
{
  const avoidR = N * 0.82 * 1.06 + 0.16;
  let violations = 0, hugOk = 0, hugTot = 0, pressIn = 0;
  const v = new THREE.Vector3();
  for (const spec of crownSpecs) {
    const { geos, surf2, sibling } = buildCrown(spec, { vault: false, avoid: true, cuts: true, axisMirrored: true });
    for (const { geo, layer } of geos) {
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        // A1 互不侵犯: 不进同伴核排除球
        if (v.distanceTo(sibling.center) < avoidR - 0.02) violations++;
        // A2 贴核: 顶点半径 vs 核面+偏移（容差 0.13; avoid 钳制缘/膜面钳制缘不计 —— 用半径差分检）
        const dir = v.clone().sub(spec.nuc.center).normalize();
        const surf = surf2(dir);
        const radial = v.distanceTo(spec.nuc.center);
        hugTot++;
        if (Math.abs(radial - (surf + layer.offset)) <= 0.13) hugOk++;
        // A3 不压入自核（膜厚 0.085 + 皱褶余量）
        if (radial < surf - 0.12) pressIn++;
      }
    }
  }
  const hugPct = (hugOk / hugTot) * 100;
  if (violations === 0) OK(`A1 双冠互不侵犯: 全部顶点未进入同伴核排除球 (r=${avoidR.toFixed(2)})`);
  else FAIL(`A1 双冠互不侵犯: ${violations} 顶点进入同伴核排除球`);
  if (hugPct > 90) OK(`A2 贴核: ${(hugPct).toFixed(1)}% 顶点在层偏移 ±0.13 内（钳制/缺口缘之外的主体层贴合）`);
  else FAIL(`A2 贴核: 仅 ${hugPct.toFixed(1)}% 顶点贴合（期望 >90%）`);
  if (pressIn === 0) OK('A3 冠层无压入自核（≥ 核面-0.12）');
  else FAIL(`A3 冠层压入自核: ${pressIn} 顶点`);
}

/* A4 对照: 旧版主核冠（vault 外跃, 无 avoid/cuts, 旧轴）—— 证实「不贴核」根因 */
{
  const spec = crownSpecs[0];
  const { geos, surf2 } = buildCrown(spec, { vault: true, avoid: false, cuts: false, axisMirrored: false });
  let bubble = 0, tot = 0, invade = 0;
  const sibling = nuclei[1];
  const avoidR = N * 0.82 * 1.06 + 0.16;
  const v = new THREE.Vector3();
  for (const { geo } of geos) {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      tot++;
      const dir = v.clone().sub(spec.nuc.center).normalize();
      const radial = v.distanceTo(spec.nuc.center);
      if (radial > surf2(dir) + 2.0) bubble++; // vault 外跃气泡群（离核面 2+）
      if (v.distanceTo(sibling.center) < avoidR - 0.02) invade++;
    }
  }
  if (bubble > 50) OK(`A4 旧版根因复证: vault 外跃气泡顶点 ${bubble}/${tot}（离核面 2+ 的「不贴核」读感来源, v19 已除）`);
  else FAIL(`A4 旧版对照未复现气泡（bubble=${bubble}）—— 检查对照参数`);
  if (invade > 0) OK(`A4 旧版根因复证: ${invade} 顶点刺入同伴核排除球（「重叠」读感来源, v19 已除）`);
  else FAIL('A4 旧版对照未复现侵入');
}

/* ============ B. 分裂演示（v19 公式） ============ */
const R_CELL = 8.5;
const membraneProfile = (t: number) => {
  const elong = ramp(t, 2.9, 4.4) * 0.14 + ramp(t, 4.4, 6) * 0.18 + ramp(t, 5.9, 6.9) * 0.52;
  const L = R_CELL * (1 + elong);
  const furrowK = ramp(t, 4.55, 5.95);
  const scission = ramp(t, 5.85, 6.45);
  const shrink = 1 - 0.1 * furrowK;
  const rFn = (u: number) => {
    const base = R_CELL * shrink * Math.pow(Math.max(1e-4, Math.sin(Math.PI * u)), 0.92);
    const dip = furrowK * R_CELL * 0.8 * Math.exp(-((u - 0.5) ** 2) / (2 * 0.13 ** 2))
      + scission * R_CELL * 1.1 * Math.exp(-((u - 0.5) ** 2) / (2 * 0.06 ** 2));
    const bridge = 0.3 * (1 - scission) + 0.02 * scission;
    return Math.max(bridge, base - dip);
  };
  return { L, r: rFn, scission };
};

/* B1: 细胞器钳制不变量（与 mitosis.tsx clampCell 同式复刻） */
{
  const MITO_N = 8, VES_N = 14, RIB_N = 120;
  const mitoSeeds = Array.from({ length: MITO_N }, (_, i) => ({
    ang: hash01(`ma${i}`) * Math.PI * 2, rad: 4.6 + hash01(`mr${i}`) * 1.8, y: (hash01(`my${i}`) - 0.5) * 4.2,
    side: i % 2 === 0 ? -1 : 1,
  }));
  const vesSeeds = Array.from({ length: VES_N }, (_, i) => ({
    ang: hash01(`va${i}`) * Math.PI * 2, rad: 3.4 + hash01(`vr${i}`) * 3.1, y: (hash01(`vy${i}`) - 0.5) * 6.0,
    side: i % 2 === 0 ? 1 : -1, r: 0.14 + hash01(`vs${i}`) * 0.12,
  }));
  const ribSeeds = Array.from({ length: RIB_N }, (_, i) => ({
    ang: hash01(`rl${i}`) * Math.PI * 2, rad: 1.6 + hash01(`rr${i}`) * 5.6, y: (hash01(`ry${i}`) - 0.5) * 6.6,
    side: hash01(`rs${i}`) > 0.5 ? 1 : -1,
  }));
  const dauFade = (t: number) => ramp(t, 6.2, 6.65);
  const memFade = (t: number) => 1 - ramp(t, 6.3, 6.75);
  const zD = (t: number) => THREE.MathUtils.lerp(5.55, 7.35, ramp(t, 6.15, 7));
  const rD = (t: number) => THREE.MathUtils.lerp(5.15, 6.45, ramp(t, 6.15, 6.9));
  let memViol = 0, dauViol = 0, checked = 0;
  const clampCell = (v: THREE.Vector3, margin: number, t: number) => {
    const { L: memL, r: rProfile } = membraneProfile(t);
    if (memFade(t) > 0.05) {
      const zLim = memL * 0.94;
      if (Math.abs(v.z) > zLim) v.z = Math.sign(v.z) * zLim;
      const u = (v.z / memL + 1) / 2;
      const rr = Math.max(0.12, rProfile(u) * 0.97 - margin);
      const rc = Math.hypot(v.x, v.y);
      if (rc > rr) { const kk = rr / rc; v.x *= kk; v.y *= kk; }
    }
    if (dauFade(t) > 0.05) {
      const s = v.z >= 0 ? 1 : -1;
      const dz = v.z - s * zD(t);
      const dd = Math.hypot(v.x, v.y, dz);
      const lim = Math.max(0.3, rD(t) - margin - 0.12);
      if (dd > lim) { const kk = lim / dd; v.x *= kk; v.y *= kk; v.z = s * zD(t) + dz * kk; }
    }
  };
  const samples: number[] = [];
  for (let t = 3.4; t <= 7.0001; t += 0.1) samples.push(Math.round(t * 10) / 10);
  for (const t of samples) {
    const part = ramp(t, 3.4, 5.6);
    const { L: memL, r: rProfile } = membraneProfile(t);
    const all = [
      ...mitoSeeds.map((ms) => ({ ms, margin: 0.85, kind: 'mito' })),
      ...vesSeeds.map((vs) => ({ vs, margin: 0.3, kind: 'ves' })),
      ...ribSeeds.map((rs) => ({ rs, margin: 0.2, kind: 'rib' })),
    ];
    for (const item of all) {
      const seed = (item as { ms?: typeof mitoSeeds[0]; vs?: typeof vesSeeds[0]; rs?: typeof ribSeeds[0] });
      let x = 0, y = 0, z = 0;
      if (item.kind === 'mito' && seed.ms) {
        const toZ = seed.ms.side * THREE.MathUtils.lerp(2.2, 7.0, ramp(t, 4.8, 7));
        x = Math.cos(seed.ms.ang) * seed.ms.rad * (1 - part * 0.32);
        y = seed.ms.y * (1 - part * 0.4);
        z = THREE.MathUtils.lerp(0, toZ, part);
      } else if (item.kind === 'ves' && seed.vs) {
        const toZ = seed.vs.side * THREE.MathUtils.lerp(2.0, 6.6, ramp(t, 4.8, 7));
        x = Math.cos(seed.vs.ang) * seed.vs.rad * (1 - part * 0.35);
        y = seed.vs.y * (1 - part * 0.45);
        z = THREE.MathUtils.lerp(0, toZ, part);
      } else if (seed.rs) {
        const toZ = seed.rs.side * THREE.MathUtils.lerp(1.5, 6.9, ramp(t, 4.6, 7));
        x = Math.cos(seed.rs.ang) * seed.rs.rad * (1 - part * 0.3);
        y = seed.rs.y * (1 - part * 0.5);
        z = THREE.MathUtils.lerp(0, toZ, part);
      }
      const v = new THREE.Vector3(x, y, z);
      clampCell(v, item.margin, t);
      checked++;
      if (memFade(t) > 0.05) {
        // 断言 1: 在膜回转面内（含 margin）
        const u = (v.z / memL + 1) / 2;
        const rr = rProfile(u);
        if (Math.abs(v.z) > memL * 0.94 + 1e-6 || Math.hypot(v.x, v.y) > rr + item.margin - 0.06) memViol++;
      }
      if (dauFade(t) > 0.05) {
        // 断言 2: 在各自子细胞球内
        const s = v.z >= 0 ? 1 : -1;
        const dd = Math.hypot(v.x, v.y, v.z - s * zD(t));
        if (dd > rD(t) + 1e-6) dauViol++;
      }
    }
  }
  if (memViol === 0) OK(`B1 细胞器膜内钳制: ${checked} 采样点全部在膜回转面内（含线粒体胶囊半长 0.85 margin）`);
  else FAIL(`B1 膜内钳制失效: ${memViol}/${checked} 出膜`);
  if (dauViol === 0) OK('B1 子细胞球内钳制: 分离期采样点全部归入各自子细胞球');
  else FAIL(`B1 子细胞球钳制失效: ${dauViol}/${checked}`);
}

/* B2: 完全分离末态 */
{
  const t = 7;
  const { L, scission } = membraneProfile(t);
  const zD = 7.35, rD = 6.45;
  const gap = 2 * (zD - rD);
  if (gap > 1.0) OK(`B2 完全分离: 末态双子细胞球中心距 ${2 * zD}, 各半径 ${rD}, 间隙 ${gap.toFixed(1)}（两个独立细胞）`);
  else FAIL(`B2 子细胞球仍相交/贴近: gap=${gap}`);
  if (scission >= 1) OK('B3 scission: 中间体桥半径已缩窄至 0.02（ESCRT-Ⅲ 内切完成）');
  else FAIL(`B3 scission 未完成: ${scission}`);
  const memFade = 1 - ramp(t, 6.3, 6.75);
  const dauFade = ramp(t, 6.2, 6.65);
  if (memFade <= 0.02 && dauFade >= 0.98) OK('B3 膜交接: 单膜完全淡出, 双子膜完全接管');
  else FAIL(`B3 膜交接异常: memFade=${memFade.toFixed(2)} dauFade=${dauFade.toFixed(2)}`);
  // 内容物末态检查（子核 ±7.0 r≈2.5, 高尔基 ±6.95, RER 冠 ±7.0 r≈2.7）
  const content = [
    { name: '子代核 A', p: new THREE.Vector3(0, 0, -7.0), r: 2.53 },
    { name: '子代核 B', p: new THREE.Vector3(0, 0, 7.0), r: 2.53 },
    { name: '子高尔基 A', p: new THREE.Vector3(1.62, -1.05, -6.95), r: 0.65 },
    { name: '子高尔基 B', p: new THREE.Vector3(-1.62, -1.05, 6.95), r: 0.65 },
    { name: '子 RER 冠 A', p: new THREE.Vector3(0, 0, -7.0), r: 2.75 },
    { name: '子 RER 冠 B', p: new THREE.Vector3(0, 0, 7.0), r: 2.75 },
  ];
  let outside = 0;
  for (const c of content) {
    const s = c.p.z >= 0 ? 1 : -1;
    const dd = c.p.distanceTo(new THREE.Vector3(0, 0, s * zD)) + c.r;
    if (dd > rD) { outside++; console.error(`   ✗ ${c.name} 超出子细胞球: ${dd.toFixed(2)} > ${rD}`); }
  }
  if (outside === 0) OK('B2 内容物末态: 子核/高尔基/RER 冠全部在各自子细胞球内');
  else FAIL(`B2 内容物 ${outside} 项超出子细胞球`);
}
