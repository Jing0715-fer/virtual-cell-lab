import sharp from '/home/z/my-project/node_modules/sharp';

/** 核仁 DFC 验证: 核内视角截图中核仁区域应出现 FC 深紫核心 + DFC 中紫纤维壳 + GC 颗粒的层次
 * 采样中央区域 40-60% 位置的紫色族像素（R<B, 蓝紫主导）分档统计明度层次 */
async function main() {
  const img = sharp('/home/z/my-project/qa-nucleolus-dfc.png');
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  // 中央核区窗口
  const x0 = Math.floor(W * 0.3), x1 = Math.floor(W * 0.7);
  const y0 = Math.floor(H * 0.3), y1 = Math.floor(H * 0.7);
  let purpleDark = 0, purpleMid = 0, purpleLight = 0, other = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * C;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const isPurple = b > r * 1.05 && b > 60 && r > 30 && b > g * 1.1;
      if (!isPurple) { other++; continue; }
      const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      if (lum < 60) purpleDark++;
      else if (lum < 110) purpleMid++;
      else purpleLight++;
    }
  }
  const total = purpleDark + purpleMid + purpleLight + other;
  console.log(`nucleus-view: dark(FC)=${purpleDark} mid(DFC)=${purpleMid} light(GC/纤维)=${purpleLight} purpleShare=${(((purpleDark + purpleMid + purpleLight) / total) * 100).toFixed(1)}% size=${W}x${H}`);
}
main();
