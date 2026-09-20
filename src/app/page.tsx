'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  FlaskConical, Dna, Activity, Database, MousePointerClick, Cpu,
  ArrowDown, ArrowUp, ShieldCheck, BookOpen, Layers, Languages,
} from 'lucide-react';
import { CellPicker } from '@/components/lab/cell-picker';
import { LabWorkspace } from '@/components/lab/workspace';
import { HeroVisual } from '@/components/lab/hero-visual';
import { QueryProvider } from '@/components/lab/providers';
import { LangProvider, useLang } from '@/lib/i18n';
// LangProvider 已提升至根布局（layout.tsx）——本文件直接消费 useLang

/** 方法卡（双语; meta 为语言中性 mono 器件标签） */
const METHOD: {
  icon: typeof Dna;
  title: { zh: string; en: string };
  desc: { zh: string; en: string };
  meta: string;
}[] = [
  {
    icon: Database,
    title: { zh: 'KEGG 实时数据源', en: 'Live KEGG data' },
    meta: 'KGML · REST · PRISMA',
    desc: {
      zh: '通路拓扑经 KEGG REST API（rest.kegg.jp）实时获取 KGML 并解析为结构化信号网络：entry（分子/化合物）→ relation（激活/抑制/磷酸化/转录表达），Prisma 持久化缓存，二次访问 <10ms。',
      en: 'Pathway topology is fetched live as KGML from the KEGG REST API (rest.kegg.jp) and parsed into a structured signaling network: entries (molecules/compounds) → relations (activation / inhibition / phosphorylation / transcription), persisted with Prisma for <10 ms repeat access.',
    },
  },
  {
    icon: Layers,
    title: { zh: '分子区室定位', en: 'Compartmental mapping' },
    meta: '4 COMPARTMENTS · TIER 0-6',
    desc: {
      zh: '每个信号分子按功能注释定位到细胞区室：配体（细胞外）→ 受体/通道（磷脂双分子层）→ 激酶/接头蛋白/第二信使（细胞质）→ 转录因子/靶基因（细胞核），并按信号层级（tier 0–6）排布。',
      en: 'Every signaling molecule is localized by functional annotation: ligands (extracellular) → receptors/channels (lipid bilayer) → kinases/adapters/second messengers (cytoplasm) → transcription factors/target genes (nucleus), arranged by signaling tier (0–6).',
    },
  },
  {
    icon: Activity,
    title: { zh: '离散动力学模型', en: 'Discrete kinetics' },
    meta: '0.5s / TICK · FEEDBACK LOOPS',
    desc: {
      zh: '节点活性沿信号边传播：激活/磷酸化边提升目标活性，抑制边产生衰减；磷酸化修饰、转录延迟、配体洗脱与负反馈（如 DUSP1-ERK、SOCS-JAK）均纳入模型；突变等位基因（KRAS G12D）锁定组成性活性。',
      en: 'Node activity propagates along edges: activation/phosphorylation raises target activity while inhibition decays it; phosphorylation marks, transcriptional delay, ligand washout and negative feedback (DUSP1–ERK, SOCS–JAK) are modeled; mutant alleles (KRAS G12D) lock constitutive activity.',
    },
  },
  {
    icon: BookOpen,
    title: { zh: '分子级精确注释', en: 'Residue-level annotation' },
    meta: 'hsa · RESIDUE-LEVEL',
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
  index, title, accent, desc, right, kicker,
}: {
  index: string;
  title: string;
  accent: string;
  desc: string;
  right?: React.ReactNode;
  kicker?: string;
}) {
  return (
    <div className="mb-6">
      {/* kicker 小标签（期刊眉题韵律; 语言中性 mono 器件感） */}
      {kicker && (
        <div className="mb-2.5 flex items-center gap-2.5" aria-hidden>
          <span className="h-px w-5 bg-gradient-to-r from-emerald-500/50 to-transparent" />
          <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-slate-600">{kicker}</span>
        </div>
      )}
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

/** 区间光线分隔（渐隐发丝线 + 中心荧光点 —— 分区间隔韵律） */
function SectionDivider() {
  return (
    <div aria-hidden className="mx-auto max-w-[1680px] px-4 lg:px-6">
      <div className="relative h-px bg-gradient-to-r from-transparent via-emerald-500/[0.16] to-transparent">
        <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/70 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
        {/* 通行光线（光带沿发丝线缓慢巡游, 首尾渐隐 —— 仪器扫掠韵律） */}
        <span className="divider-run absolute top-1/2 h-[2px] w-20 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-emerald-300/45 to-transparent blur-[1.5px]" />
      </div>
    </div>
  );
}

/** 方法卡（鼠标方向边框光 + 内衬柔光 + 图标呼吸辉光 + 角标编号 + 底部 meta 细节行） */
function MethodCard({ m, i, lang }: { m: (typeof METHOD)[number]; i: number; lang: 'zh' | 'en' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-32px' }}
      transition={{ duration: 0.55, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className="method-card group relative flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-slate-950/40 p-4 transition-[translate,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-emerald-500/30 hover:shadow-[0_12px_32px_-12px_rgba(16,185,129,0.25)]"
      onMouseMove={(e) => {
        // 边框光随鼠标方向: --mx/--my 写入卡片元素, 光斑径向渐变消费（无 re-render）
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
      }}
    >
      {/* 内衬柔光（跟随鼠标; 背景经 CSS 类注入 —— background 简写在 CSSOM 序列化时展开改写, 内联会与 React 19 水合 diff 产生伪差异） */}
      <span
        aria-hidden
        className="method-card-glow pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      {/* 边框环带光（跟随鼠标, 只亮 1px 边框环） */}
      <span aria-hidden className="method-border-light pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      {/* 左缘荧光竖线 */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-px scale-y-0 bg-gradient-to-b from-transparent via-emerald-400/60 to-transparent transition-transform duration-300 group-hover:scale-y-100" />
      {/* 顶部荧光细线（hover 加亮） */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="flex items-start justify-between">
        <div className="method-icon flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.12] to-transparent transition-[border-color,scale] duration-300 group-hover:scale-[1.07] group-hover:border-emerald-500/45">
          <m.icon className="h-4.5 w-4.5 text-emerald-400" />
        </div>
        <span className="font-mono text-[10px] tracking-[0.18em] text-slate-600 transition-colors duration-300 group-hover:text-emerald-500/80">{String(i + 1).padStart(2, '0')}</span>
      </div>
      <h3 className="mt-3.5 text-[13.5px] font-semibold text-slate-100">{m.title[lang]}</h3>
      <p className="mt-2 text-[11.5px] leading-[19px] text-slate-400">{m.desc[lang]}</p>
      {/* 底部 meta 细节行（语言中性 mono 器件标签 + 荧光点） */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/5 pt-2.5">
        <span className="font-mono text-[9px] tracking-[0.14em] text-slate-600">{m.meta}</span>
        <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-500/50" aria-hidden />
      </div>
    </motion.div>
  );
}

/** 导航锚点（用于滚动时高亮当前区块） */
const NAV_SECTIONS = ['cells', 'lab', 'method'] as const;

/** 统计数值: 挂载后从 0 缓动到目标值（尊重 prefers-reduced-motion, 首帧即终值避免水合错配） */
function CountUp({ value }: { value: string }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const m = value.match(/^([\d,]+)(.*)$/);
    if (!m) return;
    const target = parseInt(m[1].replace(/,/g, ''), 10);
    if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const suffix = m[2] || '';
    const dur = 950;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(Math.round(target * eased).toLocaleString('en-US') + suffix);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="tabular-nums">{display}</span>;
}

export default function Home() {
  const { t, lang } = useLang();
  const [activeSection, setActiveSection] = useState<string>('');
  const [scrolled, setScrolled] = useState(false);

  // 滚动感知: 当前视口内占比最大的区块 → 导航高亮
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveSection(e.target.id);
        }
      },
      { rootMargin: '-30% 0px -55% 0px' },
    );
    NAV_SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    // Hero 区无 id → 命中观察带即清空高亮（回到顶部不残留上一区块状态）
    const hero = document.querySelector('main > section');
    if (hero) observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  // 语言切换 → 同步文档标题与 <html lang>（EN 模式不再残留中文标签页标题）
  useEffect(() => {
    document.title = lang === 'zh'
      ? 'VirtualCell Lab · 虚拟细胞实验室 — 分子级信号转导演示平台'
      : 'VirtualCell Lab — Molecular-level Cell Signaling Demo';
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  // 滚动感知: 页面下滚后头部加深投影, 强化层次
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', fn, { passive: true });
    fn();
    return () => window.removeEventListener('scroll', fn);
  }, []);

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
      <header className={`sticky top-0 z-40 border-b border-white/5 bg-[#030812]/85 backdrop-blur-xl transition-shadow duration-300 ${scrolled ? 'shadow-[0_10px_30px_-12px_rgba(0,0,0,0.65)]' : ''}`}>
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
              ['cells', t('nav.cells')],
              ['lab', t('nav.lab')],
              ['method', t('nav.method')],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className={`group relative py-1 transition hover:text-emerald-300 ${activeSection === id ? 'text-emerald-300' : ''}`}
              >
                {label}
                <span
                  className={`absolute inset-x-0 -bottom-px h-px origin-left bg-gradient-to-r from-emerald-400 to-teal-400 transition-transform duration-300 ${
                    activeSection === id ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                  }`}
                  aria-hidden
                />
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
        <section className="relative overflow-hidden">
          {/* 背景层: 微网格渐隐 + 径向光晕（纯 CSS; 网格向边缘淡出, 不大面积铺色）
              光晕组套滚动视差容器 —— hero 滚出视口时背景反向微移+微缩（scroll-driven animation,
              @supports 门控: 不支持 animation-timeline 的环境零效果零位移） */}
          <div className="bio-grid bio-grid-fade pointer-events-none absolute inset-0 -z-10" aria-hidden />
          <div className="hero-parallax pointer-events-none absolute inset-0 -z-10" aria-hidden>
            <div className="hero-glow-a absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-emerald-500/[0.07] blur-[120px]" />
            <div className="hero-glow-b absolute -left-40 top-20 h-[380px] w-[380px] rounded-full bg-teal-500/[0.05] blur-[100px]" />
            <div className="hero-glow-c absolute -bottom-36 left-[38%] h-[300px] w-[440px] rounded-full bg-amber-500/[0.035] blur-[110px]" />
          </div>
          {/* 期刊书脊式侧标（科学海报器件感） */}
          <div className="pointer-events-none absolute left-3.5 top-1/2 hidden -translate-y-1/2 2xl:block" aria-hidden>
            <span className="font-mono text-[9px] uppercase tracking-[0.34em] text-slate-600 [writing-mode:vertical-rl]">
              VirtualCell Lab · Molecular Signaling Atlas
            </span>
          </div>
          {/* 底缘光线缝（divider 光线） */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent" aria-hidden />
          <span className="pointer-events-none absolute bottom-0 left-1/2 h-[3px] w-16 -translate-x-1/2 rounded-full bg-emerald-400/50 blur-[3px]" aria-hidden />

          <div className="mx-auto grid max-w-[1680px] items-center gap-6 px-4 py-7 lg:grid-cols-[23fr_27fr] lg:gap-10 lg:px-6 lg:py-9 xl:gap-14">
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

              <h1 className="mt-4 text-4xl font-bold leading-[1.12] tracking-tight text-slate-50 sm:text-5xl lg:text-[44px] xl:text-[54px] 2xl:text-[58px]">
                {/* 双行错峰入场（排版节奏: 首行素色 / 次行渐变辉光） */}
                <motion.span
                  className="block"
                  initial={{ opacity: 0, y: 26 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                >
                  {t('hero.h1a')}
                </motion.span>
                <motion.span
                  className="h1-gradient-glow block bg-gradient-to-r from-emerald-300 via-teal-200 to-emerald-300 bg-clip-text text-transparent"
                  initial={{ opacity: 0, y: 26 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
                >
                  {t('hero.h1b')}
                </motion.span>
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.16 }}
                className="mt-4 max-w-xl text-[15px] leading-7 text-slate-400"
              >
                {t('hero.p')}
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.24 }}
                className="mt-5 flex flex-wrap gap-3"
              >
                <a
                  href="#lab"
                  className="group inline-flex items-center gap-2 rounded-xl border border-emerald-400/60 bg-gradient-to-b from-emerald-500/35 to-emerald-600/20 px-5 py-2.5 text-[13.5px] font-semibold text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.22),inset_0_1px_0_rgba(255,255,255,0.12)] transition-all hover:from-emerald-400/45 hover:to-emerald-500/30 hover:shadow-[0_0_30px_rgba(52,211,153,0.4),inset_0_1px_0_rgba(255,255,255,0.18)]"
                >
                  <MousePointerClick className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
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
                className="mt-6 grid max-w-lg grid-cols-2 gap-3 sm:grid-cols-4"
              >
                {stats.map((s) => (
                  <div
                    key={s.label}
                    className="group relative overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-500/25 hover:bg-emerald-500/[0.03] hover:shadow-[0_6px_18px_-6px_rgba(16,185,129,0.25)]"
                  >
                    <span className="absolute inset-y-0 left-0 w-px scale-y-0 bg-emerald-400/60 transition-transform duration-300 group-hover:scale-y-100" aria-hidden />
                    {/* 角标刻度（仪器蓝图感） */}
                    <span className="absolute left-2 top-1.5 select-none font-mono text-[8px] leading-none text-white/15" aria-hidden>+</span>
                    <span className="absolute bottom-1.5 right-2 select-none font-mono text-[8px] leading-none text-white/15" aria-hidden>+</span>
                    <s.icon className="h-3.5 w-3.5 text-emerald-400/80 transition-colors duration-300 group-hover:text-emerald-300" />
                    {/* 数位滚动 + 渐变高亮（tabular-nums 见 CountUp） */}
                    <div className="mt-1.5 font-mono text-[16px] font-semibold leading-tight">
                      <span className="bg-gradient-to-b from-white via-emerald-100 to-emerald-300/90 bg-clip-text text-transparent">
                        <CountUp value={s.value} />
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500">{s.label}</div>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* 科学插画主视觉（大画幅: 图注与比例尺内嵌, 无下方附属条目） */}
            <HeroVisual />
          </div>

          {/* 滚动指示（光线滑落, 点击跳转细胞系） */}
          <motion.a
            href="#cells"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.8 }}
            className="group absolute inset-x-0 bottom-5 mx-auto hidden w-fit flex-col items-center gap-1.5 lg:flex"
            aria-label={lang === 'zh' ? '向下滚动查看细胞系' : 'Scroll down to cell lines'}
          >
            <span className="font-mono text-[9px] tracking-[0.32em] text-slate-600 transition-colors duration-300 group-hover:text-emerald-400/90">
              {lang === 'zh' ? '向下探索 · SCROLL' : 'SCROLL'}
            </span>
            <span className="relative block h-8 w-px overflow-hidden bg-white/10" aria-hidden>
              <span className="scroll-run absolute inset-x-0 top-0 h-3.5 bg-gradient-to-b from-transparent via-emerald-400 to-transparent" />
            </span>
          </motion.a>
        </section>

        {/* ============ 细胞系选择 ============ */}
        <section id="cells" className="mx-auto max-w-[1680px] scroll-mt-20 px-4 py-8 lg:px-6 lg:py-10">
          <SectionHeading
            index="01 / 03"
            kicker="Cell Library"
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

        <SectionDivider />

        {/* ============ 模拟实验台 ============ */}
        <section id="lab" className="mx-auto max-w-[1680px] scroll-mt-20 px-4 py-10 lg:px-6 lg:py-12">
          <SectionHeading
            index="02 / 03"
            kicker="Simulation Lab"
            title={t('lab.h2a')}
            accent={t('lab.h2b')}
            desc={t('lab.p')}
          />
          <LabWorkspace />
        </section>

        <SectionDivider />

        {/* ============ 数据与方法 ============ */}
        <section id="method" className="mx-auto max-w-[1680px] scroll-mt-20 px-4 py-12 lg:px-6 lg:py-14">
          <SectionHeading
            index="03 / 03"
            kicker="Method · Provenance"
            title={t('nav.method')}
            accent=""
            desc={lang === 'zh' ? '科学性与可复现性说明' : 'Scientific rigor & reproducibility'}
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {METHOD.map((m, i) => (
              <MethodCard key={m.title.en} m={m} i={i} lang={lang} />
            ))}
          </div>
          <div className="relative mt-4 flex gap-3 overflow-hidden rounded-xl border border-amber-500/15 bg-amber-500/[0.03] p-3.5">
            <span className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-amber-400/45 to-transparent" aria-hidden />
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
        <div className="mx-auto max-w-[1680px] px-4 pt-2 lg:px-6">
          {/* 期刊式页眉小标（kicker） */}
          <div className="flex items-center justify-between gap-4 border-b border-white/5 py-2.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-slate-600">
              VirtualCell Lab — Molecular Signaling Atlas
            </span>
            <span className="hidden font-mono text-[9px] tracking-[0.2em] text-slate-700 sm:inline">
              {lang === 'zh' ? '教学演示构建' : 'EDUCATIONAL BUILD'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
            <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
              <div className="flex h-5 w-5 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/[0.08]">
                <Dna className="h-3 w-3 text-emerald-400/80" />
              </div>
              VirtualCell Lab{lang === 'zh' ? ' · 虚拟细胞实验室' : ''}
            </div>
            <a
              href="https://www.kegg.jp/kegg/rest.html"
              target="_blank"
              rel="noreferrer"
              className="text-[11.5px] text-slate-500 transition hover:text-emerald-300"
            >
              Pathway data: KEGG REST API (Kanehisa Laboratory)
            </a>
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
              <span className="h-1 w-1 rounded-full bg-emerald-500/50" aria-hidden />
              Next.js 16 · Prisma · zustand · z-ai-web-dev-sdk
            </span>
            {/* 回到顶部 */}
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              aria-label={lang === 'zh' ? '回到顶部' : 'Back to top'}
              title={lang === 'zh' ? '回到顶部' : 'Back to top'}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-500 transition hover:border-emerald-500/40 hover:text-emerald-300 hover:shadow-[0_0_14px_rgba(52,211,153,0.25)]"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </footer>
    </div>
    </QueryProvider>
  );
}
