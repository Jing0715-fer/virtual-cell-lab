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
import { KEGG_FULL_MAP } from '@/data/kegg-full-catalog';
import type { KeggEntry, PathwayCatalogEntry, PathwayGraph, PathwayMeta } from '@/types/kegg';
import { parseKgml } from './kgml-parser';
import { extractCoreSubgraph, mergeDuplicateNodes, CORE_ALGO_VERSION } from './subgraph';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

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
  /** 目录统计缓存（避免每次 /api/pathways 全量 JSON.parse 大表） */
  statsCache?: { version: number; map: Map<string, PathwayGraph['stats']> };
  /** 缓存行数据版本（每次成功 upsert 新通路 +1，使 statsCache 失效） */
  statsVersion?: number;
}
const g = globalThis as unknown as KeggGlobalCache;

/**
 * 代码版本标记：classify/subgraph 算法迭代后递增版本号使内存缓存自动失效，
 * 避免 dev 热重载后 globalThis 仍持有旧算法产物（生产环境版本恒定无影响）
 */
const CACHE_VERSION = '2025-02-v12';
if (g.cacheVersion !== CACHE_VERSION) {
  g.memCache?.clear();
  g.inflight?.clear();
  g.statsCache = undefined;
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

// ---------- hsa id → 官方基因符号映射（lazy 全表，磁盘持久缓存） ----------
/** 符号表磁盘缓存路径（避免 KEGG 限流/抖动时降级提取：写入小图谱） */
const SYMBOL_DISK_CACHE = join(process.cwd(), 'db', 'hsa-symbols.json');

function parseHsaSymbolText(text: string): Map<string, string> {
  const map = new Map<string, string>();
  // 新版 list/hsa 为 4 列 TSV: hsa:id \t 类型 \t 位置 \t "SYM1, SYM2; description"
  for (const line of text.split('\n')) {
    const cols = line.split('\t');
    if (cols.length >= 4 && cols[0].startsWith('hsa:')) {
      const symbol = cols[3].split(';')[0].split(',')[0].trim();
      if (symbol && !symbol.includes(' ')) map.set(cols[0], symbol);
    }
  }
  return map;
}

function readSymbolDiskCache(): Map<string, string> | null {
  try {
    if (!existsSync(SYMBOL_DISK_CACHE)) return null;
    const obj = JSON.parse(readFileSync(SYMBOL_DISK_CACHE, 'utf8')) as Record<string, string>;
    const map = new Map(Object.entries(obj));
    return map.size > 10000 ? map : null;
  } catch {
    return null;
  }
}

function writeSymbolDiskCache(map: Map<string, string>): void {
  try {
    mkdirSync(join(process.cwd(), 'db'), { recursive: true });
    writeFileSync(SYMBOL_DISK_CACHE, JSON.stringify(Object.fromEntries(map)));
  } catch {
    // 磁盘写失败可容忍（下次重新拉取）
  }
}

function getHsaSymbolMap(): Promise<Map<string, string>> {
  if (g.hsaSymbols) return Promise.resolve(g.hsaSymbols);
  if (!g.hsaSymbolsPromise) {
    // 优先磁盘缓存（进程重启/热重载后免网络拉取，彻底规避上游抖动导致的降级提取）
    const disk = readSymbolDiskCache();
    if (disk) {
      g.hsaSymbols = disk;
      g.hsaSymbolsPromise = Promise.resolve(disk);
      return g.hsaSymbolsPromise;
    }
    g.hsaSymbolsPromise = fetchText(`${KEGG_BASE}/list/hsa`, SYMBOL_TIMEOUT)
      .then((text) => {
        const map = parseHsaSymbolText(text);
        g.hsaSymbols = map;
        if (map.size > 10000) writeSymbolDiskCache(map);
        return map;
      })
      .catch(() => {
        // 拉取失败降级为空表（仅退回 label/alias 匹配；不写库防污染）
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
    descriptionEn: catalog.descriptionEn,
    cascade: catalog.cascade,
    cascadeEn: catalog.cascadeEn,
    keggLink: `https://www.kegg.jp/entry/${catalog.id}`,
  };
}

/**
 * 解析目录条目（对外导出）：
 *   - 策划 13 条 → 返回 PATHWAY_MAP 原始条目（保留 seeds/syntheticLigands/教学文案）
 *   - 其余 KEGG 全量目录通路（372）→ 合成空种子条目，由 subgraph 的
 *     度数补齐逻辑自动提取核心子图（hub 驱动，可正常模拟信号传播）
 *   - 不在全量目录中 → null
 */
export function getCatalogEntry(id: string): PathwayCatalogEntry | null {
  const curated = PATHWAY_MAP.get(id);
  if (curated) return curated;
  const entry = KEGG_FULL_MAP.get(id);
  if (!entry) return null;
  return {
    id: entry.id,
    name: entry.name,
    nameZh: entry.nameZh,
    category: entry.categoryZh,
    description: `KEGG 分类：${entry.categoryEn}。全量目录通路：按 KGML 拓扑度数自动提取核心演示子图（无人工策划种子与教学文案，可正常模拟信号传播）。`,
    descriptionEn: `KEGG category: ${entry.categoryEn}. Full-catalog pathway: a core demo subgraph is auto-extracted from KGML topology by node degree (no curated seeds or teaching copy; signal propagation runs normally).`,
    cascade: 'KEGG 全图 · 自动提取核心子图',
    cascadeEn: 'KEGG full map · auto-extracted core subgraph',
    seeds: [],
  };
}

/**
 * 从 Prisma 缓存行恢复 PathwayGraph（source 标记为 db-cache）
 * @param allowLegacy 允许返回旧算法版本的缓存行（仅在线重抓失败时的降级回退）。
 *   旧缓存行（coreVersion 缺失或不等于当前算法版本）默认返回 null，触发
 *   在线重抓以升级到新提取算法（扩容后的完整子图）。
 */
async function readDbCache(
  id: string,
  allowLegacy = false
): Promise<PathwayGraph | null> {
  try {
    const row = await db.pathwayCache.findUnique({ where: { id } });
    if (!row) return null;
    const graph = JSON.parse(row.graphJson) as PathwayGraph;
    if (!allowLegacy && graph.coreVersion !== CORE_ALGO_VERSION) return null;
    // meta 始终以当前代码目录为准（描述/级联/双语文案迭代后无需重抓 KGML, 旧缓存行自动获得新 meta）
    const catalog = getCatalogEntry(id);
    if (catalog) graph.meta = buildMeta(catalog, graph.meta?.name ?? '');
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
    components: parsed.components,
    core,
    coreVersion: CORE_ALGO_VERSION,
    stats: {
      geneCount: enriched.filter((e) => e.type === 'gene').length,
      relationCount: parsed.relations.length,
      coreCount: core.nodes.length,
    },
    fetchedAt: new Date().toISOString(),
    source: 'kegg-live',
  };

  // 写库（SQLite 本地写，失败不阻塞响应）；成功后使 stats 缓存失效。
  // 符号表降级（空表）时跳过写库：种子匹配/别名扩展不完整的提取结果不落盘，
  // 避免网络抖动时用小子图污染缓存行（内存可返回，但磁盘保持可重试状态）
  const symbolTableDegraded = hsaSymbols.size === 0;
  if (!symbolTableDegraded) {
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
      g.statsVersion = (g.statsVersion ?? 0) + 1;
    } catch {
      // 缓存写失败可容忍（下次重新在线抓取）
    }
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

  const catalog = getCatalogEntry(id);
  if (!catalog) {
    throw new Error(`未知通路 id: ${id}（不在 KEGG 全量目录中）`);
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
      // 3. 在线失败 → 回退 DB（并发场景下可能刚被其他请求写入；
      //    旧算法行也接受——降级保可用性，下次在线时自动升级）
      const fallback = await readDbCache(id, true);
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

/**
 * 读取目录中全部通路的缓存统计（无缓存的通路返回 null，不触发在线抓取）
 *
 * 性能：DB 缓存行未来可能达到 372 条 × 数百 KB —— 全表 findMany + 逐行
 * JSON.parse 在每次 /api/pathways 请求上都执行会成为性能灾难。因此在
 * globalThis 上维护 { version, map } 统计缓存：fetchLiveGraph 每次
 * upsert 成功后 version++ 使其失效，本函数命中有效 version 时直接
 * 返回缓存 map，否则才做一次全量解析并缓存。
 */
export async function getCachedStats(): Promise<Map<string, PathwayGraph['stats']>> {
  const version = g.statsVersion ?? 0;
  if (g.statsCache && g.statsCache.version === version) {
    return g.statsCache.map;
  }
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
    // DB 不可用时返回空 map（不缓存失败结果，下次重试）
    return out;
  }
  g.statsCache = { version, map: out };
  return out;
}

/** 清空内存缓存（测试/刷新用） */
export function clearMemCache(): void {
  memCache.clear();
}
