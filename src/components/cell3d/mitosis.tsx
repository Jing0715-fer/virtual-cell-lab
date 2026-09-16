'use client';

/**
 * 细胞分裂（有丝分裂）3D 演示 v14 —— 「基于现有 3D 细胞标准, 不过度简化」
 * 相位（MBoC 6th Ch.17 时序）: 间期 → 前期 → 前中期 → 中期 → 后期 → 末期 → 胞质分裂
 *
 * 复用主细胞体标准:
 *   - REF 参照图配色系统（染色体熏衣草族/微管石板族/线粒体暖古铜/膜 tint 同源）
 *   - organelleMaterial 有机流光材质工厂 + 程序化法线贴图
 *   - 程序化几何工具（mergeGeoms/displaceGeometry/hash01）
 *
 * 结构完整度（拒绝过度简化）:
 *   - 染色体: 10 对 × 双姐妹染色单体（短臂 p + 长臂 q + 着丝粒 + 极向动粒金盘）
 *   - 纺锤体: 动粒微管（逐染色体双极连接, 逐帧跟随）/ 极微管（中央重叠区）/ 星体微管
 *   - 核被膜: 间期完整 → 前中期崩解为膜泡碎片（lamins 磷酸化解体语义）→ 末期双子核重组
 *   - 质膜: 逐帧轮廓形态学（球 → 拉长 → 哑铃 → 中间体连接的两个子细胞）
 *   - 细胞器分配: 线粒体/运输囊泡/高尔基碎片/外周 ER 管网/核糖体 —— 双子细胞不均等分配
 *   - 收缩环（actomyosin）→ 中间体（致密胞质桥）
 *   - 全程悬停标记（复用 OrganelleHoverLayer —— 相位感知动态目标）
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { organelleMaterial, REF, createTimeUniform, type TimeUniform } from './materials';
import { mergeGeoms, hash01 } from './procedural';
import { organicNormalMap, stripeNormalMap } from './textures';
import { OrganelleHoverLayer, type HoverTarget } from './hover-labels';
import { useLang } from '@/lib/i18n';

/* ============ 相位定义（双语 + 关键分子事件） ============ */

export interface MitosisPhaseInfo {
  key: string;
  zh: string;
  en: string;
  latin: string;
  /** 一句话关键事件（含分子机制） */
  descZh: string;
  descEn: string;
}

export const MITOSIS_PHASES: MitosisPhaseInfo[] = [
  {
    key: 'interphase', zh: '间期', en: 'Interphase', latin: 'Interphase',
    descZh: 'DNA 已复制（S 期）; 中心体已复制为两对; 染色质松散, 基因表达活跃',
    descEn: 'DNA replicated (S phase); duplicated centrosomes; diffuse, active chromatin',
  },
  {
    key: 'prophase', zh: '前期', en: 'Prophase', latin: 'Prophase',
    descZh: 'condensin 凝聚染色质成染色体; 中心体对向两极迁移并起始微管成核',
    descEn: 'Condensin condenses chromatin; centrosomes migrate apart nucleating MTs',
  },
  {
    key: 'prometaphase', zh: '前中期', en: 'Prometaphase', latin: 'Prometaphase',
    descZh: '核纤层蛋白磷酸化 → 核被膜崩解为膜泡; 动粒捕获微管, 染色体向赤道汇集',
    descEn: 'Lamin phosphorylation dissolves the envelope; kinetochores capture MTs',
  },
  {
    key: 'metaphase', zh: '中期', en: 'Metaphase', latin: 'Metaphase',
    descZh: '染色体列队赤道板（动粒-微管张力平衡, Mad2 校验点把关）',
    descEn: 'Chromosomes align at the plate under kinetochore tension (Mad2 checkpoint)',
  },
  {
    key: 'anaphase', zh: '后期', en: 'Anaphase', latin: 'Anaphase',
    descZh: 'separase 切割 cohesin → 姐妹染色单体分离; 纺锤体拉长, 两极外移',
    descEn: 'Separase cleaves cohesin; chromatids segregate as the spindle elongates',
  },
  {
    key: 'telophase', zh: '末期', en: 'Telophase', latin: 'Telophase',
    descZh: '染色体去凝聚; 核被膜围绕两套染色体重组; RhoA 招募 actomyosin 收缩环',
    descEn: 'Chromosomes decondense; envelopes re-form; contractile ring assembles',
  },
  {
    key: 'cytokinesis', zh: '胞质分裂', en: 'Cytokinesis', latin: 'Cytokinesis',
    descZh: '收缩环缢裂 → 中间体胞质桥 → 两个子细胞（各自获得完整细胞器分配）',
    descEn: 'The ring constricts to a midbody bridge, yielding two daughter cells',
  },
];

/** 每单位相位时钟时长（秒, × speed 播放; 总周期 = 6 单位 × 7s = 42s） */
export const MITOSIS_PHASE_SECONDS = 7;

/** 相位边界（t ∈ [0,6] 不等分 —— 生物学时长: 间期展示较短, 中/后期事件紧凑） */
const PHASE_BOUNDS = [0, 0.78, 1.62, 2.42, 3.32, 4.22, 5.1, 6];
const phaseOf = (t: number): number => {
  for (let i = PHASE_BOUNDS.length - 1; i >= 1; i--) {
    if (t >= PHASE_BOUNDS[i]) return Math.min(6, i);
  }
  return 0;
};

/* ============ 形态学参数（连续 t ∈ [0, 6]） ============ */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
/** t∈[a,b] 的归一化平滑进度 */
const ramp = (t: number, a: number, b: number) => smooth(clamp01((t - a) / (b - a)));

const R_CELL = 8.5; // 细胞基准半径
const NUC_R = 3.4; // 间期核半径
const POLE_Z0 = 5.4; // 中期纺锤体半长（两极 z = ±）

/* ============ 场景构建 ============ */

interface ChromosomeObj {
  group: THREE.Group;
  /** 姐妹染色单体 A/B（后期分离） */
  cA: THREE.Group;
  cB: THREE.Group;
  /** 赤道板位（metaphase plate, XY 平面） */
  plate: THREE.Vector3;
  /** 前期散布位（间期核内随机） */
  home: THREE.Vector3;
  /** 赤道板上随机朝向 */
  spin: number;
  /** 各染色体相位微延迟（自然不同步） */
  delay: number;
  kinA: THREE.Mesh;
  kinB: THREE.Mesh;
}

interface MitosisBuild {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
  /** 相位感知悬停目标（每相位重算） */
  targets: (phase: number) => HoverTarget[];
  dispose: () => void;
}

function buildMitosisScene(perf: boolean): MitosisBuild {
  const group = new THREE.Group();
  // 31° 偏航: 纺锤体 Z 轴斜向观察者 —— 赤道板（XY）椭圆展开可读, 单体分离带横向分量,
  // 缢裂环呈椭圆（教科书 3/4 视角; 悬停目标坐标同步旋转, Html 世界对齐）
  const ROT_Y = -0.55;
  group.rotation.y = ROT_Y;
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T): T => {
    disposables.push(o);
    return o;
  };
  const uTime = createTimeUniform();
  const dim = 1;
  const mat = (opts: Parameters<typeof organelleMaterial>[0]) => track(organelleMaterial({ uTime, dim, ...opts }));

  const orgNormal = organicNormalMap({ freq: 5, strength: 2.4, seed: 47, repeat: 3 });
  const mtStripe = stripeNormalMap({ size: 64, stripes: 13, width: 0.3, strength: 2.2, dir: 'y', repeat: 1 });
  const memNormal = organicNormalMap({ freq: 6, strength: 2.0, seed: 11, repeat: 3 });

  /* ---------- 质膜（逐帧形态学: 球 → 拉长 → 哑铃 → 双子细胞） ---------- */
  const memGeo = track(new THREE.SphereGeometry(1, perf ? 36 : 56, perf ? 24 : 36));
  const memMat = mat({
    color: '#4e5a55',
    // v13 发表级锐度同款: transmission 0.7 + roughness 0.07（透射 mip 近零模糊 —— 染色体主角锐利透读）
    transmission: perf ? 0 : 0.7,
    thickness: 0.55,
    roughness: 0.07,
    normalMap: memNormal,
    normalScale: 0.3,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
    iridescence: 0.25,
    sheen: 0.4,
    sheenColor: REF.sheen,
    // 流畅模式: 半透明薄纱 0.5（0.85 会把内景主角糊成暗影）
    opacity: perf ? 0.5 : 1,
    emissive: '#2a3438',
    emissiveIntensity: 0.1,
    flow: { color: '#5a7a84', strength: 0.14, scale: 0.8, speed: 0.06, rim: 0.2 },
  });
  const membrane = new THREE.Mesh(memGeo, memMat);
  membrane.renderOrder = 50;
  group.add(membrane);
  const memPos = memGeo.attributes.position as THREE.BufferAttribute;
  const memDir = new Float32Array(memPos.count * 3);
  for (let i = 0; i < memPos.count; i++) {
    const v = new THREE.Vector3(memPos.getX(i), memPos.getY(i), memPos.getZ(i)).normalize();
    memDir[i * 3] = v.x; memDir[i * 3 + 1] = v.y; memDir[i * 3 + 2] = v.z;
  }

  /** 形态学: 半长 L 与纬向轮廓 r(u)（u: 0=−Z 极, 1=+Z 极） */
  const membraneProfile = (t: number): { L: number; r: (u: number) => number } => {
    const elong = ramp(t, 2.9, 4.4) * 0.14 + ramp(t, 4.4, 6) * 0.18; // 后期拉长 + 末/胞质继续
    const L = R_CELL * (1 + elong);
    const furrowK = ramp(t, 4.55, 5.95);
    const shrink = 1 - 0.1 * furrowK; // 体积近似守恒
    const rFn = (u: number) => {
      const base = R_CELL * shrink * Math.pow(Math.max(1e-4, Math.sin(Math.PI * u)), 0.92);
      const dip = furrowK * R_CELL * 0.8 * Math.exp(-((u - 0.5) ** 2) / (2 * 0.13 ** 2));
      let rr = base - dip;
      if (furrowK > 0.5) rr = Math.max(0.3, rr); // 中间体桥半径
      return rr;
    };
    return { L, r: rFn };
  };
  const tmpV = new THREE.Vector3();
  const updateMembrane = (t: number) => {
    const { L, r } = membraneProfile(t);
    for (let i = 0; i < memPos.count; i++) {
      const dx = memDir[i * 3], dy = memDir[i * 3 + 1], dz = memDir[i * 3 + 2];
      const u = (dz + 1) / 2;
      const rr = Math.max(0.02, r(u));
      const horiz = Math.sqrt(Math.max(1e-6, 1 - dz * dz));
      memPos.setXYZ(i, (dx / horiz) * rr, (dy / horiz) * rr, dz * L);
    }
    memPos.needsUpdate = true;
    memGeo.computeVertexNormals();
    return { L, r };
  };

  /* ---------- 间期染色质（松散纤维网 + 核仁; 前期凝聚淡出） ---------- */
  const chromatinMat = mat({
    color: REF.chromatin,
    emissive: '#463a56',
    emissiveIntensity: 0.42,
    roughness: 0.5,
    opacity: 0.8,
    sheen: 0.4,
    sheenColor: REF.sheen,
  });
  const chromatinNet = (() => {
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    for (let i = 0; i < (perf ? 8 : 14); i++) {
      const pts: THREE.Vector3[] = [];
      const baseLat = (hash01(`cl${i}`) - 0.5) * 2.0;
      const baseLon = hash01(`cl${i}`, 3) * Math.PI * 2;
      for (let k = 0; k <= 5; k++) {
        const tt = k / 5;
        const lat = baseLat + Math.sin(tt * 4.2 + i * 1.7) * 0.55;
        const lon = baseLon + tt * 1.6 + Math.sin(tt * 3.1 + i) * 0.5;
        const rr = NUC_R * (0.4 + hash01(`clr${i}${k}`) * 0.5);
        pts.push(new THREE.Vector3(
          Math.cos(lat) * Math.cos(lon) * rr,
          Math.sin(lat) * rr,
          Math.cos(lat) * Math.sin(lon) * rr,
        ));
      }
      parts.push({ geo: track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.075, 6)) });
    }
    return new THREE.Mesh(track(mergeGeoms(parts)), chromatinMat);
  })();
  chromatinNet.renderOrder = 44;
  group.add(chromatinNet);
  // 核仁（rRNA 转录中心; 前期解体淡出）
  const nucleolus = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.95, 20, 16)),
    mat({ color: REF.nucleolus, emissive: REF.nucleolusHi, emissiveIntensity: 0.5, roughness: 0.55, opacity: 0.92, sheen: 0.5, sheenColor: REF.sheen }),
  );
  nucleolus.position.set(0.6, 0.7, -0.5);
  nucleolus.renderOrder = 45;
  group.add(nucleolus);
  const nucleolusMatRef = nucleolus.material as THREE.MeshPhysicalMaterial;

  /* ---------- 染色体（10 对 × 双姐妹染色单体 X 形） ---------- */
  const CHR_N = perf ? 8 : 10;
  const chromatidGeo = (seed: string) => {
    // 短臂 p + 长臂 q + 着丝粒（随染色体变异: 臂长比/粗细 —— 染色体核型多样性）
    const pLen = 0.3 + hash01(`p${seed}`) * 0.22;
    const qLen = 0.6 + hash01(`q${seed}`) * 0.5;
    const rr = 0.125 + hash01(`r${seed}`) * 0.035;
    return track(mergeGeoms([
      { geo: track(new THREE.CapsuleGeometry(rr, pLen, 3, 8)), matrix: new THREE.Matrix4().makeTranslation(0, pLen / 2 + 0.14, 0) },
      { geo: track(new THREE.CapsuleGeometry(rr + 0.008, qLen, 3, 8)), matrix: new THREE.Matrix4().makeTranslation(0, -(qLen / 2 + 0.14), 0) },
      { geo: track(new THREE.SphereGeometry(0.14, 10, 8)) },
    ]));
  };
  const chrMat = mat({
    // v14b 演示主角亮度: 分裂期的染色体是视觉主角（教科书亮紫 X 形）—— 比间期染色质亮一档
    color: '#8a76a2',
    emissive: '#6a5a84',
    emissiveIntensity: 1.3,
    roughness: 0.38,
    opacity: 0,
    clearcoat: 0.45,
    sheen: 0.55,
    sheenColor: REF.sheen,
    normalMap: orgNormal,
    normalScale: 0.35,
  });
  const centroMat = mat({ color: REF.npc, emissive: '#7a8294', emissiveIntensity: 0.6, roughness: 0.4, opacity: 0 });
  const kinMat = mat({ color: REF.mitoAtp, emissive: '#c9a227', emissiveIntensity: 1.1, roughness: 0.35, opacity: 0 });

  const chromosomes: ChromosomeObj[] = [];
  for (let ci = 0; ci < CHR_N; ci++) {
    const g = new THREE.Group();
    const chrGeoShared = chromatidGeo(`chr${ci}`); // 姐妹单体共享同一（含臂比变异的）几何
    const makeChromatid = () => {
      const cg = new THREE.Group();
      const body = new THREE.Mesh(chrGeoShared, chrMat);
      body.renderOrder = 46;
      cg.add(body);
      return cg;
    };
    const cA = makeChromatid();
    const cB = makeChromatid();
    cA.position.x = -0.105;
    cB.position.x = 0.105;
    cA.rotation.z = 0.14;
    cB.rotation.z = -0.14;
    // 着丝粒（连接姐妹染色单体）
    const centro = new THREE.Mesh(track(new THREE.SphereGeometry(0.15, 10, 8)), centroMat);
    centro.renderOrder = 47;
    // 动粒（每单体着丝粒两侧、朝向两极的金盘 —— 微管锚定点）
    const kinGeo = track(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10));
    const kinA = new THREE.Mesh(kinGeo, kinMat);
    kinA.position.set(-0.06, 0, 0.16);
    kinA.rotation.x = Math.PI / 2;
    const kinB = new THREE.Mesh(kinGeo, kinMat);
    kinB.position.set(0.06, 0, -0.16);
    kinB.rotation.x = Math.PI / 2;
    g.add(cA, cB, centro, kinA, kinB);
    // 尺寸: 染色体整体 ~1.6-2.2 单位（醒目可读）
    const scl = 1.62 + hash01(`cs${ci}`) * 0.42;
    g.scale.setScalar(0.001);
    group.add(g);
    // 赤道板位（XY 平面环带分布, 避免重叠）
    const ang = (ci / CHR_N) * Math.PI * 2 + hash01(`ca${ci}`) * 0.5;
    const rad = 1.3 + hash01(`cr${ci}`) * 1.9;
    const plate = new THREE.Vector3(Math.cos(ang) * rad, (hash01(`cy${ci}`) - 0.5) * 3.4, (hash01(`cz${ci}`) - 0.5) * 0.4);
    // 前期散布位（间期核内随机）
    const hl = (hash01(`hl${ci}`) - 0.5) * 1.7;
    const hn = hash01(`hn${ci}`) * Math.PI * 2;
    const hr = NUC_R * (0.35 + hash01(`hr${ci}`) * 0.45);
    const home = new THREE.Vector3(
      Math.cos(hl) * Math.cos(hn) * hr,
      Math.sin(hl) * hr,
      Math.cos(hl) * Math.sin(hn) * hr,
    );
    chromosomes.push({ group: g, cA, cB, plate, home, spin: hash01(`sp${ci}`) * Math.PI * 2, delay: hash01(`dl${ci}`) * 0.18, kinA, kinB });
  }

  /* ---------- 中心体（两对中心粒; 间期贴核 → 分离至两极） ---------- */
  const centGeo = (() => {
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    for (let b = 0; b < 9; b++) {
      const base = (b / 9) * Math.PI * 2;
      for (let tt = 0; tt < 3; tt++) {
        const rr2 = 0.09 + tt * 0.028;
        const aa = base + tt * 0.17;
        const blade = track(new THREE.CylinderGeometry(0.019, 0.019, 0.4, 6));
        blade.translate(rr2, 0, 0);
        parts.push({ geo: blade, matrix: new THREE.Matrix4().makeRotationY(aa) });
      }
    }
    parts.push({ geo: track(new THREE.CylinderGeometry(0.038, 0.038, 0.4, 8)) });
    return track(mergeGeoms(parts));
  })();
  const centMat = mat({ color: '#8494a8', emissive: '#4a5a6e', emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.2 });
  const centA = new THREE.Mesh(centGeo, centMat);
  const centB = new THREE.Mesh(centGeo, centMat);
  centB.rotation.z = Math.PI / 2;
  centA.renderOrder = 44;
  centB.renderOrder = 44;
  const pcmMat = mat({ color: '#6a7a8e', emissive: '#4a5a6e', emissiveIntensity: 0.35, roughness: 0.5, opacity: 0.5 });
  const pcmA = new THREE.Mesh(track(new THREE.SphereGeometry(0.55, 16, 12)), pcmMat);
  const pcmB = new THREE.Mesh(track(new THREE.SphereGeometry(0.55, 16, 12)), pcmMat);
  // 极组 A/B 直接挂根组（位置 = 世界坐标 ±PZ）; 静态微管族单独成组 —— 组 z 缩放 = 纺锤体拉长
  group.add(centA, centB, pcmA, pcmB);
  const spindle = new THREE.Group();
  group.add(spindle);

  /* ---------- 纺锤体微管 ---------- */
  const mtMat = mat({
    color: REF.microtubule,
    emissive: '#5a6c84',
    emissiveIntensity: 0.6,
    roughness: 0.4,
    normalMap: mtStripe,
    normalScale: 0.6,
    opacity: 0,
    sheen: 0.4,
    sheenColor: REF.sheen,
  });
  // 星体微管（每极放射状, 静态几何 + 组 z 缩放跟随极位）
  {
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    const astralN = perf ? 9 : 14;
    for (const side of [-1, 1]) {
      for (let i = 0; i < astralN; i++) {
        const lat = (hash01(`as${side}${i}`, 3) - 0.5) * 1.9;
        const lon = hash01(`as${side}${i}`, 5) * Math.PI * 2;
        const dir = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).normalize();
        const end = dir.clone().multiplyScalar(6.9).setZ(side * POLE_Z0 + dir.z * 6.9 * 0.4);
        const start = new THREE.Vector3(0, 0, side * POLE_Z0);
        const ctrl = start.clone().lerp(end, 0.55);
        ctrl.y += (hash01(`asc${side}${i}`) - 0.5) * 0.9;
        parts.push({ geo: track(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(start, ctrl, end), 18, 0.026, 5)) });
      }
    }
    const astral = new THREE.Mesh(track(mergeGeoms(parts)), mtMat);
    astral.renderOrder = 43;
    spindle.add(astral);
  }
  // 极微管（两极反向伸向中央重叠区; antiparallel 交叉语义）
  {
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    const polarN = perf ? 10 : 16;
    for (const side of [-1, 1]) {
      for (let i = 0; i < polarN; i++) {
        const lat = (hash01(`po${side}${i}`, 3) - 0.5) * 0.75;
        const lon = hash01(`po${side}${i}`, 5) * Math.PI * 2;
        const dir = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon) * 0.35).normalize();
        const start = new THREE.Vector3(dir.x * 0.5, dir.y * 0.5, side * POLE_Z0);
        const end = new THREE.Vector3(-dir.x * 0.9, -dir.y * 0.9, -side * 1.6); // 越过赤道 → 重叠区
        const ctrl = start.clone().lerp(end, 0.5).multiplyScalar(0.92);
        parts.push({ geo: track(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(start, ctrl, end), 16, 0.03, 5)) });
      }
    }
    const polar = new THREE.Mesh(track(mergeGeoms(parts)), mtMat);
    polar.renderOrder = 43;
    spindle.add(polar);
  }
  // 动粒微管（逐染色体双极连接 —— InstancedMesh 逐帧重排: 极 → 着丝粒动粒）
  const kfiberGeo = track(new THREE.CylinderGeometry(0.055, 0.055, 1, 7, 1));
  const kfiberMat = mat({
    color: '#a8b8cc',
    emissive: '#7a8aa4',
    emissiveIntensity: 0.85,
    roughness: 0.35,
    normalMap: mtStripe,
    normalScale: 0.7,
    opacity: 0,
    sheen: 0.5,
    sheenColor: REF.sheen,
  });
  const kfibers = new THREE.InstancedMesh(kfiberGeo, kfiberMat, CHR_N * 2);
  kfibers.renderOrder = 43;
  group.add(kfibers);
  const kUp = new THREE.Vector3(0, 1, 0);
  const kDir = new THREE.Vector3();
  const kMid = new THREE.Vector3();
  const kQuat = new THREE.Quaternion();
  const kM = new THREE.Matrix4();
  const kScale = new THREE.Vector3();

  /* ---------- 核被膜（崩解碎片 + 双子核重组） ---------- */
  const neMat = mat({
    color: REF.nucEnv,
    emissive: '#4a4456',
    emissiveIntensity: 0.32,
    roughness: 0.3,
    opacity: 1,
    clearcoat: 0.5,
    transmission: perf ? 0 : 0.35,
    thickness: 0.4,
    sheen: 0.45,
    sheenColor: REF.sheen,
    normalMap: orgNormal,
    normalScale: 0.4,
    flow: { color: '#6a6478', strength: 0.14, scale: 0.9, speed: 0.05, rim: 0.2 },
  });
  const ne = new THREE.Mesh(track(new THREE.SphereGeometry(NUC_R, 32, 24)), neMat);
  ne.renderOrder = 45;
  group.add(ne);
  // 核孔（间期可见的 NPC 点缀）
  const npcGeo = track(new THREE.TorusGeometry(0.14, 0.05, 6, 10));
  const npcMat = mat({ color: REF.npc, emissive: '#7a8294', emissiveIntensity: 0.45, roughness: 0.45, opacity: 0.85 });
  const npcN = perf ? 18 : 30;
  const npcs = new THREE.InstancedMesh(npcGeo, npcMat, npcN);
  {
    const mm = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < npcN; i++) {
      const lat = Math.asin((hash01(`nl${i}`) - 0.5) * 1.9);
      const lon = hash01(`no${i}`) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      qq.setFromUnitVectors(up, dir);
      mm.compose(dir.clone().multiplyScalar(NUC_R), qq, new THREE.Vector3(1, 1, 1));
      npcs.setMatrixAt(i, mm);
    }
    npcs.instanceMatrix.needsUpdate = true;
    npcs.renderOrder = 46;
  }
  group.add(npcs);
  // 崩解碎片（NEBD: 膜泡化飞散）
  const fragGeo = track(new THREE.SphereGeometry(1, 8, 6));
  const fragMat = mat({ color: REF.nucEnv, emissive: '#4a4456', emissiveIntensity: 0.4, roughness: 0.4, opacity: 0 });
  const fragN = perf ? 14 : 22;
  const frags = new THREE.InstancedMesh(fragGeo, fragMat, fragN);
  const fragSeeds = Array.from({ length: fragN }, (_, i) => ({
    dir: new THREE.Vector3(
      Math.cos((hash01(`fl${i}`, 3) - 0.5) * 2.4) * Math.cos(hash01(`fl${i}`, 5) * Math.PI * 2),
      Math.sin((hash01(`fl${i}`, 3) - 0.5) * 2.4),
      Math.cos((hash01(`fl${i}`, 3) - 0.5) * 2.4) * Math.sin(hash01(`fl${i}`, 5) * Math.PI * 2),
    ).normalize(),
    r: 0.16 + hash01(`fr${i}`) * 0.13,
    spin: hash01(`fs${i}`) * Math.PI * 2,
  }));
  group.add(frags);
  // 双子核（末期重组）
  const dauNeMat = mat({
    color: REF.nucEnv,
    emissive: '#4a4456',
    emissiveIntensity: 0.3,
    roughness: 0.3,
    opacity: 0,
    clearcoat: 0.5,
    sheen: 0.45,
    sheenColor: REF.sheen,
    normalMap: orgNormal,
    normalScale: 0.4,
    flow: { color: '#6a6478', strength: 0.12, scale: 0.9, speed: 0.05, rim: 0.18 },
  });
  const dauNeA = new THREE.Mesh(track(new THREE.SphereGeometry(2.25, 28, 20)), dauNeMat);
  const dauNeB = new THREE.Mesh(track(new THREE.SphereGeometry(2.25, 28, 20)), dauNeMat);
  dauNeA.scale.setScalar(0.001);
  dauNeB.scale.setScalar(0.001);
  dauNeA.renderOrder = 45;
  dauNeB.renderOrder = 45;
  group.add(dauNeA, dauNeB);

  /* ---------- 细胞器（分配到双子细胞） ---------- */
  // 线粒体（豆状 + 嵴纹理）
  const mitoGeo = track(new THREE.CapsuleGeometry(0.4, 0.8, 4, 10));
  const mitoMat = mat({
    color: REF.mitoOuter,
    emissive: '#3e2c26',
    emissiveIntensity: 0.34,
    roughness: 0.28,
    transmission: perf ? 0 : 0.3,
    thickness: 0.4,
    opacity: 1,
    clearcoat: 0.5,
    normalMap: mtStripe,
    normalScale: 0.7,
    sheen: 0.4,
    sheenColor: REF.sheen,
  });
  const MITO_N = perf ? 5 : 8;
  const mitos = new THREE.InstancedMesh(mitoGeo, mitoMat, MITO_N);
  const mitoSeeds = Array.from({ length: MITO_N }, (_, i) => ({
    ang: hash01(`ma${i}`) * Math.PI * 2,
    rad: 4.6 + hash01(`mr${i}`) * 1.8,
    y: (hash01(`my${i}`) - 0.5) * 4.2,
    side: i % 2 === 0 ? -1 : 1,
    rot: new THREE.Euler(hash01(`me${i}`) * Math.PI, hash01(`me${i}`, 3) * Math.PI * 2, (hash01(`me${i}`, 5) - 0.5) * 0.9),
    phase: hash01(`mp${i}`) * Math.PI * 2,
  }));
  group.add(mitos);
  // 运输囊泡
  const vesGeo = track(new THREE.SphereGeometry(1, 10, 8));
  const vesMat = mat({ color: REF.vesicle, emissive: '#3e4a58', emissiveIntensity: 0.3, roughness: 0.35, clearcoat: 0.3, opacity: 0.9 });
  const VES_N = perf ? 8 : 14;
  const vesicles = new THREE.InstancedMesh(vesGeo, vesMat, VES_N);
  const vesSeeds = Array.from({ length: VES_N }, (_, i) => ({
    ang: hash01(`va${i}`) * Math.PI * 2,
    rad: 3.4 + hash01(`vr${i}`) * 3.1,
    y: (hash01(`vy${i}`) - 0.5) * 6.0,
    side: i % 2 === 0 ? 1 : -1,
    r: 0.14 + hash01(`vs${i}`) * 0.12,
  }));
  group.add(vesicles);
  // 高尔基碎片（每子细胞一个 mini 囊堆; 前中期碎片化消失 → 末期重现）
  const golgiMat = mat({
    color: REF.golgiCis,
    emissive: '#4a3f30',
    emissiveIntensity: 0.3,
    roughness: 0.35,
    opacity: 0,
    clearcoat: 0.4,
    sheen: 0.5,
    sheenColor: '#a8906a',
  });
  const golgiMini = (() => {
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    for (let i = 0; i < 4; i++) {
      const torus = track(new THREE.TorusGeometry(0.72 + i * 0.05, 0.1, 8, 30, Math.PI * 1.3));
      const m = new THREE.Matrix4()
        .makeScale(1, 0.22, 1)
        .multiply(new THREE.Matrix4().makeRotationZ(i * 0.24))
        .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
        .setPosition(0, i * 0.17, 0);
      parts.push({ geo: torus, matrix: m });
    }
    return new THREE.Mesh(track(mergeGeoms(parts)), golgiMat);
  })();
  const golgiMini2 = golgiMini.clone();
  golgiMini2.rotation.y = Math.PI / 2;
  golgiMini.renderOrder = 45;
  golgiMini2.renderOrder = 45;
  group.add(golgiMini, golgiMini2);
  // 外周 ER 管网（前期回缩 → 末期重建）
  const erMat = mat({
    color: REF.erSheet,
    emissive: '#3a4a5c',
    emissiveIntensity: 0.22,
    roughness: 0.38,
    opacity: 0,
    clearcoat: 0.3,
    flow: { color: '#74869c', strength: 0.12, scale: 0.9, speed: 0.06, rim: 0.16 },
  });
  const erNet = (() => {
    const parts: { geo: THREE.BufferGeometry }[] = [];
    for (let i = 0; i < (perf ? 4 : 8); i++) {
      const pts: THREE.Vector3[] = [];
      const baseLat = (hash01(`el${i}`) - 0.5) * 1.8;
      const baseLon = hash01(`eo${i}`) * Math.PI * 2;
      for (let k = 0; k <= 5; k++) {
        const tt = k / 5;
        const lat = baseLat + Math.sin(tt * 3.9 + i * 1.3) * 0.3;
        const lon = baseLon + tt * 1.2;
        const rr = 6.2 + Math.sin(tt * 2.8 + i) * 0.7;
        pts.push(new THREE.Vector3(Math.cos(lat) * Math.cos(lon) * rr, Math.sin(lat) * rr * 0.82, Math.cos(lat) * Math.sin(lon) * rr));
      }
      parts.push({ geo: track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.085, 6)) });
    }
    return new THREE.Mesh(track(mergeGeoms(parts)), erMat);
  })();
  erNet.renderOrder = 44;
  group.add(erNet);
  // 游离核糖体微粒（翻译车间持续运转）
  const riboGeo = track(new THREE.SphereGeometry(0.052, 5, 4));
  const riboMat = track(new THREE.MeshStandardMaterial({ color: '#a07a54', emissive: '#8a6240', emissiveIntensity: 0.85, roughness: 0.5 }));
  const RIB_N = perf ? 60 : 120;
  const ribos = new THREE.InstancedMesh(riboGeo, riboMat, RIB_N);
  const ribSeeds = Array.from({ length: RIB_N }, (_, i) => ({
    ang: hash01(`rl${i}`) * Math.PI * 2,
    rad: 1.6 + hash01(`rr${i}`) * 5.6,
    y: (hash01(`ry${i}`) - 0.5) * 6.6,
    side: hash01(`rs${i}`) > 0.5 ? 1 : -1,
  }));
  group.add(ribos);

  /* ---------- 收缩环 + 中间体 ---------- */
  const ringMat = mat({
    color: REF.actin,
    emissive: '#7a8a9c',
    emissiveIntensity: 0.7,
    roughness: 0.4,
    opacity: 0,
    sheen: 0.6,
    sheenColor: REF.sheen,
    normalMap: mtStripe,
    normalScale: 0.8,
  });
  const furrowRing = new THREE.Mesh(track(new THREE.TorusGeometry(1, 0.14, 10, 40)), ringMat);
  furrowRing.renderOrder = 48;
  group.add(furrowRing);
  const midbodyMat = mat({ color: '#9aa4b4', emissive: '#6a748a', emissiveIntensity: 0.8, roughness: 0.4, opacity: 0 });
  const midbody = new THREE.Mesh(track(new THREE.CylinderGeometry(0.3, 0.3, 1.1, 12)), midbodyMat);
  midbody.rotation.x = Math.PI / 2;
  midbody.renderOrder = 48;
  group.add(midbody);

  /* ---------- 逐帧更新（t: 0-6 连续相位时钟） ---------- */
  const chrMatRef = chrMat as THREE.MeshPhysicalMaterial;
  const centroMatRef = centroMat as THREE.MeshPhysicalMaterial;
  const kinMatRef = kinMat as THREE.MeshPhysicalMaterial;
  const mtMatRef = mtMat as THREE.MeshPhysicalMaterial;
  const kfiberMatRef = kfiberMat as THREE.MeshPhysicalMaterial;
  const neMatRef = neMat as THREE.MeshPhysicalMaterial;
  const npcMatRef = npcMat as THREE.MeshPhysicalMaterial;
  const chromatinMatRef = chromatinMat as THREE.MeshPhysicalMaterial;
  const fragMatRef = fragMat as THREE.MeshPhysicalMaterial;
  const dauNeMatRef = dauNeMat as THREE.MeshPhysicalMaterial;
  const golgiMatRef = golgiMat as THREE.MeshPhysicalMaterial;
  const erMatRef = erMat as THREE.MeshPhysicalMaterial;
  const ringMatRef = ringMat as THREE.MeshPhysicalMaterial;
  const midbodyMatRef = midbodyMat as THREE.MeshPhysicalMaterial;

  const poleZ = (t: number) => POLE_Z0 * (1 + ramp(t, 3, 4.6) * 0.1 + ramp(t, 4.6, 6) * 0.16);
  const mm = new THREE.Matrix4();
  const qq = new THREE.Quaternion();
  const eu = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const sc = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();

  const update = (t: number, dt: number) => {
    uTime.value += dt;
    const PZ = poleZ(t);

    /* 质膜形态学 */
    const { r: rProfile } = updateMembrane(t);

    /* 凝聚/去凝聚与不透明度 */
    const condense = ramp(t, 0.15, 1.25); // 前期凝聚
    const decondense = ramp(t, 4.3, 5.5); // 末期去凝聚
    const chrOpacity = clamp01(ramp(t, 0.1, 0.8) * (1 - ramp(t, 4.4, 5.6) * 0.55)); // 染色体凝聚可见 → 末期半淡出（去凝聚染色质团）
    chrMatRef.opacity = chrOpacity;
    centroMatRef.opacity = chrOpacity;
    kinMatRef.opacity = clamp01(ramp(t, 1.2, 1.7) * (1 - ramp(t, 3.05, 3.6)));
    // 染色质网/核仁: 仅间期-前期存在（末期由去凝聚的染色单体团 + 双子核被膜承载读感）
    chromatinMatRef.opacity = 0.8 * (1 - condense);
    nucleolusMatRef.opacity = 0.92 * (1 - ramp(t, 0.5, 1.1));
    chromatinNet.visible = chromatinMatRef.opacity > 0.02;
    nucleolus.visible = nucleolusMatRef.opacity > 0.02;

    /* 染色体运动学 */
    const congress = ramp(t, 1.4, 2.75); // 前中期汇集到赤道板
    const segregate = ramp(t, 3.05, 3.85); // 后期分离
    const clusterTight = ramp(t, 4.0, 4.6); // 后期末聚拢于两极
    chromosomes.forEach((chr, ci) => {
      const g = chr.group;
      // 位置: home（间期核内散布）→ plate（赤道板）; 个体微延迟 → 汇集不同步的自然读感
      const k = clamp01(congress + chr.delay * 0.12);
      vA.copy(chr.home).lerp(chr.plate, k);
      // 接近两极时 xy 向染色体团收拢（去凝聚前的极区聚集）
      const tightXY = 1 - clusterTight * 0.42;
      // z: home.z → 0（板上; ramp 1.4-2.6 与汇集同步）
      const flatZ = 1 - ramp(t, 1.4, 2.6) * 0.92;
      g.position.set(vA.x * tightXY, vA.y * (1 - clusterTight * 0.3), vA.z * flatZ);
      // 后期: 姐妹染色单体反向拉向两极（cA → −Z, cB → +Z; 群组 z 不动 —— 单体偏移承载极向运动）
      const sepA = clamp01(segregate - chr.delay * 0.3);
      const reach = PZ * 0.92;
      const cZ = (0.08 + sepA * reach) * (1 - decondense * 0.85); // 末期单体回拢聚团
      chr.cA.position.z = -cZ;
      chr.cB.position.z = cZ;
      chr.cA.position.x = -0.105 - sepA * 0.1;
      chr.cB.position.x = 0.105 + sepA * 0.1;
      // 旋转: 前期翻滚 → 中期定向（X 面正对相机, 着丝粒朝极）+ 中期振荡微动
      const orient = ramp(t, 1.4, 2.4);
      const wobble = Math.sin(uTime.value * 2.4 + chr.spin * 5) * (1 - orient) * 0.9;
      const osc = Math.sin(uTime.value * 1.7 + chr.spin * 7) * 0.1 * orient * (1 - ramp(t, 3, 3.3));
      g.rotation.set(
        wobble * 0.6 + (1 - orient) * Math.sin(chr.spin * 3) * 2.2,
        (1 - orient) * chr.spin * 4 + orient * chr.spin,
        osc + wobble * 0.4,
      );
      // 尺寸: 凝聚收缩变粗 → 末期去凝聚舒展
      const scl = (1.62 + hash01(`cs${ci}`) * 0.42) * (0.55 + condense * 0.45) * (1 + decondense * 0.35);
      g.scale.setScalar(Math.max(0.001, scl * clamp01(ramp(t, 0.05, 0.6))));
    });

    /* 动粒微管（逐帧: 极 → 染色体着丝粒） */
    const kfiberOpacity = clamp01(ramp(t, 1.15, 1.8) * (1 - ramp(t, 4.1, 4.9)));
    kfiberMatRef.opacity = kfiberOpacity;
    mtMatRef.opacity = clamp01(ramp(t, 0.7, 1.6) * (1 - ramp(t, 4.3, 5.3)));
    if (kfiberOpacity > 0.01) {
      let ki = 0;
      for (const chr of chromosomes) {
        const gz = chr.group.position.z;
        for (const side of [-1, 1]) {
          const pole = vA.set(chr.group.position.x * 0.12, chr.group.position.y * 0.12, side * PZ);
          const centromere = vB.copy(chr.group.position);
          // side=−1 极连接 cA 单体（z 负向）; side=+1 极连接 cB —— 直接取单体动粒 z
          centromere.z = gz + (side < 0 ? chr.cA.position.z : chr.cB.position.z) + side * 0.12;
          kDir.subVectors(centromere, pole);
          const len = kDir.length();
          kMid.addVectors(pole, centromere).multiplyScalar(0.5);
          kQuat.setFromUnitVectors(kUp, kDir.normalize());
          kScale.set(1, Math.max(0.01, len), 1);
          kM.compose(kMid, kQuat, kScale);
          kfibers.setMatrixAt(ki++, kM);
        }
      }
      for (; ki < CHR_N * 2; ki++) {
        kM.makeScale(0, 0, 0);
        kfibers.setMatrixAt(ki, kM);
      }
      kfibers.instanceMatrix.needsUpdate = true;
    }

    /* 中心体: 间期贴核并排 → 分离至两极 */
    const sepT = ramp(t, 0.35, 1.9);
    const cAz = THREE.MathUtils.lerp(1.35, -PZ, sepT);
    const cBz = THREE.MathUtils.lerp(1.75, PZ, sepT);
    const cAy = THREE.MathUtils.lerp(1.1, 0, sepT);
    centA.position.set(0.5, cAy, cAz);
    centB.position.set(-0.5, cAy + 0.05, cBz);
    pcmA.position.copy(centA.position);
    pcmB.position.copy(centB.position);
    centA.rotation.y += dt * 0.8;
    centB.rotation.y -= dt * 0.8;
    // 静态微管族跟随极位（组 z 缩放 = 纺锤体拉长）
    spindle.scale.z = PZ / POLE_Z0;

    /* 核被膜: 完整 → 崩解碎片 → 双子核重组 */
    const nebd = ramp(t, 1.1, 1.85);
    const neFade = clamp01(1 - nebd);
    neMatRef.opacity = neFade;
    npcMatRef.opacity = 0.85 * neFade;
    ne.visible = neFade > 0.02;
    npcs.visible = ne.visible;
    const neScale = 1 + ramp(t, 0.2, 1.1) * 0.06; // 前期核被膜轻微膨胀（双膜解体前兆）
    ne.scale.setScalar(neScale);
    // 碎片: 崩解窗口飞散淡出
    const fragLife = ramp(t, 1.05, 2.6);
    fragMatRef.opacity = clamp01(Math.sin(clamp01((fragLife - 0.05) / 0.9) * Math.PI) * 1.2);
    if (fragMatRef.opacity > 0.01) {
      frags.visible = true;
      const fr = NUC_R + fragLife * 2.6;
      fragSeeds.forEach((fs2, i) => {
        const wob = Math.sin(uTime.value * 1.3 + fs2.spin) * 0.3;
        pv.set(fs2.dir.x * fr, fs2.dir.y * fr * 0.85, fs2.dir.z * fr * 0.7 + wob);
        sc.setScalar(fs2.r);
        mm.compose(pv, qq.setFromEuler(eu.set(fs2.spin + fragLife * 2, fs2.spin * 2, 0)), sc);
        frags.setMatrixAt(i, mm);
      });
      frags.instanceMatrix.needsUpdate = true;
    } else {
      frags.visible = false;
    }
    // 双子核: 末期在两极染色体团处重组
    const neReform = ramp(t, 4.15, 5.15);
    dauNeMatRef.opacity = neReform;
    const dauZ = THREE.MathUtils.lerp(3.1, 5.9, ramp(t, 5.0, 6));
    dauNeA.position.set(0, 0, -dauZ);
    dauNeB.position.set(0, 0, dauZ);
    const dauS = Math.max(0.001, 0.3 + neReform * 0.7) * (1 + ramp(t, 5, 6) * 0.06);
    dauNeA.scale.setScalar(dauS);
    dauNeB.scale.setScalar(dauS);
    dauNeA.visible = neReform > 0.02;
    dauNeB.visible = neReform > 0.02;

    /* 细胞器分配 */
    const part = ramp(t, 3.4, 5.6); // 后期-末期: 向双子室迁移
    {
      mitoSeeds.forEach((ms, i) => {
        const drift = Math.sin(uTime.value * 0.5 + ms.phase) * 0.35;
        const toZ = ms.side * THREE.MathUtils.lerp(2.2, 5.6, ramp(t, 4.8, 6));
        pv.set(
          Math.cos(ms.ang) * ms.rad * (1 - part * 0.32) + drift,
          ms.y * (1 - part * 0.4) + drift * 0.6,
          THREE.MathUtils.lerp(0, toZ, part),
        );
        mm.compose(pv, qq.setFromEuler(ms.rot), one);
        mitos.setMatrixAt(i, mm);
      });
      mitos.instanceMatrix.needsUpdate = true;
      vesSeeds.forEach((vs2, i) => {
        const toZ = vs2.side * THREE.MathUtils.lerp(2.0, 5.2, ramp(t, 4.8, 6));
        pv.set(Math.cos(vs2.ang) * vs2.rad * (1 - part * 0.35), vs2.y * (1 - part * 0.45), THREE.MathUtils.lerp(0, toZ, part));
        sc.setScalar(vs2.r);
        mm.compose(pv, qq.identity(), sc);
        vesicles.setMatrixAt(i, mm);
      });
      vesicles.instanceMatrix.needsUpdate = true;
      ribSeeds.forEach((rs2, i) => {
        const toZ = rs2.side * THREE.MathUtils.lerp(1.5, 5.4, ramp(t, 4.6, 6));
        pv.set(Math.cos(rs2.ang) * rs2.rad * (1 - part * 0.3), rs2.y * (1 - part * 0.5), THREE.MathUtils.lerp(0, toZ, part));
        sc.setScalar(0.8 + hash01(`rsz${i}`) * 0.5);
        mm.compose(pv, qq.identity(), sc);
        ribos.setMatrixAt(i, mm);
      });
      ribos.instanceMatrix.needsUpdate = true;
    }
    // 高尔基: 前中期碎片化消失 → 末期双子细胞重建
    golgiMatRef.opacity = clamp01((1 - ramp(t, 1.2, 2.2)) + ramp(t, 4.6, 5.6)) * 0.85;
    const golgiZ = THREE.MathUtils.lerp(3.4, 6.1, ramp(t, 5, 6));
    golgiMini.position.set(1.9, -1.2, -golgiZ);
    golgiMini2.position.set(-1.9, -1.2, golgiZ);
    golgiMini.visible = golgiMatRef.opacity > 0.02;
    golgiMini2.visible = golgiMini.visible;
    // 外周 ER: 前期回缩 → 末期重建
    erMatRef.opacity = clamp01((1 - ramp(t, 0.8, 1.8)) + ramp(t, 4.9, 5.9)) * 0.5;
    erNet.visible = erMatRef.opacity > 0.02;
    erNet.scale.z = 1 + ramp(t, 5, 6) * 0.55;

    /* 收缩环 + 中间体 */
    const furrowK = ramp(t, 4.55, 5.95);
    ringMatRef.opacity = clamp01(ramp(t, 4.35, 4.9) * (1 - ramp(t, 5.75, 6.05))) * 0.9;
    const eqR = Math.max(0.32, rProfile(0.5));
    furrowRing.scale.set(eqR, eqR, 0.75 + furrowK * 0.4);
    // 环的收缩脉动（actomyosin 拉动读感）
    const squeeze = 1 - Math.sin(uTime.value * 2.2) * 0.02 * (furrowK > 0 && furrowK < 1 ? 1 : 0);
    furrowRing.scale.x *= squeeze;
    furrowRing.scale.y *= squeeze;
    // 中间体（深缢裂后的致密胞质桥）
    midbodyMatRef.opacity = ramp(t, 5.5, 5.95) * 0.95;
    // 中间体: 仅深缢裂后可见; 半径跟随胞质桥, 长度（局部 Y → 世界 Z）恒定
    const mbR = Math.max(0.3, Math.min(1.1, eqR));
    midbody.scale.set(mbR / 0.3, 1, mbR / 0.3);
  };

  /* ---------- 相位感知悬停目标 ---------- */
  const targets = (phase: number): HoverTarget[] => {
    const T: HoverTarget[] = [];
    const cR = Math.cos(ROT_Y), sR = Math.sin(ROT_Y);
    // 世界坐标 = 舞台局部坐标绕 Y 旋转 ROT_Y（与 group.rotation.y 同步 —— Html 世界对齐）
    const push = (zh: string, latin: string, lx: number, ly: number, lz: number, r: number) =>
      T.push({ zh, latin, pos: { x: lx * cR + lz * sR, y: ly, z: -lx * sR + lz * cR }, r });
    const PZ = poleZ(Math.min(6, PHASE_BOUNDS[phase] + 0.4));
    // 常驻: 中心体 ×2（除间期贴核位）/ 线粒体
    if (phase >= 1) {
      push('中心体（中心粒对）', 'Centrosome', 0.5, 0, -PZ, 1.8);
      push('中心体（中心粒对）', 'Centrosome', -0.5, 0, PZ, 1.8);
    } else {
      push('中心体（已复制, 贴核）', 'Centrosome', 0.5, 1.1, 1.5, 1.8);
    }
    push('线粒体（暖古铜）', 'Mitochondrion', 4.8, 1.2, 0, 2.2);
    push('线粒体（暖古铜）', 'Mitochondrion', -4.2, -1.6, 2.4, 2.2);
    if (phase === 0) {
      push('细胞核（核被膜）', 'Nuclear envelope', 0, 0, 0, 3.6);
      push('染色质（松散纤维）', 'Chromatin', 1.2, 0.8, -0.6, 2.4);
      push('核仁', 'Nucleolus', 0.6, 0.7, -0.5, 1.6);
      push('游离核糖体', 'Polysomes', 2.6, -2.0, 1.5, 2.4);
    }
    if (phase === 1 || phase === 2) {
      push('凝聚中的染色体', 'Condensing chromosomes', -1.8, 1.4, 0.8, 2.6);
    }
    if (phase === 1) {
      push('分离中的中心体', 'Centrosome', 0.5, 1.1, 1.5, 1.6);
    }
    if (phase >= 2 && phase <= 3) {
      push('核被膜崩解碎片', 'NE fragments', 2.9, 1.8, 1.4, 2.6);
      push('纺锤体微管', 'Spindle microtubules', 0, 0, 0, 2.8);
      push('星体微管', 'Astral microtubules', 0, 0, -PZ * 1.05, 2.4);
      push('星体微管', 'Astral microtubules', 0, 0, PZ * 1.05, 2.4);
      push('极微管（中央重叠区）', 'Polar microtubules', 0, 0, 0, 1.8);
    }
    if (phase === 2 || phase === 3) {
      push('中期染色体（X 形）', 'Metaphase chromosome', 2.1, 1.2, 0, 2.2);
      push('中期染色体（X 形）', 'Metaphase chromosome', -2.4, -0.8, 0, 2.2);
    }
    if (phase === 3) {
      push('赤道板（中期板）', 'Metaphase plate', 0, 0, 0, 2.6);
      push('着丝粒 · 动粒', 'Kinetochore', 2.1, 1.2, 0.2, 1.4);
      push('动粒微管（张力）', 'Kinetochore fibers', 1.2, 0.7, -2.4, 2.2);
    }
    if (phase === 4) {
      push('姐妹染色单体分离', 'Sister chromatids', 0, 0, -PZ * 0.55, 2.6);
      push('姐妹染色单体分离', 'Sister chromatids', 0, 0, PZ * 0.55, 2.6);
      push('纺锤体拉长（极分离）', 'Spindle elongation', 0, 0, 0, 2.4);
    }
    if (phase >= 4) {
      push('子代核被膜（重组）', 'Daughter envelope', 0, 0, -4.4, 2.4);
      push('子代核被膜（重组）', 'Daughter envelope', 0, 0, 4.4, 2.4);
      push('游离核糖体', 'Polysomes', 2.6, -2.0, 3.0, 2.4);
    }
    if (phase === 5 || phase === 6) {
      push('收缩环（actomyosin）', 'Contractile ring', 3.6, 0, 0, 2.2);
    }
    if (phase === 6) {
      push('中间体（胞质桥）', 'Midbody', 0, 0, 0, 1.6);
      push('子细胞 ×2', 'Daughter cells', 0, 0, -6.4, 3.2);
      push('子细胞 ×2', 'Daughter cells', 0, 0, 6.4, 3.2);
      push('高尔基体（重建）', 'Golgi apparatus', 1.9, -1.2, -6.1, 1.8);
    }
    return T;
  };

  const dispose = () => {
    for (const d of disposables) d.dispose();
    group.clear();
  };

  return { group, update, targets, dispose };
}

/* ============ React 组件（时钟驱动 + 相位上报） ============ */

export const MitosisStage = ({ playing, speed, seek, onPhaseChange, onEnded, showAnatomy, perf, onProgress }: {
  playing: boolean;
  /** 播放速度倍率 */
  speed: number;
  /** 跳转请求（点击相位 chip） */
  seek: { phase: number; nonce: number } | null;
  onPhaseChange: (phase: number) => void;
  /** 完整播完一轮（t=6）时回调（自动暂停 + 提示重播） */
  onEnded: () => void;
  /** 悬停标记启用 */
  showAnatomy: boolean;
  perf: boolean;
  /** 分裂进度回调（逐帧; 宿主直写进度条 style.width —— 零 React 重渲染） */
  onProgress?: (frac: number) => void;
}) => {
  const clock = useRef(0);
  const lastPhase = useRef(-1);
  const lastSeek = useRef(0);
  const [phase, setPhase] = useState(0);
  const build = useMemo(() => buildMitosisScene(perf), [perf]);
  useEffect(() => () => build.dispose(), [build]);

  useFrame((_, dt) => {
    const d = Math.min(0.1, dt);
    if (seek && seek.nonce !== lastSeek.current) {
      lastSeek.current = seek.nonce;
      clock.current = PHASE_BOUNDS[seek.phase] + 0.03;
      lastPhase.current = seek.phase;
      setPhase(seek.phase);
      onPhaseChange(seek.phase);
    }
    if (playing) {
      clock.current = Math.min(6, clock.current + (d * speed) / MITOSIS_PHASE_SECONDS);
      if (clock.current >= 6) {
        onEnded();
      }
    }
    const p = phaseOf(clock.current);
    if (p !== lastPhase.current) {
      lastPhase.current = p;
      setPhase(p);
      onPhaseChange(p);
    }
    // 进度回调（宿主直写进度条 DOM —— 零 React 重渲染）
    onProgress?.(clock.current / 6);
    build.update(clock.current, d);
  });

  const hoverTargets = useMemo(() => build.targets(phase), [build, phase]);

  return (
    <>
      <primitive object={build.group} />
      <OrganelleHoverLayer targets={hoverTargets} enabled={showAnatomy} locate={null} />
    </>
  );
};
