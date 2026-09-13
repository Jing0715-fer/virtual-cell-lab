'use client';

/**
 * 转录组响应热图 —— 核内靶基因 × 时间活性矩阵
 * 科学语义: 信号级联末端转录因子入核 → 靶基因转录响应（模拟引擎以基因节点
 *           活性作为转录强度代理）。热图呈现"时间过程转录谱"，类似
 *           RNA-seq 时间序列热图的可视化惯例。
 * 实现: activityHistory 环形缓冲 → 降采样 48 列 → SVG 热图矩阵 + 悬停读数
 *       + 峰值响应统计 + Top 响应基因排行。节流刷新（400ms）避免逐 tick 重渲染。
 */
import { useEffect, useMemo, useState } from 'react';
import { Activity, Download, Flame, Thermometer } from 'lucide-react';
import { useLabStore } from '@/store/lab-store';
import { CELL_TYPE_MAP } from '@/data/cell-types';
import type { ActivitySample } from '@/lib/simulation/engine';
import type { CoreNode } from '@/types/kegg';
import { cn } from '@/lib/utils';

const MAX_COLS = 48;
const ROW_H = 26;
const COL_W = 11;
const LABEL_W = 92;

/** 转录活性 → 热图色（深墨 → 青绿 → 琥珀 → 玫红，模拟荧光强度标度） */
function heatColor(v: number): string {
  const c = Math.max(0, Math.min(1, v));
  if (c < 0.04) return '#0a1a20';
  if (c < 0.25) return '#0d3a33';
  if (c < 0.45) return '#14b8a6';
  if (c < 0.65) return '#2dd4bf';
  if (c < 0.8) return '#fbbf24';
  return '#fb7185';
}

interface HeatRow {
  node: CoreNode;
  values: number[]; // 降采样后的活性序列
  peak: number;
  peakIdx: number;
  final: number;
}

export function TranscriptomicHeatmap() {
  const graph = useLabStore((s) => s.graph);
  const tick = useLabStore((s) => s.tick);

  // 节流获取历史（400ms 刷新，避免逐 tick 10Hz 重渲染）
  const [hist, setHist] = useState<ActivitySample[]>([]);
  useEffect(() => {
    const timer = setInterval(() => {
      setHist(useLabStore.getState().activityHistory);
    }, 400);
    return () => clearInterval(timer);
  }, []);

  const { rows, timeCols, responding } = useMemo(() => {
    if (!graph || hist.length === 0) return { rows: [] as HeatRow[], timeCols: [] as number[], responding: 0 };
    // 行 = 核内靶基因（tier 6）; 若过少则纳入转录因子（标注类型）
    let geneNodes = graph.core.nodes.filter((n) => n.compartment === 'nucleus' && n.kind === 'gene');
    if (geneNodes.length < 3) {
      const tfs = graph.core.nodes.filter((n) => n.compartment === 'nucleus' && n.kind === 'tf' && n.tier >= 5);
      geneNodes = [...geneNodes, ...tfs];
    }
    // KEGG 重复 entry 按 label 合并（如 ERK 分支与 JNK 分支的 FOS/e137）—— 同一基因
    // 的平行分支活性取 max，代表该基因的总体转录响应
    const byLabel = new Map<string, CoreNode[]>();
    for (const n of geneNodes) {
      const list = byLabel.get(n.label) ?? [];
      list.push(n);
      byLabel.set(n.label, list);
    }
    // 列 = 降采样历史
    const stride = Math.max(1, Math.ceil(hist.length / MAX_COLS));
    const cols = hist.filter((_, i) => i % stride === 0 || i === hist.length - 1);
    const timeCols = cols.map((c) => c.tick);
    const rows: HeatRow[] = [...byLabel.values()]
      .map((group) => {
        const node = group[0];
        const values = cols.map((c) => Math.max(...group.map((g) => c.values[g.id] ?? 0)));
        let peak = 0;
        let peakIdx = 0;
        values.forEach((v, i) => {
          if (v > peak) {
            peak = v;
            peakIdx = i;
          }
        });
        return { node, values, peak, peakIdx, final: values[values.length - 1] ?? 0 };
      })
      .sort((a, b) => b.peak - a.peak);
    const responding = rows.filter((r) => r.peak > 0.3).length;
    return { rows, timeCols, responding };
  }, [graph, hist]);

  const [hover, setHover] = useState<{ row: HeatRow; col: number } | null>(null);
  const svgW = LABEL_W + timeCols.length * COL_W + 8;

  const exportCsv = () => {
    if (rows.length === 0 || timeCols.length === 0) return;
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines: string[] = [];
    lines.push('# VirtualCell Lab 转录组响应谱（时间过程活性矩阵，转录强度代理 0-1）');
    lines.push(`# 通路: ${esc(graph?.meta.name ?? '')} (${graph?.meta.id ?? ''})`);
    lines.push(`# 细胞系: ${esc(CELL_TYPE_MAP.get(useLabStore.getState().cellId)?.name ?? '')}`);
    lines.push(`# 采样: 每列 ${(0.5).toFixed(1)}s 模拟时间 × 降采样，共 ${timeCols.length} 列`);
    lines.push('gene_symbol,peak_activity,peak_time_s,final_activity,' + timeCols.map((t) => `t${(t * 0.5).toFixed(1)}s`).join(','));
    for (const r of rows) {
      const cells = [
        r.node.label,
        r.peak.toFixed(3),
        (timeCols[Math.min(r.peakIdx, timeCols.length - 1)] * 0.5).toFixed(1),
        r.final.toFixed(3),
        ...r.values.map((v) => v.toFixed(3)),
      ];
      lines.push(cells.join(','));
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VirtualCell-Transcriptome-${graph?.meta.id ?? 'pathway'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  if (!graph) {
    return <div className="p-4 text-xs text-slate-600">等待通路加载…</div>;
  }

  if (rows.length === 0 || hist.length < 4) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <Thermometer className="mx-auto mb-3 h-8 w-8 text-slate-700" />
          <p className="text-sm text-slate-400">尚无转录响应数据</p>
          <p className="mt-1 text-xs text-slate-600">注射配体并播放模拟，等待级联传导至核内靶基因</p>
        </div>
      </div>
    );
  }

  const topRows = rows.slice(0, 5);

  return (
    <div className="flex h-full flex-col">
      {/* 头部统计 */}
      <div className="border-b border-white/5 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-medium text-slate-200">转录组响应谱</span>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] text-amber-300">
            {graph.meta.name}
          </span>
          <button
            onClick={exportCsv}
            title="导出 CSV（基因 × 时间活性矩阵，含 BOM 可直接用 Excel 打开）"
            className="ml-auto flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 font-mono text-[9px] text-amber-300 transition-colors hover:bg-amber-500/20 hover:text-amber-200"
          >
            <Download className="h-3 w-3" />CSV
          </button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <div className="rounded-lg border border-white/8 bg-white/5 px-2 py-1.5">
            <div className="font-mono text-sm text-slate-100">{rows.length}</div>
            <div className="text-[9px] text-slate-500">核内靶基因</div>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1.5">
            <div className="font-mono text-sm text-emerald-300">{responding}</div>
            <div className="text-[9px] text-slate-500">显著响应 (峰 &gt;30%)</div>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/5 px-2 py-1.5">
            <div className="font-mono text-sm text-slate-100">T+{(tick * 0.5).toFixed(1)}s</div>
            <div className="text-[9px] text-slate-500">采样终点</div>
          </div>
        </div>
      </div>

      {/* 热图主体 */}
      <div className="min-h-0 flex-1 overflow-auto p-3 max-h-96">
        <div className="relative">
          <svg
            width={svgW}
            height={rows.length * ROW_H + 24}
            className="block"
            role="img"
            aria-label="转录组响应热图"
          >
            {/* 时间轴（每 10 列一个标注） */}
            {timeCols.map((t, i) =>
              i % 10 === 0 || i === timeCols.length - 1 ? (
                <text key={i} x={LABEL_W + i * COL_W} y={12} fill="#64748b" fontSize={8} textAnchor="middle" fontFamily="ui-monospace, monospace">
                  {(t * 0.5).toFixed(0)}s
                </text>
              ) : null,
            )}
            {/* 行 */}
            {rows.map((row, ri) => {
              const geneRow = row.node.kind === 'gene';
              return (
                <g
                  key={row.node.id}
                  onMouseEnter={() => setHover({ row, col: -1 })}
                  onMouseLeave={() => setHover(null)}
                >
                  <text
                    x={LABEL_W - 8}
                    y={ri * ROW_H + 24 + ROW_H / 2 - 1}
                    fill={hover?.row === row ? '#e2e8f0' : geneRow ? '#94a3b8' : '#7c8da0'}
                    fontSize={9}
                    textAnchor="end"
                    fontFamily="ui-monospace, monospace"
                    fontWeight={geneRow ? 500 : 400}
                  >
                    {row.node.label}
                  </text>
                  {timeCols.map((_, ci) => {
                    const v = row.values[ci] ?? 0;
                    return (
                      <rect
                        key={ci}
                        x={LABEL_W + ci * COL_W}
                        y={ri * ROW_H + 14}
                        width={COL_W - 1.5}
                        height={ROW_H - 5}
                        rx={1.5}
                        fill={heatColor(v)}
                        onMouseEnter={(e) => {
                          e.stopPropagation();
                          setHover({ row, col: ci });
                        }}
                        onMouseLeave={() => setHover(null)}
                        className="cursor-crosshair transition-opacity"
                        opacity={hover && hover.row === row && hover.col !== ci ? 0.55 : 1}
                      />
                    );
                  })}
                  {/* 峰值标记 ▲ */}
                  {row.peak > 0.3 && (
                    <text
                      x={LABEL_W + row.peakIdx * COL_W + 2}
                      y={ri * ROW_H + 14 + 3}
                      fill="#fde68a"
                      fontSize={7}
                    >
                      ▲
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {/* 悬停读数 */}
          {hover && hover.col >= 0 && (
            <div className="pointer-events-none absolute left-2 top-0 rounded-lg border border-amber-500/30 bg-slate-950/90 px-2.5 py-1.5 font-mono text-[10px] text-amber-200 shadow-lg backdrop-blur">
              <span className="text-slate-100">{hover.row.node.label}</span>
              <span className="text-slate-500"> · </span>
              <span className="text-slate-400">T+{(timeCols[hover.col] * 0.5).toFixed(1)}s</span>
              <span className="text-slate-500"> · </span>
              <span className="text-amber-300">{(hover.row.values[hover.col] * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Top 响应排行 + 色标 */}
      <div className="border-t border-white/5 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Flame className="h-3 w-3 text-rose-400" />
          <span className="text-[10px] font-medium text-slate-300">峰值响应排行</span>
        </div>
        <div className="mt-1.5 space-y-1">
          {topRows.map((r) => (
            <div key={r.node.id} className="flex items-center gap-2">
              <span className="w-16 shrink-0 truncate font-mono text-[10px] text-slate-400">{r.node.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(2, r.peak * 100)}%`, backgroundColor: heatColor(r.peak) }}
                />
              </div>
              <span className="w-24 shrink-0 text-right font-mono text-[9px] text-slate-500">
                峰{(r.peak * 100).toFixed(0)}% · T+{(timeCols[Math.min(r.peakIdx, timeCols.length - 1)] * 0.5).toFixed(1)}s
              </span>
            </div>
          ))}
        </div>
        {/* 色标 */}
        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[9px] text-slate-600">低</span>
          <div
            className="h-1.5 flex-1 rounded-full"
            style={{ background: 'linear-gradient(to right, #0a1a20, #0d3a33, #14b8a6, #2dd4bf, #fbbf24, #fb7185)' }}
          />
          <span className="text-[9px] text-slate-600">转录强度</span>
        </div>
        <p className={cn('mt-2 text-[9px] leading-relaxed text-slate-600')}>
          行 = 核内靶基因（▲ = 峰值时刻），列 = 模拟时间（每列 0.5s×降采样）。活性为转录强度代理，色标模拟荧光报告强度。
        </p>
      </div>
    </div>
  );
}
