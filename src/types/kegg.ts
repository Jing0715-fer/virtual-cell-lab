/**
 * 共享数据契约 —— KEGG 通路图 / 虚拟细胞模拟
 * 前后端共同依赖的类型定义（契约文件，修改需同步两端）
 */

/** 细胞区室（分子定位） */
export type Compartment =
  | 'extracellular' // 细胞外（配体）
  | 'membrane' // 细胞膜（受体/通道）
  | 'cytoplasm' // 细胞质（激酶/接头蛋白/第二信使）
  | 'nucleus'; // 细胞核（转录因子/靶基因）

/** 分子功能类别 */
export type MoleculeKind =
  | 'ligand' // 配体（生长因子/细胞因子）
  | 'receptor' // 受体（RTK / GPCR / 细胞因子受体）
  | 'kinase' // 激酶
  | 'phosphatase' // 磷酸酶
  | 'adapter' // 接头蛋白
  | 'gtpase' // 小 G 蛋白
  | 'tf' // 转录因子
  | 'gene' // 靶基因（表达产物）
  | 'compound' // 第二信使 / 化合物（cAMP, Ca2+, DAG…）
  | 'channel' // 离子通道
  | 'enzyme'; // 其他酶

/** 通路元数据（目录层） */
export interface PathwayMeta {
  id: string; // "hsa04010"
  name: string; // "MAPK signaling pathway"
  nameZh: string; // "MAPK 信号通路"
  category: string; // 分类（中文）
  description: string; // 专业描述
  cascade: string; // 核心级联摘要 "EGF → EGFR → GRB2/SOS → RAS → RAF → MEK → ERK"
  keggLink: string;
}

/** KGML 原始 entry（用于通路图谱视图的完整节点集） */
export interface KeggEntry {
  entryId: number; // KGML entry id
  keggIds: string[]; // ["hsa:5594", ...] 或 ["cpd:C00338"]
  type: 'gene' | 'compound' | 'map' | 'group' | 'ortholog' | 'enzyme';
  label: string; // 主显示名 "MAPK1"
  aliases: string[]; // ["ERK2", "PRKM1"]
  shape: string; // rectangle | circle | roundrect | line
  x: number; // KGML 坐标（通路图谱视图布局）
  y: number;
  w: number;
  h: number;
}

/** 信号边类型（由 KGML relation/subtype 映射） */
export type EdgeKind =
  | 'activation' // 激活 -->
  | 'inhibition' // 抑制 --|
  | 'phosphorylation' // 磷酸化 +p
  | 'dephosphorylation' // 去磷酸化 -p
  | 'expression' // 转录表达 (GErel)
  | 'repression' // 转录抑制
  | 'binding' // 结合/关联
  | 'dissociation' // 解离
  | 'indirect' // 间接效应
  | 'missing' // 缺失互作
  | 'state-change'; // 状态变化

/** KGML 原始 relation */
export interface KeggRelation {
  entry1: number;
  entry2: number;
  type: string; // PPrel | GErel | ECrel | PCrel | maplink
  subtypes: { name: string; value: string }[];
}

/** 细胞视图核心节点（精选子图，用于虚拟细胞演示） */
export interface CoreNode {
  id: string; // 稳定 id：基因符号（如 "MAPK1"）或 "e{entryId}"（无基因名时）
  entryId: number; // 对应 KGML entry id；合成配体为 -1
  keggIds: string[]; // ["hsa:5594"]（合成配体为 []）
  label: string; // 显示名
  aliases: string[];
  kind: MoleculeKind;
  compartment: Compartment;
  tier: number; // 信号层级：0 配体 → 1 受体 → 2~4 胞质级联 → 5 转录因子 → 6 靶基因
  synthetic?: boolean; // 合成节点（人工补充的配体等）
  x?: number; // KGML 坐标（图谱视图用）
  y?: number;
  w?: number;
  h?: number;
}

/** 细胞视图核心边 */
export interface CoreEdge {
  id: string;
  source: string; // CoreNode.id
  target: string; // CoreNode.id
  kind: EdgeKind;
  subtypes: { name: string; value: string }[]; // 保留原始 subtype 信息
}

/** 完整通路图（API 响应体） */
export interface PathwayGraph {
  meta: PathwayMeta;
  nodes: KeggEntry[]; // KGML 全部 entry（通路图谱视图）
  relations: KeggRelation[]; // KGML 全部 relation
  core: { nodes: CoreNode[]; edges: CoreEdge[] }; // 核心演示子图（虚拟细胞视图）
  stats: { geneCount: number; relationCount: number; coreCount: number };
  fetchedAt: string;
  source: 'kegg-live' | 'db-cache';
}

/** 通路目录条目（前端本地静态数据，无需请求） */
export interface PathwayCatalogEntry {
  id: string;
  name: string;
  nameZh: string;
  category: string;
  description: string;
  cascade: string;
  /** 核心子图提取的种子基因（符号优先匹配 label/aliases） */
  seeds: string[];
  /** 合成配体（KEGG 图谱中未作为节点出现的配体，如肾上腺素） */
  syntheticLigands?: { symbol: string; fullName: string; receptor: string }[];
}
