/**
 * 视图共享工具 —— 2D 细胞视图/对比视图共用的色彩映射与标注辅助
 * （从 virtual-cell.tsx 抽出, 保证双视图视觉语义一致）
 */
import type { MoleculeKind, EdgeKind } from '@/types/kegg';
import type { LaidOutEdge } from '@/lib/simulation/layout';

export const KIND_COLORS_MAP: Record<MoleculeKind, { stroke: string; fill: string; text: string; label: string }> = {
  ligand: { stroke: '#fbbf24', fill: 'rgba(251,191,36,0.13)', text: '#fde68a', label: '配体' },
  receptor: { stroke: '#2dd4bf', fill: 'rgba(45,212,191,0.15)', text: '#99f6e4', label: '受体' },
  channel: { stroke: '#2dd4bf', fill: 'rgba(45,212,191,0.15)', text: '#99f6e4', label: '通道' },
  kinase: { stroke: '#34d399', fill: 'rgba(52,211,153,0.13)', text: '#a7f3d0', label: '激酶' },
  phosphatase: { stroke: '#f97316', fill: 'rgba(249,115,22,0.12)', text: '#fdba74', label: '磷酸酶' },
  adapter: { stroke: '#a3e635', fill: 'rgba(163,230,53,0.12)', text: '#d9f99d', label: '接头' },
  gtpase: { stroke: '#f472b6', fill: 'rgba(244,114,182,0.12)', text: '#fbcfe8', label: 'G 蛋白' },
  tf: { stroke: '#fb7185', fill: 'rgba(251,113,133,0.12)', text: '#fecdd3', label: '转录因子' },
  gene: { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.12)', text: '#fde68a', label: '靶基因' },
  compound: { stroke: '#facc15', fill: 'rgba(250,204,21,0.1)', text: '#fef08a', label: '信使' },
  enzyme: { stroke: '#4ade80', fill: 'rgba(74,222,128,0.12)', text: '#bbf7d0', label: '酶' },
};

export function edgeColor(kind: EdgeKind): string {
  if (kind === 'inhibition' || kind === 'repression' || kind === 'missing' || kind === 'dephosphorylation') return '#fb7185';
  if (kind === 'expression') return '#fbbf24';
  if (kind === 'binding' || kind === 'dissociation') return '#64748b';
  if (kind === 'indirect' || kind === 'state-change') return '#2dd4bf';
  return '#34d399';
}

/** 箭头 marker（可传入对比视图的前缀化 marker id） */
export function edgeMarker(kind: EdgeKind, actId = 'arrowAct', inhId = 'arrowInh', exprId = 'arrowExpr', bindId = 'arrowBind'): string {
  if (kind === 'inhibition' || kind === 'repression' || kind === 'missing' || kind === 'dephosphorylation') return `url(#${inhId})`;
  if (kind === 'expression') return `url(#${exprId})`;
  if (kind === 'binding' || kind === 'dissociation') return `url(#${bindId})`;
  return `url(#${actId})`;
}

export function truncateLabel(s: string): string {
  return s.length > 10 ? `${s.slice(0, 9)}…` : s;
}

export function midpointOf(e: LaidOutEdge): string {
  // 取路径中点近似：解析首尾控制点不可靠，改用贝塞尔 t=0.5
  const m = e.d.match(/-?[\d.]+/g);
  if (!m || m.length < 8) return 'translate(0 0)';
  const nums = m.map(Number);
  const [x0, y0, x1, y1, x2, y2, x3, y3] = nums.slice(0, 8);
  const t = 0.5;
  const x = (1 - t) ** 3 * x0 + 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3 * x3;
  const y = (1 - t) ** 3 * y0 + 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3 * y3;
  return `translate(${x.toFixed(1)} ${y.toFixed(1)})`;
}
