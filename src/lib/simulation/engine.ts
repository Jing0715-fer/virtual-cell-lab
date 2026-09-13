/**
 * 分子级信号转导演示引擎
 * 离散时间动力学模型：节点活性 [0,1] 沿信号边传播，含磷酸化修饰、
 * 抑制性衰减、突变锁定（组成性激活 / 功能缺失）、负反馈与转录延迟。
 */
import type { CoreNode, CoreEdge, EdgeKind, MoleculeKind, Compartment } from '@/types/kegg';
import { getCuratedEvent } from './molecular-notes';

export interface SimNodeState {
  activity: number; // 活性 0–1
  phospho: number; // 磷酸化水平 0–1
  activated: boolean; // 是否跨越激活阈值
  activatedAtTick: number | null;
}

export type EventKind =
  | 'binding' | 'activation' | 'phosphorylation' | 'inhibition' | 'expression'
  | 'repression' | 'mutation' | 'phase' | 'reset' | 'info';

export interface SimEvent {
  id: string;
  tick: number;
  simTime: string; // 模拟时间标注
  kind: EventKind;
  nodeId?: string;
  nodeLabel?: string;
  sourceLabel?: string;
  text: string; // 分子级描述
}

export interface EngineGraph {
  nodes: CoreNode[];
  edges: CoreEdge[];
}

/** 边的信号权重（正=促进，负=衰减） */
const EDGE_WEIGHT: Record<EdgeKind, number> = {
  activation: 1.0,
  phosphorylation: 1.15,
  expression: 0.75,
  binding: 0.9,
  indirect: 0.8,
  'state-change': 0.85,
  dissociation: 0.5,
  missing: 0.45,
  inhibition: -1.7,
  repression: -1.2,
  dephosphorylation: -1.0,
};

const ACTIVE_THRESHOLD = 0.45;
const ON_RATE = 1.35; // 激活速率
const OFF_RATE = 0.16; // 衰减速率
const LIGAND_RATE = 2.0;
const PHOSPHO_DECAY = 0.05;
const EXPRESSION_DELAY_TICKS = 6; // 转录翻译延迟（tick）

export const KIND_ZH: Record<MoleculeKind, string> = {
  ligand: '配体', receptor: '受体', kinase: '激酶', phosphatase: '磷酸酶',
  adapter: '接头蛋白', gtpase: '小 G 蛋白', tf: '转录因子', gene: '靶基因',
  compound: '第二信使', channel: '离子通道', enzyme: '酶',
};

export const COMPARTMENT_ZH: Record<Compartment, string> = {
  extracellular: '细胞外', membrane: '细胞膜', cytoplasm: '细胞质', nucleus: '细胞核',
};

const EDGE_EVENT_KIND: Record<EdgeKind, EventKind> = {
  activation: 'activation', phosphorylation: 'phosphorylation', inhibition: 'inhibition',
  expression: 'expression', repression: 'repression', binding: 'binding',
  dephosphorylation: 'phosphorylation', dissociation: 'activation', indirect: 'activation',
  missing: 'inhibition', 'state-change': 'activation',
};

/** 信号阶段定义 */
export const PHASES = [
  { id: 0, name: '静息态', en: 'Quiescent', desc: '无外源信号，基础活性水平' },
  { id: 1, name: '配体结合', en: 'Ligand binding', desc: '配体扩散至细胞表面并结合受体胞外域' },
  { id: 2, name: '受体激活', en: 'Receptor activation', desc: '受体二聚化/变构，胞内域磷酸化启动' },
  { id: 3, name: '信号级联', en: 'Signal cascade', desc: '胞质激酶级联与第二信使放大' },
  { id: 4, name: '转录响应', en: 'Transcription', desc: '转录因子入核，靶基因表达程序启动' },
] as const;

/** 初始化全部节点状态 */
export function initStates(graph: EngineGraph): Record<string, SimNodeState> {
  const states: Record<string, SimNodeState> = {};
  for (const n of graph.nodes) {
    states[n.id] = { activity: 0, phospho: 0, activated: false, activatedAtTick: null };
  }
  return states;
}

export interface MutationSpec {
  node: string;
  effect: 'constitutive' | 'knockout' | 'overexpress';
  note: string;
}

export interface StepContext {
  graph: EngineGraph;
  states: Record<string, SimNodeState>;
  tick: number;
  injected: Record<string, boolean>;
  mutations: MutationSpec[];
  newEvents: SimEvent[];
  signalFlux: Record<string, number>; // 本 tick 边通量（source>target → 强度，用于可视化）
  /** 药物抑制强度（nodeId → 0-1）：门控该节点作为信号源的催化输出；
   *  被抑制激酶仍可被上游磷酸化（如曲美替尼下 pMEK 累积），仅输出被钳 */
  inhibition?: Record<string, number>;
}

function fmtTime(tick: number): string {
  const sec = tick * 0.5;
  return `T+${sec.toFixed(1)}s`;
}

function phaseOf(tier: number): number {
  if (tier === 0) return 1;
  if (tier === 1) return 2;
  if (tier >= 2 && tier <= 4) return 3;
  return 4;
}

/** 应用细胞系突变（锁定节点状态） */
export function applyMutations(
  graph: EngineGraph,
  states: Record<string, SimNodeState>,
  mutations: MutationSpec[],
): SimEvent[] {
  const events: SimEvent[] = [];
  for (const m of mutations) {
    const st = states[m.node];
    if (!st) continue;
    if (m.effect === 'constitutive') {
      st.activity = 1;
      st.activated = true;
      st.phospho = 1;
      events.push({
        id: `mut-${m.node}`, tick: 0, simTime: 'T+0.0s', kind: 'mutation',
        nodeId: m.node, text: `⚠ 致瘤突变：${m.note}`,
      });
    } else if (m.effect === 'knockout') {
      st.activity = 0;
      st.activated = false;
      events.push({
        id: `mut-${m.node}`, tick: 0, simTime: 'T+0.0s', kind: 'mutation',
        nodeId: m.node, text: `⚠ 功能缺失：${m.note}`,
      });
    }
  }
  return events;
}

/** 单步推进（dt = 1 tick） */
export function step(ctx: StepContext): void {
  const { graph, states, injected, mutations, newEvents } = ctx;
  ctx.tick += 1;
  const tick = ctx.tick;
  ctx.signalFlux = {};

  // 突变锁定
  const mutMap = new Map(mutations.map((m) => [m.node, m]));
  for (const m of mutations) {
    const st = states[m.node];
    if (!st) continue;
    if (m.effect === 'constitutive') {
      st.activity = 1;
      st.phospho = Math.max(st.phospho, 0.95);
    }
  }

  // 1. 配体活性趋向注入目标值（含合成配体）
  for (const n of graph.nodes) {
    if (n.kind !== 'ligand') continue;
    const target = injected[n.id] ? 1 : 0;
    const st = states[n.id];
    if (!st) continue;
    const diff = target - st.activity;
    st.activity += Math.sign(diff) * Math.min(Math.abs(diff), LIGAND_RATE * 0.1);
    if (st.activity > 0.995) st.activity = 1;
    if (st.activity < 0.005) st.activity = 0;
  }

  // 2. 汇集每个节点的输入信号
  const posIn: Record<string, number> = {};
  const negIn: Record<string, number> = {};
  const phosphoIn: Record<string, number> = {};
  // 记录每个节点最显著的输入边（用于事件溯源）
  const bestEdge: Record<string, { src: string; srcLabel: string; kind: EdgeKind; flux: number }> = {};

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  /** 累计一条边（binding/dissociation 类边在 KEGG 中绘制方向常与生物信号流相反，双向传播） */
  const accumulate = (e: CoreEdge, reversed: boolean) => {
    const srcId = reversed ? e.target : e.source;
    const dstId = reversed ? e.source : e.target;
    const src = states[srcId];
    const srcNode = nodeById.get(srcId);
    const dstNode = nodeById.get(dstId);
    if (!src || !srcNode || !dstNode) return;
    // 反向传播不应点亮配体（受体不会"激活"配体分子）
    if (reversed && dstNode.kind === 'ligand') return;
    const isSrcLigand = srcNode.kind === 'ligand';
    // 配体需要较高活性才传导；胞内节点阈值较低
    const srcGate = isSrcLigand ? 0.55 : 0.28;
    if (src.activity < srcGate) return;
    // 药物门控：阻断源节点的催化输出（活性/磷化照常累积，输出归零）
    const inh = ctx.inhibition?.[srcId] ?? 0;
    if (inh >= 0.99) return;
    const w = EDGE_WEIGHT[e.kind] ?? 0.8;
    const flux = src.activity * w * (e.kind === 'expression' ? 0.9 : 1) * (1 - inh);
    const key = `${e.source}>${e.target}`;
    const prevFlux = ctx.signalFlux[key] ?? 0;
    // 视觉通量：保留绝对值更大的方向
    if (Math.abs(flux) > Math.abs(prevFlux)) ctx.signalFlux[key] = flux;
    if (flux >= 0) {
      posIn[dstId] = (posIn[dstId] ?? 0) + flux;
      if (e.kind === 'phosphorylation') phosphoIn[dstId] = (phosphoIn[dstId] ?? 0) + flux;
    } else {
      negIn[dstId] = (negIn[dstId] ?? 0) - flux;
    }
    const prev = bestEdge[dstId];
    if (!prev || Math.abs(flux) > Math.abs(prev.flux)) {
      bestEdge[dstId] = { src: srcId, srcLabel: srcNode.label ?? srcId, kind: e.kind, flux };
    }
  };

  for (const e of graph.edges) {
    accumulate(e, false);
    if (e.kind === 'binding' || e.kind === 'dissociation') {
      accumulate(e, true);
    }
  }

  // 3. 更新节点状态
  const activatedThisTick: CoreNode[] = [];
  for (const n of graph.nodes) {
    const st = states[n.id];
    if (!st) continue;
    const mut = mutMap.get(n.id);
    if (mut?.effect === 'constitutive') continue; // 锁定
    if (mut?.effect === 'knockout') {
      st.activity = 0;
      st.phospho = 0;
      continue;
    }
    if (n.kind === 'ligand') continue; // 已在配体更新中处理

    const pos = posIn[n.id] ?? 0;
    const neg = negIn[n.id] ?? 0;
    let da = 0;
    if (pos > 0) da += ON_RATE * pos * (1 - st.activity) * 0.1;
    if (neg > 0) da -= ON_RATE * neg * st.activity * 0.12;
    da -= OFF_RATE * st.activity * 0.1;
    // 基础泄漏（突变表型：即使无输入也缓慢自发活化）
    st.activity = clamp(st.activity + da, 0, 1);

    // 磷酸化修饰
    const pIn = phosphoIn[n.id] ?? 0;
    if (pIn > 0) st.phospho = clamp(st.phospho + 0.2 * pIn * (1 - st.phospho) * 0.1, 0, 1);
    else st.phospho = Math.max(0, st.phospho - PHOSPHO_DECAY * 0.1);

    // 激活事件检测
    if (!st.activated && st.activity >= ACTIVE_THRESHOLD) {
      st.activated = true;
      st.activatedAtTick = tick;
      activatedThisTick.push(n);
    } else if (st.activated && st.activity < 0.18) {
      st.activated = false; // 信号消退可再触发（仅记录最近一次）
    }
  }

  // 4. 生成分子事件（带转录延迟语义）
  for (const n of activatedThisTick) {
    const be = bestEdge[n.id];
    let text: string;
    const kind: EventKind = n.kind === 'gene'
      ? 'expression'
      : be ? EDGE_EVENT_KIND[be.kind] : 'activation';
    if (be) {
      const curated = getCuratedEvent(be.src, n.id) ?? getCuratedEvent(be.src, n.label);
      if (curated) {
        text = curated;
      } else {
        text = genericEventText(be.srcLabel, n, be.kind);
      }
    } else if (n.kind === 'gene') {
      text = `${n.label} 基因转录启动——mRNA 出核后经核糖体翻译为功能蛋白（延迟 ${EXPRESSION_DELAY_TICKS * 0.5} s，示意）`;
    } else {
      text = `${n.label} 达到激活阈值（活性 >45%），进入信号网络参与状态`;
    }
    if (n.kind === 'gene') {
      text = `[转录] ${text}`;
    }
    newEvents.push({
      id: `e${tick}-${n.id}`, tick, simTime: fmtTime(tick), kind,
      nodeId: n.id, nodeLabel: n.label, sourceLabel: be?.srcLabel,
      text,
    });
  }
}

function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

/** 通用事件文案（无策划条目时的科学化模板） */
function genericEventText(srcLabel: string, dst: CoreNode, kind: EdgeKind): string {
  const dk = dst.kind;
  switch (kind) {
    case 'binding':
      return `${srcLabel} 与 ${dst.label} 发生分子互作，形成信号传递复合体。`;
    case 'phosphorylation':
      if (dk === 'tf') return `${srcLabel} 磷酸化转录因子 ${dst.label}（Ser/Thr 残基），增强其 DNA 结合与反式激活活性。`;
      if (dk === 'kinase') return `${srcLabel} 磷酸化 ${dst.label} 激活环保守残基，级联信号逐级放大。`;
      return `${srcLabel} 磷酸化 ${dst.label}，改变其分子构象与活性。`;
    case 'inhibition':
      return `${srcLabel} 抑制 ${dst.label} 活性（负调控/反馈环），信号强度下调。`;
    case 'dephosphorylation':
      return `${srcLabel} 去磷酸化 ${dst.label}，终止其活性状态（信号衰减）。`;
    case 'expression':
      return `${srcLabel} 结合 ${dst.label} 启动子顺式元件，招募 RNA Pol II 启动转录。`;
    case 'repression':
      return `${srcLabel} 抑制 ${dst.label} 转录（转录抑制）。`;
    case 'activation':
      if (dk === 'tf') return `${srcLabel} 激活转录因子 ${dst.label}，后者将入核调控基因表达程序。`;
      if (dk === 'receptor') return `${srcLabel} 诱导受体 ${dst.label} 构象变化，胞内域暴露信号面。`;
      return `${srcLabel} 激活 ${dst.label}，信号沿级联向前推进。`;
    default:
      return `${srcLabel} → ${dst.label} 信号传递。`;
  }
}

/** 计算当前信号阶段（0-4） */
export function computePhase(
  graph: EngineGraph,
  states: Record<string, SimNodeState>,
): number {
  let phase = 0;
  for (const n of graph.nodes) {
    const st = states[n.id];
    if (st?.activated) phase = Math.max(phase, phaseOf(n.tier));
  }
  return phase;
}

/** 活性历史采样（用于曲线图） */
export interface ActivitySample {
  tick: number;
  values: Record<string, number>;
}

export function sampleActivity(
  graph: EngineGraph,
  states: Record<string, SimNodeState>,
  tick: number,
): ActivitySample {
  const values: Record<string, number> = {};
  for (const n of graph.nodes) values[n.id] = states[n.id]?.activity ?? 0;
  return { tick, values };
}
