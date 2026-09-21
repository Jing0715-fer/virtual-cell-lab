'use client';

/* ============ v60 细胞器图鉴面板（Organelle Atlas panel） ============
 * 双语四维百科（结构/功能/临床/标志物）+ 与 3D 悬停锚点（HoverTarget.latin）联动定位:
 *   「在细胞中定位」→ 宿主 locateTarget() → FlyToController 1.2s 相机飞行 + 脉冲高亮。
 * 未在当前细胞类型呈现的结构以禁用态保留（学习完整性优先 —— 图鉴独立于 3D 资产存在）。
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BookMarked, X, Search, LocateFixed, Ruler, Dna, Stethoscope, FlaskConical, ChevronDown } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import {
  ORG_ATLAS,
  ATLAS_GROUP_ORDER,
  ATLAS_GROUP_LABEL,
  type OrgAtlasEntry,
  type AtlasGroup,
} from '@/data/organelle-atlas';
import type { HoverTarget } from './hover-labels';

const ACCENT_DOT: Record<OrgAtlasEntry['accent'], string> = {
  emerald: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]',
  teal: 'bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.7)]',
  amber: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]',
  rose: 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.7)]',
  fuchsia: 'bg-fuchsia-400 shadow-[0_0_6px_rgba(232,121,249,0.7)]',
  slate: 'bg-slate-400 shadow-[0_0_6px_rgba(148,163,184,0.7)]',
};

const ACCENT_BTN: Record<OrgAtlasEntry['accent'], string> = {
  emerald: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25',
  teal: 'border-teal-400/50 bg-teal-500/15 text-teal-200 hover:bg-teal-500/25',
  amber: 'border-amber-400/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25',
  rose: 'border-rose-400/50 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25',
  fuchsia: 'border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-200 hover:bg-fuchsia-500/25',
  slate: 'border-slate-400/50 bg-slate-500/15 text-slate-200 hover:bg-slate-500/25',
};

function Field({
  icon: Icon,
  label,
  text,
}: {
  icon: typeof Ruler;
  label: string;
  text: string;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wider text-slate-500">
        <Icon className="h-2.5 w-2.5 shrink-0" />
        {label}
      </div>
      <p className="text-[9.5px] leading-relaxed text-slate-300">{text}</p>
    </div>
  );
}

function AtlasItem({
  entry,
  present,
  onLocate,
  located,
}: {
  entry: OrgAtlasEntry;
  present: HoverTarget | undefined;
  onLocate: (t: HoverTarget) => void;
  located: boolean;
}) {
  const { lang, t } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`rounded-lg border transition ${
        open ? 'border-white/15 bg-white/[0.045]' : 'border-transparent hover:border-white/10 hover:bg-white/[0.025]'
      } ${present ? '' : 'opacity-70'}`}
    >
      {/* 条目头（点击展开/收起） */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={t('atlas.expandHint')}
        className="flex w-full items-center gap-1.5 px-1.5 py-1.5 text-left"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ACCENT_DOT[entry.accent]}`} />
        <span className={`shrink-0 text-[10px] font-medium ${present ? 'text-slate-200' : 'text-slate-400'}`}>
          {lang === 'zh' ? entry.zh : entry.latin}
        </span>
        {lang === 'zh' && <span className="truncate text-[7.5px] italic text-slate-600">{entry.latin}</span>}
        {/* 可用性徽标: 在场 ✓ / 缺席 ⊘ */}
        <span
          className={`ml-auto shrink-0 font-mono text-[7px] ${present ? 'text-emerald-400/80' : 'text-slate-600'}`}
          title={present ? t('atlas.locate') : t('atlas.absent')}
        >
          {present ? '●' : '○'}
        </span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-slate-600 transition-transform ${open ? 'rotate-180 text-slate-300' : ''}`}
        />
      </button>
      {/* 展开体（grid-rows 手风琴 —— 见 globals.css .atlas-item-body） */}
      <div className="atlas-item-body" data-open={open}>
        <div>
          <div className="space-y-2 px-2 pb-2.5 pt-1">
            <div className="flex items-center gap-1.5 rounded-md border border-white/8 bg-black/25 px-2 py-1">
              <Ruler className="h-2.5 w-2.5 shrink-0 text-slate-500" />
              <span className="text-[8.5px] leading-tight text-slate-400">{lang === 'zh' ? entry.size.zh : entry.size.en}</span>
            </div>
            <Field icon={Dna} label={t('atlas.structure')} text={lang === 'zh' ? entry.structure.zh : entry.structure.en} />
            <Field icon={FlaskConical} label={t('atlas.physiology')} text={lang === 'zh' ? entry.physiology.zh : entry.physiology.en} />
            <Field icon={Stethoscope} label={t('atlas.clinic')} text={lang === 'zh' ? entry.clinic.zh : entry.clinic.en} />
            <Field icon={FlaskConical} label={t('atlas.marker')} text={lang === 'zh' ? entry.marker.zh : entry.marker.en} />
            {/* 定位按钮: 在场结构 → 相机飞行 + 脉冲; 缺席 → 禁用态 + 缺席说明 */}
            {present ? (
              <button
                onClick={() => onLocate(present)}
                className={`atlas-locate-btn flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[9px] font-medium transition ${ACCENT_BTN[entry.accent]} ${
                  located ? 'is-located' : ''
                }`}
              >
                <LocateFixed className="h-3 w-3" />
                {t('atlas.locate')}
              </button>
            ) : (
              <p className="rounded-md border border-dashed border-white/10 px-2 py-1.5 text-center text-[8.5px] text-slate-600">
                {t('atlas.absent')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OrganelleAtlasPanel({
  open,
  onClose,
  hoverTargets,
  onLocate,
}: {
  open: boolean;
  onClose: () => void;
  /** 当前细胞类型的 3D 悬停锚点全集（定位联动 + 在场判定） */
  hoverTargets: HoverTarget[];
  onLocate: (t: HoverTarget) => void;
}) {
  const { lang, t } = useLang();
  const [query, setQuery] = useState('');
  const [locatedLatin, setLocatedLatin] = useState('');
  /* v61 在场筛选: 全部 / 仅在场（当前细胞类型呈现的） —— 特化结构续编后 47 条全量过长 */
  const [presenceFilter, setPresenceFilter] = useState<'all' | 'present'>('all');
  // 无障碍: 用户系统偏好减动效时退化为纯淡入（无位移/缩放）
  const reduceMotion = useReducedMotion();

  // latin → 首个悬停锚点（同名多锚点取其一即可 —— 飞行目标等价）
  const targetByLatin = useMemo(() => {
    const m = new Map<string, HoverTarget>();
    for (const ht of hoverTargets) if (!m.has(ht.latin)) m.set(ht.latin, ht);
    return m;
  }, [hoverTargets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ORG_ATLAS.filter((e) => {
      if (presenceFilter === 'present' && !targetByLatin.has(e.latin)) return false;
      if (!q) return true;
      return e.latin.toLowerCase().includes(q) || e.zh.includes(query.trim()) || e.group.includes(q);
    });
  }, [query, presenceFilter, targetByLatin]);

  const presentCount = useMemo(() => {
    let n = 0;
    for (const e of ORG_ATLAS) if (targetByLatin.has(e.latin)) n++;
    return n;
  }, [targetByLatin]);

  const handleLocate = (ht: HoverTarget) => {
    onLocate(ht);
    setLocatedLatin(ht.latin);
    window.setTimeout(() => setLocatedLatin((cur) => (cur === ht.latin ? '' : cur)), 1500);
  };

  return (
    <AnimatePresence>
      {open && (
    <motion.div
      role="dialog"
      aria-label={t('atlas.title')}
      initial={reduceMotion ? { opacity: 0, y: '-50%' } : { opacity: 0, x: 18, scale: 0.98, y: '-50%' }}
      animate={reduceMotion ? { opacity: 1, y: '-50%' } : { opacity: 1, x: 0, scale: 1, y: '-50%' }}
      exit={reduceMotion ? { opacity: 0, y: '-50%' } : { opacity: 0, x: 18, scale: 0.98, y: '-50%' }}
      transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
      className="absolute right-3 top-1/2 z-20 w-[min(92vw,336px)]"
    >
      <div className="flex max-h-[72vh] flex-col rounded-xl border border-emerald-500/25 bg-slate-950/90 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-lg">
        {/* 标题行 */}
        <div className="flex items-center gap-1.5 border-b border-white/8 px-2.5 py-2">
          <BookMarked className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span className="text-[11px] font-semibold text-slate-100">{t('atlas.title')}</span>
          <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-px font-mono text-[8px] leading-tight text-emerald-300">
            {ORG_ATLAS.length} {t('atlas.entries')}
          </span>
          <button
            onClick={onClose}
            aria-label={t('atlas.title')}
            className="ml-auto rounded-md border border-white/10 bg-white/5 p-1 text-slate-500 transition hover:text-rose-300"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        {/* 搜索框 */}
        <div className="border-b border-white/8 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2 py-1 focus-within:border-emerald-400/40">
            <Search className="h-3 w-3 shrink-0 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('atlas.search')}
              className="w-full bg-transparent text-[9.5px] text-slate-200 placeholder:text-slate-600 focus:outline-none"
              aria-label={t('atlas.search')}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="clear"
                className="shrink-0 text-slate-600 transition hover:text-slate-300"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1 text-[8px] text-slate-500">
            <span className="font-mono text-emerald-400/70">{presentCount}</span>
            <span>· {t('atlas.subtitle')}</span>
            {/* v61 在场筛选 chips（全部 / 仅在场） */}
            <span className="ml-auto flex items-center gap-1">
              {(['all', 'present'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setPresenceFilter(f)}
                  aria-pressed={presenceFilter === f}
                  className={`rounded-full border px-1.5 py-px text-[8px] transition ${
                    presenceFilter === f
                      ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                      : 'border-white/10 bg-white/[0.03] text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {t(f === 'all' ? 'atlas.filterAll' : 'atlas.filterPresent')}
                </button>
              ))}
            </span>
          </p>
        </div>
        {/* 分组条目列表 */}
        <div className="lab-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="px-2 py-6 text-center text-[9.5px] text-slate-600">{t('atlas.noResults')}</p>
          )}
          {ATLAS_GROUP_ORDER.map((gk) => {
            const items = filtered.filter((e) => e.group === gk);
            if (items.length === 0) return null;
            /* v61 分组在场计数徽章（如 3/5 —— 换细胞类型即时感知「哪些组在场」） */
            const gkPresent = items.filter((e) => targetByLatin.has(e.latin)).length;
            return (
              <div key={gk}>
                <div className="mb-1 flex items-center gap-1.5 px-1 text-[8px] font-semibold uppercase tracking-wider text-slate-500">
                  <span className="truncate">{ATLAS_GROUP_LABEL[gk][lang]}</span>
                  <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-1 py-px font-mono text-[7px] font-normal normal-case tracking-normal text-slate-500">
                    <span className={gkPresent > 0 ? 'text-emerald-400/80' : ''}>{gkPresent}</span>/{items.length}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {items.map((e) => (
                    <AtlasItem
                      key={e.latin}
                      entry={e}
                      present={targetByLatin.get(e.latin)}
                      onLocate={handleLocate}
                      located={locatedLatin === e.latin}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
