/**
 * QA 剪影分析（bun scripts/qa-silhouette.ts <screenshot.png>）
 * 从整页截图中分离"剖面发光缘带/膜面高亮"（亮青主导像素）→ 包围盒 → 长宽比。
 * HUD 排除: 裁掉右侧剖切面板 (>1050px) / 左侧图例 (<230px) / 顶栏 (<36px)。
 */
import sharp from 'sharp';

const file = process.argv[2];
if (!file) {
  console.error('usage: bun scripts/qa-silhouette.ts <png>');
  process.exit(1);
}

const CROP = { left: 230, top: 36, width: 820, height: 540 }; // 画布中央净区
const { data, info } = await sharp(file)
  .extract({ ...CROP, width: Math.min(CROP.width, 1280 - CROP.left) })
  .raw()
  .toBuffer({ resolveWithObject: true });

const W = info.width;
const H = info.height;
const colCount = new Array(W).fill(0);
const rowCount = new Array(H).fill(0);
let teal = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * info.channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // 亮青主导（缘带 #5eead4 / 膜高亮; 排除紫核/暖色分子/白文本）
    if (g > 110 && g > r + 30 && g > b + 10) {
      teal++;
      colCount[x]++;
      rowCount[y]++;
    }
  }
}
const bb = (arr: number[], mn: number): [number, number] => {
  let a = -1;
  let b = -1;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] >= mn) {
      if (a < 0) a = i;
      b = i;
    }
  }
  return [a, b];
};
const [x0, x1] = bb(colCount, 4);
const [y0, y1] = bb(rowCount, 4);
if (x0 < 0) {
  console.log(JSON.stringify({ teal, found: false }));
  process.exit(0);
}
const w = x1 - x0 + 1;
const h = y1 - y0 + 1;
console.log(JSON.stringify({
  teal,
  found: true,
  bbox: { x: x0 + CROP.left, y: y0 + CROP.top, w, h },
  aspect: +(w / h).toFixed(2),
}));
