/**
 * v35 发表模式图版合成（Publication figure composer）
 * 输入: WebGL 画布 PNG 快照 + 实验元数据 + 比例标尺标定（µm/px）
 * 输出: 科研图版风格的整页 PNG（纸面版式: 刊头 → 图区（含标尺）→ 图注 → 脚注）并触发下载。
 * 纯客户端 Canvas 2D 合成 —— 无服务端依赖; 语言双语（zh/en）。
 */

export interface FigureInput {
  /** WebGL 画布 PNG dataURL */
  png: string;
  lang: 'zh' | 'en';
  /** 细胞类型显示名（已本地化） */
  cellName: string;
  /** 细胞类型 id（文件名用） */
  cellId: string;
  /** 通路显示名 */
  pathwayName: string;
  /** 通路 id（如 hsa04010） */
  pathwayId: string;
  /** 信号阶段 0-4 */
  phase: number;
  /** 模拟叙事时间（秒, 保留 1 位） */
  simTimeS: string;
  running: boolean;
  /** 核心子图分子数 */
  moleculeCount: number;
  /** 剖面视图开启 */
  sectionView: boolean;
  /** 标定: 图像像素 → µm（null = 无法标定则省略标尺） */
  umPerPx: number | null;
}

const FONT_STACK = "'Helvetica Neue', 'Helvetica', 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', Arial, sans-serif";

/** 会话内图版序号（图 1、图 2 … 连续导出递增） */
let figCounter = 0;

/** 解析细胞直径字符串 → 数值 µm（'20–30 μm' → 25; '≈ 15 µm' → 15; 失败 null） */
export function parseDiameterUm(d: string | undefined): number | null {
  if (!d) return null;
  const range = d.match(/(\d+(?:\.\d+)?)\s*[–~\-]\s*(\d+(?:\.\d+)?)/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const single = d.match(/(\d+(?:\.\d+)?)/);
  return single ? Number(single[1]) : null;
}

/** 快照空白检测（preserveDrawingBuffer 缺失时的兜底判据: 24×24 采样亮度方差） */
export function isBlankPng(png: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 24;
        c.height = 24;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(false);
        ctx.drawImage(img, 0, 0, 24, 24);
        const d = ctx.getImageData(0, 0, 24, 24).data;
        let mean = 0;
        for (let i = 0; i < d.length; i += 4) mean += d[i]! + d[i + 1]! + d[i + 2]!;
        mean /= (d.length / 4) * 3;
        let varSum = 0;
        for (let i = 0; i < d.length; i += 4) {
          const l = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
          varSum += (l - mean) ** 2;
        }
        resolve(Math.sqrt(varSum / (d.length / 4)) < 0.6);
      } catch {
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = png;
  });
}

const setFont = (ctx: CanvasRenderingContext2D, px: number, weight = 400) => {
  ctx.font = `${weight} ${Math.round(px)}px ${FONT_STACK}`;
};

/** 文本自动换行（返回行数组; 限 maxLines 行, 溢出截断加 …） */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let rest = text;
  while (rest.length > 0 && lines.length < maxLines) {
    let w = ctx.measureText(rest).width;
    if (w <= maxWidth || rest.length <= 4) {
      lines.push(rest);
      break;
    }
    // 二分逼近可容纳的字符数
    let lo = 1;
    let hi = rest.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(rest.slice(0, mid)).width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    const cut = rest.slice(0, Math.max(1, lo));
    if (lines.length === maxLines - 1 && ctx.measureText(rest).width > maxWidth) {
      lines.push(cut.replace(/[\s·,，]$/, '') + '…');
      rest = '';
    } else {
      lines.push(cut);
      rest = rest.slice(Math.max(1, lo)).replace(/^\s+/, '');
    }
  }
  return lines;
}

/** 选取「美观标尺」长度: 目标像素宽度 64 ~ 22% 图宽的 1-2-5 序列
 *  v59b 修复: umPerPx 语义为「µm / px」—— 64px 对应 64·umPerPx µm（旧版 64/umPerPx
 *  方向反转 → lo 恒远超候选上限 → 标尺从未渲染的根因）; 兜底取杆长 ≥ 40px 的最小候选 */
function niceScaleUm(umPerPx: number, imgW: number): number | null {
  if (!umPerPx || !Number.isFinite(umPerPx) || umPerPx <= 0) return null;
  const candidates = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
  const lo = 64 * umPerPx;
  const hi = (imgW * 0.22) * umPerPx;
  for (const c of candidates) {
    if (c >= lo && c <= hi) return c;
  }
  return candidates.find((c) => c / umPerPx >= 40) ?? null;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 合成并下载图版（返回 'ok' | 'blank' —— blank = 快照空白, 调用方可重试） */
export async function composeAndDownloadFigure(input: FigureInput): Promise<'ok' | 'blank' | 'error'> {
  if (await isBlankPng(input.png)) return 'blank';
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = input.png;
  });
  if (!img) return 'error';

  figCounter += 1;
  const zh = input.lang === 'zh';
  const W = Math.min(img.width, 1920);
  const M = Math.round(W * 0.042); // 纸面外边距
  const imgW = W - M * 2;
  const imgH = Math.round((img.height / img.width) * imgW);

  const brandH = Math.max(22, W * 0.03);
  const titleH = Math.max(34, W * 0.056);
  const capH = Math.max(96, W * 0.152);
  const H = Math.round(M + brandH + 10 + titleH + 14 + imgH + 18 + capH + M);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'error';

  /* ---- 纸面 ---- */
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  let y = M;

  /* ---- 刊头: 品牌行（左: 刊名小体大写字距; 右: 图版编号） ---- */
  const brandFs = Math.max(10, W * 0.0115);
  setFont(ctx, brandFs, 600);
  ctx.fillStyle = '#1a1a1a';
  try { (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(W * 0.006)}px`; } catch { /* 旧浏览器无字距 */ }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText('VIRTUAL CELL LAB', M, y + brandFs);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#8a8a85';
  ctx.fillText(zh ? `图版 · FIG. ${figCounter}` : `FIGURE ${figCounter}`, W - M, y + brandFs);
  try { (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'; } catch { /* noop */ }
  y += brandH + 10;

  // 刊头下细分隔线
  ctx.strokeStyle = '#e6e6e0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M, y);
  ctx.lineTo(W - M, y);
  ctx.stroke();
  y += 14;

  /* ---- 标题行: 细胞类型 · 通路 ---- */
  const titleFs = Math.max(16, W * 0.019);
  setFont(ctx, titleFs, 700);
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'left';
  const titleText = `${input.cellName}${zh ? ' · ' : ' · '}${input.pathwayName}`;
  wrapText(ctx, titleText, imgW, 1).forEach((line) => {
    ctx.fillText(line, M, y + titleFs * 0.9);
  });
  y += titleH;

  /* ---- 图区: 快照 + 内衬细框 ---- */
  const imgY = y;
  ctx.drawImage(img, M, imgY, imgW, imgH);
  ctx.strokeStyle = '#deded8';
  ctx.lineWidth = 1;
  ctx.strokeRect(M + 0.5, imgY + 0.5, imgW - 1, imgH - 1);

  /* ---- 比例标尺（图内右下: 白底胶囊 + 黑标尺杆 + µm 标签） ---- */
  const barUm = niceScaleUm(input.umPerPx ?? 0, imgW);
  if (barUm && input.umPerPx) {
    const barPx = Math.round(barUm / input.umPerPx);
    const barH = Math.max(3, Math.round(W * 0.0026));
    const labelFs = Math.max(10, W * 0.011);
    const pad = Math.max(8, W * 0.009);
    const boxW = barPx + pad * 2;
    const boxH = labelFs + barH * 2.6 + pad * 1.6;
    const bx = M + imgW - boxW - Math.max(10, W * 0.012);
    const by = imgY + imgH - boxH - Math.max(10, W * 0.012);
    // 白底胶囊
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    const r = boxH / 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, r);
    ctx.fill();
    ctx.stroke();
    // µm 标签
    setFont(ctx, labelFs, 600);
    ctx.fillStyle = '#161616';
    ctx.textAlign = 'center';
    ctx.fillText(`${barUm} µm`, bx + boxW / 2, by + pad + labelFs * 0.82);
    // 标尺杆 + 端竖线
    const barY = by + pad + labelFs * 1.05 + barH * 0.8;
    ctx.fillStyle = '#111111';
    ctx.fillRect(bx + pad, barY, barPx, barH);
    ctx.fillRect(bx + pad, barY - barH * 0.8, Math.max(2, barH * 0.6), barH * 2.6);
    ctx.fillRect(bx + pad + barPx - Math.max(2, barH * 0.6), barY - barH * 0.8, Math.max(2, barH * 0.6), barH * 2.6);
  }
  y = imgY + imgH + 18;

  /* ---- 图注块 ---- */
  const leadFs = Math.max(13, W * 0.0145);
  const bodyFs = Math.max(11.5, W * 0.012);
  const footFs = Math.max(10, W * 0.0105);
  const lineGap = bodyFs * 1.55;

  // 引导行（粗体）: 图 N | 标题性描述
  setFont(ctx, leadFs, 700);
  ctx.fillStyle = '#161616';
  ctx.textAlign = 'left';
  const lead = zh
    ? `图 ${figCounter} | ${input.cellName}三维超微结构模型与 ${input.pathwayName}信号级联`
    : `Figure ${figCounter} | 3D ultrastructural model of ${input.cellName} with the ${input.pathwayName} cascade`;
  let cy = y + leadFs;
  wrapText(ctx, lead, imgW, 2).forEach((line) => {
    ctx.fillText(line, M, cy);
    cy += leadFs * 1.35;
  });
  cy += 4;

  // 状态行
  setFont(ctx, bodyFs, 400);
  ctx.fillStyle = '#3f3f3f';
  const status = zh
    ? `信号阶段 ${input.phase}/4 · T+${input.simTimeS}s · ${input.running ? '动态模拟运行中' : '静息观测'} · ${input.moleculeCount} 个核心分子${input.sectionView ? ' · 剖面视图' : ''}`
    : `Signalling phase ${input.phase}/4 · T+${input.simTimeS}s · ${input.running ? 'live simulation' : 'resting state'} · ${input.moleculeCount} core molecules${input.sectionView ? ' · section view' : ''}`;
  wrapText(ctx, status, imgW, 2).forEach((line) => {
    ctx.fillText(line, M, cy);
    cy += lineGap;
  });

  // 方法行（灰）
  ctx.fillStyle = '#767672';
  const methods = zh
    ? 'WebGL 实时渲染 · ACES Filmic 色调映射 · 环境光遮蔽与辉光后处理 · 微结构参照 Alberts《Molecular Biology of the Cell》6th · 非等比示意'
    : 'Rendered in real time (WebGL, ACES filmic tone mapping, AO & bloom) · ultrastructure after Alberts, MBoC 6th ed. · not to scale';
  wrapText(ctx, methods, imgW, 2).forEach((line) => {
    ctx.fillText(line, M, cy);
    cy += lineGap;
  });

  // 脚注: 时间戳 + 数据源 + 品牌
  const footY = H - M - footFs * 0.35;
  ctx.strokeStyle = '#ecece7';
  ctx.beginPath();
  ctx.moveTo(M, footY - footFs * 2.1);
  ctx.lineTo(W - M, footY - footFs * 2.1);
  ctx.stroke();
  setFont(ctx, footFs, 400);
  ctx.fillStyle = '#9a9a94';
  const now = new Date();
  const loc = zh ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` : now.toISOString().slice(0, 16).replace('T', ' ');
  ctx.fillText(`${loc} · KEGG ${input.pathwayId}`, M, footY);
  ctx.textAlign = 'right';
  ctx.fillText('VIRTUAL CELL LAB', W - M, footY);

  /* ---- 下载 ---- */
  const filename = `vcl_fig${figCounter}_${input.cellId}_${input.pathwayId}_${stamp()}.png`;
  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      resolve();
    }, 'image/png');
  });
  return 'ok';
}

/* ============ v59 多面板图版（2×2 对照版式） ============
 *  四面板同表观尺度（共享相机-目标距离）: A 当前视角 / B 正面观 / C 顶面观 / D 侧面观。
 *  科研拼版语言: 面板字母角标（A–D 白底黑字）+ 视角名 + 面板级比例标尺（仅 A, 标定全图通用）。
 *  每面板独立空白检测（跳过空白面板, 不阻塞其余面板）。 */
export interface MultiPanelInput {
  lang: 'zh' | 'en';
  cellName: string;
  cellId: string;
  pathwayName: string;
  pathwayId: string;
  phase: number;
  simTimeS: string;
  running: boolean;
  moleculeCount: number;
  sectionView: boolean;
  umPerPx: number | null;
  /** 面板快照（png dataURL; label 已本地化） —— 不足 4 面板时按现有数量降级排版 */
  panels: { png: string; label: string }[];
}

export async function composeAndDownloadFigureMulti(input: MultiPanelInput): Promise<'ok' | 'blank' | 'error'> {
  if (input.panels.length === 0) return 'blank';
  const imgs = await Promise.all(
    input.panels.map(async (p) => {
      if (await isBlankPng(p.png)) return null;
      const i = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = p.png;
      });
      return i ? { img: i, label: p.label } : null;
    }),
  );
  const valid = imgs.filter((x): x is { img: HTMLImageElement; label: string } => x !== null);
  if (valid.length === 0) return 'blank';

  figCounter += 1;
  const zh = input.lang === 'zh';
  const W = 2048;
  const M = Math.round(W * 0.036);
  const gap = Math.round(W * 0.018);
  const panelW = Math.floor((W - M * 2 - gap) / 2);
  const aspect = valid[0].img.height / valid[0].img.width;
  const panelH = Math.round(panelW * aspect);
  const panelLabelH = Math.round(W * 0.022);

  const brandH = Math.max(24, W * 0.028);
  const titleH = Math.max(36, W * 0.052);
  const capH = Math.max(120, W * 0.14);
  const gridH = panelH * 2 + panelLabelH * 2 + gap;
  const H = Math.round(M + brandH + 10 + titleH + 14 + gridH + 18 + capH + M);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'error';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  let y = M;

  /* 刊头 */
  const brandFs = Math.max(11, W * 0.011);
  setFont(ctx, brandFs, 600);
  ctx.fillStyle = '#1a1a1a';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  try { (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(W * 0.0055)}px`; } catch { /* noop */ }
  ctx.fillText('VIRTUAL CELL LAB', M, y + brandFs);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#8a8a85';
  ctx.fillText(zh ? `对照图版 · PANEL FIG. ${figCounter}` : `PANEL FIGURE ${figCounter}`, W - M, y + brandFs);
  try { (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'; } catch { /* noop */ }
  y += brandH + 10;
  ctx.strokeStyle = '#e6e6e0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M, y);
  ctx.lineTo(W - M, y);
  ctx.stroke();
  y += 14;

  /* 标题 */
  const titleFs = Math.max(17, W * 0.018);
  setFont(ctx, titleFs, 700);
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'left';
  wrapText(ctx, `${input.cellName} · ${input.pathwayName}`, W - M * 2, 1).forEach((line) => {
    ctx.fillText(line, M, y + titleFs * 0.9);
  });
  y += titleH;

  /* 2×2 网格 */
  const letters = ['A', 'B', 'C', 'D'];
  const badgeFs = Math.max(13, W * 0.013);
  const labelFs = Math.max(12, W * 0.0115);
  valid.forEach(({ img, label }, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const px = M + col * (panelW + gap);
    const py = y + row * (panelH + panelLabelH + gap);
    ctx.drawImage(img, px, py, panelW, panelH);
    ctx.strokeStyle = '#deded8';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, panelW - 1, panelH - 1);
    // 面板字母角标（左上, 白底黑字圆角块）
    const bw = badgeFs * 1.9;
    const bh = badgeFs * 1.7;
    const bpad = Math.round(W * 0.006);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.roundRect(px + bpad, py + bpad, bw, bh, Math.min(6, bh / 2));
    ctx.fill();
    ctx.stroke();
    setFont(ctx, badgeFs, 700);
    ctx.fillStyle = '#161616';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letters[idx] ?? String(idx + 1), px + bpad + bw / 2, py + bpad + bh / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    // 视角名（面板下方）
    setFont(ctx, labelFs, 600);
    ctx.fillStyle = '#333333';
    ctx.textAlign = 'left';
    ctx.fillText(`${letters[idx] ?? ''} · ${label}`, px + 2, py + panelH + labelFs);
  });

  /* 面板 A 比例标尺（标定对四面板通用 —— 同表观尺度） */
  const barUm = niceScaleUm(input.umPerPx ?? 0, panelW);
  if (barUm && input.umPerPx) {
    const barPx = Math.round(barUm / input.umPerPx);
    const barH = Math.max(3, Math.round(W * 0.0024));
    const blFs = Math.max(10, W * 0.0105);
    const pad = Math.max(8, W * 0.008);
    const boxW = barPx + pad * 2;
    const boxH = blFs + barH * 2.6 + pad * 1.6;
    const bx = M + panelW - boxW - Math.max(10, W * 0.01);
    const by = y + panelH - boxH - Math.max(10, W * 0.01);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, boxH / 2);
    ctx.fill();
    ctx.stroke();
    setFont(ctx, blFs, 600);
    ctx.fillStyle = '#161616';
    ctx.textAlign = 'center';
    ctx.fillText(`${barUm} µm`, bx + boxW / 2, by + pad + blFs * 0.82);
    const barY = by + pad + blFs * 1.05 + barH * 0.8;
    ctx.fillStyle = '#111111';
    ctx.fillRect(bx + pad, barY, barPx, barH);
    ctx.fillRect(bx + pad, barY - barH * 0.8, Math.max(2, barH * 0.6), barH * 2.6);
    ctx.fillRect(bx + pad + barPx - Math.max(2, barH * 0.6), barY - barH * 0.8, Math.max(2, barH * 0.6), barH * 2.6);
  }
  y += gridH + 18;

  /* 图注 */
  const leadFs = Math.max(13, W * 0.0135);
  const bodyFs = Math.max(11.5, W * 0.0112);
  const footFs = Math.max(10, W * 0.0098);
  const lineGap = bodyFs * 1.5;
  setFont(ctx, leadFs, 700);
  ctx.fillStyle = '#161616';
  ctx.textAlign = 'left';
  const lead = zh
    ? `图 ${figCounter} | ${input.cellName}四视角对照（当前视角 / 正面观 / 顶面观 / 侧面观）与 ${input.pathwayName}信号级联`
    : `Figure ${figCounter} | Four-view survey of ${input.cellName} (current / frontal / apical / lateral) with the ${input.pathwayName} cascade`;
  let cy = y + leadFs;
  wrapText(ctx, lead, W - M * 2, 2).forEach((line) => {
    ctx.fillText(line, M, cy);
    cy += leadFs * 1.3;
  });
  cy += 4;
  setFont(ctx, bodyFs, 400);
  ctx.fillStyle = '#3f3f3f';
  const status = zh
    ? `信号阶段 ${input.phase}/4 · T+${input.simTimeS}s · ${input.running ? '动态模拟运行中' : '静息观测'} · ${input.moleculeCount} 个核心分子 · 四面板同表观尺度（比例标尺见图 A）${input.sectionView ? ' · 剖面视图' : ''}`
    : `Signalling phase ${input.phase}/4 · T+${input.simTimeS}s · ${input.running ? 'live simulation' : 'resting state'} · ${input.moleculeCount} core molecules · all panels at identical apparent scale (scale bar in A)${input.sectionView ? ' · section view' : ''}`;
  wrapText(ctx, status, W - M * 2, 2).forEach((line) => {
    ctx.fillText(line, M, cy);
    cy += lineGap;
  });
  ctx.fillStyle = '#767672';
  const methods = zh
    ? 'WebGL 实时渲染 · ACES Filmic 色调映射 · 环境光遮蔽与辉光后处理 · 微结构参照 Alberts《Molecular Biology of the Cell》6th · 非等比示意'
    : 'Rendered in real time (WebGL, ACES filmic tone mapping, AO & bloom) · ultrastructure after Alberts, MBoC 6th ed. · not to scale';
  wrapText(ctx, methods, W - M * 2, 2).forEach((line) => {
    ctx.fillText(line, M, cy);
    cy += lineGap;
  });

  /* 脚注 */
  const footY = H - M - footFs * 0.35;
  ctx.strokeStyle = '#ecece7';
  ctx.beginPath();
  ctx.moveTo(M, footY - footFs * 2.1);
  ctx.lineTo(W - M, footY - footFs * 2.1);
  ctx.stroke();
  setFont(ctx, footFs, 400);
  ctx.fillStyle = '#9a9a94';
  const now = new Date();
  const loc = zh ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` : now.toISOString().slice(0, 16).replace('T', ' ');
  ctx.fillText(`${loc} · KEGG ${input.pathwayId}`, M, footY);
  ctx.textAlign = 'right';
  ctx.fillText('VIRTUAL CELL LAB', W - M, footY);

  const filename = `vcl_panel${figCounter}_${input.cellId}_${input.pathwayId}_${stamp()}.png`;
  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      resolve();
    }, 'image/png');
  });
  return 'ok';
}
