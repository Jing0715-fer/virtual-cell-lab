'use client';

/* eslint-disable react-hooks/immutability -- R3F 命令式动画是标准范式（与 molecules.tsx 同范式） */

/**
 * 3D 药物分子层 —— 激酶抑制剂的球棍模型可视化
 *
 * 科學表征约定（按药理学类别的真实构象动机分型）:
 *   - planar     平面芳香稠环骨架 + 侧链取代基（ATP 竞争 / 别构激酶抑制剂，如曲美替尼）
 *   - macrocycle 大环内酯/环肽大环（雷帕霉素、环孢素、Z-VAD 肽模拟物）
 *   - helical    α-螺旋模拟物（维奈克拉 BH3 mimetic —— 模拟 BH3-only 螺旋插入 BCL-2 疏水沟）
 * 原子配色 CPK 变体（紫=C 骨架 / 青=N / 玫瑰=O / 琥珀=S / 青柠=卤素），
 * 保持与抑制环（#c084fc）一致的药物视觉语言。
 *
 * 动画: 投药后分子从胞外随机点"扩散逼近"靶点（ease-out ~2.6s）→
 *       停泊在结合位姿（靶点外缘 + 呼吸振荡 + 缓慢自旋）；
 *       洗脱时随抑制强度淡出。结合强度 = 药物浓度（inhibition level）。
 */
import { memo, useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Node3D } from '@/lib/simulation/layout3d';
import type { SimSnapshot } from './molecules';
import { noSectionClipTag } from './section-view';
import { INHIBITORS, type InhibitorSpec } from '@/data/inhibitors';
import { useLabStore } from '@/store/lab-store';
import { useLang } from '@/lib/i18n';

/** 判定字符串是否含汉字（药物通用名 zh → EN 展示需切换为 code 首词） */
const HAS_HAN = /[\u4e00-\u9fff]/;

/** v53 剖面完整性检测复用的世界坐标临时向量（避免每帧分配） */
const _dw = new THREE.Vector3();

/** 药物构象动机（由药物类别文本启发式推断） */
type Motif = 'planar' | 'macrocycle' | 'helical';

function motifOf(drug: InhibitorSpec): Motif {
  const cls = drug.drugClass + ' ' + drug.code + ' ' + drug.name;
  if (/大环|环肽|macrocycle|雷帕|环孢|Z-Val|Sirolimus|Cyclosporin/i.test(cls)) return 'macrocycle';
  if (/BH3|螺旋|helical|维奈|Venetoclax/i.test(cls)) return 'helical';
  return 'planar';
}

/** CPK 变体原子配色（药物视觉语言内） */
const ATOM_COLORS = { c: '#a78bfa', n: '#2dd4bf', o: '#fb7185', s: '#fbbf24', x: '#a3e635' } as const;
type AtomKind = keyof typeof ATOM_COLORS;

interface AtomSpec {
  pos: [number, number, number];
  r: number;
  kind: AtomKind;
}

/** 生成构象原子布局（单位尺度，组件内整体缩放） */
function atomsForMotif(motif: Motif, seed: number): AtomSpec[] {
  const rand = mulberry(seed);
  const atoms: AtomSpec[] = [];
  if (motif === 'planar') {
    // 平面稠环: 六元环 + 稠合五元环 + 两个侧链取代
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      atoms.push({ pos: [Math.cos(a), 0, Math.sin(a)], r: 0.5, kind: i % 3 === 0 ? 'n' : 'c' });
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.5;
      atoms.push({ pos: [Math.cos(a) * 0.55 + 1.2, 0, Math.sin(a) * 0.55], r: 0.42, kind: i % 4 === 0 ? 's' : 'c' });
    }
    atoms.push({ pos: [0.4, 0, 1.9], r: 0.4, kind: 'o' });
    atoms.push({ pos: [-1.5, 0, -1.1], r: 0.38, kind: 'x' });
  } else if (motif === 'macrocycle') {
    // 大环: 11 元环 + 环内氢键供体（青色 N）+ 两个环外取代
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 1 + Math.sin(a * 3) * 0.08;
      atoms.push({
        pos: [Math.cos(a) * r, Math.sin(a * 5) * 0.12, Math.sin(a) * r],
        r: 0.44,
        kind: i % 5 === 0 ? 'n' : i % 7 === 0 ? 'o' : 'c',
      });
    }
    atoms.push({ pos: [0, 1.4, 0], r: 0.4, kind: 'o' });
    atoms.push({ pos: [0.3, -1.45, 0.2], r: 0.36, kind: 'x' });
  } else {
    // 螺旋 BH3 模拟: 3.6 残基/圈的 α-螺旋主链 + 疏水侧链（4 个关键残基）
    const turns = 2.4;
    const per = 9;
    for (let i = 0; i < per; i++) {
      const t = i / per;
      const a = t * Math.PI * 2 * turns;
      const y = t * 3.6 - 1.6;
      atoms.push({ pos: [Math.cos(a) * 0.62, y, Math.sin(a) * 0.62], r: 0.36, kind: 'c' });
      if (i % 2 === 0) {
        // 侧链指向螺旋外（疏水残基）
        atoms.push({
          pos: [Math.cos(a) * 1.25, y + 0.08, Math.sin(a) * 1.25],
          r: 0.4,
          kind: i % 4 === 0 ? 's' : 'c',
        });
      }
    }
  }
  // 微扰消除完美对称（晶体学刚性之外的构象熵）
  for (const a of atoms) {
    a.pos[0] += (rand() - 0.5) * 0.05;
    a.pos[1] += (rand() - 0.5) * 0.05;
    a.pos[2] += (rand() - 0.5) * 0.05;
  }
  return atoms;
}

/** 确定性伪随机（种子稳定 → 同一药物每次渲染构象一致） */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DrugMoleculeProps {
  drug: InhibitorSpec;
  target: Node3D;
  sim: RefObject<SimSnapshot>;
  showLabel: boolean;
  /** 同一靶点上的分子序号（错开结合位姿） */
  slot: number;
}

const APPROACH_MS = 2600;

const DrugMolecule3D = memo(function DrugMolecule3D({ drug, target, sim, showLabel, slot }: DrugMoleculeProps) {
  const { lang } = useLang();
  const groupRef = useRef<THREE.Group>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const bornAt = useRef(performance.now());
  const seed = useMemo(() => hashStr(drug.id + slot), [drug.id, slot]);
  const motif = useMemo(() => motifOf(drug), [drug]);
  const atoms = useMemo(() => atomsForMotif(motif, seed), [motif, seed]);
  // 当前可见度（useFrame 写入）—— 淡出中的药物不再截获点击/悬停
  const visRef = useRef(0);

  // 原子材质缓存（按元素类型共享；transparent 常开避免运行时重编译; v53 noSectionClip 豁免 ——
  // 药物球棍模型在切面处恒完整渲染）
  const mats = useMemo(() => {
    const mk = (k: AtomKind) =>
      noSectionClipTag(
        new THREE.MeshStandardMaterial({
          color: ATOM_COLORS[k],
          emissive: ATOM_COLORS[k],
          emissiveIntensity: 0.35,
          roughness: 0.32,
          transparent: true,
          opacity: 1,
        }),
      );
    return { c: mk('c'), n: mk('n'), o: mk('o'), s: mk('s'), x: mk('x') };
  }, []);
  const bondMat = useMemo(
    () =>
      noSectionClipTag(
        new THREE.MeshStandardMaterial({
          color: '#8b7bb8',
          emissive: '#6d5bb0',
          emissiveIntensity: 0.22,
          roughness: 0.55,
          transparent: true,
          opacity: 0.85,
        }),
      ),
    [],
  );
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) m.dispose();
      bondMat.dispose();
    },
    [mats, bondMat],
  );

  // 药物标签点击 → 选中其靶点分子（与分子标签同一交互语言; 原生监听阻断冒泡至 R3F 事件容器,
  // 否则会触发 onPointerMissed 把刚选中的靶点又取消）
  // ⚠ drei Html 异步挂载 —— rAF 轮询直至标签元素就绪再挂监听
  useEffect(() => {
    let el: HTMLDivElement | null = null;
    let raf = 0;
    const stop = (e: Event) => e.stopPropagation();
    const onSelect = (e: MouseEvent) => {
      e.stopPropagation();
      useLabStore.getState().selectNode(target.id);
    };
    const onEnter = () => {
      document.body.style.cursor = 'pointer';
    };
    const onLeave = () => {
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
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      if (!el) return;
      el.removeEventListener('click', onSelect);
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('pointermove', stop);
      el.removeEventListener('pointerdown', stop);
      el.removeEventListener('pointerup', stop);
    };
  }, [target.id]);

  // 结合位姿: 靶点外缘（沿靶点→细胞外方向），slot 错开角度
  const bindPose = useMemo(() => {
    const r = target.kind === 'receptor' || target.kind === 'channel' ? 1.5 : target.r + 0.62;
    const dir = new THREE.Vector3(target.pos.x, target.pos.y, target.pos.z).normalize();
    const angle = slot * 2.2;
    const q = new THREE.Quaternion().setFromAxisAngle(dir, angle);
    const offset = new THREE.Vector3(r + 0.3, 0.55, 0.2).applyQuaternion(q);
    return {
      x: target.pos.x + offset.x,
      y: target.pos.y + offset.y,
      z: target.pos.z + offset.z,
    };
  }, [target, slot]);

  // 逼近起点: 胞外随机方向远点
  const spawn = useMemo(() => {
    const rand = mulberry(seed ^ 0x9e37);
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(rand() * 0.8);
    const R = 5.2;
    return {
      x: Math.sin(phi) * Math.cos(theta) * R,
      y: Math.cos(phi) * R * 0.7,
      z: Math.sin(phi) * Math.sin(theta) * R,
    };
  }, [seed]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const g = groupRef.current;
    if (!g) return;
    const level = sim.current.inhibition?.[target.id] ?? 0;
    // v53 剖面完整性: 材质豁免裁剪恒完整; 完全落入剖掉前半区 → 整组隐藏
    // （逼近路径前段位于剖掉区, 与旧 WebGL 裁剪行为等效 —— 越过切面后现身）
    const cp = sim.current.clipPlane;
    g.getWorldPosition(_dw);
    // v54 视距恒定尺寸: 与分子节点同一 (dist/D0)^0.9 补偿（停泊靶点的节点屏上恒定,
    // 药物球棍模型同步补偿 —— 「视角拉大时大小不变」的药物侧一致读感）
    const camDistD = state.camera.position.distanceTo(_dw);
    const d0 = sim.current.viewDist ?? 30;
    const zoomS = camDistD <= d0 ? 1 : Math.min(2.75, (camDistD / d0) ** 0.9);
    g.scale.setScalar(0.21 * zoomS);
    if (cp) {
      g.visible = cp.distanceToPoint(_dw) > -0.55 * Math.max(1, zoomS);
    } else {
      g.visible = true;
    }
    // 投药后起算逼近动画；洗脱（level 归零）后整体淡出
    const age = (performance.now() - bornAt.current) / APPROACH_MS;
    const ease = age >= 1 ? 1 : 1 - Math.pow(1 - Math.max(0, age), 3);
    const x = spawn.x + (bindPose.x - spawn.x) * ease;
    const y = spawn.y + (bindPose.y - spawn.y) * ease;
    const z = spawn.z + (bindPose.z - spawn.z) * ease;
    g.position.set(x, y, z);
    // 停泊后呼吸振荡 + 缓慢自旋（别构结合的构象涨落）
    const docked = age >= 1;
    if (docked) {
      g.position.y = y + Math.sin(t * 1.8 + slot * 1.7) * 0.07;
      g.rotation.y = t * 0.45 + seed;
      g.rotation.x = Math.sin(t * 0.5 + slot) * 0.22;
    } else {
      g.rotation.y = t * 2.4 + seed; // 扩散翻滚
    }
    // 透明度: 逼近期随浓度上升，洗脱期随浓度淡出
    const vis = Math.min(level * 1.6, 1) * (docked ? 1 : 0.35 + 0.65 * ease);
    visRef.current = vis;
    for (const m of Object.values(mats)) {
      m.opacity = vis;
      m.emissiveIntensity = 0.32 + level * 0.5;
    }
    bondMat.opacity = vis * 0.85;
    const el = labelRef.current;
    if (el) {
      const op = showLabel && docked ? String(Math.min(1, level * 1.4)) : '0';
      el.style.opacity = op;
      // 隐藏标签不拦截画布交互（透明元素仍参与命中测试）
      const pe = op === '0' ? 'none' : 'auto';
      if (el.style.pointerEvents !== pe) el.style.pointerEvents = pe;
    }
  });

  const scale = 0.21;

  // 徽标文案: zh = 中文通用名 + 类别（去括号注记）; en = code 首词（中文通用名时）+ 类别英文字段
  const badgeName = lang === 'zh' ? drug.name : HAS_HAN.test(drug.name) ? drug.code.split(' ·')[0] : drug.name;
  const badgeClass = lang === 'zh' ? drug.drugClass.split('（')[0] : drug.drugClassEn;

  return (
    <group
      ref={groupRef}
      position={[spawn.x, spawn.y, spawn.z]}
      scale={scale}
      onClick={(e) => {
        if (visRef.current <= 0.12) return;
        e.stopPropagation();
        useLabStore.getState().selectNode(target.id);
      }}
      onPointerOver={(e) => {
        if (visRef.current <= 0.12) return;
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      {/* 原子（球棍模型） */}
      {atoms.map((a, i) => (
        <mesh key={`at-${i}`} position={a.pos} material={mats[a.kind]}>
          <sphereGeometry args={[a.r, 12, 10]} />
        </mesh>
      ))}
      {/* 键（中心骨架两两连线 + 取代基连中心） */}
      {atoms.map((a, i) => {
        if (i === 0) return null;
        const b = atoms[i - 1];
        const dx = a.pos[0] - b.pos[0];
        const dy = a.pos[1] - b.pos[1];
        const dz = a.pos[2] - b.pos[2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 0.05) return null;
        const mid: [number, number, number] = [(a.pos[0] + b.pos[0]) / 2, (a.pos[1] + b.pos[1]) / 2, (a.pos[2] + b.pos[2]) / 2];
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(dx / len, dy / len, dz / len),
        );
        return (
          <mesh key={`bd-${i}`} position={mid} quaternion={quat} material={bondMat}>
            <cylinderGeometry args={[0.07, 0.07, len, 6]} />
          </mesh>
        );
      })}
      {/* 药物名徽标（停泊后显示; 屏幕空间恒定尺寸清晰可读; 点击选中靶点分子） */}
      <Html
        position={[0, 1.5, 0]}
        center
        zIndexRange={[9, 0]}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div ref={labelRef} className="drug3d-label" style={{ pointerEvents: 'auto' }}>
          <span className="drug3d-name">{badgeName}</span>
          <span className="drug3d-class">{badgeClass}</span>
        </div>
      </Html>
    </group>
  );
});

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 药物分子层: 活跃抑制剂的 3D 表征（结合到核心子图匹配的靶点） */
export function DrugMoleculeLayer({
  nodes,
  sim,
  showLabels,
}: {
  nodes: Node3D[];
  sim: RefObject<SimSnapshot>;
  showLabels: boolean;
}) {
  // 活跃药物（面板开关）—— 药物粒度重渲染，非 tick 粒度
  const inhibitors = useLabStore((s) => s.inhibitors);
  const drugLevels = useLabStore((s) => s.drugLevels);

  // 药物 × 靶点配对（浓度 > 0 才显示分子）
  const pairs = useMemo(() => {
    const out: { drug: InhibitorSpec; target: Node3D; slot: number }[] = [];
    for (const drug of INHIBITORS) {
      if (!inhibitors[drug.id]) continue;
      const level = drugLevels[drug.id] ?? 0;
      if (level <= 0.02) continue;
      for (const tgt of drug.targets) {
        const node = nodes.find((n) => n.id === tgt || n.label === tgt);
        if (!node) continue;
        const count = level > 0.6 ? 2 : 1; // 高浓度双分子占位
        for (let slot = 0; slot < count; slot++) {
          out.push({ drug, target: node, slot });
        }
      }
    }
    return out;
  }, [inhibitors, drugLevels, nodes]);

  // key 稳定: 同一药物+靶点+slot 复用实例（避免洗脱闪断重建动画）
  const stableKey = (p: { drug: InhibitorSpec; target: Node3D; slot: number }) =>
    `${p.drug.id}:${p.target.id}:${p.slot}`;

  return (
    <group>
      {pairs.map((p) => (
        <DrugMolecule3D
          key={stableKey(p)}
          drug={p.drug}
          target={p.target}
          sim={sim}
          showLabel={showLabels}
          slot={p.slot}
        />
      ))}
    </group>
  );
}
