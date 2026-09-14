/**
 * GET /api/pathways —— KEGG 全量人类通路目录（372 条）
 *
 * 返回 KEGG_FULL_LIST 全量条目 + 已缓存通路的统计（stats）。
 * 不触发在线抓取：未缓存的通路 stats 为 null（首次由 /api/pathways/[id] 拉取）。
 * 策划 13 条（curated=true）含完整教学文案/种子，在通路库中以策划级展示。
 */

import { NextResponse } from 'next/server';
import { KEGG_FULL_LIST } from '@/data/kegg-full-catalog';
import { getCachedStats } from '@/lib/kegg';

export const dynamic = 'force-dynamic';

export async function GET() {
  const statsById = await getCachedStats();
  const pathways = KEGG_FULL_LIST.map((entry) => ({
    id: entry.id,
    name: entry.name,
    nameZh: entry.nameZh,
    categoryZh: entry.categoryZh,
    categoryEn: entry.categoryEn,
    curated: entry.curated,
    stats: statsById.get(entry.id) ?? null,
  }));
  return NextResponse.json({ pathways });
}
