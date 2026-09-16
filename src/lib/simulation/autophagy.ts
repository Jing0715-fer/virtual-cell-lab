/**
 * 自噬信号读数 —— 3D 自噬流演示的驱动信号
 *
 * 生物学: ULK1（Unc-51 样激酶 1）复合体是自噬启动的核心 ——
 *   营养充足时 mTORC1 磷酸化 ULK1 Ser758 抑制其活性;
 *   饥饿/能量匮乏时 AMPK 磷酸化 ULK1 Ser317/Ser777 激活（同时解除 mTORC1 抑制）
 *   → ULK1 → 隔离膜（phagophore）成核延伸 → 自噬体 → 溶酶体融合（自溶酶体）
 *
 * 引擎对接: mTOR 通路（hsa04150）含 ULK1 节点; 其活性 0-1 即自噬驱动水平。
 * 同名合并节点形如 "ULK1#2"（id 前缀匹配）。
 */
import type { SimNodeState } from './engine';

/** 自噬驱动水平: ULK1 家族（含 # 合并后缀）节点最大活性 0–1（无 ULK1 的通路恒为 0） */
export function autophagyLevel(nodeStates: Record<string, SimNodeState>): number {
  let lv = 0;
  for (const id in nodeStates) {
    if (id.length >= 4 && id.toUpperCase().startsWith('ULK1')) {
      const a = nodeStates[id].activity;
      if (a > lv) lv = a;
    }
  }
  return lv;
}

/** 自噬演示可见阈值（活性超过即显示自噬体结构/标注） */
export const AUTOPHAGY_VISIBLE_THRESHOLD = 0.4;
