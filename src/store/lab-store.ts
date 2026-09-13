/**
 * 实验台全局状态（zustand）
 * 管理：细胞系/通路选择 → 图加载 → 模拟引擎状态机（tick 驱动）→ 事件流/活性历史
 */
import { create } from 'zustand';
import type { PathwayGraph } from '@/types/kegg';
import {
  initStates, applyMutations, step, computePhase, sampleActivity,
  type SimNodeState, type SimEvent, type MutationSpec, type ActivitySample, type StepContext,
} from '@/lib/simulation/engine';
import { applyScaffoldEdges } from '@/lib/simulation/scaffold';
import { CELL_TYPE_MAP } from '@/data/cell-types';

export type ViewMode = 'cell' | 'map';

interface LabStore {
  // 实验配置
  cellId: string;
  pathwayId: string | null;
  view: ViewMode;

  // 通路图数据
  graph: PathwayGraph | null;
  graphLoading: boolean;
  graphError: string | null;

  // 模拟状态
  nodeStates: Record<string, SimNodeState>;
  signalFlux: Record<string, number>;
  tick: number;
  running: boolean;
  speed: number;
  injected: Record<string, boolean>;
  phase: number;
  events: SimEvent[];
  activityHistory: ActivitySample[];
  selectedNode: string | null;
  autoInjected: boolean;

  // actions
  setCell: (id: string) => void;
  selectPathway: (id: string | null) => void;
  setView: (v: ViewMode) => void;
  setGraphState: (loading: boolean, error: string | null, graph: PathwayGraph | null) => void;
  loadGraph: (graph: PathwayGraph) => void;
  play: () => void;
  pause: () => void;
  resetSim: () => void;
  stepOnce: () => void;
  setSpeed: (n: number) => void;
  toggleLigand: (id: string, on?: boolean) => void;
  tickSim: () => void;
  selectNode: (id: string | null) => void;
}

const MAX_EVENTS = 240;
const MAX_HISTORY = 260;

export const useLabStore = create<LabStore>((set, get) => ({
  cellId: 'hepatocyte',
  pathwayId: 'hsa04010',
  view: 'cell',
  graph: null,
  graphLoading: false,
  graphError: null,

  nodeStates: {},
  signalFlux: {},
  tick: 0,
  running: false,
  speed: 1,
  injected: {},
  phase: 0,
  events: [],
  activityHistory: [],
  selectedNode: null,
  autoInjected: false,

  setCell: (id) => {
    set({ cellId: id });
    // 细胞系切换后重置模拟（保持通路选择）
    const { graph, resetSim } = get();
    if (graph) resetSim();
  },

  selectPathway: (id) => {
    set({ pathwayId: id, graph: null, graphError: null, running: false, view: 'cell' });
  },

  setView: (v) => set({ view: v }),

  setGraphState: (loading, error, graph) => set({ graphLoading: loading, graphError: error, graph }),

  loadGraph: (graph) => {
    // 附加支架边（补全 KEGG 绘图语义断链），不修改 react-query 缓存中的原始对象
    const enhanced: PathwayGraph = {
      ...graph,
      core: {
        nodes: graph.core.nodes,
        edges: applyScaffoldEdges(graph.meta.id, graph.core.nodes, graph.core.edges),
      },
    };
    const states = initStates(enhanced.core);
    const cell = CELL_TYPE_MAP.get(get().cellId);
    const mutations: MutationSpec[] = (cell?.mutations ?? []).filter(
      (m) => enhanced.core.nodes.some((n) => n.id === m.node),
    );
    const mutEvents = applyMutations(enhanced.core, states, mutations);
    const phase0 = computePhase(enhanced.core, states);
    set({
      graph: enhanced,
      graphLoading: false,
      graphError: null,
      nodeStates: states,
      signalFlux: {},
      tick: 0,
      running: false,
      injected: {},
      phase: phase0,
      events: [
        {
          id: 'sys-init', tick: 0, simTime: 'T+0.0s', kind: 'info',
          text: `已加载 ${graph.meta.nameZh}（KEGG ${graph.meta.id}）：${graph.stats.geneCount} 个分子条目 · 核心演示子图 ${graph.stats.coreCount} 节点。点击播放或注入配体开始演示。`,
        },
        ...mutEvents,
      ],
      activityHistory: [sampleActivity(enhanced.core, states, 0)],
      selectedNode: null,
      autoInjected: false,
    });
  },

  play: () => {
    const { graph, injected, autoInjected, tickSim, cellId, tick, events } = get();
    if (!graph) return;
    // 尚未注入任何配体时，自动选择“有效”配体（在子图中存在下游受体连接），优先细胞系响应配体
    if (!autoInjected && Object.values(injected).every((v) => !v)) {
      const ligands = graph.core.nodes.filter((n) => n.tier === 0);
      const tierById = new Map(graph.core.nodes.map((n) => [n.id, n.tier]));
      const downstream = new Map<string, string[]>();
      for (const e of graph.core.edges) {
        if (!downstream.has(e.source)) downstream.set(e.source, []);
        downstream.get(e.source)!.push(e.target);
      }
      const responsive = CELL_TYPE_MAP.get(cellId)?.responsiveLigands ?? [];
      const withReceptor = ligands.filter(
        (l) => (downstream.get(l.id) ?? []).some((t) => tierById.get(t) === 1),
      );
      const productive = ligands.filter((l) => (downstream.get(l.id) ?? []).length > 0);
      const preferred =
        withReceptor.find((l) => responsive.includes(l.label) || responsive.includes(l.id)) ??
        withReceptor[0] ??
        productive.find((l) => responsive.includes(l.label) || responsive.includes(l.id)) ??
        productive[0] ??
        ligands[0];
      if (preferred) {
        set({
          injected: { [preferred.id]: true },
          autoInjected: true,
          running: true,
          events: [
            ...events,
            {
              id: `auto-${Date.now()}`, tick, simTime: `T+${(tick * 0.5).toFixed(1)}s`,
              kind: 'binding',
              nodeId: preferred.id,
              text: `自动注射外源配体 ${preferred.label}${preferred.synthetic ? '（合成激动剂）' : ''}至细胞外培养基，等待与受体结合。`,
            },
          ],
        });
        return;
      }
    }
    set({ running: true });
    tickSim();
  },

  pause: () => set({ running: false }),

  resetSim: () => {
    const { graph, loadGraph } = get();
    if (graph) {
      loadGraph(graph);
    } else {
      set({ nodeStates: {}, tick: 0, running: false, phase: 0, events: [], injected: {}, activityHistory: [], signalFlux: {}, autoInjected: false });
    }
  },

  stepOnce: () => {
    set({ running: false });
    get().tickSim();
  },

  setSpeed: (n) => set({ speed: n }),

  toggleLigand: (id, on) => {
    const { injected, tick, events } = get();
    const next = { ...injected, [id]: on ?? !injected[id] };
    const graph = get().graph;
    const node = graph?.core.nodes.find((n) => n.id === id);
    const turningOn = next[id];
    const newEvents = turningOn
      ? [
          ...events,
          {
            id: `inj-${id}-${Date.now()}`, tick, simTime: `T+${(tick * 0.5).toFixed(1)}s`,
            kind: 'binding' as const, nodeId: id, nodeLabel: node?.label,
            text: `手动注射配体 ${node?.label ?? id} —— 分子扩散至细胞表面，等待与受体结合。`,
          },
        ]
      : [
          ...events,
          {
            id: `wash-${id}-${Date.now()}`, tick, simTime: `T+${(tick * 0.5).toFixed(1)}s`,
            kind: 'info' as const, nodeId: id, nodeLabel: node?.label,
            text: `洗脱配体 ${node?.label ?? id}：胞外浓度归零，残余信号将经衰减/负反馈回落。`,
          },
        ];
    set({
      injected: next,
      autoInjected: true,
      events: newEvents.slice(-MAX_EVENTS),
    });
  },

  tickSim: () => {
    const { graph, nodeStates, tick, injected, events, activityHistory, speed, running } = get();
    if (!graph) return;
    // speed 以多步/单步实现（0.5 = 每 2 tick 执行 1 次推进的近似；直接乘 dt 更平滑）
    const steps = speed >= 2 ? Math.round(speed) : 1;
    let states = nodeStates;
    let t = tick;
    const newEvents: SimEvent[] = [];
    let flux: Record<string, number> = {};
    for (let i = 0; i < steps; i++) {
      const ctx: StepContext = {
        graph: graph.core,
        states,
        tick: t,
        injected,
        mutations: (CELL_TYPE_MAP.get(get().cellId)?.mutations ?? []).map((m) => ({
          ...m,
          effect: m.effect as MutationSpec['effect'],
        })),
        newEvents,
        signalFlux: {},
      };
      step(ctx);
      states = ctx.states;
      t = ctx.tick;
      flux = ctx.signalFlux;
    }
    const phase = computePhase(graph.core, states);
    const sample = sampleActivity(graph.core, states, t);
    set({
      nodeStates: states,
      tick: t,
      phase,
      signalFlux: flux,
      events: events.length + newEvents.length > MAX_EVENTS
        ? [...events, ...newEvents].slice(-MAX_EVENTS)
        : [...events, ...newEvents],
      activityHistory: [...activityHistory, sample].slice(-MAX_HISTORY),
      running,
    });
  },

  selectNode: (id) => set({ selectedNode: id }),
}));
