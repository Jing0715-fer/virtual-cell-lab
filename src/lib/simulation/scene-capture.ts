/**
 * 3D 场景快照 —— 报告导出嵌入用
 * virtual-cell-3d 每帧节流捕获 WebGL 画布（JPEG dataURL），report-export 读取最新快照。
 * 模块级单例（不进 zustand —— 避免快照字符串触发 React 重渲染）。
 */
let lastSnapshot: string | null = null;
let lastAt = 0;

export function setSceneSnapshot(dataUrl: string): void {
  lastSnapshot = dataUrl;
  lastAt = Date.now();
}

/** 最近一次快照（null = 3D 视图未挂载或尚未捕获） */
export function getSceneSnapshot(): string | null {
  // 快照超过 5 分钟视为过期（防止陈旧画面进入新报告）
  if (lastSnapshot && Date.now() - lastAt > 5 * 60 * 1000) return null;
  return lastSnapshot;
}

export function snapshotAgeMs(): number {
  return lastAt ? Date.now() - lastAt : Infinity;
}

/* ============ v35 发表模式图版捕获（Publication figure capture） ============
 *  HUD「图版导出」按钮 → requestFigureCapture(cb) 置位请求;
 *  Canvas 内 PublicationCapture 组件在渲染管线之后（composer priority 1 → 本组件 priority 2）
 *  于同一 rAF 回调内 toDataURL（drawing buffer 尚未交还合成器 —— 无 preserveDrawingBuffer 依赖）
 *  → 回调收到 PNG + 比例标尺元数据（fov/相机距离/画布像素 → µm/px 实标尺）。 */
export interface FigureMeta {
  /** 画布设备像素（含 dpr） */
  width: number;
  height: number;
  /** 垂直视场角（度） */
  fov: number;
  /** 相机 → 轨道目标距离（世界单位; 标尺的物平面深度） */
  camDist: number;
  /** 物平面处水平方向「像素/世界单位」（已含 dpr） */
  pxPerWorld: number;
}

type FigureCb = (png: string | null, meta: FigureMeta | null) => void;

let figurePending = false;
let figureCb: FigureCb | null = null;

/** 请求一次高清图版捕获（下一次渲染帧生效; 覆盖式 —— 连点只保留最后一次） */
export function requestFigureCapture(cb: FigureCb): void {
  figureCb = cb;
  figurePending = true;
}

/** PublicationCapture 帧内消费（原子取走回调; 无请求返回 null） */
export function consumeFigureRequest(): FigureCb | null {
  if (!figurePending) return null;
  figurePending = false;
  const cb = figureCb;
  figureCb = null;
  return cb;
}

/* ============ v59 多面板图版（2×2 对照版式）视图覆盖通道 ============
 *  导出流程逐面板设置正交视角方向（距离沿用当前相机-目标距离 —— 四面板同表观尺度,
 *  共享同一比例标尺标定）; PublicationCapture 在捕获前应用并 lookAt 目标。
 *  dir = null 表示沿用当前视角（面板 A）。 */
export interface FigureViewDir {
  x: number;
  y: number;
  z: number;
}

let figureViewDir: FigureViewDir | null | undefined;

/** 设置下一次捕获的视角方向（null = 沿用当前; undefined = 未设置 —— 与 null 语义区分见 consume） */
export function setFigureViewDir(dir: FigureViewDir | null): void {
  figureViewDir = dir;
}

/** PublicationCapture 捕获前消费（返回 undefined = 无覆盖; null = 显式沿用当前视角） */
export function consumeFigureViewDir(): FigureViewDir | null | undefined {
  const v = figureViewDir;
  figureViewDir = undefined;
  return v;
}
