/**
 * 细胞视图布局引擎 —— 将核心子图节点映射到虚拟细胞 SVG 画布
 * 规则：配体→细胞外区带；受体→磷脂双分子层（按细胞体边界分布）；
 * 胞质级联→按信号层分带（x 序按受体分支聚类保持信号流连贯）；
 * 转录因子/靶基因→细胞核内极坐标分布（tf 外环 / 靶基因内环）。
 */
import type { CoreNode, CoreEdge } from '@/types/kegg';
import type { MorphologyKey } from '@/data/cell-types';

export const CANVAS = { w: 1200, h: 780 };

export interface NucleusSpec {
  cx: number;
  cy: number;
  r: number;
}

export interface CellGeometry {
  membraneY: number;
  membraneH: number;
  /** 细胞体 x 范围（受体与胞质节点的布局边界） */
  bodyX0: number;
  bodyX1: number;
  nuclei: NucleusSpec[];
  mainNucleus: NucleusSpec;
}

/** 每种形态的画布几何 */
export function getGeometry(morph: MorphologyKey): CellGeometry {
  const base = { membraneY: 168, membraneH: 36 };
  const table: Record<MorphologyKey, { bodyX0: number; bodyX1: number; nuclei: NucleusSpec[] }> = {
    hepatocyte: {
      bodyX0: 84, bodyX1: 1116,
      nuclei: [
        { cx: 640, cy: 552, r: 138 },
        { cx: 950, cy: 468, r: 92 },
      ],
    },
    neuron: {
      bodyX0: 285, bodyX1: 925,
      nuclei: [{ cx: 600, cy: 530, r: 126 }],
    },
    tcell: {
      bodyX0: 300, bodyX1: 930,
      nuclei: [{ cx: 615, cy: 535, r: 165 }],
    },
    epithelial: {
      bodyX0: 335, bodyX1: 875,
      nuclei: [{ cx: 605, cy: 600, r: 102 }],
    },
    cardiomyocyte: {
      bodyX0: 95, bodyX1: 1105,
      nuclei: [{ cx: 620, cy: 512, r: 110 }],
    },
    fibroblast: {
      bodyX0: 140, bodyX1: 1070,
      nuclei: [{ cx: 612, cy: 520, r: 124 }],
    },
    cancer: {
      bodyX0: 105, bodyX1: 1095,
      nuclei: [
        { cx: 560, cy: 545, r: 112 },
        { cx: 850, cy: 498, r: 88 },
        { cx: 425, cy: 645, r: 74 },
      ],
    },
  };
  const t = table[morph];
  return { ...base, bodyX0: t.bodyX0, bodyX1: t.bodyX1, nuclei: t.nuclei, mainNucleus: t.nuclei[0] };
}

export interface PositionedNode extends CoreNode {
  px: number;
  py: number;
  nw: number;
  nh: number;
}

export interface LaidOutEdge extends CoreEdge {
  d: string;
}

const NODE_SIZE: Record<string, { w: number; h: number }> = {
  ligand: { w: 92, h: 33 },
  receptor: { w: 76, h: 58 },
  channel: { w: 68, h: 58 },
  compound: { w: 72, h: 33 },
  tf: { w: 98, h: 33 },
  gene: { w: 90, h: 31 },
  default: { w: 104, h: 33 },
};

/** 胞质分带 y（tier 2/3/4 → y 轴带） */
function bandY(tier: number, row: number): number {
  const base = tier === 2 ? 254 : tier === 3 ? 356 : 462;
  return base + row * 48;
}

export function layoutCellView(
  nodes: CoreNode[],
  edges: CoreEdge[],
  morph: MorphologyKey,
): { nodes: PositionedNode[]; edges: LaidOutEdge[] } {
  const geom = getGeometry(morph);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // 下游邻接表
  const downstream = new Map<string, string[]>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    if (!downstream.has(e.source)) downstream.set(e.source, []);
    downstream.get(e.source)!.push(e.target);
  }

  // 聚类：非受体节点归属的受体分支（BFS 自受体向下）
  const clusterOf = new Map<string, string>();
  const receptorNodes = nodes.filter((n) => n.tier === 1);
  const queue: string[] = [];
  for (const r of receptorNodes) {
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
  // 孤立节点归属最近受体（按 label 序）
  const fallbackCluster = receptorNodes[0]?.id ?? '';
  for (const n of nodes) {
    if (!clusterOf.has(n.id)) clusterOf.set(n.id, fallbackCluster);
  }

  // 受体 x 分布（细胞体范围内均匀）
  const recX = new Map<string, number>();
  const recSorted = [...receptorNodes].sort((a, b) => a.label.localeCompare(b.label));
  const rx0 = geom.bodyX0 + 85;
  const rx1 = geom.bodyX1 - 85;
  recSorted.forEach((r, i) => {
    const n = recSorted.length;
    recX.set(r.id, n === 1 ? (rx0 + rx1) / 2 : rx0 + ((rx1 - rx0) * i) / (n - 1));
  });

  // 配体 x：跟随其结合的受体
  const ligandX = new Map<string, number>();
  const ligandY = new Map<string, number>();
  const ligands = nodes.filter((n) => n.tier === 0);
  const perRec = new Map<string, number>();
  for (const l of ligands) {
    const targets = downstream.get(l.id) ?? [];
    const recTarget = targets.find((t) => recX.has(t));
    const anchor = recTarget ? recX.get(recTarget)! : (rx0 + rx1) / 2;
    const k = perRec.get(anchor.toFixed(0)) ?? 0;
    perRec.set(anchor.toFixed(0), k + 1);
    ligandX.set(l.id, clampX(anchor + (k - 1) * 44, geom));
    ligandY.set(l.id, 58 + (l.id.length % 2) * 54);
  }

  const positions = new Map<string, { x: number; y: number }>();

  for (const n of nodes) {
    if (n.tier === 0) {
      positions.set(n.id, { x: ligandX.get(n.id) ?? 610, y: ligandY.get(n.id) ?? 60 });
    } else if (n.tier === 1) {
      positions.set(n.id, { x: recX.get(n.id) ?? 610, y: geom.membraneY + geom.membraneH / 2 });
    }
  }

  // 胞质节点（tier 2-4）：按 (cluster 中心 x, label) 排序后分行展开
  const cx0 = geom.bodyX0 + 65;
  const cx1 = geom.bodyX1 - 65;
  for (const tier of [2, 3, 4]) {
    const group = nodes
      .filter((n) => n.tier >= 2 && n.tier <= 4 && n.tier === tier)
      .sort((a, b) => {
        const ca = recX.get(clusterOf.get(a.id) ?? '') ?? 610;
        const cb = recX.get(clusterOf.get(b.id) ?? '') ?? 610;
        if (Math.abs(ca - cb) > 40) return ca - cb;
        return a.label.localeCompare(b.label);
      });
    const capacity = Math.max(3, Math.floor((cx1 - cx0) / 108));
    group.forEach((n, i) => {
      const row = Math.floor(i / capacity);
      const inRowCount = Math.min(capacity, group.length - row * capacity);
      const idx = i % capacity;
      const x = inRowCount === 1 ? (cx0 + cx1) / 2 : cx0 + ((cx1 - cx0) * idx) / (inRowCount - 1);
      const jitter = (n.label.length * 13 + i * 29) % 14;
      positions.set(n.id, { x: clampX(x, geom), y: bandY(tier, row) + jitter });
    });
  }

  // 核内节点：tf 外环 / 靶基因内环
  const tfs = nodes.filter((n) => n.tier === 5).sort((a, b) => a.label.localeCompare(b.label));
  const genes = nodes.filter((n) => n.tier === 6).sort((a, b) => a.label.localeCompare(b.label));
  const nuc = geom.mainNucleus;
  const placeRing = (list: CoreNode[], radius: number, phase: number) => {
    const m = list.length;
    list.forEach((n, i) => {
      const ang = phase + (m === 1 ? 0 : (Math.PI * 2 * i) / m);
      positions.set(n.id, {
        x: nuc.cx + Math.cos(ang) * radius,
        y: nuc.cy + Math.sin(ang) * radius * 0.8,
      });
    });
  };
  if (tfs.length) placeRing(tfs, nuc.r * 0.66, -Math.PI / 2);
  if (genes.length) placeRing(genes, nuc.r * 0.33, Math.PI / 2);

  const placed: PositionedNode[] = nodes.map((n) => {
    const size = NODE_SIZE[n.kind] ?? NODE_SIZE.default;
    const p = positions.get(n.id) ?? { x: 610, y: 430 };
    return { ...n, px: p.x, py: p.y, nw: size.w, nh: size.h };
  });

  // 边路径
  const posMap = new Map(placed.map((p) => [p.id, p]));
  const laidEdges: LaidOutEdge[] = [];
  for (const e of edges) {
    const s = posMap.get(e.source);
    const t = posMap.get(e.target);
    if (!s || !t) continue;
    laidEdges.push({ ...e, d: edgePath(s, t) });
  }

  return { nodes: placed, edges: laidEdges };
}

function clampX(x: number, geom: CellGeometry): number {
  return Math.max(geom.bodyX0 + 45, Math.min(geom.bodyX1 - 45, x));
}

/** 边路径：下行=垂直贝塞尔；上行/横向=S 曲线（反馈环） */
export function edgePath(s: PositionedNode, t: PositionedNode): string {
  const sx = s.px;
  const sy = s.py + s.nh / 2 + 3;
  const tx = t.px;
  const ty = t.py - t.nh / 2 - 3;
  const dy = ty - sy;
  if (Math.abs(dy) > 30) {
    const bend = Math.abs(dy) * 0.45;
    return `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${sx.toFixed(1)} ${(sy + bend).toFixed(1)} ${tx.toFixed(1)} ${(
      ty - bend
    ).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
  }
  const dx = tx - sx;
  const dir = Math.sign(dx) || 1;
  const lift = 36;
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${(sx + dir * Math.max(34, Math.abs(dx) * 0.35)).toFixed(1)} ${(
    sy - lift
  ).toFixed(1)} ${(tx - dir * Math.max(34, Math.abs(dx) * 0.35)).toFixed(1)} ${(ty + lift * 0.6).toFixed(1)} ${tx.toFixed(
    1,
  )} ${ty.toFixed(1)}`;
}
