# Task 19-a · KEGG 全量 372 条通路接入 — 工作记录

> 交付代理：full-stack-developer 子代理
> 状态：✅ 完成（lint 零错误 / tsc src 零错误 / 372 目录 + 非策划通路按需抓取实测通过）

## 修改文件清单

| 文件 | 修改内容 |
|---|---|
| `src/lib/kegg/kegg-client.ts` | 新增导出 `getCatalogEntry`（策划 13 条原样 / 全量合成空种子条目 / 未知 null）；`getPathwayGraph` 改用其验证；`CACHE_VERSION` v6→v7；`getCachedStats` 加 globalThis `{version,map}` 缓存（fetchLiveGraph upsert 成功后 version++ 失效） |
| `src/lib/kegg/index.ts` | 导出 `getCatalogEntry` |
| `src/app/api/pathways/route.ts` | 返回 KEGG_FULL_LIST 全量 372 条（id/name/nameZh/categoryZh/categoryEn/curated/stats） |
| `src/app/api/pathways/[id]/route.ts` | 404 校验改用 getCatalogEntry，文案"不在 KEGG 全量目录 372 条人类通路中" |
| `src/components/lab/pathway-library.tsx` | 重构：搜索框（name/nameZh/id 不敏感过滤）+ 策划级 13 条（原样式）+ KEGG 全量目录分组折叠（顶级分类 6 组、子类小标题、紧凑单行、默认折叠/搜索展开） |
| `src/components/lab/pathway-map-view.tsx` | 全量 372 linked map 可点击跳转；非核心 gene/compound 节点 mapPick 信息卡（KEGG entry 链接/别名/类型/提示）；点空白（位移<4px）清除；文字清晰度（halo/字号/颜色/边框） |

`subgraph.ts` **未修改**（空种子路径验证通过，见下）。禁改文件（cell3d/**、virtual-cell.tsx、simulation/layout.ts、pathway-catalog.ts）零触碰。

## 空种子核心子图验证（bun 临时脚本，已删除）

| 通路 | KGML | core.nodes | core.edges | 分布 |
|---|---|---|---|---|
| hsa00010 糖酵解 | 101 entries / 84 rel | 21 | 42 | 全 enzyme/cytoplasm/tier3（代谢特征），0 度非配体节点 0 |
| hsa04916 黑色素生成 | 50 / 31 | 30 | 27 | ligand2/receptor5/kinase5/tf5/gene3/gtpase4/adapter1/enzyme5；tier 0-6 完整 |
| hsa05010 阿尔茨海默病 | 171 / 109 | 30 | 26 | compound2(Ca²⁺)/channel4/receptor4/kinase5/tf2/gene4/ligand1… |

机制：seeds=[] 时走"不足 MIN_SEEDS=15 按 relation 度数补齐 → 邻接 BFS 扩展到 ~34"既有路径，自动选 hub。`enrichEntries` 的 `seeds.find` 对空数组安全；`syntheticLigands ?? []` 与种子配体补全 for-of 空数组自然跳过。

## 后端要点（供后续代理参考）

1. **getCatalogEntry 是唯一目录验证源**：curated 优先（保留 seeds/syntheticLigands/文案），其余 372 合成条目 description="KEGG 分类：{categoryEn}。全量目录通路：按 KGML 拓扑度数自动提取核心演示子图（无人工策划种子与教学文案，可正常模拟信号传播）"、cascade="KEGG 全图 · 自动提取核心子图"、seeds=[]。前端所有 meta 展示（inspector/报告/AI 助手）自动兼容。
2. **stats 缓存**：version 失效制（upsert 计数），DB 失败不缓存失败结果；CACHE_VERSION v7 bump 同时清 statsCache。
3. 首次抓取单条 1-4s（符号表 2.6MB 已进程级缓存），DB/内存二级缓存复用既有机制；`scripts/seed-kegg.ts` 可扩展批量预热。

## 实测

- `GET /api/pathways` → 372 条（13 curated，13 带 stats，响应 ~50KB）
- `GET /api/pathways/hsa00010` → 200 `kegg-live`（3.6s）core 21 节点；复请求 50ms；`hsa05010` → 200（816ms）core 30 节点
- `GET /api/pathways/hsa99999` → 404 新文案
- stats 版本失效实测：upsert 后 /api/pathways 重解析一次并缓存，其后 10-17ms
- `bun run lint` 零错误；`bunx tsc --noEmit` src/ 零错误（examples/skills 预存错误不在边界）；dev.log 无报错

## 遗留风险

- 非策划通路无教学引导/策划药物（药理面板空态）——语义正常
- 代谢类子图全 enzyme/tier3（无核内事件、模拟阶段上限低，KEGG 数据结构限制）
- 全量组展开大分类（人类疾病 96/代谢 95）时 DOM 行较多（默认折叠缓解）
- mapPick 信息卡 keggIds/别名超 6 个截断（+N 指示）
- UI 未经浏览器 QA（本环境无浏览器），主代理需 QA：搜索过滤、分组折叠/展开、全量条目选中加载、图谱点击 mapPick 卡与空白清除、文字清晰度视觉效果
