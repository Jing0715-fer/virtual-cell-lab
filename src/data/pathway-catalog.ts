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
    descriptionEn:
      'The mitogen-activated protein kinase (MAPK) cascade is a highly conserved three-tiered kinase module (MAPKKK → MAPKK → MAPK) that converts growth-factor, cytokine and stress stimuli into gene-expression programs. The ERK1/2 branch drives proliferation and differentiation, while the JNK/SAPK and p38 branches transduce stress and inflammatory signaling.',
    cascade: 'EGF → EGFR → GRB2/SOS → RAS-GTP → RAF → MEK1/2 → ERK1/2 → ELK1/c-FOS',
    cascadeEn: 'EGF → EGFR → GRB2/SOS → RAS-GTP → RAF → MEK1/2 → ERK1/2 → ELK1/c-FOS',
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
    descriptionEn:
      'Phosphoinositide 3-kinase (PI3K), activated downstream of RTKs/GPCRs, generates the second messenger PIP3 at the membrane to recruit PDK1 and Akt; Akt phosphorylates FOXO, GSK-3β, TSC2 and other substrates to govern cell survival, metabolism, growth and proliferation. PTEN dephosphorylates PIP3 as a key negative regulator and tumor suppressor.',
    cascade: 'IGF-1 → IGF1R → PI3K → PIP3 → PDK1/Akt → mTORC1 / GSK3β / FOXO',
    cascadeEn: 'IGF-1 → IGF1R → PI3K → PIP3 → PDK1/Akt → mTORC1 / GSK3β / FOXO',
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
    descriptionEn:
      'Secreted Wnt glycoproteins bind Frizzled seven-transmembrane receptors together with LRP5/6 co-receptors. In the canonical Wnt/β-catenin branch, receptor activation via Dishevelled disassembles the β-catenin destruction complex (Axin/APC/GSK3β/CK1), sparing β-catenin from ubiquitin-mediated degradation; it then enters the nucleus and partners with TCF/LEF to drive MYC, CCND1 and other target genes — specifying cell fate and stemness maintenance.',
    cascade: 'WNT3A → FZD/LRP6 → DVL ⊣ 破坏复合体 → β-catenin 入核 → TCF/LEF → MYC/CCND1',
    cascadeEn: 'WNT3A → FZD/LRP6 → DVL ⊣ destruction complex → β-catenin nuclear entry → TCF/LEF → MYC/CCND1',
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
    descriptionEn:
      'Notch receptors bind Delta/Jagged ligands on adjacent cells (juxtacrine, contact-dependent), triggering two sequential proteolytic cleavages: ADAM metalloproteases shed the extracellular domain, then the γ-secretase complex (Presenilin/Nicastrin) releases the Notch intracellular domain (NICD). NICD translocates to the nucleus, converting the transcriptional repressor RBP-Jκ into an activator that assembles with MAML to drive HES/HEY targets — mediating lateral inhibition and cell-fate decisions.',
    cascade: 'DLL/JAG → NOTCH → ADAM/γ-secretase 切割 → NICD 入核 → RBPJ/MAML → HES1',
    cascadeEn: 'DLL/JAG → NOTCH → ADAM/γ-secretase cleavage → NICD nuclear entry → RBPJ/MAML → HES1',
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
    descriptionEn:
      'TGF-β superfamily ligands (TGF-β/Activin/Nodal/BMP) bind type-II serine/threonine kinase receptors, which recruit and phosphorylate type-I receptors; the activated receptors phosphorylate R-Smads (Smad2/3 or Smad1/5/8) that complex with Co-Smad (Smad4) and enter the nucleus, tuning transcription with cofactors such as FAST1/Ski. Inhibitory Smad6/7 and the E3 ligase Smurf2 form negative feedback. In epithelial cells TGF-β can also induce EMT via non-Smad routes (RhoA/MAPK/PI3K).',
    cascade: 'TGF-β1 → TGFBR2 → TGFBR1 → pSMAD2/3-SMAD4 复合体 → PAI-1/p21/EMT 基因',
    cascadeEn: 'TGF-β1 → TGFBR2 → TGFBR1 → pSMAD2/3-SMAD4 complex → PAI-1/p21/EMT genes',
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
    descriptionEn:
      'Type I/II cytokine receptors lack intrinsic kinase activity and constitutively associate with JAK family tyrosine kinases (JAK1/2/3, Tyk2). Ligand-induced dimerization lets JAKs cross-phosphorylate receptor tail Tyr residues, creating STAT docking sites; phosphorylated STATs dimerize via reciprocal SH2-pTyr interactions, translocate and bind GAS elements to drive transcription. The SOCS family is STAT-induced, closing a classic negative-feedback loop.',
    cascade: 'IL-2 → IL2Rβ/γc → JAK1/JAK3 → pSTAT5 二聚体 → 增殖基因；SOCS 负反馈',
    cascadeEn: 'IL-2 → IL2Rβ/γc → JAK1/JAK3 → pSTAT5 dimer → proliferation genes; SOCS negative feedback',
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
    descriptionEn:
      'Upon agonist binding, GPCRs trigger GDP→GTP exchange and dissociation of heterotrimeric Gα; Gsα directly stimulates adenylyl cyclase (AC) to convert ATP into the second messenger cAMP. cAMP binds PKA regulatory subunits, releasing catalytic subunits that phosphorylate CREB (Ser133), L-type Ca²⁺ channels and other substrates; cAMP can also act via the EPAC/Rap1 route or CNG ion channels. PDE family enzymes hydrolyze cAMP to terminate signaling (caffeine/theophylline are PDE inhibitors).',
    cascade: '肾上腺素 → β2-AR → Gs → AC → cAMP → PKA → pCREB → CRE 元件转录',
    cascadeEn: 'Epinephrine → β2-AR → Gs → AC → cAMP → PKA → pCREB → CRE-driven transcription',
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
    descriptionEn:
      'Ca²⁺ is a universal second messenger — cytosolic free calcium rising from ~100 nM into the µM range triggers effectors. Sources include voltage-gated Ca²⁺ channels (Cav), IP3 receptors (GPCR → PLCβ → IP3), ryanodine receptors (CICR) and store-operated entry (STIM1/ORAI1). Calcium signals are decoded by calmodulin (CaM): CaMKII mediates synaptic plasticity, while calcineurin dephosphorylates NFAT for nuclear entry; SERCA (ATP2A2) and PMCA pumps handle Ca²⁺ clearance. Amplitude-frequency encoding of Ca²⁺ spikes yields signal diversity.',
    cascade: 'GPCR → PLCβ → IP3 → IP3R (ER 钙释放) → CaM → CaMKII / Calcineurin → NFAT',
    cascadeEn: 'GPCR → PLCβ → IP3 → IP3R (ER Ca²⁺ release) → CaM → CaMKII / Calcineurin → NFAT',
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
    descriptionEn:
      'mTOR is an atypical serine/threonine kinase assembling two complexes: mTORC1 (containing Raptor) is activated by Rheb-GTP and, via S6K1 and 4E-BP1 phosphorylation, promotes ribosome biogenesis and protein translation while repressing autophagy through ULK1; mTORC2 (containing Rictor) phosphorylates Akt Ser473 in feedback. The TSC1/TSC2 complex acts as a GAP that inactivates Rheb — the negative-control hub for growth-factor signaling; when ATP is scarce, AMPK phosphorylates TSC2 and Raptor to inhibit mTORC1 (the mechanism of metformin).',
    cascade: 'IGF-1/氨基酸 → TSC2 ⊣ RHEB → mTORC1 → S6K/4E-BP1 → 蛋白合成/自噬抑制',
    cascadeEn: 'IGF-1/amino acids → TSC2 ⊣ RHEB → mTORC1 → S6K/4E-BP1 → protein synthesis / autophagy repression',
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
    descriptionEn:
      'NF-κB dimers (p65/RelA·p50) are held in the cytosol by IκBα at rest. Canonical route: TNF-α/TNF-R1 → TRADD/TRAF2/RIPK1 → the IKK complex (IKKβ/IKKγ/NEMO) phosphorylates IκBα → β-TrCP ubiquitination → 26S proteasomal degradation of IκBα, releasing NF-κB to enter the nucleus and drive TNF, IL-1β, IL-6, COX-2 and other inflammatory genes. A20 and IκBα itself form dual negative feedback; the non-canonical route processes p100 via NIK/IKKα to yield p52RelB.',
    cascade: 'TNF-α → TNFR1 → IKK → IκBα 降解 → NF-κB (p65/p50) 入核 → 炎症基因',
    cascadeEn: 'TNF-α → TNFR1 → IKK → IκBα degradation → NF-κB (p65/p50) nuclear entry → inflammatory genes',
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
    descriptionEn:
      'Apoptosis executes via two converging routes: the extrinsic path (death ligands FASL/TNFα engaging FAS/TNFR1 → FADD adaptors → procaspase-8 oligomerization into the death-inducing signaling complex DISC → caspase-8 auto-cleavage) and the intrinsic mitochondrial path (BH3-only proteins BID/BAX/BAK → mitochondrial outer-membrane permeabilization → cytochrome c release → apoptosome assembly with APAF1/procaspase-9). Both converge on executioner caspase-3/7, cleaving ICAD/PARP and other substrates for programmed dismantling. BCL-2 (anti-apoptotic) and XIAP (caspase inhibition) are key control points.',
    cascade: 'FASL → FAS → CASP8 ∥ BAX → CYCS → APAF1 → CASP9 → CASP3 → 凋亡',
    cascadeEn: 'FASL → FAS → CASP8 ∥ BAX → CYCS → APAF1 → CASP9 → CASP3 → apoptosis',
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
    descriptionEn:
      'p53 (TP53), the "guardian of the genome", is constitutively degraded at rest by the MDM2 ubiquitin ligase (an autoregulatory loop). DNA double-strand breaks activate ATM → CHK2 and replication stress activates ATR → CHK1; both phosphorylate p53 (Ser15/20) and MDM2 to disengage the complex, while oncogene overexpression inhibits MDM2 via ARF (p14^arf). Stabilized p53 tetramers act as sequence-specific transcription factors, inducing p21 (G1 arrest), GADD45 (repair), 14-3-3σ, or PUMA/NOXA/BAX (mitochondrial apoptosis) according to damage severity. ~50% of human tumors carry TP53 mutations.',
    cascade: 'DNA 损伤 → ATM/CHK2 → p53 稳定 → p21 阻滞 / PUMA·NOXA 凋亡',
    cascadeEn: 'DNA damage → ATM/CHK2 → p53 stabilization → p21 arrest / PUMA·NOXA apoptosis',
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
    descriptionEn:
      'AMP-activated protein kinase (AMPK) is the master sensor of cellular energy homeostasis. As ATP is consumed, AMP/ADP bind the AMPK γ subunit, causing allosteric activation and protecting α-subunit Thr172 (the LKB1 or CaMKKβ phosphorylation site) from dephosphorylation. Active AMPK phosphorylates TSC2/Raptor to inhibit mTORC1, phosphorylates ACACA to curb fatty-acid synthesis and initiates autophagy via ULK1 — an overall switch to catabolism — while promoting mitochondrial biogenesis through PGC-1α. Metformin activates AMPK indirectly via mitochondrial complex-I inhibition.',
    cascade: 'AMP↑ → LKB1/CaMKKβ → pAMPK(Thr172) ⊣ mTORC1 / ACACA → 分解代谢',
    cascadeEn: 'AMP↑ → LKB1/CaMKKβ → pAMPK(Thr172) ⊣ mTORC1 / ACACA → catabolism',
    seeds: [
      'PRKAA1', 'PRKAA2', 'PRKAB1', 'PRKAB2', 'PRKAG1', 'PRKAG2', 'STK11',
      'CAB39', 'STRADA', 'CAMKK2', 'CAMK2A', 'MTOR', 'RPTOR', 'TSC2', 'RPTOR',
      'ACACA', 'ACACB', 'SREBF1', 'HMGCR', 'CPT1A', 'CPT1B', 'ULK1', 'PPARGC1A',
      'SIRT1', 'FOXO3', 'G6PC', 'PCK1', 'RPS6KB1', 'TSC1', 'SCD', 'FASN',
    ],
  },
  {
    id: 'hsa04370',
    name: 'VEGF signaling pathway',
    nameZh: 'VEGF 信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      '血管内皮生长因子（VEGF）家族是血管生成的主控信号。VEGFA 结合酪氨酸激酶受体 VEGFR2/KDR（血管内皮的主要信号受体），激活后并行启动三条支路：PLCγ→DAG/IP₃→PKC→Raf-MEK-ERK 驱动内皮细胞增殖；PI3K→Akt→eNOS 磷酸化生成一氧化氮（NO）介导血管扩张与通透性；Src-FAK-paxillin 重构细胞骨架促进迁移。钙-钙调磷酸酶去磷酸化 NFAT 入核诱导 PTGS2/COX-2 等基因。缺氧经 HIF-1 上调 VEGFA 表达——肿瘤血管新生与湿性老年黄斑变性的核心机制，也是贝伐珠单抗等抗 VEGF 生物制剂的靶点。',
    descriptionEn:
      'The vascular endothelial growth factor (VEGF) family is the master signal of angiogenesis. VEGFA engages the receptor tyrosine kinase VEGFR2/KDR — the principal signaling receptor on endothelial cells — launching three parallel branches: PLCγ→DAG/IP₃→PKC→Raf-MEK-ERK driving endothelial proliferation; PI3K→Akt→eNOS phosphorylation generating nitric oxide (NO) for vasodilation and permeability; and Src-FAK-paxillin cytoskeletal remodeling for migration. The Ca²⁺-calcineurin arm dephosphorylates NFAT for nuclear entry, inducing PTGS2/COX-2 and other genes. Hypoxia upregulates VEGFA via HIF-1 — the core mechanism of tumor angiogenesis and wet age-related macular degeneration, and the target of anti-VEGF biologics such as bevacizumab.',
    cascade: 'VEGFA → KDR/VEGFR2 → PLCγ→PKC→Raf→MEK→ERK ∥ PI3K→Akt→eNOS→NO → 增殖/通透性/迁移',
    cascadeEn: 'VEGFA → KDR/VEGFR2 → PLCγ→PKC→Raf→MEK→ERK ∥ PI3K→Akt→eNOS→NO → proliferation / permeability / migration',
    seeds: [
      'VEGFA', 'KDR', 'PLCG1', 'PRKCA', 'RAF1', 'MAP2K1', 'MAPK1', 'MAPK14',
      'PIK3CA', 'PIK3CB', 'PIK3R1', 'PIK3R2', 'AKT1', 'AKT2', 'AKT3', 'NOS3',
      'PPP3CA', 'NFATC2', 'PTGS2', 'SRC', 'PTK2', 'PXN', 'RAC1', 'CDC42',
      'HRAS', 'KRAS', 'MAPKAPK3', 'HSPB1', 'SHC1', 'SHC2', 'SH2D2A', 'SPHK2',
      'PLA2G4B', 'CASP9', 'BAD', 'VEGFB', 'VEGFC', 'PGF', 'FLT1', 'FLT4',
      'NRP1', 'HIF1A',
    ],
  },
  {
    id: 'hsa04390',
    name: 'Hippo signaling pathway',
    nameZh: 'Hippo 信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      'Hippo 通路是器官大小与组织稳态的核心抑制性级联（保守自果蝇）。上游输入——细胞极性复合体（CRB/PALS/PATJ、SCRIB/DLG/LGL）、接触抑制（E-cadherin）、NF2/merlin 与 KIBRA/WWC1——汇聚激活 MST1/2·SAV1 激酶复合体，磷酸化 LATS1/2·MOB1；LATS 进而磷酸化 YAP/TAZ（Ser127），创造 14-3-3 结合位点使其滞留胞质并被 β-TrCP 泛素降解。当通路失活（低密度生长、NF2 突变、GPCR-Gαq/Gα12/13 刺激），去磷酸化的 YAP/TAZ 入核结合 TEAD1-4，驱动 CTGF/CYR61、MYC、BIRC5 等增殖与干性基因——器官再生与肿瘤发生的"生长许可开关"，Verteporfin 等 TEAD 抑制剂正在临床开发。',
    descriptionEn:
      'The Hippo pathway is the core inhibitory cascade governing organ size and tissue homeostasis (conserved from Drosophila). Upstream inputs — cell-polarity complexes (CRB/PALS/PATJ, SCRIB/DLG/LGL), contact inhibition (E-cadherin), NF2/merlin and KIBRA/WWC1 — converge to activate the MST1/2·SAV1 kinase complex, which phosphorylates LATS1/2·MOB1; LATS in turn phosphorylates YAP/TAZ (Ser127), creating 14-3-3 docking sites that retain them in the cytosol and target them for β-TrCP-mediated degradation. When the pathway is off (sparse growth, NF2 mutation, GPCR-Gαq/Gα12/13 signaling), dephosphorylated YAP/TAZ enter the nucleus and partner with TEAD1-4 to drive CTGF/CYR61, MYC, BIRC5 and other proliferation/stemness genes — the "growth-permission switch" of regeneration and tumorigenesis; TEAD inhibitors such as verteporfin are in clinical development.',
    cascade: '极性/接触抑制 → MST1/2-SAV1 → LATS1/2-MOB1 → pYAP/TAZ(S127) 胞质滞留 ⊣ 生长基因；失活 → YAP/TAZ-TEAD 入核',
    cascadeEn: 'Polarity/contact inhibition → MST1/2-SAV1 → LATS1/2-MOB1 → pYAP/TAZ(S127) cytosolic retention ⊣ growth genes; pathway off → YAP/TAZ-TEAD nuclear entry',
    seeds: [
      'NF2', 'WWC1', 'FRMD6', 'STK3', 'STK4', 'MST1', 'MST2', 'SAV1',
      'LATS1', 'LATS2', 'MOB1A', 'MOB1B', 'YAP1', 'WWTR1', 'TEAD1', 'TEAD2',
      'TEAD3', 'TEAD4', 'VGLL4', 'CCN2', 'CTGF', 'CYR61', 'CCN1', 'BIRC2',
      'BIRC3', 'BIRC5', 'MYC', 'CCND1', 'AXIN1', 'APC', 'APC2', 'GSK3B',
      'AMOT', 'AMOTL1', 'AMOTL2', 'PPP1CA', 'PPP2CA', 'PRKCI', 'RASSF1',
      'RASSF6', 'FBXW11', 'CRB1', 'PALS1', 'PATJ', 'PARD3', 'PARD6A', 'DLG1',
      'SCRIB', 'LLGL2', 'CDH1', 'CTNNB1', 'CTNNA1', 'LEF1', 'DVL1', 'FZD10',
      'TGFB1', 'TGFBR1', 'SMAD2', 'SMAD4', 'SMAD7', 'BMPR1A', 'SNAI2', 'SOX2',
    ],
  },
  {
    id: 'hsa04066',
    name: 'HIF-1 signaling pathway',
    nameZh: 'HIF-1 信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      '低氧诱导因子（HIF-1）是缺氧应答的主转录开关。常氧下，脯氨酰羟化酶 PHD/EGLN 以 O₂、Fe²⁺、2-氧代戊二酸与抗坏血酸为辅底物羟基化 HIF-1α（P402/P564），被 VHL 泛素连接酶复合体（Elongin B/C·Cul2·Rbx1）识别后经 26S 蛋白酶体分钟级降解；FIH-1 羟基化 Asn803 阻断 p300/CBP 募集。氧分压降至 ~5% 以下时羟化受阻，HIF-1α 稳定积累、与 HIF-1β/ARNT 二聚，经 p300/CBP 激活缺氧反应元件（HRE）：VEGFA（血管生成）、SLC2A1/GLUT1 与糖酵解酶（代谢重编程）、EPO（红细胞生成）、CA9（pH 稳态）。PI3K-Akt-mTOR 与 Ras-ERK 经翻译层面放大 HIF-1α 合成。肿瘤乏氧区的 HIF-1 激活是侵袭、免疫逃逸与血管新生之基。',
    descriptionEn:
      'Hypoxia-inducible factor 1 (HIF-1) is the master transcriptional switch of the hypoxic response. At normoxia, prolyl hydroxylases PHD/EGLN — using O₂, Fe²⁺, 2-oxoglutarate and ascorbate as co-substrates — hydroxylate HIF-1α (P402/P564), tagging it for recognition by the VHL ubiquitin ligase complex (Elongin B/C·Cul2·Rbx1) and minutes-scale degradation by the 26S proteasome; FIH-1 hydroxylation of Asn803 blocks p300/CBP recruitment. Below ~5% O₂, hydroxylation stalls: HIF-1α stabilizes, dimerizes with HIF-1β/ARNT, and — via p300/CBP — activates hypoxia response elements (HREs) driving VEGFA (angiogenesis), SLC2A1/GLUT1 and glycolytic enzymes (metabolic reprogramming), EPO (erythropoiesis) and CA9 (pH homeostasis). PI3K-Akt-mTOR and Ras-ERK amplify HIF-1α synthesis translationally. HIF-1 activation in hypoxic tumor regions underlies invasion, immune escape and neovascularization.',
    cascade: 'O₂↓ → EGLN/PHD 失活 → HIF-1α 稳定 → HIF-1α/ARNT-p300 → HRE → VEGFA/GLUT1/EPO',
    cascadeEn: 'O₂↓ → EGLN/PHD stall → HIF-1α stabilization → HIF-1α/ARNT-p300 → HRE → VEGFA/GLUT1/EPO',
    seeds: [
      'HIF1A', 'EPAS1', 'ARNT', 'HIF1B', 'VHL', 'EGLN1', 'EGLN2', 'EGLN3',
      'HIF1AN', 'CREBBP', 'EP300', 'TCEB1', 'TCEB2', 'CUL2', 'RBX1', 'UBE2M',
      'VEGFA', 'SLC2A1', 'LDHA', 'PDK1', 'CA9', 'CA12', 'NOS2', 'EDN1',
      'SERPINE1', 'TFRC', 'EPO', 'TIMP1', 'IGF1', 'IGF2', 'INS', 'IGF1R',
      'INSR', 'PIK3CA', 'PIK3CB', 'PIK3R1', 'PDPK1', 'AKT1', 'AKT2', 'AKT3',
      'MTOR', 'RPS6KB1', 'RPS6', 'EIF4EBP1', 'HSP90AA1', 'CDKN1A', 'CAMK2A',
      'STAT3', 'NFKB1', 'MAPK1', 'MAPK14', 'ELK1', 'CREB1', 'TF', 'PRKCA',
    ],
  },
  {
    id: 'hsa04068',
    name: 'FoxO signaling pathway',
    nameZh: 'FoxO 信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      'FoxO（Forkhead box O）转录因子家族（FOXO1/3/4/6）是胰岛素-PI3K-Akt 轴的主要代谢效应端，整合营养、应激与存活决策。Akt 与 SGK1 磷酸化 FoxO 三个保守位点（Thr32/Ser253/Ser315，以 FOXO3a 计），创造 14-3-3 结合位点导致出核滞留；IKKβ 亦可直接磷酸化促进其降解。反向输入：JNK/p38 应激激酶、AMPK（能量匮乏）、SIRT1 去乙酰化与 CNK1E 介导的磷酸化则促 FoxO 入核。核内 FoxO 驱动细胞周期阻滞（p27/p21）、凋亡（BIM/PUMA）、抗氧化防御（SOD2/Catalase）、糖异生（PEPCK/G6Pase）与自噬。热量限制与二甲双胍的延寿效应多经 FoxO 介导；肿瘤中 Akt 持续激活将 FoxO 驱逐出核以逃避凋亡——"代谢记忆的守门人"。',
    descriptionEn:
      'The Forkhead box O (FoxO) transcription factors (FOXO1/3/4/6) are the principal metabolic effectors of the insulin-PI3K-Akt axis, integrating nutrient, stress and survival decisions. Akt and SGK1 phosphorylate three conserved FoxO sites (Thr32/Ser253/Ser315, numbered as in FOXO3a), creating 14-3-3 docking sites that drive nuclear export and cytosolic retention; IKKβ can also phosphorylate FoxO directly to promote its degradation. Counter-inputs — JNK/p38 stress kinases, AMPK (energy deprivation), SIRT1 deacetylation and CK1ε-mediated phosphorylation — promote FoxO nuclear entry. Nuclear FoxO drives cell-cycle arrest (p27/p21), apoptosis (BIM/PUMA), antioxidant defense (SOD2/Catalase), gluconeogenesis (PEPCK/G6Pase) and autophagy. Caloric restriction and metformin extend lifespan largely through FoxO; tumors with hyperactive Akt evict FoxO from the nucleus to escape apoptosis — "the gatekeeper of metabolic memory".',
    cascade: '胰岛素 → PI3K → PIP₃ → PDK1/Akt → pFoxO 出核 ⊣ 靶基因 ∥ 应激(JNK/AMPK/SIRT1) → FoxO 入核 → p27/BIM/SOD2',
    cascadeEn: 'Insulin → PI3K → PIP₃ → PDK1/Akt → pFoxO nuclear export ⊣ targets ∥ stress (JNK/AMPK/SIRT1) → FoxO nuclear entry → p27/BIM/SOD2',
    seeds: [
      'FOXO1', 'FOXO3', 'FOXO4', 'FOXO6', 'INS', 'INSR', 'IGF1', 'IGF1R',
      'IRS1', 'IRS2', 'PIK3CA', 'PIK3CB', 'PIK3R1', 'PDPK1', 'AKT1', 'AKT2',
      'AKT3', 'SGK1', 'SGK3', 'MAPK8', 'MAPK9', 'MAPK10', 'MAPK14', 'MAPK11',
      'MAP2K4', 'MAP2K6', 'STK11', 'PRKAA1', 'PRKAA2', 'SIRT1', 'SIRT2',
      'USP7', 'SKP2', 'CDKN1A', 'CDKN1B', 'BCL2L11', 'PMAIP1', 'BBC3',
      'GADD45A', 'GADD45B', 'SOD2', 'CAT', 'PCK1', 'PCK2', 'G6PC', 'PPARGC1A',
      'PTK6', 'IKBKB', 'CCND1', 'CCND2', 'TGFB1', 'SMAD2', 'SMAD3', 'SMAD4',
      'SETD7', 'KAT2B', 'PTEN', 'WWTR1', 'NLK', 'CDK2', 'CCNB3',
    ],
  },
  {
    id: 'hsa04620',
    name: 'Toll-like receptor signaling pathway',
    nameZh: 'Toll 样受体信号通路',
    category: '免疫系统 · 固有免疫识别',
    description:
      'Toll 样受体（TLR1-10）是固有免疫识别病原体相关分子模式（PAMP）的主要哨兵：TLR4 与 MD-2/LY96、CD14 共受体识别革兰阴性菌内毒素 LPS；TLR3/7/8/9 识别病毒与细菌核酸；TLR1/2/6 识别脂肽。配体诱导受体二聚化后胞内 TIR 域募集衔接蛋白启动两条主线：MyD88/TIRAP 路径经 IRAK4→IRAK1 自磷酸化激活 TRAF6（K63 泛素支架），TAB1/2-TAK1 随后双线出击——IKK 复合体（IKKβ/IKKα/NEMO）磷酸化 IκBα 释放 NF-κB，MKK-JNK/p38 激活 AP-1，共驱 TNF、IL-1β、IL-6、COX-2 等炎症基因；TRIF/TICAM1 路径（TLR3 与 TLR4 内体相）经 TBK1/IKKε 磷酸化 IRF3/7 入核产生 I 型干扰素（IFN-β）。TOLLIP、A20 与 PI3K 负向刹车。脓毒症细胞因子风暴、系统性红斑狼疮（TLR7 过活）与此通路直接相关。',
    descriptionEn:
      'Toll-like receptors (TLR1-10) are the primary sentinels of innate immune recognition of pathogen-associated molecular patterns (PAMPs): TLR4 with its MD-2/LY96 and CD14 co-receptors recognizes Gram-negative endotoxin LPS; TLR3/7/8/9 sense viral and bacterial nucleic acids; TLR1/2/6 recognize lipopeptides. Ligand-induced receptor dimerization recruits adaptors via the cytosolic TIR domain, launching two main routes. The MyD88/TIRAP route activates TRAF6 (a K63-ubiquitin scaffold) through IRAK4→IRAK1 autophosphorylation; TAB1/2-TAK1 then strikes on two fronts — the IKK complex (IKKβ/IKKα/NEMO) phosphorylates IκBα to release NF-κB while MKK-JNK/p38 activate AP-1, jointly driving TNF, IL-1β, IL-6, COX-2 and other inflammatory genes. The TRIF/TICAM1 route (TLR3 and endosomal TLR4) activates TBK1/IKKε to phosphorylate IRF3/7 for type-I interferon (IFN-β) production. TOLLIP, A20 and PI3K provide the brakes. Sepsis cytokine storms and SLE (TLR7 overactivity) map directly onto this pathway.',
    cascade: 'LPS → TLR4/MD2/CD14 → MyD88 → IRAK4/IRAK1 → TRAF6 → TAK1 → IKK → NF-κB → 炎症基因 ∥ TRIF → TBK1 → IRF3 → IFN-β',
    cascadeEn: 'LPS → TLR4/MD2/CD14 → MyD88 → IRAK4/IRAK1 → TRAF6 → TAK1 → IKK → NF-κB → inflammatory genes ∥ TRIF → TBK1 → IRF3 → IFN-β',
    seeds: [
      'TLR1', 'TLR2', 'TLR3', 'TLR4', 'TLR5', 'TLR6', 'TLR7', 'TLR8',
      'TLR9', 'TLR10', 'CD14', 'LY96', 'MYD88', 'TIRAP', 'TICAM1', 'TICAM2',
      'TOLLIP', 'IRAK1', 'IRAK2', 'IRAK4', 'TRAF6', 'TAB1', 'TAB2', 'TAB3',
      'MAP3K7', 'CHUK', 'IKBKB', 'IKBKG', 'NFKB1', 'RELA', 'NFKBIA', 'NFKBIB',
      'TNFAIP3', 'TBK1', 'IKBKE', 'IRF3', 'IRF7', 'IRF5', 'IFNB1', 'IFNA1',
      'TRAF3', 'RIPK1', 'MAPK14', 'MAPK8', 'MAPK9', 'MAPK10', 'MAP2K3',
      'MAP2K4', 'MAP2K6', 'MAP2K7', 'JUN', 'FOS', 'ELK1', 'MAP3K8', 'RAC1',
      'CDC42', 'PIK3CA', 'PIK3R1', 'BTK', 'TANK', 'AZI2', 'SARM1', 'FADD',
      'CASP8', 'TNF', 'IL6', 'IL1B', 'PTGS2',
    ],
  },
  {
    id: 'hsa04110',
    name: 'Cell cycle',
    nameZh: '细胞周期',
    category: '细胞过程 · 细胞生长与死亡',
    description:
      '真核细胞周期由 cyclin-CDK 序列引擎驱动：G1 期生长因子经 Ras-ERK/AP-1 诱导 Cyclin D-CDK4/6 起始磷酸化 Rb，逐步释放 E2F 转录因子——越过限制点后 Cyclin E-CDK2 自主推进（正反馈），加载 ORC/CDC6/Cdt1/MCM2-7 复制许可并进入 S 期；Cyclin A-CDK2 完成复制，Cyclin B-CDK1（促成熟因子 MPF）驱动核膜破裂、纺锤体装配与染色体分离。双层检查点网络守卫进程：DNA 损伤激活 ATM/ATR→CHK1/CHK2，抑制 CDC25 磷酸酶、激活 WEE1，并经 p53→p21/p16 阻滞周期；纺锤体检查点（BUB1/BUBR1/MAD2）滞留 APC/C^Cdc20 至着丝粒全部附着，随后降解 Cyclin B 与 securin 触发后期与退出。p16-Rb-p53 三重抑癌屏障失效是多数人类肿瘤的标志。',
    descriptionEn:
      'The eukaryotic cell cycle is driven by a sequential cyclin-CDK engine: in G1, growth factors via Ras-ERK/AP-1 induce Cyclin D-CDK4/6 to initiate Rb phosphorylation, progressively releasing E2F transcription factors — beyond the restriction point Cyclin E-CDK2 self-propels (positive feedback), loads the ORC/CDC6/Cdt1/MCM2-7 replication licence and enters S phase; Cyclin A-CDK2 completes replication while Cyclin B-CDK1 (maturation-promoting factor, MPF) drives nuclear-envelope breakdown, spindle assembly and chromosome segregation. A two-tier checkpoint network guards progression: DNA damage activates ATM/ATR→CHK1/CHK2, which inhibit CDC25 phosphatases, activate WEE1, and arrest the cycle via p53→p21/p16; the spindle checkpoint (BUB1/BUBR1/MAD2) withholds APC/C^Cdc20 until all kinetochores attach, then degrades Cyclin B and securin to trigger anaphase and exit. Failure of the triple p16-Rb-p53 tumor-suppressor barrier marks most human cancers.',
    cascade: '生长因子 → Cyclin D/CDK4-6 → pRb → E2F → Cyclin E/CDK2 → S 期 → Cyclin B/CDK1 → 有丝分裂；APC/C 退出',
    cascadeEn: 'Growth factors → Cyclin D/CDK4-6 → pRb → E2F → Cyclin E/CDK2 → S phase → Cyclin B/CDK1 → mitosis; APC/C exit',
    seeds: [
      'CCND1', 'CDK4', 'RB1', 'E2F1', 'CCNE1', 'CDK2', 'CCNA2', 'CDK1',
      'PLK1', 'CDC20', 'CCND2', 'CCND3', 'CDK6', 'CCNE2', 'CCNA1', 'CCNB1',
      'CCNB2', 'CCNB3', 'E2F2', 'E2F3', 'E2F4', 'E2F5', 'TFDP1', 'TFDP2',
      'RBL1', 'RBL2', 'CDKN1A', 'CDKN1B', 'CDKN2A', 'CDKN2B', 'CDKN2C',
      'CDKN2D', 'TP53', 'MDM2', 'CDK7', 'CCNH', 'CDK8', 'CCNC', 'CDC6',
      'CDT1', 'CDC45', 'CDC25A', 'CDC25B', 'CDC25C', 'WEE1', 'WEE2', 'PKMYT1',
      'CHEK1', 'CHEK2', 'ATM', 'ATR', 'AURKA', 'AURKB', 'BUB1', 'BUB1B',
      'BUB3', 'MAD1L1', 'MAD2L1', 'MAD2L2', 'FZR1', 'ANAPC10', 'ESPL1',
      'TGFB1', 'SMAD2', 'SMAD3', 'SMAD4', 'HDAC1', 'HDAC2', 'SKP1', 'SKP2',
      'CUL1', 'CCNF', 'PCNA', 'MCM2', 'MCM3', 'MCM4', 'MCM5', 'MCM6', 'MCM7',
      'MYC', 'GADD45A', 'GADD45G', 'BAX', 'ABL1', 'CREBBP', 'GSK3B', 'SFN',
    ],
  },
  {
    id: 'hsa04012',
    name: 'ErbB signaling pathway',
    nameZh: 'ErbB 信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      'ErbB/HER 受体酪氨酸激酶家族（EGFR/HER1、HER2、HER3、HER4）的信号特异性由配体诱导的二聚体组合决定：EGF/TGF-α/双调蛋白结合 EGFR；神经调节蛋白 NRG1-4 结合 HER3/HER4；HER2 无已知配体却呈"开放"构象、是异二聚体的首选伙伴（信号最强）；HER3 激酶域近乎无活性，仅作 PI3K 的停靠平台——HER2·HER3 异二聚体因此是最强增殖单元。二聚化反式自磷酸化后并行启动五条支路：GRB2/SOS→Ras→Raf-MEK-ERK（增殖）、PI3K→Akt→mTOR（存活与翻译）、PLCγ→PKC（钙信号）、Src→STAT5（分化）与 Cbl 介导的内吞降解（负调控，ERRFI1/MIG6 增强）。HER2 扩增（乳腺癌 ~20%）与 EGFR 激活突变（肺腺癌）使信号组成性激活——曲妥珠单抗、帕妥珠单抗与奥希替尼的临床靶点。',
    descriptionEn:
      'Signaling specificity in the ErbB/HER receptor tyrosine kinase family (EGFR/HER1, HER2, HER3, HER4) is encoded by ligand-induced dimer combinations: EGF/TGF-α/amphiregulin bind EGFR; neuregulins NRG1-4 bind HER3/HER4; HER2 has no known ligand yet adopts an "extended" conformation making it the preferred heterodimer partner (strongest signal); HER3 has a nearly dead kinase domain and serves only as a PI3K docking platform — the HER2·HER3 heterodimer is therefore the most potent proliferative unit. Dimerization and trans-autophosphorylation launch five parallel branches: GRB2/SOS→Ras→Raf-MEK-ERK (proliferation), PI3K→Akt→mTOR (survival and translation), PLCγ→PKC (Ca²⁺ signaling), Src→STAT5 (differentiation) and Cbl-mediated endocytic degradation (negative control, enhanced by ERRFI1/MIG6). HER2 amplification (~20% of breast cancers) and EGFR activating mutations (lung adenocarcinoma) render signaling constitutive — the clinical targets of trastuzumab, pertuzumab and osimertinib.',
    cascade: 'EGF/NRG → EGFR·HER2/HER3 异二聚体 → pY 平台 → GRB2-RAS-ERK ∥ PI3K-Akt ∥ PLCγ → 增殖/存活/迁移',
    cascadeEn: 'EGF/NRG → EGFR·HER2/HER3 heterodimers → pY platform → GRB2-RAS-ERK ∥ PI3K-Akt ∥ PLCγ → proliferation / survival / migration',
    seeds: [
      'EGF', 'TGFA', 'AREG', 'EREG', 'HBEGF', 'BTC', 'NRG1', 'NRG2', 'NRG3',
      'NRG4', 'EGFR', 'ERBB2', 'ERBB3', 'ERBB4', 'GRB2', 'SHC1', 'SHC2',
      'SOS1', 'SOS2', 'HRAS', 'KRAS', 'NRAS', 'RAF1', 'BRAF', 'ARAF',
      'MAP2K1', 'MAP2K2', 'MAPK1', 'MAPK3', 'PIK3CA', 'PIK3CB', 'PIK3CD',
      'PIK3R1', 'PIK3R2', 'AKT1', 'AKT2', 'AKT3', 'PDPK1', 'MTOR', 'PLCG1',
      'PLCG2', 'PRKCA', 'SRC', 'ABL1', 'ABL2', 'STAT5A', 'STAT5B', 'CBL',
      'ERRFI1', 'DUSP4', 'DUSP6', 'SPRY1', 'SPRY2', 'ETV4', 'ETV5', 'JUN',
      'FOS', 'MYC', 'ELK1', 'CDKN1A', 'CDKN1B', 'CASP9', 'BAD', 'NFKB1',
      'CRK', 'CRKL', 'RAPGEF1', 'RAP1A', 'NCK1', 'EPS8', 'EPS15', 'GAB1',
    ],
  },
];

/** 按 id 索引 */
export const PATHWAY_MAP = new Map(PATHWAY_CATALOG.map((p) => [p.id, p]));
