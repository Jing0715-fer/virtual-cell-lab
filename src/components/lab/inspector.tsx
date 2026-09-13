'use client';

/**
 * 分子检测器 —— 选中分子的档案卡（功能注释/活性/磷酸化/互作网络）+ 活性曲线
 */
import { useMemo } from 'react';
import { Microscope, ExternalLink, Activity, Dna, ArrowUpRight, ArrowDownRight, ShieldAlert } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, ReferenceArea } from 'recharts';
import { useLabStore } from '@/store/lab-store';
import { CELL_TYPE_MAP } from '@/data/cell-types';
import { NODE_NOTES, fallbackNote } from '@/lib/simulation/molecular-notes';
import { KIND_ZH, COMPARTMENT_ZH } from '@/lib/simulation/engine';
import { cn } from '@/lib/utils';

export function MoleculeInspector() {
  const graph = useLabStore((s) => s.graph);
  const selectedNode = useLabStore((s) => s.selectedNode);
  const nodeStates = useLabStore((s) => s.nodeStates);
  const activityHistory = useLabStore((s) => s.activityHistory);
  const selectNode = useLabStore((s) => s.selectNode);
  const cellId = useLabStore((s) => s.cellId);
  const events = useLabStore((s) => s.events);
  const curTick = useLabStore((s) => s.tick);
  const cell = CELL_TYPE_MAP.get(cellId);

  const node = useMemo(
    () => graph?.core.nodes.find((n) => n.id === selectedNode) ?? null,
    [graph, selectedNode],
  );

  // 活性曲线数据：取当前活性最高的 5 个节点
  const chart = useMemo(() => {
    if (!graph) return null;
    const ids = Object.entries(nodeStates)
      .sort((a, b) => b[1].activity - a[1].activity)
      .slice(0, 5)
      .filter(([, s]) => s.activated || s.activity > 0.1)
      .map(([id]) => id);
    if (ids.length === 0) return null;
    const labelOf = new Map(graph.core.nodes.map((n) => [n.id, n.label]));
    const colors = ['#34d399', '#2dd4bf', '#fbbf24', '#fb7185', '#a3e635'];
    const rows = activityHistory.slice(-90).map((s) => {
      const row: Record<string, number | string> = { t: (s.tick * 0.5).toFixed(1) };
      ids.forEach((id) => { row[labelOf.get(id) ?? id] = Math.round((s.values[id] ?? 0) * 100); });
      return row;
    });
    return { rows, series: ids.map((id) => ({ id, label: labelOf.get(id) ?? id, color: colors[ids.indexOf(id) % 5] }) ) };
  }, [graph, nodeStates, activityHistory]);

  // 药物作用区间（给药事件 → 洗脱事件 / 当前时刻）—— 活性曲线的药理学标注带
  const drugBands = useMemo(() => {
    const bands: { drug: string; from: number; to: number }[] = [];
    let open: { drug: string; from: number } | null = null;
    for (const ev of events) {
      if (ev.kind !== 'inhibition') continue;
      if (ev.text.startsWith('[给药]')) {
        if (!open) {
          const name = ev.text.slice(4).split('（')[0].trim();
          open = { drug: name, from: ev.tick * 0.5 };
        }
      } else if (ev.text.startsWith('[洗脱]') && open) {
        bands.push({ ...open, to: ev.tick * 0.5 });
        open = null;
      }
    }
    if (open) bands.push({ ...open, to: curTick * 0.5 });
    return bands;
  }, [events, curTick]);

  const state = selectedNode ? nodeStates[selectedNode] : undefined;
  const mutation = cell?.mutations?.find((m) => m.node === selectedNode);

  const connections = useMemo(() => {
    if (!graph || !node) return null;
    const up = graph.core.edges.filter((e) => e.target === node.id).slice(0, 8);
    const down = graph.core.edges.filter((e) => e.source === node.id).slice(0, 8);
    const labelOf = new Map(graph.core.nodes.map((n) => [n.id, n]));
    return { up, down, labelOf };
  }, [graph, node]);

  if (!graph) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-slate-600">
        选择通路后此处显示分子档案
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lab-scrollbar">
      {node ? (
        <div className="space-y-3 p-3">
          {/* 头部 */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Microscope className="h-4 w-4 text-emerald-400" />
                <h3 className="font-mono text-base font-semibold tracking-tight text-slate-100">{node.label}</h3>
                {node.synthetic && (
                  <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[9px] text-amber-300">合成节点</span>
                )}
              </div>
              {node.aliases.length > 0 && (
                <p className="mt-0.5 text-[11px] text-slate-500">{node.aliases.slice(0, 6).join(' · ')}</p>
              )}
            </div>
            {node.keggIds[0] && (
              <a
                href={`https://www.kegg.jp/entry/${node.keggIds[0]}`}
                target="_blank"
                rel="noreferrer"
                className="flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-400 transition hover:border-emerald-500/40 hover:text-emerald-300"
              >
                KEGG <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* 分类徽标 */}
          <div className="flex flex-wrap gap-1.5">
            <Badge>{KIND_ZH[node.kind]}</Badge>
            <Badge>{COMPARTMENT_ZH[node.compartment]}</Badge>
            <Badge>信号层级 L{node.tier}</Badge>
            {node.keggIds[0] && <Badge>{node.keggIds[0]}</Badge>}
          </div>

          {/* 状态计量 */}
          <div className="space-y-2.5 rounded-lg border border-white/5 bg-slate-900/50 p-3">
            <Meter label="分子活性" value={state?.activity ?? 0} color="emerald" activated={state?.activated} />
            {node.kind !== 'compound' && (
              <Meter label="磷酸化水平" value={state?.phospho ?? 0} color="amber" />
            )}
            {(state?.activatedAtTick ?? null) !== null && (
              <p className="font-mono text-[10px] text-slate-500">
                首次激活于 T+{(((state?.activatedAtTick ?? 0) as number) * 0.5).toFixed(1)}s
              </p>
            )}
          </div>

          {/* 突变档案 */}
          {mutation && (
            <div className="space-y-1 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-300">
                <ShieldAlert className="h-3.5 w-3.5" /> 本细胞系突变档案
              </div>
              <p className="text-[11px] leading-4 text-rose-200/80">{mutation.note}</p>
            </div>
          )}

          {/* 功能注释 */}
          <div>
            <h4 className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">分子功能注释</h4>
            <p className="rounded-lg bg-slate-900/40 p-2.5 text-[11.5px] leading-[19px] text-slate-300">
              {NODE_NOTES[node.label] ?? NODE_NOTES[node.id] ?? fallbackNote(node.label, node.kind, node.compartment)}
            </p>
          </div>

          {/* 互作网络 */}
          {connections && (connections.up.length > 0 || connections.down.length > 0) && (
            <div>
              <h4 className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">信号网络连接</h4>
              <div className="space-y-1">
                {connections.up.map((e) => {
                  const src = connections.labelOf.get(e.source);
                  return (
                    <button key={e.id} onClick={() => selectNode(e.source)}
                      className="flex w-full items-center gap-1.5 rounded-md border border-white/5 bg-slate-900/40 px-2 py-1 text-left text-[10.5px] text-slate-400 transition hover:border-emerald-500/30 hover:text-emerald-200">
                      <ArrowDownRight className="h-3 w-3 shrink-0 text-emerald-400" />
                      <span className="font-mono text-slate-300">{src?.label}</span>
                      <span className="ml-auto text-[9px] text-slate-600">{edgeKindZh(e.kind)}</span>
                    </button>
                  );
                })}
                {connections.down.map((e) => {
                  const tgt = connections.labelOf.get(e.target);
                  return (
                    <button key={e.id} onClick={() => selectNode(e.target)}
                      className="flex w-full items-center gap-1.5 rounded-md border border-white/5 bg-slate-900/40 px-2 py-1 text-left text-[10.5px] text-slate-400 transition hover:border-emerald-500/30 hover:text-emerald-200">
                      <ArrowUpRight className="h-3 w-3 shrink-0 text-teal-400" />
                      <span className="font-mono text-slate-300">{tgt?.label}</span>
                      <span className="ml-auto text-[9px] text-slate-600">{edgeKindZh(e.kind)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Dna className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-200">{graph.meta.nameZh}</h3>
          </div>
          <p className="text-[11.5px] leading-[19px] text-slate-400">{graph.meta.description}</p>
          <div className="rounded-lg border border-white/5 bg-slate-900/50 p-2.5 font-mono text-[10.5px] leading-5 text-slate-400">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">核心级联</div>
            {graph.meta.cascade}
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Activity className="h-3.5 w-3.5" />
            点击画布中的分子节点查看分子级档案（残基注释 / 互作 / 突变）
          </p>
        </div>
      )}

      {/* 活性曲线 */}
      {chart && (
        <div className="mt-auto border-t border-white/5 p-3">
          <h4 className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">活性动力学曲线（Top 5）</h4>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart.rows} margin={{ top: 4, right: 6, bottom: 0, left: -22 }}>
                {drugBands.map((b, i) => (
                  <ReferenceArea
                    key={`band-${i}`}
                    x1={b.from.toFixed(1)}
                    x2={b.to.toFixed(1)}
                    fill="#a855f7"
                    fillOpacity={0.09}
                    stroke="#c084fc"
                    strokeOpacity={0.35}
                    strokeDasharray="3 3"
                    label={{ value: b.drug, position: 'insideTop', fill: '#d8b4fe', fontSize: 9 }}
                  />
                ))}
                <CartesianGrid stroke="#1e293b" strokeDasharray="2 4" />
                <XAxis dataKey="t" tick={{ fill: '#475569', fontSize: 9 }} stroke="#1e293b" />
                <YAxis domain={[0, 100]} tick={{ fill: '#475569', fontSize: 9 }} stroke="#1e293b" />
                <RTooltip
                  contentStyle={{ background: '#020617ee', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                {chart.series.map((s) => (
                  <Line key={s.id} dataKey={s.label} stroke={s.color} strokeWidth={1.6} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {chart.series.map((s) => (
              <span key={s.id} className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="h-1.5 w-3 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
            {drugBands.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-purple-300/80">
                <span className="h-1.5 w-3 rounded-full bg-purple-500/40 border border-purple-400/40" />
                药物作用区间
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">{children}</span>
  );
}

function Meter({ label, value, color, activated }: { label: string; value: number; color: 'emerald' | 'amber'; activated?: boolean }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px]">
        <span className="flex items-center gap-1.5 text-slate-400">
          {label}
          {activated && <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />}
        </span>
        <span className={cn('font-mono', pct > 45 ? 'text-emerald-300' : 'text-slate-500')}>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            color === 'emerald'
              ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' + (pct > 45 ? ' shadow-[0_0_8px_rgba(52,211,153,0.6)]' : '')
              : 'bg-gradient-to-r from-amber-600 to-amber-400',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function edgeKindZh(kind: string): string {
  const m: Record<string, string> = {
    activation: '激活', inhibition: '抑制', phosphorylation: '磷酸化', dephosphorylation: '去磷酸化',
    expression: '转录表达', repression: '阻遏', binding: '结合', dissociation: '解离',
    indirect: '间接', missing: '缺失互作', 'state-change': '状态变化',
  };
  return m[kind] ?? kind;
}
