/** 暖色密聚类: 找画布内紧凑暖团（高尔基验证） */
import sharp from 'sharp';
const { data, info } = await sharp(process.argv[2]).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = 3;
const pts: [number, number][] = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * C;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  if (r > 60 && g > 42 && r > g + 10 && r > b + 12) pts.push([x, y]);
}
console.log('warm-ish px total:', pts.length);
// 网格密度: 16px 格
const grid = new Map<string, number>();
for (const [x, y] of pts) { const k = `${Math.floor(x/16)},${Math.floor(y/16)}`; grid.set(k, (grid.get(k) ?? 0) + 1); }
const hot = [...grid.entries()].filter(([, n]) => n > 120).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('hot cells (>120/256px):');
for (const [k, n] of hot) { const [gx, gy] = k.split(',').map(Number); console.log(`  page(${((gx*16+8)/W).toFixed(2)},${((gy*16+8)/H).toFixed(2)}) px(${gx*16},${gy*16}) n=${n}`); }
if (!hot.length) console.log('  NONE — 无紧凑暖团');
