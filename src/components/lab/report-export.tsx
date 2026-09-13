'use client';

/**
 * 实验报告导出 —— PDF（纯 Canvas 2D 光栅化 + jsPDF 分页）
 * 内容: 实验设置（细胞系/通路/参数/配体） · 摘要统计 · 活性动力学曲线 · 核心分子档案表
 *       （活性/磷酸化条形） · 药理干预 · 分子事件流全表（自动分页）
 * 实现: 直接在离屏 canvas 上绘制 A4 页面（794×1123 逻辑单位 ×2 超采样），
 *       中文排版用逐字折行（measureText），分页按实测行高精确续页。
 *       相比 DOM 克隆方案（html2canvas 受主文档 CSS 干扰）零环境依赖、确定性排版。
 * jspdf 动态 import（仅导出时加载）。
 */
import { useState } from 'react';
import { FileDown, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLabStore } from '@/store/lab-store';
import { CELL_TYPE_MAP } from '@/data/cell-types';
import { INHIBITORS } from '@/data/inhibitors';
import type { CoreNode, PathwayGraph } from '@/types/kegg';
import type { SimEvent } from '@/lib/simulation/engine';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

// ---------- 报告视觉常量 ----------
const INK = '#0f172a';
const INK_SOFT = '#475569';
const INK_FAINT = '#94a3b8';
const LINE = '#e2e8f0';
const HEAD_BG = '#062a26';
const ACCENT = '#0d9488';
const PAGE_W = 794; // A4 @ 96dpi
const PAGE_H = 1123;
const A4_PT_W = 595.28;
const A4_PT_H = 841.89;
const PAD = 44;
const SCALE = 2; // 超采样
const CONTENT_W = PAGE_W - PAD * 2;
const FONT = "-apple-system, 'Segoe UI', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";

const KIND_ZH: Record<string, string> = {
  ligand: '配体', receptor: '受体', channel: '通道', kinase: '激酶', phosphatase: '磷酸酶',
  adapter: '接头', gtpase: 'G 蛋白', tf: '转录因子', gene: '靶基因', compound: '第二信使', enzyme: '酶',
};
const COMPARTMENT_ZH: Record<string, string> = {
  extracellular: '细胞外', membrane: '质膜', cytoplasm: '细胞质', nucleus: '细胞核',
};
const EVENT_BADGE: Record<string, [string, string]> = {
  binding: ['结合', '#0f766e'],
  activation: ['激活', '#047857'],
  phosphorylation: ['磷酸化', '#b45309'],
  expression: ['转录', '#92400e'],
  inhibition: ['抑制', '#7e22ce'],
  repression: ['阻遏', '#be123c'],
  mutation: ['突变', '#be123c'],
  phase: ['阶段', '#475569'],
  reset: ['重置', '#475569'],
  info: ['信息', '#475569'],
};
const CURVE_COLORS = ['#0d9488', '#059669', '#d97706', '#e11d48', '#ea580c', '#a16207', '#be185d', '#4d7c0f'];

/** 逐字折行（CJK 安全; 超过 maxLines 截断加省略号） */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      if (lines.length >= maxLines) break;
      continue;
    }
    if (ctx.measureText(line + ch).width > maxWidth && line.length > 0) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) break;
    } else {
      line += ch;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    // 最后一行若未耗尽原文 → 省略号
    const consumed = lines.join('').length;
    if (consumed < text.length) {
      let last = lines[maxLines - 1];
      while (ctx.measureText(last + '…').width > maxWidth && last.length > 1) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

function setFont(ctx: CanvasRenderingContext2D, size: number, weight = '400', mono = false, color = INK): void {
  ctx.font = `${weight} ${size}px ${mono ? MONO : FONT}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
}

/** 分节标题（强调条 + 标题 + 副题 + 分隔线） → 返回新 y */
function sectionTitle(ctx: CanvasRenderingContext2D, y: number, text: string, sub: string): number {
  const top = y + 18;
  ctx.fillStyle = ACCENT;
  roundRect(ctx, PAD, top, 3, 13, 1.5); ctx.fill();
  setFont(ctx, 13, '700');
  ctx.fillText(text, PAD + 10, top + 11);
  if (sub) {
    setFont(ctx, 9, '400', true, INK_FAINT);
    ctx.fillText(sub, PAD + 12 + ctx.measureText(text).width + 10, top + 11);
  }
  ctx.strokeStyle = LINE; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, top + 22); ctx.lineTo(PAD + CONTENT_W, top + 22); ctx.stroke();
  return top + 32;
}

/** 页脚 */
function drawFooter(ctx: CanvasRenderingContext2D, pageNo: number, total: number, stamp: string): void {
  const y = PAGE_H - 32;
  ctx.strokeStyle = LINE; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y - 8); ctx.lineTo(PAD + CONTENT_W, y - 8); ctx.stroke();
  setFont(ctx, 8, '400', true, INK_FAINT);
  ctx.fillText(`VirtualCell Lab 实验报告 · 生成于 ${stamp} · 数据源 KEGG REST · 教学演示用途`, PAD, y + 4);
  const pn = `第 ${pageNo} / ${total} 页`;
  ctx.fillText(pn, PAD + CONTENT_W - ctx.measureText(pn).width, y + 4);
}

/** mini 条形 + 百分数 */
function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, color: string): number {
  const w = 58, h = 6;
  ctx.fillStyle = '#eef2f6';
  roundRect(ctx, x, y, w, h, 3); ctx.fill();
  if (value > 0.01) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, Math.max(3, w * Math.min(1, value)), h, 3); ctx.fill();
  }
  setFont(ctx, 10, '400', true, INK_SOFT);
  ctx.fillText(`${Math.round(value * 100)}%`, x + w + 8, y + 7);
  return x + w + 8 + 46;
}

// ---------- 活性动力学曲线（报告风格） ----------
function drawActivityChart(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  history: { tick: number; values: Record<string, number> }[],
  molecules: { id: string; label: string }[],
): void {
  const W = CONTENT_W - 20, H = 240, padL = 42, padR = 14, padT = 16, padB = 30;
  ctx.save();
  ctx.translate(ox, oy);
  // 边框
  ctx.strokeStyle = LINE; ctx.lineWidth = 1;
  roundRect(ctx, 0, 0, W + 20, H + 20 + (molecules.length > 0 ? 20 : 0), 8); ctx.stroke();
  // 网格 + y 轴
  setFont(ctx, 10, '400', true, INK_FAINT);
  for (let i = 0; i <= 4; i++) {
    const gy = padT + ((H - padT - padB) * i) / 4;
    ctx.strokeStyle = '#edf1f5';
    ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke();
    const label = ['100', '75', '50', '25', '0'][i];
    ctx.fillText(label, padL - 8 - ctx.measureText(label).width, gy + 3);
  }
  // x 轴
  if (history.length > 0) {
    ctx.textAlign = 'center';
    const tMax = history[history.length - 1].tick * 0.5;
    const marks = Math.min(6, Math.max(2, Math.round(tMax / 5)));
    for (let i = 0; i <= marks; i++) {
      const gx = padL + ((W - padL - padR) * i) / marks;
      ctx.strokeStyle = '#edf1f5';
      ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, H - padB); ctx.stroke();
      ctx.fillText(`${Math.round((tMax * i) / marks)}s`, gx, H - padB + 14);
    }
    ctx.textAlign = 'left';
  }
  // 曲线
  molecules.forEach((m, mi) => {
    ctx.strokeStyle = CURVE_COLORS[mi % CURVE_COLORS.length];
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    history.forEach((sm, i) => {
      const gx = padL + ((W - padL - padR) * i) / Math.max(1, history.length - 1);
      const v = sm.values[m.id] ?? 0;
      const gy = H - padB - (H - padT - padB) * Math.min(1, v);
      if (i === 0) ctx.moveTo(gx, gy); else ctx.lineTo(gx, gy);
    });
    ctx.stroke();
  });
  // 图例
  setFont(ctx, 9, '400', true, INK_SOFT);
  let lx = padL;
  const ly = H + 4;
  molecules.forEach((m, mi) => {
    ctx.fillStyle = CURVE_COLORS[mi % CURVE_COLORS.length];
    roundRect(ctx, lx, ly, 10, 3, 1.5); ctx.fill();
    const t = `${m.label} ${Math.round((history[history.length - 1].values[m.id] ?? 0) * 100)}%`;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(t, lx + 14, ly + 7);
    lx += 14 + ctx.measureText(t).width + 16;
  });
  ctx.restore();
}

// ---------- 数据汇总 ----------
interface ReportData {
  s: ReturnType<typeof useLabStore.getState>;
  cell: ReturnType<typeof CELL_TYPE_MAP.get>;
  graph: PathwayGraph;
  stamp: string;
  reportId: string;
  eventCount: number;
  activated: number;
  respondedGenes: number;
  injectedLabels: string[];
  drugs: typeof INHIBITORS;
}

// ---------- 导出主流程 ----------
export function ReportExportButton() {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const graph = useLabStore((s) => s.graph);
  const { toast } = useToast();

  const handleExport = async () => {
    if (!graph) return;
    setState('busy');
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const reportId = `VC-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

    try {
      const s = useLabStore.getState();
      const cell = CELL_TYPE_MAP.get(s.cellId);
      const eventCount = s.events.filter((e) => e.kind !== 'info' && e.kind !== 'phase' && e.kind !== 'reset').length;
      const activated = Object.values(s.nodeStates).filter((v) => v.activity > 0.3).length;
      const geneIds = graph.core.nodes.filter((n) => n.compartment === 'nucleus' && n.kind === 'gene').map((n) => n.id);
      const respondedGenes = geneIds.filter((gid) => (s.nodeStates[gid]?.activity ?? 0) > 0.3).length;
      const injectedLabels = Object.entries(s.injected).filter(([, v]) => v)
        .map(([id]) => graph.core.nodes.find((n) => n.id === id)?.label ?? id);
      const drugs = INHIBITORS.filter((d) => s.inhibitors[d.id]);

      // ============ 第 1 页 ============
      const c1 = document.createElement('canvas');
      c1.width = PAGE_W * SCALE; c1.height = PAGE_H * SCALE;
      const ctx = c1.getContext('2d');
      if (!ctx) throw new Error('画布初始化失败');
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, PAGE_W, PAGE_H);

      // 头部横幅
      ctx.fillStyle = HEAD_BG;
      roundRect(ctx, PAD, PAD, CONTENT_W, 64, 12); ctx.fill();
      setFont(ctx, 15, '800', false, '#f0fdfa');
      ctx.fillText('VirtualCell Lab · 虚拟细胞实验室', PAD + 24, PAD + 28);
      setFont(ctx, 9, '400', true, '#5eead4');
      ctx.fillText('EXPERIMENT REPORT · 分子级信号转导演示', PAD + 24, PAD + 44);
      setFont(ctx, 9, '400', true, '#99f6e4');
      const idLine = `报告编号 ${reportId}`;
      ctx.fillText(idLine, PAD + CONTENT_W - 24 - ctx.measureText(idLine).width, PAD + 28);
      ctx.fillText(stamp, PAD + CONTENT_W - 24 - ctx.measureText(stamp).width, PAD + 44);

      // 实验设置（2 列键值）
      let y = sectionTitle(ctx, PAD + 64, '实验设置', 'EXPERIMENT SETUP');
      const kvRows: [string, string][] = [
        ['细胞系', `${cell?.name ?? '—'}（${cell?.nameEn ?? ''}）· 真实直径 ${cell?.diameter ?? '—'}`],
        ['通路', `${graph.meta.nameZh} · ${graph.meta.id}`],
        ['信号分类', graph.meta.category],
        ['模拟时长', `T+${(s.tick * 0.5).toFixed(1)} s（信号阶段 ${s.phase}/4）`],
        ['演示速率', `${s.speed}×（每 tick 0.5 s 模拟时间）`],
        ['核心子图', `${graph.stats.coreCount} 分子 / ${graph.core.edges.length} 信号关系`],
        ['配体注射', injectedLabels.length ? injectedLabels.join('、') : cell?.mutations?.length ? '无（内源驱动突变）' : '无'],
        ['药理干预', drugs.length ? `${drugs.length} 种（${drugs.map((d) => d.name).join('、')}）` : '无'],
      ];
      kvRows.forEach((row, i) => {
        const col = i % 2, rowI = Math.floor(i / 2);
        const x = PAD + (col * CONTENT_W) / 2;
        const ry = y + rowI * 22;
        setFont(ctx, 9, '400', false, INK_FAINT);
        ctx.fillText(row[0], x, ry + 8);
        setFont(ctx, 11, '500');
        const valueW = CONTENT_W / 2 - 64 - 10;
        const vLines = wrapText(ctx, row[1], valueW, 1);
        ctx.fillText(vLines[0] ?? '—', x + 64 + 8, ry + 8);
      });
      y += Math.ceil(kvRows.length / 2) * 22 + 6;

      // 核心级联
      y = sectionTitle(ctx, y, '核心级联', 'CORE CASCADE');
      ctx.fillStyle = '#f0fdfa'; ctx.strokeStyle = '#ccfbf1'; ctx.lineWidth = 1;
      roundRect(ctx, PAD, y, CONTENT_W, 32, 8); ctx.fill(); ctx.stroke();
      setFont(ctx, 10.5, '400', true, '#134e4a');
      const cascadeLines = wrapText(ctx, graph.meta.cascade, CONTENT_W - 24, 2);
      cascadeLines.forEach((ln, i) => ctx.fillText(ln, PAD + 12, y + 20 + i * 13));
      y += 32 + (cascadeLines.length - 1) * 13 + 4;

      // 摘要统计卡
      y = sectionTitle(ctx, y, '结果摘要', 'SUMMARY');
      const cards: [string, string][] = [
        [String(graph.stats.coreCount), '核心分子'],
        [String(eventCount), '分子事件'],
        [String(activated), '活跃分子'],
        [String(respondedGenes), '响应靶基因'],
      ];
      const cardW = (CONTENT_W - 24) / 4;
      cards.forEach(([num, label], i) => {
        const x = PAD + i * (cardW + 8);
        ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = LINE;
        roundRect(ctx, x, y, cardW, 46, 8); ctx.fill(); ctx.stroke();
        setFont(ctx, 17, '800', true, '#0f766e');
        ctx.fillText(num, x + 10, y + 24);
        setFont(ctx, 8.5, '400', false, INK_FAINT);
        ctx.fillText(label, x + 10, y + 38);
      });
      y += 58;

      // 活性动力学曲线
      y = sectionTitle(ctx, y, '活性动力学曲线（Top 6）', 'ACTIVITY KINETICS');
      const hist = s.activityHistory;
      const topMolecules = Object.entries(s.nodeStates)
        .map(([id, v]) => ({ id, label: graph.core.nodes.find((n) => n.id === id)?.label ?? id, activity: v.activity }))
        .sort((a, b) => b.activity - a.activity)
        .slice(0, 6);
      if (hist.length > 1 && topMolecules.length > 0) {
        drawActivityChart(ctx, PAD, y, hist, topMolecules);
        y += 240 + 40;
      } else {
        setFont(ctx, 10, '400', false, INK_FAINT);
        ctx.fillText('未记录活性曲线 —— 播放模拟后再导出可获得动力学数据', PAD + 180, y + 40);
        y += 60;
      }

      const pages: HTMLCanvasElement[] = [c1];

      // ============ 第 2 页起: 分子档案 + 药理 + 事件流 ============
      const c2 = document.createElement('canvas');
      c2.width = PAGE_W * SCALE; c2.height = PAGE_H * SCALE;
      const ctx2 = c2.getContext('2d');
      if (!ctx2) throw new Error('画布初始化失败');
      ctx2.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      ctx2.fillStyle = '#ffffff'; ctx2.fillRect(0, 0, PAGE_W, PAGE_H);
      pages.push(c2);
      let ey = sectionTitle(ctx2, PAD, '核心分子档案（按终活性排序）', 'MOLECULE PROFILE');

      // 分子档案表（Top 12）
      const top12 = Object.entries(s.nodeStates)
        .map(([id, v]) => {
          const node: CoreNode | undefined = graph.core.nodes.find((n) => n.id === id);
          return node ? { node, ...v } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .sort((a, b) => b.activity - a.activity)
        .slice(0, 12);
      const colW = [120, 70, 84, 130, 140];
      const colX = colW.map((_, i) => PAD + colW.slice(0, i).reduce((a, b) => a + b, 0));
      // 表头
      ctx2.fillStyle = '#ecfdf5';
      ctx2.fillRect(PAD, ey, CONTENT_W, 22);
      setFont(ctx2, 9, '600', false, INK_FAINT);
      ['分子', '类别', '区室', '活性', '磷酸化'].forEach((t, i) => ctx2.fillText(t, colX[i] + 8, ey + 15));
      ey += 22;
      top12.forEach((m, i) => {
        const rowH = 26;
        if (i % 2 === 1) {
          ctx2.fillStyle = '#f8fafc';
          ctx2.fillRect(PAD, ey, CONTENT_W, rowH);
        }
        setFont(ctx2, 10, '500', true);
        ctx2.fillText(m.node.label, colX[0] + 8, ey + 17);
        setFont(ctx2, 10, '400', false, INK_SOFT);
        ctx2.fillText(KIND_ZH[m.node.kind] ?? '分子', colX[1] + 8, ey + 17);
        ctx2.fillText(COMPARTMENT_ZH[m.node.compartment] ?? '—', colX[2] + 8, ey + 17);
        drawBar(ctx2, colX[3] + 8, ey + 10, m.activity, '#0d9488');
        drawBar(ctx2, colX[4] + 8, ey + 10, m.phospho, '#d97706');
        ey += rowH;
      });
      ey += 14;

      // 药理干预
      if (drugs.length > 0) {
        ey = sectionTitle(ctx2, ey, '药理干预记录', 'PHARMACOLOGY');
        for (const d of drugs) {
          const cardH = 58;
          ctx2.fillStyle = '#faf5ff'; ctx2.strokeStyle = '#f3e8ff';
          roundRect(ctx2, PAD, ey, CONTENT_W, cardH, 8); ctx2.fill(); ctx2.stroke();
          setFont(ctx2, 11, '700', false, '#6b21a8');
          ctx2.fillText(`${d.name}（${d.code}）· ${d.drugClass} → ${d.targets.join(' / ')}`, PAD + 12, ey + 18);
          setFont(ctx2, 9.5, '400', false, INK_SOFT);
          const mech = wrapText(ctx2, d.mechanism, CONTENT_W - 24, 2);
          mech.forEach((ln, i) => ctx2.fillText(ln, PAD + 12, ey + 34 + i * 13));
          ey += cardH + 6;
        }
      }
      // 突变背景
      if (cell?.mutations && cell.mutations.length > 0) {
        ey = sectionTitle(ctx2, ey, '遗传背景', 'GENETIC BACKGROUND');
        const EFFECT_ZH: Record<string, string> = { constitutive: '组成性激活', knockout: '功能缺失', overexpress: '过表达' };
        for (const m of cell.mutations) {
          const cardH = 46;
          ctx2.fillStyle = '#fff1f2'; ctx2.strokeStyle = '#ffe4e6';
          roundRect(ctx2, PAD, ey, CONTENT_W, cardH, 8); ctx2.fill(); ctx2.stroke();
          setFont(ctx2, 10, '700', false, '#9f1239');
          ctx2.fillText(`${m.node} — ${EFFECT_ZH[m.effect] ?? m.effect}`, PAD + 12, ey + 16);
          setFont(ctx2, 9.5, '400', false, '#9f1239');
          const note = wrapText(ctx2, m.note, CONTENT_W - 24, 2);
          note.forEach((ln, i) => ctx2.fillText(ln, PAD + 12, ey + 31 + i * 13));
          ey += cardH + 6;
        }
      }

      // ===== 事件流（多页续排） =====
      const signalEvents: SimEvent[] = s.events.filter((e) => e.kind !== 'info');
      // 事件表绘制器（每页一个表）
      const drawEventHeader = (c: CanvasRenderingContext2D, yy: number, continued: boolean): number => {
        if (continued) {
          setFont(c, 9, '400', true, INK_FAINT);
          c.fillText('分子事件流（续）', PAD, yy + 4);
          yy += 14;
        }
        c.fillStyle = '#f8fafc';
        c.fillRect(PAD, yy, CONTENT_W, 20);
        setFont(c, 8.5, '600', false, INK_FAINT);
        c.fillText('时间(s)', PAD + 6, yy + 13);
        c.fillText('类型', PAD + 58 + 6, yy + 13);
        c.fillText('事件描述', PAD + 58 + 52 + 6, yy + 13);
        return yy + 20;
      };
      const drawEventRow = (c: CanvasRenderingContext2D, yy: number, ev: SimEvent): number => {
        const textX = PAD + 58 + 52 + 8;
        const textW = CONTENT_W - 58 - 52 - 16;
        setFont(c, 9.5, '400', false, INK);
        const lines = wrapText(c, ev.text, textW, 2);
        const rowH = Math.max(22, lines.length * 13 + 8);
        // 时间
        setFont(c, 9, '400', true, INK_FAINT);
        c.fillText(ev.simTime.replace('T+', ''), PAD + 6, yy + 12);
        // 类型徽标
        const [kText, kColor] = EVENT_BADGE[ev.kind] ?? ['信息', '#475569'];
        c.fillStyle = kColor;
        roundRect(c, PAD + 58 + 6, yy + 2, 40, 13, 3); c.fill();
        setFont(c, 8, '600', false, '#ffffff');
        c.fillText(kText, PAD + 58 + 6 + (40 - c.measureText(kText).width) / 2, yy + 11);
        // 描述
        setFont(c, 9.5, '400', false, INK);
        lines.forEach((ln, i) => c.fillText(ln, textX, yy + 12 + i * 13));
        // 行分隔线
        c.strokeStyle = '#f1f5f9'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(PAD, yy + rowH); c.lineTo(PAD + CONTENT_W, yy + rowH); c.stroke();
        return yy + rowH;
      };

      if (signalEvents.length === 0) {
        ey = sectionTitle(ctx2, ey, '分子事件流', 'EVENT LOG');
        setFont(ctx2, 10, '400', false, INK_FAINT);
        ctx2.fillText('未记录分子事件 —— 注射配体并播放模拟', PAD + 200, ey + 20);
      } else {
        // 事件流节标题 + 首页表
        ey = sectionTitle(ctx2, ey, '分子事件流', 'EVENT LOG');
        let curCtx = ctx2;
        let curCanvas = c2;
        let yy = drawEventHeader(curCtx, ey, false);
        const pageBottom = PAGE_H - PAD - 26;
        for (const ev of signalEvents) {
          // 预估行高（与 wrapText 一致: 2 行封顶）
          setFont(curCtx, 9.5, '400', false, INK);
          const estH = Math.max(22, wrapText(curCtx, ev.text, CONTENT_W - 126, 2).length * 13 + 8);
          if (yy + estH > pageBottom) {
            // 新页
            const cn = document.createElement('canvas');
            cn.width = PAGE_W * SCALE; cn.height = PAGE_H * SCALE;
            const nctx = cn.getContext('2d');
            if (!nctx) throw new Error('画布初始化失败');
            nctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
            nctx.fillStyle = '#ffffff'; nctx.fillRect(0, 0, PAGE_W, PAGE_H);
            pages.push(cn);
            curCtx = nctx; curCanvas = cn;
            yy = drawEventHeader(nctx, PAD, true);
          }
          yy = drawEventRow(curCtx, yy, ev);
          void curCanvas;
        }
      }

      // 页脚（总页数确定后统一绘制）
      pages.forEach((pc, i) => {
        const pctx = pc.getContext('2d');
        if (pctx) {
          pctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
          drawFooter(pctx, i + 1, pages.length, stamp);
        }
      });

      // ===== Canvas → PDF =====
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
      for (let i = 0; i < pages.length; i++) {
        if (i > 0) doc.addPage();
        doc.addImage(pages[i].toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, A4_PT_W, A4_PT_H, undefined, 'FAST');
      }
      const dateStr = stamp.slice(0, 10).replace(/-/g, '');
      doc.save(`VirtualCell-Report-${graph.meta.id}-${dateStr}.pdf`);

      setState('done');
      toast({ title: '实验报告已导出', description: `${pages.length} 页 PDF · ${eventCount} 分子事件 · ${graph.meta.nameZh}` });
      setTimeout(() => setState('idle'), 3000);
    } catch (err) {
      console.error('报告导出失败', err);
      setState('error');
      toast({ title: '导出失败', description: err instanceof Error ? err.message : '未知错误，请重试', variant: 'destructive' });
      setTimeout(() => setState('idle'), 3000);
    }
  };

  return (
    <Button
      size="icon"
      variant="outline"
      onClick={handleExport}
      disabled={!graph || state === 'busy'}
      className={state === 'done'
        ? 'h-9 w-9 rounded-lg border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
        : state === 'error'
          ? 'h-9 w-9 rounded-lg border-rose-500/50 bg-rose-500/15 text-rose-300'
          : 'h-9 w-9 rounded-lg border-white/10 bg-white/5 text-slate-300 hover:border-teal-500/40 hover:text-teal-300'}
      title="导出实验报告（PDF：设置/摘要/曲线/分子档案/事件流）"
    >
      {state === 'busy' ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : state === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" />
        : state === 'error' ? <AlertCircle className="h-3.5 w-3.5" />
        : <FileDown className="h-3.5 w-3.5" />}
    </Button>
  );
}
