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
 *   8. 保真度 v10（参照用户高保真科学插画基准）:
 *      - 线粒体: 18 条深波形板层嵴 + 更有机的豆状外膜 + 透射加深（嵴腔可见性）
 *      - ER: 外周迷宫管网（三通节点 + 膜旁核糖体）—— "ER 遍布胞质"读感
 *      - 高尔基: 7 层曲面板叠 + 12 池间小管 + 11 反面出芽
 *      - 核孔复合体八重对称轮辐花冠; 异染色质双色调密集团块（38 丛 ×8-12 珠）
 *      - 中心粒 9×三联微管桶; 胞质分子拥挤 860+; 脂双层 1300 头; 胞质体积雾填充
 * 科学参照: Alberts MBoC 6th / Karp Cell & Molecular Biology 9th / cellimagelibrary
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { CellBodySpec, Vec3 } from '@/lib/simulation/layout3d';
import { NUCLEUS_FORM, SHAPE_NOISE, nucleusCenter, nucleusInstances, nucleusRadius, nucleusRayExit, shapeCrossRadius, shapeRadius, shapeXExtent, type ShapeKind } from '@/lib/simulation/cell-shape';
import { displaceGeometry, fbm3, fibSphere, hash01, mergeGeoms, sph } from './procedural';
import { glowSpriteTexture, organicNormalMap, roughnessMap, speckleNormalMap, stripeNormalMap } from './textures';
import { createTimeUniform, glowMaterial, organelleMaterial, volumeMaterial, REF, type TimeUniform } from './materials';
import { autophagyLevel, AUTOPHAGY_VISIBLE_THRESHOLD } from '@/lib/simulation/autophagy';
import { useLabStore } from '@/store/lab-store';
import { useLang } from '@/lib/i18n';

export interface AnatomyLabel {
  pos: Vec3;
  zh: string;
  latin: string;
  /** 条件可见: 'autophagy' = 仅自噬流激活（ULK1 > 阈值）时显示 */
  when?: 'autophagy';
}

export interface CellBodyBuild {
  group: THREE.Group;
  /** 帧驱动; ulk1 = 自噬驱动水平（0-1, 缺省 0 —— 无 ULK1 通路自噬系统静默） */
  update: (t: number, ulk1?: number) => void;
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
  // v11 图片级: 质膜几何细分 5（~20k 三角形）—— 剖面/剪影曲线丝滑无棱; 核系维持 4 避免双核叠加成本
  const memDetail = perf ? 3 : 5;
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

  const membraneGeo = track(shapedCellGeometry(R, memDetail, SHAPE));
  const membraneMat = mat({
    color: tint,
    // v11 图片级湿润透射: 透射↑（内部结构清晰透读）+ 清漆高光↑（湿生物膜油亮质感）+ 虹彩↑（脂质膜光泽）
    transmission: transOn ? 0.72 : 0,
    thickness: 1.7,
    roughness: 0.32,
    roughnessMap: memRough,
    normalMap: memNormal,
    normalScale: 0.55,
    clearcoat: 0.85,
    clearcoatRoughness: 0.18,
    iridescence: 0.45,
    sheen: 0.65,
    // v12 参照图: 高光移向浅蓝石板族（实测 145,175,207）
    sheenColor: REF.sheen,
    flow: { color: '#5a7a8a', strength: 0.1, scale: 0.3, speed: 0.05, rim: 0.24 },
  });
  const membrane = new THREE.Mesh(membraneGeo, membraneMat);
  membrane.renderOrder = 80;
  membraneGroup.add(membrane);

  // 外缘呼吸辉光壳（v6: 随类型化膜面轮廓 —— 旧球壳会在杆状/梭状/柱状窄轴处凸出成"圆球轮廓"）
  const glowGeo = track(shapedCellGeometry(R * 1.075, perf ? 2 : 3, SHAPE));
  const glow = new THREE.Mesh(glowGeo, track(glowMaterial(tint, 0.05 * dim)));
  glow.renderOrder = 70;
  membraneGroup.add(glow);

  // 胞质半透明体积（v11 图片级: Fresnel 光程渐变 + FBM 环流微光 —— 替代平面色填充的"果冻状原生质体"读感;
  //  BackSide 内缩膜面背景层, 不遮挡任何内部结构, 与雾/景深叠加产生体积深度）
  {
    const fillGeo = track(shapedCellGeometry(R, perf ? 2 : 3, SHAPE));
    fillGeo.scale(0.88, 0.88, 0.88);
    const tintCore = new THREE.Color(tint).multiplyScalar(0.66);
    const tintRim = new THREE.Color(tint).lerp(new THREE.Color('#7a726c'), 0.3);
    // v12 参照图: 流光向浅蓝石板族偏移（实测 145,175,207）
    const tintFlow = new THREE.Color(tint).lerp(new THREE.Color('#91afcf'), 0.45);
    const fill = new THREE.Mesh(fillGeo, track(volumeMaterial({
      coreColor: `#${tintCore.getHexString()}`,
      rimColor: `#${tintRim.getHexString()}`,
      flowColor: `#${tintFlow.getHexString()}`,
      baseAlpha: 0.33,
      coreBoost: 0.24,
      rimBoost: 0.14,
      flowStrength: 0.16,
      scale: 0.32,
      speed: 0.045,
      uTime,
      dim,
    })));
    fill.renderOrder = 16;
    membraneGroup.add(fill);
  }

  // 脂双层脂头（外叶/内叶, 缓慢对流 = 膜流动性）—— v10: 1300 头加密（高保真插画的"磷脂分子镶嵌"读感）
  const headGeo = track(new THREE.SphereGeometry(0.066, 8, 6));
  const headCount = Math.round(1300 * q);
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
  const outerLeaflet = makeLeaflet(0.05, 0.72, '#4a6a7e', ['#8498ac', '#6a8298', '#94a8bc', '#74889e']);
  const innerLeaflet = makeLeaflet(-0.05, 0.55, '#3a4a5a', ['#5a6a7e', '#4a5a6a', '#64748a']);
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
    // v12 参照图: 跨膜蛋白石板族低发射
    emissive: '#3e4a5a',
    emissiveIntensity: 0.22 * dim,
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
    // v12 参照图: 跨膜蛋白调色板低饱和（石板/暖棕/灰紫交替 —— 受体/转运体/胆固醇嵌镶读感）
    const palette = ['#74889e', '#8a6a4a', '#8a7a9a', '#8498ac'];
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
      // v12 参照图: 糖萼浅石板族低发射
      color: '#8498ac',
      emissive: '#4a5a6e',
      emissiveIntensity: 0.14 * dim,
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
    // v12 参照图: 核被膜熏衣草灰紫族（实测 105,100,111）—— 高饱和玫瑰退役
    color: REF.nucEnv,
    transmission: transOn ? 0.52 : 0,
    thickness: 0.75,
    roughness: 0.3,
    normalMap: orgNormal,
    normalScale: 0.4,
    clearcoat: 0.35,
    sheen: 0.4,
    sheenColor: '#b8aec4',
    opacity: transOn ? 1 : 0.4,
    flow: { color: '#8a7a9a', strength: 0.1, scale: 0.5, speed: 0.04, rim: 0.28 },
  });
  /* ---- v8 多核循环: 肝细胞双核（每核独立包膜/核孔/染色质/核仁; 主核承载标注） ---- */
  const nucleiInst = nucleusInstances(SHAPE, R);
  const nucleoli: THREE.Mesh[] = [];
  const nucleolusSpeckles: THREE.InstancedMesh[] = [];
  // 共享染色质资源（双核同材质/几何, 形态由各自种子决定）
  const heteroGeo = track(new THREE.SphereGeometry(0.068, 7, 6));
  // 异染色质（v12 参照图: 深紫灰族 —— 低饱和紧致染色质读感）
  const heteroMat = mat({ color: '#ffffff', emissive: REF.hetero, emissiveIntensity: 0.34, roughness: 0.6, opacity: 0.78 });
  const HETERO_PALETTE = ['#6a5578', '#5d4a6e', '#7a6288', '#63527a', '#715a86'];
  for (const nucInst of nucleiInst) {
    const primary = nucInst.tag === 'A';
    const tag = nucInst.tag;
    const seed = primary ? 7 : 23; // 双核各自独立 FBM 形态
    const nucCK = new THREE.Vector3(nucInst.center.x, nucInst.center.y, nucInst.center.z);
    const Nn = N * nucInst.scale;
    /** 该核面半径（含 FBM 局部起伏; ofs 正外负内） */
    const nucSurfK = (dir: THREE.Vector3, ofs = 0): number => {
      const d = dir.clone().normalize();
      return nucleusRadius(d, SHAPE, Nn) + (fbm3(d.x * NUC_FREQ, d.y * NUC_FREQ, d.z * NUC_FREQ, 3, seed) - 0.5) * 2 * nucAmp + ofs;
    };
    /** 该核面上世界坐标点 */
    const nucPointK = (dir: THREE.Vector3, ofs = 0): THREE.Vector3 => {
      const d = dir.clone().normalize();
      const r = Math.max(0.1, nucSurfK(d, ofs));
      return new THREE.Vector3(nucCK.x + d.x * r, nucCK.y + d.y * r, nucCK.z + d.z * r);
    };
    /** 该核内世界坐标点（frac ∈ 0..核面, 沿 dir 自核中心） */
    const nucInnerK = (dir: THREE.Vector3, frac: number): THREE.Vector3 => {
      const d = dir.clone().normalize();
      const r = Math.max(0.1, nucleusRadius(d, SHAPE, Nn) * Math.min(1, Math.max(0, frac)) - 0.25);
      return new THREE.Vector3(nucCK.x + d.x * r, nucCK.y + d.y * r, nucCK.z + d.z * r);
    };

    const nucOuterGeo = track(shapedNucleusGeometry(Nn, detail, SHAPE, NUC_FREQ, nucAmp, seed));
    const nucOuter = new THREE.Mesh(nucOuterGeo, nucMat);
    nucOuter.position.copy(nucCK);
    nucOuter.renderOrder = 50;
    const nucInner = new THREE.Mesh(track(shapedNucleusGeometry(Nn, detail - 1, SHAPE, NUC_FREQ, nucAmp, seed, -0.22)), nucMat);
    nucInner.position.copy(nucCK);
    nucInner.renderOrder = 50;
    group.add(nucOuter, nucInner);

    const nucleoplasm = new THREE.Mesh(
      track(shapedNucleusGeometry(Nn, 3, SHAPE, NUC_FREQ, nucAmp, seed, -0.26)),
      track(volumeMaterial({
        // v12 参照图: 核质熏衣草灰紫族（实测 105,100,111）
        coreColor: '#3d3550',
        rimColor: '#655d72',
        flowColor: '#8a7fa0',
        baseAlpha: 0.15,
        coreBoost: 0.11,
        rimBoost: 0.05,
        flowStrength: 0.1,
        scale: 0.55,
        speed: 0.035,
        uTime,
        dim,
      })),
    );
    nucleoplasm.position.copy(nucCK);
    nucleoplasm.renderOrder = 40;
    group.add(nucleoplasm);

    // 核孔复合体: 胞质环 + 核质环 + 中央栓 + 核篮（四部件共享实例矩阵）
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
      // 八重对称轮辐花冠（v10: 胞质环上 8 根辐条 —— 高保真插画的 NPC "花冠"剪影）
      const spokes = (() => {
        const spokeParts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
        for (let s8 = 0; s8 < 8; s8++) {
          const a8 = (s8 / 8) * Math.PI * 2;
          const spoke = track(new THREE.CapsuleGeometry(0.017, 0.13, 3, 5));
          spoke.rotateZ(Math.PI / 2);
          spoke.translate(0.152, 0, 0.09);
          spokeParts.push({ geo: spoke, matrix: new THREE.Matrix4().makeRotationZ(a8) });
        }
        return track(mergeGeoms(spokeParts));
      })();
      const geos = perf ? [cytoRing, nucRing, plug] : [cytoRing, nucRing, plug, basket, spokes];
      const count = Math.round(60 * q) + 4;
      const mm = new THREE.Matrix4();
      const qq = new THREE.Quaternion();
      const zAxis = new THREE.Vector3(0, 0, 1);
      const dir = new THREE.Vector3();
      const mats: THREE.Matrix4[] = [];
      fibSphere(count, 1).forEach((p, i) => {
        dir.set(p.x, p.y, p.z).normalize();
        const r = nucSurfK(dir, 0.02);
        qq.setFromUnitVectors(zAxis, dir);
        const s = (0.95 + hash01(`npc${tag}${i}`) * 0.25) * 1.15;
        const m = new THREE.Matrix4().compose(new THREE.Vector3(nucCK.x + dir.x * r, nucCK.y + dir.y * r, nucCK.z + dir.z * r), qq, new THREE.Vector3(s, s, s));
        mats.push(m);
      });
      for (const g of geos) {
        const inst = new THREE.InstancedMesh(g, npcMat, mats.length);
        mats.forEach((m, i) => inst.setMatrixAt(i, m));
        inst.instanceMatrix.needsUpdate = true;
        inst.renderOrder = 55;
        group.add(inst);
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
            const ang = (f / filN) * Math.PI * 2 + hash01(`nf${tag}${i}${f}`) * 0.6;
            const tilt = 0.6 + hash01(`nft${tag}${i}${f}`) * 0.3; // ~34°-51° 外倾
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
    if (primary) {
      labels.push({ pos: nucPointK(new THREE.Vector3(Math.cos(0.35) * Math.cos(1.9), Math.sin(0.35), Math.cos(0.35) * Math.sin(1.9)), 0.42), zh: '核孔复合体', latin: 'Nuclear pore complex' });
      const topP = nucPointK(new THREE.Vector3(0, 1, 0), 0.2);
      labels.push({ pos: { x: topP.x, y: topP.y + 0.55, z: topP.z }, zh: '核被膜（双层）', latin: 'Nuclear envelope' });
    }

    // 外周异染色质（致密, 贴内层核膜 —— 真实核型边集化）
    {
      const clumps = Math.round(38 * q) + 10;
      const beads: THREE.Matrix4[] = [];
      const mm = new THREE.Matrix4();
      const off = new THREE.Vector3();
      for (let c = 0; c < clumps; c++) {
        const lat = (hash01(`hc${tag}${c}`) - 0.5) * 2.6;
        const lon = hash01(`hc${tag}${c}`, 3) * Math.PI * 2;
        const cp = nucPointK(new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)), -0.34);
        const beadsPer = 7 + Math.floor(hash01(`hc${tag}${c}`, 7) * 5);
        for (let b = 0; b < beadsPer; b++) {
          off.set(hash01(`hb${tag}${c}${b}`) - 0.5, hash01(`hb${tag}${c}${b}`, 3) - 0.5, hash01(`hb${tag}${c}${b}`, 5) - 0.5).normalize().multiplyScalar(0.09 + hash01(`hb${tag}${c}${b}`, 9) * 0.13);
          const s = 0.7 + hash01(`hb${tag}${c}${b}`, 11) * 0.8;
          mm.makeScale(s, s, s);
          mm.setPosition(cp.x + off.x, cp.y + off.y, cp.z + off.z);
          beads.push(mm.clone());
        }
      }
      const inst = new THREE.InstancedMesh(heteroGeo, heteroMat, beads.length);
      const hcol = new THREE.Color();
      beads.forEach((m, i) => {
        inst.setMatrixAt(i, m);
        inst.setColorAt(i, hcol.set(HETERO_PALETTE[i % HETERO_PALETTE.length]).multiplyScalar(0.85 + hash01(`hcc${tag}${i}`) * 0.35));
      });
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.renderOrder = 48;
      group.add(inst);
    }

    // 常染色质纤维（伸展活跃区）
    {
      const fibers = Math.round(24 * q) + 6;
      const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
      for (let i = 0; i < fibers; i++) {
        const pts: THREE.Vector3[] = [];
        const startDir = new THREE.Vector3(
          Math.cos((hash01(`ec${tag}${i}`) - 0.5) * 2.4) * Math.cos(hash01(`ec${tag}${i}`, 3) * Math.PI * 2),
          Math.sin((hash01(`ec${tag}${i}`) - 0.5) * 2.4),
          Math.cos((hash01(`ec${tag}${i}`) - 0.5) * 2.4) * Math.sin(hash01(`ec${tag}${i}`, 3) * Math.PI * 2),
        ).normalize();
        const start = nucInnerK(startDir, 0.72);
        for (let k = 0; k < 5; k++) {
          const wDir = new THREE.Vector3(
            Math.cos((hash01(`ec${tag}${i}${k}`, 3) - 0.5) * 2.6) * Math.cos(hash01(`ec${tag}${i}${k}`, 7) * Math.PI * 2),
            Math.sin((hash01(`ec${tag}${i}${k}`, 3) - 0.5) * 2.6),
            Math.cos((hash01(`ec${tag}${i}${k}`, 3) - 0.5) * 2.6) * Math.sin(hash01(`ec${tag}${i}${k}`, 7) * Math.PI * 2),
          ).normalize();
          const p = nucInnerK(wDir, 0.2 + hash01(`ec${tag}${i}${k}`) * 0.68);
          pts.push(new THREE.Vector3(p.x, p.y, p.z));
        }
        pts[0].set(start.x, start.y, start.z);
        const r = 0.03 + hash01(`ecr${tag}${i}`) * 0.022;
        parts.push({ geo: track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, r, 6)) });
      }
      const euch = new THREE.Mesh(track(mergeGeoms(parts)), mat({
        // v12 参照图: 常染色质熏衣草族低饱和
        color: REF.chromatin,
        emissive: '#5a4a68',
        emissiveIntensity: 0.2,
        opacity: 0.4,
        sheen: 0.5,
        sheenColor: '#9a8aa8',
      }));
      euch.renderOrder = 42;
      group.add(euch);
    }

    // 核仁: 纤维中心核心 + 颗粒组分外壳（v8: 每核独立 —— 肝细胞双核各含 1 个明显核仁）
    const instNucleoli: THREE.Mesh[] = [];
    for (let i = 0; i < spec.nucleolus.count; i++) {
      const r0 = spec.nucleolus.r * nucInst.scale * (1 - i * 0.22);
      // 核仁置于核内（v6: 随核形状/偏移; 杆状核内沿长轴展开）
      const center = nucInnerK(
        new THREE.Vector3(
          Math.cos(i * 0.7 - 0.3) * Math.cos(i * 2.4 + 0.8),
          Math.sin(i * 0.7 - 0.3),
          Math.cos(i * 0.7 - 0.3) * Math.sin(i * 2.4 + 0.8),
        ).normalize(),
        0.34,
      );
      const coreGeo = track(displacedSphere(r0, 3, 2.4, r0 * 0.09, 13));
      const core = new THREE.Mesh(coreGeo, mat({
        // v12 参照图: 核仁深紫族（rRNA 转录工厂）
        color: REF.nucleolus,
        emissive: REF.nucleolusHi,
        emissiveIntensity: 0.42,
        roughness: 0.55,
        opacity: 0.9,
        clearcoat: 0.25,
      }));
      core.position.set(center.x, center.y, center.z);
      core.renderOrder = 45;
      group.add(core);
      instNucleoli.push(core);
      // 颗粒组分: 表面 RNA 颗粒
      const spkGeo = track(new THREE.SphereGeometry(0.032, 5, 5));
      const spkCount = Math.round(56 * q) + 8;
      const spk = new THREE.InstancedMesh(spkGeo, mat({ color: '#8a7a9a', emissive: REF.nucleolusHi, emissiveIntensity: 0.3, opacity: 0.8 }), spkCount);
      {
        const mm = new THREE.Matrix4();
        const dir = new THREE.Vector3();
        fibSphere(spkCount, 1).forEach((p, k) => {
          dir.set(p.x, p.y, p.z).normalize();
          const rr = r0 * 1.22;
          mm.makeScale(0.7 + hash01(`ns${tag}${i}${k}`) * 0.7, 0.7 + hash01(`ns${tag}${i}${k}`) * 0.7, 0.7 + hash01(`ns${tag}${i}${k}`) * 0.7);
          mm.setPosition(center.x + dir.x * rr, center.y + dir.y * rr, center.z + dir.z * rr);
          spk.setMatrixAt(k, mm);
        });
        spk.instanceMatrix.needsUpdate = true;
        spk.renderOrder = 46;
      }
      group.add(spk);
      nucleolusSpeckles.push(spk);
    }
    nucleoli.push(...instNucleoli);
    if (primary && instNucleoli.length > 0) {
      const n0 = instNucleoli[0].position;
      labels.push({ pos: { x: n0.x + (n0.x - nucCK.x) * 0.7, y: n0.y + 0.62, z: n0.z }, zh: '核仁', latin: 'Nucleolus' });
      labels.push({ pos: nucPointK(new THREE.Vector3(Math.cos(-1.0) * Math.cos(2.2), Math.sin(-1.0), Math.cos(-1.0) * Math.sin(2.2)), -0.1), zh: '异染色质（边集）', latin: 'Heterochromatin' });
    }
  }
  // v8 双核教学标注（仅多核时添加 —— 真实肝板约 25% 肝细胞为双核）
  if (nucleiInst.length > 1) {
    const mid = {
      x: (nucleiInst[0].center.x + nucleiInst[1].center.x) / 2,
      y: (nucleiInst[0].center.y + nucleiInst[1].center.y) / 2,
      z: (nucleiInst[0].center.z + nucleiInst[1].center.z) / 2,
    };
    labels.push({ pos: { x: mid.x, y: mid.y + N * 0.95, z: mid.z }, zh: '双核 ×2（约 25% 肝细胞）', latin: 'Binucleate (~25%)' });
  }

  /* ================= 线粒体（双膜 + 板层嵴 + ATP 合酶） ================= */
  const mitos: { obj: THREE.Group; baseY: number; phase: number }[] = [];
  const mitoCount = perf ? Math.max(4, Math.round(spec.mitoCount * 0.6)) : spec.mitoCount;
  // 板层嵴 18 条（perf 9）: v10 深波形密板层 —— 高保真插画中嵴褶皱填满线粒体的读感
  const cristaeN = perf ? 9 : 18;
  // 外膜: 总长 2.3 / 半径 0.4 ≈ 2.9:1 长条豆状（对应 2D Mitochondrion 椭圆 rx54/ry22 ≈ 2.45:1）
  // v10: FBM 幅度 0.05 + 频率 3.1 —— 有机豆状轮廓更明显（近似电镜下不规则线粒体外形）
  const mitoOuterGeo = track(displaceGeometry(new THREE.CapsuleGeometry(0.4, 1.5, 12, 28), 3.1, 0.05, 17));
  const mitoOuterMat = mat({
    // v12 参照图: 线粒体暖古铜族（实测 100,74,69）—— 高饱和青绿退役
    color: REF.mitoOuter,
    transmission: transOn ? 0.58 : 0,
    thickness: 0.38,
    roughness: 0.28,
    normalMap: orgNormal,
    normalScale: 0.5,
    clearcoat: 0.35,
    emissive: '#3a2a24',
    emissiveIntensity: 0.3,
    opacity: transOn ? 1 : 0.45,
    flow: { color: '#8a6a58', strength: 0.22, scale: 1.7, speed: 0.13, rim: 0.34 },
  });
  const mitoMatrixMat = mat({ color: REF.mitoMatrix, emissive: '#241a16', emissiveIntensity: 0.22, opacity: 0.24 });
  const cristaeMat = mat({
    color: REF.mitoCristae,
    emissive: '#7a5548',
    emissiveIntensity: 0.62,
    roughness: 0.4,
    opacity: 0.82,
    sheen: 0.6,
    sheenColor: '#a8826e',
    flow: { color: '#8a6a58', strength: 0.3, scale: 2.4, speed: 0.2, rim: 0.26 },
  });
  const atpMat = track(new THREE.MeshBasicMaterial({ color: REF.mitoAtp, transparent: true, opacity: 0.8 * dim }));
  // mtDNA 核样体材质（暗玫瑰灰亮斑 —— v12 低饱和化）
  const mtdnaMat = track(new THREE.MeshBasicMaterial({ color: REF.mtdna, transparent: true, opacity: 0.72 * dim }));
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
      const xSlot = (slot / Math.max(1, slots - 1) - 0.5) * 0.44; // 相邻板层间距拉开（v10 加宽嵴带）
      const zRow = c % 2 === 0 ? -0.09 : 0.09;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        // 波形频率调低（约 0.55~0.95 个全长波形）→ "板层"感更强; v10 波幅 0.16 深褶皱
        pts.push(new THREE.Vector3(
          Math.sin(t * Math.PI * (0.6 + ph * 0.5)) * 0.035,
          (t - 0.5) * 1.5,
          zRow + Math.cos(t * Math.PI * (1.1 + ph * 0.8)) * 0.16,
        ));
      }
      const tube = track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.075, 7));
      // 压扁 0.5 → 板层; T·S 顺序使 x 槽平移不受压扁缩放
      const m = new THREE.Matrix4().makeTranslation(xSlot, 0, 0).multiply(new THREE.Matrix4().makeScale(0.5, 1, 1));
      parts.push({ geo: tube, matrix: m });
    }
    const cristae = new THREE.Mesh(track(mergeGeoms(parts)), cristaeMat);
    cristae.scale.set(1, 1, 0.82);
    cristae.renderOrder = 47;
    g.add(cristae);
    // 嵴膜 ATP 合酶（F1 颗粒, 发光）
    const atpGeo = track(new THREE.SphereGeometry(0.032, 5, 5));
    const atpCount = Math.round(26 * q) + 5;
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
  const ribosomeMat = track(new THREE.MeshStandardMaterial({ color: REF.ribosome, emissive: '#6a4a30', emissiveIntensity: 0.42 * dim, transparent: true, opacity: 0.85 * dim, depthWrite: false }));
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
      // v12 参照图: rER 石板蓝族（实测 93,99,104）
      color: REF.erSheet,
      transmission: transOn ? 0.3 : 0,
      thickness: 0.5,
      roughness: 0.38,
      normalMap: orgNormal,
      normalScale: 0.35,
      opacity: transOn ? 1 : 0.5,
      emissive: '#3a4a5c',
      emissiveIntensity: 0.14,
      clearcoat: 0.3,
      flow: { color: '#74869c', strength: 0.16, scale: 0.8, speed: 0.07, rim: 0.18 },
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
    const chains = Math.round(34 * q) + 8;
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

  // 外周 ER 管网（v10: 延展到细胞外周的迷宫管网 —— 高保真插画中"ER 遍布胞质"的读感;
  // 动态管状网络 + 三通节点 + 膜旁核糖体 —— 与核旁囊池共同构成连续的內质网系统）
  {
    const tubN = perf ? 5 : 9;
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    const periphCurves: THREE.CatmullRomCurve3[] = [];
    for (let i = 0; i < tubN; i++) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const peDir = new THREE.Vector3(
          Math.cos((hash01(`pe${i}`, 3) - 0.5) * 2.3 + Math.sin(t * 3.7 + i * 1.3) * 0.22) * Math.cos(hash01(`pe${i}`, 5) * Math.PI * 2 + t * 1.1),
          Math.sin((hash01(`pe${i}`, 3) - 0.5) * 2.3 + Math.sin(t * 3.7 + i * 1.3) * 0.22),
          Math.cos((hash01(`pe${i}`, 3) - 0.5) * 2.3 + Math.sin(t * 3.7 + i * 1.3) * 0.22) * Math.sin(hash01(`pe${i}`, 5) * Math.PI * 2 + t * 1.1),
        ).normalize();
        const p = insidePos(peDir, 0.55 + hash01(`pe${i}`) * 0.38 + Math.sin(t * 2.6 + i) * 0.1, 0.11, 0.35);
        pts.push(new THREE.Vector3(p.x, p.y, p.z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      periphCurves.push(curve);
      parts.push({ geo: track(new THREE.TubeGeometry(curve, 30, 0.09, 7)) });
    }
    // 三通节点（动态管网交汇小室）
    const pjGeo = track(new THREE.SphereGeometry(0.1, 8, 6));
    for (let j = 0; j < 6; j++) {
      const pjDir = new THREE.Vector3(
        Math.cos((hash01(`pj${j}`, 3) - 0.5) * 2.0) * Math.cos(hash01(`pj${j}`, 5) * Math.PI * 2),
        Math.sin((hash01(`pj${j}`, 3) - 0.5) * 2.0),
        Math.cos((hash01(`pj${j}`, 3) - 0.5) * 2.0) * Math.sin(hash01(`pj${j}`, 5) * Math.PI * 2),
      ).normalize();
      const jp = insidePos(pjDir, 0.5 + hash01(`pj${j}`) * 0.42, 0.13, 0.4);
      parts.push({ geo: pjGeo, matrix: new THREE.Matrix4().setPosition(jp.x, jp.y, jp.z) });
    }
    const periph = new THREE.Mesh(track(mergeGeoms(parts)), mat({
      // v12 参照图: 外周 rER 石板蓝族
      color: REF.erSheet,
      emissive: '#3a4a5c',
      emissiveIntensity: 0.12,
      roughness: 0.4,
      opacity: 0.42,
      clearcoat: 0.25,
      flow: { color: '#74869c', strength: 0.12, scale: 0.9, speed: 0.06, rim: 0.16 },
    }));
    periph.renderOrder = 45;
    group.add(periph);
    // 外周管网膜旁核糖体（rER 语义贯穿全胞质 —— 高保真插画的"千颗金珠"读感）
    const riboPts2: THREE.Vector3[] = [];
    for (const curve of periphCurves) {
      const n = Math.round(18 * q) + 5;
      for (let k = 0; k <= n; k++) {
        const p = curve.getPoint(k / n);
        riboPts2.push(new THREE.Vector3(p.x, p.y + 0.12, p.z));
        if (k % 2 === 0) riboPts2.push(new THREE.Vector3(p.x, p.y - 0.11, p.z));
      }
    }
    const ribos2 = new THREE.InstancedMesh(ribosomeGeo, ribosomeMat, riboPts2.length);
    {
      const mm = new THREE.Matrix4();
      const qq = new THREE.Quaternion();
      const eu = new THREE.Euler();
      riboPts2.forEach((p, i) => {
        const s = 0.7 + hash01(`prr${i}`) * 0.5;
        eu.set(hash01(`pre${i}`) * Math.PI, hash01(`pre${i}`, 3) * Math.PI * 2, (hash01(`pre${i}`, 5) - 0.5) * 0.8);
        qq.setFromEuler(eu);
        mm.compose(new THREE.Vector3(p.x, p.y, p.z), qq, new THREE.Vector3(s, s, s));
        ribos2.setMatrixAt(i, mm);
      });
      ribos2.instanceMatrix.needsUpdate = true;
      ribos2.renderOrder = 44;
    }
    group.add(ribos2);
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
      // v12 参照图: SER 石板蓝族亮调
      color: REF.erSheetHi,
      emissive: '#4a5a6e',
      emissiveIntensity: 0.18,
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
    const cisCol = new THREE.Color(REF.golgiCis);
    const transCol = new THREE.Color(REF.golgiTrans);
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4; color?: THREE.Color }[] = [];
    const cistN = 7;
    // 非线性极性插值: 暖棕金 → 赭石（v12 参照图: 高尔基 cis/trans 梯度保留但低饱和化）
    const POLARITY_MIX = [0, 0.08, 0.2, 0.42, 0.66, 0.88, 1];
    for (let i = 0; i < cistN; i++) {
      const col = cisCol.clone().lerp(transCol, POLARITY_MIX[i] ?? 1);
      // 更薄更扁的囊（v10: 管径 0.15 + 层间距 0.24 + 逐层旋叠 0.26 —— 高保真插画的"层叠弯曲扁平囊"读感）
      const torus = track(new THREE.TorusGeometry(1.02 + i * 0.055, 0.15, 12, 46, Math.PI * 1.28));
      const m = new THREE.Matrix4()
        .makeScale(1, 0.2, 1)
        .multiply(new THREE.Matrix4().makeRotationZ(i * 0.26))
        .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
        .setPosition(0, i * 0.24, 0);
      parts.push({ geo: torus, matrix: m, color: col });
    }
    // 池间小管连接（v10: 12 条随七池梯度同步）
    for (let c = 0; c < 12; c++) {
      const i = c % (cistN - 1);
      const ang = 0.5 + hash01(`gc${c}`) * 2.2;
      const r = 1.02 + i * 0.055;
      const a = new THREE.Vector3(Math.cos(ang) * r, i * 0.24, Math.sin(ang) * r * 0.34);
      const b = new THREE.Vector3(Math.cos(ang) * r, (i + 1) * 0.24, Math.sin(ang) * r * 0.34);
      const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0, 0.22));
      parts.push({ geo: track(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 10, 0.035, 6)), color: new THREE.Color(REF.golgiVesicle) });
    }
    const golgi = new THREE.Mesh(track(mergeGeoms(parts)), mat({
      color: '#ffffff',
      vertexColors: true,
      transmission: transOn ? 0.26 : 0,
      thickness: 0.4,
      roughness: 0.35,
      opacity: transOn ? 1 : 0.62,
      clearcoat: 0.45,
      emissive: '#4a3f30',
      emissiveIntensity: 0.1,
      sheen: 0.5,
      sheenColor: '#a8906a',
    }));
    golgi.renderOrder = 46;
    g.add(golgi);
    // 反面出芽囊泡（衣被蛋白斑点）
    const budGeo = track(new THREE.SphereGeometry(1, 12, 10));
    const budMat = mat({
      // v12 参照图: 反面出芽囊泡赭石族
      color: REF.golgiTrans,
      emissive: '#6a543a',
      emissiveIntensity: 0.32,
      opacity: 0.72,
      roughness: 0.35,
      normalMap: coatNormal,
      normalScale: 0.9,
      clearcoat: 0.3,
    });
    const budCount = 11;
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
      // v12 参照图: 顺面小泡暖棕金族
      color: REF.golgiCis,
      emissive: '#4a3f2a',
      emissiveIntensity: 0.3,
      opacity: 0.72,
      roughness: 0.35,
      normalMap: coatNormal,
      normalScale: 0.8,
      clearcoat: 0.3,
    });
    const cisBudCount = perf ? 3 : 6;
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
      // v12 参照图: 运输囊泡石板族
      color: REF.vesicle,
      transmission: transOn ? 0.4 : 0,
      thickness: 0.35,
      emissive: '#3e4a58',
      emissiveIntensity: 0.24,
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
  // 溶酶体中心锚点（自噬体融合目标; 提升作用域供自噬流消费）
  const lysoCenters: THREE.Vector3[] = [];
  {
    const lysoN = perf ? Math.max(2, Math.round(spec.lysosomeCount * 0.6)) : spec.lysosomeCount;
    if (lysoN > 0) {
      const bodyGeo = track(displacedSphere(0.38, 2, 3.2, 0.035, 101));
      const bodyMat = mat({
        // v12 参照图: 溶酶体暗红棕族（酸性细胞器低饱和化）
        color: REF.lyso,
        emissive: '#5a342e',
        emissiveIntensity: 0.3,
        roughness: 0.34,
        clearcoat: 0.4,
        normalMap: coatNormal,
        normalScale: 0.5,
        opacity: 0.9,
        flow: { color: REF.lysoHi, strength: 0.14, scale: 1.2, speed: 0.08, rim: 0.24 },
      });
      const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, lysoN);
      // 腔内水解酶颗粒（酸性磷酸酶/组织蛋白酶等 ~60 种酸性水解酶）
      const spkGeo = track(new THREE.SphereGeometry(0.045, 5, 4));
      const spkMat = track(new THREE.MeshStandardMaterial({
        // v12 参照图: 水解酶颗粒暗琥珀
        color: REF.lysoGranule,
        emissive: '#6a4426',
        emissiveIntensity: 0.34 * dim,
        transparent: true,
        opacity: 0.7 * dim,
        depthWrite: false,
      }));
      const perLyso = perf ? 12 : 24;
      const spks = new THREE.InstancedMesh(spkGeo, spkMat, lysoN * perLyso);
      const centers = lysoCenters;
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

  /* ================= 自噬流（ULK1 激活驱动 —— mTOR/AMPK 通路教学核心动态） ================= */
  // 科学过程: mTORC1 抑制 / AMPK 活化 → ULK1 复合体去抑制 → 核周隔离膜（phagophore）延伸
  //          → 包裹受损线粒体（线粒体自噬）/ 蛋白聚集体 → 封闭成双膜自噬体（LC3-II 阳性）
  //          → 弧线运输 → 与溶酶体融合（自溶酶体 + 降解闪光）→ 氨基酸回收
  // 驱动: update(t, ulk1) 的 ulk1 > 0.45 时按速率孵化; 无 ULK1 节点的通路恒静默（零渲染成本）
  interface AutoParticle {
    active: boolean;
    t0: number;
    dur: number;
    spawn: THREE.Vector3;
    target: THREE.Vector3;
    mid: THREE.Vector3;
    g: THREE.Group;
    bowl: THREE.Mesh;
    bowlMat: THREE.MeshPhysicalMaterial;
    body: THREE.Mesh;
    inner: THREE.Mesh;
    bodyMat: THREE.MeshPhysicalMaterial;
    lc3Mat: THREE.MeshStandardMaterial;
    cargo: THREE.Mesh;
    cargoMat: THREE.MeshStandardMaterial;
    flash: THREE.Mesh;
    flashMat: THREE.MeshBasicMaterial;
    phase: number;
  }
  const AUTO_N = perf ? 3 : 5;
  const autoParticles: AutoParticle[] = [];
  {
    // 共享几何: 开口隔离膜碗 / 双膜自噬体 / 货物（受损线粒体 / 聚集体）/ 融合闪光壳
    const bowlGeo = track(new THREE.SphereGeometry(0.62, 22, 16, 0, Math.PI * 1.42, 0, Math.PI * 0.94));
    const bodyGeo = track(displacedSphere(0.56, 2, 2.6, 0.03, 57));
    const innerGeo = track(displacedSphere(0.47, 2, 2.6, 0.03, 59));
    const mitoCargoGeo = track(displaceGeometry(new THREE.CapsuleGeometry(0.15, 0.32, 6, 12), 2.2, 0.02, 61));
    const aggParts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    for (let k = 0; k < 6; k++) {
      const off = new THREE.Vector3(hash01(`ag${k}`) - 0.5, hash01(`ag${k}`, 3) - 0.5, hash01(`ag${k}`, 5) - 0.5).multiplyScalar(0.17);
      aggParts.push({ geo: new THREE.SphereGeometry(0.085 + hash01(`agr${k}`) * 0.05, 7, 6), matrix: new THREE.Matrix4().makeTranslation(off.x, off.y, off.z) });
    }
    const aggCargoGeo = track(mergeGeoms(aggParts));
    const flashGeo = track(new THREE.SphereGeometry(1, 20, 14));
    const lc3Geo = track(new THREE.SphereGeometry(0.035, 6, 5));

    for (let i = 0; i < AUTO_N; i++) {
      const g = new THREE.Group();
      g.visible = false;
      // 隔离膜碗（开口态; DoubleSide 显内叶）—— v12 参照图: 低饱和青绿族
      const bowlMat = track(new THREE.MeshPhysicalMaterial({
        color: REF.autophago,
        emissive: '#35504a',
        emissiveIntensity: 0.38 * dim,
        roughness: 0.4,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }));
      const bowl = new THREE.Mesh(bowlGeo, bowlMat);
      bowl.renderOrder = 47;
      g.add(bowl);
      // 自噬体双膜（封闭态: 外膜 + 内膜两层）—— v12 参照图: 低饱和青绿族亮调
      const bodyMat = track(new THREE.MeshPhysicalMaterial({
        color: '#6a8a80',
        emissive: '#3a5a50',
        emissiveIntensity: 0.32 * dim,
        roughness: 0.38,
        transmission: transOn ? 0.3 : 0,
        thickness: 0.5,
        transparent: true,
        opacity: 0,
      }));
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      const inner = new THREE.Mesh(innerGeo, bodyMat);
      body.renderOrder = inner.renderOrder = 48;
      body.visible = inner.visible = false;
      g.add(body, inner);
      // LC3-II 阳性斑点（自噬体膜标志分子, 磷脂酰乙醇胺偶联形式贴外膜）
      const lc3Mat = track(new THREE.MeshStandardMaterial({
        // v12 参照图: LC3 斑点低饱和绿（生物学标记可辨性保留）
        color: REF.lc3,
        emissive: '#4a6a42',
        emissiveIntensity: 0.55 * dim,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }));
      const lc3 = new THREE.InstancedMesh(lc3Geo, lc3Mat, 14);
      {
        const mm = new THREE.Matrix4();
        const d = new THREE.Vector3();
        fibSphere(14, 1).forEach((p, k) => {
          d.set(p.x, p.y, p.z).normalize();
          const s = 0.8 + hash01(`lc${i}${k}`) * 0.6;
          mm.makeScale(s, s, s);
          mm.setPosition(d.x * 0.585, d.y * 0.585, d.z * 0.585);
          lc3.setMatrixAt(k, mm);
        });
        lc3.instanceMatrix.needsUpdate = true;
        lc3.renderOrder = 49;
      }
      g.add(lc3);
      // 货物: 偶数粒子 = 受损线粒体（线粒体自噬）; 奇数 = 蛋白聚集体（大自噬）
      const isMito = i % 2 === 0;
      const cargoMat = track(new THREE.MeshStandardMaterial({
        color: isMito ? '#4a3a34' : '#6a5434',
        emissive: isMito ? '#2a1e1a' : '#4a3a20',
        emissiveIntensity: 0.34 * dim,
        roughness: 0.55,
        normalMap: isMito ? mtStripe : coatNormal,
        normalScale: new THREE.Vector2(0.6, 0.6),
      }));
      const cargo = new THREE.Mesh(isMito ? mitoCargoGeo : aggCargoGeo, cargoMat);
      cargo.renderOrder = 46;
      g.add(cargo);
      // 融合闪光（自溶酶体形成瞬间: 溶酶体位琥珀色膨胀壳）
      const flashMat = track(new THREE.MeshBasicMaterial({ color: REF.autophagoFlash, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      const flash = new THREE.Mesh(flashGeo, flashMat);
      flash.renderOrder = 52;
      flash.visible = false;
      g.add(flash);
      group.add(g);
      autoParticles.push({
        active: false, t0: 0, dur: 7,
        spawn: new THREE.Vector3(), target: new THREE.Vector3(), mid: new THREE.Vector3(),
        g, bowl, bowlMat, body, inner, bodyMat, lc3Mat, cargo, cargoMat, flash, flashMat,
        phase: i * 1.7,
      });
    }
    // 自噬体标注（when: 'autophagy' —— 仅 ULK1 激活时由 CellBody 过滤显示; 锚定核周孵化带）
    if (lysoCenters.length > 0) {
      const auDir = new THREE.Vector3(Math.cos(-0.5) * Math.cos(2.2), Math.sin(-0.5), Math.cos(-0.5) * Math.sin(2.2));
      const auPos = insidePos(auDir, 0.42, 0.8, 0.55);
      labels.push({ pos: { x: auPos.x * 1.26, y: auPos.y + 0.6, z: auPos.z * 1.26 }, zh: '自噬体（ULK1 启动）', latin: 'Autophagosome', when: 'autophagy' });
    }
  }

  /* ================= 过氧化物酶体（过氧化氢酶晶体核心） ================= */
  {
    const pxN = perf ? Math.max(1, Math.round(spec.peroxisomeCount * 0.6)) : spec.peroxisomeCount;
    if (pxN > 0) {
      const bodyGeo = track(new THREE.SphereGeometry(0.26, 12, 10));
      const bodyMat = mat({
        // v12 参照图: 过氧化物酶体冷灰蓝族
        color: REF.peroxi,
        transmission: transOn ? 0.28 : 0,
        thickness: 0.3,
        emissive: '#33404e',
        emissiveIntensity: 0.2,
        roughness: 0.32,
        opacity: transOn ? 1 : 0.55,
        clearcoat: 0.35,
      });
      const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, pxN);
      // 尿酸氧化酶晶核（电镜下的致密芯）
      const coreGeo = track(new THREE.OctahedronGeometry(0.1, 0));
      const coreMat = track(new THREE.MeshStandardMaterial({
        // v12 参照图: 尿酸氧化酶晶核暗金
        color: REF.peroxiCore,
        emissive: '#7a6420',
        emissiveIntensity: 0.4 * dim,
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
      // v12 参照图: 脂滴琥珀金族低饱和（中性脂油润感保留）
      color: REF.lipid,
      transmission: transOn ? 0.5 : 0,
      thickness: 0.8,
      roughness: 0.12,
      clearcoat: 0.65,
      clearcoatRoughness: 0.18,
      emissive: '#5a421a',
      emissiveIntensity: 0.12,
      opacity: transOn ? 1 : 0.5,
      iridescence: 0.22,
      sheen: 0.4,
      sheenColor: REF.lipidHi,
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
    // 中心粒（v10: 9 组三联微管桶 + 中央辐 —— 电镜横截面剪影，高保真插画读感）
    const centGeo = (() => {
      const centParts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
      for (let b = 0; b < 9; b++) {
        const base = (b / 9) * Math.PI * 2;
        for (let t = 0; t < 3; t++) {
          const rr = 0.095 + t * 0.03;
          const aa = base + t * 0.17;
          const blade = track(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 6));
          blade.translate(rr, 0, 0);
          centParts.push({ geo: blade, matrix: new THREE.Matrix4().makeRotationY(aa) });
        }
      }
      centParts.push({ geo: track(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 8)) });
      return track(mergeGeoms(centParts));
    })();
    const centMat = mat({ color: '#8494a8', emissive: '#4a5a6e', emissiveIntensity: 0.32, roughness: 0.4, metalness: 0.2, opacity: 0.85 });
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
      // v12 参照图: 微管亮石板族（左主光高光读感）
      color: REF.microtubule,
      emissive: '#4a5a6e',
      emissiveIntensity: 0.24,
      opacity: 0.5,
      roughness: 0.45,
      normalMap: mtStripe,
      normalScale: 0.55,
      sheen: 0.4,
      sheenColor: REF.sheen,
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
        // v12 参照图: 中间丝石板族
        color: REF.interFil,
        emissive: '#4a5a6e',
        emissiveIntensity: 0.18,
        opacity: 0.38,
        roughness: 0.5,
        sheen: 0.6,
        sheenColor: REF.sheen,
      }));
      ifs.renderOrder = 44;
      group.add(ifs);
      labels.push({ pos: { x: ifMid.x * 1.15, y: ifMid.y, z: ifMid.z * 1.15 }, zh: '中间丝（波形蛋白）', latin: 'Intermediate filaments' });
    }

    labels.push({ pos: { x: c.x * 2.5, y: c.y - 0.5, z: c.z * 2.5 }, zh: '微管（中心体放射）', latin: 'Microtubules' });

    // 皮层肌动蛋白网 —— v6: 贴类型化膜面内 0.45-0.8（旧球形 R-0.5 会在窄轴穿出膜外）
    const actGeo = track(new THREE.CapsuleGeometry(0.017, 0.9, 3, 6));
    const actMat = mat({ color: REF.actin, emissive: '#5a6a7e', emissiveIntensity: 0.2, opacity: 0.4, roughness: 0.4 });
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
    const m2 = track(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#2a3440', emissiveIntensity: 0.2 * dim, roughness: 0.65, transparent: true, opacity: 0.33 * dim, depthWrite: false }));
    // v10: 860+ 颗粒 + 更细粒径谱（0.026-0.1）—— 高保真插画的"大分子拥挤"读感; v12 参照图: 调色板低饱和化（暖棕/石板/灰紫家族交替）
    const count = Math.round(860 * q) + 60;
    const inst = new THREE.InstancedMesh(geo, m2, count);
    const mm = new THREE.Matrix4();
    const c = new THREE.Color();
    const palette = ['#4a5a6e', '#3e4a5a', '#5a4a42', '#4a4436', '#6a5434', '#565a68', '#5a4a58', '#445452', '#3f5048', '#5a5636'];
    for (let i = 0; i < count; i++) {
      const r = 0.026 + hash01(`s${i}`) * 0.075;
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
    const m3 = track(new THREE.MeshStandardMaterial({ color: '#a8845f', emissive: '#6a5430', emissiveIntensity: 0.3 * dim, transparent: true, opacity: 0.62 * dim, depthWrite: false }));
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
    // v7: 长度/环位用形状求解器精确贴膜（旧硬编码 2.02 椭球在真实杆形下穿膜/悬空）
    const fiberN = perf ? 7 : 10;
    const SARCO = 0.62; // 肌节周期（模型单位, ≈2μm 比例感）
    const rodRing = shapeCrossRadius(SHAPE, 0, R); // 中央横截面半径（真实形状求解）
    const myoParts: { geo: THREE.BufferGeometry }[] = [];
    for (let i = 0; i < fiberN; i++) {
      const a = (i / fiberN) * Math.PI * 2 + 0.3;
      const ring = i % 2 === 0 ? 0.58 : 0.9;
      const fy = Math.cos(a) * ring * rodRing;
      const fz = Math.sin(a) * ring * rodRing;
      const xr = shapeXExtent(SHAPE, fy, fz, R) * 0.93; // 止于膜内（留 FBM 噪声裕量）
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
    labels.push({ pos: { x: 0, y: -R * 0.55, z: R * 0.3 }, zh: '肌原纤维（肌节横纹）', latin: 'Myofibril' });
  }

  if (spec.intercalated) {
    // 闰盘: 端-端阶梯折面盘（横齿交错剪影）+ 缝隙连接（Cx43）金点
    // v7: 端面位置由形状求解器确定（真实杆端 = 闰盘所在, 旧硬编码 1.72R 悬浮膜外）
    const discMat = mat({ color: '#fde68a', emissive: '#b45309', emissiveIntensity: 0.45, opacity: 0.85, roughness: 0.35 });
    const gapMat = track(new THREE.MeshStandardMaterial({ color: '#fef3c7', emissive: '#fbbf24', emissiveIntensity: 0.9 * dim, transparent: true, opacity: 0.95 * dim }));
    const xEnd = shapeXExtent(SHAPE, 0, 0, R) - 0.1; // 端面贴膜（留 FBM 裕量）
    for (const sx of [-1, 1]) {
      const segs = [
        { r: 0.5, dx: 0 },
        { r: 0.37, dx: -0.13 * sx },
        { r: 0.245, dx: -0.26 * sx },
      ];
      segs.forEach((seg, si) => {
        const disc = new THREE.Mesh(track(new THREE.CylinderGeometry(seg.r * R, seg.r * R, 0.055, 26, 1)), discMat);
        disc.rotation.z = Math.PI / 2;
        disc.scale.set(1, 1, 0.9); // y/z 椭圆截面贴合（local z → world z）
        disc.position.set(sx * xEnd + seg.dx * R * 0.12, si * 0.18 * sx, si * 0.12 * sx);
        disc.renderOrder = 63;
        group.add(disc);
      });
      // 缝隙连接亮点（Cx43 斑块）
      const gapGeo = track(new THREE.SphereGeometry(0.085, 6, 6));
      for (let g = 0; g < 7; g++) {
        const ga = (g / 7) * Math.PI * 2 + hash01(`gd${sx}${g}`) * 0.6;
        const gr = (0.18 + hash01(`gdr${sx}${g}`) * 0.26) * R;
        const gap = new THREE.Mesh(gapGeo, gapMat);
        gap.position.set(sx * (xEnd - 0.06), Math.cos(ga) * gr, Math.sin(ga) * gr * 0.9);
        gap.renderOrder = 63;
        group.add(gap);
      }
    }
    labels.push({ pos: { x: xEnd + 0.32, y: R * 0.5, z: 0 }, zh: '闰盘（缝隙连接）', latin: 'Intercalated disc' });
  }

  if (spec.stressFibers) {
    // 应力纤维: 沿长轴（x）平行的粗 actin 束（贯穿胞质）+ 两端黏着斑亮点 —— 肌成纤维标志
    // v7: 长度/环位用形状求解器精确贴膜（旧硬编码 1.45R 在真实梭形下穿膜/悬空）
    const sfMat = mat({ color: '#fecdd3', emissive: '#fb7185', emissiveIntensity: 0.3, roughness: 0.4, opacity: 0.62 });
    const faMat = track(new THREE.MeshStandardMaterial({ color: '#fef3c7', emissive: '#fbbf24', emissiveIntensity: 0.8 * dim, transparent: true, opacity: 0.9 * dim }));
    const n = perf ? 5 : 8;
    const spindleRing = shapeCrossRadius(SHAPE, 0, R); // 中央横截面半径（真实梭形求解）
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.5;
      const ring = 0.5 + hash01(`sfr${i}`) * 0.26;
      const fy = Math.cos(a) * ring * spindleRing;
      const fz = Math.sin(a) * ring * spindleRing * 1.04;
      const xr = shapeXExtent(SHAPE, fy, fz, R) * 0.94; // 两端渐尖处自动收敛（真实梭形贴膜）
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
    labels.push({ pos: { x: 0, y: -R * 0.46, z: R * 0.32 }, zh: '应力纤维（α-SMA 束）', latin: 'Stress fiber' });
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
    // v7: 站位范围/横截面由形状求解器确定（旧硬编码 1.52R/2.02 椭球在真实杆形下穿膜）
    const SARCO = 0.62; // 与肌原纤维肌节周期一致
    const stationStep = perf ? SARCO * 3 : SARCO * 2;
    const xMax = shapeXExtent(SHAPE, 0, 0, R) * 0.94; // 肌膜内陷站点范围（真实杆长）
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
      // 该站位处真实横截面半径（旋转体求解; 超椭球杆端自动收缩）
      const rr = shapeCrossRadius(SHAPE, x0, R) * 0.93;
      const perStation = 6;
      const stationSeed = Math.round(x0 * 10);
      for (let k = 0; k < perStation; k++) {
        const th = (k / perStation) * Math.PI * 2 + hash01(`tt${stationSeed}`) * 0.8;
        const sy = Math.cos(th) * rr;
        const sz = Math.sin(th) * rr * 1.06;
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
    const rodMid = shapeCrossRadius(SHAPE, 0, R);
    for (let i = 0; i < nL; i++) {
      const th = (i / nL) * Math.PI * 2 + 0.3;
      const ring = 0.74 + hash01(`lsr${i}`) * 0.18;
      const fy = Math.cos(th) * rodMid * ring;
      const fz = Math.sin(th) * rodMid * ring * 1.06;
      const xr = shapeXExtent(SHAPE, fy, fz, R) * 0.9;
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
    labels.push({ pos: { x: R * 1.05, y: -rodMid * 0.82, z: rodMid * 0.55 }, zh: 'T 小管（Z 线位内陷）', latin: 'T-tubule' });
    labels.push({ pos: { x: -R * 1.25, y: rodMid * 0.85, z: 0 }, zh: '肌浆网（Ca²⁺ 库）', latin: 'Sarcoplasmic reticulum' });
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
  // 自噬流驱动状态（ULK1 水平 → 孵化节拍; 帧内只读 store 快照, 零订阅成本）
  let autoAcc = 0;
  let autoLastT = -1;
  let autoSpawnCount = 0;
  const AUTO_SPAWN_THRESHOLD = 2.3; // level·s —— 满活性约 2.3s 孵化一个自噬体
  const AUTO_ACTIVE_LEVEL = 0.45; // ULK1 活性孵化阈值
  // 二次贝塞尔（隔离膜出生点 → 运输弧中点 → 溶酶体融合位）
  const autoBezier = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, k: number, out: THREE.Vector3) => {
    const q = 1 - k;
    out.set(
      q * q * a.x + 2 * q * k * b.x + k * k * c.x,
      q * q * a.y + 2 * q * k * b.y + k * k * c.y,
      q * q * a.z + 2 * q * k * b.z + k * k * c.z,
    );
  };
  const update = (t: number, ulk1 = 0) => {
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

    /* ---- 自噬流生命周期（ULK1 > 阈值时孵化; 四相: 隔离膜→封闭→运输→融合） ---- */
    if (autoLastT < 0) autoLastT = t;
    const dt = Math.max(0, Math.min(0.25, t - autoLastT));
    autoLastT = t;
    if (ulk1 > AUTO_ACTIVE_LEVEL) autoAcc += dt * ulk1;
    if (autoAcc >= AUTO_SPAWN_THRESHOLD) {
      autoAcc = 0;
      const p = autoParticles.find((x) => !x.active);
      if (p && lysoCenters.length > 0) {
        autoSpawnCount++;
        const seed = autoSpawnCount;
        const lat = (hash01(`au${seed}`) - 0.5) * 2.2;
        const lon = hash01(`au${seed}`, 3) * Math.PI * 2;
        const dir = new THREE.Vector3(
          Math.cos(lat) * Math.cos(lon),
          Math.sin(lat),
          Math.cos(lat) * Math.sin(lon),
        ).normalize();
        const spawn = insidePos(dir, 0.28 + hash01(`au${seed}`, 5) * 0.4, 0.78, 0.5);
        const target = lysoCenters[seed % lysoCenters.length];
        const mid = spawn
          .clone()
          .lerp(target, 0.5)
          .add(new THREE.Vector3(
            (hash01(`au${seed}`, 7) - 0.5) * 2.4,
            0.6 + hash01(`au${seed}`, 9) * 0.8,
            (hash01(`au${seed}`, 11) - 0.5) * 2.4,
          ));
        p.active = true;
        p.t0 = t;
        p.dur = 6.2 + hash01(`au${seed}`, 13) * 1.4;
        p.spawn.copy(spawn);
        p.target.copy(target);
        p.mid.copy(mid);
        p.g.position.copy(spawn);
        p.g.visible = true;
        p.bowl.visible = true;
        p.body.visible = p.inner.visible = false;
        p.cargo.visible = true;
        p.cargo.scale.setScalar(1);
        p.flash.visible = false;
        p.cargo.rotation.set(hash01(`au${seed}`, 15) * Math.PI, hash01(`au${seed}`, 17) * Math.PI, 0);
      }
    }
    for (const p of autoParticles) {
      if (!p.active) continue;
      const u = (t - p.t0) / p.dur;
      if (u >= 1 || u < 0) {
        p.active = false;
        p.g.visible = false;
        continue;
      }
      const P1 = 0.26; // 隔离膜延伸相终点
      const P2 = 0.36; // 封闭相终点
      const P3 = 0.84; // 运输相终点（融合开始）
      const smooth = (x: number) => x * x * (3 - 2 * x);
      // 货物慢翻转（被包裹读感）
      p.cargo.rotation.x += 0.006;
      p.cargo.rotation.y += 0.004;
      if (u < P1) {
        // 相 1 隔离膜（phagophore）: 开口碗自 0.2 长大 + 绕货物旋转延伸（膜延伸读感）
        const k = smooth(u / P1);
        p.bowl.scale.setScalar(0.2 + k * 0.8);
        p.bowl.rotation.y = t * 1.35 + p.phase;
        p.bowlMat.opacity = k * 0.72;
        p.bodyMat.opacity = 0;
        p.lc3Mat.opacity = 0;
        p.cargo.scale.setScalar(0.45 + k * 0.55);
        p.g.position.copy(p.spawn);
      } else if (u < P2) {
        // 相 2 封闭: 碗淡出收口, 双膜自噬体 + LC3-II 斑点亮起
        const k = smooth((u - P1) / (P2 - P1));
        p.bowl.scale.setScalar(1 + k * 0.08);
        p.bowl.rotation.y = t * 0.8 + p.phase;
        p.bowlMat.opacity = 0.72 * (1 - k);
        p.body.visible = p.inner.visible = true;
        p.body.scale.setScalar(0.55 + k * 0.45);
        p.bodyMat.opacity = k * 0.82;
        p.lc3Mat.opacity = k * 0.85;
        p.cargo.scale.setScalar(1);
        p.g.position.copy(p.spawn);
      } else if (u < P3) {
        // 相 3 运输: 自噬体沿弧线向溶酶体运输（微管定向 + 布朗晃动）
        const k = smooth((u - P2) / (P3 - P2));
        autoBezier(p.spawn, p.mid, p.target, k, p.g.position);
        const wob = 0.07;
        p.g.position.x += Math.sin(t * 3.1 + p.phase) * wob;
        p.g.position.y += Math.cos(t * 2.6 + p.phase * 1.3) * wob * 0.8;
        p.g.position.z += Math.sin(t * 3.7 + p.phase * 0.7) * wob * 0.7;
        p.bowlMat.opacity = 0;
        p.bowl.visible = false;
        p.body.scale.setScalar(1 + Math.sin(t * 2.2 + p.phase) * 0.03);
        p.bodyMat.opacity = 0.82;
        p.lc3Mat.opacity = 0.85;
      } else {
        // 相 4 融合: 贴溶酶体位收拢 → 琥珀闪光膨胀（自溶酶体形成）→ 货物降解淡出
        const k = (u - P3) / (1 - P3);
        p.g.position.copy(p.target);
        p.body.scale.setScalar(Math.max(0.05, 1 - k * 0.55));
        p.bodyMat.opacity = 0.82 * (1 - k) ** 1.5;
        p.lc3Mat.opacity = 0.85 * (1 - k);
        p.cargo.scale.setScalar(Math.max(0.02, 1 - k * 1.6)); // 降解
        if (k > 0.12) {
          p.flash.visible = true;
          const fk = (k - 0.12) / 0.88;
          p.flash.scale.setScalar(0.55 + fk * 1.5);
          p.flashMat.opacity = Math.sin(Math.min(1, fk * 1.6) * Math.PI) * 0.5;
        }
      }
    }
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

/** 贴面模式下让位的核内部标注（核盘自带剖面标注; 前缀匹配 zh/latin） */
const NUCLEUS_INTERIOR_ZH = ['核仁', '异染色质', '核孔复合体'];
const NUCLEUS_INTERIOR_LATIN = ['Nucleolus', 'Heterochromatin', 'Nuclear pore complex'];

/** 细胞体组件（仅 dim/规格/画质变化时重建, 动画走 imperative 帧驱动） */
export const CellBody = ({ spec, tint, dim, showAnatomy, perf, compactNucleusLabels }: {
  spec: CellBodySpec;
  tint: string;
  dim: number;
  showAnatomy: boolean;
  /** 低端设备流畅模式（禁用折射/减实例） */
  perf?: boolean;
  /** 剖面贴附模式: 隐藏核内部标注（核盘自带标注, 消除核区标签互叠） */
  compactNucleusLabels?: boolean;
}) => {
  const { lang } = useLang();
  const build = useMemo(() => buildCellBody(spec, tint, dim, perf ?? false), [spec, tint, dim, perf]);
  useEffect(() => () => build.dispose(), [build]);
  // 窄视口（<640px）: 解剖标注仅保留主要细胞器, 避免移动端标签互相遮挡（zh/latin 前缀各自匹配）
  const isNarrow = useThree((s) => s.size.width) < 640;
  // 自噬流可见性（布尔选择器 —— 仅阈值跨越时重渲染, 逐 tick 零成本）
  const autoActive = useLabStore((s) => autophagyLevel(s.nodeStates) > AUTOPHAGY_VISIBLE_THRESHOLD);
  const visibleLabels = useMemo(
    () => {
      let base = isNarrow
        ? build.labels.filter((l) =>
            lang === 'zh'
              ? MAJOR_ORGANELLE_ZH.some((m) => l.zh.startsWith(m))
              : MAJOR_ORGANELLE_LATIN.some((m) => l.latin.startsWith(m)),
          )
        : build.labels;
      // 剖面贴附模式: 核内部标注让位（核盘自带剖面标注, 且分子投影到切面后核区标签密度最高）
      if (compactNucleusLabels) {
        base = base.filter((l) =>
          lang === 'zh'
            ? !NUCLEUS_INTERIOR_ZH.some((m) => l.zh.startsWith(m))
            : !NUCLEUS_INTERIOR_LATIN.some((m) => l.latin.startsWith(m)),
        );
      }
      // 条件标签: 自噬体标注仅在 ULK1 激活（mTOR 抑制/AMPK 活化语境）时显示
      return autoActive ? base : base.filter((l) => l.when !== 'autophagy');
    },
    [isNarrow, build, lang, autoActive, compactNucleusLabels],
  );

  // 帧驱动: 传入 ULK1 自噬驱动水平（无 ULK1 通路 → 0 → 自噬系统静默）
  useFrame((state) => build.update(state.clock.elapsedTime, autophagyLevel(useLabStore.getState().nodeStates)));

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
