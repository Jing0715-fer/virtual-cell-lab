import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export const maxDuration = 60;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SimContext {
  pathwayName?: string;
  pathwayId?: string;
  cellName?: string;
  phase?: number;
  activeMolecules?: { label: string; activity: number; phospho?: number }[];
  recentEvents?: string[];
  selectedMolecule?: string;
}

const SYSTEM_PROMPT = `你是"虚拟细胞实验室"内置的分子生物学专家助手（类似一位严谨的细胞信号转导领域教授）。

职责：
1. 解答用户关于信号转导通路（MAPK/PI3K-Akt/Wnt/Notch/TGF-β/JAK-STAT/cAMP/钙信号/mTOR/NF-κB/凋亡/p53/AMPK）、细胞生物学、分子机制的问题
2. 结合当前模拟实验的实时上下文（正在演示的通路、细胞系、已激活的分子、最近事件）给出针对性解读
3. 精确使用分子生物学术语：提到具体的磷酸化残基（如 Ser/Thr/Tyr 位点）、结构域（SH2/SH3/RBD/CRD）、分子开关机制（GDP/GTP、磷酸化/去磷酸化）

风格要求：
- 中文回答，专业、精准、克制
- 回答控制在 250 字以内（面板空间有限），用短段落或少量要点
- 如果不确定，明确说明而不是编造
- 可以引用 KEGG 通路编号`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.message !== 'string' || !body.message.trim()) {
      return NextResponse.json({ error: '缺少 message 字段' }, { status: 400 });
    }
    const history: ChatMessage[] = Array.isArray(body.messages)
      ? body.messages.filter((m: ChatMessage) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-12)
      : [];
    const ctx: SimContext = body.context ?? {};

    // 构建实时上下文段落
    const ctxParts: string[] = [];
    if (ctx.pathwayName) ctxParts.push(`正在演示通路: ${ctx.pathwayName} (${ctx.pathwayId ?? ''})`);
    if (ctx.cellName) ctxParts.push(`虚拟细胞系: ${ctx.cellName}`);
    if (typeof ctx.phase === 'number') {
      const phases = ['静息态', '配体结合', '受体激活', '信号级联', '转录响应'];
      ctxParts.push(`当前信号阶段: ${phases[ctx.phase] ?? ctx.phase}`);
    }
    if (ctx.activeMolecules?.length) {
      ctxParts.push('已激活分子: ' + ctx.activeMolecules.map((m) => `${m.label}(${Math.round(m.activity * 100)}%${m.phospho && m.phospho > 0.3 ? ', P' : ''})`).join(', '));
    }
    if (ctx.selectedMolecule) ctxParts.push(`用户选中的分子: ${ctx.selectedMolecule}`);
    if (ctx.recentEvents?.length) {
      ctxParts.push('最近的模拟事件:\n' + ctx.recentEvents.map((e) => '- ' + e).join('\n'));
    }
    const ctxText = ctxParts.length ? `\n\n[实时模拟上下文]\n${ctxParts.join('\n')}` : '';

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM_PROMPT + ctxText },
        ...history,
        { role: 'user', content: body.message },
      ],
      thinking: { type: 'disabled' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'AI 响应为空，请重试' }, { status: 502 });
    }
    return NextResponse.json({ reply: content });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '内部错误';
    return NextResponse.json({ error: `AI 助手暂不可用: ${msg}` }, { status: 500 });
  }
}
