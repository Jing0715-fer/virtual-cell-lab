# Task 2-a · KEGG 后端服务 — 工作记录

> 交付代理：full-stack-developer 子代理（后端）
> 状态：✅ 完成（lint 通过 / tsc 我方文件零错误 / 13 条通路 API 全部验证通过）

## 交付物清单

| 文件 | 职责 |
|---|---|
| `src/lib/kegg/kgml-parser.ts` | KGML XML → 结构化 JSON（entry/relation/component，纯正则零依赖，化合物中文名映射表） |
| `src/lib/kegg/classify.ts` | 分子区室/类别/层级分类（两轮 label 优先正则链）+ `applyExpressionTargets`（GErel 靶基因修正） |
| `src/lib/kegg/subgraph.ts` | 核心演示子图提取（种子→邻接 BFS→合成配体→边映射→tier 修正→清理，28~42 节点） |
| `src/lib/kegg/kegg-client.ts` | REST 抓取 + 内存/Prisma 二级缓存 + hsa-id 符号映射 + 合并 entry 增强（`getPathwayGraph` 主入口） |
| `src/lib/kegg/index.ts` | 统一导出 |
| `src/app/api/pathways/route.ts` | GET 通路目录（+DB stats 附加） |
| `src/app/api/pathways/[id]/route.ts` | GET 通路图详情（404/503 语义，`maxDuration = 30`） |
| `scripts/seed-kegg.ts` | 缓存预热脚本（`bun run scripts/seed-kegg.ts`） |

未触碰任何越界文件（page.tsx / components / data / types / simulation / store 等）。

## API 契约（前端可直接对接）

- `GET /api/pathways` → `{ pathways: PathwayCatalogEntry & { stats: { geneCount, relationCount, coreCount } | null }[] }` —— 13 条目录全量返回；stats 仅对已缓存通路非空（不阻塞在线抓取）
- `GET /api/pathways/{hsa04010}` → `PathwayGraph`（`meta / nodes[KeggEntry] / relations / core{nodes[CoreNode], edges[CoreEdge]} / stats / fetchedAt / source`）
  - `source: 'kegg-live'`（首次在线解析）| `'db-cache'`（命中 Prisma 缓存）
  - 未知 id → 404 `{ error }`；KEGG 不可达且无缓存 → 503 `{ error }`

## 核心实现决策（供后续代理参考）

1. **KEGG 合并 entry 增强**（最重要的工程决策）
   KGML 常把家族基因合并为一个节点且 label 只显示一个成员（MAPK 通路 25 个 RTK 合并节点 label=CSF1R；RAS 家族节点 label=RRAS2）。解决方案：`rest.kegg.jp/list/hsa` 全表（hsa:id→官方符号）lazy 映射，把成员基因补进 `aliases`，并把命中的种子符号提升为主 label（CSF1R→**EGFR**、RRAS2→**HRAS**、RBPJL→**RBPJ**、MAML3→**MAML1**）。`nodes` 与 `core.nodes` 共享增强结果。
2. **分类的别名撞名防御**
   KGML 别名常与功能类别撞名：SOS1 alias "HGF"（配体）、AXIN1 alias "PPP1R49"（磷酸酶调节亚基旧名）、CASP9 alias "PPP1R56"、STK4 alias "MST1"。对策：配体/全部类别均**主 label 优先**（label 能定类不看 aliases）+ 磷酸酶 PPP 正则收紧为催化亚基命名 `PPP[1-7][CG]\w*`。
3. **合成配体两层机制**
   - catalog `syntheticLigands`（人工策划）：receptor 不在图中时连受体一并合成（cAMP 通路 KEGG 图无 ADRB2 → EPI + ADRB2 均 synthetic，binding 边连接）
   - 种子配体补全：seeds 中配体类符号图中缺失且 `LIGAND_RECEPTORS` 亲和表有明确受体时合成（如 MAPK 的 **EGF**→EGFR）
4. **内存缓存版本失效**：`CACHE_VERSION` 常量挂 globalThis，算法迭代后 bump 即自动清空（解决 dev 热重载后 globalThis 陈旧数据问题，生产无影响）。

## 验证结果（2025-01 实测）

- `bun run lint` ✅ 零告警；`bunx tsc --noEmit` 我方 8 个文件零错误
- `curl /api/pathways` → 13 条目录，13 条均带 stats
- `curl /api/pathways/hsa04010`：136 nodes / 170 relations / core 32 节点 39 边；级联 `EGF→EGFR→GRB2→SOS1→HRAS→RAF1→MAP2K1/2→MAPK1→ELK1→FOS`；EGFR 在 membrane、MAPK1 cytoplasm、FOS nucleus、EGF extracellular ✅
- `hsa04330` Notch：DLL1/JAG1→NOTCH1→ADAM17/PSEN1→RBPJ+MAML1→HES1/HEY1(tier6 gene) ✅
- `hsa04024` cAMP：**EPI [synthetic ligand] --binding--> ADRB2 [receptor]** ✅；EPI→ADRB2→GNAS→ADCY1→cAMP→PRKACA→CREB1 完整级联
- 二级缓存：首次 `source: 'kegg-live'`（~6s 含符号表拉取）；清内存后再次请求 `source: 'db-cache'`（<10ms）✅
- 13 条通路核心子图：**428 节点 / 604 边 / 平均 32.9**（min 29 `hsa04152` / max 40 `hsa04630`，均在 28~42 区间）
- 合成节点共 3 个：EPI→ADRB2（cAMP）、ACh→PLCB2（Ca）、IL2→IL2RB（JAK-STAT）

## 已知事项

- `src/data/cell-types.ts` 存在 tsc 错误（`CellType` 缺 `features` 字段）—— Task 1 契约侧问题，不在本任务修复边界，需数据/类型侧对齐。
- JAK-STAT 核心子图 151 边（KEGG 细胞因子网络天然稠密，40 节点在契约上限内），前端渲染时建议做边聚合或透明度分层。
- 重复 label 的 KGML entry（同一基因画两块矩形）用 `e{entryId}` 兜底 id（如 MAPK 的两个 FOS entry → `FOS` + `e137`），前端不应假设 id 一定是基因符号。
- `hsa:id` 符号表首次拉取 ~2.6MB（约 4-6s），已进程级缓存；`scripts/seed-kegg.ts` 可在生产前预热。
