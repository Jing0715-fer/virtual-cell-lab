import type { PathwayCatalogEntry } from '@/types/kegg';

/**
 * KEGG 信号转导通路目录（人工策划）
 * 数据源: KEGG REST API (https://rest.kegg.jp) — Kanehisa Laboratory
 * seeds 用于从 KGML 全图提取"核心演示子图"，匹配 CoreNode.label / aliases
 */
export const PATHWAY_CATALOG: PathwayCatalogEntry[] = [
  {
    id: 'hsa04010',
    name: 'MAPK signaling pathway',
    nameZh: 'MAPK 信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      '丝裂原活化蛋白激酶（MAPK）级联是真核生物中高度保守的三级激酶信号模块（MAPKKK → MAPKK → MAPK），将生长因子、细胞因子与应激刺激转化为基因表达程序的改变。ERK1/2 分支介导增殖与分化，JNK/SAPK 与 p38 分支应答应激与炎症信号。',
    cascade: 'EGF → EGFR → GRB2/SOS → RAS-GTP → RAF → MEK1/2 → ERK1/2 → ELK1/c-FOS',
    seeds: [
      'EGF', 'TGFB1', 'FGF2', 'EGFR', 'ERBB2', 'GRB2', 'SOS1', 'SOS2', 'SHC1',
      'HRAS', 'KRAS', 'NRAS', 'RAF1', 'BRAF', 'ARAF', 'MAP2K1', 'MAP2K2',
      'MAPK1', 'MAPK3', 'MAPK8', 'MAPK9', 'MAPK10', 'MAPK14', 'MAPK11', 'MAPK12',
      'MAP3K5', 'MAP3K1', 'MAP3K2', 'MAPKAPK2', 'MAPKAPK3', 'RPS6KA1', 'RPS6KA3',
      'MKNK1', 'DUSP1', 'DUSP5', 'ELK1', 'FOS', 'JUN', 'JUNB', 'JUND', 'ATF2',
      'MYC', 'SP1', 'CREB1', 'NFKB1', 'PPP1CA',
    ],
  },
  {
    id: 'hsa04151',
    name: 'PI3K-Akt signaling pathway',
    nameZh: 'PI3K-Akt 信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      '磷脂酰肌醇 3-激酶（PI3K）被 RTK/GPCR 激活后在膜上生成第二信使 PIP3，招募 PDK1 与 Akt；Akt 磷酸化 FOXO、GSK-3β、TSC2 等底物，调控细胞存活、代谢、生长与增殖。PTEN 使 PIP3 去磷酸化实现负调控，是重要的抑癌基因。',
    cascade: 'IGF-1 → IGF1R → PI3K → PIP3 → PDK1/Akt → mTORC1 / GSK3β / FOXO',
    seeds: [
      'IGF1', 'IGF2', 'EGF', 'INS', 'IGF1R', 'INSR', 'EGFR', 'ERBB3',
      'PIK3CA', 'PIK3CB', 'PIK3CD', 'PIK3R1', 'PIK3R2', 'PDPK1',
      'AKT1', 'AKT2', 'AKT3', 'MTOR', 'GSK3B', 'FOXO1', 'FOXO3', 'FOXO4',
      'BAD', 'BCL2L1', 'BCL2', 'PTEN', 'TSC1', 'TSC2', 'RPTOR', 'RICTOR',
      'MDM2', 'CDKN1A', 'CDKN1B', 'RPS6KB1', 'EIF4EBP1', 'NOS3', 'GYS1',
    ],
  },
  {
    id: 'hsa04310',
    name: 'Wnt signaling pathway',
    nameZh: 'Wnt 信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      'Wnt 家族分泌型糖蛋白结合 Frizzled 七次跨膜受体与 LRP5/6 共受体。经典 Wnt/β-catenin 通路中，受体激活经 Dishevelled 解散 β-catenin 破坏复合体（Axin/APC/GSK3β/CK1），使 β-catenin 免于泛素化降解、入核与 TCF/LEF 协同驱动 MYC、CCND1 等靶基因，决定细胞命运与干细胞干性维持。',
    cascade: 'WNT3A → FZD/LRP6 → DVL ⊣ 破坏复合体 → β-catenin 入核 → TCF/LEF → MYC/CCND1',
    seeds: [
      'WNT3A', 'WNT1', 'WNT5A', 'FZD1', 'FZD2', 'FZD4', 'FZD7', 'LRP5', 'LRP6',
      'DVL1', 'DVL2', 'DVL3', 'GSK3B', 'CSNK1A1', 'CSNK2A1', 'CTNNB1', 'APC',
      'AXIN1', 'AXIN2', 'TCF7L2', 'LEF1', 'TCF7', 'MYC', 'CCND1', 'BIRC5',
      'WIF1', 'SFRP1', 'SFRP2', 'DKK1', 'LRP6', 'RAC1', 'JUN', 'NFATC1',
    ],
  },
  {
    id: 'hsa04330',
    name: 'Notch signaling pathway',
    nameZh: 'Notch 信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      'Notch 受体与相邻细胞表面的 Delta/Jagged 配体结合（旁分泌接触依赖），触发两次顺序蛋白酶切：ADAM 金属蛋白酶切除胞外域，γ-分泌酶复合体（Presenilin/Nicastrin）释放 Notch 胞内结构域（NICD）。NICD 转位入核，将转录抑制因子 RBP-Jκ 转化为激活子，与 MAML 组装复合体驱动 HES/HEY 等靶基因，介导侧抑制与细胞命运决定。',
    cascade: 'DLL/JAG → NOTCH → ADAM/γ-secretase 切割 → NICD 入核 → RBPJ/MAML → HES1',
    seeds: [
      'DLL1', 'DLL3', 'DLL4', 'JAG1', 'JAG2', 'NOTCH1', 'NOTCH2', 'NOTCH3',
      'NOTCH4', 'ADAM10', 'ADAM17', 'PSEN1', 'PSEN2', 'NCSTN', 'APH1A', 'PSENEN',
      'RBPJ', 'MAML1', 'MAML2', 'HES1', 'HES5', 'HEY1', 'HEY2', 'MYC', 'DTX1',
      'KAT2B', 'NUMB', 'FBXW7',
    ],
  },
  {
    id: 'hsa04350',
    name: 'TGF-beta signaling pathway',
    nameZh: 'TGF-β 信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      'TGF-β 超家族（TGF-β/Activin/Nodal/BMP）配体结合 II 型丝/苏氨酸激酶受体，招募并磷酸化 I 型受体；活化受体磷酸化 R-Smad（Smad2/3 或 Smad1/5/8），与 Co-Smad（Smad4）组装复合体入核，协同 FAST1/Ski 等辅因子调节转录。抑制性 Smad6/7 与 E3 泛素连接酶 Smurf2 构成负反馈。TGF-β 在上皮细胞中尚可经非 Smad 通路（RhoA/ MAPK/PI3K）诱导 EMT。',
    cascade: 'TGF-β1 → TGFBR2 → TGFBR1 → pSMAD2/3-SMAD4 复合体 → PAI-1/p21/EMT 基因',
    seeds: [
      'TGFB1', 'TGFB2', 'TGFB3', 'INHBA', 'BMP4', 'BMP2', 'TGFBR1', 'TGFBR2',
      'ACVR1', 'ACVR2A', 'BMPR1A', 'SMAD1', 'SMAD2', 'SMAD3', 'SMAD4', 'SMAD5',
      'SMAD6', 'SMAD7', 'SMURF2', 'SKI', 'SKIL', 'SERPINE1', 'CDKN1A', 'CDKN2A',
      'MYC', 'ID1', 'ID2', 'SP1', 'RBL1', 'EP300', 'SNAI1',
    ],
  },
  {
    id: 'hsa04630',
    name: 'JAK-STAT signaling pathway',
    nameZh: 'JAK-STAT 信号通路',
    category: '免疫系统 · 细胞因子信号',
    description:
      'I/II 型细胞因子受体自身缺乏激酶活性，与 JAK 家族酪氨酸激酶（JAK1/2/3、Tyk2）组成性关联。配体诱导受体二聚化后 JAK 交叉磷酸化受体胞内尾部 Tyr 残基，形成 STAT 募集位点；STAT 被磷酸化后经 SH2-pTyr 互换二聚化、转位入核结合 GAS 元件驱动转录。SOCS 蛋白家族与 STAT 诱导表达，构成经典负反馈环路。',
    cascade: 'IL-2 → IL2Rβ/γc → JAK1/JAK3 → pSTAT5 二聚体 → 增殖基因；SOCS 负反馈',
    seeds: [
      'IL2', 'IL3', 'IL6', 'IFNG', 'IFNA1', 'EPO', 'GH1', 'IL2RA', 'IL2RB',
      'IL2RG', 'IL6R', 'IFNGR1', 'IFNGR2', 'IFNAR1', 'IFNAR2', 'EPOR', 'GHR',
      'JAK1', 'JAK2', 'JAK3', 'TYK2', 'STAT1', 'STAT2', 'STAT3', 'STAT4',
      'STAT5A', 'STAT5B', 'STAT6', 'SOCS1', 'SOCS3', 'SOCS2', 'CISH', 'PTPN1',
      'PTPN2', 'PIAS1', 'IRF1', 'MYC', 'BCL2L1', 'CDKN1A',
    ],
    syntheticLigands: [
      { symbol: 'IL2', fullName: '白细胞介素-2 (Interleukin-2)', receptor: 'IL2RB' },
    ],
  },
  {
    id: 'hsa04024',
    name: 'cAMP signaling pathway',
    nameZh: 'cAMP 信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      'G 蛋白偶联受体（GPCR）被激动剂激活后，异源三聚体 G 蛋白 α 亚基置换 GDP→GTP 解离；Gs α 直接刺激腺苷酸环化酶（AC）催化 ATP 生成第二信使 cAMP。cAMP 结合 PKA 调节亚基释放催化亚基，磷酸化 CREB（Ser133）、L 型钙通道等底物；cAMP 亦可经 EPAC/Rap1 通路或 CNG 离子通道发挥作用。PDE 家族水解 cAMP 终止信号（咖啡因/茶碱为 PDE 抑制剂）。',
    cascade: '肾上腺素 → β2-AR → Gs → AC → cAMP → PKA → pCREB → CRE 元件转录',
    seeds: [
      'ADRB1', 'ADRB2', 'ADRA1B', 'DRD1', 'HTR2A', 'GNAS', 'GNAI1', 'GNAI2',
      'ADCY1', 'ADCY3', 'ADCY5', 'ADCY6', 'ADCY8', 'PRKACA', 'PRKACB', 'PRKAR1A',
      'PRKAR2A', 'CREB1', 'ATF1', 'CREM', 'ATF2', 'RAPGEF3', 'RAPGEF4', 'RAP1A',
      'PDE4A', 'PDE4B', 'PDE4D', 'PDE3A', 'MAPK1', 'MAPK3', 'GRIA1', 'GRIA2',
      'NTRK2', 'PPP1CA', 'AKAP5',
    ],
    syntheticLigands: [
      { symbol: 'EPI', fullName: '肾上腺素 (Epinephrine)', receptor: 'ADRB2' },
    ],
  },
  {
    id: 'hsa04020',
    name: 'Calcium signaling pathway',
    nameZh: '钙信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      'Ca²⁺ 是通用第二信使，胞质游离钙浓度从 ~100 nM 升至 μM 级即触发效应。信号源包括电压门控钙通道（Cav）、IP3 受体（GPCR → PLCβ → IP3）、Ryanodine 受体（CICR）以及 Store-Operated 钙内流（STIM1/ORAI1）。钙信号经钙调蛋白（CaM）解码：CaMKII 介导突触可塑性，Calcineurin 去磷酸化 NFAT 入核；SERCA（ATP2A2）与 PMCA 泵负责钙清除。钙峰的振幅-频率编码（spike frequency coding）实现信号多样性。',
    cascade: 'GPCR → PLCβ → IP3 → IP3R (ER 钙释放) → CaM → CaMKII / Calcineurin → NFAT',
    seeds: [
      'ITPR1', 'ITPR2', 'ITPR3', 'RYR2', 'RYR1', 'CALM1', 'CALM2', 'CALM3',
      'CAMK2A', 'CAMK2B', 'CAMK2D', 'CAMKK2', 'PPP3CA', 'PPP3CB', 'NFATC1',
      'NFATC2', 'NFATC3', 'PLCB1', 'PLCB2', 'PLCB3', 'PLCG1', 'CACNA1C',
      'CACNA1S', 'CACNA2D1', 'ATP2A2', 'ATP2B1', 'ORAI1', 'STIM1', 'GNAQ',
      'GNA11', 'MYLK', 'NOS1', 'NOS3', 'ADCY1', 'PRKACA', 'MAPK1',
    ],
    syntheticLigands: [
      { symbol: 'ACh', fullName: '乙酰胆碱 (Acetylcholine)', receptor: 'PLCB2' },
    ],
  },
  {
    id: 'hsa04150',
    name: 'mTOR signaling pathway',
    nameZh: 'mTOR 信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      'mTOR 是 atypical 丝/苏氨酸激酶，组装两型复合体：mTORC1（含 Raptor）被 Rheb-GTP 激活，经 S6K1 与 4E-BP1 磷酸化促进核糖体生物合成与蛋白翻译，并经 ULK1 抑制自噬；mTORC2（含 Rictor）磷酸化 Akt Ser473 构成反馈。TSC1/TSC2 复合物作为 GAP 催化 Rheb 失活，是生长因子信号的负调控枢纽；AMPK 在 ATP 匮乏时磷酸化 TSC2 与 Raptor 抑制 mTORC1（二甲双胍作用机制）。',
    cascade: 'IGF-1/氨基酸 → TSC2 ⊣ RHEB → mTORC1 → S6K/4E-BP1 → 蛋白合成/自噬抑制',
    seeds: [
      'MTOR', 'RPTOR', 'RICTOR', 'MLST8', 'MAPKAP1', 'TSC1', 'TSC2', 'RHEB',
      'RRAGA', 'RRAGB', 'RRAGC', 'RRAGD', 'RPS6KB1', 'RPS6', 'EIF4EBP1',
      'EIF4E', 'EIF4EBP2', 'AKT1', 'AKT2', 'PRKAA1', 'PRKAA2', 'STK11', 'STRADA',
      'CAB39', 'DDIT4', 'SGK1', 'RPS6KA1', 'ULK1', 'PIK3C3', 'ATP6V1A', 'WNT2',
      'AMP', 'SLC3A2', 'SLC7A5',
    ],
  },
  {
    id: 'hsa04064',
    name: 'NF-kappa B signaling pathway',
    nameZh: 'NF-κB 信号通路',
    category: '免疫系统 · 炎症信号',
    description:
      'NF-κB 二聚体（p65/RelA·p50）静息态被 IκBα 锚定于胞质。经典通路：TNF-α/TNF-R1 → TRADD/TRAF2/RIPK1 → IKK 复合体（IKKβ/IKKγ/NEMO）磷酸化 IκBα → β-TrCP 泛素化 → 26S 蛋白酶体降解 IκBα，释放 NF-κB 入核驱动 TNF、IL-1β、IL-6、COX-2 等炎症基因。A20 与 IκBα 自身构成双重负反馈；非经典通路经 NIK/IKKα 处理 p100 生成 p52RelB。',
    cascade: 'TNF-α → TNFR1 → IKK → IκBα 降解 → NF-κB (p65/p50) 入核 → 炎症基因',
    seeds: [
      'TNF', 'IL1B', 'LTA', 'CD40LG', 'BAFF', 'TLR4', 'TLR2', 'MYD88', 'IRAK1',
      'IRAK4', 'TRAF6', 'TRAF2', 'TRADD', 'RIPK1', 'TAB1', 'TAB2', 'MAP3K7',
      'CHUK', 'IKBKB', 'IKBKG', 'NFKBIA', 'NFKBIB', 'NFKB1', 'RELA', 'REL',
      'RELB', 'NFKB2', 'TNFAIP3', 'BTRC', 'CASP8', 'BCL2L1', 'BIRC2', 'BIRC3',
      'CFLAR', 'PTGS2', 'IL6', 'ICAM1',
    ],
  },
  {
    id: 'hsa04210',
    name: 'Apoptosis pathway',
    nameZh: '细胞凋亡通路',
    category: '细胞过程 · 程序性细胞死亡',
    description:
      '凋亡经两条汇聚途径执行：外源性（死亡配体 FASL/TNFα 结合 FAS/TNFR1 → FADD 接头 → Procaspase-8 寡集"死亡诱导信号复合体"DISC → Caspase-8 自剪切激活）与内源性线粒体途径（BH3-only 蛋白 BID/BAX/BAK → 线粒体外膜通透化 → 细胞色素 c 释放 → 与 APAF1/Procaspase-9 组装凋亡体）。两条途径汇聚于执行分子 Caspase-3/7，切割 ICAD/PARP 等底物实现程序性拆解。BCL-2（线粒体抗凋亡）与 XIAP（caspase 抑制）为关键调控位点。',
    cascade: 'FASL → FAS → CASP8 ∥ BAX → CYCS → APAF1 → CASP9 → CASP3 → 凋亡',
    seeds: [
      'FASLG', 'FAS', 'TNFRSF1A', 'TNFRSF10B', 'FADD', 'CASP8', 'CASP10',
      'CFLAR', 'BID', 'BAX', 'BAK1', 'BCL2', 'BCL2L1', 'MCL1', 'BCL2L11',
      'BAD', 'BBC3', 'PMAIP1', 'CYCS', 'APAF1', 'CASP9', 'CASP3', 'CASP7',
      'CASP6', 'XIAP', 'BIRC2', 'BIRC3', 'TP53', 'AKT1', 'PARP1', 'DFFB',
    ],
  },
  {
    id: 'hsa04115',
    name: 'p53 signaling pathway',
    nameZh: 'p53 信号通路',
    category: '细胞过程 · 基因组卫士',
    description:
      'p53（TP53）作为"基因组守卫"，静息态经 MDM2 泛素连接酶持续降解（自反馈环）。DNA 双链断裂激活 ATM → CHK2，复制胁迫激活 ATR → CHK1，两者磷酸化 p53（Ser15/20）与 MDM2 使其解离；癌基因过表达经 ARF（p14^arf）抑制 MDM2。稳定化的 p53 四聚体作为序列特异转录因子，依损伤程度诱导 p21（G1 阻滞）、GADD45（修复）、14-3-3σ、或 PUMA/NOXA/BAX（线粒体凋亡）。约 50% 人类肿瘤存在 TP53 突变。',
    cascade: 'DNA 损伤 → ATM/CHK2 → p53 稳定 → p21 阻滞 / PUMA·NOXA 凋亡',
    seeds: [
      'TP53', 'MDM2', 'MDM4', 'ATM', 'ATR', 'CHEK1', 'CHEK2', 'CDKN1A',
      'GADD45A', 'GADD45G', 'CDKN2A', 'BAX', 'BAK1', 'BBC3', 'PMAIP1', 'APAF1',
      'CASP3', 'CASP8', 'CASP9', 'DDB2', 'XPC', 'RRM2B', 'SESN1', 'SESN2',
      'CDK4', 'CCND1', 'CCNE1', 'E2F1', 'SIRT1', 'USP7', 'TOPORS', 'CUL4A',
    ],
  },
  {
    id: 'hsa04152',
    name: 'AMPK signaling pathway',
    nameZh: 'AMPK 信号通路',
    category: '环境信息处理 · 能量传感',
    description:
      'AMP 活化蛋白激酶（AMPK）是细胞能量稳态主控传感器。ATP 消耗时 AMP/ADP 与 AMPK γ 亚基结合引发变构激活，并保护 α 亚基 Thr172（LKB1 或 CaMKKβ 磷酸化位点）不被去磷酸化。激活的 AMPK 通过磷酸化 TSC2/Raptor 抑制 mTORC1、磷酸化 ACACC 抑制脂肪酸合成、经 ULK1 启动自噬，整体转向分解代谢；并通过 PGC-1α 促进线粒体生物合成。二甲双胍（metformin）经线粒体复合物 I 抑制间接激活 AMPK。',
    cascade: 'AMP↑ → LKB1/CaMKKβ → pAMPK(Thr172) ⊣ mTORC1 / ACACA → 分解代谢',
    seeds: [
      'PRKAA1', 'PRKAA2', 'PRKAB1', 'PRKAB2', 'PRKAG1', 'PRKAG2', 'STK11',
      'CAB39', 'STRADA', 'CAMKK2', 'CAMK2A', 'MTOR', 'RPTOR', 'TSC2', 'RPTOR',
      'ACACA', 'ACACB', 'SREBF1', 'HMGCR', 'CPT1A', 'CPT1B', 'ULK1', 'PPARGC1A',
      'SIRT1', 'FOXO3', 'G6PC', 'PCK1', 'RPS6KB1', 'TSC1', 'SCD', 'FASN',
    ],
  },
];

/** 按 id 索引 */
export const PATHWAY_MAP = new Map(PATHWAY_CATALOG.map((p) => [p.id, p]));
