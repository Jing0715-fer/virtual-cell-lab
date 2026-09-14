'use client';

/**
 * 药理扰动面板 —— 信号转导干预实验
 * 按当前通路核心子图智能筛选可作用药物（靶点命中才显示）
 * 投药 → 引擎输出门控（上游磷酸化照常累积，下游断流）→ 洗脱恢复
 */
import { useMemo } from 'react';
import { Pill, FlaskConical, Info, ShieldCheck, Microscope, Beaker } from 'lucide-react';
import { useLabStore } from '@/store/lab-store';
import { INHIBITORS, type DrugSource } from '@/data/inhibitors';
import { useLang } from '@/lib/i18n';

const SOURCE_ICON: Record<DrugSource, typeof ShieldCheck> = {
  fda: ShieldCheck,
  trial: Microscope,
  tool: Beaker,
};

const SOURCE_STYLE: Record<DrugSource, string> = {
  fda: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  trial: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  tool: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
};

function DrugCard({ drugId }: { drugId: string }) {
  const { t, lang } = useLang();
  const drug = INHIBITORS.find((d) => d.id === drugId)!;
  const graph = useLabStore((s) => s.graph);
  const inhibitors = useLabStore((s) => s.inhibitors);
  const drugLevels = useLabStore((s) => s.drugLevels);
  const nodeStates = useLabStore((s) => s.nodeStates);
  const toggleInhibitor = useLabStore((s) => s.toggleInhibitor);

  const active = !!inhibitors[drugId];
  const level = drugLevels[drugId] ?? 0;

  // 靶点命中（核心子图内）
  const targets = useMemo(() => {
    if (!graph) return [];
    return drug.targets
      .map((t) => graph.core.nodes.find((n) => n.id === t || n.label === t))
      .filter((n): n is NonNullable<typeof n> => !!n);
  }, [graph, drug.targets]);

  const SourceIcon = SOURCE_ICON[drug.source];

  return (
    <div
      className={`rounded-xl border p-3 transition ${
        active
          ? 'border-purple-400/50 bg-purple-950/25 shadow-[0_0_18px_rgba(192,132,252,0.12)]'
          : 'border-white/8 bg-white/[0.03] hover:border-white/15'
      }`}
    >
      {/* 头部 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Pill className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-purple-300' : 'text-slate-500'}`} />
            <span className="truncate text-[13px] font-semibold text-slate-100">
              {lang === 'zh' ? drug.name : /[\u4e00-\u9fff]/.test(drug.name) ? drug.code.split(' ·')[0] : drug.name}
            </span>
            <span className={`shrink-0 rounded border px-1 py-px text-[8px] leading-tight ${SOURCE_STYLE[drug.source]}`}>
              {t(`ph.src.${drug.source}`)}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[9px] text-slate-500">{drug.code}</div>
        </div>
        <button
          onClick={() => toggleInhibitor(drugId)}
          className={`shrink-0 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition ${
            active
              ? 'border-purple-400/60 bg-purple-500/20 text-purple-200 hover:bg-purple-500/30'
              : 'border-purple-400/30 bg-purple-500/8 text-purple-300/80 hover:bg-purple-500/15'
          }`}
        >
          {active ? t('ph.washout') : t('ph.dose')}
        </button>
      </div>

      {/* 药物类别 */}
      <div className="mt-2 flex items-center gap-1.5">
        <SourceIcon className="h-3 w-3 text-slate-500" />
        <span className="text-[10px] text-slate-400">{lang === 'zh' ? drug.drugClass : drug.drugClassEn}</span>
      </div>

      {/* 靶点活性监控 */}
      <div className="mt-2 space-y-1">
        {targets.map((n) => {
          const st = nodeStates[n.id];
          const act = st?.activity ?? 0;
          return (
            <div key={n.id} className="flex items-center gap-2">
              <span className="w-14 shrink-0 truncate font-mono text-[10px] text-slate-300">{n.label}</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                  style={{ width: `${act * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-purple-400/60 transition-all duration-300"
                  style={{ width: `${level * 100}%`, opacity: 0.7 }}
                />
              </div>
              <span className="w-8 shrink-0 text-right font-mono text-[9px] text-slate-500">{Math.round(act * 100)}%</span>
            </div>
          );
        })}
      </div>

      {/* 机制 */}
      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{lang === 'zh' ? drug.mechanism : drug.mechanismEn}</p>

      {/* 适应症 */}
      <div className="mt-2 flex items-center gap-1.5 border-t border-white/5 pt-1.5">
        <Info className="h-2.5 w-2.5 text-slate-600" />
        <span className="text-[9px] text-slate-500">{lang === 'zh' ? drug.indication : drug.indicationEn}</span>
      </div>

      {/* 起效进度 */}
      {active && level < 0.99 && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-[9px] text-purple-300">{t('ph.onset')}</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-purple-400 transition-all" style={{ width: `${level * 100}%` }} />
          </div>
        </div>
      )}
      {active && level >= 0.99 && (
        <div className="mt-1.5 font-mono text-[9px] text-purple-300">{t('ph.therapeutic')}</div>
      )}
    </div>
  );
}

export function PharmacologyPanel() {
  const { t, lang } = useLang();
  const graph = useLabStore((s) => s.graph);
  const inhibitors = useLabStore((s) => s.inhibitors);

  // 与当前通路核心子图匹配的药物
  const applicable = useMemo(() => {
    if (!graph) return [];
    const ids = new Set(graph.core.nodes.map((n) => n.id));
    const labels = new Set(graph.core.nodes.map((n) => n.label));
    return INHIBITORS.filter((d) => d.targets.some((t) => ids.has(t) || labels.has(t))).map((d) => d.id);
  }, [graph]);

  const activeCount = applicable.filter((id) => inhibitors[id]).length;

  return (
    <div className="lab-scrollbar h-full overflow-y-auto px-3 py-3">
      <div className="mb-2 flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-purple-400" />
        <div>
          <div className="text-[12px] font-semibold text-slate-100">{t('ph.title')}</div>
          <div className="text-[9px] text-slate-500">
            {graph
              ? `${lang === 'zh' ? graph.meta.nameZh : graph.meta.name} · ${applicable.length} ${t('ph.drugsAvail')}`
              : t('ph.loading')}
            {activeCount > 0 && <span className="ml-1 text-purple-300">· {activeCount} {t('ph.activeCount')}</span>}
          </div>
        </div>
      </div>

      <p className="mb-3 rounded-lg border border-purple-500/15 bg-purple-950/15 p-2 text-[10px] leading-relaxed text-slate-400">
        {t('ph.introA')}<span className="text-purple-300">{t('ph.introB')}</span>{t('ph.introC')}
      </p>

      {applicable.length === 0 ? (
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 text-center">
          <Pill className="mx-auto mb-2 h-6 w-6 text-slate-700" />
          <p className="text-[11px] text-slate-500">{t('ph.emptyTitle')}</p>
          <p className="mt-1 text-[9px] text-slate-600">{t('ph.emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {applicable.map((id) => (
            <DrugCard key={id} drugId={id} />
          ))}
        </div>
      )}
    </div>
  );
}
