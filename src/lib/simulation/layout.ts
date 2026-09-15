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

/** 密集图谱（>40 节点）紧凑尺寸：保持可读性，画布可缩放补偿 */
const NODE_SIZE_COMPACT: Record<string, { w: number; h: number }> = {
  ligand: { w: 74, h: 27 },
  receptor: { w: 62, h: 48 },
  channel: { w: 56, h: 48 },
  compound: { w: 58, h: 27 },
  tf: { w: 80, h: 27 },
  gene: { w: 74, h: 26 },
  default: { w: 86, h: 27 },
};

/** 胞质分带 y：动态堆叠（行高 44、带间 12）；密集图谱行高压缩至预算 445 内 */
function makeBandPlan(
  nodes: CoreNode[],
  capacity: number,
  dense: boolean
): (tier: number, row: number) => number {
  const base: Record<number, number> = {};
  let cursor = 252;
  let totalRows = 0;
  for (const tier of [2, 3, 4]) {
    const count = nodes.filter((n) => n.tier === tier).length;
    totalRows += Math.max(1, Math.ceil(count / capacity));
  }
  const rowH = dense ? Math.max(38, Math.min(44, Math.floor((445 - 252 - 24) / Math.max(1, totalRows)))) : 44;
  for (const tier of [2, 3, 4]) {
    const count = nodes.filter((n) => n.tier === tier).length;
    const rows = Math.max(1, Math.ceil(count / capacity));
    base[tier] = cursor;
    cursor += rows * rowH + 12;
  }
  return (tier: number, row: number) => (base[tier] ?? 252) + row * rowH;
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

  // 配体 x/y：跟随其结合的受体；同一受体多配体时水平展开 + 垂直堆叠（避免 44px 间距重叠）
  const ligandX = new Map<string, number>();
  const ligandY = new Map<string, number>();
  const ligands = nodes.filter((n) => n.tier === 0);
  const perRec = new Map<string, { anchor: number; ids: string[] }>();
  for (const l of ligands) {
    const targets = downstream.get(l.id) ?? [];
    const recTarget = targets.find((t) => recX.has(t));
    const anchor = recTarget ? recX.get(recTarget)! : (rx0 + rx1) / 2;
    const key = anchor.toFixed(0);
    if (!perRec.has(key)) perRec.set(key, { anchor, ids: [] });
    perRec.get(key)!.ids.push(l.id);
  }
  for (const [, group] of perRec) {
    group.ids.forEach((id, k) => {
      const row = Math.floor(k / 3);
      const col = k % 3;
      ligandX.set(id, clampX(group.anchor + (col - 1) * 106, geom));
      ligandY.set(id, 44 + row * 52 + (col % 2) * 6);
    });
  }

  const positions = new Map<string, { x: number; y: number }>();

  for (const n of nodes) {
    if (n.tier === 0) {
      positions.set(n.id, { x: ligandX.get(n.id) ?? 610, y: ligandY.get(n.id) ?? 60 });
    } else if (n.tier === 1) {
      positions.set(n.id, { x: recX.get(n.id) ?? 610, y: geom.membraneY + geom.membraneH / 2 });
    }
  }

  // 胞质节点（tier 2-4）：按 (cluster 中心 x, label) 排序后分行展开（动态分带）
  const cx0 = geom.bodyX0 + 65;
  const cx1 = geom.bodyX1 - 65;
  const dense = nodes.length > 40;
  const capacity = Math.max(3, Math.floor((cx1 - cx0) / (dense ? 86 : 108)));
  const bandY = makeBandPlan(nodes, capacity, dense);
  for (const tier of [2, 3, 4]) {
    const group = nodes
      .filter((n) => n.tier >= 2 && n.tier <= 4 && n.tier === tier)
      .sort((a, b) => {
        const ca = recX.get(clusterOf.get(a.id) ?? '') ?? 610;
        const cb = recX.get(clusterOf.get(b.id) ?? '') ?? 610;
        if (Math.abs(ca - cb) > 40) return ca - cb;
        return a.label.localeCompare(b.label);
      });
    group.forEach((n, i) => {
      const row = Math.floor(i / capacity);
      const inRowCount = Math.min(capacity, group.length - row * capacity);
      const idx = i % capacity;
      const x = inRowCount === 1 ? (cx0 + cx1) / 2 : cx0 + ((cx1 - cx0) * idx) / (inRowCount - 1);
      // 砖块错位：奇数行右移半格，降低相邻行同列碰撞；抖动收窄到 0-8
      const brick = row % 2 === 1 ? 54 : 0;
      const jitter = (n.label.length * 7 + i * 13) % 9;
      positions.set(n.id, { x: clampX(x + brick, geom), y: bandY(tier, row) + jitter });
    });
  }

  // 核内节点：tf 外环 / 靶基因内环；节点多时每类自动拆分双环（避免弦距不足导致的标签重叠）
  const tfs = nodes.filter((n) => n.tier === 5).sort((a, b) => a.label.localeCompare(b.label));
  const genes = nodes.filter((n) => n.tier === 6).sort((a, b) => a.label.localeCompare(b.label));
  const nuc = geom.mainNucleus;
  /**
   * 环形布点（含密度自适应）：
   *   ≤ maxPerRing 时单环（半径取两环中点）；超过时拆内外双环交错分布，
   *   弦距 ≈ 2πr/m，TF 宽 ~98 / 基因宽 ~90 需要更大半径或分环
   */
  const placeRing = (list: CoreNode[], rOuter: number, rInner: number, phase: number) => {
    const m = list.length;
    if (m === 0) return;
    const maxPerRing = 5;
    if (m <= maxPerRing) {
      const r = (rOuter + rInner) / 2;
      list.forEach((n, i) => {
        const ang = phase + (m === 1 ? 0 : (Math.PI * 2 * i) / m);
        positions.set(n.id, {
          x: nuc.cx + Math.cos(ang) * r,
          y: nuc.cy + Math.sin(ang) * r * 0.8,
        });
      });
      return;
    }
    const split = Math.ceil(m / 2);
    const rings: { items: CoreNode[]; r: number; phase: number }[] = [
      { items: list.slice(0, split), r: rOuter, phase },
      { items: list.slice(split), r: rInner, phase: phase + Math.PI / Math.max(3, m / 2) },
    ];
    for (const ring of rings) {
      const k = ring.items.length;
      ring.items.forEach((n, i) => {
        const ang = ring.phase + (k === 1 ? 0 : (Math.PI * 2 * i) / k);
        positions.set(n.id, {
          x: nuc.cx + Math.cos(ang) * ring.r,
          y: nuc.cy + Math.sin(ang) * ring.r * 0.8,
        });
      });
    }
  };
  if (tfs.length && !dense) placeRing(tfs, nuc.r * 0.86, nuc.r * 0.58, -Math.PI / 2);
  // 密集图谱：TF 上半弧多环（弦距约束），靶基因核下"转录货架"分行（构造性无重叠）
  if (dense && tfs.length) {
    const tfW = (NODE_SIZE_COMPACT.tf.w + NODE_SIZE.tf.w) / 2 + 8;
    const radii = [0.92, 0.68, 0.44].map((k) => nuc.r * k);
    let idx = 0;
    for (let ri = 0; ri < radii.length && idx < tfs.length; ri++) {
      const r = radii[ri];
      const cap = Math.max(1, Math.floor((Math.PI * r * 0.85) / tfW));
      const batch = tfs.slice(idx, idx + cap);
      batch.forEach((n, i) => {
        // 上半弧：-160°..-20°
        const ang = (-160 * Math.PI) / 180 + ((i / Math.max(1, batch.length)) * 140 * Math.PI) / 180;
        positions.set(n.id, {
          x: nuc.cx + Math.cos(ang) * r,
          y: nuc.cy + Math.sin(ang) * r * 0.85,
        });
      });
      idx += batch.length;
    }
    for (; idx < tfs.length; idx++) {
      const r = radii[0] * 1.12;
      const ang = (-Math.PI / 2) + ((idx % 6) * Math.PI) / 6 + 0.26;
      positions.set(tfs[idx].id, { x: nuc.cx + Math.cos(ang) * r, y: nuc.cy + Math.sin(ang) * r * 0.85 });
    }
  }
  if (genes.length > 0 && genes.length <= 5 && !dense) {
    placeRing(genes, nuc.r * 0.66, nuc.r * 0.32, Math.PI / 2);
  } else if (genes.length > 0) {
    // 转录货架：核下分行（行距 28 ≥ 盒高 26，列距 88 ≥ 盒宽 78），
    // 基因多的通路（HIF-1 15 靶基因）构造性零重叠且不飞出画布
    const perRow = 5;
    const rows = Math.max(1, Math.ceil(genes.length / perRow));
    const cols = Math.ceil(genes.length / rows);
    genes.forEach((n, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const y = 566 + row * 28;
      const x = nuc.cx + (col - (cols - 1) / 2) * 88;
      positions.set(n.id, { x: clampX(x, geom), y });
    });
  }

  const placed: PositionedNode[] = nodes.map((n) => {
    const size = (nodes.length > 40 ? NODE_SIZE_COMPACT : NODE_SIZE)[n.kind] ?? (nodes.length > 40 ? NODE_SIZE_COMPACT : NODE_SIZE).default;
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
