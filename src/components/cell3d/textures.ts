/**
 * 程序化 PBR 贴图工厂 —— 运行时 Canvas 生成（法线/粗糙度/斑点/条纹），模块级缓存复用
 * 科学纹理参照:
 *   - 有机膜表面: 低频 FBM 噪声（膜蛋白/脂质微畴起伏）
 *   - 斑点法线: 核糖体/衣被蛋白包被
 *   - 条纹法线: 胶原 D-带周期 (67nm) / 微管原纤维
 * 无外部资源依赖（沙箱离线可用），所有贴图 tileable。
 */
import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

/* ============ 噪声基础（可平铺 lattice value noise） ============ */

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = (n: number) => ((n % period) + period) % period;
  const a = hash2(w(xi), w(yi), seed);
  const b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed);
  const d = hash2(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 可平铺 2D FBM（u,v ∈ [0,1)） */
function fbm2(u: number, v: number, basePeriod: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const p = basePeriod * (1 << o);
    sum += amp * vnoise(u * p, v * p, p, seed + o * 131);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

function makeCtx(size: number): { ctx: CanvasRenderingContext2D; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  return { ctx, canvas };
}

function finalizeTexture(canvas: HTMLCanvasElement, repeat: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Sobel(带环绕) → 法线图编码 */
function heightToNormal(height: Float32Array, size: number, strength: number): ImageData {
  const ctx = makeCtx(size).ctx;
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => height[((y % size) + size) % size * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      const nx = -dx * strength;
      const ny = -dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

/* ============ 公开贴图生成器 ============ */

export interface OrganicNormalOpts {
  size?: number;
  freq?: number;
  octaves?: number;
  strength?: number;
  seed?: number;
  repeat?: number;
}

/** 有机膜法线图（低频起伏 + 高频微畴） */
export function organicNormalMap(opts: OrganicNormalOpts = {}): THREE.Texture {
  const { size = 256, freq = 6, octaves = 4, strength = 2.4, seed = 11, repeat = 1 } = opts;
  const key = `organic:${size}:${freq}:${octaves}:${strength}:${seed}:${repeat}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      height[y * size + x] = fbm2(u, v, freq, octaves, seed);
    }
  }
  const { ctx, canvas } = makeCtx(size);
  ctx.putImageData(heightToNormal(height, size, strength), 0, 0);
  const tex = finalizeTexture(canvas, repeat);
  cache.set(key, tex);
  return tex;
}

export interface SpeckleOpts {
  size?: number;
  count?: number;
  radius?: number;
  strength?: number;
  seed?: number;
  repeat?: number;
}

/** 斑点法线图（核糖体/衣被蛋白: 高斯凸点, 环绕拼接） */
export function speckleNormalMap(opts: SpeckleOpts = {}): THREE.Texture {
  const { size = 256, count = 220, radius = 0.02, strength = 1.9, seed = 29, repeat = 1 } = opts;
  const key = `speckle:${size}:${count}:${radius}:${strength}:${seed}:${repeat}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const height = new Float32Array(size * size);
  for (let i = 0; i < count; i++) {
    const cx = hash2(i, 7, seed) * size;
    const cy = hash2(i, 13, seed + 3) * size;
    const r = radius * size * (0.7 + hash2(i, 19, seed + 5) * 0.6);
    const amp = 0.55 + hash2(i, 23, seed + 9) * 0.45;
    const ir = Math.ceil(r);
    for (let dy = -ir; dy <= ir; dy++) {
      for (let dx = -ir; dx <= ir; dx++) {
        const d = Math.hypot(dx, dy) / r;
        if (d > 1) continue;
        const bump = Math.exp(-d * d * 3) * amp;
        const x = ((Math.round(cx) + dx) % size + size) % size;
        const y = ((Math.round(cy) + dy) % size + size) % size;
        height[y * size + x] += bump;
      }
    }
  }
  const { ctx, canvas } = makeCtx(size);
  ctx.putImageData(heightToNormal(height, size, strength), 0, 0);
  const tex = finalizeTexture(canvas, repeat);
  cache.set(key, tex);
  return tex;
}

export interface StripeOpts {
  size?: number;
  stripes?: number;
  width?: number;
  strength?: number;
  seed?: number;
  repeat?: number;
  /** 条纹方向: 'x' = 沿 u 变化(水平条带), 'y' = 沿 v 变化(垂直条带) */
  dir?: 'x' | 'y';
}

/** 条纹法线图（胶原 D-带 / 微管原纤维） */
export function stripeNormalMap(opts: StripeOpts = {}): THREE.Texture {
  const { size = 128, stripes = 10, width = 0.3, strength = 2.6, seed = 5, repeat = 1, dir = 'x' } = opts;
  const key = `stripe:${size}:${stripes}:${width}:${strength}:${seed}:${repeat}:${dir}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const height = new Float32Array(size * size);
  const period = size / stripes;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = dir === 'x' ? x : y;
      const jitter = (fbm2(x / size, y / size, 4, 2, seed) - 0.5) * period * 0.18;
      const phase = ((c + jitter) % period) / period; // 0..1
      // 方波状沟槽 + 亚周期细纹
      const groove = phase < width ? -0.6 : 0.35;
      const fine = Math.sin(phase * Math.PI * 2) * 0.12;
      height[y * size + x] = groove + fine;
    }
  }
  const { ctx, canvas } = makeCtx(size);
  ctx.putImageData(heightToNormal(height, size, strength), 0, 0);
  const tex = finalizeTexture(canvas, repeat);
  cache.set(key, tex);
  return tex;
}

export interface RoughnessOpts {
  size?: number;
  base?: number;
  variance?: number;
  freq?: number;
  seed?: number;
  repeat?: number;
}

/** 粗糙度图（灰度 FBM → 光泽微变化） */
export function roughnessMap(opts: RoughnessOpts = {}): THREE.Texture {
  const { size = 256, base = 0.42, variance = 0.3, freq = 5, seed = 71, repeat = 1 } = opts;
  const key = `rough:${size}:${base}:${variance}:${freq}:${seed}:${repeat}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { ctx, canvas } = makeCtx(size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm2(x / size, y / size, freq, 4, seed);
      const val = Math.max(0, Math.min(1, base + (n - 0.5) * variance));
      const b = val * 255;
      const i = (y * size + x) * 4;
      img.data[i] = b;
      img.data[i + 1] = b;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = finalizeTexture(canvas, repeat);
  cache.set(key, tex);
  return tex;
}

/** 悬浮粒子圆形渐变 sprite 贴图（径向柔光） */
export function glowSpriteTexture(): THREE.Texture {
  const key = 'glowsprite:64';
  const hit = cache.get(key);
  if (hit) return hit;
  const { ctx, canvas } = makeCtx(64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}
