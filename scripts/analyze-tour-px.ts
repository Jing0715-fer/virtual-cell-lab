import sharp from '/home/z/my-project/node_modules/sharp';

async function main() {
  for (const f of ['qa-tour-immersive.png', 'qa-tour-immersive2.png']) {
    const img = sharp(`/home/z/my-project/${f}`);
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    let emeraldPx = 0, amberPx = 0, brightPx = 0, total = 0;
    const step = info.channels * 11;
    for (let i = 0; i < data.length; i += step) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      total++;
      if (g > 120 && g > r * 1.25 && g > b * 1.1) emeraldPx++;
      if (r > 150 && g > 100 && b < 95 && r > b * 1.7) amberPx++;
      if (r > 210 && g > 210 && b > 210) brightPx++;
    }
    console.log(`${f}: emerald=${emeraldPx}/${total} amber=${amberPx} bright=${brightPx} size=${info.width}x${info.height}`);
  }
}
main();
