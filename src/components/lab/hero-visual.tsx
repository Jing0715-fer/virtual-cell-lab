'use client';

import { motion } from 'framer-motion';
import { useLang } from '@/lib/i18n';

/**
 * Hero 右侧主视觉 —— 网络检索的科学插画（有丝分裂后期细胞, StockCake 免版税图源） + 仪器化叠加层
 * （取景框角标 / LIVE 徽标 / 扫描线 / 悬浮结构标注 / 内嵌图注与显微比例尺）
 * 画面之外零附属条目: 图注与比例尺内嵌于画面底部, 整幅图即右栏主体（大画幅呈现）
 */

/** 悬浮结构标注（双语, 定位按 4:3 裁切视窗估算: 细胞主体居中） */
const ANNOTATIONS: {
  key: string;
  zh: string;
  en: string;
  dot: string;
  x: number; // %（相对图片视窗）
  y: number;
  chipSide: 'left' | 'right';
  chipDy: number; // 标签相对标注点的垂直偏移(px)
}[] = [
  { key: 'chromosome', zh: '染色体 · 极向分离', en: 'Chromosomes · poleward', dot: '#34d399', x: 38, y: 56, chipSide: 'left', chipDy: 8 },
  { key: 'spindle', zh: '纺锤丝 · 微管牵引', en: 'Spindle · microtubules', dot: '#fbbf24', x: 55, y: 49, chipSide: 'right', chipDy: -34 },
  { key: 'mito', zh: '线粒体 · ATP 供给', en: 'Mitochondria · ATP', dot: '#22d3ee', x: 82, y: 34, chipSide: 'left', chipDy: -10 },
  { key: 'furrow', zh: '缢裂沟 · 胞质分裂', en: 'Cleavage furrow', dot: '#5eead4', x: 50, y: 38, chipSide: 'left', chipDy: -38 },
];

export function HeroVisual() {
  const { lang } = useLang();
  const zh = lang === 'zh';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="hidden lg:block"
      aria-label={zh ? '虚拟细胞科学插画主视觉' : 'Virtual cell scientific illustration'}
    >
      {/* ==== 外框 + 辉光 ==== */}
      <div className="relative">
        <div className="absolute -inset-6 rounded-[34px] bg-emerald-500/[0.07] blur-3xl" aria-hidden />
        <div className="absolute -inset-px rounded-[26px] bg-gradient-to-b from-emerald-400/25 via-teal-400/10 to-transparent" aria-hidden />

        <div className="relative overflow-hidden rounded-[24px] border border-emerald-500/20 shadow-[0_28px_70px_-24px_rgba(16,185,129,0.32),0_0_0_1px_rgba(2,6,23,0.6)]">
          {/* ==== 主图（网络检索科学插画 · 有丝分裂后期, 大画幅） ==== */}
          <img
            src="/hero-cell.jpg"
            alt={zh ? '动物细胞有丝分裂后期 3D 科学插画：染色体极向分离、纺锤丝牵引、线粒体供能、缢裂沟形成' : '3D scientific illustration of an animal cell in mitotic anaphase: poleward chromosomes, spindle microtubules, mitochondria, cleavage furrow'}
            width={560}
            height={420}
            fetchPriority="high"
            decoding="async"
            className="block aspect-[4/3] w-full select-none object-cover"
            draggable={false}
          />

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
            {zh ? '活细胞视野 · LIVE' : 'LIVING VIEW · LIVE'}
          </div>

          {/* ==== 右上 视野参数徽标 ==== */}
          <div className="absolute right-5 top-5 hidden rounded-md border border-white/10 bg-[#030812]/60 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-slate-400 backdrop-blur-sm xl:block">
            <div>×4,000 · 60fps</div>
            <div className="text-emerald-300/80">CONF · TL 488nm</div>
          </div>

          {/* ==== 悬浮结构标注 ==== */}
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
                <span className="font-mono text-[10.5px] font-medium" style={{ color: a.dot }}>
                  {zh ? a.zh : a.en}
                </span>
              </div>
            </motion.div>
          ))}

          {/* ==== 内嵌底部图注条（图注 + 显微比例尺, 画面外零附属元素） ==== */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-[#030812]/92 via-[#030812]/45 to-transparent px-5 pb-3.5 pt-10">
            <span className="font-mono text-[10px] tracking-[0.14em] text-slate-400/90">
              {zh ? '图 1 · 有丝分裂后期 — 生长信号级联的终点' : 'FIG.1 · MITOTIC ANAPHASE — where growth cascades arrive'}
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
