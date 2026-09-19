'use client';

/**
 * 3D 信号边层 —— 分子间信号传导关系
 *   - 激活/磷酸化: 翡翠绿发光曲线 + 顺向流动粒子（信号通量 → 亮度/速度）
 *   - 抑制/去磷酸化: 玫红虚线（反馈环路可辨）
 *   - 转录表达: 琥珀色
 * 粒子走单 InstancedMesh（每边 2 粒），矩阵逐帧 imperative 更新
 * v21: 悬停边整线高亮（用户需求「高亮应该是整个线, 而不是只是线的中心」）——
 *   hoveredEdgeId 命中的边全段提亮 + 线宽加倍 + 呼吸脉冲; 其余边照常。
 * v37: 悬停分子 → 邻接边联动（sim.hoverNode 帧通道）—— 邻接边整线增亮 + 线宽 1.75×,
 *   非邻接边压暗至 35%（「这个分子的上下游是谁」一眼可读）; 教学引导优先级更高。
 * v55: X-ray 覆盖层渲染（用户「连线不要被其他细胞器等覆盖住」）—— 边线/流粒子/教学彗星
 *   全部 depthTest off + renderOrder 118-120（高于剖面盘 96-98 与剖开窗口细胞器 97-101）+
 *   depthWrite off（不阻挡后绘覆盖物）→ 信号拓扑在细胞器/核/剖盘后方依旧完整可读;
 *   悬停 raycast 为 CPU 侧几何求交, 与深度测试无关 —— 命中域不变。
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Line2 } from 'three-stdlib';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { Edge3D } from '@/lib/simulation/layout3d';
import { EDGE_COLORS } from '@/lib/simulation/layout3d';
import type { SimSnapshot } from './molecules';

const INHIBITORY = new Set(['inhibition', 'repression', 'dephosphorylation', 'missing']);
const EXPRESSIVE = new Set(['expression']);

/** v31 级联行进脉冲 —— 弹星头部 + 渐隐拖尾（模块级临时向量避免每帧分配） */
const _pp = new THREE.Vector3();
const _white = new THREE.Color('#ffffff');
function samplePoly(points: { x: number; y: number; z: number }[], u: number, out: THREE.Vector3): boolean {
  if (u < 0 || u > 1) return false;
  const n = points.length - 1;
  if (n < 1) return false;
  const fi = u * n;
  const i0 = Math.floor(fi);
  const i1 = Math.min(n, i0 + 1);
  const fr = fi - i0;
  const a = points[i0];
  const b = points[i1];
  out.set(a.x + (b.x - a.x) * fr, a.y + (b.y - a.y) * fr, a.z + (b.z - a.z) * fr);
  return true;
}

interface EdgeProps {
  edge: Edge3D;
  sim: { current: SimSnapshot };
  /** v21 当前悬停边 id（整线高亮） */
  hoveredEdgeId: string | null;
}

function EdgeLine({ edge, sim, hoveredEdgeId }: EdgeProps) {
  const lineRef = useRef<Line2 | null>(null);
  const color = EDGE_COLORS[edge.kind] ?? '#34d399';
  const dashed = INHIBITORY.has(edge.kind);
  const key = `${edge.source}>${edge.target}`;
  const baseWidth = EXPRESSIVE.has(edge.kind) ? 1.6 : 2;

  useFrame((state) => {
    const hovered = hoveredEdgeId === edge.id;
    const flux = Math.abs(sim.current.signalFlux[key] ?? 0);
    const focus = sim.current.focus;
    const tourNode = sim.current.tourNode;
    // 事件脉冲爆发（脉冲粒子沿此边飞行时, 900ms 内提升亮度）
    let pulseBoost = 0;
    const ep = sim.current.edgePulse;
    if (ep) {
      const now = performance.now();
      const ts = ep[key] ?? ep[`${edge.target}>${edge.source}`];
      if (ts !== undefined) {
        const age = (now - ts) / 900;
        if (age >= 0 && age < 1) pulseBoost = 1 - age;
      }
    }
    const mat = lineRef.current?.material as THREE.Material | undefined;
    // v37 悬停分子邻接边（非教学引导时生效 —— 引导模式已有链路隔离优先级）
    const hn = tourNode ? null : (sim.current.hoverNode ?? null);
    const isNodeEdge = !!hn && (edge.source === hn || edge.target === hn);
    if (mat) {
      if (hovered) {
        // v21 整线高亮: 恒亮 0.98 + 呼吸脉冲（据悬停时刻相位波动 ±0.12）——「整条线」一眼可辨
        const t = state.clock.elapsedTime;
        mat.opacity = 0.86 + Math.sin(t * 4.2) * 0.12;
      } else if (tourNode) {
        // v31 教学模式: 当前站邻接边最亮, 已走过链边中亮（级联路径读感）, 其余压暗
        const litSet = sim.current.tourLitEdges;
        const key2 = `${edge.target}>${edge.source}`;
        const isChainEdge = !litSet || litSet.has(key) || litSet.has(key2);
        const isTourEdge = edge.source === tourNode || edge.target === tourNode;
        mat.opacity = isTourEdge ? 0.92 : isChainEdge ? 0.46 : 0.03;
      } else {
        const base = focus ? 0.05 : 0.16;
        let op = Math.min(1, (flux > 0.02 ? Math.min(0.92, base + flux * 1.15) : base) + pulseBoost * 0.55);
        // v37 悬停分子上下文隔离: 邻接边増亮至 ≥0.9, 其余压暗 —— 阅读级联拓扑
        if (hn) op = isNodeEdge ? Math.max(op, 0.9) : op * 0.35;
        mat.opacity = op;
      }
    }
    // v21 悬停线宽加倍（Line2 像素线宽 —— 无需重建几何, 逐帧赋值即可）; v37 邻接边 1.75×
    const l2 = lineRef.current;
    if (l2) {
      const w = hovered ? baseWidth * 2.1 : isNodeEdge ? baseWidth * 1.75 : baseWidth;
      if (l2.material.linewidth !== w) l2.material.linewidth = w;
    }
  });

  const pts = useMemo(() => edge.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)), [edge.points]);

  return (
    <Line
      ref={lineRef}
      points={pts}
      color={color}
      lineWidth={baseWidth}
      transparent
      opacity={0.16}
      dashed={dashed}
      dashSize={dashed ? 0.35 : undefined}
      gapSize={dashed ? 0.22 : undefined}
      /* v55 X-ray 覆盖层: 不被细胞器/核/剖盘遮挡 —— 信号拓扑恒可读 */
      depthTest={false}
      depthWrite={false}
      renderOrder={118}
    />
  );
}

/** 流动信号粒子（instanced） */
export function FlowParticles({ edges, sim }: { edges: Edge3D[]; sim: { current: SimSnapshot } }) {
  const instRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(() => edges.map((e) => new THREE.Color(EDGE_COLORS[e.kind] ?? '#34d399')), [edges]);
  const PER = 2;

  useFrame((state) => {
    const inst = instRef.current;
    if (!inst) return;
    const t = state.clock.elapsedTime;
    const tourNode = sim.current.tourNode;
    const litSet = sim.current.tourLitEdges;
    let idx = 0;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const key = `${e.source}>${e.target}`;
      const flux = Math.abs(sim.current.signalFlux[key] ?? 0);
      const speed = tourNode ? 1.1 : 2.2 + Math.min(3.4, flux * 5.2); // v31 教学模式慢速缓行（「不要太快」）
      const pts = e.points;
      const n = pts.length - 1;
      const isTourEdge = !tourNode || e.source === tourNode || e.target === tourNode;
      const isChainEdge = !tourNode || !litSet || litSet.has(key) || litSet.has(`${e.target}>${e.source}`);
      for (let j = 0; j < PER; j++) {
        const tt = (t * speed / Math.max(2.5, e.length) + j / PER + (i % 7) * 0.13) % 1;
        const fi = tt * n;
        const i0 = Math.floor(fi);
        const i1 = Math.min(n, i0 + 1);
        const fr = fi - i0;
        const a = pts[i0];
        const b = pts[i1];
        dummy.position.set(
          a.x + (b.x - a.x) * fr,
          a.y + (b.y - a.y) * fr,
          a.z + (b.z - a.z) * fr,
        );
        // v31 教学模式: 已点亮链边恒有缓慢流动粒子（模拟暂停时级联路径仍在呼吸）
        const active = (flux > 0.04 && isTourEdge) || (!!tourNode && isChainEdge);
        const s = active ? (tourNode ? 0.062 : 0.075) + Math.min(0.06, flux * 0.09) : 0.0001;
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        inst.setMatrixAt(idx, dummy.matrix);
        inst.setColorAt(idx, colors[i]);
        idx++;
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={instRef} args={[undefined, undefined, Math.max(1, edges.length * PER)]} frustumCulled={false} renderOrder={119} raycast={() => null}>
      <sphereGeometry args={[1, 8, 8]} />
      {/* v55 X-ray: 流粒子随边线一同穿透可读（additive 辉光叠加于任何前景细胞器之上） */}
      <meshBasicMaterial transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} toneMapped={false} />
    </instancedMesh>
  );
}

/** v31 级联行进脉冲（信号彗星）: 站点切换时「上站 → 本站」发光彗星沿边折线缓速行进 ——
 *  头部亮白核心 + 9 节渐隐拖尾 + 周期停顿（行进 2.6s + 驻留 1.15s 循环,
 *  直到下一站触发重置）; 颜色跟随边类型（激活翡翠/抑制玫红/表达琥珀） */
export function TourCascadePulse({ sim }: { sim: { current: SimSnapshot } }) {
  const headRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.InstancedMesh>(null);
  const headMat = useRef<THREE.MeshBasicMaterial>(null);
  const trailMat = useRef<THREE.MeshBasicMaterial>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const TRAIL = 9;
  const DU = 0.055; // 拖尾间隔（参数域）

  useFrame(() => {
    const pulse = sim.current.tourPulse;
    // v31 QA 插桩（__cellQaProbe 门控 —— 与 hover-labels 同方法论; 零常态成本）
    if (typeof window !== 'undefined' && (window as { __cellQaProbe?: boolean }).__cellQaProbe) {
      let headPos: number[] | null = null;
      if (pulse) {
        const u = Math.min(1, Math.max(0, (performance.now() - pulse.startedAt) % (pulse.duration + 1.15)) / pulse.duration);
        const hp = new THREE.Vector3();
        if (samplePoly(pulse.points, u, hp)) headPos = [hp.x, hp.y, hp.z];
      }
      (window as unknown as { __tourPulseInfo?: unknown }).__tourPulseInfo = pulse
        ? { active: true, pts: pulse.points.length, elapsed: performance.now() - pulse.startedAt, duration: pulse.duration, color: pulse.color, head: headPos }
        : { active: false };
    }
    const head = headRef.current;
    const trail = trailRef.current;
    if (!head || !trail) return;
    if (!pulse) {
      if (head.visible) head.visible = false;
      if (trail.visible) trail.visible = false;
      return;
    }
    const now = performance.now();
    const el = (now - pulse.startedAt) / 1000;
    if (el < 0) {
      head.visible = false;
      trail.visible = false;
      return;
    }
    head.visible = true;
    trail.visible = true;
    if (headMat.current) headMat.current.color.set(pulse.color).lerp(_white, 0.55);
    if (trailMat.current) trailMat.current.color.set(pulse.color);
    const cycle = pulse.duration + 1.15;
    const tt = Math.min(1, (el % cycle) / pulse.duration);
    // 头部（呼吸微胀）
    if (samplePoly(pulse.points, tt, _pp)) {
      head.position.copy(_pp);
      head.scale.setScalar(1 + 0.16 * Math.sin(el * 9));
    }
    // 拖尾（头后方渐隐）
    let idx = 0;
    for (let j = 1; j <= TRAIL; j++) {
      if (samplePoly(pulse.points, tt - j * DU, _pp)) {
        const f = 1 - j / (TRAIL + 1);
        dummy.position.copy(_pp);
        dummy.scale.setScalar(0.62 * f + 0.06);
        dummy.updateMatrix();
        trail.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }
    for (let k = idx; k < TRAIL; k++) {
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      trail.setMatrixAt(k, dummy.matrix);
    }
    trail.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <mesh ref={headRef} raycast={() => null} renderOrder={120} visible={false}>
        <sphereGeometry args={[0.15, 12, 10]} />
        <meshBasicMaterial ref={headMat} transparent opacity={0.98} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} toneMapped={false} />
      </mesh>
      <instancedMesh ref={trailRef} args={[undefined, undefined, TRAIL]} frustumCulled={false} raycast={() => null} renderOrder={120} visible={false}>
        <sphereGeometry args={[0.115, 10, 8]} />
        <meshBasicMaterial ref={trailMat} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

export function EdgeLayer({ edges, sim, hoveredEdgeId = null }: { edges: Edge3D[]; sim: { current: SimSnapshot }; hoveredEdgeId?: string | null }) {
  return (
    <group>
      {edges.map((e) => (
        <EdgeLine key={e.id} edge={e} sim={sim} hoveredEdgeId={hoveredEdgeId} />
      ))}
      <FlowParticles edges={edges} sim={sim} />
      <TourCascadePulse sim={sim} />
    </group>
  );
}
