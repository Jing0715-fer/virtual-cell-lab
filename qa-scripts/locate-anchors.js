/* v63 定位锚点归位 QA: 逐细胞类型切换 → 读 __cellQaTargets → 数值验证锚点 f 值
 * （|pos|/R, R 由糖萼锚 f=1.03 反推）是否落在结构本体几何带内（不再悬空胞外）。
 * 后台异步执行 + window.__anchorQaDone 轮询（CDP eval 超时 ≠ 中止的既知陷阱）。 */

(() => {
  window.__cellQaProbe = true;
  window.__anchorQaDone = null;
  (async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const pickCell = async (name) => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(name));
      if (!btn) return 'no-btn:' + name;
      btn.click();
      await sleep(2200);
      return null;
    };
    const collect = (latins) => {
      const targets = window.__cellQaTargets || [];
      const g = targets.find((t) => t.latin === 'Glycocalyx');
      const R = g ? Math.hypot(g.pos.x, g.pos.y, g.pos.z) / 1.03 : null;
      const anchors = [];
      for (const lat of latins) {
        const t = targets.find((x) => x.latin === lat);
        if (!t) { anchors.push({ latin: lat, missing: true }); continue; }
        const d = Math.hypot(t.pos.x, t.pos.y, t.pos.z);
        anchors.push({
          latin: lat,
          f: R ? +(d / R).toFixed(3) : null,
          pos: [+(t.pos.x).toFixed(2), +(t.pos.y).toFixed(2), +(t.pos.z).toFixed(2)],
          r: t.r,
          fly: t.fly ?? null,
        });
      }
      return { R: R ? +R.toFixed(2) : null, anchors };
    };
    const plans = [
      { cell: '肠上皮细胞', latins: ['Microvilli', 'Tight junction', 'Basal lamina', 'Terminal web', 'Desmosome'] },
      { cell: '锥体神经元', latins: ['Myelinated axon', 'Basal dendrite', 'Synaptic bouton', 'Apical tuft'] },
      { cell: '心肌细胞', latins: ['Intercalated disc', 'T-tubule', 'Sarcoplasmic reticulum', 'Myofibril'] },
      { cell: '成纤维细胞', latins: ['Collagen fiber', 'Stress fiber'] },
      { cell: 'T细胞', latins: ['TCR microcluster'] },
      { cell: '癌细胞', latins: ['Membrane blebbing', 'Micronucleus'] },
      { cell: '肝细胞', latins: ['Bile canaliculus'] },
    ];
    const results = [];
    for (const p of plans) {
      const err = await pickCell(p.cell);
      if (err) { results.push({ cell: p.cell, err }); continue; }
      results.push({ cell: p.cell, ...collect(p.latins) });
    }
    window.__anchorQaDone = results;
  })();
  return 'started';
})()
