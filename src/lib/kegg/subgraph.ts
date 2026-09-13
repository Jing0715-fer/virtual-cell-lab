/**
 * 核心演示子图提取算法
 *
 * 从 KGML 全图（数百节点）中提取适合虚拟细胞演示的精简子图（28~42 节点）：
 *   1. 种子匹配 —— catalogEntry.seeds 命中 label / aliases（不足 15 个时按
 *      relation 度数补齐，避免孤岛节点；超过上限时按度数截断保留 hub）
 *   2. 邻接扩展 —— 从种子沿 relation 双向 BFS 1 层（信号关键关系与
 *      ligand/receptor/tf 类别加权），低联通时自动加深一层
 *   3. 合成配体 —— catalogEntry.syntheticLigands 注入 KEGG 图中缺失的
 *      配体（如 cAMP 通路的肾上腺素），receptor 不在图中时一并合成
 *   4. 边生成 —— KGML relation → CoreEdge（EdgeKind 映射 + group 重定向）
 *   5. tier 修正 —— GErel expression/repression 目标上调为靶基因（tier 6）
 *   6. 清理 —— 剔除度为 0 的非配体节点
 */

import type {
  CoreEdge,
  CoreNode,
  EdgeKind,
  KeggEntry,
  KeggRelation,
  PathwayCatalogEntry,
} from '@/types/kegg';
import { applyExpressionTargets, classifyEntry } from './classify';
import type { KeggComponent } from './kgml-parser';

/** 节点数目标区间（任务契约：28~42，低于 28 可接受） */
const EXPAND_TARGET = 34;
const SEED_LIMIT = 38;
const HARD_LIMIT = 42;
/** 种子最少期望数（不足时按度数补齐） */
const MIN_SEEDS = 15;

/** 种子配体补全上限（seeds 中配体类符号图中缺失时最多合成数量） */
const MAX_SEED_LIGANDS = 2;

/**
 * 常见配体 → 受体亲和表（用于合成配体时寻找科学正确的结合靶点）
 * 仅在 KEGG 图中缺失配体且存在明确受体时才注入合成节点
 */
const LIGAND_RECEPTORS: Record<string, string[]> = {
  EGF: ['EGFR', 'ERBB1'],
  TGFA: ['EGFR'],
  AREG: ['EGFR'],
  EREG: ['EGFR'],
  HBEGF: ['EGFR'],
  TGFB1: ['TGFBR1', 'TGFBR2'],
  TGFB2: ['TGFBR2', 'TGFBR1'],
  TGFB3: ['TGFBR1'],
  IGF1: ['IGF1R'],
  IGF2: ['IGF1R'],
  INS: ['INSR'],
  FGF2: ['FGFR1', 'FGFR2'],
  WNT1: ['FZD1'],
  WNT3A: ['FZD7', 'LRP6', 'FZD1'],
  WNT5A: ['ROR2'],
  DLL1: ['NOTCH1'],
  DLL3: ['NOTCH1'],
  DLL4: ['NOTCH2', 'NOTCH1'],
  JAG1: ['NOTCH1'],
  JAG2: ['NOTCH2'],
  IL2: ['IL2RB', 'IL2RA'],
  IL3: ['IL3RA'],
  IL6: ['IL6R'],
  IFNG: ['IFNGR1'],
  IFNA1: ['IFNAR1'],
  EPO: ['EPOR'],
  GH1: ['GHR'],
  TNF: ['TNFRSF1A'],
  FASLG: ['FAS'],
  HGF: ['MET'],
  VEGFA: ['KDR', 'VEGFR2'],
  PDGFA: ['PDGFRA'],
  PDGFB: ['PDGFRB'],
  BMP2: ['BMPR1A'],
  BMP4: ['BMPR1A'],
  INHBA: ['ACVR2A'],
  NRG1: ['ERBB3', 'ERBB4'],
};

/** entry 的候选符号集（label + aliases，大写） */
function symbolsOf(e: KeggEntry): string[] {
  return [e.label, ...e.aliases]
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
}

/** entry 是否匹配给定符号（精确相等） */
function matchesSymbol(e: KeggEntry, symbol: string): boolean {
  const target = symbol.trim().toUpperCase();
  return symbolsOf(e).includes(target);
}

/** KGML relation subtype 名集合中是否含指定 subtype */
function hasSubtype(r: KeggRelation, name: string): boolean {
  return r.subtypes.some((s) => s.name === name);
}

/** EdgeKind 映射（按 subtype 优先级） */
function mapEdgeKind(r: KeggRelation): EdgeKind {
  if (hasSubtype(r, 'inhibition')) return 'inhibition';
  if (r.type === 'GErel' && hasSubtype(r, 'expression')) return 'expression';
  if (r.type === 'GErel' && hasSubtype(r, 'repression')) return 'repression';
  if (hasSubtype(r, 'phosphorylation')) return 'phosphorylation';
  if (hasSubtype(r, 'dephosphorylation')) return 'dephosphorylation';
  if (hasSubtype(r, 'activation')) return 'activation';
  if (hasSubtype(r, 'binding/association')) return 'binding';
  if (hasSubtype(r, 'dissociation')) return 'dissociation';
  if (hasSubtype(r, 'indirect effect')) return 'indirect';
  if (hasSubtype(r, 'missing interaction')) return 'missing';
  if (hasSubtype(r, 'state change')) return 'state-change';
  // ECrel 经中间化合物连接两个酶 → 间接效应
  if (hasSubtype(r, 'compound')) return 'indirect';
  // 无 subtype：PPrel/ECrel 默认激活，其他默认间接
  if (r.subtypes.length === 0 && (r.type === 'PPrel' || r.type === 'ECrel')) return 'activation';
  return 'indirect';
}

/**
 * 提取核心演示子图
 * @param entries KGML 全部 entry
 * @param relations KGML 全部 relation
 * @param catalogEntry 通路目录条目（seeds / syntheticLigands）
 * @param components group 复合物成员映射（KGML 解析产物，用于 relation 的 group 重定向）
 */
export function extractCoreSubgraph(
  entries: KeggEntry[],
  relations: KeggRelation[],
  catalogEntry: PathwayCatalogEntry,
  components: KeggComponent[] = []
): { nodes: CoreNode[]; edges: CoreEdge[] } {
  // ---------- 索引 ----------
  const entryById = new Map(entries.map((e) => [e.entryId, e]));
  const groupMembers = new Map(components.map((c) => [c.groupId, c.memberIds]));

  /** relation 端点解析：group → 成员列表；普通 entry → [id] */
  const resolveEndpoint = (entryId: number): number[] => {
    if (groupMembers.has(entryId)) return groupMembers.get(entryId)!;
    return [entryId];
  };

  // 双向邻接表与度数（基于端点解析后的展开关系）
  const adjacency = new Map<number, Set<number>>();
  const degree = new Map<number, number>();
  const bumpDegree = (id: number) => degree.set(id, (degree.get(id) ?? 0) + 1);

  /** 端点展开后的关系列表（用于打分与边生成） */
  const flatRelations: { src: number; dst: number; rel: KeggRelation }[] = [];
  for (const r of relations) {
    for (const a of resolveEndpoint(r.entry1)) {
      for (const b of resolveEndpoint(r.entry2)) {
        if (a === b) continue;
        flatRelations.push({ src: a, dst: b, rel: r });
        if (!adjacency.has(a)) adjacency.set(a, new Set());
        adjacency.get(a)!.add(b);
        if (!adjacency.has(b)) adjacency.set(b, new Set());
        adjacency.get(b)!.add(a);
        bumpDegree(a);
        bumpDegree(b);
      }
    }
  }

  /** entry 可否入选核心子图 */
  const selectable = (e: KeggEntry | undefined): e is KeggEntry =>
    !!e && e.type !== 'map' && e.type !== 'group';

  // ---------- 1. 种子匹配 ----------
  const seedsUpper = new Set(catalogEntry.seeds.map((s) => s.toUpperCase()));
  const seedEntries = entries.filter(
    (e) => selectable(e) && symbolsOf(e).some((s) => seedsUpper.has(s))
  );

  // 种子不足：按度数补齐非种子高连接节点
  const selected = new Set<number>(seedEntries.map((e) => e.entryId));
  if (seedEntries.length < MIN_SEEDS) {
    const filler = entries
      .filter((e) => selectable(e) && !selected.has(e.entryId))
      .sort((a, b) => (degree.get(b.entryId) ?? 0) - (degree.get(a.entryId) ?? 0));
    for (const e of filler) {
      if (selected.size >= MIN_SEEDS) break;
      selected.add(e.entryId);
    }
  } else if (seedEntries.length > SEED_LIMIT) {
    // 种子过多：按度数截断保留 hub（同度数保持 KGML 出现顺序）
    const ranked = [...seedEntries].sort(
      (a, b) =>
        (degree.get(b.entryId) ?? 0) - (degree.get(a.entryId) ?? 0) ||
        a.entryId - b.entryId
    );
    selected.clear();
    for (const e of ranked.slice(0, SEED_LIMIT)) selected.add(e.entryId);
  }

  // ---------- 2. 邻接扩展（BFS 1 层，低联通时加深一层） ----------
  const nodeClassCache = new Map<number, ReturnType<typeof classifyEntry>>();
  const classOf = (e: KeggEntry) => {
    if (!nodeClassCache.has(e.entryId)) nodeClassCache.set(e.entryId, classifyEntry(e));
    return nodeClassCache.get(e.entryId)!;
  };

  /** 与已选节点发生激活/磷酸化/表达关系 → 加分 */
  const relationBonus = (entryId: number): number => {
    let bonus = 0;
    for (const { src, dst, rel } of flatRelations) {
      if (src !== entryId && dst !== entryId) continue;
      const other = src === entryId ? dst : src;
      if (!selected.has(other)) continue;
      if (
        hasSubtype(rel, 'activation') ||
        hasSubtype(rel, 'phosphorylation') ||
        hasSubtype(rel, 'expression')
      ) {
        bonus += 3;
      }
    }
    return bonus;
  };

  const expandOnce = (): number => {
    const candidateScores = new Map<number, number>();
    for (const id of selected) {
      for (const nb of adjacency.get(id) ?? []) {
        if (selected.has(nb) || candidateScores.has(nb)) continue;
        const e = entryById.get(nb);
        if (!selectable(e)) continue;
        const cls = classOf(e);
        let score = (degree.get(nb) ?? 0) * 2;
        if (cls.kind === 'ligand' || cls.kind === 'receptor' || cls.kind === 'tf' || cls.kind === 'channel') {
          score += 8;
        } else if (cls.kind === 'kinase' || cls.kind === 'gtpase' || cls.kind === 'adapter') {
          score += 4;
        }
        score += relationBonus(nb);
        candidateScores.set(nb, score);
      }
    }
    if (candidateScores.size === 0) return 0;
    const ranked = [...candidateScores.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .map(([id]) => id);
    let added = 0;
    for (const id of ranked) {
      if (selected.size >= EXPAND_TARGET) break;
      selected.add(id);
      added++;
    }
    return added;
  };

  expandOnce();
  // 通路 relation 稀疏时（1 层不足）自动再扩一层
  if (selected.size < EXPAND_TARGET - 6) expandOnce();

  // ---------- 3~4. 节点构造（id 唯一化） ----------
  const usedIds = new Set<string>();
  const idByEntry = new Map<number, string>();
  const nodes: CoreNode[] = [];

  /** 为 entry 分配稳定唯一 id（label 优先 / compound 用 cpd: 前缀 / 兜底 e{entryId}） */
  const assignEntryId = (e: KeggEntry): string | null => {
    if (idByEntry.has(e.entryId)) return idByEntry.get(e.entryId)!;
    let id: string;
    if (e.type === 'compound') {
      const cpd = e.keggIds[0] && e.keggIds[0].startsWith('cpd:') ? e.keggIds[0] : `cpd:${e.label}`;
      id = cpd;
    } else if (e.label && e.label.trim().length > 0 && !usedIds.has(e.label)) {
      id = e.label;
    } else {
      id = `e${e.entryId}`;
    }
    // 撞名兜底（大小写不敏感地避免 EPI / epi 之类的冲突）
    let final = id;
    while (usedIds.has(final)) final = `${id}#${e.entryId}`;
    usedIds.add(final);
    idByEntry.set(e.entryId, final);
    return final;
  };

  /** 把 entry 转为 CoreNode（含 KGML 坐标） */
  const toCoreNode = (e: KeggEntry): CoreNode => {
    const id = assignEntryId(e)!;
    const cls = classOf(e);
    return {
      id,
      entryId: e.entryId,
      keggIds: e.keggIds,
      label: e.label || id,
      aliases: e.aliases,
      kind: cls.kind,
      compartment: cls.compartment,
      tier: cls.tier,
      x: e.x,
      y: e.y,
      w: e.w,
      h: e.h,
    };
  };

  // ---------- 合成配体注入 ----------
  const syntheticLigandNodes: CoreNode[] = [];
  const syntheticEdges: CoreEdge[] = [];
  let synthEdgeIdx = 0;

  /** 按 label/alias 精确查找符号对应的 entry（不限选中集） */
  const findBySymbol = (symbol: string): KeggEntry | undefined =>
    entries.find((e) => selectable(e) && matchesSymbol(e, symbol));

  const allEdges: CoreEdge[] = [];

  // ---------- 主流程：构造节点 ----------
  const selectedEntries: KeggEntry[] = [];
  for (const id of selected) {
    const e = entryById.get(id);
    if (e && selectable(e)) selectedEntries.push(e);
  }
  // 保持 KGML 顺序稳定
  selectedEntries.sort((a, b) => a.entryId - b.entryId);
  nodes.push(...selectedEntries.map(toCoreNode));

  // ---------- 5. 边生成（双端都在选中集合 → CoreEdge） ----------
  let edgeIdx = 0;
  for (const { src, dst, rel } of flatRelations) {
    if (!selected.has(src) || !selected.has(dst)) continue;
    const srcId = idByEntry.get(src);
    const dstId = idByEntry.get(dst);
    if (!srcId || !dstId || srcId === dstId) continue;
    allEdges.push({
      id: `ce${edgeIdx++}`,
      source: srcId,
      target: dstId,
      kind: mapEdgeKind(rel),
      subtypes: rel.subtypes,
    });
  }

  // ---------- 合成配体（KGML 图谱中缺失的配体，如肾上腺素） ----------
  for (const ligand of catalogEntry.syntheticLigands ?? []) {
    // 合成配体节点
    let ligandId = ligand.symbol;
    while (usedIds.has(ligandId)) ligandId = `${ligand.symbol}-L`;
    usedIds.add(ligandId);

    // receptor 匹配：已选节点 → 全图节点（拉入子图）→ 合成 receptor
    let receptorId: string | null = null;
    const receptorEntry = findBySymbol(ligand.receptor);
    if (receptorEntry && selected.has(receptorEntry.entryId)) {
      receptorId = idByEntry.get(receptorEntry.entryId) ?? null;
    } else if (receptorEntry) {
      // receptor 在图中但未入选 → 拉入子图
      if (nodes.length < HARD_LIMIT) {
        const n = toCoreNode(receptorEntry);
        nodes.push(n);
        selected.add(receptorEntry.entryId);
        receptorId = n.id;
      }
    }
    if (!receptorId) {
      // receptor 完全不在 KEGG 图中（如 cAMP 通路无 ADRB2 节点）→ 合成受体
      let rid = ligand.receptor;
      while (usedIds.has(rid)) rid = `${ligand.receptor}-R`;
      usedIds.add(rid);
      nodes.push({
        id: rid,
        entryId: -1,
        keggIds: [],
        label: ligand.receptor,
        aliases: [],
        kind: 'receptor',
        compartment: 'membrane',
        tier: 1,
        synthetic: true,
      });
      receptorId = rid;
    }

    syntheticLigandNodes.push({
      id: ligandId,
      entryId: -1,
      keggIds: [],
      label: ligand.symbol,
      aliases: [ligand.fullName],
      kind: 'ligand',
      compartment: 'extracellular',
      tier: 0,
      synthetic: true,
    });

    syntheticEdges.push({
      id: `syn${synthEdgeIdx++}`,
      source: ligandId,
      target: receptorId,
      kind: 'binding',
      subtypes: [{ name: 'binding/association', value: '---' }],
    });
  }

  nodes.push(...syntheticLigandNodes);
  allEdges.push(...syntheticEdges);

  // ---------- 种子配体补全 ----------
  // seeds 中分类为配体且图中无对应节点时，若有明确受体靶点则合成配体，
  // 保证信号级联起点（配体 → 受体）完整可演示（如 MAPK 通路的 EGF）
  let seedLigandCount = syntheticLigandNodes.length;
  if (seedLigandCount < MAX_SEED_LIGANDS) {
    for (const seed of catalogEntry.seeds) {
      if (seedLigandCount >= MAX_SEED_LIGANDS) break;
      if (findBySymbol(seed)) continue; // 图中已有该配体节点
      const ligandClass = classifyEntry({
        entryId: -1,
        keggIds: [],
        type: 'gene',
        label: seed,
        aliases: [],
        shape: 'rectangle',
        x: 0,
        y: 0,
        w: 0,
        h: 0,
      });
      if (ligandClass.kind !== 'ligand') continue;
      // 寻找亲和表中科学配对的受体（图中存在，含未入选则拉入）
      const receptorSymbols = LIGAND_RECEPTORS[seed.toUpperCase()] ?? [];
      let receptorId: string | null = null;
      for (const rs of receptorSymbols) {
        const recEntry = findBySymbol(rs);
        if (!recEntry) continue;
        if (selected.has(recEntry.entryId)) {
          receptorId = idByEntry.get(recEntry.entryId) ?? null;
        } else if (nodes.length < HARD_LIMIT) {
          const n = toCoreNode(recEntry);
          nodes.push(n);
          selected.add(recEntry.entryId);
          receptorId = n.id;
        }
        if (receptorId) break;
      }
      if (!receptorId) continue; // 无科学受体配对则不合成

      let ligandId = seed;
      while (usedIds.has(ligandId)) ligandId = `${seed}-L`;
      usedIds.add(ligandId);
      nodes.push({
        id: ligandId,
        entryId: -1,
        keggIds: [],
        label: seed,
        aliases: [],
        kind: 'ligand',
        compartment: 'extracellular',
        tier: 0,
        synthetic: true,
      });
      allEdges.push({
        id: `syn${synthEdgeIdx++}`,
        source: ligandId,
        target: receptorId,
        kind: 'binding',
        subtypes: [{ name: 'binding/association', value: '---' }],
      });
      seedLigandCount++;
    }
  }

  // ---------- 6. tier 修正：GErel 表达目标 → 靶基因（tier 6 / nucleus） ----------
  applyExpressionTargets(nodes, allEdges);

  // ---------- 7. 清理：剔除度为 0 的非配体节点 ----------
  const nodeDegree = new Map<string, number>();
  for (const e of allEdges) {
    nodeDegree.set(e.source, (nodeDegree.get(e.source) ?? 0) + 1);
    nodeDegree.set(e.target, (nodeDegree.get(e.target) ?? 0) + 1);
  }
  const finalNodes = nodes.filter(
    (n) => n.kind === 'ligand' || (nodeDegree.get(n.id) ?? 0) > 0
  );

  // 硬上限保护（合成配体注入后的极端情况）：优先保留高连接节点
  if (finalNodes.length > HARD_LIMIT) {
    const keep = new Set(
      [...finalNodes]
        .sort((a, b) => (nodeDegree.get(b.id) ?? 0) - (nodeDegree.get(a.id) ?? 0))
        .slice(0, HARD_LIMIT)
        .map((n) => n.id)
    );
    const keptNodes = finalNodes.filter((n) => keep.has(n.id));
    return {
      nodes: keptNodes,
      edges: allEdges.filter((e) => keep.has(e.source) && keep.has(e.target)),
    };
  }

  // 同步剔除清理后悬空的边（理论上不会出现，防御性处理）
  const validIds = new Set(finalNodes.map((n) => n.id));
  const finalEdges = allEdges.filter((e) => validIds.has(e.source) && validIds.has(e.target));

  return { nodes: finalNodes, edges: finalEdges };
}
