/**
 * GET /api/pathways —— 通路目录（13 条信号转导通路）
 *
 * 返回 catalog 全量条目 + 已缓存通路的统计（stats）。
 * 不触发在线抓取：未缓存的通路 stats 为 null（首次由 /api/pathways/[id] 拉取）。
 */

import { NextResponse } from 'next/server';
import { PATHWAY_CATALOG } from '@/data/pathway-catalog';
import { getCachedStats } from '@/lib/kegg';

export const dynamic = 'force-dynamic';

export async function GET() {
  const statsById = await getCachedStats();
  const pathways = PATHWAY_CATALOG.map((entry) => ({
    ...entry,
    stats: statsById.get(entry.id) ?? null,
  }));
  return NextResponse.json({ pathways });
}
