/**
 * KEGG REST 客户端 —— 通路图获取 + 二级缓存
 *
 * 数据流：内存缓存（进程级）→ Prisma PathwayCache（SQLite）→ KEGG REST 在线抓取
 *   - 在线抓取成功后写库（upsert），下次命中 DB 缓存（source: 'db-cache'）
 *   - KEGG 上游不可用时回退 DB 缓存；都失败抛错（API 层转 503）
 *
 * KEGG 多基因合并 entry 处理：
 *   KGML 的 entry 常把多个基因（如同家族 RTK）合并为一个节点，graphics.name
 *   只显示其中一个成员（如 25 个 RTK 合并节点 label 为 CSF1R）。本模块通过
 *   https://rest.kegg.jp/list/hsa 的 hsa-id → 官方基因符号全表把成员基因符号
 *   补全进 aliases，并把命中的种子符号（如 EGFR）提升为主 label，
 *   使种子匹配 / 分类 / 前端展示都基于完整基因集合。
 */

import { db } from '@/lib/db';
import { PATHWAY_MAP } from '@/data/pathway-catalog';
import type { KeggEntry, PathwayCatalogEntry, PathwayGraph, PathwayMeta } from '@/types/kegg';
import { parseKgml } from './kgml-parser';
import { extractCoreSubgraph, mergeDuplicateNodes } from './subgraph';

const KEGG_BASE = 'https://rest.kegg.jp';
/** fetch 超时（ms） */
const FETCH_TIMEOUT = 15_000;
/** hsa 符号全表拉取超时（约 2.6MB 文本） */
const SYMBOL_TIMEOUT = 25_000;

// ---------- 进程级缓存（dev 热重载安全：挂到 globalThis） ----------
interface KeggGlobalCache {
  memCache?: Map<string, PathwayGraph>;
  cacheVersion?: string;
  hsaSymbols?: Map<string, string> | null;
  hsaSymbolsPromise?: Promise<Map<string, string>> | null;
  inflight?: Map<string, Promise<PathwayGraph>>;
}
const g = globalThis as unknown as KeggGlobalCache;

/**
 * 代码版本标记：classify/subgraph 算法迭代后递增版本号使内存缓存自动失效，
 * 避免 dev 热重载后 globalThis 仍持有旧算法产物（生产环境版本恒定无影响）
 */
const CACHE_VERSION = '2025-01-v6';
if (g.cacheVersion !== CACHE_VERSION) {
  g.memCache?.clear();
  g.inflight?.clear();
  g.cacheVersion = CACHE_VERSION;
}

const memCache: Map<string, PathwayGraph> = (g.memCache ??= new Map());
const inflight: Map<string, Promise<PathwayGraph>> = (g.inflight ??= new Map());

/** 带超时的文本 fetch */
async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/plain, text/xml, */*' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------- hsa id → 官方基因符号映射（lazy 全表） ----------
function getHsaSymbolMap(): Promise<Map<string, string>> {
  if (g.hsaSymbols) return Promise.resolve(g.hsaSymbols);
  if (!g.hsaSymbolsPromise) {
    g.hsaSymbolsPromise = fetchText(`${KEGG_BASE}/list/hsa`, SYMBOL_TIMEOUT)
      .then((text) => {
        const map = new Map<string, string>();
        // 新版 list/hsa 为 4 列 TSV: hsa:id \t 类型 \t 位置 \t "SYM1, SYM2; description"
        for (const line of text.split('\n')) {
          const cols = line.split('\t');
          if (cols.length >= 4 && cols[0].startsWith('hsa:')) {
            const symbol = cols[3].split(';')[0].split(',')[0].trim();
            if (symbol && !symbol.includes(' ')) map.set(cols[0], symbol);
          }
        }
        g.hsaSymbols = map;
        return map;
      })
      .catch(() => {
        // 拉取失败降级为空表（仅退回 label/alias 匹配）
        g.hsaSymbols = new Map();
        return g.hsaSymbols;
      });
  }
  return g.hsaSymbolsPromise;
}

/**
 * KEGG entry 增强：
 *   1. 合并 entry 的成员基因官方符号（经 hsa id 反查）补全进 aliases
 *   2. 符号集命中目录种子且 label 不是该种子 → 提升种子为主 label
 *      （如 25-RTK 合并节点 label CSF1R → 提升为 EGFR，原 label 移入 aliases）
 */
function enrichEntries(
  entries: KeggEntry[],
  catalogEntry: PathwayCatalogEntry,
  hsaSymbols: Map<string, string>
): KeggEntry[] {
  if (hsaSymbols.size === 0) return entries;
  return entries.map((e) => {
    if (e.type !== 'gene' || e.keggIds.length === 0) return e;

    // 成员基因官方符号
    const memberSymbols = e.keggIds
      .map((id) => hsaSymbols.get(id))
      .filter((s): s is string => !!s);

    const aliases = [...e.aliases];
    for (const sym of memberSymbols) {
      if (sym !== e.label && !aliases.includes(sym)) aliases.push(sym);
    }

    // 种子提升（取 seeds 顺序中第一个命中的符号）
    const allSymbols = [e.label, ...aliases].map((s) => s.trim().toUpperCase());
    const hitSeed = catalogEntry.seeds.find((s) => allSymbols.includes(s.trim().toUpperCase()));
    if (hitSeed && hitSeed !== e.label) {
      return {
        ...e,
        label: hitSeed,
        aliases: [e.label, ...aliases.filter((a) => a !== hitSeed)],
      };
    }
    if (aliases.length !== e.aliases.length) return { ...e, aliases };
    return e;
  });
}

/** 构造 meta（catalog 为准，KEGG title 兜底） */
function buildMeta(catalog: PathwayCatalogEntry, keggTitle: string): PathwayMeta {
  return {
    id: catalog.id,
    name: catalog.name || keggTitle || catalog.id,
    nameZh: catalog.nameZh,
    category: catalog.category,
    description: catalog.description,
    cascade: catalog.cascade,
    keggLink: `https://www.kegg.jp/entry/${catalog.id}`,
  };
}

/** 从 Prisma 缓存行恢复 PathwayGraph（source 标记为 db-cache） */
async function readDbCache(id: string): Promise<PathwayGraph | null> {
  try {
    const row = await db.pathwayCache.findUnique({ where: { id } });
    if (!row) return null;
    const graph = JSON.parse(row.graphJson) as PathwayGraph;
    graph.source = 'db-cache';
    return graph;
  } catch {
    return null;
  }
}

/** 在线抓取并解析 KGML → PathwayGraph（写库） */
async function fetchLiveGraph(catalog: PathwayCatalogEntry): Promise<PathwayGraph> {
  const xml = await fetchText(`${KEGG_BASE}/get/${catalog.id}/kgml`, FETCH_TIMEOUT);
  const parsed = parseKgml(xml);
  const hsaSymbols = await getHsaSymbolMap();
  const enriched = enrichEntries(parsed.entries, catalog, hsaSymbols);

  const core = extractCoreSubgraph(enriched, parsed.relations, catalog, parsed.components);
  const meta = buildMeta(catalog, parsed.title);

  const graph: PathwayGraph = {
    meta,
    nodes: enriched,
    relations: parsed.relations,
    core,
    stats: {
      geneCount: enriched.filter((e) => e.type === 'gene').length,
      relationCount: parsed.relations.length,
      coreCount: core.nodes.length,
    },
    fetchedAt: new Date().toISOString(),
    source: 'kegg-live',
  };

  // 写库（SQLite 本地写，失败不阻塞响应）
  try {
    await db.pathwayCache.upsert({
      where: { id: catalog.id },
      update: {
        name: meta.name,
        graphJson: JSON.stringify(graph),
        source: 'kegg-live',
        fetchedAt: new Date(),
      },
      create: {
        id: catalog.id,
        name: meta.name,
        graphJson: JSON.stringify(graph),
        source: 'kegg-live',
      },
    });
  } catch {
    // 缓存写失败可容忍（下次重新在线抓取）
  }

  return graph;
}

/**
 * 获取完整通路图（对外主入口）
 * - 内存缓存 → DB 缓存 → 在线抓取（并发去重）
 * - 在线失败时回退 DB；都失败抛错
 */
export async function getPathwayGraph(id: string): Promise<PathwayGraph> {
  const cached = memCache.get(id);
  if (cached) return cached;

  const catalog = PATHWAY_MAP.get(id);
  if (!catalog) {
    throw new Error(`未知通路 id: ${id}（不在目录中）`);
  }

  // 并发去重：同一通路只允许一个在途请求
  const pending = inflight.get(id);
  if (pending) return pending;

  const task = (async (): Promise<PathwayGraph> => {
    /**
     * 归一化：DB 旧缓存行（v6 之前写入）不含同名节点合并 —— 统一在读取时
     * 应用 mergeDuplicateNodes，保证缓存与在线解析产物一致（幂等：已合并
     * 图的快速路径直接返回原引用）。
     */
    const normalize = (graph: PathwayGraph): PathwayGraph => {
      const merged = mergeDuplicateNodes(graph.core.nodes, graph.core.edges);
      if (merged.nodes === graph.core.nodes) return graph;
      return {
        ...graph,
        core: merged,
        stats: { ...graph.stats, coreCount: merged.nodes.length },
      };
    };

    // 1. Prisma 持久缓存
    const dbGraph = await readDbCache(id);
    if (dbGraph) {
      const normalized = normalize(dbGraph);
      memCache.set(id, normalized);
      return normalized;
    }

    // 2. 在线抓取
    try {
      const live = await fetchLiveGraph(catalog);
      memCache.set(id, live);
      return live;
    } catch (err) {
      // 3. 在线失败 → 回退 DB（并发场景下可能刚被其他请求写入）
      const fallback = await readDbCache(id);
      if (fallback) {
        const normalized = normalize(fallback);
        memCache.set(id, normalized);
        return normalized;
      }
      throw new Error(
        `KEGG 上游暂时不可用，且无本地缓存: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  })().finally(() => inflight.delete(id));

  inflight.set(id, task);
  return task;
}

/** 读取目录中全部通路的缓存统计（无缓存的通路返回 null，不触发在线抓取） */
export async function getCachedStats(): Promise<Map<string, PathwayGraph['stats']>> {
  const out = new Map<string, PathwayGraph['stats']>();
  try {
    const rows = await db.pathwayCache.findMany({
      select: { id: true, graphJson: true },
    });
    for (const row of rows) {
      try {
        const graph = JSON.parse(row.graphJson) as PathwayGraph;
        if (graph?.stats) out.set(row.id, graph.stats);
      } catch {
        // 单行损坏跳过
      }
    }
  } catch {
    // DB 不可用时返回空 map
  }
  return out;
}

/** 清空内存缓存（测试/刷新用） */
export function clearMemCache(): void {
  memCache.clear();
}
