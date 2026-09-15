/**
 * 3D 径向布局引擎 —— 将核心子图映射到球状虚拟细胞的区室结构
 * 科学依据（真核细胞区室化，Alberts MBoC Ch.1/12）:
 *   配体扩散于胞外 → 结合膜受体（跨膜区锚定于脂双层）→ 胞质激酶级联径向向内转导
 *   → 转录因子经核孔入核 → 靶基因转录
 * 每条受体分支按经度聚类形成"信号光束"，用户可清晰追踪单条通路级联。
 */
import type { CoreNode, CoreEdge } from '@/types/kegg';
import type { MorphologyKey as CellMorphKey } from '@/data/cell-types';
import { shapeFactor, type ShapeKind } from './cell-shape';

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
    members.forEach((m, idx) => {
      const dLon = (hash01(m.id, 7) - 0.5) * 0.85;
      const dLat = (idx - (members.length - 1) / 2) * 0.235 + (hash01(m.id, 13) - 0.5) * 0.1;
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
      const ang = rec ? recAngles.get(rec)! : { lon: Math.PI * 0.5, lat: 0.1 };
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
      const rr = Math.max(R * shellF * shapeF(lat, lon), N + 0.85) + hash01(node.id, 21) * 0.35;
      positions.set(node.id, sph(rr, lat, lon));
    } else if (node.tier === 5) {
      const off = nucOffset.get(node.id) ?? { lon: Math.PI * 0.5, lat: 0.4 };
      positions.set(node.id, sph(N * 0.74, off.lat, off.lon));
    } else {
      const off = nucOffset.get(node.id) ?? { lon: Math.PI * 0.5, lat: -0.4 };
      positions.set(node.id, sph(N * 0.45, off.lat, off.lon));
    }
  }

  const nodes3: Node3D[] = nodes.map((node) => {
    const pos = positions.get(node.id) ?? { x: 0, y: 0, z: 0 };
    const r = NODE_R[node.kind] ?? 0.36;
    const pad = EDGE_PAD[node.kind] ?? 0.42;
    const normal = node.tier === 1 ? norm(pos) : undefined;
    return { ...node, pos, r, pad, normal, cluster: clusterOf.get(node.id) ?? fallbackCluster };
  });

  // ---- 边曲线（二次贝塞尔 + 确定性弯曲，避免平行边重叠）----
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
    const bend = (hash01(e.id, 31) - 0.5) * Math.min(2.2, dist * 0.42);
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

  return { nodes: nodes3, edges: edges3, spec };
}

/* ============ 剖面贴附投影（信号级联 → 剖切面上演示） ============ */

/** 将整个信号级联布局（分子 + 边曲线）正交投影到剖切平面上：
 *  每个点 p → p - (p·n̂ + c)·n̂（n̂ 为归一化法向, c 为平面常数）。
 *  投影后全部分子恰好落于切面 → 剖面模式下信号转导演示在切面上完整可见
 *  （无分子被前半剖切裁掉）。受体膜法向同步投影 → 跨膜段沿切面展平，
 *  呈现"冠状切片上画通路"的教科书式视图。 */
export function projectLayoutToPlane(
  layout: { nodes: Node3D[]; edges: Edge3D[]; spec: CellBodySpec },
  plane: { normal: Vec3; constant: number },
): { nodes: Node3D[]; edges: Edge3D[]; spec: CellBodySpec } {
  const l = Math.hypot(plane.normal.x, plane.normal.y, plane.normal.z) || 1;
  const nx = plane.normal.x / l;
  const ny = plane.normal.y / l;
  const nz = plane.normal.z / l;
  const project = (p: Vec3): Vec3 => {
    const d = p.x * nx + p.y * ny + p.z * nz + plane.constant;
    return { x: p.x - d * nx, y: p.y - d * ny, z: p.z - d * nz };
  };
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
