/** 区域 ASCII 可视化: 在指定屏幕比例区域内按 8px 块输出主色族字符 */
import sharp from 'sharp';
const IMG = process.argv[2] ?? '/tmp/golgi-v15-default.png';
const X0 = parseFloat(process.argv[3] ?? '0.5'), X1 = parseFloat(process.argv[4] ?? '0.7');
const Y0 = parseFloat(process.argv[5] ?? '0.15'), Y1 = parseFloat(process.argv[6] ?? '0.75');
const { data, info } = await sharp(IMG).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = 3;
const cols = Math.floor((X1 - X0) * W / 9), rows = Math.floor((Y1 - Y0) * H / 14);
console.log(`region x[${X0},${X1}] y[${Y0},${Y1}] -> ${cols}x${rows} blocks`);
const CH: Record<string, string> = { G: '▓', g: '▒', S: 's', L: 'l', E: 'e', K: 'k', M: 'm', '.': '·', '#': '#' };
for (let r = 0; r < rows; r++) {
  let line = '';
  for (let cIdx = 0; cIdx < cols; cIdx++) {
    const x0 = Math.floor((X0 + (cIdx / cols) * (X1 - X0)) * W), y0 = Math.floor((Y0 + (r / rows) * (Y1 - Y0)) * H);
    // 9x14 块内平均
    let rs = 0, gs = 0, bs = 0, n = 0;
    for (let dy = 0; dy < 14 && y0 + dy < H; dy++) for (let dx = 0; dx < 9 && x0 + dx < W; dx++) {
      const i = ((y0 + dy) * W + (x0 + dx)) * C; rs += data[i]; gs += data[i + 1]; bs += data[i + 2]; n++;
    }
    const R = rs / n, G = gs / n, B = bs / n;
    const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    let ch: string;
    if (R > 90 && G > 65 && B < 90 && R > B + 28 && Math.abs(R - G) < 45) ch = R > 140 ? 'G' : 'g';        // 暖金族
    else if (B > R + 12 && B > 60) ch = 'S';                                                             // 石板蓝
    else if (R > 80 && B > 80 && R > G + 8 && B > G + 8) ch = 'L';                                       // 熏衣草
    else if (lum > 150) ch = 'E';                                                                        // 高光
    else if (lum > 70) ch = 'K';                                                                         // 中性灰
    else if (lum > 30) ch = 'M';                                                                         // 暗
    else ch = '.';                                                                                       // 极暗
    line += CH[ch] ?? ch;
  }
  console.log(line);
}
