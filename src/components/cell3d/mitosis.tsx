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
import { erLamellaGeometry, erLamellaRibosomes, golgiCisternaGeometry, cristaeLamellaeGeometry, type ErLamellaOpts, type ErLamellaLayer } from './organelles';
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
  /* ---------- v56b 子细胞膜（内切断离帧: 与单膜两叶几何同构瞬时交换 → 两独立子细胞拉开） ----------
   * 回转面单 mesh 拓扑无法真正断开成两体 —— 但缢缩完成时刻两叶恰相切（zc=ρ）, 双子球以
   * 完全相同的球心/半径替换 = 几何同构的瞬时交换（无渐变窗, 像素级无缝, 膜全程可见恒不透明;
   * 取代 v19 crossfade —— 用户「膜消失又出现」根治）。唯一帧间差异 = 针状桥消失（= 内切本身）。
   * 随后两球拉开距离并收圆 = 完全分开的两个独立细胞（体积守恒 r≈8.5/∛2≈6.5） */
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
   *  v56b 连续缢缩（用户反馈「分裂最后膜消失又出现」根治）: 胞质分裂全程单膜回转面连续变形 ——
   *    球（间期）→ 轻微花生腰（后期拉长, zc 小幅外移）→ 双球并集哑铃（缢缩 = 两叶球心
   *    连续外移、重叠区递减, 颈半径 = √(ρ²−zc²) 解析收敛）→ 针状中间体桥（bridge 地板
   *    随 scission 收细）→ 内切断离瞬间与双子膜交换（两叶恰相切时刻几何同构, 像素级无缝）。
   *    膜自始至终可见、不透明度恒定 —— 无任何淡入淡出交接窗。
   *  双球并集解剖学: 两叶球心 ±zc、叶半径 ρ; zc<ρ 时赤道颈 = √(ρ²−zc²)（收缩环所在）,
   *    zc→ρ 时颈闭合（两叶相切）; L = zc+ρ 恒使回转面在极点闭合。 */
  const membraneProfile = (t: number): { L: number; r: (u: number) => number } => {
    const elongK = ramp(t, 2.9, 4.4); // 后期拉长（anaphase B 极外移 → 细胞轻拉长, 腰部微收）
    const constrict = ramp(t, 4.55, 6.05); // 缢裂窗（RhoA-actomyosin 收缩环持续内收）
    const scission = ramp(t, 5.9, 6.45); // ESCRT-Ⅲ 内切窗（中间体桥 → 针状）
    const zc = R_CELL * (0.16 * elongK + 0.58 * constrict); // 叶心: 0 → 0.16R（拉长）→ 0.74R（相切）
    const rho = R_CELL * (1 - 0.26 * constrict); // 叶半径: R → 0.74R（体积重分布入两叶）
    const bridge = 0.3 * (1 - scission) + 0.02 * scission; // 中间体桥半径 → 针状
    const L = zc + rho + 0.02; // 回转面极点闭合所需半长
    const rFn = (u: number) => {
      const s = 2 * u - 1; // 归一纬度（-1 极 … 0 赤道 … +1 极）
      const z = s * L;
      // 双球并集轮廓（两叶各贡献一段球面弧, 取外者）
      const near = z >= 0 ? z - zc : z + zc; // 距近侧叶心的有符号偏移
      const far = z >= 0 ? z + zc : z - zc; // 距远侧叶心
      const rNear = Math.sqrt(Math.max(0, rho * rho - near * near));
      const rFar = Math.sqrt(Math.max(0, rho * rho - far * far));
      return Math.max(bridge, rNear, rFar);
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
    // 着丝粒（连接姐妹染色单体 —— cohesin 黏合读感; anaphase separase 切割 → 淡出）
    const centro = new THREE.Mesh(track(new THREE.SphereGeometry(0.15, 10, 8)), centroMat);
    centro.renderOrder = 47;
    // 动粒（每单体着丝粒朝极面金盘 —— 微管锚定点）
    const kinGeo = track(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10));
    // v30 动粒盘随单体迁移（用户「纺锤丝没有拉着染色体动」根因①: 旧金盘挂组原点 ——
    //   后期单体分离时盘恒悬留赤道板、纤维端点又用组心近似 → 「染色体动了, 纺锤丝没动」读感）:
    //   盘改挂各自姐妹单体的着丝粒外缘朝极面 —— 全程随单体迁移至两极, 纤维端点即盘位（见 k-fibers 段）
    const kinA = new THREE.Mesh(kinGeo, kinMat);
    kinA.position.set(0, 0, 0.17);
    kinA.rotation.x = Math.PI / 2;
    const kinB = new THREE.Mesh(kinGeo, kinMat);
    kinB.position.set(0, 0, -0.17);
    kinB.rotation.x = Math.PI / 2;
    cB.add(kinA); // +z 极侧盘 → 随 +z 单体
    cA.add(kinB); // -z 极侧盘 → 随 -z 单体
    g.add(cA, cB, centro);
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

  /* ---------- 纺锤体微管 ---------- */
  // v26 参照图对色: 微管 = sage 绿族（REF.microtubule —— 与主视图细胞骨架同色 = 同蛋白同色科学编码）
  const mtMat = mat({
    color: REF.microtubule,
    emissive: '#3f5c4a',
    emissiveIntensity: 0.6,
    roughness: 0.4,
    normalMap: mtStripe,
    normalScale: 0.6,
    opacity: 0,
    sheen: 0.4,
    sheenColor: REF.sheen,
  });
  // v25 中央纺锤体（极微管重叠区）独立材质: 与星体微管分拍退役 ——
  //   科学: 后期末星体微管 catastrophically 解聚, 但中带（midzone）反平行重叠区
  //   持续存留并随缢裂致密化汇入中间体; 旧版共用 mtMat 全体同拍淡出 → 缢裂期
  //   「纤维全部消失 → 中间体突然冒出」断档读感（用户反馈根因）。
  const mtPolarMat = mat({
    color: REF.microtubule,
    emissive: '#3f5c4a',
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
  // v26 极间微管（中央纺锤体）逐帧 InstancedMesh —— v25 静态合并网格 + spindle.scale.z 组缩放退役:
  //   组缩放会把纤维极端拉离中心体（furrowMT=1 时极端仅 ±0.38·PZ 而中心体在 ±PZ ——
  //   纤维整体悬空中段、与两极脱锚 —— 用户「纺锤丝显示还是有问题」根因）。
  //   新体系: 极端逐帧恒锚中心体位（vA = 中心体 + 扇出偏移）, 远端随缢裂从越赤道 ±1.6
  //   向赤道 ±0.5 滑移（antiparallel overlap 致密化）+ xy 压缩 → 「纤维束凝缩成致密杆」
  //   读感保留; 全程双保险钳制膜内（端点 + 中段采样回转面）。
  const polarN = perf ? 10 : 16;
  const polarSeeds: { lat: number; lon: number }[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < polarN; i++) {
      polarSeeds.push({ lat: (hash01(`po${side}${i}`, 3) - 0.5) * 0.75, lon: hash01(`po${side}${i}`, 5) * Math.PI * 2 });
    }
  }
  const polarGeo = track(new THREE.CylinderGeometry(0.032, 0.032, 1, 5));
  const polars = new THREE.InstancedMesh(polarGeo, mtPolarMat, polarSeeds.length);
  polars.renderOrder = 43;
  group.add(polars);
  // 动粒微管（逐染色体双极连接 —— InstancedMesh 逐帧重排: 极 → 着丝粒动粒）
  const kfiberGeo = track(new THREE.CylinderGeometry(0.055, 0.055, 1, 7, 1));
  const kfiberMat = mat({
    color: '#a8c8b4',
    emissive: '#6a8a76',
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

  /* ---------- v26 间期细胞骨架（参照图: 间期细胞绿色微管放射 + 琥珀皮层细丝 ----------
   * 用户反馈「细胞骨架之类的目前好像没有体现」—— 分裂演示间期此前是裸胞质;
   * 与主视图同族语言（同蛋白同色科学编码: 微管 sage 绿 / 肌动蛋白琥珀）:
   *   · 间期微管阵列: MTOC（核被膜外表面中心粒对位）放射, [0.05,0.4] 淡入 →
   *     前中期纺锤体组装时解聚退役 [1.2,2.0]（科学: 间期阵列去稳 → 微管蛋白
   *     亚库重组装为纺锤体三族纤维）
   *   · 皮层肌动蛋白网: 切向胶囊阵逐帧贴形态学膜面内 ~0.6 —— 随缢裂期膜面
   *     收缩, 收缩环接管后让位退役 [4.55,5.3] */
  const mtoC = new THREE.Vector3(0.9, 0.9, 3.15).normalize().multiplyScalar(NUC_R * 1.02);
  const interMat = mat({
    color: REF.microtubule,
    emissive: '#3f5c4a',
    emissiveIntensity: 0.5,
    roughness: 0.45,
    normalMap: mtStripe,
    normalScale: 0.5,
    opacity: 0,
    sheen: 0.4,
    sheenColor: REF.sheen,
  });
  const INTER_N = perf ? 14 : 22;
  const interDirs: THREE.Vector3[] = [];
  for (let i = 0; i < INTER_N * 3 && interDirs.length < INTER_N; i++) {
    const d = new THREE.Vector3(
      Math.cos((hash01(`it${i}`, 3) - 0.5) * 2.2) * Math.cos(hash01(`it${i}`, 5) * Math.PI * 2),
      Math.sin((hash01(`it${i}`, 7) - 0.5) * 2.2),
      Math.cos((hash01(`it${i}`, 3) - 0.5) * 2.2) * Math.sin(hash01(`it${i}`, 5) * Math.PI * 2),
    ).normalize();
    // 外向半空间过滤（回穿核体的方向丢弃 —— 间期微管不侵入核被膜内）
    if (d.dot(mtoC) < -0.1 * NUC_R) continue;
    interDirs.push(d);
  }
  const interMTs = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.03, 0.03, 1, 5)), interMat, Math.max(2, interDirs.length));
  interMTs.renderOrder = 43;
  group.add(interMTs);
  const actxMat = mat({
    color: REF.actin,
    emissive: '#8a6a3e',
    emissiveIntensity: 0.32,
    roughness: 0.42,
    opacity: 0,
    sheen: 0.45,
    sheenColor: '#d8b88a',
  });
  const ACTX_N = perf ? 36 : 64;
  const actxSeeds: { dir: THREE.Vector3; tan: THREE.Vector3 }[] = [];
  for (let i = 0; i < ACTX_N; i++) {
    const dir = new THREE.Vector3(
      Math.cos((hash01(`ax${i}`, 3) - 0.5) * 2.4) * Math.cos(hash01(`ax${i}`, 5) * Math.PI * 2),
      Math.sin((hash01(`ax${i}`, 7) - 0.5) * 2.4),
      Math.cos((hash01(`ax${i}`, 3) - 0.5) * 2.4) * Math.sin(hash01(`ax${i}`, 5) * Math.PI * 2),
    ).normalize();
    const tan = new THREE.Vector3(hash01(`at${i}`) - 0.5, hash01(`at${i}`, 3) - 0.5, hash01(`at${i}`, 5) - 0.5).cross(dir).normalize();
    actxSeeds.push({ dir, tan });
  }
  const actx = new THREE.InstancedMesh(track(new THREE.CapsuleGeometry(0.02, 0.7, 3, 5)), actxMat, ACTX_N);
  actx.renderOrder = 44;
  group.add(actx);
  // v26b 子细胞微管阵列（末期双子细胞各绕子中心体重建 —— 「微管蛋白亚库重组装」叙事闭环:
  //   间期阵列 [1.2,2.0] 退役 → 纺锤三族承载中期-后期 → 末期 [5.6,6.3] 双子阵列重建;
  //   端点逐帧解算于子细胞球内 rD−0.35, 中心体位 = centA/centB 当前帧位）
  const dauMTMat = mat({
    color: REF.microtubule,
    emissive: '#3f5c4a',
    emissiveIntensity: 0.46,
    roughness: 0.45,
    normalMap: mtStripe,
    normalScale: 0.5,
    opacity: 0,
    sheen: 0.4,
    sheenColor: REF.sheen,
  });
  const DAU_MT_N = perf ? 10 : 16;
  const dauMTDirs: THREE.Vector3[] = [];
  for (let i = 0; i < DAU_MT_N * 3 && dauMTDirs.length < DAU_MT_N * 2; i++) {
    const d = new THREE.Vector3(
      Math.cos((hash01(`dm${i}`, 3) - 0.5) * 2.4) * Math.cos(hash01(`dm${i}`, 5) * Math.PI * 2),
      Math.sin((hash01(`dm${i}`, 7) - 0.5) * 2.4),
      Math.cos((hash01(`dm${i}`, 3) - 0.5) * 2.4) * Math.sin(hash01(`dm${i}`, 5) * Math.PI * 2),
    ).normalize();
    dauMTDirs.push(d);
  }
  const dauMTs = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.028, 0.028, 1, 5)), dauMTMat, Math.max(2, dauMTDirs.length));
  dauMTs.renderOrder = 43;
  group.add(dauMTs);
  const interMatRef = interMat as THREE.MeshPhysicalMaterial;
  const actxMatRef = actxMat as THREE.MeshPhysicalMaterial;
  const dauMTMatRef = dauMTMat as THREE.MeshPhysicalMaterial;

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
  // 线粒体（豆状 + 真板层嵴 v24 —— 与主细胞同一形态标准）
  const mitoGeo = track(new THREE.CapsuleGeometry(0.4, 0.8, 4, 10));
  const mitoMat = mat({
    color: REF.mitoOuter,
    emissive: '#3e2c26',
    emissiveIntensity: 0.34,
    roughness: 0.28,
    // v24 透射 0.3→0.45 + 条纹法线 0.7→0.35: 嵴板层从「法线贴图伪装」升级为真几何直读
    transmission: perf ? 0 : 0.45,
    thickness: 0.4,
    opacity: 1,
    clearcoat: 0.5,
    normalMap: mtStripe,
    normalScale: 0.35,
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
  // v26 板层嵴（非 perf）: 满腔密集近垂直蛇形板层堆 ×12 —— 共享线粒体实例矩阵（同一运动学）;
  //   修缺陷: 旧参数（6 片, halfSpan 0.32）在半长 0.8 囊腔内仅覆盖中部 40% —— 端部空腔读感
  //   「嵴稀疏/不对」; 新参数 12 片 ±0.52 满腔填铺（cylHalf 0.4 = 胶囊圆柱段真实值）
  let mitoCristae: THREE.InstancedMesh | null = null;
  let mitoInner: THREE.InstancedMesh | null = null;
  if (!perf) {
    const { geometry: mcGeo } = cristaeLamellaeGeometry(77, 12, 0.345, 0.4, 0.52, false);
    const mcMat = mat({
      color: REF.mitoCristae,
      emissive: '#9a5a42',
      emissiveIntensity: 0.7,
      roughness: 0.4,
      opacity: 0.85,
      sheen: 0.5,
      sheenColor: '#a8826e',
    });
    mitoCristae = new THREE.InstancedMesh(track(mcGeo), mcMat, MITO_N);
    group.add(mitoCristae);
    // v25 内膜（inner boundary membrane）: 双膜三明治 —— 外膜 0.4 / 膜间隙 0.03 / 内膜 0.37;
    //   嵴板层片缘（Rm 0.34）贴内膜内面 → 「嵴从内膜折叠」读感; 共享实例矩阵同一运动学
    const miGeo = track(new THREE.CapsuleGeometry(0.365, 0.76, 6, 14));
    const miMat = mat({
      color: REF.mitoCristae,
      emissive: '#6a4a3e',
      emissiveIntensity: 0.4,
      roughness: 0.3,
      opacity: 0.55,
      sheen: 0.5,
      sheenColor: '#a8826e',
    });
    mitoInner = new THREE.InstancedMesh(miGeo, miMat, MITO_N);
    group.add(mitoInner);
  }
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
  /* ---------- 高尔基体（v21: 复用 golgiCisternaGeometry —— 椭圆扁平囊平行堆, 主细胞同款形态标准） ----------
   * v17 旧「5 层弓形叠杯堆」读感「长条形」（用户反馈）—— v21 改与主细胞同构:
   *   椭圆扁平囊 ×6 平行叠置（aspect 1.78, 无弓形偏移/无梯骨）; 间期核旁一栈（脱核悬浮）→
   *   前中期碎片化淡出 → 末期双子细胞各重建一栈（子核旁脱核位）。 */
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
    const CIST_N = 6;
    const step = 0.3 * scale;
    const semiB = 0.78 * scale; // 短半轴（aspect 拉伸后长半轴 ≈ 1.39·scale）
    const stackH = CIST_N * step;
    const MIX = [0, 0.14, 0.34, 0.56, 0.8, 1];
    const ASPECT = 1.78; // v21 与主细胞同款椭圆纵横比
    for (let i = 0; i < CIST_N; i++) {
      const col = cisCol.clone().lerp(transCol, MIX[i]);
      const rad = semiB * (1 - i * 0.045);
      const cup = (0.05 + i * 0.028) * scale;
      const geo = track(golgiCisternaGeometry(rad, 0.082 * scale, cup, seed + i * 7, perf ? 6 : 8, perf ? 26 : 40, ASPECT));
      const m = new THREE.Matrix4().makeRotationY(i * 0.09).setPosition(0, i * step - stackH * 0.5, 0);
      parts.push({ geo, matrix: m, color: col });
    }
    // trans 面出芽囊泡 ×5（顶点色并入同一网格 —— 单 draw call; 沿椭圆轮廓）
    for (let v = 0; v < 5; v++) {
      const r = (0.1 + hash01(`gb${seed}${v}`) * 0.05) * scale;
      const ang = v * (Math.PI * 2 / 5) + hash01(`gba${seed}${v}`) * 0.6;
      const rr = semiB * (0.5 + hash01(`gbr${seed}${v}`) * 0.42);
      const sph = track(new THREE.SphereGeometry(r, 8, 6));
      sph.translate(Math.cos(ang) * rr * ASPECT, stackH * 0.5 + 0.14 * scale, Math.sin(ang) * rr);
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
  // 外周 ER 管网（SER 语义; 前期回缩 → 末期双子细胞各自重建 —— RER 冠之外的持续 ER 网络）
  // v30 工厂化三份（用户「后期突然出现滑面内质网 + 部分在分裂后的细胞外」根治）:
  //   旧单一管网以原点为中心、末期 z 向拉伸 1.55× 试图横跨双子细胞 —— 网心悬在两子细胞
  //   之间的胞外空隙（半数管段出膜）; 且 [4.9,5.9] 全尺寸快拍重现。新体系:
  //   · 间期网: 缢裂前 [5.0,5.75] 彻底回收（ER 膜池回流核周冠语义）
  //   · 双子网: [5.45,6.35] 自子核区萌发、scale 0.42→0.72 生长（ER 与核被膜连续 ——
  //     自子核向外重建的科学叙事; 无整网快拍）, 中心恒随子细胞重算（±dauZ 同源轨迹）,
  //     全程留子细胞球内（6.9·0.72≈5.0 < rD−0.5）
  const erMat = mat({
    color: REF.erSheet,
    emissive: '#54507a',
    emissiveIntensity: 0.22,
    roughness: 0.38,
    opacity: 0,
    clearcoat: 0.3,
    flow: { color: '#9c96b8', strength: 0.12, scale: 0.9, speed: 0.06, rim: 0.16 },
  });
  const erDauMat = mat({
    color: REF.erSheet,
    emissive: '#54507a',
    emissiveIntensity: 0.22,
    roughness: 0.38,
    opacity: 0,
    clearcoat: 0.3,
    flow: { color: '#9c96b8', strength: 0.12, scale: 0.9, speed: 0.06, rim: 0.16 },
  });
  /** 外周 ER 管网几何工厂: seed='' 复现旧间期网（el0..eo7 同源 hash）; 返回悬停锚（管身中段采样点） */
  const buildErNet = (seed: string, tubeR: number, count: number, material: THREE.Material): { mesh: THREE.Mesh; anchors: THREE.Vector3[] } => {
    const parts: { geo: THREE.BufferGeometry }[] = [];
    const anchors: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const pts: THREE.Vector3[] = [];
      const baseLat = (hash01(`el${seed}${i}`) - 0.5) * 1.8;
      const baseLon = hash01(`eo${seed}${i}`) * Math.PI * 2;
      for (let k = 0; k <= 5; k++) {
        const tt = k / 5;
        const lat = baseLat + Math.sin(tt * 3.9 + i * 1.3) * 0.3;
        const lon = baseLon + tt * 1.2;
        const rr = 6.2 + Math.sin(tt * 2.8 + i) * 0.7;
        pts.push(new THREE.Vector3(Math.cos(lat) * Math.cos(lon) * rr, Math.sin(lat) * rr * 0.82, Math.cos(lat) * Math.sin(lon) * rr));
      }
      parts.push({ geo: track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, tubeR, 6)) });
      if (i % 3 === 1) anchors.push(pts[2].clone(), pts[4].clone()); // 每 3 管取 2 锚（管身真实采样点）
    }
    const mesh = new THREE.Mesh(track(mergeGeoms(parts)), material);
    mesh.renderOrder = 44;
    return { mesh, anchors };
  };
  const erNetB = buildErNet('', 0.085, perf ? 4 : 8, erMat);
  const erNet = erNetB.mesh;
  const erAnchors = erNetB.anchors;
  group.add(erNet);
  // 末期双子细胞独立外周 ER 网（管径 0.11 —— 缩放 0.42-0.72 下投影管径仍可读）
  const erDauA = buildErNet('A', 0.11, perf ? 3 : 5, erDauMat);
  const erDauB = buildErNet('B', 0.11, perf ? 3 : 5, erDauMat);
  group.add(erDauA.mesh, erDauB.mesh);
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
  const midbodyMat = mat({ color: '#8fa694', emissive: '#5a6e60', emissiveIntensity: 0.8, roughness: 0.4, opacity: 0 });
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
  const mtPolarMatRef = mtPolarMat as THREE.MeshPhysicalMaterial;
  const kfiberMatRef = kfiberMat as THREE.MeshPhysicalMaterial;
  const neMatRef = neMat as THREE.MeshPhysicalMaterial;
  const npcMatRef = npcMat as THREE.MeshPhysicalMaterial;
  const chromatinMatRef = chromatinMat as THREE.MeshPhysicalMaterial;
  const fragMatRef = fragMat as THREE.MeshPhysicalMaterial;
  const dauNeMatRef = dauNeMat as THREE.MeshPhysicalMaterial;
  const golgiStackMatRef = golgiStackMat as THREE.MeshPhysicalMaterial;
  const rerMatRef = rerMat as THREE.MeshPhysicalMaterial;
  const erMatRef = erMat as THREE.MeshPhysicalMaterial;
  const erDauMatRef = erDauMat as THREE.MeshPhysicalMaterial;
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
  const vC = new THREE.Vector3();

  const update = (t: number, dt: number) => {
    uTime.value += dt;
    const PZ = poleZ(t);

    /* 质膜形态学（v16: 同时返回当前回转面参数 —— 星体微管逐帧钳制消费） */
    const { L: memL, r: rProfile } = updateMembrane(t);

    /* v56b 内切断离（abscission）瞬时无缝交换 —— 取代 v19 crossfade（用户反馈「膜消失又出现」根治）:
     * T_CUT=6.45 时刻单膜两叶恰相切（zc=ρ=0.74R, 颈已闭合并成针状桥）, 双子膜以完全相同
     * 的球心/半径瞬时替换（同帧无渐变窗, 几何同构像素无缝）; 唯一可见差异 = 针状桥消失
     * —— 这正是 ESCRT-Ⅲ 内切的视觉语义。此后 zD 6.29→7.35 / rD 6.29→6.45（拉开 + 收圆）
     * 内容物（子核/高尔基/RER 冠/细胞器）同步随 ramp 后移至各自子细胞中心 */
    const T_CUT = 6.45; // ESCRT-Ⅲ 完成内切的瞬间（= 单膜两叶相切后针桥收细完成）
    const dauFade = t >= T_CUT ? 1 : 0; // 瞬时交换（QA 探针兼容通道: 0/1 阶跃）
    const memFade = t >= T_CUT ? 0 : 1;
    const ZC_FINAL = R_CELL * 0.74; // 缢缩完成叶心（与 membraneProfile constrict=1 严格同源）
    const zD = THREE.MathUtils.lerp(ZC_FINAL, 7.35, ramp(t, T_CUT, 7.2));
    const rD = THREE.MathUtils.lerp(ZC_FINAL, 6.45, ramp(t, T_CUT, 7.0));
    memMatRef.opacity = (perf ? 0.5 : 0.42) * memFade; // 恒全不透明直至断离帧
    membrane.visible = memFade > 0.5;
    memDauA.visible = dauFade > 0.5;
    memDauB.visible = dauFade > 0.5;
    memDauA.position.set(0, 0, -zD);
    memDauB.position.set(0, 0, zD);
    memDauA.scale.setScalar(Math.max(0.001, rD));
    memDauB.scale.setScalar(Math.max(0.001, rD));
    memDauMatARef.opacity = (perf ? 0.5 : 0.42) * dauFade; // 断离帧即全不透明（无淡入）
    memDauMatBRef.opacity = (perf ? 0.5 : 0.42) * dauFade;

    /* 凝聚/去凝聚与不透明度 */
    // v18: 凝聚推迟到 0.42 起 —— 给 S 期复制可视化留出完整间期窗口（0-0.42 纤维态 + 复制叉行进）
    const condense = ramp(t, 0.42, 1.45); // 前期凝聚
    const decondense = ramp(t, 4.3, 5.5); // 末期去凝聚
    // 染色体凝聚可见（跟随凝聚时序）→ 末期大幅淡出（去凝聚染色质融入双子核读感; v16: 0.55→0.7）
    const chrOpacity = clamp01(ramp(t, 0.5, 1.25) * (1 - ramp(t, 4.4, 5.6) * 0.7));
    chrMatRef.opacity = chrOpacity;
    // v30 着丝粒球（cohesin 黏合）: anaphase 起始即被 separase 切割 → [3.02,3.35] 快速淡出
    //   （单体几何自带着丝粒球随单体走 —— 旧版组心球全程跟随 = 「黏合未断」的错误读感）
    centroMatRef.opacity = chrOpacity * (1 - ramp(t, 3.02, 3.35));
    // v30 动粒金盘寿命与动粒微管同步 [4.2,5.02] 退役（旧 [3.05,3.6] —— 后期刚开始盘就消失,
    //   纤维端失去视觉锚点 = 「纺锤丝没拉着染色体」读感根因②; 动粒在后期持续存在并牵引单体）
    kinMatRef.opacity = clamp01(ramp(t, 1.2, 1.7) * (1 - ramp(t, 4.2, 5.02)));
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

    /* 动粒微管（逐帧: 极 → 染色体着丝粒）
     * v25 [4.1,4.9]→[4.2,5.02]: 与星体微管同拍退役 —— 三族纤维整齐谢事,
     * 中央纺锤体（极微管）独自留存承载缢裂期（见下方 mtPolarOpacity） */
    const kfiberOpacity = clamp01(ramp(t, 1.15, 1.8) * (1 - ramp(t, 4.2, 5.02)));
    kfiberMatRef.opacity = kfiberOpacity;
    /* v22 纺锤解聚加速: 旧版 4.3→5.3 淡出 —— 深缢裂期（furrowK>0.6）仍有 ~15% 残影贴着收缩
     * 回转面, 半透质膜 + 辉光下读感「纤维戳膜/出膜」。收缩环一旦启动（4.55）, 微管迅速
     * 去稳而解聚（科学: 末期末星体微管 catastrophically depolymerize, 中间体接管）—— 收缩
     * 全窗口内纤维可见度单调归零, 不再与深缢裂共存。 */
    const mtOpacity = clamp01(ramp(t, 0.7, 1.6) * (1 - ramp(t, 4.3, 5.05)));
    mtMatRef.opacity = mtOpacity;
    /* v26 中央纺锤体（midzone 反平行重叠区）持续到胞质分裂（用户反馈「纺锤丝消失后突然又出现」根治）:
     *   旧版极微管与星体共用 mtMat → 5.05 同拍全隐; 中间体 5.5 才快拍淡入 —— t∈[5.05,5.5]
     *   纺锤类结构完全断档 + 中间体 2.5s 内 0→0.95 快拍冒出。现三段连续交接:
     *   ① 星体/动粒纤维 4.2-5.02 退役 ② 中带 [4.95,5.8] 一边致密化一边淡出（科学: 后期 B
     *   中带存留 → 随缢裂向中央来焦）③ 中间体 [5.3,5.85] 在同一位置淡入接棒 ——
     *   全程任一时刻纺锤-中间体链都有可见结构, 无断档无突兀。 */
    const mtPolarOpacity = clamp01(ramp(t, 0.7, 1.6) * (1 - ramp(t, 4.95, 5.8)));
    mtPolarMatRef.opacity = mtPolarOpacity;
    /* v22 收缩环联动（用户反馈「收缩过程中纺锤丝没有随着发生变化」）:
     * 数值上纤维已恒在膜内（v20 双保险钳制 + __spindleQa 实测零越界）—— 但收缩期纤维
     * 长度/贴边位置不变, 半透膜下视觉上「顶穿」缢裂面。现让纺锤随收缩环主动退场:
     *   ① 芽长 ×(1−0.5·furrowK) —— 纤维朝两极回缩（解聚读感, 与膜面收缩同步变化）
     *   ② 端点/中段钳深 0.80/0.82 → 0.58/0.62 —— 皮质附着点随缢裂加深而脱离皮质 */
    const furrowMT = ramp(t, 4.55, 5.6);
    /* 星体微管（v16 逐帧: 极位 + 定向芽长; v20 恒留膜内双保险）
     * 用户反馈「纺锤丝跑到细胞外」根因: ① 端点钳在 0.93·r(u) —— 与半透质膜仅 7% 间隙,
     *    纤维端 + 辉光视觉上「戳膜/出膜」; ② 缢裂期膜面内凹（哑铃非凸）—— 直纤维中段
     *    在缩窄环处可穿出回转面。v20: 端点钳加深至 0.80 + 沿极→端 4 点采样逐点验证膜内。 */
    if (mtOpacity > 0.01) {
      let ai = 0;
      const mtShrink = 1 - 0.5 * furrowMT; // v22 芽长回缩系数
      const endK = 0.8 - 0.22 * furrowMT; // v22 端点钳深（0.80 → 0.58）
      const midK = 0.82 - 0.2 * furrowMT; // v22 中段钳深（0.82 → 0.62）
      for (const side of [-1, 1]) {
        for (let i = 0; i < astralN; i++) {
          const dir = astralDirs[side < 0 ? i : astralN + i];
          const len = (4.4 + hash01(`asl${side}${i}`) * 1.8) * mtShrink; // 4.4-6.2 芽长（收缩环启动后朝极回缩）
          // v30 极端 = 中心体木体位（旧 (0,0,±PZ) 轴上近似点与中心体 x±0.5 脱开）——
          //   逐帧跟随中心体迁移, 星体扇白中心体长出
          vA.copy(side < 0 ? centA.position : centB.position);
          vB.copy(dir).multiplyScalar(len).add(vA); // 芽端
          // ① 端点钳制（v22: 随缢裂加深 0.80→0.58 —— 皮质附着点同步脱离收缩中的皮质）
          if (Math.abs(vB.z) > memL * 0.8) vB.z = Math.sign(vB.z) * memL * 0.8;
          {
            const u0 = (vB.z / memL + 1) / 2;
            const rr0 = Math.max(0.05, rProfile(u0)) * endK;
            const rc = Math.hypot(vB.x, vB.y);
            if (rc > rr0) {
              const kk = rr0 / rc;
              vB.x *= kk;
              vB.y *= kk;
            }
          }
          // ② 中段采样（缢裂非凸补偿）: 极→端直线纤维的中间点 xy = s·端点 xy,
          //    任一采样点超出该 z 处回转面 midK 倍 → 端点 xy 按最大越界比收缩
          //    （v22: midK 随缢裂加深 0.82→0.62 —— 纤维中段同步脱离收缩中的回转面）
          {
            let shrink = 1;
            for (const s of [0.35, 0.55, 0.75, 0.95]) {
              const zs = vA.z + (vB.z - vA.z) * s;
              if (Math.abs(zs) >= memL * 0.98) continue;
              const us = (zs / memL + 1) / 2;
              const allowed = Math.max(0.05, rProfile(us)) * midK;
              // v30 两端 xy 通用线性内插（中心体 xy=±0.5 后极/端两端均有 xy; 旧 s·端点 xy 仅极 xy=0 时成立）
              const rs = Math.hypot(vA.x + (vB.x - vA.x) * s, vA.y + (vB.y - vA.y) * s);
              if (rs > allowed) shrink = Math.min(shrink, allowed / rs);
            }
            if (shrink < 1) {
              // 自极端侧收缩芽端保持中心体锚定（同极间微管 v26 手法）
              vB.x = vA.x + (vB.x - vA.x) * shrink;
              vB.y = vA.y + (vB.y - vA.y) * shrink;
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
    /* 中心体: 间期贴核并排 → 分离至两极（v30 提前至纤维解算前 —— 星体/动粒/极间三族
     *   纤维极端同帧锚定中心体木体位, 零帧滞后） */
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

    /* 动粒微管（逐帧: 中心体 → 动粒金盘）
     * v25 [4.1,4.9]→[4.2,5.02]: 与星体微管同拍退役 —— 三族纤维整齐谢事,
     * 中央纺锤体（极微管）独自留存承载缢裂期（见下方 mtPolarOpacity）
     * v30 严格锚定（用户「纺锤丝并没有拉着染色体动」根治）:
     *   · 着丝粒端 = 动粒金盘世界坐标（getWorldPosition 消费本帧刚写入的局部变换 ——
     *     纤维端点与「渲染中的金盘」零漂移重合; 旧版 gz±cZW+0.12 公式与真实盘位差
     *     旋转/缩放/侧向错位三重近似误差 → 后期纤维端悬空不贴单体 = 「没拉着」读感）
     *   · 极端 = 中心体木体位（旧 side·PZ 轴上近似点, 与中心体 x±0.5 脱开）
     *   · 端点回撤 0.05: 纤维端面停在盘面而非穿盘（金盘可读）
     *   · 单体向极迁移 → 纤维自盘端超极解聚缩短（anaphase A 牵引读感直读） */
    if (kfiberOpacity > 0.01) {
      let ki = 0;
      for (const chr of chromosomes) {
        // 世界矩阵即时刷新: 染色体组局部变换刚写入 → 强制重算矩阵链再取盘位
        chr.group.updateMatrixWorld(true);
        for (const side of [-1, 1]) {
          vA.copy(side < 0 ? centA.position : centB.position); // 极端 = 中心体木体
          chr.kinA.getWorldPosition(vB);
          chr.kinB.getWorldPosition(vC);
          // 选与该极同侧的动粒盘（极轴翻转 poleYaw=π 的染色体自动配对另一盘 —— 任意旋转态恒正确）
          const useA = side > 0 ? vC.z >= vB.z : vC.z < vB.z;
          if (useA) vB.copy(vC);
          kDir.subVectors(vB, vA);
          const full = kDir.length();
          const len = Math.max(0.02, full - 0.05); // 端点回撤: 露出金盘
          if (full > 1e-4) kDir.multiplyScalar(1 / full);
          kMid.copy(vA).addScaledVector(kDir, len / 2);
          kQuat.setFromUnitVectors(kUp, kDir);
          kScale.set(1, len, 1);
          kM.compose(kMid, kQuat, kScale);
          kfibers.setMatrixAt(ki++, kM);
        }
      }
      for (; ki < CHR_N * 2; ki++) {
        kM.makeScale(0, 0, 0);
        kfibers.setMatrixAt(ki, kM);
      }
      kfibers.instanceMatrix.needsUpdate = true;
      kfibers.visible = true;
    } else {
      // v30 可见性门控（旧版恒 visible + 不透明度 0 —— 退役后实例矩阵冻结为末帧位,
      //   QA 探针按当前膜面采样误报「膜外」; 现与星体/极间同拍隐藏）
      kfibers.visible = false;
    }

    /* v26 极间微管逐帧解算（中央纺锤体 —— 极端恒锚中心体 + 重叠区随缢裂收拢）:
     *   · 极端 vA = 中心体位 + 扇出偏移（dir·0.5）—— 逐帧跟随两极外移, 纤维永不脱离中心体
     *     （v25 组缩放缺陷根治: 旧 scale.z=(PZ/POLE_Z0)·(1−0.62·furrowMT) 把极端拉到
     *     ±0.38·PZ 悬空中段）
     *   · 远端 vB: 越赤道反平行位 −side·1.6 → 随 furrowMT 滑向赤道 −side·0.5（重叠区
     *     致密化 = 中间体骨架汇聚）+ xy 压缩 50%（纤维束收束）
     *   · 双保险钳制（同星体微管 v20 体系）: 端点 + 中段线性内插采样 —— 纤维恒留膜内 */
    if (mtPolarOpacity > 0.01) {
      let pi = 0;
      const ovZ = THREE.MathUtils.lerp(1.6, 0.5, furrowMT); // 重叠区边缘: ±1.6 → ±0.5
      const xyComp = 1 - 0.5 * furrowMT; // 重叠区 xy 收束
      for (const side of [-1, 1]) {
        for (let i = 0; i < polarN; i++) {
          const s2 = polarSeeds[side < 0 ? i : polarN + i];
          const dir = vC.set(
            Math.cos(s2.lat) * Math.cos(s2.lon),
            Math.sin(s2.lat),
            Math.cos(s2.lat) * Math.sin(s2.lon) * 0.35,
          ).normalize();
          // 极端: 恒锚中心体本体位 + 扇出偏移（v30: 旧 (dir·0.5, side·PZ) 轴上近似点
          //   与中心体 x±0.5 脱开最多 1.0 —— 现自中心体位扇出, 逐帧跟随迁移）
          vA.copy(side < 0 ? centA.position : centB.position).addScaledVector(dir, 0.5);
          // 远端: 越赤道反平行 → 重叠区（随缢裂收拢 + xy 压缩致密化）
          vB.set(-dir.x * 0.9 * xyComp, -dir.y * 0.9 * xyComp, -side * ovZ);
          // ① 端点钳制（缢裂颈部回转面）
          {
            const u0 = (vB.z / memL + 1) / 2;
            const rr0 = Math.max(0.05, rProfile(u0)) * 0.9;
            const rc = Math.hypot(vB.x, vB.y);
            if (rc > rr0) {
              const kk = rr0 / rc;
              vB.x *= kk;
              vB.y *= kk;
            }
          }
          // ② 中段采样（两端均有 xy —— 通用线性内插; 超面 → 从极侧收缩远端保持极端锚定）
          {
            let shrink = 1;
            for (const smp of [0.3, 0.5, 0.7, 0.9]) {
              const zs = vA.z + (vB.z - vA.z) * smp;
              if (Math.abs(zs) >= memL * 0.98) continue;
              const us = (zs / memL + 1) / 2;
              const allowed = Math.max(0.05, rProfile(us)) * 0.88;
              const rs = Math.hypot(vA.x + (vB.x - vA.x) * smp, vA.y + (vB.y - vA.y) * smp);
              if (rs > allowed) shrink = Math.min(shrink, allowed / rs);
            }
            if (shrink < 1) {
              vB.x = vA.x + (vB.x - vA.x) * shrink;
              vB.y = vA.y + (vB.y - vA.y) * shrink;
            }
          }
          kDir.subVectors(vB, vA);
          const kl = Math.max(0.01, kDir.length());
          kMid.addVectors(vA, vB).multiplyScalar(0.5);
          kQuat.setFromUnitVectors(kUp, kDir.normalize());
          kScale.set(1, kl, 1);
          kM.compose(kMid, kQuat, kScale);
          polars.setMatrixAt(pi++, kM);
        }
      }
      polars.instanceMatrix.needsUpdate = true;
      polars.visible = true;
    } else {
      polars.visible = false;
    }

    /* v26 间期微管阵列: MTOC 放射 → 前中期解聚退役（微管蛋白亚库重组装为纺锤体） */
    const interOp = clamp01(ramp(t, 0.05, 0.4) * (1 - ramp(t, 1.2, 2.0)));
    interMatRef.opacity = interOp * 0.6;
    if (interOp > 0.01) {
      let iim = 0;
      for (const d of interDirs) {
        // 端点解算: 静态球面膜内（间期膜恒球 —— 退役完成 2.0 早于伸长起点 2.9, 恒有效）
        const b = d.dot(mtoC);
        const c = (R_CELL - 0.35) ** 2 - mtoC.lengthSq();
        const len = Math.max(0.5, -b + Math.sqrt(Math.max(0.01, b * b + c)));
        vA.copy(mtoC);
        vB.copy(d).multiplyScalar(len).add(vA);
        kDir.subVectors(vB, vA);
        const kl = Math.max(0.01, kDir.length());
        kMid.addVectors(vA, vB).multiplyScalar(0.5);
        kQuat.setFromUnitVectors(kUp, kDir.normalize());
        kScale.set(1, kl, 1);
        kM.compose(kMid, kQuat, kScale);
        interMTs.setMatrixAt(iim++, kM);
      }
      for (; iim < interMTs.count; iim++) {
        kM.makeScale(0, 0, 0);
        interMTs.setMatrixAt(iim, kM);
      }
      interMTs.instanceMatrix.needsUpdate = true;
      interMTs.visible = true;
    } else {
      interMTs.visible = false;
    }

    /* v26 皮层肌动蛋白网: 逐帧贴形态学膜面内 ~0.6 —— 缢裂期随膜面收缩, 让位收缩环 */
    const actxOp = clamp01(ramp(t, 0.05, 0.5) * (1 - ramp(t, 4.55, 5.3)));
    actxMatRef.opacity = actxOp * 0.5;
    if (actxOp > 0.01) {
      for (let i = 0; i < ACTX_N; i++) {
        const s3 = actxSeeds[i];
        const h = Math.max(1e-4, Math.hypot(s3.dir.x, s3.dir.y));
        const u = (s3.dir.z + 1) / 2;
        const rr = Math.max(0.05, rProfile(u)) - 0.6;
        pv.set((s3.dir.x / h) * rr, (s3.dir.y / h) * rr, s3.dir.z * memL * 0.99);
        qq.setFromUnitVectors(kUp, s3.tan);
        sc.set(1, 0.85 + hash01(`axs${i}`) * 0.9, 1);
        mm.compose(pv, qq, sc);
        actx.setMatrixAt(i, mm);
      }
      actx.instanceMatrix.needsUpdate = true;
      actx.visible = true;
    } else {
      actx.visible = false;
    }

    /* v26b 子细胞微管阵列: 末期双子细胞各绕子中心体重建 [5.6,6.3]（间期阵列退役 →
     * 纺锤三族 → 双子阵列 —— 微管蛋白亚库重组装叙事闭环; 端点解算于子细胞球内） */
    const dauMTOp = clamp01(ramp(t, 5.6, 6.3));
    dauMTMatRef.opacity = dauMTOp * 0.6;
    if (dauMTOp > 0.01) {
      const half = Math.floor(dauMTDirs.length / 2);
      const mtoD: THREE.Vector3[] = [centA.position, centB.position];
      let dm = 0;
      for (let side = 0; side < 2; side++) {
        const mtc = mtoD[side];
        const ctr = vC.set(side === 0 ? 0 : 0, 0, side === 0 ? -zD : zD); // 子细胞球心
        for (let i = 0; i < half; i++) {
          const d = dauMTDirs[side * half + i];
          // 端点: |mtc + d·len − ctr| ≤ rD−0.35 二次方程正根
          const rel = vA.copy(mtc).sub(ctr);
          const b = rel.dot(d);
          const c = (Math.max(1, rD) - 0.35) ** 2 - rel.lengthSq();
          const len = Math.max(0.4, -b + Math.sqrt(Math.max(0.01, b * b + c)));
          vA.copy(mtc);
          vB.copy(d).multiplyScalar(len).add(vA);
          kDir.subVectors(vB, vA);
          const kl = Math.max(0.01, kDir.length());
          kMid.addVectors(vA, vB).multiplyScalar(0.5);
          kQuat.setFromUnitVectors(kUp, kDir.normalize());
          kScale.set(1, kl, 1);
          kM.compose(kMid, kQuat, kScale);
          dauMTs.setMatrixAt(dm++, kM);
        }
      }
      for (; dm < dauMTs.count; dm++) {
        kM.makeScale(0, 0, 0);
        dauMTs.setMatrixAt(dm, kM);
      }
      dauMTs.instanceMatrix.needsUpdate = true;
      dauMTs.visible = true;
    } else {
      dauMTs.visible = false;
    }

    /* v22 QA 插桩: 纺锤纤维膜外越界测量（__spindleQaProbe 门控 —— 实测实例矩阵逐段采样,
     * 与渲染像素无关的数值真源; 常态零成本） */
    if (typeof window !== 'undefined' && (window as { __spindleQaProbe?: boolean }).__spindleQaProbe) {
      const qa: { t: number; astral: number; kfiber: number; polar: number; nAstral: number; nKfiber: number; nPolar?: number; poleErr?: number } = { t, astral: 0, kfiber: 0, polar: 0, nAstral: 0, nKfiber: 0 };
      const testPt = (x: number, y: number, z: number): number => {
        if (Math.abs(z) > memL) return Math.abs(z) - memL + Math.hypot(x, y);
        const u = (z / memL + 1) / 2;
        return Math.hypot(x, y) - Math.max(0.05, rProfile(u));
      };
      const sampleInst = (im: THREE.InstancedMesh, out: { worst: number; n: number }, isK: boolean) => {
        if (!im.visible) return;
        const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pm = new THREE.Vector3();
        for (let ii = 0; ii < im.count; ii++) {
          im.getMatrixAt(ii, kM);
          if (kM.elements[0] === 0 && kM.elements[5] === 0) continue; // 缩没的实例
          pa.set(0, -0.5, 0).applyMatrix4(kM);
          pb.set(0, 0.5, 0).applyMatrix4(kM);
          let worstSeg = 0;
          for (let ss = 0; ss <= 6; ss++) {
            pm.lerpVectors(pa, pb, ss / 6);
            worstSeg = Math.max(worstSeg, testPt(pm.x, pm.y, pm.z));
          }
          if (worstSeg > 0.02) { out.n++; out.worst = Math.max(out.worst, worstSeg); }
        }
        void isK;
      };
      const astralQa = { worst: 0, n: 0 };
      const kfiberQa = { worst: 0, n: 0 };
      const polarQa = { worst: 0, n: 0 };
      sampleInst(astrals, astralQa, false);
      sampleInst(kfibers, kfiberQa, true);
      sampleInst(polars, polarQa, false);
      qa.astral = astralQa.worst; qa.nAstral = astralQa.n;
      qa.kfiber = kfiberQa.worst; qa.nKfiber = kfiberQa.n;
      qa.polar = polarQa.worst; qa.nPolar = polarQa.n;
      // v26 极端锚定性验证: 每根极间纤维极端 z 与中心体位 ±PZ 的最大偏差（逐帧数值真源）
      if (polars.visible && mtPolarMatRef.opacity > 0.02) {
        let poleErr = 0;
        const pe = new THREE.Vector3();
        for (let ii = 0; ii < polars.count; ii++) {
          polars.getMatrixAt(ii, kM);
          if (kM.elements[0] === 0 && kM.elements[5] === 0) continue;
          pe.set(0, -0.5, 0).applyMatrix4(kM);
          poleErr = Math.max(poleErr, Math.abs(Math.abs(pe.z) - PZ));
        }
        qa.poleErr = poleErr;
      } else {
        qa.poleErr = 0;
      }
      (window as unknown as { __spindleQa?: unknown }).__spindleQa = qa;
    }

    /* v25 QA 插桩: 纺锤-中间体连续性 + 中间体胞外检测（数值真源 —— 断档/出膜的逐帧判定）:
     *   · gap: t∈[2.0,6.1] 内四族纺锤结构（星体/动粒/中带/中间体）同时近零 → 视觉断档帧
     *   · mbOut（v56b 语义修正）: 中间体杆端伸出双子球外侧包络（z > zD+rD）→ 真胞外悬空帧
     *     （旧公式「杆端 > zD−rD」基于 crossfade 时序的间隙检查 —— 新连续缢缩下断离帧两球
     *     恰相切、杆全长藏于两叶并集内; 断离后杆位于两球间隙 = 中间体跨胞质桥的科学正确形态） */
    if (typeof window !== 'undefined' && (window as { __spindleChainQaProbe?: boolean }).__spindleChainQaProbe) {
      const mbOp = (midbodyMat as THREE.MeshPhysicalMaterial).opacity;
      const chain = {
        t,
        astralOp: mtOpacity, kfiberOp: kfiberOpacity, polarOp: mtPolarOpacity, midbodyOp: mbOp,
        gap: (t > 2.0 && t < 6.1 && mtOpacity < 0.02 && kfiberOpacity < 0.02 && mtPolarOpacity < 0.02 && mbOp < 0.02) ? 1 : 0,
        mbHalf: 0.55 * (1 - 0.55 * ramp(t, 5.85, 6.45)),
        dauGap: zD - rD,
        dauFade,
        mbOut: (mbOp > 0.02 && dauFade > 0.5 && 0.55 * (1 - 0.55 * ramp(t, 5.85, 6.45)) > zD + rD) ? 1 : 0,
      };
      (window as unknown as { __spindleChainQa?: unknown }).__spindleChainQa = chain;
    }

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
        if (mitoCristae) mitoCristae.setMatrixAt(i, mm); // v24 嵴板层与本体同一矩阵
        if (mitoInner) mitoInner.setMatrixAt(i, mm); // v25 内膜同一矩阵
      });
      if (rec) (window as unknown as { __mitoQaPos?: number[][] }).__mitoQaPos = rec;
      mitos.instanceMatrix.needsUpdate = true;
      if (mitoCristae) mitoCristae.instanceMatrix.needsUpdate = true;
      if (mitoInner) mitoInner.instanceMatrix.needsUpdate = true;
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
    // 外周 ER（v30 三网体系）: 间期单网前期回缩 [0.8,1.8] → 缢裂前彻底回收 [5.0,5.75]
    //   （旧版 [4.9,5.9] 全尺寸重现 + z 拉伸 1.55× 悬跨双子细胞胞外空隙 —— 已退役）
    erMatRef.opacity = clamp01(1 - ramp(t, 0.8, 1.8)) * (1 - ramp(t, 5.0, 5.75)) * 0.5;
    erNet.visible = erMatRef.opacity > 0.02;
    // 双子外周 ER 网: [5.45,6.35] 自子核区萌发、scale 0.42→0.72 生长 —— 中心恒随子细胞
    //   （±dauZ 与子核/子代 RER 冠同一轨迹真源）; 尺度全程留子细胞球内
    const erDauOp = ramp(t, 5.45, 6.35);
    erDauMatRef.opacity = erDauOp * 0.55;
    const erDauS = THREE.MathUtils.lerp(0.42, 0.72, ramp(t, 5.45, 6.9));
    erDauA.mesh.visible = erDauOp > 0.02;
    erDauB.mesh.visible = erDauOp > 0.02;
    erDauA.mesh.position.set(0, 0, -dauZ);
    erDauB.mesh.position.set(0, 0, dauZ);
    erDauA.mesh.scale.setScalar(Math.max(0.001, erDauS));
    erDauB.mesh.scale.setScalar(Math.max(0.001, erDauS));

    /* 收缩环 + 中间体 */
    const furrowK = ramp(t, 4.55, 6.05); // v56b: 与膜轮廓缢裂窗同源（环随颈半径全程收缩）
    ringMatRef.opacity = clamp01(ramp(t, 4.35, 4.9) * (1 - ramp(t, 6.0, 6.2))) * 0.9;
    const eqR = Math.max(0.32, rProfile(0.5)); // = 双球并集颈半径（收缩环恰骑在膜面缢缩最细处）
    furrowRing.scale.set(eqR, eqR, 0.75 + furrowK * 0.4);
    // 环的收缩脉动（actomyosin 拉动读感）
    const squeeze = 1 - Math.sin(uTime.value * 2.2) * 0.02 * (furrowK > 0 && furrowK < 1 ? 1 : 0);
    furrowRing.scale.x *= squeeze;
    furrowRing.scale.y *= squeeze;
    // 中间体（深缢裂后的致密胞质桥）
    // v56b: ESCRT-Ⅲ 内切时刻（T_CUT=6.45）桥杆随针状桥一同断离 —— 淡出窗移至 [6.45,6.8]
    //   （桥断离后残余随子细胞分离迅速降解; v25「杆伸出子细胞球面」的收纳约束保留:
    //   长度随 scission 压缩 0.55→0.25, 半径跟随胞质桥 —— 断离帧两子球恰相切, 杆全长藏于
    //   两叶球面相交区域内部, 无胞外悬空）
    const scissionK = ramp(t, 5.85, 6.45);
    midbodyMatRef.opacity = ramp(t, 5.3, 5.85) * 0.95 * (1 - ramp(t, 6.45, 6.8));
    // 中间体: 仅深缢裂后可见; 半径跟随胞质桥并随内收缩细; 长度（局部 Y → 世界 Z）随 scission 压缩
    const mbR = Math.max(0.3, Math.min(1.05, eqR)) * (1 - scissionK * 0.55);
    midbody.scale.set(mbR / 0.3, 1 - 0.55 * scissionK, mbR / 0.3);
    midbody.visible = midbodyMatRef.opacity > 0.02;
  };

  /* ---------- 相位感知悬停目标 ---------- */
  /* v36 染色体确定性位置求解（update 运动学同源公式重解 —— 悬停锚逐条跟随赤道板列队/分离位;
   *   同 v20 线粒体逐颗跟随范式: 静态近似锚 → 动态真位锚） */
  const chrPosAt = (ci: number, tA: number): { x: number; y: number; z: number; cZW: number } => {
    const chr = chromosomes[ci];
    if (!chr) return { x: 0, y: 0, z: 0, cZW: 0 };
    const condense = ramp(tA, 0.42, 1.45);
    const decondense = ramp(tA, 4.3, 5.5);
    const congress = ramp(tA, 1.4, 2.75);
    const segregate = ramp(tA, 3.05, 3.85);
    const clusterTight = ramp(tA, 4.0, 4.6);
    const PZA = poleZ(tA);
    const { L: memL, r: rProfile } = membraneProfile(tA);
    const scl = (1.62 + hash01(`cs${ci}`) * 0.42) * (0.55 + condense * 0.45) * (1 + decondense * 0.12);
    const armR = chr.armLocal * scl + 0.16;
    const k = clamp01(congress + chr.delay * 0.12);
    const v = chr.home.clone().lerp(chr.plate, k);
    const tightXY = Math.max(0.1, 1 - clusterTight * 0.42 - segregate * 0.34 - decondense * 0.45);
    const yFac = 1 - clusterTight * 0.3 - segregate * 0.18;
    const flatZ = 1 - ramp(tA, 1.4, 2.6) * 0.92;
    const gz = v.z * flatZ;
    const sepA = clamp01(segregate - chr.delay * 0.3);
    const reach = PZA * 0.92;
    const stagW = (0.105 + sepA * 0.1) * scl;
    const zCapW = Math.max(0.6, memL * 0.9 - armR);
    const cZW = Math.min(0.08 + sepA * reach, zCapW);
    const xyLim = Math.max(0.55, rProfile(((gz + cZW) / memL + 1) / 2) * 0.96 - armR - stagW);
    return {
      x: THREE.MathUtils.clamp(v.x * tightXY, -xyLim, xyLim),
      y: THREE.MathUtils.clamp(v.y * yFac, -xyLim, xyLim),
      z: gz,
      cZW,
    };
  };
  const targets = (phase: number): HoverTarget[] => {
    const T: HoverTarget[] = [];
    const cR = Math.cos(ROT_Y), sR = Math.sin(ROT_Y);
    // 世界坐标 = 舞台局部坐标绕 Y 旋转 ROT_Y（与 group.rotation.y 同步 —— Html 世界对齐）
    const push = (zh: string, latin: string, lx: number, ly: number, lz: number, r: number) =>
      T.push({ zh, latin, pos: { x: lx * cR + lz * sR, y: ly, z: -lx * sR + lz * cR }, r });
    // v28 折线命中体推入器（细胞骨架条形结构全段可悬停 —— 用户「细胞骨架还是只能放在
    //   中心才行, 而不是条形的任意位置」根治: 间期/子细胞微管阵列从单点区域锚迁移为
    //   逐管折线, 指到阵列中任何一根的任何一段都能感应, 套环/信息卡锚定在指针命中处）
    const pushPoly = (zh: string, latin: string, localPts: THREE.Vector3[], r: number, hitPx: number) => {
      const mid = localPts[Math.floor(localPts.length / 2)];
      T.push({
        zh,
        latin,
        pos: { x: mid.x * cR + mid.z * sR, y: mid.y, z: -mid.x * sR + mid.z * cR },
        r,
        poly: localPts.map((p) => ({ x: p.x * cR + p.z * sR, y: p.y, z: -p.x * sR + p.z * cR })),
        hitPx,
      });
    };
    const PZ = poleZ(Math.min(6, PHASE_BOUNDS[phase] + 0.4));
    // 常驻: 中心体 ×2（除间期贴核位）
    if (phase >= 1) {
      push('中心体（中心粒对）', 'Centrosome', 0.5, 0, -PZ, 1.8);
      push('中心体（中心粒对）', 'Centrosome', -0.5, 0, PZ, 1.8);
    } else {
      push('中心体（已复制, 贴核）', 'Centrosome', 0.5, 1.1, 1.5, 1.8);
      // v29 间期核孔逐孔锚: 与 npcs InstancedMesh 同源确定性 hash 位（nl/no）——
      //   演示视图同享「指到任何一枚核孔环即现信息卡」（主视图 v29 同步根治）
      for (let i = 0; i < (perf ? 18 : 30); i++) {
        const lat = Math.asin((hash01(`nl${i}`) - 0.5) * 1.9);
        const lon = hash01(`no${i}`) * Math.PI * 2;
        const d = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).multiplyScalar(NUC_R);
        push('核孔复合体', 'Nuclear pore complex', d.x, d.y, d.z, 0.3);
      }
      // v28 间期微管阵列逐管折线命中体（旧 v26 单点区域锚 —— 管身任意位置可指认;
      //   端点解算与 update() 同源: 静态球面膜内二次方程正根（间期膜恒球, mtoC/dirs 静态））
      for (const d of interDirs) {
        const b = d.dot(mtoC);
        const cc = (R_CELL - 0.35) ** 2 - mtoC.lengthSq();
        const len = Math.max(0.5, -b + Math.sqrt(Math.max(0.01, b * b + cc)));
        pushPoly(
          '微管（间期放射阵列）',
          'Interphase microtubules',
          [mtoC, mtoC.clone().addScaledVector(d, len * 0.5), mtoC.clone().addScaledVector(d, len)],
          0.5,
          15,
        );
      }
      const aDir = new THREE.Vector3(0.42, 0.18, 0.89).normalize().multiplyScalar(R_CELL - 0.6);
      push('皮层肌动蛋白网', 'Cortical actin', aDir.x, aDir.y, aDir.z, 2.4);
    }
    // v28b 子细胞微管阵列逐管折线命中体（分离完成相位 —— 旧 v26b 双子各 1 点区域锚;
    //   端点解算与 update() 同源（快照 tA: 中心体位 = 确定性 lerp 公式, 子细胞球 rD/zD 同窗）
    if (phase >= 7) {
      const tA7 = Math.min(6.9, PHASE_BOUNDS[phase] + 0.4);
      const zD7 = THREE.MathUtils.lerp(5.55, 7.35, ramp(tA7, 6.15, 7));
      const rD7 = THREE.MathUtils.lerp(5.15, 6.45, ramp(tA7, 6.15, 6.9));
      const half = Math.floor(dauMTDirs.length / 2);
      const mtoD7 = [new THREE.Vector3(0.5, 0, -PZ), new THREE.Vector3(-0.5, 0.05, PZ)];
      for (let side = 0; side < 2; side++) {
        const mtc = mtoD7[side];
        const ctr = new THREE.Vector3(0, 0, side === 0 ? -zD7 : zD7); // 子细胞球心
        for (let i = 0; i < half; i++) {
          const d = dauMTDirs[side * half + i];
          const rel = mtc.clone().sub(ctr);
          const b = rel.dot(d);
          const cc = (Math.max(1, rD7) - 0.35) ** 2 - rel.lengthSq();
          const len = Math.max(0.4, -b + Math.sqrt(Math.max(0.01, b * b + cc)));
          pushPoly(
            '微管（子细胞放射阵列）',
            'Daughter cell microtubules',
            [mtc, mtc.clone().addScaledVector(d, len * 0.5), mtc.clone().addScaledVector(d, len)],
            0.5,
            14,
          );
        }
      }
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
      // v23 囊泡/核糖体锚点逐颗跟随（与 update 同源运动学去漂移版 —— 旧版仅间期/末期各 1 个
      // 静态近似锚, 中后期实际位置脱锚; 现取代表颗逐颗求解, 锚点=渲染位恒一致）
      vesSeeds.forEach((vs2, i) => {
        if (i >= 7) return; // 代表颗（隔半取; 本体 r 0.14-0.26 → 锚 0.55）
        const toZ = vs2.side * THREE.MathUtils.lerp(2.0, 6.6, ramp(tA, 4.8, 7));
        let x = Math.cos(vs2.ang) * vs2.rad * (1 - partA * 0.35);
        let y = vs2.y * (1 - partA * 0.45);
        let z = THREE.MathUtils.lerp(0, toZ, partA);
        if (tA < 6.6) {
          if (Math.abs(z) > aL * 0.94) z = Math.sign(z) * aL * 0.94;
          const u = (z / aL + 1) / 2;
          const rr = Math.max(0.12, aR(u) * 0.97 - 0.3);
          const rc = Math.hypot(x, y);
          if (rc > rr) {
            const kk = rr / rc;
            x *= kk;
            y *= kk;
          }
        } else {
          const s = z >= 0 ? 1 : -1;
          const dz = z - s * zD_A;
          const dd = Math.hypot(x, y, dz);
          const lim = Math.max(0.3, rD_A - 0.42);
          if (dd > lim) {
            const kk = lim / dd;
            x *= kk;
            y *= kk;
            z = s * zD_A + dz * kk;
          }
        }
        push('运输囊泡', 'Transport vesicle', x, y, z, 0.55);
      });
      ribSeeds.forEach((rs2, i) => {
        if (i % 30 !== 0 || i >= 120) return; // 4 颗代表（i=0/30/60/90; perf 模式 2 颗）
        const toZ = rs2.side * THREE.MathUtils.lerp(1.5, 6.9, ramp(tA, 4.6, 7));
        let x = Math.cos(rs2.ang) * rs2.rad * (1 - partA * 0.3);
        let y = rs2.y * (1 - partA * 0.5);
        let z = THREE.MathUtils.lerp(0, toZ, partA);
        if (tA < 6.6) {
          if (Math.abs(z) > aL * 0.94) z = Math.sign(z) * aL * 0.94;
          const u = (z / aL + 1) / 2;
          const rr = Math.max(0.12, aR(u) * 0.97 - 0.2);
          const rc = Math.hypot(x, y);
          if (rc > rr) {
            const kk = rr / rc;
            x *= kk;
            y *= kk;
          }
        } else {
          const s = z >= 0 ? 1 : -1;
          const dz = z - s * zD_A;
          const dd = Math.hypot(x, y, dz);
          const lim = Math.max(0.3, rD_A - 0.32);
          if (dd > lim) {
            const kk = lim / dd;
            x *= kk;
            y *= kk;
            z = s * zD_A + dz * kk;
          }
        }
        push('游离核糖体', 'Polysomes', x, y, z, 0.5);
      });
    }
    if (phase === 0) {
      push('细胞核（核被膜）', 'Nuclear envelope', 0, 0, 0, 3.6);
      push('染色质（松散纤维）', 'Chromatin', 1.2, 0.8, -0.6, 2.4);
      // v18: S 期复制可视化锚点（金色光点行进区 —— 悬停可指认复制叉语义）
      push('复制叉（DNA 复制中）', 'Replication forks', -1.1, -0.7, 0.9, 2.0);
      push('核仁', 'Nucleolus', 0.6, 0.7, -0.5, 1.6);
      // v30 间期外周 ER 管网逐管锚（管身真实采样点 —— 主视图 v27 同步补齐）
      for (const a of erAnchors) {
        push('滑面内质网（外周管网）', 'Smooth ER', a.x, a.y, a.z, 1.1);
      }
      // v16: 间期全套细胞器（用户反馈「分裂细胞没有 RER/高尔基」—— 悬停目录同步补齐）
      // v23: 游离核糖体/运输囊泡改逐颗跟随锚（上方块）—— 静态近似锚退役
      push('粗面内质网（核糖体冠）', 'Rough ER', -2.35, 1.5, -2.9, 2.2);
      push('粗面内质网（核糖体冠）', 'Rough ER', -2.6, -1.7, 2.1, 2.2);
      push('高尔基体（扁平囊堆）', 'Golgi apparatus', 2.72, -0.83, 2.63, 2.0);
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
      // v36 动态锚: 逐条跟随赤道板列队位（确定性公式重解 —— 每 3 条取 1 避免锚过密）
      const tA = Math.min(6.9, PHASE_BOUNDS[phase] + 0.4);
      chromosomes.forEach((_, ci) => {
        if (ci % 3 !== 0) return;
        const p = chrPosAt(ci, tA);
        push('中期染色体（X 形）', 'Metaphase chromosome', p.x, p.y, p.z, 1.5);
      });
    }
    if (phase === 3) {
      push('赤道板（中期板）', 'Metaphase plate', 0, 0, 0, 2.6);
      push('着丝粒 · 动粒', 'Kinetochore', 2.1, 1.2, 0.2, 1.4);
      push('动粒微管（张力）', 'Kinetochore fibers', 1.2, 0.7, -2.4, 2.2);
    }
    if (phase === 4) {
      // v36 动态锚: 逐条跟随姐妹单体分离位（每条染色体 → 两单体锚 gz ± cZW）
      const tA = Math.min(6.9, PHASE_BOUNDS[4] + 0.4);
      chromosomes.forEach((_, ci) => {
        if (ci % 3 !== 0) return;
        const p = chrPosAt(ci, tA);
        push('姐妹染色单体分离', 'Sister chromatids', p.x, p.y, p.z - p.cZW, 1.5);
        push('姐妹染色单体分离', 'Sister chromatids', p.x, p.y, p.z + p.cZW, 1.5);
      });
      push('纺锤体拉长（极分离）', 'Spindle elongation', 0, 0, 0, 2.4);
    }
    if (phase >= 4) {
      // v19: 子代核被膜锚跟随 dauZ 相位推进（4.2 → 5.2 → 6.2 → 7.0）
      const dzT = [0, 0, 0, 0, 4.2, 5.2, 6.2, 7.0][phase] ?? 4.4;
      push('子代核被膜（重组）', 'Daughter envelope', 0, 0, -dzT, 2.4);
      push('子代核被膜（重组）', 'Daughter envelope', 0, 0, dzT, 2.4);
    }
    if (phase >= 5) {
      // v16: 末期重建的子代 RER 冠 + 高尔基栈（核旁位, 悬停可指认; v19 跟随分离后子细胞中心）
      const rzT = [0, 0, 0, 0, 0, 5.3, 6.1, 7.0][phase] ?? 5.3;
      push('粗面内质网（子代重建）', 'Rough ER', 0, 0.6, -rzT, 2.0);
      push('粗面内质网（子代重建）', 'Rough ER', 0, 0.6, rzT, 2.0);
      push('高尔基体（重建）', 'Golgi apparatus', 1.62, -1.05, -(rzT + 0.35), 1.7);
      push('高尔基体（重建）', 'Golgi apparatus', -1.62, -1.05, rzT + 0.35, 1.7);
    }
    if (phase >= 6) {
      // v30 双子外周 ER 管网锚（与 update 同源轨迹: ±dauZ + scale lerp —— 管身采样点随子细胞重算）
      const tA6 = Math.min(6.9, PHASE_BOUNDS[phase] + 0.4);
      const dz6 = THREE.MathUtils.lerp(3.1, 7.0, ramp(tA6, 5, 7));
      const es6 = THREE.MathUtils.lerp(0.42, 0.72, ramp(tA6, 5.45, 6.9));
      for (const a of erDauA.anchors) {
        push('滑面内质网（子代管网）', 'Smooth ER', a.x * es6, a.y * es6, -dz6 + a.z * es6, 1.0);
      }
      for (const a of erDauB.anchors) {
        push('滑面内质网（子代管网）', 'Smooth ER', a.x * es6, a.y * es6, dz6 + a.z * es6, 1.0);
      }
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
  // v30 QA 时钟写入钩（任意 t 精确定位 —— 相位 chip 只能落在相位边界; 零成本, 仅被显式调用时生效）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as unknown as { __mitoSeekT?: (t: number) => void }).__mitoSeekT = (t: number) => {
      clock.current = Math.max(0, Math.min(7, t));
    };
    return () => {
      delete (window as unknown as { __mitoSeekT?: (t: number) => void }).__mitoSeekT;
    };
  }, []);

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
