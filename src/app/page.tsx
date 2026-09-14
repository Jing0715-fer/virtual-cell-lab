'use client';

import { motion } from 'framer-motion';
import {
  FlaskConical, Dna, Activity, Database, MousePointerClick, Cpu,
  ArrowDown, ShieldCheck, BookOpen, Layers, Languages,
} from 'lucide-react';
import { CellPicker } from '@/components/lab/cell-picker';
import { LabWorkspace } from '@/components/lab/workspace';
import { HeroVisual } from '@/components/lab/hero-visual';
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

/** 区块标题（索引号 + 荧光短线 + 渐变发丝线） */
function SectionHeading({
  index, title, accent, desc, right,
}: {
  index: string;
  title: string;
  accent: string;
  desc: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-end gap-3.5">
          <span className="select-none font-mono text-[11px] font-medium tracking-[0.2em] text-emerald-500/50">{index}</span>
          <div className="relative">
            <h2 className="text-xl font-semibold tracking-tight text-slate-100">
              {title}<span className="text-emerald-400">{accent}</span>
            </h2>
            <span className="absolute -left-3.5 -top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" aria-hidden />
          </div>
        </div>
        {right}
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        <p className="text-[13px] text-slate-500">{desc}</p>
        <span className="h-px flex-1 bg-gradient-to-r from-emerald-500/20 via-white/5 to-transparent" aria-hidden />
      </div>
    </div>
  );
}

export default function Home() {
  const { t, lang } = useLang();
  const stats = [
    { icon: Dna, label: t('stat.cellLines'), value: '7' },
    { icon: Activity, label: t('stat.pathways'), value: '372' },
    { icon: Database, label: t('stat.entries'), value: '6,000+' },
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
            {[
              ['#cells', t('nav.cells')],
              ['#lab', t('nav.lab')],
              ['#method', t('nav.method')],
            ].map(([href, label]) => (
              <a key={href} href={href} className="group relative py-1 transition hover:text-emerald-300">
                {label}
                <span className="absolute inset-x-0 -bottom-px h-px origin-left scale-x-0 bg-gradient-to-r from-emerald-400 to-teal-400 transition-transform duration-300 group-hover:scale-x-100" aria-hidden />
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.07] px-2.5 py-1 text-[10.5px] text-emerald-300/90 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {t('status.online')}
            </span>
            <span className="hidden rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] text-slate-500 md:inline">hsa · 372 {t('status.pathways')}</span>
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
                  <div
                    key={s.label}
                    className="group relative overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-all duration-300 hover:border-emerald-500/25 hover:bg-emerald-500/[0.03]"
                  >
                    <span className="absolute inset-y-0 left-0 w-px scale-y-0 bg-emerald-400/60 transition-transform duration-300 group-hover:scale-y-100" aria-hidden />
                    <s.icon className="h-3.5 w-3.5 text-emerald-400/80" />
                    <div className="mt-1.5 font-mono text-[15px] font-semibold text-slate-100">{s.value}</div>
                    <div className="text-[10px] text-slate-500">{s.label}</div>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* 装饰性微细胞（AI 渲染 + 仪器化叠加层） */}
            <HeroVisual />
          </div>
        </section>

        {/* ============ 细胞系选择 ============ */}
        <section id="cells" className="mx-auto max-w-[1680px] scroll-mt-20 px-4 py-12 lg:px-6">
          <SectionHeading
            index="01"
            title={t('cells.h2a')}
            accent={t('cells.h2b')}
            desc={t('cells.p')}
            right={
              <div className="flex items-center gap-2 text-[11px] text-slate-600">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/60" />
                {t('cells.ref')}
              </div>
            }
          />
          <CellPicker />
        </section>

        {/* ============ 模拟实验台 ============ */}
        <section id="lab" className="mx-auto max-w-[1680px] scroll-mt-20 px-4 pb-12 lg:px-6">
          <SectionHeading
            index="02"
            title={t('lab.h2a')}
            accent={t('lab.h2b')}
            desc={t('lab.p')}
          />
          <LabWorkspace />
        </section>

        {/* ============ 数据与方法 ============ */}
        <section id="method" className="mx-auto max-w-[1680px] scroll-mt-20 px-4 pb-14 lg:px-6">
          <SectionHeading
            index="03"
            title={t('nav.method')}
            accent=""
            desc={lang === 'zh' ? '科学性与可复现性说明' : 'Scientific rigor & reproducibility'}
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {METHOD.map((m, i) => (
              <div
                key={m.title.en}
                className="group relative overflow-hidden rounded-2xl border border-white/8 bg-slate-950/40 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/30 hover:shadow-[0_12px_32px_-12px_rgba(16,185,129,0.25)]"
              >
                {/* 顶部荧光细线（hover 加亮） */}
                <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden />
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.12] to-transparent transition-colors duration-300 group-hover:border-emerald-500/45">
                    <m.icon className="h-4.5 w-4.5 text-emerald-400" />
                  </div>
                  <span className="font-mono text-[10px] tracking-[0.18em] text-slate-600">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <h3 className="mt-3 text-[13.5px] font-semibold text-slate-100">{m.title[lang]}</h3>
                <p className="mt-2 text-[11.5px] leading-[19px] text-slate-400">{m.desc[lang]}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.03] p-3.5">
            <span className="mt-px select-none text-[13px] leading-5 text-amber-400/80">⚠</span>
            <p className="text-[11px] leading-5 text-slate-500">
              {lang === 'zh' ? (
                <>
                  演示说明：模拟时间为压缩尺度（1 tick = 0.5 s），真实生物学时序差异较大（如 ERK 激活 ~1–5 min、即早基因转录 ~15–30 min、T 细胞增殖需数小时）；
                  动力学参数为教学演示设定，非定量系统生物学模型。通路数据引用自 KEGG (Kanehisa Laboratory)，教学用途。
                </>
              ) : (
                <>
                  Demonstration notice: simulated time runs on a compressed scale (1 tick = 0.5 s) and diverges from real biological timing (ERK activation ~1–5 min, immediate-early gene transcription ~15–30 min, T-cell proliferation takes hours);
                  kinetic parameters are pedagogical defaults, not quantitative systems-biology models. Pathway data cited from KEGG (Kanehisa Laboratory), for educational use.
                </>
              )}
            </p>
          </div>
        </section>
      </main>

      {/* ============ 页脚（吸底） ============ */}
      <footer className="mt-auto border-t border-white/5 bg-[#02040c]">
        {/* 顶部荧光发丝线 */}
        <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent" aria-hidden />
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 lg:px-6">
          <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
            <div className="flex h-5 w-5 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/[0.08]">
              <Dna className="h-3 w-3 text-emerald-400/80" />
            </div>
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
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-slate-600">
            <span className="h-1 w-1 rounded-full bg-emerald-500/50" aria-hidden />
            Next.js 16 · Prisma · zustand · z-ai-web-dev-sdk
          </span>
        </div>
      </footer>
    </div>
    </QueryProvider>
  );
}
