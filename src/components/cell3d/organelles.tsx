'use client';

/**
 * 3D 细胞体构建器 —— 命令式 three.js 组装细胞超微结构
 * 科学参照: Alberts MBoC / Karp Cell & Molecular Biology
 *   - 质膜: 磷脂双分子层（内外两层脂头实例化排布，斐波那契球面）
 *   - 核被膜: 双层膜 + 核孔复合体（NPC）
 *   - 线粒体: 外膜 + 内折叠嵴（管状/环状）
 *   - 粗面内质网: 扁平囊池 + 膜旁核糖体颗粒
 *   - 高尔基体: 顺面→反面 stacked 囊池 + 出芽囊泡
 *   - 微管自中心体放射；胞质颗粒体现分子拥挤
 * 细胞类型特化: 糖原(肝)/微绒毛+紧密连接(上皮)/胶原(成纤维)/
 *               髓鞘轴突(神经元)/高核质比(T)/核多形性+膜出芽(癌)
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { CellBodySpec, Vec3 } from '@/lib/simulation/layout3d';

function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function fibSphere(count: number, r: number): Vec3[] {
  const pts: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    pts.push({ x: Math.cos(th) * rad * r, y: y * r, z: Math.sin(th) * rad * r });
  }
  return pts;
}

function sph(r: number, lat: number, lon: number): Vec3 {
  return { x: r * Math.cos(lat) * Math.cos(lon), y: r * Math.sin(lat), z: r * Math.cos(lat) * Math.sin(lon) };
}

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

/** 透明材质通用参数（关深度写入避免透明排序伪影） */
function transMat(opts: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ ...opts, transparent: true, depthWrite: false });
}

export function buildCellBody(spec: CellBodySpec, tint: string, dim: number): CellBodyBuild {
  const group = new THREE.Group();
  const R = spec.membraneR;
  const N = spec.nucleusR;
  const f = dim; // 专注模式亮度系数
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T): T => {
    disposables.push(o);
    return o;
  };
  const labels: AnatomyLabel[] = [];

  // ================= 质膜（磷脂双分子层） =================
  const membraneGeo = track(new THREE.SphereGeometry(R, 64, 48));
  const membraneMat = track(
    transMat({ color: tint, opacity: 0.05 * f, side: THREE.DoubleSide, roughness: 0.35, emissive: tint, emissiveIntensity: 0.03 }),
  );
  const membrane = new THREE.Mesh(membraneGeo, membraneMat);
  membrane.renderOrder = 80;
  group.add(membrane);

  // 外缘辉光
  const glowGeo = track(new THREE.SphereGeometry(R * 1.055, 48, 32));
  const glowMat = track(new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.05 * f, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.renderOrder = 70;
  group.add(glow);

  // 脂双层脂头（外叶 / 内叶）
  const headGeo = track(new THREE.SphereGeometry(0.085, 6, 6));
  const makeLeaflet = (r: number, count: number, color: string, opacity: number) => {
    const mat = track(new THREE.MeshStandardMaterial({ color, transparent: true, opacity: opacity * f, emissive: color, emissiveIntensity: 0.45, depthWrite: false }));
    const inst = new THREE.InstancedMesh(headGeo, mat, count);
    const m = new THREE.Matrix4();
    fibSphere(count, r).forEach((p, i) => {
      const s = 0.8 + hash01(`h${i}`, Math.round(r)) * 0.5;
      m.makeScale(s, s, s);
      m.setPosition(p.x, p.y, p.z);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 60;
    group.add(inst);
    return inst;
  };
  makeLeaflet(R, 720, '#2dd4bf', 0.72);
  makeLeaflet(R - 0.34, 720, '#0f766e', 0.5);
  labels.push({ pos: sph(R * 1.12, 0.62, 0.4), zh: '质膜（脂双层）', latin: 'Plasma membrane' });

  // ================= 核被膜 + 核孔复合体 =================
  const nucMat = track(transMat({ color: '#fb7185', opacity: 0.075 * f, side: THREE.DoubleSide, roughness: 0.4, emissive: '#9f1239', emissiveIntensity: 0.05 }));
  const nucOuter = new THREE.Mesh(track(new THREE.SphereGeometry(N, 48, 32)), nucMat);
  nucOuter.renderOrder = 50;
  group.add(nucOuter);
  const nucInner = new THREE.Mesh(track(new THREE.SphereGeometry(N - 0.17, 40, 28)), nucMat);
  nucInner.renderOrder = 50;
  group.add(nucInner);
  // 核质底色
  const nucleoplasm = new THREE.Mesh(
    track(new THREE.SphereGeometry(N * 0.985, 32, 24)),
    track(new THREE.MeshBasicMaterial({ color: '#881337', transparent: true, opacity: 0.1 * f, depthWrite: false })),
  );
  nucleoplasm.renderOrder = 40;
  group.add(nucleoplasm);

  // 癌细胞多形性核（低频位移）
  if (spec.nucleusBumpy) {
    const pos = nucOuter.geometry.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = Math.sin(v.x * 2.3) * Math.sin(v.y * 1.9) * Math.sin(v.z * 2.7);
      v.multiplyScalar(1 + n * 0.07);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    nucOuter.geometry.computeVertexNormals();
    for (let i = 0; i < 5; i++) {
      const blob = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.34 + hash01(`b${i}`) * 0.24, 12, 10)),
        nucMat,
      );
      const p = sph(N * 0.99, (hash01(`bl${i}`, 2) - 0.5) * 2.4, hash01(`bl${i}`, 5) * Math.PI * 2);
      blob.position.set(p.x, p.y, p.z);
      blob.renderOrder = 50;
      group.add(blob);
    }
  }

  // 核孔（NPC，环状八重对称体近似为环面）
  const poreGeo = track(new THREE.TorusGeometry(0.15, 0.06, 8, 14));
  const poreMat = track(new THREE.MeshStandardMaterial({ color: '#e2e8f0', transparent: true, opacity: 0.85 * f, emissive: '#94a3b8', emissiveIntensity: 0.35, depthWrite: false }));
  const pores = new THREE.InstancedMesh(poreGeo, poreMat, 52);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 0, 1);
    const n = new THREE.Vector3();
    fibSphere(52, N).forEach((p, i) => {
      n.set(p.x, p.y, p.z).normalize();
      q.setFromUnitVectors(up, n);
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(1.25, 1.25, 1.25));
      pores.setMatrixAt(i, m);
    });
    pores.instanceMatrix.needsUpdate = true;
    pores.renderOrder = 55;
    group.add(pores);
  }
  labels.push({ pos: sph(N * 1.35, 0.35, 1.9), zh: '核孔复合体', latin: 'Nuclear pore complex' });
  labels.push({ pos: { x: 0, y: N * 1.15, z: 0 }, zh: '核被膜（双层）', latin: 'Nuclear envelope' });

  // 核仁（rRNA 转录/加工中心）
  const nucleoli: THREE.Mesh[] = [];
  for (let i = 0; i < spec.nucleolus.count; i++) {
    const r = spec.nucleolus.r * (1 - i * 0.22);
    const mesh = new THREE.Mesh(
      track(new THREE.SphereGeometry(r, 24, 18)),
      track(transMat({ color: '#fb7185', opacity: 0.6 * f, roughness: 0.6, emissive: '#be123c', emissiveIntensity: 0.5 })),
    );
    const p = sph(N * 0.3, i * 0.7 - 0.3, i * 2.4 + 0.8);
    mesh.position.set(p.x, p.y, p.z);
    mesh.renderOrder = 45;
    group.add(mesh);
    nucleoli.push(mesh);
  }
  const n0 = nucleoli[0].position;
  labels.push({ pos: { x: n0.x * 1.6, y: n0.y + 0.55, z: n0.z }, zh: '核仁', latin: 'Nucleolus' });

  // 染色质纤维
  for (let i = 0; i < 14; i++) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < 4; k++) {
      const p = sph(N * (0.25 + hash01(`c${i}${k}`) * 0.6), (hash01(`c${i}${k}`, 3) - 0.5) * 2.6, hash01(`c${i}${k}`, 7) * Math.PI * 2);
      pts.push(new THREE.Vector3(p.x, p.y, p.z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(
      track(new THREE.TubeGeometry(curve, 24, 0.03, 6)),
      track(transMat({ color: '#f472b6', opacity: 0.32 * f, emissive: '#be185d', emissiveIntensity: 0.25 })),
    );
    tube.renderOrder = 42;
    group.add(tube);
  }

  // ================= 线粒体（外膜 + 嵴） =================
  const mitos: { obj: THREE.Group; baseY: number; phase: number }[] = [];
  for (let i = 0; i < spec.mitoCount; i++) {
    const g = new THREE.Group();
    const outer = new THREE.Mesh(
      track(new THREE.CapsuleGeometry(0.52, 1.05, 6, 14)),
      transMat({ color: '#10b981', opacity: 0.2 * f, roughness: 0.3, emissive: '#059669', emissiveIntensity: 0.3 }),
    );
    outer.scale.set(1, 1, 0.72);
    outer.renderOrder = 46;
    g.add(outer);
    // 嵴：沿长轴的波浪管
    for (let c = 0; c < 2; c++) {
      const cristPts: THREE.Vector3[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        cristPts.push(new THREE.Vector3(Math.sin(t * Math.PI * (2.5 + c)) * 0.24, (t - 0.5) * 1.35, Math.cos(t * Math.PI * (2.1 + c * 0.6)) * 0.18));
      }
      const crista = new THREE.Mesh(
        track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cristPts), 28, 0.055, 6)),
        track(transMat({ color: '#6ee7b7', opacity: 0.6 * f, emissive: '#34d399', emissiveIntensity: 0.55 })),
      );
      crista.renderOrder = 47;
      g.add(crista);
    }
    // 嵴：环状板
    for (let ring = 0; ring < 3; ring++) {
      const t = new THREE.Mesh(
        track(new THREE.TorusGeometry(0.34, 0.045, 8, 20)),
        track(transMat({ color: '#6ee7b7', opacity: 0.5 * f, emissive: '#34d399', emissiveIntensity: 0.4 })),
      );
      t.rotation.x = Math.PI / 2;
      t.position.y = -0.38 + ring * 0.38;
      t.scale.set(1, 1, 0.72);
      t.renderOrder = 47;
      g.add(t);
    }
    const p = sph(R * (0.46 + hash01(`m${i}`) * 0.3), (hash01(`m${i}`, 3) - 0.5) * 2.1, hash01(`m${i}`, 5) * Math.PI * 2);
    g.position.set(p.x, p.y, p.z);
    g.rotation.set(hash01(`m${i}`, 9) * 2.1, hash01(`m${i}`, 11) * 2.1, hash01(`m${i}`, 13) * 2.1);
    group.add(g);
    mitos.push({ obj: g, baseY: p.y, phase: hash01(`m${i}`, 17) * Math.PI * 2 });
  }
  if (mitos.length) {
    const m0 = mitos[0].obj.position;
    labels.push({ pos: { x: m0.x * 1.35, y: m0.y + 0.8, z: m0.z * 1.35 }, zh: '线粒体（嵴）', latin: 'Mitochondrion' });
  }

  // ================= 粗面内质网（囊池 + 核糖体） =================
  const ribosomePts: THREE.Vector3[] = [];
  for (let s = 0; s < spec.erSheets; s++) {
    const latBase = -0.62 + s * 0.42;
    const lon0 = s * 1.9;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 14; k++) {
      const t = k / 14;
      const p = sph(
        N + 0.6 + Math.sin(t * Math.PI * 2.3 + s) * 0.28,
        latBase + Math.sin(t * Math.PI * 3.1) * 0.2,
        lon0 + t * Math.PI * 1.55,
      );
      pts.push(new THREE.Vector3(p.x, p.y, p.z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const sheet = new THREE.Mesh(
      track(new THREE.TubeGeometry(curve, 48, 0.3, 10)),
      transMat({ color: '#14b8a6', opacity: 0.26 * f, roughness: 0.4, emissive: '#0d9488', emissiveIntensity: 0.2 }),
    );
    sheet.scale.set(1, 0.3, 1);
    sheet.renderOrder = 46;
    group.add(sheet);
    // 膜旁核糖体
    for (let k = 0; k <= 16; k++) {
      const p = curve.getPoint(k / 16);
      ribosomePts.push(new THREE.Vector3(p.x, p.y + 0.14, p.z));
      if (k % 2 === 0) ribosomePts.push(new THREE.Vector3(p.x, p.y - 0.13, p.z));
    }
  }
  if (ribosomePts.length) {
    const ribGeo = track(new THREE.SphereGeometry(0.05, 6, 6));
    const ribMat = track(new THREE.MeshStandardMaterial({ color: '#fbbf24', transparent: true, opacity: 0.85 * f, emissive: '#d97706', emissiveIntensity: 0.5, depthWrite: false }));
    const inst = new THREE.InstancedMesh(ribGeo, ribMat, ribosomePts.length);
    const m = new THREE.Matrix4();
    ribosomePts.forEach((p, i) => {
      m.identity();
      m.setPosition(p.x, p.y, p.z);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 47;
    group.add(inst);
  }
  if (spec.erSheets) {
    const p = sph(N + 1.5, -0.62, 1.4);
    labels.push({ pos: { x: p.x, y: p.y + 0.7, z: p.z }, zh: '粗面内质网（核糖体）', latin: 'Rough ER' });
  }

  // ================= 高尔基体（顺→反囊池堆叠） =================
  {
    const g = new THREE.Group();
    const cols = ['#99f6e4', '#5eead4', '#2dd4bf', '#fbbf24', '#f59e0b'];
    for (let i = 0; i < 5; i++) {
      const cis = new THREE.Mesh(
        track(new THREE.TorusGeometry(0.95 + i * 0.1, 0.24, 10, 40, Math.PI * 1.1)),
        transMat({ color: cols[i], opacity: 0.4 * f, roughness: 0.35, emissive: cols[i], emissiveIntensity: 0.3 }),
      );
      cis.rotation.x = -Math.PI / 2;
      cis.rotation.z = i * 0.28;
      cis.scale.set(1, 1, 0.34);
      cis.position.y = i * 0.3;
      cis.renderOrder = 46;
      g.add(cis);
    }
    // 反面出芽囊泡
    for (let v = 0; v < 3; v++) {
      const bud = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.14, 10, 8)),
        track(transMat({ color: '#fbbf24', opacity: 0.55 * f, emissive: '#d97706', emissiveIntensity: 0.4 })),
      );
      bud.position.set(0.7 + v * 0.16, 1.6, 0.2 * v);
      bud.renderOrder = 47;
      g.add(bud);
    }
    const aG = 2.4;
    const p = sph(N + 1.15, -0.42, aG);
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = aG + 0.6;
    group.add(g);
    labels.push({ pos: { x: p.x * 1.45, y: p.y + 0.6, z: p.z * 1.45 }, zh: '高尔基体', latin: 'Golgi apparatus' });
  }

  // ================= 运输囊泡 =================
  {
    const vGeo = track(new THREE.SphereGeometry(1, 10, 8));
    const vMat = track(transMat({ color: '#a3e635', opacity: 0.35 * f, emissive: '#65a30d', emissiveIntensity: 0.25 }));
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
    const p0 = sph(R * 0.72, 1.0, 4.4);
    labels.push({ pos: p0, zh: '运输囊泡', latin: 'Transport vesicle' });
  }

  // ================= 微管（中心体放射） =================
  {
    const c = new THREE.Vector3(1.9, -1.1, 1.6);
    const mtMat = track(transMat({ color: '#94a3b8', opacity: 0.4 * f, emissive: '#475569', emissiveIntensity: 0.3 }));
    for (let i = 0; i < spec.microtubules; i++) {
      const end = sph(R * 0.96, (hash01(`t${i}`) - 0.5) * 2.4, hash01(`t${i}`, 3) * Math.PI * 2);
      const ctrl = c.clone().lerp(new THREE.Vector3(end.x, end.y, end.z), 0.6);
      ctrl.y += (hash01(`t${i}`, 9) - 0.5) * 1.6;
      const curve = new THREE.QuadraticBezierCurve3(c, ctrl, new THREE.Vector3(end.x, end.y, end.z));
      const mt = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 20, 0.028, 6)), mtMat);
      mt.renderOrder = 44;
      group.add(mt);
    }
    labels.push({ pos: { x: c.x * 2.4, y: c.y - 0.5, z: c.z * 2.4 }, zh: '微管（中心体）', latin: 'Microtubule' });
  }

  // ================= 胞质颗粒（分子拥挤） =================
  const cytosol = (() => {
    const geo = track(new THREE.SphereGeometry(1, 6, 6));
    const mat = track(new THREE.MeshStandardMaterial({ color: '#0f766e', transparent: true, opacity: 0.32 * f, emissive: '#134e4a', emissiveIntensity: 0.3, depthWrite: false }));
    const inst = new THREE.InstancedMesh(geo, mat, 300);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 300; i++) {
      const r = 0.05 + hash01(`s${i}`) * 0.07;
      const p = sph(R * (0.44 + hash01(`s${i}`, 3) * 0.5), (hash01(`s${i}`, 5) - 0.5) * 2.7, hash01(`s${i}`, 7) * Math.PI * 2);
      m.makeScale(r, r, r);
      m.setPosition(p.x, p.y, p.z);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 30;
    group.add(inst);
    return inst;
  })();

  // ================= 细胞类型特化结构 =================
  if (spec.glycogen) {
    // 肝细胞糖原玫瑰体
    const geo = track(new THREE.SphereGeometry(1, 6, 6));
    const mat = track(new THREE.MeshStandardMaterial({ color: '#fde047', transparent: true, opacity: 0.5 * f, emissive: '#a16207', emissiveIntensity: 0.4, depthWrite: false }));
    const inst = new THREE.InstancedMesh(geo, mat, 150);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 150; i++) {
      const rosette = Math.floor(i / 50);
      const cp = sph(R * (0.55 + rosette * 0.12), 0.3 + rosette * 0.5, 1.2 + rosette * 2.3);
      const r = 0.035 + hash01(`g${i}`) * 0.05;
      const off = sph(0.18 + hash01(`g${i}`, 3) * 0.3, (hash01(`g${i}`, 5) - 0.5) * 3, hash01(`g${i}`, 7) * Math.PI * 2);
      m.makeScale(r, r, r);
      m.setPosition(cp.x + off.x, cp.y + off.y, cp.z + off.z);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 46;
    group.add(inst);
    const lp = sph(R * 0.78, 0.55, 1.3);
    labels.push({ pos: { x: lp.x * 1.28, y: lp.y, z: lp.z * 1.28 }, zh: '糖原颗粒', latin: 'Glycogen' });
  }

  if (spec.microvilli) {
    // 上皮顶端微绒毛刷状缘
    const geo = track(new THREE.CapsuleGeometry(0.035, 0.4, 4, 8));
    const mat = track(new THREE.MeshStandardMaterial({ color: '#2dd4bf', transparent: true, opacity: 0.6 * f, emissive: '#0d9488', emissiveIntensity: 0.5, depthWrite: false }));
    const inst = new THREE.InstancedMesh(geo, mat, 140);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const n = new THREE.Vector3();
    for (let i = 0; i < 140; i++) {
      const lat = 0.95 + hash01(`mv${i}`) * 0.5;
      const p = sph(R + 0.24, lat, hash01(`mv${i}`, 3) * Math.PI * 2);
      n.set(p.x, p.y, p.z).normalize();
      q.setFromUnitVectors(up, n);
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 46;
    group.add(inst);
    const lp = sph(R * 1.3, 1.3, 0.5);
    labels.push({ pos: lp, zh: '微绒毛（刷状缘）', latin: 'Microvilli' });
  }

  if (spec.tightJunction) {
    // 紧密连接带（封闭索）
    const ring = new THREE.Mesh(
      track(new THREE.TorusGeometry(R * Math.cos(0.52) * 0.985, 0.075, 10, 64)),
      track(transMat({ color: '#fb923c', opacity: 0.65 * f, emissive: '#c2410c', emissiveIntensity: 0.55 })),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = R * Math.sin(0.52);
    ring.renderOrder = 60;
    group.add(ring);
    labels.push({ pos: sph(R * 1.2, 0.72, 2.6), zh: '紧密连接', latin: 'Tight junction' });
  }

  if (spec.collagen) {
    // 成纤维细胞胞外胶原纤维（I 型）
    const mat = track(transMat({ color: '#fbbf24', opacity: 0.42 * f, emissive: '#b45309', emissiveIntensity: 0.3 }));
    for (let i = 0; i < 7; i++) {
      const lat = (hash01(`co${i}`) > 0.5 ? 1 : -1) * (0.55 + hash01(`co${i}`, 3) * 0.6);
      const lon = hash01(`co${i}`, 5) * Math.PI * 2;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const p = sph(R * (1.14 + t * 0.72), lat + Math.sin(t * 4 + i) * 0.1, lon + Math.sin(t * 3.2 + i * 2) * 0.14);
        pts.push(new THREE.Vector3(p.x, p.y, p.z));
      }
      const fiber = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, 0.07, 8)), mat);
      fiber.renderOrder = 62;
      group.add(fiber);
    }
    labels.push({ pos: sph(R * 1.62, 0.95, 3.6), zh: '胶原纤维（I 型）', latin: 'Collagen fiber' });
  }

  if (spec.blebs) {
    // 癌细胞膜出芽（侵袭表型）
    const mat = transMat({ color: '#14b8a6', opacity: 0.3 * f, emissive: '#0f766e', emissiveIntensity: 0.25 });
    for (let i = 0; i < 9; i++) {
      const r = 0.26 + hash01(`bb${i}`) * 0.3;
      const b = new THREE.Mesh(track(new THREE.SphereGeometry(r, 12, 10)), mat);
      const p = sph(R - 0.12, (hash01(`bb${i}`, 3) - 0.5) * 2.8, hash01(`bb${i}`, 5) * Math.PI * 2);
      b.position.set(p.x, p.y, p.z);
      b.renderOrder = 62;
      group.add(b);
    }
    const lp = sph(R * 1.32, -0.9, 5.2);
    labels.push({ pos: lp, zh: '膜出芽', latin: 'Membrane blebbing' });
  }

  if (spec.neurites) {
    // 神经元: 髓鞘轴突 + 树突
    const axonMat = transMat({ color: '#14b8a6', opacity: 0.2 * f, emissive: '#0d9488', emissiveIntensity: 0.15 });
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const p = sph(R * (0.96 + t * 0.78), 0.62 + Math.sin(t * 5) * 0.12, 0.55 + t * 0.5);
      pts.push(new THREE.Vector3(p.x, p.y, p.z));
    }
    const axon = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.3, 12)), axonMat);
    axon.renderOrder = 62;
    group.add(axon);
    // 髓鞘节段（郎飞氏结间）
    const curve = new THREE.CatmullRomCurve3(pts);
    const myelinMat = transMat({ color: '#fafaf9', opacity: 0.5 * f, emissive: '#a8a29e', emissiveIntensity: 0.2 });
    for (let k = 0; k < 5; k++) {
      const t = 0.2 + k * 0.15;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const seg = new THREE.Mesh(track(new THREE.CylinderGeometry(0.5, 0.5, 0.62, 14)), myelinMat);
      seg.position.copy(p);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
      seg.renderOrder = 63;
      group.add(seg);
    }
    labels.push({ pos: curve.getPoint(0.62).clone().multiplyScalar(1.18), zh: '髓鞘轴突', latin: 'Myelinated axon' });
    // 树突
    for (let d = 0; d < 4; d++) {
      const lat = -0.75 + d * 0.55;
      const lon = 2.2 + d * 1.4;
      const dpts: THREE.Vector3[] = [];
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        const p = sph(R * (0.96 + t * 0.34), lat + t * 0.1, lon + Math.sin(t * 3 + d) * 0.15);
        dpts.push(new THREE.Vector3(p.x, p.y, p.z));
      }
      const dend = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(dpts), 20, 0.16, 8)), axonMat);
      dend.renderOrder = 62;
      group.add(dend);
    }
    labels.push({ pos: sph(R * 1.28, -0.9, 2.4), zh: '树突', latin: 'Dendrite' });
  }

  const update = (t: number) => {
    for (const m of mitos) {
      m.obj.position.y = m.baseY + Math.sin(t * 0.55 + m.phase) * 0.16;
      m.obj.rotation.y += 0.0016;
    }
    cytosol.rotation.y = t * 0.018;
    for (let i = 0; i < nucleoli.length; i++) {
      const s = 1 + Math.sin(t * 1.1 + i) * 0.035;
      nucleoli[i].scale.setScalar(s);
    }
  };

  const dispose = () => {
    for (const d of disposables) d.dispose();
    group.clear();
  };

  return { group, update, labels, dispose };
}

/** 细胞体组件（仅 dim/规格变化时重建，动画走 imperative 帧驱动） */
export const CellBody = ({ spec, tint, dim, showAnatomy }: {
  spec: CellBodySpec;
  tint: string;
  dim: number;
  showAnatomy: boolean;
}) => {
  const build = useMemo(() => buildCellBody(spec, tint, dim), [spec, tint, dim]);
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
