/**
 * 教学引导模式 —— 分步讲解经典信号级联
 * 每步聚焦一个分子：相机飞行 + 分子高亮 + 残基级科学注释
 * 数据来源: 手工策划级联（MAPK 等经典通路）+ 自动级联推导（其余通路回退）
 * 注释文本复用 NODE_NOTES / CURATED_EVENTS（分子级精确注释体系）
 */
import type { PathwayGraph, CoreNode, CoreEdge } from '@/types/kegg';
import { NODE_NOTES, getCuratedEvent, fallbackNote } from '@/lib/simulation/molecular-notes';
import { KIND_ZH, COMPARTMENT_ZH } from '@/lib/simulation/engine';

export interface TourStep {
  /** 聚焦分子（核心子图 node id） */
  nodeId: string;
  label: string;
  /** 站点标题（如「③ GEF 转位」） */
  title: string;
  /** 分子功能注释 */
  text: string;
  /** 与上一站的级联注释（残基级） */
  edgeNote?: string;
  /** 区室标签（如「细胞质 → 细胞核」） */
  phaseTag: string;
}

interface CuratedChain {
  /** 有序节点 id 序列 */
  chain: string[];
  /** 每站标题 */
  titles: string[];
}

/**
 * 手工策划的经典教学级联（标题 + 顺序经过教学设计审核）
 * MAPK: 生长因子 → 受体 → 接头 → GEF → 小 G 蛋白 → 三级激酶 → TF → 即早基因
 * PI3K-Akt: 生长因子 → RTK → 脂质激酶 → 脂信使 → 双磷酸化 → 代谢/存活/翻译（三条分支汇合）
 * JAK-STAT: 细胞因子 → 受体链 → Janus 激酶 → STAT 磷酸化二聚体入核 → 增殖基因 + 负反馈
 * cAMP: 肾上腺素 → GPCR → Gs → 腺苷酸环化酶 → 第二信使 → 双分支（PKA/EPAC）→ 即早基因
 * TGF-β: 配体 → 双受体接力磷酸化 → R-Smad/Co-Smad 入核 → 靶基因 + I-Smad 负反馈 + 受体降解
 * Wnt: 配体 → Fz/LRP 共受体 → DVL 信号体 → 破坏复合体解体 → β-cat 入核 → 增殖基因 + DKK1 拮抗闭环
 * Notch: 配体牵拉 → S2/S3 顺序切割 → NICD 入核 → CSL 开关 + MAML 共激活 → HES/HEY + Fringe 微调
 */
const CURATED_TOURS: Record<string, CuratedChain> = {
  hsa04010: {
    chain: ['EGF', 'EGFR', 'GRB2', 'SOS1', 'HRAS', 'RAF1', 'MAP2K1', 'MAPK1', 'ELK1', 'FOS'],
    titles: [
      '信号起点 · 配体扩散',
      '受体识别 · 二聚活化',
      '接头募集 · SH2 停靠',
      'GEF 转位 · 膜定位激活',
      'RAS 开关 · GTP 装载',
      'MAPKKK · 级联第一级',
      'MAPKK · 双特异性磷酸化',
      'MAPK · 终端效应激酶',
      '转录因子 · 入核磷酸化',
      '即早基因 · 转录应答',
    ],
  },
  hsa04151: {
    chain: ['IGF1', 'IGF1R', 'PIK3CA', 'cpd:C05981', 'PDPK1', 'AKT1', 'TSC2', 'RHEB', 'MTOR', 'RPS6KB1', 'EIF4EBP1'],
    titles: [
      '信号起点 · IGF-1 扩散',
      'RTK 识别 · IRS 接头平台',
      '脂质激酶 · PI3K 膜激活',
      '脂质第二信使 · PIP3 富集',
      'PDK1 · Thr308 引导磷酸化',
      'Akt · Ser473 完全激活',
      'TSC1/2 · GAP 抑制解除',
      'Rheb · GTP 态维持',
      'mTORC1 · 生长开关',
      'S6K1 · 核糖体亚基磷酸化',
      '4E-BP1 · 帽依赖翻译启动',
    ],
  },
  hsa04630: {
    chain: ['IL2', 'IL2RA', 'JAK1', 'STAT5A', 'MYC', 'BCL2L1', 'SOCS1', 'JAK1', 'STAT5A'],
    titles: [
      '信号起点 · IL-2 自分泌',
      '高亲和受体 · 三链组装',
      'Janus 激酶 · 交叉磷酸化',
      'STAT5 · Y694 磷酸化二聚体',
      '增殖基因 · c-myc 转录',
      '存活信号 · Bcl-xL 抗凋亡',
      '负反馈 · SOCS 诱导表达',
      '信号关闭 · JAK 泛素化',
      '回落 · STAT 信号重置',
    ],
  },
  hsa04024: {
    chain: ['EPI', 'ADRB2', 'GNAS', 'ADCY1', 'cpd:C00575', 'PRKACA', 'CREB1', 'FOS', 'RAPGEF3', 'RAP1A'],
    titles: [
      '信号起点 · 肾上腺素风暴',
      'GPCR 识别 · TM6 外旋',
      'Gs 蛋白 · 核苷酸交换',
      '腺苷酸环化酶 · ATP 环化',
      '第二信使 · cAMP 级联放大',
      'PKA · 催化亚基解离',
      'CREB · Ser133 磷酸化',
      '即早基因 · CRE 转录应答',
      'EPAC 支路 · 非激酶分支',
      'Rap1 · 整合素激活终点',
    ],
  },
  hsa04350: {
    chain: ['TGFB1', 'TGFBR2', 'TGFBR1', 'SMAD2', 'SMAD4', 'ID1', 'SMAD6', 'SMURF2'],
    titles: [
      '信号起点 · 潜伏态唤醒',
      'II 型受体 · 组成性激酶',
      'I 型受体 · GS 域接力',
      'R-Smad · SSXS 磷酸化',
      'Co-Smad · 异源三聚体入核',
      '靶基因 · 分化抑制应答',
      'I-Smad · 自诱导负反馈',
      '信号衰减 · 受体泛素化降解',
    ],
  },
  hsa04310: {
    chain: ['WNT3A', 'FZD1', 'LRP5', 'DVL1', 'AXIN1', 'GSK3B', 'CTNNB1', 'TCF7L2', 'CCND1', 'DKK1'],
    titles: [
      '信号起点 · 脂质化配体',
      'Frizzled · CRD 识别',
      '共受体 · signalosome 聚集',
      'Dishevelled · 信号体支架',
      '破坏复合体 · 解体',
      'GSK3β · 磷酸化降解停摆',
      'β-catenin · 免于降解入核',
      'TCF4 · 转录开关翻转',
      'Cyclin D1 · G1/S 增殖程序',
      '拮抗闭环 · DKK1 负反馈',
    ],
  },
  hsa04330: {
    chain: ['DLL1', 'NOTCH1', 'ADAM17', 'PSEN1', 'NCSTN', 'RBPJ', 'MAML1', 'HES1', 'HEY1', 'LFNG'],
    titles: [
      '信号起点 · 相邻细胞配体',
      '受体牵拉 · 变构暴露 S2',
      'S2 切割 · ADAM 金属蛋白酶',
      'S3 膜内切割 · γ-分泌酶催化',
      '底物递呈 · Nicastrin 门控',
      'NICD 入核 · CSL 转换开关',
      '共激活子 · MAML 包裹组装',
      'HES1 · bHLH 抑制子诱导',
      'HEY1 · 双臂抑制网络',
      '通路微调 · Fringe 糖基化',
    ],
  },
};

/** 手工策划链的补充文案（引导语，教育性 framing） */
const CURATED_INTROS: Record<string, string> = {
  hsa04010:
    '经典 RTK-RAS-ERK 级联：一次生长因子刺激如何在 10 站之内从细胞外抵达细胞核内的基因。',
  hsa04151:
    '细胞的“生长开关”：IGF-1 如何在 11 站内接力激活 PI3K-Akt-mTOR 轴，最终开启帽依赖翻译机器（丝氨酸/苏氨酸磷酸化全程）。',
  hsa04630:
    '免疫细胞的增殖指令：IL-2 自分泌信号 9 站往返——从细胞因子到 JAK-STAT5 核内转录，再经 SOCS 负反馈关闭（含信号重置）。',
  hsa04024:
    '最古老的第一信使系统：肾上腺素 → GPCR → Gs → cAMP 第二信使放大 1000 倍，经 PKA 与 EPAC 双分支抵达基因与粘附终点。',
  hsa04350:
    '上皮的“刹车信号”：TGF-β 经双受体接力磷酸化唤醒 R-Smad，8 站完成从细胞外到核内基因的旅程——末两站演示信号如何自我关闭（I-Smad 反馈 + 受体降解）。',
  hsa04310:
    '胚胎发育的核心开关：Wnt 如何在 10 站内“解散”破坏复合体、让 β-catenin 免于降解入核开启增殖程序——最后一站 DKK1 演示通路自带的外部关闭机制。',
  hsa04330:
    '不需要第二信使的捷径：Notch 信号经“配体牵拉 + 三次蛋白酶切割”直接释放转录因子入核——10 站看懂发育生物学最直接的细胞对话，末站揭示 Fringe 糖基化如何微调配体选择性。',
};

const EDGE_BIDIRECTIONAL = new Set(['binding', 'association']);

/** 邻居推导：信号下游（含 KGML 反向绘制的 binding 边） */
function downstream(nodeId: string, edges: CoreEdge[]): CoreEdge[] {
  const out: CoreEdge[] = [];
  for (const e of edges) {
    if (e.source === nodeId) out.push(e);
    else if (e.target === nodeId && EDGE_BIDIRECTIONAL.has(e.kind)) out.push(e);
  }
  return out;
}

function neighborOf(e: CoreEdge, id: string): string | null {
  if (e.source === id) return e.target;
  if (e.target === id) return e.source;
  return null;
}

/**
 * 自动推导级联（未手工策划的通路）:
 * 从首选配体出发贪心游走 —— 优先残基级策划注释边，其次层级递进，游走深度 ≤ 11
 */
function autoChain(graph: PathwayGraph): string[] {
  const nodes = graph.core.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = graph.core.edges;

  // 起点: 有下游连接的配体（tier 0）；无配体则从最高连接度的受体开始
  const ligands = nodes.filter((n) => n.tier === 0 && downstream(n.id, edges).length > 0);
  const receptors = nodes.filter((n) => n.tier === 1);
  let start: string | null = ligands[0]?.id ?? null;
  if (!start) {
    const bestRec = receptors
      .map((n) => ({ n, deg: downstream(n.id, edges).length }))
      .sort((a, b) => b.deg - a.deg)[0];
    start = bestRec?.n.id ?? null;
  }
  if (!start) return [];

  const chain: string[] = [start];
  const visited = new Set([start]);
  let cur = start;
  while (chain.length < 11) {
    const nexts = downstream(cur, edges)
      .map((e) => neighborOf(e, cur))
      .filter((id): id is string => !!id && !visited.has(id));
    if (nexts.length === 0) break;
    const curTier = byId.get(cur)?.tier ?? 0;
    const scored = nexts.map((id) => {
      const n = byId.get(id);
      if (!n) return { id, s: -1 };
      let s = 0;
      if (getCuratedEvent(cur, id) || getCuratedEvent(id, cur)) s += 6;
      if (n.tier === curTier + 1) s += 4;
      else if (n.tier > curTier) s += 2;
      if (n.kind === 'tf' || n.kind === 'gene') s += 1;
      return { id, s };
    });
    scored.sort((a, b) => b.s - a.s);
    // 终点: 到达靶基因（tier 6）后停止
    const nxt = scored[0].id;
    chain.push(nxt);
    visited.add(nxt);
    cur = nxt;
    if ((byId.get(nxt)?.tier ?? 0) >= 6) break;
  }
  return chain;
}

/** 构建教学引导步骤序列（同分子复现站去重: 保留首次出现） */
export function buildGuidedTour(graph: PathwayGraph): TourStep[] {
  const curated = CURATED_TOURS[graph.meta.id];
  const rawChain = curated ? curated.chain.filter((id) => graph.core.nodes.some((n) => n.id === id)) : autoChain(graph);
  // 同分子复现（如 JAK-STAT 负反馈环）: 只保留首次出现，避免引导卡重复跳转
  const chain: string[] = [];
  for (const id of rawChain) {
    if (!chain.includes(id)) chain.push(id);
  }
  if (chain.length === 0) return [];

  const byId = new Map(graph.core.nodes.map((n) => [n.id, n]));
  const roman = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];
  const steps: TourStep[] = [];

  // 标题跟随去重后的链（同站复现时沿用原策划标题）
  const titleAt = new Map<string, string>();
  if (curated) {
    curated.chain.forEach((id, i) => {
      if (!titleAt.has(id) && curated.titles[i]) titleAt.set(id, curated.titles[i]);
    });
  }

  chain.forEach((id, i) => {
    const node = byId.get(id);
    if (!node) return;
    const prev = i > 0 ? byId.get(chain[i - 1]) : null;
    const text =
      NODE_NOTES[id] ?? NODE_NOTES[node.label] ??
      fallbackNote(node.label, KIND_ZH[node.kind] ?? '分子', COMPARTMENT_ZH[node.compartment] ?? '细胞');
    let edgeNote: string | undefined;
    if (prev) {
      edgeNote =
        getCuratedEvent(prev.id, id) ??
        getCuratedEvent(id, prev.id) ??
        getCuratedEvent(prev.label, node.label) ??
        getCuratedEvent(node.label, prev.label);
    }
    steps.push({
      nodeId: id,
      label: node.label,
      title: titleAt.get(id) ?? `${roman[i] ?? ''} ${node.label} · ${KIND_ZH[node.kind] ?? '分子'}`,
      text,
      edgeNote,
      phaseTag: `${COMPARTMENT_ZH[node.compartment] ?? '细胞'} · 层级 L${node.tier}`,
    });
  });
  return steps;
}

/** 引导模式开场语（引导教学 framing） */
export function tourIntro(graph: PathwayGraph, stepCount: number): string {
  return (
    CURATED_INTROS[graph.meta.id] ??
    `${graph.meta.nameZh}：沿主信号流逐站讲解，共 ${stepCount} 站（自动推导级联，注释来自 KEGG 关系语义与策划注释库）。`
  );
}
