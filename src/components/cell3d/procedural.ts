/**
 * 程序化几何工具 —— 3D 噪声位移 / 几何合并 / 球面采样
 * 用于高精度有机形体建模（替代完美球体的"生命感"形变）
 */
import * as THREE from 'three';

/* ============ 确定性哈希与 3D 噪声 ============ */

export function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const c000 = hash3(xi, yi, zi, seed);
  const c100 = hash3(xi + 1, yi, zi, seed);
  const c010 = hash3(xi, yi + 1, zi, seed);
  const c110 = hash3(xi + 1, yi + 1, zi, seed);
  const c001 = hash3(xi, yi, zi + 1, seed);
  const c101 = hash3(xi + 1, yi, zi + 1, seed);
  const c011 = hash3(xi, yi + 1, zi + 1, seed);
  const c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

export function fbm3(x: number, y: number, z: number, octaves = 3, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise3(x * (1 << o), y * (1 << o), z * (1 << o), seed + o * 197);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

/* ============ 几何位移（沿法线有机形变） ============ */

/**
 * 沿法线方向施加 FBM 位移 —— 有机不规则形
 * @param freq 噪声频率（越大越"斑块化"）
 * @param amp  位移幅度（几何单位）
 */
export function displaceGeometry(geo: THREE.BufferGeometry, freq: number, amp: number, seed = 0, octaves = 3): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i).normalize();
    const d = (fbm3(v.x * freq, v.y * freq, v.z * freq, octaves, seed) - 0.5) * 2 * amp;
    v.addScaledVector(n, d);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/* ============ 圆弧弯曲（v62 —— 豆形线粒体） ============ */

/**
 * 局部 Y 长轴的圆弧弯曲（点变换）—— 电镜下线粒体的香蕉/豆形轮廓
 * @param k 曲率（rad/单位长; >0 时 +Y 端弯向 -X, C 口朝 +X; 0 = 不弯）
 * 圆心位于 (-1/k, 0, 0), 长轴弧长保持不变（ρ = R + x 处弧长 = ρ·θ）
 */
export function bendY(k: number, x: number, y: number, z: number): { x: number; y: number; z: number } {
  if (k === 0) return { x, y, z };
  const R = 1 / k;
  const th = y * k;
  const rho = R + x;
  return { x: rho * Math.cos(th) - R, y: rho * Math.sin(th), z };
}

/** 几何整体弯曲（就地修改; 弯后法线重算） */
export function bendGeometryY(geo: THREE.BufferGeometry, k: number): THREE.BufferGeometry {
  if (!k) return geo;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const p = bendY(k, pos.getX(i), pos.getY(i), pos.getZ(i));
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/* ============ 几何合并（减 draw call） ============ */

/**
 * 合并多个已变换几何（position/normal/uv + index）
 * 可选逐部件顶点色（用于单 draw 渐变, 如高尔基顺→反梯度）
 */
export function mergeGeoms(parts: { geo: THREE.BufferGeometry; matrix?: THREE.Matrix4; color?: THREE.Color }[]): THREE.BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const p of parts) {
    vCount += p.geo.attributes.position.count;
    iCount += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count;
  }
  const position = new Float32Array(vCount * 3);
  const normal = new Float32Array(vCount * 3);
  const hasUv = parts.every((p) => !!p.geo.attributes.uv);
  const uv = hasUv ? new Float32Array(vCount * 2) : null;
  const color = parts.some((p) => p.color) ? new Float32Array(vCount * 3) : null;
  const index = new Uint32Array(iCount);
  const m3 = new THREE.Matrix3();
  const v = new THREE.Vector3();
  let vOff = 0;
  let iOff = 0;
  for (const p of parts) {
    const g = p.geo;
    const pa = g.attributes.position as THREE.BufferAttribute;
    const na = g.attributes.normal ? (g.attributes.normal as THREE.BufferAttribute) : null;
    const m = p.matrix ?? null;
    m3.getNormalMatrix(m ?? new THREE.Matrix4());
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i);
      if (m) v.applyMatrix4(m);
      position[(vOff + i) * 3] = v.x;
      position[(vOff + i) * 3 + 1] = v.y;
      position[(vOff + i) * 3 + 2] = v.z;
      if (na) {
        v.fromBufferAttribute(na, i);
        v.applyMatrix3(m3).normalize();
        normal[(vOff + i) * 3] = v.x;
        normal[(vOff + i) * 3 + 1] = v.y;
        normal[(vOff + i) * 3 + 2] = v.z;
      } else {
        normal[(vOff + i) * 3] = 0;
        normal[(vOff + i) * 3 + 1] = 1;
        normal[(vOff + i) * 3 + 2] = 0;
      }
      if (uv && g.attributes.uv) {
        const uva = g.attributes.uv as THREE.BufferAttribute;
        uv[(vOff + i) * 2] = uva.getX(i);
        uv[(vOff + i) * 2 + 1] = uva.getY(i);
      }
      if (color) {
        const c = p.color ?? WHITE;
        color[(vOff + i) * 3] = c.r;
        color[(vOff + i) * 3 + 1] = c.g;
        color[(vOff + i) * 3 + 2] = c.b;
      }
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) {
        index[iOff + i] = g.index.getX(i) + vOff;
      }
    } else {
      for (let i = 0; i < pa.count; i++) {
        index[iOff + i] = i + vOff;
      }
    }
    vOff += pa.count;
    iOff += g.index ? g.index.count : pa.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (color) out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}

const WHITE = new THREE.Color('#ffffff');

/* ============ 球面采样 ============ */

/** 斐波那契球面均匀分布 */
export function fibSphere(count: number, r: number): { x: number; y: number; z: number }[] {
  const pts: { x: number; y: number; z: number }[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    pts.push({ x: Math.cos(th) * rad * r, y: y * r, z: Math.sin(th) * rad * r });
  }
  return pts;
}

/** 球坐标（lat ∈ [-π/2, π/2] 纬度, lon ∈ [0, 2π) 经度） */
export function sph(r: number, lat: number, lon: number): { x: number; y: number; z: number } {
  return {
    x: r * Math.cos(lat) * Math.cos(lon),
    y: r * Math.sin(lat),
    z: r * Math.cos(lat) * Math.sin(lon),
  };
}
