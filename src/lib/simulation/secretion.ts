/**
 * 分泌驱动信号 —— TGN→质膜 组成型分泌流的速率调制（v36）
 *
 * 生物学: 生长/分泌信号（RTK→RAS→MAPK、PI3K→mTOR 等）激活时全局翻译与
 *   蛋白合成上调 → ER→高尔基→质膜的内吞-分泌循环通量增强;
 *   配体撤除/药物阻断后信号回落 → 分泌回到基础组成型速率。
 *
 * 引擎对接: 全图已激活节点的平均活性（0-1）。静息态（无配体）≈0 → 基础速率;
 *   级联点亮 → 趋近 1 → 巡航加速 + 拖尾增亮（「信号→分泌增强」教学叙事）。
 */
import type { SimNodeState } from './engine';

/** 分泌驱动水平: 已激活节点平均活性 0–1（放大 1.9 使少数节点激活即有可读变化; 无激活恒 0） */
export function secretionLevel(nodeStates: Record<string, SimNodeState>): number {
  let sum = 0;
  let n = 0;
  for (const id in nodeStates) {
    const s = nodeStates[id];
    if (s.activated) {
      sum += s.activity;
      n++;
    }
  }
  if (n === 0) return 0;
  return Math.min(1, (sum / n) * 1.9);
}
