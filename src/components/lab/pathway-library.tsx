'use client';

/**
 * 通路库 —— 左侧面板：当前细胞档案 + KEGG 信号通路列表（按当前细胞类型优先推荐）
 */
import { FlaskConical, ChevronRight, Database, GitBranch } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PATHWAY_CATALOG } from '@/data/pathway-catalog';
import { CELL_TYPE_MAP } from '@/data/cell-types';
import { useLabStore } from '@/store/lab-store';
import { cn } from '@/lib/utils';

/** 具有手工策划教学级联的通路（与 guided-tour.ts CURATED_TOURS 同步） */
const CURATED_TOUR_PATHWAYS = new Set([
  'hsa04010', 'hsa04151', 'hsa04630', 'hsa04024', 'hsa04350', 'hsa04310', 'hsa04330',
  'hsa04150', 'hsa04064', 'hsa04210', 'hsa04115', 'hsa04152', 'hsa04020',
]);

export function PathwayLibrary() {
  const cellId = useLabStore((s) => s.cellId);
  const pathwayId = useLabStore((s) => s.pathwayId);
  const selectPathway = useLabStore((s) => s.selectPathway);
  const cell = CELL_TYPE_MAP.get(cellId);

  // KEGG 目录统计（含缓存状态演示）
  const { data, isError } = useQuery({
    queryKey: ['pathway-catalog'],
    queryFn: async () => {
      const res = await fetch('/api/pathways');
      if (!res.ok) throw new Error('目录获取失败');
      return (await res.json()) as { pathways: { id: string; stats?: { geneCount: number; relationCount: number } | null }[] };
    },
    staleTime: 5 * 60 * 1000,
  });
  const statsMap = new Map((data?.pathways ?? []).map((p) => [p.id, p.stats]));

  // 当前细胞适配通路优先
  const recommended = cell?.pathways ?? [];
  const groups = new Map<string, typeof PATHWAY_CATALOG>();
  for (const p of PATHWAY_CATALOG) {
    if (!groups.has(p.category)) groups.set(p.category, []);
    groups.get(p.category)!.push(p);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 当前细胞系 */}
      <div className="border-b border-white/5 p-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
          <FlaskConical className="h-3.5 w-3.5 text-emerald-400" />
          当前虚拟细胞系
        </div>
        <div className="mt-2 rounded-xl border border-white/8 bg-gradient-to-br from-slate-900/80 to-slate-950/60 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-100">{cell?.name}</div>
              <div className="text-[10.5px] text-slate-500">{cell?.nameEn} · {cell?.diameter}</div>
            </div>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[9px]',
              cell?.mutations ? 'border border-rose-500/40 bg-rose-500/10 text-rose-300' : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
            )}>
              {cell?.mutations ? '病理模型' : '正常表型'}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {cell?.receptors.slice(0, 6).map((r) => (
              <span key={r} className="rounded border border-teal-500/25 bg-teal-500/10 px-1.5 py-px font-mono text-[9.5px] text-teal-300">{r}</span>
            ))}
          </div>
          {cell?.disease && (
            <div className="mt-2 text-[10.5px] text-rose-300/80">病理: {cell.disease}</div>
          )}
        </div>
      </div>

      {/* 通路列表 */}
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <GitBranch className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-xs font-medium text-slate-200">KEGG 信号转导通路库</span>
        <span className={cn(
          'ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px]',
          isError ? 'border border-rose-500/40 text-rose-300' : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        )}>
          <Database className="h-2.5 w-2.5" />
          {isError ? '离线' : 'KEGG'}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 lab-scrollbar">
        {[...groups.entries()].map(([cat, list]) => (
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
                      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400/70' " />
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className={cn('text-[12.5px] font-medium', active ? 'text-emerald-200' : 'text-slate-200')}>{p.nameZh}</span>
                      {rec && (
                        <span className="rounded bg-emerald-500/15 px-1 py-px text-[8.5px] text-emerald-300/90">适配</span>
                      )}
                      {CURATED_TOUR_PATHWAYS.has(p.id) && (
                        <span
                          title="已策划分步教学级联（3D 视图 → 教学引导）"
                          className="rounded bg-teal-500/15 px-1 py-px text-[8.5px] text-teal-300/90"
                        >
                          教学
                        </span>
                      )}
                      <ChevronRight className={cn('ml-auto h-3 w-3 transition-transform', active ? 'text-emerald-400' : 'text-slate-600 group-hover:translate-x-0.5')} />
                    </div>
                    <div className="mt-0.5 font-mono text-[9.5px] text-slate-500">
                      {p.id} · {st?.geneCount ? `${st.geneCount} 分子` : `${p.seeds.length} 种子`}
                    </div>
                    {active && (
                      <div className="mt-1.5 border-t border-emerald-500/20 pt-1.5 text-[10px] leading-4 text-slate-400">{p.cascade}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
