/**
 * GET /api/pathways/[id] —— 完整通路图（PathwayGraph JSON）
 *
 * 支持任意 KEGG 全量目录通路（372 条，按需在线抓取）：
 *   - 策划 13 条走策划目录（种子/文案）；其余合成空种子条目自动提取子图
 *   - id 不在全量目录中 → 404
 *   - KEGG 上游不可用且无本地缓存 → 503
 *   - 命中缓存 → source: 'db-cache'；首次在线解析 → 'kegg-live'
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCatalogEntry, getPathwayGraph } from '@/lib/kegg';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!getCatalogEntry(id)) {
    return NextResponse.json(
      { error: `未知通路 id: ${id}（不在 KEGG 全量目录 372 条人类通路中）` },
      { status: 404 }
    );
  }

  try {
    const graph = await getPathwayGraph(id);
    return NextResponse.json(graph);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'KEGG 上游暂时不可用，且无本地缓存',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 }
    );
  }
}
