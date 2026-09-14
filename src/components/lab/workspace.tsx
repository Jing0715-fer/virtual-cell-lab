'use client';

/**
 * 模拟实验台 —— 三栏工作区：通路库 | 细胞/通路视图 + 控制台 | 检测器/事件流
 * 负责：通路图数据获取（→ store）、模拟 tick 循环驱动
 */
import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { Microscope, Map as MapIcon, FlaskConical, Boxes, Orbit, Pill, Activity, GitCompare } from 'lucide-react';
import type { PathwayGraph } from '@/types/kegg';
import { useLabStore } from '@/store/lab-store';
import { useCompareStore } from '@/store/compare-store';
import { VirtualCellView } from './virtual-cell';
import { PathwayMapView } from './pathway-map-view';
import { CompareView } from './compare-view';
import { PlaybackControls } from './playback';
import { MoleculeInspector } from './inspector';
import { EventTimeline } from './timeline';
import { PathwayLibrary } from './pathway-library';
import { PharmacologyPanel } from './pharmacology';
import { AiAssistant } from './ai-assistant';
import { TranscriptomicHeatmap } from './transcriptomic-heatmap';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useLang } from '@/lib/i18n';

const TICK_MS = 100;

/** 3D 沉浸视图（WebGL, 仅客户端加载） */
const VirtualCell3D = dynamic(
  () => import('@/components/cell3d/virtual-cell-3d').then((m) => ({ default: m.VirtualCell3D })),
  {
    ssr: false,
    loading: () => <EngineLoading />,
  },
);

function EngineLoading() {
  const { t } = useLang();
  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(ellipse_at_center,#04211d_0%,#020617_60%)]">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
        <p className="text-xs text-slate-500">{t('loading.engine')}</p>
      </div>
    </div>
  );
}

export function LabWorkspace() {
  const { t, lang } = useLang();
  const pathwayId = useLabStore((s) => s.pathwayId);
  const view = useLabStore((s) => s.view);
  const setView = useLabStore((s) => s.setView);
  const loadGraph = useLabStore((s) => s.loadGraph);
  const setGraphState = useLabStore((s) => s.setGraphState);
  const running = useLabStore((s) => s.running);
  const speed = useLabStore((s) => s.speed);
  const tickSim = useLabStore((s) => s.tickSim);
  const phase = useLabStore((s) => s.phase);
  const graph = useLabStore((s) => s.graph);
  const selectNode = useLabStore((s) => s.selectNode);

  // 通路图获取
  const { data, isLoading, error } = useQuery({
    queryKey: ['pathway-graph', pathwayId],
    queryFn: async (): Promise<PathwayGraph> => {
      const res = await fetch(`/api/pathways/${pathwayId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error ?? (lang === 'zh' ? `通路加载失败 (${res.status})` : `Failed to load pathway (${res.status})`),
        );
      }
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!pathwayId,
  });

  // 数据 → 状态机
  // 去重键 = 通路 id + fetchedAt；graph 被重置（重选同一通路 / resetSim 后
  // selectPathway 置空）而 TanStack 缓存命中同一 data 引用时，dedup 会阻断
  // 重新装配 → 追加 !graph 兜底条件（graph 已装配时该条件恒 false，不重触发）
  const lastLoaded = useRef<string | null>(null);
  useEffect(() => {
    if (data && data.meta.id === pathwayId && (lastLoaded.current !== data.meta.id + data.fetchedAt || !graph)) {
      lastLoaded.current = data.meta.id + data.fetchedAt;
      setGraphState(false, null, data);
      loadGraph(data);
    }
  }, [data, pathwayId, graph, setGraphState, loadGraph]);

  // 模拟循环
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => tickSim(), TICK_MS);
    return () => clearInterval(timer);
  }, [running, speed, tickSim]);

  const showLoading = isLoading && !graph;
  const showError = !!error && !graph;

  if (!pathwayId) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-white/5 bg-slate-950/40 text-slate-500">
        <div className="text-center">
          <FlaskConical className="mx-auto mb-3 h-8 w-8 text-slate-700" />
          <p className="text-sm">{t('lab.empty.title')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[290px_minmax(0,1fr)_360px]">
      {/* 左栏 */}
      <div className="order-2 h-[520px] overflow-hidden rounded-2xl border border-white/8 bg-slate-950/50 lg:order-1 lg:h-[760px]">
        <PathwayLibrary />
      </div>

      {/* 中栏 */}
      <div className="order-1 flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-slate-950/50 lg:order-2 lg:h-[760px]">
        {/* 视图头 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-3 py-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 p-0.5">
            <button
              onClick={() => setView('cell3d')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition',
                view === 'cell3d' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-500 hover:text-slate-300',
              )}
            >
              <Orbit className="h-3.5 w-3.5" />
              {t('view.3d')}
            </button>
            <button
              onClick={() => setView('cell')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition',
                view === 'cell' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-500 hover:text-slate-300',
              )}
            >
              <Microscope className="h-3.5 w-3.5" />
              {t('view.2d')}
            </button>
            <button
              onClick={() => setView('map')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition',
                view === 'map' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-500 hover:text-slate-300',
              )}
            >
              <MapIcon className="h-3.5 w-3.5" />
              {t('view.map')}
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                if (graph) useCompareStore.getState().open(pathwayId, graph);
              }}
              disabled={!graph}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-40"
              title={t('ws.compareTip')}
            >
              <GitCompare className="h-3.5 w-3.5" />
              {t('view.compare')}
            </button>
            <span className="hidden font-mono text-[10px] text-slate-600 sm:inline">
              {graph
                ? lang === 'zh'
                  ? `${graph.stats.coreCount} 核心节点 · ${graph.stats.geneCount} 全图分子`
                  : `${graph.stats.coreCount} core nodes · ${graph.stats.geneCount} map molecules`
                : t('ws.loading')}
            </span>
            <span className={cn(
              'rounded-full border px-2 py-0.5 text-[9px]',
              phase > 0
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-white/10 text-slate-500',
            )}>
              {t('hud.phase')} {phase}/4
            </span>
          </div>
        </div>

        {/* 主画布（3D 视图的空白点击取消选择由 R3F onPointerMissed 处理，避免 DOM 冒泡覆盖分子选中） */}
        <div
          className="relative min-h-[380px] flex-1 bg-[#020617] lg:min-h-0"
          onClick={() => {
            if (view !== 'cell3d') selectNode(null);
          }}
        >
          {showLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-64 space-y-3 text-center">
                <Skeleton className="mx-auto h-8 w-8 rounded-full" />
                <p className="text-xs text-slate-500">
                  {lang === 'zh'
                    ? `正在从 KEGG REST API 获取 ${pathwayId} 图谱…`
                    : `Fetching ${pathwayId} map from the KEGG REST API…`}
                </p>
                <Skeleton className="h-2 w-full" />
              </div>
            </div>
          ) : showError ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-sm rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-center">
                <p className="text-sm font-medium text-rose-300">{t('ws.errTitle')}</p>
                <p className="mt-1 text-xs text-rose-200/70">{(error as Error).message}</p>
                <p className="mt-2 text-[11px] text-slate-500">{t('ws.errHint')}</p>
              </div>
            </div>
          ) : view === 'cell3d' ? (
            <VirtualCell3D />
          ) : view === 'cell' ? (
            <VirtualCellView />
          ) : (
            <PathwayMapView />
          )}

          {/* 对照实验模式（覆盖层, 不干扰主实验台状态） */}
          <CompareView />
        </div>

        {/* 控制台 */}
        <PlaybackControls />
      </div>

      {/* 右栏 */}
      <div className="order-3 h-[560px] overflow-hidden rounded-2xl border border-white/8 bg-slate-950/50 lg:h-[760px]">
        <Tabs defaultValue="inspector" className="flex h-full flex-col">
          <TabsList className="mx-3 mt-2 grid h-8 grid-cols-5 bg-white/5">
            <TabsTrigger value="inspector" className="h-6 px-1 text-[11px] data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300">
              <Boxes className="mr-1 h-3 w-3" />{t('ws.tab.inspector')}
            </TabsTrigger>
            <TabsTrigger value="timeline" className="h-6 px-1 text-[11px] data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300">
              {t('ws.tab.timeline')}
            </TabsTrigger>
            <TabsTrigger value="pharmacology" className="h-6 px-1 text-[11px] data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
              <Pill className="mr-1 h-3 w-3" />{t('view.drug')}
            </TabsTrigger>
            <TabsTrigger value="transcriptome" className="h-6 px-1 text-[11px] data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300">
              <Activity className="mr-1 h-3 w-3" />{t('ws.tab.heatmap')}
            </TabsTrigger>
            <TabsTrigger value="ai" className="h-6 px-1 text-[11px] data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300">
              AI
            </TabsTrigger>
          </TabsList>
          <TabsContent value="inspector" className="min-h-0 flex-1 overflow-hidden mt-0">
            <MoleculeInspector />
          </TabsContent>
          <TabsContent value="timeline" className="min-h-0 flex-1 overflow-hidden mt-0">
            <EventTimeline />
          </TabsContent>
          <TabsContent value="pharmacology" className="min-h-0 flex-1 overflow-hidden mt-0">
            <PharmacologyPanel />
          </TabsContent>
          <TabsContent value="transcriptome" className="min-h-0 flex-1 overflow-hidden mt-0">
            <TranscriptomicHeatmap />
          </TabsContent>
          <TabsContent value="ai" className="min-h-0 flex-1 overflow-hidden mt-0">
            <AiAssistant />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
