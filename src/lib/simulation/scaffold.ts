/**
 * 信号支架边 —— 补全 KEGG KGML 绘图语义造成的核心级联断链
 * （如 MAPK 通路中 ELK1→c-FOS 转录调控在 KEGG 由匿名复合体节点表示）
 * 仅当两端节点均存在于核心子图且该边缺失时添加，保证科学性。
 */
import type { CoreEdge, CoreNode, EdgeKind } from '@/types/kegg';

export interface ScaffoldSpec {
  source: string; // 基因符号（按 label 匹配）
  target: string;
  kind: EdgeKind;
  /** 多个同名节点时，优先选择拥有来自这些符号的入边的那个 */
  from?: string[];
}

export const SCAFFOLD_EDGES: Record<string, ScaffoldSpec[]> = {
  hsa04010: [
    { source: 'ELK1', target: 'FOS', kind: 'expression', from: ['MAPK1', 'MAPK3', 'MAPK8', 'MAPK14'] },
    { source: 'FOS', target: 'JUN', kind: 'binding' },
  ],
  hsa04630: [
    { source: 'STAT5A', target: 'SOCS1', kind: 'expression' },
    // JAK1 与 IL-2 受体链胞内区预结合（box1/box2 基序）—— 受体二聚 → JAK1 交叉自磷酸化
    { source: 'IL2RA', target: 'JAK1', kind: 'activation' },
    // JAK1 磷酸化 STAT5A Tyr694 → SH2 交叉结合二聚化 → 入核（KGML 绘制丢失）
    { source: 'JAK1', target: 'STAT5A', kind: 'phosphorylation' },
  ],
  hsa04024: [
    { source: 'CREB1', target: 'FOS', kind: 'expression' },
    // β2-肾上腺素能受体（合成配体 EPI 的靶受体）与 Gs 蛋白耦联 —— 子图仅保留了 ADRB1→GNAS 同源边
    { source: 'ADRB2', target: 'GNAS', kind: 'activation' },
  ],
  hsa04151: [
    // IGF1R 自磷酸化 → IRS 接头停靠 → PI3K p85 SH2 募集（KEGG 经匿名复合体节点绘制，提取时丢失）
    { source: 'IGF1R', target: 'PIK3CA', kind: 'activation' },
  ],
  hsa04310: [
    // Frizzled 招募 Dishevelled（KEGG 以 indirect 关系绘制；重复 entry 提取后部分 FZD1 实例缺失出边）
    { source: 'FZD1', target: 'DVL1', kind: 'indirect' },
  ],
  hsa04020: [
    // Ca²⁺ 协同结合钙调蛋白 4 个 EF-hand（KGML 将 CaM 绘制为指向 Ca²⁺ 的间接效应，
    // 方向与生化因果相反 —— 钙是 CaM 的输入而非输出）→ 解码 Ca²⁺ 信号至 CaMKII/Calcineurin
    // 注：化合物节点 id 带 cpd: 前缀，裸 cpd id 匹配不到节点（历史静默失效，v6 修正）
    { source: 'cpd:C00076', target: 'CALM1', kind: 'binding' },
  ],
  hsa04210: [
    // tBid（BH3-only）直接变构激活 BAX/BAK：α6 螺旋插入线粒体外膜 + 寡聚成孔
    // （外源凋亡与内源凋亡在 tBid 汇合 —— 教科书级汇流点，KGML 绘制丢失）
    { source: 'BID', target: 'BAX', kind: 'activation' },
    { source: 'BID', target: 'BAK1', kind: 'activation' },
    // MOMP：BAX/BAK 脂质孔释放细胞色素 c（KGML 将 CYCS 绘制为无入边的源节点）
    { source: 'BAX', target: 'CYCS', kind: 'activation' },
    { source: 'BAK1', target: 'CYCS', kind: 'activation' },
  ],
  hsa04350: [
    // TGF-β 家族经典激活：II 型受体（组成性激酶）磷酸化 I 型受体 GS 域（KEGG 绘制丢失）
    { source: 'TGFBR2', target: 'TGFBR1', kind: 'phosphorylation' },
    { source: 'ACVR2A', target: 'ACVR1', kind: 'phosphorylation' },
  ],
  hsa04071: [
    // 鞘磷脂酶水解释放神经酰胺：SMPD1（酸性 SMase，TNF/Fas 通路）与 SMPD2（中性
    // SMase，NSMAF 激活）催化鞘磷脂 → 神经酰胺（KEGG 将 Ceramide 绘制为无生产
    // 边的源节点，方向与生化因果相反）
    { source: 'SMPD1', target: 'cpd:C00195', kind: 'activation' },
    { source: 'SMPD2', target: 'cpd:C00195', kind: 'activation' },
  ],
};

/** 为核心子图附加支架边（返回新数组，不修改原图） */
export function applyScaffoldEdges(
  pathwayId: string,
  nodes: CoreNode[],
  edges: CoreEdge[],
): CoreEdge[] {
  const specs = SCAFFOLD_EDGES[pathwayId];
  if (!specs || specs.length === 0) return edges;

  const hasEdge = (s: string, t: string, kind: EdgeKind) =>
    edges.some((e) => e.source === s && e.target === t && e.kind === kind) ||
    edges.some((e) => e.source === t && e.target === s && (e.kind === 'binding' || e.kind === kind));

  const labelOf = new Map(nodes.map((n) => [n.id, n.label]));
  /** 节点匹配：label / id 精确 / id 去重后缀（同 label 多副本合并产生的 #entryId 尾缀） */
  const matchNode = (n: CoreNode, label: string): boolean =>
    n.label === label || n.id === label || n.id.split('#')[0] === label;
  const pick = (label: string, from?: string[]): CoreNode | undefined => {
    const candidates = nodes.filter((n) => matchNode(n, label));
    if (candidates.length <= 1) return candidates[0];
    if (from?.length) {
      const preferred = candidates.find((c) =>
        edges.some(
          (e) =>
            e.target === c.id &&
            from.includes(labelOf.get(e.source) ?? ''),
        ),
      );
      if (preferred) return preferred;
    }
    return candidates[0];
  };

  const added: CoreEdge[] = [];
  for (const spec of specs) {
    const s = pick(spec.source, spec.from);
    const t = pick(spec.target);
    if (!s || !t) continue;
    if (hasEdge(s.id, t.id, spec.kind)) continue;
    added.push({
      id: `scaffold-${s.id}-${t.id}`,
      source: s.id,
      target: t.id,
      kind: spec.kind,
      subtypes:
        spec.kind === 'expression'
          ? [{ name: 'expression', value: '==>' }]
          : [{ name: 'binding/association', value: '---' }],
    });
  }
  return added.length ? [...edges, ...added] : edges;
}
