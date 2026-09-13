'use client';

/**
 * 虚拟细胞 3D 沉浸视图 —— R3F Canvas + 科学 HUD
 *   - 细胞体（超微结构） + 核心子图分子（径向区室布局） + 信号边流动
 *   - 相机模式: 全景 / 质膜近景 / 核内视角 / 跟随信号（自动追踪最新激活分子）
 *   - 专注模式: 熄灭背景结构，仅保留活跃级联 —— 通路走向一目了然
 * 模拟状态通过 zustand 订阅写入快照引用，帧驱动 imperative 更新（60fps 流畅）
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, RefObject } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Eye, Tags, Focus, RotateCw, Maximize, Shell, Atom, Crosshair, Ruler } from 'lucide-react';
import { useLabStore } from '@/store/lab-store';
import { CELL_TYPE_MAP } from '@/data/cell-types';
import { layout3D, type Vec3 } from '@/lib/simulation/layout3d';
import { CellBody } from './organelles';
import { MoleculeLayer, KIND_COLORS, type SimSnapshot } from './molecules';
import { EdgeLayer } from './signal-edges';

type CamMode = 'free' | 'overview' | 'membrane' | 'nucleus' | 'follow';

/** 相机驱动器: 预设机位 + 信号跟随（阻尼插值） */
function CameraRig({ mode, layout, spec, controlsRef }: {
  mode: CamMode;
  layout: ReturnType<typeof layout3D> | null;
  spec: { scale: [number, number, number] };
  controlsRef: RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const desired = useRef({ target: new THREE.Vector3(), dist: 30 });
  const smoothTarget = useRef(new THREE.Vector3());
  const lastTracked = useRef<string | null>(null);

  const toWorld = (p: Vec3): THREE.Vector3 =>
    new THREE.Vector3(p.x * spec.scale[0], p.y * spec.scale[1], p.z * spec.scale[2]);

  useEffect(() => {
    if (mode === 'overview') desired.current = { target: new THREE.Vector3(0, 0, 0), dist: 31 };
    else if (mode === 'nucleus') desired.current = { target: new THREE.Vector3(0, 0, 0), dist: 3.4 };
    else if (mode === 'membrane') {
      const rec = bestReceptor(layout);
      if (rec) desired.current = { target: toWorld(rec.pos), dist: 6.2 };
    }
    // follow 每帧动态计算
  }, [mode, layout, spec]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (mode === 'follow') {
      const target = trackedMolecule(layout);
      if (target) {
        desired.current.target.copy(toWorld(target.pos));
        desired.current.dist = 6.5;
        lastTracked.current = target.id;
      }
    }

    const dt = desired.current;
    smoothTarget.current.lerp(dt.target, 0.045);
    controls.target.copy(smoothTarget.current);

    // 距离阻尼（保持当前视角方向，只推拉）
    const dir = camera.position.clone().sub(controls.target);
    const d = dir.length();
    const nd = THREE.MathUtils.lerp(d, dt.dist, mode === 'follow' ? 0.05 : 0.06);
    dir.setLength(Math.max(1.2, nd));
    camera.position.copy(controls.target).add(dir);
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

function SceneContents({ showAnatomy, showLabels, focus, sim }: {
  showAnatomy: boolean;
  showLabels: boolean;
  focus: boolean;
  sim: { current: SimSnapshot };
}) {
  const graph = useLabStore((s) => s.graph);
  const cellId = useLabStore((s) => s.cellId);
  const cell = CELL_TYPE_MAP.get(cellId);

  const morph = cell?.morphology ?? 'hepatocyte';
  const tint = cell?.tint?.[0] ?? '#134e4a';

  const layout = useMemo(
    () => (graph ? layout3D(graph.core.nodes, graph.core.edges, morph) : null),
    [graph, morph],
  );

  if (!layout) return null;

  return (
    <group scale={layout.spec.scale}>
      <CellBody spec={layout.spec} tint={tint} dim={focus ? 0.3 : 1} showAnatomy={showAnatomy} />
      <EdgeLayer edges={layout.edges} sim={sim} />
      <MoleculeLayer nodes={layout.nodes} sim={sim} showLabels={showLabels} />
    </group>
  );
}

export function VirtualCell3D() {
  const graph = useLabStore((s) => s.graph);
  const cellId = useLabStore((s) => s.cellId);
  const running = useLabStore((s) => s.running);
  const phase = useLabStore((s) => s.phase);
  const tick = useLabStore((s) => s.tick);
  const selectNode = useLabStore((s) => s.selectNode);

  const cell = CELL_TYPE_MAP.get(cellId);
  const morph = cell?.morphology ?? 'hepatocyte';

  const [showAnatomy, setShowAnatomy] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [focus, setFocus] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [camMode, setCamMode] = useState<CamMode>('overview');
  const [legendOpen, setLegendOpen] = useState(true);

  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // 模拟快照: zustand 订阅写入可变引用（避免逐 tick React 重渲染）
  const sim = useRef<SimSnapshot>({ nodeStates: {}, signalFlux: {}, injected: {}, focus: false });
  useEffect(() => {
    const unsub = useLabStore.subscribe((s) => {
      sim.current.nodeStates = s.nodeStates;
      sim.current.signalFlux = s.signalFlux;
      sim.current.injected = s.injected;
    });
    return unsub;
  }, []);
  useEffect(() => {
    sim.current.focus = focus;
  }, [focus]);

  const specScale = useMemo<[number, number, number]>(() => {
    const specs: Record<string, [number, number, number]> = {
      hepatocyte: [1, 0.96, 1],
      neuron: [1, 1, 1],
      tcell: [1, 1, 1],
      epithelial: [1, 1.05, 0.92],
      cardiomyocyte: [1.18, 0.82, 0.78],
      fibroblast: [1.36, 0.76, 0.8],
      cancer: [1.06, 1, 0.96],
    };
    return specs[morph] ?? [1, 1, 1];
  }, [morph]);

  const layoutSpec = useMemo(() => ({ scale: specScale }), [specScale]);
  const layout = useMemo(
    () => (graph ? layout3D(graph.core.nodes, graph.core.edges, morph) : null),
    [graph, morph],
  );

  if (!graph) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500 text-sm">
        正在装配虚拟细胞…
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 3D 画布 */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#04211d_0%,#020617_55%,#01030e_100%)]">
        <Canvas
          camera={{ fov: 42, near: 0.1, far: 300, position: [0, 9, 28] }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true }}
          onPointerMissed={() => selectNode(null)}
        >
          <ambientLight intensity={0.55} />
          <directionalLight position={[6, 10, 8]} intensity={1.15} color="#e7fffb" />
          <pointLight position={[0, 2.2, 0]} intensity={16} distance={26} decay={2} color="#14b8a6" />
          <pointLight position={[0, 0, 0]} intensity={7} distance={9} decay={2} color="#fb7185" />
          <SceneContents showAnatomy={showAnatomy} showLabels={showLabels} focus={focus} sim={sim} />
          <CameraRig mode={camMode} layout={layout} spec={layoutSpec} controlsRef={controlsRef} />
          <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.08}
            minDistance={2.2}
            maxDistance={80}
            autoRotate={autoRotate}
            autoRotateSpeed={0.5}
            makeDefault
          />
        </Canvas>
      </div>

      {/* ============ HUD ============ */}
      {/* 左上: 实验信息 */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 space-y-1.5">
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-slate-950/70 px-2.5 py-1.5 backdrop-blur-md">
          <Shell className="h-3.5 w-3.5 text-emerald-400" />
          <div>
            <div className="text-[11px] font-medium text-emerald-300">{cell?.name ?? "细胞"}</div>
            <div className="text-[9px] text-slate-500">{graph.meta.nameZh} · 3D 沉浸视图</div>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/70 px-2.5 py-1 backdrop-blur-md font-mono text-[9px] text-slate-400">
          <span className={running ? 'text-emerald-400' : 'text-slate-600'}>●</span>
          <span>T+{(tick * 0.5).toFixed(1)}s</span>
          <span className="text-slate-600">|</span>
          <span>阶段 {phase}/4</span>
          <span className="text-slate-600">|</span>
          <span>{graph.stats.coreCount} 分子</span>
        </div>
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-950/70 px-2.5 py-1 backdrop-blur-md text-[9px] text-slate-500">
          <Ruler className="h-3 w-3 text-slate-400" />
          <span>⌀ {cell?.diameter ?? '—'}</span>
          <span className="text-slate-600">(非等比示意)</span>
        </div>
      </div>

      {/* 右上: 显示开关 */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
        <HudToggle active={showAnatomy} onClick={() => setShowAnatomy(!showAnatomy)} icon={Tags} label="解剖标注" />
        <HudToggle active={showLabels} onClick={() => setShowLabels(!showLabels)} icon={Eye} label="全部标签" />
        <HudToggle active={focus} onClick={() => setFocus(!focus)} icon={Focus} label="专注模式" />
        <HudToggle active={autoRotate} onClick={() => setAutoRotate(!autoRotate)} icon={RotateCw} label="自动环视" />
      </div>

      {/* 右下: 相机预设 */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-wrap justify-end gap-1.5">
        <CamBtn active={camMode === 'overview'} onClick={() => setCamMode('overview')} icon={Maximize} label="全景" />
        <CamBtn active={camMode === 'membrane'} onClick={() => setCamMode('membrane')} icon={Crosshair} label="质膜近景" />
        <CamBtn active={camMode === 'nucleus'} onClick={() => setCamMode('nucleus')} icon={Atom} label="核内视角" />
        <CamBtn active={camMode === 'follow'} onClick={() => setCamMode(camMode === 'follow' ? 'free' : 'follow')} icon={Focus} label={camMode === 'follow' ? '跟随中·点击停止' : '跟随信号'} />
      </div>

      {/* 左下: 图例 */}
      <div className="absolute bottom-3 left-3 z-10">
        {legendOpen ? (
          <div className="rounded-lg border border-white/10 bg-slate-950/75 p-2.5 backdrop-blur-md">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-[9px] font-medium text-slate-300">分子类别</span>
              <button className="text-[9px] text-slate-500 hover:text-slate-300" onClick={() => setLegendOpen(false)}>收起</button>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {Object.entries(KIND_COLORS).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: v.color, boxShadow: `0 0 6px ${v.color}` }} />
                  <span className="text-[9px] text-slate-400">{v.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 space-y-1 border-t border-white/8 pt-1.5">
              <div className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-emerald-400" /><span className="text-[9px] text-slate-400">激活/磷酸化</span></div>
              <div className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-rose-400" /><span className="text-[9px] text-slate-400">抑制/负反馈</span></div>
              <div className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-amber-400" /><span className="text-[9px] text-slate-400">转录表达</span></div>
              <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-amber-400" /><span className="text-[9px] text-slate-400">磷酸化 (P)</span></div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setLegendOpen(true)}
            className="rounded-lg border border-white/10 bg-slate-950/75 px-2.5 py-1.5 text-[9px] text-slate-400 backdrop-blur-md hover:text-slate-200"
          >
            图例
          </button>
        )}
      </div>

      {/* 底部中央: 操作提示 */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-white/8 bg-slate-950/60 px-3 py-1 text-[9px] text-slate-500 backdrop-blur-md md:block">
        拖拽旋转 · 滚轮缩放 · 点击分子查看档案 · 悬停显示分子卡
      </div>
    </div>
  );
}

function HudToggle({ active, onClick, icon: Icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] backdrop-blur-md transition ${
        active
          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
          : 'border-white/10 bg-slate-950/70 text-slate-500 hover:text-slate-300'
      }`}
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
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] backdrop-blur-md transition ${
        active
          ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
          : 'border-white/10 bg-slate-950/70 text-slate-400 hover:text-slate-200'
      }`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
