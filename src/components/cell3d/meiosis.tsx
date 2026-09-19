'use client';

/**
 * 减数分裂（Meiosis）3D 演示 v36 → v56b —— 复用有丝分裂演示的成熟范式（相位时钟 + 形态学
 * 回转面 + 三网纺锤体系 + 双保险钳制 + 几何同构瞬时交接）, 讲述减数分裂的独有叙事:
 *
 *   两次连续分裂 → 四个单倍体配子:
 *     MI（减数分裂 I）: 同源染色体配对（联会）→ 交叉（chiasmata）→ 四分体列队
 *                       → 同源分离（姐妹保持黏合 —— Rec8/shugoshin 保护）
 *     MII（减数分裂 II）: 短暂间期（无 DNA 复制!）→ 姐妹染色单体分离
 *                       → 双缢裂 → 4 个配子（n 单倍体）
 *
 * 与有丝分裂的关键视觉差异:
 *   - 5 对同源染色体 = 父本（暖调）/ 母本（冷调）双色编码 —— 独立分配的直接可读
 *   - 联会 + 交叉金点（同源互换的物理连接点, 后期 I 滑向端部脱落）
 *   - 两轮缢裂正交: MI 沿 z 轴（单膜哑铃）, MII 沿 y 轴（双子膜各自哑铃化）→ 四配子球
 *   - 末期 I 染色体保持凝聚（decondense 仅 35% —— 与有丝分裂的教科书级差异）
 *   - 间期 II 无 S 期（无复制叉 —— 与间期 I 的对比教学点）
 *
 * 相位时钟 t ∈ [0, 11]（12 相位, 每单位 7s × speed）
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { organelleMaterial, REF, createTimeUniform } from './materials';
import { mergeGeoms, hash01 } from './procedural';
import { organicNormalMap, stripeNormalMap } from './textures';
import { golgiCisternaGeometry } from './organelles';
import { OrganelleHoverLayer, type HoverTarget } from './hover-labels';

/* ============ 相位定义（双语 + 关键分子事件） ============ */

export interface MeiosisPhaseInfo {
  key: string;
  zh: string;
  en: string;
  latin: string;
  descZh: string;
  descEn: string;
}

export const MEIOSIS_PHASES: MeiosisPhaseInfo[] = [
  {
    key: 'interphase', zh: '间期', en: 'Interphase', latin: 'Interphase',
    descZh: 'S 期 DNA 复制: 每条染色质加倍为两条姐妹纤维; 同源染色体（父本暖/母本冷）仍独立松散',
    descEn: 'S-phase replication doubles each fiber; homologs (warm/cold) stay separate',
  },
  {
    key: 'prophase1', zh: '前期 Ⅰ · 联会', en: 'Prophase Ⅰ', latin: 'Prophase I',
    descZh: '凝聚 + 联会（synapsis）: 同源染色体并肩配对成二价体, 联会复合体对齐, 交叉（chiasmata）完成互换',
    descEn: 'Condensation + synapsis: homologs pair into bivalents; chiasmata complete crossing-over',
  },
  {
    key: 'prometaphase1', zh: '前中期 Ⅰ', en: 'Prometaphase Ⅰ', latin: 'Prometaphase I',
    descZh: '核被膜崩解; 四分体（含交叉的同源对）被动态微管捕获, 向赤道板汇集',
    descEn: 'Envelope breaks down; bivalents captured and congress toward the plate',
  },
  {
    key: 'metaphase1', zh: '中期 Ⅰ · 四分体', en: 'Metaphase Ⅰ', latin: 'Metaphase I',
    descZh: '四分体列队赤道板 —— 马勒定向: 每条同源的两个姐妹动粒连向同一极（与有丝分裂的本质差异）',
    descEn: 'Bivalents align — bi-orientation: both sister kinetochores of each homolog attach to the SAME pole',
  },
  {
    key: 'anaphase1', zh: '后期 Ⅰ · 同源分离', en: 'Anaphase Ⅰ', latin: 'Anaphase I',
    descZh: '同源染色体分离走向两极, 姐妹单体仍黏合（shugoshin 保护着丝粒 Rec8）—— 交叉滑向端部脱落',
    descEn: 'Homologs segregate while sisters stay glued (shugoshin-protected Rec8); chiasmata slide off',
  },
  {
    key: 'telophase1', zh: '末期 Ⅰ', en: 'Telophase Ⅰ', latin: 'Telophase I',
    descZh: '两子核重组 —— 染色体保持浓缩 X 形（减数分裂特征: 不完全去凝聚）',
    descEn: 'Two nuclei re-form — chromosomes stay condensed (meiotic trait)',
  },
  {
    key: 'cytokinesis1', zh: '胞质分裂 Ⅰ', en: 'Cytokinesis Ⅰ', latin: 'Cytokinesis I',
    descZh: '收缩环沿 z 轴缢裂 → 两个次级细胞（每个 n 条染色体 · 2C DNA）',
    descEn: 'Furrow cleaves along z — two secondary cells (n chromosomes, 2C DNA)',
  },
  {
    key: 'interkinesis', zh: '间期 Ⅱ · 无复制', en: 'Interkinesis', latin: 'Interkinesis',
    descZh: '短暂的间期 —— 无 DNA 复制（无 S 期!）: 直接进入第二次分裂准备',
    descEn: 'A brief pause — NO DNA replication (no S phase): straight into division II',
  },
  {
    key: 'metaphase2', zh: '中期 Ⅱ', en: 'Metaphase Ⅱ', latin: 'Metaphase II',
    descZh: '两个次级细胞各自重组纺锤体（沿 y 轴）, 单倍体染色体列队各自赤道板',
    descEn: 'Each secondary cell rebuilds a spindle (along y); haploid chromosomes align',
  },
  {
    key: 'anaphase2', zh: '后期 Ⅱ · 姐妹分离', en: 'Anaphase Ⅱ', latin: 'Anaphase II',
    descZh: 'separase 切割着丝粒 Rec8 → 姐妹染色单体终于分离（此刻才等效有丝分裂后期）',
    descEn: 'Separase finally cleaves centromeric Rec8 — sister chromatids segregate',
  },
  {
    key: 'cytokinesis2', zh: '末期 Ⅱ · 双缢裂', en: 'Cytokinesis Ⅱ', latin: 'Cytokinesis II',
    descZh: '两细胞同步缢裂（沿 y 轴）→ 四个子核重组, 各配子获一套完整细胞器',
    descEn: 'Simultaneous second cleavage (along y) — four nuclei re-form with organelles',
  },
  {
    key: 'gametes', zh: '配子 ×4', en: 'Gametes', latin: 'Gametes',
    descZh: '四个单倍体配子（n 演示值 5）拉开距离 —— 每个含父本/母本的独立随机组合（独立分配定律）',
    descEn: 'Four haploid gametes part — each an independent paternal/maternal mix',
  },
];

/** 每单位相位时钟时长（秒, × speed; 总周期 = 12 相位 11 单位 × 7s = 77s） */
export const MEIOSIS_PHASE_SECONDS = 7;

const PHASE_BOUNDS = [0, 0.5, 1.4, 2.3, 3.2, 4.1, 4.85, 5.65, 6.4, 7.5, 8.5, 9.5, 11];
const phaseOf = (t: number): number => {
  for (let i = PHASE_BOUNDS.length - 1; i >= 1; i--) {
    if (t >= PHASE_BOUNDS[i]) return Math.min(MEIOSIS_PHASES.length - 1, i);
  }
  return 0;
};

/* ============ 形态学参数 ============ */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const ramp = (t: number, a: number, b: number) => smooth(clamp01((t - a) / (b - a)));

const R_CELL = 8.5;
const NUC_R = 3.4;
const POLE_Z0 = 5.4; // MI 纺锤体半长
const PZ2 = 2.9; // MII 每子细胞纺锤体半长

/* ============ 场景构建 ============ */

interface ChromatidSet {
  group: THREE.Group;
  cA: THREE.Group;
  cB: THREE.Group;
  armLocal: number;
  /** 间期核内散布位 */
  home: THREE.Vector3;
  /** 联会位（并肩偏移后） */
  synPos: THREE.Vector3;
  /** MII 列队环带位（相对子细胞中心） */
  ring2: THREE.Vector3;
  spin: number;
  delay: number;
  kinA: THREE.Mesh;
  kinB: THREE.Mesh;
  /** 分离极向（-1 = -z/-y 极; 1 = +z/+y 极 —— 由同源对侧性决定） */
  side: -1 | 1;
  /** MII 归属子细胞（-z / +z）—— 同源分离自然决定 */
  cell: -1 | 1;
}

interface MeiosisBuild {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
  targets: (phase: number) => HoverTarget[];
  dispose: () => void;
}

function buildMeiosisScene(perf: boolean): MeiosisBuild {
  const group = new THREE.Group();
  // 舞台偏航（同有丝分裂演示: 3/4 教科书视角）
  const ROT_Y = -0.55;
  group.rotation.y = ROT_Y;
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T): T => {
    disposables.push(o);
    return o;
  };
  const uTime = createTimeUniform();
  const dim = 1;
  const mat = (opts: Parameters<typeof organelleMaterial>[0]) => track(organelleMaterial({ uTime, dim, ...opts }));

  const orgNormal = organicNormalMap({ freq: 5, strength: 2.4, seed: 47, repeat: 3 });
  const mtStripe = stripeNormalMap({ size: 64, stripes: 13, width: 0.3, strength: 2.2, dir: 'y', repeat: 1 });
  const memNormal = organicNormalMap({ freq: 6, strength: 2.0, seed: 11, repeat: 3 });

  /* ---------- 膜层 1: MI 单膜（z 轴形态学: 球 → 哑铃 → 缢裂） ---------- */
  const memGeo = track(new THREE.SphereGeometry(1, perf ? 36 : 56, perf ? 24 : 36));
  const memParams = {
    color: '#4e5a55',
    transmission: 0,
    thickness: 0.55,
    roughness: 0.07,
    normalMap: memNormal,
    normalScale: 0.3,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
    iridescence: 0.25,
    sheen: 0.4,
    sheenColor: REF.sheen,
    emissive: '#2a3438',
    emissiveIntensity: 0.1,
    flow: { color: '#5a7a84', strength: 0.14, scale: 0.8, speed: 0.06, rim: 0.2 },
  } as const;
  const memMat = mat({ ...memParams, opacity: perf ? 0.5 : 0.42 });
  const membrane = new THREE.Mesh(memGeo, memMat);
  membrane.renderOrder = 50;
  group.add(membrane);
  const memPos = memGeo.attributes.position as THREE.BufferAttribute;
  const memDir = new Float32Array(memPos.count * 3);
  for (let i = 0; i < memPos.count; i++) {
    const v = new THREE.Vector3(memPos.getX(i), memPos.getY(i), memPos.getZ(i)).normalize();
    memDir[i * 3] = v.x; memDir[i * 3 + 1] = v.y; memDir[i * 3 + 2] = v.z;
  }
  /** MI 单膜回转面（z 轴; 缢裂时窗压缩至 [2.7, 5.75]）
   *  v56b 双球并集连续缢缩（与 mitosis.tsx v56b 同范式 —— 用户「膜消失又出现」根治）:
   *  球 → 轻花生腰（后期 I 拉长）→ 双球并集哑铃（颈 = √(ρ²−zc²) 解析收敛）→ 针状桥;
   *  T_CUT1=5.75 两叶恰相切时与双子膜几何同构瞬时交换（无渐变窗, 像素级无缝） */
  const membraneProfile = (t: number): { L: number; r: (u: number) => number } => {
    const elongK = ramp(t, 2.7, 5.0); // 后期 I 拉长（两极外移 → 叶心小幅外移 0 → 0.28R）
    const constrict = ramp(t, 4.85, 5.45); // 缢裂 I 窗（收缩环内收）
    const scission = ramp(t, 5.3, 5.75); // ESCRT-Ⅲ 内切窗 I（桥 → 针状）
    const zc = R_CELL * (0.28 * elongK + 0.44 * constrict); // 叶心: 0 → 0.28R（拉长）→ 0.72R（相切）
    const rho = R_CELL * (1 - 0.28 * constrict); // 叶半径: R → 0.72R（体积重分布入两叶）
    const bridge = 0.3 * (1 - scission) + 0.02 * scission; // 中间体桥半径 → 针状
    const L = zc + rho + 0.02; // 回转面极点闭合所需半长
    const rFn = (u: number) => {
      const s = 2 * u - 1; // 归一纬度（-1 极 … 0 赤道 … +1 极）
      const z = s * L;
      const near = z >= 0 ? z - zc : z + zc; // 距近侧叶心偏移
      const far = z >= 0 ? z + zc : z - zc; // 距远侧叶心偏移
      const rNear = Math.sqrt(Math.max(0, rho * rho - near * near));
      const rFar = Math.sqrt(Math.max(0, rho * rho - far * far));
      return Math.max(bridge, rNear, rFar);
    };
    return { L, r: rFn };
  };
  const updateMembrane = (t: number) => {
    const { L, r } = membraneProfile(t);
    for (let i = 0; i < memPos.count; i++) {
      const dx = memDir[i * 3], dy = memDir[i * 3 + 1], dz = memDir[i * 3 + 2];
      const u = (dz + 1) / 2;
      const rr = Math.max(0.02, r(u));
      const horiz = Math.sqrt(Math.max(1e-6, 1 - dz * dz));
      memPos.setXYZ(i, (dx / horiz) * rr, (dy / horiz) * rr, dz * L);
    }
    memPos.needsUpdate = true;
    memGeo.computeVertexNormals();
    return { L, r };
  };

  /* ---------- 膜层 2: MI 双子膜（内切 I 瞬时交接 → 球期 → MII 沿 y 轴各自哑铃化） ----------
   * 每球保存原始顶点方向, MII 缢裂窗口 [8.2, 9.3] 内逐帧重写 y-L / xz-r(v) 回转面;
   * 之前恒为球（scale 控半径 —— 交接帧与单膜两叶相切几何同构, 像素级无缝） */
  const memDauGeo = track(new THREE.SphereGeometry(1, perf ? 36 : 56, perf ? 24 : 36));
  const mkDauMembrane = () => {
    const m = mat({ ...memParams, opacity: 0 });
    const mesh = new THREE.Mesh(memDauGeo, m);
    mesh.renderOrder = 50;
    mesh.visible = false;
    group.add(mesh);
    return mesh;
  };
  const memDauA = mkDauMembrane();
  const memDauB = mkDauMembrane();
  const dauPos = memDauGeo.attributes.position as THREE.BufferAttribute;
  const dauDir = new Float32Array(dauPos.count * 3);
  for (let i = 0; i < dauPos.count; i++) {
    const v = new THREE.Vector3(dauPos.getX(i), dauPos.getY(i), dauPos.getZ(i)).normalize();
    dauDir[i * 3] = v.x; dauDir[i * 3 + 1] = v.y; dauDir[i * 3 + 2] = v.z;
  }
  /** MII 双子膜 y 轴回转面（单子细胞: 球 → 拉长 → 双球并集哑铃 → 针缩）
   *  v56b 归一双球并集（世界尺寸 = × rD1）: 叶心 0 → 0.24（后期 II 拉长）→ 0.72（相切,
   *  与四配子球初始位几何同构）; T_CUT2=9.6 内切完成瞬时交换为四配子球（无渐变窗） */
  const dauProfile = (t: number): { L2: number; r2: (v: number) => number } => {
    const elong2K = ramp(t, 8.2, 9.3); // 后期 II 拉长
    const constrict2 = ramp(t, 8.7, 9.35); // 缢裂 II 窗（收缩环内收）
    const scission2 = ramp(t, 9.15, 9.6); // ESCRT-Ⅲ 内切窗 II（桥 → 针状）
    const c2 = 0.24 * elong2K + 0.48 * constrict2; // 叶心（归一）: 0 → 0.24 → 0.72（相切）
    const rho2 = 1 - 0.28 * constrict2; // 叶半径（归一）: 1 → 0.72
    const bridge2 = 0.05 * (1 - scission2) + 0.004 * scission2; // 桥半径（归一; 世界 ≈ 0.3 → 0.02）
    const L2 = c2 + rho2 + 0.004; // 归一半长（世界 = × rD1）
    const r2Fn = (v: number) => {
      const s = 2 * v - 1;
      const z = s * L2;
      const near = z >= 0 ? z - c2 : z + c2;
      const far = z >= 0 ? z + c2 : z - c2;
      const rNear = Math.sqrt(Math.max(0, rho2 * rho2 - near * near));
      const rFar = Math.sqrt(Math.max(0, rho2 * rho2 - far * far));
      return Math.max(bridge2, rNear, rFar);
    };
    return { L2, r2: r2Fn };
  };

  /* ---------- 膜层 3: 四配子球（MII 内切断离帧几何同构交换后的独立配子） ---------- */
  const memQuadGeo = track(new THREE.SphereGeometry(1, perf ? 32 : 48, perf ? 20 : 30));
  const memQuadMat = mat({ ...memParams, opacity: 0 });
  const memQuads: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(memQuadGeo, memQuadMat);
    m.renderOrder = 50;
    m.visible = false;
    group.add(m);
    memQuads.push(m);
  }

  /* ---------- 间期染色质网 + 复制叉 + 核仁 ---------- */
  const chromatinMat = mat({
    color: REF.chromatin,
    emissive: '#463a56',
    emissiveIntensity: 0.42,
    roughness: 0.5,
    opacity: 0.8,
    sheen: 0.4,
    sheenColor: REF.sheen,
  });
  const chromatinNet = (() => {
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    for (let i = 0; i < (perf ? 8 : 14); i++) {
      const pts: THREE.Vector3[] = [];
      const baseLat = (hash01(`cl${i}`) - 0.5) * 2.0;
      const baseLon = hash01(`cl${i}`, 3) * Math.PI * 2;
      for (let k = 0; k <= 5; k++) {
        const tt = k / 5;
        const lat = baseLat + Math.sin(tt * 4.2 + i * 1.7) * 0.55;
        const lon = baseLon + tt * 1.6 + Math.sin(tt * 3.1 + i) * 0.5;
        const rr = NUC_R * (0.4 + hash01(`clr${i}${k}`) * 0.5);
        pts.push(new THREE.Vector3(
          Math.cos(lat) * Math.cos(lon) * rr,
          Math.sin(lat) * rr,
          Math.cos(lat) * Math.sin(lon) * rr,
        ));
      }
      parts.push({ geo: track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.075, 6)) });
    }
    return new THREE.Mesh(track(mergeGeoms(parts)), chromatinMat);
  })();
  chromatinNet.renderOrder = 44;
  group.add(chromatinNet);
  // S 期姐妹纤维（复制读感）
  const chromatinMat2 = mat({
    color: '#bca8d0',
    emissive: '#8a76a8',
    emissiveIntensity: 0.62,
    roughness: 0.5,
    opacity: 0,
    sheen: 0.4,
    sheenColor: REF.sheen,
  });
  const chromatinNet2 = new THREE.Mesh(chromatinNet.geometry, chromatinMat2);
  chromatinNet2.scale.setScalar(1.048);
  chromatinNet2.rotation.y = 0.22;
  chromatinNet2.renderOrder = 44;
  chromatinNet2.visible = false;
  group.add(chromatinNet2);
  // 复制叉（间期 I 专属 —— 间期 II 无! 教学对比点）
  const FORK_N = perf ? 5 : 9;
  const forkMat = track(new THREE.MeshStandardMaterial({
    color: '#ffd27a',
    emissive: '#ffb020',
    emissiveIntensity: 3.8,
    roughness: 0.3,
    transparent: true,
    opacity: 0,
  }));
  const forks = new THREE.InstancedMesh(track(new THREE.SphereGeometry(0.115, 10, 8)), forkMat, FORK_N);
  const forkCurves: THREE.CatmullRomCurve3[] = [];
  for (let i = 0; i < FORK_N; i++) {
    const pts: THREE.Vector3[] = [];
    const baseLat = (hash01(`fk${i}`) - 0.5) * 2.0;
    const baseLon = hash01(`fk${i}`, 3) * Math.PI * 2;
    for (let kk = 0; kk <= 4; kk++) {
      const tt = kk / 4;
      const lat = baseLat + Math.sin(tt * 3.6 + i * 1.3) * 0.5;
      const lon = baseLon + tt * 1.4 + Math.sin(tt * 2.8 + i) * 0.45;
      const rr = NUC_R * (0.45 + hash01(`fkr${i}${kk}`) * 0.4);
      pts.push(new THREE.Vector3(
        Math.cos(lat) * Math.cos(lon) * rr,
        Math.sin(lat) * rr,
        Math.cos(lat) * Math.sin(lon) * rr,
      ));
    }
    forkCurves.push(new THREE.CatmullRomCurve3(pts));
  }
  forks.visible = false;
  forks.renderOrder = 47;
  group.add(forks);
  const nucleolus = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.95, 20, 16)),
    mat({ color: REF.nucleolus, emissive: REF.nucleolusHi, emissiveIntensity: 0.5, roughness: 0.55, opacity: 0.92, sheen: 0.5, sheenColor: REF.sheen }),
  );
  nucleolus.position.set(0.6, 0.7, -0.5);
  nucleolus.renderOrder = 45;
  group.add(nucleolus);

  /* ---------- 染色体: 5 对同源（父本暖 / 母本冷双色编码） ---------- */
  const PAIR_N = perf ? 4 : 5;
  const CHR_N = PAIR_N * 2;
  const chromatidGeo = (seed: string) => {
    const pLen = 0.3 + hash01(`p${seed}`) * 0.22;
    const qLen = 0.6 + hash01(`q${seed}`) * 0.5;
    const rr = 0.125 + hash01(`r${seed}`) * 0.035;
    return track(mergeGeoms([
      { geo: track(new THREE.CapsuleGeometry(rr, pLen, 3, 8)), matrix: new THREE.Matrix4().makeTranslation(0, pLen / 2 + 0.14, 0) },
      { geo: track(new THREE.CapsuleGeometry(rr + 0.008, qLen, 3, 8)), matrix: new THREE.Matrix4().makeTranslation(0, -(qLen / 2 + 0.14), 0) },
      { geo: track(new THREE.SphereGeometry(0.14, 10, 8)) },
    ]));
  };
  // 父本/母本双色: 同族薰衣草但可辨（父本暖调 / 母本冷调 —— 独立分配直接可读）
  const chrMatPat = mat({
    color: '#9a82b6', emissive: '#7a628e', emissiveIntensity: 1.3,
    roughness: 0.38, opacity: 0, clearcoat: 0.45, sheen: 0.55, sheenColor: REF.sheen,
    normalMap: orgNormal, normalScale: 0.35,
  });
  const chrMatMat = mat({
    color: '#8078a8', emissive: '#5c5682', emissiveIntensity: 1.3,
    roughness: 0.38, opacity: 0, clearcoat: 0.45, sheen: 0.55, sheenColor: REF.sheen,
    normalMap: orgNormal, normalScale: 0.35,
  });
  const centroMat = mat({ color: REF.npc, emissive: '#7a8294', emissiveIntensity: 0.6, roughness: 0.4, opacity: 0 });
  const kinMat = mat({ color: REF.mitoAtp, emissive: '#c9a227', emissiveIntensity: 1.1, roughness: 0.35, opacity: 0 });

  const chromatids: ChromatidSet[] = [];
  for (let pi = 0; pi < PAIR_N; pi++) {
    for (const homolog of [0, 1] as const) {
      const ci = pi * 2 + homolog;
      const g = new THREE.Group();
      const chrGeoShared = chromatidGeo(`mchr${ci}`);
      const armLocal = Math.max(
        0.3 + hash01(`p${ci}`) * 0.22 + 0.14,
        0.6 + hash01(`q${ci}`) * 0.5 + 0.14,
      ) + 0.15;
      const chrM = homolog === 0 ? chrMatPat : chrMatMat;
      const makeChromatid = () => {
        const cg = new THREE.Group();
        const body = new THREE.Mesh(chrGeoShared, chrM);
        body.renderOrder = 46;
        cg.add(body);
        return cg;
      };
      const cA = makeChromatid();
      const cB = makeChromatid();
      cA.position.x = -0.105;
      cB.position.x = 0.105;
      cA.rotation.z = 0.14;
      cB.rotation.z = -0.14;
      const centro = new THREE.Mesh(track(new THREE.SphereGeometry(0.15, 10, 8)), centroMat);
      centro.renderOrder = 47;
      const kinGeo = track(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10));
      const kinA = new THREE.Mesh(kinGeo, kinMat);
      kinA.position.set(0, 0, 0.17);
      kinA.rotation.x = Math.PI / 2;
      const kinB = new THREE.Mesh(kinGeo, kinMat);
      kinB.position.set(0, 0, -0.17);
      kinB.rotation.x = Math.PI / 2;
      cB.add(kinA);
      cA.add(kinB);
      g.add(cA, cB, centro);
      const scl = 1.62 + hash01(`cs${ci}`) * 0.42;
      void scl;
      g.scale.setScalar(0.001);
      group.add(g);
      // 同源对赤道板位（并肩 ±x 0.85; 环带分布）
      const ang = (pi / PAIR_N) * Math.PI * 2 + hash01(`ca${ci}`) * 0.4;
      const rad = 1.25 + hash01(`cr${ci}`) * 1.8;
      const plate = new THREE.Vector3(Math.cos(ang) * rad, (hash01(`cy${ci}`) - 0.5) * 3.0, (hash01(`cz${ci}`) - 0.5) * 0.4);
      // 联会位: 赤道板位 + 并肩偏移（父本 -x / 母本 +x）
      const synPos = plate.clone();
      synPos.x += (homolog === 0 ? -0.85 : 0.85);
      // 间期核内随机散布位
      const hl = (hash01(`hl${ci}`) - 0.5) * 1.7;
      const hn = hash01(`hn${ci}`) * Math.PI * 2;
      const hr = NUC_R * (0.35 + hash01(`hr${ci}`) * 0.45);
      const home = new THREE.Vector3(
        Math.cos(hl) * Math.cos(hn) * hr,
        Math.sin(hl) * hr,
        Math.cos(hl) * Math.sin(hn) * hr,
      );
      // MII 列队环带位（相对子细胞中心; xz 平面环带 —— 纺锤轴 y）
      const ang2 = (ci / CHR_N) * Math.PI * 2 + hash01(`m2a${ci}`) * 0.8;
      const rad2 = 1.0 + hash01(`m2r${ci}`) * 1.5;
      const ring2 = new THREE.Vector3(Math.cos(ang2) * rad2, 0, Math.sin(ang2) * rad2);
      // 同源对分离极性（pat 走哪极随机 —— 独立分配的演示; mat 反向）
      const patSide = (hash01(`side${pi}`) > 0.5 ? 1 : -1) as -1 | 1;
      const side = (homolog === 0 ? patSide : (-patSide as -1 | 1));
      chromatids.push({ group: g, cA, cB, armLocal, home, synPos, ring2, spin: hash01(`sp${ci}`) * Math.PI * 2, delay: hash01(`dl${ci}`) * 0.18, kinA, kinB, side, cell: side });
    }
  }

  /* ---------- 交叉（chiasmata）金点: 同源配对缝隙间的互换标记 ---------- */
  const chiasmaMat = track(new THREE.MeshStandardMaterial({
    color: '#ffd27a',
    emissive: '#ffb020',
    emissiveIntensity: 3.2,
    roughness: 0.3,
    transparent: true,
    opacity: 0,
  }));
  const chiasmaGeo = track(new THREE.OctahedronGeometry(0.16, 0));
  const chiasmas: THREE.Mesh[] = [];
  const chiasmaSeeds: number[][] = []; // [pi, yFrac]（沿配对缝隙高度 2 处/对）
  for (let pi = 0; pi < PAIR_N; pi++) {
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Mesh(chiasmaGeo, chiasmaMat);
      m.renderOrder = 48;
      m.visible = false;
      group.add(m);
      chiasmas.push(m);
      chiasmaSeeds.push([pi, k === 0 ? 0.35 : -0.3]);
    }
  }

  /* ---------- 中心体: MI 一对（±z 极） + MII 四枚（每子细胞 ±y） ---------- */
  const centGeo = (() => {
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    for (let b = 0; b < 9; b++) {
      const base = (b / 9) * Math.PI * 2;
      for (let tt = 0; tt < 3; tt++) {
        const rr2 = 0.09 + tt * 0.028;
        const aa = base + tt * 0.17;
        const blade = track(new THREE.CylinderGeometry(0.019, 0.019, 0.4, 6));
        blade.translate(rr2, 0, 0);
        parts.push({ geo: blade, matrix: new THREE.Matrix4().makeRotationY(aa) });
      }
    }
    parts.push({ geo: track(new THREE.CylinderGeometry(0.038, 0.038, 0.4, 8)) });
    return track(mergeGeoms(parts));
  })();
  const centMat = mat({ color: '#8494a8', emissive: '#4a5a6e', emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.2 });
  const pcmMat = mat({ color: '#6a7a8e', emissive: '#4a5a6e', emissiveIntensity: 0.35, roughness: 0.5, opacity: 0.5 });
  const centA = new THREE.Mesh(centGeo, centMat);
  const centB = new THREE.Mesh(centGeo, centMat);
  centB.rotation.z = Math.PI / 2;
  group.add(centA, centB);
  const pcmA = new THREE.Mesh(track(new THREE.SphereGeometry(0.55, 16, 12)), pcmMat);
  const pcmB = new THREE.Mesh(track(new THREE.SphereGeometry(0.55, 16, 12)), pcmMat);
  group.add(pcmA, pcmB);
  // MII 四枚（缩小 0.72 —— 子细胞更小）
  const cent2s: THREE.Mesh[] = [];
  const pcm2s: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(centGeo, centMat);
    c.scale.setScalar(0.72);
    c.rotation.z = i % 2 === 0 ? 0 : Math.PI / 2;
    c.visible = false;
    const p = new THREE.Mesh(track(new THREE.SphereGeometry(0.4, 12, 10)), pcmMat);
    p.visible = false;
    group.add(c, p);
    cent2s.push(c);
    pcm2s.push(p);
  }

  /* ---------- 纺锤体微管 ---------- */
  const mtMat = mat({
    color: REF.microtubule, emissive: '#3f5c4a', emissiveIntensity: 0.6,
    roughness: 0.4, normalMap: mtStripe, normalScale: 0.6, opacity: 0,
    sheen: 0.4, sheenColor: REF.sheen,
  });
  const mtPolarMat = mat({
    color: REF.microtubule, emissive: '#3f5c4a', emissiveIntensity: 0.6,
    roughness: 0.4, normalMap: mtStripe, normalScale: 0.6, opacity: 0,
    sheen: 0.4, sheenColor: REF.sheen,
  });
  const kfiberMat = mat({
    color: '#a8c8b4', emissive: '#6a8a76', emissiveIntensity: 0.85,
    roughness: 0.35, normalMap: mtStripe, normalScale: 0.7, opacity: 0,
    sheen: 0.5, sheenColor: REF.sheen,
  });
  const kfiberMat2 = mat({
    color: '#a8c8b4', emissive: '#6a8a76', emissiveIntensity: 0.8,
    roughness: 0.35, normalMap: mtStripe, normalScale: 0.7, opacity: 0,
    sheen: 0.5, sheenColor: REF.sheen,
  });
  // 星体微管（MI 两极放射）
  const astralN = perf ? 9 : 14;
  const astralDirs: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < astralN; i++) {
      const lat = (hash01(`as${side}${i}`, 3) - 0.5) * 1.9;
      const lon = hash01(`as${side}${i}`, 5) * Math.PI * 2;
      astralDirs.push(new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).normalize());
    }
  }
  const astrals = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.026, 0.026, 1, 5)), mtMat, astralDirs.length);
  astrals.renderOrder = 43;
  group.add(astrals);
  // 极间微管（MI 中央纺锤体）
  const polarN = perf ? 10 : 16;
  const polarSeeds: { lat: number; lon: number }[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < polarN; i++) {
      polarSeeds.push({ lat: (hash01(`po${side}${i}`, 3) - 0.5) * 0.75, lon: hash01(`po${side}${i}`, 5) * Math.PI * 2 });
    }
  }
  const polars = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.032, 0.032, 1, 5)), mtPolarMat, polarSeeds.length);
  polars.renderOrder = 43;
  group.add(polars);
  // 动粒微管 MI（每条染色体双纤维同极 —— 马勒定向）
  const kfibers = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.055, 0.055, 1, 7, 1)), kfiberMat, CHR_N * 2);
  kfibers.renderOrder = 43;
  group.add(kfibers);
  // 动粒微管 MII（每条染色体双纤维异极 —— 同有丝分裂）
  const kfibers2 = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.048, 0.048, 1, 7, 1)), kfiberMat2, CHR_N * 2);
  kfibers2.renderOrder = 43;
  group.add(kfibers2);
  // MII 星体微管（每子细胞两极放射, 缩短）
  const astral2 = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.022, 0.022, 1, 5)), mtMat, 4 * 7);
  astral2.renderOrder = 43;
  group.add(astral2);
  const kUp = new THREE.Vector3(0, 1, 0);
  const kDir = new THREE.Vector3();
  const kMid = new THREE.Vector3();
  const kQuat = new THREE.Quaternion();
  const kM = new THREE.Matrix4();
  const kScale = new THREE.Vector3();

  /* ---------- 核被膜: 间期核 + NEBD 碎片 + MI 双子核 + MII 四配子核 ---------- */
  const neMat = mat({
    color: REF.nucEnv, emissive: '#4a4456', emissiveIntensity: 0.32, roughness: 0.3,
    opacity: perf ? 0.5 : 1, clearcoat: 0.5, transmission: perf ? 0 : 0.35, thickness: 0.4,
    sheen: 0.45, sheenColor: REF.sheen, normalMap: orgNormal, normalScale: 0.4,
    flow: { color: '#6a6478', strength: 0.14, scale: 0.9, speed: 0.05, rim: 0.2 },
  });
  const ne = new THREE.Mesh(track(new THREE.SphereGeometry(NUC_R, 32, 24)), neMat);
  ne.renderOrder = 45;
  group.add(ne);
  const npcGeo = track(new THREE.TorusGeometry(0.14, 0.05, 6, 10));
  const npcMat = mat({ color: REF.npc, emissive: '#7a8294', emissiveIntensity: 0.45, roughness: 0.45, opacity: 0.85 });
  const npcN = perf ? 18 : 30;
  const npcs = new THREE.InstancedMesh(npcGeo, npcMat, npcN);
  {
    const mm = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < npcN; i++) {
      const lat = Math.asin((hash01(`nl${i}`) - 0.5) * 1.9);
      const lon = hash01(`no${i}`) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      qq.setFromUnitVectors(up, dir);
      mm.compose(dir.clone().multiplyScalar(NUC_R), qq, new THREE.Vector3(1, 1, 1));
      npcs.setMatrixAt(i, mm);
    }
    npcs.instanceMatrix.needsUpdate = true;
    npcs.renderOrder = 46;
  }
  group.add(npcs);
  // NEBD 碎片（MI 崩解; MI 重组后 MII 前再崩解 —— 简化复用同一组碎片）
  const fragGeo = track(new THREE.SphereGeometry(1, 8, 6));
  const fragMat = mat({ color: REF.nucEnv, emissive: '#4a4456', emissiveIntensity: 0.4, roughness: 0.4, opacity: 0 });
  const fragN = perf ? 14 : 22;
  const frags = new THREE.InstancedMesh(fragGeo, fragMat, fragN);
  const fragSeeds = Array.from({ length: fragN }, (_, i) => ({
    dir: new THREE.Vector3(
      Math.cos((hash01(`fl${i}`, 3) - 0.5) * 2.4) * Math.cos(hash01(`fl${i}`, 5) * Math.PI * 2),
      Math.sin((hash01(`fl${i}`, 3) - 0.5) * 2.4),
      Math.cos((hash01(`fl${i}`, 3) - 0.5) * 2.4) * Math.sin(hash01(`fl${i}`, 5) * Math.PI * 2),
    ).normalize(),
    r: 0.16 + hash01(`fr${i}`) * 0.13,
    spin: hash01(`fs${i}`) * Math.PI * 2,
  }));
  group.add(frags);
  // MI 双子核（间期 II 期间完整; 前/中期 II 崩解）
  const dauNeMat = mat({
    color: REF.nucEnv, emissive: '#4a4456', emissiveIntensity: 0.3, roughness: 0.3,
    opacity: 0, clearcoat: 0.5, sheen: 0.45, sheenColor: REF.sheen, normalMap: orgNormal, normalScale: 0.4,
    flow: { color: '#6a6478', strength: 0.12, scale: 0.9, speed: 0.05, rim: 0.18 },
  });
  const dauNeA = new THREE.Mesh(track(new THREE.SphereGeometry(2.05, 28, 20)), dauNeMat);
  const dauNeB = new THREE.Mesh(track(new THREE.SphereGeometry(2.05, 28, 20)), dauNeMat);
  dauNeA.scale.setScalar(0.001);
  dauNeB.scale.setScalar(0.001);
  dauNeA.renderOrder = 45;
  dauNeB.renderOrder = 45;
  group.add(dauNeA, dauNeB);
  // MII 四配子核
  const quadNeMat = mat({
    color: REF.nucEnv, emissive: '#4a4456', emissiveIntensity: 0.3, roughness: 0.3,
    opacity: 0, clearcoat: 0.5, sheen: 0.45, sheenColor: REF.sheen, normalMap: orgNormal, normalScale: 0.4,
    flow: { color: '#6a6478', strength: 0.12, scale: 0.9, speed: 0.05, rim: 0.18 },
  });
  const quadNeGeo = track(new THREE.SphereGeometry(1.55, 24, 18));
  const quadNes: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(quadNeGeo, quadNeMat);
    m.scale.setScalar(0.001);
    m.renderOrder = 45;
    group.add(m);
    quadNes.push(m);
  }

  /* ---------- 细胞器: 线粒体/囊泡/核糖体（双段分配 MI → MII → 四配子） ---------- */
  const mitoGeo = track(new THREE.CapsuleGeometry(0.4, 0.8, 4, 10));
  const mitoMat = mat({
    color: REF.mitoOuter, emissive: '#3e2c26', emissiveIntensity: 0.34, roughness: 0.28,
    transmission: perf ? 0 : 0.45, thickness: 0.4, opacity: 1, clearcoat: 0.5,
    normalMap: mtStripe, normalScale: 0.35, sheen: 0.4, sheenColor: REF.sheen,
  });
  const MITO_N = perf ? 5 : 8;
  const mitos = new THREE.InstancedMesh(mitoGeo, mitoMat, MITO_N);
  const mitoSeeds = Array.from({ length: MITO_N }, (_, i) => ({
    ang: hash01(`ma${i}`) * Math.PI * 2,
    rad: 4.6 + hash01(`mr${i}`) * 1.8,
    y: (hash01(`my${i}`) - 0.5) * 4.2,
    side: i % 2 === 0 ? -1 : 1,
    sideY: hash01(`mq${i}`) > 0.5 ? 1 : -1,
    rot: new THREE.Euler(hash01(`me${i}`) * Math.PI, hash01(`me${i}`, 3) * Math.PI * 2, (hash01(`me${i}`, 5) - 0.5) * 0.9),
    phase: hash01(`mp${i}`) * Math.PI * 2,
  }));
  group.add(mitos);
  const vesGeo = track(new THREE.SphereGeometry(1, 10, 8));
  const vesMat = mat({ color: REF.vesicle, emissive: '#3e4a58', emissiveIntensity: 0.3, roughness: 0.35, clearcoat: 0.3, opacity: 0.9 });
  const VES_N = perf ? 8 : 14;
  const vesicles = new THREE.InstancedMesh(vesGeo, vesMat, VES_N);
  const vesSeeds = Array.from({ length: VES_N }, (_, i) => ({
    ang: hash01(`va${i}`) * Math.PI * 2,
    rad: 3.4 + hash01(`vr${i}`) * 3.1,
    y: (hash01(`vy${i}`) - 0.5) * 6.0,
    side: i % 2 === 0 ? 1 : -1,
    sideY: hash01(`vq${i}`) > 0.5 ? 1 : -1,
    r: 0.14 + hash01(`vs${i}`) * 0.12,
  }));
  group.add(vesicles);
  const riboGeo = track(new THREE.SphereGeometry(0.052, 5, 4));
  const riboMat = track(new THREE.MeshStandardMaterial({ color: '#c9a54e', emissive: '#a8842e', emissiveIntensity: 0.85, roughness: 0.5 }));
  const RIB_N = perf ? 60 : 120;
  const ribos = new THREE.InstancedMesh(riboGeo, riboMat, RIB_N);
  const ribSeeds = Array.from({ length: RIB_N }, (_, i) => ({
    ang: hash01(`rl${i}`) * Math.PI * 2,
    rad: 1.6 + hash01(`rr${i}`) * 5.6,
    y: (hash01(`ry${i}`) - 0.5) * 6.6,
    side: hash01(`rs${i}`) > 0.5 ? 1 : -1,
    sideY: hash01(`rq${i}`) > 0.5 ? 1 : -1,
  }));
  group.add(ribos);

  /* ---------- 高尔基体: 间期主栈 + MII 四配子迷你栈 ---------- */
  const golgiStackMat = mat({
    color: '#ffffff', vertexColors: true, transmission: perf ? 0 : 0.18, thickness: 0.35,
    roughness: 0.28, opacity: 0, clearcoat: 0.5, emissive: '#7a7296', emissiveIntensity: 0.55,
    sheen: 0.55, sheenColor: '#c8c0dc',
  });
  const GOLGI_STACK_SEED = 31;
  const buildGolgiStack = (scale: number, seed: number, cistN = 6): THREE.Group => {
    const g = new THREE.Group();
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4; color?: THREE.Color }[] = [];
    const cisCol = new THREE.Color(REF.golgiCis);
    const transCol = new THREE.Color(REF.golgiTrans);
    const step = 0.3 * scale;
    const semiB = 0.78 * scale;
    const stackH = cistN * step;
    const MIX = [0, 0.14, 0.34, 0.56, 0.8, 1];
    const ASPECT = 1.78;
    for (let i = 0; i < cistN; i++) {
      const col = cisCol.clone().lerp(transCol, MIX[i]);
      const rad = semiB * (1 - i * 0.045);
      const cup = (0.05 + i * 0.028) * scale;
      const geo = track(golgiCisternaGeometry(rad, 0.082 * scale, cup, seed + i * 7, perf ? 6 : 8, perf ? 26 : 40, ASPECT));
      const m = new THREE.Matrix4().makeRotationY(i * 0.09).setPosition(0, i * step - stackH * 0.5, 0);
      parts.push({ geo, matrix: m, color: col });
    }
    for (let v = 0; v < 5; v++) {
      const r = (0.1 + hash01(`gb${seed}${v}`) * 0.05) * scale;
      const ang = v * (Math.PI * 2 / 5) + hash01(`gba${seed}${v}`) * 0.6;
      const rr = semiB * (0.5 + hash01(`gbr${seed}${v}`) * 0.42);
      const sph = track(new THREE.SphereGeometry(r, 8, 6));
      sph.translate(Math.cos(ang) * rr * ASPECT, stackH * 0.5 + 0.14 * scale, Math.sin(ang) * rr);
      parts.push({ geo: sph, color: new THREE.Color(REF.golgiTrans) });
    }
    const mesh = new THREE.Mesh(track(mergeGeoms(parts)), golgiStackMat);
    mesh.renderOrder = 45;
    g.add(mesh);
    return g;
  };
  const golgiMain = buildGolgiStack(0.82, GOLGI_STACK_SEED);
  golgiMain.position.set(2.72, -0.83, 2.63);
  {
    const axis = new THREE.Vector3(0.7, 0.2, 0.69).normalize();
    const qAlign = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    const qSpin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.8);
    golgiMain.quaternion.copy(qAlign).multiply(qSpin);
  }
  group.add(golgiMain);
  // 四配子迷你栈（4 层）
  const golgiQuads: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const g = buildGolgiStack(0.34, GOLGI_STACK_SEED + 57 + i * 31, 4);
    g.visible = false;
    group.add(g);
    golgiQuads.push(g);
  }

  /* ---------- 粗面内质网: 间期核周冠（简化 3 层版） ---------- */
  const rerMat = mat({
    color: REF.erSheet, emissive: '#66608a', emissiveIntensity: 0.4, roughness: 0.24,
    normalMap: orgNormal, normalScale: 0.4, opacity: 0, clearcoat: 0.5,
    sheen: 0.55, sheenColor: '#cdc4e2',
    flow: { color: '#9c96b8', strength: 0.16, scale: 0.8, speed: 0.07, rim: 0.2 },
  });
  const rerRibMat = track(new THREE.MeshStandardMaterial({
    color: '#c9a54e', emissive: '#a8842e', emissiveIntensity: 1.0, roughness: 0.5, transparent: true,
  }));
  // 简化核周冠: 弧形壳层 ×3（球壳切片 + 偏移, 朝后上 —— 与高尔基主栈方向让位）
  const rerCrown = (() => {
    const parts: { geo: THREE.BufferGeometry }[] = [];
    const crownAxis = new THREE.Vector3(-0.2, 0.42, -0.88).normalize();
    for (let L = 0; L < (perf ? 2 : 3); L++) {
      const rr = NUC_R * (1 + 0.06 + L * 0.14);
      const cone = 2.0 - L * 0.12;
      // 球冠壳: 只保留 crownAxis 方向锥角内的顶点带
      const sph = new THREE.SphereGeometry(rr, perf ? 26 : 40, perf ? 14 : 20, 0, Math.PI * 2, 0, Math.PI / cone);
      const g = track(sph);
      g.rotateX(Math.acos(THREE.MathUtils.clamp(crownAxis.y, -1, 1)) - Math.PI / 2);
      g.rotateY(Math.atan2(crownAxis.z, crownAxis.x) - Math.PI / 2 + Math.PI / 2);
      parts.push({ geo: g });
    }
    const mesh = new THREE.Mesh(track(mergeGeoms(parts)), rerMat);
    mesh.renderOrder = 44;
    // 核糖体沙
    const riboPts: THREE.Vector3[] = [];
    for (let i = 0; i < (perf ? 60 : 140); i++) {
      const lat = (hash01(`rerl${i}`) - 0.5) * 1.3;
      const lon = hash01(`rero${i}`) * Math.PI * 2;
      const rr = NUC_R * (1.07 + Math.floor(hash01(`rerr${i}`) * 3) * 0.14);
      const d = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      if (d.dot(crownAxis) < 0.25) continue;
      riboPts.push(d.multiplyScalar(rr));
    }
    const ribos2 = new THREE.InstancedMesh(track(new THREE.SphereGeometry(0.055, 5, 4)), rerRibMat, Math.max(1, riboPts.length));
    {
      const mm = new THREE.Matrix4();
      const qq = new THREE.Quaternion();
      riboPts.forEach((p, i) => {
        mm.compose(p, qq.identity(), new THREE.Vector3(1, 1, 1).multiplyScalar(0.9 + hash01(`rers${i}`) * 0.45));
        ribos2.setMatrixAt(i, mm);
      });
      ribos2.instanceMatrix.needsUpdate = true;
      ribos2.renderOrder = 45;
    }
    return { mesh, ribos: ribos2 };
  })();
  group.add(rerCrown.mesh, rerCrown.ribos);

  /* ---------- 收缩环: MI 单环（z=0 竖直） + MII 双环（y=±zD1 水平） ---------- */
  const ringMat = mat({
    color: REF.actin, emissive: '#7a8a9c', emissiveIntensity: 0.7, roughness: 0.4,
    opacity: 0, sheen: 0.6, sheenColor: REF.sheen, normalMap: mtStripe, normalScale: 0.8,
  });
  const furrowRing = new THREE.Mesh(track(new THREE.TorusGeometry(1, 0.14, 10, 40)), ringMat);
  furrowRing.renderOrder = 48;
  group.add(furrowRing);
  const ringMat2 = mat({
    color: REF.actin, emissive: '#7a8a9c', emissiveIntensity: 0.7, roughness: 0.4,
    opacity: 0, sheen: 0.6, sheenColor: REF.sheen, normalMap: mtStripe, normalScale: 0.8,
  });
  const furrowRings2: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(track(new THREE.TorusGeometry(1, 0.12, 10, 36)), ringMat2);
    m.rotation.x = Math.PI / 2; // 水平环（MII 沿 y 缢裂）
    m.renderOrder = 48;
    m.visible = false;
    group.add(m);
    furrowRings2.push(m);
  }

  /* ---------- 逐帧更新 ---------- */
  const memMatRef = memMat as THREE.MeshPhysicalMaterial;
  const memDauMatARef = memDauA.material as THREE.MeshPhysicalMaterial;
  const memDauMatBRef = memDauB.material as THREE.MeshPhysicalMaterial;
  const memQuadMatRef = memQuadMat as THREE.MeshPhysicalMaterial;
  const chrMatPatRef = chrMatPat as THREE.MeshPhysicalMaterial;
  const chrMatMatRef = chrMatMat as THREE.MeshPhysicalMaterial;
  const centroMatRef = centroMat as THREE.MeshPhysicalMaterial;
  const kinMatRef = kinMat as THREE.MeshPhysicalMaterial;
  const mtMatRef = mtMat as THREE.MeshPhysicalMaterial;
  const mtPolarMatRef = mtPolarMat as THREE.MeshPhysicalMaterial;
  const kfiberMatRef = kfiberMat as THREE.MeshPhysicalMaterial;
  const kfiberMat2Ref = kfiberMat2 as THREE.MeshPhysicalMaterial;
  const neMatRef = neMat as THREE.MeshPhysicalMaterial;
  const npcMatRef = npcMat as THREE.MeshPhysicalMaterial;
  const chromatinMatRef = chromatinMat as THREE.MeshPhysicalMaterial;
  const chromatinMat2Ref = chromatinMat2 as THREE.MeshPhysicalMaterial;
  const fragMatRef = fragMat as THREE.MeshPhysicalMaterial;
  const dauNeMatRef = dauNeMat as THREE.MeshPhysicalMaterial;
  const quadNeMatRef = quadNeMat as THREE.MeshPhysicalMaterial;
  const golgiStackMatRef = golgiStackMat as THREE.MeshPhysicalMaterial;
  const rerMatRef = rerMat as THREE.MeshPhysicalMaterial;
  const ringMatRef = ringMat as THREE.MeshPhysicalMaterial;
  const ringMat2Ref = ringMat2 as THREE.MeshPhysicalMaterial;
  const nucleolusMatRef = nucleolus.material as THREE.MeshPhysicalMaterial;

  const poleZ = (t: number) => POLE_Z0 * (1 + ramp(t, 2.9, 4.0) * 0.1 + ramp(t, 4.0, 5.0) * 0.16);
  const mm = new THREE.Matrix4();
  const qq = new THREE.Quaternion();
  const eu = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const sc = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  // 交叉跟随位置缓存（update 写入 → chiasma 定位）
  const pairMid = new THREE.Vector3();

  const update = (t: number, dt: number) => {
    uTime.value += dt;
    const PZ = poleZ(t);

    /* 膜层 1: MI 单膜 */
    const { L: memL, r: rProfile } = updateMembrane(t);
    /* v56b 膜层 1→2 交接: 胞裂 I 内切完成瞬间（T_CUT1=5.75）瞬时无缝交换 —— 两叶恰相切
     * （zc=ρ=0.72R）几何同构, 唯一可见差异 = 针状桥消失（= ESCRT-Ⅲ 内切语义）。
     * 取代旧 crossfade（用户「膜消失又出现」根治）: 膜全程可见、恒不透明 */
    const T_CUT1 = 5.75; // 内切 I 完成瞬间（= scission 窗终点）
    const dau1Fade = t >= T_CUT1 ? 1 : 0; // QA 探针兼容通道: 0/1 阶跃
    const mem1Fade = t >= T_CUT1 ? 0 : 1;
    const ZC1_FINAL = R_CELL * 0.72; // 缢缩 I 完成叶心（与 membraneProfile constrict=1 同源）
    const zD1 = THREE.MathUtils.lerp(ZC1_FINAL, 6.5, ramp(t, T_CUT1, 6.6));
    const rD1 = THREE.MathUtils.lerp(ZC1_FINAL, 5.9, ramp(t, T_CUT1, 6.2));
    memMatRef.opacity = (perf ? 0.5 : 0.42) * mem1Fade; // 恒全不透明直至断离帧
    membrane.visible = mem1Fade > 0.5;
    /* 膜层 2: 双子膜 —— 球期（scale 控径）→ MII y-morph 期（顶点重写） */
    const miiMorph = ramp(t, 8.2, 8.7);
    const T_CUT2 = 9.6; // 内切 II 完成瞬间（= scission2 窗终点）
    const dau2Fade = t >= T_CUT2 ? 1 : 0;
    const mem2Fade = t >= T_CUT2 ? 0 : 1;
    const { L2, r2 } = dauProfile(t);
    for (const [mesh, mref, zc] of [[memDauA, memDauMatARef, -zD1], [memDauB, memDauMatBRef, zD1]] as [THREE.Mesh, THREE.MeshPhysicalMaterial, number][]) {
      mesh.visible = dau1Fade > 0.5 && mem2Fade > 0.5;
      mref.opacity = (perf ? 0.5 : 0.42) * dau1Fade * mem2Fade;
      mesh.position.set(0, 0, zc);
      if (miiMorph > 0.001) {
        // y 轴哑铃 morph（球期 scale 归一 1 —— 顶点直接以 rD1 写世界半径）
        for (let i = 0; i < dauPos.count; i++) {
          const dx = dauDir[i * 3], dy = dauDir[i * 3 + 1], dz = dauDir[i * 3 + 2];
          const v = (dy + 1) / 2;
          const rr = Math.max(0.02, r2(v)) * rD1;
          const horiz = Math.sqrt(Math.max(1e-6, 1 - dy * dy));
          dauPos.setXYZ(i, (dx / horiz) * rr, dy * L2 * rD1, (dz / horiz) * rr);
        }
        dauPos.needsUpdate = true;
        memDauGeo.computeVertexNormals();
        mesh.scale.setScalar(1);
      } else {
        mesh.scale.setScalar(Math.max(0.001, rD1));
      }
    }
    /* v56b 膜层 3: 四配子球 —— MII 内切完成瞬间（T_CUT2）瞬时无缝交换: y 起点 = MII 哑铃
     * 叶位（0.72·rD1 ≈ 4.25, 与 dauProfile constrict2=1 严格同源）, 半径同叶半径 —— 几何
     * 同构像素无缝; 此后 yG 拉开至 5.2、rG 微收圆 4.3 */
    const yG0 = 0.72 * 5.9; // MII 哑铃叶心/叶半径（rD1 在 T_CUT2 已定格 5.9）
    const yG = THREE.MathUtils.lerp(yG0, 5.2, ramp(t, T_CUT2, 10.9));
    const zD2 = 6.5; // 与 zD1 终值一致（配子 z 位恒随次级细胞）
    const rG = THREE.MathUtils.lerp(yG0, 4.3, ramp(t, T_CUT2, 10.5));
    memQuadMatRef.opacity = (perf ? 0.5 : 0.42) * dau2Fade; // 断离帧即全不透明（无淡入）
    for (let i = 0; i < 4; i++) {
      const m = memQuads[i];
      m.visible = dau2Fade > 0.5;
      m.position.set(0, i < 2 ? -yG : yG, i % 2 === 0 ? -zD2 : zD2);
      m.scale.setScalar(Math.max(0.001, rG));
    }

    /* 染色体运动学（全时间轴统一解算） */
    const condense = ramp(t, 0.05, 0.9);
    const synapse = ramp(t, 0.55, 1.25);
    const congress1 = ramp(t, 1.35, 2.25);
    const seg1 = ramp(t, 3.2, 3.9);
    const tight1 = ramp(t, 3.85, 4.5);
    const decon1 = ramp(t, 4.1, 4.85) * 0.35; // 末期 I 保持凝聚（仅 35%）
    const miiSetup = ramp(t, 5.3, 6.5); // MI 极区 → MII 列队位交接
    const miiOrient = ramp(t, 6.4, 7.2); // 旋转 x: 竖直面 → 水平面（局部 z → 世界 y）
    const seg2 = ramp(t, 7.5, 8.3);
    const tight2 = ramp(t, 8.25, 8.85);
    const decon2 = ramp(t, 8.5, 9.4);
    const chrOpacity = clamp01(ramp(t, 0.1, 0.75) * (1 - decon2 * 0.75));
    chrMatPatRef.opacity = chrOpacity;
    chrMatMatRef.opacity = chrOpacity;
    // 着丝粒球: MI 后期不切（Rec8 保护!）—— MII 后期 [7.55, 7.9] 才被 separase 切割淡出
    centroMatRef.opacity = chrOpacity * (1 - ramp(t, 7.55, 7.9));
    kinMatRef.opacity = clamp01(ramp(t, 0.8, 1.3) * (1 - ramp(t, 5.0, 5.6) * 0.4) * (1 - ramp(t, 8.9, 9.4)));
    const reach1 = PZ * 0.88;
    const reach2 = PZ2 * 0.8;
    const PZ2S = PZ2; // MII 纺锤半长（子细胞内）

    chromatids.forEach((chr, ci) => {
      const g = chr.group;
      const scl = (1.62 + hash01(`cs${ci}`) * 0.42) * (0.55 + condense * 0.45) * (1 + decon1 * 0.06 + decon2 * 0.1);
      const armR = chr.armLocal * scl + 0.16;
      // MI 段位置: home → 联会位 → 赤道板 → 同源分离 → 极区聚拢
      const k = clamp01(congress1 + chr.delay * 0.12);
      vA.copy(chr.home).lerp(chr.synPos, synapse);
      vA.lerp(chr.synPos.clone().setX(chr.synPos.x * 0.6), k * 0.55); // 联会后并拢（并肩距 1.7 → 1.0）
      const sepA = clamp01(seg1 - chr.delay * 0.3);
      const zShift = chr.side * sepA * reach1;
      const tightXY = Math.max(0.1, 1 - tight1 * 0.42);
      const yFac = 1 - tight1 * 0.3;
      const miPos = new THREE.Vector3(
        THREE.MathUtils.clamp(vA.x * tightXY, -6.2, 6.2),
        THREE.MathUtils.clamp(vA.y * yFac, -6.2, 6.2),
        vA.z * (1 - ramp(t, 1.35, 2.2) * 0.92) + zShift,
      );
      // MII 列队位（相对子细胞中心）
      const cellC = new THREE.Vector3(0, 0, chr.cell * zD1);
      const tight2XY = Math.max(0.1, 1 - tight2 * 0.42);
      const miiPos = new THREE.Vector3(
        cellC.x + chr.ring2.x * tight2XY,
        cellC.y + chr.ring2.y,
        cellC.z + chr.ring2.z * tight2XY,
      );
      // MI → MII 交接 lerp（联会/分离终位 → 子细胞列队位）
      const pos = miPos.clone().lerp(miiPos, miiSetup);
      // MII 姐妹分离: 单体沿世界 ±y（局部 z 经 rotation.x=-π/2 映射）
      const sepB = clamp01(seg2 - chr.delay * 0.3);
      const zCap2 = Math.max(0.5, rD1 * 0.82 - armR);
      const cZW = Math.min(0.08 + sepB * reach2, zCap2);
      chr.cA.position.z = -cZW / Math.max(0.35, scl) * Math.max(0.35, 1); // 局部（旋转后 → 世界 y）
      chr.cB.position.z = cZW / Math.max(0.35, scl);
      chr.cA.position.x = -0.105;
      chr.cB.position.x = 0.105;
      g.position.copy(pos);
      // 旋转: 前期随机方位 → 中期极轴对齐（MI z 轴）→ MII 翻转（局部 z → 世界 y）
      const orient = ramp(t, 1.35, 2.15);
      const wobble = Math.sin(uTime.value * 2.4 + chr.spin * 5) * (1 - orient) * 0.9;
      const osc = Math.sin(uTime.value * 1.7 + chr.spin * 7) * 0.1 * orient * (1 - ramp(t, 3.2, 3.5)) * (1 - ramp(t, 7.5, 7.8));
      const poleYaw = Math.round(chr.spin / Math.PI) * Math.PI;
      const rx = THREE.MathUtils.lerp(
        wobble * 0.6 + (1 - orient) * Math.sin(chr.spin * 3) * 2.2,
        -Math.PI / 2,
        miiOrient,
      );
      const ry = THREE.MathUtils.lerp(
        (1 - orient) * chr.spin * 4 + orient * poleYaw,
        chr.cell * 0.12,
        miiOrient,
      );
      const rz = THREE.MathUtils.lerp(
        (1 - orient) * wobble * 0.4 + orient * chr.spin + osc,
        chr.spin,
        miiOrient,
      );
      g.rotation.set(rx, ry, rz);
      g.scale.setScalar(Math.max(0.001, scl * clamp01(ramp(t, 0.02, 0.4))));
    });

    /* 交叉金点: 联会期沿配对缝隙出现, 后期 I 滑向端部并脱落 */
    const chiasmaOp = clamp01(ramp(t, 0.75, 1.3) * (1 - ramp(t, 3.2, 3.85)));
    chiasmaMat.opacity = chiasmaOp;
    chiasmas.forEach((m, i) => {
      const [pi, yFrac] = chiasmaSeeds[i];
      const pat = chromatids[pi * 2];
      const mat = chromatids[pi * 2 + 1];
      if (!pat || !mat) return;
      m.visible = chiasmaOp > 0.02;
      if (!m.visible) return;
      // 中点跟随 + y 沿臂高分布; 后期 I 滑向端部（|y| 增大）
      const slide = ramp(t, 3.2, 3.85);
      pairMid.addVectors(pat.group.position, mat.group.position).multiplyScalar(0.5);
      const yOff = yFrac * (1 + slide * 1.6) * 1.1;
      m.position.set(pairMid.x, pairMid.y + yOff, pairMid.z);
      m.rotation.y = uTime.value * 1.4 + i;
      const pulse = 1 + Math.sin(uTime.value * 4 + i * 2) * 0.18;
      m.scale.setScalar(0.85 * pulse);
    });

    /* 染色质网/核仁/复制叉: 仅间期 I（间期 II 无复制 —— 教学对比） */
    const repl = ramp(t, 0.02, 0.45);
    const replWindow = repl * (1 - ramp(t, 0.45, 0.65));
    chromatinMatRef.opacity = 0.8 * (1 - condense);
    nucleolusMatRef.opacity = 0.92 * (1 - ramp(t, 0.4, 0.9));
    chromatinNet.visible = chromatinMatRef.opacity > 0.02;
    nucleolus.visible = nucleolusMatRef.opacity > 0.02;
    chromatinMat2Ref.opacity = 0.72 * repl * (1 - condense);
    chromatinNet2.visible = chromatinMat2Ref.opacity > 0.02;
    chromatinMatRef.emissiveIntensity = 0.42 + replWindow * (0.35 + Math.sin(uTime.value * 5) * 0.18);
    forkMat.opacity = clamp01(replWindow * 1.6) * Math.min(1, (1 - condense) * 3);
    forks.visible = forkMat.opacity > 0.03;
    if (forks.visible) {
      for (let i = 0; i < FORK_N; i++) {
        const fp = clamp01(repl * 1.3 + hash01(`fks${i}`) * 0.22);
        forkCurves[i].getPoint(fp, pv);
        const fs = 0.9 + Math.sin(uTime.value * 7 + i * 1.9) * 0.25;
        mm.compose(pv, qq.identity(), sc.setScalar(fs));
        forks.setMatrixAt(i, mm);
      }
      forks.instanceMatrix.needsUpdate = true;
    }

    /* 中心体: MI 对（贴核 → 两极）→ MII 四枚（每子细胞 ±y） */
    const sepT = ramp(t, 0.35, 1.9);
    const cAz = THREE.MathUtils.lerp(1.35, -PZ, sepT);
    const cBz = THREE.MathUtils.lerp(1.75, PZ, sepT);
    centA.position.set(0.5, THREE.MathUtils.lerp(1.1, 0, sepT), cAz);
    centB.position.set(-0.5, THREE.MathUtils.lerp(1.15, 0.05, sepT), cBz);
    pcmA.position.copy(centA.position);
    pcmB.position.copy(centB.position);
    centA.rotation.y += dt * 0.8;
    centB.rotation.y -= dt * 0.8;
    // MI 中心体在胞裂 I 后淡出（子细胞中心体由 MII 四枚接管）
    const cent1Op = clamp01(1 - ramp(t, 5.1, 5.5));
    centA.visible = cent1Op > 0.02;
    centB.visible = cent1Op > 0.02;
    pcmA.visible = centA.visible;
    pcmB.visible = centB.visible;
    // MII 四枚: 间期 II 末组装 [6.2, 6.9]; 末期 II 随配子就位淡出
    const cent2Op = clamp01(ramp(t, 6.2, 6.9) * (1 - ramp(t, 9.4, 9.9)));
    for (let i = 0; i < 4; i++) {
      const c = cent2s[i];
      const p = pcm2s[i];
      c.visible = cent2Op > 0.02;
      p.visible = c.visible;
      const cellZ = i % 2 === 0 ? -zD1 : zD1;
      const poleY = i < 2 ? -PZ2S : PZ2S;
      const xOff = i < 2 ? 0.35 : -0.35;
      c.position.set(xOff, poleY, cellZ);
      p.position.copy(c.position);
      c.rotation.y += dt * 0.8 * (i % 2 === 0 ? 1 : -1);
    }

    /* 星体微管（MI）: 极位放射 + 双保险钳制 */
    const mtOpacity = clamp01(ramp(t, 0.7, 1.6) * (1 - ramp(t, 4.3, 5.05)));
    mtMatRef.opacity = mtOpacity;
    if (mtOpacity > 0.01) {
      let ai = 0;
      const furrowMT = ramp(t, 4.85, 5.4);
      const mtShrink = 1 - 0.5 * furrowMT;
      const endK = 0.8 - 0.22 * furrowMT;
      const midK = 0.82 - 0.2 * furrowMT;
      for (const side of [-1, 1]) {
        for (let i = 0; i < astralN; i++) {
          const dir = astralDirs[side < 0 ? i : astralN + i];
          const len = (4.4 + hash01(`asl${side}${i}`) * 1.8) * mtShrink;
          vA.copy(side < 0 ? centA.position : centB.position);
          vB.copy(dir).multiplyScalar(len).add(vA);
          if (Math.abs(vB.z) > memL * 0.8) vB.z = Math.sign(vB.z) * memL * 0.8;
          {
            const u0 = (vB.z / memL + 1) / 2;
            const rr0 = Math.max(0.05, rProfile(u0)) * endK;
            const rc = Math.hypot(vB.x, vB.y);
            if (rc > rr0) {
              const kk = rr0 / rc;
              vB.x *= kk;
              vB.y *= kk;
            }
          }
          {
            let shrink = 1;
            for (const s of [0.35, 0.55, 0.75, 0.95]) {
              const zs = vA.z + (vB.z - vA.z) * s;
              if (Math.abs(zs) >= memL * 0.98) continue;
              const us = (zs / memL + 1) / 2;
              const allowed = Math.max(0.05, rProfile(us)) * midK;
              const rs = Math.hypot(vA.x + (vB.x - vA.x) * s, vA.y + (vB.y - vA.y) * s);
              if (rs > allowed) shrink = Math.min(shrink, allowed / rs);
            }
            if (shrink < 1) {
              vB.x = vA.x + (vB.x - vA.x) * shrink;
              vB.y = vA.y + (vB.y - vA.y) * shrink;
            }
          }
          kDir.subVectors(vB, vA);
          const kl = Math.max(0.01, kDir.length());
          kMid.addVectors(vA, vB).multiplyScalar(0.5);
          kQuat.setFromUnitVectors(kUp, kDir.normalize());
          kScale.set(1, kl, 1);
          kM.compose(kMid, kQuat, kScale);
          astrals.setMatrixAt(ai++, kM);
        }
      }
      astrals.instanceMatrix.needsUpdate = true;
      astrals.visible = true;
    } else {
      astrals.visible = false;
    }

    /* 动粒微管 MI（马勒定向: 每条同源的两个姐妹动粒连向同一极） */
    const kfiberOpacity = clamp01(ramp(t, 1.15, 1.8) * (1 - ramp(t, 4.2, 4.95)));
    kfiberMatRef.opacity = kfiberOpacity;
    if (kfiberOpacity > 0.01) {
      let ki = 0;
      for (const chr of chromatids) {
        chr.group.updateMatrixWorld(true);
        // 同极双纤维: 该同源的两个动粒盘都连向 side 决定的极
        const pole = chr.side < 0 ? centA.position : centB.position;
        for (const kin of [chr.kinA, chr.kinB]) {
          vA.copy(pole);
          kin.getWorldPosition(vB);
          kDir.subVectors(vB, vA);
          const full = kDir.length();
          const len = Math.max(0.02, full - 0.05);
          if (full > 1e-4) kDir.multiplyScalar(1 / full);
          kMid.copy(vA).addScaledVector(kDir, len / 2);
          kQuat.setFromUnitVectors(kUp, kDir);
          kScale.set(1, len, 1);
          kM.compose(kMid, kQuat, kScale);
          kfibers.setMatrixAt(ki++, kM);
        }
      }
      kfibers.instanceMatrix.needsUpdate = true;
      kfibers.visible = true;
    } else {
      kfibers.visible = false;
    }

    /* 极间微管（MI 中央纺锤体） */
    const mtPolarOpacity = clamp01(ramp(t, 0.7, 1.6) * (1 - ramp(t, 4.95, 5.6)));
    mtPolarMatRef.opacity = mtPolarOpacity;
    if (mtPolarOpacity > 0.01) {
      let pi = 0;
      const furrowMT = ramp(t, 4.85, 5.4);
      const ovZ = THREE.MathUtils.lerp(1.6, 0.5, furrowMT);
      const xyComp = 1 - 0.5 * furrowMT;
      for (const side of [-1, 1]) {
        for (let i = 0; i < polarN; i++) {
          const s2 = polarSeeds[side < 0 ? i : polarN + i];
          const dir = vC.set(
            Math.cos(s2.lat) * Math.cos(s2.lon),
            Math.sin(s2.lat),
            Math.cos(s2.lat) * Math.sin(s2.lon) * 0.35,
          ).normalize();
          vA.copy(side < 0 ? centA.position : centB.position).addScaledVector(dir, 0.5);
          vB.set(-dir.x * 0.9 * xyComp, -dir.y * 0.9 * xyComp, -side * ovZ);
          {
            const u0 = (vB.z / memL + 1) / 2;
            const rr0 = Math.max(0.05, rProfile(u0)) * 0.9;
            const rc = Math.hypot(vB.x, vB.y);
            if (rc > rr0) {
              const kk = rr0 / rc;
              vB.x *= kk;
              vB.y *= kk;
            }
          }
          {
            let shrink = 1;
            for (const smp of [0.3, 0.5, 0.7, 0.9]) {
              const zs = vA.z + (vB.z - vA.z) * smp;
              if (Math.abs(zs) >= memL * 0.98) continue;
              const us = (zs / memL + 1) / 2;
              const allowed = Math.max(0.05, rProfile(us)) * 0.88;
              const rs = Math.hypot(vA.x + (vB.x - vA.x) * smp, vA.y + (vB.y - vA.y) * smp);
              if (rs > allowed) shrink = Math.min(shrink, allowed / rs);
            }
            if (shrink < 1) {
              vB.x = vA.x + (vB.x - vA.x) * shrink;
              vB.y = vA.y + (vB.y - vA.y) * shrink;
            }
          }
          kDir.subVectors(vB, vA);
          const kl = Math.max(0.01, kDir.length());
          kMid.addVectors(vA, vB).multiplyScalar(0.5);
          kQuat.setFromUnitVectors(kUp, kDir.normalize());
          kScale.set(1, kl, 1);
          kM.compose(kMid, kQuat, kScale);
          polars.setMatrixAt(pi++, kM);
        }
      }
      polars.instanceMatrix.needsUpdate = true;
      polars.visible = true;
    } else {
      polars.visible = false;
    }

    /* 动粒微管 MII（双小纺锤体: 每条染色体姐妹动粒连异极 —— 同有丝分裂） + MII 星体 */
    const kfiber2Opacity = clamp01(ramp(t, 6.5, 7.2) * (1 - ramp(t, 8.9, 9.5)));
    kfiberMat2Ref.opacity = kfiber2Opacity;
    const astral2Op = clamp01(ramp(t, 6.4, 7.1) * (1 - ramp(t, 8.8, 9.4)));
    if (kfiber2Opacity > 0.01) {
      let ki = 0;
      for (const chr of chromatids) {
        chr.group.updateMatrixWorld(true);
        // 该子细胞的两极（±y）
        const cellZ = chr.cell < 0 ? -zD1 : zD1;
        const poleTop = vC.set(chr.cell < 0 ? 0.35 : -0.35, PZ2S, cellZ);
        const poleBot = poleTop.clone().setY(-PZ2S);
        for (const [kin, pole] of [[chr.kinA, poleTop], [chr.kinB, poleBot]] as [THREE.Mesh, THREE.Vector3][]) {
          vA.copy(pole);
          kin.getWorldPosition(vB);
          kDir.subVectors(vB, vA);
          const full = kDir.length();
          const len = Math.max(0.02, full - 0.05);
          if (full > 1e-4) kDir.multiplyScalar(1 / full);
          kMid.copy(vA).addScaledVector(kDir, len / 2);
          kQuat.setFromUnitVectors(kUp, kDir);
          kScale.set(1, len, 1);
          kM.compose(kMid, kQuat, kScale);
          kfibers2.setMatrixAt(ki++, kM);
        }
      }
      kfibers2.instanceMatrix.needsUpdate = true;
      kfibers2.visible = true;
    } else {
      kfibers2.visible = false;
    }
    if (astral2Op > 0.01 && mtMatRef) {
      // 复用 mtMat 透明度通道会与 MI 星体互斥 —— MII 星体独立写入但共享材质可见性由 opacity 控制
      let ai = 0;
      for (let i = 0; i < 4; i++) {
        const c = cent2s[i];
        for (let j = 0; j < 7; j++) {
          const lat = (hash01(`a2${i}${j}`, 3) - 0.5) * 1.8;
          const lon = hash01(`a2${i}${j}`, 5) * Math.PI * 2;
          const dir = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).normalize();
          vA.copy(c.position);
          vB.copy(dir).multiplyScalar(2.2 + hash01(`a2l${i}${j}`) * 1.2).add(vA);
          // 钳制在子细胞球内 rD1 - 0.3
          const ctr = new THREE.Vector3(0, 0, i % 2 === 0 ? -zD1 : zD1);
          vB.sub(ctr);
          const dd = vB.length();
          const lim = rD1 - 0.3;
          if (dd > lim) vB.multiplyScalar(lim / dd);
          vB.add(ctr);
          kDir.subVectors(vB, vA);
          const kl = Math.max(0.01, kDir.length());
          kMid.addVectors(vA, vB).multiplyScalar(0.5);
          kQuat.setFromUnitVectors(kUp, kDir.normalize());
          kScale.set(1, kl, 1);
          kM.compose(kMid, kQuat, kScale);
          if (ai < astral2.count) astral2.setMatrixAt(ai++, kM);
        }
      }
      for (; ai < astral2.count; ai++) {
        kM.makeScale(0, 0, 0);
        astral2.setMatrixAt(ai, kM);
      }
      astral2.instanceMatrix.needsUpdate = true;
      astral2.visible = true;
    } else {
      astral2.visible = false;
    }
    // MII 星体材质透明度（与 MI mtMat 共材质时受 MI opacity 影响 —— 独立处理）
    if (astral2Op > 0.01) {
      mtMatRef.opacity = Math.max(mtMatRef.opacity, astral2Op * 0.7);
    }

    /* 核被膜: 间期 → NEBD I → MI 双子核 → NEBD II → 四配子核 */
    const nebd1 = ramp(t, 1.15, 1.85);
    const neFade = clamp01(1 - nebd1);
    neMatRef.opacity = neFade * (perf ? 0.55 : 1);
    npcMatRef.opacity = 0.85 * neFade;
    ne.visible = neFade > 0.02;
    npcs.visible = ne.visible;
    ne.scale.setScalar(1 + ramp(t, 0.2, 0.9) * 0.06);
    // 碎片: NEBD I [1.05, 2.5] + NEBD II [6.35, 7.1]（两窗复用）
    const fragLife1 = ramp(t, 1.05, 2.5);
    const fragLife2 = ramp(t, 6.35, 7.1);
    const fragOp = clamp01(Math.sin(clamp01((fragLife1 - 0.05) / 0.9) * Math.PI) * 1.2)
      + clamp01(Math.sin(clamp01((fragLife2 - 0.05) / 0.9) * Math.PI) * 1.2);
    fragMatRef.opacity = Math.min(1, fragOp);
    if (fragMatRef.opacity > 0.01) {
      frags.visible = true;
      const use2 = fragLife2 > 0.05;
      if (use2) {
        // NEBD II: 双子核位置各自爆散（简化: 以两子细胞中心为源）
        fragSeeds.forEach((fs2, i) => {
          const src = i % 2 === 0 ? -zD1 : zD1;
          const fr = 2.05 + fragLife2 * 1.8;
          pv.set(fs2.dir.x * fr, fs2.dir.y * fr * 0.85, src + fs2.dir.z * fr * 0.7);
          sc.setScalar(fs2.r);
          mm.compose(pv, qq.setFromEuler(eu.set(fs2.spin + fragLife2 * 2, fs2.spin * 2, 0)), sc);
          frags.setMatrixAt(i, mm);
        });
      } else {
        const fr = NUC_R + fragLife1 * 2.6;
        fragSeeds.forEach((fs2, i) => {
          const wob = Math.sin(uTime.value * 1.3 + fs2.spin) * 0.3;
          pv.set(fs2.dir.x * fr, fs2.dir.y * fr * 0.85, fs2.dir.z * fr * 0.7 + wob);
          sc.setScalar(fs2.r);
          mm.compose(pv, qq.setFromEuler(eu.set(fs2.spin + fragLife1 * 2, fs2.spin * 2, 0)), sc);
          frags.setMatrixAt(i, mm);
        });
      }
      frags.instanceMatrix.needsUpdate = true;
    } else {
      frags.visible = false;
    }
    // MI 双子核: 末期 I 重组 [4.15, 5.0] → NEBD II 崩解 [6.35, 7.0]
    const neReform1 = ramp(t, 4.15, 5.0);
    const nebd2 = ramp(t, 6.35, 7.0);
    dauNeMatRef.opacity = neReform1 * (1 - nebd2);
    const dauS = Math.max(0.001, 0.3 + neReform1 * 0.7);
    dauNeA.position.set(0, 0, -zD1);
    dauNeB.position.set(0, 0, zD1);
    dauNeA.scale.setScalar(dauS);
    dauNeB.scale.setScalar(dauS);
    dauNeA.visible = dauNeMatRef.opacity > 0.02;
    dauNeB.visible = dauNeA.visible;
    // 四配子核: 末期 II 重组 [8.55, 9.4]
    const neReform2 = ramp(t, 8.55, 9.4);
    quadNeMatRef.opacity = neReform2;
    for (let i = 0; i < 4; i++) {
      const m = quadNes[i];
      m.visible = neReform2 > 0.02;
      m.position.set(0, i < 2 ? -yG * 0.82 : yG * 0.82, i % 2 === 0 ? -zD2 : zD2);
      m.scale.setScalar(Math.max(0.001, 0.3 + neReform2 * 0.7));
    }

    /* 细胞器分配（双段: MI → 两子细胞; MII → 四配子） */
    const part1 = ramp(t, 3.4, 5.4); // MI 后-末期间两极迁移
    const part2 = ramp(t, 8.3, 9.3); // MII 后-末期间四配子迁移
    const clampCell = (v: THREE.Vector3, margin: number) => {
      if (mem1Fade > 0.05) {
        const zLim = memL * 0.94;
        if (Math.abs(v.z) > zLim) v.z = Math.sign(v.z) * zLim;
        const u = (v.z / memL + 1) / 2;
        const rr = Math.max(0.12, rProfile(u) * 0.97 - margin);
        const rc = Math.hypot(v.x, v.y);
        if (rc > rr) {
          const kk = rr / rc;
          v.x *= kk;
          v.y *= kk;
        }
      }
      if (dau1Fade > 0.05 && mem2Fade > 0.05) {
        // 双子膜期: 回转面钳（y morph 后按 y-L2 / xz-r2）或球期
        const cellZ = v.z >= 0 ? zD1 : -zD1;
        const rel = vC.set(v.x, v.y, v.z - cellZ);
        if (miiMorph > 0.5) {
          // y 轴哑铃回转面
          if (Math.abs(rel.y) > L2 * rD1 * 0.94) rel.y = Math.sign(rel.y) * L2 * rD1 * 0.94;
          const vv = (rel.y / (L2 * rD1) + 1) / 2;
          const rr = Math.max(0.12, r2(vv) * rD1 * 0.97 - margin);
          const rc = Math.hypot(rel.x, rel.z);
          if (rc > rr) {
            const kk = rr / rc;
            rel.x *= kk;
            rel.z *= kk;
          }
        } else {
          const dd = rel.length();
          const lim = Math.max(0.3, rD1 - margin - 0.12);
          if (dd > lim) {
            const kk = lim / dd;
            rel.multiplyScalar(kk);
          }
        }
        v.set(rel.x, rel.y, cellZ + rel.z);
      }
      if (dau2Fade > 0.05) {
        // 四配子球期
        const sy = v.y >= 0 ? 1 : -1;
        const sz = v.z >= 0 ? 1 : -1;
        const ctr = vC.set(0, sy * yG, sz * zD2);
        const rel = new THREE.Vector3(v.x, v.y - sy * yG, v.z - sz * zD2);
        const dd = rel.length();
        const lim = Math.max(0.25, rG - margin - 0.1);
        if (dd > lim) {
          const kk = lim / dd;
          rel.multiplyScalar(kk);
          v.set(rel.x, ctr.y + rel.y, ctr.z + rel.z);
        }
      }
    };
    {
      mitoSeeds.forEach((ms, i) => {
        const drift = Math.sin(uTime.value * 0.5 + ms.phase) * 0.35;
        const toZ1 = ms.side * THREE.MathUtils.lerp(2.2, 5.2, ramp(t, 4.4, 5.4));
        const toY2 = ms.sideY * THREE.MathUtils.lerp(0.4, 2.6, part2);
        pv.set(
          Math.cos(ms.ang) * ms.rad * (1 - part1 * 0.32 - part2 * 0.4) + drift,
          ms.y * (1 - part1 * 0.4) * (1 - part2 * 0.5) + toY2 + drift * 0.6,
          THREE.MathUtils.lerp(0, toZ1, part1),
        );
        clampCell(pv, 0.85);
        mm.compose(pv, qq.setFromEuler(ms.rot), one);
        mitos.setMatrixAt(i, mm);
      });
      mitos.instanceMatrix.needsUpdate = true;
      vesSeeds.forEach((vs2, i) => {
        const toZ1 = vs2.side * THREE.MathUtils.lerp(2.0, 4.9, ramp(t, 4.4, 5.4));
        const toY2 = vs2.sideY * THREE.MathUtils.lerp(0.3, 2.4, part2);
        pv.set(
          Math.cos(vs2.ang) * vs2.rad * (1 - part1 * 0.35 - part2 * 0.42),
          vs2.y * (1 - part1 * 0.45) * (1 - part2 * 0.5) + toY2,
          THREE.MathUtils.lerp(0, toZ1, part1),
        );
        clampCell(pv, 0.3);
        sc.setScalar(vs2.r);
        mm.compose(pv, qq.identity(), sc);
        vesicles.setMatrixAt(i, mm);
      });
      vesicles.instanceMatrix.needsUpdate = true;
      ribSeeds.forEach((rs2, i) => {
        const toZ1 = rs2.side * THREE.MathUtils.lerp(1.5, 5.3, ramp(t, 4.2, 5.4));
        const toY2 = rs2.sideY * THREE.MathUtils.lerp(0.2, 2.5, part2);
        pv.set(
          Math.cos(rs2.ang) * rs2.rad * (1 - part1 * 0.3 - part2 * 0.45),
          rs2.y * (1 - part1 * 0.5) * (1 - part2 * 0.55) + toY2,
          THREE.MathUtils.lerp(0, toZ1, part1),
        );
        clampCell(pv, 0.2);
        sc.setScalar(0.8 + hash01(`rsz${i}`) * 0.5);
        mm.compose(pv, qq.identity(), sc);
        ribos.setMatrixAt(i, mm);
      });
      ribos.instanceMatrix.needsUpdate = true;
    }

    /* 高尔基: 间期主栈 → 前中期碎片化 → 四配子迷你栈重建 */
    const golgiFadeOut = 1 - ramp(t, 1.2, 2.2);
    const golgiReform = ramp(t, 8.6, 9.5);
    golgiStackMatRef.opacity = clamp01(Math.max(golgiFadeOut, golgiReform)) * 0.9;
    golgiMain.visible = golgiFadeOut > 0.02;
    for (let i = 0; i < 4; i++) {
      const g = golgiQuads[i];
      g.visible = golgiReform > 0.02;
      if (g.visible) {
        const sy = i < 2 ? -1 : 1;
        const sz = i % 2 === 0 ? -1 : 1;
        const gg = THREE.MathUtils.lerp(yG * 0.7, yG * 0.8, ramp(t, 9.3, 10.9));
        g.position.set(1.05 * sz, sy * gg + 0.35, sz * (zD2 - 0.85));
        g.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.82, 0.26, sz * 0.51).normalize()));
      }
    }

    /* RER 冠: 间期 → 前期回缩（NEBD 管网化语义）; 末期 II 配子核迷你冠省略（配子 RER 稀疏 —— 科学合理） */
    const rerFadeOut = 1 - ramp(t, 0.8, 1.8);
    rerMatRef.opacity = clamp01(rerFadeOut) * 0.88;
    rerRibMat.opacity = clamp01(rerFadeOut);
    rerCrown.mesh.visible = rerFadeOut > 0.02;
    rerCrown.ribos.visible = rerCrown.mesh.visible;

    /* 收缩环: MI 单环 [4.75, 5.5] + MII 双环 [8.7, 9.4] */
    const furrow1K = ramp(t, 4.75, 5.45);
    ringMatRef.opacity = clamp01(ramp(t, 4.55, 5.1) * (1 - ramp(t, 5.35, 5.7))) * 0.9;
    const eqR1 = Math.max(0.32, rProfile(0.5));
    furrowRing.scale.set(eqR1, eqR1, 0.75 + furrow1K * 0.4);
    const squeeze1 = 1 - Math.sin(uTime.value * 2.2) * 0.02 * (furrow1K > 0 && furrow1K < 1 ? 1 : 0);
    furrowRing.scale.x *= squeeze1;
    furrowRing.scale.y *= squeeze1;
    furrowRing.visible = ringMatRef.opacity > 0.02;
    const furrow2K = ramp(t, 8.7, 9.35);
    ringMat2Ref.opacity = clamp01(ramp(t, 8.5, 9.0) * (1 - ramp(t, 9.25, 9.55))) * 0.85;
    for (let i = 0; i < 2; i++) {
      const m = furrowRings2[i];
      m.visible = ringMat2Ref.opacity > 0.02;
      if (!m.visible) continue;
      const cellZ = i === 0 ? -zD1 : zD1;
      // 环半径: 子细胞 y 哑铃赤道处半径（r2(0.5)·rD1）
      const eqR2 = Math.max(0.25, r2(0.5) * rD1);
      m.position.set(0, 0, cellZ);
      const sq2 = 1 - Math.sin(uTime.value * 2.4 + i) * 0.02 * (furrow2K > 0 && furrow2K < 1 ? 1 : 0);
      m.scale.setScalar(Math.max(0.05, eqR2 * sq2));
    }

    /* QA 插桩（Task 50: 逐帧真源 —— 时钟/相位/染色体位置; 仅显式探测时写入零成本） */
    if (typeof window !== 'undefined' && (window as { __meiQaProbe?: boolean }).__meiQaProbe) {
      (window as unknown as { __meiQa?: unknown }).__meiQa = {
        t,
        chrom: chromatids.map((c) => ({ pos: c.group.position.toArray(), cA: c.cA.position.z, cB: c.cB.position.z, side: c.side, cell: c.cell })),
        memOpacity: memMatRef.opacity,
        dauOp: memDauMatARef.opacity,
        quadOp: memQuadMatRef.opacity,
        chiasmaOp: chiasmaMat.opacity,
      };
    }
  };

  /* ---------- 相位感知悬停目标 ---------- */
  const targets = (phase: number): HoverTarget[] => {
    const T: HoverTarget[] = [];
    const cR = Math.cos(ROT_Y), sR = Math.sin(ROT_Y);
    const push = (zh: string, latin: string, lx: number, ly: number, lz: number, r: number) =>
      T.push({ zh, latin, pos: { x: lx * cR + lz * sR, y: ly, z: -lx * sR + lz * cR }, r });
    const PZ = poleZ(Math.min(11, PHASE_BOUNDS[phase] + 0.4));
    const zD1A = 6.0;
    const yGA = 4.6;
    // 常驻: MI 中心体（间期后）
    if (phase >= 1 && phase <= 6) {
      push('中心体（中心粒对）', 'Centrosome', 0.5, 0, -PZ, 1.8);
      push('中心体（中心粒对）', 'Centrosome', -0.5, 0, PZ, 1.8);
    }
    if (phase === 0) {
      push('细胞核（核被膜）', 'Nuclear envelope', 0, 0, 0, 3.6);
      push('染色质（松散纤维）', 'Chromatin', 1.2, 0.8, -0.6, 2.4);
      push('复制叉（DNA 复制中）', 'Replication forks', -1.1, -0.7, 0.9, 2.0);
      push('核仁', 'Nucleolus', 0.6, 0.7, -0.5, 1.6);
      push('粗面内质网（核糖体冠）', 'Rough ER', -2.35, 1.5, -2.9, 2.2);
      push('高尔基体（扁平囊堆）', 'Golgi apparatus', 2.72, -0.83, 2.63, 2.0);
      push('中心体（已复制, 贴核）', 'Centrosome', 0.5, 1.1, 1.5, 1.8);
    }
    if (phase === 1) {
      // 联会中的同源对（两三对代表锚 —— 环带分布处）
      push('联会中的同源染色体对', 'Synapsing homologs', 1.6, 1.1, 0.3, 2.6);
      push('联会中的同源染色体对', 'Synapsing homologs', -2.0, -0.6, -0.2, 2.6);
      push('交叉（chiasmata · 互换）', 'Chiasma', 0.4, 1.6, 0.2, 1.5);
      push('交叉（chiasmata · 互换）', 'Chiasma', -0.7, -1.5, 0, 1.5);
      push('联会复合体（对齐）', 'Synaptonemal complex', 1.2, 0, 0, 2.4);
    }
    if (phase >= 2 && phase <= 3) {
      push('核被膜崩解碎片', 'NE fragments', 2.9, 1.8, 1.4, 2.6);
      push('纺锤体微管', 'Spindle microtubules', 0, 0, 0, 2.8);
      push('星体微管', 'Astral microtubules', 0, 0, -PZ * 1.05, 2.4);
      push('星体微管', 'Astral microtubules', 0, 0, PZ * 1.05, 2.4);
      push('极微管（中央重叠区）', 'Polar microtubules', 0, 0, 0, 1.8);
    }
    if (phase >= 1 && phase <= 3) {
      // 四分体/凝聚中染色体（跟随环带分布）
      push('四分体（同源配对）', 'Bivalent (tetrad)', 2.0, 1.1, 0, 2.4);
      push('四分体（同源配对）', 'Bivalent (tetrad)', -2.3, -0.9, 0, 2.4);
      push('父本染色体（暖调）', 'Paternal homolog', 2.6, 1.0, 0.3, 1.6);
      push('母本染色体（冷调）', 'Maternal homolog', -2.9, -1.0, -0.3, 1.6);
    }
    if (phase === 3) {
      push('赤道板（中期板 Ⅰ）', 'Metaphase plate I', 0, 0, 0, 2.6);
      push('着丝粒 · 动粒（同极连）', 'Kinetochore (co-oriented)', 2.0, 1.1, 0.2, 1.4);
      push('动粒微管（马勒定向）', 'K-fibers (bi-orientation)', 1.2, 0.7, -2.4, 2.2);
    }
    if (phase === 4) {
      push('同源染色体分离', 'Homolog segregation', 0, 0, -PZ * 0.55, 2.6);
      push('同源染色体分离', 'Homolog segregation', 0, 0, PZ * 0.55, 2.6);
      push('姐妹单体仍黏合（Rec8）', 'Cohesin protected', 1.6, 1.0, 0, 1.8);
      push('纺锤体拉长（极分离）', 'Spindle elongation', 0, 0, 0, 2.4);
    }
    if (phase >= 4 && phase <= 6) {
      push('子代核被膜（重组）', 'Daughter envelope', 0, 0, -4.5, 2.2);
      push('子代核被膜（重组）', 'Daughter envelope', 0, 0, 4.5, 2.2);
    }
    if (phase >= 5 && phase <= 7) {
      push('保持凝聚的染色体', 'Condensed chromosomes', 1.4, 0.9, -4.2, 2.0);
      push('保持凝聚的染色体', 'Condensed chromosomes', -1.4, -0.9, 4.2, 2.0);
    }
    if (phase === 6) {
      push('收缩环（actomyosin）', 'Contractile ring', 3.4, 0, 0, 2.2);
      push('次级细胞 ×2（n · 2C）', 'Secondary cells', 0, 0, -5.6, 3.2);
      push('次级细胞 ×2（n · 2C）', 'Secondary cells', 0, 0, 5.6, 3.2);
    }
    if (phase === 7) {
      push('间期 Ⅱ 核（无复制）', 'Interkinesis nucleus', 0, 0, -6.0, 2.4);
      push('间期 Ⅱ 核（无复制）', 'Interkinesis nucleus', 0, 0, 6.0, 2.4);
      push('无 S 期（无复制叉）', 'No S phase', 1.6, 0.8, -5.8, 1.8);
    }
    if (phase === 8) {
      push('MⅡ 纺锤体（双）', 'Meiosis II spindles', 0.6, 0, -zD1A, 2.4);
      push('MⅡ 纺锤体（双）', 'Meiosis II spindles', -0.6, 0, zD1A, 2.4);
      push('中期 Ⅱ 染色体', 'Metaphase II chromosomes', 1.2, 0, -zD1A + 0.6, 2.0);
      push('中期 Ⅱ 染色体', 'Metaphase II chromosomes', -1.2, 0, zD1A - 0.6, 2.0);
    }
    if (phase === 9) {
      push('姐妹染色单体分离', 'Sister chromatids', 0, -2.2, -zD1A, 2.4);
      push('姐妹染色单体分离', 'Sister chromatids', 0, 2.2, -zD1A, 2.4);
      push('姐妹染色单体分离', 'Sister chromatids', 0, -2.2, zD1A, 2.4);
      push('姐妹染色单体分离', 'Sister chromatids', 0, 2.2, zD1A, 2.4);
      push('着丝粒 Rec8 切割', 'Rec8 cleavage', 1.4, 0, -zD1A, 1.8);
    }
    if (phase === 10) {
      push('双收缩环（同步缢裂）', 'Twin contractile rings', 2.8, 0, -zD1A, 2.0);
      push('双收缩环（同步缢裂）', 'Twin contractile rings', -2.8, 0, zD1A, 2.0);
      push('四个子核（重组中）', 'Four nuclei', 0, -yGA * 0.7, -6.2, 2.0);
      push('四个子核（重组中）', 'Four nuclei', 0, yGA * 0.7, -6.2, 2.0);
    }
    if (phase === 11) {
      push('配子（单倍体 n）', 'Gamete (haploid)', 0, -yGA, -6.5, 3.2);
      push('配子（单倍体 n）', 'Gamete (haploid)', 0, -yGA, 6.5, 3.2);
      push('配子（单倍体 n）', 'Gamete (haploid)', 0, yGA, -6.5, 3.2);
      push('配子（单倍体 n）', 'Gamete (haploid)', 0, yGA, 6.5, 3.2);
      push('配子核（去凝聚）', 'Gamete nucleus', 0, -yGA * 0.82, -6.5, 2.0);
      push('配子迷你高尔基', 'Gamete Golgi', 1.1, -yGA + 0.35, -5.7, 1.6);
      // 细胞器随配子
      push('线粒体（暖古铜）', 'Mitochondrion', 1.8, -yGA + 0.8, -6.2, 1.4);
      push('线粒体（暖古铜）', 'Mitochondrion', -1.6, yGA - 0.6, 6.1, 1.4);
      push('独立分配（父/母混编）', 'Independent assortment', 2.6, 0, 0, 2.6);
    }
    return T;
  };

  const dispose = () => {
    for (const d of disposables) d.dispose();
    group.clear();
  };

  return { group, update, targets, dispose };
}

/* ============ React 组件（时钟驱动 + 相位上报） ============ */

export const MeiosisStage = ({ playing, speed, seek, onPhaseChange, onEnded, showAnatomy, perf, onProgress }: {
  playing: boolean;
  speed: number;
  seek: { phase: number; nonce: number } | null;
  onPhaseChange: (phase: number) => void;
  onEnded: () => void;
  showAnatomy: boolean;
  perf: boolean;
  onProgress?: (frac: number) => void;
}) => {
  const clock = useRef(0);
  const lastPhase = useRef(-1);
  const lastSeek = useRef(0);
  const [phase, setPhase] = useState(0);
  const build = useMemo(() => buildMeiosisScene(perf), [perf]);
  useEffect(() => () => build.dispose(), [build]);
  // QA 时钟写入钩（同 MitosisStage）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as unknown as { __meiSeekT?: (t: number) => void }).__meiSeekT = (t: number) => {
      clock.current = Math.max(0, Math.min(11, t));
    };
    return () => {
      delete (window as unknown as { __meiSeekT?: (t: number) => void }).__meiSeekT;
    };
  }, []);

  useFrame((_, dt) => {
    const d = Math.min(0.1, dt);
    if (seek && seek.nonce !== lastSeek.current) {
      lastSeek.current = seek.nonce;
      clock.current = PHASE_BOUNDS[seek.phase] + 0.03;
      lastPhase.current = seek.phase;
      setPhase(seek.phase);
      onPhaseChange(seek.phase);
    }
    if (playing) {
      clock.current = Math.min(11, clock.current + (d * speed) / MEIOSIS_PHASE_SECONDS);
      if (clock.current >= 11) {
        onEnded();
      }
    }
    const p = phaseOf(clock.current);
    if (p !== lastPhase.current) {
      lastPhase.current = p;
      setPhase(p);
      onPhaseChange(p);
    }
    onProgress?.(clock.current / 11);
    build.update(clock.current, d);
    // QA 插桩: update() 内已写入详细数据（t/chrom/chiasma/膜层透明度）—— 此处仅补相位号
    if (typeof window !== 'undefined' && (window as { __meiQaProbe?: boolean }).__meiQaProbe) {
      const prev = (window as unknown as { __meiQa?: { t: number; phase?: number } }).__meiQa;
      if (prev) prev.phase = phase;
    }
  });

  const hoverTargets = useMemo(() => build.targets(phase), [build, phase]);

  return (
    <>
      <primitive object={build.group} />
      <OrganelleHoverLayer targets={hoverTargets} enabled={showAnatomy} locate={null} />
    </>
  );
};
