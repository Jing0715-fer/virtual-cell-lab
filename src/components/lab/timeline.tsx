'use client';

/**
 * 分子事件时间线 —— 实时事件流（精确到残基/结构域级别的分子事件描述）
 */
import { useEffect, useRef } from 'react';
import { Radio } from 'lucide-react';
import type { SimEvent } from '@/lib/simulation/engine';
import { useLabStore } from '@/store/lab-store';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const KIND_STYLE: Record<string, { dot: string; labelKey: string; text: string }> = {
  binding: { dot: 'bg-amber-400', labelKey: 'tl.kind.binding', text: 'text-amber-200/90' },
  activation: { dot: 'bg-emerald-400', labelKey: 'tl.kind.activation', text: 'text-emerald-100/90' },
  phosphorylation: { dot: 'bg-emerald-300', labelKey: 'tl.kind.phosphorylation', text: 'text-emerald-100/90' },
  inhibition: { dot: 'bg-rose-400', labelKey: 'tl.kind.inhibition', text: 'text-rose-200/90' },
  expression: { dot: 'bg-yellow-500', labelKey: 'tl.kind.expression', text: 'text-yellow-100/90' },
  repression: { dot: 'bg-rose-300', labelKey: 'tl.kind.repression', text: 'text-rose-200/90' },
  mutation: { dot: 'bg-red-500', labelKey: 'tl.kind.mutation', text: 'text-red-200' },
  info: { dot: 'bg-slate-500', labelKey: 'tl.kind.info', text: 'text-slate-400' },
  phase: { dot: 'bg-teal-400', labelKey: 'tl.kind.phase', text: 'text-teal-200/90' },
  reset: { dot: 'bg-slate-400', labelKey: 'tl.kind.reset', text: 'text-slate-300' },
};

function EventRow({ ev }: { ev: SimEvent }) {
  const { t } = useLang();
  const s = KIND_STYLE[ev.kind] ?? KIND_STYLE.info;
  return (
    <li className="group relative pl-6">
      <span className={cn('absolute left-[7px] top-[9px] h-1.5 w-1.5 rounded-full', s.dot, 'shadow-[0_0_6px_currentColor]')} />
      <div className="border-b border-white/5 py-1.5">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] text-slate-600">{ev.simTime}</span>
          <span className={cn('rounded px-1 py-px text-[9.5px] font-medium', 'bg-white/5', s.text)}>{t(s.labelKey)}</span>
          {ev.nodeLabel && (
            <span className="font-mono text-[11px] text-slate-200">{ev.nodeLabel}</span>
          )}
        </div>
        <p className={cn('mt-0.5 text-[11.5px] leading-[18px]', s.text)}>{ev.text}</p>
      </div>
    </li>
  );
}

export function EventTimeline() {
  const { t } = useLang();
  const events = useLabStore((s) => s.events);
  const selectNode = useLabStore((s) => s.selectNode);
  const listRef = useRef<HTMLDivElement>(null);
  // 最新在前
  const sorted = [...events].reverse();

  useEffect(() => {
    // 新事件到达时闪 indicator
  }, [events.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-400" />
        <span className="text-xs font-medium text-slate-200">{t('tl.title')}</span>
        <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
          {events.length}
        </span>
      </div>
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-1 lab-scrollbar"
        onClick={(e) => {
          const target = (e.target as HTMLElement).closest('[data-node]');
          const id = target?.getAttribute('data-node');
          if (id) selectNode(id);
        }}
      >
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-600">{t('tl.waiting')}</p>
        ) : (
          <ul className="relative">
            <span className="absolute left-[8px] top-1 bottom-1 w-px bg-gradient-to-b from-emerald-500/40 via-slate-700/60 to-transparent" />
            {sorted.map((ev) => (
              <div key={ev.id} data-node={ev.nodeId ?? ''} className={ev.nodeId ? 'cursor-pointer' : ''}>
                <EventRow ev={ev} />
              </div>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
