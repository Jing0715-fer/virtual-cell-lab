/**
 * 突变节点同族等价解析
 * 背景: KEGG 核心子图常以一个经典成员代表整族（MAPK 图用 HRAS 代表 RAS 家族），
 * 导致癌细胞系的 KRAS G12D 突变在子图中无节点可挂 —— 信号演示丢失"组成性激活"表型。
 * 生物学依据: 突变位点（如 G12/V600E）所在催化机制在同族成员间保守，等位效应可
 * 在经典成员上忠实演示；解析时在 note 中保留映射说明以维持科学透明度。
 */
import type { CoreNode } from '@/types/kegg';
import type { MutationSpec } from './engine';

export interface RawMutation {
  node: string;
  effect: 'constitutive' | 'knockout' | 'overexpress' | string;
  note: string;
}

/** 同族等价表（优先级顺序） */
const MUTATION_EQUIV: Record<string, string[]> = {
  // RAS 小 GTP酶家族（G12/G13/Q61 位点效应保守）
  KRAS: ['HRAS', 'NRAS', 'RRAS'],
  NRAS: ['HRAS', 'KRAS', 'RRAS'],
  HRAS: ['KRAS', 'NRAS', 'RRAS'],
  // RAF 激酶家族
  BRAF: ['RAF1', 'ARAF'],
  RAF1: ['BRAF', 'ARAF'],
  // PI3K 催化亚基家族
  PIK3CA: ['PIK3CB', 'PIK3CD', 'PIK3CG'],
  // PI3K 负调控（PTEN 缺失 → 用任一 PI3K 成员的激活表型近似演示）
  PTEN: ['PIK3CA', 'PIK3CB'],
  // p53 家族
  TP53: ['TP63', 'TP73'],
  // PI3K p85 调节亚基缺失 → p110 去抑制
  PIK3R1: ['PIK3CA'],
};

/**
 * 解析细胞系突变到核心子图节点
 * 1. 精确命中直接采用
 * 2. 否则按同族等价表回退（note 追加映射说明）
 */
export function resolveMutations(mutations: RawMutation[], nodes: CoreNode[]): MutationSpec[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const labelToId = new Map(nodes.map((n) => [n.label, n.id]));
  const out: MutationSpec[] = [];
  for (const m of mutations) {
    if (nodeIds.has(m.node)) {
      out.push({ node: m.node, effect: m.effect as MutationSpec['effect'], note: m.note });
      continue;
    }
    // label 命中（KEGG 符号即 label 的场景）
    const byLabel = labelToId.get(m.node);
    if (byLabel) {
      out.push({ node: byLabel, effect: m.effect as MutationSpec['effect'], note: m.note });
      continue;
    }
    // 同族等价回退
    const equiv = (MUTATION_EQUIV[m.node] ?? []).find((e) => nodeIds.has(e) || labelToId.has(e));
    if (equiv) {
      const resolvedId = nodeIds.has(equiv) ? equiv : labelToId.get(equiv)!;
      const label = nodes.find((n) => n.id === resolvedId)?.label ?? equiv;
      out.push({
        node: resolvedId,
        effect: m.effect as MutationSpec['effect'],
        note: `${m.note}（演示映射 ${m.node}→${label}：同族等位效应保守）`,
      });
    }
  }
  return out;
}
