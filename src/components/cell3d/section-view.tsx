'use client';

/**
 * 细胞剖面展示模块（v2 —— 剖切几何精确化）
 * ============ 科学定位 ============
 * 基于 Three.js 全局裁剪平面（clippingPlanes）剖切细胞前半部：
 *   1. 剖切深度 0-1 线性扫掠: 切平面从质膜前缘 (constant=+R) 推进到后缘 (-R)，
 *      途中经过球心 (depth=0.5) —— 与显微切片"逐层切片"语义一致
 *   2. 剖面填充双层盘（几何精确）:
 *      - 细胞质盘半径 = √(R²-h²)（h = 切面到球心距离）—— 严格贴合剖切相交圆
 *      - 核盘半径 = √(N²-h²)（h < N 时才显示）—— 切面触核后渐入、掠过核心最大
 *      两盘同心（膜与核球同心, 切面垂足即公共圆心）
 *   3. 剖面填充纹理（程序化 Canvas 双纹理, 电镜切片风格）:
 *      - 细胞质纹理: 质膜双层线/糖被/颗粒基质/线粒体剖面(长椭圆+波浪嵴线, 对应 3D 豆状形态)/高尔基平行弧堆/ER 波浪线/囊泡
 *      - 核纹理: 核被膜双线+核孔短杆/常染色质纤维/异染色质边集/核仁(纤维中心+颗粒组分)
 *   4. 剖切方位三预设: 正剖 Coronal / 俯剖 Horizontal / 侧剖 Sagittal（解剖学标准切面）
 *   5. 被剖掉的前半分子 DOM 标签同步隐藏（SimSnapshot.clipPlane 快照广播）
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
  { normal: THREE.Vector3; label: { zh: string; en: string }; latin: string; hint: { zh: string; en: string } }
> = {
  front: {
    normal: new THREE.Vector3(0, -0.22, -1).normalize(),
    label: { zh: '正剖', en: 'Front' },
    latin: 'Coronal',
    hint: {
      zh: '冠状面 · 剖开前半部，正对观察者',
      en: 'Coronal plane — anterior half removed, facing viewer',
    },
  },
  top: {
    normal: new THREE.Vector3(0.04, -1, -0.14).normalize(),
    label: { zh: '俯剖', en: 'Top' },
    latin: 'Horizontal',
    hint: {
      zh: '水平面 · 自上而下剖开上半部',
      en: 'Horizontal plane — superior half removed',
    },
  },
  side: {
    normal: new THREE.Vector3(-1, -0.14, -0.32).normalize(),
    label: { zh: '侧剖', en: 'Side' },
    latin: 'Sagittal',
    hint: {
      zh: '矢状面 · 自左侧剖开，纵切细胞长轴',
      en: 'Sagittal plane — lateral section along major axis',
    },
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

/* ============ 程序化剖面纹理（双层） ============ */

/** 细胞质剖面纹理（核区挖空透明; 基准半径 = R, 盘缩放后 UV 随动） */
function makeCytoplasmTexture(R: number, seed = 42): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const SIZE = 640;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const rnd = mulberry32(seed);
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const rMem = SIZE / 2 - 4;

  /* --- 细胞质基质（径向渐变, 外深内浅） --- */
  const cyto = ctx.createRadialGradient(cx, cy, rMem * 0.3, cx, cy, rMem);
  cyto.addColorStop(0, 'rgba(13, 74, 68, 0.80)');
  cyto.addColorStop(0.55, 'rgba(10, 56, 52, 0.74)');
  cyto.addColorStop(1, 'rgba(6, 34, 32, 0.90)');
  ctx.fillStyle = cyto;
  ctx.beginPath();
  ctx.arc(cx, cy, rMem, 0, Math.PI * 2);
  ctx.fill();

  /* --- 细胞质颗粒基质（核糖体/糖原弥散点, 全域散布; 核盘将叠于其上） --- */
  for (let i = 0; i < 460; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = rMem * (0.18 + rnd() * 0.8);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.96;
    ctx.fillStyle = rnd() > 0.7 ? 'rgba(94, 234, 212, 0.10)' : 'rgba(45, 212, 191, 0.055)';
    const s = 0.8 + rnd() * 1.6;
    ctx.fillRect(x, y, s, s);
  }

  /* --- 线粒体剖面（长椭圆 rx≈26 ry≈11 · 双层膜 + 4-5 条沿长轴波浪嵴线，对应 3D 长条豆状新形态） --- */
  const mitoCount = 8;
  for (let i = 0; i < mitoCount; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = rMem * (0.44 + rnd() * 0.48);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.94;
    const rx = 22 + rnd() * 7; // 长椭圆（≈2.4:1, 与 2D Mitochondrion 椭圆同构）
    const ry = rx * 0.42;
    const rot = rnd() * Math.PI;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(26, 46, 5, 0.85)';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(132, 204, 22, 0.6)';
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, rx - 2.6, ry - 2.6, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(101, 163, 13, 0.5)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // 波浪嵴线（沿长轴 4-5 条, 裁剪于椭圆内 —— 与 2D 形态学/3D 板层嵴同构）
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, rx - 3, ry - 3, 0, 0, Math.PI * 2);
    ctx.clip();
    const lines = 4 + (i % 2);
    for (let j = 0; j < lines; j++) {
      const yy = -ry * 0.6 + (j * ry * 1.2) / Math.max(1, lines - 1);
      ctx.beginPath();
      for (let xx = -rx + 3; xx <= rx - 3; xx += 3) {
        const wy = yy + Math.sin(xx * 0.24 + j * 1.9 + i) * ry * 0.3;
        if (xx === -rx + 3) ctx.moveTo(xx, wy);
        else ctx.lineTo(xx, wy);
      }
      ctx.strokeStyle = 'rgba(101, 163, 13, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  /* --- 高尔基体剖面（3 组 × 4 条平行弧线堆 = 层叠扁平囊截面，对应 3D 高尔基重塑） --- */
  for (let g = 0; g < 3; g++) {
    const a = rnd() * Math.PI * 2;
    const rr = rMem * (0.5 + rnd() * 0.4);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.94;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rnd() * Math.PI * 2);
    const stack = 4; // 每组 4 条平行弧（同半径沿 y 平移 → 平行弧堆）
    for (let s = 0; s < stack; s++) {
      ctx.beginPath();
      ctx.arc(0, -s * 3.1, 13 - s * 0.6, Math.PI * 0.12, Math.PI * 0.88);
      ctx.strokeStyle = `rgba(180, 83, 9, ${0.55 - s * 0.07})`;
      ctx.lineWidth = 2.2 - s * 0.3;
      ctx.stroke();
    }
    // 反面出芽小泡（琥珀小点）
    for (let v = 0; v < 3; v++) {
      ctx.beginPath();
      ctx.arc(-13 + v * 5.2, -stack * 3.1 - 3.5, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(217, 119, 6, 0.4)';
      ctx.fill();
    }
    ctx.restore();
  }

  /* --- 内质网剖面（波浪长线 + 膜旁核糖体） --- */
  for (let e = 0; e < 4; e++) {
    const a = rnd() * Math.PI * 2;
    const rr = rMem * (0.42 + rnd() * 0.5);
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
    for (let x = -32; x <= 32; x += 6) {
      const y = Math.sin(x * 0.22 + e * 2) * 5 + 3.4;
      ctx.fillStyle = 'rgba(45, 212, 191, 0.35)';
      ctx.fillRect(x - 0.7, y - 0.7, 1.5, 1.5);
    }
    ctx.restore();
  }

  /* --- 转运囊泡（小圆环） --- */
  for (let v = 0; v < 20; v++) {
    const a = rnd() * Math.PI * 2;
    const rr = rMem * (0.3 + rnd() * 0.66);
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

  /* --- 质膜剖面（双层磷脂线 + 膜间腔 + 糖被短须） --- */
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

/** 核剖面纹理（基准半径 = N; 盘缩放后核孔/核仁等随动） */
function makeNucleusTexture(N: number, seed = 7): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const SIZE = 320;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const rnd = mulberry32(seed);
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const rNuc = SIZE / 2 - 4;

  /* --- 常染色质基底（中心浅 → 边缘异染色质深） --- */
  const nuc = ctx.createRadialGradient(cx, cy, rNuc * 0.08, cx, cy, rNuc);
  nuc.addColorStop(0, 'rgba(107, 33, 168, 0.72)');
  nuc.addColorStop(0.62, 'rgba(88, 28, 135, 0.80)');
  nuc.addColorStop(0.86, 'rgba(59, 7, 100, 0.9)');
  nuc.addColorStop(1, 'rgba(46, 16, 101, 0.96)');
  ctx.fillStyle = nuc;
  ctx.beginPath();
  ctx.arc(cx, cy, rNuc, 0, Math.PI * 2);
  ctx.fill();

  /* --- 异染色质边集环带（核周缘致密, 符合间期核型） --- */
  ctx.beginPath();
  ctx.arc(cx, cy, rNuc - 4.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(46, 16, 101, 0.5)';
  ctx.lineWidth = 8;
  ctx.stroke();

  /* --- 常染色质纤维（细弧线网） --- */
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rNuc - 9, 0, Math.PI * 2);
  ctx.clip();
  for (let f = 0; f < 10; f++) {
    const a0 = rnd() * Math.PI * 2;
    const rr = rNuc * (0.2 + rnd() * 0.55);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a0) * rr * 0.4, cy + Math.sin(a0) * rr * 0.4, rr, a0, a0 + Math.PI * (0.7 + rnd() * 0.9));
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.17)';
    ctx.lineWidth = 1.4;
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
    gr.addColorStop(0, 'rgba(251, 113, 133, 0.88)');
    gr.addColorStop(0.55, 'rgba(159, 18, 57, 0.9)');
    gr.addColorStop(1, 'rgba(76, 5, 25, 0.94)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(nx, ny, nr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  /* --- 核被膜双线（外膜 + 内膜 + 核周间隙） + 核孔复合体剖面 --- */
  ctx.beginPath();
  ctx.arc(cx, cy, rNuc, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(244, 114, 182, 0.78)';
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rNuc - 6.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(190, 24, 93, 0.55)';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  const npores = Math.floor((rNuc * 2 * Math.PI) / 22);
  for (let p = 0; p < npores; p++) {
    const a = (p / npores) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * (rNuc + 3);
    const y1 = cy + Math.sin(a) * (rNuc + 3);
    const x2 = cx + Math.cos(a) * (rNuc - 8.5);
    const y2 = cy + Math.sin(a) * (rNuc - 8.5);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.42)';
    ctx.lineWidth = 1.7;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ============ 剖面控制器（几何精确版） ============ */

/* eslint-disable react-hooks/immutability -- renderer.clippingPlanes 为 three.js 全局渲染器命令式 API（R3F 标准用法） */
export function SectionClipController({
  enabled,
  depth,
  axis,
  spec,
  showAnatomy,
  sim,
  labels,
}: {
  enabled: boolean;
  /** 剖切深度 0-1（切平面从前缘 +R 线性扫到后缘 -R; 0.5 过球心） */
  depth: number;
  axis: SectionAxis;
  spec: CellBodySpec;
  /** 联动解剖标注开关（剖面结构标注） */
  showAnatomy: boolean;
  /** 模拟快照引用（广播 clipPlane → 分子标签层同步隐藏被剖掉的前半分子标签） */
  sim: { current: { clipPlane?: THREE.Plane | null } };
  /** 剖面结构标注文案（i18n） */
  labels: { nucleus: string; cytosol: string; membrane: string; section: string };
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  const R = spec.membraneR;
  const N = spec.nucleusR;

  const plane = useMemo(() => new THREE.Plane(SECTION_ORIENTS.front.normal.clone(), R * 0.35), []);
  const targetNormal = useRef(plane.normal.clone());
  const targetConstant = useRef(R * 0.35);
  const origSides = useRef<Map<THREE.Material, THREE.Side>>(new Map());
  const discGroupRef = useRef<THREE.Group | null>(null);
  const cytoDiscRef = useRef<THREE.Mesh | null>(null);
  const cytoRingRef = useRef<THREE.Mesh | null>(null);
  const nucDiscRef = useRef<THREE.Mesh | null>(null);
  const [ready, setReady] = useState(false);

  const cytoTex = useMemo(() => makeCytoplasmTexture(R), [R]);
  const nucTex = useMemo(() => makeNucleusTexture(N), [N]);
  useEffect(() => {
    if (!cytoTex || !nucTex) return;
    setReady(true);
    return () => {
      cytoTex.dispose();
      nucTex.dispose();
    };
  }, [cytoTex, nucTex]);

  /* 方位变化 → 目标法向（平滑过渡在 useFrame 中完成） */
  useEffect(() => {
    targetNormal.current.copy(SECTION_ORIENTS[axis].normal);
  }, [axis]);

  /* 深度 → 平面常数（+R 前缘 → -R 后缘, 0.5 过球心 = 最大剖面） */
  useEffect(() => {
    targetConstant.current = R - depth * 2 * R;
  }, [depth, R]);

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

  /* 帧驱动: 方位/深度与目标同步（即时贴合, 不阻尼）+ 双层盘几何同步 + clipPlane 广播
   * 几何: h = |constant|（切面到球心距离）
   *   细胞质盘 scale = √(R²-h²)/R   （剖切相交圆, 严格贴合）
   *   核盘     scale = √(N²-h²)/N   （h < N 才可见, 切面触核渐入）
   *   盘组位置 = -constant·normal + normal·0.035（切面中心 + 保留侧微偏移）
   * 同步性: 信号贴面投影(layout)使用同一目标平面 → 平面/剖面盘/分子三者零漂移,
   *   拖动剖深滑杆时分子即时贴附新切面, 不出现"分子先跳、切面慢追"的裁切空窗 */
  useFrame(() => {
    plane.normal.copy(targetNormal.current).normalize();
    plane.constant = targetConstant.current;

    const h = Math.abs(plane.constant);

    // 剖面双层盘位姿: 切面中心 + 保留侧偏移
    if (discGroupRef.current) {
      discGroupRef.current.position
        .copy(plane.normal)
        .multiplyScalar(-plane.constant + 0.035);
      discGroupRef.current.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        plane.normal,
      );

      // 细胞质盘: 相交圆半径 √(R²-h²)
      const rc = h < R ? Math.sqrt(R * R - h * h) : 0;
      const cytoScale = Math.max(0.001, rc / R);
      if (cytoDiscRef.current) cytoDiscRef.current.scale.setScalar(cytoScale);
      if (cytoRingRef.current) cytoRingRef.current.scale.setScalar(cytoScale);
      const discVisible = rc > R * 0.08;
      if (cytoDiscRef.current) cytoDiscRef.current.visible = discVisible;
      if (cytoRingRef.current) cytoRingRef.current.visible = discVisible;

      // 核盘: 相交圆半径 √(N²-h²), h < N 时渐入
      const rn = h < N ? Math.sqrt(N * N - h * h) : 0;
      if (nucDiscRef.current) {
        nucDiscRef.current.scale.setScalar(Math.max(0.001, rn / N));
        nucDiscRef.current.visible = rn > N * 0.12;
      }
    }
    // 广播裁剪平面（分子标签层读取; 关闭时置 null）
    sim.current.clipPlane = enabled ? plane : null;
  });

  const annos = useMemo(
    () => [
      { local: [0, 0.06, 0.14], text: labels.nucleus, show: true },
      { local: [0.58, 0.34, 0], text: labels.cytosol, show: true },
      { local: [1.0, 0.18, 0], text: labels.membrane, show: true },
    ],
    [labels],
  );

  return (
    <>
      {enabled && ready && cytoTex && nucTex && (
        <group ref={discGroupRef}>
          {/* 细胞质剖面填充盘（相交圆半径动态缩放; 纯视觉 —— 禁用 raycast,
              否则会截获点击便既不选中分子也不触发 onPointerMissed 取消选中） */}
          <mesh ref={cytoDiscRef} renderOrder={96} raycast={() => null}>
            <circleGeometry args={[R, 96]} />
            <meshBasicMaterial
              map={cytoTex}
              transparent
              opacity={0.94}
              side={THREE.DoubleSide}
              depthWrite={false}
              fog={false}
              polygonOffset
              polygonOffsetFactor={-4}
            />
          </mesh>
          {/* 剖面发光边缘（切割亮线, 随相交圆缩放; 纯视觉 —— 不参与拾取） */}
          <mesh ref={cytoRingRef} renderOrder={97} raycast={() => null}>
            <ringGeometry args={[R - 0.12, R, 96]} />
            <meshBasicMaterial color="#5eead4" transparent opacity={0.65} side={THREE.DoubleSide} depthWrite={false} fog={false} />
          </mesh>
          {/* 核剖面盘（切面触核后渐入, 半径 √(N²-h²); 纯视觉 —— 不参与拾取） */}
          <mesh ref={nucDiscRef} renderOrder={98} raycast={() => null}>
            <circleGeometry args={[N, 64]} />
            <meshBasicMaterial
              map={nucTex}
              transparent
              opacity={0.97}
              side={THREE.DoubleSide}
              depthWrite={false}
              fog={false}
              polygonOffset
              polygonOffsetFactor={-6}
            />
          </mesh>
          {/* 剖面结构标注（联动解剖标注开关） */}
          {showAnatomy &&
            annos.map((a) => (
              <Html
                key={a.text}
                position={[a.local[0] * R, a.local[1] * R, a.local[2]]}
                center
                zIndexRange={[30, 0]}
                pointerEvents="none"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                <div className="mol3d-label is-active section-anno" style={{ whiteSpace: 'nowrap' }}>
                  <span className="mol3d-sym">{a.text}</span>
                </div>
              </Html>
            ))}
        </group>
      )}
    </>
  );
}
