/**
 * 通路对比模式 —— 双细胞系（正常 vs 病变）同通路并行模拟
 * 独立于主实验台（不影响 lab-store 的单细胞实验状态）
 * 科学设计: 同一 KEGG 图谱、同一配体刺激、同一引擎参数 —— 唯一变量是细胞系遗传背景
 *   （如 肝细胞 vs KRAS G12D 癌细胞: KRAS 组成性激活 / PTEN 缺失 / TP53 失活）
 * 输出: 逐分子活性差值 + 级联速度差 + 靶基因转录响应差 → 定量呈现"通路自主性"
 */
import { create } from 'zustand';
import type { PathwayGraph } from '@/types/kegg';
import {
  initStates, applyMutations, step, computePhase, sampleActivity,
  type SimNodeState, type SimEvent, type MutationSpec, type ActivitySample, type StepContext,
} from '@/lib/simulation/engine';
import { applyScaffoldEdges } from '@/lib/simulation/scaffold';
import { CELL_TYPE_MAP } from '@/data/cell-types';
import { resolveMutations } from '@/lib/simulation/mutation-equiv';

export interface CompareArm {
  cellId: string;
  states: Record<string, SimNodeState>;
  events: SimEvent[];
  activityHistory: ActivitySample[];
  phase: number;
  /** 首次到达各阶段的 tick（含阶段 4 转录应答） */
  phaseReachedAt: Record<number, number>;
}

interface CompareStore {
  active: boolean;
  pathwayId: string | null;
  /** 图谱共享（两臂同一对象，保证节点对齐） */
  graph: PathwayGraph | null;
  /** A = 正常对照, B = 病变实验 */
  armA: CompareArm | null;
  armB: CompareArm | null;
  cellA: string;
  cellB: string;
  tick: number;
  running: boolean;
  /** 注射的配体（两臂同步） */
  injected: Record<string, boolean>;
  /** 共享配体池（两臂响应配体并集, 优先共同响应） */
  sharedLigands: string[];

  open: (pathwayId: string, graph: PathwayGraph) => void;
  close: () => void;
  setCellA: (id: string) => void;
  setCellB: (id: string) => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  tickCompare: () => void;
  toggleLigand: (id: string) => void;
}

const MAX_EVENTS = 140;
const MAX_HISTORY = 220;

/** 获取细胞系可用突变（核心子图内解析, 含同族等价回退 —— 详见 mutation-equiv.ts） */
function mutationsFor(cellId: string, graph: PathwayGraph): { specs: MutationSpec[]; notes: string[] } {
  const cell = CELL_TYPE_MAP.get(cellId);
  if (!cell?.mutations) return { specs: [], notes: [] };
  const specs = resolveMutations(cell.mutations, graph.core.nodes);
  return { specs, notes: specs.map((m) => `${m.node} ${m.effect === 'constitutive' ? '组成性激活' : m.effect === 'knockout' ? '功能缺失' : '过表达'}`) };
}

function makeArm(cellId: string, graph: PathwayGraph, injected: Record<string, boolean>, events: SimEvent[], history: ActivitySample[], tick: number): CompareArm {
  const states = initStates(graph.core);
  const { specs } = mutationsFor(cellId, graph);
  const mutEvents = applyMutations(graph.core, states, specs);
  // 注入已激活的配体状态（重置时保留配体选择）
  const phase = computePhase(graph.core, states);
  const phaseReachedAt: Record<number, number> = {};
  void injected; void tick;
  return {
    cellId,
    states,
    events: [...events, ...mutEvents],
    activityHistory: history.length ? history : [sampleActivity(graph.core, states, 0)],
    phase,
    phaseReachedAt,
  };
}

/** 共享配体池: 两臂响应配体的并集，共同响应优先排前 */
function computeSharedLigands(a: string, b: string, graph: PathwayGraph): string[] {
  const ligands = graph.core.nodes.filter((n) => n.tier === 0).map((n) => n.label);
  const respA = new Set(CELL_TYPE_MAP.get(a)?.responsiveLigands ?? []);
  const respB = new Set(CELL_TYPE_MAP.get(b)?.responsiveLigands ?? []);
  const both = ligands.filter((l) => respA.has(l) && respB.has(l));
  const either = ligands.filter((l) => respA.has(l) || respB.has(l));
  return [...both, ...either.filter((l) => !both.includes(l))];
}

export const useCompareStore = create<CompareStore>((set, get) => ({
  active: false,
  pathwayId: null,
  graph: null,
  armA: null,
  armB: null,
  cellA: 'hepatocyte',
  cellB: 'cancer',
  tick: 0,
  running: false,
  injected: {},
  sharedLigands: [],

  open: (pathwayId, graph) => {
    // 附加支架边（与主实验台一致）
    const enhanced: PathwayGraph = {
      ...graph,
      core: {
        nodes: graph.core.nodes,
        edges: applyScaffoldEdges(graph.meta.id, graph.core.nodes, graph.core.edges),
      },
    };
    const { cellA, cellB } = get();
    const initEvent = (cellId: string): SimEvent => ({
      id: `cmp-init-${cellId}`, tick: 0, simTime: 'T+0.0s', kind: 'info',
      text: `对照实验就绪：${CELL_TYPE_MAP.get(cellId)?.name ?? cellId} · ${graph.meta.nameZh}`,
    });
    set({
      active: true,
      pathwayId,
      graph: enhanced,
      armA: makeArm(cellA, enhanced, {}, [initEvent(cellA)], [], 0),
      armB: makeArm(cellB, enhanced, {}, [initEvent(cellB)], [], 0),
      tick: 0,
      running: false,
      injected: {},
      sharedLigands: computeSharedLigands(cellA, cellB, enhanced),
    });
  },

  close: () => set({ active: false, running: false }),

  setCellA: (id) => {
    const { graph, injected, armA, armB } = get();
    if (!graph) return;
    const keep = armA?.activityHistory ?? [];
    set({ cellA: id, armA: makeArm(id, graph, injected, armA?.events.slice(0, 1) ?? [], keep.slice(0, 1), 0), sharedLigands: computeSharedLigands(id, get().cellB, graph) });
    void armB;
  },

  setCellB: (id) => {
    const { graph, injected, armB } = get();
    if (!graph) return;
    set({ cellB: id, armB: makeArm(id, graph, injected, armB?.events.slice(0, 1) ?? [], [], 0), sharedLigands: computeSharedLigands(get().cellA, id, graph) });
  },

  play: () => {
    const { graph, injected, tick } = get();
    if (!graph) return;
    // 首次播放自动选择共享配体（优先两臂共同响应）
    if (Object.values(injected).every((v) => !v)) {
      const shared = get().sharedLigands;
      const ligandNode = shared.length
        ? graph.core.nodes.find((n) => n.tier === 0 && (n.label === shared[0] || n.id === shared[0]))
        : graph.core.nodes.find((n) => n.tier === 0);
      if (ligandNode) {
        const noteA = get().armA!;
        const noteB = get().armB!;
        const injectEv = (suffix: string): SimEvent => ({
          id: `c${suffix}-${Date.now()}`, tick, simTime: `T+${(tick * 0.5).toFixed(1)}s`, kind: 'binding', nodeId: ligandNode.id,
          text: `同步注射 ${ligandNode.label} —— A/B 两臂同时接受相同剂量刺激。`,
        });
        set({
          injected: { [ligandNode.id]: true },
          running: true,
          armA: { ...noteA, events: [...noteA.events, injectEv('a')].slice(-MAX_EVENTS) },
          armB: { ...noteB, events: [...noteB.events, injectEv('b')].slice(-MAX_EVENTS) },
        });
        return;
      }
    }
    set({ running: true });
    get().tickCompare();
  },

  pause: () => set({ running: false }),

  reset: () => {
    const { graph, cellA, cellB } = get();
    if (!graph) return;
    set({
      armA: makeArm(cellA, graph, {}, [], [], 0),
      armB: makeArm(cellB, graph, {}, [], [], 0),
      tick: 0,
      running: false,
      injected: {},
    });
  },

  toggleLigand: (id) => {
    const { injected, tick, armA, armB } = get();
    if (!armA || !armB) return;
    const next = { ...injected, [id]: !injected[id] };
    const label = id;
    const ev: SimEvent = {
      id: `cl-${id}-${Date.now()}`, tick, simTime: `T+${(tick * 0.5).toFixed(1)}s`, kind: 'binding', nodeId: id,
      text: next[id] ? `注射配体 ${label}（两臂同步）` : `洗脱配体 ${label}`,
    };
    set({ injected: next, armA: { ...armA, events: [...armA.events, ev].slice(-MAX_EVENTS) }, armB: { ...armB, events: [...armB.events, ev].slice(-MAX_EVENTS) } });
  },

  tickCompare: () => {
    const { graph, armA, armB, tick, injected, running } = get();
    if (!graph || !armA || !armB || !running) return;
    const nextTick = tick + 1;
    const runArm = (arm: CompareArm, cellId: string): CompareArm => {
      const events: SimEvent[] = [];
      const ctx: StepContext = {
        graph: graph.core,
        states: arm.states,
        tick,
        injected,
        mutations: mutationsFor(cellId, graph).specs,
        newEvents: events,
        signalFlux: {},
      };
      step(ctx);
      const phase = computePhase(graph.core, ctx.states);
      const phaseReachedAt = { ...arm.phaseReachedAt };
      if (phase > (arm.phase ?? 0) && !phaseReachedAt[phase]) phaseReachedAt[phase] = nextTick;
      return {
        ...arm,
        states: ctx.states,
        events: [...arm.events, ...events].slice(-MAX_EVENTS),
        activityHistory: [...arm.activityHistory, sampleActivity(graph.core, ctx.states, nextTick)].slice(-MAX_HISTORY),
        phase,
        phaseReachedAt,
      };
    };
    set({
      armA: runArm(armA, get().cellA),
      armB: runArm(armB, get().cellB),
      tick: nextTick,
    });
  },
}));

/* ============ 对比分析选择器 ============ */

export interface MoleculeDelta {
  id: string;
  label: string;
  kind: string;
  tier: number;
  /** 病变臂 − 正常臂 活性差 */
  delta: number;
  activityA: number;
  activityB: number;
  /** 病变臂是否更早激活（tick 差; 正值 = B 更快） */
  activatedTickA: number | null;
  activatedTickB: number | null;
}

/** 逐分子差异（按 |Δ| 排序） */
export function moleculeDeltas(graph: PathwayGraph | null, armA: CompareArm | null, armB: CompareArm | null): MoleculeDelta[] {
  if (!graph || !armA || !armB) return [];
  const out: MoleculeDelta[] = [];
  for (const n of graph.core.nodes) {
    const a = armA.states[n.id]?.activity ?? 0;
    const b = armB.states[n.id]?.activity ?? 0;
    out.push({
      id: n.id, label: n.label, kind: n.kind, tier: n.tier,
      delta: b - a, activityA: a, activityB: b,
      activatedTickA: armA.states[n.id]?.activatedAtTick ?? null,
      activatedTickB: armB.states[n.id]?.activatedAtTick ?? null,
    });
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

export interface CompareSummary {
  /** 病变自主激活分子数（B 活性 >0.5 而 A ≈0） */
  autonomousCount: number;
  /** 平均活性差 */
  meanDelta: number;
  /** 级联提速（B 首次到达阶段 4 的 tick − A 同项; 负值 = B 更快） */
  phase4LeadTicks: number | null;
  /** 两臂共同激活的分子数 */
  bothActive: number;
  totalEvents: number;
}

export function compareSummary(deltas: MoleculeDelta[], armA: CompareArm, armB: CompareArm): CompareSummary {
  let autonomous = 0;
  let both = 0;
  let sum = 0;
  for (const d of deltas) {
    sum += d.delta;
    const aOn = d.activityA > 0.5;
    const bOn = d.activityB > 0.5;
    if (bOn && !aOn) autonomous++;
    if (aOn && bOn) both++;
  }
  const a4 = armA.phaseReachedAt?.[4] ?? null;
  const b4 = armB.phaseReachedAt?.[4] ?? null;
  return {
    autonomousCount: autonomous,
    meanDelta: deltas.length ? sum / deltas.length : 0,
    phase4LeadTicks: a4 != null && b4 != null ? b4 - a4 : null,
    bothActive: both,
    totalEvents: armA.events.length + armB.events.length,
  };
}
