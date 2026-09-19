/**
 * 3D 径向布局引擎 —— 将核心子图映射到球状虚拟细胞的区室结构
 * 科学依据（真核细胞区室化，Alberts MBoC Ch.1/12）:
 *   配体扩散于胞外 → 结合膜受体（跨膜区锚定于脂双层）→ 胞质激酶级联径向向内转导
 *   → 转录因子经核孔入核 → 靶基因转录
 * 每条受体分支按经度聚类形成"信号光束"，用户可清晰追踪单条通路级联。
 */
import type { CoreNode, CoreEdge } from '@/types/kegg';
import type { MorphologyKey as CellMorphKey } from '@/data/cell-types';
import { nucleusCenter, nucleusFactor, nucleusRayExit, shapeFactor, type ShapeKind } from './cell-shape';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 确定性伪随机（保证布局稳定，不随渲染抖动） */
function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export interface CellBodySpec {
  /** 质膜基础半径（模型单位; 实际表面 = R × 形状函数 + FBM） */
  membraneR: number;
  /** 核被膜半径 */
  nucleusR: number;
  /** 细胞类型形状（形态学差异化的核心; 见 cell-shape.ts） */
  shape: ShapeKind;
  /** 全景机位距离（按形状最大延伸调校） */
  viewDist: number;
  mitoCount: number;
  erSheets: number;
  vesicleCount: number;
  microtubules: number;
  nucleolus: { count: number; r: number };
  /** 肝细胞糖原颗粒 */
  glycogen?: boolean;
  /** 肝细胞胆小管（顶面局部管道凹陷 + 微绒毛圈） */
  bileCanaliculus?: boolean;
  /** 上皮细胞顶端微绒毛 */
  microvilli?: boolean;
  /** 上皮顶端极性（微绒毛集中顶面 + 基底膜片） */
  apicalPolarity?: boolean;
  /** 上皮基底膜（基底层薄网片） */
  basalLamina?: boolean;
  /** 成纤维细胞胞外胶原纤维 */
  collagen?: boolean;
  /** 成纤维应力纤维（沿长轴平行粗 actin 束 + 两端黏着斑） */
  stressFibers?: boolean;
  /** 癌细胞膜出芽 */
  blebs?: boolean;
  /** 癌细胞不规则核（多形性） */
  nucleusBumpy?: boolean;
  /** 神经元锥体胞体 + 顶端树突丛 + 髓鞘轴突 */
  neurites?: boolean;
  /** 神经元顶端树突丛（主树 + 顶丛分叉） */
  apicalTuft?: boolean;
  /** 上皮紧密连接带 */
  tightJunction?: boolean;
  /** 心肌肌原纤维束 + 肌节横纹 */
  striated?: boolean;
  /** 心肌闰盘（端-端阶梯盘 + 缝隙连接亮点） */
  intercalated?: boolean;
  /** T 细胞表面微褶皱（全表面短刺） */
  surfaceFolds?: boolean;
  /** 心肌 T 小管 + 肌浆网（Z 线位周期内陷 + 终端池 + 纵行网管） */
  ttubules?: boolean;
  /** 神经元突触扣结（轴突末端 + 结旁 en-passant, 含囊泡簇） */
  synapticBoutons?: boolean;
  /** 癌细胞微核（CIN 表型, 含破裂被膜 + 胞质 DNA 溢出） */
  micronuclei?: boolean;
  /** T 细胞 TCR/CD3 膜面微簇 */
  tcrClusters?: boolean;
  /** 上皮终末网（微绒毛根部横行微丝网） */
  terminalWeb?: boolean;
  /** 上皮侧膜桥粒斑块（中间丝锚定） */
  desmosomes?: boolean;
  /** 溶酶体数量（酸性水解酶细胞器） */
  lysosomeCount: number;
  /** 过氧化物酶体数量（过氧化氢酶晶体核心） */
  peroxisomeCount: number;
  /** 胞质脂滴（肝/心肌/癌细胞代谢储存） */
  lipidDroplets?: boolean;
}

/** 各细胞类型的 3D 形态学参数（形状差异由 cell-shape.ts 类型化函数承担, 直径参考 KEGG/Cell Biology） */
export const CELL_BODY_SPECS: Record<CellMorphKey, CellBodySpec> = {
  hepatocyte: {
    membraneR: 10, nucleusR: 4.1, shape: 'polyhedral', viewDist: 31,
    mitoCount: 9, erSheets: 4, vesicleCount: 14, microtubules: 12,
    nucleolus: { count: 1, r: 0.95 }, glycogen: true, bileCanaliculus: true,
    lysosomeCount: 5, peroxisomeCount: 6, lipidDroplets: true,
  },
  neuron: {
    membraneR: 10, nucleusR: 3.9, shape: 'pyramidal', viewDist: 33,
    mitoCount: 6, erSheets: 2, vesicleCount: 10, microtubules: 14,
    nucleolus: { count: 1, r: 0.9 }, neurites: true, apicalTuft: true, synapticBoutons: true,
    lysosomeCount: 4, peroxisomeCount: 3,
  },
  tcell: {
    membraneR: 8.6, nucleusR: 5.2, shape: 'sphere', viewDist: 27,
    mitoCount: 4, erSheets: 1, vesicleCount: 6, microtubules: 8,
    nucleolus: { count: 1, r: 0.85 }, surfaceFolds: true, tcrClusters: true,
    lysosomeCount: 3, peroxisomeCount: 2,
  },
  epithelial: {
    membraneR: 11, nucleusR: 4.0, shape: 'columnar', viewDist: 30,
    mitoCount: 6, erSheets: 3, vesicleCount: 12, microtubules: 10,
    nucleolus: { count: 1, r: 0.85 }, microvilli: true, apicalPolarity: true,
    tightJunction: true, basalLamina: true, terminalWeb: true, desmosomes: true,
    lysosomeCount: 4, peroxisomeCount: 3,
  },
  cardiomyocyte: {
    membraneR: 9, nucleusR: 3.6, shape: 'rod', viewDist: 37,
    mitoCount: 16, erSheets: 2, vesicleCount: 8, microtubules: 8,
    nucleolus: { count: 2, r: 0.7 }, striated: true, intercalated: true, ttubules: true,
    lysosomeCount: 4, peroxisomeCount: 5, lipidDroplets: true,
  },
  fibroblast: {
    membraneR: 10.5, nucleusR: 3.9, shape: 'spindle', viewDist: 35,
    mitoCount: 5, erSheets: 4, vesicleCount: 8, microtubules: 10,
    nucleolus: { count: 1, r: 0.85 }, collagen: true, stressFibers: true,
    lysosomeCount: 3, peroxisomeCount: 2,
  },
  cancer: {
    membraneR: 10.2, nucleusR: 4.5, shape: 'amoeboid', viewDist: 32,
    mitoCount: 7, erSheets: 2, vesicleCount: 16, microtubules: 12,
    nucleolus: { count: 3, r: 0.75 }, blebs: true, nucleusBumpy: true, micronuclei: true,
    lysosomeCount: 7, peroxisomeCount: 3, lipidDroplets: true,
  },
};

/** 分子可视半径（模型单位） */
const NODE_R: Record<string, number> = {
  ligand: 0.34, receptor: 0.42, channel: 0.4, tf: 0.34, gene: 0.3,
  compound: 0.3, gtpase: 0.36, adapter: 0.33, phosphatase: 0.34,
  kinase: 0.38, enzyme: 0.35,
};

/** 边端点外推半径（避免线段插入分子球内部） */
const EDGE_PAD: Record<string, number> = {
  ligand: 0.42, receptor: 0.62, channel: 0.55, tf: 0.4, gene: 0.36,
  compound: 0.36, gtpase: 0.42, adapter: 0.4, phosphatase: 0.4,
  kinase: 0.44, enzyme: 0.42,
};

export interface Node3D extends CoreNode {
  pos: Vec3;
  r: number;
  pad: number;
  /** 膜法向（受体/通道） */
  normal?: Vec3;
  cluster: string;
}

export interface Edge3D extends CoreEdge {
  points: Vec3[];
  length: number;
}

function sph(r: number, lat: number, lon: number): Vec3 {
  return {
    x: r * Math.cos(lat) * Math.cos(lon),
    y: r * Math.sin(lat),
    z: r * Math.cos(lat) * Math.sin(lon),
  };
}

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

export function layout3D(
  nodes: CoreNode[],
  edges: CoreEdge[],
  morph: CellMorphKey,
): { nodes: Node3D[]; edges: Edge3D[]; spec: CellBodySpec } {
  const spec = CELL_BODY_SPECS[morph];
  const R = spec.membraneR;
  const N = spec.nucleusR;
  // 形状因子（方向 → 半径倍率）: 受体贴真实膜面 / 配体外带 / 胞质壳层随形状收缩 ——
  // 与 organelles.tsx 的 cellSurf 同源（cell-shape.ts 唯一真源），分子永远在正确的区室位置
  const shapeF = (lat: number, lon: number): number =>
    shapeFactor(
      { x: Math.cos(lat) * Math.cos(lon), y: Math.sin(lat), z: Math.cos(lat) * Math.sin(lon) },
      spec.shape,
    );
  // v6 核形状体系: 核中心偏移 + 成形核面半径 + 射线避核（与 organelles.tsx 同源）
  const nucC = nucleusCenter(spec.shape, R);
  const nucF = (lat: number, lon: number): number =>
    nucleusFactor(
      { x: Math.cos(lat) * Math.cos(lon), y: Math.sin(lat), z: Math.cos(lat) * Math.sin(lon) },
      spec.shape,
    );
  const nucExit = (lat: number, lon: number): number =>
    nucleusRayExit(
      { x: Math.cos(lat) * Math.cos(lon), y: Math.sin(lat), z: Math.cos(lat) * Math.sin(lon) },
      spec.shape, N, R,
    );
  // 核内世界坐标: 自核中心沿 (lat,lon) 方向取核面半径的 frac 倍（TF/靶基因落入成形核内含偏移）
  const nucWorld = (lat: number, lon: number, frac: number): Vec3 => {
    const f = Math.max(0.08, nucF(lat, lon) * Math.min(1, Math.max(0, frac)));
    return {
      x: nucC.x + Math.cos(lat) * Math.cos(lon) * N * f,
      y: nucC.y + Math.sin(lat) * N * f,
      z: nucC.z + Math.cos(lat) * Math.sin(lon) * N * f,
    };
  };

  const byId = new Map(nodes.map((n) => [n.id, n]));

  // ---- 受体分支聚类（BFS 自受体沿信号流方向）----
  const downstream = new Map<string, string[]>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    if (!downstream.has(e.source)) downstream.set(e.source, []);
    downstream.get(e.source)!.push(e.target);
  }
  const clusterOf = new Map<string, string>();
  const receptors = nodes.filter((n) => n.tier === 1).sort((a, b) => a.label.localeCompare(b.label));
  const queue: string[] = [];
  for (const r of receptors) {
    clusterOf.set(r.id, r.id);
    queue.push(r.id);
  }
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of downstream.get(cur) ?? []) {
      if (clusterOf.has(next)) continue;
      clusterOf.set(next, clusterOf.get(cur) ?? cur);
      queue.push(next);
    }
  }
  const fallbackCluster = receptors[0]?.id ?? '';
  for (const n of nodes) if (!clusterOf.has(n.id)) clusterOf.set(n.id, fallbackCluster);

  // ---- 受体经纬度（赤道带均匀分布）----
  const recAngles = new Map<string, { lon: number; lat: number }>();
  const n = receptors.length;
  receptors.forEach((r, i) => {
    const lon = n === 1 ? Math.PI * 0.25 : (i * Math.PI * 2) / n + Math.PI * 0.125;
    const lat = ((i % 3) - 1) * 0.24;
    recAngles.set(r.id, { lon, lat });
  });

  // ---- 配体锚定到其受体 ----
  const ligandAnchor = new Map<string, string>();
  for (const l of nodes.filter((x) => x.tier === 0)) {
    const targets = downstream.get(l.id) ?? [];
    const rec = targets.find((t) => recAngles.has(t));
    if (rec) ligandAnchor.set(l.id, rec);
  }
  // v37 共锚配体扇开槽位（同一受体的多条配体（如 EGF/TGFA→EGFR）旧版同角度锚定 → 屏向完全重叠）
  const ligandGroupCount = new Map<string, number>();
  for (const l of nodes.filter((x) => x.tier === 0)) {
    const rec = ligandAnchor.get(l.id) ?? '';
    ligandGroupCount.set(rec, (ligandGroupCount.get(rec) ?? 0) + 1);
  }
  const ligandSlot = new Map<string, number>();
  const ligandCursor = new Map<string, number>();
  for (const l of [...nodes.filter((x) => x.tier === 0)].sort((a, b) => a.label.localeCompare(b.label))) {
    const rec = ligandAnchor.get(l.id) ?? '';
    const k = ligandCursor.get(rec) ?? 0;
    ligandCursor.set(rec, k + 1);
    ligandSlot.set(l.id, k);
  }

  // ---- 簇内胞质分子布局 ----
  // 收集每簇每层成员，围绕受体经度展开（形成径向信号束）
  const clusterMembers = new Map<string, CoreNode[]>();
  for (const node of nodes) {
    if (node.tier < 2 || node.tier > 4) continue;
    const c = clusterOf.get(node.id) ?? fallbackCluster;
    if (!clusterMembers.has(c)) clusterMembers.set(c, []);
    clusterMembers.get(c)!.push(node);
  }
  const cytoOffset = new Map<string, { dLon: number; dLat: number }>();
  for (const [c, members] of clusterMembers) {
    members.sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label));
    // v37: 纬度行程自适应压缩（成员多时不再溢出 ±0.82 钳位成堆）+ 同层经度错列
    //   （旧版线性 0.235 步长在成员 ≥8 时越出钳位带 → 束尾堆叠, 松弛收敛难）
    const latStep = Math.min(0.235, 1.68 / Math.max(1, members.length - 1));
    members.forEach((m, idx) => {
      const dLon = (hash01(m.id, 7) - 0.5) * 0.85 + ((idx % 3) - 1) * 0.3;
      const dLat = (idx - (members.length - 1) / 2) * latStep + (hash01(m.id, 13) - 0.5) * 0.1;
      cytoOffset.set(m.id, { dLon, dLat });
    });
  }

  // ---- 核内布局（TF 外环 / 靶基因内环，经度跟随簇）----
  const tfs = nodes.filter((x) => x.tier === 5).sort((a, b) => a.label.localeCompare(b.label));
  const genes = nodes.filter((x) => x.tier === 6).sort((a, b) => a.label.localeCompare(b.label));
  const nucOffset = new Map<string, { lon: number; lat: number }>();
  const clusterLon = (id: string): number => {
    const c = clusterOf.get(id) ?? fallbackCluster;
    return recAngles.get(c)?.lon ?? Math.PI * 0.5;
  };
  tfs.forEach((t, i) => {
    nucOffset.set(t.id, {
      lon: clusterLon(t.id) + (i - (tfs.length - 1) / 2) * 0.42,
      lat: 0.5 + (i % 3) * 0.28 - 0.28,
    });
  });
  genes.forEach((g, i) => {
    nucOffset.set(g.id, {
      lon: clusterLon(g.id) + (i - (genes.length - 1) / 2) * 0.55 + 0.3,
      lat: -0.4 + (i % 3) * 0.3,
    });
  });

  // ---- 汇总节点位置 ----
  const positions = new Map<string, Vec3>();
  for (const node of nodes) {
    if (node.tier === 0) {
      const rec = ligandAnchor.get(node.id);
      const ang = rec
        ? { ...recAngles.get(rec)! }
        : { lon: Math.PI * 0.5, lat: 0.1 };
      // v37: 共锚配体角向扇开（经度等距 + 纬度上下交错 → 胞外配体标签互不压叠）
      const m = ligandGroupCount.get(rec ?? '') ?? 1;
      if (m > 1) {
        const k = ligandSlot.get(node.id) ?? 0;
        ang.lon += (k - (m - 1) / 2) * 0.36;
        ang.lat += (k % 2 === 0 ? 1 : -1) * 0.09 * Math.ceil(k / 2);
      }
      positions.set(node.id, sph((R * 1.235 + hash01(node.id, 3) * 0.5) * shapeF(ang.lat, ang.lon), ang.lat, ang.lon));
    } else if (node.tier === 1) {
      const ang = recAngles.get(node.id) ?? { lon: Math.PI * 0.5, lat: 0 };
      positions.set(node.id, sph(R * shapeF(ang.lat, ang.lon), ang.lat, ang.lon));
    } else if (node.tier >= 2 && node.tier <= 4) {
      const ang = recAngles.get(clusterOf.get(node.id) ?? '') ?? { lon: Math.PI * 0.5, lat: 0.15 };
      const off = cytoOffset.get(node.id) ?? { dLon: 0, dLat: 0 };
      const shellF = node.tier === 2 ? 0.845 : node.tier === 3 ? 0.715 : 0.59;
      const lat = Math.max(-0.82, Math.min(0.82, ang.lat + off.dLat));
      const lon = ang.lon + off.dLon;
      // v6: 球形 N+0.85 避核改为射线避核（长形核在长轴方向占径更大, 窄向更小 —— 分子不再悬空/穿核）
      const rr = Math.max(R * shellF * shapeF(lat, lon), nucExit(lat, lon) + 0.85) + hash01(node.id, 21) * 0.35;
      positions.set(node.id, sph(rr, lat, lon));
    } else if (node.tier === 5) {
      const off = nucOffset.get(node.id) ?? { lon: Math.PI * 0.5, lat: 0.4 };
      positions.set(node.id, nucWorld(off.lat, off.lon, 0.74));
    } else {
      const off = nucOffset.get(node.id) ?? { lon: Math.PI * 0.5, lat: -0.4 };
      positions.set(node.id, nucWorld(off.lat, off.lon, 0.45));
    }
  }

  /* ============ v37 防叠松弛引擎（用户反馈「3D pathway 重叠堆叠」根治） ============
   * 初始径向布局在簇内同层分子密集时产生屏向堆叠（标签互压、分子叠影）。
   * 在区室硬约束下迭代求解节点最小间距:
   *   · 固定锚: 配体/受体（定义信号束起点, 不参与位移, 但作为斥力源）
   *   · 胞质分子(tier 2-4): 壳层带内滑动（半径钳 ±0.62, 射线避核 nucExit+0.55）
   *   · 核内分子(tier 5-6): 核被膜内钳制（N·nucF×0.93）
   * 斥力-回位弹簧平衡 + 固定迭代次数 → 纯确定性（无随机源, 重复计算零漂移）。
   * 复杂度 O(n²)×96, 58 节点 ≈ 16 万对次, 布局期一次性毫秒级。 */
  const shellFOf = (tier: number): number => (tier === 2 ? 0.845 : tier === 3 ? 0.715 : 0.59);
  const NODE_GAP = 1.6; // 标签净空基数（+ 两分子可视半径 → 概览机位下标签互不压叠）
  {
    interface Ent {
      p: Vec3; // 工作坐标（可动者为独立副本, 不污染 positions 原值）
      r: number;
      mv: { id: string; tier: number; home: Vec3; p: Vec3 } | null;
    }
    const ents: Ent[] = nodes.map((node) => {
      const pos = positions.get(node.id)!;
      const r = NODE_R[node.kind] ?? 0.36;
      const mv =
        node.tier >= 2
          ? { id: node.id, tier: node.tier, home: pos, p: { x: pos.x, y: pos.y, z: pos.z } }
          : null;
      return { p: mv ? mv.p : pos, r, mv };
    });
    /** 区室约束投影: 只改半径/方向保留 → 斥力产生的角向位移存活（约束面上滑动解） */
    const constrain = (m: { tier: number; p: Vec3 }) => {
      const p = m.p;
      if (m.tier >= 2 && m.tier <= 4) {
        const len = Math.hypot(p.x, p.y, p.z) || 1e-6;
        const lat = Math.max(-0.95, Math.min(0.95, Math.asin(Math.max(-1, Math.min(1, p.y / len)))));
        const lon = Math.atan2(p.z, p.x);
        const shellTarget = R * shellFOf(m.tier) * shapeF(lat, lon);
        const rMin = Math.max(shellTarget - 0.62, nucExit(lat, lon) + 0.55);
        const rMax = shellTarget + 0.62;
        const rr = Math.max(rMin, Math.min(rMax, len));
        p.x = Math.cos(lat) * Math.cos(lon) * rr;
        p.y = Math.sin(lat) * rr;
        p.z = Math.cos(lat) * Math.sin(lon) * rr;
      } else {
        const rx = p.x - nucC.x, ry = p.y - nucC.y, rz = p.z - nucC.z;
        const len = Math.hypot(rx, ry, rz) || 1e-6;
        const lat = Math.asin(Math.max(-1, Math.min(1, ry / len)));
        const lon = Math.atan2(rz, rx);
        const maxR = N * nucF(lat, lon) * 0.93;
        if (len > maxR) {
          const s = maxR / len;
          p.x = nucC.x + rx * s;
          p.y = nucC.y + ry * s;
          p.z = nucC.z + rz * s;
        }
      }
    };
    const ITER = 140, SPRING = 0.09, PUSH = 0.3;
    for (let it = 0; it < ITER; it++) {
      // 成对斥力（过近推开; 固定端不动, 可动端承担全位移）
      for (let i = 0; i < ents.length; i++) {
        for (let j = i + 1; j < ents.length; j++) {
          const A = ents[i], B = ents[j];
          const dx = B.p.x - A.p.x, dy = B.p.y - A.p.y, dz = B.p.z - A.p.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          const minD = NODE_GAP + A.r + B.r;
          if (d2 >= minD * minD || d2 < 1e-8) continue;
          const d = Math.sqrt(d2);
          const step = (minD - d) * PUSH;
          const ux = dx / d, uy = dy / d, uz = dz / d;
          if (A.mv) { A.p.x -= ux * step; A.p.y -= uy * step; A.p.z -= uz * step; }
          if (B.mv) { B.p.x += ux * step; B.p.y += uy * step; B.p.z += uz * step; }
        }
      }
      // 回位弹簧（保区室/保束形） + 约束投影
      for (const e of ents) {
        if (!e.mv) continue;
        e.p.x += (e.mv.home.x - e.p.x) * SPRING;
        e.p.y += (e.mv.home.y - e.p.y) * SPRING;
        e.p.z += (e.mv.home.z - e.p.z) * SPRING;
        constrain(e.mv);
      }
    }
    for (const e of ents) if (e.mv) positions.set(e.mv.id, e.mv.p);
  }

  const nodes3: Node3D[] = nodes.map((node) => {
    const pos = positions.get(node.id) ?? { x: 0, y: 0, z: 0 };
    const r = NODE_R[node.kind] ?? 0.36;
    const pad = EDGE_PAD[node.kind] ?? 0.42;
    const normal = node.tier === 1 ? norm(pos) : undefined;
    return { ...node, pos, r, pad, normal, cluster: clusterOf.get(node.id) ?? fallbackCluster };
  });

  const edges3 = buildEdges3D(nodes3, edges);

  // v37 QA 探针: 最小分子对间距（无窗口环境/SSR 安全; agent-browser 数值验证分散度）
  if (typeof window !== 'undefined') {
    let minPair = Infinity, minA = '', minB = '';
    for (let i = 0; i < nodes3.length; i++) {
      for (let j = i + 1; j < nodes3.length; j++) {
        const a = nodes3[i].pos, b = nodes3[j].pos;
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (d < minPair) { minPair = d; minA = nodes3[i].label; minB = nodes3[j].label; }
      }
    }
    (window as unknown as Record<string, unknown>).__layout3dQa = {
      n: nodes3.length,
      minPair: minPair === Infinity ? null : +minPair.toFixed(3),
      pair: [minA, minB],
      edges: edges3.length,
    };
  }

  return { nodes: nodes3, edges: edges3, spec };
}

/** 边曲线构建（二次贝塞尔 + 确定性弯曲; 布局/投影共用 —— 端点随节点最终位置重算,
 *  弯曲幅度上限 v37 收紧 2.2→1.7 降低密集级联中的视觉乱穿） */
function buildEdges3D(nodes3: Node3D[], edges: CoreEdge[]): Edge3D[] {
  const posMap = new Map(nodes3.map((p) => [p.id, p]));
  const edges3: Edge3D[] = [];
  for (const e of edges) {
    const s = posMap.get(e.source);
    const t = posMap.get(e.target);
    if (!s || !t) continue;
    const dir = norm({ x: t.pos.x - s.pos.x, y: t.pos.y - s.pos.y, z: t.pos.z - s.pos.z });
    const p0 = {
      x: s.pos.x + dir.x * s.pad, y: s.pos.y + dir.y * s.pad, z: s.pos.z + dir.z * s.pad,
    };
    const p1 = {
      x: t.pos.x - dir.x * t.pad, y: t.pos.y - dir.y * t.pad, z: t.pos.z - dir.z * t.pad,
    };
    const dist = Math.hypot(t.pos.x - s.pos.x, t.pos.y - s.pos.y, t.pos.z - s.pos.z);
    // 弯曲方向：取与边方向近似垂直的确定性向量
    let perp = { x: -dir.z, y: 0.35, z: dir.x };
    perp = norm(perp);
    const bend = (hash01(e.id, 31) - 0.5) * Math.min(1.7, dist * 0.42);
    const ctrl = {
      x: (p0.x + p1.x) / 2 + perp.x * bend,
      y: (p0.y + p1.y) / 2 + perp.y * bend,
      z: (p0.z + p1.z) / 2 + perp.z * bend,
    };
    const SEG = 24;
    const points: Vec3[] = [];
    for (let i = 0; i <= SEG; i++) {
      const tt = i / SEG;
      const u = 1 - tt;
      points.push({
        x: u * u * p0.x + 2 * u * tt * ctrl.x + tt * tt * p1.x,
        y: u * u * p0.y + 2 * u * tt * ctrl.y + tt * tt * p1.y,
        z: u * u * p0.z + 2 * u * tt * ctrl.z + tt * tt * p1.z,
      });
    }
    edges3.push({ ...e, points, length: dist });
  }
  return edges3;
}

/* ============ 剖面贴附投影（信号级联 → 剖切面上演示） ============ */

/** 将整个信号级联布局（分子 + 边曲线）正交投影到剖切平面上：
 *  每个点 p → p - (p·n̂ + c)·n̂（n̂ 为归一化法向, c 为平面常数）。
 *  投影后全部分子恰好落于切面 → 剖面模式下信号转导演示在切面上完整可见
 *  （无分子被前半剖切裁掉）。受体膜法向同步投影 → 跨膜段沿切面展平，
 *  呈现"冠状切片上画通路"的教科书式视图。
 *
 * v37 面内防叠松弛: 正交投影会把深度方向的分离拍扁（沿法向不同深的分子
 * 投影后完全重叠 —— 堆叠的数学根源）。投影后在切面坐标系内做 2D 松弛:
 *   · 剖面轮盘边界（质膜∩切面）按 24 方向二分求解 → 受体钳制轮盘边缘
 *     （跨膜蛋白贴切片膜缘）, 配体钳制轮盘外侧（胞外）
 *   · 核盘（核被膜∩切面）同法采样 → 胞质分子避核 + 核内分子钳制核盘内
 *   · 自适应最小间距按轮盘可用面积/分子数求解（浅切深轮盘小 → 密度自适应）
 * 边曲线随松弛后节点位置整体重算（端点严格对齐）。平面近切线/离面时
 * 轮盘退化 → 回退纯投影（保持旧行为）。全部确定性。 */
export function projectLayoutToPlane(
  layout: { nodes: Node3D[]; edges: Edge3D[]; spec: CellBodySpec },
  plane: { normal: Vec3; constant: number },
): { nodes: Node3D[]; edges: Edge3D[]; spec: CellBodySpec } {
  const l = Math.hypot(plane.normal.x, plane.normal.y, plane.normal.z) || 1;
  const nx = plane.normal.x / l;
  const ny = plane.normal.y / l;
  const nz = plane.normal.z / l;
  const cc = plane.constant;
  const project = (p: Vec3): Vec3 => {
    const d = p.x * nx + p.y * ny + p.z * nz + cc;
    return { x: p.x - d * nx, y: p.y - d * ny, z: p.z - d * nz };
  };

  const R = layout.spec.membraneR;
  const N = layout.spec.nucleusR;
  const shape = layout.spec.shape;
  const nucC = nucleusCenter(shape, R);

  // ---- 面内正交基 (u, v) 与轮盘中心 d0（切面上离细胞中心最近的点）----
  let ux = -nz, uy = 0, uz = nx; // n̂ × (0,1,0)
  if (Math.hypot(ux, uy, uz) < 1e-4) { ux = 0; uy = nz; uz = -ny; } // 法向≈y 时换基
  {
    const lu = Math.hypot(ux, uy, uz) || 1;
    ux /= lu; uy /= lu; uz /= lu;
  }
  const vx = ny * uz - nz * uy;
  const vy = nz * ux - nx * uz;
  const vz = nx * uy - ny * ux;
  const d0 = { x: -cc * nx, y: -cc * ny, z: -cc * nz };

  // ---- 剖面轮盘边界采样（质膜 ∩ 切面; 二分求交）----
  const DIRS = 24;
  const rhoMem = new Array<number>(DIRS).fill(0);
  let degenerate = false;
  {
    const f = (rho: number, ex: number, ey: number, ez: number): number => {
      const px = d0.x + rho * ex, py = d0.y + rho * ey, pz = d0.z + rho * ez;
      const pl = Math.hypot(px, py, pz) || 1e-6;
      return pl - R * shapeFactor({ x: px / pl, y: py / pl, z: pz / pl }, shape);
    };
    for (let k = 0; k < DIRS && !degenerate; k++) {
      const th = (k / DIRS) * Math.PI * 2;
      const ex = ux * Math.cos(th) + vx * Math.sin(th);
      const ey = uy * Math.cos(th) + vy * Math.sin(th);
      const ez = uz * Math.cos(th) + vz * Math.sin(th);
      if (f(0, ex, ey, ez) >= 0) { degenerate = true; break; } // 切面不切细胞（近切线/离面）
      let lo = 0, hi = R * 2.2;
      for (let it = 0; it < 20; it++) {
        const mid = (lo + hi) / 2;
        if (f(mid, ex, ey, ez) < 0) lo = mid; else hi = mid;
      }
      rhoMem[k] = Math.max(0.4, hi);
    }
  }

  // ---- 核盘（核被膜 ∩ 切面; 以核中心在切面上的投影为盘心）----
  const nucPlaneDist = nucC.x * nx + nucC.y * ny + nucC.z * nz + cc;
  const nC2 = { x: nucC.x - nucPlaneDist * nx, y: nucC.y - nucPlaneDist * ny, z: nucC.z - nucPlaneDist * nz };
  const nC2a = (nC2.x - d0.x) * ux + (nC2.y - d0.y) * uy + (nC2.z - d0.z) * uz;
  const nC2b = (nC2.x - d0.x) * vx + (nC2.y - d0.y) * vy + (nC2.z - d0.z) * vz;
  const rhoNuc = new Array<number>(DIRS).fill(0);
  let nucDiscValid = !degenerate;
  {
    const g = (rho: number, ex: number, ey: number, ez: number): number => {
      const px = nC2.x + rho * ex, py = nC2.y + rho * ey, pz = nC2.z + rho * ez;
      const rx = px - nucC.x, ry = py - nucC.y, rz = pz - nucC.z;
      const rl = Math.hypot(rx, ry, rz) || 1e-6;
      return rl - N * nucleusFactor({ x: rx / rl, y: ry / rl, z: rz / rl }, shape);
    };
    for (let k = 0; k < DIRS && nucDiscValid; k++) {
      const th = (k / DIRS) * Math.PI * 2;
      const ex = ux * Math.cos(th) + vx * Math.sin(th);
      const ey = uy * Math.cos(th) + vy * Math.sin(th);
      const ez = uz * Math.cos(th) + vz * Math.sin(th);
      if (g(0, ex, ey, ez) >= 0) { nucDiscValid = false; break; } // 切面未及核
      let lo = 0, hi = N * 2.2;
      for (let it = 0; it < 20; it++) {
        const mid = (lo + hi) / 2;
        if (g(mid, ex, ey, ez) < 0) lo = mid; else hi = mid;
      }
      rhoNuc[k] = Math.max(0.3, hi);
    }
  }

  if (degenerate) {
    // 轮盘退化（浅切深近切线）: 保持纯投影旧行为
    const nodes = layout.nodes.map((nd) => ({
      ...nd,
      pos: project(nd.pos),
      normal: nd.normal ? project(nd.normal) : nd.normal,
    }));
    const edges = layout.edges.map((e) => {
      const points = e.points.map(project);
      let length = 0;
      for (let i = 1; i < points.length; i++) {
        length += Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].y - points[i - 1].y,
          points[i].z - points[i - 1].z,
        );
      }
      return { ...e, points, length };
    });
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__layoutPlaneQa = { degenerate: true, n: nodes.length };
    }
    return { nodes, edges, spec: layout.spec };
  }

  // ---- 2D 坐标（相对轮盘中心 d0; 投影后初始位）----
  const pos2 = new Map<string, { a: number; b: number }>();
  for (const nd of layout.nodes) {
    const p = project(nd.pos);
    pos2.set(nd.id, {
      a: (p.x - d0.x) * ux + (p.y - d0.y) * uy + (p.z - d0.z) * uz,
      b: (p.x - d0.x) * vx + (p.y - d0.y) * vy + (p.z - d0.z) * vz,
    });
  }

  /** 方向 → 轮盘/核盘边界半径（最近采样线性插值） */
  const rhoAt = (rho: number[], theta: number): number => {
    const t = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const fi = (t / (Math.PI * 2)) * DIRS;
    const i0 = Math.floor(fi) % DIRS;
    const i1 = (i0 + 1) % DIRS;
    return rho[i0] + (rho[i1] - rho[i0]) * (fi - Math.floor(fi));
  };

  // ---- 自适应最小间距（轮盘可用面积 / 分子数 → 密度感知, 标签净空上限钳制）----
  const avgMem = rhoMem.reduce((s, r) => s + r, 0) / DIRS;
  const avgNuc = nucDiscValid ? rhoNuc.reduce((s, r) => s + r, 0) / DIRS : 0;
  const areaMem = Math.PI * avgMem * avgMem;
  const areaNuc = nucDiscValid ? Math.PI * avgNuc * avgNuc : 0;
  const cytoCount = layout.nodes.filter((n) => n.tier >= 2 && n.tier <= 4).length
    + (nucDiscValid ? 0 : layout.nodes.filter((n) => n.tier >= 5).length);
  const minDBase = Math.max(0.92, Math.min(2.1, Math.sqrt(Math.max(2.4, (areaMem - areaNuc) * 0.68) / Math.max(1, cytoCount))));

  // ---- 2D 松弛（受体/配体强弹簧轻移; 胞质/核内自由 + 硬约束）----
  interface Ent2 {
    id: string; tier: number; r: number;
    a: number; b: number; ha: number; hb: number;
    spring: number;
  }
  const ents: Ent2[] = layout.nodes.map((nd) => {
    const q = pos2.get(nd.id)!;
    return {
      id: nd.id,
      tier: nd.tier,
      r: nd.r,
      a: q.a, b: q.b, ha: q.a, hb: q.b,
      spring: nd.tier === 0 ? 0.34 : nd.tier === 1 ? 0.3 : 0.1,
    };
  });
  const constrain2 = (e: Ent2) => {
    const rr = Math.hypot(e.a, e.b) || 1e-6;
    const th = Math.atan2(e.b, e.a);
    const rm = rhoAt(rhoMem, th);
    if (e.tier === 0) {
      // 配体: 轮盘外侧（胞外贴缘）
      if (rr < rm + 0.34) { const s = (rm + 0.34) / rr; e.a *= s; e.b *= s; }
      else if (rr > rm + 1.6) { const s = (rm + 1.6) / rr; e.a *= s; e.b *= s; }
    } else if (e.tier === 1) {
      // 受体: 不越轮盘缘（跨膜蛋白贴切片膜缘）
      if (rr > rm - 0.16) { const s = (rm - 0.16) / rr; e.a *= s; e.b *= s; }
    } else if (e.tier >= 5) {
      if (nucDiscValid) {
        const da = e.a - nC2a, db = e.b - nC2b;
        const dn = Math.hypot(da, db) || 1e-6;
        const rn = rhoAt(rhoNuc, Math.atan2(db, da)) * 0.88;
        if (dn > rn) { const s = rn / dn; e.a = nC2a + da * s; e.b = nC2b + db * s; }
      } else if (rr > rm - 0.42) { const s = (rm - 0.42) / rr; e.a *= s; e.b *= s; }
    } else {
      // 胞质: 轮盘内 + 核盘外（方向感知边界 —— 束路穿核者沿核缘滑出）
      if (rr > rm - 0.42) { const s = (rm - 0.42) / rr; e.a *= s; e.b *= s; }
      if (nucDiscValid) {
        const da = e.a - nC2a, db = e.b - nC2b;
        const dn = Math.hypot(da, db);
        const boundary = rhoAt(rhoNuc, Math.atan2(db, da)) + 0.5;
        if (dn < boundary) {
          if (dn < 1e-4) { e.a = nC2a + boundary; e.b = nC2b; }
          else { const s = boundary / dn; e.a = nC2a + da * s; e.b = nC2b + db * s; }
        }
      }
    }
  };
  const ITER2 = 150, PUSH2 = 0.28;
  for (let it = 0; it < ITER2; it++) {
    for (let i = 0; i < ents.length; i++) {
      for (let j = i + 1; j < ents.length; j++) {
        const A = ents[i], B = ents[j];
        const dx = B.a - A.a, dy = B.b - A.b;
        const d2 = dx * dx + dy * dy;
        const minD = minDBase + (A.r + B.r) * 0.4;
        if (d2 >= minD * minD || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const step = (minD - d) * PUSH2;
        const s = step / d;
        A.a -= dx * s; A.b -= dy * s;
        B.a += dx * s; B.b += dy * s;
      }
    }
    for (const e of ents) {
      e.a += (e.ha - e.a) * e.spring;
      e.b += (e.hb - e.b) * e.spring;
      constrain2(e);
    }
  }

  // ---- 回建 3D 坐标（切面上） + 受体面内径向法向 ----
  const final2 = new Map<string, { a: number; b: number }>();
  for (const e of ents) final2.set(e.id, { a: e.a, b: e.b });
  const nodes = layout.nodes.map((nd) => {
    const q = final2.get(nd.id)!;
    const pos: Vec3 = {
      x: d0.x + q.a * ux + q.b * vx,
      y: d0.y + q.a * uy + q.b * vy,
      z: d0.z + q.a * uz + q.b * vz,
    };
    let normal = nd.normal;
    if (nd.tier === 1) {
      const rl = Math.hypot(q.a, q.b) || 1;
      normal = { x: (q.a / rl) * ux + (q.b / rl) * vx, y: (q.a / rl) * uy + (q.b / rl) * vy, z: (q.a / rl) * uz + (q.b / rl) * vz };
    }
    return { ...nd, pos, normal };
  });
  const edges = buildEdges3D(nodes, layout.edges);

  if (typeof window !== 'undefined') {
    let minPair = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].pos, b = nodes[j].pos;
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (d < minPair) minPair = d;
      }
    }
    (window as unknown as Record<string, unknown>).__layoutPlaneQa = {
      n: nodes.length,
      minPair: minPair === Infinity ? null : +minPair.toFixed(3),
      minDBase: +minDBase.toFixed(3),
      nucDiscValid,
      avgMem: +avgMem.toFixed(2),
    };
  }
  return { nodes, edges, spec: layout.spec };
}

/** 3D 视图共享颜色契约（与 2D 视图一致的科学配色） */
export const EDGE_COLORS: Record<string, string> = {
  activation: '#34d399',
  phosphorylation: '#6ee7b7',
  inhibition: '#fb7185',
  repression: '#fb7185',
  dephosphorylation: '#fb7185',
  missing: '#fb7185',
  expression: '#fbbf24',
  binding: '#94a3b8',
  dissociation: '#94a3b8',
  indirect: '#2dd4bf',
  'state-change': '#2dd4bf',
};
