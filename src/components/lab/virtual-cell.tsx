'use client';

/**
 * 虚拟细胞视图 —— 交互式 SVG 场景
 * 底层：细胞形态学（静态）；叠加层：信号分子节点 + 信号传导边（随模拟状态实时更新）
 * 交互：节点点击检测 / 悬停提示 / 滚轮缩放 / 拖拽平移
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MoleculeKind, EdgeKind } from '@/types/kegg';
import { CELL_TYPE_MAP } from '@/data/cell-types';
import { layoutCellView, CANVAS, type PositionedNode, type LaidOutEdge } from '@/lib/simulation/layout';
import { CellMorphology } from './morphologies';
import { useLabStore } from '@/store/lab-store';
import { useLang } from '@/lib/i18n';

const KIND_COLORS: Record<MoleculeKind, { stroke: string; fill: string; text: string; label: string }> = {
  ligand: { stroke: '#fbbf24', fill: 'rgba(251,191,36,0.13)', text: '#fde68a', label: '配体' },
  receptor: { stroke: '#2dd4bf', fill: 'rgba(45,212,191,0.15)', text: '#99f6e4', label: '受体' },
  channel: { stroke: '#2dd4bf', fill: 'rgba(45,212,191,0.15)', text: '#99f6e4', label: '通道' },
  kinase: { stroke: '#34d399', fill: 'rgba(52,211,153,0.13)', text: '#a7f3d0', label: '激酶' },
  phosphatase: { stroke: '#f97316', fill: 'rgba(249,115,22,0.12)', text: '#fdba74', label: '磷酸酶' },
  adapter: { stroke: '#a3e635', fill: 'rgba(163,230,53,0.12)', text: '#d9f99d', label: '接头' },
  gtpase: { stroke: '#f472b6', fill: 'rgba(244,114,182,0.12)', text: '#fbcfe8', label: 'G 蛋白' },
  tf: { stroke: '#fb7185', fill: 'rgba(251,113,133,0.12)', text: '#fecdd3', label: '转录因子' },
  gene: { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.12)', text: '#fde68a', label: '靶基因' },
  compound: { stroke: '#facc15', fill: 'rgba(250,204,21,0.1)', text: '#fef08a', label: '信使' },
  enzyme: { stroke: '#4ade80', fill: 'rgba(74,222,128,0.12)', text: '#bbf7d0', label: '酶' },
};

function edgeColor(kind: EdgeKind): string {
  if (kind === 'inhibition' || kind === 'repression' || kind === 'missing' || kind === 'dephosphorylation') return '#fb7185';
  if (kind === 'expression') return '#fbbf24';
  if (kind === 'binding' || kind === 'dissociation') return '#64748b';
  if (kind === 'indirect' || kind === 'state-change') return '#2dd4bf';
  return '#34d399';
}

function edgeMarker(kind: EdgeKind): string {
  if (kind === 'inhibition' || kind === 'repression' || kind === 'missing' || kind === 'dephosphorylation') return 'url(#arrowInh)';
  if (kind === 'expression') return 'url(#arrowExpr)';
  if (kind === 'binding' || kind === 'dissociation') return 'url(#arrowBind)';
  return 'url(#arrowAct)';
}

export function VirtualCellView() {
  const { t, lang } = useLang();
  const graph = useLabStore((s) => s.graph);
  const cellId = useLabStore((s) => s.cellId);
  const nodeStates = useLabStore((s) => s.nodeStates);
  const signalFlux = useLabStore((s) => s.signalFlux);
  const injected = useLabStore((s) => s.injected);
  const selectedNode = useLabStore((s) => s.selectedNode);
  const selectNode = useLabStore((s) => s.selectNode);
  const tick = useLabStore((s) => s.tick);
  const running = useLabStore((s) => s.running);
  const inhibition = useLabStore((s) => s.inhibition);
  const mutations = CELL_TYPE_MAP.get(cellId)?.mutations ?? [];

  const cell = CELL_TYPE_MAP.get(cellId);
  const morph = cell?.morphology ?? 'hepatocyte';
  const tint = cell?.tint ?? ['#134e4a', '#052e2b'];

  const layout = useMemo(
    () => (graph ? layoutCellView(graph.core.nodes, graph.core.edges, morph) : null),
    [graph, morph],
  );

  // ---- 缩放/平移 ----
  // 初始视域聚焦细胞主体（配体带→基底膜），较全画布约 1.1× 放大，分子标签更易读
  const [vb, setVb] = useState({ x: 60, y: 76, w: 1080, h: 700 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ x: number; y: number; vb: typeof vb } | null>(null);

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
        const nw = Math.min(CANVAS.w * 1.6, Math.max(CANVAS.w * 0.28, prev.w * factor));
        const nh = nw * (CANVAS.h / CANVAS.w);
        return { x: mx - ((mx - prev.x) / prev.w) * nw, y: my - ((my - prev.y) / prev.h) * nh, w: nw, h: nh };
      });
    };
    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = { x: e.clientX, y: e.clientY, vb };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragging.current;
    const svg = svgRef.current;
    if (!d || !svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((e.clientX - d.x) / rect.width) * d.vb.w;
    const dy = ((e.clientY - d.y) / rect.height) * d.vb.h;
    setVb({ ...d.vb, x: d.vb.x - dx, y: d.vb.y - dy });
  };
  const onPointerUp = () => { dragging.current = null; };

  const zoom = (factor: number) => {
    const cx = vb.x + vb.w / 2;
    const cy = vb.y + vb.h / 2;
    const nw = Math.min(CANVAS.w * 1.6, Math.max(CANVAS.w * 0.28, vb.w * factor));
    const nh = nw * (CANVAS.h / CANVAS.w);
    setVb({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
  };

  // ---- 悬停提示 ----
  const [hover, setHover] = useState<{ node: PositionedNode; x: number; y: number } | null>(null);

  if (!graph || !layout) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center text-muted-foreground">
        {t('vc.loading')}
      </div>
    );
  }

  const mutNodeIds = new Set(mutations.map((m) => m.node));

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { onPointerUp(); setHover(null); }}
        role="img"
        aria-label={t('vc.aria')}
      >
        <defs>
          <linearGradient id="sceneBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#020617" />
            <stop offset="100%" stopColor="#0a0f1e" />
          </linearGradient>
          <linearGradient id="membraneGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#134e4a" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#0f766e" stopOpacity="0.4" />
          </linearGradient>
          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <marker id="arrowAct" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#34d399" />
          </marker>
          <marker id="arrowInh" viewBox="0 0 12 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 0 10 M 0.5 5 L 10 5" stroke="#fb7185" strokeWidth="2" fill="none" />
          </marker>
          <marker id="arrowExpr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#fbbf24" />
          </marker>
          <marker id="arrowBind" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#94a3b8" />
          </marker>
        </defs>

        {/* 场景底色 + 网格 */}
        <rect x={-200} y={-200} width={CANVAS.w + 400} height={CANVAS.h + 400} fill="url(#sceneBg)" />
        <g stroke="#1e293b" strokeWidth={0.6} opacity={0.35}>
          {Array.from({ length: 13 }, (_, i) => (
            <line key={`v${i}`} x1={i * 100} y1={0} x2={i * 100} y2={CANVAS.h} />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 100} x2={CANVAS.w} y2={i * 100} />
          ))}
        </g>

        {/* 区室标注 */}
        <g fontSize={12.5} fill="#5b6b7c" fontFamily="var(--font-geist-mono, monospace)" letterSpacing={2}>
          <text x={20} y={34}>{t('vc.zone.extra')}</text>
          <text x={20} y={162}>{t('vc.zone.membrane')}</text>
          <text x={20} y={242}>{t('vc.zone.cytoplasm')}</text>
        </g>

        {/* 细胞形态学（静态底层） */}
        <CellMorphology morph={morph} tint={tint} />

        {/* 信号边 */}
        <g fill="none">
          {layout.edges.map((e) => {
            const flux = signalFlux[`${e.source}>${e.target}`] ?? 0;
            const active = Math.abs(flux) > 0.06;
            const col = edgeColor(e.kind);
            const isPhospho = e.kind === 'phosphorylation';
            return (
              <g key={e.id}>
                <path
                  d={e.d}
                  stroke={col}
                  strokeWidth={active ? 2.1 : 1.2}
                  opacity={active ? 0.9 : 0.16}
                  markerEnd={edgeMarker(e.kind)}
                  className={active ? 'edge-flow' : undefined}
                  strokeDasharray={e.kind === 'expression' ? '7 5' : e.kind === 'indirect' ? '2 4' : undefined}
                />
                {isPhospho && (
                  <g opacity={active ? 0.95 : 0.25}>
                    <circle r={6.5} fill="#020617" stroke={col} strokeWidth={1}
                      transform={midpointOf(e)} />
                    <text fontSize={8} fill={col} textAnchor="middle" transform={`${midpointOf(e)} translate(0 2.6)`}>P</text>
                  </g>
                )}
                {active && (
                  <g opacity={Math.min(1, 0.45 + Math.abs(flux) * 0.6)}>
                    <circle r={2.8} fill={col}>
                      <animateMotion path={e.d} dur="1.05s" repeatCount="indefinite" />
                    </circle>
                    <circle r={2} fill={col} opacity={0.7}>
                      <animateMotion path={e.d} dur="1.05s" begin="-0.52s" repeatCount="indefinite" />
                    </circle>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* 信号分子节点 */}
        <g>
          {layout.nodes.map((n) => {
            const st = nodeStates[n.id] ?? { activity: 0, phospho: 0, activated: false, activatedAtTick: null };
            const color = KIND_COLORS[n.kind] ?? KIND_COLORS.enzyme;
            const isMut = mutNodeIds.has(n.id);
            const mut = mutations.find((m) => m.node === n.id);
            const active = st.activity > 0.45;
            const op = 0.4 + 0.6 * st.activity;
            const selected = selectedNode === n.id;
            const recentlyOn = st.activatedAtTick !== null && tick - st.activatedAtTick < 8 && running;
            const isLigand = n.kind === 'ligand';
            const isInjected = isLigand && injected[n.id];
            const inhLevel = inhibition[n.id] ?? 0;
            const inhibited = inhLevel > 0.05;

            return (
              <g
                key={n.id}
                transform={`translate(${n.px.toFixed(1)} ${n.py.toFixed(1)})`}
                opacity={op}
                className="cursor-pointer"
                onClick={(ev) => { ev.stopPropagation(); selectNode(n.id); }}
                onPointerMove={(ev) => setHover({ node: n, x: ev.clientX, y: ev.clientY })}
                onPointerLeave={() => setHover(null)}
                style={active ? { filter: `drop-shadow(0 0 7px ${color.stroke}88)` } : undefined}
              >
                {/* 命中区 */}
                <rect x={-n.nw / 2 - 6} y={-n.nh / 2 - 6} width={n.nw + 12} height={n.nh + 12} fill="transparent" />

                {n.kind === 'compound' ? (
                  <ellipse rx={n.nw / 2} ry={n.nh / 2} fill={color.fill} stroke={color.stroke} strokeWidth={active ? 1.8 : 1.1} strokeDasharray="4 3" />
                ) : (
                  <rect
                    x={-n.nw / 2} y={-n.nh / 2} width={n.nw} height={n.nh} rx={isLigand ? 15 : 6}
                    fill={color.fill} stroke={isInjected || active ? color.stroke : `${color.stroke}66`}
                    strokeWidth={isInjected ? 2.2 : active ? 1.8 : 1.1}
                  />
                )}

                {/* 受体跨膜区段高亮 */}
                {n.kind === 'receptor' && (
                  <rect x={-14} y={-30} width={28} height={60} rx={3} fill="rgba(45,212,191,0.22)" stroke="#2dd4bf" strokeWidth={0.7} opacity={0.9} />
                )}

                {/* 药物抑制环（紫色虚线 = 催化输出钳制） */}
                {inhibited && (
                  <rect
                    x={-n.nw / 2 - 4} y={-n.nh / 2 - 4} width={n.nw + 8} height={n.nh + 8} rx={10}
                    fill="none" stroke="#c084fc" strokeWidth={1.4} strokeDasharray="5 3" opacity={0.55 + inhLevel * 0.45}
                  >
                    <animate attributeName="stroke-dashoffset" from="0" to="16" dur="1.2s" repeatCount="indefinite" />
                  </rect>
                )}

                {/* 激活脉冲环 */}
                {recentlyOn && (
                  <rect x={-n.nw / 2} y={-n.nh / 2} width={n.nw} height={n.nh} rx={8}
                    fill="none" stroke={color.stroke} className="node-pulse" />
                )}

                {/* 标签（深色描边 halo：在繁忙底图上保持可读） */}
                <text
                  y={n.kind === 'compound' ? 4.2 : 4.4}
                  textAnchor="middle"
                  fontSize={n.kind === 'receptor' ? 11.5 : 12.5}
                  fontFamily="var(--font-geist-mono, monospace)"
                  fill={active || isInjected ? color.text : '#c7d2de'}
                  fontWeight={active || isInjected ? 700 : 500}
                  style={{ paintOrder: 'stroke', stroke: '#020617', strokeWidth: 3, strokeLinejoin: 'round' }}
                >
                  {truncateLabel(n.label)}
                </text>

                {/* 配体扩散动画 */}
                {isLigand && isInjected && (
                  <circle r={n.nw / 2} fill="none" stroke="#fbbf24" strokeWidth={1.2} className="ligand-pulse" />
                )}

                {/* 磷酸化徽标 */}
                {st.phospho > 0.25 && n.kind !== 'compound' && (
                  <g opacity={Math.min(1, st.phospho * 1.2)} transform={`translate(${n.nw / 2 - 4} ${-n.nh / 2 + 2})`}>
                    <circle r={7} fill="#78350f" stroke="#fbbf24" strokeWidth={1} />
                    <text y={2.8} textAnchor="middle" fontSize={8.5} fill="#fde68a" fontWeight={700} fontFamily="var(--font-geist-mono, monospace)">P</text>
                  </g>
                )}

                {/* 药物抑制徽标 */}
                {inhibited && (
                  <g opacity={Math.min(1, 0.6 + inhLevel * 0.4)} transform={`translate(${n.nw / 2 - 6} ${n.nh / 2 - 4})`}>
                    <circle r={7.5} fill="#4c1d95" stroke="#c084fc" strokeWidth={1} />
                    <text y={3} textAnchor="middle" fontSize={9} fill="#e9d5ff" fontWeight={700} fontFamily="var(--font-geist-mono, monospace)">⊘</text>
                  </g>
                )}

                {/* 突变徽标 */}
                {isMut && (
                  <g transform={`translate(${-n.nw / 2 + 6} ${-n.nh / 2 + 2})`}>
                    <circle r={7.5} fill="#450a0a" stroke={mut?.effect === 'knockout' ? '#f43f5e' : '#f97316'} strokeWidth={1.2} />
                    <text y={3} textAnchor="middle" fontSize={7.5} fill="#fecaca" fontWeight={700} fontFamily="var(--font-geist-mono, monospace)">
                      {mut?.effect === 'knockout' ? 'KO' : 'M'}
                    </text>
                  </g>
                )}

                {/* 选中环 */}
                {selected && (
                  <rect x={-n.nw / 2 - 5} y={-n.nh / 2 - 5} width={n.nw + 10} height={n.nh + 10} rx={9}
                    fill="none" stroke="#f0fdfa" strokeWidth={1.6} strokeDasharray="5 4" className="dash-spin" />
                )}
              </g>
            );
          })}
        </g>

        {/* 图例 */}
        <g transform="translate(24 690)" fontSize={11} fontFamily="var(--font-geist-mono, monospace)">
          <rect x={-10} y={-14} width={386} height={88} rx={8} fill="rgba(2,6,23,0.72)" stroke="#1e293b" />
          {[
            { c: '#fbbf24', t: t('vc.legend.ligand') }, { c: '#2dd4bf', t: t('vc.legend.receptor') }, { c: '#34d399', t: t('vc.legend.kinase') },
            { c: '#f472b6', t: t('vc.legend.gtpase') }, { c: '#fb7185', t: t('vc.legend.tf') }, { c: '#f59e0b', t: t('vc.legend.gene') },
          ].map((s, i) => (
            <g key={s.t} transform={`translate(${4 + (i % 3) * 128} ${6 + Math.floor(i / 3) * 24})`}>
              <rect width={9} height={9} rx={2} fill={s.c} opacity={0.85} />
              <text x={14} y={8} fill="#94a3b8">{s.t}</text>
            </g>
          ))}
          <g transform="translate(4 56)">
            <line x1={0} y1={4} x2={26} y2={4} stroke="#34d399" strokeWidth={1.6} markerEnd="url(#arrowAct)" />
            <text x={32} y={8} fill="#94a3b8">{t('vc.legend.act')}</text>
            <line x1={74} y1={4} x2={100} y2={4} stroke="#fb7185" strokeWidth={1.6} markerEnd="url(#arrowInh)" />
            <text x={106} y={8} fill="#94a3b8">{t('vc.legend.inh')}</text>
            <line x1={148} y1={4} x2={174} y2={4} stroke="#fbbf24" strokeWidth={1.6} strokeDasharray="6 4" markerEnd="url(#arrowExpr)" />
            <text x={180} y={8} fill="#94a3b8">{t('vc.legend.expr')}</text>
            <circle cx={252} cy={4} r={4.5} fill="#020617" stroke="#34d399" />
            <text x={252} y={7.5} textAnchor="middle" fontSize={6} fill="#34d399">P</text>
            <text x={264} y={8} fill="#94a3b8">{t('vc.legend.phospho')}</text>
          </g>
        </g>
      </svg>

      {/* 缩放控件（v59 阻断冒泡：工作区容器「点空白清选中」不误伤控件） */}
      <div className="absolute right-3 top-3 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
        {[
          { label: '＋', fn: () => zoom(0.78), title: t('vc.zoomIn') },
          { label: '－', fn: () => zoom(1.28), title: t('vc.zoomOut') },
          { label: '⟲', fn: () => setVb({ x: 60, y: 76, w: 1080, h: 700 }), title: t('vc.zoomReset') },
        ].map((b) => (
          <button
            key={b.label}
            onClick={b.fn}
            title={b.title}
            className="h-8 w-8 rounded-md border border-white/10 bg-slate-900/80 text-sm text-slate-300 backdrop-blur transition hover:border-emerald-500/50 hover:text-emerald-300"
          >{b.label}</button>
        ))}
      </div>

      {/* 悬停分子卡 */}
      {hover && (
        <div
          className="pointer-events-none fixed z-50 max-w-64 rounded-lg border border-emerald-500/25 bg-slate-950/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
          style={{ left: Math.min(hover.x + 14, (typeof window !== 'undefined' ? window.innerWidth - 280 : 800)), top: hover.y + 12 }}
        >
          <div className="font-mono text-[13px] font-semibold text-emerald-300">{hover.node.label}</div>
          <div className="mt-0.5 text-[11px] leading-4 text-slate-400">
            {(() => {
              const k = t(`vc.kind.${hover.node.kind}`);
              const comp = t(`comp.${hover.node.compartment}`);
              const keggId = hover.node.keggIds[0] ?? t('vc.synthetic');
              return lang === 'zh'
                ? `${k} · 定位于${comp} · KEGG ${keggId}`
                : `${k} · ${t('vc.located')} ${comp} · KEGG ${keggId}`;
            })()}
          </div>
          <div className="mt-1 flex gap-3 text-[11px] text-slate-500">
            <span>{t('vc.activity')} {Math.round((nodeStates[hover.node.id]?.activity ?? 0) * 100)}%</span>
            {(nodeStates[hover.node.id]?.phospho ?? 0) > 0.25 && <span className="text-amber-400">{t('vc.phosphoPct')} {Math.round((nodeStates[hover.node.id]?.phospho ?? 0) * 100)}%</span>}
          </div>
          <div className="mt-1 text-[10px] text-slate-600">{t('vc.clickProfile')}</div>
        </div>
      )}
    </div>
  );
}

function truncateLabel(s: string): string {
  return s.length > 11 ? s.slice(0, 10) + '…' : s;
}

function midpointOf(e: LaidOutEdge): string {
  // 取路径中点近似：解析首尾控制点不可靠，改用贝塞尔 t=0.5
  const m = e.d.match(/-?[\d.]+/g);
  if (!m || m.length < 8) return 'translate(0 0)';
  const nums = m.map(Number);
  const [x0, y0, x1, y1, x2, y2, x3, y3] = nums.slice(0, 8);
  const t = 0.5;
  const x = (1 - t) ** 3 * x0 + 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3 * x3;
  const y = (1 - t) ** 3 * y0 + 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3 * y3;
  return `translate(${x.toFixed(1)} ${y.toFixed(1)})`;
}
