'use client';

import { motion } from 'framer-motion';
import {
  FlaskConical, Dna, Activity, Database, MousePointerClick, Cpu,
  ArrowDown, ShieldCheck, BookOpen, Layers,
} from 'lucide-react';
import { CellPicker } from '@/components/lab/cell-picker';
import { LabWorkspace } from '@/components/lab/workspace';
import { QueryProvider } from '@/components/lab/providers';

const STATS = [
  { icon: Dna, label: '虚拟细胞系', value: '7 种' },
  { icon: Activity, label: 'KEGG 信号通路', value: '13 条' },
  { icon: Database, label: '通路分子条目', value: '1,700+' },
  { icon: Cpu, label: '分子事件注释', value: '200+' },
];

const METHOD = [
  {
    icon: Database,
    title: 'KEGG 实时数据源',
    desc: '通路拓扑经 KEGG REST API（rest.kegg.jp）实时获取 KGML 并解析为结构化信号网络：entry（分子/化合物）→ relation（激活/抑制/磷酸化/转录表达），Prisma 持久化缓存，二次访问 <10ms。',
  },
  {
    icon: Layers,
    title: '分子区室定位',
    desc: '每个信号分子按功能注释定位到细胞区室：配体（细胞外）→ 受体/通道（磷脂双分子层）→ 激酶/接头蛋白/第二信使（细胞质）→ 转录因子/靶基因（细胞核），并按信号层级（tier 0–6）排布。',
  },
  {
    icon: Activity,
    title: '离散动力学模型',
    desc: '节点活性沿信号边传播：激活/磷酸化边提升目标活性，抑制边产生衰减；磷酸化修饰、转录延迟、配体洗脱与负反馈（如 DUSP1-ERK、SOCS-JAK）均纳入模型；突变等位基因（KRAS G12D）锁定组成性活性。',
  },
  {
    icon: BookOpen,
    title: '分子级精确注释',
    desc: '关键级联步骤精确到残基与结构域：例如 "MEK1 双磷酸化 ERK2 Thr185/Tyr187"、"GRB2 SH2 域结合 EGFR pY1068"、"Calcineurin 去磷酸化 NFAT SRR1 区暴露 NLS"——全部基于 KEGG hsa 图谱与经典生化教材策划。',
  },
];

export default function Home() {
  return (
    <QueryProvider>
    <div className="flex min-h-screen flex-col bg-[#030812]">
      {/* ============ 头部 ============ */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#030812]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1680px] items-center gap-3 px-4 lg:px-6">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10">
              <Dna className="h-4.5 w-4.5 text-emerald-400" />
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            </div>
            <div>
              <div className="text-[15px] font-semibold leading-tight tracking-tight text-slate-100">
                VirtualCell <span className="text-emerald-400">Lab</span>
              </div>
              <div className="text-[9.5px] uppercase tracking-[0.22em] text-slate-500">虚拟细胞实验室</div>
            </div>
          </div>

          <nav className="ml-6 hidden items-center gap-5 text-[12.5px] text-slate-400 md:flex">
            <a href="#cells" className="transition hover:text-emerald-300">细胞系</a>
            <a href="#lab" className="transition hover:text-emerald-300">模拟实验台</a>
            <a href="#method" className="transition hover:text-emerald-300">数据与方法</a>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.07] px-2.5 py-1 text-[10.5px] text-emerald-300/90 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              KEGG REST · 在线
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] text-slate-500">
              hsa · 13 pathways
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ============ Hero ============ */}
        <section className="bio-grid relative overflow-hidden border-b border-white/5">
          <div className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-emerald-500/[0.07] blur-[120px]" />
          <div className="pointer-events-none absolute -left-40 top-20 h-[380px] w-[380px] rounded-full bg-teal-500/[0.05] blur-[100px]" />

          <div className="mx-auto grid max-w-[1680px] items-center gap-8 px-4 py-14 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-6 lg:py-20">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/[0.07] px-3.5 py-1.5 text-[11px] text-emerald-300/90"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                分子级信号转导演示 · KEGG 数据驱动
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.08 }}
                className="mt-5 text-4xl font-bold leading-[1.12] tracking-tight text-slate-50 sm:text-5xl lg:text-[56px]"
              >
                在虚拟细胞中
                <br />
                <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                  观看信号的旅程
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.16 }}
                className="mt-5 max-w-xl text-[15px] leading-7 text-slate-400"
              >
                从 KEGG 通路数据库实时获取信号转导图谱，映射到可交互的虚拟细胞：
                配体扩散 → 受体二聚化 → 胞质激酶级联 → 转录因子入核 → 靶基因表达。
                每一步都精确到<span className="text-emerald-300">磷酸化残基与结构域</span>——
                这是教科书插图无法给予的动态直觉。
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.24 }}
                className="mt-7 flex flex-wrap gap-3"
              >
                <a
                  href="#lab"
                  className="group inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-5 py-2.5 text-[13.5px] font-medium text-emerald-200 transition-all hover:bg-emerald-500/25 hover:shadow-[0_0_24px_rgba(52,211,153,0.3)]"
                >
                  <MousePointerClick className="h-4 w-4" />
                  进入模拟实验台
                  <ArrowDown className="h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5" />
                </a>
                <a
                  href="#cells"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-2.5 text-[13.5px] text-slate-300 transition hover:border-emerald-500/30 hover:text-emerald-200"
                >
                  浏览细胞系
                </a>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.35 }}
                className="mt-9 grid max-w-lg grid-cols-2 gap-3 sm:grid-cols-4"
              >
                {STATS.map((s) => (
                  <div key={s.label} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
                    <s.icon className="h-3.5 w-3.5 text-emerald-400/80" />
                    <div className="mt-1.5 font-mono text-[15px] font-semibold text-slate-100">{s.value}</div>
                    <div className="text-[10px] text-slate-500">{s.label}</div>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* 装饰性微细胞 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="hidden lg:block"
            >
              <svg viewBox="0 0 420 320" className="w-full">
                <defs>
                  <radialGradient id="heroCell" cx="0.5" cy="0.45" r="0.6">
                    <stop offset="0%" stopColor="#134e4a" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#022c22" stopOpacity="0.4" />
                  </radialGradient>
                </defs>
                <circle cx="210" cy="160" r="130" fill="url(#heroCell)" stroke="#14b8a6" strokeWidth="1.5" opacity="0.9" />
                <circle cx="210" cy="160" r="118" fill="none" stroke="#2dd4bf" strokeWidth="0.6" strokeDasharray="4 6" opacity="0.4" />
                <circle cx="245" cy="150" r="44" fill="#022c22" stroke="#34d399" strokeWidth="1.4" opacity="0.9" />
                <circle cx="257" cy="141" r="8" fill="#f59e0b" opacity="0.35" />
                <g stroke="#f59e0b" fill="none" opacity="0.6">
                  <ellipse rx="26" ry="11" cx="130" cy="110" transform="rotate(-18 130 110)" />
                  <ellipse rx="22" ry="9" cx="140" cy="230" transform="rotate(14 140 230)" />
                </g>
                {/* 信号流 */}
                <path d="M 70 60 C 130 90, 150 110, 205 150" stroke="#34d399" strokeWidth="2" fill="none" opacity="0.75" className="edge-flow" />
                <path d="M 210 160 C 230 170, 250 170, 258 155" stroke="#fbbf24" strokeWidth="2" fill="none" opacity="0.7" className="edge-flow" />
                <circle r="4" fill="#34d399">
                  <animateMotion path="M 70 60 C 130 90, 150 110, 205 150" dur="2.4s" repeatCount="indefinite" />
                </circle>
                <circle cx="70" cy="60" r="7" fill="#fbbf24" opacity="0.9" />
                <text x="70" y="42" textAnchor="middle" fontSize="10" fill="#fde68a" fontFamily="monospace">EGF</text>
                <text x="210" y="128" textAnchor="middle" fontSize="10" fill="#99f6e4" fontFamily="monospace">N</text>
              </svg>
            </motion.div>
          </div>
        </section>

        {/* ============ 细胞系选择 ============ */}
        <section id="cells" className="mx-auto max-w-[1680px] scroll-mt-20 px-4 py-12 lg:px-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-100">
                选择虚拟<span className="text-emerald-400">细胞系</span>
              </h2>
              <p className="mt-1.5 text-[13px] text-slate-500">
                每种细胞携带不同的受体组与通路网络 —— 癌细胞模型内置驱动突变，无需配体即可观察失控的信号转导
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/60" />
              形态学参数参照 Alberts MBoC / Ross Histology
            </div>
          </div>
          <CellPicker />
        </section>

        {/* ============ 模拟实验台 ============ */}
        <section id="lab" className="mx-auto max-w-[1680px] scroll-mt-20 px-4 pb-12 lg:px-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-100">
                模拟<span className="text-emerald-400">实验台</span>
              </h2>
              <p className="mt-1.5 text-[13px] text-slate-500">
                注射配体启动信号级联 · 双视图（细胞 / KEGG 图谱）联动 · 点击分子查看档案 · 时间线实时输出分子事件
              </p>
            </div>
          </div>
          <LabWorkspace />
        </section>

        {/* ============ 数据与方法 ============ */}
        <section id="method" className="mx-auto max-w-[1680px] scroll-mt-20 px-4 pb-14 lg:px-6">
          <div className="mb-5">
            <h2 className="text-xl font-semibold tracking-tight text-slate-100">
              数据与<span className="text-emerald-400">方法</span>
            </h2>
            <p className="mt-1.5 text-[13px] text-slate-500">科学性与可复现性说明</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {METHOD.map((m) => (
              <div key={m.title} className="rounded-2xl border border-white/8 bg-slate-950/40 p-4 transition-colors hover:border-emerald-500/25">
                <m.icon className="h-5 w-5 text-emerald-400" />
                <h3 className="mt-3 text-[13.5px] font-semibold text-slate-100">{m.title}</h3>
                <p className="mt-2 text-[11.5px] leading-[19px] text-slate-400">{m.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-[11px] leading-5 text-slate-500">
            ⚠ 演示说明：模拟时间为压缩尺度（1 tick = 0.5 s），真实生物学时序差异较大（如 ERK 激活 ~1–5 min、即早基因转录 ~15–30 min、T 细胞增殖需数小时）；
            动力学参数为教学演示设定，非定量系统生物学模型。通路数据引用自 KEGG (Kanehisa Laboratory)，教学用途。
          </p>
        </section>
      </main>

      {/* ============ 页脚（吸底） ============ */}
      <footer className="mt-auto border-t border-white/5 bg-[#02040c]">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 lg:px-6">
          <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
            <Dna className="h-3.5 w-3.5 text-emerald-500/60" />
            VirtualCell Lab · 虚拟细胞实验室
          </div>
          <a
            href="https://www.kegg.jp/kegg/rest.html"
            target="_blank"
            rel="noreferrer"
            className="text-[11.5px] text-slate-500 transition hover:text-emerald-300"
          >
            Pathway data: KEGG REST API (Kanehisa Laboratory)
          </a>
          <span className="ml-auto font-mono text-[10px] text-slate-600">
            Next.js 16 · Prisma · zustand · z-ai-web-dev-sdk
          </span>
        </div>
      </footer>
    </div>
    </QueryProvider>
  );
}
