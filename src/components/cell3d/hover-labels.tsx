'use client';

/**
 * 细胞器悬停标记系统 v29（用户反馈: 「核孔复合物/灰色管状/红色球形细胞器悬停没有反应」）
 *   - v29 归一化深度仲裁: 边/折线与细胞器各自除以自身捕获域再比较 —— 细胞器屏幕足迹
 *     整体归属本体（穿行线仅在指针明显更贴近线时胜出）。旧「原始像素距离 0.55×」让
 *     穿行的信号边/微管折线在大细胞器足迹内处处抢占 —— 指向溶酶体/线粒体/高尔基本体
 *     却弹「信号边」信息卡 = 用户「红色球形体悬停没反应」的根因。
 *   - v21 双通道命中引擎: 细胞器锤点（v20 像素精准算法保留）与信号边折线（全段任意点可悬停 ——
 *     每边一个折线命中体, 指针到投影线段的像素距离 <14px 即命中; 「必须放线的中心」根治）分开评分;
 *     仲裁规则: 边仅在「无细胞器命中」或「边归一化深度 < 0.55×细胞器归一化深度」时胜出 ——
 *     指向细胞器本体时永远显示细胞器（「只显示pathway信息」根治）。
 *   - v21 整线高亮: 悬停边经 onHoverEdge(refId) 上报 → EdgeLayer 全段提亮 + 线宽加倍 + 呼吸脉冲
 *     （「高亮应该是整个线, 而不是只是线的中心」根治）。
 *   - v20 视网膜套环高亮: 悬停即现「旋转虚线环 + 十字刻度」SVG 套环（尺寸 = 捕获半径,
 *     恒套住细胞器屏幕足迹）+ 脉冲环增强（翡翠色更亮）+ 锚点光点随细胞器尺寸缩放。
 *   - 邻近检测保留「点到相机射线距离」穿透质膜/核被膜照常可悬停（细胞器发现优先）
 *   - 配套目录面板: 列出全部细胞器 → 点击「定位」= 相机飞行 + 脉冲环高亮
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Vec3 } from '@/lib/simulation/layout3d';
import { glowSpriteTexture } from './textures';
import { useLang } from '@/lib/i18n';

/* ============ 悬停目标契约 ============ */

export interface HoverTarget {
  /** 锚点（细胞器本体上的感应中心） */
  pos: Vec3;
  /** 感应半径（世界单位 —— 指针射线距锚点小于该值即命中） */
  r: number;
  zh: string;
  latin: string;
  /** 条件可见: 'autophagy' = 仅自噬流激活时 */
  when?: 'autophagy';
  /** 目录分组（展示排序用） */
  group?: HoverGroupKey;
  /** v20 悬停卡强调色（信号边/分子目标按语义色着色; 默认翡翠） */
  accent?: string;
  /** v21 折线命中体（信号边/细胞骨架纤维）—— 全段任意点可悬停, 不再仅中点两锚;
   *  v28 开放给细胞器条形结构（微管/中间丝/肌动网/ER 管网/肌原纤维/应力纤维）
   *  —— 用户反馈「细胞骨架还是只能放在中心才行, 而不是条形的任意位置」的根治通道 */
  poly?: Vec3[];
  /** v28 折线命中像素阈值（默认 14px —— 管径越粗的结构给更宽的感应带: 微管/肌原纤维 15,
   *  细丝 11-12; 同屏数十条纤维时仍指向最近一条） */
  hitPx?: number;
  /** v21 目标类别: organelle 默认; edge 让位于细胞器（「只显示pathway信息」根治） */
  kind?: 'organelle' | 'edge';
  /** v21 外部引用 id（边 id —— 整线高亮联动） */
  refId?: string;
  /** v23 副题行（信号边源/靶分子对等补充信息 —— 悬停卡 latin 副题下渲染） */
  note?: string;
}

export type HoverGroupKey = 'nuclear' | 'endomembrane' | 'energy' | 'cytoskeleton' | 'surface' | 'specialized';

export const HOVER_GROUP_ORDER: HoverGroupKey[] = ['nuclear', 'endomembrane', 'energy', 'cytoskeleton', 'surface', 'specialized'];

export const HOVER_GROUP_LABEL: Record<HoverGroupKey, { zh: string; en: string }> = {
  nuclear: { zh: '核区 · 遗传系统', en: 'Nuclear · Genome' },
  endomembrane: { zh: '内膜系统', en: 'Endomembrane system' },
  energy: { zh: '能量与代谢', en: 'Energy & metabolism' },
  cytoskeleton: { zh: '细胞骨架', en: 'Cytoskeleton' },
  surface: { zh: '细胞表面', en: 'Cell surface' },
  specialized: { zh: '特化结构', en: 'Specialized' },
};

/* ============ 细胞器一句科学描述（双语 —— 悬停卡第三行） ============ */

export const ORG_INFO: Record<string, { zh: string; en: string }> = {
  'Plasma membrane': { zh: '磷脂双层流动镶嵌 · 跨膜受体接收胞外信号', en: 'Fluid bilayer embedding receptors for extracellular signals' },
  Glycocalyx: { zh: '多糖绒被 · 细胞身份识别与保护层', en: 'Polysaccharide coat for cell identity and protection' },
  'Nuclear envelope': { zh: '双层核膜 · 核质分区界限（外膜续接 rER）', en: 'Double membrane bounding the nucleus' },
  'Nuclear pore complex': { zh: '≈2000/核 · 核质双向选择性运输通道', en: '~2000 per nucleus · gated nucleocytoplasmic transport' },
  Nucleolus: { zh: 'rRNA 转录 + 核糖体亚基组装车间', en: 'rRNA transcription and ribosome assembly' },
  Heterochromatin: { zh: '高度压缩的沉默染色质 · 核边缘聚集', en: 'Condensed silent chromatin at the periphery' },
  Mitochondrion: { zh: '氧化磷酸化产能车间 · 内膜折叠成板层嵴', en: 'Powerhouse — oxidative phosphorylation on cristae' },
  'Rough ER': { zh: '核糖体满铺的囊池网 · 分泌蛋白与膜蛋白合成', en: 'Ribosome-studded cisternae — secretory protein synthesis' },
  'Peripheral rough ER': { zh: '外周管状 ER + 膜旁核糖体金珠 · 与核周囊池连续的胞质管网', en: 'Peripheral tubular ER studded with ribosomes — continuous with perinuclear cisternae' },
  'Cytoplasmic actin network': { zh: '胞质肌动蛋白网 · 皮层下应力纤维与细丝交织的收缩网络', en: 'Cytoplasmic actin — stress fibers and thin filaments interweaving' },
  'Smooth ER': { zh: '无核糖体管网 · 脂质合成与 Ca²⁺ 储库', en: 'Ribosome-free tubules — lipid synthesis, Ca²⁺ store' },
  'Golgi apparatus': { zh: '顺→反扁平囊堆 · 糖基化修饰与分选枢纽', en: 'cis→trans stack — glycosylation and sorting hub' },
  'CGN · cis-Golgi network': { zh: '顺面高尔基网 · 入货码头 —— 接收内质网 COPII 运输小泡, 首轮糖基化检查站', en: 'Cis entry network receiving ER-derived COPII carriers' },
  'TGN · trans-Golgi network': { zh: '反面高尔基网 · 分选出口 —— 分泌泡/网格蛋白囊泡/溶酶体酶三条航线在此分运', en: 'Trans exit hub — secretory, clathrin and lysosomal routes' },
  'Transport vesicle': { zh: '膜运输载体 · ER→高尔基→质膜航线', en: 'Membrane carriers between compartments' },
  Lysosome: { zh: 'pH≈4.5 酸性水解酶仓 · 降解与回收', en: 'Acidic hydrolase compartment for turnover' },
  'Multivesicular body': { zh: '多泡体（晚期内体）· ESCRT 分选出芽腔内囊泡, 送抵溶酶体降解', en: 'Late endosome — ESCRT-sorted intraluminal vesicles fated for lysosomal degradation' },
  Autophagosome: { zh: '双膜自噬载体 · ULK1 起始、包裹货物递送降解', en: 'Double-membrane autophagy carrier' },
  Peroxisome: { zh: '脂肪酸 β 氧化 · 过氧化氢酶解毒结晶核', en: 'β-oxidation and catalase detoxification' },
  'Lipid droplet': { zh: '中性脂储存库 · 能量与膜原料缓冲', en: 'Neutral lipid storage depot' },
  Microtubules: { zh: 'α/β 微管蛋白原纤维 · 胞内运输轨道', en: 'Tubulin tracks for intracellular transport' },
  Centrosome: { zh: '中心粒对 + 中心体基质 · 微管组织中心', en: 'Centriole pair — microtubule organizing center' },
  'Intermediate filaments': { zh: '波形蛋白机械支架 · 抗拉强度', en: 'Vimentin scaffold — tensile strength' },
  'Cortical actin': { zh: '皮层肌动蛋白网 · 形态维持与运动', en: 'Cortical actin network for shape and motility' },
  Polysomes: { zh: '游离多聚核糖体 · 胞质蛋白翻译螺旋', en: 'Free polyribosomes translating cytosolic proteins' },
  'Glycogen rosette': { zh: '糖原颗粒簇 · 葡萄糖储能', en: 'Glycogen clusters — glucose reserve' },
  'Tight junction': { zh: '封闭索 · 上皮旁屏障（Claudin/Occludin）', en: 'Sealing strands — epithelial barrier' },
  'Collagen fiber': { zh: 'I 型胶原 D-周期横纹 · 胞外基质缆绳', en: 'Type-I collagen cable with D-period banding' },
  'Membrane blebbing': { zh: '侵袭表型 · 肌动蛋白皮层解聚鼓泡', en: 'Invasive phenotype — cortical actin disruption' },
  'Myelinated axon': { zh: '髓鞘绝缘 + 郎飞氏结跳跃传导', en: 'Saltatory conduction at nodes of Ranvier' },
  'Basal dendrite': { zh: '基底树突 · 棘突接收突触输入', en: 'Basal dendrites receiving synaptic input' },
  'Synaptic bouton': { zh: '突触扣结 · 囊泡递质释放位点', en: 'Vesicle release site' },
  'Apical tuft': { zh: '顶端树突丛 · 主树突远端分支', en: 'Apical dendrite tuft' },
  Myofibril: { zh: '肌原纤维 · 肌节 A/I 带横纹收缩单元', en: 'Sarcomere-striated contractile unit' },
  'Intercalated disc': { zh: '闰盘 · 端端机械与电耦联（Cx43）', en: 'End-to-end coupling with gap junctions' },
  'Stress fiber': { zh: 'α-SMA 应力纤维 · 黏着斑牵引', en: 'Contractile α-SMA bundles at focal adhesions' },
  'Basal lamina': { zh: '基底膜基板 · 上皮极性支架', en: 'Basal lamina supporting epithelial polarity' },
  'Bile canaliculus': { zh: '胆小管 · 微绒毛胆汁引流通道', en: 'Canalicular bile channel' },
  'T-tubule': { zh: 'T 小管 · Z 线位质膜内陷传导兴奋', en: 'Z-line invagination conveying excitation' },
  'Sarcoplasmic reticulum': { zh: '肌浆网 · Ca²⁺ 释放/回收库（SERCA）', en: 'Ca²⁺ store with SERCA pumps' },
  Micronucleus: { zh: '微核 · 染色体错误分离的基因组不稳定标志', en: 'Genomic instability marker from missegregation' },
  'TCR microcluster': { zh: 'TCR/CD3 微簇 · 抗原识别信号起始', en: 'Antigen recognition signal initiation' },
  'Terminal web': { zh: '终末网 · 微绒毛根部横行微丝网', en: 'Rootlet actin web of microvilli' },
  Microvilli: { zh: '微绒毛刷状缘 · 吸收面积极化放大', en: 'Brush border amplifying absorptive area' },
  'Binucleate (~25%)': { zh: '约 25% 肝细胞双核 · 胞质分裂未完成所致', en: 'Failed cytokinesis yields binucleation' },
  'Replication forks': { zh: 'S 期复制叉 · PCNA 滑动夹环双向合成新 DNA 链（姐妹染色单体前体）', en: 'S-phase forks — PCNA clamps synthesizing sister DNA strands' },
  /* v20 信号传导边悬停词条（「红色的长条是什么」—— 玫红虚线弧线等边类型可悬停识别） */
  'Signal edge · inhibition': { zh: '抑制关系边 · 负反馈降低下游分子活性（玫红虚线弧线）', en: 'Inhibitory edge — negative feedback damping downstream activity' },
  'Signal edge · repression': { zh: '转录阻遏边 · 抑制靶基因表达（玫红虚线弧线）', en: 'Repressive edge — blocking target gene expression' },
  'Signal edge · activation': { zh: '激活关系边 · 上游分子激活下游靶点（翡翠绿弧线）', en: 'Activating edge — upstream activates the downstream target' },
  'Signal edge · phosphorylation': { zh: '磷酸化边 · 激酶转移磷酸基激活靶蛋白（亮绿弧线）', en: 'Phosphorylating edge — kinase relays a phosphate group' },
  'Signal edge · expression': { zh: '转录表达边 · 靶基因被激活开始 mRNA 转录（琥珀弧线）', en: 'Expression edge — target gene begins transcription' },
  'Signal edge · binding': { zh: '结合/解离边 · 分子间物理相互作用（石板灰弧线）', en: 'Binding/dissociation edge — physical interaction' },
  'Signal edge · indirect': { zh: '间接效应边 · 经中间分子传导（青色弧线）', en: 'Indirect edge — routed via intermediates' },
};

/** 目录去重: 同名（zh+latin）多锚点只列一行（悬停层仍用全部锚点扩大感应域） */
export function dedupeTargets(targets: HoverTarget[]): HoverTarget[] {
  const seen = new Set<string>();
  const out: HoverTarget[] = [];
  for (const t of targets) {
    const k = `${t.zh}|${t.latin}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/* ============ 定位/飞行请求（目录面板 → 画布内） ============ */

export interface LocateReq {
  nonce: number;
  target: HoverTarget;
  /** 期望观察距离（世界单位） */
  dist: number;
}

/* ============ 悬停标记层（画布内） ============ */

export function OrganelleHoverLayer({ targets, enabled, locate, onHoverEdge }: {
  targets: HoverTarget[];
  /** 悬停启用（HUD「悬停标记」开关; 关闭时彻底清空） */
  enabled: boolean;
  /** 目录「定位」请求（强制点亮目标 + 相机飞行由 FlyToController 处理） */
  locate: LocateReq | null;
  /** v21 悬停边 id 上报（整线高亮联动; null = 无边悬停） */
  onHoverEdge?: (id: string | null) => void;
}) {
  const { lang } = useLang();
  const [hovered, setHovered] = useState<HoverTarget | null>(null);
  /** v29 QA: 实例标识（诊断多实例并存 —— 分裂演示与主视图同时挂载时状态互相覆盖） */
  const instId = useRef(Math.random().toString(36).slice(0, 5));
  /** v20 命中捕获半径（像素 —— 视网膜套环尺寸真源） */
  const [capPx, setCapPx] = useState(48);
  const ray = useRef(new THREE.Ray());
  const tmp = useRef(new THREE.Vector3());
  const tmp2 = useRef(new THREE.Vector3());
  /** v21 折线屏幕投影缓存（每帧重算成本 ~40 边 × 12 点 + v28 ~150 纤维折线 × 2-7 点 ≈ 1500 投影, 可接受） */
  const polyScreen = useRef<{ x: number; y: number; z: number }[]>([]);
  /** v28 折线逐点剖面剪裁状态（真 3D 纤维被剖掉的前半不感应 —— 与锤点通道 v22 同语义） */
  const polyCut = useRef<boolean[]>([]);
  const lastPtr = useRef({ x: NaN, y: NaN });
  const lastCam = useRef(new THREE.Vector3(NaN, NaN, NaN));
  const lastNonce = useRef(0);
  /** 定位强制窗口截止时间（飞行期间不被邻近检测覆盖 —— 相机在动, 每帧都会触发重算） */
  const forcedUntil = useRef(0);
  /** v21 上次上报边 id（去重 setState） */
  const lastEdgeId = useRef<string | null>(null);

  useFrame((state) => {
    // 目录「定位」: 强制点亮该目标 2.4s（即使指针静止/相机飞行中）
    const now = performance.now();
    // v21 QA 插桩（__cellQaProbe 门控 —— 与分裂演示 __mitoQaProbe 同一方法论; 零常态成本）
    if (typeof window !== 'undefined' && (window as { __cellQaProbe?: boolean }).__cellQaProbe) {
      (window as unknown as { __cellQaTargets?: HoverTarget[] }).__cellQaTargets = targets;
      const pc = state.camera as THREE.PerspectiveCamera;
      (window as unknown as { __cellQaState?: Record<string, unknown> }).__cellQaState = {
        inst: instId.current,
        hovered: hovered?.zh ?? null,
        enabled,
        locateNonce: locate?.nonce ?? null,
        lastNonce: lastNonce.current,
        forcedUntil: forcedUntil.current,
        now,
        ptr: [state.pointer.x, state.pointer.y],
        // v29 QA: 相机快照（外部投影诊断 —— 目标屏幕位推算）
        cam: {
          pos: [state.camera.position.x, state.camera.position.y, state.camera.position.z],
          q: [state.camera.quaternion.x, state.camera.quaternion.y, state.camera.quaternion.z, state.camera.quaternion.w],
          fov: pc.fov ?? 50,
          aspect: pc.aspect,
          size: [state.size.width, state.size.height],
          // v29 QA: 真源投影矩阵 + 世界逆矩阵（引擎 .project() 同一数据 —— 外部重建零误差）
          pm: [...pc.projectionMatrix.elements],
          mwi: [...state.camera.matrixWorldInverse.elements],
        },
      };
    }
    if (locate && locate.nonce !== lastNonce.current) {
      lastNonce.current = locate.nonce;
      forcedUntil.current = now + 2400;
      setHovered(locate.target);
      return;
    }
    if (!enabled) return;
    if (now < forcedUntil.current) return; // 强制窗口内不重算（保持定位标记 + 脉冲环）

    const ptr = state.pointer;
    const camMoved = !lastCam.current.equals(state.camera.position);
    const ptrMoved = ptr.x !== lastPtr.current.x || ptr.y !== lastPtr.current.y;
    if (!ptrMoved && !camMoved) return;
    lastPtr.current = { x: ptr.x, y: ptr.y };
    lastCam.current.copy(state.camera.position);

    // 相机射线（unproject 构造 —— 免 Raycaster 场景遍历开销）
    ray.current.origin.copy(state.camera.position);
    tmp.current.set(ptr.x, ptr.y, 0.5).unproject(state.camera).sub(ray.current.origin).normalize();
    ray.current.direction.copy(tmp.current);

    /* v20 屏幕空间像素度量: 半屏宽高 + 焦距像素数（fov → px/world-unit @dist=1） */
    const size = state.size;
    const halfW = size.width / 2;
    const halfH = size.height / 2;
    const pcam = state.camera as THREE.PerspectiveCamera;
    const focal = halfH / Math.tan(((pcam.fov ?? 50) * Math.PI) / 360);

    let best: HoverTarget | null = null;
    let bestCap = 48;
    let bestScore = Infinity;
    /** v21 胜者真实像素距离（仲裁用 —— score 含惩罚项不可直接反推） */
    let bestPixelDist = Infinity;
    /* v22 剖面模式锚点裁剪: 全局裁剪面（SectionClipController → gl.clippingPlanes）
     * 前半被剖掉的细胞器视觉已剪除 —— 锚点同步不感应（悬停所见即所指; 用户反馈
     * 「剖面下悬停不弹信息」的配套: 2D 贴图退役后真 3D 细胞器在剖面窗口可悬停,
     * 而被剖掉的前半细胞器不再「隐形响应」）。分裂模式/常规模式 clippingPlanes 为空 → 不生效 */
    const clipPlanes = state.gl.clippingPlanes;
    const clip0 = clipPlanes && clipPlanes.length > 0 ? clipPlanes[0] : null;
    /** v21 双通道仲裁: 细胞器锤点命中（既有算法）与折线命中（信号边全段）分开评分,
     *  边仅在「明显更近」时胜出 —— 指向细胞器本体时永远显示细胞器（用户反馈「只显示pathway信息」根治） */
    let bestEdge: HoverTarget | null = null;
    let bestEdgeDist = Infinity;
    /** v29 胜者边捕获域（归一化深度仲裁 —— edgeDist/bestEdgeCap vs orgDist/bestCap） */
    let bestEdgeCap = 14;
    let bestEdgePos: Vec3 | null = null;
    /** v21 边命中最近点沿折线参数（0..1 —— 高亮脉冲粒子定位） */
    for (const t of targets) {
      if (t.poly && t.poly.length >= 2) {
        /* ---- v21 折线通道（v28 开放给细胞器条形结构）: 全段投影 → 指针到各段的像素距离 ---- */
        const n = t.poly.length;
        if (polyScreen.current.length < n) polyScreen.current.length = n;
        if (polyCut.current.length < n) polyCut.current.length = n;
        const scr = polyScreen.current;
        const cut = polyCut.current;
        let culled = true;
        let allCut = true;
        for (let i = 0; i < n; i++) {
          const p = t.poly[i];
          // v28 剪裁感知: 先算世界坐标到剖切面距离（project 会原地改写 tmp2 —— 必须在前）
          if (clip0) {
            tmp2.current.set(p.x, p.y, p.z);
            cut[i] = clip0.distanceToPoint(tmp2.current) < -0.12; // 与锤点通道同容差
          } else {
            cut[i] = false;
          }
          if (!cut[i]) allCut = false;
          tmp2.current.set(p.x, p.y, p.z).project(state.camera);
          scr[i] = { x: tmp2.current.x, y: tmp2.current.y, z: tmp2.current.z };
          if (tmp2.current.z < 1 && tmp2.current.z > -1) culled = false;
        }
        if (culled || allCut) continue; // 全点在相机外或全点被剖掉
        // 指针 NDC → 像素坐标
        const px = ptr.x * halfW + halfW;
        const py = halfH - ptr.y * halfH;
        let minD = Infinity;
        let minI = -1;
        let minK = 0;
        for (let i = 0; i < n - 1; i++) {
          const a = scr[i], b = scr[i + 1];
          if (a.z > 1 || a.z < -1 || b.z > 1 || b.z < -1) continue;
          if (cut[i] && cut[i + 1]) continue; // v28 两端都被剖掉的段不感应（跨面段保留 —— 半可见）
          const ax = a.x * halfW + halfW, ay = halfH - a.y * halfH;
          const bx = b.x * halfW + halfW, by = halfH - b.y * halfH;
          const dx = bx - ax, dy = by - ay;
          const lenSq = dx * dx + dy * dy;
          let k = lenSq > 1e-6 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
          k = k < 0 ? 0 : k > 1 ? 1 : k;
          const cx = ax + dx * k, cy = ay + dy * k;
          const d = Math.hypot(px - cx, py - cy);
          if (d < minD) { minD = d; minI = i; minK = k; }
        }
        // v21 命中阈值: 默认 14px（线宽 ~2-4px + 手抖余量）; v28 hitPx 按结构管径自适应
        const edgeCap = t.hitPx ?? 14;
        if (minD > edgeCap || minI < 0) continue;
        // v29c 近并列边距: 信号边要取代已持有的细胞器条形折线（SER 管/胆小管/骨架纤维）
        //   须再近 2px —— 边弧恰从管端掠过时不再截胡（用户所指是细胞器而非变径弧线）
        const displaceMargin = t.kind === 'edge' && bestEdge !== null && bestEdge.kind !== 'edge' ? 2 : 0;
        // 折线最近点世界坐标（命中点即套环锚 —— 视网膜环就在指针处）
        const pA = t.poly[minI], pB = t.poly[minI + 1];
        const hitPos = {
          x: pA.x + (pB.x - pA.x) * minK,
          y: pA.y + (pB.y - pA.y) * minK,
          z: pA.z + (pB.z - pA.z) * minK,
        };
        if (minD < bestEdgeDist - displaceMargin) {
          bestEdgeDist = minD;
          bestEdgeCap = edgeCap;
          bestEdge = t;
          bestEdgePos = hitPos;
        }
        continue;
      }
      /* ---- 细胞器锤点通道（v20 既有算法） ---- */
      if (clip0) {
        tmp2.current.set(t.pos.x, t.pos.y, t.pos.z);
        // v23 容差 -0.12: 示教锚中心恰在切平面上（distance≈0）且拖深度时短暂越面前侧
        // （lerp 追赶中）→ 无容差会闪烁消失; 被完整剖掉的锚（distance 很负）不受影响
        if (clip0.distanceToPoint(tmp2.current) < -0.12) continue; // v22 被剖掉的前半不感应
      }
      tmp.current.set(t.pos.x, t.pos.y, t.pos.z).sub(ray.current.origin);
      const proj = tmp.current.dot(ray.current.direction);
      if (proj < 1) continue; // 相机背后/过近
      const perp2 = tmp.current.lengthSq() - proj * proj;
      if (perp2 > t.r * t.r) continue; // 射线未穿入感应域（穿透质膜/核被膜照常可探）
      // v20 像素精准: 锚点投影屏幕位 + 像素距离命中 + 捕获半径钳制
      tmp2.current.set(t.pos.x, t.pos.y, t.pos.z).project(state.camera);
      if (tmp2.current.z > 1 || tmp2.current.z < -1) continue; // 裁剪面外
      const dx = (tmp2.current.x - ptr.x) * halfW;
      const dy = (tmp2.current.y - ptr.y) * halfH;
      const pixelDist = Math.hypot(dx, dy);
      const screenR = (t.r * focal) / Math.max(0.5, proj); // 感应半径的屏幕像素换算
      const cap = THREE.MathUtils.clamp(screenR, 24, 64); // 像素预算: 拉近 ≤64px 精准, 拉远 ≥24px 可发现
      if (pixelDist > cap) continue;
      // v16 相对评分: 像素距离/捕获半径 —— 指针落在哪个细胞器「屏幕足迹」更深谁胜出;
      // v18 尺寸惩罚项（0.22·r）: 大感应半径的「区域级」锚点在重叠区让位小而精确的细胞器锚点;
      // v19 深度项（proj·0.012）: 同等命中质量下近处（所见结构）胜出后方被遮挡锚点。
      const score = pixelDist / cap + 0.22 * t.r + proj * 0.012;
      if (score < bestScore) {
        bestScore = score;
        best = t;
        bestCap = cap;
        bestPixelDist = pixelDist;
      }
    }
    /* v29 归一化深度仲裁: 双方像素距离各除以自身捕获域 —— 指针在细胞器足迹内的相对深度 vs
     *   在折线感应带内的相对深度。大细胞器（溶酶体/线粒体/高尔基, 屏幕足迹 30-60px）的本体
     *   任何位置都归属本体; 穿行线（信号边/微管折线, 感应带 11-15px）仅在指针显著更贴近线
     *   （深度比 < 0.55）时胜出。旧「原始像素 0.55×」以细胞器锚心距为基准 —— 锚心偏在足迹
     *   一侧时整片身体被细线抢占（用户「红色球形体悬停没反应」根治）。
     *   v29b 核心区绝对归属: 指针深入足迹内圈（orgDepth < 0.3）时本体无条件胜出 —— 穿行边
     *   恰从本体中心上方掠过时不再截胡（用户所指是整个身体而非 2px 细线）。 */
    let winner: HoverTarget | null = best;
    if (bestEdge) {
      const edgeDepth = bestEdgeDist / Math.max(6, bestEdgeCap);
      const orgDepth = bestPixelDist / Math.max(6, bestCap);
      if (!best || (orgDepth > 0.3 && edgeDepth < orgDepth * 0.55)) {
        winner = { ...bestEdge, pos: bestEdgePos ?? bestEdge.pos };
        bestCap = 18;
      }
    }
    if (winner !== hovered) setHovered(winner);
    if (winner && Math.abs(bestCap - capPx) > 1) setCapPx(bestCap);
    // v21 边 id 上报（整线高亮联动; 去重避免每帧 setState）
    const edgeId = winner?.kind === 'edge' ? winner.refId ?? null : null;
    if (edgeId !== lastEdgeId.current) {
      lastEdgeId.current = edgeId;
      onHoverEdge?.(edgeId);
    }
  });

  // 光标反馈（可交互暗示; 拖拽旋转时 OrbitControls 自身的 grab 光标不受影响）
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.cursor = hovered && enabled ? 'pointer' : '';
    return () => { document.body.style.cursor = ''; };
  }, [hovered, enabled]);

  // v21 悬停关闭时同步清空整线高亮
  useEffect(() => {
    if (!enabled) onHoverEdge?.(null);
  }, [enabled, onHoverEdge]);

  const show = enabled ? hovered : null;
  const info = show ? ORG_INFO[show.latin] : undefined;
  const accent = show?.accent ?? '#34d399';

  return (
    <>
      {/* 锚点亮斑 + 脉冲环（v20: 尺寸自适应 —— 大细胞器更大的光点与环） */}
      {show && (
        <>
          <mesh position={[show.pos.x, show.pos.y, show.pos.z]} renderOrder={60}>
            <sphereGeometry args={[0.075 + show.r * 0.05, 10, 8]} />
            <meshBasicMaterial color="#e2edf7" transparent opacity={0.97} depthWrite={false} fog={false} />
          </mesh>
          <PulseRings pos={show.pos} r={show.r} />
        </>
      )}
      {show && (
        <Html
          position={[show.pos.x, show.pos.y, show.pos.z]}
          center
          zIndexRange={[42, 20]}
          pointerEvents="none"
          style={{ pointerEvents: 'none' }}
        >
          {/* v20 视网膜套环: 旋转虚线环 + 十字刻度 —— 恒套住细胞器屏幕足迹（尺寸 = 命中捕获半径）,
              悬停到了哪个结构一眼可辨（用户反馈「高亮效果要更加明显」）; 卡片上移避让环 */}
          <HoverReticle capPx={capPx} accent={accent} />
          {/* v15 悬停卡样式对齐 pathway 信息卡（用户需求「和 pathway 一样的样式」）:
              实心 slate-950/95 圆角卡 + emerald 边框 + mono 标题 + 分组徽章 + 拉丁副题 + 科学描述行
              v20: 定位包裹层上移出套环（卡自身入场动画的 transform 不受干扰） */}
          <div style={{ position: 'absolute', left: 0, bottom: 74, transform: 'translateX(-50%)', pointerEvents: 'none' }}>
            <div className="anatomy-card" style={{ borderColor: `${accent}55` }}>
              <div className="anatomy-card-head">
                <span className="anatomy-card-title" style={{ color: accent }}>{lang === 'zh' ? show.zh : show.latin}</span>
                {show.group && (
                  <span className="anatomy-card-chip">
                    {lang === 'zh' ? HOVER_GROUP_LABEL[show.group].zh : HOVER_GROUP_LABEL[show.group].en}
                  </span>
                )}
              </div>
              <div className="anatomy-card-sub">{lang === 'zh' ? show.latin : show.zh}</div>
              {show.note && <div className="anatomy-card-sub anatomy-card-note">{show.note}</div>}
              {info && <div className="anatomy-card-desc">{lang === 'zh' ? info.zh : info.en}</div>}
            </div>
          </div>
        </Html>
      )}
    </>
  );
}

/** v20 视网膜套环 —— 悬停目标的屏幕空间高亮（旋转虚线环 + 十字刻度 + 中心辉光盘） */
function HoverReticle({ capPx, accent }: { capPx: number; accent: string }) {
  const d = Math.round(THREE.MathUtils.clamp(capPx, 24, 64) * 2);
  const r = d / 2 - 3;
  const c = d / 2;
  const tick = 9;
  return (
    <svg
      width={d}
      height={d}
      style={{
        position: 'absolute',
        left: -d / 2,
        top: -d / 2,
        overflow: 'visible',
        filter: `drop-shadow(0 0 6px ${accent}aa)`,
      }}
      aria-hidden
    >
      {/* 中心辉光盘 */}
      <circle cx={c} cy={c} r={r * 0.32} fill={accent} opacity={0.1} />
      {/* 主环: 旋转虚线 */}
      <g className="reticle-spin" style={{ transformOrigin: `${c}px ${c}px` }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke={accent} strokeWidth={2.2} strokeDasharray={`${r * 0.55} ${r * 0.42}`} opacity={0.95} strokeLinecap="round" />
        {/* 十字刻度（随环旋转） */}
        {[0, 90, 180, 270].map((a) => {
          const rad = (a * Math.PI) / 180;
          const x1 = c + Math.cos(rad) * (r - 1);
          const y1 = c + Math.sin(rad) * (r - 1);
          const x2 = c + Math.cos(rad) * (r + tick);
          const y2 = c + Math.sin(rad) * (r + tick);
          return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke={accent} strokeWidth={2.4} strokeLinecap="round" opacity={0.9} />;
        })}
      </g>
      {/* 内细环（静态） */}
      <circle cx={c} cy={c} r={r * 0.62} fill="none" stroke={accent} strokeWidth={1} opacity={0.45} />
    </svg>
  );
}

/** 扩散脉冲环（双环相位差 + 中心光晕）—— 就地锚定的空间指示
 *  v20: 翡翠色提亮 + 环尺寸下限提高（高亮更明显） */
function PulseRings({ pos, r }: { pos: Vec3; r: number }) {
  const s1 = useRef<THREE.Sprite>(null);
  const s2 = useRef<THREE.Sprite>(null);
  const glow = useRef<THREE.Sprite>(null);
  const tex = useGlowTex();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (const [ref, phase] of [[s1, 0], [s2, 0.55]] as const) {
      const sp = ref.current;
      if (!sp) continue;
      const k = ((t + phase) % 1.15) / 1.15;
      sp.scale.setScalar(Math.max(0.5, r * (0.5 + k * 1.6)));
      (sp.material as THREE.SpriteMaterial).opacity = (1 - k) * 0.72;
    }
    if (glow.current) {
      const sp = glow.current as THREE.Sprite;
      sp.scale.setScalar(Math.max(0.45, r * 0.6));
      (sp.material as THREE.SpriteMaterial).opacity = 0.62 + Math.sin(t * 3.2) * 0.18;
    }
  });
  return (
    <>
      <sprite ref={s1} position={[pos.x, pos.y, pos.z]} renderOrder={59}>
        <spriteMaterial map={tex} color="#5eead4" transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
      </sprite>
      <sprite ref={s2} position={[pos.x, pos.y, pos.z]} renderOrder={59}>
        <spriteMaterial map={tex} color="#34d399" transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
      </sprite>
      <sprite ref={glow} position={[pos.x, pos.y, pos.z]} renderOrder={58}>
        <spriteMaterial map={tex} color="#a7f3d0" transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} opacity={0.66} />
      </sprite>
    </>
  );
}

function useGlowTex() {
  // glowSpriteTexture() 模块级缓存 —— useState 初始化器每组件只调用一次
  const [tex] = useState(() => glowSpriteTexture());
  return tex;
}

/* ============ 相机飞行控制器（目录「定位」→ 1.2s 阻尼聚焦） ============ */

export function FlyToController({ req, minDist = 4.5 }: { req: LocateReq | null; minDist?: number }) {
  const { camera, gl } = useThree();
  const anim = useRef<{ t0: number; fromTarget: THREE.Vector3; fromDist: number; toTarget: THREE.Vector3; dist: number } | null>(null);
  const lastNonce = useRef(0);

  // 用户任何交互立即让位（与 CameraRig 同哲学: 绝不对抗用户）
  useEffect(() => {
    const el = gl.domElement;
    const onDown = () => { anim.current = null; };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('wheel', onDown, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('wheel', onDown);
    };
  }, [gl]);

  useFrame((state) => {
    const controls = (state as unknown as { controls: OrbitControlsImpl | null }).controls;
    if (req && req.nonce !== lastNonce.current) {
      lastNonce.current = req.nonce;
      if (controls) {
        anim.current = {
          t0: performance.now(),
          fromTarget: controls.target.clone(),
          fromDist: camera.position.distanceTo(controls.target),
          toTarget: new THREE.Vector3(req.target.pos.x, req.target.pos.y, req.target.pos.z),
          dist: Math.max(minDist, req.dist),
        };
      }
    }
    const a = anim.current;
    if (!a || !controls) return;
    const k = Math.min(1, (performance.now() - a.t0) / 1200);
    const e = k * k * (3 - 2 * k); // smoothstep
    controls.target.lerpVectors(a.fromTarget, a.toTarget, e);
    // 沿当前视线方向推拉（保留用户方位角, 只聚焦 + 拉近）
    const dir = camera.position.clone().sub(controls.target).normalize();
    const dist = THREE.MathUtils.lerp(a.fromDist, a.dist, e);
    camera.position.copy(controls.target).add(dir.multiplyScalar(Math.max(1.2, dist)));
    controls.update();
    if (k >= 1) anim.current = null;
  });
  return null;
}
