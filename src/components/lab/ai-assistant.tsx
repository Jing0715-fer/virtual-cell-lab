'use client';

/**
 * AI 分子生物学助手 —— 右栏聊天面板
 * 每次提问自动注入实时模拟上下文（通路/细胞系/激活分子/最近事件）
 */
import { useRef, useState, useEffect } from 'react';
import { Sparkles, Send, Loader2, RotateCcw } from 'lucide-react';
import { useLabStore } from '@/store/lab-store';
import { CELL_TYPE_MAP } from '@/data/cell-types';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

export function AiAssistant() {
  const { t, lang } = useLang();
  // 欢迎语按当前语言动态渲染（对话历史 state 不含欢迎语，重置后仅回到欢迎语）
  const welcome: Msg = { role: 'assistant', content: t('ai.welcome') };
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const graph = useLabStore((s) => s.graph);
  const nodeStates = useLabStore((s) => s.nodeStates);
  const events = useLabStore((s) => s.events);
  const phase = useLabStore((s) => s.phase);
  const cellId = useLabStore((s) => s.cellId);
  const selectedNode = useLabStore((s) => s.selectedNode);
  const cell = CELL_TYPE_MAP.get(cellId);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const buildContext = () => {
    const activeMolecules = graph
      ? Object.entries(nodeStates)
          .filter(([, s]) => s.activity > 0.45)
          .sort((a, b) => b[1].activity - a[1].activity)
          .slice(0, 8)
          .map(([id, s]) => {
            const n = graph.core.nodes.find((x) => x.id === id);
            return { label: n?.label ?? id, activity: s.activity, phospho: s.phospho };
          })
      : [];
    const selected = graph?.core.nodes.find((n) => n.id === selectedNode);
    return {
      pathwayName: graph?.meta.nameZh,
      pathwayId: graph?.meta.id,
      cellName: cell ? `${cell.name} (${cell.nameEn})` : undefined,
      phase,
      activeMolecules,
      recentEvents: events.slice(-5).map((e) => e.text),
      selectedMolecule: selected ? `${selected.label}（${selected.kind}，${selected.compartment}）` : undefined,
    };
  };

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput('');
    const next = [...messages, { role: 'user' as const, content: msg }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          messages: next.slice(0, -1),
          context: buildContext(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.reply) throw new Error(data.error ?? t('ai.reqFail'));
      setMessages([...next, { role: 'assistant', content: data.reply }]);
    } catch (e) {
      setMessages([
        ...next,
        { role: 'assistant', content: `⚠ ${e instanceof Error ? e.message : t('ai.unavailable')}` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const quickPrompts = graph
    ? [
        lang === 'zh'
          ? `解释 ${graph.meta.nameZh} 的核心级联机制`
          : `Explain the core cascade mechanism of ${graph.meta.name}`,
        phase >= 3 ? t('ai.q.downstream') : t('ai.q.timing'),
        cell?.mutations?.length ? t('ai.q.mutations') : t('ai.q.feedback'),
      ]
    : [t('ai.q.mapk')];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <Sparkles className="h-3.5 w-3.5 text-amber-300" />
        <span className="text-xs font-medium text-slate-200">{t('ai.title')}</span>
        <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-1.5 py-px text-[9px] text-amber-300/90">
          {t('ai.ctxBadge')}
        </span>
        <button
          onClick={() => setMessages([])}
          className="ml-auto text-slate-500 transition hover:text-slate-300"
          title={t('ai.clear')}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 lab-scrollbar">
        {[welcome, ...messages].map((m, i) => (
          <div
            key={i}
            className={cn(
              'max-w-[92%] rounded-xl px-3 py-2 text-[11.5px] leading-[18px]',
              m.role === 'user'
                ? 'ml-auto border border-emerald-500/25 bg-emerald-500/10 text-emerald-50'
                : 'border border-white/8 bg-slate-900/70 text-slate-300',
            )}
          >
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-slate-900/70 px-3 py-2 text-[11.5px] text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
            {t('ai.thinking')}
          </div>
        )}
      </div>

      <div className="border-t border-white/5 p-2.5">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {quickPrompts.slice(0, 2).map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              disabled={busy}
              className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-slate-400 transition hover:border-emerald-500/40 hover:text-emerald-200 disabled:opacity-50"
            >
              {q.length > 26 ? q.slice(0, 25) + '…' : q}
            </button>
          ))}
        </div>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('ai.placeholder')}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-[11.5px] text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
          />
          <Button
            type="submit"
            size="icon"
            disabled={busy || !input.trim()}
            className="h-9 w-9 shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
