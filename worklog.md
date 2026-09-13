# 虚拟细胞实验室 (VirtualCell Lab) — 项目工作日志

项目目标: 构建虚拟细胞平台，包含多种细胞类型，从 KEGG pathway 获取信号转导通路图，可在虚拟细胞上进行分子生物学级别的信号转导演示。UI 要求专业设计质感，内容保持科学性。

技术栈: Next.js 16 (App Router) + TypeScript + Tailwind 4 + shadcn/ui + Prisma (SQLite) + Zustand + TanStack Query + Framer Motion。数据源: KEGG REST API (rest.kegg.jp，已验证可访问)。

设计基调: "生物荧光实验室" 暗色主题 (emerald/teal/amber/rose，禁用 indigo/blue)，科学仪器 UI 质感。

---
Task ID: 1
Agent: 主协调 Agent (Z.ai Code)
Task: 定义共享类型契约 + 策划科学数据 (通路目录/细胞类型) + Prisma schema + 项目脚手架

Work Log:
- 验证环境: Next.js 16.1.3 dev server 运行于 3000 端口；KEGG REST API (list + KGML) 可正常访问
- 分析 hsa04010 KGML 结构: entry(gene/compound/map, graphics 坐标) + relation(PPrel/GErel, subtype: activation/inhibition/phosphorylation/expression...)
- 创建目录结构: src/types, src/data, src/lib/kegg, src/lib/simulation, src/store, src/components/lab
- 编写 src/types/kegg.ts — 前后端数据契约 (PathwayGraph/KeggEntry/CoreNode/CoreEdge/Compartment/MoleculeKind/EdgeKind)
- 编写 src/data/pathway-catalog.ts — 13 条 KEGG 信号转导通路目录 (MAPK/PI3K-Akt/Wnt/Notch/TGF-β/JAK-STAT/cAMP/Ca²⁺/mTOR/NF-κB/Apoptosis/p53/AMPK)，每条含专业中文描述、核心级联摘要、种子基因列表(用于子图提取)、合成配体定义
- 编写 src/data/cell-types.ts — 7 种细胞类型 (肝细胞/锥体神经元/CD4⁺T细胞/肠上皮细胞/心肌细胞/成纤维细胞/KRAS G12D 癌细胞)，含形态学 key、科学特征参数、受体列表、关联通路、突变定义(癌细胞 KRAS 组成性激活/PTEN 缺失/TP53 失活)
- 更新 prisma/schema.prisma — PathwayCache 模型 (id/name/graphJson/source/fetchedAt)

Stage Summary:
- 数据契约与科学内容策划完成；后端(子代理 Task 2-a)与前端(主代理 Task 3-6)可基于该契约并行开发
- API 契约: GET /api/pathways → 通路目录+统计; GET /api/pathways/[id] → PathwayGraph (KGML 解析+区室分类+核心子图提取+Prisma 缓存)
- 细胞视图模拟使用 core 子图 (≤42 节点)；通路图谱视图使用 KGML 全量节点原始坐标
- 待办: Task 2-a 后端 / Task 3 模拟引擎 / Task 4 虚拟细胞 SVG / Task 5 实验台 UI / Task 6 页面组装 / Task 7 AI 助手 / Task 8 QA / Task 9 cron

---
Task ID: 2-a
Agent: full-stack-developer 子代理（KEGG 后端服务）
Task: 实现 KEGG 后端服务 —— KGML 解析 / 分子区室分类 / 核心演示子图提取 / REST 客户端与二级缓存 / API 路由 / 预热脚本

Work Log:
- 阅读 worklog 与契约文件（src/types/kegg.ts、pathway-catalog.ts、schema.prisma、lib/db.ts），确认数据边界
- 抓取 hsa04024/hsa04010/hsa04330/hsa04020 KGML 样例分析结构：entry 属性跨行、group 含 component 子元素、graphics.name 为 "主符号, 别名..." 列表、relation 多 subtype
- 编写 src/lib/kegg/kgml-parser.ts：纯正则块匹配解析（entry/relation/graphics/component），XML 实体反转义，化合物 cpd-id→中文名映射表（38 个常见第二信使，含 cAMP/Ca²⁺/DAG/IP₃/肾上腺素等，经 rest.kegg.jp 核实）
- 编写 src/lib/kegg/classify.ts：两轮 label 优先分类（通道→受体→配体→TF→GTPase→磷酸酶→MAPK 级联→激酶→接头→磷脂酶→默认酶），配体/磷酸酶类别仅以主 label 判定以规避 KEGG 别名撞名（SOS1 alias "HGF"、AXIN1 alias "PPP1R49"）；124 个关键符号分类验证通过
- 关键发现 1：KEGG 多基因合并 entry（如 MAPK 通路 25 个 RTK 合并节点 label 只显示 CSF1R、RAS 家族节点 label 显示 RRAS2、Notch 的 RBPJ+RBPJL 合并节点 label 显示 RBPJL）
- 关键发现 2：部分通路关键分子不在 KGML 图中（cAMP 通路无 ADRB2/肾上腺素节点 → 正是 syntheticLigands 的设计动机）
- 编写 src/lib/kegg/kegg-client.ts：hsa-id→官方基因符号全表 lazy 映射（rest.kegg.jp/list/hsa，2.6MB TSV，失败降级）+ 合并 entry aliases 成员符号补全 + 种子命中时 label 提升（CSF1R→EGFR、RRAS2→HRAS、RBPJL→RBPJ、MAML3→MAML1）；内存缓存（globalThis + CACHE_VERSION 版本失效）→ Prisma PathwayCache → 在线 fetch（15s AbortController）三级数据流，在线失败回退 DB；并发 inflight 去重
- 编写 src/lib/kegg/subgraph.ts：种子匹配（度数补齐/截断）→ 邻接 BFS 1 层（类别+关键关系加权打分，低联通自动加深）→ 合成配体注入（receptor 缺失时连受体一并合成，如 EPI+ADRB2）→ 种子配体补全（LIGAND_RECEPTORS 亲和表，缺配体且有明确受体时合成，如 MAPK 的 EGF）→ 边生成（EdgeKind 映射、group 重定向到成员、compound 节点 cpd: 前缀 id）→ GErel expression/repression 目标修正 tier 6/nucleus/gene → 剔除 0 度非配体节点 → 硬上限 42
- 编写 src/lib/kegg/index.ts 统一导出；实现 GET /api/pathways（目录+DB stats 附加，不触发在线抓取）与 GET /api/pathways/[id]（404/503 语义，maxDuration=30，Next 16 Promise params）
- 编写 scripts/seed-kegg.ts 预热脚本（相对导入，独立 bun 进程直写 SQLite）
- 修复迭代：SOS1 误判 ligand（alias HGF 撞名）→ 配体仅 label 判定；AXIN1/CASP9/TSC2 误判 phosphatase（alias PPP1Rxx 撞名）→ PPP 正则收紧为催化亚基命名 + 两轮 label 优先分类
- 验证：lint 通过、tsc 我方文件零错误、13/13 通路 API 可访问、二级缓存命中 source=db-cache、EPI→ADRB2 binding 边存在

Stage Summary:
- 产出文件：src/lib/kegg/{kgml-parser,classify,subgraph,kegg-client,index}.ts、src/app/api/pathways/route.ts、src/app/api/pathways/[id]/route.ts、scripts/seed-kegg.ts
- API 契约达成：GET /api/pathways → { pathways: [...catalog, stats] }（13 条，缓存通路带 geneCount/relationCount/coreCount）；GET /api/pathways/hsa04010 → PathwayGraph（meta/nodes/relations/core/stats/fetchedAt/source）
- 核心子图统计（13 条通路）：428 节点 / 604 边 / 平均 32.9 节点（min 29 hsa04152 / max 40 hsa04630，均在 28~42 契约区间）；kind 分布 kinase 82 / enzyme 89 / tf 71 / gene 53 / adapter 43 / receptor 30 / ligand 22 / channel 13 / gtpase 14 / phosphatase 7 / compound 4；合成节点 3 个（EPI→ADRB2、ACh→PLCB2、IL2→IL2RB，全部带 binding 边）
- 信号级联验证：MAPK 完整链 EGF→EGFR→GRB2→SOS1→HRAS→RAF1→MAP2K1/2→MAPK1→ELK1→FOS + 应激分支 + DUSP 负反馈；Notch 链 DLL1/JAG1→NOTCH1→ADAM17/γ-secretase→RBPJ/MAML1→HES1/HEY1；cAMP 链 EPI→ADRB2→GNAS→ADCY→cAMP→PKA→CREB1→FOS + EPAC/Rap1 分支；区室分层科学合理（配体 extracellular / 受体通道 membrane / 级联 cytoplasm / TF 与靶基因 nucleus）
- 数据源工程化：KGML 在线解析 + hsa 符号表 + Prisma 缓存（SQLite），冷启动首请求 ~6s（含 2.6MB 符号表拉取），缓存命中 <10ms；scripts/seed-kegg.ts 一键预热全部通路
- 注意事项（移交后续 agent）：KEGG 合并 entry 经 label 提升后 label 可能为种子符号（如 EGFR）而非 graphics.name 原值（原值保留在 aliases[0]）；CoreNode id 对 label 撞名的重复 entry 使用 "e{entryId}" 兜底（如 MAPK 通路两个 FOS entry → FOS + e137）；tsc 全仓检查存在 Task 1 的 src/data/cell-types.ts features 字段缺失错误（不在本任务边界，需 Task 1/前端侧修复）

---
Task ID: 3-8
Agent: 主协调 Agent (Z.ai Code)
Task: 前端全栈实现 —— 模拟引擎 / 虚拟细胞 SVG / 实验台 UI / 页面组装 / AI 助手 / 端到端 QA

Work Log:
- src/lib/simulation/engine.ts: 离散动力学模拟引擎（节点活性 0-1 沿边传播、磷酸化修饰、抑制衰减、配体注入/洗脱、突变锁定、事件生成）。关键修正：KGML 的 binding/association 边绘制方向常与生物信号流相反（如 GRB2→EGFR 表示"GRB2 结合 EGFR"），引擎实现双向传播解决级联断链
- src/lib/simulation/molecular-notes.ts: ~110 条分子功能注释 + ~120 条策划级联事件（精确到残基：MEK1 双磷酸化 ERK2 T185/Y187、GRB2 SH2 结合 EGFR pY1068、Calcineurin 去磷酸化 NFAT SRR1 等）
- src/lib/simulation/layout.ts: 细胞视图布局引擎（配体→细胞外带、受体→膜层、胞质级联按受体分支聚类分带、tf/靶基因→核内极坐标；按细胞体边界自适应 x 分布）
- src/lib/simulation/scaffold.ts: 转录支架边（补全 KEGG 匿名复合体节点造成的 ELK1→FOS 等断链，仅当两端存在且边缺失时添加）
- src/store/lab-store.ts: zustand 全局状态（图加载+突变应用+tick 循环+事件流+活性历史环形缓冲）；自动注射逻辑选择"有下游连接"的配体并优先细胞系响应配体
- src/components/lab/morphologies.tsx: 7 种细胞形态学 SVG（磷脂双分子层/细胞核双层膜+核孔+核仁/线粒体嵴/粗面内质网/高尔基；肝细胞双核+糖原+胆小管、神经元树突+髓鞘轴突、T 细胞微绒毛+高核质比、上皮微绒毛刷状缘+紧密连接+基底膜、心肌横纹+闰盘、成纤维梭形+胶原分泌、癌细胞不规则+膜出芽+多核）
- src/components/lab/virtual-cell.tsx: 交互 SVG 主场景（节点状态渐变/激活发光/磷酸化 P 徽标/突变 M·KO 徽标/SMIL 信号粒子/edge-flow 流动动画/缩放平移/悬停分子卡）
- src/components/lab/pathway-map-view.tsx: KEGG 原始坐标通路图谱视图（全图拓扑+模拟状态联动）
- src/components/lab/{playback,inspector,timeline,pathway-library,workspace,cell-picker,ai-assistant,providers}.tsx: 实验台 UI 全套
- src/app/api/assistant/route.ts: AI 助手后端（z-ai-web-dev-sdk，注入实时模拟上下文：通路/细胞系/激活分子/最近事件）
- src/app/page.tsx + layout.tsx + globals.css: 页面组装（Hero/细胞选择/实验台/数据与方法/吸底页脚；生物荧光暗色主题 emerald/teal/amber/rose）
- 修复 3 个关键 bug: ①workspace 第二个 useEffect 将已加载 graph 覆盖为 null（加载死循环）②引擎中合成配体（EGF/EPI/IL2/ACh）活性更新被逻辑错误跳过 ③自动注射选中无下游受体的 TGFB1 导致信号死寂
- agent-browser 端到端 QA: MAPK EGF→ERK 全级联（阶段 4/4、22 事件、T+30.5s）、KEGG 图谱视图、癌细胞 KRAS 组成性激活（免配体）、AI 助手 KRAS G12D 问答、事件流时间线、移动端 420px 响应式、无 console 错误
- bun run lint 零错误、tsc 零错误（项目自有代码）

Stage Summary:
- 核心体验闭环完成: 选细胞系 → 选 KEGG 通路（REST 实时获取）→ 注射配体 → 观察分子级信号转导（双视图联动）→ 查分子档案/事件流 → AI 助手答疑
- 级联事件带策划的残基级描述（用户可见的科学深度）
- 癌细胞模型演示"增殖信号自主性"：KRAS G12D 组成性激活，无需配体
- 已知小瑕疵（低优先级）: 通路图谱视图中 scaffold 边不显示（仅核心子图视图可见）; FOS 在核内出现两个实例（ERK 分支与 JNK 分支，KEGG 原图如此）

---
Task ID: 9
Agent: 主协调 Agent (Z.ai Code)
Task: 部署 15 分钟周期 webDevReview 巡检任务 + 交付收尾

Work Log:
- 创建 cron 任务（job_id: 382124，fixed_rate 900s，kind=webDevReview）：每 15 分钟自动巡检项目状态、agent-browser QA、自主修复或推进新需求
- 交付前状态确认: dev server 端口 3000 运行正常、lint/tsc 零错误、全部 API 200、浏览器端到端验证通过

Stage Summary:
- 项目首版交付完成。下一阶段建议优先事项（供 cron 巡检代理参考）:
  1. 信号扰动实验：激酶抑制剂按钮（如 MEK 抑制剂曲美替尼 → MAPK1 活性钳制 0，观察通路代偿）
  2. 实验报告导出（PDF：事件流 + 活性曲线 + 分子清单）
  3. 转录组响应热图（tier 6 靶基因 × 时间）
  4. 通路对比模式（正常 vs 癌细胞同通路并排）
  5. 教学引导（分步高亮讲解经典级联）
  6. 更多细胞类型（肝星状细胞/NK 细胞/β 细胞）与通路（VEGF/ Hippo/ cGAS-STING）
