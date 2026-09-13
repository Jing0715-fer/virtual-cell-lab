/**
 * GET /api/pathways/[id] —— 完整通路图（PathwayGraph JSON）
 *
 * - id 不在目录中 → 404
 * - KEGG 上游不可用且无本地缓存 → 503
 * - 命中缓存 → source: 'db-cache'；首次在线解析 → 'kegg-live'
 */

import { NextRequest, NextResponse } from 'next/server';
import { PATHWAY_MAP } from '@/data/pathway-catalog';
import { getPathwayGraph } from '@/lib/kegg';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!PATHWAY_MAP.has(id)) {
    return NextResponse.json(
      { error: `未知通路 id: ${id}，目录中共 13 条信号转导通路` },
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
