'use client';

/**
 * 3D 细胞体高精度建模器 v2 —— 完全重构（建模 + 贴图路线）
 * 相比 v1（基础球/胶囊/圆环拼装）的升级:
 *   1. 高多边形基础形体 + 3D FBM 顶点位移 → 有机不规则形（无完美几何感）
 *   2. 程序化法线/粗糙度贴图（textures.ts）→ 微观起伏细节
 *   3. MeshPhysicalMaterial: transmission 折射（湿润透光膜质）+ iridescence 虹彩 + sheen
 *   4. GLSL 有机流光注入（materials.ts）→ 活体膜微光流动
 *   5. 细胞器精雕:
 *      - 核孔复合体: 胞质环 + 核质环 + 中央栓 + 核篮（八重对称近似）
 *      - 染色质: 外周异染色质（边集化, 符合真实核型）+ 常染色质纤维 + 核仁（纤维中心 + 颗粒组分）
 *      - 线粒体: 长条豆状外膜（2.9:1, 对应 2D 椭圆形态语言）+ 12 条低频波浪板层嵴 + 嵴膜 ATP 合酶发光点
 *      - RER: 核旁连续囊池网 + 连接管 + 膜旁核糖体 + 游离多聚核糖体
 *      - 高尔基: 顺→反 5 池梯度（非线性顶点色极性, 层叠扁平囊剪影）+ 反面出芽囊泡 + 顺面运输小泡
 *      - 细胞骨架: 中心体放射微管（原纤维条纹法线）+ 皮层肌动蛋白网 + 中间丝（波形蛋白笼）
 *      - 胞外悬浮微粒（浸没感）+ 脂双层流动镶嵌（缓慢对流, 逐实例色相微差）
 *   6. 精细度补强（v3）:
 *      - 溶酶体（酸性琥珀体 + 腔内水解酶颗粒）/ 过氧化物酶体（尿酸氧化酶晶核）/ 脂滴（中性脂金滴）
 *      - 糖萼（胞外多糖绒被）+ 网格蛋白衣被小窝（胞质面刺突穹窿）
 *      - mtDNA 核样体（线粒体基质亮斑）+ 核孔复合体胞质丝（出核 mRNA 对接轨）
 *      - 核糖体大小亚基哑铃形 + 跨膜蛋白 3 螺旋束（多次跨膜剪影）
 *   7. 形态学差异化 v4（cell-shape.ts 类型化形状函数为唯一真源）:
 *      - 质膜几何按细胞类型成形: 肝多边形圆角立方 / 神经元锥体 / T 球形 / 上皮柱状 / 心肌杆状 / 成纤维梭形 / 癌变形虫样
 *      - 类型特化结构: 心肌肌原纤维束（肌节 A/I 带 + Z 线顶点色横纹）+ 闰盘（阶梯盘 + Cx43 金点）
 *        神经元顶端树突丛 + 上皮顶端极性微绒毛 + 基底膜 / 成纤维应力纤维（α-SMA 束 + 黏着斑）
 *        T 细胞表面微褶皱 / 肝胆小管（微绒毛环 + 胆汁微粒）
 *      - 全部表面贴附结构（脂双层/跨膜蛋白/糖萼/小窝/微绒毛/出芽/紧密连接）经 cellSurf 严格贴合类型化膜面
 * 科学参照: Alberts MBoC 6th / Karp Cell & Molecular Biology 9th / cellimagelibrary
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { CellBodySpec, Vec3 } from '@/lib/simulation/layout3d';
import { NUCLEUS_FORM, SHAPE_NOISE, nucleusCenter, nucleusRadius, nucleusRayExit, shapeRadius, type ShapeKind } from '@/lib/simulation/cell-shape';
import { displaceGeometry, fbm3, fibSphere, hash01, mergeGeoms, sph } from './procedural';
import { glowSpriteTexture, organicNormalMap, roughnessMap, speckleNormalMap, stripeNormalMap } from './textures';
import { createTimeUniform, glowMaterial, organelleMaterial, type TimeUniform } from './materials';
import { useLang } from '@/lib/i18n';

export interface AnatomyLabel {
  pos: Vec3;
  zh: string;
  latin: string;
}

export interface CellBodyBuild {
  group: THREE.Group;
  update: (t: number) => void;
  labels: AnatomyLabel[];
  dispose: () => void;
}

/* ============ 类型化细胞体几何（v4 —— 形态学差异化） ============ */

/** 质膜几何: 类型形状函数（cell-shape.ts 唯一真源）+ 类型化 FBM 有机噪声 */
function shapedCellGeometry(R: number, detail: number, shape: ShapeKind): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(R, detail);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const { freq, amp } = SHAPE_NOISE[shape];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const base = shapeRadius(v, shape, R);
    const d = (fbm3(v.x * freq, v.y * freq, v.z * freq, 3, 3) - 0.5) * 2 * amp;
    v.multiplyScalar(base + d);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** 表面半径（类型形状 + FBM）——质膜全部表面贴附结构（脂双层/跨膜蛋白/糖萼/小窝/微绒毛/出芽）
 *  的唯一对齐基准; offset 正值外移（胞外）负值内移（胞质面） */
function cellSurf(dir: THREE.Vector3, R: number, shape: ShapeKind, offset = 0): number {
  const { freq, amp } = SHAPE_NOISE[shape];
  const d = dir.clone().normalize();
  const noise = (fbm3(d.x * freq, d.y * freq, d.z * freq, 3, 3) - 0.5) * 2 * amp;
  return shapeRadius(d, shape, R) + noise + offset;
}

/* ============ 位移球体（细胞器有机轮廓, 保持球状基底） ============ */

function displacedSphere(R: number, detail: number, freq: number, amp: number, seed: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(R, detail);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const d = (fbm3(v.x * freq, v.y * freq, v.z * freq, 3, seed) - 0.5) * 2 * amp;
    v.multiplyScalar(R + d);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** 类型化核几何（v6 —— 核椭球×分叶×FBM; inset 为平行内缩, 负值向外） */
function shapedNucleusGeometry(
  N: number, detail: number, shape: ShapeKind, freq: number, amp: number, seed: number, inset = 0,
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const d = (fbm3(v.x * freq, v.y * freq, v.z * freq, 3, seed) - 0.5) * 2 * amp;
    v.multiplyScalar(Math.max(0.05, nucleusRadius(v, shape, N) + d + inset));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** 方向 dir 处的细胞器表面半径（位移场, 球状基底） */
function surf(dir: THREE.Vector3, R: number, freq: number, amp: number, seed: number): number {
  return R + (fbm3(dir.x * freq, dir.y * freq, dir.z * freq, 3, seed) - 0.5) * 2 * amp;
}

/* ============ 主构建 ============ */

export function buildCellBody(spec: CellBodySpec, tint: string, dim: number, perf = false): CellBodyBuild {
  const group = new THREE.Group();
  const R = spec.membraneR;
  const N = spec.nucleusR;
  const q = perf ? 0.45 : 1; // 实例数量缩放
  const detail = perf ? 3 : 4;
  const transOn = !perf; // 低端设备禁用折射

  const uTime: TimeUniform = createTimeUniform();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T): T => {
    disposables.push(o);
    return o;
  };
  const labels: AnatomyLabel[] = [];

  // 共享贴图（模块缓存, 不随 dispose 释放）
  const memNormal = organicNormalMap({ freq: 7, strength: 2.2, seed: 11, repeat: 4 });
  const memRough = roughnessMap({ base: 0.38, variance: 0.3, seed: 21, repeat: 3 });
  const orgNormal = organicNormalMap({ freq: 5, strength: 2.6, seed: 47, repeat: 3 });
  const coatNormal = speckleNormalMap({ count: 260, radius: 0.018, strength: 2.1, seed: 31, repeat: 2 });
  const mtStripe = stripeNormalMap({ size: 64, stripes: 13, width: 0.3, strength: 2.2, dir: 'y', repeat: 1 });
  const collagenStripe = stripeNormalMap({ size: 128, stripes: 6, width: 0.34, strength: 3.0, dir: 'x', seed: 9, repeat: 3 });

  const mat = (opts: Parameters<typeof organelleMaterial>[0]) => track(organelleMaterial({ uTime, dim, ...opts }));

  /* ================= 质膜（类型化形状 v4） ================= */
  const SHAPE = spec.shape;
  const membraneGroup = new THREE.Group();
  group.add(membraneGroup);

  const membraneGeo = track(shapedCellGeometry(R, detail, SHAPE));
  const membraneMat = mat({
    color: tint,
    transmission: transOn ? 0.58 : 0,
    thickness: 1.6,
    roughness: 0.36,
    roughnessMap: memRough,
    normalMap: memNormal,
    normalScale: 0.55,
    clearcoat: 0.55,
    clearcoatRoughness: 0.3,
    iridescence: 0.32,
    sheen: 0.5,
    sheenColor: '#99f6e4',
    flow: { color: '#2dd4bf', strength: 0.14, scale: 0.3, speed: 0.05, rim: 0.26 },
  });
  const membrane = new THREE.Mesh(membraneGeo, membraneMat);
  membrane.renderOrder = 80;
  membraneGroup.add(membrane);

  // 外缘呼吸辉光壳（v6: 随类型化膜面轮廓 —— 旧球壳会在杆状/梭状/柱状窄轴处凸出成"圆球轮廓"）
  const glowGeo = track(shapedCellGeometry(R * 1.075, perf ? 2 : 3, SHAPE));
  const glow = new THREE.Mesh(glowGeo, track(glowMaterial(tint, 0.05 * dim)));
  glow.renderOrder = 70;
  membraneGroup.add(glow);

  // 脂双层脂头（外叶/内叶, 缓慢对流 = 膜流动性）
  const headGeo = track(new THREE.SphereGeometry(0.078, 8, 6));
  const headCount = Math.round(860 * q);
  const makeLeaflet = (offset: number, opacity: number, emissive: string, tints: string[]) => {
    const m = track(new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive,
      emissiveIntensity: 0.42 * dim,
      transparent: true,
      opacity: opacity * dim,
      depthWrite: false,
    }));
    const inst = new THREE.InstancedMesh(headGeo, m, headCount);
    const mm = new THREE.Matrix4();
    const dir = new THREE.Vector3();
    const c = new THREE.Color();
    fibSphere(headCount, 1).forEach((p, i) => {
      dir.set(p.x, p.y, p.z).normalize();
      const r = cellSurf(dir, R, SHAPE, offset);
      const s = 0.75 + hash01(`lh${i}`, Math.round(offset * 100)) * 0.55;
      mm.makeScale(s, s, s);
      mm.setPosition(dir.x * r, dir.y * r, dir.z * r);
      inst.setMatrixAt(i, mm);
      // 逐实例脂头色相微差（磷脂/鞘脂/胆固醇混合嵌镶的真实膜读感）
      inst.setColorAt(i, c.set(tints[i % tints.length]).multiplyScalar(0.82 + hash01(`lhc${i}`) * 0.3));
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.renderOrder = 60;
    return inst;
  };
  const outerLeaflet = makeLeaflet(0.05, 0.72, '#14b8a6', ['#5eead4', '#2dd4bf', '#99f6e4', '#4fd1c5']);
  const innerLeaflet = makeLeaflet(-0.05, 0.55, '#115e59', ['#0f766e', '#115e59', '#134e4a']);
  membraneGroup.add(outerLeaflet, innerLeaflet);

  // 跨膜蛋白（多次跨膜 α-螺旋束 —— 3 螺旋三角排布, GPCR/转运体跨膜区剪影, 嵌于脂双层）
  const tmpGeo = track(
    mergeGeoms([
      { geo: track(new THREE.CapsuleGeometry(0.03, 0.48, 4, 8)), matrix: new THREE.Matrix4().makeTranslation(0.05, 0, 0) },
      { geo: track(new THREE.CapsuleGeometry(0.03, 0.54, 4, 8)), matrix: new THREE.Matrix4().makeTranslation(-0.032, 0, 0.043) },
      { geo: track(new THREE.CapsuleGeometry(0.03, 0.44, 4, 8)), matrix: new THREE.Matrix4().makeTranslation(-0.032, 0, -0.043) },
    ]),
  );
  const tmpMat = track(new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#0d9488',
    emissiveIntensity: 0.3 * dim,
    roughness: 0.5,
    transparent: true,
    opacity: 0.85 * dim,
    depthWrite: false,
  }));
  const tmpCount = Math.round(64 * q);
  const tmps = new THREE.InstancedMesh(tmpGeo, tmpMat, tmpCount);
  {
    const mm = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    const c = new THREE.Color();
    const palette = ['#2dd4bf', '#fbbf24', '#f472b6', '#5eead4'];
    fibSphere(tmpCount, 1).forEach((p, i) => {
      dir.set(p.x, p.y, p.z).normalize();
      const r = cellSurf(dir, R, SHAPE, 0.02);
      qq.setFromUnitVectors(up, dir);
      const s = 0.8 + hash01(`tp${i}`) * 0.5;
      mm.compose(new THREE.Vector3(dir.x * r, dir.y * r, dir.z * r), qq, new THREE.Vector3(s, s, s));
      tmps.setMatrixAt(i, mm);
      tmps.setColorAt(i, c.set(palette[i % palette.length]).multiplyScalar(0.9));
    });
    tmps.instanceMatrix.needsUpdate = true;
    if (tmps.instanceColor) tmps.instanceColor.needsUpdate = true;
    tmps.renderOrder = 58;
    membraneGroup.add(tmps);
  }
  labels.push({ pos: sph(R * 1.14, 0.62, 0.4), zh: '质膜（脂双层）', latin: 'Plasma membrane' });

  // 糖萼（胞外多糖-糖蛋白绒被 —— 真实细胞表面的 fuzzy coat; 随膜流动缓转）
  {
    const gcGeo = track(new THREE.CapsuleGeometry(0.012, 0.2, 3, 5));
    const gcMat = track(new THREE.MeshStandardMaterial({
      color: '#99f6e4',
      emissive: '#14b8a6',
      emissiveIntensity: 0.22 * dim,
      transparent: true,
      opacity: 0.32 * dim,
      depthWrite: false,
    }));
    const gcCount = Math.round(300 * q) + 40;
    const gc = new THREE.InstancedMesh(gcGeo, gcMat, gcCount);
    {
      const mm = new THREE.Matrix4();
      const qq = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const dir = new THREE.Vector3();
      fibSphere(gcCount, 1).forEach((p, i) => {
        dir.set(p.x, p.y, p.z).normalize();
        const r = cellSurf(dir, R, SHAPE, 0.17);
        qq.setFromUnitVectors(up, dir);
        const s = 0.6 + hash01(`gc${i}`) * 0.85;
        mm.compose(new THREE.Vector3(dir.x * r, dir.y * r, dir.z * r), qq, new THREE.Vector3(1, s, 1));
        gc.setMatrixAt(i, mm);
      });
      gc.instanceMatrix.needsUpdate = true;
      gc.renderOrder = 62;
    }
    membraneGroup.add(gc);
    labels.push({ pos: sph(R * 1.3, 1.78, 1.1), zh: '糖萼（多糖绒被）', latin: 'Glycocalyx' });
  }

  // 网格蛋白衣被小窝（质膜胞质面内吞点位 —— 穹窿 + 刺突衣被剪影; 低端设备省略）
  if (!perf) {
    const dome = track(new THREE.SphereGeometry(0.3, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.52));
    dome.scale(1, 0.62, 1);
    const spikeParts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [{ geo: dome }];
    const spikeN = 14;
    const sq = new THREE.Quaternion();
    const su = new THREE.Vector3(0, 1, 0);
    for (let s = 0; s < spikeN; s++) {
      const phi = 0.18 + (s % 7) * 0.2;
      const theta = (s / 7) * Math.PI * 2 + (s % 2) * 0.5;
      const sd = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta),
      );
      const spike = track(new THREE.ConeGeometry(0.026, 0.15, 5));
      sq.setFromUnitVectors(su, sd);
      spikeParts.push({
        geo: spike,
        matrix: new THREE.Matrix4().compose(sd.clone().multiplyScalar(0.33), sq.clone(), new THREE.Vector3(1, 1, 1)),
      });
    }
    const pitGeo = track(mergeGeoms(spikeParts));
    const pitMat = mat({
      color: '#fbbf24',
      emissive: '#b45309',
      emissiveIntensity: 0.3,
      roughness: 0.4,
      normalMap: coatNormal,
      normalScale: 1.1,
      opacity: 0.8,
      clearcoat: 0.3,
    });
    const pitN = 4;
    const pits = new THREE.InstancedMesh(pitGeo, pitMat, pitN);
    {
      const mm = new THREE.Matrix4();
      const qq = new THREE.Quaternion();
      const spin = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const dir = new THREE.Vector3();
      for (let i = 0; i < pitN; i++) {
        dir.setFromSphericalCoords(1, Math.acos((hash01(`cp${i}`, 3) - 0.5) * 2.2), hash01(`cp${i}`, 5) * Math.PI * 2);
        const r = cellSurf(dir, R, SHAPE, 0.02);
        qq.setFromUnitVectors(up, dir.clone().negate()); // 穹窿朝胞质内凹（内吞出芽位形）
        spin.setFromAxisAngle(dir, hash01(`cps${i}`) * Math.PI * 2);
        qq.premultiply(spin);
        const s = 0.9 + hash01(`cpx${i}`) * 0.4;
        mm.compose(new THREE.Vector3(dir.x * r, dir.y * r, dir.z * r), qq, new THREE.Vector3(s, 1, s));
        pits.setMatrixAt(i, mm);
      }
      pits.instanceMatrix.needsUpdate = true;
      pits.renderOrder = 59;
    }
    membraneGroup.add(pits);
  }

  /* ================= 核被膜（双层 + 核孔复合体） ================= */
  const NUC_FREQ = 1.5;
  const nucAmp = spec.nucleusBumpy ? 0.24 : 0.07;
  /* ---- 核形状体系 v6（cell-shape.ts 唯一真源: 椭球×分叶×偏移） ---- */
  const nucC = (() => {
    const c = nucleusCenter(SHAPE, R);
    return new THREE.Vector3(c.x, c.y, c.z);
  })();
  /** 核面半径（含 FBM 局部起伏; ofs 正外负内） */
  const nucSurf = (dir: THREE.Vector3, ofs = 0): number => {
    const d = dir.clone().normalize();
    return nucleusRadius(d, SHAPE, N) + (fbm3(d.x * NUC_FREQ, d.y * NUC_FREQ, d.z * NUC_FREQ, 3, 7) - 0.5) * 2 * nucAmp + ofs;
  };
  /** 核面上世界坐标点（含核中心偏移） */
  const nucPoint = (dir: THREE.Vector3, ofs = 0): THREE.Vector3 => {
    const d = dir.clone().normalize();
    const r = Math.max(0.1, nucSurf(d, ofs));
    return new THREE.Vector3(nucC.x + d.x * r, nucC.y + d.y * r, nucC.z + d.z * r);
  };
  /** 核内世界坐标点（frac ∈ 0..核面, 沿 dir 自核中心） */
  const nucInnerPoint = (dir: THREE.Vector3, frac: number): THREE.Vector3 => {
    const d = dir.clone().normalize();
    const r = Math.max(0.1, nucleusRadius(d, SHAPE, N) * Math.min(1, Math.max(0, frac)) - 0.25);
    return new THREE.Vector3(nucC.x + d.x * r, nucC.y + d.y * r, nucC.z + d.z * r);
  };
  /** 射线自细胞中心沿 dir 的核占用边界（体内采样避核基准） */
  const nucExit = (dir: THREE.Vector3): number => nucleusRayExit(dir, SHAPE, N, R);
  /** 类型化体内采样: dir 方向在 [核边界+pad+r, 膜面-(r+0.35)] 区间按 frac 插值（0=贴核, 1=贴膜）。
   *  杆状/梭状/柱状窄轴处自动收缩、长轴端自动延展 —— 细胞器永远在真实形状体内。
   *  挤压方向（核几乎贴膜, 如神经元顶区/梭形尖端/上皮基底极）: 硬钳至膜面内 —— 宁可轻擦核面也不穿膜 */
  const insidePos = (dir: THREE.Vector3, frac: number, r = 0.4, pad = 0.5): THREE.Vector3 => {
    const d = dir.clone().normalize();
    const outer = cellSurf(d, R, SHAPE, -Math.max(0.3, r + 0.35));
    const lo = nucExit(d) + pad + r;
    const hi = Math.max(lo + 0.25, outer);
    const t = Math.min(lo + (hi - lo) * Math.min(1, Math.max(0, frac)), outer);
    return new THREE.Vector3(d.x * t, d.y * t, d.z * t);
  };
  const nucMat = mat({
    color: '#fb7185',
    transmission: transOn ? 0.42 : 0,
    thickness: 0.9,
    roughness: 0.3,
    normalMap: orgNormal,
    normalScale: 0.4,
    clearcoat: 0.35,
    sheen: 0.4,
    sheenColor: '#fecdd3',
    opacity: transOn ? 1 : 0.4,
    flow: { color: '#fb7185', strength: 0.12, scale: 0.5, speed: 0.04, rim: 0.3 },
  });
  const nucOuterGeo = track(shapedNucleusGeometry(N, detail, SHAPE, NUC_FREQ, nucAmp, 7));
  const nucOuter = new THREE.Mesh(nucOuterGeo, nucMat);
  nucOuter.position.copy(nucC);
  nucOuter.renderOrder = 50;
  const nucInner = new THREE.Mesh(track(shapedNucleusGeometry(N, detail - 1, SHAPE, NUC_FREQ, nucAmp, 7, -0.22)), nucMat);
  nucInner.position.copy(nucC);
  nucInner.renderOrder = 50;
  group.add(nucOuter, nucInner);

  const nucleoplasm = new THREE.Mesh(
    track(shapedNucleusGeometry(N, 3, SHAPE, NUC_FREQ, nucAmp, 7, -0.26)),
    track(new THREE.MeshBasicMaterial({ color: '#881337', transparent: true, opacity: 0.12 * dim, depthWrite: false })),
  );
  nucleoplasm.position.copy(nucC);
  nucleoplasm.renderOrder = 40;
  group.add(nucleoplasm);

  // 核孔复合体: 胞质环 + 核质环 + 中央栓 + 核篮（四部件共享实例矩阵）
  const npcParts: THREE.InstancedMesh[] = [];
  {
    const npcMat = mat({
      color: '#e2e8f0',
      emissive: '#94a3b8',
      emissiveIntensity: 0.32,
      roughness: 0.35,
      metalness: 0.1,
      opacity: 0.92,
    });
    const cytoRing = track(new THREE.TorusGeometry(0.165, 0.05, 10, 24));
    cytoRing.translate(0, 0, 0.13);
    const nucRing = track(new THREE.TorusGeometry(0.15, 0.046, 10, 24));
    nucRing.translate(0, 0, -0.13);
    const plug = track(new THREE.CylinderGeometry(0.082, 0.082, 0.44, 12));
    plug.rotateX(Math.PI / 2);
    const basket = track(new THREE.ConeGeometry(0.1, 0.15, 12, 1, true));
    basket.rotateX(Math.PI / 2);
    basket.translate(0, 0, -0.24);
    const geos = perf ? [cytoRing, nucRing, plug] : [cytoRing, nucRing, plug, basket];
    const count = Math.round(60 * q) + 4;
    const mm = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);
    const dir = new THREE.Vector3();
    const mats: THREE.Matrix4[] = [];
    fibSphere(count, 1).forEach((p, i) => {
      dir.set(p.x, p.y, p.z).normalize();
      const r = nucSurf(dir, 0.02);
      qq.setFromUnitVectors(zAxis, dir);
      const s = (0.95 + hash01(`npc${i}`) * 0.25) * 1.15;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(nucC.x + dir.x * r, nucC.y + dir.y * r, nucC.z + dir.z * r), qq, new THREE.Vector3(s, s, s));
      mats.push(m);
    });
    for (const g of geos) {
      const inst = new THREE.InstancedMesh(g, npcMat, mats.length);
      mats.forEach((m, i) => inst.setMatrixAt(i, m));
      inst.instanceMatrix.needsUpdate = true;
      inst.renderOrder = 55;
      group.add(inst);
      npcParts.push(inst);
    }
    // 胞质丝（NPC 胞质面 8 根柔性丝 —— 出核 mRNA/货物对接轨; 低端设备省略）
    if (!perf) {
      const filGeo = track(new THREE.CapsuleGeometry(0.011, 0.26, 3, 5));
      const filMat = track(new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        emissive: '#64748b',
        emissiveIntensity: 0.22 * dim,
        transparent: true,
        opacity: 0.5 * dim,
        depthWrite: false,
      }));
      const filN = 8;
      const fil = new THREE.InstancedMesh(filGeo, filMat, mats.length * filN);
      const fm = new THREE.Matrix4();
      const up = new THREE.Vector3(0, 1, 0);
      let fi = 0;
      mats.forEach((npcM, i) => {
        for (let f = 0; f < filN; f++) {
          const ang = (f / filN) * Math.PI * 2 + hash01(`nf${i}${f}`) * 0.6;
          const tilt = 0.6 + hash01(`nft${i}${f}`) * 0.3; // ~34°-51° 外倾
          const localDir = new THREE.Vector3(
            Math.sin(tilt) * Math.cos(ang),
            Math.sin(tilt) * Math.sin(ang),
            Math.cos(tilt),
          );
          const fq = new THREE.Quaternion().setFromUnitVectors(up, localDir);
          const local = new THREE.Matrix4().compose(
            localDir.clone().multiplyScalar(0.3).add(new THREE.Vector3(0, 0, 0.12)),
            fq,
            new THREE.Vector3(1, 1, 1),
          );
          fm.multiplyMatrices(npcM, local);
          fil.setMatrixAt(fi, fm);
          fi++;
        }
      });
      fil.instanceMatrix.needsUpdate = true;
      fil.renderOrder = 54;
      group.add(fil);
    }
  }
  labels.push({ pos: nucPoint(new THREE.Vector3(Math.cos(0.35) * Math.cos(1.9), Math.sin(0.35), Math.cos(0.35) * Math.sin(1.9)), 0.42), zh: '核孔复合体', latin: 'Nuclear pore complex' });
  {
    const topP = nucPoint(new THREE.Vector3(0, 1, 0), 0.2);
    labels.push({ pos: { x: topP.x, y: topP.y + 0.55, z: topP.z }, zh: '核被膜（双层）', latin: 'Nuclear envelope' });
  }

  /* ================= 染色质 + 核仁 ================= */
  // 外周异染色质（致密, 贴内层核膜 —— 真实核型边集化）
  const heteroGeo = track(new THREE.SphereGeometry(0.068, 7, 6));
  const heteroMat = mat({ color: '#be3f68', emissive: '#9d174d', emissiveIntensity: 0.5, roughness: 0.6, opacity: 0.72 });
  {
    const clumps = Math.round(24 * q) + 6;
    const beads: THREE.Matrix4[] = [];
    const mm = new THREE.Matrix4();
    const off = new THREE.Vector3();
    for (let c = 0; c < clumps; c++) {
      const lat = (hash01(`hc${c}`) - 0.5) * 2.6;
      const lon = hash01(`hc${c}`, 3) * Math.PI * 2;
      const cp = nucPoint(new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)), -0.34);
      const beadsPer = 6 + Math.floor(hash01(`hc${c}`, 7) * 4);
      for (let b = 0; b < beadsPer; b++) {
        off.set(hash01(`hb${c}${b}`) - 0.5, hash01(`hb${c}${b}`, 3) - 0.5, hash01(`hb${c}${b}`, 5) - 0.5).normalize().multiplyScalar(0.09 + hash01(`hb${c}${b}`, 9) * 0.13);
        const s = 0.7 + hash01(`hb${c}${b}`, 11) * 0.8;
        mm.makeScale(s, s, s);
        mm.setPosition(cp.x + off.x, cp.y + off.y, cp.z + off.z);
        beads.push(mm.clone());
      }
    }
    const inst = new THREE.InstancedMesh(heteroGeo, heteroMat, beads.length);
    beads.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 48;
    group.add(inst);
  }

  // 常染色质纤维（伸展活跃区）
  {
    const fibers = Math.round(16 * q) + 4;
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    for (let i = 0; i < fibers; i++) {
      const pts: THREE.Vector3[] = [];
      const startDir = new THREE.Vector3(
        Math.cos((hash01(`ec${i}`) - 0.5) * 2.4) * Math.cos(hash01(`ec${i}`, 3) * Math.PI * 2),
        Math.sin((hash01(`ec${i}`) - 0.5) * 2.4),
        Math.cos((hash01(`ec${i}`) - 0.5) * 2.4) * Math.sin(hash01(`ec${i}`, 3) * Math.PI * 2),
      ).normalize();
      const start = nucInnerPoint(startDir, 0.72);
      for (let k = 0; k < 5; k++) {
        const wDir = new THREE.Vector3(
          Math.cos((hash01(`ec${i}${k}`, 3) - 0.5) * 2.6) * Math.cos(hash01(`ec${i}${k}`, 7) * Math.PI * 2),
          Math.sin((hash01(`ec${i}${k}`, 3) - 0.5) * 2.6),
          Math.cos((hash01(`ec${i}${k}`, 3) - 0.5) * 2.6) * Math.sin(hash01(`ec${i}${k}`, 7) * Math.PI * 2),
        ).normalize();
        const p = nucInnerPoint(wDir, 0.2 + hash01(`ec${i}${k}`) * 0.68);
        pts.push(new THREE.Vector3(p.x, p.y, p.z));
      }
      pts[0].set(start.x, start.y, start.z);
      const r = 0.03 + hash01(`ecr${i}`) * 0.022;
      parts.push({ geo: track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, r, 6)) });
    }
    const euch = new THREE.Mesh(track(mergeGeoms(parts)), mat({
      color: '#f9a8d4',
      emissive: '#be185d',
      emissiveIntensity: 0.28,
      opacity: 0.34,
      sheen: 0.5,
      sheenColor: '#fbcfe8',
    }));
    euch.renderOrder = 42;
    group.add(euch);
  }

  // 核仁: 纤维中心核心 + 颗粒组分外壳
  const nucleoli: THREE.Mesh[] = [];
  const nucleolusSpeckles: THREE.InstancedMesh[] = [];
  for (let i = 0; i < spec.nucleolus.count; i++) {
    const r0 = spec.nucleolus.r * (1 - i * 0.22);
    // 核仁置于核内（v6: 随核形状/偏移; 杆状核内沿长轴展开）
    const center = nucInnerPoint(
      new THREE.Vector3(
        Math.cos(i * 0.7 - 0.3) * Math.cos(i * 2.4 + 0.8),
        Math.sin(i * 0.7 - 0.3),
        Math.cos(i * 0.7 - 0.3) * Math.sin(i * 2.4 + 0.8),
      ).normalize(),
      0.34,
    );
    const coreGeo = track(displacedSphere(r0, 3, 2.4, r0 * 0.09, 13));
    const core = new THREE.Mesh(coreGeo, mat({
      color: '#fb7185',
      emissive: '#be123c',
      emissiveIntensity: 0.55,
      roughness: 0.55,
      opacity: 0.9,
      clearcoat: 0.25,
    }));
    core.position.set(center.x, center.y, center.z);
    core.renderOrder = 45;
    group.add(core);
    nucleoli.push(core);
    // 颗粒组分: 表面 RNA 颗粒
    const spkGeo = track(new THREE.SphereGeometry(0.032, 5, 5));
    const spkCount = Math.round(56 * q) + 8;
    const spk = new THREE.InstancedMesh(spkGeo, mat({ color: '#fda4af', emissive: '#e11d48', emissiveIntensity: 0.4, opacity: 0.8 }), spkCount);
    {
      const mm = new THREE.Matrix4();
      const dir = new THREE.Vector3();
      fibSphere(spkCount, 1).forEach((p, k) => {
        dir.set(p.x, p.y, p.z).normalize();
        const rr = r0 * 1.22;
        mm.makeScale(0.7 + hash01(`ns${i}${k}`) * 0.7, 0.7 + hash01(`ns${i}${k}`) * 0.7, 0.7 + hash01(`ns${i}${k}`) * 0.7);
        mm.setPosition(center.x + dir.x * rr, center.y + dir.y * rr, center.z + dir.z * rr);
        spk.setMatrixAt(k, mm);
      });
      spk.instanceMatrix.needsUpdate = true;
      spk.renderOrder = 46;
    }
    group.add(spk);
    nucleolusSpeckles.push(spk);
  }
  const n0 = nucleoli[0].position;
  labels.push({ pos: { x: n0.x + (n0.x - nucC.x) * 0.7, y: n0.y + 0.62, z: n0.z }, zh: '核仁', latin: 'Nucleolus' });
  labels.push({ pos: nucPoint(new THREE.Vector3(Math.cos(-1.0) * Math.cos(2.2), Math.sin(-1.0), Math.cos(-1.0) * Math.sin(2.2)), -0.1), zh: '异染色质（边集）', latin: 'Heterochromatin' });

  /* ================= 线粒体（双膜 + 板层嵴 + ATP 合酶） ================= */
  const mitos: { obj: THREE.Group; baseY: number; phase: number }[] = [];
  const mitoCount = perf ? Math.max(4, Math.round(spec.mitoCount * 0.6)) : spec.mitoCount;
  // 板层嵴 12 条（perf 7）: x 槽位拉开 + 低波形频率 → "板层"读感更强
  const cristaeN = perf ? 7 : 12;
  // 外膜: 总长 2.3 / 半径 0.4 ≈ 2.9:1 长条豆状（对应 2D Mitochondrion 椭圆 rx54/ry22 ≈ 2.45:1）
  // FBM 幅度 0.045 → 0.028: 保留有机感但轮廓明确为豆状（旧幅度会把胶囊"泡圆"）
  const mitoOuterGeo = track(displaceGeometry(new THREE.CapsuleGeometry(0.4, 1.5, 10, 24), 2.6, 0.028, 17));
  const mitoOuterMat = mat({
    color: '#0e8f6f',
    transmission: transOn ? 0.34 : 0, // 降低透射避免外形"洗白", 豆状轮廓更实
    thickness: 0.7,
    roughness: 0.3,
    normalMap: orgNormal,
    normalScale: 0.5,
    clearcoat: 0.35,
    emissive: '#065f46',
    emissiveIntensity: 0.36,
    opacity: transOn ? 1 : 0.45,
    flow: { color: '#34d399', strength: 0.32, scale: 1.7, speed: 0.13, rim: 0.42 },
  });
  const mitoMatrixMat = mat({ color: '#064e3b', emissive: '#022c22', emissiveIntensity: 0.25, opacity: 0.3 });
  const cristaeMat = mat({
    color: '#99f6e4',
    emissive: '#5eead4',
    emissiveIntensity: 0.85,
    roughness: 0.4,
    opacity: 0.72,
    sheen: 0.6,
    sheenColor: '#a7f3d0',
    flow: { color: '#5eead4', strength: 0.4, scale: 2.4, speed: 0.2, rim: 0.3 },
  });
  const atpMat = track(new THREE.MeshBasicMaterial({ color: '#fcd34d', transparent: true, opacity: 0.95 * dim }));
  // mtDNA 核样体材质（粉紫亮斑 —— 区别于 ATP 合酶金点）
  const mtdnaMat = track(new THREE.MeshBasicMaterial({ color: '#f0abfc', transparent: true, opacity: 0.85 * dim }));
  // 线粒体取向 v6: 长形细胞（杆状/梭状沿 x, 柱状沿 y）优先沿长轴排列（心肌线粒体伴肌原纤维、
  // 成纤维沿应力纤维、上皮沿顶端-基底轴的真实位形）; 圆形细胞保持随机取向
  const MITO_ALIGN: 'x' | 'y' | null =
    SHAPE === 'rod' || SHAPE === 'spindle' ? 'x' : SHAPE === 'columnar' ? 'y' : null;
  for (let i = 0; i < mitoCount; i++) {
    const g = new THREE.Group();
    // 外膜（透射）
    const outer = new THREE.Mesh(mitoOuterGeo, mitoOuterMat);
    outer.scale.set(1, 1, 0.82);
    outer.renderOrder = 46;
    g.add(outer);
    // 基质（随外膜缩小, 与 2.3 长度匹配）
    const matrix = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.35, 1.38, 6, 16)), mitoMatrixMat);
    matrix.scale.set(1, 1, 0.82);
    matrix.renderOrder = 45;
    g.add(matrix);
    // 板层嵴（合并为单几何）: 12 条 = 6 个 x 槽 × 双排（对应 2D 形态学两行波浪嵴线）
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    for (let c = 0; c < cristaeN; c++) {
      const ph = hash01(`cr${c}`, i * 31);
      const slots = Math.ceil(cristaeN / 2);
      const slot = Math.floor(c / 2);
      const xSlot = (slot / Math.max(1, slots - 1) - 0.5) * 0.34; // 相邻板层间距拉开
      const zRow = c % 2 === 0 ? -0.07 : 0.07;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        // 波形频率调低（约 0.55~0.95 个全长波形）→ "板层"感更强
        pts.push(new THREE.Vector3(
          Math.sin(t * Math.PI * (0.6 + ph * 0.5)) * 0.03,
          (t - 0.5) * 1.5,
          zRow + Math.cos(t * Math.PI * (1.1 + ph * 0.8)) * 0.12,
        ));
      }
      const tube = track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.062, 7));
      // 压扁 0.55 → 板层; T·S 顺序使 x 槽平移不受压扁缩放
      const m = new THREE.Matrix4().makeTranslation(xSlot, 0, 0).multiply(new THREE.Matrix4().makeScale(0.55, 1, 1));
      parts.push({ geo: tube, matrix: m });
    }
    const cristae = new THREE.Mesh(track(mergeGeoms(parts)), cristaeMat);
    cristae.scale.set(1, 1, 0.82);
    cristae.renderOrder = 47;
    g.add(cristae);
    // 嵴膜 ATP 合酶（F1 颗粒, 发光）
    const atpGeo = track(new THREE.SphereGeometry(0.032, 5, 5));
    const atpCount = Math.round(18 * q) + 4;
    const atps = new THREE.InstancedMesh(atpGeo, atpMat, atpCount);
    {
      const mm = new THREE.Matrix4();
      for (let k = 0; k < atpCount; k++) {
        const t = k / atpCount;
        const yy = (t - 0.5) * 1.4;
        const xx = Math.sin(t * Math.PI * 3.2) * 0.24;
        const zz = Math.cos(t * Math.PI * 2.6) * 0.16;
        mm.makeScale(0.8 + hash01(`atp${i}${k}`) * 0.6, 0.8 + hash01(`atp${i}${k}`) * 0.6, 0.8 + hash01(`atp${i}${k}`) * 0.6);
        mm.setPosition(xx + (hash01(`atp${i}${k}`, 3) - 0.5) * 0.1, yy, zz + (hash01(`atp${i}${k}`, 5) - 0.5) * 0.08);
        atps.setMatrixAt(k, mm);
      }
      atps.instanceMatrix.needsUpdate = true;
      atps.renderOrder = 47;
    }
    g.add(atps);
    // mtDNA 核样体（基质内 3 个亮斑 —— 母系基因组 + 线粒体核糖体; 低端设备省略）
    if (!perf) {
      const mdParts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
      for (let d = 0; d < 3; d++) {
        const dr = 0.045 + hash01(`md${i}${d}`) * 0.03;
        mdParts.push({
          geo: track(new THREE.SphereGeometry(dr, 6, 5)),
          matrix: new THREE.Matrix4().setPosition(
            (hash01(`mdx${i}${d}`) - 0.5) * 0.5,
            (hash01(`mdy${i}${d}`) - 0.5) * 1.1,
            (hash01(`mdz${i}${d}`) - 0.5) * 0.34,
          ),
        });
      }
      const mtdna = new THREE.Mesh(track(mergeGeoms(mdParts)), mtdnaMat);
      mtdna.scale.set(1, 1, 0.82);
      mtdna.renderOrder = 47;
      g.add(mtdna);
    }
    // v6 体内形状化采样: 长轴端自动延展、窄轴处自动收缩, 并避开细胞核
    const mDir = new THREE.Vector3(
      Math.cos((hash01(`m${i}`, 5) - 0.5) * 2.1) * Math.cos(hash01(`m${i}`, 7) * Math.PI * 2),
      Math.sin((hash01(`m${i}`, 3) - 0.5) * 2.1),
      Math.cos((hash01(`m${i}`, 5) - 0.5) * 2.1) * Math.sin(hash01(`m${i}`, 7) * Math.PI * 2),
    ).normalize();
    const p = insidePos(mDir, 0.16 + hash01(`m${i}`) * 0.62, 1.15, 0.6);
    g.position.set(p.x, p.y, p.z);
    // 取向: 长轴对齐 + 确定性抖动; 圆形细胞保持全随机
    if (MITO_ALIGN === 'x') {
      g.rotation.set(hash01(`m${i}`, 9) * 0.24, hash01(`m${i}`, 11) * 2.1, Math.PI / 2 + (hash01(`m${i}`, 13) - 0.5) * 0.5);
    } else if (MITO_ALIGN === 'y') {
      g.rotation.set((hash01(`m${i}`, 9) - 0.5) * 0.4, hash01(`m${i}`, 11) * 2.1, (hash01(`m${i}`, 13) - 0.5) * 0.4);
    } else {
      g.rotation.set(hash01(`m${i}`, 9) * 2.1, hash01(`m${i}`, 11) * 2.1, hash01(`m${i}`, 13) * 2.1);
    }
    // 每颗随机长度 0.85~1.2×（update 动画仅改 position.y/rotation.y, 不覆盖 scale）
    g.scale.set(1, 0.85 + hash01(`ml${i}`) * 0.35, 1);
    group.add(g);
    mitos.push({ obj: g, baseY: p.y, phase: hash01(`m${i}`, 17) * Math.PI * 2 });
  }
  if (mitos.length) {
    const m0 = mitos[0].obj.position;
    labels.push({ pos: { x: m0.x * 1.4, y: m0.y + 0.85, z: m0.z * 1.4 }, zh: '线粒体（板层嵴）', latin: 'Mitochondrion' });
  }

  /* ================= 粗面内质网（核旁连续囊池 + 连接管 + 核糖体） ================= */
  // 核糖体: 大小亚基哑铃形（60S 大亚基 + 40S 小亚基 —— 电镜双亚基剪影）
  const ribosomeGeo = track(
    mergeGeoms([
      { geo: track(new THREE.SphereGeometry(0.06, 7, 6)), matrix: new THREE.Matrix4().makeTranslation(0, 0.028, 0) },
      { geo: track(new THREE.SphereGeometry(0.042, 6, 5)), matrix: new THREE.Matrix4().makeTranslation(0, -0.05, 0) },
    ]),
  );
  const ribosomeMat = track(new THREE.MeshStandardMaterial({ color: '#fbbf24', emissive: '#d97706', emissiveIntensity: 0.62 * dim, transparent: true, opacity: 0.88 * dim, depthWrite: false }));
  {
    // 渲染层 +2 行（视觉行数增多, 更接近 2D 多行波浪线; 不改 layout3d 契约）; perf ×0.6 缩减
    const sheets = Math.max(1, perf ? Math.round((spec.erSheets + 2) * 0.6) : spec.erSheets + 2);
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    const sheetCurves: THREE.CatmullRomCurve3[] = [];
    for (let s = 0; s < sheets; s++) {
      const latBase = -0.75 + s * 0.4;
      const lon0 = s * 1.9;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 14; k++) {
        const t = k / 14;
        const lat = latBase + Math.sin(t * Math.PI * 3.1) * 0.24;
        const lon = lon0 + t * Math.PI * 1.55;
        // v6: 囊池包绕成形核面（杆状核旁 rER 沿长轴延展 —— 与真实核旁 ER 一致）
        const dir = new THREE.Vector3(
          Math.cos(lat) * Math.cos(lon),
          Math.sin(lat),
          Math.cos(lat) * Math.sin(lon),
        ).normalize();
        const p = nucPoint(dir, 0.62 + Math.sin(t * Math.PI * 2.3 + s) * 0.34);
        pts.push(new THREE.Vector3(p.x, p.y, p.z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      sheetCurves.push(curve);
      const sheet = track(new THREE.TubeGeometry(curve, 52, 0.32, 12));
      const m = new THREE.Matrix4().makeScale(1, 0.26, 1); // 扁平囊池
      parts.push({ geo: sheet, matrix: m });
    }
    // 池间连接小管
    for (let c = 0; c < sheetCurves.length - 1; c++) {
      const a = sheetCurves[c].getPoint(0.35);
      const b = sheetCurves[c + 1].getPoint(0.5);
      const mid = a.clone().lerp(b, 0.5).multiplyScalar(0.96);
      const conn = new THREE.QuadraticBezierCurve3(a, mid, b);
      parts.push({ geo: track(new THREE.TubeGeometry(conn, 16, 0.07, 6)) });
    }
    const er = new THREE.Mesh(track(mergeGeoms(parts)), mat({
      color: '#16b3a0',
      transmission: transOn ? 0.3 : 0,
      thickness: 0.5,
      roughness: 0.38,
      normalMap: orgNormal,
      normalScale: 0.35,
      opacity: transOn ? 1 : 0.5,
      emissive: '#0d9488',
      emissiveIntensity: 0.16,
      clearcoat: 0.3,
      flow: { color: '#14b8a6', strength: 0.2, scale: 0.8, speed: 0.07, rim: 0.2 },
    }));
    er.renderOrder = 46;
    group.add(er);
    // 膜旁核糖体（胞质面两排）
    const riboPts: THREE.Vector3[] = [];
    for (const curve of sheetCurves) {
      const n = Math.round(26 * q) + 6; // 两排密度提高（k % 2 偶数排分支保留）
      for (let k = 0; k <= n; k++) {
        const p = curve.getPoint(k / n);
        riboPts.push(new THREE.Vector3(p.x, p.y + 0.15, p.z));
        if (k % 2 === 0) riboPts.push(new THREE.Vector3(p.x, p.y - 0.13, p.z));
      }
    }
    const ribos = new THREE.InstancedMesh(ribosomeGeo, ribosomeMat, riboPts.length);
    {
      const mm = new THREE.Matrix4();
      const qq = new THREE.Quaternion();
      const eu = new THREE.Euler();
      riboPts.forEach((p, i) => {
        const s = 0.75 + hash01(`rb${i}`) * 0.5;
        // 亚基分裂面随机朝向（哑铃形核糖体取向自然化）
        eu.set(hash01(`rbe${i}`) * Math.PI, hash01(`rbe${i}`, 3) * Math.PI * 2, (hash01(`rbe${i}`, 5) - 0.5) * 0.8);
        qq.setFromEuler(eu);
        mm.compose(new THREE.Vector3(p.x, p.y, p.z), qq, new THREE.Vector3(s, s, s));
        ribos.setMatrixAt(i, mm);
      });
      ribos.instanceMatrix.needsUpdate = true;
      ribos.renderOrder = 47;
    }
    group.add(ribos);
    if (sheets) {
      const p = nucPoint(new THREE.Vector3(Math.cos(-0.62) * Math.cos(1.4), Math.sin(-0.62), Math.cos(-0.62) * Math.sin(1.4)), 1.1);
      labels.push({ pos: { x: p.x, y: p.y + 0.75, z: p.z }, zh: '粗面内质网（核糖体）', latin: 'Rough ER' });
    }
  }

  // 游离多聚核糖体（胞质中的翻译车间）
  {
    const chains = Math.round(26 * q) + 6;
    const beads: THREE.Matrix4[] = [];
    const mm = new THREE.Matrix4();
    const qq2 = new THREE.Quaternion();
    const upV = new THREE.Vector3(0, 1, 0);
    for (let ch = 0; ch < chains; ch++) {
      // v6: 体内形状化采样（避开细胞核 + 随形状伸缩）
      const prDir = new THREE.Vector3(
        Math.cos((hash01(`pr${ch}`, 3) - 0.5) * 2.4) * Math.cos(hash01(`pr${ch}`, 5) * Math.PI * 2),
        Math.sin((hash01(`pr${ch}`, 3) - 0.5) * 2.4),
        Math.cos((hash01(`pr${ch}`, 3) - 0.5) * 2.4) * Math.sin(hash01(`pr${ch}`, 5) * Math.PI * 2),
      ).normalize();
      const start = insidePos(prDir, 0.2 + hash01(`pr${ch}`) * 0.62, 0.1, 0.3);
      const dirV = new THREE.Vector3(hash01(`prd${ch}`) - 0.5, hash01(`prd${ch}`, 3) - 0.5, hash01(`prd${ch}`, 5) - 0.5).normalize().multiplyScalar(0.14);
      const n = 4 + Math.floor(hash01(`prn${ch}`) * 3);
      for (let b = 0; b < n; b++) {
        const p = new THREE.Vector3(start.x + dirV.x * b, start.y + dirV.y * b, start.z + dirV.z * b);
        const s = 0.7 + hash01(`prb${ch}${b}`) * 0.4;
        // 核糖体沿 mRNA 链取向（亚基长轴对齐链方向 → 珠串读感）
        qq2.setFromUnitVectors(upV, dirV.clone().normalize());
        mm.compose(p, qq2, new THREE.Vector3(s, s, s));
        beads.push(mm.clone());
      }
    }
    const inst = new THREE.InstancedMesh(ribosomeGeo, ribosomeMat, beads.length);
    beads.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 44;
    group.add(inst);
  }

  // 滑面内质网（肝细胞解毒管系 —— CYP450 管网）
  if (spec.glycogen) {
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    const serN = perf ? 7 : 12;
    const serFirst = new THREE.Vector3();
    for (let i = 0; i < serN; i++) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 5; k++) {
        const t = k / 5;
        // v6: 管系在类型化体内游走（贴核 → 近膜区间, 随形状伸缩）
        const seDir = new THREE.Vector3(
          Math.cos((hash01(`se${i}`, 3) - 0.5) * 2.2 + Math.sin(t * 4 + i) * 0.14) * Math.cos(hash01(`se${i}`, 5) * Math.PI * 2 + t * 0.9),
          Math.sin((hash01(`se${i}`, 3) - 0.5) * 2.2 + Math.sin(t * 4 + i) * 0.14),
          Math.cos((hash01(`se${i}`, 3) - 0.5) * 2.2 + Math.sin(t * 4 + i) * 0.14) * Math.sin(hash01(`se${i}`, 5) * Math.PI * 2 + t * 0.9),
        ).normalize();
        const p = insidePos(seDir, 0.28 + hash01(`se${i}`) * 0.52 + t * 0.14, 0.12, 0.35);
        if (i === 0 && k === 2) serFirst.copy(p);
        pts.push(new THREE.Vector3(p.x, p.y, p.z));
      }
      parts.push({ geo: track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.085, 7)) });
    }
    // 管系 junction 节点（三通小室）
    const jGeo = track(new THREE.SphereGeometry(0.11, 8, 6));
    for (let j = 0; j < 5; j++) {
      const sjDir = new THREE.Vector3(
        Math.cos((hash01(`sj${j}`, 3) - 0.5) * 2.0) * Math.cos(hash01(`sj${j}`, 5) * Math.PI * 2),
        Math.sin((hash01(`sj${j}`, 3) - 0.5) * 2.0),
        Math.cos((hash01(`sj${j}`, 3) - 0.5) * 2.0) * Math.sin(hash01(`sj${j}`, 5) * Math.PI * 2),
      ).normalize();
      const jp = insidePos(sjDir, 0.3 + hash01(`sj${j}`) * 0.5, 0.14, 0.4);
      parts.push({ geo: jGeo, matrix: new THREE.Matrix4().setPosition(jp.x, jp.y, jp.z) });
    }
    const ser = new THREE.Mesh(track(mergeGeoms(parts)), mat({
      color: '#5eead4',
      emissive: '#0d9488',
      emissiveIntensity: 0.22,
      opacity: 0.45,
      roughness: 0.4,
    }));
    ser.renderOrder = 45;
    group.add(ser);
    labels.push({ pos: { x: serFirst.x * 1.25, y: serFirst.y + 0.6, z: serFirst.z * 1.25 }, zh: '滑面内质网', latin: 'Smooth ER' });
  }

  /* ================= 高尔基体（顺→反梯度 + 出芽囊泡） ================= */
  {
    const g = new THREE.Group();
    const cisCol = new THREE.Color('#99f6e4');
    const transCol = new THREE.Color('#f59e0b');
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4; color?: THREE.Color }[] = [];
    const cistN = 5;
    // 非线性极性插值: 前 2 层 teal 系 → 第 3 层过渡 → 后 2 层琥珀系（顺→反读感更分明）
    const POLARITY_MIX = [0, 0.16, 0.5, 0.84, 1];
    for (let i = 0; i < cistN; i++) {
      const col = cisCol.clone().lerp(transCol, POLARITY_MIX[i] ?? 1);
      // 更薄更扁的囊（管径 0.165）+ 更大半径 + 1.28π 弧 → 层叠弯曲扁平囊剪影
      const torus = track(new THREE.TorusGeometry(1.06 + i * 0.06, 0.165, 12, 46, Math.PI * 1.28));
      const m = new THREE.Matrix4()
        .makeScale(1, 0.22, 1)
        .multiply(new THREE.Matrix4().makeRotationZ(i * 0.3))
        .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
        .setPosition(0, i * 0.3, 0);
      parts.push({ geo: torus, matrix: m, color: col });
    }
    // 池间小管连接（随新半径/层间距同步）
    for (let c = 0; c < 8; c++) {
      const i = c % (cistN - 1);
      const ang = 0.5 + hash01(`gc${c}`) * 2.2;
      const r = 1.06 + i * 0.06;
      const a = new THREE.Vector3(Math.cos(ang) * r, i * 0.3, Math.sin(ang) * r * 0.34);
      const b = new THREE.Vector3(Math.cos(ang) * r, (i + 1) * 0.3, Math.sin(ang) * r * 0.34);
      const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0, 0.22));
      parts.push({ geo: track(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 10, 0.035, 6)), color: new THREE.Color('#2dd4bf') });
    }
    const golgi = new THREE.Mesh(track(mergeGeoms(parts)), mat({
      color: '#ffffff',
      vertexColors: true,
      transmission: transOn ? 0.26 : 0,
      thickness: 0.4,
      roughness: 0.35,
      opacity: transOn ? 1 : 0.62,
      clearcoat: 0.45,
      emissive: '#0d9488',
      emissiveIntensity: 0.12,
      sheen: 0.5,
      sheenColor: '#fbbf24',
    }));
    golgi.renderOrder = 46;
    g.add(golgi);
    // 反面出芽囊泡（衣被蛋白斑点）
    const budGeo = track(new THREE.SphereGeometry(1, 12, 10));
    const budMat = mat({
      color: '#fbbf24',
      emissive: '#d97706',
      emissiveIntensity: 0.45,
      opacity: 0.72,
      roughness: 0.35,
      normalMap: coatNormal,
      normalScale: 0.9,
      clearcoat: 0.3,
    });
    const budCount = 7;
    const buds = new THREE.InstancedMesh(budGeo, budMat, budCount);
    {
      const mm = new THREE.Matrix4();
      for (let v = 0; v < budCount; v++) {
        const r = 0.13 + hash01(`gv${v}`) * 0.06;
        const ang = 0.4 + v * 0.5;
        mm.makeScale(r, r, r);
        mm.setPosition(Math.cos(ang) * (1.16 + hash01(`gv${v}`, 3) * 0.2), 1.62 + hash01(`gv${v}`, 5) * 0.3, Math.sin(ang) * 0.5);
        buds.setMatrixAt(v, mm);
      }
      buds.instanceMatrix.needsUpdate = true;
      buds.renderOrder = 47;
    }
    g.add(buds);
    // 顺面入芽小泡（ER → 高尔基运输小泡语义, teal 系; perf 减至 2）
    const cisBudGeo = track(new THREE.SphereGeometry(1, 10, 8));
    const cisBudMat = mat({
      color: '#5eead4',
      emissive: '#14b8a6',
      emissiveIntensity: 0.45,
      opacity: 0.72,
      roughness: 0.35,
      normalMap: coatNormal,
      normalScale: 0.8,
      clearcoat: 0.3,
    });
    const cisBudCount = perf ? 2 : 3;
    const cisBuds = new THREE.InstancedMesh(cisBudGeo, cisBudMat, cisBudCount);
    {
      const mm = new THREE.Matrix4();
      for (let v = 0; v < cisBudCount; v++) {
        const r = 0.09 + hash01(`cgv${v}`) * 0.035;
        const ang = 1.1 + v * 1.0;
        mm.makeScale(r, r, r);
        mm.setPosition(Math.cos(ang) * (0.94 + hash01(`cgv${v}`, 3) * 0.24), -0.36 - hash01(`cgv${v}`, 5) * 0.16, Math.sin(ang) * 0.4);
        cisBuds.setMatrixAt(v, mm);
      }
      cisBuds.instanceMatrix.needsUpdate = true;
      cisBuds.renderOrder = 47;
    }
    g.add(cisBuds);
    // v6 位姿: 高尔基贴核面外延（核旁上位）; 柱状上皮采用核上位置（高尔基位于核与刷状缘之间 —— 教科书位形）
    const golgiLat = SHAPE === 'columnar' ? 0.85 : -0.42;
    const golgiLon = 2.4;
    const gDir = new THREE.Vector3(
      Math.cos(golgiLat) * Math.cos(golgiLon),
      Math.sin(golgiLat),
      Math.cos(golgiLat) * Math.sin(golgiLon),
    ).normalize();
    const p = nucPoint(gDir, 1.3);
    // 防溢出: 若核上位 1.3 外延越出膜面内 1.7, 则按膜面回拉
    {
      const lim = cellSurf(gDir, R, SHAPE, -1.7);
      const pv = new THREE.Vector3(p.x, p.y, p.z);
      if (pv.length() > lim) pv.setLength(lim);
      p.x = pv.x; p.y = pv.y; p.z = pv.z;
    }
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = 3.0;
    g.scale.setScalar(1.15); // 整组放大 1.15×（position 不变）
    group.add(g);
    labels.push({ pos: { x: p.x * 1.28, y: p.y + 0.65, z: p.z * 1.28 }, zh: '高尔基体（顺→反）', latin: 'Golgi apparatus' });
  }

  /* ================= 运输囊泡 ================= */
  {
    const vGeo = track(new THREE.SphereGeometry(1, 12, 10));
    const vMat = mat({
      color: '#a3e635',
      transmission: transOn ? 0.4 : 0,
      thickness: 0.35,
      emissive: '#65a30d',
      emissiveIntensity: 0.3,
      opacity: transOn ? 1 : 0.5,
      roughness: 0.35,
      normalMap: coatNormal,
      normalScale: 0.8,
      clearcoat: 0.3,
    });
    const inst = new THREE.InstancedMesh(vGeo, vMat, spec.vesicleCount);
    const m = new THREE.Matrix4();
    let v0 = new THREE.Vector3();
    for (let i = 0; i < spec.vesicleCount; i++) {
      const r = 0.13 + hash01(`v${i}`) * 0.14;
      // v6: 体内形状化采样（运输囊泡在高尔基→质膜路线上分布）
      const vDir = new THREE.Vector3(
        Math.cos((hash01(`v${i}`, 5) - 0.5) * 2.4) * Math.cos(hash01(`v${i}`, 7) * Math.PI * 2),
        Math.sin((hash01(`v${i}`, 5) - 0.5) * 2.4),
        Math.cos((hash01(`v${i}`, 5) - 0.5) * 2.4) * Math.sin(hash01(`v${i}`, 7) * Math.PI * 2),
      ).normalize();
      const p = insidePos(vDir, 0.35 + hash01(`v${i}`, 3) * 0.55, r, 0.4);
      if (i === 0) v0 = p;
      m.makeScale(r, r, r);
      m.setPosition(p.x, p.y, p.z);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 46;
    group.add(inst);
    labels.push({ pos: { x: v0.x * 1.2, y: v0.y + 0.5, z: v0.z * 1.2 }, zh: '运输囊泡', latin: 'Transport vesicle' });
  }

  /* ================= 溶酶体（酸性水解酶细胞器, pH≈4.5-5） ================= */
  {
    const lysoN = perf ? Math.max(2, Math.round(spec.lysosomeCount * 0.6)) : spec.lysosomeCount;
    if (lysoN > 0) {
      const bodyGeo = track(displacedSphere(0.38, 2, 3.2, 0.035, 101));
      const bodyMat = mat({
        color: '#f59e0b',
        emissive: '#b45309',
        emissiveIntensity: 0.38,
        roughness: 0.34,
        clearcoat: 0.4,
        normalMap: coatNormal,
        normalScale: 0.5,
        opacity: 0.9,
        flow: { color: '#fbbf24', strength: 0.18, scale: 1.2, speed: 0.08, rim: 0.3 },
      });
      const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, lysoN);
      // 腔内水解酶颗粒（酸性磷酸酶/组织蛋白酶等 ~60 种酸性水解酶）
      const spkGeo = track(new THREE.SphereGeometry(0.045, 5, 4));
      const spkMat = track(new THREE.MeshStandardMaterial({
        color: '#fde68a',
        emissive: '#f59e0b',
        emissiveIntensity: 0.5 * dim,
        transparent: true,
        opacity: 0.7 * dim,
        depthWrite: false,
      }));
      const perLyso = perf ? 10 : 18;
      const spks = new THREE.InstancedMesh(spkGeo, spkMat, lysoN * perLyso);
      const centers: THREE.Vector3[] = [];
      const scales: number[] = [];
      {
        const mm = new THREE.Matrix4();
        const qq = new THREE.Quaternion();
        const eu = new THREE.Euler();
        for (let i = 0; i < lysoN; i++) {
          // v6: 体内形状化采样（溶酶体在核周→近膜胞质区分布）
          const lyDir = new THREE.Vector3(
            Math.cos((hash01(`ly${i}`, 5) - 0.5) * 2.4) * Math.cos(hash01(`ly${i}`, 7) * Math.PI * 2),
            Math.sin((hash01(`ly${i}`, 5) - 0.5) * 2.4),
            Math.cos((hash01(`ly${i}`, 5) - 0.5) * 2.4) * Math.sin(hash01(`ly${i}`, 7) * Math.PI * 2),
          ).normalize();
          const p = insidePos(lyDir, 0.24 + hash01(`ly${i}`, 3) * 0.6, 0.52, 0.45);
          const s = 0.75 + hash01(`lys${i}`) * 0.55;
          centers.push(new THREE.Vector3(p.x, p.y, p.z));
          scales.push(s);
          eu.set(hash01(`lyr${i}`) * Math.PI * 2, hash01(`lyr${i}`, 3) * Math.PI * 2, 0);
          qq.setFromEuler(eu);
          mm.compose(centers[i], qq, new THREE.Vector3(s, s, s));
          bodies.setMatrixAt(i, mm);
        }
        bodies.instanceMatrix.needsUpdate = true;
        bodies.renderOrder = 46;
        const dir = new THREE.Vector3();
        let si = 0;
        for (let i = 0; i < lysoN; i++) {
          for (let k = 0; k < perLyso; k++) {
            dir.set(hash01(`ls${i}${k}`) - 0.5, hash01(`ls${i}${k}`, 3) - 0.5, hash01(`ls${i}${k}`, 5) - 0.5).normalize();
            const rr = (0.12 + hash01(`lsr${i}${k}`) * 0.2) * scales[i];
            const s2 = (0.6 + hash01(`lss${i}${k}`) * 0.7) * scales[i];
            mm.makeScale(s2, s2, s2);
            mm.setPosition(centers[i].x + dir.x * rr, centers[i].y + dir.y * rr, centers[i].z + dir.z * rr);
            spks.setMatrixAt(si, mm);
            si++;
          }
        }
        spks.instanceMatrix.needsUpdate = true;
        spks.renderOrder = 47;
      }
      group.add(bodies, spks);
      const l0 = centers[0];
      labels.push({ pos: { x: l0.x * 1.45, y: l0.y + 0.55, z: l0.z * 1.45 }, zh: '溶酶体（pH≈4.5）', latin: 'Lysosome' });
    }
  }

  /* ================= 过氧化物酶体（过氧化氢酶晶体核心） ================= */
  {
    const pxN = perf ? Math.max(1, Math.round(spec.peroxisomeCount * 0.6)) : spec.peroxisomeCount;
    if (pxN > 0) {
      const bodyGeo = track(new THREE.SphereGeometry(0.26, 12, 10));
      const bodyMat = mat({
        color: '#2dd4bf',
        transmission: transOn ? 0.28 : 0,
        thickness: 0.3,
        emissive: '#0f766e',
        emissiveIntensity: 0.24,
        roughness: 0.32,
        opacity: transOn ? 1 : 0.55,
        clearcoat: 0.35,
      });
      const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, pxN);
      // 尿酸氧化酶晶核（电镜下的致密芯）
      const coreGeo = track(new THREE.OctahedronGeometry(0.1, 0));
      const coreMat = track(new THREE.MeshStandardMaterial({
        color: '#ccfbf1',
        emissive: '#5eead4',
        emissiveIntensity: 0.65 * dim,
        transparent: true,
        opacity: 0.85 * dim,
      }));
      const cores = new THREE.InstancedMesh(coreGeo, coreMat, pxN);
      const pxCenters: THREE.Vector3[] = [];
      {
        const mm = new THREE.Matrix4();
        const qq = new THREE.Quaternion();
        const qc = new THREE.Quaternion();
        const eu = new THREE.Euler();
        for (let i = 0; i < pxN; i++) {
          // v6: 体内形状化采样（过氧化物酶体均匀散布胞质）
          const pxDir = new THREE.Vector3(
            Math.cos((hash01(`px${i}`, 5) - 0.5) * 2.4) * Math.cos(hash01(`px${i}`, 7) * Math.PI * 2),
            Math.sin((hash01(`px${i}`, 5) - 0.5) * 2.4),
            Math.cos((hash01(`px${i}`, 5) - 0.5) * 2.4) * Math.sin(hash01(`px${i}`, 7) * Math.PI * 2),
          ).normalize();
          const p = insidePos(pxDir, 0.28 + hash01(`px${i}`, 3) * 0.58, 0.34, 0.42);
          const s = 0.7 + hash01(`pxs${i}`) * 0.5;
          pxCenters.push(new THREE.Vector3(p.x, p.y, p.z));
          eu.set(hash01(`pxr${i}`) * Math.PI, hash01(`pxr${i}`, 3) * Math.PI * 2, hash01(`pxr${i}`, 5) * Math.PI);
          qq.setFromEuler(eu);
          mm.compose(pxCenters[i], qq, new THREE.Vector3(s, s, s));
          bodies.setMatrixAt(i, mm);
          eu.set(hash01(`pcr${i}`) * Math.PI, hash01(`pcr${i}`, 3) * Math.PI, 0);
          qc.setFromEuler(eu);
          mm.compose(pxCenters[i], qc, new THREE.Vector3(s, s, s));
          cores.setMatrixAt(i, mm);
        }
        bodies.instanceMatrix.needsUpdate = true;
        bodies.renderOrder = 46;
        cores.instanceMatrix.needsUpdate = true;
        cores.renderOrder = 47;
      }
      group.add(bodies, cores);
      const px0 = pxCenters[0];
      labels.push({ pos: { x: px0.x * 1.5, y: px0.y - 0.6, z: px0.z * 1.5 }, zh: '过氧化物酶体', latin: 'Peroxisome' });
    }
  }

  /* ================= 脂滴（中性脂储存库 —— 肝/心肌/癌细胞） ================= */
  if (spec.lipidDroplets) {
    const ldN = perf ? 3 : 5;
    const ldMat = mat({
      color: '#fcd34d',
      transmission: transOn ? 0.5 : 0,
      thickness: 0.8,
      roughness: 0.12,
      clearcoat: 0.65,
      clearcoatRoughness: 0.18,
      emissive: '#b45309',
      emissiveIntensity: 0.14,
      opacity: transOn ? 1 : 0.5,
      iridescence: 0.22,
      sheen: 0.4,
      sheenColor: '#fde68a',
    });
    let ld0 = new THREE.Vector3();
    for (let i = 0; i < ldN; i++) {
      const r = 0.3 + hash01(`ld${i}`) * 0.26;
      const d = new THREE.Mesh(track(displacedSphere(r, 2, 2.6, r * 0.05, 151 + i)), ldMat);
      // v6: 体内形状化采样（脂滴在胞质中游离, 避核 + 随形状）
      const ldDir = new THREE.Vector3(
        Math.cos((hash01(`ldl${i}`, 3) - 0.5) * 2.2) * Math.cos(hash01(`ldo${i}`, 5) * Math.PI * 2),
        Math.sin((hash01(`ldl${i}`, 3) - 0.5) * 2.2),
        Math.cos((hash01(`ldl${i}`, 3) - 0.5) * 2.2) * Math.sin(hash01(`ldo${i}`, 5) * Math.PI * 2),
      ).normalize();
      const p = insidePos(ldDir, 0.3 + hash01(`ldp${i}`) * 0.55, r + 0.08, 0.45);
      if (i === 0) ld0 = p;
      d.position.set(p.x, p.y, p.z);
      d.renderOrder = 46;
      group.add(d);
    }
    labels.push({ pos: { x: ld0.x * 1.2, y: ld0.y - 0.5, z: ld0.z * 1.2 }, zh: '脂滴（中性脂）', latin: 'Lipid droplet' });
  }

  /* ================= 细胞骨架 ================= */
  {
    // 中心体（双联体中心粒）—— v6: 贴核定位（真实 MTOC 核旁; 柱状上皮位于核上顶端区）
    const c = nucC.clone().add(
      SHAPE === 'columnar' ? new THREE.Vector3(0.9, 2.3, 1.2) : new THREE.Vector3(1.9, -1.1, 1.6),
    );
    const centGeo = track(new THREE.CylinderGeometry(0.13, 0.13, 0.42, 14));
    const centMat = mat({ color: '#94a3b8', emissive: '#475569', emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.2, opacity: 0.85 });
    const cent1 = new THREE.Mesh(centGeo, centMat);
    const cent2 = new THREE.Mesh(centGeo, centMat);
    cent2.rotation.z = Math.PI / 2;
    cent1.position.copy(c);
    cent2.position.set(c.x + 0.24, c.y + 0.05, c.z);
    cent1.renderOrder = 44;
    cent2.renderOrder = 44;
    group.add(cent1, cent2);
    // 中心体放射微管（合并, 原纤维条纹法线）—— v6: 终点贴类型化膜面（旧球形 0.96R 会在窄轴穿出膜外）
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    for (let i = 0; i < spec.microtubules; i++) {
      const mtDir = new THREE.Vector3(
        Math.cos((hash01(`t${i}`) - 0.5) * 2.4) * Math.cos(hash01(`t${i}`, 3) * Math.PI * 2),
        Math.sin((hash01(`t${i}`) - 0.5) * 2.4),
        Math.cos((hash01(`t${i}`) - 0.5) * 2.4) * Math.sin(hash01(`t${i}`, 3) * Math.PI * 2),
      ).normalize();
      const mtR = cellSurf(mtDir, R, SHAPE, -0.35);
      const end = new THREE.Vector3(mtDir.x * mtR, mtDir.y * mtR, mtDir.z * mtR);
      const ctrl = c.clone().lerp(end, 0.6);
      ctrl.y += (hash01(`t${i}`, 9) - 0.5) * 1.6;
      const curve = new THREE.QuadraticBezierCurve3(c, ctrl, end);
      parts.push({ geo: track(new THREE.TubeGeometry(curve, 26, 0.03, 8)) });
    }
    const mts = new THREE.Mesh(track(mergeGeoms(parts)), mat({
      color: '#cbd5e1',
      emissive: '#64748b',
      emissiveIntensity: 0.3,
      opacity: 0.5,
      roughness: 0.45,
      normalMap: mtStripe,
      normalScale: 0.55,
      sheen: 0.4,
      sheenColor: '#e2e8f0',
    }));
    mts.renderOrder = 44;
    group.add(mts);

    // 中间丝（核周波形蛋白笼 —— 核被膜到质膜的力学支架, 与微管正交的第三套骨架）
    // v6: 严格自成形核面拉到类型化膜面（旧球形插值在窄轴穿膜、长轴悬空）
    {
      const ifN = perf ? 6 : 12;
      const ifParts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
      let ifMid = new THREE.Vector3();
      for (let i = 0; i < ifN; i++) {
        const lat = (hash01(`if${i}`) - 0.5) * 2.2;
        const lon = hash01(`if${i}`, 3) * Math.PI * 2;
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 6; k++) {
          const t = k / 6;
          const d = new THREE.Vector3(
            Math.cos(lat + Math.sin(t * 5 + i * 1.7) * 0.18) * Math.cos(lon + t * 0.6 + Math.sin(t * 3.4 + i) * 0.13),
            Math.sin(lat + Math.sin(t * 5 + i * 1.7) * 0.18),
            Math.cos(lat + Math.sin(t * 5 + i * 1.7) * 0.18) * Math.sin(lon + t * 0.6 + Math.sin(t * 3.4 + i) * 0.13),
          ).normalize();
          const from = nucPoint(d, 0.12);
          const to = d.clone().multiplyScalar(Math.max(1.2, cellSurf(d, R, SHAPE, -0.45)));
          const p = from.lerp(to, t);
          pts.push(p);
          if (i === 0 && k === 3) ifMid.copy(p);
        }
        ifParts.push({ geo: track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.02, 5)) });
      }
      const ifs = new THREE.Mesh(track(mergeGeoms(ifParts)), mat({
        color: '#a8b7c8',
        emissive: '#475569',
        emissiveIntensity: 0.22,
        opacity: 0.38,
        roughness: 0.5,
        sheen: 0.6,
        sheenColor: '#e2e8f0',
      }));
      ifs.renderOrder = 44;
      group.add(ifs);
      labels.push({ pos: { x: ifMid.x * 1.15, y: ifMid.y, z: ifMid.z * 1.15 }, zh: '中间丝（波形蛋白）', latin: 'Intermediate filaments' });
    }

    labels.push({ pos: { x: c.x * 2.5, y: c.y - 0.5, z: c.z * 2.5 }, zh: '微管（中心体放射）', latin: 'Microtubules' });

    // 皮层肌动蛋白网 —— v6: 贴类型化膜面内 0.45-0.8（旧球形 R-0.5 会在窄轴穿出膜外）
    const actGeo = track(new THREE.CapsuleGeometry(0.017, 0.9, 3, 6));
    const actMat = mat({ color: '#b9f5e8', emissive: '#2dd4bf', emissiveIntensity: 0.28, opacity: 0.4, roughness: 0.4 });
    const actCount = Math.round(72 * q) + 10;
    const actins = new THREE.InstancedMesh(actGeo, actMat, actCount);
    {
      const mm = new THREE.Matrix4();
      const qq = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const dir = new THREE.Vector3();
      const tangent = new THREE.Vector3();
      const rand = new THREE.Vector3();
      fibSphere(actCount, 1).forEach((p, i) => {
        dir.set(p.x, p.y, p.z).normalize();
        rand.set(hash01(`ac${i}`) - 0.5, hash01(`ac${i}`, 3) - 0.5, hash01(`ac${i}`, 5) - 0.5);
        tangent.crossVectors(dir, rand).normalize();
        const rr = cellSurf(dir, R, SHAPE, -0.45 - hash01(`ac${i}`, 7) * 0.35);
        qq.setFromUnitVectors(up, tangent);
        const s = 0.9 + hash01(`ac${i}`, 9) * 1.1;
        mm.compose(new THREE.Vector3(dir.x * rr, dir.y * rr, dir.z * rr), qq, new THREE.Vector3(1, s, 1));
        actins.setMatrixAt(i, mm);
      });
      actins.instanceMatrix.needsUpdate = true;
      actins.renderOrder = 44;
    }
    group.add(actins);
  }

  /* ================= 胞质颗粒（分子拥挤, 双色系） ================= */
  const cytosol = (() => {
    const geo = track(new THREE.SphereGeometry(1, 7, 6));
    const m2 = track(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#0b3b36', emissiveIntensity: 0.28 * dim, roughness: 0.65, transparent: true, opacity: 0.33 * dim, depthWrite: false }));
    const count = Math.round(430 * q) + 60;
    const inst = new THREE.InstancedMesh(geo, m2, count);
    const mm = new THREE.Matrix4();
    const c = new THREE.Color();
    const palette = ['#115e59', '#134e4a', '#0f766e', '#3f6212', '#78350f', '#475569', '#7f1d3a', '#155e50'];
    for (let i = 0; i < count; i++) {
      const r = 0.04 + hash01(`s${i}`) * 0.075;
      // v6: 体内形状化采样 —— 430+ 颗粒按真实形状体积分布（旧球形壳在长轴端悬空、窄轴穿膜）
      const sDir = new THREE.Vector3(
        Math.cos((hash01(`s${i}`, 5) - 0.5) * 2.7) * Math.cos(hash01(`s${i}`, 7) * Math.PI * 2),
        Math.sin((hash01(`s${i}`, 5) - 0.5) * 2.7),
        Math.cos((hash01(`s${i}`, 5) - 0.5) * 2.7) * Math.sin(hash01(`s${i}`, 7) * Math.PI * 2),
      ).normalize();
      const p = insidePos(sDir, 0.12 + hash01(`s${i}`, 3) * 0.82, r, 0.3);
      mm.makeScale(r, r, r);
      mm.setPosition(p.x, p.y, p.z);
      inst.setMatrixAt(i, mm);
      inst.setColorAt(i, c.set(palette[i % palette.length]).multiplyScalar(0.6 + hash01(`sc${i}`) * 0.7));
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.renderOrder = 30;
    group.add(inst);
    return inst;
  })();

  /* ================= 细胞类型特化结构 ================= */
  if (spec.glycogen) {
    // 肝糖原玫瑰体（β 颗粒聚集成玫瑰体）
    const geo = track(new THREE.SphereGeometry(0.05, 6, 5));
    const m3 = track(new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#a16207', emissiveIntensity: 0.45 * dim, transparent: true, opacity: 0.62 * dim, depthWrite: false }));
    const rosettes = 6;
    const perRosette = 15;
    const inst = new THREE.InstancedMesh(geo, m3, rosettes * perRosette);
    const mm = new THREE.Matrix4();
    let gly0 = new THREE.Vector3();
    for (let i = 0; i < rosettes * perRosette; i++) {
      const rosette = Math.floor(i / perRosette);
      // v6: 玫瑰体中心体内形状化采样（贴核→近膜区间, 随形状伸缩）
      const gDir = new THREE.Vector3(
        Math.cos(0.3 + rosette * 0.62) * Math.cos(1.2 + rosette * 1.7),
        Math.sin(0.3 + rosette * 0.62),
        Math.cos(0.3 + rosette * 0.62) * Math.sin(1.2 + rosette * 1.7),
      ).normalize();
      const cp = insidePos(gDir, 0.3 + (rosette % 3) * 0.22, 0.36, 0.45);
      if (i === 0) gly0.copy(cp);
      const off = sph(0.08 + hash01(`g${i}`) * 0.26, (hash01(`g${i}`, 5) - 0.5) * 3, hash01(`g${i}`, 7) * Math.PI * 2);
      const s = 0.7 + hash01(`gs${i}`) * 0.6;
      mm.makeScale(s, s, s);
      mm.setPosition(cp.x + off.x, cp.y + off.y, cp.z + off.z);
      inst.setMatrixAt(i, mm);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 46;
    group.add(inst);
    labels.push({ pos: { x: gly0.x * 1.3, y: gly0.y + 0.4, z: gly0.z * 1.3 }, zh: '糖原玫瑰体', latin: 'Glycogen rosette' });
  }

  if (spec.microvilli) {
    // 上皮微绒毛（刷状缘）—— 顶端极性: 顶面（+y 拱顶）密集, 侧缘渐稀（极性采样）
    const geo = track(new THREE.CapsuleGeometry(0.037, 0.5, 4, 9));
    const m4 = track(new THREE.MeshStandardMaterial({ color: '#2dd4bf', emissive: '#0d9488', emissiveIntensity: 0.55 * dim, transparent: true, opacity: 0.68 * dim, depthWrite: false }));
    const count = Math.round(180 * q) + 30;
    const cands = fibSphere(Math.round(count * (spec.apicalPolarity ? 2.2 : 1)), 1)
      .filter((p) => {
        if (!spec.apicalPolarity) return true;
        const w = p.y * 0.5 + 0.5; // 顶端权重 0..1
        return hash01(`mvw${Math.round(p.x * 997)}${Math.round(p.z * 991)}`) < 0.1 + w * w * 1.25;
      })
      .slice(0, count);
    const inst = new THREE.InstancedMesh(geo, m4, Math.max(1, cands.length));
    const mm = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    cands.forEach((p, i) => {
      dir.set(p.x, p.y, p.z).normalize();
      const rr = cellSurf(dir, R, SHAPE, 0.26);
      qq.setFromUnitVectors(up, dir);
      const s = 0.85 + hash01(`mv${i}`) * 0.5;
      mm.compose(new THREE.Vector3(dir.x * rr, dir.y * rr, dir.z * rr), qq, new THREE.Vector3(s, s * (0.9 + hash01(`mvl${i}`) * 0.5), s));
      inst.setMatrixAt(i, mm);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 60;
    group.add(inst);
    const lp = sph(R * 1.32, 1.3, 0.5);
    labels.push({ pos: lp, zh: '微绒毛（刷状缘）', latin: 'Microvilli' });
  }

  if (spec.tightJunction) {
    // 紧密连接封闭索 —— 环位姿按形状函数自适应（柱状上皮位于顶面正下方侧环）
    const tDir = new THREE.Vector3(0.66, 0.75, 0).normalize();
    const tR = cellSurf(tDir, R, SHAPE, -0.06);
    const ringR = Math.max(0.5, tR * Math.cos(Math.asin(tDir.y)) * 0.99);
    const ring = new THREE.Mesh(
      track(new THREE.TorusGeometry(ringR, 0.08, 12, 96)),
      track(glowMaterial('#fb923c', 0.4 * dim, THREE.DoubleSide)),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = tR * tDir.y;
    ring.renderOrder = 62;
    group.add(ring);
    labels.push({ pos: { x: ringR * 1.12, y: ring.position.y + 0.9, z: ringR * 0.35 }, zh: '紧密连接（封闭索）', latin: 'Tight junction' });
  }

  if (spec.collagen) {
    const m5 = mat({
      color: '#fef3c7',
      emissive: '#b45309',
      emissiveIntensity: 0.22,
      opacity: 0.52,
      roughness: 0.4,
      normalMap: collagenStripe,
      normalScale: 1.1,
      sheen: 0.8,
      sheenColor: '#fde68a',
    });
    for (let i = 0; i < 7; i++) {
      const lat = (hash01(`co${i}`) > 0.5 ? 1 : -1) * (0.55 + hash01(`co${i}`, 3) * 0.6);
      const lon = hash01(`co${i}`, 5) * Math.PI * 2;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 7; k++) {
        const t = k / 7;
        // v6: 纤维起点锚定类型化膜面（旧球形 1.16R 起点在窄轴离膜悬空）
        const coDir = new THREE.Vector3(
          Math.cos(lat + Math.sin(t * 4 + i) * 0.1) * Math.cos(lon + Math.sin(t * 3.2 + i * 2) * 0.14),
          Math.sin(lat + Math.sin(t * 4 + i) * 0.1),
          Math.cos(lat + Math.sin(t * 4 + i) * 0.1) * Math.sin(lon + Math.sin(t * 3.2 + i * 2) * 0.14),
        ).normalize();
        const coR = cellSurf(coDir, R, SHAPE) + 0.3 + t * 0.72 * R;
        pts.push(new THREE.Vector3(coDir.x * coR, coDir.y * coR, coDir.z * coR));
      }
      const fiber = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.078, 9)), m5);
      fiber.renderOrder = 62;
      group.add(fiber);
    }
    labels.push({ pos: sph(R * 1.66, 0.95, 3.6), zh: '胶原纤维（I 型 D-带）', latin: 'Collagen fiber' });
  }

  if (spec.blebs) {
    const m6 = mat({
      color: '#14b8a6',
      transmission: transOn ? 0.3 : 0,
      thickness: 0.3,
      emissive: '#0f766e',
      emissiveIntensity: 0.2,
      opacity: transOn ? 1 : 0.35,
      roughness: 0.35,
    });
    for (let i = 0; i < 9; i++) {
      const r = 0.26 + hash01(`bb${i}`) * 0.3;
      const dir = new THREE.Vector3(0, 0, 1).setFromSphericalCoords(1, Math.acos((hash01(`bb${i}`, 3) - 0.5) * 2.6), hash01(`bb${i}`, 5) * Math.PI * 2);
      const rr = cellSurf(dir, R, SHAPE, -0.1);
      const b = new THREE.Mesh(track(displacedSphere(r, 2, 3.0, r * 0.14, 23 + i)), m6);
      b.position.set(dir.x * rr, dir.y * rr, dir.z * rr);
      b.renderOrder = 62;
      group.add(b);
    }
    labels.push({ pos: sph(R * 1.36, -0.9, 5.2), zh: '膜出芽（侵袭表型）', latin: 'Membrane blebbing' });
  }

  if (spec.neurites) {
    // 轴突（基底侧发出）+ 髓鞘（郎飞氏结）+ 基底树突（棘突）—— 锥体神经元位形
    /** 沿 (lat, lon) 方向的形状化半径点（f 为膜半径倍率, 起点贴真实膜面） */
    const sphShape = (f: number, lat: number, lon: number): Vec3 => {
      const d = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      const r = cellSurf(d, R, SHAPE) * f;
      return { x: d.x * r, y: d.y * r, z: d.z * r };
    };
    const axonMat = mat({ color: '#14b8a6', transmission: transOn ? 0.3 : 0, thickness: 0.5, emissive: '#0d9488', emissiveIntensity: 0.14, opacity: transOn ? 1 : 0.4, roughness: 0.4 });
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const p = sphShape(0.96 + t * 0.8, -0.62 + Math.sin(t * 5) * 0.12, 0.55 + t * 0.5);
      pts.push(new THREE.Vector3(p.x, p.y, p.z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const axon = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 56, 0.3, 12)), axonMat);
    axon.renderOrder = 62;
    group.add(axon);
    const myelinMat = mat({
      color: '#fafaf9',
      emissive: '#a8a29e',
      emissiveIntensity: 0.18,
      opacity: 0.55,
      roughness: 0.3,
      sheen: 0.9,
      sheenColor: '#ffffff',
      clearcoat: 0.5,
    });
    for (let k = 0; k < 6; k++) {
      const t = 0.18 + k * 0.135;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const seg = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.5, 0.6, 6, 16)), myelinMat);
      seg.position.copy(p);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
      seg.renderOrder = 63;
      group.add(seg);
    }
    labels.push({ pos: curve.getPoint(0.66).clone().multiplyScalar(1.2), zh: '髓鞘轴突（郎飞氏结）', latin: 'Myelinated axon' });
    // 树突 + 棘突
    const spineGeo = track(new THREE.SphereGeometry(0.055, 5, 5));
    const spineMat = track(new THREE.MeshStandardMaterial({ color: '#5eead4', emissive: '#0d9488', emissiveIntensity: 0.4 * dim, transparent: true, opacity: 0.7 * dim, depthWrite: false }));
    const spinePts: THREE.Vector3[] = [];
    for (let d = 0; d < 4; d++) {
      const lat = -0.85 + d * 0.3;
      const lon = 2.2 + d * 1.4;
      const dpts: THREE.Vector3[] = [];
      for (let k = 0; k <= 5; k++) {
        const t = k / 5;
        const p = sphShape(0.96 + t * 0.36, lat + t * 0.1, lon + Math.sin(t * 3 + d) * 0.15);
        dpts.push(new THREE.Vector3(p.x, p.y, p.z));
      }
      const dend = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(dpts), 24, 0.16, 9)), axonMat);
      dend.renderOrder = 62;
      group.add(dend);
      for (let s = 0; s < 7; s++) {
        spinePts.push(new THREE.CatmullRomCurve3(dpts).getPoint(0.15 + s * 0.12).multiplyScalar(1.06));
      }
    }
    const spines = new THREE.InstancedMesh(spineGeo, spineMat, spinePts.length);
    {
      const mm = new THREE.Matrix4();
      spinePts.forEach((p, i) => {
        const s = 0.7 + hash01(`sp${i}`) * 0.5;
        mm.makeScale(s, s, s);
        mm.setPosition(p.x, p.y, p.z);
        spines.setMatrixAt(i, mm);
      });
      spines.instanceMatrix.needsUpdate = true;
      spines.renderOrder = 62;
    }
    group.add(spines);
    labels.push({ pos: sph(R * 1.32, -0.9, 2.4), zh: '基底树突（棘突）', latin: 'Basal dendrite' });

    if (spec.synapticBoutons) {
      // 突触扣结: 轴突末端扣结 + 结旁 en-passant 扣结（突触囊泡簇 + 致密芯囊泡 + 扣结内线粒体）
      const bouMat = mat({ color: '#2dd4bf', transmission: transOn ? 0.35 : 0, thickness: 0.35, emissive: '#0d9488', emissiveIntensity: 0.22, opacity: transOn ? 1 : 0.55, roughness: 0.4 });
      const svGeo = track(new THREE.SphereGeometry(0.042, 6, 5));
      const svMat = track(new THREE.MeshStandardMaterial({ color: '#ccfbf1', emissive: '#5eead4', emissiveIntensity: 0.55 * dim, transparent: true, opacity: 0.78 * dim, depthWrite: false }));
      const dcGeo = track(new THREE.SphereGeometry(0.06, 6, 5));
      const dcMat = track(new THREE.MeshStandardMaterial({ color: '#fde68a', emissive: '#f59e0b', emissiveIntensity: 0.7 * dim, transparent: true, opacity: 0.88 * dim }));
      const mitoGeo = track(new THREE.CapsuleGeometry(0.085, 0.22, 4, 8));
      const mitoMat = track(new THREE.MeshStandardMaterial({ color: '#f43f5e', emissive: '#be123c', emissiveIntensity: 0.4 * dim, transparent: true, opacity: 0.8 * dim }));
      const mkBouton = (p: THREE.Vector3, dir: THREE.Vector3, scale: number, seed: string) => {
        const bou = new THREE.Mesh(track(new THREE.SphereGeometry(0.3 * scale, 14, 12)), bouMat);
        bou.position.copy(p);
        bou.renderOrder = 62;
        group.add(bou);
        // 囊泡簇（清亮突触囊泡, 活性区偏向远端）
        const ves: THREE.Matrix4[] = [];
        const vm = new THREE.Matrix4();
        for (let v = 0; v < 16; v++) {
          const rnd = new THREE.Vector3(
            hash01(`sv${seed}${v}`) - 0.5,
            hash01(`sv${seed}${v}`, 3) - 0.5,
            hash01(`sv${seed}${v}`, 5) - 0.5,
          ).multiplyScalar(0.44 * scale);
          const vp = p.clone().add(rnd).addScaledVector(dir, 0.08 * scale);
          const s = (0.75 + hash01(`svs${seed}${v}`) * 0.6) * scale;
          vm.makeScale(s, s, s);
          vm.setPosition(vp.x, vp.y, vp.z);
          ves.push(vm.clone());
        }
        const svInst = new THREE.InstancedMesh(svGeo, svMat, ves.length);
        ves.forEach((m, i) => svInst.setMatrixAt(i, m));
        svInst.instanceMatrix.needsUpdate = true;
        svInst.renderOrder = 63;
        group.add(svInst);
        // 致密芯囊泡（神经肽, 少量琥珀色）
        for (let d = 0; d < 2; d++) {
          const dc = new THREE.Mesh(dcGeo, dcMat);
          dc.position.copy(p).add(new THREE.Vector3(
            (hash01(`dc${seed}${d}`) - 0.5) * 0.5,
            (hash01(`dc${seed}${d}`, 3) - 0.5) * 0.5,
            (hash01(`dc${seed}${d}`, 5) - 0.5) * 0.5,
          ).multiplyScalar(scale));
          dc.renderOrder = 63;
          group.add(dc);
        }
        // 扣结内小线粒体（突触能量站）
        const bm = new THREE.Mesh(mitoGeo, mitoMat);
        bm.position.copy(p).addScaledVector(dir, -0.16 * scale);
        bm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(
          hash01(`bmx${seed}`) - 0.5,
          hash01(`bmy${seed}`, 3) - 0.5,
          hash01(`bmz${seed}`, 5) - 0.5,
        ).normalize());
        bm.renderOrder = 63;
        group.add(bm);
      };
      // 轴突末端扣结（terminal bouton）+ 结旁 en-passant ×2（郎飞氏结位）
      const endP = curve.getPoint(1);
      const endT = curve.getTangent(1);
      mkBouton(endP.clone().addScaledVector(endT, 0.14), endT, 1.15, 'end');
      for (const t of [0.38, 0.65]) {
        const bp = curve.getPoint(t);
        const bt = curve.getTangent(t);
        const side = new THREE.Vector3().crossVectors(bt, new THREE.Vector3(0, 1, 0)).normalize();
        if (side.lengthSq() < 0.01) side.set(1, 0, 0);
        mkBouton(bp.clone().addScaledVector(side, 0.52), bt, 0.85, `ep${t}`);
      }
      labels.push({ pos: endP.clone().addScaledVector(endT, 1.0), zh: '突触扣结（囊泡释放）', latin: 'Synaptic bouton' });
    }
  }

  if (spec.apicalTuft) {
    // 顶端树突主干 + 顶丛（apical tuft）—— 从锥体顶端（+y 收窄端）发出的主树 + 扇形分叉
    const tuftMat = mat({ color: '#2dd4bf', transmission: transOn ? 0.3 : 0, thickness: 0.4, emissive: '#0d9488', emissiveIntensity: 0.18, opacity: transOn ? 1 : 0.45, roughness: 0.4 });
    const apexDir = new THREE.Vector3(0, 1, 0);
    const apexR = cellSurf(apexDir, R, SHAPE, -0.15);
    const trunkPts = [
      new THREE.Vector3(0, apexR * 0.88, 0),
      new THREE.Vector3(0.14, apexR * 1.16, 0.06),
      new THREE.Vector3(-0.1, apexR * 1.5, -0.08),
    ];
    const trunk = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trunkPts), 16, 0.15, 9)), tuftMat);
    trunk.renderOrder = 62;
    group.add(trunk);
    const branchDirs = [
      new THREE.Vector3(0.85, 0.5, 0.2),
      new THREE.Vector3(-0.5, 0.62, 0.6),
      new THREE.Vector3(-0.3, 0.45, -0.85),
    ];
    branchDirs.forEach((bd, bi) => {
      const bdN = bd.clone().normalize();
      const start = trunkPts[2].clone();
      const end = start.clone().addScaledVector(bdN, R * 0.33);
      const ctrl = start.clone().lerp(end, 0.55).add(new THREE.Vector3(0, R * 0.09, 0));
      const br = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(start, ctrl, end), 12, 0.085 - bi * 0.008, 7)), tuftMat);
      br.renderOrder = 62;
      group.add(br);
      // 丛末梢小棘（棘突剪影）
      const tipGeo = track(new THREE.SphereGeometry(0.06, 5, 5));
      const tipMat = track(new THREE.MeshStandardMaterial({ color: '#5eead4', emissive: '#0d9488', emissiveIntensity: 0.4 * dim, transparent: true, opacity: 0.7 * dim, depthWrite: false }));
      for (let s = 0; s < 3; s++) {
        const tip = new THREE.Mesh(tipGeo, tipMat);
        const jitter = new THREE.Vector3(hash01(`ts${bi}${s}`) - 0.5, hash01(`ts${bi}${s}`, 3) - 0.5, hash01(`ts${bi}${s}`, 5) - 0.5).multiplyScalar(0.22);
        tip.position.copy(end).add(jitter);
        tip.renderOrder = 62;
        group.add(tip);
      }
    });
    labels.push({ pos: { x: -0.3, y: apexR * 1.62, z: -0.4 }, zh: '顶端树突丛', latin: 'Apical tuft' });
  }

  if (spec.striated) {
    // 肌原纤维束: 沿长轴（x）平行排列的横纹管束 —— 肌节 A/I 带明暗条纹 + Z 线金亮线（顶点色着色）
    const fiberN = perf ? 7 : 10;
    const SARCO = 0.62; // 肌节周期（模型单位, ≈2μm 比例感）
    const myoParts: { geo: THREE.BufferGeometry }[] = [];
    const ax = 2.02, ay = 0.7, az = 0.66; // rod 形状椭球主轴（与 cell-shape.ts 一致）
    for (let i = 0; i < fiberN; i++) {
      const a = (i / fiberN) * Math.PI * 2 + 0.3;
      const ring = i % 2 === 0 ? 0.6 : 0.92;
      const fy = Math.cos(a) * ring * ay * R * 0.5;
      const fz = Math.sin(a) * ring * az * R * 0.5;
      const xr = ax * R * Math.sqrt(Math.max(0.08, 1 - (fy / (ay * R)) ** 2 - (fz / (az * R)) ** 2)) * 0.86;
      const bow = (hash01(`mf${i}`) - 0.5) * 0.5;
      const fpts = [
        new THREE.Vector3(-xr, fy, fz),
        new THREE.Vector3(0, fy + bow, fz + bow * 0.4),
        new THREE.Vector3(xr, fy, fz),
      ];
      const rad = 0.13 + hash01(`mfr${i}`) * 0.045;
      myoParts.push({ geo: track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fpts), 42, rad, 8)) });
    }
    const myoGeo = track(mergeGeoms(myoParts));
    // 逐顶点横纹着色: Z 线金亮 / A 带暗 / I 带亮（周期 SARCO）
    {
      const posA = myoGeo.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(posA.count * 3);
      for (let i = 0; i < posA.count; i++) {
        const u = (((posA.getX(i) / SARCO) % 1) + 1) % 1;
        let r: number, g: number, b: number;
        if (u < 0.05 || u > 0.95) { r = 1.0; g = 0.84; b = 0.36; } // Z 线（amber 亮线）
        else if (u > 0.2 && u < 0.42) { r = 0.32; g = 0.46; b = 0.52; } // A 带暗带
        else { r = 0.78; g = 0.95; b = 0.88; } // I 带亮带
        colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
      }
      myoGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const myoMesh = new THREE.Mesh(myoGeo, track(new THREE.MeshStandardMaterial({
      vertexColors: true,
      emissive: '#ffffff',
      emissiveIntensity: 0.1 * dim,
      roughness: 0.42,
      transparent: true,
      opacity: 0.88 * dim,
    })));
    myoMesh.renderOrder = 46;
    group.add(myoMesh);
    labels.push({ pos: { x: 0, y: -R * 0.78, z: R * 0.3 }, zh: '肌原纤维（肌节横纹）', latin: 'Myofibril' });
  }

  if (spec.intercalated) {
    // 闰盘: 端-端阶梯折面盘（横齿交错剪影）+ 缝隙连接（Cx43）金点
    const discMat = mat({ color: '#fde68a', emissive: '#b45309', emissiveIntensity: 0.45, opacity: 0.85, roughness: 0.35 });
    const gapMat = track(new THREE.MeshStandardMaterial({ color: '#fef3c7', emissive: '#fbbf24', emissiveIntensity: 0.9 * dim, transparent: true, opacity: 0.95 * dim }));
    for (const sx of [-1, 1]) {
      const xEnd = 1.72 * R * sx;
      const segs = [
        { r: 0.5, dx: 0 },
        { r: 0.37, dx: -0.13 * sx },
        { r: 0.245, dx: -0.26 * sx },
      ];
      segs.forEach((seg, si) => {
        const disc = new THREE.Mesh(track(new THREE.CylinderGeometry(seg.r * R, seg.r * R, 0.055, 26, 1)), discMat);
        disc.rotation.z = Math.PI / 2;
        disc.scale.set(1, 1, 0.9); // y/z 椭圆截面贴合（local z → world z）
        disc.position.set(xEnd + seg.dx * R * 0.12, si * 0.18 * sx, si * 0.12 * sx);
        disc.renderOrder = 63;
        group.add(disc);
      });
      // 缝隙连接亮点（Cx43 斑块）
      const gapGeo = track(new THREE.SphereGeometry(0.085, 6, 6));
      for (let g = 0; g < 7; g++) {
        const ga = (g / 7) * Math.PI * 2 + hash01(`gd${sx}${g}`) * 0.6;
        const gr = (0.18 + hash01(`gdr${sx}${g}`) * 0.26) * R;
        const gap = new THREE.Mesh(gapGeo, gapMat);
        gap.position.set(xEnd - 0.06 * sx, Math.cos(ga) * gr, Math.sin(ga) * gr * 0.9);
        gap.renderOrder = 63;
        group.add(gap);
      }
    }
    labels.push({ pos: { x: 1.95 * R, y: R * 0.5, z: 0 }, zh: '闰盘（缝隙连接）', latin: 'Intercalated disc' });
  }

  if (spec.stressFibers) {
    // 应力纤维: 沿长轴（x）平行的粗 actin 束（贯穿胞质）+ 两端黏着斑亮点 —— 肌成纤维标志
    const sfMat = mat({ color: '#fecdd3', emissive: '#fb7185', emissiveIntensity: 0.3, roughness: 0.4, opacity: 0.62 });
    const faMat = track(new THREE.MeshStandardMaterial({ color: '#fef3c7', emissive: '#fbbf24', emissiveIntensity: 0.8 * dim, transparent: true, opacity: 0.9 * dim }));
    const n = perf ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.5;
      const ring = 0.5 + hash01(`sfr${i}`) * 0.26;
      const fy = Math.cos(a) * ring * 0.6 * R;
      const fz = Math.sin(a) * ring * 0.66 * R;
      const xr = 1.45 * R * Math.sqrt(Math.max(0.1, 1 - (fy / (0.68 * R)) ** 2 - (fz / (0.74 * R)) ** 2));
      const fpts = [
        new THREE.Vector3(-xr, fy, fz),
        new THREE.Vector3(0, fy + (hash01(`sfb${i}`) - 0.5) * 0.4, fz),
        new THREE.Vector3(xr, fy, fz),
      ];
      const fiber = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fpts), 30, 0.085, 7)), sfMat);
      fiber.renderOrder = 45;
      group.add(fiber);
      // 两端黏着斑（focal adhesion 亮点）
      const faGeo = track(new THREE.SphereGeometry(0.1, 6, 6));
      for (const ex of [-1, 1]) {
        const fa = new THREE.Mesh(faGeo, faMat);
        fa.position.set(ex * xr * 0.98, fy, fz);
        fa.renderOrder = 45;
        group.add(fa);
      }
    }
    labels.push({ pos: { x: 0, y: -R * 0.72, z: R * 0.4 }, zh: '应力纤维（α-SMA 束）', latin: 'Stress fiber' });
  }

  if (spec.surfaceFolds) {
    // T 细胞表面微褶皱 —— 全表面短细刺（静止淋巴细胞膜褶皱; 比微绒毛短 55%）
    const geo = track(new THREE.CapsuleGeometry(0.022, 0.21, 3, 7));
    const m8 = track(new THREE.MeshStandardMaterial({ color: '#5eead4', emissive: '#0d9488', emissiveIntensity: 0.5 * dim, transparent: true, opacity: 0.6 * dim, depthWrite: false }));
    const count = Math.round(150 * q) + 25;
    const inst = new THREE.InstancedMesh(geo, m8, count);
    const mm = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    fibSphere(count, 1).forEach((p, i) => {
      dir.set(p.x, p.y, p.z).normalize();
      const rr = cellSurf(dir, R, SHAPE, 0.11);
      qq.setFromUnitVectors(up, dir);
      const s = 0.75 + hash01(`sf${i}`) * 0.55;
      mm.compose(new THREE.Vector3(dir.x * rr, dir.y * rr, dir.z * rr), qq, new THREE.Vector3(s, s * (0.8 + hash01(`sfl${i}`) * 0.7), s));
      inst.setMatrixAt(i, mm);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 61;
    group.add(inst);
  }

  if (spec.basalLamina) {
    // 基底膜: 底部薄层基板（laminin/IV 型胶原网剪影, 微弱发光纹理盘）
    const bDir = new THREE.Vector3(0, -1, 0);
    const bR = cellSurf(bDir, R, SHAPE, -0.3);
    const disc = new THREE.Mesh(
      track(new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.075, 36)),
      mat({ color: '#e2e8f0', emissive: '#94a3b8', emissiveIntensity: 0.22, roughness: 0.55, opacity: 0.5, normalMap: coatNormal, normalScale: 0.9 }),
    );
    disc.position.y = bR - 0.05;
    disc.renderOrder = 63;
    group.add(disc);
    labels.push({ pos: { x: R * 0.55, y: bR - 0.3, z: 0 }, zh: '基底膜（基板）', latin: 'Basal lamina' });
  }

  if (spec.bileCanaliculus) {
    // 胆小管: 相邻肝细胞间顶面管状凹陷 —— 半嵌膜内的发光管道 + 周围短微绒毛环 + 胆汁微粒
    const canMat = mat({ color: '#fbbf24', emissive: '#b45309', emissiveIntensity: 0.6, roughness: 0.28, opacity: 0.92, clearcoat: 0.4 });
    const cDir = new THREE.Vector3(0.42, 0.86, 0.28).normalize();
    const cR = cellSurf(cDir, R, SHAPE, -0.34);
    const t1 = new THREE.Vector3().crossVectors(cDir, new THREE.Vector3(0, 1, 0)).normalize();
    const cpts = [
      cDir.clone().multiplyScalar(cR).addScaledVector(t1, -1.8),
      cDir.clone().multiplyScalar(cR - 0.08),
      cDir.clone().multiplyScalar(cR).addScaledVector(t1, 1.8),
    ];
    const canal = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cpts), 28, 0.28, 12)), canMat);
    canal.renderOrder = 62;
    group.add(canal);
    // 管周短微绒毛环（肝细胞微绒毛面向胆小管的真实位形）
    {
      const mvGeo = track(new THREE.CapsuleGeometry(0.028, 0.22, 3, 6));
      const mvMat = track(new THREE.MeshStandardMaterial({ color: '#2dd4bf', emissive: '#0d9488', emissiveIntensity: 0.45 * dim, transparent: true, opacity: 0.6 * dim, depthWrite: false }));
      const mvN = 14;
      const mvInst = new THREE.InstancedMesh(mvGeo, mvMat, mvN);
      const mm = new THREE.Matrix4();
      const qq = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < mvN; i++) {
        const tt = i / mvN;
        const cp = new THREE.CatmullRomCurve3(cpts).getPoint(tt);
        const off = new THREE.Vector3(hash01(`cmv${i}`) - 0.5, hash01(`cmv${i}`, 3) - 0.5, hash01(`cmv${i}`, 5) - 0.5).normalize().multiplyScalar(0.42);
        qq.setFromUnitVectors(up, off.clone().normalize());
        const s = 0.8 + hash01(`cms${i}`) * 0.4;
        mm.compose(cp.add(off), qq, new THREE.Vector3(s, s, s));
        mvInst.setMatrixAt(i, mm);
      }
      mvInst.instanceMatrix.needsUpdate = true;
      mvInst.renderOrder = 62;
      group.add(mvInst);
    }
    // 胆汁微粒（管内发光小点）
    {
      const bileGeo = track(new THREE.SphereGeometry(0.055, 6, 6));
      const bileMat = track(new THREE.MeshStandardMaterial({ color: '#fde68a', emissive: '#f59e0b', emissiveIntensity: 1.0 * dim, transparent: true, opacity: 0.95 * dim }));
      for (let i = 0; i < 5; i++) {
        const bp = new THREE.CatmullRomCurve3(cpts).getPoint(0.18 + i * 0.16);
        const bile = new THREE.Mesh(bileGeo, bileMat);
        bile.position.copy(bp);
        bile.renderOrder = 62;
        group.add(bile);
      }
    }
    labels.push({ pos: cDir.clone().multiplyScalar(cR + 1.5).addScaledVector(t1, 1.2), zh: '胆小管（胆汁）', latin: 'Bile canaliculus' });
  }

  if (spec.ttubules) {
    // T 小管（横小管）: 肌膜在 Z 线位周期性内陷（与肌节周期对齐）+ 连接肌浆网终端池 = 二联体/三联体位形
    const SARCO = 0.62; // 与肌原纤维肌节周期一致
    const ax = 2.02, ay = 0.7, az = 0.66; // rod 主轴（与 cell-shape.ts 一致）
    const stationStep = perf ? SARCO * 3 : SARCO * 2;
    const xMax = 1.52 * R;
    /** 两点间胶囊（默认 Y 轴向 → 定向） */
    const capsuleBetween = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
      const dir = b.clone().sub(a);
      const len = Math.max(0.06, dir.length() - r * 1.2);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      const matrix = new THREE.Matrix4().compose(
        a.clone().add(b).multiplyScalar(0.5),
        quat,
        new THREE.Vector3(1, 1, 1),
      );
      return { geo: track(new THREE.CapsuleGeometry(r, len, 4, 8)), matrix };
    };
    const ttParts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    const jsrParts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    for (let x0 = -xMax; x0 <= xMax; x0 += stationStep) {
      // 该站位处椭球横截面收缩因子
      const sh = Math.sqrt(Math.max(0.12, 1 - (x0 / (ax * R * 0.98)) ** 2));
      const perStation = 6;
      const stationSeed = Math.round(x0 * 10);
      for (let k = 0; k < perStation; k++) {
        const th = (k / perStation) * Math.PI * 2 + hash01(`tt${stationSeed}`) * 0.8;
        const sy = Math.cos(th) * ay * R * sh;
        const sz = Math.sin(th) * az * R * sh;
        // 横管: 肌膜内陷 → 向心深入（0.62 深度比）
        ttParts.push(capsuleBetween(
          new THREE.Vector3(x0, sy * 0.98, sz * 0.98),
          new THREE.Vector3(x0, sy * 0.34, sz * 0.34),
          0.085,
        ));
        // 连接肌浆网终端池（terminal cisterna 扁囊, 贴横管内端 —— 钙释放单元）
        jsrParts.push({
          geo: track(new THREE.SphereGeometry(0.17, 10, 8)),
          matrix: new THREE.Matrix4().compose(
            new THREE.Vector3(x0, sy * 0.44, sz * 0.44),
            new THREE.Quaternion(),
            new THREE.Vector3(1, 0.52, 0.78),
          ),
        });
      }
    }
    // 纵行肌浆网（longitudinal SR 网管, 环绕肌原纤维束走行）
    const lsrParts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    const nL = perf ? 6 : 10;
    for (let i = 0; i < nL; i++) {
      const th = (i / nL) * Math.PI * 2 + 0.3;
      const ring = 0.74 + hash01(`lsr${i}`) * 0.18;
      const fy = Math.cos(th) * ay * R * ring;
      const fz = Math.sin(th) * az * R * ring;
      const xr = 1.5 * R;
      const bow = (hash01(`lsrb${i}`) - 0.5) * 0.5;
      const fpts = [
        new THREE.Vector3(-xr, fy, fz),
        new THREE.Vector3(0, fy + bow, fz + bow * 0.4),
        new THREE.Vector3(xr, fy, fz),
      ];
      lsrParts.push({ geo: track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fpts), 24, 0.034, 6)) });
    }
    const tt = new THREE.Mesh(track(mergeGeoms(ttParts)), mat({
      color: '#14b8a6', emissive: '#0d9488', emissiveIntensity: 0.3,
      opacity: transOn ? 0.9 : 0.5, transmission: transOn ? 0.25 : 0, thickness: 0.3, roughness: 0.4,
    }));
    tt.renderOrder = 61;
    group.add(tt);
    const jsr = new THREE.Mesh(track(mergeGeoms(jsrParts)), mat({
      color: '#34d399', emissive: '#059669', emissiveIntensity: 0.5,
      opacity: 0.85, roughness: 0.35, clearcoat: 0.3,
    }));
    jsr.renderOrder = 62;
    group.add(jsr);
    const lsr = new THREE.Mesh(track(mergeGeoms(lsrParts)), mat({
      color: '#2dd4bf', emissive: '#0d9488', emissiveIntensity: 0.35,
      opacity: 0.55, roughness: 0.4,
    }));
    lsr.renderOrder = 60;
    group.add(lsr);
    labels.push({ pos: { x: R * 1.05, y: -ay * R * 0.82, z: az * R * 0.55 }, zh: 'T 小管（Z 线位内陷）', latin: 'T-tubule' });
    labels.push({ pos: { x: -R * 1.25, y: ay * R * 0.85, z: 0 }, zh: '肌浆网（Ca²⁺ 库）', latin: 'Sarcoplasmic reticulum' });
  }

  if (spec.micronuclei) {
    // 微核: 染色体不稳定（CIN）标志 —— 有丝分裂滞后染色体形成的小核; 破裂微核暴露胞质 DNA（cGAS-STING 感知起点）
    const chromMat = mat({ color: '#be3f68', emissive: '#9d174d', emissiveIntensity: 0.55, roughness: 0.6, opacity: 0.82, clearcoat: 0.2 });
    const envMat = mat({ color: '#e879f9', transmission: transOn ? 0.25 : 0, thickness: 0.3, emissive: '#a21caf', emissiveIntensity: 0.16, opacity: transOn ? 1 : 0.42, roughness: 0.4 });
    const rimMat = track(new THREE.MeshStandardMaterial({ color: '#f5d0fe', emissive: '#c026d3', emissiveIntensity: 0.85 * dim, transparent: true, opacity: 0.95 * dim }));
    const spillMat = track(new THREE.MeshStandardMaterial({ color: '#f9a8d4', emissive: '#be185d', emissiveIntensity: 0.8 * dim, transparent: true, opacity: 0.85 * dim }));
    const spillGeo = track(new THREE.SphereGeometry(0.055, 6, 5));
    const sites: { dir: THREE.Vector3; r: number; ruptured: boolean }[] = [
      { dir: new THREE.Vector3(0.82, 0.35, 0.45).normalize(), r: 0.74, ruptured: true },
      { dir: new THREE.Vector3(-0.55, 0.62, -0.56).normalize(), r: 0.58, ruptured: false },
    ];
    sites.forEach((s, si) => {
      // v6: 微核贴核外放置（避开成形核, 而非旧球形 N×1.42 盲区）
      const c = s.dir.clone().multiplyScalar(nucExit(s.dir) + 0.85 + s.r);
      const body = new THREE.Mesh(track(displacedSphere(s.r, 2, 3.2, s.r * 0.16, 47 + si * 13)), chromMat);
      body.position.copy(c);
      body.renderOrder = 47;
      group.add(body);
      if (s.ruptured) {
        // 破裂被膜: 球壳留豁口（phi 扇区缺失）+ 豁口发光边缘环 + 胞质 DNA 溢出颗粒
        const gap = 1.15;
        const env = new THREE.Mesh(track(new THREE.SphereGeometry(s.r * 1.18, 24, 18, gap / 2, Math.PI * 2 - gap)), envMat);
        env.renderOrder = 48;
        const rim = new THREE.Mesh(track(new THREE.TorusGeometry(s.r * 1.18, 0.03, 8, 32, Math.PI * 2 - gap)), rimMat);
        rim.rotation.z = gap / 2;
        rim.renderOrder = 49;
        const wrap = new THREE.Group();
        wrap.position.copy(c);
        wrap.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), s.dir);
        wrap.add(env, rim);
        group.add(wrap);
        for (let d = 0; d < 5; d++) {
          const spill = new THREE.Mesh(spillGeo, spillMat);
          const along = s.r * 1.25 + d * 0.19;
          const jitter = new THREE.Vector3(
            (hash01(`mn${si}${d}`) - 0.5) * 0.22,
            (hash01(`mn${si}${d}`, 3) - 0.5) * 0.22,
            (hash01(`mn${si}${d}`, 5) - 0.5) * 0.22,
          );
          spill.position.copy(c).addScaledVector(s.dir, along).add(jitter);
          spill.renderOrder = 49;
          group.add(spill);
        }
      } else {
        const env = new THREE.Mesh(track(new THREE.SphereGeometry(s.r * 1.18, 24, 18)), envMat);
        env.position.copy(c);
        env.renderOrder = 48;
        group.add(env);
      }
    });
    labels.push({ pos: sites[0].dir.clone().multiplyScalar(nucExit(sites[0].dir) + 2.1), zh: '微核（基因组不稳定）', latin: 'Micronucleus' });
  }

  if (spec.tcrClusters) {
    // TCR/CD3 微簇: 膜面小簇（中心 + 卫星, TCR-CD3 复合体聚集剪影 —— 免疫突触前体）
    const geo = track(new THREE.SphereGeometry(0.048, 6, 5));
    const m9 = track(new THREE.MeshStandardMaterial({ color: '#fda4af', emissive: '#fb7185', emissiveIntensity: 0.65 * dim, transparent: true, opacity: 0.82 * dim, depthWrite: false }));
    const clusters = Math.round(9 * q) + 3;
    const perC = 6;
    const inst = new THREE.InstancedMesh(geo, m9, clusters * perC);
    const mm = new THREE.Matrix4();
    let idx = 0;
    fibSphere(clusters, 1).forEach((base, c) => {
      const dir = new THREE.Vector3(base.x, base.y, base.z).normalize();
      const rr = cellSurf(dir, R, SHAPE, 0.08);
      const center = new THREE.Vector3(dir.x * rr, dir.y * rr, dir.z * rr);
      mm.makeScale(1.3, 1.3, 1.3);
      mm.setPosition(center.x, center.y, center.z);
      inst.setMatrixAt(idx++, mm);
      for (let s = 0; s < perC - 1; s++) {
        const off = new THREE.Vector3(
          hash01(`tc${c}${s}`) - 0.5,
          hash01(`tc${c}${s}`, 3) - 0.5,
          hash01(`tc${c}${s}`, 7) - 0.5,
        ).normalize().multiplyScalar(0.15 + hash01(`tcr${c}${s}`) * 0.07);
        const p = center.clone().add(off);
        const sc = 0.75 + hash01(`tcs${c}${s}`) * 0.4;
        mm.makeScale(sc, sc, sc);
        mm.setPosition(p.x, p.y, p.z);
        inst.setMatrixAt(idx++, mm);
      }
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 62;
    group.add(inst);
    const lp = sph(R * 1.28, 0.9, 2.0);
    labels.push({ pos: lp, zh: 'TCR/CD3 微簇', latin: 'TCR microcluster' });
  }

  if (spec.terminalWeb) {
    // 终末网: 顶面微绒毛根部的横行微丝网（rootlet 交织层 —— 刷状缘机械整联）
    const apexY = cellSurf(new THREE.Vector3(0, 1, 0), R, SHAPE);
    const webY = apexY - 0.45;
    const webR = 0.58 * R;
    const geo = track(new THREE.CapsuleGeometry(0.017, 0.5, 3, 6));
    const m10 = track(new THREE.MeshStandardMaterial({ color: '#5eead4', emissive: '#0d9488', emissiveIntensity: 0.4 * dim, transparent: true, opacity: 0.42 * dim, depthWrite: false }));
    const count = Math.round(44 * q) + 12;
    const inst = new THREE.InstancedMesh(geo, m10, count);
    const mm = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const a = hash01(`tw${i}`) * Math.PI * 2;
      const rr = Math.sqrt(hash01(`twr${i}`)) * webR;
      const px = Math.cos(a) * rr;
      const pz = Math.sin(a) * rr * 0.85;
      const yaw = hash01(`twy${i}`) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
      qq.setFromUnitVectors(up, dir);
      const s = 0.6 + hash01(`tws${i}`) * 0.8;
      mm.compose(
        new THREE.Vector3(px, webY + (hash01(`twz${i}`) - 0.5) * 0.18, pz),
        qq,
        new THREE.Vector3(s, s * (0.8 + hash01(`twl${i}`) * 0.6), s),
      );
      inst.setMatrixAt(i, mm);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 61;
    group.add(inst);
    labels.push({ pos: { x: webR * 0.95, y: webY + 0.35, z: 0 }, zh: '终末网（微绒毛根微丝）', latin: 'Terminal web' });
  }

  if (spec.desmosomes) {
    // 桥粒: 侧膜斑块（角蛋白中间丝锚定点 —— 上皮机械强度铆钉）
    const plaqueGeo = track(new THREE.SphereGeometry(0.09, 8, 6));
    const plaqueMat = track(new THREE.MeshStandardMaterial({ color: '#fde68a', emissive: '#f59e0b', emissiveIntensity: 0.75 * dim, transparent: true, opacity: 0.92 * dim }));
    const n = 7;
    for (let i = 0; i < n; i++) {
      const lon = (i / n) * Math.PI * 2 + 0.4;
      const lat = (hash01(`ds${i}`) - 0.5) * 0.85;
      const d = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      const rr = cellSurf(d, R, SHAPE, -0.03);
      const p = new THREE.Mesh(plaqueGeo, plaqueMat);
      p.position.set(d.x * rr, d.y * rr, d.z * rr);
      p.scale.set(1.5, 0.7, 1.05);
      p.renderOrder = 62;
      group.add(p);
    }
    labels.push({ pos: sph(R * 1.3, 0.15, 3.8), zh: '桥粒（中间丝锚定）', latin: 'Desmosome' });
  }

  /* ================= 胞外悬浮微粒（浸没感） ================= */
  const sprite = glowSpriteTexture();
  const makeCloud = (count: number, size: number, rMin: number, rMax: number, seed: number) => {
    const posArr = new Float32Array(count * 3);
    const colArr = new Float32Array(count * 3);
    const col = new THREE.Color();
    const palette = ['#5eead4', '#fbbf24', '#fb7185', '#a7f3d0'];
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(0, 0, 1).setFromSphericalCoords(1, Math.acos((hash01(`su${i}`, seed) - 0.5) * 2), hash01(`su${i}`, seed + 3) * Math.PI * 2);
      const rr = rMin + hash01(`sur${i}`, seed) * (rMax - rMin);
      posArr[i * 3] = dir.x * rr;
      posArr[i * 3 + 1] = dir.y * rr;
      posArr[i * 3 + 2] = dir.z * rr;
      col.set(palette[i % palette.length]).multiplyScalar(0.35 + hash01(`suc${i}`, seed) * 0.65);
      colArr[i * 3] = col.r;
      colArr[i * 3 + 1] = col.g;
      colArr[i * 3 + 2] = col.b;
    }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    const m7 = track(new THREE.PointsMaterial({
      map: sprite,
      size,
      transparent: true,
      opacity: 0.5 * dim,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    }));
    const cloud = new THREE.Points(geo, m7);
    cloud.renderOrder = 90;
    group.add(cloud);
    return cloud;
  };
  const suspA = makeCloud(Math.round(120 * q) + 20, 0.34, R * 1.28, R * 2.4, 5);
  const suspB = makeCloud(Math.round(90 * q) + 16, 0.2, R * 1.2, R * 2.9, 9);

  /* ================= 帧驱动动画 ================= */
  const update = (t: number) => {
    uTime.value = t;
    for (const m of mitos) {
      m.obj.position.y = m.baseY + Math.sin(t * 0.55 + m.phase) * 0.16;
      m.obj.rotation.y += 0.0016;
    }
    // 膜流动镶嵌: 脂双层缓慢对流 —— v6 修复: 刚体旋转仅在旋转对称形状（球状）下安全;
    // 杆/梭/柱等形状下旋转会把贴膜脂头/跨膜蛋白甩出窄轴膜面外, 改为微幅摆动（保留流动感）
    if (SHAPE === 'sphere') membraneGroup.rotation.y = t * 0.012;
    else membraneGroup.rotation.y = Math.sin(t * 0.4) * 0.018;
    // 胞质颗粒同理: 非球形状下整体旋转会穿膜, 改为微幅摆动
    if (SHAPE === 'sphere' || SHAPE === 'amoeboid') cytosol.rotation.y = t * 0.018;
    else cytosol.rotation.y = Math.sin(t * 0.5) * 0.02;
    for (let i = 0; i < nucleoli.length; i++) {
      const s = 1 + Math.sin(t * 1.1 + i) * 0.035;
      nucleoli[i].scale.setScalar(s);
    }
    suspA.rotation.y = t * 0.02;
    suspB.rotation.y = -t * 0.013;
    // 细胞呼吸（整体极微幅胀缩）
    const breathe = 1 + Math.sin(t * 0.42) * 0.004;
    group.scale.setScalar(breathe);
  };

  const dispose = () => {
    for (const d of disposables) d.dispose();
    group.clear();
  };

  return { group, update, labels, dispose };
}

/** 窄视口（移动端）优先保留的主要细胞器标注（前缀匹配）; 其余标签拥挤不可读, 隐藏。zh/latin 双语各自前缀匹配 */
const MAJOR_ORGANELLE_ZH = ['质膜', '核被膜', '核仁', '线粒体', '高尔基体', '溶酶体'];
const MAJOR_ORGANELLE_LATIN = ['Plasma membrane', 'Nuclear envelope', 'Nucleolus', 'Mitochondrion', 'Golgi apparatus', 'Lysosome'];

/** 细胞体组件（仅 dim/规格/画质变化时重建, 动画走 imperative 帧驱动） */
export const CellBody = ({ spec, tint, dim, showAnatomy, perf }: {
  spec: CellBodySpec;
  tint: string;
  dim: number;
  showAnatomy: boolean;
  /** 低端设备流畅模式（禁用折射/减实例） */
  perf?: boolean;
}) => {
  const { lang } = useLang();
  const build = useMemo(() => buildCellBody(spec, tint, dim, perf ?? false), [spec, tint, dim, perf]);
  useEffect(() => () => build.dispose(), [build]);
  // 窄视口（<640px）: 解剖标注仅保留主要细胞器, 避免移动端标签互相遮挡（zh/latin 前缀各自匹配）
  const isNarrow = useThree((s) => s.size.width) < 640;
  const visibleLabels = useMemo(
    () =>
      isNarrow
        ? build.labels.filter((l) =>
            lang === 'zh'
              ? MAJOR_ORGANELLE_ZH.some((m) => l.zh.startsWith(m))
              : MAJOR_ORGANELLE_LATIN.some((m) => l.latin.startsWith(m)),
          )
        : build.labels,
    [isNarrow, build, lang],
  );

  useFrame((state) => build.update(state.clock.elapsedTime));

  return (
    <>
      <primitive object={build.group} />
      {showAnatomy &&
        visibleLabels.map((l, i) => (
          <Html key={i} position={[l.pos.x, l.pos.y, l.pos.z]} center zIndexRange={[30, 0]} pointerEvents="none" style={{ pointerEvents: 'none' }}>
            {lang === 'zh' ? (
              <div className="anatomy-tag">
                <span className="anatomy-zh">{l.zh}</span>
                <span className="anatomy-latin">{l.latin}</span>
              </div>
            ) : (
              <div className="anatomy-tag">
                <span className="anatomy-zh">{l.latin}</span>
              </div>
            )}
          </Html>
        ))}
    </>
  );
};
