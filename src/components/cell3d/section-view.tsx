'use client';

/**
 * 细胞剖面展示模块（增强版）
 * ============ 科学定位 ============
 * 基于 Three.js 全局裁剪平面（clippingPlanes）剖切细胞前半部：
 *   1. 剖切深度可调（表面 → 深剖近后半）
 *   2. 剖切方位三预设：正剖（冠状面观）/ 俯剖（水平面观）/ 侧剖（矢状面观）——
 *      对应显微解剖学三个标准切面（coronal / horizontal / sagittal）
 *   3. 剖面填充盘（Section Cap）：程序化 Canvas 纹理绘制"剖面标本图"——
 *      质膜双层线 · 细胞质颗粒基质 · 细胞器剖面散布（线粒体/高尔基/囊泡/ER）
 *      · 核被膜双线 · 异染色质边集 · 常染色质纤维 · 核仁，科学参照
 *      Alberts MBoC 6th Fig.1-8 / Ross Histology 电镜剖面风格
 *   4. 剖面方位平滑过渡（四元数阻尼插值）
 *   5. 被剖掉的前半分子 DOM 标签同步隐藏（SimSnapshot.clipPlane 快照广播）
 *   6. 剖面结构 Html 标注（联动解剖标注开关）
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { CellBodySpec } from '@/lib/simulation/layout3d';

/* ============ 剖面方位预设（解剖学标准切面） ============ */

export type SectionAxis = 'front' | 'top' | 'side';

export const SECTION_ORIENTS: Record<
  SectionAxis,
  { normal: THREE.Vector3; label: string; latin: string; hint: string }
> = {
  front: {
    normal: new THREE.Vector3(0, -0.22, -1).normalize(),
    label: '正剖',
    latin: 'Coronal',
    hint: '冠状面 · 剖开前半部，正对观察者',
  },
  top: {
    normal: new THREE.Vector3(0.04, -1, -0.14).normalize(),
    label: '俯剖',
    latin: 'Horizontal',
    hint: '水平面 · 自上而下剖开上半部',
  },
  side: {
    normal: new THREE.Vector3(-1, -0.14, -0.32).normalize(),
    label: '侧剖',
    latin: 'Sagittal',
    hint: '矢状面 · 自左侧剖开，纵切细胞长轴',
  },
};

/* ============ 伪随机（稳定种子 → 剖面纹理可复现） ============ */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============ 程序化剖面纹理（剖面标本图） ============ */

/**
 * 绘制剖面填充盘纹理：模拟光学显微镜下细胞切片的染色风格
 * （细胞质 teal 基底 → 紫红色核染色质 → 玫瑰核仁，保持应用主题色系）
 */
function makeSectionTexture(R: number, N: number, seed = 42): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const SIZE = 640;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const rnd = mulberry32(seed);
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  /** 世界半径 → 像素半径（贴盘边） */
  const px = (world: number): number => (world / (R * 1.05)) * (SIZE / 2 - 4);
  const rMem = px(R);
  const rNuc = px(N);

  /* --- 细胞质基质（径向渐变, 外深内浅） --- */
  const cyto = ctx.createRadialGradient(cx, cy, rNuc * 0.9, cx, cy, rMem);
  cyto.addColorStop(0, 'rgba(13, 74, 68, 0.78)');
  cyto.addColorStop(0.55, 'rgba(10, 56, 52, 0.72)');
  cyto.addColorStop(1, 'rgba(6, 34, 32, 0.88)');
  ctx.fillStyle = cyto;
  ctx.beginPath();
  ctx.arc(cx, cy, rMem, 0, Math.PI * 2);
  ctx.fill();

  /* --- 细胞质颗粒基质（核糖体/糖原弥散点） --- */
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rMem, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 420; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = rNuc + 12 + rnd() * (rMem - rNuc - 18);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.96;
    ctx.fillStyle = rnd() > 0.7 ? 'rgba(94, 234, 212, 0.10)' : 'rgba(45, 212, 191, 0.055)';
    const s = 0.8 + rnd() * 1.6;
    ctx.fillRect(x, y, s, s);
  }

  /* --- 线粒体剖面（椭圆 · 双层膜 + 板层嵴） --- */
  const mitoCount = 7;
  for (let i = 0; i < mitoCount; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = rNuc + 26 + rnd() * (rMem - rNuc - 58);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.94;
    const rx = 16 + rnd() * 13;
    const ry = rx * (0.56 + rnd() * 0.2);
    const rot = rnd() * Math.PI;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    // 外膜
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(26, 46, 5, 0.85)';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(132, 204, 22, 0.6)';
    ctx.stroke();
    // 内膜 + 嵴（波浪短弧）
    ctx.beginPath();
    ctx.ellipse(0, 0, rx - 2.6, ry - 2.6, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(101, 163, 13, 0.5)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    const cristae = Math.floor(rx / 6);
    for (let j = 1; j < cristae; j++) {
      const xx = -rx + (j * 2 * rx) / cristae;
      const h = ry * (0.55 + 0.3 * Math.sin(j * 1.7 + i));
      ctx.beginPath();
      ctx.moveTo(xx, -h);
      ctx.quadraticCurveTo(xx + 3, 0, xx, h);
      ctx.strokeStyle = 'rgba(101, 163, 13, 0.42)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* --- 高尔基体剖面（顺→反 3-4 池弧线堆叠） --- */
  for (let g = 0; g < 2; g++) {
    const a = rnd() * Math.PI * 2;
    const rr = rNuc + 30 + rnd() * (rMem - rNuc - 62);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.94;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rnd() * Math.PI * 2);
    for (let s = 0; s < 4; s++) {
      ctx.beginPath();
      ctx.arc(0, s * 2.6 - 4, 13 - s * 1.8, Math.PI * 0.15, Math.PI * 0.85);
      ctx.strokeStyle = `rgba(180, 83, 9, ${0.55 - s * 0.08})`;
      ctx.lineWidth = 2.4 - s * 0.35;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* --- 内质网剖面（波浪长线） --- */
  for (let e = 0; e < 3; e++) {
    const a = rnd() * Math.PI * 2;
    const rr = rNuc + 20 + rnd() * (rMem - rNuc - 40);
    ctx.save();
    ctx.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92);
    ctx.rotate(rnd() * Math.PI);
    ctx.beginPath();
    for (let x = -34; x <= 34; x += 4) {
      const y = Math.sin(x * 0.22 + e * 2) * 5;
      if (x === -34) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(13, 148, 136, 0.5)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // 膜旁核糖体点
    for (let x = -32; x <= 32; x += 6) {
      const y = Math.sin(x * 0.22 + e * 2) * 5 + 3.4;
      ctx.fillStyle = 'rgba(45, 212, 191, 0.35)';
      ctx.fillRect(x - 0.7, y - 0.7, 1.5, 1.5);
    }
    ctx.restore();
  }

  /* --- 转运囊泡（小圆环） --- */
  for (let v = 0; v < 18; v++) {
    const a = rnd() * Math.PI * 2;
    const rr = rNuc + 14 + rnd() * (rMem - rNuc - 20);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.94;
    const r = 2.2 + rnd() * 2.8;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(87, 83, 78, 0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(168, 162, 158, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();

  /* --- 核区 --- */
  // 常染色质基底（中心浅 → 边缘异染色质深）
  const nuc = ctx.createRadialGradient(cx, cy, rNuc * 0.1, cx, cy, rNuc);
  nuc.addColorStop(0, 'rgba(107, 33, 168, 0.66)');
  nuc.addColorStop(0.62, 'rgba(88, 28, 135, 0.74)');
  nuc.addColorStop(0.86, 'rgba(59, 7, 100, 0.86)');
  nuc.addColorStop(1, 'rgba(46, 16, 101, 0.94)');
  ctx.fillStyle = nuc;
  ctx.beginPath();
  ctx.arc(cx, cy, rNuc, 0, Math.PI * 2);
  ctx.fill();

  // 异染色质边集环带（核周缘致密, 符合间期核型）
  ctx.beginPath();
  ctx.arc(cx, cy, rNuc - 5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(46, 16, 101, 0.55)';
  ctx.lineWidth = 9;
  ctx.stroke();

  // 常染色质纤维（细弧线网）
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rNuc - 10, 0, Math.PI * 2);
  ctx.clip();
  for (let f = 0; f < 9; f++) {
    const a0 = rnd() * Math.PI * 2;
    const rr = rNuc * (0.2 + rnd() * 0.55);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a0) * rr * 0.4, cy + Math.sin(a0) * rr * 0.4, rr, a0, a0 + Math.PI * (0.7 + rnd() * 0.9));
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.16)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
  ctx.restore();

  /* --- 核仁（1-2 个 · 纤维中心 + 颗粒组分） --- */
  const nucleoli = 1 + (rnd() > 0.55 ? 1 : 0);
  for (let k = 0; k < nucleoli; k++) {
    const a = rnd() * Math.PI * 2;
    const rr = rNuc * (0.3 + rnd() * 0.24);
    const nx = cx + Math.cos(a) * rr;
    const ny = cy + Math.sin(a) * rr;
    const nr = rNuc * (0.16 + rnd() * 0.07);
    const gr = ctx.createRadialGradient(nx, ny, 1, nx, ny, nr);
    gr.addColorStop(0, 'rgba(251, 113, 133, 0.85)');
    gr.addColorStop(0.55, 'rgba(159, 18, 57, 0.88)');
    gr.addColorStop(1, 'rgba(76, 5, 25, 0.92)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(nx, ny, nr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  /* --- 核被膜双线（外膜 + 内膜 + 核周间隙） --- */
  ctx.beginPath();
  ctx.arc(cx, cy, rNuc, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(244, 114, 182, 0.72)';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rNuc - 6.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(190, 24, 93, 0.5)';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  // 核孔复合体剖面（周缘放射短杆）
  const npores = Math.floor((rNuc * 2 * Math.PI) / 26);
  for (let p = 0; p < npores; p++) {
    const a = (p / npores) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * (rNuc + 3.5);
    const y1 = cy + Math.sin(a) * (rNuc + 3.5);
    const x2 = cx + Math.cos(a) * (rNuc - 9);
    const y2 = cy + Math.sin(a) * (rNuc - 9);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.4)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  /* --- 质膜剖面（双层磷脂线 + 膜间腔） --- */
  ctx.beginPath();
  ctx.arc(cx, cy, rMem, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(45, 212, 191, 0.9)';
  ctx.lineWidth = 3.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rMem - 7, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(15, 118, 110, 0.66)';
  ctx.lineWidth = 1.7;
  ctx.stroke();
  // 膜外微绒毛/糖被短须
  const glyco = Math.floor((rMem * 2 * Math.PI) / 14);
  for (let p = 0; p < glyco; p++) {
    const a = (p / glyco) * Math.PI * 2 + rnd() * 0.05;
    const x1 = cx + Math.cos(a) * (rMem + 1.5);
    const y1 = cy + Math.sin(a) * (rMem + 1.5);
    const x2 = cx + Math.cos(a) * (rMem + 4 + rnd() * 3);
    const y2 = cy + Math.sin(a) * (rMem + 4 + rnd() * 3);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ============ 剖面标注点 ============ */

const SECTION_ANNOTATIONS = [
  { local: [0, 0.4, 0], zh: '细胞核（剖面）', latin: 'Nucleus, sectioned' },
  { local: [0.52, 0.26, 0], zh: '细胞质基质', latin: 'Cytosol' },
  { local: [0.965, 0.12, 0], zh: '质膜（剖面）', latin: 'Plasma membrane' },
] as const;

/* ============ 剖面控制器 ============ */

/* eslint-disable react-hooks/immutability -- renderer.clippingPlanes 为 three.js 全局渲染器命令式 API（R3F 标准用法） */
export function SectionClipController({
  enabled,
  depth,
  axis,
  spec,
  showAnatomy,
  sim,
}: {
  enabled: boolean;
  /** 剖切深度 0-1（0 = 触及表面, 1 = 深剖近后半） */
  depth: number;
  axis: SectionAxis;
  spec: CellBodySpec;
  /** 联动解剖标注开关（剖面结构标注） */
  showAnatomy: boolean;
  /** 模拟快照引用（广播 clipPlane → 分子标签层同步隐藏被剖掉的前半分子标签） */
  sim: { current: { clipPlane?: THREE.Plane | null } };
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  const R = spec.membraneR;
  const N = spec.nucleusR;

  const plane = useMemo(() => new THREE.Plane(SECTION_ORIENTS.front.normal.clone(), 0.9), []);
  const targetNormal = useRef(plane.normal.clone());
  const targetConstant = useRef(0.9);
  const origSides = useRef<Map<THREE.Material, THREE.Side>>(new Map());
  const discGroupRef = useRef<THREE.Group | null>(null);
  const [ready, setReady] = useState(false);

  const capTex = useMemo(() => makeSectionTexture(R, N), [R, N]);
  useEffect(() => {
    if (!capTex) return;
    setReady(true);
    return () => {
      capTex.dispose();
    };
  }, [capTex]);

  /* 方位变化 → 目标法向（平滑过渡在 useFrame 中完成） */
  useEffect(() => {
    targetNormal.current.copy(SECTION_ORIENTS[axis].normal);
  }, [axis]);

  /* 深度 → 平面常数（10 = 保留全部 → -4 = 深剖） */
  useEffect(() => {
    targetConstant.current = 10 - depth * 14;
  }, [depth]);

  /* 开/关剖切: 全局裁剪平面挂载 + 结构材质临时双面化（记忆原 side 以还原） */
  useEffect(() => {
    const restore = () => {
      origSides.current.forEach((side, m) => {
        m.side = side;
        m.needsUpdate = true;
      });
      origSides.current.clear();
    };
    if (enabled) {
      gl.clippingPlanes = [plane];
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.material) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (!(m instanceof THREE.Material)) continue;
          if (!origSides.current.has(m)) origSides.current.set(m, m.side);
          m.side = THREE.DoubleSide;
          m.needsUpdate = true;
        }
      });
    } else {
      gl.clippingPlanes = [];
    }
    return () => {
      gl.clippingPlanes = [];
      restore();
    };
  }, [enabled, gl, scene, plane]);

  /* 新增 mesh 后补双面化（剖面开启时动态生成的事件脉冲等） */
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last = 0;
    const tick = () => {
      const now = performance.now();
      if (now - last > 500) {
        last = now;
        scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.material) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            if (!(m instanceof THREE.Material)) continue;
            if (!origSides.current.has(m)) {
              origSides.current.set(m, m.side);
              m.side = THREE.DoubleSide;
              m.needsUpdate = true;
            }
          }
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, scene]);

  /* 帧驱动: 方位/深度阻尼 + 盘位姿同步 + clipPlane 广播 */
  useFrame(() => {
    // 法向阻尼插值
    plane.normal.lerp(targetNormal.current, 0.07);
    if (plane.normal.lengthSq() < 0.5) plane.normal.copy(targetNormal.current);
    plane.normal.normalize();
    // 常数阻尼
    plane.constant += (targetConstant.current - plane.constant) * 0.12;

    // 剖面填充盘位姿: 平面中心 + 保留侧微偏移, 朝向 = 平面法向
    if (discGroupRef.current) {
      discGroupRef.current.position
        .copy(plane.normal)
        .multiplyScalar(-plane.constant + 0.035);
      discGroupRef.current.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        plane.normal,
      );
    }
    // 广播裁剪平面（分子标签层读取; 关闭时置 null）
    sim.current.clipPlane = enabled ? plane : null;
  });

  const discR = R * 1.055;

  return (
    <>
      {enabled && ready && capTex && (
        <group ref={discGroupRef}>
          {/* 剖面填充盘（程序化剖面标本纹理） */}
          <mesh renderOrder={96}>
            <circleGeometry args={[discR, 96]} />
            <meshBasicMaterial
              map={capTex}
              transparent
              opacity={0.94}
              side={THREE.DoubleSide}
              depthWrite={false}
              fog={false}
              polygonOffset
              polygonOffsetFactor={-4}
            />
          </mesh>
          {/* 剖面发光边缘（切割亮线） */}
          <mesh renderOrder={97}>
            <ringGeometry args={[discR - 0.1, discR, 96]} />
            <meshBasicMaterial color="#5eead4" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} fog={false} />
          </mesh>
          <mesh renderOrder={97}>
            <ringGeometry args={[discR * 0.415, discR * 0.415 + 0.05, 64]} />
            <meshBasicMaterial color="#f472b6" transparent opacity={0.14} side={THREE.DoubleSide} depthWrite={false} fog={false} />
          </mesh>
          {/* 剖面结构标注（联动解剖标注开关） */}
          {showAnatomy &&
            SECTION_ANNOTATIONS.map((a) => (
              <Html
                key={a.zh}
                position={[(a.local[0] as number) * R, (a.local[1] as number) * R, (a.local[2] as number) + 0.12]}
                center
                transform
                distanceFactor={15}
                zIndexRange={[30, 0]}
                pointerEvents="none"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                <div className="mol3d-label is-active section-anno" style={{ whiteSpace: 'nowrap' }}>
                  <span className="mol3d-sym">{a.zh}</span>
                  <span className="mol3d-kind">{a.latin}</span>
                </div>
              </Html>
            ))}
        </group>
      )}
    </>
  );
}
