'use client';

import { motion } from 'framer-motion';
import { useLang } from '@/lib/i18n';

/**
 * Hero 右侧主视觉 —— 纯 SVG「科学海报」级生物荧光细胞剖面（动画矢量, 任意 DPI 锐利）
 * 叙事与产品同构（MAPK 级联, 默认通路 hsa04010）:
 *   EGF 配体 → 膜受体 EGFR → RAS/RAF/MEK/ERK 激酶级联（粒子沿弧线行进）→
 *   核内 c-FOS 基因应答 → mRNA 输出 → 粗面内质网核糖体合成; 线粒体 ATP 供能, 高尔基分泌囊泡
 * 微动效: 膜双层反向流动光晕 · 细胞缓慢呼吸 · 级联粒子沿弧线行进 · 囊泡/配体轨道漂移 · 背景微粒景深漂移 · 核糖体/囊泡微闪
 * 仪器化叠加层: 取景框角标 / LIVE 徽标 / 扫描线 / 悬浮结构标注（引线 + 图版字母 A-F）/ 内嵌图注与显微比例尺
 * 显微细节层: 核孔复合物点环 · 核周紫调辉光 · 糖原颗粒簇 · 脂滴 · 左上体积光 · 静态胶片噪点
 * 画面之外零附属条目: 图注与比例尺内嵌于画面底部, 整幅图即右栏主体（大画幅呈现）
 */

/** 信号级联弧线（描边与行进粒子共用同一真源; 坐标系 viewBox 560×420） */
const P_CASCADE_A = 'M 92,178 C 130,200 170,214 229,180'; // 受体① → 核孔（上路）
const P_CASCADE_B = 'M 152,318 C 168,290 200,262 244,240'; // 受体② → 核孔（下路）
const P_CASCADE_IN = 'M 229,180 C 234,196 240,210 254,224'; // 核孔 → 活性基因位点
const P_MRNA_OUT = 'M 254,228 C 238,254 208,278 170,288'; // 基因 → ER 核糖体区（mRNA 输出）
const P_VESICLE = 'M 444,276 C 462,258 474,238 478,214'; // 高尔基 → 质膜（分泌囊泡轨道）

/** 行进粒子样式（CSS offset-path 沿弧线流动; 时长/相位内联错峰） */
function flow(path: string, dur: number, delay: number): React.CSSProperties {
  return {
    offsetPath: `path('${path}')`,
    animationDuration: `${dur}s`,
    animationDelay: `${delay}s`,
  };
}

/** 悬浮结构标注（双语; 定位按 560×420 视窗百分比, 指向 SVG 结构本体位） */
const ANNOTATIONS: {
  key: string;
  zh: string;
  en: string;
  dot: string;
  x: number; // %（相对视窗）
  y: number;
  chipSide: 'left' | 'right';
  chipDy: number; // 标签相对标注点的垂直偏移(px)
}[] = [
  { key: 'ligand', zh: '配体 · 受体结合', en: 'Ligand → receptor', dot: '#fbbf24', x: 15.4, y: 41.4, chipSide: 'right', chipDy: -30 },
  { key: 'mito', zh: '线粒体 · ATP 供给', en: 'Mitochondria · ATP', dot: '#22d3ee', x: 31.8, y: 28.6, chipSide: 'right', chipDy: -26 },
  { key: 'cascade', zh: '激酶级联 · 磷酸化', en: 'Kinase cascade', dot: '#34d399', x: 33.6, y: 46.9, chipSide: 'right', chipDy: 22 },
  { key: 'er', zh: '粗面内质网 · 核糖体', en: 'Rough ER · ribosomes', dot: '#5eead4', x: 28.6, y: 63.8, chipSide: 'left', chipDy: -6 },
  { key: 'nucleus', zh: '细胞核 · 基因响应', en: 'Nucleus · gene response', dot: '#c4b5fd', x: 57.5, y: 44.3, chipSide: 'right', chipDy: -44 },
  { key: 'golgi', zh: '高尔基 · 囊泡运输', en: 'Golgi · vesicle traffic', dot: '#fda4af', x: 70.7, y: 64.8, chipSide: 'left', chipDy: 18 },
];

/** 分子微标注（MAPK 级联节点名, 科学海报器件感; 语言中性 mono） */
const NODE_LABELS: { text: string; x: number; y: number; fill: string; opacity?: number }[] = [
  { text: 'EGF', x: 28, y: 141, fill: '#fbbf24', opacity: 0.75 },
  { text: 'EGFR', x: 54, y: 201, fill: '#5eead4', opacity: 0.6 },
  { text: 'RAS', x: 114, y: 212, fill: '#6ee7b7', opacity: 0.6 },
  { text: 'RAF', x: 168, y: 218, fill: '#6ee7b7', opacity: 0.55 },
  { text: 'MEK', x: 164, y: 293, fill: '#6ee7b7', opacity: 0.55 },
  { text: 'ERK', x: 231, y: 164, fill: '#6ee7b7', opacity: 0.6 },
  { text: 'c-FOS', x: 258, y: 245, fill: '#fbbf24', opacity: 0.7 },
  { text: 'mRNA', x: 192, y: 262, fill: '#fbbf24', opacity: 0.5 },
];

/** 核孔复合物点环（沿核被膜椭圆参数化采样 —— 与 3D 视图 NPC 逐孔读感同构; 轻微半径抖动避免机械等距感） */
const NPC_DOTS = Array.from({ length: 22 }, (_, i) => {
  const a = (i / 22) * Math.PI * 2;
  const rj = i % 3 === 0 ? 1.4 : 0;
  return { x: 308 + (84 + rj) * Math.cos(a), y: 196 + (64 + rj) * Math.sin(a) };
});

export function HeroVisual() {
  const { lang } = useLang();
  const zh = lang === 'zh';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="hidden lg:block"
      aria-label={zh ? '虚拟细胞信号转导科学示意图主视觉' : 'Virtual cell signaling schematic'}
    >
      {/* ==== 外框 + 辉光 ==== */}
      <div className="relative">
        <div className="absolute -inset-6 rounded-[34px] bg-emerald-500/[0.07] blur-3xl" aria-hidden />
        <div className="absolute -inset-px rounded-[26px] bg-gradient-to-b from-emerald-400/25 via-teal-400/10 to-transparent" aria-hidden />

        <div className="relative overflow-hidden rounded-[24px] border border-emerald-500/20 shadow-[0_28px_70px_-24px_rgba(16,185,129,0.32),0_0_0_1px_rgba(2,6,23,0.6)]">
          {/* ==== 主图: SVG 生物荧光细胞剖面（动画矢量, 科学海报级） ==== */}
          <svg
            viewBox="0 0 560 420"
            role="img"
            aria-label={zh
              ? '虚拟细胞信号转导示意图：EGF 配体结合膜受体 EGFR，RAS-RAF-MEK-ERK 激酶级联将信号传入细胞核激活 c-FOS 基因表达，mRNA 输出至粗面内质网合成蛋白；线粒体供能，高尔基体分泌囊泡'
              : 'Virtual cell signaling schematic: EGF binds membrane receptor EGFR, the RAS-RAF-MEK-ERK kinase cascade relays the signal into the nucleus to activate c-FOS expression, and mRNA is exported to rough ER for protein synthesis; mitochondria supply ATP while Golgi secretes vesicles'}
            className="block aspect-[4/3] w-full select-none"
          >
            <defs>
              <radialGradient id="hvBg" cx="50%" cy="46%" r="78%">
                <stop offset="0%" stopColor="#072a22" />
                <stop offset="55%" stopColor="#041713" />
                <stop offset="100%" stopColor="#030812" />
              </radialGradient>
              <radialGradient id="hvCyto" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#064e3b" stopOpacity="0.22" />
                <stop offset="62%" stopColor="#0f3d34" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#0f3d34" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="hvHalo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.12" />
                <stop offset="62%" stopColor="#34d399" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="hvNucleo" cx="42%" cy="40%" r="65%">
                <stop offset="0%" stopColor="#7c6bc4" stopOpacity="0.3" />
                <stop offset="60%" stopColor="#4c3f86" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#2a2344" stopOpacity="0.08" />
              </radialGradient>
              <radialGradient id="hvBokehE" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="hvBokehT" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="hvBokehA" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.13" />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
              </radialGradient>
              {/* 核周紫调辉光（细胞核专属 halo） */}
              <radialGradient id="hvBokehV" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#8b7bc8" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#8b7bc8" stopOpacity="0" />
              </radialGradient>
              {/* 左上体积光（光源方向读感） */}
              <radialGradient id="hvLight" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#99f6e4" stopOpacity="0.09" />
                <stop offset="100%" stopColor="#99f6e4" stopOpacity="0" />
              </radialGradient>
              {/* 静态胶片噪点（显微摄影质感） */}
              <filter id="hvGrain" x="0%" y="0%" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" result="n" />
                <feColorMatrix in="n" type="saturate" values="0" />
              </filter>
              <filter id="hvBlurFar" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>

            {/* 底景（slate-950 系, 中心微弱翡翠染） */}
            <rect width="560" height="420" fill="url(#hvBg)" />

            {/* 景深底层: 远景细胞残影（辉光虚化） */}
            <g filter="url(#hvBlurFar)">
              <ellipse cx="440" cy="96" rx="46" ry="30" fill="#2dd4bf" opacity="0.09" />
              <ellipse cx="110" cy="338" rx="40" ry="26" fill="#34d399" opacity="0.08" />
              <ellipse cx="518" cy="338" rx="34" ry="22" fill="#fbbf24" opacity="0.07" />
              <ellipse cx="60" cy="70" rx="26" ry="17" fill="#5eead4" opacity="0.06" />
            </g>

            {/* 景深底层: 背景微粒（两组反向极慢漂移） */}
            <g className="hv-bg-drift" style={{ '--hv-dx': '-15px', '--hv-dy': '9px', '--hv-bd': '34s' } as React.CSSProperties} fill="#94a3b8">
              <circle cx="66" cy="64" r="1.4" opacity="0.3" />
              <circle cx="150" cy="40" r="1" opacity="0.22" />
              <circle cx="336" cy="52" r="1.2" opacity="0.26" />
              <circle cx="508" cy="120" r="1" opacity="0.2" />
              <circle cx="536" cy="220" r="1.3" opacity="0.24" />
              <circle cx="40" cy="250" r="1.1" opacity="0.22" />
              <circle cx="88" cy="380" r="1.2" opacity="0.2" />
              <circle cx="300" cy="392" r="1" opacity="0.18" />
            </g>
            <g className="hv-bg-drift" style={{ '--hv-dx': '12px', '--hv-dy': '-8px', '--hv-bd': '46s' } as React.CSSProperties} fill="#6ee7b7">
              <circle cx="220" cy="36" r="1" opacity="0.2" />
              <circle cx="430" cy="44" r="1.2" opacity="0.22" />
              <circle cx="524" cy="300" r="1" opacity="0.18" />
              <circle cx="26" cy="150" r="1.2" opacity="0.2" />
              <circle cx="500" cy="386" r="1.1" opacity="0.16" />
              <circle cx="130" cy="396" r="1" opacity="0.16" />
            </g>

            {/* ===== 细胞本体（缓慢呼吸 ±1.4%） ===== */}
            <g className="hv-breathe" style={{ transformOrigin: '285px 212px' }}>
              {/* 膜外辉光晕（呼吸明暗） */}
              <ellipse cx="285" cy="212" rx="222" ry="162" fill="url(#hvHalo)" className="hv-halo" />
              {/* 胞质洗染 */}
              <ellipse cx="285" cy="212" rx="204" ry="145" fill="url(#hvCyto)" />
              {/* 左上体积光（光源方向, 赋予胞质体积感） */}
              <ellipse cx="218" cy="126" rx="148" ry="106" fill="url(#hvLight)" />

              {/* 细胞膜双层: 外小叶 + 磷脂头点环 + 流动光斑（顺流） */}
              <ellipse cx="285" cy="212" rx="206" ry="147" fill="none" stroke="#6ee7b7" strokeWidth="1.5" opacity="0.5" />
              <ellipse cx="285" cy="212" rx="209" ry="150" fill="none" stroke="#a7f3d0" strokeWidth="4" opacity="0.13" strokeDasharray="0.5 43" strokeLinecap="round" />
              <ellipse cx="285" cy="212" rx="206" ry="147" fill="none" stroke="#34d399" strokeWidth="2" opacity="0.65" strokeDasharray="14 216" strokeLinecap="round" className="hv-flow-a" />
              {/* 内小叶 + 逆向流动（双层反向 = 膜流动性读感） */}
              <ellipse cx="285" cy="212" rx="197" ry="138" fill="none" stroke="#2dd4bf" strokeWidth="1.1" opacity="0.38" />
              <ellipse cx="285" cy="212" rx="194" ry="135" fill="none" stroke="#99f6e4" strokeWidth="3" opacity="0.1" strokeDasharray="0.5 38" strokeLinecap="round" />
              <ellipse cx="285" cy="212" rx="197" ry="138" fill="none" stroke="#5eead4" strokeWidth="1.6" opacity="0.5" strokeDasharray="10 156" strokeLinecap="round" className="hv-flow-b" />

              {/* 细胞骨架暗示: 中心体放射微管（弱化虚线） */}
              <g stroke="#94a3b8" strokeWidth="1" opacity="0.13" strokeDasharray="3 5">
                <path d="M 247,272 L 120,118" />
                <path d="M 247,272 L 478,196" />
                <path d="M 247,272 L 288,76" />
                <path d="M 247,272 L 95,240" />
              </g>
              <circle cx="247" cy="272" r="3.2" fill="#cbd5e1" opacity="0.4" />
              <circle cx="243.5" cy="269" r="2.2" fill="#94a3b8" opacity="0.35" />

              {/* 粗面内质网: 核周千层饼层叠膜（4 层, 逐层减淡 = 辉光景深） */}
              <g fill="none" stroke="#5eead4" strokeLinecap="round">
                <path d="M 250,128 C 190,148 190,244 250,264" strokeWidth="1.3" opacity="0.3" />
                <path d="M 244,116 C 172,138 172,254 244,276" strokeWidth="1.2" opacity="0.22" />
                <path d="M 238,104 C 154,128 154,264 238,288" strokeWidth="1.1" opacity="0.15" />
                <path d="M 232,92 C 136,118 136,274 232,300" strokeWidth="1" opacity="0.09" />
              </g>
              {/* 膜旁核糖体（金珠, 整簇微闪） */}
              <g fill="#fbbf24" className="hv-soft-pulse" style={{ '--hv-pd': '5.4s' } as React.CSSProperties}>
                {([[196, 124], [176, 140], [164, 166], [160, 196], [164, 226], [176, 252], [196, 268], [214, 112], [214, 280], [150, 134], [138, 168], [134, 200], [138, 232], [150, 262]] as const).map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r={1.3} opacity={0.4 + (i % 3) * 0.1} />
                ))}
              </g>

              {/* 线粒体 ×3（双层膜 + 嵴 + ATP 金点; 辉光呼吸错峰） */}
              <g transform="translate(178,120) rotate(-22)" className="hv-soft-pulse" style={{ '--hv-pd': '0s' } as React.CSSProperties}>
                <rect x="-36" y="-13" width="72" height="26" rx="13" fill="rgba(34,211,238,0.07)" stroke="#22d3ee" strokeWidth="1.3" opacity="0.65" />
                <rect x="-29" y="-7" width="58" height="14" rx="7" fill="none" stroke="#67e8f9" strokeWidth="0.8" opacity="0.3" />
                <g stroke="#67e8f9" strokeWidth="1" opacity="0.45" fill="none">
                  <path d="M -20,-7 q 4,7 0,14" /><path d="M -10,-7 q 4,7 0,14" /><path d="M 0,-7 q 4,7 0,14" /><path d="M 10,-7 q 4,7 0,14" /><path d="M 20,-7 q 4,7 0,14" />
                </g>
                <circle cx="-12" cy="0" r="1.8" fill="#fbbf24" opacity="0.75" />
                <circle cx="9" cy="3" r="1.4" fill="#fbbf24" opacity="0.6" />
              </g>
              <g transform="translate(152,266) rotate(16)" className="hv-soft-pulse" style={{ '--hv-pd': '2.4s' } as React.CSSProperties}>
                <rect x="-30" y="-11" width="60" height="22" rx="11" fill="rgba(34,211,238,0.06)" stroke="#22d3ee" strokeWidth="1.2" opacity="0.55" />
                <g stroke="#67e8f9" strokeWidth="0.9" opacity="0.4" fill="none">
                  <path d="M -16,-6 q 3,6 0,12" /><path d="M -8,-6 q 3,6 0,12" /><path d="M 0,-6 q 3,6 0,12" /><path d="M 8,-6 q 3,6 0,12" /><path d="M 16,-6 q 3,6 0,12" />
                </g>
                <circle cx="4" cy="-2" r="1.5" fill="#fbbf24" opacity="0.65" />
              </g>
              <g transform="translate(430,150) rotate(-38)" className="hv-soft-pulse" style={{ '--hv-pd': '4.6s' } as React.CSSProperties}>
                <rect x="-24" y="-9" width="48" height="18" rx="9" fill="rgba(34,211,238,0.05)" stroke="#22d3ee" strokeWidth="1.1" opacity="0.45" />
                <g stroke="#67e8f9" strokeWidth="0.8" opacity="0.35" fill="none">
                  <path d="M -12,-5 q 3,5 0,10" /><path d="M -4,-5 q 3,5 0,10" /><path d="M 4,-5 q 3,5 0,10" /><path d="M 12,-5 q 3,5 0,10" />
                </g>
              </g>

              {/* 高尔基体: 5 层弓形扁囊堆（cis 朝内 / trans 出芽） */}
              <g fill="none" stroke="#fda4af" strokeWidth="1.3" strokeLinecap="round">
                <path d="M 362,250 Q 395,260 428,248" opacity="0.26" />
                <path d="M 360,259 Q 395,271 430,257" opacity="0.36" />
                <path d="M 358,268 Q 395,282 432,266" opacity="0.46" />
                <path d="M 356,277 Q 395,293 434,275" opacity="0.4" />
                <path d="M 354,286 Q 395,304 436,284" opacity="0.3" />
              </g>
              <g fill="rgba(253,164,175,0.16)" stroke="#fda4af" className="hv-soft-pulse" style={{ '--hv-pd': '1.6s' } as React.CSSProperties}>
                <circle cx="434" cy="254" r="3.5" strokeWidth="0.9" opacity="0.55" />
                <circle cx="442" cy="272" r="4.5" strokeWidth="1" opacity="0.6" />
                <circle cx="436" cy="292" r="3" strokeWidth="0.8" opacity="0.5" />
              </g>

              {/* 运输囊泡（轨道漂移） */}
              <g className="hv-drift" style={{ '--hv-dx': '5px', '--hv-dy': '-4px', '--hv-dd': '10s' } as React.CSSProperties}>
                <circle cx="206" cy="296" r="4" fill="rgba(45,212,191,0.14)" stroke="#2dd4bf" strokeWidth="1" opacity="0.6" />
              </g>
              <g className="hv-drift" style={{ '--hv-dx': '-4px', '--hv-dy': '4px', '--hv-dd': '12s' } as React.CSSProperties}>
                <circle cx="192" cy="116" r="3.4" fill="rgba(45,212,191,0.12)" stroke="#2dd4bf" strokeWidth="0.9" opacity="0.5" />
              </g>

              {/* 糖原颗粒簇（琥珀微点阵, 与 3D 视图糖原读感同构） */}
              <g fill="#fbbf24">
                {([[152, 296], [161, 304], [149, 309], [158, 286], [168, 295]] as const).map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r={i % 2 ? 1 : 1.4} opacity={0.26 + (i % 3) * 0.08} />
                ))}
              </g>
              {/* 脂滴（琥珀环 + 高光点） */}
              <g>
                <circle cx="398" cy="180" r="7.5" fill="rgba(251,191,36,0.1)" stroke="#fbbf24" strokeWidth="0.8" opacity="0.45" />
                <circle cx="395.5" cy="177.5" r="2" fill="#fde68a" opacity="0.35" />
              </g>

              {/* 细胞核: 双层核被膜 + 核孔点环 + 染色质 + 核仁（与 3D 视图同紫调） */}
              {/* 核周紫调辉光（呼吸） */}
              <ellipse cx="308" cy="196" rx="94" ry="73" fill="url(#hvBokehV)" className="hv-soft-pulse" style={{ '--hv-pd': '4.2s' } as React.CSSProperties} />
              <ellipse cx="308" cy="196" rx="84" ry="64" fill="url(#hvNucleo)" />
              <ellipse cx="308" cy="196" rx="84" ry="64" fill="none" stroke="#9d8fd0" strokeWidth="1.4" opacity="0.45" />
              <ellipse cx="308" cy="196" rx="77" ry="57" fill="none" stroke="#9d8fd0" strokeWidth="1" opacity="0.22" />
              {/* 核孔复合物点环（NPC; 22 孔参数化布点） */}
              <g fill="#c4b5fd">
                {NPC_DOTS.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="1.1" opacity="0.48" />
                ))}
              </g>
              <ellipse cx="308" cy="196" rx="84" ry="64" fill="none" stroke="#c4b5fd" strokeWidth="5" opacity="0.32" strokeDasharray="0.5 30" strokeLinecap="round" />
              <g fill="none" stroke="#c4b5fd" strokeWidth="1.2">
                <path d="M 252,186 C 268,168 292,164 308,178 C 324,192 348,186 360,168" opacity="0.26" />
                <path d="M 256,214 C 274,228 296,224 310,212 C 324,200 346,206 360,224" opacity="0.2" />
                <path d="M 330,146 C 318,152 310,148 304,140" opacity="0.18" />
              </g>
              {/* 信号抵达的活性染色质（微光起伏） */}
              <path d="M 240,210 C 252,200 262,212 272,224" fill="none" stroke="#34d399" strokeWidth="1.5" className="hv-chromatin" />
              {/* 基因应答位点 c-FOS（琥珀脉冲） */}
              <g className="hv-gene">
                <circle cx="256" cy="226" r="6" fill="url(#hvBokehA)" />
                <circle cx="256" cy="226" r="2.2" fill="#fbbf24" />
              </g>
              {/* 核仁（辉光呼吸） */}
              <g className="hv-soft-pulse" style={{ '--hv-pd': '1.2s' } as React.CSSProperties}>
                <circle cx="322" cy="186" r="16" fill="rgba(129,108,196,0.3)" stroke="#8b7bc8" strokeWidth="1" opacity="0.6" />
                <circle cx="318" cy="182" r="3" fill="#a78bfa" opacity="0.4" />
                <circle cx="327" cy="190" r="2.2" fill="#a78bfa" opacity="0.3" />
              </g>

              {/* 信号级联弧线: 基线 + 行进虚线（与实验台 edge-flow 同视觉语言） */}
              <g fill="none">
                <path d={P_CASCADE_A} stroke="rgba(94,234,212,0.2)" strokeWidth="1" />
                <path d={P_CASCADE_B} stroke="rgba(94,234,212,0.18)" strokeWidth="1" />
                <path d={P_CASCADE_IN} stroke="rgba(94,234,212,0.16)" strokeWidth="1" />
                <path d={P_CASCADE_A} stroke="rgba(110,231,183,0.5)" strokeWidth="1.3" className="hv-cascade" />
                <path d={P_CASCADE_B} stroke="rgba(110,231,183,0.42)" strokeWidth="1.2" className="hv-cascade" />
                <path d={P_CASCADE_IN} stroke="rgba(110,231,183,0.4)" strokeWidth="1.1" className="hv-cascade" />
                {/* mRNA 输出（琥珀） */}
                <path d={P_MRNA_OUT} stroke="rgba(251,191,36,0.16)" strokeWidth="1" />
                <path d={P_MRNA_OUT} stroke="rgba(251,191,36,0.45)" strokeWidth="1.2" className="hv-cascade" />
              </g>

              {/* 激酶中继节点（RAS / RAF / MEK; 脉冲环 + 核点） */}
              {([[127, 195, 0], [188, 197, 0.9], [187, 277, 1.8]] as const).map(([x, y, d], i) => (
                <g key={i} transform={`translate(${x},${y})`}>
                  <circle r="7" fill="none" stroke="#34d399" strokeWidth="1" className="hv-relay-ring" style={{ animationDelay: `${d}s` }} />
                  <circle r="5" fill="#34d399" opacity="0.15" />
                  <circle r="2.6" fill="#34d399" opacity="0.9" />
                </g>
              ))}

              {/* 膜受体 ×2（跨膜区 + 胞外/胞内域）与游离配体（琥珀, 徘徊接近） */}
              <g transform="translate(86,174) rotate(20)">
                <circle r="13" fill="url(#hvBokehA)" className="hv-soft-pulse" style={{ '--hv-pd': '0.6s' } as React.CSSProperties} />
                <rect x="-5" y="-9" width="10" height="18" rx="4" fill="#0f3d34" stroke="#2dd4bf" strokeWidth="1.2" />
                <rect x="-3" y="-6.5" width="6" height="5" rx="1.5" fill="#5eead4" opacity="0.85" />
                <rect x="-3" y="1.5" width="6" height="5" rx="1.5" fill="#99f6e4" opacity="0.45" />
              </g>
              <g transform="translate(152,325) rotate(-59)">
                <circle r="11" fill="url(#hvBokehA)" className="hv-soft-pulse" style={{ '--hv-pd': '3.2s' } as React.CSSProperties} />
                <rect x="-4.5" y="-8" width="9" height="16" rx="3.5" fill="#0f3d34" stroke="#2dd4bf" strokeWidth="1.1" />
                <rect x="-2.6" y="-5.5" width="5.2" height="4.4" rx="1.3" fill="#5eead4" opacity="0.8" />
                <rect x="-2.6" y="1.2" width="5.2" height="4.4" rx="1.3" fill="#99f6e4" opacity="0.4" />
              </g>
              <g className="hv-drift" style={{ '--hv-dx': '9px', '--hv-dy': '5px', '--hv-dd': '6.5s' } as React.CSSProperties}>
                <circle cx="44" cy="152" r="8" fill="url(#hvBokehA)" />
                <circle cx="44" cy="152" r="4.2" fill="#fbbf24" opacity="0.9" />
              </g>
              <g className="hv-drift" style={{ '--hv-dx': '10px', '--hv-dy': '-7px', '--hv-dd': '7.5s' } as React.CSSProperties}>
                <circle cx="108" cy="356" r="7" fill="url(#hvBokehA)" />
                <circle cx="108" cy="356" r="3.6" fill="#fbbf24" opacity="0.85" />
              </g>

              {/* 信号粒子（沿弧线行进, 相位错峰: 双粒上路 + 单粒下路/入核/mRNA/囊泡） */}
              <g className="hv-travel" style={flow(P_CASCADE_A, 5.2, 0)}>
                <circle r="6" fill="#34d399" opacity="0.25" /><circle r="2.6" fill="#a7f3d0" />
              </g>
              <g className="hv-travel" style={flow(P_CASCADE_A, 5.2, -2.6)}>
                <circle r="5" fill="#34d399" opacity="0.2" /><circle r="2.2" fill="#a7f3d0" opacity="0.9" />
              </g>
              <g className="hv-travel" style={flow(P_CASCADE_B, 5.8, -1.4)}>
                <circle r="6" fill="#34d399" opacity="0.22" /><circle r="2.4" fill="#a7f3d0" />
              </g>
              <g className="hv-travel" style={flow(P_CASCADE_IN, 3.4, -0.9)}>
                <circle r="5" fill="#34d399" opacity="0.22" /><circle r="2.2" fill="#d1fae5" />
              </g>
              <g className="hv-travel" style={flow(P_MRNA_OUT, 6, -2.2)}>
                <circle r="5.5" fill="#fbbf24" opacity="0.22" /><circle r="2.4" fill="#fde68a" />
              </g>
              <g className="hv-travel" style={flow(P_VESICLE, 8, -3)}>
                <circle r="6" fill="#fda4af" opacity="0.2" /><circle r="3" fill="#fecdd3" />
              </g>

              {/* 胞质游离核糖体/分子微斑 */}
              <g fill="#cbd5e1">
                {([[252, 140], [236, 242], [334, 252], [388, 150], [302, 116], [272, 292], [352, 236], [318, 262]] as const).map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r={i % 2 ? 0.9 : 1.2} opacity={0.16 + (i % 3) * 0.05} />
                ))}
              </g>

              {/* 分泌融合位点（质膜内侧微脉冲） */}
              <g className="hv-soft-pulse" style={{ '--hv-pd': '2s' } as React.CSSProperties}>
                <circle cx="481" cy="210" r="4" fill="#fda4af" opacity="0.35" />
              </g>

              {/* 分子微标注（MAPK 级联节点名） */}
              <g fontFamily="var(--font-geist-mono, ui-monospace, monospace)" fontSize="6.5" letterSpacing="1">
                {NODE_LABELS.map((n) => (
                  <text key={n.text} x={n.x} y={n.y} fill={n.fill} opacity={n.opacity ?? 0.6}>{n.text}</text>
                ))}
              </g>
            </g>

            {/* 前景辉光景深（大光斑虚化） */}
            <circle cx="92" cy="82" r="26" fill="url(#hvBokehE)" />
            <circle cx="522" cy="304" r="30" fill="url(#hvBokehE)" />
            <circle cx="178" cy="372" r="22" fill="url(#hvBokehA)" />
            <circle cx="486" cy="88" r="18" fill="url(#hvBokehT)" />

            {/* 静态显微噪点（胶片颗粒, overlay 极低强度 —— 显微摄影质感） */}
            <rect width="560" height="420" filter="url(#hvGrain)" opacity="0.05" style={{ mixBlendMode: 'overlay' }} />
          </svg>

          {/* ==== 暗角（融入深色页面） ==== */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_56%,rgba(3,8,18,0.5)_100%)]" aria-hidden />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-[#030812]/45 to-transparent" aria-hidden />

          {/* ==== 扫描线（缓慢横扫） ==== */}
          <div className="hero-scanline pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-emerald-300/[0.09] to-transparent" />
          </div>

          {/* ==== 取景框四角 ==== */}
          {[
            'left-3 top-3 border-l-2 border-t-2 rounded-tl-xl',
            'right-3 top-3 border-r-2 border-t-2 rounded-tr-xl',
            'left-3 bottom-3 border-l-2 border-b-2 rounded-bl-xl',
            'right-3 bottom-3 border-r-2 border-b-2 rounded-br-xl',
          ].map((cls) => (
            <div key={cls} className={`pointer-events-none absolute h-7 w-7 border-emerald-400/60 ${cls}`} aria-hidden />
          ))}

          {/* ==== 左上 LIVE 徽标 ==== */}
          <div className="absolute left-5 top-5 flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-[#030812]/70 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.14em] text-emerald-300 backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            {zh ? '实时模拟视野 · LIVE' : 'SIMULATION VIEW · LIVE'}
          </div>

          {/* ==== 右上 视野参数徽标 ==== */}
          <div className="absolute right-5 top-5 hidden rounded-md border border-white/10 bg-[#030812]/60 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-slate-400 backdrop-blur-sm xl:block">
            <div>REALTIME · 60fps</div>
            <div className="text-emerald-300/80">KEGG · hsa04010</div>
          </div>

          {/* ==== 悬浮结构标注（引线 + 图版字母, 期刊图注惯例） ==== */}
          {ANNOTATIONS.map((a, i) => {
            // 引线几何: 标注点 → 芯片近角（dx 为芯片与点的水平间距; 长度取 78% 留出芯片间隙）
            const dx = a.chipSide === 'right' ? 12 : -12;
            const len = Math.hypot(dx, a.chipDy) * 0.78;
            const ang = (Math.atan2(a.chipDy, dx) * 180) / Math.PI;
            return (
              <motion.div
                key={a.key}
                className="pointer-events-none absolute"
                style={{ left: `${a.x}%`, top: `${a.y}%` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, y: [0, -5, 0] }}
                transition={{
                  opacity: { delay: 0.7 + i * 0.18, duration: 0.6 },
                  y: { repeat: Infinity, duration: 3.4 + i * 0.5, ease: 'easeInOut', delay: i * 0.4 },
                }}
                aria-hidden
              >
                {/* 标注点 */}
                <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full ring-2 ring-[#030812]/70" style={{ background: a.dot }} />
                <div className="absolute -left-2 -top-2 h-4 w-4 rounded-full" style={{ background: a.dot, opacity: 0.25 }} />
                {/* 引线（点 → 标签, 渐隐发丝线） */}
                <span
                  className="absolute left-0 top-0 h-px"
                  style={{
                    width: len,
                    transform: `rotate(${ang}deg)`,
                    transformOrigin: '0 0',
                    background: `linear-gradient(to right, ${a.dot}66, transparent)`,
                  }}
                />
                {/* 标签芯片（图版字母前缀 A-F） */}
                <div
                  className={`absolute ${a.chipSide === 'left' ? 'right-3 text-right' : 'left-3 text-left'} whitespace-nowrap rounded-md border bg-[#030812]/78 px-2 py-1 backdrop-blur-sm`}
                  style={{ top: a.chipDy, borderColor: `${a.dot}44` }}
                >
                  <span className="font-mono text-[10.5px] font-medium" style={{ color: a.dot }}>
                    <span className="mr-1 opacity-70">{String.fromCharCode(65 + i)}</span>
                    {zh ? a.zh : a.en}
                  </span>
                </div>
              </motion.div>
            );
          })}

          {/* ==== 内嵌底部图注条（图注 + 显微比例尺, 画面外零附属元素） ==== */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-[#030812]/92 via-[#030812]/45 to-transparent px-5 pb-3.5 pt-10">
            <span className="font-mono text-[10px] tracking-[0.14em] text-slate-400/90">
              {zh ? '图 1 · 信号转导纵览 — 从配体到基因表达' : 'FIG.1 · SIGNAL TRANSDUCTION — ligand to gene expression'}
            </span>
            {/* 显微比例尺 |—— 20 µm ——| */}
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-[9.5px] text-slate-400">
              <span className="relative block h-[7px] w-11" aria-hidden>
                <span className="absolute inset-x-0 top-1/2 h-px bg-slate-300/70" />
                <span className="absolute left-0 top-0 h-[7px] w-px bg-slate-300/70" />
                <span className="absolute right-0 top-0 h-[7px] w-px bg-slate-300/70" />
              </span>
              20 µm
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
