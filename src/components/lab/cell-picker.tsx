'use client';

/**
 * 细胞系选择器 —— 7 种虚拟细胞卡片（含微形态学图标）
 */
import { Check, Dna, Microscope, Zap } from 'lucide-react';
import { CELL_TYPES, type MorphologyKey } from '@/data/cell-types';
import { pathwayActivity } from '@/data/pathway-cell-matrix';
import { useLabStore } from '@/store/lab-store';
import { useLang } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/** 微型细胞形态示意（卡片图标） */
function CellGlyph({ morph }: { morph: MorphologyKey }) {
  const stroke = '#2dd4bf';
  const fill = 'rgba(45,212,191,0.10)';
  switch (morph) {
    case 'hepatocyte':
      return (
        <svg viewBox="0 0 64 44" className="h-11 w-16">
          <rect x="8" y="8" width="48" height="30" rx="9" fill={fill} stroke={stroke} />
          <circle cx="24" cy="24" r="6.5" fill="none" stroke="#34d399" />
          <circle cx="44" cy="22" r="4.5" fill="none" stroke="#34d399" />
          <circle cx="18" cy="16" r="1.6" fill="#f59e0b" /><circle cx="46" cy="30" r="1.6" fill="#f59e0b" />
        </svg>
      );
    case 'neuron':
      return (
        <svg viewBox="0 0 64 44" className="h-11 w-16">
          <path d="M22 26 C 16 10 10 8 6 4 M22 26 C 24 8 22 6 22 2 M22 26 C 28 10 34 8 40 4" stroke={stroke} strokeWidth="1.6" fill="none" />
          <circle cx="24" cy="28" r="9" fill={fill} stroke={stroke} />
          <path d="M33 28 L 60 28" stroke={stroke} strokeWidth="2.4" />
          <rect x="40" y="25" width="6" height="6" rx="2" fill="none" stroke="#94a3b8" />
          <rect x="50" y="25" width="6" height="6" rx="2" fill="none" stroke="#94a3b8" />
        </svg>
      );
    case 'tcell':
      return (
        <svg viewBox="0 0 64 44" className="h-11 w-16">
          <circle cx="32" cy="24" r="13" fill={fill} stroke={stroke} />
          <circle cx="32" cy="24" r="7.5" fill="rgba(52,211,153,0.16)" stroke="#34d399" />
          {[-3, -2, -1, 0, 1, 2, 3].map((i) => (
            <line key={i} x1={32 + i * 4.6} y1={12} x2={32 + i * 4.6 + i} y2={7} stroke={stroke} strokeWidth="1.3" />
          ))}
        </svg>
      );
    case 'epithelial':
      return (
        <svg viewBox="0 0 64 44" className="h-11 w-16">
          <path d="M18 14 L18 34 Q 18 38 24 38 L 44 38 Q 48 38 48 34 L 48 14" fill={fill} stroke={stroke} />
          {Array.from({ length: 7 }, (_, i) => (
            <line key={i} x1={20 + i * 4.6} y1={14} x2={20 + i * 4.6} y2={9} stroke="#5eead4" strokeWidth="1.2" />
          ))}
          <circle cx="33" cy="29" r="5" fill="none" stroke="#34d399" />
        </svg>
      );
    case 'cardiomyocyte':
      return (
        <svg viewBox="0 0 64 44" className="h-11 w-16">
          <rect x="6" y="14" width="52" height="18" rx="8" fill={fill} stroke="#f43f5e" />
          {Array.from({ length: 9 }, (_, i) => (
            <rect key={i} x={12 + i * 5.4} y={16} width={1.8} height={14} fill="#f87171" opacity="0.65" />
          ))}
          <path d="M 50 14 l 6 5 l -6 5 l 6 5" stroke="#f43f5e" strokeWidth="1.4" fill="none" />
          <circle cx="28" cy="23" r="4.4" fill="none" stroke="#fb7185" />
        </svg>
      );
    case 'fibroblast':
      return (
        <svg viewBox="0 0 64 44" className="h-11 w-16">
          <path d="M6 24 Q 20 6 32 22 Q 44 38 58 20" fill="none" stroke="#a3e635" strokeWidth="2" />
          <ellipse cx="32" cy="22" rx="10" ry="6" fill={fill} stroke="#a3e635" />
          <path d="M 24 22 q 3 -3 6 0 t 6 0" stroke="#5eead4" strokeWidth="1.2" fill="none" />
        </svg>
      );
    case 'cancer':
      return (
        <svg viewBox="0 0 64 44" className="h-11 w-16">
          <path
            d="M14 12 C 10 20 14 30 20 33 C 24 39 36 40 42 35 C 50 37 54 26 50 18 C 52 10 44 6 38 10 C 32 4 20 6 18 12 Z"
            fill="rgba(244,63,94,0.10)" stroke="#f43f5e"
          />
          <circle cx="28" cy="22" r="6" fill="none" stroke="#fb7185" />
          <circle cx="41" cy="18" r="4" fill="none" stroke="#fb7185" />
          <circle cx="38" cy="30" r="3.4" fill="none" stroke="#fb7185" />
        </svg>
      );
  }
}

export function CellPicker() {
  const { t, lang } = useLang();
  const cellId = useLabStore((s) => s.cellId);
  const setCell = useLabStore((s) => s.setCell);
  const { toast } = useToast();

  const pickCell = (id: string) => {
    // 通路 × 细胞类型表达约束: 当前通路在新细胞未检出 → store 将自动切换特征通路，这里给出提示
    const pid = useLabStore.getState().pathwayId;
    if (pid && pathwayActivity(pid, id) === 'inactive') {
      toast({
        title: t('pw.autoSwitched'),
        description: t('pw.warnBody'),
        duration: 4200,
      });
    }
    setCell(id);
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
      {CELL_TYPES.map((c) => {
        const active = cellId === c.id;
        return (
          <button
            key={c.id}
            onClick={() => pickCell(c.id)}
            onMouseMove={(e) => {
              // 边框光随鼠标方向: --mx/--my 写入卡片元素（与 METHOD 卡同范式 —— 全页 hover 韵律统一, 无 re-render）
              const r = e.currentTarget.getBoundingClientRect();
              e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
              e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
            }}
            className={cn(
              'group relative overflow-hidden rounded-2xl border p-3.5 text-left transition-all duration-300 hover:-translate-y-0.5',
              active
                ? 'border-emerald-500/60 bg-gradient-to-b from-emerald-500/[0.12] to-slate-950/60 shadow-[0_0_24px_rgba(52,211,153,0.18)]'
                : 'border-white/8 bg-slate-950/40 hover:border-emerald-500/35 hover:bg-white/[0.04]',
            )}
          >
            {/* 鼠标方向内衬柔光 + 边框环带光（非选中卡 hover 亮起 —— 与 METHOD 卡同款范式, 韵律统一） */}
            <span aria-hidden className="method-card-glow pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <span aria-hidden className="method-border-light pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            {/* 顶部荧光细线（hover 加亮, 图卡顶部封口） */}
            <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="flex items-start justify-between">
              <CellGlyph morph={c.morphology} />
              {active ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/25 text-emerald-300">
                  <Check className="h-3 w-3" />
                </span>
              ) : c.mutations ? (
                <Zap className="h-4 w-4 text-rose-400/70" />
              ) : (
                <Microscope className="h-4 w-4 text-slate-600" />
              )}
            </div>
            <div className="mt-2.5">
              <div className={cn('text-[13.5px] font-semibold', active ? 'text-emerald-200' : 'text-slate-100')}>{lang === 'zh' ? c.name : c.nameEn}</div>
              {/* 副标题: zh 模式下展示英文名（双语设计）; EN 模式标题已是英文, 副标题隐藏避免中文名泄漏 */}
              {lang === 'zh' && <div className="text-[10.5px] text-slate-500">{c.nameEn}</div>}
            </div>
            <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-slate-400">{lang === 'zh' ? c.tagline : c.taglineEn}</p>
            <div className="mt-2.5 flex flex-wrap gap-1">
              <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-px font-mono text-[9px] text-slate-500">
                <Dna className="mr-0.5 inline h-2.5 w-2.5" />
                {c.marker}
              </span>
              <span className={cn(
                'rounded border px-1.5 py-px font-mono text-[9px]',
                c.mutations ? 'border-rose-500/30 text-rose-300/80' : 'border-white/10 text-slate-500',
              )}>
                {c.pathways.length} {t('cells.pathways')}
              </span>
            </div>
            {/* 底部特征条 */}
            <div className="mt-2.5 border-t border-white/5 pt-2">
              <p className="truncate font-mono text-[9.5px] text-slate-600">
                {lang === 'zh'
                  ? `${c.features[0].label}: ${c.features[0].value}`
                  : `${c.features[0].labelEn}: ${c.features[0].valueEn}`}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
