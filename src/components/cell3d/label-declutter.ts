/* ============ v60 标签屏幕空间防叠 · 共享注册表与求解器 ============
 * 自 molecules.tsx v37 的 MoleculeLayer 内联注册表泛化而来:
 *   · 模块级共享 Map —— 分子标签（molecules.tsx）与药物标签（drug-molecules.tsx）
 *     同池参与两两松弛（药物徽标与分子标签互不遮挡 —— worklog v55 起的长期建议项落地）
 *   · 求解器 DOM 泛型: 仅依赖 opacity/isConnected/getBoundingClientRect/CSS class,
 *     优先级经 classList 判定（is-selected 3 > is-active 2 > 普通 1）
 *   · 节流窗口 0.22s 由模块级时钟统一 —— 多层各自 useFrame 调用, 先到先跑, 不重复求解
 * 位移协议与 v37 一致: --nudx/--nudy CSS 自定义属性 + is-declut 残余半避让。
 */

/* 全局标签注册表（key: 分子 node.id / 药物 `drug:${drug.id}:${target.id}:${slot}`） */
export const labelRegistry = new Map<string, HTMLDivElement>();

let lastRunAt = -1;

/**
 * 标签两两矩形松弛（节流 0.22s; 多调用方安全 —— 先到先跑）。
 * @param now 场景时钟（state.clock.elapsedTime —— 与被替代的内联实现同源）
 */
export function runLabelDeclutter(now: number): void {
  if (now - lastRunAt < 0.22) return;
  lastRunAt = now;
  const reg = labelRegistry;
  interface Lb {
    el: HTMLDivElement; cx: number; cy: number; w: number; h: number;
    dx: number; dy: number; pr: number;
  }
  const items: Lb[] = [];
  for (const [id, el] of reg) {
    if (!el.isConnected) { reg.delete(id); continue; }
    const op = Number.parseFloat(el.style.opacity || '1');
    if (!(op > 0.05)) {
      if (el.classList.contains('is-declut')) el.classList.remove('is-declut');
      el.style.setProperty('--nudx', '0px');
      el.style.setProperty('--nudy', '0px');
      continue;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 4) continue;
    // 累积式位移: rect 中心已含旧 nudge 变换 → 基位 = rect 中心 − 旧位移, 松弛位置 = 基位 + dx
    // （一致坐标系: 写回 --nudx = dx 后实际落位 = 基位 + dx —— 每轮在上一轮基础上继续推进,
    //   若每次从 0 重算会覆盖旧值 → 标签回弹基位, 重叠永不消解）
    const dx0 = Number.parseFloat(el.style.getPropertyValue('--nudx') || '0') || 0;
    const dy0 = Number.parseFloat(el.style.getPropertyValue('--nudy') || '0') || 0;
    items.push({
      el,
      cx: r.left + r.width / 2 - dx0,
      cy: r.top + r.height / 2 - dy0,
      w: r.width,
      h: r.height,
      dx: dx0,
      dy: dy0,
      pr: el.classList.contains('is-selected') ? 3 : el.classList.contains('is-active') ? 2 : 1,
    });
  }
  if (items.length < 2) return;
  const GAP = 4;
  const CAP = 72;
  // QA 插桩（__cellQaProbe 门控 —— 与全项目探针方法论一致）
  if (typeof window !== 'undefined' && (window as { __cellQaProbe?: boolean }).__cellQaProbe) {
    let nudgeSum = 0, maxD = 0;
    for (const it of items) { nudgeSum += Math.hypot(it.dx, it.dy); maxD = Math.max(maxD, Math.hypot(it.dx, it.dy)); }
    (window as unknown as Record<string, unknown>).__declutQa = {
      reg: reg.size,
      items: items.length,
      t: +now.toFixed(1),
      nudgeSum: +nudgeSum.toFixed(0),
      maxD: +maxD.toFixed(1),
      lastWrites: items.filter((it) => Math.hypot(it.dx, it.dy) > 6).slice(0, 6).map((it) => [+it.dx.toFixed(1), +it.dy.toFixed(1)]),
    };
  }
  for (let it = 0; it < 30; it++) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j];
        const ax0 = A.cx - A.w / 2 + A.dx, ax1 = A.cx + A.w / 2 + A.dx;
        const bx0 = B.cx - B.w / 2 + B.dx, bx1 = B.cx + B.w / 2 + B.dx;
        const ay0 = A.cy - A.h / 2 + A.dy, ay1 = A.cy + A.h / 2 + A.dy;
        const by0 = B.cy - B.h / 2 + B.dy, by1 = B.cy + B.h / 2 + B.dy;
        const ox = Math.min(ax1, bx1) - Math.max(ax0, bx0);
        const oy = Math.min(ay1, by1) - Math.max(ay0, by0);
        if (ox <= GAP || oy <= GAP) continue;
        const needX = ox - GAP + 1;
        const needY = oy - GAP + 1;
        // 轴选择带方向稳定性: y 序差 < 1.5px 时竖推符号逐迭代翻转（上推↔下推振荡,
        // 净位移归零 —— 同高邻标永不分离）; y 序不稳 → 落回水平推（x 序推开自强化恒稳）
        const dyDiff = Math.abs((A.cy + A.dy) - (B.cy + B.dy));
        const useY = needY <= needX * 1.55 && dyDiff > 1.5;
        const need = useY ? needY : needX;
        const wsum = A.pr + B.pr;
        const wA = (B.pr / wsum) * 0.8, wB = (A.pr / wsum) * 0.8; // 单轮闭包 80%（全局收敛跨轮累积）
        if (useY) {
          const up = (A.cy + A.dy) <= (B.cy + B.dy) ? -1 : 1;
          A.dy += up * need * wA;
          B.dy -= up * need * wB;
        } else {
          const lf = (A.cx + A.dx) <= (B.cx + B.dx) ? -1 : 1;
          A.dx += lf * need * wA;
          B.dx -= lf * need * wB;
        }
      }
    }
  }
  // 残余重叠检测（松弛后仍交叠 → 低优先级半避让; 先清后加避免粘滞）
  for (const it of items) it.el.classList.remove('is-declut');
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      const ox = Math.min(A.cx + A.w / 2 + A.dx, B.cx + B.w / 2 + B.dx) - Math.max(A.cx - A.w / 2 + A.dx, B.cx - B.w / 2 + B.dx);
      const oy = Math.min(A.cy + A.h / 2 + A.dy, B.cy + B.h / 2 + B.dy) - Math.max(A.cy - A.h / 2 + A.dy, B.cy - B.h / 2 + B.dy);
      if (ox > 3 && oy > 3) {
        (A.pr <= B.pr ? A : B).el.classList.add('is-declut');
      }
    }
  }
  const seen = new Set<HTMLDivElement>();
  for (const it of items) {
    seen.add(it.el);
    const d = Math.hypot(it.dx, it.dy);
    let dx = it.dx, dy = it.dy;
    if (d > CAP) { dx *= CAP / d; dy *= CAP / d; }
    it.el.style.setProperty('--nudx', `${dx.toFixed(1)}px`);
    it.el.style.setProperty('--nudy', `${dy.toFixed(1)}px`);
  }
  // 清理未参与本轮流弛的标签的降级标记
  for (const [, el] of reg) {
    if (!seen.has(el) && el.classList.contains('is-declut')) el.classList.remove('is-declut');
  }
}
