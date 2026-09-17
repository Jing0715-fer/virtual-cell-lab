'use client';

/**
 * 3D 信号边层 —— 分子间信号传导关系
 *   - 激活/磷酸化: 翡翠绿发光曲线 + 顺向流动粒子（信号通量 → 亮度/速度）
 *   - 抑制/去磷酸化: 玫红虚线（反馈环路可辨）
 *   - 转录表达: 琥珀色
 * 粒子走单 InstancedMesh（每边 2 粒），矩阵逐帧 imperative 更新
 * v21: 悬停边整线高亮（用户需求「高亮应该是整个线, 而不是只是线的中心」）——
 *   hoveredEdgeId 命中的边全段提亮 + 线宽加倍 + 呼吸脉冲; 其余边照常。
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
    if (mat) {
      if (hovered) {
        // v21 整线高亮: 恒亮 0.98 + 呼吸脉冲（据悬停时刻相位波动 ±0.12）——「整条线」一眼可辨
        const t = state.clock.elapsedTime;
        mat.opacity = 0.86 + Math.sin(t * 4.2) * 0.12;
      } else if (tourNode) {
        // 教学模式: 仅聚焦分子邻接边高亮，其余压暗
        const isTourEdge = edge.source === tourNode || edge.target === tourNode;
        mat.opacity = isTourEdge ? 0.9 : 0.03;
      } else {
        const base = focus ? 0.05 : 0.16;
        mat.opacity = Math.min(1, (flux > 0.02 ? Math.min(0.92, base + flux * 1.15) : base) + pulseBoost * 0.55);
      }
    }
    // v21 悬停线宽加倍（Line2 像素线宽 —— 无需重建几何, 逐帧赋值即可）
    const l2 = lineRef.current;
    if (l2) {
      const w = hovered ? baseWidth * 2.1 : baseWidth;
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
    let idx = 0;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const key = `${e.source}>${e.target}`;
      const flux = Math.abs(sim.current.signalFlux[key] ?? 0);
      const speed = 2.2 + Math.min(3.4, flux * 5.2); // 世界速度 (单位/s)
      const pts = e.points;
      const n = pts.length - 1;
      const isTourEdge = !tourNode || e.source === tourNode || e.target === tourNode;
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
        const active = flux > 0.04 && isTourEdge;
        const s = active ? 0.075 + Math.min(0.06, flux * 0.09) : 0.0001;
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
    <instancedMesh ref={instRef} args={[undefined, undefined, Math.max(1, edges.length * PER)]} frustumCulled={false} renderOrder={95}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

export function EdgeLayer({ edges, sim, hoveredEdgeId = null }: { edges: Edge3D[]; sim: { current: SimSnapshot }; hoveredEdgeId?: string | null }) {
  return (
    <group>
      {edges.map((e) => (
        <EdgeLine key={e.id} edge={e} sim={sim} hoveredEdgeId={hoveredEdgeId} />
      ))}
      <FlowParticles edges={edges} sim={sim} />
    </group>
  );
}
