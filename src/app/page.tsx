'use client';

import { motion } from 'framer-motion';
import {
  FlaskConical, Dna, Activity, Database, MousePointerClick, Cpu,
  ArrowDown, ShieldCheck, BookOpen, Layers, Languages,
} from 'lucide-react';
import { CellPicker } from '@/components/lab/cell-picker';
import { LabWorkspace } from '@/components/lab/workspace';
import { QueryProvider } from '@/components/lab/providers';
import { LangProvider, useLang } from '@/lib/i18n';
// LangProvider 已提升至根布局（layout.tsx）——本文件直接消费 useLang

/** 方法卡（双语） */
const METHOD: { icon: typeof Dna; title: { zh: string; en: string }; desc: { zh: string; en: string } }[] = [
  {
    icon: Database,
    title: { zh: 'KEGG 实时数据源', en: 'Live KEGG data' },
    desc: {
      zh: '通路拓扑经 KEGG REST API（rest.kegg.jp）实时获取 KGML 并解析为结构化信号网络：entry（分子/化合物）→ relation（激活/抑制/磷酸化/转录表达），Prisma 持久化缓存，二次访问 <10ms。',
      en: 'Pathway topology is fetched live as KGML from the KEGG REST API (rest.kegg.jp) and parsed into a structured signaling network: entries (molecules/compounds) → relations (activation / inhibition / phosphorylation / transcription), persisted with Prisma for <10 ms repeat access.',
    },
  },
  {
    icon: Layers,
    title: { zh: '分子区室定位', en: 'Compartmental mapping' },
    desc: {
      zh: '每个信号分子按功能注释定位到细胞区室：配体（细胞外）→ 受体/通道（磷脂双分子层）→ 激酶/接头蛋白/第二信使（细胞质）→ 转录因子/靶基因（细胞核），并按信号层级（tier 0–6）排布。',
      en: 'Every signaling molecule is localized by functional annotation: ligands (extracellular) → receptors/channels (lipid bilayer) → kinases/adapters/second messengers (cytoplasm) → transcription factors/target genes (nucleus), arranged by signaling tier (0–6).',
    },
  },
  {
    icon: Activity,
    title: { zh: '离散动力学模型', en: 'Discrete kinetics' },
    desc: {
      zh: '节点活性沿信号边传播：激活/磷酸化边提升目标活性，抑制边产生衰减；磷酸化修饰、转录延迟、配体洗脱与负反馈（如 DUSP1-ERK、SOCS-JAK）均纳入模型；突变等位基因（KRAS G12D）锁定组成性活性。',
      en: 'Node activity propagates along edges: activation/phosphorylation raises target activity while inhibition decays it; phosphorylation marks, transcriptional delay, ligand washout and negative feedback (DUSP1–ERK, SOCS–JAK) are modeled; mutant alleles (KRAS G12D) lock constitutive activity.',
    },
  },
  {
    icon: BookOpen,
    title: { zh: '分子级精确注释', en: 'Residue-level annotation' },
    desc: {
      zh: '关键级联步骤精确到残基与结构域：例如 "MEK1 双磷酸化 ERK2 Thr185/Tyr187"、"GRB2 SH2 域结合 EGFR pY1068"、"Calcineurin 去磷酸化 NFAT SRR1 区暴露 NLS"——全部基于 KEGG hsa 图谱与经典生化教材策划。',
      en: 'Key cascade steps resolve to residues and domains — e.g. "MEK1 dual-phosphorylates ERK2 Thr185/Tyr187", "GRB2 SH2 binds EGFR pY1068", "calcineurin dephosphorylates NFAT SRR1 exposing NLS" — curated from KEGG hsa maps and canonical biochemistry texts.',
    },
  },
];

/** 语言切换按钮（中/EN） */
function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <button
      onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
      aria-label={lang === 'zh' ? 'Switch to English' : '切换到中文'}
      title={lang === 'zh' ? 'Switch to English' : '切换到中文'}
      className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 font-mono text-[10.5px] text-slate-400 transition hover:border-teal-400/40 hover:text-teal-200"
    >
      <Languages className="h-3.5 w-3.5" />
      <span className={lang === 'zh' ? 'text-emerald-300' : 'text-slate-500'}>中</span>
      <span className="text-slate-600">/</span>
      <span className={lang === 'en' ? 'text-emerald-300' : 'text-slate-500'}>EN</span>
    </button>
  );
}

export default function Home() {
  const { t, lang } = useLang();
  const stats = [
    { icon: Dna, label: t('stat.cellLines'), value: '7' },
    { icon: Activity, label: t('stat.pathways'), value: '13' },
    { icon: Database, label: t('stat.entries'), value: '1,700+' },
    { icon: Cpu, label: t('stat.notes'), value: '200+' },
  ];
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
                <div className="text-[9.5px] uppercase tracking-[0.22em] text-slate-500">{t('app.title')}</div>
              </div>
          </div>

          <nav className="ml-6 hidden items-center gap-5 text-[12.5px] text-slate-400 md:flex">
            <a href="#cells" className="transition hover:text-emerald-300">{t('nav.cells')}</a>
            <a href="#lab" className="transition hover:text-emerald-300">{t('nav.lab')}</a>
            <a href="#method" className="transition hover:text-emerald-300">{t('nav.method')}</a>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.07] px-2.5 py-1 text-[10.5px] text-emerald-300/90 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {t('status.online')}
            </span>
            <span className="hidden rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] text-slate-500 md:inline">hsa · 13 {t('status.pathways')}</span>
            <LangSwitch />
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
                {t('hero.badge')}
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.08 }}
                className="mt-5 text-4xl font-bold leading-[1.12] tracking-tight text-slate-50 sm:text-5xl lg:text-[56px]"
              >
                {t('hero.h1a')}
                <br />
                <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                  {t('hero.h1b')}
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.16 }}
                className="mt-5 max-w-xl text-[15px] leading-7 text-slate-400"
              >
                {t('hero.p')}
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
                  {t('hero.cta1')}
                  <ArrowDown className="h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5" />
                </a>
                <a
                  href="#cells"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-2.5 text-[13.5px] text-slate-300 transition hover:border-emerald-500/30 hover:text-emerald-200"
                >
                  {t('hero.cta2')}
                </a>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.35 }}
                className="mt-9 grid max-w-lg grid-cols-2 gap-3 sm:grid-cols-4"
              >
                {stats.map((s) => (
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
                {t('cells.h2a')}<span className="text-emerald-400">{t('cells.h2b')}</span>
              </h2>
              <p className="mt-1.5 text-[13px] text-slate-500">
                {t('cells.p')}
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/60" />
              {t('cells.ref')}
            </div>
          </div>
          <CellPicker />
        </section>

        {/* ============ 模拟实验台 ============ */}
        <section id="lab" className="mx-auto max-w-[1680px] scroll-mt-20 px-4 pb-12 lg:px-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-100">
                {t('lab.h2a')}<span className="text-emerald-400">{t('lab.h2b')}</span>
              </h2>
              <p className="mt-1.5 text-[13px] text-slate-500">
                {t('lab.p')}
              </p>
            </div>
          </div>
          <LabWorkspace />
        </section>

        {/* ============ 数据与方法 ============ */}
        <section id="method" className="mx-auto max-w-[1680px] scroll-mt-20 px-4 pb-14 lg:px-6">
          <div className="mb-5">
            <h2 className="text-xl font-semibold tracking-tight text-slate-100">
              {t('nav.method')}
            </h2>
            <p className="mt-1.5 text-[13px] text-slate-500">{lang === 'zh' ? '科学性与可复现性说明' : 'Scientific rigor & reproducibility'}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {METHOD.map((m) => (
              <div key={m.title.en} className="rounded-2xl border border-white/8 bg-slate-950/40 p-4 transition-colors hover:border-emerald-500/25">
                <m.icon className="h-5 w-5 text-emerald-400" />
                <h3 className="mt-3 text-[13.5px] font-semibold text-slate-100">{m.title[lang]}</h3>
                <p className="mt-2 text-[11.5px] leading-[19px] text-slate-400">{m.desc[lang]}</p>
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
