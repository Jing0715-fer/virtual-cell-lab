/**
 * 细胞类型形状系统 —— 类型化径向形状函数（3D 形态学差异化的唯一真源）
 *
 * 每种细胞类型定义一个"径向形状函数": 单位方向向量 dir → 基础表面半径倍率 f(dir)。
 * 细胞表面半径 = R × f(dir) + FBM 有机噪声（organelles.tsx 的 cellSurf 叠加）。
 *
 * 该函数被三处共享（保证膜面结构严格对齐）:
 *   1. organelles.tsx —— 质膜几何生成（shapedCellGeometry）+ 全部表面贴附结构的 surf 计算
 *      （脂双层脂头 / 跨膜蛋白 / 糖萼 / 网格蛋白小窝 / 微绒毛 / 膜出芽 / 紧密连接环）
 *   2. layout3d.ts —— 分子区室布局（受体贴真实膜面 / 配体外带 / 胞质壳层随形状收缩）
 *   3. section-view.tsx —— 剖切盘椭圆缩放（按轴向最大延伸）
 *
 * 形态学参照（Alberts MBoC 6th / Ross Histology 10th）:
 *   hepatocyte   多边形圆角立方（肝板贴壁轮廓, 赤道带六边形谐波）
 *   neuron       锥体胞体（皮层锥体神经元金字塔形: 顶端收窄 + 基底宽）
 *   tcell        小球 + 低频皱褶（静止淋巴细胞表面微绒毛褶皱丰富）
 *   epithelial   柱状（高:宽 ≈ 2:1, 顶端圆拱 / 基底平坦 —— 顶端-基底极性）
 *   cardiomyocyte 杆状（长:宽 ≈ 3:1 分支圆柱, 端面阶梯收窄 = 闰盘位置）
 *   fibroblast   梭形（两端尖的纺锤体）
 *   cancer       变形虫样不规则（谐波变形 + 不对称大鼓包 —— 恶性多形性）
 */

export type ShapeKind =
  | 'polyhedral'
  | 'pyramidal'
  | 'sphere'
  | 'columnar'
  | 'rod'
  | 'spindle'
  | 'amoeboid';

/** 与 MorphologyKey 一一对应的形状映射（供 layout3d 组装） */
export const MORPH_SHAPE: Record<string, ShapeKind> = {
  hepatocyte: 'polyhedral',
  neuron: 'pyramidal',
  tcell: 'sphere',
  epithelial: 'columnar',
  cardiomyocyte: 'rod',
  fibroblast: 'spindle',
  cancer: 'amoeboid',
};

export interface Dir3 {
  x: number;
  y: number;
  z: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 椭球径向表面距离（精确解: t·d 代入椭球方程 → t = 1/√Σ(di/aᵢ)²） */
function ellip(d: Dir3, a: number, b: number, c: number): number {
  return 1 / Math.sqrt((d.x / a) ** 2 + (d.y / b) ** 2 + (d.z / c) ** 2);
}

/** 超椭球径向距离（n=2 为球, n>2 为圆角立方体 —— 肝细胞多边形轮廓） */
function superellip(d: Dir3, n: number): number {
  return (Math.abs(d.x) ** n + Math.abs(d.y) ** n + Math.abs(d.z) ** n) ** (-1 / n);
}

/** 类型形状函数 —— 返回基础半径倍率（不含 FBM 有机噪声） */
export function shapeFactor(d: Dir3, kind: ShapeKind): number {
  const lon = Math.atan2(d.z, d.x);
  const lat = Math.asin(clamp(d.y, -1, 1));
  switch (kind) {
    case 'polyhedral': {
      // 圆角立方基底 + 赤道带六边形轮廓（肝板贴壁多边形）+ 轻度压扁
      const hex = 1 + 0.065 * Math.cos(6 * lon + 0.35) * Math.cos(lat) ** 1.2;
      return superellip(d, 3.4) * hex * 0.975;
    }
    case 'pyramidal': {
      // 锥体神经元: 顶端（+y）收窄成金字塔 + 基底宽展 + 基底角树突根鼓起
      let r = ellip(d, 1.02, 0.97, 1.02);
      r *= 1 - 0.46 * smoothstep(0.12, 1, d.y) ** 1.7;
      r *= 1 - 0.2 * smoothstep(0.08, 1, -d.y) ** 1.3;
      r *= 1 + 0.05 * smoothstep(0.3, 0.85, -d.y) * Math.cos(4 * lon) ** 2;
      return r;
    }
    case 'sphere': {
      // 静止 T 细胞: 低频皱褶（表面微绒毛褶皱的宏观读感）
      return 1 + 0.045 * Math.cos(4 * lon) * Math.sin(2.5 * lat) + 0.03 * Math.cos(5 * lon + 1.5) * Math.cos(3 * lat);
    }
    case 'columnar': {
      // 肠上皮柱状: 高:宽 ≈ 2:1, 顶端圆拱 + 基底平坦（极性）
      let r = ellip(d, 0.64, 1.18, 0.64);
      r *= 1 - 0.08 * smoothstep(0.55, 1, d.y);
      r *= 1 - 0.34 * smoothstep(0.5, 1, -d.y) ** 1.25;
      return r;
    }
    case 'rod': {
      // 心肌杆状: 长:宽 ≈ 3:1, 端面阶梯收窄（闰盘位置）+ 侧支芽鼓包
      let r = ellip(d, 2.02, 0.7, 0.66);
      r *= 1 - 0.3 * smoothstep(0.6, 1, Math.abs(d.x)) ** 1.5;
      r *= 1 + 0.2 * Math.exp(-(((d.z - 0.78) ** 2 + (d.y + 0.45) ** 2) / 0.06));
      return r;
    }
    case 'spindle': {
      // 成纤维梭形: 两端尖纺锤
      let r = ellip(d, 1.82, 0.66, 0.72);
      r *= 1 - 0.58 * smoothstep(0.15, 1, Math.abs(d.x)) ** 1.6;
      return r;
    }
    case 'amoeboid': {
      // 癌细胞: 多频谐波变形 + 不对称大鼓包（恶性多形性）
      let r = 1;
      r += 0.14 * Math.cos(2 * lon + 0.6) * Math.cos(3 * lat);
      r += 0.11 * Math.sin(3 * lon + 2) * Math.sin(2 * lat + 1);
      r += 0.07 * Math.cos(5 * lon) * Math.cos(5 * lat);
      r += 0.22 * Math.exp(-(((d.y - 0.5) ** 2 + (d.z - 0.62) ** 2) / 0.22));
      return r;
    }
  }
}

/** 带基础半径的便捷入口（organelles / layout 共用; dir 无需归一 —— 内部归一） */
export function shapeRadius(d: Dir3, kind: ShapeKind, R: number): number {
  const l = Math.hypot(d.x, d.y, d.z) || 1;
  return shapeFactor({ x: d.x / l, y: d.y / l, z: d.z / l }, kind) * R;
}

/** 轴向最大延伸倍率（相机视野 / 剖切盘椭圆缩放; 取轴向 ± 采样的保守最大值） */
export const SHAPE_EXTENT: Record<ShapeKind, readonly [number, number, number]> = {
  polyhedral: [1.0, 0.98, 1.0],
  pyramidal: [1.04, 0.99, 1.04],
  sphere: [1.0, 1.0, 1.0],
  columnar: [0.66, 1.19, 0.66],
  rod: [2.05, 0.72, 0.7],
  spindle: [1.84, 0.68, 0.74],
  amoeboid: [1.22, 1.18, 1.24],
};

/** 类型化 FBM 噪声参数（有机不规则度差异: 心肌规整 → 癌细胞杂乱） */
export const SHAPE_NOISE: Record<ShapeKind, { freq: number; amp: number }> = {
  polyhedral: { freq: 0.8, amp: 0.14 },
  pyramidal: { freq: 0.85, amp: 0.13 },
  sphere: { freq: 1.15, amp: 0.19 },
  columnar: { freq: 0.75, amp: 0.12 },
  rod: { freq: 0.7, amp: 0.1 },
  spindle: { freq: 0.8, amp: 0.13 },
  amoeboid: { freq: 1.05, amp: 0.26 },
};

/** 形状中文名（教学标注备用） */
export const SHAPE_LABEL: Record<ShapeKind, string> = {
  polyhedral: '多边形',
  pyramidal: '锥体形',
  sphere: '球形',
  columnar: '柱状',
  rod: '杆状',
  spindle: '梭形',
  amoeboid: '不规则形',
};
