'use client';

/**
 * 模拟控制台 —— 播放/暂停/单步/重置、速率、信号阶段进度、配体注射、报告导出
 */
import { Play, Pause, StepForward, RotateCcw, Droplet, Zap } from 'lucide-react';
import { useLabStore } from '@/store/lab-store';
import { PHASES } from '@/lib/simulation/engine';
import { CELL_TYPE_MAP } from '@/data/cell-types';
import { useLang } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ReportExportButton } from './report-export';

const SPEEDS = [0.5, 1, 2, 4];

export function PlaybackControls() {
  const { t, lang } = useLang();
  const running = useLabStore((s) => s.running);
  const speed = useLabStore((s) => s.speed);
  const tick = useLabStore((s) => s.tick);
  const phase = useLabStore((s) => s.phase);
  const graph = useLabStore((s) => s.graph);
  const injected = useLabStore((s) => s.injected);
  const events = useLabStore((s) => s.events);
  const cellId = useLabStore((s) => s.cellId);
  const play = useLabStore((s) => s.play);
  const pause = useLabStore((s) => s.pause);
  const stepOnce = useLabStore((s) => s.stepOnce);
  const resetSim = useLabStore((s) => s.resetSim);
  const setSpeed = useLabStore((s) => s.setSpeed);
  const toggleLigand = useLabStore((s) => s.toggleLigand);

  const cell = CELL_TYPE_MAP.get(cellId);
  const ligands = graph?.core.nodes.filter((n) => n.tier === 0) ?? [];
  const activatedCount = events.filter((e) => e.kind !== 'info' && e.kind !== 'phase' && e.kind !== 'reset').length;

  // 配体仅当“有效”（存在下游连接）时才显示；否则显示直接刺激入口：
  // 受体/通道（tier 1 有下游）→ 源节点应激激酶（无上游输入且度数≥2，按正向级联潜力排序）
  const hasProductiveLigand =
    graph?.core.edges.some((e) => ligands.some((l) => l.id === e.source)) ?? false;
  const stimulables =
    !hasProductiveLigand && graph
      ? (() => {
          const POS_KINDS = new Set(['activation', 'phosphorylation', 'expression', 'binding', 'indirect', 'state-change', 'dissociation', 'missing']);
          const posDown = new Map<string, string[]>();
          for (const e of graph.core.edges) {
            if (!POS_KINDS.has(e.kind)) continue;
            if (!posDown.has(e.source)) posDown.set(e.source, []);
            posDown.get(e.source)!.push(e.target);
          }
          const reach = (startId: string): number => {
            const seen = new Set([startId]);
            const queue = [startId];
            while (queue.length) {
              const cur = queue.shift()!;
              for (const t of posDown.get(cur) ?? []) {
                if (!seen.has(t)) {
                  seen.add(t);
                  queue.push(t);
                }
              }
            }
            return seen.size - 1;
          };
          const incoming = new Set(graph.core.edges.map((e) => e.target));
          const receptors = graph.core.nodes.filter(
            (n) => n.tier === 1 && graph.core.edges.some((e) => e.source === n.id),
          );
          const stressSources = graph.core.nodes
            .filter((n) => {
              const deg = graph.core.edges.filter((e) => e.source === n.id).length;
              return !incoming.has(n.id) && deg >= 2 && (n.kind === 'kinase' || n.kind === 'gtpase');
            })
            .sort((a, b) => reach(b.id) - reach(a.id));
          return [
            ...receptors.map((n) => ({ n, surface: true })),
            ...stressSources.map((n) => ({ n, surface: false })),
          ].slice(0, 5);
        })()
      : [];

  return (
    <div className="space-y-3 border-t border-white/5 bg-slate-950/60 p-3 backdrop-blur">
      {/* 阶段进度 */}
      <div className="flex items-center gap-1.5">
        {PHASES.map((p) => (
          <div key={p.id} className="group relative flex-1">
            <div
              className={cn(
                'h-1.5 rounded-full transition-all duration-700',
                phase > p.id ? 'bg-emerald-500' : phase === p.id ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]' : 'bg-slate-700/70',
              )}
            />
            <div
              className={cn(
                'mt-1.5 truncate text-[10px] transition-colors',
                phase === p.id ? 'font-medium text-emerald-300' : phase > p.id ? 'text-slate-400' : 'text-slate-600',
              )}
              title={`${lang === 'zh' ? p.name : p.en} — ${lang === 'zh' ? p.desc : t(`pb.phase${p.id}.desc`)}`}
            >
              {lang === 'zh' ? p.name : p.en}
            </div>
          </div>
        ))}
        <div className="ml-2 w-24 shrink-0 text-right font-mono text-[11px] text-slate-400">
          <div className="text-slate-300">T+{(tick * 0.5).toFixed(1)}s</div>
          <div className="text-[10px] text-slate-500">{activatedCount} {t('pb.molEvents')}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* 播放控制 */}
        <div className="flex items-center gap-1.5">
          <Button
            size="icon"
            onClick={running ? pause : play}
            disabled={!graph}
            className={cn(
              'h-10 w-10 rounded-xl border transition-all',
              running
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 hover:shadow-[0_0_18px_rgba(52,211,153,0.35)]',
            )}
            title={running ? t('pb.pause') : t('pb.play')}
          >
            {running ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={stepOnce}
            disabled={!graph}
            className="h-9 w-9 rounded-lg border-white/10 bg-white/5 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300"
            title={t('pb.step')}
          >
            <StepForward className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={resetSim}
            disabled={!graph}
            className="h-9 w-9 rounded-lg border-white/10 bg-white/5 text-slate-300 hover:border-rose-500/40 hover:text-rose-300"
            title={t('pb.reset')}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          {/* 实验报告导出（PDF） */}
          <ReportExportButton />
        </div>

        {/* 速率 */}
        <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 p-0.5">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              onClick={() => setSpeed(sp)}
              className={cn(
                'rounded-md px-2 py-1 font-mono text-[11px] transition',
                speed === sp ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-500 hover:text-slate-300',
              )}
            >
              {sp}×
            </button>
          ))}
        </div>

        {/* 配体注射 / 直接刺激入口 */}
        <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
          {hasProductiveLigand ? (
            <>
              <Droplet className="h-3.5 w-3.5 text-amber-400/70" />
              <span className="text-[10px] uppercase tracking-wider text-slate-500">{t('pb.ligandInject')}</span>
              {ligands.map((l) => {
                const on = !!injected[l.id];
                return (
                  <button
                    key={l.id}
                    onClick={() => toggleLigand(l.id)}
                    disabled={cell?.mutations?.some((m) => m.node === l.id)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition-all',
                      on
                        ? 'border-amber-400/70 bg-amber-400/20 text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
                        : 'border-white/10 bg-white/5 text-slate-400 hover:border-amber-400/40 hover:text-amber-300',
                    )}
                    title={l.aliases[0] ?? l.label}
                  >
                    {on ? '◉ ' : '○ '}
                    {l.label}
                  </button>
                );
              })}
            </>
          ) : (
            <>
              <Zap className="h-3.5 w-3.5 text-teal-400/70" />
              <span
                className="text-[10px] uppercase tracking-wider text-slate-500"
                title={t('pb.directStimTip')}
              >
                {t('pb.directStim')}
              </span>
              {stimulables.length === 0 && (
                <span className="text-[11px] text-slate-600">{t('pb.noStim')}</span>
              )}
              {stimulables.map(({ n: r, surface }) => {
                const on = !!injected[r.id];
                return (
                  <button
                    key={r.id}
                    onClick={() => toggleLigand(r.id)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition-all',
                      on
                        ? 'border-teal-400/70 bg-teal-400/20 text-teal-200 shadow-[0_0_12px_rgba(45,212,191,0.35)]'
                        : 'border-white/10 bg-white/5 text-slate-400 hover:border-teal-400/40 hover:text-teal-300',
                    )}
                    title={
                      surface
                        ? `${r.label} —— ${t('pb.stimReceptorTip')}`
                        : `${r.label} —— ${t('pb.stimStressTip')}`
                    }
                  >
                    {on ? '◉ ' : '○ '}
                    {r.label}
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* 癌细胞突变提示 */}
      {cell?.mutations && cell.mutations.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-950/25 px-3 py-1.5 text-[11px] text-rose-300/90">
          <Zap className="h-3.5 w-3.5 shrink-0 text-rose-400" />
          <span className="truncate">
            {t('pb.mutNoticeA')} {cell.mutations.length} {t('pb.mutNoticeB')}
          </span>
        </div>
      )}
    </div>
  );
}
