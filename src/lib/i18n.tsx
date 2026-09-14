'use client';

/**
 * 轻量 i18n（中/英双语界面切换）
 * - LangProvider: React Context + cookie（vcl-lang）双端持久化 + localStorage 同步
 * - 水合安全: 初值由根布局（server）读 cookie 传入 initialLang，服务端 HTML 与客户端首帧一致;
 *   旧版仅存 localStorage 的用户在挂载后一次性迁移（不触发水合错配，仅一帧重渲染）
 * - useLang(): { lang, setLang, t }
 * - 字典 T: key → { zh, en }; t(key) 查不到时回退 key 本身（开发期可见漏译）
 * 覆盖范围: 页面 chrome（导航/hero/方法卡/页脚）+ 实验台视图切换 + 3D HUD 全量 +
 * 分子类别/区室标签 + 剖面控制; 科学内容（通路描述/分子注释/教学引导文案）
 * 为策划数据层，暂保持中文（后续任务扩展）。
 */
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';

export type Lang = 'zh' | 'en';

type Entry = { zh: string; en: string };

export const T: Record<string, Entry> = {
  /* ============ 页头 ============ */
  'app.title': { zh: '虚拟细胞实验室', en: 'Virtual Cell Lab' },
  'nav.cells': { zh: '细胞系', en: 'Cell Lines' },
  'nav.lab': { zh: '模拟实验台', en: 'Simulation Lab' },
  'nav.method': { zh: '数据与方法', en: 'Data & Methods' },
  'status.online': { zh: 'KEGG REST · 在线', en: 'KEGG REST · Online' },
  'status.pathways': { zh: '通路', en: 'pathways' },

  /* ============ Hero ============ */
  'hero.badge': { zh: '分子级信号转导演示 · KEGG 数据驱动', en: 'Molecular-level signaling demo · KEGG-driven' },
  'hero.h1a': { zh: '在虚拟细胞中', en: 'Inside a virtual cell,' },
  'hero.h1b': { zh: '观看信号的旅程', en: 'watch signals travel' },
  'hero.p': {
    zh: '从 KEGG 通路数据库实时获取信号转导图谱，映射到可交互的虚拟细胞： 配体扩散 → 受体二聚化 → 胞质激酶级联 → 转录因子入核 → 靶基因表达。 每一步都精确到磷酸化残基与结构域—— 这是教科书插图无法给予的动态直觉。',
    en: 'Signal transduction maps fetched live from the KEGG pathway database are mapped onto an interactive virtual cell: ligand diffusion → receptor dimerization → cytoplasmic kinase cascades → transcription factor nuclear import → target gene expression. Every step resolves to phosphorylation sites and domains — a dynamic intuition no textbook figure can offer.',
  },
  'hero.cta1': { zh: '进入模拟实验台', en: 'Enter Simulation Lab' },
  'hero.cta2': { zh: '浏览细胞系', en: 'Browse Cell Lines' },
  'stat.cellLines': { zh: '虚拟细胞系', en: 'Virtual cell lines' },
  'stat.pathways': { zh: 'KEGG 信号通路', en: 'KEGG pathways' },
  'stat.entries': { zh: '通路分子条目', en: 'Pathway entries' },
  'stat.notes': { zh: '分子事件注释', en: 'Molecular event notes' },

  /* ============ 细胞系选择 ============ */
  'cells.h2a': { zh: '选择虚拟', en: 'Choose a virtual ' },
  'cells.h2b': { zh: '细胞系', en: 'cell line' },
  'cells.p': {
    zh: '每种细胞携带不同的受体组与通路网络 —— 癌细胞模型内置驱动突变，无需配体即可观察失控的信号转导',
    en: 'Each cell carries its own receptor repertoire and pathway network — the cancer model has built-in driver mutations, showing runaway signaling without any ligand',
  },
  'cells.ref': { zh: '形态学参数参照 Alberts MBoC / Ross Histology', en: 'Morphology per Alberts MBoC / Ross Histology' },
  'cells.pathways': { zh: '条通路', en: 'pathways' },

  /* ============ 实验台 ============ */
  'lab.h2a': { zh: '模拟', en: 'Simulation ' },
  'lab.h2b': { zh: '实验台', en: 'Lab' },
  'lab.p': {
    zh: '注射配体启动信号级联 · 双视图（细胞 / KEGG 图谱）联动 · 点击分子查看档案 · 时间线实时输出分子事件',
    en: 'Inject ligands to fire cascades · dual views (cell / KEGG map) linked · click molecules for profiles · timeline streams molecular events',
  },
  'view.3d': { zh: '3D 沉浸', en: '3D Immersive' },
  'view.2d': { zh: '2D 切面', en: '2D Section' },
  'view.map': { zh: 'KEGG 图谱', en: 'KEGG Map' },
  'view.compare': { zh: '对照实验', en: 'Compare' },
  'view.drug': { zh: '药理', en: 'Pharmacology' },
  'view.heatmap': { zh: '转录热图', en: 'Heatmap' },
  'view.assistant': { zh: 'AI 助手', en: 'AI Assistant' },
  'lab.empty.title': { zh: '从左侧通路库选择一条 KEGG 信号通路开始实验', en: 'Pick a KEGG pathway from the library to start' },

  /* ============ 3D HUD ============ */
  'hud.3dview': { zh: '3D 沉浸视图', en: '3D immersive view' },
  'hud.phase': { zh: '阶段', en: 'Phase' },
  'hud.molecules': { zh: '分子', en: 'molecules' },
  'hud.scale': { zh: '(非等比示意)', en: '(not to scale)' },
  'hud.tour': { zh: '教学引导', en: 'Guided Tour' },
  'hud.glow': { zh: '辉光渲染', en: 'Bloom' },
  'hud.perf': { zh: '流畅模式', en: 'Fast' },
  'hud.hd': { zh: '高清模式', en: 'HD' },
  'hud.anatomy': { zh: '解剖标注', en: 'Anatomy' },
  'hud.labels': { zh: '全部标签', en: 'Labels' },
  'hud.focus': { zh: '专注模式', en: 'Focus' },
  'hud.section': { zh: '剖面展示', en: 'Section' },
  'hud.rotate': { zh: '自动环视', en: 'Auto-rotate' },
  'hud.axis': { zh: '剖面方位', en: 'Orientation' },
  'hud.depth': { zh: '剖深', en: 'Depth' },
  'hud.sectionFill': { zh: '剖开处已填充剖面标本图', en: 'Cut filled with specimen-style section' },
  'cam.overview': { zh: '全景', en: 'Overview' },
  'cam.membrane': { zh: '质膜近景', en: 'Membrane' },
  'cam.nucleus': { zh: '核内视角', en: 'Nucleus' },
  'cam.follow': { zh: '跟随信号', en: 'Follow' },
  'cam.following': { zh: '跟随中·点击停止', en: 'Following · click to stop' },
  'legend.title': { zh: '分子类别', en: 'Molecule kinds' },
  'legend.collapse': { zh: '收起', en: 'Hide' },
  'legend.expand': { zh: '图例', en: 'Legend' },
  'legend.activation': { zh: '激活/磷酸化', en: 'Activation / phosphorylation' },
  'legend.inhibition': { zh: '抑制/负反馈', en: 'Inhibition / feedback' },
  'legend.expression': { zh: '转录表达', en: 'Transcription' },
  'legend.phospho': { zh: '磷酸化 (P)', en: 'Phosphorylated (P)' },
  'legend.mrna': { zh: 'mRNA 出核', en: 'mRNA export' },
  'legend.pulse': { zh: '信号事件脉冲', en: 'Signal event pulse' },
  'hud.tip.free': {
    zh: '拖拽旋转 · 滚轮缩放 · 点击分子查看档案 · 悬停显示分子卡',
    en: 'Drag to rotate · scroll to zoom · click a molecule for its profile · hover for molecule card',
  },
  'hud.tip.section': {
    zh: '剖面模式 · 旋转视角观察细胞器内部结构与核内分子',
    en: 'Section mode · rotate to inspect organelle interiors and nuclear molecules',
  },

  /* ============ 3D 加载/错误 ============ */
  'loading.engine': { zh: '正在初始化 3D 渲染引擎…', en: 'Initializing 3D rendering engine…' },
  'loading.cell': { zh: '正在装配虚拟细胞…', en: 'Assembling virtual cell…' },
  'err.title': { zh: '3D 渲染引擎异常', en: '3D engine error' },
  'err.desc': {
    zh: '图形加速不可用或渲染资源不足。可切换到 2D 切面视图继续实验，或刷新页面重试。',
    en: 'Hardware acceleration unavailable or rendering resources exhausted. Switch to the 2D section view or reload.',
  },
  'err.fallback2d': { zh: '切换 2D 切面视图', en: 'Switch to 2D section view' },
  'err.reload': { zh: '刷新重试', en: 'Reload' },
  'ctx.lost': { zh: '图形上下文丢失 · 正在尝试自动恢复…', en: 'Graphics context lost · attempting recovery…' },
  'ctx.lostHint': { zh: '若长时间未恢复，请刷新页面', en: 'If it does not recover, reload the page' },

  /* ============ 分子类别（3D 标签/图例） ============ */
  'kind.ligand': { zh: '配体', en: 'Ligand' },
  'kind.receptor': { zh: '受体', en: 'Receptor' },
  'kind.channel': { zh: '通道', en: 'Channel' },
  'kind.kinase': { zh: '激酶', en: 'Kinase' },
  'kind.phosphatase': { zh: '磷酸酶', en: 'Phosphatase' },
  'kind.adapter': { zh: '接头', en: 'Adapter' },
  'kind.gtpase': { zh: 'G 蛋白', en: 'G protein' },
  'kind.tf': { zh: '转录因子', en: 'Transcription factor' },
  'kind.gene': { zh: '靶基因', en: 'Target gene' },
  'kind.compound': { zh: '第二信使', en: 'Second messenger' },
  'kind.enzyme': { zh: '酶', en: 'Enzyme' },

  /* ============ 区室 ============ */
  'comp.extracellular': { zh: '细胞外', en: 'Extracellular' },
  'comp.membrane': { zh: '质膜', en: 'Membrane' },
  'comp.cytoplasm': { zh: '细胞质', en: 'Cytoplasm' },
  'comp.nucleus': { zh: '细胞核', en: 'Nucleus' },

  /* ============ 剖面结构标注 ============ */
  'sec.nucleus': { zh: '细胞核（剖面）', en: 'Nucleus (section)' },
  'sec.cytosol': { zh: '细胞质基质', en: 'Cytosol' },
  'sec.membrane': { zh: '质膜（剖面）', en: 'Plasma membrane' },

  /* ============ 悬停分子卡 ============ */
  'tip.aliases': { zh: '别名', en: 'Aliases' },

  /* ============ 页脚 ============ */
  'footer.brand': { zh: 'VirtualCell Lab · 虚拟细胞实验室', en: 'VirtualCell Lab' },
  'footer.data': { zh: 'Pathway data: KEGG REST API (Kanehisa Laboratory)', en: 'Pathway data: KEGG REST API (Kanehisa Laboratory)' },
};

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const LangContext = createContext<LangCtx>({
  lang: 'zh',
  setLang: () => {},
  t: (k) => k,
});

const STORAGE_KEY = 'vcl-lang';
const COOKIE_KEY = 'vcl-lang';
const COOKIE_RE = new RegExp(`(?:^|;\\s*)${COOKIE_KEY}=([^;]*)`);

/* 外部存储订阅（useSyncExternalStore 标准范式）: setLang 写入后 emit 通知全部消费组件 */
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function emit() {
  listeners.forEach((l) => l());
}

/** 客户端快照: cookie 优先（新版主存储）→ localStorage 兑底（旧版迁移读取路径） */
function readClientLang(): Lang {
  try {
    const c = document.cookie.match(COOKIE_RE)?.[1];
    if (c === 'en' || c === 'zh') return c;
    const s = window.localStorage.getItem(STORAGE_KEY);
    if (s === 'en' || s === 'zh') return s;
  } catch {
    /* localStorage 不可用（隐私模式） */
  }
  return 'zh';
}

/** 写 cookie（1 年）: 服务端与客户端共读同一份数据 → 刷新后无闪烁 */
function writeCookie(l: Lang) {
  try {
    document.cookie = `${COOKIE_KEY}=${l}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* ignore */
  }
}

/** 切换语言（模块级: 纯外部存储写入 + 通知, 不依赖组件生命周期） */
function setLang(l: Lang) {
  writeCookie(l);
  try {
    window.localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* ignore */
  }
  emit();
}

export function LangProvider({ children, initialLang = 'zh' }: { children: ReactNode; initialLang?: Lang }) {
  // useSyncExternalStore 水合安全范式:
  //   水合期返回 server 快照（= 布局传入的 cookie 值）→ 与 SSR HTML 完全一致;
  //   水合完成后切 client 快照（cookie/localStorage）→ 差异由 React 安全重渲染（无水合错配）
  const lang = useSyncExternalStore(subscribe, readClientLang, () => initialLang);

  // 挂载后一次性迁移: 旧版仅存 localStorage 的用户把语言提升写入 cookie（此后服务端直读, 无闪烁）
  useEffect(() => {
    try {
      const hasCookie = COOKIE_RE.test(document.cookie);
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!hasCookie && (saved === 'en' || saved === 'zh')) writeCookie(saved);
    } catch {
      /* ignore */
    }
  }, []);

  // 语言切换时同步 <html lang>（无障碍 / 屏幕阅读器发音正确）
  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  }, [lang]);

  const value = useMemo<LangCtx>(
    () => ({ lang, setLang, t: (k: string) => T[k]?.[lang] ?? k }),
    [lang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangCtx {
  return useContext(LangContext);
}
