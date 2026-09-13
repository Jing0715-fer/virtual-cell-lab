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

---
Task ID: 10
Agent: 主协调 Agent (Z.ai Code)
Task: 3D 沉浸式虚拟细胞升级 —— 真实 3D 细胞结构 + 通路表现增强 + 科学严谨性打磨（响应用户新需求）

Work Log:
- 安装 three@0.180 + @react-three/fiber@9.3 + @react-three/drei@10.7（React 19 / Next 16 兼容组合）
- src/lib/simulation/layout3d.ts: 3D 径向布局引擎 —— 配体→胞外壳层(R*1.235) / 受体→膜面(带法向，跨膜胶囊体) / 胞质级联 tier2-4→壳层(0.845/0.715/0.59) / TF→核内环(0.74N) / 靶基因→内环(0.45N)；受体分支按经度聚类形成"径向信号光束"（每条通路级联清晰可循）；确定性哈希抖动保证布局稳定；二次贝塞尔边曲线（24 采样点 + 垂直确定性弯曲避免平行边重叠）；7 种细胞形态 3D 规格（心肌 16 线粒体/T 细胞高核质比 5.4/成纤维梭形拉伸/癌变核多形性+3 核仁）
- src/components/cell3d/organelles.tsx: 命令式 three.js 细胞超微结构构建器（~560 行）—— 磷脂双分子层（内外两叶 720×2 实例化脂头，斐波那契球面）+ 核被膜双层 + 52 核孔复合体（环面沿法向）+ 核仁 + 14 染色质纤维 + 线粒体（外膜胶囊+波浪嵴管+环状嵴板，9-16 个/细胞型）+ 粗面内质网（扁平囊池+膜旁核糖体实例化）+ 高尔基体（顺→反 5 囊池+出芽囊泡）+ 运输囊泡 + 中心体放射微管 + 300 胞质颗粒（分子拥挤）；细胞类型特化：肝糖原玫瑰体/上皮微绒毛刷状缘+紧密连接带/成纤维胞外 I 型胶原/神经元髓鞘轴突（郎飞氏结）+树突/癌细胞膜出芽；帧驱动动画（线粒体漂移、胞质旋转、核仁呼吸）+ 全量 dispose
- src/components/cell3d/molecules.tsx: 3D 分子层 —— 受体=跨膜α螺旋胶囊+胞外配体结合域+胞内信号域（沿膜法向），配体=布朗漂移小球，激酶等=发光球（emissiveIntensity=0.35+活性×2.4）+ 加性光晕呼吸 + 磷酸化琥珀环（旋转+scale=磷化水平）+ 突变 M/KO 徽标 + Html transform 标签（活性 is-active/磷化 is-phospho CSS 类 imperative 切换）+ 悬停分子卡（NODE_NOTES 残基级注释）+ 点击选中（联动右栏检测器）
- src/components/cell3d/signal-edges.tsx: 信号边层 —— drei Line2 曲线（激活翡翠/抑制玫红虚线/表达琥珀），opacity=0.16+通量×1.15 逐帧 imperative 更新；流动粒子单 InstancedMesh（每边 2 粒，速度=2.2+通量×5.2，实例色随边类型）
- src/components/cell3d/virtual-cell-3d.tsx: 主场景 —— R3F Canvas + 三点光照（含胞内 teal 点光 + 核内 rose 点光）+ OrbitControls（阻尼+自动环视）；CameraRig 四机位（全景 31/质膜近景 6.2 锚定最活跃受体/核内视角 3.4/跟随信号 6.5 阻尼追踪最近激活分子）；HUD：实验信息卡（T+时间/阶段/分子数/真实直径+非等比声明）、显示开关（解剖标注/全部标签/专注模式/自动环视）、图例（11 分子类+4 边语义）、比例尺；zustand 订阅写入可变快照引用（nodeStates/signalFlux），useFrame 直读 → 模拟 60fps 无 React 重渲染
- workspace.tsx 集成：三视图切换（3D 沉浸默认/2D 切面/KEGG 图谱）+ next/dynamic ssr:false + 加载动画；lab-store ViewMode 扩展
- globals.css: mol3d-label（11 类分子色）/mol3d-tip（残基级注释卡）/anatomy-tag（解剖标注）样式体系
- 关键 bug 修复 ×2：① drei Html transform 内层容器默认 pointerEvents='auto' 导致 32 个标签 DOM 覆盖层拦截全部指针事件（分子无法点击/悬停）→ 所有 Html 传 pointerEvents="none" prop ② workspace 画布容器 onClick=selectNode(null) 在 R3F 事件后触发（R3F stopPropagation 不阻止 DOM 冒泡）导致选中被清空 → 非 3D 视图才执行
- React Compiler lint 规则适配：molecules.tsx 命令式材质变异为 R3F 标准范式（项目未启用 compiler）局部禁用 react-hooks/immutability；organelles refs 违规改为直调
- agent-browser 端到端 QA 全通过：3D 渲染（VLM 确认球形细胞/膜/核/发光分子/流动粒子）、播放+自动注射（T+8s）、跟随信号（相机推进聚焦级联末端）、质膜近景（EGFR/GRB2 聚焦）、核内视角（MYC/JUN/FOS 转录因子环境）、专注模式（背景暗化仅活跃级联发光）、解剖标注、分子点击→检测器档案（MAPK1/ERK2 别名+活性+磷化+注释+互作网络）、悬停分子卡（MAPK8 JNK1 Ser63/73 注释）、三视图切换、420px 移动端（3D 画布+HUD 完整）、无 console error、lint/tsc 零错误

Stage Summary:
- 交付 3D 沉浸式虚拟细胞：真实球状细胞（超微结构级细胞器 + 7 细胞型形态特化）作为舞台，核心子图分子按区室径向布局，信号级联以"光束+粒子流"呈现
- 通路清晰度三重保障：径向信号束布局（每条受体分支一束）/ 专注模式（熄灭背景只留活跃级联）/ 跟随信号（相机自动追踪最新激活分子）
- 科学严谨性：解剖标注（质膜/核孔复合体/核仁/线粒体嵴/粗面内质网/高尔基体/微管 + 各型特化结构，中英双语）、真实直径标示+非等比声明、残基级悬停注释、受体跨膜结构域分离表征
- 性能架构：模拟状态 zustand 订阅→可变快照→useFrame 直读，全程无逐 tick React 重渲染；静态结构命令式构建+memo
- 后续建议（供 cron 巡检代理）：
  1. 3D 场景 Bloom 后处理（@react-three/postprocessing）增强辉光质感
  2. 分子间"信号事件脉冲"特效（结合事件流高亮对应边爆发）
  3. 激酶抑制剂实验（曲美替尼钳制 MEK）在 3D 中观察代偿
  4. 转录动画：核内 TF→靶基因表达后 mRNA 出核粒子
  5. 教学引导模式：分步高亮经典级联（EGF→EGFR→RAS→RAF→MEK→ERK→ELK1→FOS）
  6. WebGPU/LOD 优化与低端设备降级（粒子数自适应）

---
Task ID: 11（药理扰动模块，由上一轮 cron 巡检代理实现，未记录于此——补录）
Agent: cron 巡检代理（推断）
Task: 激酶抑制剂药理扰动实验
Work Log（补录，依据现存代码反推）:
- src/data/inhibitors.ts: 18 种药物（曲美替尼/厄洛替尼/维罗非尼/阿培利司/雷帕霉素/维奈克拉/鲁索替尼等），机制精确到结构域残基级
- engine.ts 增加 inhibition 门控（上游磷酸化照常累积、催化输出钳制）
- lab-store.ts 增加 inhibitors/drugLevels/inhibition 状态与药代动力学（起效 ramp / 洗脱清除）
- pharmacology.tsx 药理面板（按通路核心子图智能筛选药物、投药/洗脱、靶点活性监控条）
- 3D molecules.tsx 增加药物抑制环（紫色 ⊘ 徽标 + is-inhibited 标签类）

---
Task ID: 12
Agent: 主协调 Agent (Z.ai Code)
Task: QA 巡检 + 2 个 bug 修复 + 3 个新功能（Bloom 后处理 / 教学引导模式 / mRNA 出核动画）

Work Log:
- [QA] agent-browser 端到端巡检: 页面加载、3D 渲染（VLM 确认细胞球体/发光分子/标签）、模拟播放（T+7.5s 自动注射 EGF）、药理面板（曲美替尼投药→治疗浓度→靶点输出钳制）、分子点击→检测器档案（FOS 选中成功）、2D 切面视图、AI 助手（残基级回答）、无 console error、lint/tsc 零错误
- [QA 方法论发现] 早期"点击分子失败"为测试坐标受页面滚动/相机拖拽漂移影响，非应用 bug；用 scrollIntoView + hover 扫描法验证点击功能正常
- [BUG A 修复] KEGG 图谱视图垂直 map 条目（Cell cycle 34×271 竖长参考框）fontSize 用高度计算导致巨幅"水印"文字遮挡图谱 → pathway-map-view.tsx: 垂直条目（h/w≥2.2）rotate(-90) 旋转文字 + fontSize 以宽度为准 + 按 label 长度钳制；TITLE 条目净化为无框图谱标题（去 "TITLE:" 前缀）；map 条目虚线青绿框样式 + 点击跳转关联通路（收录范围内 selectPathway，CATALOG_IDS 校验）
- [BUG B 修复] 3D 相机预设（全景/核内/质膜近景）只恢复距离与目标不恢复观察方位——用户拖歪视角后点"全景"仍歪斜 → CameraRig desired.dir 标准方位向量 + 方位阻尼插值（overview (0,0.33,0.94) / nucleus (0.35,0.25,0.9) / membrane (0.15,0.28,0.94)；follow/free/tour 保留用户视角）；QA 验证：拖歪后点全景 31/32 标签回视野、VLM 确认标准构图恢复
- [新功能 A: Bloom 后处理] 安装 @react-three/postprocessing@3.1.1 + postprocessing@6.39.5 + fiber 升级 9.3.0→9.7.0（满足 peer >=9.7，drei 10.7.6 兼容 ^9.0.0）→ EffectComposer（multisampling 4）+ Bloom（mipmapBlur, intensity 1.25, luminanceThreshold 0.52）+ Vignette（offset 0.22, darkness 0.52）；HUD 新增"辉光渲染"开关（默认开）；VLM 确认柔和光晕扩散 + 边缘暗角聚焦效果
- [新功能 B: 教学引导模式] src/lib/simulation/guided-tour.ts（MAPK 手工策划 10 站级联 EGF→EGFR→GRB2→SOS1→HRAS→RAF1→MAP2K1→MAPK1→ELK1→FOS，每站教学标题；其余通路自动推导：配体起点贪心游走，优先 CURATED_EVENTS 残基级注释边 + tier 递进，含 binding 反向边双向处理，≤11 站）→ virtual-cell-3d.tsx: CamMode 新增 'tour'（目标分子 dist 7.8 阻尼追踪）、SimSnapshot 新增 tourNode/tourNeighbors（聚焦分子发光脉冲 +1.5 emissive、邻接边 0.9 高亮、其余 0.03 压暗、粒子流仅走邻接边）、底部教学卡（站点标题/级联⟶残基注释/分子功能注释/进度点跳转/自动 7s 推进/上一站下一站导航/末站导出提示）、进入教学自动暂停模拟+关自动环视、每站 selectNode 联动右栏检测器；HudToggle 支持 highlight 强调色 + disabled
- [新功能 C: mRNA 转录出核动画] src/components/cell3d/mrna-flow.tsx（~150 行）: 订阅事件流 kind='expression' 事件 → 8 条 mRNA 粒子池孵化；三段路径（基因位点 smoothstep→核孔穿越点(核被膜外缘径向)→胞质 ER 区带终点）；琥珀色胶囊体（emissive 1.35）+ 布朗游动 + 出核瞬间放大脉冲 + 终点淡出；事件 id 去重（Set 池化防泄漏）；图例新增"mRNA 出核"条目；VLM 确认 3-4 个琥珀粒子从核边界移向胞质
- [React 19 lint 适配] react-hooks/set-state-in-effect 规则: 通路切换重置 tourIdx 改为渲染期间状态调整模式（lastTourKey 比对）; 进入/退出教学的 setState 移入 openTour 事件处理器
- QA 全量回归: Bloom/Vignette VLM 确认 ✓、教学卡 + 分子高亮 + 相机聚焦 + 检测器联动 + 自动推进 VLM 确认 ✓、mRNA 出核粒子 VLM 确认 ✓、图谱水印消除/竖排条目/虚线关联框 VLM 确认 ✓、相机方位恢复 ✓、420px 移动端教学卡无溢出 ✓、AI 助手 POST 200 残基级回答 ✓、lint 零错误 / tsc 自有代码零错误 / dev.log 无异常

Stage Summary:
- 项目当前状态: 3D 沉浸式虚拟细胞平台（13 KEGG 通路 + 7 细胞系 + 分子级模拟引擎 + 药理扰动 + 三视图 + AI 助手）+ Bloom 质感 + 教学引导 + mRNA 出核动画，全部 QA 通过，稳定可交付
- 本轮产出: 修复 2 个 bug（图谱垂直条目水印、相机预设不回正）+ 3 个新功能（Bloom 后处理辉光、教学引导模式 10 站级联讲解、mRNA 转录出核粒子动画）
- 依赖变更: @react-three/fiber 9.3.0→9.7.0、新增 @react-three/postprocessing@3.1.1（含 postprocessing@6.39.5）
- 未解决问题/风险（供下一阶段）:
  1. 教学引导仅 MAPK 手工策划（含教学标题），其余 12 条通路为自动推导级联（注释质量依赖 CURATED_EVENTS 覆盖度，cAMP/Ca/JAK-STAT/PI3K 覆盖较好，Wnt/Notch/TGF-β 等覆盖较薄）
  2. Bloom 在低端设备可能增加 GPU 负担（已默认开启，可考虑按设备性能自适应降级 dpr/关闭 Bloom）
  3. worklog 曾出现一轮 cron 代理工作未记录（Task 11 补录）——后续代理务必及时写日志
  4. KEGG 图谱视图 scaffold 边不显示（旧已知问题，低优先级）
- 下一阶段建议优先事项:
  1. 信号事件脉冲特效（事件流驱动对应信号边爆发高亮——worklog 遗留建议 2）
  2. 更多通路的教学级联手工策划（PI3K-Akt / JAK-STAT / cAMP 优先，已有丰富 CURATED_EVENTS 素材）
  3. 实验报告导出（PDF: 事件流 + 活性曲线 + 分子清单）
  4. 转录组响应热图（tier 6 靶基因 × 时间）
  5. 通路对比模式（正常 vs 癌细胞同通路并排）

---
Task ID: 13
Agent: 主协调 Agent (Z.ai Code)
Task: QA 巡检 + 3 个新功能（信号事件脉冲特效 / 转录组响应热图 / 实验报告导出 PDF）+ 自适应画质模式 + 环境稳定性修复

Work Log:
- [QA 巡检] dev.log 正常、lint/tsc 零错误、agent-browser 端到端验证全部通过：3D 渲染（32 分子标签）、模拟播放（T+8.0s 自动注射 EGF）、教学引导（教学卡/分子高亮/相机聚焦）、药理投药（曲美替尼→1 种作用中→洗脱按钮切换）、AI 助手（残基级回答）、0 console error —— 项目状态稳定，无需修 bug，转入新功能开发
- [新功能 A: 信号事件脉冲特效] src/components/cell3d/event-pulses.tsx（~200 行）: 事件流订阅（mrna-flow 同款模式，processed Set 去重防泄漏）→ 彗星池（14 条: 头球 sphere + 尾锥 cone 沿 -速度向）沿二次贝塞尔弧线从上游分子飞抵下游分子（时长 0.55-1.05s 按距离）→ 抵达回调写入 SimSnapshot.pulseAt（目标分子闪光）/edgePulse（双向边 key）→ 能量球壳冲击波池（10 个, 0.6s 扩散 0.35→2.65 + 淡出）; 事件色与边语义色一致（磷酸化琥珀/激活翡翠/结合 teal/抑制紫/表达琥珀）; molecules.tsx useFrame 增加抵达闪光（emissive +2.6 / halo +0.75, 650ms 平方衰减）; signal-edges.tsx useFrame 增加边爆发（900ms 内 opacity +0.55）; SimSnapshot 扩展 pulseAt/edgePulse 字段; 图例新增"信号事件脉冲"; VLM 确认彗星粒子沿信号路径飞行 ✓
- [新功能 B: 转录组响应热图] src/components/lab/transcriptomic-heatmap.tsx（~230 行）: 右栏第 5 个 tab"转录组"（amber 主题区分）; 行 = 核内靶基因（kind=gene; <3 个时纳入 TF）; 列 = activityHistory 降采样至 48 列; 热图色标（深墨→青绿→琥珀→玫红 模拟荧光强度）; ▲ 峰值时刻标记 + 悬停读数（基因×时间→活性%）+ 统计卡（靶基因数/显著响应数/采样终点）+ 峰值响应排行条 + 底部色标说明; 400ms 节流刷新避免逐 tick 10Hz 重渲染; QA 验证: MAPK 通路 7 核内靶基因 6 显著响应, FOS 峰 93%, 时间轴 0-78s ✓
- [新功能 C: 实验报告导出 PDF] src/components/lab/report-export.tsx（~490 行, 纯 Canvas 2D 方案）: 导出按钮（播放控制台, 状态反馈 spinner/成功/失败 + toast）; 报告内容 = 头部横幅（报告编号/时间戳）+ 实验设置（细胞系/通路/时长/速率/配体/药理 2 列键值）+ 核心级联摘要框 + 摘要统计卡（核心分子/分子事件/活跃分子/响应靶基因）+ 活性动力学曲线（canvas 绘制 Top 6 分子, 网格/坐标轴/彩色曲线/图例）+ 核心分子档案表（Top 12, 活性/磷酸化 mini 条形）+ 药理干预卡 + 遗传背景卡 + 分子事件流全表（时间/类型徽标/逐字折行描述, 自动分页续表）+ 每页页脚（页码/数据源声明）; 逐字折行 wrapText（CJK 安全, 2 行封顶省略号）; A4 794×1123 逻辑单位 ×2 超采样 → jsPDF A4 pt 输出; QA 验证: %PDF-1.3 有效结构、2 页、284KB、真实级联数据（22 分子事件/EGF-MAP2K1-MAPK1 曲线）、VLM 确认排版无重叠截断 ✓
- [新功能 D: 自适应画质模式] virtual-cell-3d.tsx: detectLowEndGpu()（deviceMemory≤4 / hardwareConcurrency≤4 / WEBGL_debug_renderer_info 匹配 SwiftShader/llvmpipe/software）→ 自动流畅模式（dpr [0.7,1] + 关 MSAA + 关 Canvas antialias, 保留 Bloom 视觉特征）; HUD 新增 Gauge 开关（流畅模式/高清模式手动切换）; 响应 worklog Task 12 遗留风险 #2（低端设备 GPU 负担）
- [架构决策: 放弃 html2canvas] 首版报告用 html2canvas-pro 光栅化离屏 DOM，在本环境持续报 "Unable to find element in cloned iframe"（主文档 Tailwind 4 CSS 干扰克隆, 隔离 iframe 方案也失败）→ 重写为纯 Canvas 2D 直接绘制（零 DOM 克隆依赖、确定性排版、逐字折行精确控制）→ 移除 html2canvas-pro 依赖（jspdf 保留）
- [环境稳定性] 本轮发现系统 dev server 被内核 OOM-kill（next-server 1.8GB + Chrome SwiftShader 3D 渲染内存增长触发全局 OOM, dmesg 确认 VizCompositorTh 触发）; 系统看门狗不会自动重启 dev server → 手动 setsid 重启 + 流畅模式（内存稳定 2.2GB）; QA 期间多次 server 静默死亡均为此因, 非代码 bug
- [QA 全量回归] lint 零错误 / tsc src 零错误 / 3D 渲染 + 播放（T+79.5s）+ 事件脉冲（VLM 确认彗星粒子）+ 转录组热图（7 基因 + 排行）+ PDF 导出（2 页真实数据 VLM 确认）+ 2D/3D 视图切换（67 SVG / canvas 恢复）+ 响应式类存在性（lg:grid-cols + order 类）+ 0 console error

Stage Summary:
- 项目当前状态: 3D 沉浸式虚拟细胞平台（13 KEGG 通路 + 7 细胞系 + 分子级模拟 + 药理扰动 + 三视图 + AI 助手 + 教学引导 + Bloom）+ 事件脉冲特效 + 转录组热图 + PDF 报告导出 + 自适应画质, 全部 QA 通过
- 本轮产出: 3 个新功能（事件脉冲/热图/报告导出）+ 自适应画质模式 + 依赖精简（移除 html2canvas-pro）; 修复环境级 OOM 问题（流畅模式自动降级）
- 关键技术决策: PDF 报告采用纯 Canvas 2D 绘制而非 DOM 克隆光栅化（html2canvas 在 Tailwind 4 环境不可靠）
- 未解决问题/风险（供下一阶段）:
  1. 沙盒内存天花板: QA 环境 4GB, 长时间多标签 3D 会话仍可能触发 OOM（流畅模式已大幅缓解; 生产环境真实 GPU 无此问题）
  2. 报告事件流 160 字截断（超长策划注释在报告中省略, 全文在应用事件流 tab 可见）
  3. 教学引导仅 MAPK 手工策划（worklog Task 12 遗留, PI3K-Akt/JAK-STAT/cAMP 有 CURATED_EVENTS 素材可优先补）
  4. KEGG 图谱视图 scaffold 边不显示（旧已知问题, 低优先级）
- 下一阶段建议优先事项:
  1. 通路对比模式（正常 vs 癌细胞同通路并排, worklog 遗留建议 #4）
  2. 更多通路教学级联手工策划（PI3K-Akt / JAK-STAT / cAMP）
  3. 报告导出增加转录组热图页（复用热图渲染逻辑到 canvas）
  4. 事件脉冲粒子在低端设备的数量自适应（当前固定池 14+10）

---
Task ID: 10
Agent: 主协调 Agent (Z.ai Code)
Task: 3D 虚拟细胞高精度重构（建模+贴图路线）+ GitHub 推送

Work Log:
- 用户反馈 v1 3D（基础球/胶囊/圆环拼装）太粗糙, 要求高精度真实建模, 建议建模+贴图路线 → 完全重构
- 新建 src/components/cell3d/textures.ts —— 程序化 PBR 贴图工厂（Canvas 运行时生成, 模块级缓存）:
  · organicNormalMap（FBM 高度场 → Sobel 法线, 可平铺 lattice value noise）
  · speckleNormalMap（高斯凸点, 核糖体/衣被蛋白）; stripeNormalMap（胶原 D-带 67nm 周期 / 微管 13 原纤维）
  · roughnessMap（光泽微变化）; glowSpriteTexture（径向柔光粒子）
- 新建 src/components/cell3d/procedural.ts —— 3D FBM 顶点位移（有机不规则形, 去除完美几何感）/ mergeGeoms 几何合并（减 draw call, 支持逐部件顶点色）/ fibSphere+球坐标采样
- 新建 src/components/cell3d/materials.ts —— 有机材质工厂:
  · patchOrganicFlow: onBeforeCompile 注入 GLSL（vObjPos varying + value-noise FBM + uTime 流动 emissive + Fresnel 边缘微光, 兼容 instancing）
  · organelleMaterial: MeshPhysicalMaterial（transmission 折射/iridescence 虹彩/sheen/clearcoat/法线+粗糙度贴图, dim 专注模式联动, 低端自动降级为普通透明）
  · glowMaterial: Additive 发光壳（fog:false）
- 完全重写 src/components/cell3d/organelles.tsx（buildCellBody v2, 接口不变+perf 参数）:
  · 质膜: 位移二十面体 + transmission 0.58 + 虹彩 + 脂双层双叶 860×2 脂头（对齐位移场 surf()）+ 64 跨膜蛋白 + 膜流动镶嵌缓慢对流旋转
  · 核被膜: 双层（间隙 0.22）+ 核孔复合体四部件（胞质环/核质环/中央栓/核篮, 共享实例矩阵, 表面位移对齐）
  · 染色质: 外周异染色质边集化（~180 颗粒成簇）+ 常染色质纤维（合并单几何）+ 核仁（纤维中心核 + 颗粒组分 56 speckles）
  · 线粒体: 位移外膜（透射）+ 基质 + 板层嵴 9 条/个（压扁波浪管, 合并）+ 嵴膜 ATP 合酶发光点
  · RER: 核旁连续囊池（扁平化管）+ 池间连接小管 + 膜旁核糖体双排 + 游离多聚核糖体 26 链 + 肝细胞 SER 管系
  · 高尔基: 顺→反 6 池顶点色渐变（teal→amber）+ 池间小管 + 出芽囊泡（衣被蛋白斑点法线）
  · 细胞骨架: 中心体双联中心粒 + 微管合并（原纤维条纹法线）+ 皮层肌动蛋白 72 根切向定向
  · 胞质: 430 分子拥挤颗粒（instanceColor 双色系）+ 胞外悬浮微粒双云（柔光 sprite, 浸没感）
  · 特化结构升级: 糖原玫瑰体/微绒毛（位移场对齐）/紧密连接/胶原 D-带条纹/膜出芽（透射）/髓鞘+树突棘
  · 动画: uTime 驱动流光 + 线粒体漂浮 + 脂双层对流 + 核仁呼吸 + 细胞整体微幅胀缩（呼吸）
- 升级 src/components/cell3d/virtual-cell-3d.tsx 渲染管线:
  · Environment + Lightformer 阵列（顶部冷青/侧逆暖琥珀/右侧玫瑰/底部深青, 程序化离线烘焙, 零外部 HDR）
  · fogExp2 指数雾（深度层次）; Bloom 调优 + 高清模式 Noise 胶片颗粒 + Vignette
  · SceneContents 透传 perfMode → CellBody（低端设备禁用折射/实例×0.45/细节-1）; 解剖标注默认开启
  · 修复 perf 变量名 bug（Canvas 内误用 perf → perfMode）
- QA（agent-browser, SwiftShader 软件渲染下自动流畅模式 + 手动切高清模式均验证）:
  · 新会话 0 错误; 3D 切换/播放（T+2.0s）/细胞系切换（心肌→癌细胞全量重建）/教学引导/核内视角/全景全部通过
  · VLM 评估: 高清全景"细胞器清晰可辨+膜通透优秀+无明显错误"; 核内视角 7.5/10; 癌细胞多形核+膜出芽+聚焦效果确认
  · bun run lint 零错误; dev.log 无运行时错误
- GitHub 推送: 用 token 创建 remote 并 push（见下）

Stage Summary:
- 3D 视觉从"几何拼装"升级为"高精度程序化建模 + 程序化贴图 + 物理材质 + 环境光照"管线, 零外部资源依赖（沙箱离线可用）
- 帧驱动架构不变（zustand 快照 + imperative useFrame）, 分子层/边层/事件层接口完全兼容
- 已知限制: agent-browser 为 SwiftShader 软渲染（自动流畅模式）, 真实 GPU 下 transmission/虹彩效果更佳; VLM 建议后续可加体积次表面散射（需体积渲染 pass, 成本高）
- 下阶段建议: ① 分子层升级 PBR 材质响应环境光 ② 线粒体嵴实时形变动画 ③ 切面模式（ClipPlane 展示内部） ④ 报告导出嵌入 3D 截图

---
Task ID: 14
Agent: 主协调 Agent (Z.ai Code)
Task: QA 巡检 + 3 个新功能（教学引导 3 通路扩充 / 通路对比模式 / 事件脉冲自适应）+ 突变同族映射修复

Work Log:
- [QA 巡检] 项目稳定: dev.log 正常、lint/tsc 零错误、3D 渲染/播放(T+7.5s)/转录组热图(7 基因)/事件流(200+注释)/PDF 导出(~/Downloads 3 份 284KB 有效 PDF) 全部通过 → 转入新功能开发
- [新功能 A: 教学引导 3 通路扩充] guided-tour.tsx CURATED_TOURS 新增:
  · PI3K-Akt (hsa04151): IGF1→IGF1R→PIK3CA→PIP3(cpd:C05981)→PDPK1→AKT1→TSC2→RHEB→MTOR→RPS6KB1→EIF4EBP1 共 11 站（"细胞的生长开关"叙事: 双磷酸化→代谢/翻译）
  · JAK-STAT (hsa04630): IL2→IL2RA→JAK1→STAT5A→MYC→BCL2L1→SOCS1 负反馈环 9 站（同分子复现站自动去重 → 7 站, titleAt Map 保留策划标题）
  · cAMP (hsa04024): EPI→ADRB2→GNAS→ADCY1→cAMP(cpd:C00575)→PRKACA→CREB1→FOS→RAPGEF3→RAP1A 共 10 站（PKA/EPAC 双分支叙事）
  · 全部复用既有 CURATED_EVENTS 残基级注释（IGF1R>PIK3CA/EPI>ADRB2/PRKACA>CREB1 等）
  · QA: PI3K 2/11 站运行中、JAK-STAT 1/7、cAMP 2/10 逐站验证 ✓
- [新功能 B: 通路对比模式] —— worklog 遗留建议 #1 落地:
  · src/store/compare-store.ts: 独立 zustand 双臂并行模拟引擎（A=对照 B=实验; 共享 PathwayGraph/配体注入/tick 循环; mutationsFor 逐臂注入突变; phaseReachedAt 记录阶段首达 tick）
  · src/components/lab/compare-view.tsx: 全屏覆盖层 = 双迷你细胞 SVG 臂视图（共享 layoutCellView 布局保证视觉对齐, 活性着色/M/KO/P 徽标/边流动）+ 分析栏（臂细胞系下拉/总结卡 4 张: 自主激活分子数+平均活性差+转录应答提前+事件总数/分子差异 Top14 双向条形图+激活时差标注+"⚠ 组成性活化"警告/实验臂事件流 tab）
  · src/components/lab/view-shared.ts: 从 virtual-cell.tsx 抽出 KIND_COLORS/edgeColor/edgeMarker/truncateLabel/midpointOf 共享
  · workspace.tsx 视图头新增"对照实验"入口（GitCompare 图标, 覆盖层模式不干扰主实验台状态）
  · 科学设计: 单变量实验（同通路/同配体剂量/同引擎参数, 唯一变量=遗传背景）
- [关键 bug 修复: 突变同族等价映射] 对照模式首测发现癌细胞臂无差异(0%) → 根因: MAPK 核心子图只有 HRAS 节点, 癌细胞 KRAS G12D 突变无节点可挂（主实验台同样受此影响）
  · 新建 src/lib/simulation/mutation-equiv.ts: MUTATION_EQUIV 同族表（KRAS↔HRAS/NRAS、BRAF↔RAF1、PIK3CA 族、PTEN→PI3CA、TP53 族、PIK3R1→PIK3CA）+ resolveMutations（精确 id → label → 同族回退, note 保留映射说明维持科学透明）
  · 生物学依据: 突变位点(G12/V600E)催化机制在同族成员间保守, 等位效应可在经典成员上忠实演示
  · lab-store.loadGraph 与 compare-store 均接入 resolveMutations
  · 修复后 QA: 癌细胞臂 HRAS +100%→MAP2K1/2 +97%→MAPK1 +95%→FOS +93%/MYC +90% 完整级联传导; 总结卡 自主激活 18 分子/+51% 平均差; VLM 9/10 确认双臂差异视觉清晰
- [新功能 C: 事件脉冲自适应] event-pulses.tsx: detectLowEnd()（与主视图同款启发式）→ 低端 6+4 粒子池（原 14+10）/几何降分段(球 8×6/锥 6)/孵化上限 2/帧; useMemo 内联修 lint
- [全量回归] lint 零错误 / tsc src 零错误 / 全新会话 0 console error / 对照模式开→运行 30s→差异数据→退出→主实验台无损 / 教学引导 4 通路逐站 / VLM 对照模式 9/10
- [GitHub 推送] commit + push 到 Jing0715-fer/virtual-cell-lab

Stage Summary:
- 项目状态: 3D 沉浸虚拟细胞平台全功能矩阵（13 通路/7 细胞系/3D+2D+KEGG 三视图/教学引导 4 通路手工策划/药理扰动/转录组热图/PDF 报告/AI 助手/对照实验模式）
- 本轮产出: 教学引导 +3 通路(共 4)、通路对比模式(双臂并行引擎+分析面板)、突变同族等价映射(核心科学修复)、事件脉冲自适应
- 关键决策: 对照模式用独立 store 而非复用 lab-store（避免污染主实验态）; 突变映射放 lib 层供双 store 共用
- 未解决问题/风险:
  1. 对照模式 transcriptionLead（阶段④首达时差）显示"—"（两臂都未到阶段 4 时为 null, 属正常但长模拟后应出值——已验证 T+33s 未达, 因癌臂独立到达而对照臂未注入足够时间）
  2. 对比模式迷你视图无缩放平移（设计取舍: 覆盖层保持轻量）
  3. KEGG 图谱视图 scaffold 边不显示（旧已知, 低优先级）
- 下一阶段建议:
  1. 对照模式增加 3D 视图选项（双 R3F Canvas 并排）
  2. 报告导出 PDF 增加对照实验页（复用 compareSummary + 差异表）
  3. TGF-β/Wnt/Notch 教学级联策划（CURATED_EVENTS 已有素材）
  4. 转录组热图导出 CSV

---
Task ID: 15
Agent: 主协调 Agent (Z.ai Code)
Task: QA 巡检 + 1 项数据修复 + 4 个新功能（教学级联 3 通路扩充 / 转录组 CSV 导出 / 对照实验报告 PDF / 3D 切面模式）+ PDF 下载机制修复

Work Log:
- [QA 巡检] dev.log 正常（早期一条 mutation-equiv 瞬态模块错误为 HMR 期间噪音, 后续编译全通过）; lint/tsc src 零错误; 端到端验证: 3D 渲染（VLM 全页 9.5/10、画布特写 8.5/10 无渲染错误）、模拟播放（T+29s 阶段 4/4）、教学引导、药理投药（曲美替尼→治疗浓度/洗脱）、转录组热图、PDF 导出、对照模式（自主激活 7 分子/平均差 19.3%/退出无损）→ 项目稳定, 转入新功能
- [QA 发现瑕疵] 转录组热图重复行: KEGG 重复 entry（ELK1×2、FOS×2 —— ERK 分支与 JNK 分支的同名基因独立 entry）在热图中显示为重复行 → transcriptomic-heatmap.tsx: 按 label 分组（Map< label, CoreNode[] >）合并重复 entry, 平行分支活性取 max（代表该基因总体转录响应）; 修复后 MAPK 5 行唯一基因（原 7 行）
- [新功能 A: 教学引导 3 通路扩充（4→7 通路, worklog Task 14 建议 #3）] guided-tour.ts CURATED_TOURS 新增:
  · TGF-β (hsa04350): TGFB1→TGFBR2→TGFBR1→SMAD2→SMAD4→ID1→SMAD6→SMURF2 8 站（"上皮的刹车信号"叙事: 双受体接力磷酸化→R-Smad/Co-Smad 入核→I-Smad 自诱导负反馈→受体泛素化降解）
  · Wnt (hsa04310): WNT3A→FZD1→LRP5→DVL1→AXIN1→GSK3B→CTNNB1→TCF7L2→CCND1→DKK1 10 站（"胚胎发育的核心开关"叙事: signalosome 聚集→破坏复合体解体→β-cat 免于降解入核→增殖程序→DKK1 拮抗闭环）
  · Notch (hsa04330): DLL1→NOTCH1→ADAM17→PSEN1→NCSTN→RBPJ→MAML1→HES1→HEY1→LFNG 10 站（"不需要第二信使的捷径"叙事: 配体牵拉→S2/S3 顺序切割→NICD 入核 CSL 开关→HES/HEY 双臂抑制→Fringe 糖基化微调）
  · 分子注释扩充: molecular-notes.ts 新增 ~40 条 NODE_NOTES（FZD1/LRP5/SMAD6/ID1/LFNG/NUMB/DKK1/CSNK1A1/BMP 分支/Ski 辅抑制子/Notch 抑制复合体全家等）+ ~20 条 CURATED_EVENTS（WNT3A>FZD1/LRP5、NOTCH1>ADAM17 三步切割链、SMAD6>SMURF2、CCND1>DKK1 自调节负反馈等, 全部残基/结构域级）
  · pathway-library.tsx: 新增"教学"徽标（teal 色, 7 条策划通路标识, tooltip 提示 3D 视图→教学引导入口）
  · QA: Wnt 逐站（站 5"破坏复合体·解体"+级联注释"LRP5 胞内磷酸化 PPPSPxS 簇…"）、TGF-β 8/8 站（潜伏态唤醒→SMURF2）、Notch 10/10 站（LFNG 末站）全部验证 ✓
- [新功能 B: 转录组热图 CSV 导出（worklog Task 14 建议 #4）] transcriptomic-heatmap.tsx: 头部 CSV 按钮 → 基因×时间活性矩阵（peak_activity/peak_time_s/final_activity + 48 时间列, UTF-8 BOM 可直接 Excel 打开, 注释头含通路/细胞系/采样说明）; QA: 1519B CSV 下载, 内容结构完整 ✓
- [新功能 C: 对照实验报告 PDF（worklog Task 14 建议 #2）] report-export.tsx 新增 CompareReportExportButton（~240 行, 复用主报告画布绘制体系）:
  · 第 1 页: 玫瑰色横幅（VC-CMP 编号）→ 对照设置 8 键值（通路/臂 A/B 细胞系/同步刺激/时长/双臂遗传背景）→ 摘要卡 4 张（自主激活/平均活性差/阶段④首达时差/事件总数）→ 双臂动力学对比图（drawCompareChart: A 臂虚线 teal + B 臂实线 rose, Δ Top 4 分子并列, 图例带 Δ%）→ 分子差异表 Top 14（A/B 双色条形 + Δ 徽标 + 智能解读列: 组成性活化/激活提前/两臂一致）→ 方法学说明（单变量设计 + 同族等价映射声明）
  · 第 2 页: 实验臂（B）分子事件流（最近 32 条）
  · compare-view.tsx 头部集成导出按钮（tick<2 禁用 + 状态反馈）; QA: 3 页 714KB, VLM 确认横幅/设置/摘要卡/双曲线/差异表全部无重叠截断 ✓
- [新功能 D: 3D 切面模式（worklog Task 10 建议 #3）] virtual-cell-3d.tsx:
  · SectionClipController: THREE.Plane((0,-0.22,-1), 0.55) 全局裁剪平面（renderer.clippingPlanes）剖开细胞前半部; 开启时 scene.traverse 将所有材质临时 DoubleSide（记忆原 side 以便还原）→ 剖面内壁可见, 内部细胞器/核内分子直接暴露
  · 切面方位环视觉（双 ring 玉青色, 按平面法向四元数定向, 指示切割位置）
  · HUD 新增"切面视图"开关（Layers 图标）+ 底部提示条动态切换（"切面模式·细胞前半部已剖开——旋转视角观察内部"）
  · QA: VLM 确认细胞剖开可见细胞核剖面/线粒体/高尔基体, 方位环存在, 渲染无破碎 ✓
- [关键修复: PDF 下载机制] 本轮 QA 发现 PDF 导出下载静默失败（无报错无产物）→ 系统性隔离测试定位根因:
  · jsPDF 4.x saveAs 使用"分离节点 anchor + setTimeout(0) click", 本环境 headless Chrome 对该模式不可靠（挂载+同步 click 可下载, 分离/异步均失败）
  · 修复: 新增 downloadPdfBlob()（doc.output('blob') → 挂载 body 的 anchor 同步 click → 4s 后 revokeURL）, 主报告与对照报告双链路统一接入 → 修复后两类 PDF 均正常下载
  · 次发现: QA 快速重复点击导出会触发 Chrome"多文件自动下载"保护（headless 无法授权）, 表现为后续所有下载静默失败——纯 QA 环境假象, 真实用户单次点击导出不受影响; 换新会话后单次导出验证通过
- [React 19 lint 适配] SectionClipController 的 renderer.clippingPlanes 命令式赋值触发 react-hooks/immutability → 文件顶部局部 eslint-disable（与 molecules/mrna-flow/event-pulses 同范式, 注明 R3F 命令式 API 为标准用法）
- [全量回归] lint 零错误 / tsc src 零错误 / 新会话 0 console error / MAPK 级联 T+30.5s 阶段 4/4 / 4+3 通路教学逐站 / CSV+双 PDF 下载 / 切面模式 / VLM 三轮视觉验证 / dev.log 无异常

Stage Summary:
- 项目当前状态: 3D 沉浸虚拟细胞平台全功能矩阵（13 通路/7 细胞系/三视图/教学引导 7 通路手工策划/药理/热图+CSV/双报告 PDF/AI 助手/对照实验+报告）, 全部 QA 通过, 稳定可交付
- 本轮产出: 1 数据修复（热图重复行合并）+ 4 新功能（教学级联×3、CSV 导出、对照报告 PDF、3D 切面）+ 1 关键下载机制修复（downloadPdfBlob 替代 jsPDF saveAs）
- 关键技术决策: ① PDF 下载统一走"挂载式同步 anchor click"（环境兼容性远优于 jsPDF 默认 saveAs）② 切面用全局裁剪平面而非逐材质 clippingPlanes（零材质侵入, 配合临时 DoubleSide 还原机制）③ 热图按 label 合并 KEGG 重复 entry（活性取 max, 语义=该基因总体转录响应）
- 未解决问题/风险:
  1. 对照模式 transcriptionLead 在两臂未达阶段④时显示"—"（长模拟后可出值, 语义正常）
  2. QA 环境快速重复下载触发 Chrome 自动下载保护（测试时避免连续多次导出; 生产用户无此问题）
  3. KEGG 图谱视图 scaffold 边不显示（旧已知, 低优先级）
  4. 沙盒 4GB 内存天花板（长时间多 3D 会话可能 OOM, 流畅模式已缓解）
- 下一阶段建议:
  1. 对照模式 3D 视图（双 R3F Canvas 并排, worklog Task 14 建议 #1 遗留）
  2. 报告导出嵌入 3D 截图（gl.domElement.toDataURL 插入报告第 1 页）
  3. 剩余 6 通路教学级联策划（mTOR/NF-κB/Apoptosis/p53/AMPK/Ca²⁺, 自动推导已可用, 手工策划提升叙事质量）
  4. 转录组热图报告页嵌入（复用热图渲染逻辑到 canvas, worklog Task 13 建议 #3 遗留）
  5. 切面模式进阶: 剖面深度滑杆（拖动平面 constant）+ 剖面方向跟随相机
