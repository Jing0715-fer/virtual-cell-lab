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
      // v6 补：GRB2→SOS→RAS 是生长因子输入经典轴，SOS1 曾被挤出局致 GRB2 死端
      'SOS1',
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
      // 烟碱型乙酰胆碱受体 α7（配体门控 Ca²⁻ 通道）—— ACh 的科学受体；
      // 旧配置 PLCB2 是 Gq 下游效应磷脂酶，跳过了受体环节
      { symbol: 'ACh', fullName: '乙酰胆碱 (Acetylcholine)', receptor: 'CHRNA7' },
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
      // 生长因子输入轴（KGML 实有 IGF1→IGF1R→IRS1→PI3K 链，v6 起纳入演示起点）
      'IGF1', 'IGF1R', 'IRS1',
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
      // 受体层（v6 补：TNFR1/TNFRSF13B 是 TNF/BAFF 的信号入口，曾被度数截断挤出）
      'TNFRSF1A', 'TNFRSF13B',
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
    syntheticLigands: [
      // LPS（革兰阴性菌内毒素）不在 KGML 图中 —— TLR4/MD-2/CD14 的经典 PAMP 配体
      { symbol: 'LPS', fullName: '脂多糖 (Lipopolysaccharide)', receptor: 'TLR4' },
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
  {
    id: 'hsa04340',
    name: 'Hedgehog signaling pathway',
    nameZh: 'Hedgehog 信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      'Hedgehog（Hh）家族分泌信号（SHH/IHH/DHH）在发育期控制组织图式形成与干细胞干性。静息态 PTCH1（12 次跨膜受体）抑制 SMO（FZD 样 7 次跨膜蛋白）；配体结合诱导 PTCH1 经 SMURF1 泛素化内吞，解除对 SMO 的抑制。在初级纤毛中，活化 SMO 募集 ARRB1/KIF3A 运输机器并抑制 GPR161-cAMP-PKA 轴，GLI 转录因子免于 PKA/GSK3β/CK1 磷酸化加工为截短抑制子（GLI-R），全长 GLI 活化型入核驱动 PTCH1、HHIP（双重负反馈）、CCND1、BCL2 等靶基因。SMO 激动剂 SAG 与拮抗剂环巴胺（vismodegib/sonidegib）分别是基底细胞癌靶向治疗的临床药物。',
    descriptionEn:
      'The Hedgehog (Hh) family of secreted signals (SHH/IHH/DHH) governs tissue patterning and stem-cell self-renewal during development. At rest the 12-transmembrane receptor PTCH1 inhibits SMO, an FZD-like 7-transmembrane protein; ligand binding triggers SMURF1-mediated ubiquitination and endocytosis of PTCH1, releasing SMO. In the primary cilium, activated SMO recruits the ARRB1/KIF3A trafficking machinery and represses the GPR161–cAMP–PKA axis, sparing GLI transcription factors from PKA/GSK3β/CK1-mediated processing into truncated repressors (GLI-R). Full-length GLI activators enter the nucleus to drive PTCH1, HHIP (dual negative feedback), CCND1 and BCL2. The SMO agonist SAG and antagonists cyclopamine/vismodegib/sonidegib are laboratory tools and clinical agents against basal-cell carcinoma.',
    cascade: 'Hh → PTCH1 内吞 ⊣ SMO 释放 → ARRB1/KIF3A → GLI-A 入核 → PTCH1/HHIP/CCND1',
    cascadeEn: 'Hh → PTCH1 endocytosis ⊣ SMO release → ARRB1/KIF3A → GLI-A nuclear entry → PTCH1/HHIP/CCND1',
    seeds: [
      'IHH', 'PTCH1', 'SMO', 'GAS1', 'GRK2', 'ARRB1', 'KIF3A', 'EVC2', 'EFCAB7',
      'GPR161', 'PRKACA', 'GSK3B', 'GLI1', 'SUFU', 'KIF7', 'CUL1', 'FBXW11',
      'CUL3', 'SPOPL', 'SMURF1', 'HHIP', 'CCND1', 'BCL2', 'MOSMO', 'MEGF8',
      'MGRN1', 'DISP1', 'HHAT', 'HHATL', 'SCUBE2', 'IQCE',
    ],
    syntheticLigands: [
      // SAG：SMO 直接激动剂（实验室经典工具药）—— Hh 配体结合 PTCH1 的"解除抑制"
      // 属双负语义（配体 ⊣ 受体 ⊣ 效应器），引擎以 SAG 直接激动 SMO 演示完整级联
      { symbol: 'SAG', fullName: 'SMO 激动剂 (Smoothened agonist)', receptor: 'SMO' },
    ],
  },
  {
    id: 'hsa04014',
    name: 'Ras signaling pathway',
    nameZh: 'Ras 信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      'Ras 超家族小 GTP 酶（HRAS/KRAS/NRAS）是生长因子受体下游的核心分子开关：RTK 磷酸化后经 SHC/GRB2 接头招募 SOS1 鸟苷交换因子，将 Ras·GDP 置换为 Ras·GTP；GTP 酶激活蛋白 NF1/RASA 具反向刹车功能（1 型神经纤维瘤病即 NF1 失活所致）。Ras·GTP 并行启动五大效应支路：RAF→MEK→ERK（增殖）、PI3K→PIP₃→Akt（存活）、RALGDS→RALA（囊泡运输与 TBK1 干扰素交叉）、TIAM1→RAC1/RHOA（迁移与骨架）、RASSF→MST1（凋亡阻滞）。KRAS G12D/G12V 突变使 GTP 酶永失刹车——胰腺癌、肺癌与肠癌最常见的驱动突变；GTP/GDP 结合态经蛋白结构域变色展示开关循环。',
    descriptionEn:
      'Ras-superfamily small GTPases (HRAS/KRAS/NRAS) are the central molecular switches downstream of growth-factor receptors: RTK phosphorylation recruits the SOS1 guanine-exchange factor via SHC/GRB2 adaptors, swapping Ras·GDP for Ras·GTP, while GAPs NF1/RASA provide the opposing brake (NF1 loss causes neurofibromatosis type 1). Ras·GTP launches five parallel effector arms: RAF→MEK→ERK (proliferation), PI3K→PIP₃→Akt (survival), RALGDS→RALA (vesicle trafficking with TBK1 interferon crosstalk), TIAM1→RAC1/RHOA (migration and cytoskeleton), and RASSF→MST1 (apoptotic blockade). KRAS G12D/G12V mutations abolish the intrinsic GTPase brake — the most common driver of pancreatic, lung and colorectal cancers. GTP/GDP-bound states illustrate the switch cycle.',
    cascade: 'CSF-1/5-HT → CSF1R/HTR7 → GRB2-SOS ⊣ Ras·GTP → RAF/PI3K/RALGDS/TIAM1 五支路',
    cascadeEn: 'CSF-1/5-HT → CSF1R/HTR7 → GRB2-SOS ⊣ Ras·GTP → RAF/PI3K/RALGDS/TIAM1 five arms',
    seeds: [
      'CSF1R', 'SHC2', 'GRB2', 'GAB1', 'PTPN11', 'SOS1', 'HRAS', 'KRAS', 'NRAS',
      'RRAS2', 'NF1', 'RASA4B', 'GDP', 'GTP', 'ZAP70', 'LAT', 'PLCG1', 'DAG',
      'RASGRP1', 'HTR7', 'GNB5', 'RASGRF1', 'cAMP', 'Ca²⁺', 'PRKACA', 'CALML6',
      'RASSF1', 'RASSF5', 'STK4', 'TIAM1', 'P3R3URF-PIK3R3', 'PIP₃', 'AKT3',
      'CHUK', 'NFKB1', 'BAD', 'BCL2L1', 'FOXO4', 'FASLG', 'RAF1', 'MAP2K1',
      'MAPK1', 'PLA2G4B', 'ELK1', 'ETS1', 'BRAP', 'KSR2', 'RAPGEF5', 'RAP1A',
      'RALGDS', 'RGL1', 'RGL2', 'RALA', 'MAPK8', 'EXOC2', 'TBK1', 'REL', 'PLD1',
      // v6 补：四条侧支的终端（CHUK→NFKB1 / RAPGEF5→RAP1A / EXOC2→TBK1→REL / BRAP→KSR2）
      'NFKB1', 'FASLG',
      'RALBP1', 'CDC42', 'RAC1', 'PAK4', 'RHOA', 'AFDN', 'RIN1',
    ],
    syntheticLigands: [
      // M-CSF：CSF1R 的经典配体（图中 RTK 以 CSF1R 为代表符号）
      { symbol: 'CSF1', fullName: '巨噬细胞集落刺激因子 (M-CSF)', receptor: 'CSF1R' },
      // 5-HT：5-HT7 受体→GNB5→RASGRF1 的 GPCR→Ras 输入支路
      { symbol: '5-HT', fullName: '血清素 (Serotonin)', receptor: 'HTR7' },
    ],
  },
  {
    id: 'hsa04623',
    name: 'Cytosolic DNA-sensing pathway',
    nameZh: '胞质 DNA 感知通路',
    category: '免疫系统 · 固有免疫识别',
    description:
      '胞质中出现双链 DNA（病原体、肿瘤或自身泄漏）是危险信号。cGAS（MB21D1）识别 dsDNA 后催化 ATP 与 GTP 合成非经典环二核苷酸 2\'3\'-cGAMP——哺乳动物第一个被鉴定的第二信使环二核苷酸；cGAMP 作为内体信使直接结合 STING（TMEM173），诱导其从 ER 高尔基体转位并招募 TBK1/IKKε。TBK1 磷酸化 IRF3（Ser386）驱动 I 型干扰素（IFN-α/β）转录，IKK 复合体释放 NF-κB 产生 IL-6 与趋化因子。负调控层：TREX1/DNASE2 栞酸外切酶清除胞质 DNA（AGS 自身免疫病相关），ADAR/SAMHD1 抑制感应过度激活。炎症小体支路（AIM2→CASP1→GSDMD 焦亡）与 ZBP1-RIPK3 坏死性凋亡在此汇合。',
    descriptionEn:
      'Double-stranded DNA appearing in the cytosol — from pathogens, tumours or self-leakage — is a danger signal. Upon sensing dsDNA, cGAS (MB21D1) catalyses ATP and GTP into the non-canonical cyclic dinucleotide 2\'3\'-cGAMP, the first mammalian second messenger of its class; cGAMP acts as an endogenous messenger that binds STING (TMEM173), triggering its translocation from the ER-Golgi and recruitment of TBK1/IKKε. TBK1 phosphorylates IRF3 (Ser386) to drive type-I interferon (IFN-α/β) transcription while the IKK complex releases NF-κB for IL-6 and chemokines. Negative control: TREX1/DNASE2 exonucleases clear cytosolic DNA (Aicardi-Goutières syndrome), and ADAR/SAMHD1 dampen overactivation. The inflammasome arm (AIM2→CASP1→GSDMD pyroptosis) and ZBP1-RIPK3 necroptosis converge here.',
    cascade: 'dsDNA → cGAS → cGAMP → STING → TBK1 → IRF3 → IFN-β ∥ NF-κB → IL-6',
    cascadeEn: 'dsDNA → cGAS → cGAMP → STING → TBK1 → IRF3 → IFN-β ∥ NF-κB → IL-6',
    seeds: [
      'CGAS', 'C00039', 'C20640', 'STING1', 'TMEM173', 'TBK1', 'IKBKE', 'IRF3',
      'IRF7', 'IFNB1', 'IFNA1', 'NFKB1', 'NFKBIA', 'CHUK', 'RIPK1', 'ZBP1',
      'RIPK3', 'MLKL', 'RIGI', 'MAVS', 'DDX41', 'IFI16', 'AIM2', 'NLRP3',
      'CASP1', 'CASP3', 'CASP8', 'GSDMD', 'GSDME', 'IL1B', 'IL18', 'IL33',
      'IL6', 'CCL5', 'CXCL10', 'DNASE2', 'TREX1', 'SAMHD1', 'ADAR', 'MEFV',
    ],
    syntheticLigands: [
      // dsDNA 胞质泄漏模拟（病原/肿瘤来源）—— 与图中 C00039 化合物节点合并为可注入配体
      { symbol: 'dsDNA', fullName: '双链DNA (dsDNA)', receptor: 'CGAS' },
    ],
  },
  {
    id: 'hsa04071',
    name: 'Sphingolipid signaling pathway',
    nameZh: '鞘脂信号通路',
    category: '环境信息处理 · 信号转导',
    description:
      '鞘脂代谢物构成"稳衡天平"：促凋亡的神经酰胺（Ceramide，TNF/Fas 经 NSMAF/SMPD 神经鞘磷脂酶水解释放）与促存活的鞘氨醇-1-磷酸（S1P，SPHK 磷酸化生成且可分泌至胞外）。Ceramide 激活 CTSD（组织蛋白酶 D）、ASK1→JNK/p38 应激轴与非典型 PKCζ，驱动 BID/BAX 线粒体凋亡；S1P 出胞后经五亚型 GPCR（S1PR1-5）反向信号——S1PR1-Gi 促内皮迁移与血管屏障（移植抗排药芬戈莫德即 S1PR1 拮抗剂）、S1PR2/3-Gq/G13 激活 Rho-ROCK 与 PLC。两极互相制衡：MAPK 促 SPHK、Ceramide 抑制 AKT。膜的"鞘脂-胆固醇微结构域"也由此调控受体组装，是脂质第二信使的教学范例。',
    descriptionEn:
      'Sphingolipid metabolites form a rheostat: pro-apoptotic ceramide (released by TNF/Fas via NSMAF/SMPD sphingomyelinases) versus pro-survival sphingosine-1-phosphate (S1P, generated by SPHK phosphorylation and secreted extracellularly). Ceramide activates cathepsin D (CTSD), the ASK1→JNK/p38 stress axis and atypical PKCζ, driving BID/BAX mitochondrial apoptosis; once outside the cell, S1P signals back through five GPCR subtypes (S1PR1-5) — S1PR1-Gi promotes endothelial migration and vascular barrier (the transplant-rejection drug fingolimod is an S1PR1 antagonist) while S1PR2/3-Gq/G13 engage Rho-ROCK and PLC. The two poles cross-antagonize: MAPK promotes SPHK, whereas ceramide inhibits AKT. Sphingolipid-cholesterol membrane microdomains also regulate receptor assembly — a textbook case of lipid second messengers.',
    cascade: 'TNF → SMPD → Ceramide → ASK1-JNK/BAX 凋亡 ∥ SPHK → S1P → S1PR1-5 → RAS/RHOA 存活迁移',
    cascadeEn: 'TNF → SMPD → Ceramide → ASK1-JNK/BAX apoptosis ∥ SPHK → S1P → S1PR1-5 → RAS/RHOA survival/migration',
    seeds: [
      'TNF', 'TNFRSF1A', 'NSMAF', 'SMPD2', 'C00195', 'CTSD', 'BID', 'BAX',
      'MAP3K5', 'MAPK8', 'MAPK14', 'PRKCZ', 'PPP2R3B', 'AKT3', 'BCL2', 'TP53',
      'S1P', 'S1PR1', 'S1PR2', 'S1PR3', 'S1PR4', 'S1PR5', 'GNAI1', 'GNAQ',
      'GNA13', 'HRAS', 'RAF1', 'MAP2K1', 'MAPK1', 'SPHK2', 'PLD1', 'PRKCE',
      'PLCB1', 'IP₃', 'DAG', 'PRKCA', 'RHOA', 'ROCK1', 'PTEN', 'NFKB1', 'PDPK1',
      'PIP₃', 'P3R3URF-PIK3R3', 'RAC1', 'FYN', 'GAB2', 'FCER1A', 'ADORA1', 'KNG1',
      'SMPD1', 'ORMDL2', 'SPTLC1', 'NOS3', 'NO',
    ],
    syntheticLigands: [
      // S1P：分泌型生物活性脂质配体 —— 与图中 S1P 化合物节点合并为可注入配体
      { symbol: 'S1P', fullName: '鞘氨醇-1-磷酸 (Sphingosine-1-phosphate)', receptor: 'S1PR1' },
    ],
  },
  {
    id: 'hsa04621',
    name: 'NOD-like receptor signaling pathway',
    nameZh: 'NOD 样受体信号通路',
    category: '免疫系统 · 固有免疫识别',
    description:
      'NOD 样受体（NLR）是胞质模式识别受体大家族。识肽支路：NOD2 识别细菌胞壁酰二肽（MDP）→ RIPK2 支架招募 TAB/TAK1 与 IKK 复合体 → NF-κB/AP-1 双线驱动 IL-1β/IL-6/TNF/趋化因子，并交叉激活自噬（ATG16L1 复合体）；克罗恩病关联的 NOD2 错义突变即此支路缺陷。炎症小体支路：NLRP3 整合多种危险信号（ATP-P2RX7 钾外流、溶酶体 CTSB 泄漏、ROS-TXNIP、NEK7 伴侣），寡聚化招募 PYCARD 拼接体 → CASP1 自剪切 → 成熟 IL-1β/IL-18 分泌 + GSDMD 打孔焦亡（familial cold autoinflammatory 综合征即 NLRP3 功能获得突变）。NLRC4/NAIP 识别鞭毛蛋白/PrgJ，AIM2 感知胞质 dsDNA——与 cGAS-STING 通路在感染免疫中交汇。',
    descriptionEn:
      'NOD-like receptors (NLRs) are a large family of cytosolic pattern-recognition receptors. The peptidoglycan arm: NOD2 senses bacterial muramyl dipeptide (MDP) → the RIPK2 scaffold recruits TAB/TAK1 and the IKK complex → NF-κB and AP-1 jointly drive IL-1β, IL-6, TNF and chemokines, with crosstalk to autophagy (the ATG16L1 complex); Crohn-associated NOD2 missense mutations cripple this arm. The inflammasome arm: NLRP3 integrates diverse danger signals (ATP-P2RX7 potassium efflux, lysosomal CTSB leakage, ROS-TXNIP, NEK7 co-factor), oligomerizes and recruits the PYCARD speck → CASP1 autocleavage → mature IL-1β/IL-18 secretion plus GSDMD pore-mediated pyroptosis (gain-of-function NLRP3 mutations cause familial cold autoinflammatory syndrome). NLRC4/NAIP sense flagellin/PrgJ while AIM2 recognizes cytosolic dsDNA — converging with cGAS-STING in infection immunity.',
    cascade: 'MDP → NOD2 → RIPK2 → TAK1/IKK → NF-κB → IL-1β/IL-6 ∥ ATP → P2RX7 → NLRP3 炎症小体 → CASP1 → 焦亡',
    cascadeEn: 'MDP → NOD2 → RIPK2 → TAK1/IKK → NF-κB → IL-1β/IL-6 ∥ ATP → P2RX7 → NLRP3 inflammasome → CASP1 → pyroptosis',
    seeds: [
      'NOD2', 'NOD1', 'RIPK2', 'IKBKG', 'CHUK', 'NFKBIA', 'NFKB1', 'MAP3K7',
      'TAB1', 'TAB2', 'TAB3', 'MAPK1', 'MAPK8', 'MAPK14', 'JUN', 'IL1B', 'IL18',
      'IL6', 'TNF', 'CXCL8', 'CCL2', 'CCL5', 'NLRP3', 'PYCARD', 'CASP1', 'CASP4',
      'CASP5', 'GSDMD', 'NLRC4', 'NAIP', 'NLRP1', 'NLRP6', 'NLRP7', 'NLRP12',
      'AIM2', 'IFI16', 'MEFV', 'PSTPIP1', 'CARD8', 'SUGT1', 'HSP90AA1', 'ATP',
      'P2RX7', 'Ca²⁺', 'CTSB', 'TXNIP', 'TXN2', 'NEK7', 'GPRC6A', 'PLCB1',
      'IP₃', 'ITPR1', 'ATG16L1', 'ATG5', 'ATG12', 'GABARAP', 'MAVS', 'TRAF3',
      'IKBKE', 'TBK1', 'IRF3', 'IFNA1', 'XIAP', 'BIRC2', 'ERBIN', 'NLRX1',
      'CYBB', 'CYBA', 'RIPK3', 'DNM1L', 'CASP8', 'FADD', 'PRKCD', 'CARD9',
      'TRAF2', 'TNFAIP3', 'IRAK4', 'TRAF6',
    ],
    syntheticLigands: [
      // MDP（胞壁酰二肽）：NOD2 的经典配体 —— 细菌肽聚糖胞内片段，KGML 图中无此节点
      { symbol: 'MDP', fullName: '胞壁酰二肽 (Muramyl dipeptide)', receptor: 'NOD2' },
    ],
  },
];

/** 按 id 索引 */
export const PATHWAY_MAP = new Map(PATHWAY_CATALOG.map((p) => [p.id, p]));
