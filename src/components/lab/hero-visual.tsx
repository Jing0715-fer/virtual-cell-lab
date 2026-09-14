'use client';

import { motion } from 'framer-motion';
import { useLang } from '@/lib/i18n';

/**
 * Hero 右侧主视觉 —— AI 生成的细胞剖面渲染图 + 仪器化叠加层
 * （取景框角标 / LIVE 徽标 / 扫描线 / 悬浮细胞器标注 / 底部图例）
 * 悬浮标注用 framer-motion 轻微漂浮, 呼应"活体显微视野"主题
 */

/** 悬浮细胞器标注（双语, 定位按 1152×864 图中对应结构的大致位置） */
const ANNOTATIONS: {
  key: string;
  zh: string;
  en: string;
  dot: string;
  x: number; // %（相对容器）
  y: number; // %（相对容器, 标注点位置）
  chipSide: 'left' | 'right';
  chipDy: number; // 标签相对标注点的垂直偏移(px)
}[] = [
  { key: 'nucleus', zh: '细胞核 · 核仁', en: 'Nucleus · nucleolus', dot: '#fbbf24', x: 46, y: 34, chipSide: 'left', chipDy: -44 },
  { key: 'mito', zh: '线粒体 · 板层嵴', en: 'Mitochondria · cristae', dot: '#34d399', x: 24, y: 62, chipSide: 'left', chipDy: 10 },
  { key: 'golgi', zh: '高尔基体 · 扁囊堆', en: 'Golgi · cisternae', dot: '#2dd4bf', x: 72, y: 52, chipSide: 'right', chipDy: -12 },
  { key: 'er', zh: '内质网 · 核糖体', en: 'ER · ribosomes', dot: '#5eead4', x: 63, y: 72, chipSide: 'right', chipDy: 18 },
];

/** 底部图例条目 */
const LEGEND: { zh: string; en: string; color: string }[] = [
  { zh: '线粒体', en: 'Mitochondrion', color: '#34d399' },
  { zh: '高尔基体', en: 'Golgi', color: '#2dd4bf' },
  { zh: '内质网', en: 'ER', color: '#5eead4' },
  { zh: '细胞核', en: 'Nucleus', color: '#fbbf24' },
  { zh: '囊泡', en: 'Vesicles', color: '#94a3b8' },
];

export function HeroVisual() {
  const { lang } = useLang();
  const zh = lang === 'zh';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="relative hidden lg:block"
      aria-label={zh ? '虚拟细胞 3D 渲染主视觉' : 'Virtual cell 3D render'}
    >
      {/* ==== 外框 + 辉光 ==== */}
      <div className="absolute -inset-5 rounded-[28px] bg-emerald-500/[0.06] blur-2xl" aria-hidden />
      <div className="absolute -inset-px rounded-[22px] bg-gradient-to-b from-emerald-400/25 via-teal-400/10 to-transparent" aria-hidden />

      <div className="relative overflow-hidden rounded-[20px] border border-emerald-500/20 shadow-[0_24px_60px_-20px_rgba(16,185,129,0.28),0_0_0_1px_rgba(2,6,23,0.6)]">
        {/* ==== 主图（AI 渲染） ==== */}
        <img
          src="/hero-cell.png"
          alt={zh ? '动物细胞剖面 3D 渲染：细胞核、线粒体、高尔基体、内质网与囊泡的生物荧光视野' : '3D render of an animal cell cross-section with nucleus, mitochondria, Golgi, ER and vesicles in bioluminescent view'}
          width={840}
          height={630}
          className="block w-full select-none"
          draggable={false}
        />

        {/* ==== 暗角 + 顶底渐变（融入深色页面） ==== */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_52%,rgba(3,8,18,0.55)_100%)]" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#030812]/90 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#030812]/45 to-transparent" aria-hidden />

        {/* ==== 扫描线（缓慢横扫） ==== */}
        <div className="hero-scanline pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-emerald-300/[0.08] to-transparent" />
        </div>

        {/* ==== 取景框四角 ==== */}
        {[
          'left-2.5 top-2.5 border-l-2 border-t-2 rounded-tl-lg',
          'right-2.5 top-2.5 border-r-2 border-t-2 rounded-tr-lg',
          'left-2.5 bottom-2.5 border-l-2 border-b-2 rounded-bl-lg',
          'right-2.5 bottom-2.5 border-r-2 border-b-2 rounded-br-lg',
        ].map((cls) => (
          <div key={cls} className={`pointer-events-none absolute h-6 w-6 border-emerald-400/60 ${cls}`} aria-hidden />
        ))}

        {/* ==== 左上 LIVE 徽标 ==== */}
        <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-[#030812]/70 px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-emerald-300 backdrop-blur-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          {zh ? '3D 显微 · LIVE' : '3D MICROSCOPY · LIVE'}
        </div>

        {/* ==== 右上 视野参数徽标 ==== */}
        <div className="absolute right-4 top-4 hidden rounded-md border border-white/10 bg-[#030812]/60 px-2 py-1 font-mono text-[9.5px] leading-tight text-slate-400 backdrop-blur-sm xl:block">
          <div>×4,000 · 60fps</div>
          <div className="text-emerald-300/80">EM-TL · 488nm</div>
        </div>

        {/* ==== 悬浮细胞器标注 ==== */}
        {ANNOTATIONS.map((a, i) => (
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
            {/* 标签芯片 */}
            <div
              className={`absolute ${a.chipSide === 'left' ? 'right-3 text-right' : 'left-3 text-left'} whitespace-nowrap rounded-md border bg-[#030812]/78 px-2 py-1 backdrop-blur-sm`}
              style={{ top: a.chipDy, borderColor: `${a.dot}44` }}
            >
              <span className="font-mono text-[10px] font-medium" style={{ color: a.dot }}>
                {zh ? a.zh : a.en}
              </span>
            </div>
          </motion.div>
        ))}

        {/* ==== 底部图例 ==== */}
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-3.5 gap-y-1 px-4 pb-3">
          {LEGEND.map((l) => (
            <span key={l.en} className="flex items-center gap-1.5 font-mono text-[9.5px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.color }} />
              {zh ? l.zh : l.en}
            </span>
          ))}
          <span className="ml-auto font-mono text-[9px] tracking-wider text-slate-600">VirtualCell Lab · Render 001</span>
        </div>
      </div>

      {/* ==== 外框下方微标题（仪器铭牌） ==== */}
      <div className="mt-3 flex items-center justify-between px-1">
        <span className="font-mono text-[10px] tracking-[0.18em] text-slate-600">
          {zh ? '图 1 · 虚拟细胞全景视野' : 'FIG.1 · VIRTUAL CELL OVERVIEW'}
        </span>
        <span className="font-mono text-[10px] text-slate-600">Ø 20 µm · eukaryote</span>
      </div>
    </motion.div>
  );
}
