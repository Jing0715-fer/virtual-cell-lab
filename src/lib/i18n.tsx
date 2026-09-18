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
  'view.mitosis': { zh: '分裂演示', en: 'Mitosis' },
  'view.mitosisTip': { zh: '有丝分裂全周期 3D 动画（前期→中期→后期→末期→胞质分裂）', en: 'Full-cycle mitosis 3D animation' },
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
  'hud.fs': { zh: '网页内全屏', en: 'In-page fullscreen' },
  'hud.exitFs': { zh: '退出全屏', en: 'Exit fullscreen' },
  'hud.fsTip': {
    zh: '网页内全屏 · 整页画幅观察细节 · 滚轮/双指缩放 · ESC 退出',
    en: 'In-page fullscreen · full-page view · scroll / pinch to zoom · ESC to exit',
  },
  'hud.fsHint': {
    zh: '拖拽旋转 · 滚轮缩放 · 中键/右键平移 · 点击分子球或标签查看档案',
    en: 'Drag to rotate · scroll to zoom · middle/right-drag to pan · click spheres or labels for profiles',
  },
  'hud.gear': { zh: '显示', en: 'View' },
  'hud.snap': { zh: '信号贴面', en: 'Section snap' },
  /* v35 发表模式（图版导出） */
  'hud.fig': { zh: '图版导出', en: 'Figure' },
  'hud.figTip': {
    zh: '发表模式 · 将当前 3D 视图导出为科研图版 PNG（刊头 + 双语图注 + 实时比例标尺）',
    en: 'Publication mode · export the current 3D view as a scientific figure PNG (masthead, bilingual caption, live scale bar)',
  },
  'fig.busy': { zh: '正在合成图版…', en: 'Composing figure…' },
  'fig.ok': { zh: '图版已导出 · PNG 已开始下载', en: 'Figure exported · PNG download started' },
  'fig.err': { zh: '导出失败，请稍后重试', en: 'Export failed — please retry' },
  'hud.snapTip': {
    zh: '信号级联正交投影到剖切面上演示 —— 全部分子落于切面, 无一被剖切裁掉（50% 过心切面视野最佳）',
    en: 'Orthogonally projects the cascade onto the section plane — every molecule stays visible on the cut face (best at the 50% mid-plane)',
  },
  'hud.snapOn': { zh: '级联贴面演示', en: 'cascade on-plane' },
  // v14 悬停标记 + 细胞器目录 + 分裂演示
  'hud.hover': { zh: '悬停标记', en: 'Hover tags' },
  'hud.index': { zh: '细胞器目录', en: 'Organelles' },
  'hud.mitosis': { zh: '分裂演示', en: 'Mitosis' },
  'idx.count': { zh: '个细胞器', en: 'organelles' },
  'idx.hint': { zh: '点击定位 · 3D 中悬停查看', en: 'Click to locate · hover in 3D' },
  'mit.title': { zh: '有丝分裂 · 3D 演示', en: 'Mitosis · 3D demo' },
  'mit.play': { zh: '播放', en: 'Play' },
  'mit.pause': { zh: '暂停', en: 'Pause' },
  'mit.replay': { zh: '重播', en: 'Replay' },
  'mit.speed': { zh: '速度', en: 'Speed' },
  'mit.endHint': { zh: '一轮完成 — 点击重播', en: 'Cycle complete — hit replay' },
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
  'legend.hint': {
    zh: '点击分子球/标签 → 分子档案 · 悬停弧线/细胞器 → 即时识别',
    en: 'Click sphere/label → profile · hover an arc or organelle → identify',
  },
  'hud.tip.free': {
    zh: '拖拽旋转 · 滚轮缩放 · 中键/右键平移 · 点击分子球或标签查看档案 · 悬停显示分子卡',
    en: 'Drag to rotate · scroll to zoom · middle/right-drag to pan · click spheres or labels for profiles · hover for molecule card',
  },
  'hud.tip.section': {
    zh: '剖面模式 · 旋转观察内部结构 · 点击分子球或标签查看档案',
    en: 'Section mode · rotate to inspect interiors · click spheres or labels for profiles',
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

  /* ============ 通路库 pathway-library ============ */
  'pw.cellHeader': { zh: '当前虚拟细胞系', en: 'Current virtual cell line' },
  'pw.pathological': { zh: '病理模型', en: 'Pathological model' },
  'pw.normal': { zh: '正常表型', en: 'Normal phenotype' },
  'pw.diseasePrefix': { zh: '病理: ', en: 'Pathology: ' },
  'pw.title': { zh: 'KEGG 通路库', en: 'KEGG pathway library' },
  'pw.offline': { zh: '离线', en: 'Offline' },
  'pw.entries': { zh: '372 条', en: '372 entries' },
  'pw.searchPlaceholder': { zh: '搜索通路（名称 / 编号）', en: 'Search pathways (name / ID)' },
  'pw.searchLabel': { zh: '搜索 KEGG 通路', en: 'Search KEGG pathways' },
  'pw.clearSearch': { zh: '清除搜索', en: 'Clear search' },
  'pw.searchNone': {
    zh: ' —— 无匹配通路，试试 "MAPK" / "代谢" / "hsa04916"',
    en: ' — no matches; try "MAPK", "metabolism" or "hsa04916"',
  },
  'pw.curatedSection': { zh: '策划级信号转导通路', en: 'Curated signaling pathways' },
  'pw.fullSection': { zh: 'KEGG 全量目录', en: 'Full KEGG catalog' },
  'pw.adapted': { zh: '适配', en: 'Matched' },
  'pw.tourBadge': { zh: '教学', en: 'Tour' },
  'pw.tourTitle': { zh: '已策划分步教学级联（3D 视图 → 教学引导）', en: 'Curated step-by-step cascade tour (3D view → guided tour)' },
  'pw.molecules': { zh: '分子', en: 'molecules' },
  'pw.seeds': { zh: '种子', en: 'seeds' },

  /* ============ 通路 × 细胞类型表达分类 ============ */
  'pw.cellFilter': { zh: '按本细胞表达筛选', en: 'Filter by this cell' },
  'pw.cellFilterTip': {
    zh: '仅显示该细胞类型实际表达的通路（组织/细胞特异性分类）',
    en: 'Show only pathways actually expressed in this cell type (tissue/cell specificity)',
  },
  'pw.signatureSection': { zh: '特征通路', en: 'Signature pathways' },
  'pw.activeSection': { zh: '本细胞表达通路', en: 'Expressed in this cell' },
  'pw.inactiveSection': { zh: '未检出 · 低活性', en: 'Not detected · low activity' },
  'pw.signatureBadge': { zh: '特征', en: 'Signature' },
  'pw.inactiveBadge': { zh: '未检出', en: 'Absent' },
  'pw.inactiveTeach': { zh: '仍可教学演示', en: 'Demo anyway' },
  'pw.inactiveTeachTip': {
    zh: '该通路在本细胞类型通常不活跃，仅作跨细胞分子机制教学对照',
    en: 'This pathway is normally inactive in this cell type — shown for cross-cell teaching only',
  },
  'pw.showAll': { zh: '显示全部', en: 'Show all' },
  'pw.autoSwitched': { zh: '已切换至该细胞的特征通路', en: 'Switched to a signature pathway of this cell' },
  'pw.warnTitle': { zh: '通路-细胞不匹配', en: 'Pathway–cell mismatch' },
  'pw.warnBody': {
    zh: '该通路在当前细胞类型中通常不活跃。演示仅作分子机制教学对照，不代表真实生理响应。',
    en: 'This pathway is normally inactive in the current cell type. The demo is a teaching reference of molecular mechanics, not a real physiological response.',
  },

  /* ============ 模拟控制台 playback ============ */
  'pb.pause': { zh: '暂停', en: 'Pause' },
  'pb.play': { zh: '播放（自动注射配体）', en: 'Play (auto ligand injection)' },
  'pb.step': { zh: '单步推进（1 tick = 0.5s）', en: 'Step forward (1 tick = 0.5 s)' },
  'pb.reset': { zh: '重置模拟', en: 'Reset simulation' },
  'pb.molEvents': { zh: '分子事件', en: 'events' },
  'pb.ligandInject': { zh: '配体注射', en: 'Ligand injection' },
  'pb.directStim': { zh: '直接刺激', en: 'Direct stimulation' },
  'pb.directStimTip': {
    zh: '本通路无有效配体入口（如胞内应激/营养感知通路）—— 直接刺激受体或应激激酶以启动级联（等效生理刺激：LPS/辐照/能量应激/生长因子）',
    en: 'No productive ligand entry in this pathway (e.g. intracellular stress / nutrient sensing) — directly stimulate receptors or stress kinases to fire the cascade (physiological equivalents: LPS / irradiation / energy stress / growth factors)',
  },
  'pb.noStim': { zh: '无可用刺激入口', en: 'No stimulation entry available' },
  'pb.stimReceptorTip': { zh: '受体直接刺激（等效配体结合后构象激活）', en: 'Direct receptor stimulation (conformational activation equivalent to ligand binding)' },
  'pb.stimStressTip': {
    zh: '应激刺激入口（等效上游生理激活：DNA 损伤/能量应激/生长因子）',
    en: 'Stress stimulation entry (equivalent upstream physiological activation: DNA damage / energy stress / growth factors)',
  },
  'pb.mutNoticeA': { zh: '本细胞系携带', en: 'This cell line carries' },
  'pb.mutNoticeB': { zh: '个驱动突变 —— 播放时无需配体即可观察组成性信号转导', en: 'driver mutations — press play to watch constitutive signaling without any ligand' },
  'pb.phase0.desc': { zh: '无外源信号，基础活性水平', en: 'No external signal; basal activity levels' },
  'pb.phase1.desc': { zh: '配体扩散至细胞表面并结合受体胞外域', en: 'Ligand diffuses to the cell surface and binds the receptor extracellular domain' },
  'pb.phase2.desc': { zh: '受体二聚化/变构，胞内域磷酸化启动', en: 'Receptor dimerization/allostery; intracellular-domain phosphorylation begins' },
  'pb.phase3.desc': { zh: '胞质激酶级联与第二信使放大', en: 'Cytoplasmic kinase cascades and second-messenger amplification' },
  'pb.phase4.desc': { zh: '转录因子入核，靶基因表达程序启动', en: 'Transcription factors enter the nucleus; target-gene expression programs start' },

  /* ============ 事件流 timeline ============ */
  'tl.kind.binding': { zh: '结合', en: 'Binding' },
  'tl.kind.activation': { zh: '激活', en: 'Activation' },
  'tl.kind.phosphorylation': { zh: '磷酸化', en: 'Phosphorylation' },
  'tl.kind.inhibition': { zh: '抑制', en: 'Inhibition' },
  'tl.kind.expression': { zh: '转录', en: 'Transcription' },
  'tl.kind.repression': { zh: '阻遏', en: 'Repression' },
  'tl.kind.mutation': { zh: '突变', en: 'Mutation' },
  'tl.kind.info': { zh: '系统', en: 'System' },
  'tl.kind.phase': { zh: '阶段', en: 'Phase' },
  'tl.kind.reset': { zh: '重置', en: 'Reset' },
  'tl.title': { zh: '实时分子事件流', en: 'Live molecular event stream' },
  'tl.waiting': { zh: '等待模拟启动…', en: 'Waiting for the simulation to start…' },

  /* ============ 分子档案 inspector ============ */
  'ins.empty': { zh: '选择通路后此处显示分子档案', en: 'Molecule profiles appear here once a pathway is selected' },
  'ins.synthetic': { zh: '合成节点', en: 'Synthetic node' },
  'ins.kind.ligand': { zh: '配体', en: 'Ligand' },
  'ins.kind.receptor': { zh: '受体', en: 'Receptor' },
  'ins.kind.kinase': { zh: '激酶', en: 'Kinase' },
  'ins.kind.phosphatase': { zh: '磷酸酶', en: 'Phosphatase' },
  'ins.kind.adapter': { zh: '接头蛋白', en: 'Adapter' },
  'ins.kind.gtpase': { zh: '小 G 蛋白', en: 'Small G protein' },
  'ins.kind.tf': { zh: '转录因子', en: 'Transcription factor' },
  'ins.kind.gene': { zh: '靶基因', en: 'Target gene' },
  'ins.kind.compound': { zh: '第二信使', en: 'Second messenger' },
  'ins.kind.channel': { zh: '离子通道', en: 'Ion channel' },
  'ins.kind.enzyme': { zh: '酶', en: 'Enzyme' },
  'ins.comp.extracellular': { zh: '细胞外', en: 'Extracellular' },
  'ins.comp.membrane': { zh: '细胞膜', en: 'Plasma membrane' },
  'ins.comp.cytoplasm': { zh: '细胞质', en: 'Cytoplasm' },
  'ins.comp.nucleus': { zh: '细胞核', en: 'Nucleus' },
  'ins.tier': { zh: '信号层级 L', en: 'Signaling tier L' },
  'ins.activity': { zh: '分子活性', en: 'Molecular activity' },
  'ins.phosphoLevel': { zh: '磷酸化水平', en: 'Phosphorylation level' },
  'ins.firstActivation': { zh: '首次激活于', en: 'First activated at' },
  'ins.mutTitle': { zh: '本细胞系突变档案', en: 'Mutation profile of this cell line' },
  'ins.noteTitle': { zh: '分子功能注释', en: 'Functional annotation' },
  'ins.connTitle': { zh: '信号网络连接', en: 'Signaling network connections' },
  'ins.edge.activation': { zh: '激活', en: 'Activation' },
  'ins.edge.inhibition': { zh: '抑制', en: 'Inhibition' },
  'ins.edge.phosphorylation': { zh: '磷酸化', en: 'Phosphorylation' },
  'ins.edge.dephosphorylation': { zh: '去磷酸化', en: 'Dephosphorylation' },
  'ins.edge.expression': { zh: '转录表达', en: 'Transcription' },
  'ins.edge.repression': { zh: '阻遏', en: 'Repression' },
  'ins.edge.binding': { zh: '结合', en: 'Binding' },
  'ins.edge.dissociation': { zh: '解离', en: 'Dissociation' },
  'ins.edge.indirect': { zh: '间接', en: 'Indirect' },
  'ins.edge.missing': { zh: '缺失互作', en: 'Missing interaction' },
  'ins.edge.state-change': { zh: '状态变化', en: 'State change' },
  'ins.cascade': { zh: '核心级联', en: 'Core cascade' },
  'ins.clickHint': {
    zh: '点击画布中的分子节点查看分子级档案（残基注释 / 互作 / 突变）',
    en: 'Click a molecule node on the canvas to open its molecular profile (residue notes / interactions / mutations)',
  },
  'ins.chartTitle': { zh: '活性动力学曲线（Top 5）', en: 'Activity dynamics (Top 5)' },
  'ins.drugBand': { zh: '药物作用区间', en: 'Drug exposure window' },

  /* ============ 药理 pharmacology ============ */
  'ph.title': { zh: '药理扰动实验', en: 'Pharmacological perturbation' },
  'ph.loading': { zh: '加载中…', en: 'Loading…' },
  'ph.dose': { zh: '投药', en: 'Dose' },
  'ph.washout': { zh: '洗脱', en: 'Washout' },
  'ph.drugsAvail': { zh: '种药物可用', en: 'drugs available' },
  'ph.activeCount': { zh: '种作用中', en: 'active' },
  'ph.src.fda': { zh: 'FDA 批准', en: 'FDA-approved' },
  'ph.src.trial': { zh: '临床研究', en: 'Clinical trial' },
  'ph.src.tool': { zh: '工具化合物', en: 'Tool compound' },
  'ph.onset': { zh: '起效中', en: 'Taking effect' },
  'ph.therapeutic': { zh: '● 治疗浓度（靶点输出钳制中）', en: '● Therapeutic concentration (target output clamped)' },
  'ph.introA': { zh: '投药后靶点分子', en: 'After dosing, the target molecule’s ' },
  'ph.introB': { zh: '催化输出被钳制', en: 'catalytic output is clamped' },
  'ph.introC': {
    zh: '（上游磷酸化仍会累积——如曲美替尼下 pMEK 升高），下游级联断流。可在投药前先播放模拟让通路激活，再观察药物阻断效果与洗脱后的信号恢复。',
    en: ' (upstream phosphorylation still accumulates — e.g. pMEK rises under trametinib), cutting off the downstream cascade. Run the simulation to activate the pathway before dosing, then watch the blockade and the signal recovery after washout.',
  },
  'ph.emptyTitle': { zh: '当前通路核心子图内无已收录药物的可作用靶点', en: 'No curated drug targets are present in this pathway’s core subgraph' },
  'ph.emptyHint': { zh: '尝试切换 MAPK / PI3K-Akt / JAK-STAT / p53 等通路', en: 'Try switching to MAPK / PI3K-Akt / JAK-STAT / p53 pathways' },

  /* ============ AI 助手 ai-assistant ============ */
  'ai.welcome': {
    zh: '我是本实验室的分子生物学助手。可以问我当前演示通路中的任何分子机制问题 —— 例如"ERK 磷酸化后进入细胞核发生了什么？"或"为什么癌细胞模型不注射配体 ERK 也会激活？"',
    en: 'I am this lab’s molecular biology assistant. Ask me anything about the molecular mechanisms in the pathway being demonstrated — e.g. "What happens after ERK is phosphorylated and enters the nucleus?" or "Why does ERK stay active in the cancer model even without ligand injection?"',
  },
  'ai.reqFail': { zh: '请求失败', en: 'Request failed' },
  'ai.unavailable': { zh: 'AI 助手暂时不可用，请稍后重试。', en: 'The AI assistant is temporarily unavailable. Please try again later.' },
  'ai.q.downstream': { zh: '当前已激活的下游信号意味着什么？', en: 'What does the currently activated downstream signaling mean?' },
  'ai.q.timing': { zh: '信号从受体到细胞核需要多久？', en: 'How long does the signal take to travel from receptor to nucleus?' },
  'ai.q.mutations': { zh: '本细胞系的驱动突变如何改变信号流？', en: 'How do this cell line’s driver mutations reshape signal flow?' },
  'ai.q.feedback': { zh: '这条通路的负反馈机制是什么？', en: 'What is the negative feedback mechanism of this pathway?' },
  'ai.q.mapk': { zh: 'MAPK 级联为什么有三层激酶？', en: 'Why does the MAPK cascade have three kinase tiers?' },
  'ai.title': { zh: 'AI 分子生物学助手', en: 'AI molecular biology assistant' },
  'ai.ctxBadge': { zh: '带实时上下文', en: 'Live context' },
  'ai.clear': { zh: '清空对话', en: 'Clear conversation' },
  'ai.thinking': { zh: '正在结合当前模拟状态分析…', en: 'Analyzing with the current simulation state…' },
  'ai.placeholder': { zh: '询问分子机制…', en: 'Ask about molecular mechanisms…' },

  /* ============ 2D 切面视图 virtual-cell ============ */
  'vc.loading': { zh: '通路数据加载中…', en: 'Loading pathway data…' },
  'vc.aria': { zh: '虚拟细胞信号转导演示画布', en: 'Virtual cell signaling demonstration canvas' },
  'vc.zone.extra': { zh: 'EXTRACELLULAR · 细胞外', en: 'EXTRACELLULAR' },
  'vc.zone.membrane': { zh: 'PLASMA MEMBRANE · 质膜', en: 'PLASMA MEMBRANE' },
  'vc.zone.cytoplasm': { zh: 'CYTOPLASM · 细胞质', en: 'CYTOPLASM' },
  'vc.legend.ligand': { zh: '配体', en: 'Ligand' },
  'vc.legend.receptor': { zh: '受体/通道', en: 'Receptor/Channel' },
  'vc.legend.kinase': { zh: '激酶', en: 'Kinase' },
  'vc.legend.gtpase': { zh: '小G蛋白', en: 'Small G protein' },
  'vc.legend.tf': { zh: '转录因子', en: 'TF' },
  'vc.legend.gene': { zh: '靶基因', en: 'Target gene' },
  'vc.legend.act': { zh: '激活', en: 'Activation' },
  'vc.legend.inh': { zh: '抑制', en: 'Inhibition' },
  'vc.legend.expr': { zh: '转录', en: 'Transcription' },
  'vc.legend.phospho': { zh: '磷酸化', en: 'Phosphorylation' },
  'vc.zoomIn': { zh: '放大', en: 'Zoom in' },
  'vc.zoomOut': { zh: '缩小', en: 'Zoom out' },
  'vc.zoomReset': { zh: '重置视图', en: 'Reset view' },
  'vc.kind.ligand': { zh: '配体', en: 'Ligand' },
  'vc.kind.receptor': { zh: '受体', en: 'Receptor' },
  'vc.kind.channel': { zh: '通道', en: 'Channel' },
  'vc.kind.kinase': { zh: '激酶', en: 'Kinase' },
  'vc.kind.phosphatase': { zh: '磷酸酶', en: 'Phosphatase' },
  'vc.kind.adapter': { zh: '接头', en: 'Adapter' },
  'vc.kind.gtpase': { zh: 'G 蛋白', en: 'G protein' },
  'vc.kind.tf': { zh: '转录因子', en: 'Transcription factor' },
  'vc.kind.gene': { zh: '靶基因', en: 'Target gene' },
  'vc.kind.compound': { zh: '信使', en: 'Messenger' },
  'vc.kind.enzyme': { zh: '酶', en: 'Enzyme' },
  'vc.kind.default': { zh: '分子', en: 'Molecule' },
  'vc.located': { zh: '定位于', en: 'located in' },
  'vc.synthetic': { zh: '合成节点', en: 'Synthetic node' },
  'vc.activity': { zh: '活性', en: 'Activity' },
  'vc.phosphoPct': { zh: '磷酸化', en: 'Phospho' },
  'vc.clickProfile': { zh: '点击查看分子档案 →', en: 'Click for molecule profile →' },

  /* ============ 转录组热图 transcriptomic-heatmap ============ */
  'th.waiting': { zh: '等待通路加载…', en: 'Waiting for pathway…' },
  'th.emptyTitle': { zh: '尚无转录响应数据', en: 'No transcriptional response data yet' },
  'th.emptyDesc': { zh: '注射配体并播放模拟，等待级联传导至核内靶基因', en: 'Inject a ligand and run the simulation — wait for the cascade to reach the nuclear target genes' },
  'th.title': { zh: '转录组响应谱', en: 'Transcriptional response profile' },
  'th.csvTip': { zh: '导出 CSV（基因 × 时间活性矩阵，含 BOM 可直接用 Excel 打开）', en: 'Export CSV (genes × time activity matrix, with BOM, opens directly in Excel)' },
  'th.genes': { zh: '核内靶基因', en: 'Nuclear target genes' },
  'th.responding': { zh: '显著响应 (峰 >30%)', en: 'Responding (peak >30%)' },
  'th.sampleEnd': { zh: '采样终点', en: 'Sample end' },
  'th.aria': { zh: '转录组响应热图', en: 'Transcriptomic response heatmap' },
  'th.topRank': { zh: '峰值响应排行', en: 'Peak response ranking' },
  'th.peak': { zh: '峰', en: 'peak' },
  'th.low': { zh: '低', en: 'Low' },
  'th.intensity': { zh: '转录强度', en: 'Transcription intensity' },
  'th.footnote': {
    zh: '行 = 核内靶基因（▲ = 峰值时刻），列 = 模拟时间（每列 0.5s×降采样）。活性为转录强度代理，色标模拟荧光报告强度。',
    en: 'Rows = nuclear target genes (▲ = peak time); columns = simulated time (0.5 s each, downsampled). Activity is a proxy for transcriptional intensity; the color scale mimics a fluorescence reporter.',
  },

  /* ============ KEGG 图谱视图 pathway-map-view ============ */
  'pm.loading': { zh: '通路图谱渲染中…', en: 'Rendering pathway map…' },
  'pm.aria': { zh: 'KEGG 通路图谱', en: 'KEGG pathway map' },
  'pm.zoomIn': { zh: '放大', en: 'Zoom in' },
  'pm.zoomOut': { zh: '缩小', en: 'Zoom out' },
  'pm.zoomReset': { zh: '重置', en: 'Reset' },
  'pm.origLayout': { zh: 'KEGG 原始拓扑布局', en: 'KEGG native layout' },
  'pm.compound': { zh: '化合物', en: 'Compound' },
  'pm.gene': { zh: '基因', en: 'Gene' },
  'pm.closePick': { zh: '关闭分子信息卡', en: 'Close molecule info card' },
  'pm.infoAria': { zh: '分子信息：', en: 'Molecule info: ' },
  'pm.openInKegg': { zh: '在 KEGG 打开', en: 'Open in KEGG' },
  'pm.notInCore': {
    zh: '该分子在全图中，未进入核心演示子图（可在 3D/2D 视图演示的分子集）',
    en: 'This molecule appears in the full map but lies outside the core demo subgraph (the set demonstrated in the 3D/2D views)',
  },
  'pm.officialMap': { zh: 'KEGG 官方通路图 ↗', en: 'KEGG official pathway map ↗' },

  /* ============ 对照实验 compare-view ============ */
  'cmp.arm': { zh: '臂', en: 'Arm' },
  'cmp.control': { zh: '对照', en: 'Control' },
  'cmp.test': { zh: '实验', en: 'Test' },
  'cmp.title': { zh: '通路对照实验', en: 'Side-by-side pathway compare' },
  'cmp.subtitle': { zh: '同通路/同刺激/不同遗传背景 · 单变量实验设计', en: 'same pathway / same stimulus / different genetics · single-variable design' },
  'cmp.pause': { zh: '暂停', en: 'Pause' },
  'cmp.stimulate': { zh: '同步刺激', en: 'Stimulate both' },
  'cmp.reset': { zh: '重置', en: 'Reset' },
  'cmp.costim': { zh: '共同刺激:', en: 'Shared stimulus:' },
  'cmp.direct': { zh: '直接刺激:', en: 'Direct stimulation:' },
  'cmp.tipReceptor': { zh: '受体直接刺激（等效配体结合后构象激活）', en: 'Direct receptor stimulation (conformational activation equivalent to ligand binding)' },
  'cmp.tipStress': { zh: '应激刺激入口（等效上游生理激活）', en: 'Stress stimulation entry (equivalent upstream physiological activation)' },
  'cmp.exit': { zh: '退出对照', en: 'Exit compare' },
  'cmp.cellLine': { zh: '细胞系', en: 'cell line' },
  'cmp.cellViewAria': { zh: '细胞通路视图', en: ' pathway view' },
  'cmp.autonomous': { zh: '自主激活分子', en: 'Autonomous molecules' },
  'cmp.autonomousDesc': { zh: '仅实验臂激活（Δ>0.5）', en: 'Active only in test arm (Δ>0.5)' },
  'cmp.meanDelta': { zh: '平均活性差', en: 'Mean Δ activity' },
  'cmp.meanDeltaDesc': { zh: '实验臂 − 对照臂', en: 'Test arm − control arm' },
  'cmp.phase4Lead': { zh: '转录应答提前', en: 'Transcription lead' },
  'cmp.phase4LeadDesc': { zh: '阶段④首达时差（负=B 更快）', en: 'Phase ④ first-hit gap (negative = B faster)' },
  'cmp.totalEvents': { zh: '事件总数', en: 'Total events' },
  'cmp.totalEventsDesc': { zh: '两臂分子事件合计', en: 'Molecular events across both arms' },
  'cmp.tabDelta': { zh: '分子差异', en: 'Molecular Δ' },
  'cmp.tabEvents': { zh: '实验臂事件', en: 'Test-arm events' },
  'cmp.tier.ligand': { zh: '配体', en: 'Ligand' },
  'cmp.tier.membrane': { zh: '膜', en: 'Membrane' },
  'cmp.tier.nucleus': { zh: '核', en: 'Nucleus' },
  'cmp.tier.cytoplasm': { zh: '胞质', en: 'Cytosol' },
  'cmp.actGap': { zh: '激活时差', en: 'Δ activation' },
  'cmp.testFaster': { zh: '实验臂更快', en: 'test arm faster' },
  'cmp.ctrlFaster': { zh: '对照臂更快', en: 'control arm faster' },
  'cmp.constitutive': { zh: '⚠ 组成性活化 —— 不依赖上游刺激', en: '⚠ Constitutive activation — independent of upstream stimulus' },
  'cmp.emptyDelta': { zh: '播放模拟后显示分子级差异', en: 'Run the simulation to see molecule-level differences' },
  'cmp.emptyEvents': { zh: '播放模拟后显示实验臂事件流', en: 'Run the simulation to see the test-arm event stream' },
  'cmp.footnote': {
    zh: '对照设计：两臂共享同一 KEGG 子图、同一配体剂量与引擎参数，唯一变量为细胞系遗传背景（突变以 M/KO 徽标标注）。★ = 两臂共同响应配体。',
    en: 'Design: both arms share the same KEGG subgraph, ligand dose and engine parameters; the only variable is the cell line’s genetic background (mutations flagged with M/KO badges). ★ = ligand co-responded in both arms.',
  },

  /* ============ 形态学标注 morphologies ============ */
  'morph.bileCanaliculus': { zh: '胆小管', en: 'Bile canaliculus' },
  'morph.axon': { zh: '有髓轴突 → 突触终末', en: 'Myelinated axon → terminal' },
  'morph.dendrite': { zh: '树突', en: 'Dendrite' },
  'morph.microvilli': { zh: '微绒毛', en: 'Microvilli' },
  'morph.tightJunction': { zh: '紧密连接', en: 'Tight junction' },
  'morph.basementMembrane': { zh: '基底膜', en: 'Basement membrane' },
  'morph.intercalatedDisc': { zh: '闰盘', en: 'Intercalated disc' },
  'morph.collagen': { zh: '胶原纤维（I 型）', en: 'Collagen fibers (type I)' },
  'morph.blebs': { zh: '膜出芽', en: 'Membrane blebs' },

  /* ============ 实验台 workspace ============ */
  'ws.compareTip': { zh: '同一通路在正常 vs 病变细胞中并排对照（单变量实验）', en: 'The same pathway side by side in normal vs diseased cells (single-variable experiment)' },
  'ws.loading': { zh: '加载中…', en: 'Loading…' },
  'ws.errTitle': { zh: '通路数据获取失败', en: 'Failed to fetch pathway data' },
  'ws.errHint': { zh: 'KEGG 上游服务可能暂时不可用，请稍后重试', en: 'The upstream KEGG service may be temporarily unavailable — please retry later' },
  'ws.tab.inspector': { zh: '检测', en: 'Inspect' },
  'ws.tab.timeline': { zh: '事件流', en: 'Events' },
  'ws.tab.heatmap': { zh: '转录组', en: 'Transcriptome' },
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
