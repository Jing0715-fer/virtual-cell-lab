/**
 * 核心演示子图提取算法
 *
 * 从 KGML 全图（数十至上百节点）中提取适合虚拟细胞演示的核心子图（~30-56 节点）：
 *   1. 种子匹配 —— catalogEntry.seeds 命中 label / aliases（不足 18 个时按
 *      relation 度数补齐，避免孤岛节点；超过上限时按度数截断保留 hub）
 *   2. 邻接扩展 —— 从种子沿 relation 双向 BFS 1 层（信号关键关系与
 *      ligand/receptor/tf 类别加权），低联通时自动加深一层
 *   3. 合成配体 —— catalogEntry.syntheticLigands 注入 KEGG 图中缺失的
 *      配体（如 cAMP 通路的肾上腺素），receptor 不在图中时一并合成
 *   4. 边生成 —— KGML relation → CoreEdge（EdgeKind 映射 + group 重定向）
 *   5. tier 修正 —— GErel expression/repression 目标上调为靶基因（tier 6）
 *   6. 清理 —— 剔除度为 0 的非配体节点
 *   7. 同名合并 —— KGML 常将同一基因绘制为多个独立 entry（如 STAT1×10、
 *      TRAF6×8），分配不同 id 后会割裂信号流（配体激活"死端"副本而经典
 *      级联走另一副本）。按 label 合并为唯一节点：canonical 优先基因符号
 *      id，出边并集去重，keggIds/aliases 取并集。
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

/**
 * 节点数目标区间（v2 扩容：演示完整度优先——覆盖通路主要分支，
 * 2D 布局引擎按带宽自适应分行、3D 径向布局自然容纳，均无硬编码上限）
 */
const EXPAND_TARGET = 50;
const SEED_LIMIT = 58;
const HARD_LIMIT = 58;
/** 种子最少期望数（不足时按度数补齐） */
const MIN_SEEDS = 18;
/** 提取算法版本（写入缓存行，变更时触发旧缓存升级重抓） */
export const CORE_ALGO_VERSION = 10;

/** 种子配体补全上限（seeds 中配体类符号图中缺失时最多合成数量） */
const MAX_SEED_LIGANDS = 2;

/** 演示语义的终端节点类别（信号抵达即级联完成） */
const TERMINAL_NODE_KINDS = new Set(['tf', 'gene', 'compound', 'channel', 'ligand']);

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
  // 混合语义边（activation+inhibition 双 subtype，如 Notch 通路 JAG1→NOTCH1）
  // 取激活语义 —— 配体/修饰酶的正向事件是演示主叙事，抑制分量属反馈复杂性
  if (hasSubtype(r, 'activation') && hasSubtype(r, 'inhibition')) return 'activation';
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

  // ---------- 1.5 化合物信使补全（在度数扩展之前：第二信使优先于拓扑填充） ----------
  // cAMP、Ca²⁺、O₂、PIP₃…数量少而教学价值高，且 degree 打分常使其落选：
  // 凡与已选节点（种子）有边的化合物全部纳入（受 HARD_LIMIT 保护）
  for (const e of entries) {
    if (e.type !== 'compound' || selected.has(e.entryId)) continue;
    const nbrs = adjacency.get(e.entryId);
    if (!nbrs) continue;
    let touchesSelected = false;
    for (const nb of nbrs) {
      if (selected.has(nb)) {
        touchesSelected = true;
        break;
      }
    }
    if (touchesSelected && selected.size < HARD_LIMIT) {
      selected.add(e.entryId);
    }
  }

  expandOnce();
  // 通路 relation 稀疏时（1 层不足）自动再扩一层
  if (selected.size < EXPAND_TARGET - 6) expandOnce();

  // ---------- 2.6 信号连通性拯救（v6 新增） ----------
  // 审计发现三类断链模式（详见 scripts/audit-pathways.ts）：
  //   a) 死端受体 —— 受体入选但其下游中介在打分竞争中落选
  //      （如 MAPK 通路 TGFBR1 的唯一下游适配体 DAXX，配体→受体→死端）
  //   b) 配体起点断链 —— 配体入选但其受体/靶点落选（如 NF-κB 的 BAFF）
  //      或同名异 entry 副本被拆分（输入侧 TNF 落选而输出侧入选，
  //      TNF→TNFRSF1A 边随副本丢失）—— 后者在边生成阶段按 label 恢复
  // 本阶段处理 a/b 的节点补入；副本边恢复见边生成的 resolveSelected

  /** 有向出边邻接（用于 BFS 接通死端） */
  const outAdj = new Map<number, Set<number>>();
  for (const { src, dst } of flatRelations) {
    if (!outAdj.has(src)) outAdj.set(src, new Set());
    outAdj.get(src)!.add(dst);
  }

  /** 拯救目标打分：度数 + 类别教学价值 */
  const rescueScore = (id: number): number => {
    const e = entryById.get(id);
    if (!e || !selectable(e)) return -1;
    const cls = classOf(e);
    let s = (degree.get(id) ?? 0) * 2;
    if (cls.kind === 'ligand' || cls.kind === 'receptor' || cls.kind === 'tf' || cls.kind === 'channel') s += 8;
    else if (cls.kind === 'kinase' || cls.kind === 'gtpase' || cls.kind === 'adapter') s += 4;
    return s;
  };

  /** 从死端节点沿出边 BFS 寻找接通已选节点的最短路径（深度≤4） */
  const connectPath = (startId: number): number[] | null => {
    const prev = new Map<number, number>();
    const visited = new Set<number>([startId]);
    let frontier = [startId];
    for (let depth = 0; depth < 4; depth++) {
      const next: number[] = [];
      // 同层候选按打分排序（同样深度优先高价值节点）
      const expand: number[] = [];
      for (const cur of frontier) {
        for (const nxt of outAdj.get(cur) ?? []) {
          if (visited.has(nxt)) continue;
          const e = entryById.get(nxt);
          if (!e || !selectable(e)) continue;
          visited.add(nxt);
          prev.set(nxt, cur);
          if (selected.has(nxt)) {
            // 回溯路径（不含两端已选节点：终点 pop 去除，起点由 while 边界排除）
            const path: number[] = [];
            let c = nxt;
            while (c !== startId) {
              path.unshift(c);
              c = prev.get(c)!;
            }
            path.pop(); // 去掉终点（已选）
            return path;
          }
          expand.push(nxt);
        }
      }
      expand.sort((a, b) => rescueScore(b) - rescueScore(a) || a - b);
      next.push(...expand);
      frontier = next;
    }
    return null;
  };

  /** a) 死端受体拯救：已选受体在全图有出边但无一入选 → BFS 接通 */
  let rescueOps = 0;
  for (const id of [...selected]) {
    if (rescueOps >= 8 || selected.size >= HARD_LIMIT) break;
    const e = entryById.get(id);
    if (!e || !selectable(e)) continue;
    const cls = classOf(e);
    const outs = outAdj.get(id) ?? new Set<number>();
    if (outs.size === 0) continue;
    // 已有下游出路（出边目标入选）→ 无需拯救
    let hasSelectedOut = false;
    for (const o of outs) if (selected.has(o)) { hasSelectedOut = true; break; }
    if (hasSelectedOut) continue;
    // 仅拯救受体类节点（含配体入边的膜节点）—— 信号入口死端是演示断链；
    // TF/基因/通道等作为级联输出终端是合法死端
    if (cls.kind !== 'receptor') continue;
    const path = connectPath(id);
    if (!path || path.length === 0) continue;
    let ok = true;
    for (const p of path) {
      if (selected.size >= HARD_LIMIT) { ok = false; break; }
      selected.add(p);
    }
    if (ok) rescueOps++;
  }

  /** b) 广义死端拯救：非终端类别节点被信号触达却在子图内无出边 → 同样接通。
   *  在节点/边生成前的选中集层面近似：非 receptor 的非终端节点（激酶/适配体/
   *  GTP酶）出边目标全落选且自身非种子配体，按度数限制少量接通（避免爆炸） */
  let midOps = 0;
  for (const id of [...selected]) {
    if (midOps >= 5 || selected.size >= HARD_LIMIT) break;
    const e = entryById.get(id);
    if (!e || !selectable(e)) continue;
    const cls = classOf(e);
    if (!['kinase', 'adapter', 'gtpase', 'phosphatase'].includes(cls.kind)) continue;
    const outs = outAdj.get(id) ?? new Set<number>();
    if (outs.size === 0) continue;
    let hasSelectedOut = false;
    for (const o of outs) if (selected.has(o)) { hasSelectedOut = true; break; }
    if (hasSelectedOut) continue;
    // 高连接枢纽才值得接通（如 PI3K-Akt 的 RPS6KB1→EIF4B 翻译机器）
    if ((degree.get(id) ?? 0) < 5) continue;
    const path = connectPath(id);
    if (!path || path.length === 0) continue;
    let ok = true;
    for (const p of path) {
      if (selected.size >= HARD_LIMIT) { ok = false; break; }
      selected.add(p);
    }
    if (ok) midOps++;
  }

  /** c) 配体起点拯救：已选配体无任何已选出边 → 拉入最佳全图靶点（受体优先）。
   *  不受 HARD_LIMIT 短路 —— 配体→受体是演示的信号入口；超额由末段
   *  硬限裁剪的「配体靶点豁免」兑底（见下） */
  let ligandRescues = 0;
  for (const id of [...selected]) {
    if (ligandRescues >= 4) break;
    const e = entryById.get(id);
    if (!e || !selectable(e)) continue;
    const cls = classOf(e);
    if (cls.kind !== 'ligand') continue;
    const outs = outAdj.get(id) ?? new Set<number>();
    if (outs.size === 0) continue; // 图内本无下游（输出型配体如 IFNB1）
    let hasSelectedOut = false;
    for (const o of outs) if (selected.has(o)) { hasSelectedOut = true; break; }
    if (hasSelectedOut) continue;
    const ranked = [...outs].sort((a, b) => rescueScore(b) - rescueScore(a) || a - b);
    const target = ranked[0];
    if (rescueScore(target) >= 0) {
      selected.add(target);
      ligandRescues++;
    }
  }

  /** b') 终末底物直拉：中段死端（激酶/酶/适配体等非终端类别、出边目标全落选）
   *  的最高分出边目标若本身是终端型（TF/基因/通道/低度数）→ 直接拉入。
   *  典型：凋亡 CASP6→LMNA（核纤层降解 = 凋亡表型终点）、TGF-β RHOA→ROCK1 */
  let substrateOps = 0;
  for (const id of [...selected]) {
    if (substrateOps >= 4 || selected.size >= HARD_LIMIT + 4) break;
    const e = entryById.get(id);
    if (!e || !selectable(e)) continue;
    const cls = classOf(e);
    if (TERMINAL_NODE_KINDS.has(cls.kind)) continue;
    const outs = outAdj.get(id) ?? new Set<number>();
    if (outs.size === 0) continue;
    let hasSelectedOut = false;
    for (const o of outs) if (selected.has(o)) { hasSelectedOut = true; break; }
    if (hasSelectedOut) continue;
    if ((degree.get(id) ?? 0) < 3) continue;
    const ranked = [...outs].sort((a, b) => rescueScore(b) - rescueScore(a) || a - b);
    // 优选「终端型」目标（而非单纯最高分）—— 如 ErbB 的 MTOR 出边
    // RPS6KB1(高连接非终端) 与 EIF4EBP1(翻译抑制终端)，应拉后者
    let target: number | null = null;
    for (const cand of ranked) {
      const ce = entryById.get(cand);
      if (!ce || !selectable(ce)) continue;
      const ccls = classOf(ce);
      if (TERMINAL_NODE_KINDS.has(ccls.kind) || (degree.get(cand) ?? 0) <= 4) {
        target = cand;
        break;
      }
    }
    if (target === null) continue;
    const te = entryById.get(target);
    if (!te || !selectable(te)) continue;
    selected.add(target);
    substrateOps++;
  }

  // ---------- 2.5 化合物兜底二遍 ----------
  // 扩展后新增的种子外节点也可能邻接化合物（如 PKA→cAMP），再补一遍（幂等）
  for (const e of entries) {
    if (e.type !== 'compound' || selected.has(e.entryId)) continue;
    const nbrs = adjacency.get(e.entryId);
    if (!nbrs) continue;
    let touchesSelected = false;
    for (const nb of nbrs) {
      if (selected.has(nb)) {
        touchesSelected = true;
        break;
      }
    }
    if (touchesSelected && selected.size < HARD_LIMIT) {
      selected.add(e.entryId);
    }
  }

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

  let allEdges: CoreEdge[] = [];
  // 注：末段硬限裁剪可能重新赋值（见「配体靶点豁免」）

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
  // 同 label 副本边恢复：KGML 常将同一基因绘制为多个 entry（如 NF-κB 的 TNF
  // 输入侧 #18 与输出侧 #236）。若仅输出侧入选，输入侧参与的 TNF→TNFRSF1A
  // 边会随副本丢失。此处将非选中端点的 label 映射到已选同 label 节点：
  const selectedByLabel = new Map<string, number>();
  for (const id of selected) {
    const e = entryById.get(id);
    if (e && selectable(e) && e.label && !selectedByLabel.has(e.label)) {
      selectedByLabel.set(e.label, id);
    }
  }
  /** 端点解析：已选 → 自身；未选但存在同 label 已选副本 → 该副本（否则 null） */
  const resolveSelected = (id: number): number | null => {
    if (selected.has(id)) return id;
    const e = entryById.get(id);
    if (e && selectable(e) && e.label && selectedByLabel.has(e.label)) {
      return selectedByLabel.get(e.label)!;
    }
    return null;
  };

  let edgeIdx = 0;
  for (const { src, dst, rel } of flatRelations) {
    const srcSel = resolveSelected(src);
    const dstSel = resolveSelected(dst);
    if (srcSel === null || dstSel === null || srcSel === dstSel) continue;
    const srcId = idByEntry.get(srcSel);
    const dstId = idByEntry.get(dstSel);
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

  // ---------- 8. 配体出边修复（v7：label 副本边恢复的补充） ----------
  // 种子截断可能切掉持有配体→受体关系的“输入侧副本”（如 NF-κB 的 BAFF
  // 输入副本落选而输出副本入选）—— 合并后的配体节点因此失去全部出边。
  // 此处对每个无出边的配体节点：按 label 找回其全部 entry 副本的出边关系；
  // 目标已是节点 → 直接补边；目标不是节点 → 拉入目标节点（同步补全它与其
  // 他已选节点的全部边）
  {
    const nodeByLabel = new Map<string, string>();
    for (const n of nodes) {
      if (n.label && !nodeByLabel.has(n.label)) nodeByLabel.set(n.label, n.id);
    }
    const entriesByLabel = new Map<string, KeggEntry[]>();
    for (const en of entries) {
      if (!selectable(en) || !en.label) continue;
      if (!entriesByLabel.has(en.label)) entriesByLabel.set(en.label, []);
      entriesByLabel.get(en.label)!.push(en);
    }
    /** 目标 entry → 已有节点 id（直接选中或 label 匹配） */
    const nodeForEntry = (te: KeggEntry): string | null => {
      if (idByEntry.has(te.entryId)) return idByEntry.get(te.entryId)!;
      const nid = nodeByLabel.get(te.label);
      return nid ?? null;
    };
    let repairIdx = 0;
    let ligandRepairs = 0;
    for (const lig of nodes.filter((n) => n.kind === 'ligand')) {
      if (ligandRepairs >= 6) break;
      if (allEdges.some((e) => e.source === lig.id)) continue; // 已有出边
      const copies = entriesByLabel.get(lig.label) ?? [];
      let added = false;
      for (const copy of copies) {
        for (const { src, dst, rel } of flatRelations) {
          if (src !== copy.entryId) continue;
          const te = entryById.get(dst);
          if (!te || !selectable(te)) continue;
          let targetId = nodeForEntry(te);
          if (!targetId) {
            // 拉入目标节点（允许小幅超额，配体入口优先于硬限）
            if (nodes.length >= HARD_LIMIT + 4) continue;
            const n = toCoreNode(te);
            nodes.push(n);
            selected.add(te.entryId);
            targetId = n.id;
            // 同步补全新节点与已选节点间的全部边（保持一致性）
            for (const { src: s2, dst: d2, rel: r2 } of flatRelations) {
              if (s2 !== te.entryId && d2 !== te.entryId) continue;
              const other = s2 === te.entryId ? d2 : s2;
              const otherEntry = entryById.get(other);
              if (!otherEntry || !selectable(otherEntry)) continue;
              const otherId = nodeForEntry(otherEntry);
              if (!otherId || otherId === targetId) continue;
              allEdges.push({
                id: `lr${repairIdx++}`,
                source: s2 === te.entryId ? targetId : otherId,
                target: s2 === te.entryId ? otherId : targetId,
                kind: mapEdgeKind(r2),
                subtypes: r2.subtypes,
              });
            }
          }
          if (targetId === lig.id) continue;
          allEdges.push({
            id: `lr${repairIdx++}`,
            source: lig.id,
            target: targetId,
            kind: mapEdgeKind(rel),
            subtypes: rel.subtypes,
          });
          added = true;
        }
      }
      if (added) ligandRepairs++;
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
  let finalNodes = nodes.filter(
    (n) => n.kind === 'ligand' || (nodeDegree.get(n.id) ?? 0) > 0
  );

  // 硬上限保护（合成配体注入后的极端情况）：优先保留高连接节点
  // 配体靶点豁免：配体节点本身与它们的直接结合目标（tier≤1 的信号入口，
  // 如 TNF→TNFRSF1A、LPS→TLR4）是演示起点，度数低也不得被裁剪
  if (finalNodes.length > HARD_LIMIT) {
    const protectedIds = new Set<string>(
      finalNodes.filter((n) => n.kind === 'ligand').map((n) => n.id)
    );
    for (const e of allEdges) {
      if (protectedIds.has(e.source) && !protectedIds.has(e.target)) {
        const t = finalNodes.find((n) => n.id === e.target);
        if (t && (t.kind === 'receptor' || t.kind === 'channel' || t.tier <= 1)) {
          protectedIds.add(e.target);
        }
      }
    }
    const protectedNodes = finalNodes.filter((n) => protectedIds.has(n.id));
    const rest = finalNodes.filter((n) => !protectedIds.has(n.id));
    const keep = new Set(
      [...rest]
        .sort((a, b) => (nodeDegree.get(b.id) ?? 0) - (nodeDegree.get(a.id) ?? 0))
        .slice(0, Math.max(0, HARD_LIMIT - protectedNodes.length))
        .map((n) => n.id)
    );
    finalNodes = [...protectedNodes, ...rest.filter((n) => keep.has(n.id))];
    const keepAll = new Set(finalNodes.map((n) => n.id));
    allEdges = allEdges.filter((e) => keepAll.has(e.source) && keepAll.has(e.target));
  }

  // 同步剔除清理后悬空的边（理论上不会出现，防御性处理）
  const validIds = new Set(finalNodes.map((n) => n.id));
  const finalEdges = allEdges.filter((e) => validIds.has(e.source) && validIds.has(e.target));
  if (process.env.DEBUG_RESCUE) {
    for (const n of nodes.filter(x => /LPS/i.test(x.id) || /LPS/i.test(x.label))) console.error('[node] id=' + n.id + ' label=' + n.label + ' kind=' + n.kind + ' deg=' + (nodeDegree.get(n.id) ?? 0) + ' inFinal=' + finalNodes.some(f => f.id === n.id));
    for (const e of allEdges.filter(x => /LPS/i.test(x.source) || /LPS/i.test(x.target))) console.error('[edge] ' + e.source + ' --' + e.kind + '--> ' + e.target);
    console.error('[counts] nodes=' + nodes.length + ' finalNodes=' + finalNodes.length + ' synLig=' + syntheticLigandNodes.map(n => n.id).join(','));
  }

  return mergeDuplicateNodes(finalNodes, finalEdges);
}

/**
 * 同名节点合并（KEGG 重复 entry 统一）
 *
 * KGML 中同一基因常有多个独立 entry（不同绘图位置），子图提取按 label 分配
 * 唯一 id 后形成"同名异 id"节点群，导致信号流割裂（典型症状：配体激活的
 * 受体副本无出边，而级联下游从另一副本出发）。本函数按 label 分组合并：
 *   - canonical 选择：id===label（基因符号 id）> cpd: 前缀化合物 id >
 *     度数最大 > entryId 最小；保留 canonical 的 KGML 坐标与分类
 *   - keggIds / aliases 取并集（信息无损）
 *   - 边端点重映射到 canonical id，(source, target, kind) 三元组去重，
 *     合并产生自环的边剔除
 */
export function mergeDuplicateNodes(
  nodes: CoreNode[],
  edges: CoreEdge[],
): { nodes: CoreNode[]; edges: CoreEdge[] } {
  // 快速路径：无重复 label 直接返回
  const labelCount = new Map<string, number>();
  for (const n of nodes) labelCount.set(n.label, (labelCount.get(n.label) ?? 0) + 1);
  const hasDup = [...labelCount.values()].some((c) => c > 1);
  if (!hasDup) return { nodes, edges };

  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  // 按 label 分组
  const groups = new Map<string, CoreNode[]>();
  for (const n of nodes) {
    if (!groups.has(n.label)) groups.set(n.label, []);
    groups.get(n.label)!.push(n);
  }

  const idToCanonical = new Map<string, string>();
  const mergedNodes: CoreNode[] = [];

  for (const [, group] of groups) {
    if (group.length === 1) {
      mergedNodes.push(group[0]);
      continue;
    }
    // canonical 排序：基因符号 id > cpd id > 度数 > entryId
    const canonical = [...group].sort((a, b) => {
      const score = (n: CoreNode) =>
        (n.id === n.label ? 2 : 0) + (n.id.startsWith('cpd:') ? 1 : 0);
      const sa = score(a);
      const sb = score(b);
      if (sa !== sb) return sb - sa;
      const da = degree.get(a.id) ?? 0;
      const db = degree.get(b.id) ?? 0;
      if (da !== db) return db - da;
      return (a.entryId ?? 0) - (b.entryId ?? 0);
    })[0];

    // 属性并集（keggIds / aliases），分类与坐标保持 canonical
    const keggIds = [...new Set(group.flatMap((n) => n.keggIds))];
    const aliases = [
      ...new Set(group.flatMap((n) => [n.id, ...n.aliases]).filter((s) => s && s !== canonical.label)),
    ].filter((s) => s !== canonical.id);

    for (const n of group) idToCanonical.set(n.id, canonical.id);
    mergedNodes.push({ ...canonical, keggIds, aliases });
  }

  // 边重映射 + 三元组去重 + 自环剔除
  const seen = new Set<string>();
  const mergedEdges: CoreEdge[] = [];
  let idx = 0;
  for (const e of edges) {
    const source = idToCanonical.get(e.source) ?? e.source;
    const target = idToCanonical.get(e.target) ?? e.target;
    if (source === target) continue; // 合并后自环（如 STAT1↔STAT1 二聚体边）
    const key = `${source}|${target}|${e.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mergedEdges.push({ ...e, id: `me${idx++}`, source, target });
  }

  // 重新清理：合并后可能产生度为 0 的非配体节点（其全部边都成为自环被剔除）
  const nodeDeg = new Map<string, number>();
  for (const e of mergedEdges) {
    nodeDeg.set(e.source, (nodeDeg.get(e.source) ?? 0) + 1);
    nodeDeg.set(e.target, (nodeDeg.get(e.target) ?? 0) + 1);
  }
  const finalNodes = mergedNodes.filter(
    (n) => n.kind === 'ligand' || (nodeDeg.get(n.id) ?? 0) > 0,
  );
  const finalIds = new Set(finalNodes.map((n) => n.id));
  const finalEdges = mergedEdges.filter((e) => finalIds.has(e.source) && finalIds.has(e.target));

  return { nodes: finalNodes, edges: finalEdges };
}
