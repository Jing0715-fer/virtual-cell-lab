/**
 * KEGG 通路缓存预热脚本
 *
 * 循环抓取 PATHWAY_CATALOG 13 条通路（getPathwayGraph：在线抓取 KGML →
 * 解析/分类/子图提取 → 写入 Prisma PathwayCache），并输出核心子图统计。
 *
 * 用法：bun run scripts/seed-kegg.ts
 * 注意：脚本运行于独立 bun 进程，Prisma 共享同一 SQLite 文件（db/ 目录），
 *       dev server 的 API 在下次请求时将命中 DB 缓存（source: 'db-cache'）。
 */

import { PATHWAY_CATALOG } from '../src/data/pathway-catalog';
import { db } from '../src/lib/db';
import { getPathwayGraph } from '../src/lib/kegg/kegg-client';

async function main() {
  console.log(`开始预热 ${PATHWAY_CATALOG.length} 条 KEGG 通路缓存...\n`);
  const results: {
    id: string;
    nameZh: string;
    genes: number;
    relations: number;
    coreNodes: number;
    coreEdges: number;
    source: string;
    ms: number;
  }[] = [];

  /** KEGG 上游限流保护：每条通路间隔 2s */
  const sleepPolite = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let first = true;
  for (const entry of PATHWAY_CATALOG) {
    if (!first) await sleepPolite(2000);
    first = false;
    const t0 = Date.now();
    try {
      const graph = await getPathwayGraph(entry.id);
      const ms = Date.now() - t0;
      results.push({
        id: entry.id,
        nameZh: entry.nameZh,
        genes: graph.stats.geneCount,
        relations: graph.stats.relationCount,
        coreNodes: graph.core.nodes.length,
        coreEdges: graph.core.edges.length,
        source: graph.source,
        ms,
      });
      console.log(
        `✓ ${entry.id} ${entry.nameZh} — 基因 ${graph.stats.geneCount} / 关系 ${graph.stats.relationCount} / 核心子图 ${graph.core.nodes.length} 节点 ${graph.core.edges.length} 边 (${ms}ms, ${graph.source})`
      );
    } catch (err) {
      console.error(`✗ ${entry.id} ${entry.nameZh} — ${err instanceof Error ? err.message : err}`);
      results.push({
        id: entry.id,
        nameZh: entry.nameZh,
        genes: 0,
        relations: 0,
        coreNodes: 0,
        coreEdges: 0,
        source: 'failed',
        ms: Date.now() - t0,
      });
    }
  }

  const ok = results.filter((r) => r.source !== 'failed');
  console.log(`\n完成：${ok.length}/${results.length} 条通路已缓存`);
  console.log(
    `核心子图节点数：min ${Math.min(...ok.map((r) => r.coreNodes))} / max ${Math.max(...ok.map((r) => r.coreNodes))} / avg ${(ok.reduce((s, r) => s + r.coreNodes, 0) / ok.length).toFixed(1)}`
  );

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
