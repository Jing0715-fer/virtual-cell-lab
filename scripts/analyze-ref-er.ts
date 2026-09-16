/**
 * 参照图 ER 结构与全局锐度像素级测量（Task 35）
 * VLM 429 → sharp 像素逆向工程
 * 测量目标:
 *  1) ER 囊池几何（拉长连通域长宽比/宽度分布）
 *  2) 核糖体点彩纹理（高频斑点密度/尺寸/对比度）
 *  3) 全图锐度（Sobel 梯度能量分布 —— 背景是否模糊）
 *  4) 高光边缘梯度（发表级图的黑边锐度）
 */
import sharp from 'sharp';

const IMG = 'upload/pasted_image_1789526571897.png';

async function main() {
  const { data, info } = await sharp(IMG).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = 3;
  const lum = (x: number, y: number) => {
    const i = (y * W + x) * C;
    return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  };

  // ---------- 1) ER 石板蓝区掩码（右半蓝灰膜系族） ----------
  let erCount = 0, erSumX = 0, erSumY = 0;
  const erMask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // 石板蓝灰: b>=r>=g 且亮度 55..190 且色差温和
      const slate = b >= r - 4 && r >= g - 6 && b > g + 4 && r > 38 && b < 210;
      if (slate) { erMask[y * W + x] = 1; erCount++; erSumX += x; erSumY += y; }
    }
  }
  console.log(`[ER 掩码] slateBlue 像素 ${erCount} (${(100 * erCount / (W * H)).toFixed(1)}%), 质心 (${(erSumX / erCount).toFixed(0)}, ${(erSumY / erCount).toFixed(0)})`);

  // ---------- 2) 高频斑点（核糖体点彩）: 3×3 高通 ----------
  // 只统计 ER 掩码膨胀区（ER±3px）的斑点能量
  const dil = (m: Uint8Array) => {
    const o = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (m[y * W + x]) { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) o[yy * W + xx] = 1; } }
    }
    return o;
  };
  const erZone = dil(erMask);
  let spotN = 0, spotSum = 0, spotContrast = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!erZone[y * W + x]) continue;
      const c = lum(x, y);
      const hp = Math.abs(4 * c - lum(x - 1, y) - lum(x + 1, y) - lum(x, y - 1) - lum(x, y + 1));
      if (hp > 14) { spotN++; spotContrast += hp; }
      spotSum += hp;
    }
  }
  const erZoneN = erZone.reduce((a, b) => a + b, 0);
  console.log(`[核糖体点彩] ER区高通>14 斑点 ${(100 * spotN / erZoneN).toFixed(2)}% 像素, 平均对比 ${(spotContrast / Math.max(1, spotN)).toFixed(1)}, 高通均值 ${(spotSum / erZoneN).toFixed(2)}`);

  // ---------- 3) 连通域长宽比（ER 囊池形态） ----------
  // 在 ER 掩码上做行游程统计: 水平游程长度分布 → 囊池宽度感
  const runs: number[] = [];
  for (let y = 0; y < H; y += 2) {
    let run = 0;
    for (let x = 0; x < W; x++) {
      if (erMask[y * W + x]) run++;
      else { if (run > 0) runs.push(run); run = 0; }
    }
    if (run > 0) runs.push(run);
  }
  runs.sort((a, b) => a - b);
  const q = (p: number) => runs[Math.floor(runs.length * p)] ?? 0;
  console.log(`[ER 囊池游程] n=${runs.length} px, p50=${q(0.5)} p75=${q(0.75)} p90=${q(0.9)} p97=${q(0.97)} max=${runs[runs.length - 1]}`);

  // ---------- 4) 全图锐度: Sobel 梯度能量, 分象限 ----------
  const quad = (name: string, x0: number, x1: number, y0: number, y1: number) => {
    let sum = 0, n = 0, hi = 0;
    for (let y = Math.max(1, y0); y < Math.min(H - 1, y1); y++) {
      for (let x = Math.max(1, x0); x < Math.min(W - 1, x1); x++) {
        const gx = -lum(x - 1, y - 1) - 2 * lum(x - 1, y) - lum(x - 1, y + 1) + lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1);
        const gy = -lum(x - 1, y - 1) - 2 * lum(x, y - 1) - lum(x + 1, y - 1) + lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1);
        const g = Math.sqrt(gx * gx + gy * gy);
        sum += g; n++;
        if (g > 150) hi++;
      }
    }
    console.log(`[锐度 ${name}] Sobel均值 ${(sum / n).toFixed(1)}, 强边缘占比 ${(100 * hi / n).toFixed(2)}%`);
  };
  quad('全图', 0, W, 0, H);
  quad('中心主体(细胞)', W * 0.25, W * 0.75, H * 0.2, H * 0.8);
  quad('左缘(线粒体群)', 0, W * 0.3, H * 0.15, H * 0.85);
  quad('右缘(ER区)', W * 0.7, W, H * 0.15, H * 0.85);

  // ---------- 5) 亮度带剖面（前/中/背景景深感） ----------
  const rowProfile = (y: number) => {
    const vals: number[] = [];
    for (let x = 0; x < W; x += 16) vals.push(Math.round(lum(x, y)));
    console.log(`[行 ${y}] ${vals.join(',')}`);
  };
  rowProfile(Math.round(H / 2));

  // ---------- 6) 保存 ER 区放大裁片供人工检视 ----------
  const cx = Math.round(erSumX / erCount), cy = Math.round(erSumY / erCount);
  await sharp(IMG).extract({ left: Math.max(0, cx - 220), top: Math.max(0, cy - 140), width: 440, height: 280 }).png().toFile('/tmp/ref_er_zoom.png');
  console.log(`[裁片] /tmp/ref_er_zoom.png (ER 质心±220×140)`);

  // 核糖体点彩微区（更小放大）: 100×70 三连
  await sharp(IMG).extract({ left: Math.max(0, cx + 40), top: Math.max(0, cy - 20), width: 100, height: 70 }).png().toFile('/tmp/ref_er_micro.png');
  console.log('[微区] /tmp/ref_er_micro.png 100×70');
}

main().catch(e => { console.error(e); process.exit(1); });
