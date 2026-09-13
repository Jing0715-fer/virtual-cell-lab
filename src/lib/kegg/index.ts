/**
 * KEGG 服务统一导出
 *
 * - kgml-parser: KGML XML → 结构化 JSON（entry/relation/component）
 * - classify:    分子区室 / 类别 / 信号层级分类
 * - subgraph:    核心演示子图提取（28~42 节点）
 * - kegg-client: REST 抓取 + 内存/Prisma 二级缓存（ getPathwayGraph 主入口 ）
 */

export { parseKgml, COMPOUND_NAMES } from './kgml-parser';
export type { KeggComponent, ParsedKgml } from './kgml-parser';

export { classifyEntry, applyExpressionTargets } from './classify';
export type { Classification } from './classify';

export { extractCoreSubgraph, mergeDuplicateNodes } from './subgraph';

export { getPathwayGraph, getCachedStats, clearMemCache } from './kegg-client';
