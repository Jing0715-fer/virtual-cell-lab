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
import { pathwayActivity } from '@/data/pathway-cell-matrix';
import { INHIBITORS } from '@/data/inhibitors';
import { resolveMutations } from '@/lib/simulation/mutation-equiv';

export type ViewMode = 'cell' | 'map' | 'cell3d';

interface LabStore {
  // 实验配置
  cellId: string;
  pathwayId: string | null;
  view: ViewMode;
  /** v15 细胞分裂 3D 演示开关（workspace 视图切换器 Tab 与 cell3d HUD 双入口共用单一真源） */
  mitosisOpen: boolean;
  setMitosisOpen: (v: boolean) => void;
  /** v36 分裂演示模式: 有丝分裂（2 子细胞） / 减数分裂（4 配子）—— HUD 面板双 tab */
  divisionMode: 'mitosis' | 'meiosis';
  setDivisionMode: (m: 'mitosis' | 'meiosis') => void;
  /** v60 细胞器图鉴开关（HUD 与无通路引导 pill 双入口共用真源 —— 视图切换后状态保持） */
  atlasOpen: boolean;
  setAtlasOpen: (v: boolean) => void;

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
  /** 药理扰动：drugId → 是否投药 */
  inhibitors: Record<string, boolean>;
  /** 药代动力学：drugId → 血药浓度等效强度 0-1 */
  drugLevels: Record<string, number>;
  /** 节点级阻断强度（视图直读，nodeId → 0-1） */
  inhibition: Record<string, number>;

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
  toggleInhibitor: (drugId: string) => void;
  tickSim: () => void;
  selectNode: (id: string | null) => void;
  /** v33 教学引导 ↔ 模拟引擎联动: 站点切换写入引擎状态（活性/磷化点亮 + 事件流叙事 + 阶段推进）
   *  引导模式模拟暂停 —— 本 action 直接写入快照（不动 running）, 退出后点播放可从教毕状态续跑 */
  tourStep: (p: {
    nodeId: string;
    label: string;
    prevLabel?: string;
    text: string;
    kind: SimEvent['kind'];
  }) => void;
}

const MAX_EVENTS = 240;
const MAX_HISTORY = 260;

export const useLabStore = create<LabStore>((set, get) => ({
  cellId: 'hepatocyte',
  // v56a 初始不加载通路（用户需求）: 进入实验台先呈现纯 3D 细胞结构浏览态（细胞器/双核/
  // 细胞骨架完整渲染, 与通路数据零耦合）; 用户从 PathwayLibrary 主动选定后才装配信号演示
  pathwayId: null,
  view: 'cell3d',
  mitosisOpen: false,
  divisionMode: 'mitosis',
  atlasOpen: false,
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
  inhibitors: {},
  drugLevels: {},
  inhibition: {},

  setCell: (id) => {
    // 通路 × 细胞类型表达约束: 当前通路在新细胞中未检出时，自动切换至该细胞的特征通路
    const { pathwayId, resetSim, selectPathway } = get();
    const mismatch = !!pathwayId && pathwayActivity(pathwayId, id) === 'inactive';
    set({ cellId: id });
    if (mismatch) {
      const sig = CELL_TYPE_MAP.get(id)?.pathways[0];
      if (sig && sig !== pathwayId) {
        selectPathway(sig); // graph 置空 → 触发重新获取
        return;
      }
    }
    // 细胞系切换后重置模拟（保持通路选择）
    if (get().graph) resetSim();
  },

  selectPathway: (id) => {
    set({ pathwayId: id, graph: null, graphError: null, running: false, view: 'cell3d' });
  },

  setView: (v) => set({ view: v }),

  setMitosisOpen: (v) => set({ mitosisOpen: v }),

  setAtlasOpen: (v) => set({ atlasOpen: v }),

  setDivisionMode: (m) => set({ divisionMode: m }),

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
    const mutations: MutationSpec[] = resolveMutations(cell?.mutations ?? [], enhanced.core.nodes);
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
      inhibitors: {},
      drugLevels: {},
      inhibition: {},
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
      // 正向边种类（激活/磷酸化/结合等）—— 配体→受体为抑制性边（如 Notch 的 JAG1 顺式抑制）时不作为刺激入口
      const POSITIVE_KINDS = new Set(['activation', 'phosphorylation', 'expression', 'binding', 'indirect', 'state-change', 'dissociation', 'missing']);
      const ligandEdges = (l: { id: string }) => graph.core.edges.filter((e) => e.source === l.id);
      const withReceptor = ligands.filter(
        (l) => ligandEdges(l).some((e) => tierById.get(e.target) === 1 && POSITIVE_KINDS.has(e.kind)),
      );
      const productive = ligands.filter(
        (l) => ligandEdges(l).some((e) => POSITIVE_KINDS.has(e.kind)),
      );
      // 无有效配体时依次回退：受体/通道直接刺激 → 源节点应激刺激（胞内激酶入口，如 ATM/AKT1）
      const incoming = new Set(graph.core.edges.map((e) => e.target));
      const POSITIVE_KINDS_ARR = ['activation', 'phosphorylation', 'expression', 'binding', 'indirect', 'state-change', 'dissociation', 'missing'] as const;
      const posDownstream = new Map<string, string[]>();
      for (const e of graph.core.edges) {
        if (!POSITIVE_KINDS_ARR.includes(e.kind as (typeof POSITIVE_KINDS_ARR)[number])) continue;
        if (!posDownstream.has(e.source)) posDownstream.set(e.source, []);
        posDownstream.get(e.source)!.push(e.target);
      }
      // 正向可达节点数（BFS）—— 排序应激入口的级联潜力（如 AKT1 > MAPK1）
      const positiveReach = (startId: string): number => {
        const seen = new Set([startId]);
        const queue = [startId];
        while (queue.length) {
          const cur = queue.shift()!;
          for (const t of posDownstream.get(cur) ?? []) {
            if (!seen.has(t)) {
              seen.add(t);
              queue.push(t);
            }
          }
        }
        return seen.size - 1;
      };
      const stimulableReceptors = graph.core.nodes.filter(
        (n) => n.tier === 1 && (downstream.get(n.id) ?? []).length > 0,
      );
      const stressSources = graph.core.nodes
        .filter(
          (n) =>
            !incoming.has(n.id) &&
            (n.kind === 'kinase' || n.kind === 'gtpase') &&
            (downstream.get(n.id) ?? []).length >= 2,
        )
        .sort((a, b) => positiveReach(b.id) - positiveReach(a.id));
      const preferred =
        withReceptor.find((l) => responsive.includes(l.label) || responsive.includes(l.id)) ??
        withReceptor[0] ??
        productive.find((l) => responsive.includes(l.label) || responsive.includes(l.id)) ??
        productive[0] ??
        (stimulableReceptors.find((n) => n.kind === 'receptor') ?? stimulableReceptors[0]) ??
        stressSources[0];
      if (preferred) {
        const isStim = preferred.tier !== 0;
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
              text: isStim
                ? `本通路无有效配体节点 —— 直接刺激 ${preferred.label}（等效生理刺激激活，信号由该入口进入级联）。`
                : `自动注射外源配体 ${preferred.label}${preferred.synthetic ? '（合成激动剂）' : ''}至细胞外培养基，等待与受体结合。`,
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

  toggleInhibitor: (drugId) => {
    const { inhibitors, tick, events, graph } = get();
    const drug = INHIBITORS.find((d) => d.id === drugId);
    if (!drug || !graph) return;
    const turningOn = !inhibitors[drugId];
    // 与当前核心子图的靶点交集（事件文案用）
    const present = drug.targets.filter((t) =>
      graph.core.nodes.some((n) => n.id === t || n.label === t),
    );
    const targetText = present.length
      ? present.map((t) => graph.core.nodes.find((n) => n.id === t || n.label === t)?.label ?? t).join(' / ')
      : drug.targets.join(' / ');
    set({
      inhibitors: { ...inhibitors, [drugId]: turningOn },
      running: true,
      events: [
        ...events,
        {
          id: `drug-${drugId}-${Date.now()}`,
          tick,
          simTime: `T+${(tick * 0.5).toFixed(1)}s`,
          kind: 'inhibition' as const,
          text: turningOn
            ? `[给药] ${drug.name}（${drug.code}）加入培养基 —— ${drug.mechanism}靶点：${targetText}。观察下游级联断流与转录响应。`
            : `[洗脱] 移除 ${drug.name} —— 血药浓度清除，靶点催化活性逐步恢复，残余信号将重新传导。`,
        },
      ].slice(-MAX_EVENTS),
    });
  },

  tickSim: () => {
    const { graph, nodeStates, tick, injected, events, activityHistory, speed, running, inhibitors, drugLevels } = get();
    if (!graph) return;
    // speed 以多步/单步实现（0.5 = 每 2 tick 执行 1 次推进的近似；直接乘 dt 更平滑）
    const steps = speed >= 2 ? Math.round(speed) : 1;
    let states = nodeStates;
    let t = tick;
    const newEvents: SimEvent[] = [];
    let flux: Record<string, number> = {};
    // ---- 药代动力学更新（每个 sim step：起效 ramp 快、洗脱清除慢） ----
    let levels = drugLevels;
    const activeDrugs = INHIBITORS.filter((d) => inhibitors[d.id]);
    if (activeDrugs.length > 0 || Object.values(drugLevels).some((v) => v > 0)) {
      levels = { ...drugLevels };
      for (const d of INHIBITORS) {
        const cur = levels[d.id] ?? 0;
        const target = inhibitors[d.id] ? 1 : 0;
        if (cur === target) continue;
        // 起效：5 sim-steps 内爬升至治疗浓度；洗脱：15 steps 半衰清除
        const rate = target > cur ? 0.22 : -0.075;
        levels[d.id] = Math.min(1, Math.max(0, cur + rate));
      }
    }
    // 节点级阻断强度（多药取最大）：靶点匹配 id 或 label
    const inhibition: Record<string, number> = {};
    for (const d of INHIBITORS) {
      const lv = levels[d.id] ?? 0;
      if (lv <= 0) continue;
      for (const tgt of d.targets) {
        const node = graph.core.nodes.find((n) => n.id === tgt || n.label === tgt);
        if (!node) continue;
        inhibition[node.id] = Math.max(inhibition[node.id] ?? 0, lv);
      }
    }
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
        inhibition,
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
      drugLevels: levels,
      inhibition,
      events: events.length + newEvents.length > MAX_EVENTS
        ? [...events, ...newEvents].slice(-MAX_EVENTS)
        : [...events, ...newEvents],
      activityHistory: [...activityHistory, sample].slice(-MAX_HISTORY),
      running,
    });
  },

  selectNode: (id) => set({ selectedNode: id }),

  tourStep: (p) => {
    const { graph, nodeStates, tick, events } = get();
    if (!graph) return;
    const node = graph.core.nodes.find((n) => n.id === p.nodeId);
    if (!node) return;
    const states = { ...nodeStates };
    // 蛋白质类分子获得磷酸化修饰读感（配体/第二信使/靶基因无磷酸化语义）
    const PROTEIN_KINDS = new Set([
      'kinase', 'receptor', 'tf', 'gtpase', 'phosphatase', 'adapter', 'enzyme', 'channel',
    ]);
    const prev = nodeStates[p.nodeId];
    const nextTick = tick + 1;
    states[p.nodeId] = {
      activity: 0.92,
      phospho: PROTEIN_KINDS.has(node.kind) ? 0.85 : 0,
      activated: true,
      activatedAtTick: prev?.activatedAtTick ?? nextTick,
    };
    set({
      nodeStates: states,
      tick: nextTick,
      phase: computePhase(graph.core, states),
      events: [
        ...events,
        {
          id: `tour-${p.nodeId}-${Date.now()}`,
          tick: nextTick,
          simTime: `T+${(nextTick * 0.5).toFixed(1)}s`,
          kind: p.kind,
          nodeId: p.nodeId,
          nodeLabel: p.label,
          sourceLabel: p.prevLabel,
          text: p.text,
        },
      ].slice(-MAX_EVENTS),
    });
  },
}));
