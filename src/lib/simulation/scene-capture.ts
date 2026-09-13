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
