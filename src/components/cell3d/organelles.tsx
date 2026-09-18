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
 *      - 线粒体: 长条豆状外膜（2.9:1, 对应 2D 椭圆形态语言）+ v24 横贯斜置波浪板层嵴（片缘贴壁 = 嵴连接）+ 嵴膜 ATP 合酶发光点
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
 *      - 线粒体: v24 横贯斜置波浪板层嵴（旧「沿长轴纵贯管道」解剖学错误退役）+ 更有机的豆状外膜 + 透射加深
 *      - ER: 外周迷宫管网（三通节点 + 膜旁核糖体）—— "ER 遍布胞质"读感
 *      - 高尔基: 7 层扁平囊「叠杯」栈（参数化弯透镜盘 + 花边缘）+ 池间小管 + trans 出芽/TGN + cis COPII 小泡
 *      - 核孔复合体八重对称轮辐花冠; 异染色质双色调密集团块（38 丛 ×8-12 珠）
 *      - 中心粒 9×三联微管桶; 胞质分子拥挤 860+; 脂双层 1300 头; 胞质体积雾填充
 * 科学参照: Alberts MBoC 6th / Karp Cell & Molecular Biology 9th / cellimagelibrary
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { CellBodySpec, Vec3 } from '@/lib/simulation/layout3d';
import { NUCLEUS_FORM, SHAPE_NOISE, nucleusCenter, nucleusInstances, nucleusRadius, nucleusRayExit, shapeCrossRadius, shapeRadius, shapeXExtent, type ShapeKind } from '@/lib/simulation/cell-shape';
import { displaceGeometry, fbm3, fibSphere, hash01, mergeGeoms, sph } from './procedural';
import { glowSpriteTexture, organicNormalMap, speckleNormalMap, stripeNormalMap } from './textures';
import { createTimeUniform, glowMaterial, organelleMaterial, volumeMaterial, REF, type TimeUniform } from './materials';
import { autophagyLevel, AUTOPHAGY_VISIBLE_THRESHOLD } from '@/lib/simulation/autophagy';
import { useLabStore } from '@/store/lab-store';
import { useLang } from '@/lib/i18n';
import { OrganelleHoverLayer, dedupeTargets, type HoverTarget, type HoverGroupKey, type LocateReq } from './hover-labels';

export interface AnatomyLabel {
  pos: Vec3;
  zh: string;
  latin: string;
  /** 条件可见: 'autophagy' = 仅自噬流激活（ULK1 > 阈值）时显示 */
  when?: 'autophagy';
}

export interface CellBodyBuild {
  group: THREE.Group;
  /** 帧驱动; ulk1 = 自噬驱动水平（0-1, 缺省 0 —— 无 ULK1 通路自噬系统静默）;
   *  clip = 全局裁剪平面（剖面模式单一真源 —— v23 示教锚动态吸附） */
  update: (t: number, ulk1?: number, clip?: THREE.Plane | null) => void;
  labels: AnatomyLabel[];
  /** v14 悬停标记目标（全细胞器 —— 含多锚点同名目标, 感应域并集） */
  hover: HoverTarget[];
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

/* ============ 带状扁平囊池几何（v13 —— 参照图逆向重建核心） ============
 * 参照图实测（1228×841 像素分析）:
 *   - ER 囊池 = 细长扁平带状（游程 p50=5px/p90=20px, 长 60-138px, 平行堆叠成组）
 *   - 表面满铺核糖体点彩（高通斑点 47.3% 像素, 平均对比 46.8 —— "粗颗粒砂纸"质感）
 * 旧实现（圆管 ×0.26 压扁）呈"线团"读感; 新实现沿曲线扫掠真扁平椭圆截面:
 *   - 薄轴恒沿径向参考方向（自 center 指向曲线点）→ 囊池宽面贴合核被膜平行叠层
 *   - 宽:厚 ≈ 11:1（参照带状比例）, 端部圆润收口
 * 配套 cisternaFrames() 沿同一坐标系输出核糖体满铺采样帧。 */
export interface CisternaFrame {
  /** 曲线点 */
  p: THREE.Vector3;
  /** 宽面法向（径向, 薄轴方向） */
  n: THREE.Vector3;
  /** 宽度方向（切向正交） */
  b: THREE.Vector3;
}

/** 沿曲线取帧（径向参考系: N=径向投影, B=T×N）——囊池几何与核糖体满铺共用
 *  （v16 导出: 分裂演示复用主细胞同一建模标准 —— RER 囊池冠/高尔基囊堆） */
export function cisternaFrames(
  curve: THREE.Curve<THREE.Vector3>,
  count: number,
  center: THREE.Vector3,
): CisternaFrame[] {
  const frames: CisternaFrame[] = [];
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const ref = new THREE.Vector3();
  for (let i = 0; i <= count; i++) {
    const p = curve.getPoint(i / count);
    T.copy(curve.getTangent(i / count)).normalize();
    // 径向参考（自 center 指向曲线点）投影到垂直于 T 的平面 —— 囊池薄轴恒沿径向
    ref.copy(p).sub(center);
    if (ref.lengthSq() < 1e-8) ref.set(0, 1, 0);
    ref.normalize();
    N.copy(ref).addScaledVector(T, -ref.dot(T));
    if (N.lengthSq() < 1e-6) N.set(0, 1, 0).addScaledVector(T, -T.y);
    if (N.lengthSq() < 1e-6) N.crossVectors(T, new THREE.Vector3(1, 0, 0));
    N.normalize();
    B.crossVectors(T, N).normalize();
    frames.push({ p: p.clone(), n: N.clone(), b: B.clone() });
  }
  return frames;
}

/** 带状扁平囊池几何: 沿曲线扫掠扁平椭圆截面（宽沿 B、薄沿 N 径向）, 端部极点收口
 *  （v16 导出: 分裂演示复用） */
export function flatCisternaGeometry(
  frames: CisternaFrame[],
  width: number,
  thickness: number,
  radial = 12,
): THREE.BufferGeometry {
  const w = width / 2;
  const h = thickness / 2;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segs = frames.length - 1;
  for (let i = 0; i <= segs; i++) {
    const { p, n, b } = frames[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      // 端部收口: 首/末帧截面尺寸收敛（圆润囊池端头）
      const cap = i === 0 || i === segs ? 0.18 : 1;
      const ca = Math.cos(a) * h * cap;
      const sa = Math.sin(a) * w * cap;
      positions.push(p.x + n.x * ca + b.x * sa, p.y + n.y * ca + b.y * sa, p.z + n.z * ca + b.z * sa);
      uvs.push(i / segs, j / radial);
    }
  }
  const cols = radial + 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j;
      const b2 = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b2, b2, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/* ============ 高尔基扁平囊几何（v21 —— 椭圆扁平囊「ER 同构」形态核心） ============
 * 真实高尔基: 4-8 层扁平囊(cisterna)堆叠; 参照图与用户反馈「高尔基应该像内质网, 只是不连着细胞核」——
 * v21 弃「叠杯/弓形/梯骨小管」→ 椭圆扁平囊平行堆叠（与 ER 千层饼同一形态语言, 仅独立悬浮胞质）。
 * 参数化「弯透镜椭圆盘」: 径向 t∈[0,1] × 环向 θ;
 *   - 长半轴 ×aspect 拉伸（x 轴长 / z 轴短 —— 扁长囊剪影）
 *   - 厚度沿径向中央厚缘薄（饼缘圆润: 0.6+0.4·sin(πt) 包络）
 *   - 杯曲 y = cup·t²（微弯 —— cis 平展 → trans 渐弯, 层叠剪影自相似）
 *   - 边缘半径 3+5 谐波调制（有机花边膨大, 每层独立种子 —— 层缘错落如 ER 冠层迷宫）
 *   - 顶/底双面 + 缘带缝合为闭合壳（透射材质下无背面穿帮）
 *  （v16 导出: 分裂演示复用 —— 间期/子代高尔基囊堆同一形态标准） */
export function golgiCisternaGeometry(
  radius: number,
  thickness: number,
  cup: number,
  seed: number,
  ringSeg = 9,
  radial = 48,
  aspect = 1,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const lobes = 3 + Math.floor(hash01(`gl${seed}`) * 2); // 3-4 主瓣
  const lobeAmp = 0.05 + hash01(`ga${seed}`) * 0.04;
  const lobes2 = 5;
  const lobe2Amp = lobeAmp * 0.55;
  const p1 = hash01(`gp${seed}`) * Math.PI * 2;
  const p2 = hash01(`gq${seed}`) * Math.PI * 2;
  const cols = radial + 1;
  for (let i = 0; i <= ringSeg; i++) {
    const t = i / ringSeg;
    // 厚度包络: 中央饱满、缘部 60% 收薄（圆润囊缘）
    const th = thickness * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.12)));
    const dish = cup * t * t;
    for (let j = 0; j <= radial; j++) {
      const thta = (j / radial) * Math.PI * 2;
      // 花边半径调制（随 t 增强 —— 中心圆整、边缘波浪）
      const rr =
        radius * t * (1 + lobeAmp * Math.sin(lobes * thta + p1) * t + lobe2Amp * Math.sin(lobes2 * thta + p2) * t * t);
      const x = Math.cos(thta) * rr * aspect;
      const z = Math.sin(thta) * rr;
      positions.push(x, dish + th / 2, z);
      positions.push(x, dish - th / 2, z);
      uvs.push(t, j / radial, t, j / radial);
    }
  }
  const idx = (i: number, j: number, top: boolean) => 2 * (i * cols + j) + (top ? 0 : 1);
  for (let i = 0; i < ringSeg; i++) {
    for (let j = 0; j < radial; j++) {
      const aT = idx(i, j, true), bT = idx(i, j + 1, true), cT = idx(i + 1, j, true), dT = idx(i + 1, j + 1, true);
      const aB = idx(i, j, false), bB = idx(i, j + 1, false), cB = idx(i + 1, j, false), dB = idx(i + 1, j + 1, false);
      // 顶面（法向 +y）
      indices.push(aT, bT, cT, bT, dT, cT);
      // 底面（法向 -y, 反绕）
      indices.push(aB, cB, bB, bB, cB, dB);
    }
  }
  // 缘带（最外环顶/底缝合, 法向径向朝外）
  for (let j = 0; j < radial; j++) {
    const tT = idx(ringSeg, j, true), tT2 = idx(ringSeg, j + 1, true);
    const tB = idx(ringSeg, j, false), tB2 = idx(ringSeg, j + 1, false);
    indices.push(tT, tT2, tB, tT2, tB2, tB);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/* ============ 核周层叠囊冠几何（v17 —— 参照图「千层饼」核心形态） ============
 * 参照图 VLM+像素双重核实:
 *   - RER = 4-6 层连续大面积平滑弧形膜, 同心圆式层叠包裹核 180°-270°
 *   - 层间紧密平行, 严格顺核被膜球形轮廓弯曲, 局部细微皱褶+分支 → 迷宫读感
 *   - 核糖体如「黄沙」随机满铺胞质面（高密度点彩, 不成行）
 * 旧「窄环带 CatmullRom 扫掠」读感为分散碎片/小椭球（用户反馈根因）——
 * 本工厂改为「贴核球冠壳层」: 每层 = 顺核面轮廓的等距偏移壳（radiusAt 回调注入核面函数,
 * 自动适配各核型椭球/FBM 起伏）:
 *   - 边缘谐波花边逐层错落（4-6 主瓣 + 7 瓣副调制 → 层叠迷宫边缘）
 *   - 径向微皱褶（sin 复合, 幅度 ~0.03 —— 「局部细微皱褶」）
 *   - 高尔基扇区让位（vault: 扇区内层半径外跃至囊堆上空, 平滑过渡）
 *   - 膜面硬钳（clampAt: 任何细胞形态下冠层永不穿质膜）
 *   - 顶/底双面 + 缘带缝合闭合壳（透射材质无背面穿帮）; 冠极自然收口（球冠极点） */
export interface ErLamellaLayer {
  /** 距核面径向偏移（层号 × 层距） */
  offset: number;
  /** 覆盖锥角（自冠轴, rad; 参照 180°-270° ≈ 2.0-2.36） */
  cone: number;
  /** 冠轴（覆盖中心方向, 世界向量; 开口朝向其反方向） */
  axis: THREE.Vector3;
  /** 花边种子（逐层不同 → 层叠错落） */
  seed: number;
}
export interface ErLamellaOpts {
  /** 核面半径函数（dir → 半径, 含核 FBM 起伏; 勿加偏移） */
  radiusAt: (dir: THREE.Vector3) => number;
  /** 核中心（世界坐标） */
  center: THREE.Vector3;
  /** 膜面钳制（dir → 最大允许半径; 返回 null 不钳） */
  clampAt?: (dir: THREE.Vector3) => number | null;
  /** 高尔基让位扇区: 扇区内层半径外跃至囊堆上空 */
  vault?: { dir: THREE.Vector3; ang: number; to: number } | null;
  /** v19 同伴核避让球（双核肝细胞）: 冠层沿射线不进入该球 —— 两冠互不侵犯对方核体;
   *  半径建议 = 同伴核半径×1.06+0.16（含 FBM 起伏余量） */
  avoid?: { center: THREE.Vector3; radius: number } | null;
  /** v19 冠缘缺口（避让扇区内收）: 该方位角附近覆盖锥角收窄 depth rad ——
   *  同伴核/高尔基让位用「缺口」而非外跃气泡（v19 教训: vault 外跃层拱起脱离核面,
   *  正是用户「其中一个内质网没有贴紧细胞核」的根因） */
  cuts?: { dir: THREE.Vector3; w: number; depth: number }[] | null;
  /** 膜厚 */
  thickness?: number;
  /** 极向分段 × 环向分段 */
  latSeg?: number;
  lonSeg?: number;
}
/** 层半径解算（几何与核糖体采样共用同一真源） */
function erLayerRadius(
  d: THREE.Vector3,
  layer: ErLamellaLayer,
  opts: ErLamellaOpts,
  e1: THREE.Vector3,
  e2: THREE.Vector3,
): number {
  const polar = Math.acos(THREE.MathUtils.clamp(d.dot(layer.axis), -1, 1));
  const lon = Math.atan2(d.dot(e2), d.dot(e1));
  // 基础: 核面 + 层偏移
  let eff = layer.offset;
  // 径向微皱褶（sin 复合 —— 参照图「局部细微皱褶」）
  eff += 0.026 * Math.sin(polar * (5 + (layer.seed % 4)) + lon * 3 + layer.seed * 1.7);
  // 高尔基扇区让位（k² 平滑: 扇心完全外跃, 扇缘归位）
  if (opts.vault) {
    const ang = d.angleTo(opts.vault.dir);
    if (ang < opts.vault.ang) {
      const k = 1 - ang / opts.vault.ang;
      eff = eff + (Math.max(eff, opts.vault.to) - eff) * k * k;
    }
  }
  let r = opts.radiusAt(d) + eff;
  // 膜面硬钳
  if (opts.clampAt) {
    const lim = opts.clampAt(d);
    if (lim !== null && r > lim) r = lim;
  }
  // v19 同伴核避让硬钳: 该方向射线与避让球的最近交点即层半径上限（无交 → 不限制）。
  //   双核肝细胞: 旧版两冠深层片在核间隙互相穿插甚至刺入对方核体（用户「双核 ER 有重叠」根因）;
  //   钳后各冠片层以对方核面为界自然贴靠, 下限保护不压入自身核面 0.1 内。
  if (opts.avoid) {
    const ox = opts.avoid.center.x - opts.center.x;
    const oy = opts.avoid.center.y - opts.center.y;
    const oz = opts.avoid.center.z - opts.center.z;
    const b = d.x * ox + d.y * oy + d.z * oz;
    const cc = ox * ox + oy * oy + oz * oz - opts.avoid.radius * opts.avoid.radius;
    const disc = b * b - cc;
    if (disc > 0) {
      const tEnter = b - Math.sqrt(disc);
      if (tEnter > 0 && r > tEnter) {
        r = Math.max(opts.radiusAt(d) + 0.1, tEnter);
      }
    }
  }
  return r;
}
/** v19 冠缘缺口应用（几何/核糖体两个 rimAt 副本共用）: 避让扇区方位角附近覆盖锥角收窄 */
function erRimCuts(
  rim: number,
  lon: number,
  cuts: { dir: THREE.Vector3; w: number; depth: number }[] | null | undefined,
  e1: THREE.Vector3,
  e2: THREE.Vector3,
): number {
  if (!cuts) return rim;
  for (const c of cuts) {
    const cLon = Math.atan2(c.dir.dot(e2), c.dir.dot(e1));
    let dLon = lon - cLon;
    dLon = Math.atan2(Math.sin(dLon), Math.cos(dLon)); // wrap [-π, π]
    const a = Math.abs(dLon);
    if (a < c.w) {
      const kk = Math.cos((a / c.w) * Math.PI * 0.5);
      rim -= c.depth * kk * kk;
    }
  }
  return rim;
}
/** 核周层叠囊冠单层几何（球冠壳: 外/内双面 + 缘带缝合） */
export function erLamellaGeometry(opts: ErLamellaOpts & { layer: ErLamellaLayer }): THREE.BufferGeometry {
  const thickness = opts.thickness ?? 0.085;
  const latSeg = opts.latSeg ?? 24;
  const lonSeg = opts.lonSeg ?? 52;
  const U = opts.layer.axis.clone().normalize();
  let e1 = new THREE.Vector3(0, 1, 0).cross(U);
  if (e1.lengthSq() < 1e-4) e1 = new THREE.Vector3(1, 0, 0).cross(U);
  e1.normalize();
  const e2 = new THREE.Vector3().crossVectors(U, e1).normalize();
  const seed = opts.layer.seed;
  // 边缘花边参数（4-6 主瓣 + 7 瓣副调制, 逐层种子 → 层叠错落迷宫边缘）
  const lobes = 4 + Math.floor(hash01(`erl${seed}`) * 3);
  const lobeAmp = 0.085 + hash01(`era${seed}`) * 0.06;
  const p1 = hash01(`erp${seed}`) * Math.PI * 2;
  const lobes2 = 7;
  const lobe2Amp = lobeAmp * 0.42;
  const p2 = hash01(`erq${seed}`) * Math.PI * 2;
  const band = 0.3; // 花边带宽度（自锥缘向内）
  /** 环向 lon 处的边缘极角轮廓（中心圆整 → 边缘波浪; v19 再叠加冠缘缺口内收） */
  const rimAt = (lon: number): number =>
    erRimCuts(
      opts.layer.cone - band + lobeAmp * (0.58 * Math.sin(lobes * lon + p1) + 0.42 * Math.sin(lobes2 * lon + p2)),
      lon, opts.cuts, e1, e2,
    );
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const d = new THREE.Vector3();
  const cols = lonSeg + 1;
  for (let i = 0; i <= latSeg; i++) {
    const t = i / latSeg;
    // 厚度包络: 内部饱满、缘部收薄（圆润囊缘）
    const th = thickness * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
    for (let j = 0; j <= lonSeg; j++) {
      const lon = (j / lonSeg) * Math.PI * 2;
      const polar = Math.max(0.02, rimAt(lon) * t);
      d.copy(U).multiplyScalar(Math.cos(polar))
        .addScaledVector(e1, Math.cos(lon) * Math.sin(polar))
        .addScaledVector(e2, Math.sin(lon) * Math.sin(polar))
        .normalize();
      const r = erLayerRadius(d, opts.layer, opts, e1, e2);
      positions.push(
        opts.center.x + d.x * r, opts.center.y + d.y * r, opts.center.z + d.z * r,
        opts.center.x + d.x * (r - th), opts.center.y + d.y * (r - th), opts.center.z + d.z * (r - th),
      );
      uvs.push(t, j / lonSeg, t, j / lonSeg);
    }
  }
  const idx = (i: number, j: number, outer: boolean) => 2 * (i * cols + j) + (outer ? 0 : 1);
  for (let i = 0; i < latSeg; i++) {
    for (let j = 0; j < lonSeg; j++) {
      const aO = idx(i, j, true), bO = idx(i, j + 1, true), cO = idx(i + 1, j, true), dO = idx(i + 1, j + 1, true);
      const aI = idx(i, j, false), bI = idx(i, j + 1, false), cI = idx(i + 1, j, false), dI = idx(i + 1, j + 1, false);
      // 外面（法向朝外）
      indices.push(aO, bO, cO, bO, dO, cO);
      // 内面（法向朝内, 反绕）
      indices.push(aI, cI, bI, bI, cI, dI);
    }
  }
  // 缘带（最外环内/外面缝合）
  for (let j = 0; j < lonSeg; j++) {
    const tO = idx(latSeg, j, true), tO2 = idx(latSeg, j + 1, true);
    const tI = idx(latSeg, j, false), tI2 = idx(latSeg, j + 1, false);
    indices.push(tO, tO2, tI, tO2, tI2, tI);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
/** 层叠囊冠核糖体采样（帽面均匀点 × 花边内缘; 与几何共用 erLayerRadius 真源）
 *  参照图: 高密度随机散布（「黄沙」满铺胞质面） */
export function erLamellaRibosomes(
  opts: ErLamellaOpts & { layer: ErLamellaLayer },
  count: number,
  seedTag: string,
): THREE.Vector3[] {
  const U = opts.layer.axis.clone().normalize();
  let e1 = new THREE.Vector3(0, 1, 0).cross(U);
  if (e1.lengthSq() < 1e-4) e1 = new THREE.Vector3(1, 0, 0).cross(U);
  e1.normalize();
  const e2 = new THREE.Vector3().crossVectors(U, e1).normalize();
  const lobes = 4 + Math.floor(hash01(`erl${opts.layer.seed}`) * 3);
  const lobeAmp = 0.085 + hash01(`era${opts.layer.seed}`) * 0.06;
  const p1 = hash01(`erp${opts.layer.seed}`) * Math.PI * 2;
  const lobes2 = 7;
  const lobe2Amp = lobeAmp * 0.42;
  const p2 = hash01(`erq${opts.layer.seed}`) * Math.PI * 2;
  const band = 0.3;
  const rimAt = (lon: number): number =>
    erRimCuts(
      opts.layer.cone - band + lobeAmp * (0.58 * Math.sin(lobes * lon + p1) + 0.42 * Math.sin(lobes2 * lon + p2)),
      lon, opts.cuts, e1, e2,
    );
  const pts: THREE.Vector3[] = [];
  const d = new THREE.Vector3();
  for (let k = 0; k < count; k++) {
    const lon = hash01(`${seedTag}lo${k}`) * Math.PI * 2;
    const rim = Math.max(0.05, rimAt(lon) * 0.965);
    // 帽面均匀采样: cos(polar) ∈ [cos(rim), 1] 均匀
    const cosP = 1 - (1 - Math.cos(rim)) * hash01(`${seedTag}cp${k}`);
    const polar = Math.acos(THREE.MathUtils.clamp(cosP, -1, 1));
    d.copy(U).multiplyScalar(cosP)
      .addScaledVector(e1, Math.cos(lon) * Math.sin(polar))
      .addScaledVector(e2, Math.sin(lon) * Math.sin(polar))
      .normalize();
    const r = erLayerRadius(d, opts.layer, opts, e1, e2) + 0.018;
    pts.push(new THREE.Vector3(
      opts.center.x + d.x * r + (hash01(`${seedTag}jx${k}`) - 0.5) * 0.02,
      opts.center.y + d.y * r + (hash01(`${seedTag}jy${k}`) - 0.5) * 0.02,
      opts.center.z + d.z * r + (hash01(`${seedTag}jz${k}`) - 0.5) * 0.02,
    ));
  }
  return pts;
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

/* ============ 线粒体板层嵴几何（v26 —— 参照图「满腔密集近垂直蛇形板层」严格还原） ============
 * 参照图 VLM 实测双重核实（2024-09 会话: 「板层垂直于长轴、紧密均匀填满整个内部、
 * 轮廓平滑U形/蛇形弯曲、嵴色比外膜深」）:
 *   · 每片板层横贯线粒体横截面（片法向 ≈ 长轴方向）, 沿长轴逐片堆叠;
 *   · v26 倾角 26°-32° → 6°-11°: 参照图嵴「大致垂直」主导读感（v24 的明显斜置是旧像素
 *     分析的过判读）—— 仅保留微量倾斜 + 逐片正负交替 → 有机不失呆板;
 *   · v26 波浪 1.7 → 2.6 节 + 幅 0.06-0.09: 「平滑蛇形弯曲」的连续波纹轮廓（非生硬直线）;
 *   · v26 密度 12 → 16 片 + halfSpan 0.78: 「紧密均匀填满整个内部」;
 *   · 片缘深度包络逐列跟随横截面圆（嵴连接 crista junction —— 内膜延续语义）;
 *   · 片厚 0.07（均匀偏薄）; 胶囊端帽径向钳 → 端部板层顺冠面内收。
 * 剖面语义: 示教线粒体长轴贴切平面 → 切平面沿片堆扫过, 每片以蛇形斜带呈现
 * （切到哪层剖到哪片）; ATP 合酶 F1 颗粒配套重定位到片表面（嵴膜才是氧化磷酸化主场）。 */
export const CRISTA_WAVES = 2.6;
export const CRISTA_PHASE = 0.63 * Math.PI;
export const CRISTA_THICK = 0.07;

export interface CristaLamella {
  /** 沿长轴堆叠位（线粒体局部 Y） */
  yC: number;
  /** 绕深度轴倾角（rad） */
  tilt: number;
  /** 片半长（贴合基质壁） */
  halfLen: number;
  /** 波浪褶皱幅（沿片法向） */
  amp: number;
  /** 逐片波相位微抖（±0.12 —— 与几何同源, ATP 定位复用） */
  jit: number;
  /** 基质胶囊半径（深度包络基准） */
  Rm: number;
}

/** 板层片表面取点（几何构建与 ATP 合酶贴片定位共用同一真源）
 *  u ∈ [-1,1] 片长参数; dn 沿片法向偏移（±厚/2 → 两宽面）; dz 深度比例（±1 → 片缘） */
export function cristaPoint(lm: CristaLamella, u: number, dn: number, dz: number): THREE.Vector3 {
  const cosT = Math.cos(lm.tilt), sinT = Math.sin(lm.tilt);
  const wv = Math.sin(u * Math.PI * CRISTA_WAVES + CRISTA_PHASE + lm.jit) * lm.amp;
  const cx = u * lm.halfLen * cosT - wv * sinT;
  const cy = lm.yC + u * lm.halfLen * sinT + wv * cosT;
  const dEnv = Math.sqrt(Math.max(0.002, lm.Rm * lm.Rm - Math.min(cx * cx, lm.Rm * lm.Rm * 0.96)));
  return new THREE.Vector3(cx - dn * sinT, cy + dn * cosT, dz * dEnv);
}

/** 生成整组板层嵴（单几何合并; 返回片参数表供 ATP 定位） */
export function cristaeLamellaeGeometry(
  seed: number,
  count: number,
  Rm: number,
  cylHalf: number,
  halfSpan: number,
  perf = false,
): { geometry: THREE.BufferGeometry; lamellae: CristaLamella[] } {
  const S = perf ? 9 : 13; // 沿片长采样段
  const P = perf ? 10 : 14; // 截面环点（薄片椭圆 —— 每宽面 P/2 点）
  const lamellae: CristaLamella[] = [];
  const parts: THREE.BufferGeometry[] = [];
  for (let c = 0; c < count; c++) {
    const t01 = count > 1 ? c / (count - 1) : 0.5;
    const lm: CristaLamella = {
      yC: -halfSpan + t01 * 2 * halfSpan,
      // v26: 近垂直主导（6°-11°）+ 逐片正负交替 → 参照图「嵴大致垂直于长轴」的有机微噪
      tilt: (0.105 + hash01(`crt${seed}${c}`) * 0.09) * (c % 2 === 0 ? 1 : -1),
      halfLen: Rm * (0.96 + hash01(`chl${seed}${c}`) * 0.05),
      amp: 0.062 + hash01(`cam${seed}${c}`) * 0.03,
      jit: (hash01(`cph${seed}${c}`) - 0.5) * 0.24,
      Rm,
    };
    lamellae.push(lm);
    const cosT = Math.cos(lm.tilt), sinT = Math.sin(lm.tilt);
    const pos: number[] = [];
    const idx: number[] = [];
    for (let s = 0; s <= S; s++) {
      const u = (s / S) * 2 - 1;
      const wv = Math.sin(u * Math.PI * CRISTA_WAVES + CRISTA_PHASE + lm.jit) * lm.amp;
      const cx = u * lm.halfLen * cosT - wv * sinT;
      const cy = lm.yC + u * lm.halfLen * sinT + wv * cosT;
      // 深度包络: 列 |cx| 处横截面圆内最大 |z|（片缘贴基质壁 —— 嵴连接）
      const dEnv = Math.sqrt(Math.max(0.002, Rm * Rm - Math.min(cx * cx, Rm * Rm * 0.96)));
      for (let p = 0; p < P; p++) {
        const th = (p / P) * Math.PI * 2;
        const dn = Math.cos(th) * CRISTA_THICK * 0.5;
        const dz = Math.sin(th) * dEnv;
        let x = cx - dn * sinT;
        let y = cy + dn * cosT;
        let z = dz;
        // 胶囊端帽径向钳（|y| 超圆柱段 → 按冠球面收进 —— 端部板层顺冠面内收）
        const ay = Math.abs(y);
        if (ay > cylHalf) {
          const dy = ay - cylHalf;
          const cap = Math.sqrt(Math.max(0.0009, Rm * Rm - dy * dy));
          const r = Math.hypot(x, z);
          if (r > cap) { const k = cap / r; x *= k; z *= k; }
        }
        pos.push(x, y, z);
      }
    }
    // 闭合管网格（法向外）
    for (let s = 0; s < S; s++) {
      for (let p = 0; p < P; p++) {
        const a = s * P + p;
        const b = s * P + ((p + 1) % P);
        const cA = (s + 1) * P + p;
        const cB = (s + 1) * P + ((p + 1) % P);
        idx.push(a, b, cA, b, cB, cA);
      }
    }
    // 两端扇形帽（片端圆润收口; col=0 面向 -片长向, col=S 面向 +片长向）
    for (const col of [0, S]) {
      const ci = pos.length / 3;
      let sx = 0, sy = 0, sz = 0;
      for (let p = 0; p < P; p++) {
        sx += pos[(col * P + p) * 3];
        sy += pos[(col * P + p) * 3 + 1];
        sz += pos[(col * P + p) * 3 + 2];
      }
      pos.push(sx / P, sy / P, sz / P);
      for (let p = 0; p < P; p++) {
        const a = col * P + p;
        const b = col * P + ((p + 1) % P);
        if (col === 0) idx.push(ci, b, a);
        else idx.push(ci, a, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    parts.push(geo);
  }
  return { geometry: mergeGeoms(parts.map((g) => ({ geo: g }))), lamellae };
}

/** 方向 dir 处的细胞器表面半径（位移场, 球状基底） */
function surf(dir: THREE.Vector3, R: number, freq: number, amp: number, seed: number): number {
  return R + (fbm3(dir.x * freq, dir.y * freq, dir.z * freq, 3, seed) - 0.5) * 2 * amp;
}

/* ============ 主构建 ============ */

export function buildCellBody(spec: CellBodySpec, tint: string, dim: number, perf = false, cutaway = false): CellBodyBuild {
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
  /* v14 悬停标记目标（"细胞器悬停即现" —— 与 labels 平行累积; 末尾另有 labels 派生基线）
   * 多锚点同名 = 同一细胞器的多实例/多区域感应域（悬停任一处即显示同一标记） */
  const hover: HoverTarget[] = [];

  // 共享贴图（模块缓存, 不随 dispose 释放）
  const memNormal = organicNormalMap({ freq: 7, strength: 2.2, seed: 11, repeat: 4 });
  // v13: 质膜 roughnessMap 退役（透射 mip 模糊的放大器 —— 粗糙度贴图逐像素抬高 rough → 背景细胞器糊化加剧）
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
    // v13 发表级锐度: 透射 mip 模糊公式 lod=log2(size)×roughness×clamp(ior×2-2) ——
    // roughness 0.32×thickness 1.7 → mip~2.7（背景细胞器软糊 4-6px）; 降至 0.07×0.55 → lod~0.5（近零模糊）。
    // 湿润感由 clearcoat/iridescence/sheen 承担（高光形体不受透射模糊影响）
    transmission: transOn ? 0.7 : 0,
    thickness: 0.55,
    roughness: 0.07,
    normalMap: memNormal,
    normalScale: 0.3,
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

  // 脂双层脂头（外叶/内叶, 缓慢对流 = 膜流动性）—— v13: 950 头降密度 + 降不透明度（"面纱"减薄 —— 透射后景更锐）
  const headGeo = track(new THREE.SphereGeometry(0.066, 8, 6));
  const headCount = Math.round(950 * q);
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
  const outerLeaflet = makeLeaflet(0.05, 0.5, '#4a6a7e', ['#8498ac', '#6a8298', '#94a8bc', '#74889e']);
  const innerLeaflet = makeLeaflet(-0.05, 0.38, '#3a4a5a', ['#5a6a7e', '#4a5a6a', '#64748a']);
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
  // v19 用户反馈「指到很多位置都显示质膜」: 质膜 7 个 r=2.8 环带锚点的感应并集覆盖全细胞 ——
  // 大量「空白胞质」区域被质膜抢占, 且与所有内部细胞器错标竞争。彻底移除质膜悬停目标
  // （质膜本身包围全细胞, 悬停语义无信息量; 目录同步不再列出）。

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
    // v19 锚点归位: 糖萼本体就在膜面外侧 0.02R 处（旧标签位 R·1.3 悬在胞外空域 → 指空显标错位）
    labels.push({ pos: sph(R * 1.03, 1.78, 1.1), zh: '糖萼（多糖绒被）', latin: 'Glycocalyx' });
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

  /* ============ 高尔基位形常量（v21 —— 用户反馈「高尔基应该像内质网, 只是不连着细胞核」重建） ============
   * v15-v17 旧形态: 圆盘叠杯 + 弓形新月 + 梯骨小管 —— 侧视读感「长条形」;
   * v21 新形态: 与 ER 千层饼同构的「平行扁平囊堆」—— 椭圆扁平囊 ×6 层平行叠置（ER 视觉语言）,
   *   定位脱离核旁（GOLGI_RADIAL 1.02→2.5 —— 悬浮胞质, 与核被膜/ER 冠均不接触）。
   *   - 定位: 核面外径向 2.5 —— 冠层外缘 (~1.1) 与 cis 面 (~1.6) 间隙 ≥0.5, 「不连核」一目了然
   *   - 方位: 后右上象限（z<0 —— 剖面视图恒可见; 避开核剪影遮挡）
   *   - 堆轴: GOLGI_AXIS 显式世界向量（与默认相机呈 ~55° —— 椭圆囊面与层叠剖面双可读）
   *   - 尺度: 囊长轴 ≈ 核半径 120%; 整组外包络膜面硬钳 —— 永不越膜 */
  const golgiLat = SHAPE === 'columnar' ? 0.85 : 0.35;
  const golgiLon = SHAPE === 'columnar' ? 2.4 : 5.9;
  const GOLGI_DIR = new THREE.Vector3(
    Math.cos(golgiLat) * Math.cos(golgiLon),
    Math.sin(golgiLat),
    Math.cos(golgiLat) * Math.sin(golgiLon),
  ).normalize();
  const GOLGI_SCALE = (SHAPE === 'columnar' ? 1.05 : N / 4.1) * (R < 9.2 ? 0.92 : 1); // 囊径随核径缩放, 小细胞再收敛
  const GOLGI_CIST_N = 6; // 扁平囊层数（v21: 5→6 —— 与 ER 冠层数同量级, 层叠剪影更饱满）
  const GOLGI_DISK_R = 2.45 * GOLGI_SCALE; // 囊长半轴（cis 最宽; 长轴≈核半径 120%）
  const GOLGI_ASPECT = 1.78; // 椭圆纵横比（长半轴/短半轴 —— 扁长囊如参照图 ER 片层语言）
  const GOLGI_SEMI_B = GOLGI_DISK_R / GOLGI_ASPECT; // 囊短半轴（几何工厂入参 —— aspect 拉伸后回到长半轴）
  const GOLGI_STEP = 0.30 * GOLGI_SCALE; // 囊层距（v21: 0.28→0.30 —— 层间隙投影 ~12px, 平行层叠直读）
  const GOLGI_STACK_H = GOLGI_CIST_N * GOLGI_STEP; // 囊堆总高
  const GOLGI_RADIAL = 2.5 * GOLGI_SCALE; // v21 堆中心距核被膜径向距离（1.02→2.5 —— 脱离核旁, 悬浮胞质）
  /** 堆轴世界向量: 自径向倾 ~23° 朝相机侧 —— 默认相机 [0,10,29] 下囊盘呈 ~55° 经典 3/4 视角 */
  const GOLGI_AXIS = new THREE.Vector3(0.7, 0.2, -0.69).normalize();
  /** 盘面自旋（绕堆轴 —— 花边瓣朝向变化, 打破轴对称） */
  const GOLGI_SPIN = 0.8;

  const nucMat = mat({
    // v12 参照图: 核被膜熏衣草灰紫族（实测 105,100,111）—— 高饱和玫瑰退役
    color: REF.nucEnv,
    transmission: transOn ? 0.52 : 0,
    thickness: 0.75,
    // v13 发表级锐度: 0.3→0.14 —— 染色质/核仁透过双层核被膜锐利透读
    roughness: 0.14,
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
    }
    // v19 逐核悬停锚点（双核肝细胞的次核此前无任何核区锚点 —— 指到次核只能命中 ER/双核错标）:
    //   核被膜（顶面贴面）/ 核仁（本体位）/ 异染色质（边集带）各核独立感应; 半径随核尺寸缩放。
    // v21 核区锚点群: 大核屏幕足迹 ≫ 64px 捕获钳 —— 单锚留洞（指向核面中部常无响应）;
    //   前半球 5 锚覆盖顶/前左/前右/正前/底前, 与核仁中锥互补 → 核面任意指向均可命中。
    {
      const neDirs: [number, number, number][] = [
        [(primary ? 0.18 : -0.18), 1, (primary ? 0.32 : -0.32)],
        [0.95, 0.25, (primary ? 0.2 : -0.2)],
        [-0.85, 0.15, (primary ? 0.35 : -0.35)],
        [(primary ? 0.1 : -0.1), -0.15, 1],
        [(primary ? -0.3 : 0.3), -0.8, (primary ? 0.45 : -0.45)],
      ];
      for (const [x, y, z] of neDirs) {
        const neP = nucPointK(new THREE.Vector3(x, y, z).normalize(), 0.05);
        hover.push({ pos: { x: neP.x, y: neP.y, z: neP.z }, r: Nn * 0.6, zh: '核被膜（双层）', latin: 'Nuclear envelope', group: 'nuclear' });
      }
      const hcDir = new THREE.Vector3(Math.cos(-1.0 + (primary ? 0 : 1.3)) * Math.cos(2.2), Math.sin(-1.0), Math.cos(-1.0 + (primary ? 0 : 1.3)) * Math.sin(2.2));
      const hcP = nucPointK(hcDir, -0.15);
      hover.push({ pos: { x: hcP.x, y: hcP.y, z: hcP.z }, r: Nn * 0.42, zh: '异染色质（边集）', latin: 'Heterochromatin', group: 'nuclear' });
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
    // v19 核仁锚点归位: 旧标签位在核仁外飘 0.6-1.0（指者未见核仁却显示核仁/反之）; 逐核锚在本体上
    if (instNucleoli.length > 0) {
      const n0 = instNucleoli[0].position;
      hover.push({ pos: { x: n0.x, y: n0.y, z: n0.z }, r: Nn * 0.42, zh: '核仁', latin: 'Nucleolus', group: 'nuclear' });
    }
  }
  // v8 双核教学标注（仅多核时添加 —— 真实肝板约 25% 肝细胞为双核）
  // v19 锚点归位: 旧位悬在双核上方 N·0.95 空域; 新位 = 两核之间赤道面（指认「双核」特征未体）
  if (nucleiInst.length > 1) {
    const mid = {
      x: (nucleiInst[0].center.x + nucleiInst[1].center.x) / 2,
      y: (nucleiInst[0].center.y + nucleiInst[1].center.y) / 2,
      z: (nucleiInst[0].center.z + nucleiInst[1].center.z) / 2,
    };
    hover.push({ pos: mid, r: N * 0.55, zh: '双核 ×2（约 25% 肝细胞）', latin: 'Binucleate (~25%)', group: 'nuclear' });
  }

  /* ================= 剖面示教锚体系（v23 —— 用户反馈「细胞器中心没有放在 50% depth 上」根治） =================
   * v22 缺陷复盘: 旧示教锚按「纯轴向平面」(z=0 / y=0 / x=0)钉静态位置 —— 但真实切平面法向是倾斜的
   *   （SECTION_ORIENTS: front=(0,-0.22,-1) 等），50% depth 时平面为过原点的斜面 n·p=0，
   *   静态钉位的线粒体中心不在其上；且深度滑块拖动时平面扫掠（constant = Rn − depth·2Rn），
   *   示教锚完全静止 —— 用户拖到任何深度，细胞器中心都脱离切平面。
   * v23 方案: 示教个体每帧读 gl.clippingPlanes[0]（SectionClipController 单一真源），把中心「动态吸附」
   *   到当前切平面（home 沿法向投影），配套核避让 / 膜内钳 / 长轴对齐面内 / 悬停锚引用同步。
   *   平滑 lerp 追随 —— 拖深度时示教细胞器「贴着切面滑动」，切到哪层剖到哪层（逐层切片教学语义）。 */
  interface ShowcaseAnchor {
    obj: THREE.Object3D;
    /** 非剖面模式驻位（构建时 insidePos 采样） */
    home: THREE.Vector3;
    /** 非剖面模式朝向 */
    homeQ: THREE.Quaternion;
    /** 长轴个体（线粒体）：长轴投影到切面内 → 纵贯剖开; 球体（溶酶体/过氧化物酶体）false */
    longAxis: boolean;
    /** 长轴半长（端点膜内钳; 球体 0） */
    halfLen: number;
    /** 核避让安全半径（本体半宽 + 裕量） */
    avoidR: number;
    /** 同步改写的引用（悬停锤点/标注锚 —— 吸附后跟随本体, 悬停所指即所在） */
    syncRefs: { pos: { x: number; y: number; z: number } }[];
  }
  const showcaseAnchors: ShowcaseAnchor[] = [];

  /* ================= 线粒体（双膜 + 板层嵴 + ATP 合酶） ================= */
  const mitos: { obj: THREE.Group; baseY: number; phase: number; pinned?: boolean }[] = [];
  const mitoCount = perf ? Math.max(4, Math.round(spec.mitoCount * 0.6)) : spec.mitoCount;
  // v26 嵴密度: 12 → 16 片（perf 9）—— 参照图「紧密均匀填满整个内部」
  const cristaeN = perf ? 9 : 16;
  // 外膜: 总长 2.3 / 半径 0.4 ≈ 2.9:1 长条豆状（对应 2D Mitochondrion 椭圆 rx54/ry22 ≈ 2.45:1）
  // v10: FBM 幅度 0.05 + 频率 3.1 —— 有机豆状轮廓更明显（近似电镜下不规则线粒体外形）
  const mitoOuterGeo = track(displaceGeometry(new THREE.CapsuleGeometry(0.4, 1.5, 12, 28), 3.1, 0.05, 17));
  const mitoOuterMat = mat({
    // v12 参照图: 线粒体暖古铜族（实测 100,74,69）—— 高饱和青绿退役
    color: REF.mitoOuter,
    // v13 发表级锐度: transmission 0.58 + roughness 0.28 → 嵴透读 mip~2.4 糊化; 降至 0.09 → 嵴板层锐利透读
    transmission: transOn ? 0.58 : 0,
    thickness: 0.38,
    roughness: 0.09,
    normalMap: orgNormal,
    normalScale: 0.5,
    clearcoat: 0.35,
    emissive: '#3a2a24',
    emissiveIntensity: 0.3,
    opacity: transOn ? 1 : 0.45,
    flow: { color: '#8a6a58', strength: 0.22, scale: 1.7, speed: 0.13, rim: 0.34 },
  });
  const mitoMatrixMat = mat({ color: REF.mitoMatrix, emissive: '#241a16', emissiveIntensity: 0.22, opacity: 0.24 });
  // v25 内膜（inner boundary membrane）: 双膜三明治读感 —— 外膜 0.4 / 膜间隙 ~0.035 / 内膜 0.365;
  //   科学: 嵴是内膜向内折叠 —— 嵴板层片缘（Rm 0.345）恰贴内膜内面, 「嵴从内膜折出」解剖学直读;
  //   剖面切缘双环 + 膜间隙暗带 = 电镜双层膜标准剪影。与外膜同 FBM 种子 → 有机轮廓相互跟踪。
  const mitoInnerGeo = track(displaceGeometry(new THREE.CapsuleGeometry(0.365, 1.46, 12, 24), 3.1, 0.05, 17));
  const mitoInnerMat = mat({
    color: REF.mitoCristae,
    emissive: '#6a4a3e',
    emissiveIntensity: 0.4,
    roughness: 0.3,
    opacity: 0.55,
    sheen: 0.5,
    sheenColor: '#a8826e',
    flow: { color: '#8a6a58', strength: 0.18, scale: 2.0, speed: 0.14, rim: 0.3 },
  });
  // v26 嵴材质: 参照图「嵴色比外膜深（深红棕）+ 内外层次对比」—— 加深加亮发射（透射外壳下蛇形板层直读）
  const cristaeMat = mat({
    color: REF.mitoCristae,
    emissive: '#9a5a42',
    emissiveIntensity: 0.72,
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
  /* v22→v23 剖面示教锚: 前 3 颗线粒体为示教个体 —— home 方位互呈 120° 级分离（切平面内投影
   * 不拥挤），避开核体（insidePos 避核不变）与高尔基象限（后右上 z<0）; 运行时由 update 的
   * 吸附循环钉到当前切平面（深度/方位任变，中心恒贴面 —— v23 动态吸附替代 v22 静态钉位）。 */
  const SHOWCASE_DIRS: THREE.Vector3[] = [
    new THREE.Vector3(0.83, -0.55, 0).normalize(), // ① 右下区（默认正剖直读）
    new THREE.Vector3(0.62, -0.04, -0.78).normalize(), // ② 右后区
    new THREE.Vector3(0.03, -0.86, 0.51).normalize(), // ③ 下方区
  ];
  const SHOWCASE_YAW = [0.22, 0.3, 0.15]; // 长轴沿 X 的微有机偏航（别于呆板平行）
  for (let i = 0; i < mitoCount; i++) {
    const g = new THREE.Group();
    // 外膜（透射）
    const outer = new THREE.Mesh(mitoOuterGeo, mitoOuterMat);
    outer.scale.set(1, 1, 0.82);
    // v22 剖面窗口化: 切面盘（renderOrder 96）后方的外膜剖开壳体绘制于盘后 ——
    // 剖面视图下线粒体以真 3D 剖开形态呈现（替代旧版 2D 贴图; 同高尔基 v15 手法）
    outer.renderOrder = cutaway ? 100 : 46;
    g.add(outer);
    // 基质（随外膜缩小, 与 2.3 长度匹配）
    const matrix = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.35, 1.38, 6, 16)), mitoMatrixMat);
    matrix.scale.set(1, 1, 0.82);
    matrix.renderOrder = cutaway ? 99.6 : 45; // v22 剖面窗口化（先于外膜壳绘制）
    g.add(matrix);
    // v25 内膜（inner boundary membrane）: 外膜与基质之间的独立壳体 —— 双膜 + 膜间隙;
    //   嵴板层从内膜折出（片缘 Rm 0.345 贴内膜内面 0.365）—— 教科书级剖面剪影
    const inner = new THREE.Mesh(mitoInnerGeo, mitoInnerMat);
    inner.scale.set(1, 1, 0.82);
    inner.renderOrder = cutaway ? 100.2 : 46.5; // v22 体系: 外膜壳 100 → 内膜 100.2 → 嵴 100.4
    g.add(inner);
    // v26 板层嵴: 满腔密集近垂直蛇形板层堆（16 片 perf 9, halfSpan 0.78 —— 参照图
    // 「紧密均匀填满整个内部」; 片缘贴基质壁 = 嵴连接; 胶囊端帽钳 → 端部板层顺冠面内收）
    const { geometry: cristaeGeo, lamellae } = cristaeLamellaeGeometry(i * 31, cristaeN, 0.345, 0.69, 0.78, perf);
    const cristae = new THREE.Mesh(track(cristaeGeo), cristaeMat);
    cristae.scale.set(1, 1, 0.82);
    cristae.renderOrder = cutaway ? 100.4 : 47; // v22 剖面窗口化（嵴板层剖开直读）
    g.add(cristae);
    // 嵴膜 ATP 合酶（F1 颗粒, 发光）—— v24 重定位: 贴板层表面分布（嵴膜才是
    // 氧化磷酸化主场; 旧「基质内随机漂浮」与膜系统无关联读感退役）+ 内膜内缘余量
    const atpGeo = track(new THREE.SphereGeometry(0.032, 5, 5));
    const atpCount = lamellae.length * (perf ? 1 : 2) + 2;
    const atps = new THREE.InstancedMesh(atpGeo, atpMat, atpCount);
    {
      const mm = new THREE.Matrix4();
      let k = 0;
      for (let c = 0; c < lamellae.length && k < atpCount - 2; c++) {
        const per = perf ? 1 : 2;
        for (let j = 0; j < per; j++, k++) {
          const lm = lamellae[c];
          // 片长向左右分置 + 交替贴正/反面（跨片表面均匀散布）
          const u = (j === 0 ? -1 : 1) * (0.3 + hash01(`atpu${i}${c}${j}`) * 0.45);
          const side = (c + j) % 2 === 0 ? 1 : -1;
          const pt = cristaPoint(lm, u, side * (CRISTA_THICK * 0.5 + 0.014), (hash01(`atpz${i}${c}${j}`) - 0.5) * 1.3);
          const sc = 0.8 + hash01(`atp${i}${k}`) * 0.6;
          mm.makeScale(sc, sc, sc);
          mm.setPosition(pt.x, pt.y, pt.z);
          atps.setMatrixAt(k, mm);
        }
      }
      // 余量 2 颗贴内膜内缘（boundary membrane 区亦有小密度分布 —— 两栖真实性）
      for (; k < atpCount; k++) {
        const ang = hash01(`atpb${i}${k}`) * Math.PI * 2;
        const yy = (hash01(`atpby${i}${k}`) - 0.5) * 1.3;
        mm.makeScale(0.9, 0.9, 0.9);
        mm.setPosition(Math.cos(ang) * 0.3, yy, Math.sin(ang) * 0.26);
        atps.setMatrixAt(k, mm);
      }
      atps.instanceMatrix.needsUpdate = true;
      atps.renderOrder = cutaway ? 100.6 : 47; // v22 剖面窗口化（嵴膜 F1 颗粒）
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
      mtdna.renderOrder = cutaway ? 100.5 : 47; // v22 剖面窗口化（mtDNA 核样体）
      g.add(mtdna);
    }
    // v6 体内形状化采样: 长轴端自动延展、窄轴处自动收缩, 并避开细胞核
    // v22: 前 3 颗用示教锚方向（钉在 50% 切平面内）; 其余保持随机散布
    const showcase = i < SHOWCASE_DIRS.length ? SHOWCASE_DIRS[i] : null;
    const mDir = showcase ?? new THREE.Vector3(
      Math.cos((hash01(`m${i}`, 5) - 0.5) * 2.1) * Math.cos(hash01(`m${i}`, 7) * Math.PI * 2),
      Math.sin((hash01(`m${i}`, 3) - 0.5) * 2.1),
      Math.cos((hash01(`m${i}`, 5) - 0.5) * 2.1) * Math.sin(hash01(`m${i}`, 7) * Math.PI * 2),
    ).normalize();
    const p = insidePos(mDir, showcase ? 0.14 : 0.16 + hash01(`m${i}`) * 0.62, 1.15, 0.6);
    g.position.set(p.x, p.y, p.z);
    // 取向: 长轴对齐 + 确定性抖动; 圆形细胞保持全随机
    if (showcase) {
      // v23 示教位: 长轴沿 X 落在切平面内（rotation.z = π/2）+ 微偏航 —— 剖面纵贯剖开;
      //   吸附循环运行时将长轴实时投影到当前切平面（倾斜法向下的精确对齐）
      g.rotation.set(0.05, SHOWCASE_YAW[i], Math.PI / 2 + 0.05);
    } else if (MITO_ALIGN === 'x') {
      g.rotation.set(hash01(`m${i}`, 9) * 0.24, hash01(`m${i}`, 11) * 2.1, Math.PI / 2 + (hash01(`m${i}`, 13) - 0.5) * 0.5);
    } else if (MITO_ALIGN === 'y') {
      g.rotation.set((hash01(`m${i}`, 9) - 0.5) * 0.4, hash01(`m${i}`, 11) * 2.1, (hash01(`m${i}`, 13) - 0.5) * 0.4);
    } else {
      g.rotation.set(hash01(`m${i}`, 9) * 2.1, hash01(`m${i}`, 11) * 2.1, hash01(`m${i}`, 13) * 2.1);
    }
    // 每颗随机长度 0.85~1.2×（update 动画仅改 position.y/rotation.y, 不覆盖 scale）
    g.scale.set(1, 0.85 + hash01(`ml${i}`) * 0.35, 1);
    group.add(g);
    mitos.push({ obj: g, baseY: p.y, phase: hash01(`m${i}`, 17) * Math.PI * 2, pinned: !!showcase });
    // v14 悬停锚点: 每颗线粒体各自感应（悬停任一颗即现「线粒体」标记）
    // v16: r 2.0→1.7 —— 线粒体本体半长约 1.15, 1.7 已宽松; 收敛后与 ER/高尔基锚点重叠区不再互扰
    // v23: 保留引用 —— 示教颗吸附切平面时锤点同步跟随（悬停所指即所在）
    const mitoHov: HoverTarget = { pos: { x: p.x, y: p.y, z: p.z }, r: 1.7, zh: '线粒体（板层嵴）', latin: 'Mitochondrion', group: 'energy' };
    hover.push(mitoHov);
    // v23 首颗（示教）的标注锚也持引用 —— 吸附时同步跟随（避免标注悬空在旧位）
    const m0Label = i === 0 ? { pos: { x: p.x, y: p.y, z: p.z }, zh: '线粒体（板层嵴）', latin: 'Mitochondrion' } : null;
    if (m0Label) labels.push(m0Label);
    if (showcase) {
      showcaseAnchors.push({
        obj: g,
        home: g.position.clone(),
        homeQ: g.quaternion.clone(),
        longAxis: true,
        halfLen: 1.04 * g.scale.y, // 胶囊半长（半径 0.4 + 圆柱半长 0.69）× 长度缩放
        avoidR: 0.62,
        syncRefs: m0Label ? [mitoHov, m0Label] : [mitoHov],
      });
    }
  }
  // v23: 线粒体标注锚统一由首颗（示教颗）承担 —— m0Label 持引用, 吸附切平面时同步跟随

  /* ================= 粗面内质网（v17 参照图严格还原: 千层饼核周层叠囊冠 + 「黄沙」核糖体） ================= */
  // 核糖体: 大小亚基哑铃形（60S 大亚基 + 40S 小亚基 —— 电镜双亚基剪影）
  const ribosomeGeo = track(
    mergeGeoms([
      { geo: track(new THREE.SphereGeometry(0.062, 6, 5)), matrix: new THREE.Matrix4().makeTranslation(0, 0.028, 0) },
      { geo: track(new THREE.SphereGeometry(0.043, 5, 4)), matrix: new THREE.Matrix4().makeTranslation(0, -0.05, 0) },
    ]),
  );
  // v17 参照图「黄沙」: 亮金琥珀（实测 207,189,164 族）—— 大颗粒高发射, 点彩远读清晰
  const ribosomeMat = track(new THREE.MeshStandardMaterial({ color: '#c9a54e', emissive: '#a8842e', emissiveIntensity: 1.0 * dim, roughness: 0.5, metalness: 0.05 }));
  {
    // v17 参照图严格还原（用户反馈「RER 不应像小椭球, 应是围绕核的膜结构」—— VLM+像素双重核实）:
    // RER = 4-7 层连续大面积平滑弧形膜「千层饼」同心层叠包裹核 180°-270°, 层间紧密平行,
    // 顺核轮廓弯曲 + 局部细微皱褶; 核糖体「黄沙」随机满铺胞质面。
    // 旧「窄环带扫掠 + 外周囊池堆」读感为分散碎片/小椭球 —— 整体退役, 换 erLamellaGeometry 球冠壳层体系。
    // v18 用户反馈「肝细胞的内质网没有按照双核来做」: 肝细胞双核 → 逐核实例循环 ——
    //   每核各自完整的核周 RER 冠（外核膜延续的独立内膜系统, 双核肝细胞超微结构特征）。
    // v19 用户反馈「双核 ER 有重叠, 且其中一个没有贴紧核」双根因根治:
    //   根因①「重叠」: 双核间距仅 0.48 单位, 两冠深层片各自外伸 1.09 → 核间隙互穿甚至刺入对方核体
    //     → avoid 同伴核排除球硬钳（层片以对方核面为界）+ 朝同伴方位角冠缘缺口 + 冠轴左右镜像外倾
    //     （旧两冠轴均指向彼此 → 加剧中侧交叠; 镜像后开口朝前下偏外侧, 双冠呈「背靠背」分布）。
    //   根因②「不贴紧」: 主核冠 vault 外跃层在高尔基扇区把片层拱到核面外 2.8 单位 —— 拱形气泡
    //     恰从主核伸向次核方向（读感=一段脱离核体的自由 ER）→ 双核时 vault 退役, 改用冠缘「缺口」
    //     让位（覆盖内收而非半径外跃; 单核细胞保留 vault —— v17 已验证构图）。
    const multi = nucleiInst.length > 1;
    const parts: { geo: THREE.BufferGeometry }[] = [];
    const allRiboPts: THREE.Vector3[] = [];
    const erAnchors: { p: THREE.Vector3; big: boolean; label: boolean }[] = [];
    nucleiInst.forEach((nucInst) => {
      const primary = nucInst.tag === 'A';
      const seedTag = primary ? 'er' : 'erB';
      // 层数随分泌活性类型化: 肝细胞(分泌之王) 7 层 → 淋巴/神经元 4-5 层（双核时次核略减 1 层）
      const layers = Math.max(3, perf ? 3 : Math.min(7, spec.erSheets + 3 - (primary || !multi ? 0 : 1)));
      const nucCK2 = new THREE.Vector3(nucInst.center.x, nucInst.center.y, nucInst.center.z);
      const Nn2 = N * nucInst.scale;
      const seed2 = primary ? 7 : 23; // 与该核被膜同一 FBM 种子 —— 冠层严格贴合同一核面起伏
      /** 该核面半径（与核被膜/核孔同源真源; 不含偏移） */
      const surf2 = (dir: THREE.Vector3): number => {
        const d = dir.clone().normalize();
        return nucleusRadius(d, SHAPE, Nn2) + (fbm3(d.x * NUC_FREQ, d.y * NUC_FREQ, d.z * NUC_FREQ, 3, seed2) - 0.5) * 2 * nucAmp;
      };
      // 冠轴: 单核 → 后上原版（开口朝前下, v17 已验证构图 + vault 让位）;
      // v19 双核 → 左右镜像外倾（左核轴偏 -x / 右核轴偏 +x）—— 双冠「背靠背」互让核间隙,
      //   开口仍朝前下（相机正对双核裸面, 参照图构图保留）。
      const crownAxis = !multi
        ? new THREE.Vector3(0.16, 0.3, -0.94).normalize()
        : new THREE.Vector3(primary ? -0.36 : 0.36, 0.28, -0.89).normalize();
      // v19 同伴核实例（双核避让数据源）
      const sibling = multi ? nucleiInst[primary ? 1 : 0] : null;
      const erOpts: ErLamellaOpts = {
        radiusAt: surf2,
        center: nucCK2,
        clampAt: (d) => cellSurf(d, R, SHAPE, -0.6),
        // v21 高尔基让位全面退役: 囊堆已脱离核旁（径向 2.5 > 冠层外缘 1.1）—— 冠层不再需要
        //   vault 外跃 / 冠缘缺口让位; 单核与双核统一满冠（ER 千层饼更完整）。
        vault: null,
        // v19 同伴核排除球: 半径 = 同伴核径×1.06 + 0.16（FBM 起伏余量）—— 深层片不再刺入对方核体
        avoid: sibling
          ? {
              center: new THREE.Vector3(sibling.center.x, sibling.center.y, sibling.center.z),
              radius: N * sibling.scale * 1.06 + 0.16,
            }
          : null,
        // v19 冠缘缺口: 朝同伴方位角内收（核间隙片层不堆叠; 高尔基缺口 v21 退役 —— 囊堆已远离冠缘）
        cuts: sibling
          ? [
              {
                dir: new THREE.Vector3(
                  sibling.center.x - nucCK2.x,
                  sibling.center.y - nucCK2.y,
                  sibling.center.z - nucCK2.z,
                ).normalize(),
                w: 1.05,
                depth: 0.62,
              },
            ]
          : null,
      };
      const layerDefs: ErLamellaLayer[] = [];
      for (let L = 0; L < layers; L++) {
        // 逐层冠轴微错位（±0.1 rad —— 层缘不齐 = 参照图「层叠迷宫」边缘读感）
        const axis = crownAxis.clone();
        axis.applyAxisAngle(new THREE.Vector3(0, 1, 0), (hash01(`${seedTag}ax${L}`) - 0.5) * 0.22);
        axis.applyAxisAngle(new THREE.Vector3(1, 0, 0), (hash01(`${seedTag}ay${L}`) - 0.5) * 0.14);
        const layer: ErLamellaLayer = {
          offset: 0.16 + L * 0.155,
          cone: 2.02 + L * 0.055, // 外层覆盖更广（向细胞质深处延伸）
          axis: axis.normalize(),
          seed: 5 + L * 13 + (primary ? 0 : 60), // 次核层花边相位独立
        };
        layerDefs.push(layer);
        parts.push({ geo: track(erLamellaGeometry({ ...erOpts, layer, thickness: 0.085, latSeg: perf ? 14 : 24, lonSeg: perf ? 30 : multi ? 46 : 52 })) });
        // 「黄沙」核糖体: 每层随机满铺（双核均摊 —— 总实例量与单核满配持平; perf 减半）
        const riboN = perf ? 110 : multi ? 210 : 300;
        allRiboPts.push(...erLamellaRibosomes({ ...erOpts, layer }, riboN, `${seedTag}L${L}`));
      }
      // 层间连接小管（ER 是单一连续膜系统 —— 少量可见「分支」连接卖连续性语义）
      for (let c = 0; c < (perf ? 3 : 7); c++) {
        const L = c % Math.max(1, layers - 1);
        const layerA = layerDefs[L];
        const layerB = layerDefs[Math.min(layers - 1, L + 1)];
        const axis = layerA.axis;
        const e1 = new THREE.Vector3(0, 1, 0).cross(axis).normalize();
        const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();
        const lon = hash01(`${seedTag}cl${c}`) * Math.PI * 2;
        const polar = 0.5 + hash01(`${seedTag}cp${c}`) * 1.0;
        const d = axis.clone().multiplyScalar(Math.cos(polar))
          .addScaledVector(e1, Math.cos(lon) * Math.sin(polar))
          .addScaledVector(e2, Math.sin(lon) * Math.sin(polar))
          .normalize();
        const rA = erLayerRadius(d, layerA, erOpts, e1, e2);
        const rB = erLayerRadius(d, layerB, erOpts, e1, e2);
        const a = nucCK2.clone().addScaledVector(d, rA - 0.04);
        const b = nucCK2.clone().addScaledVector(d, rB - 0.04);
        const mid = a.clone().lerp(b, 0.5).add(
          new THREE.Vector3(hash01(`${seedTag}cm${c}`) - 0.5, hash01(`${seedTag}cm${c}`, 3) - 0.5, hash01(`${seedTag}cm${c}`, 5) - 0.5).normalize().multiplyScalar(0.12),
        );
        parts.push({ geo: track(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 8, 0.055, 6)) });
      }
      // 每冠悬停锚点: 后左/顶/后右可见缘（剖面视图恒可见象限; 主核顶锚承载标注）
      const anchorAt = (lat: number, lon: number, ofs: number) => {
        const dd = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
        const rr = Math.max(0.1, surf2(dd) + ofs);
        return new THREE.Vector3(nucCK2.x + dd.x * rr, nucCK2.y + dd.y * rr, nucCK2.z + dd.z * rr);
      };
      erAnchors.push(
        { p: anchorAt(0.62, 3.6, 0.72), big: true, label: primary },
        { p: anchorAt(0.05, 4.1, 0.62), big: false, label: false },
        { p: anchorAt(-0.3, 2.6, 0.62), big: false, label: false },
      );
    });
    const er = new THREE.Mesh(track(mergeGeoms(parts)), mat({
      // v17 参照图严格还原: 薰衣草紫膜系（像素实测 199,189,218 亮带族）—— 与核同色系 = 内膜系统同源科学叙事
      color: REF.erSheet,
      transmission: transOn ? 0.34 : 0,
      thickness: 0.42,
      roughness: 0.24,
      normalMap: orgNormal,
      normalScale: 0.4,
      opacity: transOn ? 1 : 0.72,
      emissive: '#76709a',
      emissiveIntensity: 0.5,
      clearcoat: 0.55,
      clearcoatRoughness: 0.16,
      sheen: 0.58,
      sheenColor: '#d4cce8',
      flow: { color: '#9c96b8', strength: 0.18, scale: 0.8, speed: 0.07, rim: 0.2 },
    }));
    /* v17 剖面窗口: 千层饼冠是本场景可见性的主角 —— 剖切视图下后侧冠层以真实 3D 层叠形态呈现于
     * 细胞质剖面窗口（renderOrder 97.4 > cytoDisc 96/cytoRing 97, 深度测试开启）;
     * 直接位于核后方之冠层被核剖面盘（98, 97% 不透明）遮挡 = 教科书式正确遮挡关系。
     * 完整视图恢复常规 46/47 序列（透膜观察）。 */
    er.renderOrder = cutaway ? 97.4 : 46;
    group.add(er);
    // 「黄沙」核糖体（单 InstancedMesh, 大颗粒高发射 —— 参照图点彩远读不「发虚」）
    const ribos = new THREE.InstancedMesh(ribosomeGeo, ribosomeMat, allRiboPts.length);
    {
      const mm = new THREE.Matrix4();
      const qq = new THREE.Quaternion();
      const eu = new THREE.Euler();
      allRiboPts.forEach((p, i) => {
        const s = 1.15 + hash01(`rb${i}`) * 0.6;
        // 亚基分裂面随机朝向（哑铃形核糖体取向自然化）
        eu.set(hash01(`rbe${i}`) * Math.PI, hash01(`rbe${i}`, 3) * Math.PI * 2, (hash01(`rbe${i}`, 5) - 0.5) * 0.8);
        qq.setFromEuler(eu);
        mm.compose(new THREE.Vector3(p.x, p.y, p.z), qq, new THREE.Vector3(s, s, s));
        ribos.setMatrixAt(i, mm);
      });
      ribos.instanceMatrix.needsUpdate = true;
      ribos.renderOrder = cutaway ? 97.6 : 47;
    }
    group.add(ribos);
    // 悬停锚点落位（每核冠 3 处 —— 双核肝细胞共 6 处; 顶锚 r 2.1/缘锚 1.9）
    for (const { p, big, label } of erAnchors) {
      if (label) {
        // v19 锚点归位: 标注锚即冠顶可见缘木位（旧 +0.75 上飘 → 指认错位）
        labels.push({ pos: { x: p.x, y: p.y, z: p.z }, zh: '粗面内质网（核糖体）', latin: 'Rough ER' });
      }
      hover.push({ pos: { x: p.x, y: p.y, z: p.z }, r: big ? 2.1 : 1.9, zh: '粗面内质网（核糖体）', latin: 'Rough ER', group: 'endomembrane' });
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
      if (ch === Math.floor(chains * 0.4)) {
        hover.push({ pos: { x: start.x, y: start.y, z: start.z }, r: 2.2, zh: '游离多聚核糖体', latin: 'Polysomes', group: 'cytoskeleton' });
      }
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
    // v27 外周管网悬停锚点（用户「管状上面有黄色小球的是什么」—— 该结构 = 外周粗面内质网
    //   （管 + 膜旁核糖体）, 旧版完全无锚点不可指认。每条管取 t 0.3/0.65 两点沿管分布,
    //   r 1.2 小锚评分优势 —— 指向管身/金珠串时胜出; 与核周 RER 冠独立命名（教学区分度:
    //   核周千层饼冠 vs 胞质外周管网 —— 同一连续膜系统的两个区室域））
    for (let pi = 0; pi < periphCurves.length; pi++) {
      for (const tt of [0.3, 0.65]) {
        const ap = periphCurves[pi].getPoint(tt);
        hover.push({ pos: { x: ap.x, y: ap.y, z: ap.z }, r: 1.2, zh: '粗面内质网·外周管网', latin: 'Peripheral rough ER', group: 'endomembrane' });
      }
    }
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
      // v17 参照图: SER 薰衣草亮族（erSheetHi）
      color: REF.erSheetHi,
      emissive: '#5c5878',
      emissiveIntensity: 0.18,
      opacity: 0.45,
      roughness: 0.4,
    }));
    ser.renderOrder = cutaway ? 97.1 : 45; // v22 剖面窗口化（SER 管网剖开直读）
    group.add(ser);
    // v21 SER 管网多锚承担目录与感应（旧首管 label 派生锚退役）
    {
      const serAnchors: THREE.Vector3[] = [];
      for (let i = 0; i < serN; i += 3) {
        const mid = new THREE.CatmullRomCurve3([
          insidePos(new THREE.Vector3(
            Math.cos((hash01(`se${i}`, 3) - 0.5) * 2.2) * Math.cos(hash01(`se${i}`, 5) * Math.PI * 2),
            Math.sin((hash01(`se${i}`, 3) - 0.5) * 2.2),
            Math.cos((hash01(`se${i}`, 3) - 0.5) * 2.2) * Math.sin(hash01(`se${i}`, 5) * Math.PI * 2),
          ).normalize(), 0.28 + hash01(`se${i}`) * 0.52, 0.12, 0.35),
          serFirst,
        ]).getPoint(0.5);
        serAnchors.push(mid);
      }
      for (const a of serAnchors) {
        hover.push({ pos: { x: a.x, y: a.y, z: a.z }, r: 0.85, zh: '滑面内质网', latin: 'Smooth ER', group: 'endomembrane' });
      }
    }
  }

  /* ================= 高尔基体（v21 重建: 椭圆扁平囊「ER 同构」平行堆 + 脱核悬浮 + 出芽囊泡） ================= */
  {
    const g = new THREE.Group();
    const cisCol = new THREE.Color(REF.golgiCis);
    const transCol = new THREE.Color(REF.golgiTrans);
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4; color?: THREE.Color }[] = [];
    // 非线性极性插值: 饱和藕荷(cis) → 亮粉紫(trans) —— 顶点色逐层梯度（v17 参照图淡藕荷紫族）
    const POLARITY_MIX = [0, 0.14, 0.34, 0.56, 0.8, 1];
    /* v21 平行扁平囊堆（「像内质网, 只是不连着细胞核」）:
     *   椭圆囊 ×6 平行叠置（无弓形偏移/无梯骨小管 —— ER 千层饼同构语言）;
     *   逐层微错位旋转（±0.09 rad 层缘错落如 ER 冠层迷宫）+ 微杯曲（cis 平展 → trans 渐弯）。 */
    for (let i = 0; i < GOLGI_CIST_N; i++) {
      const col = cisCol.clone().lerp(transCol, POLARITY_MIX[i] ?? 1);
      // 囊径逐层微收窄(cis 最宽 5%) + 杯曲微加深 —— 平行堆叠中保留极性梯度剪影
      // （入参 = 短半轴; 工厂内 aspect 拉伸 x → 长半轴 = GOLGI_SEMI_B·(1-i·0.045)·GOLGI_ASPECT）
      const rad = GOLGI_SEMI_B * (1 - i * 0.045);
      const cup = (0.05 + i * 0.028) * GOLGI_SCALE;
      const geo = track(golgiCisternaGeometry(rad, 0.09 * GOLGI_SCALE, cup, i * 7 + 3, perf ? 7 : 9, perf ? 32 : 48, GOLGI_ASPECT));
      const m = new THREE.Matrix4()
        .makeRotationY(i * 0.09)
        .setPosition(0, i * GOLGI_STEP - GOLGI_STACK_H * 0.5, 0); // 平行堆叠（堆中心置于局部原点; cis 底/trans 顶）
      parts.push({ geo, matrix: m, color: col });
    }
    const golgi = new THREE.Mesh(track(mergeGeoms(parts)), mat({
      color: '#ffffff',
      vertexColors: true,
      transmission: transOn ? 0.12 : 0,
      thickness: 0.4,
      // v17 参照图严格还原: 淡藕荷紫半透明（VLM 实测 #D8BFD8 族）—— 与 ER 蓝紫同系不同调的内膜家族
      // 透射 0.26→0.12: 层间不糊化（叠杯层次直读）; 发射 0.55→0.68 亮带恒可辨
      roughness: 0.26,
      opacity: transOn ? 1 : 0.66,
      clearcoat: 0.6,
      emissive: '#7a7296',
      emissiveIntensity: 0.68,
      sheen: 0.6,
      sheenColor: '#c8c0dc',
    }));
    /* v15 剖面窗口可见性核心: 默认剖切视图下, 切平面后方的 3D 结构会被 94% 不透明的剖面盘
     * （section-view cytoDisc/nucDisc, renderOrder 96/98, 不写深度）覆盖 —— 后半侧细胞器仅余 ~6% 透读。
     * 高尔基改在盘之后绘制（renderOrder 100/101, 深度测试开启 —— 盘不写深度放行, 真实前景遮挡仍生效）
     * → 剖面视图中高尔基以其真实 3D 形态呈现于「核旁窗口」; 完整视图（剖切关闭）恢复常规序列 46/47。 */
    golgi.renderOrder = cutaway ? 100 : 46;
    g.add(golgi);
    // trans 面出芽囊泡（反面网 TGN —— 衣被蛋白斑点, 大且多）
    const budGeo = track(new THREE.SphereGeometry(1, 12, 10));
    const budMat = mat({
      color: REF.golgiTrans,
      emissive: '#8078a0',
      emissiveIntensity: 0.45,
      opacity: 0.72,
      roughness: 0.35,
      normalMap: coatNormal,
      normalScale: 0.9,
      clearcoat: 0.3,
    });
    const budCount = perf ? 7 : 14;
    const buds = new THREE.InstancedMesh(budGeo, budMat, budCount);
    {
      const mm = new THREE.Matrix4();
      // v21 椭圆囊: trans 面出芽沿椭圆轮廓（rr = 短半轴向径; x 经 aspect 拉伸至长轴）
      const transDiskR = GOLGI_SEMI_B * (1 - (GOLGI_CIST_N - 1) * 0.045);
      for (let v = 0; v < budCount; v++) {
        const r = (0.14 + hash01(`gv${v}`) * 0.07) * GOLGI_SCALE;
        const ang = 0.4 + v * (Math.PI * 2 / budCount) + hash01(`gva${v}`) * 0.5;
        const rr = transDiskR * (0.55 + hash01(`gv${v}`, 3) * 0.55);
        mm.makeScale(r, r, r);
        mm.setPosition(
          Math.cos(ang) * rr * GOLGI_ASPECT,
          GOLGI_STACK_H * 0.5 + (0.08 + hash01(`gv${v}`, 5) * 0.3) * GOLGI_SCALE,
          Math.sin(ang) * rr,
        );
        buds.setMatrixAt(v, mm);
      }
      buds.instanceMatrix.needsUpdate = true;
      buds.renderOrder = cutaway ? 101 : 47;
    }
    g.add(buds);
    // 顺面入芽小泡（ER → 高尔基 COPII 运输小泡 —— cis 面, 小而贴底）
    const cisBudGeo = track(new THREE.SphereGeometry(1, 10, 8));
    const cisBudMat = mat({
      color: REF.golgiCis,
      emissive: '#645e80',
      emissiveIntensity: 0.42,
      opacity: 0.72,
      roughness: 0.35,
      normalMap: coatNormal,
      normalScale: 0.8,
      clearcoat: 0.3,
    });
    const cisBudCount = perf ? 4 : 7;
    const cisBuds = new THREE.InstancedMesh(cisBudGeo, cisBudMat, cisBudCount);
    {
      const mm = new THREE.Matrix4();
      for (let v = 0; v < cisBudCount; v++) {
        const r = (0.1 + hash01(`cgv${v}`) * 0.045) * GOLGI_SCALE;
        const ang = 1.1 + v * (Math.PI * 2 / cisBudCount);
        const rr = GOLGI_SEMI_B * (0.5 + hash01(`cgv${v}`, 3) * 0.42);
        mm.makeScale(r, r, r);
        mm.setPosition(
          Math.cos(ang) * rr * GOLGI_ASPECT,
          -GOLGI_STACK_H * 0.5 - (0.1 + hash01(`cgv${v}`, 5) * 0.16) * GOLGI_SCALE,
          Math.sin(ang) * rr,
        );
        cisBuds.setMatrixAt(v, mm);
      }
      cisBuds.instanceMatrix.needsUpdate = true;
      cisBuds.renderOrder = cutaway ? 101 : 47;
    }
    g.add(cisBuds);
    /* v21 位姿（用户反馈「高尔基应该像内质网, 只是不连着细胞核」）:
     *  - 定位: nucPoint(GOLGI_DIR, GOLGI_RADIAL=2.5) —— 脱离核旁悬浮胞质（cis 面距核被膜/ER 冠 ≥ 0.5 间隙,
     *    「不连着细胞核」一眼可辨; 与旧核旁位（1.02 贴核）形成本质区别）
     *  - 朝向: 堆轴 GOLGI_AXIS（囊盘 ~55° 经典 3/4 视角 —— 椭圆囊面与层叠剖面双可读）
     *  - 防溢出: 整组外包络（长半轴×1.08 + 半堆高）膜面内 0.55 硬钳 */
    const p = nucPoint(GOLGI_DIR, GOLGI_RADIAL);
    {
      const pv = new THREE.Vector3(p.x, p.y, p.z);
      /* v21 外包络: 堆轴近径向（GOLGI_AXIS 与 GOLGI_DIR 夹角 ~23°）—— 径向占用 = 半堆高 + 短半轴分量
       * + 长轴切向投影余量; 取保守值（半堆高 + 短半轴 0.55 + 0.3 冗余）而非长半轴全量（旧算法会把
       * 切向延伸误算成径向 → 囊堆被无谓拉近, 破坏「脱离核旁」语义）。 */
      const need = GOLGI_STACK_H * 0.5 + GOLGI_SEMI_B * 0.55 + 0.3;
      const pl = pv.length();
      if (pl > 1e-6) {
        const lim = cellSurf(pv.clone().normalize(), R, SHAPE, -0.55) - need;
        if (pl > lim && lim > N * 0.8) pv.setLength(lim);
      }
      p.x = pv.x; p.y = pv.y; p.z = pv.z;
    }
    g.position.set(p.x, p.y, p.z);
    /* v21 朝向: 局部 +y(trans) 对齐显式堆轴 GOLGI_AXIS + 绕轴自旋 —— 显式世界向量直接锁定最终轴。 */
    const qAlign = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), GOLGI_AXIS);
    const qSpin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), GOLGI_SPIN);
    g.quaternion.copy(qAlign).multiply(qSpin);
    group.add(g);
    labels.push({
      pos: { x: p.x, y: p.y, z: p.z },
      zh: '高尔基体（顺→反）', latin: 'Golgi apparatus',
    });
    /* v21 悬停锚点群: 扁长囊堆屏幕足迹大（长轴 ~4.9 单位 ≈ 180px）远超 64px 捕获钳 ——
     *   单中心锚留洞; 沿堆轴三锚（cis 中 / trans）+ 长轴两端两锚 → 任意指向囊堆均可命中。 */
    {
      const axisV = GOLGI_AXIS.clone();
      const midP = new THREE.Vector3(p.x, p.y, p.z);
      const cisP = midP.clone().addScaledVector(axisV, -GOLGI_STACK_H * 0.34);
      const transP = midP.clone().addScaledVector(axisV, GOLGI_STACK_H * 0.34);
      // 长轴方向: 堆轴 × 世界 up 叉乘（局部 x 在世界中的近似方向）
      const longV = new THREE.Vector3().crossVectors(axisV, new THREE.Vector3(0, 1, 0)).normalize();
      if (longV.lengthSq() < 0.01) longV.set(1, 0, 0);
      const endA = midP.clone().addScaledVector(longV, GOLGI_DISK_R * 0.62);
      const endB = midP.clone().addScaledVector(longV, -GOLGI_DISK_R * 0.62);
      for (const [ap, ar] of [[midP, 1.5], [cisP, 1.35], [transP, 1.35], [endA, 1.2], [endB, 1.2]] as [THREE.Vector3, number][]) {
        hover.push({ pos: { x: ap.x, y: ap.y, z: ap.z }, r: ar, zh: '高尔基体（顺→反）', latin: 'Golgi apparatus', group: 'endomembrane' });
      }
    }
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
      // v21 逐颗悬停锚（隔颗采样 —— 小囊泡密集, 全量会挤压其他细胞器仲裁）
      if (i % 2 === 0) {
        hover.push({ pos: { x: p.x, y: p.y, z: p.z }, r: 0.46, zh: '运输囊泡', latin: 'Transport vesicle', group: 'endomembrane' });
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = cutaway ? 97.2 : 46; // v22 剖面窗口化（运输囊泡逐颗剖开）
    group.add(inst);
    // v21 逐颗悬停锚承担目录与感应（旧首颗 label 派生锚 r=1.7 退役）
    void v0;
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
        bodies.renderOrder = cutaway ? 97.8 : 46; // v22 剖面窗口化（溶酶体酸性体剖开直读）
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
        spks.renderOrder = cutaway ? 97.9 : 47; // v22 剖面窗口化（腔内水解酶颗粒直读）
      }
      group.add(bodies, spks);
      // v21 逐颗悬停锚（用户反馈「细胞器只能选中线粒体」—— 群体细胞器旧版仅首颗有锚,
      //   指到第 2..N 颗时无响应; 本体半径 0.38×s → 锚半径随尺寸紧贴合, 小半径亦降低评分中的尺寸惩罚。
      //   旧首颗 label 派生锚（r=1.8 大域）退役 —— 目录与悬停均由逐颗锚承担（同名多锚 = 同一目录条目）。
      for (let i = 0; i < lysoN; i++) {
        hover.push({ pos: { x: centers[i].x, y: centers[i].y, z: centers[i].z }, r: 0.5 * scales[i] + 0.3, zh: '溶酶体（pH≈4.5）', latin: 'Lysosome', group: 'endomembrane' });
      }
      /* v23 溶酶体剖面示教个体（cutaway-only, 独立建模不入 InstancedMesh —— 颗粒子组随本体整体迁移）:
       * 一颗大溶酶体动态吸附当前切平面 → 剖面窗口半球剖开, 腔内酸性水解酶颗粒群直读。
       * 常规视图不添加（零回归）; home 方位避开线粒体三示教位与高尔基象限。 */
      if (cutaway) {
        const lg = new THREE.Group();
        const bodyGeo = track(new THREE.SphereGeometry(0.36, 18, 14));
        const bodyMat = mat({
          color: REF.lyso,
          transmission: transOn ? 0.22 : 0,
          thickness: 0.28,
          emissive: REF.lysoHi,
          emissiveIntensity: 0.3,
          roughness: 0.34,
          clearcoat: 0.4,
          normalMap: coatNormal,
          normalScale: 0.5,
          opacity: 0.9,
          flow: { color: REF.lysoHi, strength: 0.14, scale: 1.2, speed: 0.08, rim: 0.24 },
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.renderOrder = 97.8; // 与群体溶酶体同窗口化序列
        lg.add(body);
        // 腔内水解酶颗粒（酸性磷酸酶/组织蛋白酶 —— 26 颗散布腔内）
        const grainGeo = track(new THREE.SphereGeometry(0.05, 6, 5));
        const grainMat = track(new THREE.MeshStandardMaterial({
          color: REF.lysoGranule,
          emissive: '#6a4426',
          emissiveIntensity: 0.34 * dim,
          transparent: true,
          opacity: 0.7 * dim,
          depthWrite: false,
        }));
        const grains = new THREE.InstancedMesh(grainGeo, grainMat, 26);
        {
          const gm = new THREE.Matrix4();
          const gv = new THREE.Vector3();
          for (let k = 0; k < 26; k++) {
            gv.set(hash01(`lsg${k}`) - 0.5, hash01(`lsg${k}`, 3) - 0.5, hash01(`lsg${k}`, 5) - 0.5).normalize();
            gv.multiplyScalar(0.08 + hash01(`lsgr${k}`) * 0.2);
            gm.makeTranslation(gv.x, gv.y, gv.z);
            grains.setMatrixAt(k, gm);
          }
          grains.instanceMatrix.needsUpdate = true;
          grains.renderOrder = 97.9;
        }
        lg.add(grains);
        const lp = insidePos(new THREE.Vector3(-0.68, -0.42, 0.6).normalize(), 0.3, 0.55, 0.5);
        lg.position.copy(lp);
        group.add(lg);
        const lysoHov: HoverTarget = { pos: { x: lp.x, y: lp.y, z: lp.z }, r: 0.68, zh: '溶酶体（pH≈4.5）', latin: 'Lysosome', group: 'endomembrane' };
        hover.push(lysoHov);
        showcaseAnchors.push({
          obj: lg,
          home: lg.position.clone(),
          homeQ: lg.quaternion.clone(),
          longAxis: false,
          halfLen: 0,
          avoidR: 0.5,
          syncRefs: [lysoHov],
        });
      }
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
      // v19 锚点归位: 自噬体本体位（旧 1.26×+0.6 外飘）
      labels.push({ pos: { x: auPos.x, y: auPos.y, z: auPos.z }, zh: '自噬体（ULK1 启动）', latin: 'Autophagosome', when: 'autophagy' });
    }
  }

  /* ================= 过氧化物酶体（过氧化氢酶晶体核心） ================= */
  {
    const pxN = perf ? Math.max(1, Math.round(spec.peroxisomeCount * 0.6)) : spec.peroxisomeCount;
    if (pxN > 0) {
      // v24 有机轮廓: 完美球体 → 位移球（与溶酶体同语言 —— 电镜下过氧化物酶体外形微不规则）
      const bodyGeo = track(displacedSphere(0.26, 2, 3.2, 0.03, 211));
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
        bodies.renderOrder = cutaway ? 97.4 : 46; // v22 剖面窗口化（过氧化物酶体剖开 + 晶核直读）
        cores.instanceMatrix.needsUpdate = true;
        cores.renderOrder = cutaway ? 97.5 : 47;
      }
      group.add(bodies, cores);
      // v21 逐颗悬停锚（用户标注「剖面的线粒体」实为过氧化物酶体 —— 椭圆体+致密晶核与线粒体近似,
      //   旧版仅首颗有锚 → 指到即无响应; 本体 0.42×s → 锚半径紧贴合。旧首颗 label 派生锚退役。）
      for (let i = 0; i < pxN; i++) {
        hover.push({ pos: { x: pxCenters[i].x, y: pxCenters[i].y, z: pxCenters[i].z }, r: 0.52, zh: '过氧化物酶体', latin: 'Peroxisome', group: 'endomembrane' });
      }
      /* v23 过氧化物酶体剖面示教个体（cutaway-only）: 一颗大过氧化物酶体动态吸附切平面 →
       * 半球剖开直读尿酸氧化酶晶核（电镜致密芯）+ 基质; 与溶酶体示教个体同理。 */
      if (cutaway) {
        const pg = new THREE.Group();
        // v24 有机轮廓（与群体过氧化物酶体同语言）
        const pBodyGeo = track(displacedSphere(0.32, 2, 3.0, 0.035, 212));
        const pBodyMat = mat({
          color: REF.peroxi,
          transmission: transOn ? 0.28 : 0,
          thickness: 0.3,
          emissive: '#33404e',
          emissiveIntensity: 0.2,
          roughness: 0.32,
          opacity: transOn ? 1 : 0.55,
          clearcoat: 0.35,
        });
        const pBody = new THREE.Mesh(pBodyGeo, pBodyMat);
        pBody.renderOrder = 97.4;
        pg.add(pBody);
        // 尿酸氧化酶晶核（致密芯 —— 剖面直读的主角）
        const pCoreGeo = track(new THREE.OctahedronGeometry(0.13, 0));
        const pCoreMat = track(new THREE.MeshStandardMaterial({
          color: REF.peroxiCore,
          emissive: '#7a6420',
          emissiveIntensity: 0.4 * dim,
          transparent: true,
          opacity: 0.85 * dim,
        }));
        const pCore = new THREE.Mesh(pCoreGeo, pCoreMat);
        pCore.rotation.set(0.5, 0.8, 0);
        pCore.renderOrder = 97.5;
        pg.add(pCore);
        const pp = insidePos(new THREE.Vector3(-0.64, -0.52, -0.57).normalize(), 0.34, 0.5, 0.5);
        pg.position.copy(pp);
        group.add(pg);
        const pHov: HoverTarget = { pos: { x: pp.x, y: pp.y, z: pp.z }, r: 0.6, zh: '过氧化物酶体', latin: 'Peroxisome', group: 'endomembrane' };
        hover.push(pHov);
        showcaseAnchors.push({
          obj: pg,
          home: pg.position.clone(),
          homeQ: pg.quaternion.clone(),
          longAxis: false,
          halfLen: 0,
          avoidR: 0.46,
          syncRefs: [pHov],
        });
      }
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
      d.position.set(p.x, p.y, p.z);
      d.renderOrder = cutaway ? 97.6 : 46; // v22 剖面窗口化（脂滴剖开）
      group.add(d);
      // v21 逐颗悬停锚（旧版仅首颗 label 派生锚 —— 指到其余脂滴无响应; 旧 label 退役）
      hover.push({ pos: { x: p.x, y: p.y, z: p.z }, r: r + 0.34, zh: '脂滴（中性脂）', latin: 'Lipid droplet', group: 'endomembrane' });
      if (i === 0) ld0 = p;
    }
    void ld0; // v21: 仅供调试断点定位（目录由逐颗锚承担）
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
    // v14 中心体标注 + 悬停锚点（旧版无标注 —— 微管标注不能代表 MTOC 本体）
    // v19 锚点归位: 标注位 = 中心粒对本体位（旧 +0.6 上飘）
    labels.push({ pos: { x: c.x, y: c.y, z: c.z }, zh: '中心体（中心粒对）', latin: 'Centrosome' });
    hover.push({ pos: { x: c.x, y: c.y, z: c.z }, r: 1.7, zh: '中心体（中心粒对）', latin: 'Centrosome', group: 'cytoskeleton' });
    // v26 微管阵列全面升级（参照图: 「粗壮绿色管道、放射状贯穿胞质、最显眼骨架成分」）:
    //   密度 ×2.2+6（旧 8-14 根在暗背景下不可读 —— 用户「细胞骨架没有体现」根因）、
    //   管径 0.03 → 0.042、发射 0.24 → 0.46、不透明度 0.5 → 0.62 —— sage 绿主骨架直读
    const parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
    let mtMid = new THREE.Vector3();
    const mtTotal = Math.round(spec.microtubules * (perf ? 1.2 : 2.2)) + (perf ? 4 : 6);
    // v27 微管悬停锚点采样根（方位均匀隔取 —— 全阵列各象限均有感应域）
    const mtAnchorEvery = Math.max(3, Math.floor(mtTotal / 6));
    const mtAnchorPts: THREE.Vector3[] = [];
    for (let i = 0; i < mtTotal; i++) {
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
      if (i === 0) curve.getPoint(0.42, mtMid); // v19: 微管锚点取首根微管中段真实管位（旧 c·2.5 悬空）
      // v27 每采样根取中段/远段两点（远段近膜区 —— 贯穿胞质的管道全程可指认）
      if (i % mtAnchorEvery === 0) {
        mtAnchorPts.push(curve.getPoint(0.45, new THREE.Vector3()), curve.getPoint(0.78, new THREE.Vector3()));
      }
      parts.push({ geo: track(new THREE.TubeGeometry(curve, 26, 0.042, 8)) });
    }
    const mts = new THREE.Mesh(track(mergeGeoms(parts)), mat({
      // v26 参照图: 微管 sage 绿族（旧石板蓝灰在暗背景下不可见）
      color: REF.microtubule,
      emissive: '#3f5c4a',
      emissiveIntensity: 0.46,
      opacity: 0.62,
      roughness: 0.45,
      normalMap: mtStripe,
      normalScale: 0.55,
      sheen: 0.4,
      sheenColor: REF.sheen,
    }));
    mts.renderOrder = 44;
    group.add(mts);
    // v27 微管悬停锚点落位（旧版仅静态标注无感应 —— 用户「细胞骨架没有悬停效果」根治:
    //   微管是主视图最显眼的骨架成分（粗壮绿色管道贯穿胞质）, 每采样根 2 锚沿管分布;
    //   r 1.15 小于线粒体 1.7/ER 2.1 —— 重叠区评分优势（0.22·r 惩罚项）指向管身时微管胜出）
    for (const ap of mtAnchorPts) {
      hover.push({ pos: { x: ap.x, y: ap.y, z: ap.z }, r: 1.15, zh: '微管（中心体放射）', latin: 'Microtubules', group: 'cytoskeleton' });
    }

    // 中间丝（核周波形蛋白笼 —— 核被膜到质膜的力学支架, 与微管正交的第三套骨架）
    // v6: 严格自成形核面拉到类型化膜面（旧球形插值在窄轴穿膜、长轴悬空）
    // v26: 亮度提升（0.38 → 0.46, 石板族亮化）—— 参照图灰白细丝可辨读
    {
      const ifN = perf ? 8 : 14;
      const ifParts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[] = [];
      let ifMid = new THREE.Vector3();
      // v27 中间丝悬停锚点（旧版仅静态标注 —— 每 4 丝取中段, 核周→膜面支架全程可指认）
      const ifAnchorPts: THREE.Vector3[] = [];
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
          if (k === 3 && i % 4 === 0) {
            ifMid.copy(p); // 首丝中段（i=0）承载静态标注
            ifAnchorPts.push(p.clone());
          }
        }
        ifParts.push({ geo: track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.02, 5)) });
      }
      const ifs = new THREE.Mesh(track(mergeGeoms(ifParts)), mat({
        // v26 参照图: 中间丝石板族亮化
        color: REF.interFil,
        emissive: '#525e70',
        emissiveIntensity: 0.26,
        opacity: 0.46,
        roughness: 0.5,
        sheen: 0.6,
        sheenColor: REF.sheen,
      }));
      ifs.renderOrder = 44;
      group.add(ifs);
      // v19 锚点归位: 中间丝首丝中段本体位（旧 1.15× 外飘）
      labels.push({ pos: { x: ifMid.x, y: ifMid.y, z: ifMid.z }, zh: '中间丝（波形蛋白）', latin: 'Intermediate filaments' });
      // v27 悬停锚点（r 1.05 小锚 —— 评分优势; 与微管同属 cytoskeleton 组目录可发现）
      for (const ip of ifAnchorPts) {
        hover.push({ pos: { x: ip.x, y: ip.y, z: ip.z }, r: 1.05, zh: '中间丝（波形蛋白）', latin: 'Intermediate filaments', group: 'cytoskeleton' });
      }
    }

    // v19 锚点归位: 首根微管中段真实管位（旧 c·2.5-0.5 悬空在胞质空域）
    labels.push({ pos: { x: mtMid.x, y: mtMid.y, z: mtMid.z }, zh: '微管（中心体放射）', latin: 'Microtubules' });

    // 皮层肌动蛋白网 —— v6: 贴类型化膜面内 0.45-0.8（旧球形 R-0.5 会在窄轴穿出膜外）
    // v26 参照图: 橙黄细丝（REF.actin 琥珀化）+ 密度 96q+16 + 亮度提升 —— 暗背景下可读
    const actGeo = track(new THREE.CapsuleGeometry(0.02, 0.9, 3, 6));
    const actMat = mat({ color: REF.actin, emissive: '#8a6a3e', emissiveIntensity: 0.34, opacity: 0.55, roughness: 0.4, sheen: 0.45, sheenColor: '#d8b88a' });
    const actCount = Math.round(96 * q) + 16;
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
    // v14 悬停锚点: 皮层肌动蛋白（膜面内网 —— 无静态标注, 悬停发现）
    // v27 对侧补锚: 单锚仅覆盖一个象限的膜面网 —— 环绕膜面 3 处方位分布
    {
      const aDir = new THREE.Vector3(0.42, 0.18, 0.89).normalize();
      const ar = cellSurf(aDir, R, SHAPE, -0.62);
      hover.push({ pos: { x: aDir.x * ar, y: aDir.y * ar, z: aDir.z * ar }, r: 2.3, zh: '皮层肌动蛋白网', latin: 'Cortical actin', group: 'cytoskeleton' });
      const aDir2 = new THREE.Vector3(-0.55, -0.25, -0.8).normalize();
      const ar2 = cellSurf(aDir2, R, SHAPE, -0.62);
      hover.push({ pos: { x: aDir2.x * ar2, y: aDir2.y * ar2, z: aDir2.z * ar2 }, r: 2.1, zh: '皮层肌动蛋白网', latin: 'Cortical actin', group: 'cytoskeleton' });
      const aDir3 = new THREE.Vector3(-0.3, 0.86, 0.4).normalize();
      const ar3 = cellSurf(aDir3, R, SHAPE, -0.62);
      hover.push({ pos: { x: aDir3.x * ar3, y: aDir3.y * ar3, z: aDir3.z * ar3 }, r: 2.1, zh: '皮层肌动蛋白网', latin: 'Cortical actin', group: 'cytoskeleton' });
    }

    // v26 胞质肌动蛋白网（参照图: 「橙黄细丝数量非常多、密度很高, 缠绕细胞器、
    // 与微管交叉的致密背景网络」—— 填补「细胞内部空旷」的真实感缺口）:
    //   少数粗束（0.028 —— 应力纤维样锚定读感）+ 多数细丝（0.013）— CatmullRom 波浪轨迹
    //   穿插于细胞器之间（insidePos 避核 + 形状化采样）, 琥珀微光
    {
      const netN = perf ? 14 : 26;
      const netParts: { geo: THREE.BufferGeometry }[] = [];
      const SEGS = 4;
      const wD = new THREE.Vector3();
      const wPrev = new THREE.Vector3(
        Math.cos(hash01('an0', 3) * Math.PI * 2) * 0.8,
        (hash01('an0', 5) - 0.5) * 1.2,
        Math.sin(hash01('an0', 3) * Math.PI * 2) * 0.8,
      ).normalize();
      for (let i = 0; i < netN; i++) {
        wPrev.set(
          Math.cos(hash01(`an${i}`, 3) * Math.PI * 2),
          (hash01(`an${i}`, 5) - 0.5) * 1.4,
          Math.sin(hash01(`an${i}`, 3) * Math.PI * 2),
        ).normalize();
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= SEGS; k++) {
          // 蛇形抖动方向（相邻段转折 ≤ 65° —— 柔韧缠络读感）
          wD.set(
            wPrev.x + (hash01(`aw${i}${k}`) - 0.5) * 1.1,
            wPrev.y + (hash01(`aw${i}${k}`, 3) - 0.5) * 0.9,
            wPrev.z + (hash01(`aw${i}${k}`, 5) - 0.5) * 1.1,
          ).normalize();
          wPrev.copy(wD);
          const rad = 0.2 + hash01(`ar${i}${k}`) * 0.58;
          const p = insidePos(wD, rad, i < 7 ? 0.05 : 0.04, 0.3);
          pts.push(new THREE.Vector3(p.x, p.y, p.z));
        }
        const thick = i < 7 ? 0.028 : 0.013;
        netParts.push({ geo: track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.6), 18, thick, 5)) });
      }
      const actNet = new THREE.Mesh(track(mergeGeoms(netParts)), mat({
        color: REF.actin,
        emissive: '#a8783e',
        emissiveIntensity: 0.4,
        opacity: 0.5,
        roughness: 0.42,
        sheen: 0.5,
        sheenColor: '#d8b88a',
      }));
      actNet.renderOrder = 44;
      group.add(actNet);
      // 悬停锚点: 代表束中段本体位（目录可发现性）+ v27 方位补锚 ×2（单锚覆盖不足 —— 网遍全胞质）
      {
        const anp = insidePos(new THREE.Vector3(0.55, -0.3, 0.78).normalize(), 0.5, 0.06, 0.3);
        hover.push({ pos: { x: anp.x, y: anp.y, z: anp.z }, r: 2.1, zh: '胞质肌动蛋白网', latin: 'Cytoplasmic actin network', group: 'cytoskeleton' });
        const anp2 = insidePos(new THREE.Vector3(-0.72, 0.35, 0.6).normalize(), 0.55, 0.06, 0.3);
        hover.push({ pos: { x: anp2.x, y: anp2.y, z: anp2.z }, r: 1.9, zh: '胞质肌动蛋白网', latin: 'Cytoplasmic actin network', group: 'cytoskeleton' });
        const anp3 = insidePos(new THREE.Vector3(0.1, -0.75, -0.65).normalize(), 0.6, 0.06, 0.3);
        hover.push({ pos: { x: anp3.x, y: anp3.y, z: anp3.z }, r: 1.9, zh: '胞质肌动蛋白网', latin: 'Cytoplasmic actin network', group: 'cytoskeleton' });
      }
    }
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
      // v21 逐玫瑰体悬停锚（每 rosette 首粒代表中心; 旧版仅首枚 —— 指到其余玫瑰体无响应）
      if (i % perRosette === 0) {
        hover.push({ pos: { x: cp.x, y: cp.y, z: cp.z }, r: 0.62, zh: '糖原玫瑰体', latin: 'Glycogen rosette', group: 'energy' });
      }
      const off = sph(0.08 + hash01(`g${i}`) * 0.26, (hash01(`g${i}`, 5) - 0.5) * 3, hash01(`g${i}`, 7) * Math.PI * 2);
      const s = 0.7 + hash01(`gs${i}`) * 0.6;
      mm.makeScale(s, s, s);
      mm.setPosition(cp.x + off.x, cp.y + off.y, cp.z + off.z);
      inst.setMatrixAt(i, mm);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = cutaway ? 97.3 : 46; // v22 剖面窗口化（糖原玫瑰体剖开）
    group.add(inst);
    // v21 逐玫瑰体悬停锚承担目录与感应（旧首枚 label 派生锚退役）
    void gly0;
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
  /* ---- v23 剖面示教锚吸附（单一真源 = gl.clippingPlanes[0]，由 SectionClipController 每帧更新） ----
   * 数学不变量: 所有钳制均沿「面内」进行 —— 中心恒满足 n·p + c = 0（用户诉求「细胞器中心放在
   * 50% depth 上」的精确保证; 50% 时平面过核, 径向避让必然破坏贴合 → 面内避让是唯一正确解）:
   *   ① home 沿法向投影到平面（无平移量钳 —— 面内钳制体系自然处理极端深度: 平面贴近膜缘时
   *     面内可用盘收缩, 锚点收到垂足附近仍恒贴面; 旧 ±0.62R 钳会在浅/深切层造成脱贴）
   *   ② 核避让（面内）: 推到「核安全球 ∩ 切平面」交圆上 —— f=核心垂足, r=√(safe²−δ²）, δ=核心面距
   *   ③ 膜内钳（面内）: 沿 o(细胞中心垂足)→target 方向收缩到 ρ=√((r(u)−margin)²−c²)
   *   ④ 长轴端点膜内钳（线粒体, 沿轴拉回）+ ④b 再投影（消除拉回的法向分量）
   *   ⑤⑥ 位置/朝向平滑逼近（lerp/slerp —— 拖深度时「贴面滑动」）+ ⑦ syncRefs 引用同步 */
  const scTmp = new THREE.Vector3();
  const scAxis = new THREE.Vector3();
  const scAxisProj = new THREE.Vector3();
  const scU = new THREE.Vector3();
  const scQ = new THREE.Quaternion();
  const LOCAL_LONG = new THREE.Vector3(0, 1, 0); // 胶囊长轴局部向（线粒体）
  const applyShowcase = (clip: THREE.Plane | null) => {
    for (const sa of showcaseAnchors) {
      if (clip) {
        const n = clip.normal;
        qaPlane = { n: [n.x, n.y, n.z], c: clip.constant };
        // ① home 沿法向投影到平面: target = home − n·(n·home + c)（平移量不钳 ——
        //   面内钳制体系自然处理极端深度, 锚点恒贴面 = 用户「50% depth」诉求的精确保证）
        const d = n.dot(sa.home) + clip.constant;
        scTmp.copy(sa.home).addScaledVector(n, -d);
        // ② 核避让（面内交圆 —— 保贴合）; 双核跑两轮（第二核推出可能压回第一核）
        const avoidNucleus = () => {
          for (const nuc of nucleiInst) {
            const safe = N * nuc.scale * 1.06 + sa.avoidR;
            const dx = scTmp.x - nuc.center.x;
            const dy = scTmp.y - nuc.center.y;
            const dz = scTmp.z - nuc.center.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist >= safe || dist < 1e-4) continue;
            // 核心到平面带符号距离 δ; 面内交圆心 f = 核心 − n·δ; 半径 r = √(safe²−δ²)
            const delta = n.x * nuc.center.x + n.y * nuc.center.y + n.z * nuc.center.z + clip.constant;
            const dd = safe * safe - delta * delta;
            if (dd <= 0.01) continue; // 平面不切核安全球（理论不达 —— dist<safe 蕴含 |δ|<safe）
            const rr = Math.sqrt(dd);
            const fx = nuc.center.x - n.x * delta;
            const fy = nuc.center.y - n.y * delta;
            const fz = nuc.center.z - n.z * delta;
            let ax = scTmp.x - fx;
            let ay = scTmp.y - fy;
            let az = scTmp.z - fz;
            const al = Math.sqrt(ax * ax + ay * ay + az * az);
            if (al < 1e-4) {
              ax = 1; ay = 0; az = 0; // 恰在垂足的退化方向
            } else {
              ax /= al; ay /= al; az /= al;
            }
            scTmp.set(fx + ax * rr, fy + ay * rr, fz + az * rr);
          }
        };
        avoidNucleus();
        // ③ 膜内钳（面内收缩）: o = −n·c（细胞中心垂足）; 沿 o→target 收缩到交线保守半径
        {
          const ox = -n.x * clip.constant;
          const oy = -n.y * clip.constant;
          const oz = -n.z * clip.constant;
          const wx = scTmp.x - ox;
          const wy = scTmp.y - oy;
          const wz = scTmp.z - oz;
          const wl = Math.sqrt(wx * wx + wy * wy + wz * wz);
          if (wl > 1e-4) {
            scU.set(wx / wl, wy / wl, wz / wl);
            const r3 = cellSurf(scU, R, SHAPE, -0.6);
            const cAbs = Math.min(Math.abs(clip.constant), Math.max(0.1, Math.abs(r3) - 0.25));
            const rho = Math.sqrt(Math.max(0.04, r3 * r3 - cAbs * cAbs));
            if (wl > rho) scTmp.set(ox + scU.x * rho, oy + scU.y * rho, oz + scU.z * rho);
          }
        }
        avoidNucleus(); // 二轮（膜钳收缩朝心向可能重新压核）
        // ④ 长轴端点膜内钳（线粒体: 两端点贴回膜内 —— 切平面近膜缘时切口不出窗）
        if (sa.longAxis && sa.halfLen > 0) {
          scAxis.copy(LOCAL_LONG).applyQuaternion(sa.obj.quaternion);
          for (let e = 0; e < 2; e++) {
            const sign = e === 0 ? 1 : -1;
            const ex = scTmp.x + scAxis.x * sa.halfLen * sign;
            const ey = scTmp.y + scAxis.y * sa.halfLen * sign;
            const ez = scTmp.z + scAxis.z * sa.halfLen * sign;
            const el = Math.sqrt(ex * ex + ey * ey + ez * ez);
            if (el > 1e-4) {
              const maxE = cellSurf(scU.set(ex / el, ey / el, ez / el), R, SHAPE, -0.06);
              if (el > maxE) {
                const pull = (el - maxE) * sign;
                scTmp.addScaledVector(scAxis, -pull);
              }
            }
          }
          // ④b 再投影（端点拉回引入的法向分量清除 —— 恢复严格贴合）
          scTmp.addScaledVector(n, -(n.x * scTmp.x + n.y * scTmp.y + n.z * scTmp.z + clip.constant));
        }
        // ⑤ 平滑逼近（lerp 0.22 → ~150ms 收敛; 拖深度时「贴面滑动」教学读感）
        sa.obj.position.lerp(scTmp, 0.22);
        // ⑥ 长轴对齐切平面（线粒体: 长轴投影到面内 → 纵贯剖开; 球体跳过）
        if (sa.longAxis) {
          scAxis.copy(LOCAL_LONG).applyQuaternion(sa.obj.quaternion);
          scAxisProj.copy(scAxis).addScaledVector(n, -n.dot(scAxis));
          if (scAxisProj.lengthSq() > 1e-4) {
            scAxisProj.normalize();
            scQ.setFromUnitVectors(LOCAL_LONG, scAxisProj);
            sa.obj.quaternion.slerp(scQ, 0.2);
          }
        }
      } else {
        qaPlane = null;
        // 无剖面: 回 home 驻位/朝向
        sa.obj.position.lerp(sa.home, 0.15);
        sa.obj.quaternion.slerp(sa.homeQ, 0.15);
      }
      // ⑦ syncRefs 同步（悬停锤点/标注锚跟随本体 —— 悬停所指即所在）
      for (const ref of sa.syncRefs) {
        ref.pos.x = sa.obj.position.x;
        ref.pos.y = sa.obj.position.y;
        ref.pos.z = sa.obj.position.z;
      }
    }
  };
  // v23 QA 插桩: 暴露示教锚实时位姿 + 平面参数（agent-browser 活体验证「中心恰在平面上」）
  let qaPlane: { n: number[]; c: number } | null = null;
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__showcaseQa = () => ({
      anchors: showcaseAnchors.map((sa) => ({
        pos: [sa.obj.position.x, sa.obj.position.y, sa.obj.position.z],
        home: [sa.home.x, sa.home.y, sa.home.z],
      })),
      plane: qaPlane,
    });
  }
  const update = (t: number, ulk1 = 0, clip: THREE.Plane | null = null) => {
    uTime.value = t;
    // v23 剖面示教锚动态吸附（先于漂移循环 —— pinned 颗位置由吸附循环接管）
    if (showcaseAnchors.length > 0) applyShowcase(clip);
    for (const m of mitos) {
      // v22 示教锚线粒体冻结漂移/自转（v23: 位置由 applyShowcase 接管 —— 无剖面时回 home 驻位）
      if (m.pinned) continue;
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

  /* ============ v14 悬停基线派生（labels → hover 全量补齐） ============
   * 精确锚点（线粒体/RER 冠/高尔基/质膜/中心体/多聚核糖体/皮层 actin）已在构建处内联推送;
   * 此处将剩余全部解剖标注自动派生为悬停目标 —— 覆盖所有类型特化结构（悬停目录零遗漏）。
   * 多锚点同名目标 = 感应域并集, 目录面板按 zh+latin 去重。 */
  {
    // 感应半径表（latin 前缀匹配 —— 大尺度细胞器给更远的作用范围）
    // v19: 质膜条目移除（悬停目标已整体退役）; 糖萼 2.4→1.9（表面结构, 收敛捕获域）
    const R_TABLE: [string, number][] = [
      ['Glycocalyx', 1.9], ['Nuclear pore complex', 1.7],
      ['Nucleolus', 1.9], ['Heterochromatin', 1.8], ['Mitochondrion', 1.8], ['Rough ER', 2.2], ['Smooth ER', 2.0],
      ['Golgi apparatus', 2.6], ['Transport vesicle', 1.7], ['Lysosome', 1.8], ['Autophagosome', 1.7],
      ['Peroxisome', 1.6], ['Lipid droplet', 1.6], ['Microtubules', 2.4], ['Intermediate filaments', 2.0],
    ];
    const G_TABLE: [string, HoverGroupKey][] = [
      ['Nuclear', 'nuclear'], ['Nucleolus', 'nuclear'], ['Heterochromatin', 'nuclear'], ['Micronucleus', 'nuclear'], ['Binucleate', 'nuclear'],
      ['Rough ER', 'endomembrane'], ['Smooth ER', 'endomembrane'], ['Golgi', 'endomembrane'], ['vesicle', 'endomembrane'],
      ['Lysosome', 'endomembrane'], ['Autophago', 'endomembrane'], ['Peroxi', 'endomembrane'], ['Lipid droplet', 'endomembrane'],
      ['canaliculus', 'endomembrane'], ['Sarcoplasmic', 'endomembrane'], ['T-tubule', 'endomembrane'],
      ['Mitochondrion', 'energy'], ['Glycogen', 'energy'],
      ['Microtubule', 'cytoskeleton'], ['filament', 'cytoskeleton'], ['actin', 'cytoskeleton'], ['Myofibril', 'cytoskeleton'],
      ['Stress fiber', 'cytoskeleton'], ['Centrosome', 'cytoskeleton'], ['Polysomes', 'cytoskeleton'], ['Terminal web', 'cytoskeleton'],
      ['Glycocalyx', 'surface'], ['junction', 'surface'], ['Microvilli', 'surface'],
      ['lamina', 'surface'], ['blebbing', 'surface'], ['TCR', 'surface'],
    ];
    for (const l of labels) {
      const r = R_TABLE.find(([k]) => l.latin.startsWith(k))?.[1] ?? 1.7;
      const grp = G_TABLE.find(([k]) => l.latin.includes(k))?.[1] ?? 'specialized';
      hover.push({ pos: l.pos, r, zh: l.zh, latin: l.latin, when: l.when, group: grp });
    }
  }

  return { group, update, labels, hover, dispose };
}

/** 细胞体组件（仅 dim/规格/画质变化时重建, 动画走 imperative 帧驱动）
 *  v14: 解剖标注改为「悬停即现」（用户需求） —— 常显标签墙退役,
 *  OrganelleHoverLayer 按指针邻近检测显示单一标记卡（中文名 + 拉丁名 + 一句科学描述）; 全细胞器覆盖。
 *  v20: extraHover —— 信号传导边等外来悬停目标并入同一标记层（单一胜者, 不与细胞器互扰）。 */
export const CellBody = ({ spec, tint, dim, showAnatomy, perf, cutaway, locate, onHoverTargets, extraHover, onHoverEdge }: {
  spec: CellBodySpec;
  tint: string;
  dim: number;
  /** 悬停标记启用（HUD 开关） */
  showAnatomy: boolean;
  /** 低端设备流畅模式（禁用折射/减实例） */
  perf?: boolean;
  /** v15 剖面视图激活（剖面盘覆盖后半侧 —— 高尔基等窗口化细胞器切换到盘后渲染序列） */
  cutaway?: boolean;
  /** 目录「定位」请求（强制点亮 + 相机飞行由 FlyToController 处理） */
  locate?: LocateReq | null;
  /** 向外暴露去重后的悬停目录（索引面板数据源） */
  onHoverTargets?: (targets: HoverTarget[]) => void;
  /** v20 外来悬停目标（信号边等 —— 并入标记层但不进目录） */
  extraHover?: HoverTarget[];
  /** v21 悬停边 id 上报（整线高亮联动） */
  onHoverEdge?: (id: string | null) => void;
}) => {
  const build = useMemo(() => buildCellBody(spec, tint, dim, perf ?? false, cutaway ?? false), [spec, tint, dim, perf, cutaway]);
  useEffect(() => () => build.dispose(), [build]);
  // 目录数据上报（去重: 同名多锚点只列一行）
  useEffect(() => {
    onHoverTargets?.(dedupeTargets(build.hover));
  }, [build, onHoverTargets]);
  // 自噬流可见性（布尔选择器 —— 仅阈值跨越时重渲染, 逐 tick 零成本）
  const autoActive = useLabStore((s) => autophagyLevel(s.nodeStates) > AUTOPHAGY_VISIBLE_THRESHOLD);
  // 悬停目标条件过滤（自噬目标仅 ULK1 激活时感应; 移动端不裁剪 —— 单标记无遮挡问题）
  const visibleHover = useMemo(
    () => (autoActive ? build.hover : build.hover.filter((t) => t.when !== 'autophagy')),
    [build, autoActive],
  );
  // v20 信号边目标并入（同一标记层单一胜者 —— 边锚点 r 0.85 小惩罚, 细胞器直指时仍优先）
  const allHover = useMemo(
    () => (extraHover && extraHover.length ? [...visibleHover, ...extraHover] : visibleHover),
    [visibleHover, extraHover],
  );

  // 帧驱动: 传入 ULK1 自噬驱动水平（无 ULK1 通路 → 0 → 自噬系统静默）
  // v23: 同时传全局裁剪平面（剖面模式单一真源 —— 示教锚动态吸附切平面）
  useFrame((state) => {
    const planes = state.gl.clippingPlanes;
    build.update(
      state.clock.elapsedTime,
      autophagyLevel(useLabStore.getState().nodeStates),
      planes && planes.length > 0 ? planes[0] : null,
    );
  });

  return (
    <>
      <primitive object={build.group} />
      <OrganelleHoverLayer targets={allHover} enabled={showAnatomy} locate={locate ?? null} onHoverEdge={onHoverEdge} />
    </>
  );
};
