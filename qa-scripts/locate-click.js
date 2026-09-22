/* v63 定位视觉 QA: 切细胞类型 → 展开图鉴条目 → 点击「在细胞中定位」→ 等飞行完成
 * 用法: agent-browser eval "$(STRUCT_ZH='紧密连接' CELL_ZH='肠上皮细胞' bash -c 'cat qa-scripts/locate-click.js')"
 * 变量经占位符注入（agent-browser eval 不支持环境变量） */
(() => {
  (async () => {
    window.__locQa = { steps: [] };
    const log = (s) => window.__locQa.steps.push(s);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const CELL = '__CELL__';
    const STRUCT = '__STRUCT__';
    // 1) 切细胞类型（图鉴「在场」判定依赖当前类型锚点池）
    const c = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(CELL) && b.closest('div.grid'));
    if (c) { c.click(); await sleep(2400); log('cell:' + CELL); } else log('no-cell');
    // 2) 打开图鉴（若未开）
    const atlasBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('图鉴'));
    if (atlasBtn && !atlasBtn.className.includes('bg-emerald-500')) { atlasBtn.click(); await sleep(800); }
    log('atlas');
    // 3) 展开目标条目（header 按钮: 首个带文本 span 精确匹配 atlas zh 名）
    const rowBtn = [...document.querySelectorAll('button[aria-expanded]')].find((b) =>
      [...b.querySelectorAll('span')].some((s) => s.textContent.trim() === STRUCT));
    if (!rowBtn) { window.__locQa.err = 'no-row:' + STRUCT; return; }
    if (rowBtn.getAttribute('aria-expanded') !== 'true') { rowBtn.click(); await sleep(500); }
    const item = rowBtn.closest('.rounded-lg');
    const loc = item && item.querySelector('.atlas-locate-btn');
    if (!loc) { window.__locQa.err = 'no-locate-btn'; return; }
    // 4) 定位 → 相机飞行 1.2s + 脉冲环 2.4s
    loc.click();
    log('located:' + STRUCT);
    await sleep(1650);
    window.__locQa.done = true;
  })();
  return 'started';
})()
