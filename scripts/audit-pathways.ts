/**
 * 通路信号传播完整性审计脚本
 *
 * 对 PATHWAY_CATALOG 全部策划通路执行"信号可达性"分析（镜像模拟引擎的
 * 传播语义：正向激活/磷酸化/表达 + binding 双向 + 配体门控），报告：
 *   1. 每个配体的级联可达节点数 / 是否触达转录因子或靶基因（演示闭环）
 *   2. 死端节点 —— 被信号触达却在子图中无正向出边（级联中断点，如
 *      MAPK 通路 TGFBR1 缺 DAXX）及其在全图中的可拯救出边
 *   3. 孤儿节点 —— 非配体却无任何入边（图中永远无法被激活的死重）
 *
 * 用法：
 *   bun run scripts/audit-pathways.ts          # 基线模式：经 API 读当前缓存
 *   FRESH=1 bun run scripts/audit-pathways.ts  # 新鲜模式：直接调用提取管线
 *                                                # （coreVersion 升级后重抓全图）
 */

const FRESH = !!process.env.FRESH;

interface CoreNode {
  id: string;
  label: string;
  kind: string;
  tier: number;
  compartment: string;
  entryId?: number;
}
interface CoreEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
}
interface PathwayGraph {
  core: { nodes: CoreNode[]; edges: CoreEdge[] };
  meta?: { nameZh?: string; name?: string };
}

/** 引擎传播语义常量（与 src/lib/simulation/engine.ts 保持一致） */
const POS_KINDS = new Set([
  'activation',
  'phosphorylation',
  'expression',
  'indirect',
  'binding',
  'dissociation',
  'state-change',
]);
const BIDIR_KINDS = new Set(['binding', 'dissociation']);
const DEPHOS_ACTIVATED = new Set([
  'NFATC1', 'NFATC2', 'NFATC3', 'NFATC4', 'TFEB',
  'CDC25A', 'CDC25B', 'CDC25C',
  'FOXO1', 'FOXO3', 'FOXO4',
]);
/** 演示语义上的合法终端（信号抵达即算级联完成；离子通道是效应输出端） */
const TERMINAL_KINDS = new Set(['tf', 'gene', 'compound', 'channel']);

/** 拮抗剂/输出型配体 —— 语义上就不该正向传导（注入表现为抑制或无下游） */
const ANTAGONIST_LIGANDS = new Set([
  'DKK1', 'WIF1', 'SFRP1', 'SFRP2', 'SOST', 'LEFTY1', 'LEFTY2', // Wnt/Nodal 拮抗
  'IFNB1', 'IFNA1', // TLR 输出型干扰素（图内无下游）
  'TNFSF10',
]);

/** 翻译/代谢/粘附等非转录型通路的经典效应器输出 —— 触达即算级联闭环 */
const EFFECTOR_OUTPUTS = new Set([
  'RPS6KB1', 'RPS6', 'EIF4EBP1', 'EIF4E', 'ULK1', 'RPTOR', 'RICTOR', // mTOR 翻译机器
  'NOS3', 'GYS1', 'BAD', 'BCL2L1', 'BCL2', 'TSC2', // PI3K-Akt 代谢/存活效应
  'PTK2', 'PXN', 'RAC1', 'HSPB1', 'SHC2', 'PLA2G4B', // VEGF 迁移/通透效应
  'CAMK2A', 'CAMK2D', 'MYLK', 'PPP3CA', 'NOS1', 'PRKACA', // Ca²⁺/cAMP 效应激酶
  'CASP3', 'CASP6', 'CASP7', 'CASP8', 'CASP9', 'BAX', 'BAK1', // 凋亡执行器
  'LMNA', 'ACTB', 'PARP1', 'DFFA', // 凋亡底物（核纤层/骨架/DNA 修复）
]);

async function loadGraph(id: string): Promise<PathwayGraph | null> {
  if (FRESH) {
    const { getPathwayGraph } = await import('../src/lib/kegg/kegg-client');
    try {
      return (await getPathwayGraph(id)) as unknown as PathwayGraph;
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch(`http://localhost:3000/api/pathways/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as PathwayGraph;
  } catch {
    return null;
  }
}

/** 拉取原始 KGML → 全图有向邻接（判定死端是否"可拯救"） */
async function loadFullOutAdj(id: string): Promise<Map<string, string[]> | null> {
  try {
    const xml = await (await fetch(`https://rest.kegg.jp/get/${id}/kgml`)).text();
    const { parseKgml } = await import('../src/lib/kegg/kgml-parser');
    const g = parseKgml(xml);
    const labelOf = new Map(g.entries.map((e) => [e.entryId, e.label || `e${e.entryId}`]));
    const out = new Map<string, string[]>();
    for (const r of g.relations) {
      const s = labelOf.get(r.entry1);
      const t = labelOf.get(r.entry2);
      if (!s || !t || s === t) continue;
      if (!out.has(s)) out.set(s, []);
      if (!out.get(s)!.includes(t)) out.get(s)!.push(t);
    }
    return out;
  } catch {
    return null;
  }
}

/** 信号可达性 BFS（仅正向边；binding 双向） —— 返回触达节点集 */
function reachFrom(
  ligandId: string,
  nodes: CoreNode[],
  edges: CoreEdge[]
): Set<string> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const fwd = new Map<string, string[]>();
  const rev = new Map<string, string[]>();
  for (const e of edges) {
    const src = nodeById.get(e.source);
    const dst = nodeById.get(e.target);
    if (!src || !dst) continue;
    const positive =
      POS_KINDS.has(e.kind) ||
      (e.kind === 'dephosphorylation' &&
        (DEPHOS_ACTIVATED.has(e.target) ||
          [...DEPHOS_ACTIVATED].some((s) => dst.label.toUpperCase().startsWith(s))));
    if (!positive) continue;
    if (!fwd.has(e.source)) fwd.set(e.source, []);
    fwd.get(e.source)!.push(e.target);
    if (BIDIR_KINDS.has(e.kind) && src.kind !== 'ligand') {
      // 双向边反向传播（不点亮配体）
      if (!rev.has(e.target)) rev.set(e.target, []);
      rev.get(e.target)!.push(e.source);
    }
  }
  const seen = new Set<string>([ligandId]);
  const queue = [ligandId];
  while (queue.length) {
    const cur = queue.shift()!;
    const nexts = [...(fwd.get(cur) ?? []), ...(rev.get(cur) ?? [])];
    for (const nxt of nexts) {
      if (seen.has(nxt)) continue;
      const n = nodeById.get(nxt);
      if (!n) continue;
      seen.add(nxt);
      queue.push(nxt);
    }
  }
  seen.delete(ligandId);
  return seen;
}

async function main() {
  const { PATHWAY_CATALOG } = await import('../src/data/pathway-catalog');
  const { applyScaffoldEdges } = await import('../src/lib/simulation/scaffold');
  console.log(
    `=== 通路信号传播完整性审计（${FRESH ? '新鲜提取' : '基线·当前缓存'}，共 ${PATHWAY_CATALOG.length} 条）===\n`
  );

  const reportLines: string[] = [];
  let totalLigands = 0;
  let totalDeadEnds = 0;
  let totalOrphans = 0;
  let closedLigands = 0; // 级联抵达 TF/gene 的配体数

  for (const entry of PATHWAY_CATALOG) {
    const graph = await loadGraph(entry.id);
    if (!graph) {
      console.log(`✗ ${entry.id} ${entry.nameZh} — 加载失败`);
      reportLines.push(`| ${entry.id} | ${entry.nameZh} | 加载失败 | | | |`);
      continue;
    }
    const nodes = graph.core.nodes;
    // scaffold 与前端运行时一致
    const edges = applyScaffoldEdges(entry.id, nodes, graph.core.edges) as CoreEdge[];
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    // 正向出边/入边度（子图内）
    const inDeg = new Map<string, number>();
    for (const e of edges) {
      inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    }

    const fullOut = await loadFullOutAdj(entry.id);
    // 子图 label → 子图 id（全图只有 label，需映射回子图节点）
    const idByLabel = new Map<string, string>();
    for (const n of nodes) {
      if (!idByLabel.has(n.label)) idByLabel.set(n.label, n.id);
    }

    const ligands = nodes.filter((n) => n.kind === 'ligand');
    // 每配体可达性：正向 BFS + 抑制抵达（负向调控目标也是可见的信号传导，
    // 但不再向下传播 —— 被抑制的节点不会激活下游）
    const ligandStats: string[] = [];
    const reachableAll = new Set<string>();
    for (const lig of ligands) {
      const reachPos = reachFrom(lig.id, nodes, edges);
      reachPos.forEach((r) => reachableAll.add(r));
      // 抑制抵达：正向触达节点发出的 inhibition/repression 边目标
      const negTargets = new Set<string>();
      for (const e of edges) {
        if ((e.kind === 'inhibition' || e.kind === 'repression') && reachPos.has(e.source)) {
          negTargets.add(e.target);
        }
      }
      const hitTerminal =
        [...reachPos].some((r) => {
          const n = nodeById.get(r);
          return n && (n.kind === 'tf' || n.kind === 'gene' || EFFECTOR_OUTPUTS.has(n.label));
        }) ||
        [...negTargets].some((r) => {
          const n = nodeById.get(r);
          return n && (n.kind === 'tf' || n.kind === 'gene' || EFFECTOR_OUTPUTS.has(n.label));
        });
      totalLigands++;
      if (hitTerminal) closedLigands++;
      const hasOutEdge = edges.some((e) => e.source === lig.id);
      ligandStats.push(
        `${lig.label}${hitTerminal ? '' : reachPos.size === 0 || !hasOutEdge ? ' ⊣输出型' : ' ⚠未闭环'}(${reachPos.size})`
      );
    }

    // 死端：被触达 + 非终端类别 + 子图内有效出边 0
    // 有效出边口径：正向边出边 + 双向边（含反向）+ 抑制/去磷酸化出边
    // （负向调控也是信号流 —— MDM2 ⊣ TP53、GNAI1 ⊣ ADCY 并非死端）
    const deadEnds: string[] = [];
    const rescueableDeadEnds: string[] = [];
    for (const id of reachableAll) {
      const n = nodeById.get(id);
      if (!n || TERMINAL_KINDS.has(n.kind) || EFFECTOR_OUTPUTS.has(n.label)) continue;
      let effOut = 0;
      for (const e of edges) {
        if (e.source === id) {
          // 出边：正向 / 抑制 / 去磷酸化（NFAT 家族等被去磷酸化激活）
          if (POS_KINDS.has(e.kind) || e.kind === 'inhibition' || e.kind === 'repression') effOut++;
          if (e.kind === 'dephosphorylation') {
            const t = nodeById.get(e.target);
            if (t && (DEPHOS_ACTIVATED.has(t.id) || [...DEPHOS_ACTIVATED].some(s => (t.label || '').toUpperCase().startsWith(s)))) effOut++;
          }
        }
        if (e.target === id && BIDIR_KINDS.has(e.kind)) effOut++;
      }
      if (effOut > 0) continue;
      const rescue = fullOut?.get(n.label) ?? [];
      if (rescue.length === 0) continue; // KEGG 原生终端（全图即无出边）—— 合法输出
      const rescueInSub = rescue.filter((r) => idByLabel.has(r));
      const desc = `${n.label}[${n.kind}]→${rescue.slice(0, 3).join(',')}${rescueInSub.length ? '(已在子图!)' : ''}`;
      deadEnds.push(desc);
      rescueableDeadEnds.push(desc);
    }

    // 孤儿：非配体 + 总入度 0（binding 也算）
    const orphans: string[] = [];
    for (const n of nodes) {
      if (n.kind === 'ligand') continue;
      if ((inDeg.get(n.id) ?? 0) === 0) orphans.push(`${n.label}[${n.kind}]`);
    }

    totalDeadEnds += rescueableDeadEnds.length;
    totalOrphans += orphans.length;

    const status = rescueableDeadEnds.length === 0 ? '✓' : `✗ ${rescueableDeadEnds.length}死端`;
    console.log(
      `${status} ${entry.id} ${entry.nameZh} — ${nodes.length}节点/${edges.length}边 | 配体 ${ligands.length} 个: ${ligandStats.join(' ')}`
    );
    if (deadEnds.length) console.log(`    死端: ${deadEnds.join(' | ')}`);
    if (orphans.length) console.log(`    孤儿: ${orphans.join(' | ')}`);
    reportLines.push(
      `| ${entry.id} | ${entry.nameZh} | ${ligands.length} | ${ligandStats.join('<br>')} | ${deadEnds.join('<br>') || '—'} | ${orphans.join('<br>') || '—'} |`
    );
    await new Promise((r) => setTimeout(r, 400)); // KEGG 限流保护
  }

  console.log(`\n=== 汇总 ===`);
  console.log(`配体总数 ${totalLigands}，级联闭环（触达转录层）${closedLigands} (${((closedLigands / totalLigands) * 100).toFixed(0)}%)`);
  console.log(`死端中断点 ${totalDeadEnds} 处 / 孤儿节点 ${totalOrphans} 个`);

  // 落盘报告
  const { existsSync, mkdirSync, writeFileSync } = await import('fs');
  if (!existsSync('agent-ctx')) mkdirSync('agent-ctx');
  const md = [
    `# 通路传播审计报告（${FRESH ? '修复后·新鲜提取' : '基线·当前缓存'}）`,
    ``,
    `- 配体 ${totalLigands} 个，级联闭环 ${closedLigands} (${((closedLigands / totalLigands) * 100).toFixed(0)}%)`,
    `- 死端 ${totalDeadEnds} 处 / 孤儿 ${totalOrphans} 个`,
    ``,
    `| 通路 | 名称 | 配体数 | 配体→可达数 | 死端（→全图可拯救出边） | 孤儿 |`,
    `|---|---|---|---|---|---|`,
    ...reportLines,
  ].join('\n');
  writeFileSync(FRESH ? 'agent-ctx/audit-after.md' : 'agent-ctx/audit-baseline.md', md);
  console.log(`报告已写入 agent-ctx/audit-${FRESH ? 'after' : 'baseline'}.md`);

  if (!FRESH) {
    const { db } = await import('../src/lib/db');
    await db.$disconnect();
  } else {
    const { db } = await import('../src/lib/db');
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
