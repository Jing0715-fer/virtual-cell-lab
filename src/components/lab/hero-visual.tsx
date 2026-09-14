'use client';

import { motion } from 'framer-motion';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import { useLabStore } from '@/store/lab-store';
import { cn } from '@/lib/utils';

/**
 * Hero 右侧主视觉 —— 网络检索的科学插画（有丝分裂后期细胞, StockCake 免版税图源） + 仪器化叠加层
 * （取景框角标 / LIVE 徽标 / 扫描线 / 悬浮结构标注 / 底部图例）
 * 图下方附"分裂驱动级联"快捷面板: 一键选通路并跳转实验台, 填充右栏垂直空白
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
  { key: 'mito', zh: '线粒体 · ATP 供给', en: 'Mitochondria · ATP', dot: '#22d3ee', x: 82, y: 34, chipSide: 'right', chipDy: -10 },
  { key: 'furrow', zh: '缢裂沟 · 胞质分裂', en: 'Cleavage furrow', dot: '#5eead4', x: 50, y: 38, chipSide: 'left', chipDy: -38 },
];

/** 图下快捷面板: 分裂驱动的信号级联（点击即选通路 + 滚动到实验台） */
const DRIVERS: {
  id: string;
  zh: string;
  en: string;
  note: { zh: string; en: string };
  dot: string;
}[] = [
  { id: 'hsa04010', zh: 'MAPK 级联', en: 'MAPK cascade', note: { zh: '增殖信号主通路', en: 'Proliferation driver' }, dot: '#34d399' },
  { id: 'hsa04110', zh: '细胞周期', en: 'Cell cycle', note: { zh: 'CDK 检查点引擎', en: 'CDK checkpoints' }, dot: '#22d3ee' },
  { id: 'hsa04115', zh: 'p53 通路', en: 'p53 pathway', note: { zh: '基因组卫士 · 检查点', en: 'Guardian checkpoint' }, dot: '#fbbf24' },
];

export function HeroVisual() {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const pathwayId = useLabStore((s) => s.pathwayId);
  const selectPathway = useLabStore((s) => s.selectPathway);

  /** 快捷选通路并滚动到实验台 */
  const jump = (id: string) => {
    selectPathway(id);
    document.getElementById('lab')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="hidden lg:flex lg:flex-col"
      aria-label={zh ? '虚拟细胞科学插画主视觉' : 'Virtual cell scientific illustration'}
    >
      {/* ==== 外框 + 辉光 ==== */}
      <div className="relative">
        <div className="absolute -inset-5 rounded-[28px] bg-emerald-500/[0.06] blur-2xl" aria-hidden />
        <div className="absolute -inset-px rounded-[22px] bg-gradient-to-b from-emerald-400/25 via-teal-400/10 to-transparent" aria-hidden />

        <div className="relative overflow-hidden rounded-[20px] border border-emerald-500/20 shadow-[0_24px_60px_-20px_rgba(16,185,129,0.28),0_0_0_1px_rgba(2,6,23,0.6)]">
          {/* ==== 主图（网络检索科学插画 · 有丝分裂后期） ==== */}
          <img
            src="/hero-cell.jpg"
            alt={zh ? '动物细胞有丝分裂后期 3D 科学插画：染色体极向分离、纺锤丝牵引、线粒体供能、缢裂沟形成' : '3D scientific illustration of an animal cell in mitotic anaphase: poleward chromosomes, spindle microtubules, mitochondria, cleavage furrow'}
            width={560}
            height={420}
            className="block aspect-[4/3] w-full select-none object-cover"
            draggable={false}
          />

          {/* ==== 暗角 + 顶底渐变（融入深色页面） ==== */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_54%,rgba(3,8,18,0.5)_100%)]" aria-hidden />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#030812]/85 to-transparent" aria-hidden />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-[#030812]/45 to-transparent" aria-hidden />

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
            {zh ? '活细胞视野 · LIVE' : 'LIVING VIEW · LIVE'}
          </div>

          {/* ==== 右上 视野参数徽标 ==== */}
          <div className="absolute right-4 top-4 hidden rounded-md border border-white/10 bg-[#030812]/60 px-2 py-1 font-mono text-[9.5px] leading-tight text-slate-400 backdrop-blur-sm xl:block">
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
                <span className="font-mono text-[10px] font-medium" style={{ color: a.dot }}>
                  {zh ? a.zh : a.en}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ==== 外框下方微标题（仪器铭牌） ==== */}
        <div className="mt-2.5 flex items-center justify-between px-1">
          <span className="font-mono text-[10px] tracking-[0.16em] text-slate-600">
            {zh ? '图 1 · 有丝分裂后期 — 生长信号级联的终点' : 'FIG.1 · MITOTIC ANAPHASE — where growth cascades arrive'}
          </span>
          <span className="font-mono text-[10px] text-slate-600">Ø 20 µm</span>
        </div>
      </div>

      {/* ==== 分裂驱动级联 · 快捷面板（填充右栏 + 一键直达实验台） ==== */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.6 }}
        className="mt-5 rounded-2xl border border-white/8 bg-slate-950/50 p-4"
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10.5px] tracking-[0.14em] text-emerald-400/80">
            {zh ? '分裂由这些级联驱动' : 'DIVISION IS DRIVEN BY'}
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-slate-600" aria-hidden />
        </div>
        <div className="mt-3 space-y-2">
          {DRIVERS.map((d) => {
            const active = pathwayId === d.id;
            return (
              <button
                key={d.id}
                onClick={() => jump(d.id)}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all duration-250',
                  active
                    ? 'border-emerald-500/50 bg-emerald-500/[0.08]'
                    : 'border-white/8 bg-white/[0.02] hover:border-emerald-500/30 hover:bg-emerald-500/[0.05]',
                )}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.dot, boxShadow: `0 0 6px ${d.dot}66` }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-[12.5px] font-medium', active ? 'text-emerald-200' : 'text-slate-200')}>
                    {zh ? d.zh : d.en}
                  </span>
                  <span className="block truncate text-[10px] text-slate-500">{zh ? d.note.zh : d.note.en}</span>
                </span>
                <span className="font-mono text-[9px] text-slate-600">{d.id}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600 transition-transform duration-250 group-hover:translate-x-0.5 group-hover:text-emerald-400" aria-hidden />
              </button>
            );
          })}
        </div>
        <p className="mt-3 border-t border-white/5 pt-2.5 text-[10px] leading-4 text-slate-600">
          {zh ? '点击任一级联 → 装配对应虚拟细胞并在 3D 视野中运行模拟' : 'Click a cascade → the virtual cell assembles and runs the simulation in 3D'}
        </p>
      </motion.div>
    </motion.div>
  );
}
