import sharp from '/home/z/my-project/node_modules/sharp';

/** 彗星拖尾特征: 加色混合青绿亮像素 (g>200, b>170, r<170) —— 排除白标签/琥珀
 *  对比 station1(无脉冲基线) 与 comet 帧, 验证新增拖尾像素群沿边移动 */
async function tealPts(file: string) {
  const { data, info } = await sharp(`/home/z/my-project/${file}`).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const pts: [number, number][] = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * C;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > 195 && b > 165 && r < 175 && g > r + 45) pts.push([x, y]);
    }
  }
  return pts;
}

async function main() {
  const files = ['qa-tour-station1.png', 'qa-comet-a.png', 'qa-comet-b.png'];
  for (const f of files) {
    const pts = await tealPts(f);
    if (pts.length === 0) { console.log(`${f}: 0 teal px`); continue; }
    const cx = Math.round(pts.reduce((s, p) => s + p[0], 0) / pts.length);
    const cy = Math.round(pts.reduce((s, p) => s + p[1], 0) / pts.length);
    console.log(`${f}: n=${pts.length} centroid=(${cx},${cy})`);
  }
}
main();
