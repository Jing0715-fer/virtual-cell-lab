'use client';

/* eslint-disable react-hooks/immutability -- R3F 命令式动画是标准范式 */

/**
 * 信号事件脉冲层 —— 模拟引擎事件驱动的 3D 爆发特效
 * 科学对应: 每条分子事件（磷酸化/激活/结合/表达/抑制）发生时，
 *           一个信号量子沿信号边从上游分子飞抵下游分子，
 *           抵达瞬间下游分子闪光 + 能量波纹扩散（状态转变的可视化）。
 * 实现: 事件流订阅（mrna-flow 同款模式）+ 彗星池（头球+尾锥）+ 冲击波池 + SimSnapshot.pulseAt
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Node3D } from '@/lib/simulation/layout3d';
import type { SimSnapshot } from './molecules';
import { useLabStore } from '@/store/lab-store';

/** 事件类型 → 脉冲颜色（与边语义色一致） */
const PULSE_COLORS: Record<string, string> = {
  binding: '#2dd4bf',
  activation: '#34d399',
  phosphorylation: '#fbbf24',
  expression: '#f59e0b',
  inhibition: '#c084fc',
  repression: '#fb7185',
  mutation: '#fb7185',
};

const BOLT_POOL = 14;
const WAVE_POOL = 10;
const BOLT_TRAVEL_S = { min: 0.55, max: 1.05 };
const WAVE_S = 0.6;

interface Bolt {
  active: boolean;
  t0: number;
  curve: THREE.QuadraticBezierCurve3;
  duration: number;
  color: THREE.Color;
  targetId: string;
  edgeKeys: [string, string];
}

interface Wave {
  active: boolean;
  t0: number;
  at: THREE.Vector3;
  color: THREE.Color;
}

export function EventPulses({ nodes, sim }: { nodes: Node3D[]; sim: { current: SimSnapshot } }) {
  const boltRefs = useRef<(THREE.Group | null)[]>([]);
  const headRefs = useRef<(THREE.Mesh | null)[]>([]);
  const tailRefs = useRef<(THREE.Mesh | null)[]>([]);
  const waveRefs = useRef<(THREE.Mesh | null)[]>([]);

  const bolts = useMemo<Bolt[]>(
    () => Array.from({ length: BOLT_POOL }, () => ({
      active: false, t0: 0,
      curve: new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()),
      duration: 0.8, color: new THREE.Color('#34d399'),
      targetId: '', edgeKeys: ['', ''],
    })),
    [],
  );
  const waves = useMemo<Wave[]>(
    () => Array.from({ length: WAVE_POOL }, () => ({
      active: false, t0: 0, at: new THREE.Vector3(), color: new THREE.Color('#34d399'),
    })),
    [],
  );

  const byId = useMemo(() => {
    const m = new Map<string, Node3D>();
    for (const n of nodes) {
      m.set(n.id, n);
      if (n.label) m.set(n.label, n);
    }
    return m;
  }, [nodes]);

  const spawnWave = (at: THREE.Vector3, color: THREE.Color) => {
    const w = waves.find((x) => !x.active);
    if (!w) return;
    w.active = true;
    w.t0 = performance.now() / 1000;
    w.at.copy(at);
    w.color.copy(color);
  };

  /** 抵达回调: 目标分子闪光时间戳 + 边脉冲时间戳（供 molecules/edges useFrame 直读） */
  const onArrive = (bolt: Bolt) => {
    const now = performance.now();
    if (!sim.current.pulseAt) sim.current.pulseAt = {};
    sim.current.pulseAt[bolt.targetId] = now;
    if (!sim.current.edgePulse) sim.current.edgePulse = {};
    sim.current.edgePulse[bolt.edgeKeys[0]] = now;
    sim.current.edgePulse[bolt.edgeKeys[1]] = now;
    const end = bolt.curve.getPoint(1);
    spawnWave(end, bolt.color);
  };

  // 事件流订阅: 新分子事件 → 孵化彗星（source→target）或直接冲击波（无上游）
  const processed = useRef<Set<string>>(new Set());
  useEffect(() => {
    const unsub = useLabStore.subscribe((s) => {
      const evs = s.events;
      let spawned = 0;
      for (let i = evs.length - 1; i >= 0 && i > evs.length - 24 && spawned < 4; i--) {
        const ev = evs[i];
        if (!ev.nodeId || !PULSE_COLORS[ev.kind]) continue;
        if (processed.current.has(ev.id)) continue;
        processed.current.add(ev.id);
        const target = byId.get(ev.nodeId);
        if (!target) continue;
        const color = new THREE.Color(PULSE_COLORS[ev.kind]);
        const to = new THREE.Vector3(target.pos.x, target.pos.y, target.pos.z);
        const source = ev.sourceLabel ? byId.get(ev.sourceLabel) : undefined;

        if (!source) {
          // 无上游（如基因转录启动）: 直接在目标位置爆发
          spawnWave(to, color);
          if (!sim.current.pulseAt) sim.current.pulseAt = {};
          sim.current.pulseAt[target.id] = performance.now();
          spawned++;
          continue;
        }

        const bolt = bolts.find((x) => !x.active);
        if (!bolt) continue;
        const from = new THREE.Vector3(source.pos.x, source.pos.y, source.pos.z);
        const dist = from.distanceTo(to);
        // 控制点: 中点沿确定性垂直方向抬升（弧线行进，视觉上避开分子球体）
        const mid = from.clone().add(to).multiplyScalar(0.5);
        const lift = Math.min(0.55, 0.16 + dist * 0.07);
        mid.add(new THREE.Vector3(
          Math.sin(source.pos.y * 5.3 + target.pos.z * 3.1) * lift,
          Math.cos(source.pos.x * 4.7) * lift,
          Math.sin(target.pos.x * 3.9 + source.pos.z * 5.1) * lift,
        ));
        bolt.active = true;
        bolt.t0 = performance.now() / 1000;
        bolt.curve.v0.copy(from);
        bolt.curve.v1.copy(mid);
        bolt.curve.v2.copy(to);
        bolt.duration = THREE.MathUtils.clamp(dist * 0.13 + 0.34, BOLT_TRAVEL_S.min, BOLT_TRAVEL_S.max);
        bolt.color.copy(color);
        bolt.targetId = target.id;
        bolt.edgeKeys = [`${source.id}>${target.id}`, `${target.id}>${source.id}`];
        spawned++;
      }
      if (processed.current.size > 500) processed.current.clear();
    });
    return unsub;
  }, [bolts, waves, byId, sim]);

  useFrame(() => {
    const now = performance.now() / 1000;
    const dir = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const UP = new THREE.Vector3(0, 1, 0);

    // 彗星: 沿贝塞尔飞行 + 尾锥朝向 -速度
    for (let i = 0; i < bolts.length; i++) {
      const bolt = bolts[i];
      const g = boltRefs.current[i];
      const head = headRefs.current[i];
      const tail = tailRefs.current[i];
      if (!g || !head || !tail) continue;
      if (!bolt.active) {
        g.visible = false;
        continue;
      }
      const u = (now - bolt.t0) / bolt.duration;
      if (u >= 1) {
        bolt.active = false;
        g.visible = false;
        onArrive(bolt);
        continue;
      }
      g.visible = true;
      bolt.curve.getPoint(u, dir);
      g.position.copy(dir);
      bolt.curve.getTangent(u, tangent);
      // 尾锥指向行进反方向
      tail.quaternion.setFromUnitVectors(UP, tangent.clone().negate().normalize());
      tail.position.copy(tangent.clone().normalize().multiplyScalar(-0.32));
      // 头球亮度: 快进快出呼吸
      const grow = u < 0.15 ? u / 0.15 : u > 0.82 ? Math.max(0, (1 - u) / 0.18) : 1;
      const headMat = head.material as THREE.MeshBasicMaterial;
      headMat.color.copy(bolt.color);
      headMat.opacity = 0.55 + grow * 0.45;
      head.scale.setScalar(0.55 + grow * 0.5 + 0.12 * Math.sin(now * 18 + i));
      const tailMat = tail.material as THREE.MeshBasicMaterial;
      tailMat.color.copy(bolt.color);
      tailMat.opacity = 0.4 * grow;
      tail.scale.set(0.8 + grow * 0.5, 1, 0.8 + grow * 0.5);
    }

    // 冲击波: 能量球壳扩散 + 淡出
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      const m = waveRefs.current[i];
      if (!m) continue;
      if (!w.active) {
        m.visible = false;
        continue;
      }
      const u = (now - w.t0) / WAVE_S;
      if (u >= 1) {
        w.active = false;
        m.visible = false;
        continue;
      }
      m.visible = true;
      m.position.copy(w.at);
      m.scale.setScalar(0.35 + u * 2.3);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.copy(w.color);
      mat.opacity = 0.55 * (1 - u);
    }
  });

  return (
    <group>
      {/* 彗星池（头球 + 尾锥） */}
      {bolts.map((_, i) => (
        <group key={`bolt-${i}`} ref={(g) => { boltRefs.current[i] = g; }} visible={false}>
          <mesh ref={(m) => { headRefs.current[i] = m; }} scale={0.001}>
            <sphereGeometry args={[0.13, 12, 10]} />
            <meshBasicMaterial transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh ref={(m) => { tailRefs.current[i] = m; }} scale={0.001}>
            <coneGeometry args={[0.07, 0.6, 8]} />
            <meshBasicMaterial transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* 冲击波池（能量球壳） */}
      {waves.map((_, i) => (
        <mesh key={`wave-${i}`} ref={(m) => { waveRefs.current[i] = m; }} visible={false} scale={0.001} renderOrder={93}>
          <sphereGeometry args={[1, 20, 14]} />
          <meshBasicMaterial transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
