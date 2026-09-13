/**
 * 教学引导模式 —— 分步讲解经典信号级联
 * 每步聚焦一个分子：相机飞行 + 分子高亮 + 残基级科学注释
 * 数据来源: 手工策划级联（MAPK 等经典通路）+ 自动级联推导（其余通路回退）
 * 注释文本复用 NODE_NOTES / CURATED_EVENTS（分子级精确注释体系）
 */
import type { PathwayGraph, CoreNode, CoreEdge } from '@/types/kegg';
import { NODE_NOTES, getCuratedEvent, fallbackNote } from '@/lib/simulation/molecular-notes';
import { KIND_ZH, COMPARTMENT_ZH } from '@/lib/simulation/engine';

export interface TourStep {
  /** 聚焦分子（核心子图 node id） */
  nodeId: string;
  label: string;
  /** 站点标题（如「③ GEF 转位」） */
  title: string;
  /** 分子功能注释 */
  text: string;
  /** 与上一站的级联注释（残基级） */
  edgeNote?: string;
  /** 区室标签（如「细胞质 → 细胞核」） */
  phaseTag: string;
}

interface CuratedChain {
  /** 有序节点 id 序列 */
  chain: string[];
  /** 每站标题 */
  titles: string[];
}

/**
 * 手工策划的经典教学级联（标题 + 顺序经过教学设计审核）
 * MAPK: 生长因子 → 受体 → 接头 → GEF → 小 G 蛋白 → 三级激酶 → TF → 即早基因
 */
const CURATED_TOURS: Record<string, CuratedChain> = {
  hsa04010: {
    chain: ['EGF', 'EGFR', 'GRB2', 'SOS1', 'HRAS', 'RAF1', 'MAP2K1', 'MAPK1', 'ELK1', 'FOS'],
    titles: [
      '信号起点 · 配体扩散',
      '受体识别 · 二聚活化',
      '接头募集 · SH2 停靠',
      'GEF 转位 · 膜定位激活',
      'RAS 开关 · GTP 装载',
      'MAPKKK · 级联第一级',
      'MAPKK · 双特异性磷酸化',
      'MAPK · 终端效应激酶',
      '转录因子 · 入核磷酸化',
      '即早基因 · 转录应答',
    ],
  },
};

/** 手工策划链的补充文案（引导语，教育性 framing） */
const CURATED_INTROS: Record<string, string> = {
  hsa04010:
    '经典 RTK-RAS-ERK 级联：一次生长因子刺激如何在 10 站之内从细胞外抵达细胞核内的基因。',
};

const EDGE_BIDIRECTIONAL = new Set(['binding', 'association']);

/** 邻居推导：信号下游（含 KGML 反向绘制的 binding 边） */
function downstream(nodeId: string, edges: CoreEdge[]): CoreEdge[] {
  const out: CoreEdge[] = [];
  for (const e of edges) {
    if (e.source === nodeId) out.push(e);
    else if (e.target === nodeId && EDGE_BIDIRECTIONAL.has(e.kind)) out.push(e);
  }
  return out;
}

function neighborOf(e: CoreEdge, id: string): string | null {
  if (e.source === id) return e.target;
  if (e.target === id) return e.source;
  return null;
}

/**
 * 自动推导级联（未手工策划的通路）:
 * 从首选配体出发贪心游走 —— 优先残基级策划注释边，其次层级递进，游走深度 ≤ 11
 */
function autoChain(graph: PathwayGraph): string[] {
  const nodes = graph.core.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = graph.core.edges;

  // 起点: 有下游连接的配体（tier 0）；无配体则从最高连接度的受体开始
  const ligands = nodes.filter((n) => n.tier === 0 && downstream(n.id, edges).length > 0);
  const receptors = nodes.filter((n) => n.tier === 1);
  let start: string | null = ligands[0]?.id ?? null;
  if (!start) {
    const bestRec = receptors
      .map((n) => ({ n, deg: downstream(n.id, edges).length }))
      .sort((a, b) => b.deg - a.deg)[0];
    start = bestRec?.n.id ?? null;
  }
  if (!start) return [];

  const chain: string[] = [start];
  const visited = new Set([start]);
  let cur = start;
  while (chain.length < 11) {
    const nexts = downstream(cur, edges)
      .map((e) => neighborOf(e, cur))
      .filter((id): id is string => !!id && !visited.has(id));
    if (nexts.length === 0) break;
    const curTier = byId.get(cur)?.tier ?? 0;
    const scored = nexts.map((id) => {
      const n = byId.get(id);
      if (!n) return { id, s: -1 };
      let s = 0;
      if (getCuratedEvent(cur, id) || getCuratedEvent(id, cur)) s += 6;
      if (n.tier === curTier + 1) s += 4;
      else if (n.tier > curTier) s += 2;
      if (n.kind === 'tf' || n.kind === 'gene') s += 1;
      return { id, s };
    });
    scored.sort((a, b) => b.s - a.s);
    // 终点: 到达靶基因（tier 6）后停止
    const nxt = scored[0].id;
    chain.push(nxt);
    visited.add(nxt);
    cur = nxt;
    if ((byId.get(nxt)?.tier ?? 0) >= 6) break;
  }
  return chain;
}

/** 构建教学引导步骤序列 */
export function buildGuidedTour(graph: PathwayGraph): TourStep[] {
  const curated = CURATED_TOURS[graph.meta.id];
  const chain = curated ? curated.chain.filter((id) => graph.core.nodes.some((n) => n.id === id)) : autoChain(graph);
  if (chain.length === 0) return [];

  const byId = new Map(graph.core.nodes.map((n) => [n.id, n]));
  const roman = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];
  const steps: TourStep[] = [];

  chain.forEach((id, i) => {
    const node = byId.get(id);
    if (!node) return;
    const prev = i > 0 ? byId.get(chain[i - 1]) : null;
    const text =
      NODE_NOTES[id] ?? NODE_NOTES[node.label] ??
      fallbackNote(node.label, KIND_ZH[node.kind] ?? '分子', COMPARTMENT_ZH[node.compartment] ?? '细胞');
    let edgeNote: string | undefined;
    if (prev) {
      edgeNote =
        getCuratedEvent(prev.id, id) ??
        getCuratedEvent(id, prev.id) ??
        getCuratedEvent(prev.label, node.label) ??
        getCuratedEvent(node.label, prev.label);
    }
    steps.push({
      nodeId: id,
      label: node.label,
      title: curated?.titles[i] ?? `${roman[i] ?? ''} ${node.label} · ${KIND_ZH[node.kind] ?? '分子'}`,
      text,
      edgeNote,
      phaseTag: `${COMPARTMENT_ZH[node.compartment] ?? '细胞'} · 层级 L${node.tier}`,
    });
  });
  return steps;
}

/** 引导模式开场语（引导教学 framing） */
export function tourIntro(graph: PathwayGraph, stepCount: number): string {
  return (
    CURATED_INTROS[graph.meta.id] ??
    `${graph.meta.nameZh}：沿主信号流逐站讲解，共 ${stepCount} 站（自动推导级联，注释来自 KEGG 关系语义与策划注释库）。`
  );
}
