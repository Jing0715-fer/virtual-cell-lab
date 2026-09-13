'use client';

/**
 * KEGG 通路图谱视图 —— 使用 KGML 原始坐标渲染完整通路拓扑
 * 与虚拟细胞视图共享模拟状态（同一信号引擎，双视图联动）
 * 垂直参考条目（如 Cell cycle）旋转文字渲染；TITLE 条目净化为图谱标题；
 * 关联通路条目可点击跳转（收录范围内）或打开 KEGG 官方页
 */
import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import type { EdgeKind } from '@/types/kegg';
import { useLabStore } from '@/store/lab-store';
import { PATHWAY_CATALOG } from '@/data/pathway-catalog';
import { CANVAS } from '@/lib/simulation/layout';

const CATALOG_IDS = new Set(PATHWAY_CATALOG.map((p) => p.id));

function edgeColor(kind: EdgeKind | undefined): string {
  if (!kind) return '#34d399';
  if (kind === 'inhibition' || kind === 'repression' || kind === 'missing' || kind === 'dephosphorylation') return '#fb7185';
  if (kind === 'expression') return '#fbbf24';
  if (kind === 'binding' || kind === 'dissociation') return '#64748b';
  if (kind === 'indirect' || kind === 'state-change') return '#2dd4bf';
  return '#34d399';
}

interface PlacedEntry {
  id: number;
  label: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 关联通路 id（type=map 且 keggIds 携带 path:hsaXXXX 时存在） */
  linkedPathway?: string;
}

interface PlacedRel {
  key: string;
  d: string;
  kind: EdgeKind | undefined;
  sourceId: number;
  targetId: number;
}

export function PathwayMapView() {
  const graph = useLabStore((s) => s.graph);
  const nodeStates = useLabStore((s) => s.nodeStates);
  const signalFlux = useLabStore((s) => s.signalFlux);
  const selectedNode = useLabStore((s) => s.selectedNode);
  const selectNode = useLabStore((s) => s.selectNode);
  const selectPathway = useLabStore((s) => s.selectPathway);

  const [vb, setVb] = useState({ x: 0, y: 0, w: CANVAS.w, h: CANVAS.h });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ x: number; y: number; vb: typeof vb } | null>(null);

  // KGML 坐标 → 画布（保持纵横比 fit）
  const transform = useMemo(() => {
    if (!graph) return null;
    const xs = graph.nodes.flatMap((n) => [n.x, n.x + n.w]);
    const ys = graph.nodes.flatMap((n) => [n.y, n.y + n.h]);
    const minX = Math.min(...xs, Infinity);
    const maxX = Math.max(...xs, -Infinity);
    const minY = Math.min(...ys, Infinity);
    const maxY = Math.max(...ys, -Infinity);
    const pad = 70;
    const scale = Math.min((CANVAS.w - pad * 2) / (maxX - minX || 1), (CANVAS.h - pad * 2) / (maxY - minY || 1));
    const ox = (CANVAS.w - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = (CANVAS.h - (maxY - minY) * scale) / 2 - minY * scale;
    return { scale, ox, oy };
  }, [graph]);

  const entries = useMemo(() => {
    if (!graph || !transform) return null;
    const t = transform;
    const byId = new Map<number, PlacedEntry>();
    const list: PlacedEntry[] = graph.nodes.map((n) => {
      const linked =
        n.type === 'map' && n.keggIds[0]?.startsWith('path:')
          ? n.keggIds[0].slice(5)
          : undefined;
      const e: PlacedEntry = {
        id: n.entryId, label: n.label, type: n.type,
        x: n.x * t.scale + t.ox, y: n.y * t.scale + t.oy,
        w: Math.max(14, n.w * t.scale), h: Math.max(9, n.h * t.scale),
        linkedPathway: linked,
      };
      byId.set(n.entryId, e);
      return e;
    });
    return { list, byId };
  }, [graph, transform]);

  // 核心子图节点 id → entryId 映射（用于活性叠加）
  const coreByEntry = useMemo(() => {
    if (!graph) return null;
    const m = new Map<number, string>();
    for (const n of graph.core.nodes) m.set(n.entryId, n.id);
    return m;
  }, [graph]);

  // 边（仅核心子图中的 relation 才有 kind 信息，其他渲染为弱连接线）
  const rels = useMemo(() => {
    if (!graph || !entries) return null;
    const corePairs = new Set(graph.core.edges.map((e) => `${e.source}|${e.target}`));
    const coreLabelById = new Map(graph.core.nodes.map((n) => [n.entryId, n.id]));
    const kindByPair = new Map(graph.core.edges.map((e) => [`${e.source}|${e.target}`, e.kind]));
    const out: PlacedRel[] = [];
    for (const r of graph.relations) {
      const s = entries.byId.get(r.entry1);
      const t = entries.byId.get(r.entry2);
      if (!s || !t) continue;
      const srcId = coreLabelById.get(s.id) ?? `e${s.id}`;
      const tgtId = coreLabelById.get(t.id) ?? `e${t.id}`;
      const kind = kindByPair.get(`${srcId}|${tgtId}`);
      const inCore = kind !== undefined || corePairs.has(`${srcId}|${tgtId}`);
      const d = `M ${(s.x + s.w / 2).toFixed(1)} ${(s.y + s.h / 2).toFixed(1)} L ${(t.x + t.w / 2).toFixed(1)} ${(t.y + t.h / 2).toFixed(1)}`;
      out.push({ key: `${r.entry1}-${r.entry2}-${out.length}`, d, kind: inCore ? kind : 'indirect' as EdgeKind, sourceId: r.entry1, targetId: r.entry2 });
    }
    return out;
  }, [graph, entries]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      setVb((prev) => {
        const mx = ((e.clientX - rect.left) / rect.width) * prev.w + prev.x;
        const my = ((e.clientY - rect.top) / rect.height) * prev.h + prev.y;
        const factor = Math.pow(1.0015, e.deltaY);
        const nw = Math.min(CANVAS.w * 1.6, Math.max(CANVAS.w * 0.22, prev.w * factor));
        const nh = nw * (CANVAS.h / CANVAS.w);
        return { x: mx - ((mx - prev.x) / prev.w) * nw, y: my - ((my - prev.y) / prev.h) * nh, w: nw, h: nh };
      });
    };
    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
  }, []);

  if (!graph || !entries || !rels || !coreByEntry) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">通路图谱渲染中…</div>;
  }

  const zoom = (factor: number) => {
    const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    const nw = Math.min(CANVAS.w * 1.6, Math.max(CANVAS.w * 0.22, vb.w * factor));
    const nh = nw * (CANVAS.h / CANVAS.w);
    setVb({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
  };

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(e) => { dragging.current = { x: e.clientX, y: e.clientY, vb }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => {
          const d = dragging.current; const svg = svgRef.current;
          if (!d || !svg) return;
          const rect = svg.getBoundingClientRect();
          setVb({ ...d.vb, x: d.vb.x - ((e.clientX - d.x) / rect.width) * d.vb.w, y: d.vb.y - ((e.clientY - d.y) / rect.height) * d.vb.h });
        }}
        onPointerUp={() => { dragging.current = null; }}
        role="img"
        aria-label="KEGG 通路图谱"
      >
        <defs>
          <marker id="mAct" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#34d399" />
          </marker>
          <marker id="mInh" viewBox="0 0 12 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 0 10 M 0.5 5 L 10 5" stroke="#fb7185" strokeWidth="2" fill="none" />
          </marker>
          <marker id="mExp" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#fbbf24" />
          </marker>
        </defs>

        <rect x={-200} y={-200} width={CANVAS.w + 400} height={CANVAS.h + 400} fill="#020617" />

        {/* 关系边 */}
        <g fill="none">
          {rels.map((r) => {
            const srcCore = coreByEntry.get(r.sourceId);
            const tgtCore = coreByEntry.get(r.targetId);
            const flux = srcCore && tgtCore ? signalFlux[`${srcCore}>${tgtCore}`] : undefined;
            const active = flux !== undefined && Math.abs(flux) > 0.06;
            const col = edgeColor(r.kind);
            const marker = r.kind === 'inhibition' || r.kind === 'repression' ? 'url(#mInh)'
              : r.kind === 'expression' ? 'url(#mExp)' : 'url(#mAct)';
            return (
              <path
                key={r.key}
                d={r.d}
                stroke={col}
                strokeWidth={active ? 2 : r.kind === 'indirect' ? 0.5 : 0.9}
                opacity={active ? 0.95 : r.kind === 'indirect' ? 0.12 : 0.3}
                markerEnd={r.kind === 'indirect' ? undefined : marker}
                className={active ? 'edge-flow' : undefined}
              />
            );
          })}
        </g>

        {/* 分子节点 */}
        <g fontFamily="var(--font-geist-mono, monospace)">
          {entries.list.map((e) => {
            const coreId = coreByEntry.get(e.id);
            const st = coreId ? nodeStates[coreId] : undefined;
            const active = (st?.activity ?? 0) > 0.45;
            const isCompound = e.type === 'compound';
            const isTitle = e.type === 'map' && e.label.startsWith('TITLE:');
            const isLinkedMap = e.type === 'map' && !isTitle;
            const vertical = !isTitle && e.h / Math.max(1, e.w) >= 2.2;
            const fill = active ? (isCompound ? 'rgba(250,204,21,0.35)' : 'rgba(52,211,153,0.35)') : isCompound ? 'rgba(250,204,21,0.1)' : 'rgba(30,41,59,0.85)';
            const stroke = active ? (isCompound ? '#facc15' : '#34d399') : isCompound ? '#a16207' : '#334155';
            const selected = coreId && selectedNode === coreId;

            // KEGG 图谱标题（原位净化渲染，无框）
            if (isTitle) {
              return (
                <text
                  key={e.id}
                  x={e.x} y={e.y}
                  textAnchor="start" dominantBaseline="middle"
                  fontSize={Math.max(10, e.h * 0.6)}
                  fill="rgba(167,243,208,0.5)"
                  style={{ letterSpacing: '0.12em', userSelect: 'none' }}
                >{e.label.slice(6)}</text>
              );
            }

            const label = e.label.length > 12 ? e.label.slice(0, 11) + '…' : e.label;
            const fontSize = vertical
              ? Math.max(6, Math.min(e.w * 0.52, e.h / Math.max(4, label.length) * 1.7))
              : Math.max(6.5, Math.min(e.h * 0.62, e.w / Math.max(4.5, label.length * 0.72)));

            return (
              <g key={e.id}
                className={coreId || (isLinkedMap && e.linkedPathway) ? 'cursor-pointer' : undefined}
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (coreId) { selectNode(coreId); return; }
                  if (isLinkedMap && e.linkedPathway && CATALOG_IDS.has(e.linkedPathway)) {
                    selectPathway(e.linkedPathway);
                  }
                }}
                style={active ? { filter: 'drop-shadow(0 0 5px rgba(52,211,153,0.7))' } : undefined}>
                <rect
                  x={e.x - e.w / 2} y={e.y - e.h / 2} width={e.w} height={e.h}
                  rx={isCompound ? Math.min(e.w, e.h) / 2 : 3}
                  fill={isLinkedMap ? 'rgba(13,148,136,0.10)' : fill}
                  stroke={selected ? '#f0fdfa' : isLinkedMap ? '#0d9488' : stroke}
                  strokeWidth={selected ? 1.6 : isLinkedMap ? 1 : active ? 1.6 : 0.9}
                  strokeDasharray={isLinkedMap ? '4 3' : undefined}
                />
                <text
                  x={e.x} y={e.y + (vertical ? 0 : 3.2)}
                  textAnchor="middle" dominantBaseline={vertical ? 'middle' : undefined}
                  fontSize={fontSize}
                  fill={isLinkedMap ? '#5eead4' : active ? '#a7f3d0' : '#64748b'}
                  fontWeight={active || isLinkedMap ? 600 : 400}
                  transform={vertical ? `rotate(-90 ${e.x} ${e.y})` : undefined}
                >{label}</text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute right-3 top-3 flex flex-col gap-1">
        {[
          { label: '＋', fn: () => zoom(0.78), title: '放大' },
          { label: '－', fn: () => zoom(1.28), title: '缩小' },
          { label: '⟲', fn: () => setVb({ x: 0, y: 0, w: CANVAS.w, h: CANVAS.h }), title: '重置' },
        ].map((b) => (
          <button key={b.label} onClick={b.fn} title={b.title}
            className="h-8 w-8 rounded-md border border-white/10 bg-slate-900/80 text-sm text-slate-300 backdrop-blur transition hover:border-emerald-500/50 hover:text-emerald-300">{b.label}</button>
        ))}
      </div>

      <div className="absolute left-3 top-3 rounded-md border border-white/10 bg-slate-950/80 px-3 py-2 text-[11px] leading-5 text-slate-400 backdrop-blur">
        <span className="text-emerald-300 font-semibold">{graph.meta.nameZh}</span>
        <span className="mx-1 text-slate-600">|</span>KEGG 原始拓扑布局
        <div className="text-slate-500">{graph.stats.geneCount} 分子 · {graph.stats.relationCount} 关系 · 拖拽平移 / 滚轮缩放</div>
      </div>

      <a
        href={graph.meta.keggLink}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-3 right-3 rounded-md border border-amber-500/30 bg-slate-950/80 px-3 py-1.5 text-[11px] text-amber-300/90 backdrop-blur transition hover:border-amber-400/60"
      >KEGG 官方通路图 ↗</a>
    </div>
  );
}
