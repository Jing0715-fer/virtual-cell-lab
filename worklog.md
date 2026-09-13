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
