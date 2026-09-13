'use client';

/**
 * 通路对比模式 —— 正常 vs 病变细胞同通路并排对照实验
 *   双迷你细胞视图（共享布局, 同一配体刺激） + 逐分子 Δ 活性对照条 + 差异总结卡
 * 科学叙事: 同一通路/同一刺激下, 遗传背景（KRAS G12D 等）如何改写信号命运
 */
import { useEffect, useMemo, useState } from 'react';
import { X, Play, Pause, RotateCcw, GitCompare, ChevronRight, Dna, Timer, Zap, Sigma } from 'lucide-react';
import { useCompareStore, moleculeDeltas, compareSummary } from '@/store/compare-store';
import { CompareReportExportButton } from './report-export';
import { CELL_TYPE_MAP, CELL_TYPES } from '@/data/cell-types';
import { layoutCellView, CANVAS, type PositionedNode, type LaidOutEdge } from '@/lib/simulation/layout';
import { CellMorphology } from './morphologies';
import type { EdgeKind, MoleculeKind } from '@/types/kegg';
import { KIND_COLORS_MAP, edgeColor, edgeMarker, truncateLabel, midpointOf } from './view-shared';

const TICK_MS = 100;

/* ============ 迷你细胞臂视图（静态布局 + 活性着色, 无交互面板开销） ============ */

function MiniArmView({ side, cellId, nodes, edges, states, injected }: {
  side: 'A' | 'B';
  cellId: string;
  nodes: PositionedNode[];
  edges: LaidOutEdge[];
  states: Record<string, { activity: number; phospho: number; activated: boolean; activatedAtTick: number | null }>;
  injected: Record<string, boolean>;
}) {
  const cell = CELL_TYPE_MAP.get(cellId);
  const morph = cell?.morphology ?? 'hepatocyte';
  const tint = cell?.tint ?? ['#134e4a', '#052e2b'];
  const mutNodeIds = new Set((cell?.mutations ?? []).map((m) => m.node));
  const accent = side === 'A' ? '#2dd4bf' : '#fb7185';
  const labelPrefix = side === 'A' ? '对照' : '实验';

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-white/8 bg-[#020617]">
      {/* 臂头部 */}
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <span className="rounded px-1.5 py-px font-mono text-[9px] font-bold" style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}44` }}>
          臂 {side}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium text-slate-200">{cell?.name ?? cellId}</div>
          <div className="truncate text-[8.5px] text-slate-500">{labelPrefix} · {cell?.marker ?? ''}</div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {(cell?.mutations ?? []).slice(0, 3).map((m) => (
            <span key={m.node} className="rounded border border-rose-500/30 bg-rose-500/10 px-1 py-px font-mono text-[8px] text-rose-300">
              {m.node}{m.effect === 'knockout' ? '⁻ᴷᴼ' : m.effect === 'overexpress' ? '↑' : '★'}
            </span>
          ))}
        </div>
      </div>

      {/* SVG 细胞视图 */}
      <div className="min-h-0 flex-1">
        <svg viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`} className="h-full w-full" role="img" aria-label={`${labelPrefix}细胞通路视图`}>
          <defs>
            <linearGradient id={`cmpBg${side}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#020617" />
              <stop offset="100%" stopColor="#0a0f1e" />
            </linearGradient>
            <marker id={`cmpArrAct${side}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#34d399" />
            </marker>
            <marker id={`cmpArrInh${side}`} viewBox="0 0 12 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 0 10 M 0.5 5 L 10 5" stroke="#fb7185" strokeWidth="2" fill="none" />
            </marker>
            <marker id={`cmpArrExpr${side}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#fbbf24" />
            </marker>
          </defs>
          <rect x={-100} y={-100} width={CANVAS.w + 200} height={CANVAS.h + 200} fill={`url(#cmpBg${side})`} />
          <CellMorphology morph={morph} tint={tint} />

          {/* 信号边 */}
          <g fill="none">
            {edges.map((e) => {
              const stA = states[e.source];
              const stB = states[e.target];
              const active = (stA?.activity ?? 0) > 0.4 && (stB?.activity ?? 0) > 0.08;
              const col = edgeColor(e.kind);
              return (
                <path
                  key={`${side}-${e.id}`}
                  d={e.d}
                  stroke={col}
                  strokeWidth={active ? 1.8 : 0.9}
                  opacity={active ? 0.85 : 0.13}
                  markerEnd={active ? edgeMarker(e.kind, `cmpArrAct${side}`, `cmpArrInh${side}`, `cmpArrExpr${side}`, `cmpArrAct${side}`) : undefined}
                  strokeDasharray={e.kind === 'expression' ? '6 4' : e.kind === 'indirect' ? '2 3' : undefined}
                />
              );
            })}
          </g>

          {/* 分子节点 */}
          <g>
            {nodes.map((n) => {
              const st = states[n.id] ?? { activity: 0, phospho: 0, activated: false, activatedAtTick: null };
              const color = KIND_COLORS_MAP[n.kind] ?? KIND_COLORS_MAP.enzyme;
              const active = st.activity > 0.45;
              const op = 0.38 + 0.62 * st.activity;
              const isMut = mutNodeIds.has(n.id);
              const isInjected = n.kind === 'ligand' && injected[n.id];
              return (
                <g key={`${side}-${n.id}`} transform={`translate(${n.px.toFixed(1)} ${n.py.toFixed(1)})`} opacity={op}>
                  {n.kind === 'compound' ? (
                    <ellipse rx={n.nw / 2} ry={n.nh / 2} fill={color.fill} stroke={color.stroke} strokeWidth={active ? 1.6 : 1} strokeDasharray="4 3" />
                  ) : (
                    <rect
                      x={-n.nw / 2} y={-n.nh / 2} width={n.nw} height={n.nh} rx={n.kind === 'ligand' ? 14 : 6}
                      fill={color.fill} stroke={isInjected || active ? color.stroke : `${color.stroke}55`}
                      strokeWidth={isInjected ? 2 : active ? 1.6 : 1}
                    />
                  )}
                  <text
                    y={n.kind === 'compound' ? 3 : 3.6}
                    textAnchor="middle"
                    fontSize={9.5}
                    fontFamily="var(--font-geist-mono, monospace)"
                    fill={active || isInjected ? color.text : '#8c9bab'}
                    fontWeight={active || isInjected ? 600 : 400}
                  >
                    {truncateLabel(n.label)}
                  </text>
                  {st.phospho > 0.25 && n.kind !== 'compound' && (
                    <g opacity={Math.min(1, st.phospho * 1.2)} transform={`translate(${n.nw / 2 - 4} ${-n.nh / 2 + 2})`}>
                      <circle r={6.5} fill="#78350f" stroke="#fbbf24" strokeWidth={1} />
                      <text y={2.6} textAnchor="middle" fontSize={8} fill="#fde68a" fontWeight={700} fontFamily="var(--font-geist-mono, monospace)">P</text>
                    </g>
                  )}
                  {isMut && (
                    <g transform={`translate(${-n.nw / 2 + 6} ${-n.nh / 2 + 2})`}>
                      <circle r={7} fill="#450a0a" stroke="#f97316" strokeWidth={1.1} />
                      <text y={2.8} textAnchor="middle" fontSize={7} fill="#fecaca" fontWeight={700} fontFamily="var(--font-geist-mono, monospace)">M</text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

/* ============ 主对比视图 ============ */

export function CompareView() {
  const active = useCompareStore((s) => s.active);
  const graph = useCompareStore((s) => s.graph);
  const armA = useCompareStore((s) => s.armA);
  const armB = useCompareStore((s) => s.armB);
  const cellA = useCompareStore((s) => s.cellA);
  const cellB = useCompareStore((s) => s.cellB);
  const setCellA = useCompareStore((s) => s.setCellA);
  const setCellB = useCompareStore((s) => s.setCellB);
  const running = useCompareStore((s) => s.running);
  const tick = useCompareStore((s) => s.tick);
  const injected = useCompareStore((s) => s.injected);
  const sharedLigands = useCompareStore((s) => s.sharedLigands);
  const play = useCompareStore((s) => s.play);
  const pause = useCompareStore((s) => s.pause);
  const reset = useCompareStore((s) => s.reset);
  const tickCompare = useCompareStore((s) => s.tickCompare);

  const [tab, setTab] = useState<'delta' | 'events'>('delta');

  // 模拟循环
  useEffect(() => {
    if (!running || !active) return;
    const timer = setInterval(() => tickCompare(), TICK_MS);
    return () => clearInterval(timer);
  }, [running, active, tickCompare]);

  // 共享布局（两臂同一形态学锚定 —— 视觉对齐只差活性）
  const layout = useMemo(() => {
    if (!graph) return null;
    // 用对照臂细胞形态作为共享布局形态（差异全部由活性/徽标呈现, 避免布局位移干扰对比）
    const morph = CELL_TYPE_MAP.get(cellA)?.morphology ?? 'hepatocyte';
    return layoutCellView(graph.core.nodes, graph.core.edges, morph);
  }, [graph, cellA]);

  const deltas = useMemo(() => moleculeDeltas(graph, armA, armB), [graph, armA, armB]);
  const summary = useMemo(
    () => (armA && armB ? compareSummary(deltas, armA, armB) : null),
    [deltas, armA, armB],
  );

  if (!active || !graph || !layout || !armA || !armB) return null;

  const topDeltas = deltas.slice(0, 14);
  const eventsB = armB.events.filter((e) => e.kind !== 'info').slice(-16).reverse();

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#01040e]/97 backdrop-blur-sm">
      {/* 头部 */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/8 bg-slate-950/80 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-teal-300" />
          <div>
            <div className="text-[13px] font-semibold text-slate-100">通路对照实验</div>
            <div className="text-[9.5px] text-slate-500">
              {graph.meta.nameZh} · 同通路/同刺激/不同遗传背景 · 单变量实验设计
            </div>
          </div>
        </div>

        {/* 播放控制 */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => (running ? pause() : play())}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] transition ${
              running
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
            }`}
          >
            {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
            {running ? '暂停' : '同步刺激'}
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-400 transition hover:text-rose-300"
          >
            <RotateCcw className="h-3 w-3" />
            重置
          </button>
        </div>

        {/* 配体选择（无有效配体通路回退为直接刺激入口） */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-slate-500">
            {graph.core.edges.some((e) => graph.core.nodes.some((n) => n.tier === 0 && n.id === e.source)) ? '共同刺激:' : '直接刺激:'}
          </span>
          {(() => {
            const hasProductiveLigand = graph.core.edges.some((e) =>
              graph.core.nodes.some((n) => n.tier === 0 && n.id === e.source),
            );
            if (hasProductiveLigand) {
              return graph.core.nodes.filter((n) => n.tier === 0).map((n) => ({ n, surface: true }));
            }
            const incoming = new Set(graph.core.edges.map((e) => e.target));
            const receptors = graph.core.nodes.filter(
              (n) => n.tier === 1 && graph.core.edges.some((e) => e.source === n.id),
            );
            const stressSources = graph.core.nodes
              .filter(
                (n) =>
                  !incoming.has(n.id) &&
                  (n.kind === 'kinase' || n.kind === 'gtpase') &&
                  graph.core.edges.filter((e) => e.source === n.id).length >= 2,
              )
              .sort(
                (a, b) =>
                  graph.core.edges.filter((e) => e.source === b.id).length -
                  graph.core.edges.filter((e) => e.source === a.id).length,
              )
              .slice(0, 4);
            return [...receptors, ...stressSources].map((n) => ({
              n,
              surface: n.kind === 'receptor' || n.kind === 'channel',
            }));
          })().map(({ n, surface }) => (
            <button
              key={n.id}
              onClick={() => useCompareStore.getState().toggleLigand(n.id)}
              className={`rounded-full border px-2 py-0.5 font-mono text-[9px] transition ${
                injected[n.id]
                  ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                  : 'border-white/10 text-slate-500 hover:text-slate-300'
              }`}
              title={
                surface
                  ? `${n.label} —— 受体直接刺激（等效配体结合后构象激活）`
                  : `${n.label} —— 应激刺激入口（等效上游生理激活）`
              }
            >
              {n.label}
              {sharedLigands[0] === n.label ? ' ★' : ''}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-[10px] text-slate-500">T+{(tick * 0.5).toFixed(1)}s</span>
          <CompareReportExportButton />
          <button
            onClick={() => useCompareStore.getState().close()}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-400 transition hover:border-rose-500/40 hover:text-rose-300"
          >
            <X className="h-3.5 w-3.5" />
            退出对照
          </button>
        </div>
      </div>

      {/* 主体: 双臂 + 分析 */}
      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 lg:grid-cols-[1fr_1fr_330px]">
        <MiniArmView side="A" cellId={cellA} nodes={layout.nodes} edges={layout.edges} states={armA.states} injected={injected} />
        <MiniArmView side="B" cellId={cellB} nodes={layout.nodes} edges={layout.edges} states={armB.states} injected={injected} />

        {/* 分析栏 */}
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          {/* 细胞系选择 */}
          <div className="grid grid-cols-2 gap-2">
            {([['A', cellA, setCellA], ['B', cellB, setCellB]] as const).map(([side, val, setter]) => (
              <label key={side} className="block">
                <span className={`mb-1 block text-[8.5px] ${side === 'A' ? 'text-teal-400' : 'text-rose-400'}`}>臂 {side} 细胞系</span>
                <select
                  value={val}
                  onChange={(e) => setter(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[10.5px] text-slate-200 outline-none focus:border-teal-500/50"
                >
                  {CELL_TYPES.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {/* 总结卡 */}
          {summary && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-rose-500/25 bg-rose-500/8 p-2.5">
                <div className="flex items-center gap-1 text-[8.5px] text-rose-300/80"><Zap className="h-3 w-3" />自主激活分子</div>
                <div className="mt-0.5 font-mono text-xl font-bold text-rose-300">{summary.autonomousCount}</div>
                <div className="text-[8px] text-slate-500">仅实验臂激活（Δ&gt;0.5）</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                <div className="flex items-center gap-1 text-[8.5px] text-slate-400"><Sigma className="h-3 w-3" />平均活性差</div>
                <div className={`mt-0.5 font-mono text-xl font-bold ${summary.meanDelta > 0.05 ? 'text-rose-300' : summary.meanDelta < -0.05 ? 'text-teal-300' : 'text-slate-300'}`}>
                  {summary.meanDelta >= 0 ? '+' : ''}{(summary.meanDelta * 100).toFixed(1)}%
                </div>
                <div className="text-[8px] text-slate-500">实验臂 − 对照臂</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                <div className="flex items-center gap-1 text-[8.5px] text-slate-400"><Timer className="h-3 w-3" />转录应答提前</div>
                <div className="mt-0.5 font-mono text-xl font-bold text-amber-300">
                  {summary.phase4LeadTicks != null ? `${(summary.phase4LeadTicks * 0.5).toFixed(1)}s` : '—'}
                </div>
                <div className="text-[8px] text-slate-500">阶段④首达时差（负=B 更快）</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                <div className="flex items-center gap-1 text-[8.5px] text-slate-400"><Dna className="h-3 w-3" />事件总数</div>
                <div className="mt-0.5 font-mono text-xl font-bold text-slate-200">{summary.totalEvents}</div>
                <div className="text-[8px] text-slate-500">两臂分子事件合计</div>
              </div>
            </div>
          )}

          {/* 差异 tab */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/8 bg-slate-950/50">
            <div className="flex border-b border-white/5">
              {(['delta', 'events'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-[10px] transition ${tab === t ? 'border-b-2 border-teal-400 text-teal-300' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {t === 'delta' ? `分子差异 Top ${topDeltas.length}` : '实验臂事件'}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-width:thin]">
              {tab === 'delta' ? (
                <div className="space-y-1.5">
                  {topDeltas.map((d) => {
                    const pct = Math.abs(d.delta) * 100;
                    const up = d.delta > 0;
                    return (
                      <div key={d.id} className="rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-16 truncate font-mono text-[10px] font-semibold text-slate-200">{d.label}</span>
                          <span className="rounded bg-white/5 px-1 font-mono text-[8px] text-slate-500">{d.tier === 0 ? '配体' : d.tier === 1 ? '膜' : d.tier >= 5 ? '核' : '胞质'}</span>
                          <span className={`ml-auto font-mono text-[10px] font-bold ${up ? 'text-rose-300' : 'text-teal-300'}`}>
                            {up ? '+' : ''}{(d.delta * 100).toFixed(0)}%
                          </span>
                        </div>
                        {/* 双向条: 左 teal=A 右 rose=B */}
                        <div className="mt-1 flex items-center gap-1">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                            <div className="ml-auto h-full rounded-full bg-teal-400/70" style={{ width: `${d.activityA * 100}%` }} />
                          </div>
                          <span className="font-mono text-[7px] text-slate-600">A</span>
                          <ChevronRight className="h-2.5 w-2.5 text-slate-600" />
                          <span className="font-mono text-[7px] text-slate-600">B</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                            <div className="h-full rounded-full bg-rose-400/70" style={{ width: `${d.activityB * 100}%` }} />
                          </div>
                        </div>
                        {/* 提速标注 */}
                        {d.activatedTickA != null && d.activatedTickB != null && d.activatedTickB !== d.activatedTickA && (
                          <div className="mt-0.5 text-[8px] text-amber-400/80">
                            激活时差 {((d.activatedTickB - d.activatedTickA) * 0.5).toFixed(1)}s（{d.activatedTickB < d.activatedTickA ? '实验臂更快' : '对照臂更快'}）
                          </div>
                        )}
                        {pct > 0.5 && d.activityB > 0.5 && d.activityA < 0.05 && (
                          <div className="mt-0.5 text-[8px] text-rose-400/90">⚠ 组成性活化 —— 不依赖上游刺激</div>
                        )}
                      </div>
                    );
                  })}
                  {topDeltas.length === 0 && <p className="p-3 text-center text-[10px] text-slate-500">播放模拟后显示分子级差异</p>}
                </div>
              ) : (
                <div className="space-y-1">
                  {eventsB.map((e) => (
                    <div key={e.id} className="rounded border border-white/5 bg-white/[0.02] px-2 py-1">
                      <div className="flex items-center gap-1.5 font-mono text-[8px] text-slate-500">
                        <span className="rounded bg-rose-500/15 px-1 text-rose-300">{e.kind.slice(0, 4)}</span>
                        <span>{e.simTime}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[9.5px] leading-snug text-slate-300">{e.text}</p>
                    </div>
                  ))}
                  {eventsB.length === 0 && <p className="p-3 text-center text-[10px] text-slate-500">播放模拟后显示实验臂事件流</p>}
                </div>
              )}
            </div>
          </div>

          <p className="px-1 text-[8px] leading-relaxed text-slate-600">
            对照设计：两臂共享同一 KEGG 子图、同一配体剂量与引擎参数，唯一变量为细胞系遗传背景（突变以 M/KO 徽标标注）。★ = 两臂共同响应配体。
          </p>
        </div>
      </div>
    </div>
  );
}
