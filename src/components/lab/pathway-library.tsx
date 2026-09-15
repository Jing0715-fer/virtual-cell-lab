'use client';

/**
 * 通路库 —— 左侧面板：当前细胞档案 + 通路列表
 *   a) 策划级通路（13 条信号转导，含适配/教学徽标、种子统计、级联摘要）
 *   b) KEGG 全量目录（372 条人类通路按顶级分类分组，默认折叠，紧凑单行）
 *   - 顶部搜索：跨策划+全量按 名称/中文名/ID 即时过滤（大小写不敏感）
 */
import { FlaskConical, ChevronRight, ChevronDown, Database, GitBranch, Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { PATHWAY_CATALOG } from '@/data/pathway-catalog';
import { KEGG_FULL_LIST, KEGG_FULL_MAP, KEGG_CATEGORY_ORDER, type FullPathwayEntry } from '@/data/kegg-full-catalog';
import { CELL_TYPE_MAP } from '@/data/cell-types';
import { useLabStore } from '@/store/lab-store';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** 具有手工策划教学级联的通路（与 guided-tour.ts CURATED_TOURS 同步） */
const CURATED_TOUR_PATHWAYS = new Set([
  'hsa04010', 'hsa04151', 'hsa04630', 'hsa04024', 'hsa04350', 'hsa04310', 'hsa04330',
  'hsa04150', 'hsa04064', 'hsa04210', 'hsa04115', 'hsa04152', 'hsa04020',
  'hsa04370', 'hsa04390', 'hsa04066', 'hsa04068', 'hsa04620', 'hsa04110', 'hsa04012',
]);

/** 全量目录中排除策划条目后的列表（策划组已展示，避免重复） */
const FULL_NON_CURATED = KEGG_FULL_LIST.filter((p) => !p.curated);

/** EN 模式顶级分类排序（与 KEGG_CATEGORY_ORDER 的 zh 分类一一对应） */
const TOP_ORDER_EN = [
  'Metabolism',
  'Genetic Information Processing',
  'Environmental Information Processing',
  'Cellular Processes',
  'Organismal Systems',
  'Human Diseases',
];

/** 全量目录目录行（API 返回的统计挂接源） */
interface CatalogStats {
  geneCount: number;
  relationCount: number;
  coreCount: number;
}

/** 全量分组结构：顶级分类 → 子类 → 条目 */
interface FullGroup {
  top: string;
  count: number;
  subs: { sub: string; items: FullPathwayEntry[] }[];
}

export function PathwayLibrary() {
  const { t, lang } = useLang();
  const cellId = useLabStore((s) => s.cellId);
  const pathwayId = useLabStore((s) => s.pathwayId);
  const selectPathway = useLabStore((s) => s.selectPathway);
  const cell = CELL_TYPE_MAP.get(cellId);

  const [query, setQuery] = useState('');
  const [openFullGroups, setOpenFullGroups] = useState<Set<string>>(new Set());
  /** 当前搜索词是否命中（渲染层空态判断用） */
  const searching = query.trim().length > 0;
  const q = query.trim().toLowerCase();

  // KEGG 目录统计（含缓存状态演示）
  const { data, isError } = useQuery({
    queryKey: ['pathway-catalog'],
    queryFn: async () => {
      const res = await fetch('/api/pathways');
      if (!res.ok) throw new Error('目录获取失败');
      return (await res.json()) as { pathways: { id: string; stats?: CatalogStats | null }[] };
    },
    staleTime: 5 * 60 * 1000,
  });
  const statsMap = new Map((data?.pathways ?? []).map((p) => [p.id, p.stats]));

  // 当前细胞适配通路优先
  const recommended = cell?.pathways ?? [];

  // 策划级分组（搜索时仅保留命中条目；分组标题按语言取 zh category / 全量目录 categoryEn）
  const curatedGroups = useMemo(() => {
    const hit = (name: string, nameZh: string, id: string) =>
      !q || name.toLowerCase().includes(q) || nameZh.toLowerCase().includes(q) || id.toLowerCase().includes(q);
    const groups = new Map<string, typeof PATHWAY_CATALOG>();
    for (const p of PATHWAY_CATALOG) {
      if (!hit(p.name, p.nameZh, p.id)) continue;
      const cat =
        lang === 'en'
          ? KEGG_FULL_MAP.get(p.id)?.categoryEn.split('; ').join(' · ') ?? p.category
          : p.category;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(p);
    }
    return groups;
  }, [q, lang]);

  // 全量目录分组：顶级分类 → 子类 → 条目（zh 用 categoryZh · EN 用 categoryEn）
  const fullGroups = useMemo(() => {
    const hit = (name: string, nameZh: string, id: string) =>
      !q || name.toLowerCase().includes(q) || nameZh.toLowerCase().includes(q) || id.toLowerCase().includes(q);
    const byTop = new Map<string, Map<string, FullPathwayEntry[]>>();
    let matched = 0;
    for (const p of FULL_NON_CURATED) {
      if (!hit(p.name, p.nameZh, p.id)) continue;
      matched++;
      const catField = lang === 'en' ? p.categoryEn : p.categoryZh;
      const SEP = lang === 'en' ? '; ' : ' · ';
      const parts = catField.split(SEP);
      const top = parts[0] ?? catField;
      const sub = parts.length > 1 ? parts.slice(1).join(SEP) : '';
      if (!byTop.has(top)) byTop.set(top, new Map());
      const subs = byTop.get(top)!;
      if (!subs.has(sub)) subs.set(sub, []);
      subs.get(sub)!.push(p);
    }
    const groups: FullGroup[] = [];
    const order = lang === 'en' ? TOP_ORDER_EN : KEGG_CATEGORY_ORDER;
    const orderedTops = [
      ...order.filter((t) => byTop.has(t)),
      ...[...byTop.keys()].filter((t) => !order.includes(t)),
    ];
    for (const top of orderedTops) {
      const subs = byTop.get(top)!;
      const items = [...subs.entries()];
      const total = items.reduce((n, [, list]) => n + list.length, 0);
      groups.push({
        top,
        count: total,
        subs: items.map(([sub, list]) => ({
          sub,
          items:
            lang === 'en'
              ? [...list].sort((a, b) => a.name.localeCompare(b.name))
              : [...list].sort((a, b) => a.nameZh.localeCompare(b.nameZh, 'zh')),
        })),
      });
    }
    return { groups, matched };
  }, [q, lang]);

  const curatedMatched = [...curatedGroups.values()].reduce((n, list) => n + list.length, 0);

  const toggleFullGroup = (top: string) => {
    setOpenFullGroups((prev) => {
      const next = new Set(prev);
      if (next.has(top)) next.delete(top);
      else next.add(top);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 当前细胞系 */}
      <div className="border-b border-white/5 p-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
          <FlaskConical className="h-3.5 w-3.5 text-emerald-400" />
          {t('pw.cellHeader')}
        </div>
        <div className="mt-2 rounded-xl border border-white/8 bg-gradient-to-br from-slate-900/80 to-slate-950/60 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-100">{lang === 'zh' ? cell?.name : cell?.nameEn ?? cell?.name}</div>
              {/* 副标题：zh 显示英文名+直径（双语对照），EN 仅显示直径（避免中文名残留） */}
              <div className="text-[10.5px] text-slate-500">
                {lang === 'zh' ? `${cell?.nameEn} · ${cell?.diameter ?? ''}` : (cell?.diameterEn ?? cell?.diameter ?? '')}
              </div>
            </div>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[9px]',
              cell?.mutations ? 'border border-rose-500/40 bg-rose-500/10 text-rose-300' : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
            )}>
              {cell?.mutations ? t('pw.pathological') : t('pw.normal')}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {cell?.receptors.slice(0, 6).map((r) => (
              <span key={r} className="rounded border border-teal-500/25 bg-teal-500/10 px-1.5 py-px font-mono text-[9.5px] text-teal-300">{r}</span>
            ))}
          </div>
          {cell?.disease && (
            <div className="mt-2 text-[10.5px] text-rose-300/80">{t('pw.diseasePrefix')}{lang === 'zh' ? cell.disease : cell.diseaseEn ?? cell.disease}</div>
          )}
        </div>
      </div>

      {/* 通路列表标题 */}
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <span className="text-xs font-medium text-slate-200">{t('pw.title')}</span>
        <span className={cn(
          'ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px]',
          isError ? 'border border-rose-500/40 text-rose-300' : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        )}>
          <Database className="h-2.5 w-2.5" />
          {isError ? t('pw.offline') : t('pw.entries')}
        </span>
      </div>

      {/* 搜索框 */}
      <div className="border-b border-white/5 px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('pw.searchPlaceholder')}
            aria-label={t('pw.searchLabel')}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-1.5 pl-8 pr-7 text-[11.5px] text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-emerald-500/50 focus:bg-white/[0.05]"
          />
          {searching && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('pw.clearSearch')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 transition hover:text-slate-200"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {searching && (
          <div className="mt-1.5 px-0.5 text-[9.5px] text-slate-500">
            {lang === 'zh'
              ? `命中 ${curatedMatched + fullGroups.matched} / ${KEGG_FULL_LIST.length} 条`
              : `${curatedMatched + fullGroups.matched} / ${KEGG_FULL_LIST.length} matches`}
            {curatedMatched + fullGroups.matched === 0 && t('pw.searchNone')}
          </div>
        )}
      </div>

      {/* 通路列表（策划级 + 全量目录） */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2 lab-scrollbar">
        {curatedMatched > 0 && (
          <>
            <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-emerald-400/80">
              {lang === 'zh'
                ? `${t('pw.curatedSection')} · ${curatedMatched} 条`
                : `${t('pw.curatedSection')} · ${curatedMatched}`}
            </div>
            {[...curatedGroups.entries()].map(([cat, list]) => (
              <div key={cat} className="mb-3">
                <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">{cat}</div>
                <div className="space-y-1">
                  {list.map((p) => {
                    const active = pathwayId === p.id;
                    const rec = recommended.includes(p.id);
                    const st = statsMap.get(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => selectPathway(p.id)}
                        className={cn(
                          'group relative w-full rounded-lg border px-2.5 py-2 text-left transition-all',
                          active
                            ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_16px_rgba(52,211,153,0.15)]'
                            : 'border-white/5 bg-white/[0.02] hover:border-emerald-500/30 hover:bg-white/[0.05]',
                        )}
                      >
                        {rec && !active && (
                          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className={cn('text-[12.5px] font-medium', active ? 'text-emerald-200' : 'text-slate-200')}>{lang === 'zh' ? p.nameZh : p.name}</span>
                          {rec && (
                            <span className="rounded bg-emerald-500/15 px-1 py-px text-[8.5px] text-emerald-300/90">{t('pw.adapted')}</span>
                          )}
                          {CURATED_TOUR_PATHWAYS.has(p.id) && (
                            <span
                              title={t('pw.tourTitle')}
                              className="rounded bg-teal-500/15 px-1 py-px text-[8.5px] text-teal-300/90"
                            >
                              {t('pw.tourBadge')}
                            </span>
                          )}
                          <ChevronRight className={cn('ml-auto h-3 w-3 transition-transform', active ? 'text-emerald-400' : 'text-slate-600 group-hover:translate-x-0.5')} />
                        </div>
                        <div className="mt-0.5 font-mono text-[9.5px] text-slate-500">
                          {p.id} · {st?.geneCount ? `${st.geneCount} ${t('pw.molecules')}` : `${p.seeds.length} ${t('pw.seeds')}`}
                        </div>
                        {active && (
                          <div className="mt-1.5 border-t border-emerald-500/20 pt-1.5 text-[10px] leading-4 text-slate-400">
                            {lang === 'en' && p.cascadeEn ? p.cascadeEn : p.cascade}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}

        {/* KEGG 全量目录（按顶级分类分组，默认折叠） */}
        {fullGroups.matched > 0 && (
          <>
            <div className={cn(
              'flex items-center gap-1.5 px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-teal-400/70',
              curatedMatched > 0 && 'mt-2 border-t border-white/5 pt-2.5',
            )}>
              <Database className="h-3 w-3" />
              {lang === 'zh'
                ? `${t('pw.fullSection')} · ${fullGroups.matched} 条`
                : `${t('pw.fullSection')} · ${fullGroups.matched}`}
            </div>
            {fullGroups.groups.map((grp) => {
              const expanded = searching || openFullGroups.has(grp.top);
              return (
                <div key={grp.top} className="mb-2">
                  <button
                    onClick={() => toggleFullGroup(grp.top)}
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition hover:bg-white/[0.04]"
                  >
                    <ChevronDown className={cn('h-3 w-3 shrink-0 text-slate-500 transition-transform', expanded ? '' : '-rotate-90')} />
                    <span className="text-[11px] font-medium text-slate-300">{grp.top}</span>
                    <span className="ml-auto rounded-full border border-white/8 px-1.5 py-px text-[9px] text-slate-500">{grp.count}</span>
                  </button>
                  {expanded && (
                    <div className="mt-0.5 space-y-1.5 border-l border-white/5 pl-1.5">
                      {grp.subs.map((sub) => (
                        <div key={sub.sub || '-'}>
                          {sub.sub && (
                            <div className="px-1.5 py-0.5 text-[9.5px] text-slate-500">{sub.sub}</div>
                          )}
                          <div className="space-y-px">
                            {sub.items.map((item) => {
                              const active = pathwayId === item.id;
                              const st = statsMap.get(item.id);
                              return (
                                <button
                                  key={item.id}
                                  onClick={() => selectPathway(item.id)}
                                  title={
                                    lang === 'zh'
                                      ? `${item.nameZh}（${item.name}）${st ? ` · 核心子图 ${st.coreCount} 节点` : ''}`
                                      : `${item.name}${st ? ` · core subgraph ${st.coreCount} nodes` : ''}`
                                  }
                                  className={cn(
                                    'flex w-full items-baseline gap-1.5 rounded-md border px-2 py-1 text-left transition-all',
                                    active
                                      ? 'border-emerald-500/50 bg-emerald-500/10'
                                      : 'border-transparent hover:border-emerald-500/25 hover:bg-white/[0.04]',
                                  )}
                                >
                                  <span className={cn('truncate text-[11px]', active ? 'text-emerald-200' : 'text-slate-300')}>
                                    {lang === 'zh' ? item.nameZh : item.name}
                                  </span>
                                  <span className="ml-auto shrink-0 font-mono text-[9px] text-slate-500">
                                    {item.id}
                                    {st ? ` · ${st.coreCount}n` : ''}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
