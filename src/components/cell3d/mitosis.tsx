'use client';

/**
 * 细胞分裂（有丝分裂）3D 演示 v16 —— 「基于现有 3D 细胞标准, 不过度简化」
 * 相位（MBoC 6th Ch.17 时序）: 间期 → 前期 → 前中期 → 中期 → 后期 → 末期 → 胞质分裂
 *
 * 复用主细胞体标准:
 *   - REF 参照图配色系统（染色体熏衣草族/微管石板族/线粒体暖古铜/膜 tint 同源）
 *   - organelleMaterial 有机流光材质工厂 + 程序化法线贴图
 *   - 程序化几何工具（mergeGeoms/displaceGeometry/hash01）
 *   - v17: erLamellaGeometry/golgiCisternaGeometry 直接复用主细胞几何工厂 ——
 *     分裂细胞（「干细胞」）的 RER 千层饼核周冠 + 高尔基弓形叠杯堆与主细胞同一建模标准
 *
 * v16 用户反馈修复:
 *   - 质膜: 透射管线 → 普适 alpha 薄纱（0.42/0.5 恒透明 —— 任何 GPU 上内部主角直读）
 *   - 收纳: 星体微管逐帧钳回膜面内; 染色质末期向极区子核聚拢（不再悬垂缢裂中桥戳出膜外）
 *
 * 结构完整度（拒绝过度简化）:
 *   - 染色体: 10 对 × 双姐妹染色单体（短臂 p + 长臂 q + 着丝粒 + 极向动粒金盘）
 *   - 纺锤体: 动粒微管（逐染色体双极连接, 逐帧跟随）/ 极微管（中央重叠区）/ 星体微管（逐帧膜面钳制）
 *   - 核被膜: 间期完整 → 前中期崩解为膜泡碎片（lamins 磷酸化解体语义）→ 末期双子核重组
 *   - 质膜: 逐帧轮廓形态学（球 → 拉长 → 哑铃 → 中间体连接的两个子细胞）
 *   - 粗面内质网: 千层饼核周层叠囊冠 + 「黄沙」核糖体（间期 → 前期管网化回缩 → 末期双子核重建）
 *   - 高尔基体: 5 层弓形叠杯囊堆 + trans 出芽（间期核旁 → 前中期碎片化 → 末期双子细胞各一栈）
 *   - 细胞器分配: 线粒体/运输囊泡/外周 ER 管网/核糖体 —— 双子细胞不均等分配
 *   - 收缩环（actomyosin）→ 中间体（致密胞质桥）
 *   - 全程悬停标记（复用 OrganelleHoverLayer —— 相位感知动态目标）
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { organelleMaterial, REF, createTimeUniform, type TimeUniform } from './materials';
import { mergeGeoms, hash01 } from './procedural';
import { organicNormalMap, stripeNormalMap } from './textures';
import { erLamellaGeometry, erLamellaRibosomes, golgiCisternaGeometry, type ErLamellaOpts, type ErLamellaLayer } from './organelles';
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
    descZh: 'S 期 DNA 复制：复制叉沿染色质纤维推进，姐妹纤维成对加倍；中心体同步复制',
    descEn: 'S-phase DNA replication: forks travel along fibers, sister fibers pair up; centrosomes duplicate',
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
  {
    // v19 用户反馈「没有进行到完全分开成两个独立细胞的步骤」—— 补齐第 8 相位:
    // ESCRT-III 内切断离 → 单膜哑铃 crossfade 为两个独立子细胞膜 → 两细胞拉开各自进入 G1
    key: 'abscission', zh: '分离完成', en: 'Abscission', latin: 'Abscission',
    descZh: 'ESCRT-Ⅲ 螺旋在中间体中央内切 → 质膜融合密封 → 两个独立子细胞拉开距离, 各自进入 G1 期',
    descEn: 'ESCRT-III spirals cut and seal the midbody — two independent daughter cells part into G1',
  },
];

/** 每单位相位时钟时长（秒, × speed 播放; 总周期 = 8 相位 7 单位 × 7s = 49s） */
export const MITOSIS_PHASE_SECONDS = 7;

/** 相位边界（t ∈ [0,7] 不等分 —— 生物学时长: 间期展示较短, 中/后期事件紧凑; v19 增第 8 相位分离完成） */
const PHASE_BOUNDS = [0, 0.78, 1.62, 2.42, 3.32, 4.22, 5.0, 5.72, 7];
const phaseOf = (t: number): number => {
  for (let i = PHASE_BOUNDS.length - 1; i >= 1; i--) {
    if (t >= PHASE_BOUNDS[i]) return Math.min(MITOSIS_PHASES.length - 1, i);
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
  /** 世界空间单体分离量（组缩放补偿后; 动粒微管端点消费同一真源） */
  cZW: number;
  /** 臂展局部半径（p/q 臂最大值 + 着丝粒偏移 —— 世界臂展 = armLocal·scl） */
  armLocal: number;
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
    // v16 用户反馈「细胞不是透明的, 内部什么都看不到」: 透射管线（transmission render target）
    // 在部分 GPU/后处理链下呈近实心读感 —— 彻底改用普适 alpha 薄纱:
    //   HD 0.42 / 流畅 0.5 双档恒透明, 任何设备上染色体/纺锤体主角直读;
    //   roughness 0.07 + clearcoat 0.8 保留湿润膜高光, 流光注入保留轮廓呼吸感
    transmission: 0,
    thickness: 0.55,
    roughness: 0.07,
    normalMap: memNormal,
    normalScale: 0.3,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
    iridescence: 0.25,
    sheen: 0.4,
    sheenColor: REF.sheen,
    opacity: perf ? 0.5 : 0.42,
    emissive: '#2a3438',
    emissiveIntensity: 0.1,
    flow: { color: '#5a7a84', strength: 0.14, scale: 0.8, speed: 0.06, rim: 0.2 },
  });
  const membrane = new THREE.Mesh(memGeo, memMat);
  membrane.renderOrder = 50;
  group.add(membrane);
  /* ---------- v19 子细胞膜（分离完成相位: 单膜哑铃 crossfade → 两个独立子细胞拉开） ----------
   * 单球拓扑无法真正断开成两体 —— 用「双子球淡入 + 单膜淡出」交接: 初期双子球恰好覆叠哑铃两叶
   * （无缝交接）, 随后两球各自收圆并拉开距离 = 完全分开的两个独立细胞（体积守恒 r≈8.5/∛2≈6.5） */
  const memDauParams = {
    color: '#4e5a55',
    transmission: 0,
    thickness: 0.55,
    roughness: 0.07,
    normalMap: memNormal,
    normalScale: 0.3,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
    iridescence: 0.25,
    sheen: 0.4,
    sheenColor: REF.sheen,
    opacity: 0,
    emissive: '#2a3438',
    emissiveIntensity: 0.1,
    flow: { color: '#5a7a84', strength: 0.14, scale: 0.8, speed: 0.06, rim: 0.2 },
  } as const;
  const memDauGeo = track(new THREE.SphereGeometry(1, perf ? 36 : 56, perf ? 24 : 36));
  const memDauMatA = mat({ ...memDauParams });
  const memDauMatB = mat({ ...memDauParams });
  const memDauA = new THREE.Mesh(memDauGeo, memDauMatA);
  const memDauB = new THREE.Mesh(memDauGeo, memDauMatB);
  memDauA.renderOrder = 50;
  memDauB.renderOrder = 50;
  memDauA.visible = false;
  memDauB.visible = false;
  group.add(memDauA, memDauB);
  const memPos = memGeo.attributes.position as THREE.BufferAttribute;
  const memDir = new Float32Array(memPos.count * 3);
  for (let i = 0; i < memPos.count; i++) {
    const v = new THREE.Vector3(memPos.getX(i), memPos.getY(i), memPos.getZ(i)).normalize();
    memDir[i * 3] = v.x; memDir[i * 3 + 1] = v.y; memDir[i * 3 + 2] = v.z;
  }

  /** 形态学: 半长 L 与纬向轮廓 r(u)（u: 0=−Z 极, 1=+Z 极）
   *  v19 scission: ESCRT-Ⅲ 内切 —— 窄 σ 深度叠加, 中间体桥半径 → 0.02（针状缩窄）; elong 续增两叶拉开 */
  const membraneProfile = (t: number): { L: number; r: (u: number) => number } => {
    const elong = ramp(t, 2.9, 4.4) * 0.14 + ramp(t, 4.4, 6) * 0.18 + ramp(t, 5.9, 6.9) * 0.52;
    const L = R_CELL * (1 + elong);
    const furrowK = ramp(t, 4.55, 5.95);
    const scission = ramp(t, 5.85, 6.45);
    const shrink = 1 - 0.1 * furrowK; // 体积近似守恒
    const rFn = (u: number) => {
      const base = R_CELL * shrink * Math.pow(Math.max(1e-4, Math.sin(Math.PI * u)), 0.92);
      const dip = furrowK * R_CELL * 0.8 * Math.exp(-((u - 0.5) ** 2) / (2 * 0.13 ** 2))
        + scission * R_CELL * 1.1 * Math.exp(-((u - 0.5) ** 2) / (2 * 0.06 ** 2));
      const bridge = 0.3 * (1 - scission) + 0.02 * scission; // 中间体桥半径 → 针状
      return Math.max(bridge, base - dip);
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
  /* ---------- v18 S 期 DNA 复制可视化（用户反馈「染色质复制表现不清晰」） ----------
   * 教科书语义: 间期 S 期 DNA 半保留复制 —— 每条染色质纤维复制出配对的姐妹纤维（双网成对），
   * 复制叉（PCNA 滑动夹环）沿纤维双向推进 —— 金色光点行进 + 复制窗口发射脉冲 */
  const chromatinMat2 = mat({
    // 姐妹纤维（新生 DNA 链）: 更亮薰衣草 + 微暖发射 —— 与母本纤维同色系但明显可辨
    color: '#bca8d0',
    emissive: '#8a76a8',
    emissiveIntensity: 0.62,
    roughness: 0.5,
    opacity: 0,
    sheen: 0.4,
    sheenColor: REF.sheen,
  });
  // 共享 chromatinNet 几何 + 明显偏移/缩放 → 「每条纤维旁多出一条姐妹纤维」的成对读感
  // （QA 实测: 透过核被膜+质膜双层薄纱后姐妹网需更大偏移才可辨）
  const chromatinNet2 = new THREE.Mesh(chromatinNet.geometry, chromatinMat2);
  chromatinNet2.scale.setScalar(1.048);
  chromatinNet2.rotation.y = 0.22;
  chromatinNet2.renderOrder = 44;
  chromatinNet2.visible = false;
  group.add(chromatinNet2);
  // 复制叉：沿核内纤维路径行进的亮金光点（perf 减半; QA 实测透过双层薄纱后需更大更亮才清晰）
  const FORK_N = perf ? 6 : 12;
  const forkMat = track(new THREE.MeshStandardMaterial({
    color: '#ffd27a',
    emissive: '#ffb020',
    emissiveIntensity: 3.8,
    roughness: 0.3,
    transparent: true,
    opacity: 0,
  }));
  const forks = new THREE.InstancedMesh(track(new THREE.SphereGeometry(0.115, 10, 8)), forkMat, FORK_N);
  const forkCurves: THREE.CatmullRomCurve3[] = [];
  for (let i = 0; i < FORK_N; i++) {
    const pts: THREE.Vector3[] = [];
    const baseLat = (hash01(`fk${i}`) - 0.5) * 2.0;
    const baseLon = hash01(`fk${i}`, 3) * Math.PI * 2;
    for (let kk = 0; kk <= 4; kk++) {
      const tt = kk / 4;
      const lat = baseLat + Math.sin(tt * 3.6 + i * 1.3) * 0.5;
      const lon = baseLon + tt * 1.4 + Math.sin(tt * 2.8 + i) * 0.45;
      const rr = NUC_R * (0.45 + hash01(`fkr${i}${kk}`) * 0.4);
      pts.push(new THREE.Vector3(
        Math.cos(lat) * Math.cos(lon) * rr,
        Math.sin(lat) * rr,
        Math.cos(lat) * Math.sin(lon) * rr,
      ));
    }
    forkCurves.push(new THREE.CatmullRomCurve3(pts));
  }
  forks.visible = false;
  forks.renderOrder = 47;
  group.add(forks);
  // 核仁（rRNA 转录中心; 前期解体淡出）
  const nucleolus = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.95, 20, 16)),
    mat({ color: REF.nucleolus, emissive: REF.nucleolusHi, emissiveIntensity: 0.5, roughness: 0.55, opacity: 0.92, sheen: 0.5, sheenColor: REF.sheen }),
  );
  nucleolus.position.set(0.6, 0.7, -0.5);
  nucleolus.renderOrder = 45;
  group.add(nucleolus);
  const nucleolusMatRef = nucleolus.material as THREE.MeshPhysicalMaterial;
  const chromatinMat2Ref = chromatinMat2 as THREE.MeshPhysicalMaterial;

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
    // 臂展局部半径（收纳钳消费: 世界臂展 = armLocal·scl）
    const armLocal = Math.max(
      0.3 + hash01(`pchr${ci}`) * 0.22 + 0.14,
      0.6 + hash01(`qchr${ci}`) * 0.5 + 0.14,
    ) + 0.15;
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
    chromosomes.push({ group: g, cA, cB, cZW: 0.08, armLocal, plate, home, spin: hash01(`sp${ci}`) * Math.PI * 2, delay: hash01(`dl${ci}`) * 0.18, kinA, kinB });
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
  // 星体微管（每极放射状）—— v16: 静态合并网格 → 逐帧 InstancedMesh
  // v14 静态端点 dir×6.9 在中期即戳出 R=8.5 质膜（用户反馈「结构跑到细胞外」根因之一）;
  // v16 逐帧将端点钳回当前质膜回转面内（u=(z/L+1)/2 → r(u)×0.93）—— 恒「触皮质」而不穿膜
  const astralN = perf ? 9 : 14;
  const astralDirs: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < astralN; i++) {
      const lat = (hash01(`as${side}${i}`, 3) - 0.5) * 1.9;
      const lon = hash01(`as${side}${i}`, 5) * Math.PI * 2;
      astralDirs.push(new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).normalize());
    }
  }
  const astralGeo = track(new THREE.CylinderGeometry(0.026, 0.026, 1, 5));
  const astrals = new THREE.InstancedMesh(astralGeo, mtMat, astralDirs.length);
  astrals.renderOrder = 43;
  group.add(astrals);
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
    // v16: 流畅模式透射关闭时给 0.5 alpha —— 否则核被膜实心化, 间期染色质/核仁被完全遮蔽
    opacity: perf ? 0.5 : 1,
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
  /* ---------- 高尔基体（v17: 复用 golgiCisternaGeometry —— 5 层弓形叠杯堆, 主细胞同款形态标准） ----------
   * 旧 golgiMini = TorusGeometry 弧堆 —— 与 ER 管系视觉语言混同（用户反馈「更像内质网」）;
   *  v17: 5 层舒展弓形叠杯栈（cis 宽 → trans 窄弯 + 新月偏移, 顶点色淡藕荷紫梯度）+ trans 出芽囊泡;
   *  间期核旁一栈 → 前中期碎片化淡出 → 末期双子细胞各重建一栈（核旁位） */
  const golgiStackMat = mat({
    color: '#ffffff',
    vertexColors: true,
    transmission: perf ? 0 : 0.18,
    thickness: 0.35,
    roughness: 0.28,
    opacity: 0,
    clearcoat: 0.5,
    // v17 参照图淡藕荷紫 —— 透纱质膜下囊堆恒可辨
    emissive: '#7a7296',
    emissiveIntensity: 0.55,
    sheen: 0.55,
    sheenColor: '#c8c0dc',
  });
  const GOLGI_STACK_SEED = 31;
  const buildGolgiStack = (scale: number, seed: number): THREE.Group => {
    const g = new THREE.Group();
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4; color?: THREE.Color }[] = [];
    const cisCol = new THREE.Color(REF.golgiCis);
    const transCol = new THREE.Color(REF.golgiTrans);
    const CIST_N = 5;
    const step = 0.28 * scale;
    const diskR = 1.15 * scale;
    const stackH = CIST_N * step;
    const MIX = [0, 0.18, 0.42, 0.7, 1];
    const bow = 0.24 * scale; // v17 弓形新月偏移（主细胞同款语义）
    for (let i = 0; i < CIST_N; i++) {
      const t = i / (CIST_N - 1);
      const col = cisCol.clone().lerp(transCol, MIX[i]);
      const rad = diskR * (1 - i * 0.062);
      const cup = (0.1 + i * 0.055) * scale;
      const geo = track(golgiCisternaGeometry(rad, 0.082 * scale, cup, seed + i * 7, perf ? 6 : 8, perf ? 26 : 40));
      const m = new THREE.Matrix4().makeRotationY(i * 0.16).setPosition(bow * t * t, i * step - stackH * 0.5, 0);
      parts.push({ geo, matrix: m, color: col });
    }
    // trans 面出芽囊泡 ×5（顶点色并入同一网格 —— 单 draw call; 跟随弓形偏移）
    for (let v = 0; v < 5; v++) {
      const r = (0.1 + hash01(`gb${seed}${v}`) * 0.05) * scale;
      const ang = v * (Math.PI * 2 / 5) + hash01(`gba${seed}${v}`) * 0.6;
      const rr = diskR * (0.5 + hash01(`gbr${seed}${v}`) * 0.42);
      const sph = track(new THREE.SphereGeometry(r, 8, 6));
      sph.translate(Math.cos(ang) * rr + bow, stackH * 0.5 + 0.14 * scale, Math.sin(ang) * rr);
      parts.push({ geo: sph, color: new THREE.Color(REF.golgiTrans) });
    }
    const mesh = new THREE.Mesh(track(mergeGeoms(parts)), golgiStackMat);
    mesh.renderOrder = 45;
    g.add(mesh);
    return g;
  };
  // 间期核旁主栈（前右侧 —— 舞台旋转后朝相机可读; 距核心 4.15 = 核面 3.4 + 冠外余量）
  const golgiMain = buildGolgiStack(0.82, GOLGI_STACK_SEED);
  golgiMain.position.set(2.72, -0.83, 2.63);
  {
    const axis = new THREE.Vector3(0.7, 0.2, 0.69).normalize();
    const qAlign = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    const qSpin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.8);
    golgiMain.quaternion.copy(qAlign).multiply(qSpin);
  }
  group.add(golgiMain);
  // 末期双子细胞各一栈（核旁位, 逐帧跟随子核 z）
  const golgiDauA = buildGolgiStack(0.52, GOLGI_STACK_SEED + 57);
  const golgiDauB = buildGolgiStack(0.52, GOLGI_STACK_SEED + 113);
  {
    const axisA = new THREE.Vector3(0.82, 0.26, -0.51).normalize();
    const axisB = new THREE.Vector3(0.82, 0.26, 0.51).normalize();
    golgiDauA.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axisA));
    golgiDauB.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axisB));
  }
  group.add(golgiDauA, golgiDauB);

  /* ---------- 粗面内质网（v17: 复用 erLamellaGeometry —— 千层饼核周层叠囊冠 + 「黄沙」核糖体） ----------
   *  用户反馈「分裂演示的细胞（干细胞）没有粗面内质网」—— 间期细胞器全套补齐;
   *  间期核周冠 → 前期 ER 重构管网化回缩（NEBD 语义）→ 末期围绕双子核重建双冠
   *  v17: 与主细胞同一「千层饼」形态标准（连续大面积弧形膜层层包裹核, 非旧带状碎片） */
  const rerMat = mat({
    color: REF.erSheet,
    emissive: '#66608a',
    emissiveIntensity: 0.4,
    roughness: 0.24,
    normalMap: orgNormal,
    normalScale: 0.4,
    opacity: 0,
    clearcoat: 0.5,
    sheen: 0.55,
    sheenColor: '#cdc4e2',
    flow: { color: '#9c96b8', strength: 0.16, scale: 0.8, speed: 0.07, rim: 0.2 },
  });
  const rerRibMat = track(new THREE.MeshStandardMaterial({
    color: '#c9a54e',
    emissive: '#a8842e',
    emissiveIntensity: 1.0,
    roughness: 0.5,
    transparent: true,
  }));
  const rerRiboGeo = track(new THREE.SphereGeometry(0.058, 5, 4));
  const ORIGIN = new THREE.Vector3(0, 0, 0);
  const buildRerCrown = (scale: number, seedTag: string): { mesh: THREE.Mesh; ribos: THREE.InstancedMesh } => {
    const parts: { geo: THREE.BufferGeometry }[] = [];
    const riboPts: THREE.Vector3[] = [];
    const layers = perf ? 2 : 4;
    const nR = NUC_R * scale;
    // 冠轴朝后上偏左（开口朝前下右 —— 主细胞 v17 构图语义 + 高尔基主栈(前右侧)方向间隙 ~20°:
    // v17a 教训: 让位外跃层会挡在高尔基与相机之间（先写深度 → 高尔基后半被深度剔除「消失」）,
    // 方向性让位（轴倾斜）才是分裂舞台正确解 —— 冠层与囊堆零几何交集）
    const crownAxis = new THREE.Vector3(-0.2, 0.42, -0.88).normalize();
    // 子细胞迷你冠收窄覆盖（子核侧向的高尔基子栈 ~117° 处无冠覆盖）
    const coneCap = scale < 0.9 ? 1.72 : 2.3;
    const erOpts: ErLamellaOpts = {
      radiusAt: () => nR,
      center: ORIGIN,
    };
    for (let L = 0; L < layers; L++) {
      const axis = crownAxis.clone();
      axis.applyAxisAngle(new THREE.Vector3(0, 1, 0), (hash01(`${seedTag}ax${L}`) - 0.5) * 0.22);
      axis.applyAxisAngle(new THREE.Vector3(1, 0, 0), (hash01(`${seedTag}ay${L}`) - 0.5) * 0.14);
      const layer: ErLamellaLayer = {
        offset: (0.14 + L * 0.15) * scale,
        cone: Math.min(2.02 + L * 0.055, coneCap),
        axis: axis.normalize(),
        seed: 5 + L * 13,
      };
      parts.push({ geo: track(erLamellaGeometry({ ...erOpts, layer, thickness: 0.085 * scale, latSeg: perf ? 12 : 22, lonSeg: perf ? 26 : 48 })) });
      const riboN = perf ? 70 : 200;
      riboPts.push(...erLamellaRibosomes({ ...erOpts, layer }, Math.round(riboN * scale * 0.7 + riboN * 0.3), `${seedTag}L${L}`));
    }
    const mesh = new THREE.Mesh(track(mergeGeoms(parts)), rerMat);
    mesh.renderOrder = 44;
    const ribos = new THREE.InstancedMesh(rerRiboGeo, rerRibMat, Math.max(1, riboPts.length));
    {
      const mm = new THREE.Matrix4();
      const qq = new THREE.Quaternion();
      const eu = new THREE.Euler();
      riboPts.forEach((p, i) => {
        const sz = 0.9 + hash01(`${seedTag}rs${i}`) * 0.45;
        eu.set(hash01(`${seedTag}re${i}`) * Math.PI, hash01(`${seedTag}re${i}`, 3) * Math.PI * 2, 0);
        qq.setFromEuler(eu);
        mm.compose(p, qq, new THREE.Vector3(sz, sz, sz));
        ribos.setMatrixAt(i, mm);
      });
      ribos.instanceMatrix.needsUpdate = true;
      ribos.renderOrder = 45;
    }
    return { mesh, ribos };
  };
  const rerCrown = buildRerCrown(1, 'mito'); // 间期核周冠（核径同 NUC_R）
  group.add(rerCrown.mesh, rerCrown.ribos);
  const rerDauA = buildRerCrown(0.62, 'dauA'); // 末期双子核迷你冠
  const rerDauB = buildRerCrown(0.62, 'dauB');
  group.add(rerDauA.mesh, rerDauA.ribos, rerDauB.mesh, rerDauB.ribos);
  // 外周 ER 管网（SER 语义; 前期回缩 → 末期重建 —— RER 冠之外的持续 ER 网络）
  const erMat = mat({
    color: REF.erSheet,
    emissive: '#54507a',
    emissiveIntensity: 0.22,
    roughness: 0.38,
    opacity: 0,
    clearcoat: 0.3,
    flow: { color: '#9c96b8', strength: 0.12, scale: 0.9, speed: 0.06, rim: 0.16 },
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
  const riboMat = track(new THREE.MeshStandardMaterial({ color: '#c9a54e', emissive: '#a8842e', emissiveIntensity: 0.85, roughness: 0.5 }));
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

  /* ---------- 逐帧更新（t: 0-7 连续相位时钟） ---------- */
  const chrMatRef = chrMat as THREE.MeshPhysicalMaterial;
  const memMatRef = memMat as THREE.MeshPhysicalMaterial;
  const memDauMatARef = memDauMatA as THREE.MeshPhysicalMaterial;
  const memDauMatBRef = memDauMatB as THREE.MeshPhysicalMaterial;
  const centroMatRef = centroMat as THREE.MeshPhysicalMaterial;
  const kinMatRef = kinMat as THREE.MeshPhysicalMaterial;
  const mtMatRef = mtMat as THREE.MeshPhysicalMaterial;
  const kfiberMatRef = kfiberMat as THREE.MeshPhysicalMaterial;
  const neMatRef = neMat as THREE.MeshPhysicalMaterial;
  const npcMatRef = npcMat as THREE.MeshPhysicalMaterial;
  const chromatinMatRef = chromatinMat as THREE.MeshPhysicalMaterial;
  const fragMatRef = fragMat as THREE.MeshPhysicalMaterial;
  const dauNeMatRef = dauNeMat as THREE.MeshPhysicalMaterial;
  const golgiStackMatRef = golgiStackMat as THREE.MeshPhysicalMaterial;
  const rerMatRef = rerMat as THREE.MeshPhysicalMaterial;
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

    /* 质膜形态学（v16: 同时返回当前回转面参数 —— 星体微管逐帧钳制消费） */
    const { L: memL, r: rProfile } = updateMembrane(t);

    /* v19 分离完成（abscission）: 单膜哑铃淡出 + 双子细胞球膜淡入 → 两独立子细胞拉开
     * 交接窗口内双子球恰好覆叠哑铃两叶（无缝 crossfade）; 之后 zD 5.55→7.35 / rD 5.15→6.45（体积守恒收圆）
     * 内容物（子核/高尔基/RER 冠/细胞器）同步随 ramp 后移至各自子细胞中心 */
    const dauFade = ramp(t, 6.2, 6.65);
    const memFade = 1 - ramp(t, 6.3, 6.75);
    const zD = THREE.MathUtils.lerp(5.55, 7.35, ramp(t, 6.15, 7));
    const rD = THREE.MathUtils.lerp(5.15, 6.45, ramp(t, 6.15, 6.9));
    memMatRef.opacity = (perf ? 0.5 : 0.42) * memFade;
    membrane.visible = memFade > 0.02;
    memDauA.visible = dauFade > 0.02;
    memDauB.visible = dauFade > 0.02;
    memDauA.position.set(0, 0, -zD);
    memDauB.position.set(0, 0, zD);
    memDauA.scale.setScalar(Math.max(0.001, rD));
    memDauB.scale.setScalar(Math.max(0.001, rD));
    memDauMatARef.opacity = (perf ? 0.5 : 0.42) * dauFade;
    memDauMatBRef.opacity = (perf ? 0.5 : 0.42) * dauFade;

    /* 凝聚/去凝聚与不透明度 */
    // v18: 凝聚推迟到 0.42 起 —— 给 S 期复制可视化留出完整间期窗口（0-0.42 纤维态 + 复制叉行进）
    const condense = ramp(t, 0.42, 1.45); // 前期凝聚
    const decondense = ramp(t, 4.3, 5.5); // 末期去凝聚
    // 染色体凝聚可见（跟随凝聚时序）→ 末期大幅淡出（去凝聚染色质融入双子核读感; v16: 0.55→0.7）
    const chrOpacity = clamp01(ramp(t, 0.5, 1.25) * (1 - ramp(t, 4.4, 5.6) * 0.7));
    chrMatRef.opacity = chrOpacity;
    centroMatRef.opacity = chrOpacity;
    kinMatRef.opacity = clamp01(ramp(t, 1.2, 1.7) * (1 - ramp(t, 3.05, 3.6)));
    // 染色质网/核仁: 仅间期-前期存在（末期由去凝聚的染色单体团 + 双子核被膜承载读感）
    chromatinMatRef.opacity = 0.8 * (1 - condense);
    nucleolusMatRef.opacity = 0.92 * (1 - ramp(t, 0.5, 1.1));
    chromatinNet.visible = chromatinMatRef.opacity > 0.02;
    nucleolus.visible = nucleolusMatRef.opacity > 0.02;
    /* v18 S 期 DNA 复制：姐妹纤维成对淡入 + 复制叉行进 + 母本纤维发射脉冲 */
    const repl = ramp(t, 0.04, 0.42); // 复制进度（间期前段完成）
    const replWindow = repl * (1 - ramp(t, 0.42, 0.6)); // 复制活跃窗口（复制完成后脉冲退潮）
    chromatinMat2Ref.opacity = 0.72 * repl * (1 - condense);
    chromatinNet2.visible = chromatinMat2Ref.opacity > 0.02;
    chromatinMatRef.emissiveIntensity = 0.42 + replWindow * (0.35 + Math.sin(uTime.value * 5) * 0.18);
    forkMat.opacity = clamp01(replWindow * 1.6) * Math.min(1, (1 - condense) * 3);
    forks.visible = forkMat.opacity > 0.03;
    if (forks.visible) {
      for (let i = 0; i < FORK_N; i++) {
        // 复制叉沿纤维推进（相位错开 + 行进中脉冲缩放 —— PCNA 双向合成的动态读感）
        const fp = clamp01(repl * 1.3 + hash01(`fks${i}`) * 0.22);
        forkCurves[i].getPoint(fp, pv);
        const fs = 0.9 + Math.sin(uTime.value * 7 + i * 1.9) * 0.25;
        mm.compose(pv, qq.identity(), sc.setScalar(fs));
        forks.setMatrixAt(i, mm);
      }
      forks.instanceMatrix.needsUpdate = true;
    }

    /* 染色体运动学 */
    const congress = ramp(t, 1.4, 2.75); // 前中期汇集到赤道板
    const segregate = ramp(t, 3.05, 3.85); // 后期分离
    const clusterTight = ramp(t, 4.0, 4.6); // 后期末聚拢于两极
    chromosomes.forEach((chr, ci) => {
      const g = chr.group;
      // v18c 尺寸先解算: 组缩放会放大子节点局部偏移 —— 单体 z 偏移的世界量 = local·scl。
      //   旧版 cZ 直接作 local 偏移 → 世界分离被 ~1.85× 放大（实测 cA 世界 z ±9.2, 戳出极帽 L=9.7）
      //   —— 用户两轮「染色质飞出细胞外」的真根因; 收纳钳因此必须在世界空间解算后除回 scl。
      const scl = (1.62 + hash01(`cs${ci}`) * 0.42) * (0.55 + condense * 0.45) * (1 + decondense * 0.12);
      const armR = chr.armLocal * scl + 0.16; // 臂展世界半径（含着丝粒）
      // 位置: home（间期核内散布）→ plate（赤道板）; 个体微延迟 → 汇集不同步的自然读感
      const k = clamp01(congress + chr.delay * 0.12);
      vA.copy(chr.home).lerp(chr.plate, k);
      const tightXY = Math.max(0.1, 1 - clusterTight * 0.42 - segregate * 0.34 - decondense * 0.45);
      const yFac = 1 - clusterTight * 0.3 - segregate * 0.18;
      const flatZ = 1 - ramp(t, 1.4, 2.6) * 0.92;
      const gz = vA.z * flatZ;
      // 后期: 姐妹染色单体反向拉向两极（世界空间分离量; 动粒微管消费同一真源）
      const sepA = clamp01(segregate - chr.delay * 0.3);
      const reach = PZ * 0.92;
      // v18c 世界空间收纳硬钳: 单体中心+臂展恒留膜内（z 极帽 0.9·L; xy 取单体 z 处回转面半径）
      const stagW = (0.105 + sepA * 0.1) * scl; // 单体侧向错位世界半径
      const zCapW = Math.max(0.6, memL * 0.9 - armR);
      const cZW = Math.min(0.08 + sepA * reach, zCapW);
      chr.cZW = cZW; // 动粒微管端点消费（世界坐标）
      const cZ = cZW / Math.max(0.35, scl); // local 偏移 = 世界量 / 组缩放
      const xyLim = Math.max(0.55, rProfile(((gz + cZW) / memL + 1) / 2) * 0.96 - armR - stagW);
      const gx = THREE.MathUtils.clamp(vA.x * tightXY, -xyLim, xyLim);
      const gy = THREE.MathUtils.clamp(vA.y * yFac, -xyLim, xyLim);
      g.position.set(gx, gy, gz);
      chr.cA.position.z = -cZ;
      chr.cB.position.z = cZ;
      chr.cA.position.x = -0.105 - sepA * 0.1;
      chr.cB.position.x = 0.105 + sepA * 0.1;
      // 旋转 v18 极轴对齐（用户反馈「后期染色质飞出细胞外 + 纺锤丝跑到细胞外」的共同根因）:
      //  旧 rotation.y = spin（随机方位）→ 后期单体沿「随机方位」分离 —— spin≈±π/2 的染色体
      //  横向（垂直于纺锤轴）戳穿赤道膜面; 且动粒微管端点公式假设局部 z = 世界 z, 与真实单体
      //  位置脱节（纤维终点悬空 → 读感「纺锤丝跑出细胞」）。
      //  修复: 中期定向时把每组 Y 旋转就近对齐到 π 的倍数（局部 z → 世界 ±z 纺锤极轴）——
      //  X 形平面落入赤道板面、姐妹单体严格沿极轴分离、动粒微管端点与真实动粒重合;
      //  页方位角由 rotation.z（绕板面法线 roll = spin 复用）承载 —— 「书页环绕纺锤轴」的
      //  教科书中期 rosette 构图, 每条染色体朝向仍多样不呆板。
      const orient = ramp(t, 1.4, 2.4);
      const wobble = Math.sin(uTime.value * 2.4 + chr.spin * 5) * (1 - orient) * 0.9;
      const osc = Math.sin(uTime.value * 1.7 + chr.spin * 7) * 0.1 * orient * (1 - ramp(t, 3, 3.3));
      const poleYaw = Math.round(chr.spin / Math.PI) * Math.PI; // 就近对齐 ±z（最小旋转行程）
      g.rotation.set(
        wobble * 0.6 + (1 - orient) * Math.sin(chr.spin * 3) * 2.2,
        (1 - orient) * chr.spin * 4 + orient * poleYaw,
        (1 - orient) * wobble * 0.4 + orient * chr.spin + osc,
      );
      g.scale.setScalar(Math.max(0.001, scl * clamp01(ramp(t, 0.05, 0.6))));
    });

    /* 动粒微管（逐帧: 极 → 染色体着丝粒） */
    const kfiberOpacity = clamp01(ramp(t, 1.15, 1.8) * (1 - ramp(t, 4.1, 4.9)));
    kfiberMatRef.opacity = kfiberOpacity;
    const mtOpacity = clamp01(ramp(t, 0.7, 1.6) * (1 - ramp(t, 4.3, 5.3)));
    mtMatRef.opacity = mtOpacity;
    /* 星体微管（v16 逐帧: 极位 + 定向芽长; v20 恒留膜内双保险）
     * 用户反馈「纺锤丝跑到细胞外」根因: ① 端点钳在 0.93·r(u) —— 与半透质膜仅 7% 间隙,
     *    纤维端 + 辉光视觉上「戳膜/出膜」; ② 缢裂期膜面内凹（哑铃非凸）—— 直纤维中段
     *    在缩窄环处可穿出回转面。v20: 端点钳加深至 0.80 + 沿极→端 4 点采样逐点验证膜内。 */
    if (mtOpacity > 0.01) {
      let ai = 0;
      for (const side of [-1, 1]) {
        for (let i = 0; i < astralN; i++) {
          const dir = astralDirs[side < 0 ? i : astralN + i];
          const len = 4.4 + hash01(`asl${side}${i}`) * 1.8; // 4.4-6.2 芽长（有意长于膜面 → 钳制后恒贴皮质）
          vA.set(0, 0, side * PZ); // 极（xy≈0 —— 中段采样线性内插的前提）
          vB.copy(dir).multiplyScalar(len).add(vA); // 芽端
          // ① 端点钳制（0.93 → 0.80: 与半透质膜留出可辨间隙, 不再读感「戳膜」）
          if (Math.abs(vB.z) > memL * 0.8) vB.z = Math.sign(vB.z) * memL * 0.8;
          {
            const u0 = (vB.z / memL + 1) / 2;
            const rr0 = Math.max(0.05, rProfile(u0)) * 0.8;
            const rc = Math.hypot(vB.x, vB.y);
            if (rc > rr0) {
              const kk = rr0 / rc;
              vB.x *= kk;
              vB.y *= kk;
            }
          }
          // ② 中段采样（缢裂非凸补偿）: 极→端直线纤维的中间点 xy = s·端点 xy,
          //    任一采样点超出该 z 处回转面 0.82 倍 → 端点 xy 按最大越界比收缩
          {
            let shrink = 1;
            for (const s of [0.35, 0.55, 0.75, 0.95]) {
              const zs = vA.z + (vB.z - vA.z) * s;
              if (Math.abs(zs) >= memL * 0.98) continue;
              const us = (zs / memL + 1) / 2;
              const allowed = Math.max(0.05, rProfile(us)) * 0.82;
              const rs = Math.hypot(vB.x * s, vB.y * s);
              if (rs > allowed) shrink = Math.min(shrink, allowed / rs);
            }
            if (shrink < 1) {
              vB.x *= shrink;
              vB.y *= shrink;
            }
          }
          kDir.subVectors(vB, vA);
          const kl = Math.max(0.01, kDir.length());
          kMid.addVectors(vA, vB).multiplyScalar(0.5);
          kQuat.setFromUnitVectors(kUp, kDir.normalize());
          kScale.set(1, kl, 1);
          kM.compose(kMid, kQuat, kScale);
          astrals.setMatrixAt(ai++, kM);
        }
      }
      astrals.instanceMatrix.needsUpdate = true;
      astrals.visible = true;
    } else {
      astrals.visible = false;
    }
    if (kfiberOpacity > 0.01) {
      let ki = 0;
      for (const chr of chromosomes) {
        const gz = chr.group.position.z;
        for (const side of [-1, 1]) {
          const pole = vA.set(chr.group.position.x * 0.12, chr.group.position.y * 0.12, side * PZ);
          const centromere = vB.copy(chr.group.position);
          // v18c: 端点用世界分离量 cZW（组缩放补偿后的同一真源 —— 与真实动粒位置重合）
          centromere.z = gz + (side < 0 ? -chr.cZW : chr.cZW) + side * 0.12;
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
    neMatRef.opacity = neFade * (perf ? 0.55 : 1); // v16: 流畅模式恒半透（染色质可读）
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
    // 双子核: 末期在两极染色体团处重组（v19: 分离期跟随子细胞中心后移至 ±7.0）
    const neReform = ramp(t, 4.15, 5.15);
    dauNeMatRef.opacity = neReform;
    const dauZ = THREE.MathUtils.lerp(3.1, 7.0, ramp(t, 5.0, 7));
    dauNeA.position.set(0, 0, -dauZ);
    dauNeB.position.set(0, 0, dauZ);
    const dauS = Math.max(0.001, 0.3 + neReform * 0.7) * (1 + ramp(t, 5, 7) * 0.1);
    dauNeA.scale.setScalar(dauS);
    dauNeB.scale.setScalar(dauS);
    dauNeA.visible = neReform > 0.02;
    dauNeB.visible = neReform > 0.02;

    /* 细胞器分配（v19 全量膜面钳制: 旧版线粒体/囊泡/核糖体 xy 半径达 4.7-5.3,
     * 末/胞质期缢裂回转面在该 z 处仅 ~4.0-4.5 —— 条形线粒体戳出膜外 ~1.6 单位
     * = 用户「条形细胞器跑到细胞外」根因; 钳制计入线粒体胶囊半长 0.85; 分离期追加子细胞球内钳） */
    const part = ramp(t, 3.4, 5.6); // 后期-末期: 向双子室迁移
    const clampCell = (v: THREE.Vector3, margin: number) => {
      if (memFade > 0.05) {
        const zLim = memL * 0.94;
        if (Math.abs(v.z) > zLim) v.z = Math.sign(v.z) * zLim;
        const u = (v.z / memL + 1) / 2;
        const rr = Math.max(0.12, rProfile(u) * 0.97 - margin);
        const rc = Math.hypot(v.x, v.y);
        if (rc > rr) {
          const kk = rr / rc;
          v.x *= kk;
          v.y *= kk;
        }
      }
      if (dauFade > 0.05) {
        // 分离期: 各细胞器归入各自子细胞球（离哪极近归哪室）
        const s = v.z >= 0 ? 1 : -1;
        const dz = v.z - s * zD;
        const dd = Math.hypot(v.x, v.y, dz);
        const lim = Math.max(0.3, rD - margin - 0.12);
        if (dd > lim) {
          const kk = lim / dd;
          v.x *= kk;
          v.y *= kk;
          v.z = s * zD + dz * kk;
        }
      }
    };
    {
      // QA 探测时逐帧记录线粒体渲染位（锚点一致性验证 —— v20 逐颗锚点跟随）
      const probe = typeof window !== 'undefined' && (window as { __mitoQaProbe?: boolean }).__mitoQaProbe;
      const rec: number[][] | null = probe ? [] : null;
      mitoSeeds.forEach((ms, i) => {
        const drift = Math.sin(uTime.value * 0.5 + ms.phase) * 0.35;
        const toZ = ms.side * THREE.MathUtils.lerp(2.2, 7.0, ramp(t, 4.8, 7));
        pv.set(
          Math.cos(ms.ang) * ms.rad * (1 - part * 0.32) + drift,
          ms.y * (1 - part * 0.4) + drift * 0.6,
          THREE.MathUtils.lerp(0, toZ, part),
        );
        clampCell(pv, 0.85);
        if (rec) rec.push([pv.x, pv.y, pv.z]);
        mm.compose(pv, qq.setFromEuler(ms.rot), one);
        mitos.setMatrixAt(i, mm);
      });
      if (rec) (window as unknown as { __mitoQaPos?: number[][] }).__mitoQaPos = rec;
      mitos.instanceMatrix.needsUpdate = true;
      vesSeeds.forEach((vs2, i) => {
        const toZ = vs2.side * THREE.MathUtils.lerp(2.0, 6.6, ramp(t, 4.8, 7));
        pv.set(Math.cos(vs2.ang) * vs2.rad * (1 - part * 0.35), vs2.y * (1 - part * 0.45), THREE.MathUtils.lerp(0, toZ, part));
        clampCell(pv, 0.3);
        sc.setScalar(vs2.r);
        mm.compose(pv, qq.identity(), sc);
        vesicles.setMatrixAt(i, mm);
      });
      vesicles.instanceMatrix.needsUpdate = true;
      ribSeeds.forEach((rs2, i) => {
        const toZ = rs2.side * THREE.MathUtils.lerp(1.5, 6.9, ramp(t, 4.6, 7));
        pv.set(Math.cos(rs2.ang) * rs2.rad * (1 - part * 0.3), rs2.y * (1 - part * 0.5), THREE.MathUtils.lerp(0, toZ, part));
        clampCell(pv, 0.2);
        sc.setScalar(0.8 + hash01(`rsz${i}`) * 0.5);
        mm.compose(pv, qq.identity(), sc);
        ribos.setMatrixAt(i, mm);
      });
      ribos.instanceMatrix.needsUpdate = true;
    }
    /* 高尔基（v16 叠杯栈）: 间期核旁主栈 → 前中期碎片化淡出 → 末期双子细胞各一栈（核旁位跟随子核） */
    const golgiFadeOut = 1 - ramp(t, 1.2, 2.2);
    const golgiReform = ramp(t, 4.6, 5.6);
    golgiStackMatRef.opacity = clamp01(Math.max(golgiFadeOut, golgiReform)) * 0.9;
    golgiMain.visible = golgiFadeOut > 0.02;
    golgiDauA.visible = golgiReform > 0.02;
    golgiDauB.visible = golgiReform > 0.02;
    const golgiZ = THREE.MathUtils.lerp(3.4, 7.3, ramp(t, 5, 7));
    golgiDauA.position.set(1.62, -1.05, -golgiZ + 0.35);
    golgiDauB.position.set(-1.62, -1.05, golgiZ - 0.35);
    /* 粗面内质网（v16 核周囊池冠）: 间期 → 前期 ER 重构管网化回缩 → 末期双子核重建双冠 */
    const rerFadeOut = 1 - ramp(t, 0.8, 1.8);
    const rerReform = ramp(t, 4.9, 5.9);
    rerMatRef.opacity = clamp01(Math.max(rerFadeOut, rerReform)) * 0.88;
    rerRibMat.opacity = clamp01(Math.max(rerFadeOut, rerReform));
    rerCrown.mesh.visible = rerFadeOut > 0.02;
    rerCrown.ribos.visible = rerCrown.mesh.visible;
    rerDauA.mesh.visible = rerReform > 0.02;
    rerDauB.mesh.visible = rerReform > 0.02;
    rerDauA.ribos.visible = rerDauA.mesh.visible;
    rerDauB.ribos.visible = rerDauB.mesh.visible;
    rerDauA.mesh.position.set(0, 0, -dauZ);
    rerDauB.mesh.position.set(0, 0, dauZ);
    rerDauA.ribos.position.set(0, 0, -dauZ);
    rerDauB.ribos.position.set(0, 0, dauZ);
    // 外周 ER: 前期回缩 → 末期重建（v19: 分离期随单膜淡出 —— ER 回收入核周冠, 两子细胞各自独立）
    erMatRef.opacity = clamp01((1 - ramp(t, 0.8, 1.8)) + ramp(t, 4.9, 5.9)) * 0.5 * (1 - ramp(t, 6.3, 6.8));
    erNet.visible = erMatRef.opacity > 0.02;
    erNet.scale.z = 1 + ramp(t, 5, 6.6) * 0.55;

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
    // v19: ESCRT-Ⅲ 内切时随 scission 收细淡出（桥断离后残余迅速降解）
    const scissionK = ramp(t, 5.85, 6.45);
    midbodyMatRef.opacity = ramp(t, 5.5, 5.95) * 0.95 * (1 - ramp(t, 6.0, 6.4));
    // 中间体: 仅深缢裂后可见; 半径跟随胞质桥并随内收缩细, 长度（局部 Y → 世界 Z）恒定
    const mbR = Math.max(0.3, Math.min(1.1, eqR)) * (1 - scissionK * 0.55);
    midbody.scale.set(mbR / 0.3, 1, mbR / 0.3);
    midbody.visible = midbodyMatRef.opacity > 0.02;
  };

  /* ---------- 相位感知悬停目标 ---------- */
  const targets = (phase: number): HoverTarget[] => {
    const T: HoverTarget[] = [];
    const cR = Math.cos(ROT_Y), sR = Math.sin(ROT_Y);
    // 世界坐标 = 舞台局部坐标绕 Y 旋转 ROT_Y（与 group.rotation.y 同步 —— Html 世界对齐）
    const push = (zh: string, latin: string, lx: number, ly: number, lz: number, r: number) =>
      T.push({ zh, latin, pos: { x: lx * cR + lz * sR, y: ly, z: -lx * sR + lz * cR }, r });
    const PZ = poleZ(Math.min(6, PHASE_BOUNDS[phase] + 0.4));
    // 常驻: 中心体 ×2（除间期贴核位）
    if (phase >= 1) {
      push('中心体（中心粒对）', 'Centrosome', 0.5, 0, -PZ, 1.8);
      push('中心体（中心粒对）', 'Centrosome', -0.5, 0, PZ, 1.8);
    } else {
      push('中心体（已复制, 贴核）', 'Centrosome', 0.5, 1.1, 1.5, 1.8);
    }
    // v20 线粒体锚点逐颗跟随相位（用户反馈「黄圈里的线粒体悬停无反应」）:
    //   旧版仅 2 个静态锚（间期位）—— 8 颗线粒体大多不在感应域内; 现按 update 同源运动学
    //   （去漂移确定性版）逐颗求解当前相位位置 + 膜内/子细胞球双重钳制。
    {
      const tA = Math.min(6.9, PHASE_BOUNDS[phase] + 0.4);
      const { L: aL, r: aR } = membraneProfile(tA);
      const partA = ramp(tA, 3.4, 5.6);
      const zD_A = THREE.MathUtils.lerp(5.55, 7.35, ramp(tA, 6.15, 7));
      const rD_A = THREE.MathUtils.lerp(5.15, 6.45, ramp(tA, 6.15, 6.9));
      mitoSeeds.forEach((ms) => {
        const toZ = ms.side * THREE.MathUtils.lerp(2.2, 7.0, ramp(tA, 4.8, 7));
        let x = Math.cos(ms.ang) * ms.rad * (1 - partA * 0.32);
        let y = ms.y * (1 - partA * 0.4);
        let z = THREE.MathUtils.lerp(0, toZ, partA);
        if (tA < 6.6) {
          // 单膜哑铃期: 回转面内钳（与 update.clampCell 同语义, 线粒体半长 0.85 计入）
          if (Math.abs(z) > aL * 0.94) z = Math.sign(z) * aL * 0.94;
          const u = (z / aL + 1) / 2;
          const rr = Math.max(0.12, aR(u) * 0.97 - 0.85);
          const rc = Math.hypot(x, y);
          if (rc > rr) {
            const kk = rr / rc;
            x *= kk;
            y *= kk;
          }
        } else {
          // 分离期: 归入各自子细胞球
          const s = z >= 0 ? 1 : -1;
          const dz = z - s * zD_A;
          const dd = Math.hypot(x, y, dz);
          const lim = Math.max(0.3, rD_A - 0.97);
          if (dd > lim) {
            const kk = lim / dd;
            x *= kk;
            y *= kk;
            z = s * zD_A + dz * kk;
          }
        }
        push('线粒体（暖古铜）', 'Mitochondrion', x, y, z, 1.25);
      });
    }
    if (phase === 0) {
      push('细胞核（核被膜）', 'Nuclear envelope', 0, 0, 0, 3.6);
      push('染色质（松散纤维）', 'Chromatin', 1.2, 0.8, -0.6, 2.4);
      // v18: S 期复制可视化锚点（金色光点行进区 —— 悬停可指认复制叉语义）
      push('复制叉（DNA 复制中）', 'Replication forks', -1.1, -0.7, 0.9, 2.0);
      push('核仁', 'Nucleolus', 0.6, 0.7, -0.5, 1.6);
      push('游离核糖体', 'Polysomes', 2.6, -2.0, 1.5, 2.4);
      // v16: 间期全套细胞器（用户反馈「分裂细胞没有 RER/高尔基」—— 悬停目录同步补齐）
      push('粗面内质网（核糖体冠）', 'Rough ER', -2.35, 1.5, -2.9, 2.2);
      push('粗面内质网（核糖体冠）', 'Rough ER', -2.6, -1.7, 2.1, 2.2);
      push('高尔基体（扁平囊堆）', 'Golgi apparatus', 2.72, -0.83, 2.63, 2.0);
      push('运输囊泡', 'Transport vesicle', -3.1, 2.2, -1.2, 1.6);
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
      // v19: 子代核被膜锚跟随 dauZ 相位推进（4.2 → 5.2 → 6.2 → 7.0）
      const dzT = [0, 0, 0, 0, 4.2, 5.2, 6.2, 7.0][phase] ?? 4.4;
      push('子代核被膜（重组）', 'Daughter envelope', 0, 0, -dzT, 2.4);
      push('子代核被膜（重组）', 'Daughter envelope', 0, 0, dzT, 2.4);
      push('游离核糖体', 'Polysomes', 2.6, -2.0, 3.0, 2.4);
    }
    if (phase >= 5) {
      // v16: 末期重建的子代 RER 冠 + 高尔基栈（核旁位, 悬停可指认; v19 跟随分离后子细胞中心）
      const rzT = [0, 0, 0, 0, 0, 5.3, 6.1, 7.0][phase] ?? 5.3;
      push('粗面内质网（子代重建）', 'Rough ER', 0, 0.6, -rzT, 2.0);
      push('粗面内质网（子代重建）', 'Rough ER', 0, 0.6, rzT, 2.0);
      push('高尔基体（重建）', 'Golgi apparatus', 1.62, -1.05, -(rzT + 0.35), 1.7);
      push('高尔基体（重建）', 'Golgi apparatus', -1.62, -1.05, rzT + 0.35, 1.7);
    }
    if (phase === 5 || phase === 6) {
      push('收缩环（actomyosin）', 'Contractile ring', 3.6, 0, 0, 2.2);
    }
    if (phase === 6) {
      push('中间体（胞质桥）', 'Midbody', 0, 0, 0, 1.6);
      push('子细胞 ×2', 'Daughter cells', 0, 0, -6.4, 3.2);
      push('子细胞 ×2', 'Daughter cells', 0, 0, 6.4, 3.2);
    }
    if (phase === 7) {
      // v19 分离完成: 两个独立子细胞（各自完整细胞器 + 质膜密封）
      push('子细胞（独立 ×2）', 'Daughter cells', 0, 0, -7.3, 3.4);
      push('子细胞（独立 ×2）', 'Daughter cells', 0, 0, 7.3, 3.4);
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
      clock.current = Math.min(7, clock.current + (d * speed) / MITOSIS_PHASE_SECONDS);
      if (clock.current >= 7) {
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
    onProgress?.(clock.current / 7);
    build.update(clock.current, d);
    // QA 插桩（Task 41 先例: 活体读真实渲染坐标 —— 比像素反推可靠; 零成本, 仅在显式探测时写入）
    if (typeof window !== 'undefined' && (window as { __mitoQaProbe?: boolean }).__mitoQaProbe) {
      (window as unknown as { __mitoQa: unknown }).__mitoQa = { t: clock.current, phase };
    }
  });

  const hoverTargets = useMemo(() => build.targets(phase), [build, phase]);
  // QA 插桩: 悬停目标同步暴露（v20 验证锚点跟随; 探测关闭时零开销）
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as { __mitoQaProbe?: boolean }).__mitoQaProbe) {
      (window as unknown as { __mitoQaTargets?: HoverTarget[] }).__mitoQaTargets = hoverTargets;
    }
  }, [hoverTargets]);

  return (
    <>
      <primitive object={build.group} />
      <OrganelleHoverLayer targets={hoverTargets} enabled={showAnatomy} locate={null} />
    </>
  );
};
