'use client';

/* eslint-disable react-hooks/immutability -- R3F 命令式材质更新是标准范式（useFrame 内直改 uniform/材质属性, 项目未启用 React Compiler） */

/**
 * 3D 分子层 —— 核心子图分子的 3D 表征
 * 表征科学约定:
 *   - 受体/通道: 跨膜 α-螺旋（胶囊体）+ 胞外配体结合域 + 胞内信号域
 *   - 配体: 胞外小球（自由扩散热运动近似为布朗漂移）
 *   - 激酶/G 蛋白等: 球形（活性 = 发光强度，磷酸化 = 琥珀色光环 + P 徽标）
 * 状态更新走 imperative（useFrame 直读 store 快照引用），不触发 React 重渲染
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Node3D } from '@/lib/simulation/layout3d';
import { NODE_NOTES, fallbackNote } from '@/lib/simulation/molecular-notes';
import { useLabStore } from '@/store/lab-store';
import { CELL_TYPE_MAP } from '@/data/cell-types';
import { useLang } from '@/lib/i18n';

export const KIND_COLORS: Record<string, { color: string; label: string }> = {
  ligand: { color: '#fbbf24', label: '配体' },
  receptor: { color: '#2dd4bf', label: '受体' },
  channel: { color: '#2dd4bf', label: '通道' },
  kinase: { color: '#34d399', label: '激酶' },
  phosphatase: { color: '#f97316', label: '磷酸酶' },
  adapter: { color: '#a3e635', label: '接头' },
  gtpase: { color: '#f472b6', label: 'G 蛋白' },
  tf: { color: '#fb7185', label: '转录因子' },
  gene: { color: '#f59e0b', label: '靶基因' },
  compound: { color: '#facc15', label: '第二信使' },
  enzyme: { color: '#4ade80', label: '酶' },
};

const COMPARTMENT_ZH: Record<string, string> = {
  extracellular: '细胞外',
  membrane: '质膜',
  cytoplasm: '细胞质',
  nucleus: '细胞核',
};

/** 剖面裁剪检测复用的世界坐标临时向量（避免每帧分配） */
const _wp = new THREE.Vector3();

/** 模拟状态快照（由父组件维护并每帧直读） */
export interface SimSnapshot {
  nodeStates: Record<string, { activity: number; phospho: number; activated: boolean }>;
  signalFlux: Record<string, number>;
  injected: Record<string, boolean>;
  inhibition: Record<string, number>;
  focus: boolean;
  /** 教学引导: 当前聚焦分子 id（null = 未开启） */
  tourNode: string | null;
  /** 教学引导: 邻居分子 id 集合（保持可见） */
  tourNeighbors: Set<string> | null;
  /** v31 教学引导: 已点亮站点集合（级联推进 —— 已讲解分子保持辉光, 「信号一路传来」读感） */
  tourVisited?: Set<string> | null;
  /** v31 教学引导: 教学链已点亮边 key 集合（含正反 `${a}>${b}`） */
  tourLitEdges?: Set<string> | null;
  /** v31 教学引导: 级联行进脉冲（站点切换写入 —— 上站→本站信号彗星沿边折线行进） */
  tourPulse?: { points: { x: number; y: number; z: number }[]; startedAt: number; duration: number; color: string } | null;
  /** 事件脉冲: 分子最近被信号抵达时间戳（performance.now(), 事件脉冲层写入） */
  pulseAt?: Record<string, number>;
  /** 事件脉冲: 边最近脉冲时间戳（双向 key） */
  edgePulse?: Record<string, number>;
  /** v37 悬停分子 id（MoleculeLayer 悬停回调写入 → EdgeLayer 帧读: 邻接边整线增亮,
   *  其余边压暗 —— 「这个分子的上下游是谁」一眼可读; 零重渲染帧通道） */
  hoverNode?: string | null;
  /** 剖面模式: 全局裁剪平面（null = 未开启; 分子标签层据此隐藏被剖掉的前半分子标签） */
  clipPlane?: THREE.Plane | null;
}

interface MoleculeProps {
  node: Node3D;
  sim: RefObject<SimSnapshot>;
  selected: boolean;
  showLabel: boolean;
  mutant?: 'M' | 'KO' | null;
  onHover: (id: string | null) => void;
  /** v37 标签注册表（MoleculeLayer 屏幕空间防叠通道 —— 每 ~0.22s 一次 DOM 矩形松弛） */
  regRef?: RefObject<Map<string, HTMLDivElement>>;
}

const Molecule3D = memo(function Molecule3D({ node, sim, selected, showLabel, mutant, onHover, regRef }: MoleculeProps) {
  const { t, lang } = useLang();
  const kindColor = KIND_COLORS[node.kind]?.color ?? '#4ade80';
  const kindZh =
    t(`kind.${node.kind}`) ||
    (lang === 'zh' ? (KIND_COLORS[node.kind]?.label ?? '分子') : 'Molecule');
  const isReceptor = node.kind === 'receptor' || node.kind === 'channel';

  const groupRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const phosphoRef = useRef<THREE.Mesh>(null);
  const inhibRingRef = useRef<THREE.Mesh>(null);
  const selRingRef = useRef<THREE.Mesh>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  /** v33 教学引导激活爬升（本地 0→1 平滑逼近 —— 引导站点切换时活性/磷化视觉渐进点亮, 零重渲染） */
  const tourRampRef = useRef(0);
  const phase = useMemo(() => (node.id.charCodeAt(0) % 7) * 0.9, [node.id]);

  // 共享材质（跨膜螺旋 + ECD + ICD 同一材质，活性统一驱动）
  const coreMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: isReceptor ? '#0f2e2b' : '#0b1a17',
        emissive: new THREE.Color(kindColor),
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.96,
        roughness: node.kind === 'ligand' ? 0.2 : 0.38,
      }),
    [kindColor, isReceptor, node.kind],
  );
  const haloMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(kindColor),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [kindColor],
  );
  const phosphoMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#fbbf24',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  const inhibMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#c084fc',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  // 拾取代理材质（完全透明, 仅作命中区域 —— 悬停命中与可见分子严格对齐）
  const hitMat = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    [],
  );
  useEffect(
    () => () => {
      coreMat.dispose();
      haloMat.dispose();
      phosphoMat.dispose();
      inhibMat.dispose();
      hitMat.dispose();
    },
    [coreMat, haloMat, phosphoMat, inhibMat, hitMat],
  );

  // 标签点击选中（用户需求: 点击标签与点击球体同样选中分子）。
  // 必须用「原生监听 + stopPropagation」: 标签 div 是 R3F 事件容器（画布父元素）的子元素,
  // React 合成事件在根节点触发时 R3F 已先处理过 —— click 会命中 onPointerMissed 把刚选中的又取消;
  // 原生监听在标签元素层级拦截冒泡, R3F 完全看不到这次点击。同步阻断 pointermove/down/up,
  // 避免悬停标签时射线打到标签后方的其它分子造成悬停抖动。
  // ⚠ drei Html 内容在独立 React root 中异步挂载 —— effect 首次执行时 labelRef.current 可能为
  // null（此前监听器从未挂上, 标签点击静默失效）→ rAF 轮询重试直至元素就绪。
  useEffect(() => {
    let el: HTMLDivElement | null = null;
    let raf = 0;
    const stop = (e: Event) => e.stopPropagation();
    const onSelect = (e: MouseEvent) => {
      e.stopPropagation();
      useLabStore.getState().selectNode(node.id);
    };
    const onEnter = () => {
      onHover(node.id);
      document.body.style.cursor = 'pointer';
    };
    const onLeave = () => {
      onHover(null);
      document.body.style.cursor = 'auto';
    };
    const attach = () => {
      el = labelRef.current;
      if (!el) {
        raf = requestAnimationFrame(attach);
        return;
      }
      el.addEventListener('click', onSelect);
      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
      el.addEventListener('pointermove', stop);
      el.addEventListener('pointerdown', stop);
      el.addEventListener('pointerup', stop);
      regRef?.current.set(node.id, el);
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      regRef?.current.delete(node.id);
      if (!el) return;
      el.removeEventListener('click', onSelect);
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('pointermove', stop);
      el.removeEventListener('pointerdown', stop);
      el.removeEventListener('pointerup', stop);
    };
  }, [node.id, onHover, regRef]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const wallNow = performance.now();
    const focus = sim.current.focus;
    const tourNode = sim.current.tourNode;
    const isTourTarget = !!tourNode && node.id === tourNode;
    const isTourNeighbor = !!tourNode && !!sim.current.tourNeighbors?.has(node.id);
    // v31 级联点亮: 已讲解站点（非当前站）—— 恒亮 + 缓慢呼吸（「信号已传到这里」）
    const isVisited = !!tourNode && !isTourTarget && !!sim.current.tourVisited?.has(node.id);
    // v33 引导↔模拟联动视觉爬升: 引擎状态瞬时写入（事件流/阶段/检测器即时真值）,
    // 分子侧 ~1.2s 平滑逼近（本地 ramp 零重渲染）; 引导关闭时恒 1 = 教毕级联状态原样呈现
    const inTour = !!tourNode;
    const rampTarget = inTour ? (isTourTarget || isVisited ? 1 : 0) : 1;
    tourRampRef.current += (rampTarget - tourRampRef.current) * Math.min(1, (delta ?? 0.016) * 2.6);
    const ramp = inTour ? tourRampRef.current : 1;
    const st = sim.current.nodeStates[node.id];
    const a = (st?.activity ?? 0) * ramp;
    const ph = (st?.phospho ?? 0) * ramp;
    // 世界坐标一次计算（剖切检测 + 标签距离淡出共用; 模块级临时向量避免每帧分配）
    const grp = groupRef.current;
    if (grp) grp.getWorldPosition(_wp);
    // 剖面模式: 被剖掉的前半分子 → DOM 标签同步隐藏（mesh 已被 WebGL 全局裁剪）
    const clipPlane = sim.current.clipPlane;
    const clipped = !!(clipPlane && grp && clipPlane.distanceToPoint(_wp) < 0);
    // 标签距离淡出: 近距全显 → 远距降至 0.4（深度暗示 + 降低远景标签密度; 概览机位 ≈31 保持高可读）
    const camDist = grp ? state.camera.position.distanceTo(_wp) : 30;
    const distFade = camDist <= 26 ? 1 : Math.max(0.4, 1 - (camDist - 26) * (0.6 / 34));
    // 信号抵达闪光（事件脉冲层写入时间戳, 650ms 衰减）
    let flash = 0;
    const pAt = sim.current.pulseAt?.[node.id];
    if (pAt !== undefined) {
      const age = (wallNow - pAt) / 650;
      if (age >= 0 && age < 1) flash = (1 - age) * (1 - age);
    }
    const vis = tourNode
      ? isTourTarget || isTourNeighbor
        ? 1
        : isVisited
          ? 0.9
          : 0.16
      : focus
        ? a > 0.12 || selected
          ? 1
          : 0.22
        : 1;

    // 配体布朗漂移
    if (groupRef.current && node.tier === 0) {
      groupRef.current.position.y = node.pos.y + Math.sin(t * 0.8 + phase) * 0.16;
      groupRef.current.position.x = node.pos.x + Math.cos(t * 0.5 + phase * 2) * 0.1;
    }
    // 发光强度 = 活性（教学目标额外脉冲 + 信号抵达闪光; v31 已访站点稳态辉光）
    coreMat.emissiveIntensity =
      0.35 + a * 2.4 + flash * 2.6 + (isTourTarget ? 1.5 + 0.55 * Math.sin(t * 6) : 0) + (isVisited ? 0.8 + 0.16 * Math.sin(t * 2.2 + phase) : 0);
    coreMat.opacity = 0.96 * Math.max(0.35, vis);
    // 光晕呼吸（教学目标持续可见 + 抵达瞬间爆发; v31 已访站点微光环）
    haloMat.opacity = Math.max(a * 0.4, flash * 0.75, isTourTarget ? 0.5 : 0, isVisited ? 0.18 : 0) * vis;
    if (haloRef.current) {
      const pulse = 1 + Math.max(a * 0.25, flash * 0.5, isTourTarget ? 0.3 : 0, isVisited ? 0.1 : 0) * Math.sin(t * 3 + phase);
      haloRef.current.scale.setScalar(pulse);
    }
    // 磷酸化环
    if (phosphoRef.current) {
      phosphoRef.current.visible = ph > 0.08;
      phosphoRef.current.scale.setScalar(Math.max(0.001, ph));
      phosphoRef.current.rotation.y = t * 1.4;
      phosphoRef.current.rotation.x = Math.PI / 3;
      phosphoMat.opacity = Math.min(0.95, ph * 1.3);
    }
    // 药物抑制环（紫色，反向旋转）
    const inh = sim.current.inhibition?.[node.id] ?? 0;
    if (inhibRingRef.current) {
      inhibRingRef.current.visible = inh > 0.05;
      inhibRingRef.current.scale.setScalar(Math.max(0.001, 0.6 + inh * 0.6));
      inhibRingRef.current.rotation.y = -t * 1.1;
      inhibRingRef.current.rotation.x = -Math.PI / 3;
      inhibMat.opacity = Math.min(0.9, inh * 1.1);
    }
    // 选中环缓慢旋转（点击反馈动感; 与标签 is-selected 高亮同步强化「已选中」感知）
    if (selRingRef.current) selRingRef.current.rotation.z = t * 0.85;
    // 标签（DOM imperative; 剖切掉的分子不显示; 远距离淡出; 窄视口智能降噪）
    const el = labelRef.current;
    if (el) {
      const bright = a > 0.25 || selected || isTourTarget || isVisited;
      el.classList.toggle('is-active', bright);
      el.classList.toggle('is-selected', selected);
      el.classList.toggle('is-phospho', ph > 0.25);
      el.classList.toggle('is-inhibited', inh > 0.25);
      // v37 防叠残余降级（屏幕空间松弛仍无法完全分开时, 低优先级标签半避让）
      const declut = el.classList.contains('is-declut') ? 0.42 : 1;
      // 窄视口（移动端 <480px）智能降噪: 恒定尺寸标签在 390px 宽度下必然互相遮挡
      // → 仅保留激活/选中/教学引导相关标签, 其余隐藏（点击分子即选中亮起, 交互可达性不变）
      // 阈值 640→480: 桌面实验台卡片画布约 556px 宽, 不应误触发移动端降噪
      const smartHide = state.size.width < 480 && !bright && !isTourNeighbor;
      const op =
        clipped || smartHide
          ? 0
          : showLabel
            ? Math.max(0.5 * vis + a * 0.5, bright ? 1 : 0.62) * distFade * declut
            : bright
              ? distFade * declut
              : 0;
      el.style.opacity = String(op);
      // 隐藏标签不得拦截画布交互（opacity:0 的元素仍参与命中测试, 必须显式关闭 pointer-events）
      const pe = op === 0 ? 'none' : 'auto';
      if (el.style.pointerEvents !== pe) el.style.pointerEvents = pe;
    }
  });

  const quat = useMemo(() => {
    if (!node.normal) return new THREE.Quaternion();
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(node.normal.x, node.normal.y, node.normal.z),
    );
  }, [node.normal]);

  return (
    <group
      ref={groupRef}
      position={[node.pos.x, node.pos.y, node.pos.z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(node.id);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = 'auto';
      }}
      onClick={(e) => {
        e.stopPropagation();
        useLabStore.getState().selectNode(node.id);
      }}
    >
      {isReceptor ? (
        <group quaternion={quat}>
          {/* 跨膜 α-螺旋 */}
          <mesh material={coreMat}>
            <capsuleGeometry args={[0.2, 1.1, 6, 12]} />
          </mesh>
          {/* 胞外配体结合域 */}
          <mesh material={coreMat} position={[0, 0.86, 0]}>
            <sphereGeometry args={[0.27, 16, 12]} />
          </mesh>
          {/* 胞内信号域 */}
          <mesh material={coreMat} position={[0, -0.84, 0]}>
            <sphereGeometry args={[0.24, 16, 12]} />
          </mesh>
        </group>
      ) : (
        <mesh material={coreMat}>
          {node.kind === 'compound' ? <icosahedronGeometry args={[node.r, 1]} /> : <sphereGeometry args={[node.r, 20, 14]} />}
        </mesh>
      )}

      {/* 光晕（纯视觉装饰 —— 禁用 raycast, 否则共半径 2× 于分子本体的透明球会截获邻位分子的悬停, 造成标签与光标错位） */}
      <mesh ref={haloRef} material={haloMat} renderOrder={90} raycast={() => null}>
        <sphereGeometry args={[isReceptor ? 0.95 : node.r * 2.05, 16, 12]} />
      </mesh>

      {/* 磷酸化环（琥珀色, 装饰 —— 不参与拾取） */}
      <mesh ref={phosphoRef} material={phosphoMat} scale={0.001} renderOrder={91} raycast={() => null}>
        <torusGeometry args={[node.r * 1.5 + 0.12, 0.05, 8, 32]} />
      </mesh>

      {/* 药物抑制环（紫色 = 催化输出钳制, 装饰 —— 不参与拾取） */}
      <mesh ref={inhibRingRef} material={inhibMat} scale={0.001} renderOrder={92} raycast={() => null}>
        <torusGeometry args={[node.r * 1.85 + 0.16, 0.055, 8, 36]} />
      </mesh>

      {/* 选中环（装饰 —— 不参与拾取; 缓慢旋转 + 金色与标签 is-selected 同色系） */}
      {selected && (
        <mesh ref={selRingRef} rotation={[Math.PI / 2.4, 0, 0]} raycast={() => null}>
          <torusGeometry args={[isReceptor ? 1.3 : node.r + 0.44, 0.048, 8, 48]} />
          <meshBasicMaterial color="#fef3c7" transparent opacity={0.95} depthWrite={false} />
        </mesh>
      )}

      {/* 拾取代理（非受体分子）: 适度 hit-slop（1.5×半径, 下限 0.5）提升小分子可命中性,
          又不至重叠邻位 —— 悬停高亮与光标位置严格对齐; 受体的跨膜螺旋/ECD/ICD 本身即合理目标 */}
      {!isReceptor && (
        <mesh material={hitMat}>
          <sphereGeometry args={[Math.max(node.r * (node.kind === 'ligand' ? 1.7 : 1.5), 0.5), 12, 8]} />
        </mesh>
      )}

      {/* 分子标签（屏幕空间模式: 原生分辨率清晰文字, 任意视角可读; 远距自动淡出保深度感知）
          · 可点击选中（原生监听见上） · zIndex ≤ 9 恒低于 HUD 覆盖层（z-10+）, 不遮挡/不截获 HUD 交互 */}
      <Html
        position={[0, isReceptor ? 1.35 : node.r + 0.5, 0]}
        center
        zIndexRange={[9, 0]}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div ref={labelRef} className={`mol3d-label is-pick k-${node.kind}`} style={{ pointerEvents: 'auto' }}>
          <span className="mol3d-sym">{node.label}</span>
          <span className="mol3d-kind">{kindZh}</span>
          <span className="mol3d-p">P</span>
          <span className="mol3d-inh">⊘</span>
          {mutant && <span className={`mol3d-mut ${mutant === 'KO' ? 'ko' : ''}`}>{mutant === 'KO' ? 'KO' : 'M'}</span>}
        </div>
      </Html>
    </group>
  );
});

/** 分子层: 布局 + 悬停提示卡 */
export function MoleculeLayer({
  nodes,
  sim,
  showLabels,
}: {
  nodes: Node3D[];
  sim: RefObject<SimSnapshot>;
  showLabels: boolean;
}) {
  const { t, lang } = useLang();
  const selectedNode = useLabStore((s) => s.selectedNode);
  const cellId = useLabStore((s) => s.cellId);
  const [hovered, setHovered] = useState<string | null>(null);

  const mutations = useMemo(() => {
    const map = new Map<string, 'M' | 'KO'>();
    for (const m of CELL_TYPE_MAP.get(cellId)?.mutations ?? []) {
      map.set(m.node, m.effect === 'knockout' ? 'KO' : 'M');
    }
    return map;
  }, [cellId]);

  const hoveredNode = nodes.find((n) => n.id === hovered);
  // v37 悬停↔边联动帧通道: 悬停分子 id 写入 sim 快照（EdgeLayer useFrame 直读, 零重渲染）
  useEffect(() => {
    sim.current.hoverNode = hovered;
    return () => {
      sim.current.hoverNode = null;
    };
  }, [hovered, sim]);

  /* ============ v37 标签屏幕空间防叠（用户反馈「重叠堆叠看不清」的屏幕端根治） ============
   * 3D 防叠松弛解决世界坐标堆叠, 但固定机位下不同深度的分子仍会在屏幕上投影相近
   * （透视压缩 —— 核区尤为明显）。此处在 DOM 层做节流矩形松弛:
   *   · 每 ~0.22s 收集可见标签 getBoundingClientRect → 屏幕矩形迭代推开
   *     （垂直向优先 ×1.55 —— 标签宽矮形; 位移上限 54px 保持「指向归属」可读）
   *   · 优先级: 选中 > 激活/教学 > 普通（高优先级少动）
   *   * 残余重叠 → 低优先级标签 is-declut 半避让（opacity ×0.42）
   *   * 位移走 CSS 自定义属性 --nudx/--nudy（CSSOM 原样保留 —— 水合安全范式,
   *     transform 与 transition 定义在类里, 静态样式入类的既定架构） */
  const labelReg = useRef(new Map<string, HTMLDivElement>());
  const declutClock = useRef(-1);
  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (now - declutClock.current < 0.22) return;
    declutClock.current = now;
    const reg = labelReg.current;
    interface Lb {
      el: HTMLDivElement; cx: number; cy: number; w: number; h: number;
      dx: number; dy: number; pr: number;
    }
    const items: Lb[] = [];
    for (const [id, el] of reg) {
      if (!el.isConnected) { reg.delete(id); continue; }
      const op = Number.parseFloat(el.style.opacity || '1');
      if (!(op > 0.05)) {
        if (el.classList.contains('is-declut')) el.classList.remove('is-declut');
        el.style.setProperty('--nudx', '0px');
        el.style.setProperty('--nudy', '0px');
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 4) continue;
      // 累积式位移: rect 中心已含旧 nudge 变换 → 基位 = rect 中心 − 旧位移, 松弛位置 = 基位 + dx
      // （一致坐标系: 写回 --nudx = dx 后实际落位 = 基位 + dx —— 每轮在上一轮基础上继续推进,
      //   若每次从 0 重算会覆盖旧值 → 标签回弹基位, 重叠永不消解）
      const dx0 = Number.parseFloat(el.style.getPropertyValue('--nudx') || '0') || 0;
      const dy0 = Number.parseFloat(el.style.getPropertyValue('--nudy') || '0') || 0;
      items.push({
        el,
        cx: r.left + r.width / 2 - dx0,
        cy: r.top + r.height / 2 - dy0,
        w: r.width,
        h: r.height,
        dx: dx0,
        dy: dy0,
        pr: el.classList.contains('is-selected') ? 3 : el.classList.contains('is-active') ? 2 : 1,
      });
    }
    if (items.length < 2) return;
    const GAP = 4;
    const CAP = 72;
    // QA 插桩（__cellQaProbe 门控 —— 与全项目探针方法论一致）
    if (typeof window !== 'undefined' && (window as { __cellQaProbe?: boolean }).__cellQaProbe) {
      let nudgeSum = 0, maxD = 0;
      for (const it of items) { nudgeSum += Math.hypot(it.dx, it.dy); maxD = Math.max(maxD, Math.hypot(it.dx, it.dy)); }
      (window as unknown as Record<string, unknown>).__declutQa = {
        reg: reg.size,
        items: items.length,
        t: +now.toFixed(1),
        nudgeSum: +nudgeSum.toFixed(0),
        maxD: +maxD.toFixed(1),
        lastWrites: items.filter((it) => Math.hypot(it.dx, it.dy) > 6).slice(0, 6).map((it) => [+it.dx.toFixed(1), +it.dy.toFixed(1)]),
      };
    }
    for (let it = 0; it < 30; it++) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const A = items[i], B = items[j];
          const ax0 = A.cx - A.w / 2 + A.dx, ax1 = A.cx + A.w / 2 + A.dx;
          const bx0 = B.cx - B.w / 2 + B.dx, bx1 = B.cx + B.w / 2 + B.dx;
          const ay0 = A.cy - A.h / 2 + A.dy, ay1 = A.cy + A.h / 2 + A.dy;
          const by0 = B.cy - B.h / 2 + B.dy, by1 = B.cy + B.h / 2 + B.dy;
          const ox = Math.min(ax1, bx1) - Math.max(ax0, bx0);
          const oy = Math.min(ay1, by1) - Math.max(ay0, by0);
          if (ox <= GAP || oy <= GAP) continue;
          const needX = ox - GAP + 1;
          const needY = oy - GAP + 1;
          // 轴选择带方向稳定性: y 序差 < 1.5px 时竖推符号逐迭代翻转（上推↔下推振荡,
          // 净位移归零 —— 同高邻标永不分离）; y 序不稳 → 落回水平推（x 序推开自强化恒稳）
          const dyDiff = Math.abs((A.cy + A.dy) - (B.cy + B.dy));
          const useY = needY <= needX * 1.55 && dyDiff > 1.5;
          const need = useY ? needY : needX;
          const wsum = A.pr + B.pr;
          const wA = (B.pr / wsum) * 0.8, wB = (A.pr / wsum) * 0.8; // 单轮闭包 80%（全局收敛跨轮累积）
          if (useY) {
            const up = (A.cy + A.dy) <= (B.cy + B.dy) ? -1 : 1;
            A.dy += up * need * wA;
            B.dy -= up * need * wB;
          } else {
            const lf = (A.cx + A.dx) <= (B.cx + B.dx) ? -1 : 1;
            A.dx += lf * need * wA;
            B.dx -= lf * need * wB;
          }
        }
      }
    }
    // 残余重叠检测（松弛后仍交叠 → 低优先级半避让; 先清后加避免粘滞）
    for (const it of items) it.el.classList.remove('is-declut');
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j];
        const ox = Math.min(A.cx + A.w / 2 + A.dx, B.cx + B.w / 2 + B.dx) - Math.max(A.cx - A.w / 2 + A.dx, B.cx - B.w / 2 + B.dx);
        const oy = Math.min(A.cy + A.h / 2 + A.dy, B.cy + B.h / 2 + B.dy) - Math.max(A.cy - A.h / 2 + A.dy, B.cy - B.h / 2 + B.dy);
        if (ox > 3 && oy > 3) {
          (A.pr <= B.pr ? A : B).el.classList.add('is-declut');
        }
      }
    }
    const seen = new Set<HTMLDivElement>();
    for (const it of items) {
      seen.add(it.el);
      const d = Math.hypot(it.dx, it.dy);
      let dx = it.dx, dy = it.dy;
      if (d > CAP) { dx *= CAP / d; dy *= CAP / d; }
      it.el.style.setProperty('--nudx', `${dx.toFixed(1)}px`);
      it.el.style.setProperty('--nudy', `${dy.toFixed(1)}px`);
    }
    // 清理未参与本轮流弛的标签的降级标记
    for (const [, el] of reg) {
      if (!seen.has(el) && el.classList.contains('is-declut')) el.classList.remove('is-declut');
    }
  });

  const note = hoveredNode
    ? NODE_NOTES[hoveredNode.id] ??
      NODE_NOTES[hoveredNode.label] ??
      fallbackNote(
        hoveredNode.label,
        t(`kind.${hoveredNode.kind}`) ||
          (lang === 'zh' ? (KIND_COLORS[hoveredNode.kind]?.label ?? '分子') : 'Molecule'),
        t(`comp.${hoveredNode.compartment}`) ||
          (lang === 'zh' ? (COMPARTMENT_ZH[hoveredNode.compartment] ?? '') : hoveredNode.compartment),
      )
    : '';

  return (
    <group>
      {nodes.map((n) => (
        <Molecule3D
          key={n.id}
          node={n}
          sim={sim}
          selected={selectedNode === n.id}
          showLabel={showLabels}
          mutant={mutations.get(n.id) ?? null}
          onHover={setHovered}
          regRef={labelReg}
        />
      ))}
      {/* 悬停分子卡（屏幕空间: 恒定尺寸清晰可读, 不随距离缩放模糊） */}
      {hoveredNode && (
        <Html
          position={[hoveredNode.pos.x, hoveredNode.pos.y + (hoveredNode.tier === 1 ? 1.9 : 1.15), hoveredNode.pos.z]}
          center
          zIndexRange={[42, 0]}
          pointerEvents="none"
          style={{ pointerEvents: 'none' }}
        >
          <div className="mol3d-tip">
            <div className="mol3d-tip-head">
              <span className="mol3d-tip-sym">{hoveredNode.label}</span>
              <span className="mol3d-tip-kind">
                {t(`kind.${hoveredNode.kind}`) ||
                  (lang === 'zh' ? KIND_COLORS[hoveredNode.kind]?.label : hoveredNode.kind)}
              </span>
              <span className="mol3d-tip-comp">
                {t(`comp.${hoveredNode.compartment}`) ||
                  (lang === 'zh'
                    ? COMPARTMENT_ZH[hoveredNode.compartment] || hoveredNode.compartment
                    : hoveredNode.compartment)}
              </span>
            </div>
            {hoveredNode.aliases.length > 0 && (
              <div className="mol3d-tip-alias">{hoveredNode.aliases.slice(0, 3).join(' / ')}</div>
            )}
            <div className="mol3d-tip-note">{note}</div>
          </div>
        </Html>
      )}
    </group>
  );
}
