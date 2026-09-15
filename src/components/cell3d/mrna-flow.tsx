'use client';

/* eslint-disable react-hooks/immutability -- R3F 命令式动画是标准范式 */

/**
 * mRNA 转录出核流 —— 分子生物学事件驱动的 3D 动画
 * 科学过程: 靶基因转录（表达事件）→ pre-mRNA 加工 → 经核孔复合体输出
 *          → 胞质中指向粗面内质网核糖体区域（翻译位点）→ 淡出
 * 触发源: 模拟引擎 kind='expression' 事件（TF→靶基因）
 * 实现: 事件流订阅 + 固定粒子池（8 条 mRNA）+ useFrame 命令式动画
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Node3D, CellBodySpec } from '@/lib/simulation/layout3d';
import { nucleusCenter, nucleusRadius } from '@/lib/simulation/cell-shape';
import { useLabStore } from '@/store/lab-store';

interface MrnaParticle {
  active: boolean;
  /** 出生时间（clock 秒） */
  t0: number;
  /** 起始（基因位点） */
  from: THREE.Vector3;
  /** 核孔穿越点 */
  pore: THREE.Vector3;
  /** 胞质终点（翻译位点近似） */
  to: THREE.Vector3;
  /** 总时长 */
  duration: number;
  /** 随机相位（游动） */
  phase: number;
}

const POOL = 8;
const TOTAL_S = 3.6;

export function MrnaFlow({ nodes, spec }: { nodes: Node3D[]; spec: CellBodySpec }) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);

  const particles = useMemo<MrnaParticle[]>(
    () => Array.from({ length: POOL }, () => ({
      active: false, t0: 0,
      from: new THREE.Vector3(), pore: new THREE.Vector3(), to: new THREE.Vector3(),
      duration: TOTAL_S, phase: 0,
    })),
    [],
  );
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // 事件流订阅: 新表达事件 → 孵化 mRNA 粒子
  const processed = useRef<Set<string>>(new Set());
  useEffect(() => {
    const unsub = useLabStore.subscribe((s) => {
      const evs = s.events;
      let spawned = 0;
      for (let i = evs.length - 1; i >= 0 && i > evs.length - 24 && spawned < 3; i--) {
        const ev = evs[i];
        if (ev.kind !== 'expression' || !ev.nodeId || processed.current.has(ev.id)) continue;
        processed.current.add(ev.id);
        const gene = byId.get(ev.nodeId);
        if (!gene || gene.compartment !== 'nucleus') continue;
        // 从池中取空闲粒子
        const p = particles.find((x) => !x.active);
        if (!p) continue;
        const from = new THREE.Vector3(gene.pos.x, gene.pos.y, gene.pos.z);
        // v6: 核孔穿越点按成形核面（含核中心偏移; 杆状核沿长轴外推更远）
        const nucC = nucleusCenter(spec.shape, spec.membraneR);
        const outDir = from.clone().sub(new THREE.Vector3(nucC.x, nucC.y, nucC.z)).normalize();
        const poreR = nucleusRadius(outDir, spec.shape, spec.nucleusR) + 0.3;
        const pore = new THREE.Vector3(nucC.x, nucC.y, nucC.z).addScaledVector(outDir, poreR);
        // 胞质终点: 沿同方向推至 ER 区带（核被膜外 ~0.6 单位）, 加确定性偏移
        const to = new THREE.Vector3(nucC.x, nucC.y, nucC.z)
          .addScaledVector(outDir, poreR + 0.6)
          .add(new THREE.Vector3(
            Math.sin(gene.pos.x * 3.1) * 1.1,
            Math.cos(gene.pos.z * 2.7) * 0.8,
            Math.sin(gene.pos.y * 2.3) * 1.1,
          ));
        p.active = true;
        p.t0 = performance.now() / 1000;
        p.from.copy(from);
        p.pore.copy(pore);
        p.to.copy(to);
        p.duration = TOTAL_S + (gene.id.charCodeAt(0) % 3) * 0.35;
        p.phase = (gene.id.charCodeAt(0) % 7) * 0.85;
        spawned++;
      }
      // 防止集合无限增长
      if (processed.current.size > 400) processed.current.clear();
    });
    return unsub;
  }, [particles, byId, spec]);

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      if (!p.active) {
        mesh.visible = false;
        continue;
      }
      const u = (now - p.t0) / p.duration;
      if (u >= 1) {
        p.active = false;
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      // 三段路径: 基因→核孔（0~0.42）→ 出核加速（0.42~0.62）→ 胞质巡航（0.62~1）
      let pos: THREE.Vector3;
      if (u < 0.42) {
        const k = u / 0.42;
        pos = p.from.clone().lerp(p.pore, k * k * (3 - 2 * k)); // smoothstep
      } else if (u < 0.62) {
        const k = (u - 0.42) / 0.2;
        pos = p.pore.clone().lerp(p.to.clone().lerp(p.pore, 0.35), k);
      } else {
        const k = (u - 0.62) / 0.38;
        pos = p.pore
          .clone()
          .lerp(p.to.clone().lerp(p.pore, 0.35), 1)
          .lerp(p.to, k);
      }
      // mRNA 游动（布朗近似）
      const wob = 0.09;
      pos.x += Math.sin(now * 5.2 + p.phase) * wob;
      pos.y += Math.cos(now * 4.4 + p.phase * 1.7) * wob;
      pos.z += Math.sin(now * 6.1 + p.phase * 0.6) * wob * 0.7;
      mesh.position.copy(pos);
      // 朝向行进方向（胶囊体长轴）
      mesh.lookAt(pos.clone().add(new THREE.Vector3(0.3, 0.08, 0.2)));
      // 缩放: 快进快出（出核瞬间略放大）
      const grow = u < 0.12 ? u / 0.12 : u > 0.85 ? Math.max(0, (1 - u) / 0.15) : 1;
      const pulse = 1 + 0.14 * Math.sin(now * 7 + p.phase);
      mesh.scale.setScalar(Math.max(0.001, grow * pulse));
      // 透明度同步（材质共享池 → 用整体透明度近似）
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.min(0.95, 0.35 + grow * 0.6);
    }
  });

  return (
    <group ref={groupRef}>
      {particles.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => { meshRefs.current[i] = m; }}
          visible={false}
          scale={0.001}
        >
          {/* mRNA 近似: 短链胶囊（5′帽→3′poly-A 方向性以首尾小球示意） */}
          <capsuleGeometry args={[0.075, 0.34, 4, 8]} />
          <meshStandardMaterial
            color="#fde68a"
            emissive="#f59e0b"
            emissiveIntensity={1.35}
            roughness={0.25}
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
