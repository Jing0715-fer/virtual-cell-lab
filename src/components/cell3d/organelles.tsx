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
 *      - 线粒体: 双膜 + 板层嵴（波浪内褶）+ 嵴膜 ATP 合酶发光点
 *      - RER: 核旁连续囊池网 + 连接管 + 膜旁核糖体 + 游离多聚核糖体
 *      - 高尔基: 顺→反 6 池梯度（顶点色渐变）+ 出芽囊泡（衣被蛋白斑点法线）
 *      - 细胞骨架: 中心体放射微管（原纤维条纹法线）+ 皮层肌动蛋白网
 *      - 胞外悬浮微粒（浸没感）+ 脂双层流动镶嵌（缓慢对流）
 * 科学参照: Alberts MBoC 6th / Karp Cell & Molecular Biology 9th / cellimagelibrary
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { CellBodySpec, Vec3 } from '@/lib/simulation/layout3d';
import { displaceGeometry, fbm3, fibSphere, hash01, mergeGeoms, sph } from './procedural';
import { glowSpriteTexture, organicNormalMap, roughnessMap, speckleNormalMap, stripeNormalMap } from './textures';
import { createTimeUniform, glowMaterial, organelleMaterial, type TimeUniform } from './materials';

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

/* ============ 位移球体（与 surf() 位移场严格一致, 供脂质/NPC 对齐表面） ============ */

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

/** 方向 dir 处的表面半径（位移场） */
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

  /* ================= 质膜 ================= */
  const MEM_FREQ = 0.85;
  const MEM_AMP = 0.17;
  const membraneGroup = new THREE.Group();
  group.add(membraneGroup);

  const membraneGeo = track(displacedSphere(R, detail, MEM_FREQ, MEM_AMP, 3));
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

  // 外缘呼吸辉光壳
  const glowGeo = track(new THREE.SphereGeometry(R * 1.075, 48, 32));
  const glow = new THREE.Mesh(glowGeo, track(glowMaterial(tint, 0.05 * dim)));
  glow.renderOrder = 70;
  membraneGroup.add(glow);

  // 脂双层脂头（外叶/内叶, 缓慢对流 = 膜流动性）
  const headGeo = track(new THREE.SphereGeometry(0.078, 8, 6));
  const headCount = Math.round(860 * q);
  const makeLeaflet = (offset: number, color: string, opacity: number, emissive: string) => {
    const m = track(new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: 0.42 * dim,
      transparent: true,
      opacity: opacity * dim,
      depthWrite: false,
    }));
    const inst = new THREE.InstancedMesh(headGeo, m, headCount);
    const mm = new THREE.Matrix4();
    const dir = new THREE.Vector3();
    fibSphere(headCount, 1).forEach((p, i) => {
      dir.set(p.x, p.y, p.z).normalize();
      const r = surf(dir, R + offset, MEM_FREQ, MEM_AMP, 3);
      const s = 0.75 + hash01(`lh${i}`, Math.round(offset * 100)) * 0.55;
      mm.makeScale(s, s, s);
      mm.setPosition(dir.x * r, dir.y * r, dir.z * r);
      inst.setMatrixAt(i, mm);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 60;
    return inst;
  };
  const outerLeaflet = makeLeaflet(0.05, '#5eead4', 0.78, '#14b8a6');
  const innerLeaflet = makeLeaflet(-0.05, '#0f766e', 0.55, '#115e59');
  membraneGroup.add(outerLeaflet, innerLeaflet);

  // 跨膜蛋白（α-螺旋束, 嵌于脂双层）
  const tmpGeo = track(new THREE.CapsuleGeometry(0.062, 0.5, 4, 10));
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
      const r = surf(dir, R + 0.02, MEM_FREQ, MEM_AMP, 3);
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

  /* ================= 核被膜（双层 + 核孔复合体） ================= */
  const NUC_FREQ = 1.5;
  const nucAmp = spec.nucleusBumpy ? 0.24 : 0.07;
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
  const nucOuterGeo = track(displacedSphere(N, detail, NUC_FREQ, nucAmp, 7));
  const nucOuter = new THREE.Mesh(nucOuterGeo, nucMat);
  nucOuter.renderOrder = 50;
  const nucInner = new THREE.Mesh(track(displacedSphere(N - 0.22, detail - 1, NUC_FREQ, nucAmp, 7)), nucMat);
  nucInner.renderOrder = 50;
  group.add(nucOuter, nucInner);

  const nucleoplasm = new THREE.Mesh(
    track(new THREE.SphereGeometry((N - 0.24) * 0.985, 32, 24)),
    track(new THREE.MeshBasicMaterial({ color: '#881337', transparent: true, opacity: 0.12 * dim, depthWrite: false })),
  );
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
      const r = surf(dir, N, NUC_FREQ, nucAmp, 7) + 0.02;
      qq.setFromUnitVectors(zAxis, dir);
      const s = (0.95 + hash01(`npc${i}`) * 0.25) * 1.15;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(dir.x * r, dir.y * r, dir.z * r), qq, new THREE.Vector3(s, s, s));
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
  }
  labels.push({ pos: sph(N * 1.38, 0.35, 1.9), zh: '核孔复合体', latin: 'Nuclear pore complex' });
  labels.push({ pos: { x: 0, y: N * 1.18, z: 0 }, zh: '核被膜（双层）', latin: 'Nuclear envelope' });

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
      const cp = sph(N - 0.34, lat, lon);
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
      const start = sph(N * 0.72, (hash01(`ec${i}`) - 0.5) * 2.4, hash01(`ec${i}`, 3) * Math.PI * 2);
      for (let k = 0; k < 5; k++) {
        const p = sph(N * (0.2 + hash01(`ec${i}${k}`) * 0.68), (hash01(`ec${i}${k}`, 3) - 0.5) * 2.6, hash01(`ec${i}${k}`, 7) * Math.PI * 2);
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
    const center = sph(N * 0.3, i * 0.7 - 0.3, i * 2.4 + 0.8);
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
  labels.push({ pos: { x: n0.x * 1.7, y: n0.y + 0.62, z: n0.z }, zh: '核仁', latin: 'Nucleolus' });
  labels.push({ pos: sph(N * 0.95, -1.0, 2.2), zh: '异染色质（边集）', latin: 'Heterochromatin' });

  /* ================= 线粒体（双膜 + 板层嵴 + ATP 合酶） ================= */
  const mitos: { obj: THREE.Group; baseY: number; phase: number }[] = [];
  const mitoCount = perf ? Math.max(4, Math.round(spec.mitoCount * 0.6)) : spec.mitoCount;
  const cristaeN = perf ? 5 : 9;
  const mitoOuterGeo = track(displaceGeometry(new THREE.CapsuleGeometry(0.5, 1.05, 8, 22), 2.6, 0.045, 17));
  const mitoOuterMat = mat({
    color: '#0e8f6f',
    transmission: transOn ? 0.5 : 0,
    thickness: 0.7,
    roughness: 0.3,
    normalMap: orgNormal,
    normalScale: 0.5,
    clearcoat: 0.35,
    emissive: '#065f46',
    emissiveIntensity: 0.28,
    opacity: transOn ? 1 : 0.45,
    flow: { color: '#34d399', strength: 0.32, scale: 1.7, speed: 0.13, rim: 0.42 },
  });
  const mitoMatrixMat = mat({ color: '#064e3b', emissive: '#022c22', emissiveIntensity: 0.25, opacity: 0.3 });
  const cristaeMat = mat({
    color: '#6ee7b7',
    emissive: '#2dd4bf',
    emissiveIntensity: 0.62,
    roughness: 0.4,
    opacity: 0.72,
    sheen: 0.6,
    sheenColor: '#a7f3d0',
    flow: { color: '#5eead4', strength: 0.4, scale: 2.4, speed: 0.2, rim: 0.3 },
  });
  const atpMat = track(new THREE.MeshBasicMaterial({ color: '#fcd34d', transparent: true, opacity: 0.95 * dim }));
  for (let i = 0; i < mitoCount; i++) {
    const g = new THREE.Group();
    // 外膜（透射）
    const outer = new THREE.Mesh(mitoOuterGeo, mitoOuterMat);
    outer.scale.set(1, 1, 0.76);
    outer.renderOrder = 46;
    g.add(outer);
    // 基质
    const matrix = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.44, 0.95, 6, 16)), mitoMatrixMat);
    matrix.scale.set(1, 1, 0.76);
    matrix.renderOrder = 45;
    g.add(matrix);
    // 板层嵴（合并为单几何）
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    for (let c = 0; c < cristaeN; c++) {
      const ph = hash01(`cr${c}`, i * 31);
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        pts.push(new THREE.Vector3(
          Math.sin(t * Math.PI * (2 + ph * 2.4)) * 0.26,
          (t - 0.5) * 1.5,
          Math.cos(t * Math.PI * (1.6 + ph * 1.8)) * 0.2,
        ));
      }
      const tube = track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.048, 7));
      const m = new THREE.Matrix4().makeScale(0.55, 1, 1); // 压扁 → 板层
      parts.push({ geo: tube, matrix: m });
    }
    const cristae = new THREE.Mesh(track(mergeGeoms(parts)), cristaeMat);
    cristae.scale.set(1, 1, 0.76);
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
    const p = sph(R * (0.46 + hash01(`m${i}`) * 0.3), (hash01(`m${i}`, 3) - 0.5) * 2.1, hash01(`m${i}`, 5) * Math.PI * 2);
    g.position.set(p.x, p.y, p.z);
    g.rotation.set(hash01(`m${i}`, 9) * 2.1, hash01(`m${i}`, 11) * 2.1, hash01(`m${i}`, 13) * 2.1);
    group.add(g);
    mitos.push({ obj: g, baseY: p.y, phase: hash01(`m${i}`, 17) * Math.PI * 2 });
  }
  if (mitos.length) {
    const m0 = mitos[0].obj.position;
    labels.push({ pos: { x: m0.x * 1.4, y: m0.y + 0.85, z: m0.z * 1.4 }, zh: '线粒体（板层嵴）', latin: 'Mitochondrion' });
  }

  /* ================= 粗面内质网（核旁连续囊池 + 连接管 + 核糖体） ================= */
  const ribosomeGeo = track(new THREE.SphereGeometry(0.055, 6, 5));
  const ribosomeMat = track(new THREE.MeshStandardMaterial({ color: '#fbbf24', emissive: '#d97706', emissiveIntensity: 0.5 * dim, transparent: true, opacity: 0.88 * dim, depthWrite: false }));
  {
    const sheets = Math.max(1, spec.erSheets);
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    const sheetCurves: THREE.CatmullRomCurve3[] = [];
    for (let s = 0; s < sheets; s++) {
      const latBase = -0.62 + s * 0.42;
      const lon0 = s * 1.9;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 14; k++) {
        const t = k / 14;
        const p = sph(
          N + 0.62 + Math.sin(t * Math.PI * 2.3 + s) * 0.3,
          latBase + Math.sin(t * Math.PI * 3.1) * 0.2,
          lon0 + t * Math.PI * 1.55,
        );
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
      flow: { color: '#14b8a6', strength: 0.14, scale: 0.8, speed: 0.07, rim: 0.2 },
    }));
    er.renderOrder = 46;
    group.add(er);
    // 膜旁核糖体（胞质面两排）
    const riboPts: THREE.Vector3[] = [];
    for (const curve of sheetCurves) {
      const n = Math.round(22 * q) + 6;
      for (let k = 0; k <= n; k++) {
        const p = curve.getPoint(k / n);
        riboPts.push(new THREE.Vector3(p.x, p.y + 0.15, p.z));
        if (k % 2 === 0) riboPts.push(new THREE.Vector3(p.x, p.y - 0.13, p.z));
      }
    }
    const ribos = new THREE.InstancedMesh(ribosomeGeo, ribosomeMat, riboPts.length);
    {
      const mm = new THREE.Matrix4();
      riboPts.forEach((p, i) => {
        const s = 0.75 + hash01(`rb${i}`) * 0.5;
        mm.makeScale(s, s, s);
        mm.setPosition(p.x, p.y, p.z);
        ribos.setMatrixAt(i, mm);
      });
      ribos.instanceMatrix.needsUpdate = true;
      ribos.renderOrder = 47;
    }
    group.add(ribos);
    if (sheets) {
      const p = sph(N + 1.6, -0.62, 1.4);
      labels.push({ pos: { x: p.x, y: p.y + 0.75, z: p.z }, zh: '粗面内质网（核糖体）', latin: 'Rough ER' });
    }
  }

  // 游离多聚核糖体（胞质中的翻译车间）
  {
    const chains = Math.round(26 * q) + 6;
    const beads: THREE.Matrix4[] = [];
    const mm = new THREE.Matrix4();
    for (let ch = 0; ch < chains; ch++) {
      const start = sph(R * (0.5 + hash01(`pr${ch}`) * 0.34), (hash01(`pr${ch}`, 3) - 0.5) * 2.4, hash01(`pr${ch}`, 5) * Math.PI * 2);
      const dirV = new THREE.Vector3(hash01(`prd${ch}`) - 0.5, hash01(`prd${ch}`, 3) - 0.5, hash01(`prd${ch}`, 5) - 0.5).normalize().multiplyScalar(0.14);
      const n = 4 + Math.floor(hash01(`prn${ch}`) * 3);
      for (let b = 0; b < n; b++) {
        const p = new THREE.Vector3(start.x + dirV.x * b, start.y + dirV.y * b, start.z + dirV.z * b);
        const s = 0.7 + hash01(`prb${ch}${b}`) * 0.4;
        mm.makeScale(s, s, s);
        mm.setPosition(p.x, p.y, p.z);
        beads.push(mm.clone());
      }
    }
    const inst = new THREE.InstancedMesh(ribosomeGeo, ribosomeMat, beads.length);
    beads.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 44;
    group.add(inst);
  }

  // 滑面内质网（肝细胞解毒管系）
  if (spec.glycogen) {
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    for (let i = 0; i < 8; i++) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 5; k++) {
        const t = k / 5;
        const p = sph(R * (0.55 + hash01(`se${i}`) * 0.3 + t * 0.12), (hash01(`se${i}`, 3) - 0.5) * 2.2 + Math.sin(t * 4 + i) * 0.14, hash01(`se${i}`, 5) * Math.PI * 2 + t * 0.9);
        pts.push(new THREE.Vector3(p.x, p.y, p.z));
      }
      parts.push({ geo: track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.085, 7)) });
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
    const lp = sph(R * 0.66, 0.9, 5.6);
    labels.push({ pos: lp, zh: '滑面内质网', latin: 'Smooth ER' });
  }

  /* ================= 高尔基体（顺→反梯度 + 出芽囊泡） ================= */
  {
    const g = new THREE.Group();
    const cisCol = new THREE.Color('#99f6e4');
    const transCol = new THREE.Color('#f59e0b');
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4; color?: THREE.Color }[] = [];
    const cistN = 6;
    for (let i = 0; i < cistN; i++) {
      const col = cisCol.clone().lerp(transCol, i / (cistN - 1));
      const torus = track(new THREE.TorusGeometry(0.92 + i * 0.075, 0.2, 12, 46, Math.PI * 1.22));
      const m = new THREE.Matrix4()
        .makeScale(1, 0.34, 1)
        .multiply(new THREE.Matrix4().makeRotationZ(i * 0.26))
        .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
        .setPosition(0, i * 0.265, 0);
      parts.push({ geo: torus, matrix: m, color: col });
    }
    // 池间小管连接
    for (let c = 0; c < 8; c++) {
      const i = c % (cistN - 1);
      const ang = 0.5 + hash01(`gc${c}`) * 2.2;
      const r = 0.95 + i * 0.075;
      const a = new THREE.Vector3(Math.cos(ang) * r, i * 0.265, Math.sin(ang) * r * 0.34);
      const b = new THREE.Vector3(Math.cos(ang) * r, (i + 1) * 0.265, Math.sin(ang) * r * 0.34);
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
        mm.setPosition(Math.cos(ang) * (1.15 + hash01(`gv${v}`, 3) * 0.2), 1.75 + hash01(`gv${v}`, 5) * 0.3, Math.sin(ang) * 0.5);
        buds.setMatrixAt(v, mm);
      }
      buds.instanceMatrix.needsUpdate = true;
      buds.renderOrder = 47;
    }
    g.add(buds);
    const p = sph(N + 1.3, -0.42, 2.4);
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = 3.0;
    group.add(g);
    labels.push({ pos: { x: p.x * 1.5, y: p.y + 0.65, z: p.z * 1.5 }, zh: '高尔基体（顺→反）', latin: 'Golgi apparatus' });
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
    for (let i = 0; i < spec.vesicleCount; i++) {
      const r = 0.13 + hash01(`v${i}`) * 0.14;
      const p = sph(R * (0.48 + hash01(`v${i}`, 3) * 0.38), (hash01(`v${i}`, 5) - 0.5) * 2.4, hash01(`v${i}`, 7) * Math.PI * 2);
      m.makeScale(r, r, r);
      m.setPosition(p.x, p.y, p.z);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 46;
    group.add(inst);
    const p0 = sph(R * 0.74, 1.0, 4.4);
    labels.push({ pos: p0, zh: '运输囊泡', latin: 'Transport vesicle' });
  }

  /* ================= 细胞骨架 ================= */
  {
    // 中心体（双联体中心粒）
    const c = new THREE.Vector3(1.9, -1.1, 1.6);
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
    // 中心体放射微管（合并, 原纤维条纹法线）
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    for (let i = 0; i < spec.microtubules; i++) {
      const end = sph(R * 0.96, (hash01(`t${i}`) - 0.5) * 2.4, hash01(`t${i}`, 3) * Math.PI * 2);
      const ctrl = c.clone().lerp(new THREE.Vector3(end.x, end.y, end.z), 0.6);
      ctrl.y += (hash01(`t${i}`, 9) - 0.5) * 1.6;
      const curve = new THREE.QuadraticBezierCurve3(c, ctrl, new THREE.Vector3(end.x, end.y, end.z));
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
    labels.push({ pos: { x: c.x * 2.5, y: c.y - 0.5, z: c.z * 2.5 }, zh: '微管（中心体放射）', latin: 'Microtubules' });

    // 皮层肌动蛋白网
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
        const rr = R - 0.5 - hash01(`ac${i}`, 7) * 0.35;
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
    const m2 = track(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#0b3b36', emissiveIntensity: 0.28 * dim, roughness: 0.65, transparent: true, opacity: 0.42 * dim, depthWrite: false }));
    const count = Math.round(430 * q) + 60;
    const inst = new THREE.InstancedMesh(geo, m2, count);
    const mm = new THREE.Matrix4();
    const c = new THREE.Color();
    const palette = ['#115e59', '#134e4a', '#0f766e', '#3f6212', '#78350f', '#475569', '#7f1d3a', '#155e50'];
    for (let i = 0; i < count; i++) {
      const r = 0.04 + hash01(`s${i}`) * 0.075;
      const p = sph(R * (0.42 + hash01(`s${i}`, 3) * 0.52), (hash01(`s${i}`, 5) - 0.5) * 2.7, hash01(`s${i}`, 7) * Math.PI * 2);
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
    const rosettes = 3;
    const perRosette = 15;
    const inst = new THREE.InstancedMesh(geo, m3, rosettes * perRosette);
    const mm = new THREE.Matrix4();
    for (let i = 0; i < rosettes * perRosette; i++) {
      const rosette = Math.floor(i / perRosette);
      const cp = sph(R * (0.55 + rosette * 0.13), 0.3 + rosette * 0.5, 1.2 + rosette * 2.3);
      const off = sph(0.08 + hash01(`g${i}`) * 0.24, (hash01(`g${i}`, 5) - 0.5) * 3, hash01(`g${i}`, 7) * Math.PI * 2);
      const s = 0.7 + hash01(`gs${i}`) * 0.6;
      mm.makeScale(s, s, s);
      mm.setPosition(cp.x + off.x, cp.y + off.y, cp.z + off.z);
      inst.setMatrixAt(i, mm);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 46;
    group.add(inst);
    const lp = sph(R * 0.82, 0.55, 1.3);
    labels.push({ pos: { x: lp.x * 1.3, y: lp.y, z: lp.z * 1.3 }, zh: '糖原玫瑰体', latin: 'Glycogen rosette' });
  }

  if (spec.microvilli) {
    const geo = track(new THREE.CapsuleGeometry(0.037, 0.5, 4, 9));
    const m4 = track(new THREE.MeshStandardMaterial({ color: '#2dd4bf', emissive: '#0d9488', emissiveIntensity: 0.55 * dim, transparent: true, opacity: 0.68 * dim, depthWrite: false }));
    const count = Math.round(180 * q) + 30;
    const inst = new THREE.InstancedMesh(geo, m4, count);
    const mm = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    fibSphere(count, 1).forEach((p, i) => {
      dir.set(p.x, p.y, p.z).normalize();
      const rr = surf(dir, R + 0.26, MEM_FREQ, MEM_AMP, 3);
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
    const ring = new THREE.Mesh(
      track(new THREE.TorusGeometry(R * Math.cos(0.52) * 0.985, 0.08, 12, 96)),
      track(glowMaterial('#fb923c', 0.4 * dim, THREE.DoubleSide)),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = R * Math.sin(0.52);
    ring.renderOrder = 62;
    group.add(ring);
    labels.push({ pos: sph(R * 1.24, 0.72, 2.6), zh: '紧密连接（封闭索）', latin: 'Tight junction' });
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
        const p = sph(R * (1.16 + t * 0.75), lat + Math.sin(t * 4 + i) * 0.1, lon + Math.sin(t * 3.2 + i * 2) * 0.14);
        pts.push(new THREE.Vector3(p.x, p.y, p.z));
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
      const rr = surf(dir, R - 0.1, MEM_FREQ, MEM_AMP, 3);
      const b = new THREE.Mesh(track(displacedSphere(r, 2, 3.0, r * 0.14, 23 + i)), m6);
      b.position.set(dir.x * rr, dir.y * rr, dir.z * rr);
      b.renderOrder = 62;
      group.add(b);
    }
    labels.push({ pos: sph(R * 1.36, -0.9, 5.2), zh: '膜出芽（侵袭表型）', latin: 'Membrane blebbing' });
  }

  if (spec.neurites) {
    // 轴突 + 髓鞘（郎飞氏结）+ 树突（棘突）
    const axonMat = mat({ color: '#14b8a6', transmission: transOn ? 0.3 : 0, thickness: 0.5, emissive: '#0d9488', emissiveIntensity: 0.14, opacity: transOn ? 1 : 0.4, roughness: 0.4 });
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const p = sph(R * (0.96 + t * 0.8), 0.62 + Math.sin(t * 5) * 0.12, 0.55 + t * 0.5);
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
      const lat = -0.75 + d * 0.55;
      const lon = 2.2 + d * 1.4;
      const dpts: THREE.Vector3[] = [];
      for (let k = 0; k <= 5; k++) {
        const t = k / 5;
        const p = sph(R * (0.96 + t * 0.36), lat + t * 0.1, lon + Math.sin(t * 3 + d) * 0.15);
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
    labels.push({ pos: sph(R * 1.32, -0.9, 2.4), zh: '树突（棘突）', latin: 'Dendrite' });
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
    // 膜流动镶嵌: 脂双层缓慢对流
    membraneGroup.rotation.y = t * 0.012;
    cytosol.rotation.y = t * 0.018;
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

/** 细胞体组件（仅 dim/规格/画质变化时重建, 动画走 imperative 帧驱动） */
export const CellBody = ({ spec, tint, dim, showAnatomy, perf }: {
  spec: CellBodySpec;
  tint: string;
  dim: number;
  showAnatomy: boolean;
  /** 低端设备流畅模式（禁用折射/减实例） */
  perf?: boolean;
}) => {
  const build = useMemo(() => buildCellBody(spec, tint, dim, perf ?? false), [spec, tint, dim, perf]);
  useEffect(() => () => build.dispose(), [build]);

  useFrame((state) => build.update(state.clock.elapsedTime));

  return (
    <>
      <primitive object={build.group} />
      {showAnatomy &&
        build.labels.map((l, i) => (
          <Html key={i} position={[l.pos.x, l.pos.y, l.pos.z]} center transform distanceFactor={16} zIndexRange={[30, 0]} pointerEvents="none" style={{ pointerEvents: 'none' }}>
            <div className="anatomy-tag">
              <span className="anatomy-zh">{l.zh}</span>
              <span className="anatomy-latin">{l.latin}</span>
            </div>
          </Html>
        ))}
    </>
  );
};
