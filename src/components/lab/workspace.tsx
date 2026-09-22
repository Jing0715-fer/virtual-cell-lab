'use client';

/**
 * 模拟实验台 —— 三栏工作区：通路库 | 细胞/通路视图 + 控制台 | 检测器/事件流
 * 负责：通路图数据获取（→ store）、模拟 tick 循环驱动
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { Microscope, Map as MapIcon, FlaskConical, Orbit, GitCompare, AlertTriangle, X, Split, BookMarked } from 'lucide-react';
import type { PathwayGraph } from '@/types/kegg';
import { useLabStore } from '@/store/lab-store';
import { useCompareStore } from '@/store/compare-store';
import { inactiveNote } from '@/data/pathway-cell-matrix';
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
  const cellId = useLabStore((s) => s.cellId);
  const view = useLabStore((s) => s.view);
  const setView = useLabStore((s) => s.setView);
  const mitosisOpen = useLabStore((s) => s.mitosisOpen);
  const setMitosisOpen = useLabStore((s) => s.setMitosisOpen);
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

  // 通路 × 细胞类型不匹配（教学对照模式）→ 顶部警告条（dismiss 按 key 记忆, 切换通路/细胞后重新出现）
  const mismatchKey = `${pathwayId ?? ''}:${cellId}`;
  const mismatchNote = useMemo(() => {
    if (!pathwayId) return null;
    const note = inactiveNote(pathwayId, cellId);
    return note ? (lang === 'zh' ? note.zh : note.en) : null;
  }, [pathwayId, cellId, lang]);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  // 模拟循环
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => tickSim(), TICK_MS);
    return () => clearInterval(timer);
  }, [running, speed, tickSim]);

  const showLoading = isLoading && !graph;
  const showError = !!error && !graph;

  // v56a 初始不加载通路（用户需求）: pathwayId 初始为 null —— 3D 细胞场景照常渲染
  // （细胞器/双核/骨架与通路数据完全解耦）, 仅信号分子层空置; 2D/图谱视图各自带空态回退;
  // 待用户从左栏 PathwayLibrary 主动选定通路后才拉取图谱并装配信号演示

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
          {/* v15 分裂演示专属入口（用户反馈「UI 中没看到分裂演示」）: 视图切换器同级 Tab + 琥珀高亮 ——
              与 cell3d HUD 按钮共用 lab-store 单一真源, 点击即切入 3D 视图并启动有丝分裂全周期动画 */}
          <button
            onClick={() => {
              setView('cell3d');
              setMitosisOpen(!mitosisOpen);
            }}
            title={t('view.mitosisTip')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition',
              mitosisOpen
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                : 'border-amber-500/35 bg-amber-500/10 text-amber-300/90 hover:border-amber-400/60 hover:bg-amber-500/20',
            )}
          >
            <Split className="h-3.5 w-3.5" />
            {t('view.mitosis')}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                if (graph && pathwayId) useCompareStore.getState().open(pathwayId, graph);
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
                : pathwayId
                  ? t('ws.loading')
                  : lang === 'zh'
                    ? '未选通路 · 从左侧选择一条信号通路'
                    : 'No pathway · pick one from the library'}
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
          {/* 通路-细胞类型不匹配警告（教学对照模式，可关闭） */}
          {mismatchNote && dismissedKey !== mismatchKey && (
            <div className="absolute left-1/2 top-2 z-30 w-[min(94%,580px)] -translate-x-1/2">
              <div className="rounded-lg border border-amber-500/40 bg-amber-950/85 px-3 py-2 shadow-lg backdrop-blur-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-amber-300">{t('pw.warnTitle')}</div>
                    <div className="mt-0.5 text-[10px] leading-4 text-amber-200/75">{mismatchNote}</div>
                    <div className="mt-1 text-[9.5px] leading-3.5 text-amber-200/50">{t('pw.warnBody')}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDismissedKey(mismatchKey);
                    }}
                    aria-label="dismiss"
                    className="shrink-0 rounded p-0.5 text-amber-400/60 transition hover:text-amber-200"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* v56a 无通路 3D 浏览态引导（初始不加载通路）: 细胞结构完整可览, 提示从左栏装配信号演示
              v60 教学动线升级: 「先认识结构 → 再装配信号」两步引导 —— 图鉴 pill 可直接唤起（lab-store 真源） */}
          {!pathwayId && !graph && view === 'cell3d' && (
            <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2">
              <div className="flex max-w-[94vw] flex-wrap items-center justify-center gap-1.5 rounded-full border border-emerald-500/25 bg-slate-950/80 px-3 py-1.5 shadow-lg backdrop-blur-sm">
                <FlaskConical className="h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
                <span className="whitespace-nowrap text-[10.5px] text-slate-400">
                  {lang === 'zh' ? '3D 结构浏览中' : 'Browsing 3D structure'}
                </span>
                <span className="text-slate-600">·</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    useLabStore.getState().setAtlasOpen(true);
                  }}
                  className="flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300 transition hover:bg-emerald-500/20 hover:text-emerald-200"
                >
                  <BookMarked className="h-3 w-3" />
                  {t('hud.atlas')}
                </button>
                <span className="whitespace-nowrap text-[10.5px] text-slate-400">
                  {lang === 'zh' ? '认识结构 · 左栏选通路装配信号演示' : 'meet the organelles · pick a pathway to assemble the demo'}
                </span>
              </div>
            </div>
          )}
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
          {/* v64 tab 防重叠: grid-cols-5 均分在 360px 列内放不下长标签（Pharmacology/Transcriptome）
              → flex + nowrap + 横向滚动, 触发器 shrink-0 不再挤压换行叠字; 图标移除保余量 */}
          <TabsList className="mx-3 mt-2 flex h-8 gap-0.5 overflow-x-auto bg-white/5 lab-scrollbar">
            <TabsTrigger value="inspector" className="h-6 shrink-0 whitespace-nowrap px-2.5 text-[11px] data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300">
              {t('ws.tab.inspector')}
            </TabsTrigger>
            <TabsTrigger value="timeline" className="h-6 shrink-0 whitespace-nowrap px-2.5 text-[11px] data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300">
              {t('ws.tab.timeline')}
            </TabsTrigger>
            <TabsTrigger value="pharmacology" className="h-6 shrink-0 whitespace-nowrap px-2.5 text-[11px] data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
              {t('view.drug')}
            </TabsTrigger>
            <TabsTrigger value="transcriptome" className="h-6 shrink-0 whitespace-nowrap px-2.5 text-[11px] data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300">
              {t('ws.tab.heatmap')}
            </TabsTrigger>
            <TabsTrigger value="ai" className="h-6 shrink-0 whitespace-nowrap px-2.5 text-[11px] data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300">
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
