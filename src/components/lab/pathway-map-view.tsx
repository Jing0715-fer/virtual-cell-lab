'use client';

/**
 * KEGG 通路图谱视图 —— 使用 KGML 原始坐标渲染完整通路拓扑
 * 与虚拟细胞视图共享模拟状态（同一信号引擎，双视图联动）
 * 垂直参考条目（如 Cell cycle）旋转文字渲染；TITLE 条目净化为图谱标题；
 * 关联通路条目可点击跳转（KEGG 全量目录 372 条内）或打开 KEGG 官方页
 *
 * 非核心分子（未进入演示子图的 KGML 节点）也可点击：弹出 mapPick 信息卡
 * （主符号 / KEGG entry 链接 / 别名 / 分子类型），点空白处清除。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import type { EdgeKind } from '@/types/kegg';
import { useLabStore } from '@/store/lab-store';
import { KEGG_FULL_MAP } from '@/data/kegg-full-catalog';
import { CANVAS } from '@/lib/simulation/layout';
import { useLang } from '@/lib/i18n';

/** 可点击跳转的联通通路范围：KEGG 全量目录（372 条人类通路） */
const FULL_CATALOG_IDS = new Set(KEGG_FULL_MAP.keys());

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
  /** KEGG entry id 列表（如 hsa:5594 / cpd:C00338），mapPick 信息卡链接用 */
  keggIds: string[];
  /** 别名（graphics.name 其余项 / 合并 entry 成员符号） */
  aliases: string[];
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
  const { t, lang } = useLang();
  const graph = useLabStore((s) => s.graph);
  const nodeStates = useLabStore((s) => s.nodeStates);
  const signalFlux = useLabStore((s) => s.signalFlux);
  const selectedNode = useLabStore((s) => s.selectedNode);
  const selectNode = useLabStore((s) => s.selectNode);
  const selectPathway = useLabStore((s) => s.selectPathway);

  const [vb, setVb] = useState({ x: 0, y: 0, w: CANVAS.w, h: CANVAS.h });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ x: number; y: number; vb: typeof vb } | null>(null);
  /** 非核心分子点击卡（附带所属通路 id：切换通路后自动失效，不渲染旧数据） */
  const [mapPick, setMapPick] = useState<{ pathway: string; entry: PlacedEntry } | null>(null);

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
        keggIds: n.keggIds, aliases: n.aliases,
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
    return <div className="flex h-full items-center justify-center text-muted-foreground">{t('pm.loading')}</div>;
  }

  // 跨通路失效：仅当 mapPick 属于当前通路时才渲染（避免切换通路后残留旧条目）
  const pick = mapPick && mapPick.pathway === graph.meta.id ? mapPick.entry : null;

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
        onPointerUp={(e) => {
          // 位移 < 4px 视为点击（非拖拽）→ 清除非核心分子信息卡
          // （节点点击的 click 事件在 pointerup 之后触发，会重新设置选中，顺序安全）
          const d = dragging.current;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) setMapPick(null);
          dragging.current = null;
        }}
        role="img"
        aria-label={t('pm.aria')}
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
            const isMolecule = e.type === 'gene' || isCompound;
            const vertical = !isTitle && e.h / Math.max(1, e.w) >= 2.2;
            const fill = active ? (isCompound ? 'rgba(250,204,21,0.35)' : 'rgba(52,211,153,0.35)') : isCompound ? 'rgba(250,204,21,0.1)' : 'rgba(30,41,59,0.85)';
            const stroke = active ? (isCompound ? '#facc15' : '#34d399') : isCompound ? '#b45309' : '#475569';
            const selected = coreId && selectedNode === coreId;
            const picked = pick?.id === e.id;

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
              ? Math.max(7, Math.min(e.w * 0.52, e.h / Math.max(4, label.length) * 1.7))
              : Math.max(7.5, Math.min(e.h * 0.62, e.w / Math.max(4.5, label.length * 0.72)));

            return (
              <g key={e.id}
                className={isMolecule || (isLinkedMap && e.linkedPathway) ? 'cursor-pointer' : undefined}
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (coreId) { selectNode(coreId); return; }
                  if (isLinkedMap) {
                    // 全量目录内的联通通路可点击跳转（372 条）
                    if (e.linkedPathway && FULL_CATALOG_IDS.has(e.linkedPathway)) {
                      selectPathway(e.linkedPathway);
                    }
                    return;
                  }
                  if (isMolecule) setMapPick({ pathway: graph.meta.id, entry: e });
                }}
                style={active ? { filter: 'drop-shadow(0 0 5px rgba(52,211,153,0.7))' } : undefined}>
                <rect
                  x={e.x - e.w / 2} y={e.y - e.h / 2} width={e.w} height={e.h}
                  rx={isCompound ? Math.min(e.w, e.h) / 2 : 3}
                  fill={isLinkedMap ? 'rgba(13,148,136,0.16)' : fill}
                  stroke={selected || picked ? '#f0fdfa' : isLinkedMap ? '#0d9488' : stroke}
                  strokeWidth={selected || picked ? 1.6 : isLinkedMap ? 1 : active ? 1.6 : 0.9}
                  strokeDasharray={isLinkedMap ? '4 3' : undefined}
                />
                <text
                  x={e.x} y={e.y + (vertical ? 0 : 3.2)}
                  textAnchor="middle" dominantBaseline={vertical ? 'middle' : undefined}
                  fontSize={fontSize}
                  fill={isLinkedMap ? '#5eead4' : active ? '#a7f3d0' : picked ? '#e2e8f0' : '#b6c2cf'}
                  fontWeight={active || isLinkedMap ? 600 : 500}
                  transform={vertical ? `rotate(-90 ${e.x} ${e.y})` : undefined}
                  // 文字描边背景（halo）：提升暗底图上的文字对比度
                  style={{ paintOrder: 'stroke', stroke: '#020617', strokeWidth: 3, strokeLinejoin: 'round' }}
                >{label}</text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute right-3 top-3 flex flex-col gap-1">
        {[
          { label: '＋', fn: () => zoom(0.78), title: t('pm.zoomIn') },
          { label: '－', fn: () => zoom(1.28), title: t('pm.zoomOut') },
          { label: '⟲', fn: () => setVb({ x: 0, y: 0, w: CANVAS.w, h: CANVAS.h }), title: t('pm.zoomReset') },
        ].map((b) => (
          <button key={b.label} onClick={b.fn} title={b.title}
            className="h-8 w-8 rounded-md border border-white/10 bg-slate-900/80 text-sm text-slate-300 backdrop-blur transition hover:border-emerald-500/50 hover:text-emerald-300">{b.label}</button>
        ))}
      </div>

      <div className="absolute left-3 top-3 rounded-md border border-white/10 bg-slate-950/80 px-3 py-2 text-[11px] leading-5 text-slate-400 backdrop-blur">
        <span className="text-emerald-300 font-semibold">{lang === 'zh' ? graph.meta.nameZh : graph.meta.name}</span>
        <span className="mx-1 text-slate-600">|</span>{t('pm.origLayout')}
        <div className="text-slate-500">
          {lang === 'zh'
            ? `${graph.stats.geneCount} 分子 · ${graph.stats.relationCount} 关系 · 拖拽平移 / 滚轮缩放`
            : `${graph.stats.geneCount} molecules · ${graph.stats.relationCount} relations · drag to pan / scroll to zoom`}
        </div>
      </div>

      {/* 非核心分子信息卡（点击全图中未进入演示子图的 gene/compound 节点） */}
      {pick && (
        <div
          role="status"
          aria-label={`${t('pm.infoAria')}${pick.label}`}
          className="absolute bottom-3 left-3 w-[290px] max-w-[calc(100%-9rem)] rounded-lg border border-teal-500/35 bg-slate-950/90 p-3 text-[11px] backdrop-blur"
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] font-semibold text-teal-200">{pick.label}</span>
            <span className="rounded border border-white/10 bg-white/5 px-1.5 py-px text-[9px] text-slate-400">
              {pick.type === 'compound' ? t('pm.compound') : t('pm.gene')}
            </span>
            <button
              onClick={() => setMapPick(null)}
              aria-label={t('pm.closePick')}
              className="ml-auto rounded p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {pick.keggIds.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {pick.keggIds.slice(0, 6).map((kid) => (
                <a
                  key={kid}
                  href={`https://www.kegg.jp/entry/${kid}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`${t('pm.openInKegg')} ${kid}`}
                  className="flex items-center gap-0.5 rounded border border-teal-500/25 bg-teal-500/10 px-1.5 py-px font-mono text-[9.5px] text-teal-300 transition hover:border-teal-400/50 hover:text-teal-200"
                >
                  {kid}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ))}
              {pick.keggIds.length > 6 && (
                <span className="self-center font-mono text-[9.5px] text-slate-500">+{pick.keggIds.length - 6}</span>
              )}
            </div>
          )}
          {pick.aliases.length > 0 && (
            <div className="mt-1.5 text-[10px] leading-4 text-slate-500">
              {t('tip.aliases')}: {pick.aliases.slice(0, 6).join(' · ')}
              {pick.aliases.length > 6 ? ` +${pick.aliases.length - 6}` : ''}
            </div>
          )}
          <div className="mt-2 border-t border-white/8 pt-1.5 text-[10px] leading-4 text-slate-500">
            {t('pm.notInCore')}
          </div>
        </div>
      )}

      <a
        href={graph.meta.keggLink}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-3 right-3 rounded-md border border-amber-500/30 bg-slate-950/80 px-3 py-1.5 text-[11px] text-amber-300/90 backdrop-blur transition hover:border-amber-400/60"
      >{t('pm.officialMap')}</a>
    </div>
  );
}
