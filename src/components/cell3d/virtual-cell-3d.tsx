'use client';

/**
 * 虚拟细胞 3D 沉浸视图 —— R3F Canvas + 科学 HUD
 *   - 细胞体（超微结构） + 核心子图分子（径向区室布局） + 信号边流动 + mRNA 出核流
 *   - 相机模式: 全景 / 质膜近景 / 核内视角 / 跟随信号 / 教学引导（分步级联讲解）
 *   - 专注模式: 熄灭背景结构，仅保留活跃级联 —— 通路走向一目了然
 *   - Bloom 后处理辉光 + 暗角，生物荧光实验质感
 * 模拟状态通过 zustand 订阅写入快照引用，帧驱动 imperative 更新（60fps 流畅）
 */
import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, ReactNode, RefObject } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree, events as createPointerEvents } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { setSceneSnapshot } from '@/lib/simulation/scene-capture';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, DepthOfField, Noise, N8AO, Vignette } from '@react-three/postprocessing';
import type { DepthOfFieldEffect } from 'postprocessing';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Eye, Tags, Focus, RotateCw, RotateCcw, Maximize, Shell, Atom, Crosshair, Ruler, Sparkles, BookOpen, ChevronLeft, ChevronRight, X, CirclePlay, Gauge, Layers, Scissors, AlertTriangle, Expand, Shrink, Magnet, SlidersHorizontal, MousePointerClick, ListTree, Split, Play, Pause, LocateFixed } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLabStore } from '@/store/lab-store';
import { CELL_TYPE_MAP } from '@/data/cell-types';
import { layout3D, projectLayoutToPlane, EDGE_COLORS, type CellBodySpec, type Vec3 } from '@/lib/simulation/layout3d';
import { buildGuidedTour, tourIntro } from '@/lib/simulation/guided-tour';
import { CellBody } from './organelles';
import { MITOSIS_PHASES, MitosisStage } from './mitosis';
import { FlyToController, HOVER_GROUP_LABEL, HOVER_GROUP_ORDER, type HoverTarget, type LocateReq } from './hover-labels';
import { MoleculeLayer, KIND_COLORS, type SimSnapshot } from './molecules';
import { DrugMoleculeLayer } from './drug-molecules';
import { EdgeLayer } from './signal-edges';
import { MrnaFlow } from './mrna-flow';
import { EventPulses } from './event-pulses';
import { SectionClipController, SECTION_ORIENTS, AXIS_N, type SectionAxis } from './section-view';
import { glowSpriteTexture } from './textures';
import { NUCLEUS_EXTENT, SHAPE_EXTENT, nucleusInstances, type ShapeKind } from '@/lib/simulation/cell-shape';
import { useLang } from '@/lib/i18n';

type CamMode = 'free' | 'overview' | 'membrane' | 'nucleus' | 'follow' | 'tour';

/** v20 信号传导边悬停词条映射（「红色的长条是什么」—— 玫红虚线弧线等边类型可悬停识别）
 *  accent 与 EDGE_COLORS 同源（抑制族玫红 / 激活族翡翠 / 表达琥珀） */
const EDGE_HOVER_KIND: Record<string, { zh: string; latin: string; accent: string }> = {
  inhibition: { zh: '信号边 · 抑制', latin: 'Signal edge · inhibition', accent: '#fb7185' },
  repression: { zh: '信号边 · 转录阻遏', latin: 'Signal edge · repression', accent: '#fb7185' },
  dephosphorylation: { zh: '信号边 · 去磷酸化', latin: 'Signal edge · inhibition', accent: '#fb7185' },
  missing: { zh: '信号边 · 缺失关联', latin: 'Signal edge · inhibition', accent: '#fb7185' },
  activation: { zh: '信号边 · 激活', latin: 'Signal edge · activation', accent: '#34d399' },
  phosphorylation: { zh: '信号边 · 磷酸化', latin: 'Signal edge · phosphorylation', accent: '#6ee7b7' },
  expression: { zh: '信号边 · 转录表达', latin: 'Signal edge · expression', accent: '#fbbf24' },
  binding: { zh: '信号边 · 结合', latin: 'Signal edge · binding', accent: '#94a3b8' },
  dissociation: { zh: '信号边 · 解离', latin: 'Signal edge · binding', accent: '#94a3b8' },
  indirect: { zh: '信号边 · 间接效应', latin: 'Signal edge · indirect', accent: '#2dd4bf' },
  'state-change': { zh: '信号边 · 状态转变', latin: 'Signal edge · indirect', accent: '#2dd4bf' },
};

/** v21 信号边悬停目标: 每边一个折线命中体（全段任意点可悬停 —— 用户反馈「必须放线的中心才能显示」根治）
 *  kind:'edge' 双通道仲裁让位于细胞器; refId 回传整线高亮
 *  v23 note 副题行: 源/靶分子对（如 "RAF1 ┤ MAP2K1" —— 抑制族用 ┤ 拦截符, 激活族用 →） */
function edgeHoverTarget(edge: { id: string; points: Vec3[]; kind: string; source?: string; target?: string }, labelOf: (id: string) => string | undefined): HoverTarget[] {
  const meta = EDGE_HOVER_KIND[edge.kind];
  if (!meta || edge.points.length < 2) return [];
  const s = edge.source ? labelOf(edge.source) : undefined;
  const t = edge.target ? labelOf(edge.target) : undefined;
  const arrow = edge.kind === 'inhibition' || edge.kind === 'repression' || edge.kind === 'dephosphorylation' ? ' ┤ ' : ' → ';
  const note = s && t ? `${s}${arrow}${t}` : undefined;
  return [{
    pos: edge.points[Math.floor(edge.points.length / 2)],
    r: 0.6,
    zh: meta.zh,
    latin: meta.latin,
    accent: meta.accent,
    note,
    poly: edge.points,
    kind: 'edge',
    refId: edge.id,
  }];
}

/** OrbitControls 鼠标交互映射（模块级常量, 避免组件逐 tick 重渲染时重复应用）:
 *  左键旋转 · 中键拖拽平移（用户需求, 原默认缩放） · 右键平移 */
const MOUSE_MAP = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };

/** 剖面控制器回退 spec（graph 尚未装配时） */
const FALLBACK_SPEC: CellBodySpec = {
  membraneR: 10,
  nucleusR: 4.1,
  shape: 'sphere',
  viewDist: 31,
  mitoCount: 0,
  erSheets: 0,
  vesicleCount: 0,
  microtubules: 0,
  nucleolus: { count: 1, r: 0.8 },
  lysosomeCount: 0,
  peroxisomeCount: 0,
};

/** 低端设备/软件渲染检测（SwiftShader/CPU 渲染/低核数 → 自动流畅模式，降帧缓冲内存与 CPU 负担）
 *  模块级一次性缓存: 在 Canvas 创建前完成探测，保证首帧即使用正确的渲染参数 */
let _lowEndCache: boolean | null = null;
function detectLowEndGpu(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (_lowEndCache !== null) return _lowEndCache;
  const nav = navigator as Navigator & { deviceMemory?: number };
  let low = false;
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) low = true;
  else if (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) low = true;
  if (!low) {
    try {
      const c = document.createElement('canvas');
      const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
      if (!gl) low = true;
      else {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
        low = /swiftshader|llvmpipe|software|basic\s*render|angle \(.*software/i.test(renderer);
      }
    } catch {
      low = false;
    }
  }
  _lowEndCache = low;
  return low;
}

/** 3D 渲染错误边界: WebGL 崩溃/渲染异常时不再掀翻整页 React 树，
 *  而是显示友好提示并提供 2D 切面视图回退（保证平台可用性） */
class Cell3DErrorBoundary extends Component<
  { children: ReactNode; fallback: (error: Error) => ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[VirtualCell3D] 渲染异常:', error);
  }
  render() {
    if (this.state.error) return this.props.fallback(this.state.error);
    return this.props.children;
  }
}

/** 相机驱动器: 预设机位（含标准观察方位） + 信号跟随 + 教学聚焦（阻尼插值）
 *  自由交互保障: 模式切换仅在前 2s 过渡期内收敛机位; 用户拖拽/滚轮后 4s 内完全让位
 *  （OrbitControls 全权接管, 含 autoRotate） —— 之后的旋转/缩放不再被对抗 */
function CameraRig({ mode, layout, spec, controlsRef, tourTarget }: {
  mode: CamMode;
  layout: ReturnType<typeof layout3D> | null;
  spec: { viewDist: number; membraneR: number; nucleusR: number; shape: ShapeKind };
  controlsRef: RefObject<OrbitControlsImpl | null>;
  /** 教学引导: 当前聚焦分子世界坐标 */
  tourTarget: Vec3 | null;
}) {
  const { camera, gl } = useThree();
  const desired = useRef({ target: new THREE.Vector3(), dist: 30, dir: new THREE.Vector3(0, 0.33, 0.94) });
  const smoothTarget = useRef(new THREE.Vector3());
  const lastTracked = useRef<string | null>(null);
  /** 模式切换时间戳（过渡期内才收敛机位） */
  const modeSince = useRef(0);
  /** 用户最近一次交互（拖拽/滚轮/触摸）时间戳 */
  const lastUser = useRef(-1e9);

  const toWorld = (p: Vec3): THREE.Vector3 => new THREE.Vector3(p.x, p.y, p.z);

  // 用户交互检测（直接监听画布事件, 不依赖 controls 实例时序）
  useEffect(() => {
    const el = gl.domElement;
    const onInteract = () => { lastUser.current = performance.now(); };
    el.addEventListener('pointerdown', onInteract);
    el.addEventListener('wheel', onInteract, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', onInteract);
      el.removeEventListener('wheel', onInteract);
    };
  }, [gl]);

  useEffect(() => {
    modeSince.current = performance.now();
    if (mode === 'overview') desired.current = { target: new THREE.Vector3(0, 0, 0), dist: spec.viewDist, dir: new THREE.Vector3(0, 0.33, 0.94) };
    else if (mode === 'nucleus') {
      // v8: 核机位覆盖全部核实例（肝细胞双核取中点, 距离含两核外延）; 单核行为不变
      const insts = nucleusInstances(spec.shape, spec.membraneR);
      const ext = NUCLEUS_EXTENT[spec.shape] ?? NUCLEUS_EXTENT.sphere;
      const mid = { x: 0, y: 0, z: 0 };
      let nucReach = 0;
      for (const nu of insts) {
        mid.x += nu.center.x / insts.length;
        mid.y += nu.center.y / insts.length;
        mid.z += nu.center.z / insts.length;
        nucReach = Math.max(
          nucReach,
          Math.hypot(nu.center.x, nu.center.y, nu.center.z) + spec.nucleusR * nu.scale * Math.max(...ext),
        );
      }
      desired.current = {
        target: new THREE.Vector3(mid.x, mid.y, mid.z),
        dist: Math.max(3.4, nucReach * 2.35),
        dir: new THREE.Vector3(0.35, 0.25, 0.9),
      };
    }
    else if (mode === 'membrane') {
      const rec = bestReceptor(layout);
      if (rec) desired.current = { target: toWorld(rec.pos), dist: 6.2, dir: new THREE.Vector3(0.15, 0.28, 0.94) };
    }
    // follow 每帧动态计算（不重置观察方位，尊重用户视角）
  }, [mode, layout, spec]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const now = performance.now();
    const userRecently = now - lastUser.current < 4000; // 用户 4s 内交互过 → 让位
    const transitional = now - modeSince.current < 2000; // 模式切换 2s 过渡期
    const following = (mode === 'follow' || mode === 'tour') && !userRecently;

    // 稳态且无跟随任务: 完全交给 OrbitControls（用户自由旋转/缩放/autoRotate）
    if (!transitional && !following) return;
    // 过渡期内用户开始交互 → 立即让位
    if (transitional && userRecently) return;

    if (mode === 'follow') {
      const target = trackedMolecule(layout);
      if (target) {
        desired.current.target.copy(toWorld(target.pos));
        desired.current.dist = 6.5;
        lastTracked.current = target.id;
      }
    } else if (mode === 'tour' && tourTarget) {
      desired.current.target.copy(toWorld(tourTarget));
      desired.current.dist = 7.8;
    }

    const dt = desired.current;
    smoothTarget.current.lerp(dt.target, 0.045);
    controls.target.copy(smoothTarget.current);

    // 观察方位阻尼（预设机位过渡期恢复标准方位；follow/tour 保留用户视角）
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (dt.dir && mode !== 'follow' && mode !== 'tour') {
      dir.lerp(dt.dir, 0.06).normalize();
    }

    // 距离阻尼（沿当前方向推拉）
    const d = camera.position.distanceTo(controls.target);
    const nd = THREE.MathUtils.lerp(d, dt.dist, mode === 'follow' ? 0.05 : 0.06);
    camera.position.copy(controls.target).add(dir.multiplyScalar(Math.max(1.2, nd)));
    controls.update();
  });

  return null;
}

/** 活性最高的受体（质膜近景机位锚点） */
function bestReceptor(layout: ReturnType<typeof layout3D> | null) {
  if (!layout) return null;
  const states = useLabStore.getState().nodeStates;
  const receptors = layout.nodes.filter((n) => n.tier === 1);
  if (!receptors.length) return null;
  let best = receptors[0];
  let bestA = -1;
  for (const r of receptors) {
    const a = states[r.id]?.activity ?? 0;
    if (a > bestA) {
      bestA = a;
      best = r;
    }
  }
  return best;
}

/** 最近激活且仍活跃的分子（跟随信号目标） */
function trackedMolecule(layout: ReturnType<typeof layout3D> | null) {
  if (!layout) return null;
  const { events, nodeStates } = useLabStore.getState();
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  for (let i = events.length - 1; i >= 0 && i > events.length - 12; i--) {
    const ev = events[i];
    if (!ev.nodeId) continue;
    const st = nodeStates[ev.nodeId];
    const node = byId.get(ev.nodeId);
    if (st && node && st.activity > 0.35) return node;
  }
  return null;
}

function SceneContents({ showAnatomy, showLabels, focus, perf, cutaway, sim, snapPlane, locate, onHoverTargets }: {
  showAnatomy: boolean;
  showLabels: boolean;
  focus: boolean;
  /** 低端设备流畅模式（禁用折射/减实例） */
  perf: boolean;
  /** v15 剖面视图激活（传递 CellBody → 高尔基窗口化渲染序列） */
  cutaway: boolean;
  sim: { current: SimSnapshot };
  /** 剖面贴附平面（信号级联正交投影到剖切面上演示; null = 常规 3D 径向布局） */
  snapPlane: { normal: Vec3; constant: number } | null;
  /** v14 目录「定位」请求（CellBody 悬停层强制点亮 + FlyToController 相机飞行） */
  locate: LocateReq | null;
  /** v14 悬停目录上报（索引面板数据源） */
  onHoverTargets: (targets: HoverTarget[]) => void;
}) {
  const graph = useLabStore((s) => s.graph);
  const cellId = useLabStore((s) => s.cellId);
  const cell = CELL_TYPE_MAP.get(cellId);
  /** v21 当前悬停边 id（整线高亮联动 —— 用户需求「高亮应该是整个线」） */
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const onHoverEdge = useCallback((id: string | null) => setHoverEdgeId(id), []);

  const morph = cell?.morphology ?? 'hepatocyte';
  // v12 参照图: 类型 tint 向暖中性石板收敛 62%（保留类型色相身份的同时, 细胞"肉质"整体
  // 对齐参照图的低饱和暖棕/灰调读感 —— 实测参照中场 (84,73,69) vs 旧纯 tint 渲染 (16,45,43) 青绿）
  const tint = `#${new THREE.Color(cell?.tint?.[0] ?? '#134e4a').lerp(new THREE.Color('#564e48'), 0.62).getHexString()}`;

  const baseLayout = useMemo(
    () => (graph ? layout3D(graph.core.nodes, graph.core.edges, morph) : null),
    [graph, morph],
  );
  // 剖面贴附: 整个信号级联投影到剖切面 → 演示在切面上完整可见（教科书式"切片上画通路"）
  const layout = useMemo(
    () => (baseLayout && snapPlane ? projectLayoutToPlane(baseLayout, snapPlane) : baseLayout),
    [baseLayout, snapPlane],
  );
  // v21 信号边悬停目标（每边一个折线命中体 —— 全段可悬停; 仅主视图信号层存在时）
  // v23 note 源/靶分子对: 节点 id → label 映射（合成配体等无基因名节点回退显示名）
  const nodeLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    if (layout) for (const n of layout.nodes) m.set(n.id, n.label);
    return m;
  }, [layout]);
  const edgeHover = useMemo(
    () => (layout ? layout.edges.flatMap((e) => edgeHoverTarget(e, (id) => nodeLabelMap.get(id))) : []),
    [layout, nodeLabelMap],
  );

  if (!layout) return null;

  return (
    <group>
      {/* v11 背景柔光幕布: 细胞身后的大尺度径向渐变 —— 高保真科学插画的"深空舞台"深度分离
       *  （细胞从纯黑背景中浮起, 剪影读感立刻提升）; 远景 + 不受雾影响 + 不写深度 */}
      <mesh position={[0, 0, -46]} renderOrder={-10}>
        <planeGeometry args={[150, 90]} />
        <meshBasicMaterial
          map={glowSpriteTexture()}
          color="#0a1c2a"
          transparent
          opacity={0.42}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      {/* 剖面贴附模式: 核内部标注让位（核盘自带剖面标注）—— 消除核区标签互叠 */}
      <CellBody spec={layout.spec} tint={tint} dim={focus ? 0.3 : 1} showAnatomy={showAnatomy} perf={perf} cutaway={cutaway} locate={locate} onHoverTargets={onHoverTargets} extraHover={edgeHover} onHoverEdge={onHoverEdge} />
      <EdgeLayer edges={layout.edges} sim={sim} hoveredEdgeId={hoverEdgeId} />
      <MoleculeLayer nodes={layout.nodes} sim={sim} showLabels={showLabels} />
      {/* 激酶抑制剂 3D 药物分子（球棍模型，结合靶点） */}
      <DrugMoleculeLayer nodes={layout.nodes} sim={sim} showLabels={showLabels} />
      {/* mRNA 转录出核流（表达事件驱动） */}
      <MrnaFlow nodes={layout.nodes} spec={layout.spec} />
      {/* 信号事件脉冲（分子事件驱动: 沿边彗星 + 抵达冲击波 + 分子闪光） */}
      <EventPulses nodes={layout.nodes} sim={sim} />
    </group>
  );
}

/** R3F 事件坐标修正工厂（用户报告「标签与悬停位置错位」的根因修复）:
 *  R3F v9 将指针监听挂在画布父容器, 默认 compute 用 event.offsetX（相对事件目标元素）。
 *  鼠标位于 HUD 按钮/面板等覆盖层时, offsetX 以覆盖层为基准 → 射线方向错位,
 *  命中远离光标的分子 → 标签/提示卡与光标错位。
 *  改为 clientX - 画布 rect.left 换算 NDC —— 与事件冒泡来源无关, 坐标恒准。 */
function canvasRelativePointerEvents(store: Parameters<typeof createPointerEvents>[0]) {
  const manager = createPointerEvents(store);
  manager.compute = (event: PointerEvent | MouseEvent, state: RootState) => {
    const rect = state.gl.domElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      state.pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -(((event.clientY - rect.top) / rect.height) * 2 - 1),
      );
      state.raycaster.setFromCamera(state.pointer, state.camera);
    }
  };
  return manager;
}

/** 中键 autoscroll 保护: three-stdlib OrbitControls 在 pointerdown 不调用 preventDefault,
 *  Chromium 会在中键按下时启动原生自动滚动（页面滚动与 3D 平移叠加撕裂）。
 *  在画布上拦截中键按下默认行为 —— 平移交由 OrbitControls 全权接管。 */
function MiddleClickGuard() {
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: MouseEvent | PointerEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    el.addEventListener('pointerdown', onDown);
    // 兜底: 部分浏览器由 compat mousedown 触发 autoscroll
    el.addEventListener('mousedown', onDown);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('mousedown', onDown);
    };
  }, [gl]);
  return null;
}

/** 场景快照采集器（报告导出嵌入用，4s 节流 JPEG） */
function SceneCapture() {
  const lastRef = useRef(0);
  useFrame(({ gl }) => {
    const now = performance.now();
    if (now - lastRef.current < 4000) return;
    lastRef.current = now;
    try {
      setSceneSnapshot(gl.domElement.toDataURL('image/jpeg', 0.82));
    } catch {
      /* WebGL 画布不可读时跳过（如上下文丢失） */
    }
  });
  return null;
}

/** 自适应景深（高保真显微摄影质感）: 焦平面逐帧追踪「相机 → 控制目标」距离，
 *  焦深范围随拍摄距离自适应 —— 细胞整体保持清晰可检视，胞外远场与前景柔和虚化，
 *  空间层次感参考高保真科学插画。HD 模式专用（流畅模式跳过）。 */
function AdaptiveDof({ controlsRef, bokehScale = 1.0 }: {
  controlsRef: RefObject<OrbitControlsImpl | null>;
  bokehScale?: number;
}) {
  const ref = useRef<DepthOfFieldEffect | null>(null);
  const tgt = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    const dof = ref.current;
    if (!dof) return;
    const controls = controlsRef.current;
    if (controls) tgt.current.copy(controls.target);
    else tgt.current.set(0, 0, 0);
    const d = camera.position.distanceTo(tgt.current);
    // target 自动对焦: effect.update() 每帧按相机距离计算 focusDistance（世界单位）;
    // v13 发表级锐度: 焦深范围放宽至整细胞清晰（d×0.95 + 下限 12）, bokehScale 2.4→1.0 ——
    // 仅远景环境余晖保留极轻深度线索, 细胞体（含背景侧细胞器）全清晰（参照图全图锐利: Sobel 108.8/强边缘 26.2%）
    dof.target = tgt.current;
    dof.cocMaterial.focusRange = Math.max(12, d * 0.95);
  });
  return <DepthOfField ref={ref} bokehScale={bokehScale} />;
}

export function VirtualCell3D() {
  const { t, lang } = useLang();
  const graph = useLabStore((s) => s.graph);
  const cellId = useLabStore((s) => s.cellId);
  const running = useLabStore((s) => s.running);
  const phase = useLabStore((s) => s.phase);
  const tick = useLabStore((s) => s.tick);
  const selectNode = useLabStore((s) => s.selectNode);

  const cell = CELL_TYPE_MAP.get(cellId);
  const morph = cell?.morphology ?? 'hepatocyte';

  const [showAnatomy, setShowAnatomy] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [focus, setFocus] = useState(false);
  // 自动旋转默认关闭（用户需求: 打开页面即保持稳定视角, 便于观察剖面与细胞器细节; 可经 HUD 手动开启）
  const [autoRotate, setAutoRotate] = useState(false);
  const [camMode, setCamMode] = useState<CamMode>('overview');
  // 移动端 HUD 折叠: 开关组/图例默认收起, 避免纵向长列遮挡 3D 画布
  // （ssr:false 动态导入 → 首渲染即可安全读取 window; 桌面 ≥768px 维持原展开布局）
  const [hudOpen, setHudOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 768 : true));
  const [legendOpen, setLegendOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 768 : true));
  const [glow, setGlow] = useState(true);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourIdx, setTourIdx] = useState(0);
  // v31 逐步节奏（用户原话「逐步推进, 不要太快」）: 默认手动逐站; 自动模式 12s/站 + 悬停读卡暂停
  const [tourAuto, setTourAuto] = useState(false);
  /** 解说卡悬停 → 自动推进暂停（阅读节奏由用户掌握; 初始 false —— 触屏无 hover 事件,
   *  恒 true 会让移动端自动模式永久停摆; 桌面端鼠标入卡即置 true、离卡恢复 false） */
  const [tourDwell, setTourDwell] = useState(false);
  /** 自动模式剩余停留时间（跨 dwell 暂停保留; 站点切换/重开时重置） */
  const dwellRemaining = useRef(12000);
  const lastAutoIdx = useRef(-1);
  /** v31 倒计时环 circle 元素引用（rAF 直写 strokeDashoffset —— 零 React 重渲染） */
  const countdownRef = useRef<SVGCircleElement | null>(null);
  // 流畅模式: 低端设备自动开启（低分辨率渲染 + 关闭 MSAA/帧缓冲保留，保留辉光视觉特征）
  // 初始化函数立即探测 → Canvas 首次创建即使用正确参数（避免低端设备以重参数初始化后无法降级）
  const [perfMode, setPerfMode] = useState(false);
  // 剖面展示: 全局裁剪平面剖切细胞 + 剖面填充盘 + 方位/深度控制
  // 默认开启（完整质膜会遮挡内部结构, 剖面下核 + 细胞器同现）; 深度 0.5 = 过心剖面
  const [clipView, setClipView] = useState(true);
  const [clipDepth, setClipDepth] = useState(0.5);
  const [clipAxis, setClipAxis] = useState<SectionAxis>('front');
  // 信号贴面: 信号转导演示投影到剖切面上进行（用户需求 —— 切面演示; 默认 50% 过心切面最佳）
  const [sectionSnap, setSectionSnap] = useState(true);
  // v14 悬停标记目录 + 定位飞行（用户需求: 「细胞器改成悬停显示标记, 包含所有细胞器」）
  const [orgIndexOpen, setOrgIndexOpen] = useState(false);
  const [locateReq, setLocateReq] = useState<LocateReq | null>(null);
  const [hoverTargets, setHoverTargets] = useState<HoverTarget[]>([]);
  const locateNonce = useRef(0);
  const onHoverTargets = useCallback((t: HoverTarget[]) => setHoverTargets(t), []);
  const locateTarget = useCallback((target: HoverTarget) => {
    locateNonce.current += 1;
    setLocateReq({ nonce: locateNonce.current, target, dist: Math.max(6.5, target.r * 3.2) });
  }, []);
  // v14 细胞分裂 3D 演示（用户需求: 单独增加, 基于现有 3D 细胞标准, 不过度简化）
  // v15: mitosis 改由 lab-store 单一真源驱动 —— workspace 视图切换器 Tab 与 HUD 按钮双入口等价
  const mitosis = useLabStore((s) => s.mitosisOpen);
  const setMitosis = useLabStore((s) => s.setMitosisOpen);
  const [mitoPlaying, setMitoPlaying] = useState(true);
  const [mitoSpeed, setMitoSpeed] = useState(1);
  const [mitoPhase, setMitoPhase] = useState(0);
  const [mitoSeek, setMitoSeek] = useState<{ phase: number; nonce: number } | null>(null);
  const mitoSeekNonce = useRef(0);
  /** 分裂进度条 DOM 引用（onMitoProgress 逐帧直写 style.width —— 零 React 重渲染） */
  const mitoProgressRef = useRef<HTMLDivElement | null>(null);
  const onMitoProgress = useCallback((frac: number) => {
    const el = mitoProgressRef.current;
    if (el) el.style.width = `${Math.min(1, Math.max(0, frac)) * 100}%`;
  }, []);
  /** v23 seek 即暂停细看: 相位 chip 点击 → 跳到该相位并暂停（「翻到某一页细看」语义;
   *  播放按钮继续推进）; openMitosis 打开时传 playing=true 自动开播 */
  const seekMitosis = useCallback((phase: number, playing = false) => {
    mitoSeekNonce.current += 1;
    setMitoSeek({ phase, nonce: mitoSeekNonce.current });
    setMitoPhase(phase);
    setMitoPlaying(playing);
  }, []);
  const openMitosis = (next: boolean) => {
    setMitosis(next);
    if (next) {
      useLabStore.getState().pause();
      setAutoRotate(false);
      setTourOpen(false);
      setOrgIndexOpen(false);
      setCamMode('overview');
      seekMitosis(0, true);
      // 相机飞近分裂舞台（复用定位飞行: 目标原点, 距离 23 —— 染色体主角可读尺寸）
      locateNonce.current += 1;
      setLocateReq({ nonce: locateNonce.current, target: { pos: { x: 0, y: 0, z: 0 }, r: 3, zh: 'mitosis', latin: 'stage' }, dist: 23 });
    }
  };
  // 网页内全屏（用户需求: 不再调用原生 Fullscreen API 接管整个物理屏幕）:
  //   3D 视图以 fixed 视口覆盖层铺满浏览器可见区域 —— 页面级全屏，保留浏览器标签/工具栏，
  //   嵌入式预览 iframe 中同样可靠; ESC / 退出按钮均可关闭
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const enterFullscreen = () => setFullscreen(true);
  const exitFullscreen = () => setFullscreen(false);
  // WebGL 上下文丢失提示（自动恢复尝试中）
  const [ctxLost, setCtxLost] = useState(false);

  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // 教学级联步骤（通路切换时重建）
  const tour = useMemo(() => (graph ? buildGuidedTour(graph) : []), [graph]);
  const tourStep = tour.length > 0 ? tour[Math.min(tourIdx, tour.length - 1)] : null;

  // 通路切换时回到第一站（渲染期间状态调整模式，避免 effect 级联渲染）
  const [lastTourKey, setLastTourKey] = useState('');
  const tourKey = tour.map((s) => s.nodeId).join(',');
  if (tourKey !== lastTourKey) {
    setLastTourKey(tourKey);
    setTourIdx(0);
  }

  // 首帧渲染前完成硬件探测（渲染期间状态调整模式，避免 effect 抖动; 模块级缓存保证幂等）
  const [probed, setProbed] = useState(false);
  if (!probed) {
    setProbed(true);
    setPerfMode(detectLowEndGpu());
  }

  // 进入/退出教学引导（事件处理器内完成状态切换）
  const openTour = (next: boolean) => {
    setTourOpen(next);
    if (next) {
      useLabStore.getState().pause();
      setAutoRotate(false);
      setCamMode('tour');
      dwellRemaining.current = 12000;
      lastAutoIdx.current = -1;
    } else {
      setCamMode('overview');
    }
  };

  // 每步同步: 选中分子（联动右栏检测器） + 邻居集合写入快照
  useEffect(() => {
    if (tourOpen && tourStep) {
      useLabStore.getState().selectNode(tourStep.nodeId);
    }
  }, [tourOpen, tourStep]);

  // v31 自动推进: 12s/站缓节奏 + 倒计时环（rAF 直写 DOM）+ 解说卡悬停暂停（暂停剩余时间保留）
  useEffect(() => {
    if (!tourOpen || !tourAuto || tourDwell || tour.length === 0 || tourIdx >= tour.length - 1) return;
    const FULL = 12000;
    const fresh = lastAutoIdx.current !== tourIdx;
    lastAutoIdx.current = tourIdx;
    let deadline = performance.now() + (fresh ? FULL : Math.min(FULL, Math.max(600, dwellRemaining.current)));
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const left = deadline - now;
      if (left <= 0) {
        dwellRemaining.current = FULL;
        setTourIdx((i) => Math.min(tour.length - 1, i + 1));
        return;
      }
      dwellRemaining.current = left;
      if (countdownRef.current) {
        countdownRef.current.style.strokeDashoffset = String(37.7 * (1 - left / FULL));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tourOpen, tourAuto, tourDwell, tourIdx, tour.length]);

  // v31 键盘导航: ← / → 逐站推进, Esc 退出引导（沉浸阅读双手不离键盘）
  useEffect(() => {
    if (!tourOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setTourIdx((i) => Math.min(tour.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setTourIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Escape') {
        openTour(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tourOpen, tour.length, openTour]);

  // 模拟快照: zustand 订阅写入可变引用（避免逐 tick React 重渲染）
  const sim = useRef<SimSnapshot>({ nodeStates: {}, signalFlux: {}, injected: {}, inhibition: {}, focus: false, tourNode: null, tourNeighbors: null, tourVisited: null, tourLitEdges: null, tourPulse: null, pulseAt: {}, edgePulse: {}, clipPlane: null });
  useEffect(() => {
    const unsub = useLabStore.subscribe((s) => {
      sim.current.nodeStates = s.nodeStates;
      sim.current.signalFlux = s.signalFlux;
      sim.current.injected = s.injected;
      sim.current.inhibition = s.inhibition;
    });
    return unsub;
  }, []);
  useEffect(() => {
    sim.current.focus = focus;
  }, [focus]);

  const layout = useMemo(
    () => (graph ? layout3D(graph.core.nodes, graph.core.edges, morph) : null),
    [graph, morph],
  );
  // 相机视野参数: 类型化形状的全景距离（形状已烘焙进几何, 无需非等比 group 缩放）+ 核机位参数（v6）
  const layoutSpec = useMemo(
    () => ({
      viewDist: layout?.spec.viewDist ?? FALLBACK_SPEC.viewDist,
      membraneR: layout?.spec.membraneR ?? FALLBACK_SPEC.membraneR,
      nucleusR: layout?.spec.nucleusR ?? FALLBACK_SPEC.nucleusR,
      shape: layout?.spec.shape ?? FALLBACK_SPEC.shape,
    }),
    [layout],
  );
  // 剖面贴附平面（与剖切控制器同参数, 向保留侧偏移 0.3 → 分子半球完整可见不被裁; 扫描范围按形状法向轴延伸）
  const snapPlane = useMemo(() => {
    if (!clipView || !sectionSnap) return null;
    const o = SECTION_ORIENTS[clipAxis];
    const spec = layout?.spec;
    const Rn = (spec?.membraneR ?? FALLBACK_SPEC.membraneR) * (SHAPE_EXTENT[spec?.shape ?? 'sphere'] ?? SHAPE_EXTENT.sphere)[AXIS_N[clipAxis]];
    return {
      normal: { x: o.normal.x, y: o.normal.y, z: o.normal.z },
      constant: Rn - clipDepth * 2 * Rn - 0.3,
    };
  }, [clipView, sectionSnap, clipAxis, clipDepth, layout]);
  // 有效布局: 贴面模式下级联投影到切面（相机跟随/教学引导同步使用投影后坐标）
  const effLayout = useMemo(
    () => (layout && snapPlane ? projectLayoutToPlane(layout, snapPlane) : layout),
    [layout, snapPlane],
  );
  // 教学引导: 当前聚焦分子世界坐标（layout 坐标系）
  const tourTarget = useMemo(() => {
    if (!tourOpen || !tourStep || !effLayout) return null;
    return effLayout.nodes.find((n) => n.id === tourStep.nodeId)?.pos ?? null;
  }, [tourOpen, tourStep, effLayout]);

  // v31 教学引导快照: 聚焦分子 + 邻居集合 + 级联点亮（已访站点/链边） + 上站→本站行进脉冲
  useEffect(() => {
    if (tourOpen && tourStep && graph) {
      sim.current.tourNode = tourStep.nodeId;
      const neighbors = new Set<string>();
      for (const e of graph.core.edges) {
        if (e.source === tourStep.nodeId) neighbors.add(e.target);
        else if (e.target === tourStep.nodeId) neighbors.add(e.source);
      }
      sim.current.tourNeighbors = neighbors;
      // 已访站点集合（含当前站 —— 级联点亮「信号已传到这里」）
      const visited = new Set<string>();
      for (let i = 0; i <= Math.min(tourIdx, tour.length - 1); i++) visited.add(tour[i].nodeId);
      sim.current.tourVisited = visited;
      // 教学链已点亮边（相邻站点对, 双向 key）
      const lit = new Set<string>();
      for (let i = 0; i < Math.min(tourIdx, tour.length - 1); i++) {
        const a = tour[i].nodeId;
        const b = tour[i + 1].nodeId;
        lit.add(`${a}>${b}`);
        lit.add(`${b}>${a}`);
      }
      sim.current.tourLitEdges = lit;
      // 行进脉冲: 上站 → 本站的边折线（相机稍许跟进后发射; 颜色随边类型）
      if (effLayout && tourIdx > 0) {
        const prevId = tour[tourIdx - 1].nodeId;
        const edge = effLayout.edges.find(
          (e) =>
            (e.source === prevId && e.target === tourStep.nodeId) ||
            (e.target === prevId && e.source === tourStep.nodeId),
        );
        sim.current.tourPulse =
          edge && edge.points.length > 1
            ? {
                points: edge.points,
                startedAt: performance.now() + 400,
                duration: 2.6,
                color: EDGE_COLORS[edge.kind] ?? '#34d399',
              }
            : null;
      } else {
        sim.current.tourPulse = null;
      }
    } else {
      sim.current.tourNode = null;
      sim.current.tourNeighbors = null;
      sim.current.tourVisited = null;
      sim.current.tourLitEdges = null;
      sim.current.tourPulse = null;
    }
  }, [tourOpen, tourStep, graph, tourIdx, tour, effLayout]);

  // 网页内全屏模式下 ESC 退出（页面级全屏检视; 锁定背景滚动）
  useEffect(() => {
    if (!fullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  if (!graph) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500 text-sm">
        {t('loading.cell')}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={
        fullscreen
          ? 'vc-fs-in fixed inset-0 z-[200] overflow-hidden bg-[#030812]'
          : 'relative h-full w-full overflow-hidden'
      }
      aria-label={fullscreen ? t('hud.fs') : undefined}
    >
      {/* 3D 画布（错误边界包裹: WebGL 崩溃时降级为提示卡 + 2D 切面回退, 不掀翻整页） */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#04211d_0%,#020617_55%,#01030e_100%)]">
        <Cell3DErrorBoundary
          fallback={(error) => (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/10">
                <AlertTriangle className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-200">{t('err.title')}</p>
                <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-slate-500">
                  {t('err.desc')}
                </p>
                {typeof error?.message === 'string' && error.message.length < 90 && (
                  <p className="mt-1 font-mono text-[9px] text-slate-600">{error.message}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => useLabStore.getState().setView('cell')}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-[11px] text-emerald-200 transition hover:bg-emerald-500/25"
                >
                  {t('err.fallback2d')}
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-300 transition hover:text-slate-100"
                >
                  {t('err.reload')}
                </button>
              </div>
            </div>
          )}
        >
        <Canvas
          camera={{ fov: 42, near: 0.1, far: 300, position: [0, 9, 28] }}
          dpr={perfMode ? [0.7, 1] : [1, 2]}
          gl={{ antialias: !perfMode, alpha: true, preserveDrawingBuffer: !perfMode }}
          events={canvasRelativePointerEvents}
          onCreated={({ gl }) => {
            // v12 图片级曝光: ACES 胶片色调映射下的参照图亮度对标（中场实测 36→68 需 ×1.8; ACES 中段线性度约 0.6 → 曝光 ×1.55）
            gl.toneMappingExposure = 1.55;
            // WebGL 上下文丢失防护（低端 GPU 内存回收时常见）: 提示 + 浏览器自动恢复
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              setCtxLost(true);
            }, false);
            gl.domElement.addEventListener('webglcontextrestored', () => {
              setCtxLost(false);
            }, false);
          }}
          onPointerMissed={() => selectNode(null)}
        >
          <ambientLight intensity={0.4} />
          {/* v12 参照图光照: 左侧暖白主光（实测 lum 左 123 vs 右 40 —— 强方向性 three-point 变体） */}
          <directionalLight position={[-15, 7, 9]} intensity={1.7} color="#fff1e0" />
          {/* 右后冷蓝补光（低强度拉开立体角） */}
          <directionalLight position={[11, 5, -7]} intensity={0.4} color="#b9cfe8" />
          {/* 后缘光（剪影分离） */}
          <directionalLight position={[0, 9, -13]} intensity={0.5} color="#7a95b8" />
          {/* 内透光: 弱环境填充（参照图整体低照度氛围） */}
          <pointLight position={[0, 2.2, 0]} intensity={5} distance={26} decay={2} color="#4a8a80" />
          <pointLight position={[0, 0, 0]} intensity={3} distance={9} decay={2} color="#6a5a7a" />
          {/* 指数雾: 深度层次感（远端结构淡入背景; v12 参照图纯黑背景 —— 色调加深） */}
          <fogExp2 attach="fog" args={['#010509', 0.0062]} />
          {/* 程序化环境光照: Lightformer 阵列烘焙镜面形体感（离线, 无外部 HDR; v11 分辨率翻倍 —— 湿润透射材质的高光形体更细腻） */}
          <Environment resolution={perfMode ? 64 : 256} frames={1}>
            <color attach="background" args={['#02070c']} />
            {/* v12 参照图环境光: 左侧暖白主光位（与平行主光同侧 —— 镜面高光形体一致） */}
            <Lightformer intensity={3.1} color="#fff0dd" position={[-13, 4, 8]} scale={[9, 7, 1]} rotation-y={Math.PI / 2.4} />
            {/* 右侧冷蓝补光 */}
            <Lightformer intensity={1.0} color="#9ab8d8" position={[12, 3, 4]} scale={[7, 5, 1]} rotation-y={-Math.PI / 2.3} />
            {/* 顶冷蓝柔光 */}
            <Lightformer intensity={0.8} color="#7a95b8" position={[0, 12, 6]} scale={[12, 8, 1]} rotation-x={-Math.PI / 2.3} />
            {/* 底深蓝微光 */}
            <Lightformer intensity={0.35} color="#16283a" position={[0, -12, 0]} scale={[14, 14, 1]} rotation-x={Math.PI / 2} />
          </Environment>
          {mitosis ? (
            <MitosisStage
              playing={mitoPlaying}
              speed={mitoSpeed}
              seek={mitoSeek}
              onPhaseChange={setMitoPhase}
              onEnded={() => setMitoPlaying(false)}
              showAnatomy={showAnatomy}
              perf={perfMode}
              onProgress={onMitoProgress}
            />
          ) : (
            <SceneContents showAnatomy={showAnatomy} showLabels={showLabels} focus={focus} perf={perfMode} cutaway={clipView} sim={sim} snapPlane={snapPlane} locate={locateReq} onHoverTargets={onHoverTargets} />
          )}
          {/* v14 目录定位 → 相机飞行（1.2s 阻尼聚焦; 用户任何交互立即让位）
           *  v21: 常驻挂载 —— 旧 {!mitosis && ...} 使分裂演示开启时的原点飞行与卸载同帧发生,
           *  飞行永不执行（此前定位过细胞器再开分裂 → 舞台偏出画面中心）。 */}
          <FlyToController req={locateReq} />
          <SceneCapture />
          <SectionClipController
            enabled={clipView && !mitosis}
            depth={clipDepth}
            axis={clipAxis}
            spec={layout?.spec ?? FALLBACK_SPEC}
            showAnatomy={showAnatomy}
            sim={sim}
            labels={{
              nucleus: t('sec.nucleus'),
              cytosol: t('sec.cytosol'),
              membrane: t('sec.membrane'),
              section: t('hud.section'),
            }}
          />
          <CameraRig mode={camMode} layout={effLayout} spec={layoutSpec} controlsRef={controlsRef} tourTarget={tourTarget} />
          {/* 中键平移配套: 拦截浏览器原生 autoscroll, 保证拖拽平移纯净 */}
          <MiddleClickGuard />
          {/* 交互映射（用户需求）: 左键旋转 · 中键拖拽 = 平移（原默认缩放已改） · 右键平移 */}
          <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.08}
            minDistance={2.2}
            maxDistance={80}
            autoRotate={autoRotate}
            autoRotateSpeed={0.5}
            mouseButtons={MOUSE_MAP}
            makeDefault
          />
          {/* 生物荧光辉光管线 v11（图片级精细度）: AO 接触阴影（细胞器之间的空间深度）→ 景深 → Bloom → 镜头微色散 → 胶片噪声 → 暗角 */}
          {glow && (
            <EffectComposer multisampling={perfMode ? 0 : 4} enableNormalPass={false}>
              {!perfMode && (
                <N8AO
                  aoRadius={1.15}
                  intensity={1.45}
                  distanceFalloff={0.62}
                  halfRes
                  quality="medium"
                  screenSpaceRadius={false}
                />
              )}
              {!perfMode && <AdaptiveDof controlsRef={controlsRef} bokehScale={1.0} />}
              <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.54} luminanceSmoothing={0.32} />
              {!perfMode && (
                <ChromaticAberration offset={[0.00055, 0.0008]} radialModulation modulationOffset={0.38} />
              )}
              {!perfMode && <Noise premultiply opacity={0.035} />}
              <Vignette offset={0.22} darkness={0.52} />
            </EffectComposer>
          )}
        </Canvas>
        </Cell3DErrorBoundary>
      </div>

      {/* WebGL 上下文丢失遮罩 */}
      {ctxLost && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-slate-950/80 backdrop-blur-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500/30 border-t-teal-400" />
          <p className="text-[12px] text-teal-200">{t('ctx.lost')}</p>
          <p className="text-[10px] text-slate-500">{t('ctx.lostHint')}</p>
        </div>
      )}

      {/* 网页内全屏 · 顶部信息条（细胞/通路/操作提示/退出 —— 替代常规左上信息卡, 整页画幅检视） */}
      {fullscreen && (
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 md:left-1/2 md:right-auto md:w-[min(58vw,640px)] md:-translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-slate-950/85 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-lg">
            <Shell className="h-4 w-4 shrink-0 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold text-emerald-200">
                {(lang === 'zh' ? cell?.name : cell?.nameEn ?? cell?.name) ?? t('loading.cell')}
                <span className="mx-1.5 text-slate-600">·</span>
                <span className="font-normal text-slate-300">{lang === 'zh' ? graph.meta.nameZh : graph.meta.name}</span>
              </div>
              <div className="hidden truncate text-[9px] text-slate-500 sm:block">{t('hud.fsHint')}</div>
            </div>
            <span className="hidden shrink-0 font-mono text-[9px] text-slate-500 md:block">
              T+{(tick * 0.5).toFixed(1)}s · {t('hud.phase')} {phase}/4
            </span>
            <button
              onClick={exitFullscreen}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-300 transition hover:bg-rose-500/20"
            >
              <X className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('hud.exitFs')}</span>
            </button>
          </div>
        </div>
      )}

      {/* ============ HUD ============ */}
      {/* 左上: 实验信息（全屏时并入顶部信息条, 不重复显示） */}
      <div className={`pointer-events-none absolute left-3 top-3 z-10 space-y-1.5 ${fullscreen ? 'hidden' : ''}`}>
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-slate-950/70 px-2.5 py-1.5 backdrop-blur-md">
          <Shell className="h-3.5 w-3.5 text-emerald-400" />
          <div>
            <div className="text-[11px] font-medium text-emerald-300">
              {(lang === 'zh' ? cell?.name : cell?.nameEn ?? cell?.name) ?? t('loading.cell')}
            </div>
            <div className="text-[9px] text-slate-500">{(lang === 'zh' ? graph.meta.nameZh : graph.meta.name)} · {t('hud.3dview')}</div>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/70 px-2.5 py-1 backdrop-blur-md font-mono text-[9px] text-slate-400">
          <span className={running ? 'text-emerald-400' : 'text-slate-600'}>●</span>
          <span>T+{(tick * 0.5).toFixed(1)}s</span>
          <span className="text-slate-600">|</span>
          <span>{t('hud.phase')} {phase}/4</span>
          <span className="text-slate-600">|</span>
          <span>{graph.stats.coreCount} {t('hud.molecules')}</span>
        </div>
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-950/70 px-2.5 py-1 backdrop-blur-md text-[9px] text-slate-500">
          <Ruler className="h-3 w-3 text-slate-400" />
          <span>⌀ {(lang === 'zh' ? cell?.diameter : cell?.diameterEn ?? cell?.diameter) ?? '—'}</span>
          <span className="text-slate-600">{t('hud.scale')}</span>
        </div>
      </div>

      {/* 右上: 显示开关（移动端折叠进「显示」齿轮面板, 避免整列遮挡画布; 全屏时下移避开顶部信息条）
          · 容器 pointer-events-none —— 仅按钮/面板本体接收事件:
            列容器因剖切面板（w-44）宽达 176px, 若容器可命中会在画布右侧形成大片隐形死区,
            遮住其下方所有分子的悬停/点击（用户报告“点不中蛋白球”的根因之一） */}
      <div
        className={`pointer-events-none absolute right-3 z-10 flex flex-col items-end gap-1.5 ${
          fullscreen ? 'top-[68px] md:top-3' : 'top-3'
        }`}
      >
        {/* 网页内全屏（始终可见 —— 移动端尤佳: 画布铺满视口放大观察） */}
        <HudToggle
          active={fullscreen}
          onClick={() => (fullscreen ? exitFullscreen() : enterFullscreen())}
          icon={fullscreen ? Shrink : Expand}
          label={fullscreen ? t('hud.exitFs') : t('hud.fs')}
          highlight
          title={t('hud.fsTip')}
        />
        {/* 移动端齿轮: 展开/收起其余显示开关（桌面恒显） */}
        <button
          onClick={() => setHudOpen((v) => !v)}
          aria-label={t('hud.gear')}
          aria-expanded={hudOpen}
          className={`pointer-events-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] backdrop-blur-md transition md:hidden ${
            hudOpen
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
              : 'border-white/10 bg-slate-950/70 text-slate-400 hover:text-slate-200'
          }`}
        >
          <SlidersHorizontal className="h-3 w-3" />
          {t('hud.gear')}
        </button>
        {/* 其余开关: 桌面纵向恒显; 移动端 2 列网格按需展开（网格容器同样穿透, 仅按钮本体可命中） */}
        <div className={`pointer-events-none ${hudOpen ? 'grid' : 'hidden md:grid'} w-[172px] grid-cols-2 gap-1.5 md:flex md:w-auto md:flex-col`}>
          <HudToggle active={mitosis} onClick={() => openMitosis(!mitosis)} icon={Split} label={t('hud.mitosis')} highlight />
          <HudToggle active={tourOpen} onClick={() => openTour(!tourOpen)} icon={BookOpen} label={t('hud.tour')} highlight
            disabled={tour.length === 0 || mitosis} />
          <HudToggle active={glow} onClick={() => setGlow(!glow)} icon={Sparkles} label={t('hud.glow')} />
          <HudToggle active={perfMode} onClick={() => setPerfMode(!perfMode)} icon={Gauge} label={perfMode ? t('hud.perf') : t('hud.hd')} />
          <HudToggle active={showAnatomy} onClick={() => setShowAnatomy(!showAnatomy)} icon={Tags} label={t('hud.hover')} />
          <HudToggle active={orgIndexOpen} onClick={() => setOrgIndexOpen(!orgIndexOpen)} icon={ListTree} label={t('hud.index')} disabled={mitosis} />
          <HudToggle active={showLabels} onClick={() => setShowLabels(!showLabels)} icon={Eye} label={t('hud.labels')} />
          <HudToggle active={focus} onClick={() => setFocus(!focus)} icon={Focus} label={t('hud.focus')} />
          <HudToggle active={clipView} onClick={() => setClipView(!clipView)} icon={Layers} label={t('hud.section')} highlight={false} />
          <HudToggle active={autoRotate} onClick={() => setAutoRotate(!autoRotate)} icon={RotateCw} label={t('hud.rotate')} />
        </div>
        {clipView && (
          <div className={`pointer-events-auto w-44 space-y-2 rounded-lg border border-teal-500/25 bg-slate-950/80 p-2.5 backdrop-blur-md ${
            hudOpen ? '' : 'hidden md:block'
          }`}>
            <div className="flex items-center gap-1.5">
              <Scissors className="h-3 w-3 shrink-0 text-teal-400" />
              <span className="text-[9px] font-medium text-slate-300">{t('hud.axis')}</span>
              <span className="ml-auto font-mono text-[8px] text-teal-400/70">{SECTION_ORIENTS[clipAxis].latin}</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(Object.keys(SECTION_ORIENTS) as SectionAxis[]).map((ax) => (
                <button
                  key={ax}
                  onClick={() => setClipAxis(ax)}
                  title={SECTION_ORIENTS[ax].hint[lang]}
                  className={`rounded-md border px-1 py-1 text-[9px] transition ${
                    clipAxis === ax
                      ? 'border-teal-400/60 bg-teal-500/20 text-teal-200'
                      : 'border-white/10 bg-white/[0.03] text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {SECTION_ORIENTS[ax].label[lang]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[9px] text-slate-400">{t('hud.depth')}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(clipDepth * 100)}
                onChange={(e) => setClipDepth(Number(e.target.value) / 100)}
                className="h-1 w-full cursor-pointer accent-teal-400"
                aria-label={t('hud.depth')}
              />
              <span className="w-7 shrink-0 text-right font-mono text-[9px] text-teal-300">{Math.round(clipDepth * 100)}%</span>
            </div>
            {/* 信号贴面: 级联投影到剖切面上演示 */}
            <button
              onClick={() => setSectionSnap(!sectionSnap)}
              title={t('hud.snapTip')}
              className={`flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-[9px] transition ${
                sectionSnap
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                  : 'border-white/10 bg-white/[0.03] text-slate-500 hover:text-slate-300'
              }`}
            >
              <Magnet className={`h-3 w-3 shrink-0 ${sectionSnap ? 'text-emerald-300' : ''}`} />
              <span>{t('hud.snap')}</span>
              <span className={`ml-auto font-mono text-[8px] ${sectionSnap ? 'text-emerald-400/70' : 'text-slate-600'}`}>
                {sectionSnap ? 'ON' : 'OFF'}
              </span>
            </button>
            <p className="text-[8px] leading-relaxed text-slate-500">{SECTION_ORIENTS[clipAxis].hint[lang]}</p>
          </div>
        )}
      </div>

      {/* 右下: 相机预设（容器穿透 —— 仅按钮本体可命中, 不遮挡其下方分子的交互） */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex flex-wrap justify-end gap-1.5">
        <CamBtn active={camMode === 'overview'} onClick={() => setCamMode('overview')} icon={Maximize} label={t('cam.overview')} />
        <CamBtn active={camMode === 'membrane'} onClick={() => setCamMode('membrane')} icon={Crosshair} label={t('cam.membrane')} />
        <CamBtn active={camMode === 'nucleus'} onClick={() => setCamMode('nucleus')} icon={Atom} label={t('cam.nucleus')} />
        <CamBtn active={camMode === 'follow'} onClick={() => setCamMode(camMode === 'follow' ? 'free' : 'follow')} icon={Focus} label={camMode === 'follow' ? t('cam.following') : t('cam.follow')} />
      </div>

      {/* 左下: 图例（移动端默认收起; 展开时限高滚动, 不再遮挡画布主体） */}
      <div className="absolute bottom-3 left-3 z-10 max-w-[min(72vw,340px)] md:max-w-none">
        {legendOpen ? (
          <div className="rounded-lg border border-white/10 bg-slate-950/75 p-2.5 backdrop-blur-md">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-[9px] font-medium text-slate-300">{t('legend.title')}</span>
              <button className="text-[9px] text-slate-500 hover:text-slate-300" onClick={() => setLegendOpen(false)}>{t('legend.collapse')}</button>
            </div>
            <div className="lab-scrollbar max-h-[38vh] overflow-y-auto pr-0.5 md:max-h-none md:overflow-visible md:pr-0">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3 md:grid-cols-2">
                {Object.entries(KIND_COLORS).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: v.color, boxShadow: `0 0 6px ${v.color}` }} />
                    <span className="text-[9px] text-slate-400">{t(`kind.${k}`)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 space-y-1 border-t border-white/8 pt-1.5">
                <div className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-emerald-400" /><span className="text-[9px] text-slate-400">{t('legend.activation')}</span></div>
                <div className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-rose-400" /><span className="text-[9px] text-slate-400">{t('legend.inhibition')}</span></div>
                <div className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-amber-400" /><span className="text-[9px] text-slate-400">{t('legend.expression')}</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-amber-400" /><span className="text-[9px] text-slate-400">{t('legend.phospho')}</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400/80 shadow-[0_0_6px_rgba(251,191,36,0.8)]" /><span className="text-[9px] text-slate-400">{t('legend.mrna')}</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.9)]" /><span className="text-[9px] text-slate-400">{t('legend.pulse')}</span></div>
                {/* 交互提示（可发现性）: 球体/标签均可点选 */}
                <div className="flex items-center gap-1.5 border-t border-white/8 pt-1.5 text-[9px] text-slate-500">
                  <MousePointerClick className="h-3 w-3 shrink-0 text-emerald-400/80" />
                  <span>{t('legend.hint')}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setLegendOpen(true)}
            className="rounded-lg border border-white/10 bg-slate-950/75 px-2.5 py-1.5 text-[9px] text-slate-400 backdrop-blur-md hover:text-slate-200"
          >
            {t('legend.expand')}
          </button>
        )}
      </div>

      {/* v14 左中: 细胞器目录面板（点击定位 → 相机飞行 + 脉冲环; 悬停 3D 即现标记） */}
      {orgIndexOpen && !mitosis && hoverTargets.length > 0 && (
        <div className="absolute left-3 top-1/2 z-20 w-[min(84vw,252px)] -translate-y-1/2">
          <div className="rounded-xl border border-white/10 bg-slate-950/88 p-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-lg">
            <div className="mb-2 flex items-center gap-1.5">
              <ListTree className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span className="text-[11px] font-semibold text-slate-200">{t('hud.index')}</span>
              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-px font-mono text-[8px] leading-tight text-emerald-300">
                {hoverTargets.length} {t('idx.count')}
              </span>
              <button
                onClick={() => setOrgIndexOpen(false)}
                aria-label={t('hud.index')}
                className="ml-auto rounded-md border border-white/10 bg-white/5 p-1 text-slate-500 transition hover:text-rose-300"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <p className="mb-2 flex items-center gap-1 text-[8.5px] text-slate-500">
              <LocateFixed className="h-2.5 w-2.5 shrink-0 text-emerald-400/70" />
              {t('idx.hint')}
            </p>
            <div className="lab-scrollbar max-h-[46vh] space-y-2 overflow-y-auto pr-0.5">
              {HOVER_GROUP_ORDER.map((gk) => {
                const items = hoverTargets.filter((x) => (x.group ?? 'specialized') === gk);
                if (items.length === 0) return null;
                return (
                  <div key={gk}>
                    <div className="mb-1 text-[8px] font-semibold uppercase tracking-wider text-slate-500">
                      {HOVER_GROUP_LABEL[gk][lang]}
                    </div>
                    <div className="space-y-0.5">
                      {items.map((x) => (
                        <button
                          key={`${x.zh}|${x.latin}`}
                          onClick={() => locateTarget(x)}
                          className="group flex w-full items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 text-left transition hover:border-emerald-500/30 hover:bg-emerald-500/10"
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500 group-hover:bg-emerald-400" />
                          <span className="truncate text-[10px] text-slate-300 group-hover:text-emerald-100">
                            {lang === 'zh' ? x.zh : x.latin}
                          </span>
                          {lang === 'zh' && <span className="truncate text-[7.5px] italic text-slate-600">{x.latin}</span>}
                          <LocateFixed className="ml-auto h-2.5 w-2.5 shrink-0 text-slate-600 opacity-0 transition group-hover:text-emerald-300 group-hover:opacity-100" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* v14 底部中央: 细胞分裂演示控制台（相位时间轴 + 播放/速度/重播 + 双语描述卡） */}
      {mitosis && (
        <div className="absolute bottom-3 left-1/2 z-20 w-[min(94%,640px)] -translate-x-1/2">
          <div className="rounded-xl border border-teal-500/25 bg-slate-950/88 p-3 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-lg">
            <div className="flex items-center gap-2">
              <Split className="h-3.5 w-3.5 shrink-0 text-teal-400" />
              <span className="text-[12px] font-semibold text-slate-100">{t('mit.title')}</span>
              <span className="shrink-0 rounded border border-teal-500/30 bg-teal-500/10 px-1.5 py-px font-mono text-[8px] leading-tight text-teal-300">
                {Math.min(mitoPhase + 1, MITOSIS_PHASES.length)} / {MITOSIS_PHASES.length}
              </span>
              <span className="hidden font-mono text-[8px] italic text-slate-500 sm:inline">
                {MITOSIS_PHASES[mitoPhase]?.latin}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setMitoPlaying((v) => !v)}
                  aria-label={mitoPlaying ? t('mit.pause') : t('mit.play')}
                  className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] transition ${
                    mitoPlaying
                      ? 'border-teal-400/50 bg-teal-500/15 text-teal-200'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mitoPlaying ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
                  <span className="hidden sm:inline">{mitoPlaying ? t('mit.pause') : t('mit.play')}</span>
                </button>
                <div className="flex items-center overflow-hidden rounded-lg border border-white/10">
                  {[0.5, 1, 2].map((sp) => (
                    <button
                      key={sp}
                      onClick={() => setMitoSpeed(sp)}
                      className={`px-1.5 py-1 font-mono text-[8.5px] transition ${
                        mitoSpeed === sp ? 'bg-teal-500/20 text-teal-200' : 'bg-white/[0.03] text-slate-500 hover:text-slate-300'
                      }`}
                      aria-label={`${t('mit.speed')} ${sp}x`}
                    >
                      {sp}x
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => seekMitosis(0)}
                  aria-label={t('mit.replay')}
                  title={t('mit.replay')}
                  className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[9px] text-slate-400 transition hover:text-teal-200"
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                  <span className="hidden sm:inline">{t('mit.replay')}</span>
                </button>
                <button
                  onClick={() => openMitosis(false)}
                  aria-label={t('hud.mitosis')}
                  className="rounded-md border border-white/10 bg-white/5 p-1 text-slate-500 transition hover:text-rose-300"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* 相位时间轴 chips（点击跳转） */}
            <div className="lab-scrollbar mt-2.5 flex items-center gap-1 overflow-x-auto pb-0.5">
              {MITOSIS_PHASES.map((p, i) => (
                <button
                  key={p.key}
                  onClick={() => seekMitosis(i)}
                  title={lang === 'zh' ? p.descZh : p.descEn}
                  className={`shrink-0 rounded-lg border px-2 py-1 text-[9.5px] font-medium transition ${
                    i === mitoPhase
                      ? 'border-teal-400/60 bg-teal-500/20 text-teal-100 shadow-[0_0_12px_rgba(45,212,191,0.25)]'
                      : i < mitoPhase
                        ? 'border-teal-500/25 bg-teal-500/8 text-teal-300/70 hover:bg-teal-500/15'
                        : 'border-white/10 bg-white/[0.03] text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span className="font-mono text-[8px] text-slate-500">{i + 1}</span>
                  <span className="ml-1">{lang === 'zh' ? p.zh : p.en}</span>
                </button>
              ))}
            </div>

            {/* 进度条（DOM 直写, 零重渲染） */}
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/8">
              <div ref={mitoProgressRef} className="h-full w-0 rounded-full bg-gradient-to-r from-teal-500/70 to-emerald-400" />
            </div>

            {/* 当前相位双语描述（关键分子事件） */}
            <p className="mt-2 text-[10.5px] leading-relaxed text-slate-300">
              <span className="mr-1.5 font-semibold text-teal-300">{lang === 'zh' ? MITOSIS_PHASES[mitoPhase]?.zh : MITOSIS_PHASES[mitoPhase]?.en}</span>
              <span className="text-slate-500">·</span>
              <span className="ml-1.5">{lang === 'zh' ? MITOSIS_PHASES[mitoPhase]?.descZh : MITOSIS_PHASES[mitoPhase]?.descEn}</span>
            </p>
            {!mitoPlaying && mitoPhase >= 6 && (
              <p className="mt-1 flex items-center gap-1 text-[9px] text-amber-300/80">
                <RotateCcw className="h-2.5 w-2.5" />
                {t('mit.endHint')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* v31 沉浸式级联引导 —— 剧场暗角 + 章节章 + 剧场式解说卡（逐步推进 + 行进脉冲 + 级联点亮） */}
      {tourOpen && (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-[14]"
            style={{ background: 'radial-gradient(ellipse 74% 64% at 50% 44%, transparent 56%, rgba(2,6,23,0.45) 100%)' }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[14] h-28"
            style={{ background: 'linear-gradient(to top, rgba(2,6,23,0.72), transparent)' }}
          />
        </>
      )}
      {tourOpen && tourStep && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
          <div className="flex max-w-[92vw] items-center gap-2 rounded-full border border-emerald-500/25 bg-slate-950/75 px-3.5 py-1.5 backdrop-blur-md">
            <BookOpen className="h-3 w-3 shrink-0 text-emerald-400" />
            <span className="truncate text-[10.5px] font-medium text-emerald-200">{graph?.meta.nameZh}</span>
            <span className="h-2.5 w-px shrink-0 bg-white/15" />
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-300">
              {Math.min(tourIdx + 1, tour.length)}
              <span className="text-slate-600"> / {tour.length}</span>
            </span>
            <span className="hidden h-2.5 w-px shrink-0 bg-white/15 sm:block" />
            <span className="hidden truncate font-mono text-[9px] text-slate-500 sm:block">{tourStep.phaseTag}</span>
          </div>
        </div>
      )}
      {tourOpen && tourStep ? (
        <div
          className="absolute bottom-3 left-1/2 z-20 w-[min(94%,640px)] -translate-x-1/2"
          onMouseEnter={() => setTourDwell(true)}
          onMouseLeave={() => setTourDwell(false)}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`${tourKey}:${tourIdx}`}
              initial={{ opacity: 0, y: 24, filter: 'blur(7px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -14, filter: 'blur(5px)' }}
              transition={{ duration: 0.36, ease: [0.21, 0.58, 0.25, 1] }}
              className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-slate-950/88 shadow-[0_10px_44px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            >
              {/* 顶部生物荧光光缘 */}
              <div className="h-px w-full bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />

              {/* 头部: 站点编号 + 标题 + 关闭 */}
              <div className="flex items-start gap-3 px-4 pt-3">
                <div className="flex shrink-0 flex-col items-center pt-0.5">
                  <span className="bg-gradient-to-b from-emerald-200 to-teal-500 bg-clip-text font-mono text-[26px] font-bold leading-none tabular-nums text-transparent">
                    {String(Math.min(tourIdx + 1, tour.length)).padStart(2, '0')}
                  </span>
                  <span className="mt-1 text-[8px] uppercase tracking-[0.2em] text-slate-500">{lang === 'zh' ? '站' : 'STOP'}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold leading-snug text-slate-100">{tourStep.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9.5px] text-slate-500">
                    <span className="font-mono text-emerald-300/80">{tourStep.label}</span>
                    <span className="text-slate-700">·</span>
                    <span>{tourStep.phaseTag}</span>
                    <span className="text-slate-700">·</span>
                    <span className="font-mono tabular-nums">
                      {Math.min(tourIdx + 1, tour.length)}/{tour.length}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => openTour(false)}
                  aria-label={t('hud.tour')}
                  className="shrink-0 rounded-md border border-white/10 bg-white/5 p-1 text-slate-500 transition hover:text-rose-300"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              {/* 开场导览（首站 —— 通路级教学框架） */}
              {tourIdx === 0 && (
                <p className="mx-4 mt-2.5 rounded-lg border border-teal-500/20 bg-teal-950/15 px-3 py-2 text-[10.5px] leading-relaxed text-teal-200/90">
                  <span className="mr-1 font-mono text-[9px] text-teal-400">{lang === 'zh' ? '导览' : 'Guide'}</span>
                  {tourIntro(graph, tour.length)}
                </p>
              )}

              {/* 信号传递注解（上一站 → 本站, 残基级） */}
              {tourStep.edgeNote && (
                <p className="mx-4 mt-2.5 rounded-lg border border-amber-500/20 bg-amber-950/15 px-3 py-2 text-[10.5px] leading-relaxed text-amber-200/90">
                  <span className="mr-1 font-mono text-[9px] text-amber-400">{lang === 'zh' ? '信号传递 ⟶' : 'Signal ⟶'}</span>
                  {tourStep.edgeNote}
                </p>
              )}

              {/* 分子功能注释 */}
              <p className="px-4 pb-1 pt-2 text-[11.5px] leading-[1.8] text-slate-300">{tourStep.text}</p>

              {/* 控制条: 分段进度 + 自动倒计时环 + 逐站导航 */}
              <div className="mt-2 flex items-center gap-2 border-t border-white/8 bg-white/[0.02] px-3 py-2">
                <div className="flex flex-1 items-center gap-[3px] overflow-x-auto">
                  {tour.map((s, i) => (
                    <button
                      key={s.nodeId}
                      aria-label={`${lang === 'zh' ? '跳转到' : 'Jump to'} ${s.label}`}
                      onClick={() => setTourIdx(i)}
                      className={`h-1.5 shrink-0 rounded-full transition-all ${
                        i === tourIdx
                          ? 'w-6 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                          : i < tourIdx
                            ? 'w-1.5 bg-emerald-500/50 hover:bg-emerald-400/70'
                            : 'w-1.5 bg-white/15 hover:bg-white/30'
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setTourAuto(!tourAuto)}
                  title={
                    lang === 'zh'
                      ? '自动模式：每 12 秒推进一站，悬停解说卡时暂停阅读'
                      : 'Auto: advance every 12s, hover the card to pause'
                  }
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[9px] transition ${
                    tourAuto
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : 'border-white/10 bg-white/5 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tourAuto && tourIdx < tour.length - 1 ? (
                    <svg className="h-3.5 w-3.5 -rotate-90" viewBox="0 0 16 16">
                      <circle cx="8" cy="8" r="6" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="2" />
                      <circle
                        ref={countdownRef}
                        cx="8"
                        cy="8"
                        r="6"
                        fill="none"
                        stroke="#34d399"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeDasharray={37.7}
                        strokeDashoffset={0}
                      />
                    </svg>
                  ) : (
                    <CirclePlay className={`h-3.5 w-3.5 ${tourAuto ? 'animate-pulse' : ''}`} />
                  )}
                  {lang === 'zh' ? '自动' : 'Auto'}
                </button>
                <button
                  onClick={() => setTourIdx(Math.max(0, tourIdx - 1))}
                  disabled={tourIdx === 0}
                  aria-label={lang === 'zh' ? '上一站' : 'Previous'}
                  className="flex shrink-0 items-center rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-400 transition hover:text-slate-200 disabled:opacity-30"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setTourIdx(Math.min(tour.length - 1, tourIdx + 1))}
                  disabled={tourIdx >= tour.length - 1}
                  aria-label={lang === 'zh' ? '下一站' : 'Next'}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-[10.5px] font-medium text-emerald-300 transition hover:bg-emerald-500/25 hover:shadow-[0_0_14px_rgba(52,211,153,0.3)] disabled:opacity-30"
                >
                  {lang === 'zh' ? '下一站' : 'Next'}
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>

              {/* 键盘提示 + 末站结语 */}
              <div className="flex items-center gap-1.5 px-4 pb-2.5 pt-1.5 text-[9px] text-slate-600">
                <kbd className="rounded border border-white/10 bg-white/5 px-1 font-mono">←</kbd>
                <kbd className="rounded border border-white/10 bg-white/5 px-1 font-mono">→</kbd>
                <span className="truncate">
                  {lang === 'zh' ? '逐站推进 · 自动模式 12s/站（悬停本卡暂停阅读）' : 'Step through · auto 12s/stop (hover to pause)'}
                </span>
                {tourIdx >= tour.length - 1 && (
                  <span className="ml-auto hidden truncate text-slate-500 sm:inline">
                    {lang === 'zh' ? '级联讲解完毕 —— 退出后点「播放」看动态流' : 'Complete — exit and press Play'}
                  </span>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/8 bg-slate-950/60 px-3 py-1 text-[9px] text-slate-500 backdrop-blur-md md:flex">
          {clipView ? (
            <>
              <Layers className="h-3 w-3 text-teal-400" />
              <span className="text-teal-300/90">
                {t('hud.section')} · {SECTION_ORIENTS[clipAxis].label[lang]}
                {lang === 'zh' ? `（${SECTION_ORIENTS[clipAxis].latin}）` : ` (${SECTION_ORIENTS[clipAxis].latin})`}
              </span>
              {sectionSnap && (
                <>
                  <span className="text-slate-600">|</span>
                  <Magnet className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-300/90">{t('hud.snapOn')}</span>
                </>
              )}
              <span className="text-slate-600">—— {t('hud.tip.section')}</span>
            </>
          ) : (
            <span>{t('hud.tip.free')}</span>
          )}
        </div>
      )}
    </div>
  );
}

function HudToggle({ active, onClick, icon: Icon, label, highlight, disabled, title }: {
  active: boolean;
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  label: string;
  /** 强调色（教学引导等重要功能） */
  highlight?: boolean;
  disabled?: boolean;
  /** 悬停提示 */
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`pointer-events-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] backdrop-blur-md transition ${
        active
          ? highlight
            ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
            : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
          : highlight
            ? 'border-amber-500/30 bg-slate-950/70 text-amber-300/70 hover:text-amber-300'
            : 'border-white/10 bg-slate-950/70 text-slate-500 hover:text-slate-300'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function CamBtn({ active, onClick, icon: Icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`pointer-events-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] backdrop-blur-md transition ${
        active
          ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
          : 'border-white/10 bg-slate-950/70 text-slate-400 hover:text-slate-200'
      }`}
    >
      <Icon className="h-3 w-3" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
