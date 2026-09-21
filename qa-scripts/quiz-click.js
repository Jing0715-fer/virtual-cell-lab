/* v61 结构辨识挑战 QA · 多锚点版: 同名结构多个悬停锚（如 18 个线粒体逐一试）
 * 对每个锚: pointermove → 等帧读 hovered → 命中目标即 down+up 点击 → 读反馈 */
(async () => {
  window.__cellQaProbe = true;
  const log = (s) => { window.__quizQaLog = (window.__quizQaLog || []).concat([s]); };
  log('start');
  const nextFrame = () => Promise.race([
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    new Promise((r) => setTimeout(r, 800)),
  ]);
  await nextFrame();
  await new Promise((r) => setTimeout(r, 300));
  const targets = window.__cellQaTargets || [];
  const cam = window.__cellQaState?.cam;
  if (!cam) return { err: 'no cam' };
  const mul = (m, v) => [
    m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12]*v[3],
    m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13]*v[3],
    m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]*v[3],
    m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15]*v[3],
  ];
  const project = (p) => {
    const v = mul(cam.mwi, [p.x, p.y, p.z, 1]);
    const c = mul(cam.pm, v);
    return { x: (c[0] / c[3] * 0.5 + 0.5) * cam.size[0], y: (0.5 - c[1] / c[3] * 0.5) * cam.size[1] };
  };
  const canvas = document.querySelector('canvas');
  const rect = canvas.getBoundingClientRect();
  const card = [...document.querySelectorAll('.pointer-events-auto')].find((d) => d.textContent.includes('找到并点击'));
  if (!card) return { err: 'no quiz card' };
  const m = card.textContent.match(/找到并点击\s*([\u4e00-\u9fa5]+)/);
  const qName = m?.[1] || '';
  const cands = targets.filter((t) => t.zh.startsWith(qName) || (t.zh.includes(qName) && qName.length >= 2));
  const fire = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse',
    clientX: x, clientY: y, button: 0, buttons: 1,
  }));
  const tried = [];
  log(`qName=${qName} cands=${cands.length}`);
  for (const want of cands.slice(0, 8)) {
    // v61b: 折线目标（骨架纤维/actin 网）命中体是 poly 全段 —— 锚点可能远离纤维;
    // 取 poly 中点投影为点击位（与悬停引擎折线通道同几何）
    const hitP = want.poly && want.poly.length >= 2 ? want.poly[Math.floor(want.poly.length / 2)] : want.pos;
    const sp = project(hitP);
    if (sp.x < 8 || sp.y < 8 || sp.x > cam.size[0] - 8 || sp.y > cam.size[1] - 8) continue; // 画布外
    log(`try ${want.zh} at ${Math.round(sp.x)},${Math.round(sp.y)}`);
    const cx = rect.x + sp.x;
    const cy = rect.y + sp.y;
    fire('pointermove', cx, cy);
    await new Promise((r) => setTimeout(r, 950));
    await nextFrame();
    const hoverZh = window.__cellQaState?.hovered || null;
    tried.push({ at: [Math.round(sp.x), Math.round(sp.y)], hoverZh });
    if (hoverZh && hoverZh.startsWith(qName)) {
      log('click!');
    fire('pointerdown', cx, cy);
      fire('pointerup', cx, cy);
      await new Promise((r) => setTimeout(r, 400));
      const fb = card.textContent.includes('正确') ? 'correct' : card.textContent.includes('不是这个') ? 'wrong' : card.textContent.includes('答案是') ? 'revealed' : 'none';
      return { qName, nCands: cands.length, clicked: [Math.round(cx), Math.round(cy)], hoverZh, feedback: fb, cardText: card.textContent.slice(0, 110), triedN: tried.length };
    }
  }
  return { qName, nCands: cands.length, feedback: 'no-hit', tried, cardText: card.textContent.slice(0, 110) };
})()
