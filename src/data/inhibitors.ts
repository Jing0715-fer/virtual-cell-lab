/**
 * 药理学扰动库 —— 激酶/酶抑制剂（信号扰动实验用）
 * 数据依据: FDA 批准药物标签 / 临床试验登记 / 标准生化工具化合物文献
 * 匹配规则: targets 为基因符号（node id / label），与当前通路核心子图求交集，
 *           至少命中 1 个靶点才在药理面板中显示（避免无关药物噪音）。
 */
export type DrugSource = 'fda' | 'trial' | 'tool';

export interface InhibitorSpec {
  id: string;
  /** 通用名（中文） */
  name: string;
  /** 英文/代码名 */
  code: string;
  /** 靶点基因符号（node id 或 label 匹配） */
  targets: string[];
  /** 药物类别 */
  drugClass: string;
  /** 药物类别（英文） */
  drugClassEn: string;
  /** 分子机制（精确到结构域/残基级别） */
  mechanism: string;
  /** 分子机制（英文） */
  mechanismEn: string;
  source: DrugSource;
  /** 适应症/用途 */
  indication: string;
  /** 适应症/用途（英文） */
  indicationEn: string;
}

export const DRUG_SOURCE_ZH: Record<DrugSource, string> = {
  fda: 'FDA 批准',
  trial: '临床研究',
  tool: '工具化合物',
};

export const DRUG_SOURCE_EN: Record<DrugSource, string> = {
  fda: 'FDA-approved',
  trial: 'Clinical trial',
  tool: 'Tool compound',
};

export const INHIBITORS: InhibitorSpec[] = [
  // ============ MAPK 通路 (hsa04010) ============
  {
    id: 'trametinib',
    name: '曲美替尼',
    code: 'Trametinib · GSK1120212',
    targets: ['MAP2K1', 'MAP2K2'],
    drugClass: 'MEK 别构抑制剂',
    drugClassEn: 'Allosteric MEK inhibitor',
    mechanism: '别构结合 MEK1/2 激酶域邻近的疏水口袋（非 ATP 位点），稳定无活性构象——上游 RAF 照常磷酸化 MEK（pMEK 累积），但催化输出被钳制，ERK1/2 双磷酸化（T185/Y187）阻断。',
    mechanismEn:
      'Allosterically binds a hydrophobic pocket adjacent to the MEK1/2 kinase domain (not the ATP site), stabilizing the inactive conformation — upstream RAF still phosphorylates MEK (pMEK accumulates), but catalytic output is clamped and ERK1/2 dual phosphorylation (T185/Y187) is blocked.',
    source: 'fda',
    indication: 'BRAF V600 突变黑色素瘤',
    indicationEn: 'BRAF V600-mutant melanoma',
  },
  {
    id: 'erlotinib',
    name: '厄洛替尼',
    code: 'Erlotinib · OSI-774',
    targets: ['EGFR'],
    drugClass: 'EGFR TKI（ATP 竞争）',
    drugClassEn: 'EGFR TKI (ATP-competitive)',
    mechanism: '竞争性占据 EGFR 胞内激酶域 ATP 口袋，阻断配体诱导的二聚体反式自磷酸化——pY1068 等 GRB2 募集位点失效，RAS 级联上游断流。',
    mechanismEn:
      'Competitively occupies the ATP pocket of the EGFR intracellular kinase domain, blocking ligand-induced trans-autophosphorylation of the dimer — GRB2-recruitment sites such as pY1068 are disabled, cutting off the RAS cascade upstream.',
    source: 'fda',
    indication: '非小细胞肺癌 / 胰腺癌',
    indicationEn: 'Non-small-cell lung cancer / pancreatic cancer',
  },
  {
    id: 'vemurafenib',
    name: '维罗非尼',
    code: 'Vemurafenib · PLX4032',
    targets: ['BRAF'],
    drugClass: 'RAF 抑制剂（V600E 选择性）',
    drugClassEn: 'RAF inhibitor (V600E-selective)',
    mechanism: '选择性结合 BRAF V600E 激酶域（ATP 竞争）。注意经典悖论：在野生型 RAF 细胞中，RAF 抑制剂诱导 RAF 二聚体反常激活 ERC 通路（paradoxical activation）。',
    mechanismEn:
      'Selectively binds the BRAF V600E kinase domain (ATP-competitive). Note the classic paradox: in wild-type RAF cells, RAF inhibitors induce RAF dimerization and paradoxical activation of the ERK pathway.',
    source: 'fda',
    indication: 'BRAF V600E 黑色素瘤',
    indicationEn: 'BRAF V600E melanoma',
  },
  {
    id: 'sch772984',
    name: 'SCH772984',
    code: 'SCH772984',
    targets: ['MAPK1', 'MAPK3'],
    drugClass: 'ERK 别构抑制剂',
    drugClassEn: 'Allosteric ERK inhibitor',
    mechanism: 'ERK1/2 双机制抑制剂：既竞争 ATP 位点又别构诱导激酶域构象变化；阻断终端 ERK 输出后，负反馈（DUSP/MKP）解除，上游 MEK 出现代偿性超磷酸化。',
    mechanismEn:
      'A dual-mechanism ERK1/2 inhibitor: competes at the ATP site and allosterically reshapes the kinase domain; once terminal ERK output is blocked, DUSP/MKP negative feedback is released and upstream MEK shows compensatory hyperphosphorylation.',
    source: 'tool',
    indication: '实验室研究用',
    indicationEn: 'For laboratory research use',
  },
  // ============ PI3K-Akt / mTOR (hsa04151 / hsa04150) ============
  {
    id: 'alpelisib',
    name: '阿培利司',
    code: 'Alpelisib · BYL719',
    targets: ['PIK3CA'],
    drugClass: 'PI3Kα 选择性抑制剂',
    drugClassEn: 'PI3Kα-selective inhibitor',
    mechanism: 'p110α 催化亚基 ATP 位点竞争抑制剂（p110α/p110δ 选择比 >50×）——PIP2→PIP3 磷酸化阻断，Akt 膜募集与 Thr308 磷酸化失效。',
    mechanismEn:
      'Competitive inhibitor at the ATP site of the p110α catalytic subunit (>50× selectivity of p110α over p110δ) — PIP2→PIP3 phosphorylation is blocked, disabling Akt membrane recruitment and Thr308 phosphorylation.',
    source: 'fda',
    indication: 'PIK3CA 突变 HR+/HER2- 乳腺癌',
    indicationEn: 'PIK3CA-mutant HR+/HER2− breast cancer',
  },
  {
    id: 'mk2206',
    name: 'MK-2206',
    code: 'MK-2206',
    targets: ['AKT1', 'AKT2'],
    drugClass: 'Akt 别构抑制剂',
    drugClassEn: 'Allosteric Akt inhibitor',
    mechanism: '结合 Akt PH 域与激酶域间别构口袋，阻断 PIP3 介导的膜转位——PDK1 无法接近 Thr308，TSC2/FoxO 磷酸化下游全部断流。',
    mechanismEn:
      'Binds an allosteric pocket between the Akt PH domain and the kinase domain, blocking PIP3-mediated membrane translocation — PDK1 can no longer reach Thr308, shutting off all downstream TSC2/FoxO phosphorylation.',
    source: 'trial',
    indication: '多项实体瘤临床试验',
    indicationEn: 'Clinical trials across multiple solid tumors',
  },
  {
    id: 'rapamycin',
    name: '雷帕霉素',
    code: 'Rapamycin · Sirolimus',
    targets: ['MTOR'],
    drugClass: 'mTORC1 别构抑制剂',
    drugClassEn: 'Allosteric mTORC1 inhibitor',
    mechanism: '与 FKBP12 形成三元复合物结合 mTORC1 的 FRB 域（对 mTORC2 无效）——S6K1/4E-BP1 磷酸化被选择性阻断，帽依赖翻译受抑。',
    mechanismEn:
      'Forms a ternary complex with FKBP12 that binds the FRB domain of mTORC1 (ineffective against mTORC2) — S6K1/4E-BP1 phosphorylation is selectively blocked, suppressing cap-dependent translation.',
    source: 'fda',
    indication: '免疫抑制 / 抗增殖涂层支架',
    indicationEn: 'Immunosuppression / anti-proliferative drug-eluting stents',
  },
  // ============ AMPK (hsa04152) ============
  {
    id: 'compoundc',
    name: 'Compound C',
    code: 'Dorsomorphin',
    targets: ['PRKAA1', 'PRKAA2'],
    drugClass: 'AMPK 抑制剂（工具）',
    drugClassEn: 'AMPK inhibitor (tool compound)',
    mechanism: 'AMPK α 催化亚基 ATP 位点竞争抑制剂（注意脱靶：也抑制 BMP 信号通路），常用于反向验证 AMPK 依赖性表型。',
    mechanismEn:
      'Competitive inhibitor at the ATP site of the AMPKα catalytic subunit (off-target caveat: also inhibits BMP signaling); commonly used to verify AMPK-dependent phenotypes in reverse.',
    source: 'tool',
    indication: '实验室研究用',
    indicationEn: 'For laboratory research use',
  },
  // ============ Wnt (hsa04310) ============
  {
    id: 'icg001',
    name: 'ICG-001',
    code: 'ICG-001 · PRI-724 前体',
    targets: ['CTNNB1'],
    drugClass: 'β-catenin/CBP 转录抑制剂',
    drugClassEn: 'β-catenin/CBP transcriptional inhibitor',
    mechanism: '竞争性破坏 β-catenin 与 CBP（CREB 结合蛋白）的转录共激活互作——选择阻断 Wnt 靶基因（MYC/Cyclin D1）而不影响 β-catenin/p300 分支。',
    mechanismEn:
      'Competitively disrupts the transcriptional coactivator interaction between β-catenin and CBP (CREB-binding protein) — selectively blocks Wnt target genes (MYC/Cyclin D1) without affecting the β-catenin/p300 branch.',
    source: 'trial',
    indication: '骨髓纤维化等临床试验',
    indicationEn: 'Clinical trials in myelofibrosis and other indications',
  },
  // ============ Notch (hsa04330) ============
  {
    id: 'dapt',
    name: 'DAPT',
    code: 'DAPT · GSI-IX',
    targets: ['PSEN1', 'PSEN2'],
    drugClass: 'γ-分泌酶抑制剂（GSI）',
    drugClassEn: 'γ-secretase inhibitor (GSI)',
    mechanism: '结合 γ-分泌酶复合体（Presenilin 催化核心）的活性位点，阻断 Notch 受体 S3 剪切——NICD（Notch 胞内段）无法释放入核，RBPJ 转录开关关闭。',
    mechanismEn:
      'Binds the active site of the γ-secretase complex (Presenilin catalytic core), blocking S3 cleavage of Notch receptors — NICD (the Notch intracellular domain) cannot be released into the nucleus, switching off the RBPJ transcriptional program.',
    source: 'tool',
    indication: '实验室研究用（AD 模型亦用）',
    indicationEn: 'For laboratory research (also used in AD models)',
  },
  // ============ TGF-β (hsa04350) ============
  {
    id: 'galunisertib',
    name: '加尼西替尼',
    code: 'Galunisertib · LY2157299',
    targets: ['TGFBR1'],
    drugClass: 'TGFβRI (ALK5) 抑制剂',
    drugClassEn: 'TGFβRI (ALK5) inhibitor',
    mechanism: 'TGFβRI 激酶域 ATP 竞争抑制剂——SMAD2/3 的 C 末端 SSXS 基序磷酸化被阻断，上皮-间质转化（EMT）程序下调。',
    mechanismEn:
      'ATP-competitive inhibitor of the TGFβRI kinase domain — phosphorylation of the SMAD2/3 C-terminal SSXS motif is blocked, downregulating the epithelial–mesenchymal transition (EMT) program.',
    source: 'trial',
    indication: '实体瘤/骨髓增生异常临床试验',
    indicationEn: 'Clinical trials in solid tumors / myelodysplastic syndromes',
  },
  // ============ NF-κB (hsa04064) ============
  {
    id: 'bay117082',
    name: 'BAY 11-7082',
    code: 'BAY 11-7082',
    targets: ['IKBKB'],
    drugClass: 'IKKβ 不可逆抑制剂',
    drugClassEn: 'Irreversible IKKβ inhibitor',
    mechanism: '共价修饰 IKKβ 激活环 Cys 残基——IκBα Ser32/36 磷酸化终止，泛素-蛋白酶体降解受阻，NF-κB 二聚体滞留胞质。',
    mechanismEn:
      'Covalently modifies a Cys residue in the IKKβ activation loop — IκBα Ser32/36 phosphorylation stops, ubiquitin–proteasome degradation is prevented, and NF-κB dimers are retained in the cytoplasm.',
    source: 'tool',
    indication: '实验室研究用',
    indicationEn: 'For laboratory research use',
  },
  // ============ 凋亡 (hsa04210) ============
  {
    id: 'venetoclax',
    name: '维奈克拉',
    code: 'Venetoclax · ABT-199',
    targets: ['BCL2'],
    drugClass: 'BH3 模拟物',
    drugClassEn: 'BH3 mimetic',
    mechanism: '模拟 BH3-only 蛋白的 α-螺旋基序，选择性占据 BCL-2 疏水沟（BH1-3 域），置换 BIM/BAX 启动线粒体外膜透化（MOMP）与 caspase-9 级联。',
    mechanismEn:
      'Mimics the α-helical BH3 motif of BH3-only proteins, selectively occupying the BCL-2 hydrophobic groove (BH1–3 domains) to displace BIM/BAX, initiating mitochondrial outer-membrane permeabilization (MOMP) and the caspase-9 cascade.',
    source: 'fda',
    indication: '慢性淋巴细胞白血病 / AML',
    indicationEn: 'Chronic lymphocytic leukemia / AML',
  },
  {
    id: 'zvad',
    name: 'Z-VAD-FMK',
    code: 'Z-Val-Ala-Asp-FMK',
    targets: ['CASP3', 'CASP8', 'CASP9'],
    drugClass: '广谱 caspase 抑制剂',
    drugClassEn: 'Pan-caspase inhibitor',
    mechanism: '不可逆肽基甲基酮，共价占据 caspase 催化 Cys 残基——执行 caspase-3 的底物剪切（PARP/lamin）被完全阻断。',
    mechanismEn:
      'An irreversible peptidyl methyl ketone that covalently occupies the catalytic Cys of caspases — substrate cleavage by executioner caspase-3 (PARP/lamin) is fully blocked.',
    source: 'tool',
    indication: '实验室研究用',
    indicationEn: 'For laboratory research use',
  },
  // ============ p53 (hsa04115) ============
  {
    id: 'nutlin3',
    name: 'Nutlin-3',
    code: 'Nutlin-3a',
    targets: ['MDM2'],
    drugClass: 'MDM2-p53 破坏剂',
    drugClassEn: 'MDM2–p53 disruptor',
    mechanism: '占据 MDM2 的 p53 结合疏水沟（阻断 p53 Trp23 口袋互作）——p53 泛素化终止并稳定积累，p21/PUMA 转录程序激活。注意：这是"抑制负调控子=激活通路"的药理学案例。',
    mechanismEn:
      'Occupies the p53-binding hydrophobic groove of MDM2 (blocking the p53 Trp23 pocket interaction) — p53 ubiquitination stops and p53 accumulates stably, activating the p21/PUMA transcriptional program. Note: a pharmacological case of "inhibiting a negative regulator = activating the pathway".',
    source: 'tool',
    indication: '实验室研究用（RV-Xon 公司开发中）',
    indicationEn: 'For laboratory research use (under development by RV-Xon)',
  },
  // ============ JAK-STAT (hsa04630) ============
  {
    id: 'ruxolitinib',
    name: '鲁索替尼',
    code: 'Ruxolitinib · INCB018424',
    targets: ['JAK1', 'JAK2'],
    drugClass: 'JAK1/2 抑制剂',
    drugClassEn: 'JAK1/2 inhibitor',
    mechanism: 'JAK1/2 激酶域 ATP 竞争抑制剂——受体关联 JAK 的 STAT 磷酸化（Tyr703/705）被阻断，STAT 二聚体无法形成，转录输出归零。',
    mechanismEn:
      'ATP-competitive inhibitor of the JAK1/2 kinase domain — STAT phosphorylation by receptor-associated JAKs (Tyr703/705) is blocked, STAT dimers cannot form, and transcriptional output drops to zero.',
    source: 'fda',
    indication: '骨髓纤维化 / 真性红细胞增多症',
    indicationEn: 'Myelofibrosis / polycythemia vera',
  },
  // ============ cAMP (hsa04022) ============
  {
    id: 'h89',
    name: 'H-89',
    code: 'H-89 dihydrochloride',
    targets: ['PRKACA', 'PRKACB'],
    drugClass: 'PKA 催化亚基抑制剂',
    drugClassEn: 'PKA catalytic subunit inhibitor',
    mechanism: 'PKA 催化亚基 ATP 口袋竞争抑制剂——CREB Ser133 磷酸化受阻，cAMP 反应元件（CRE）依赖转录关闭（注意脱靶：对 ROCK/MSK 亦有弱活性）。',
    mechanismEn:
      'Competitive inhibitor at the ATP pocket of the PKA catalytic subunit — CREB Ser133 phosphorylation is prevented and cAMP-response-element (CRE)-dependent transcription shuts down (off-target caveat: weak activity against ROCK/MSK).',
    source: 'tool',
    indication: '实验室研究用',
    indicationEn: 'For laboratory research use',
  },
  // ============ Ca²⁺ 信号 (hsa04020) ============
  {
    id: 'cyclosporine',
    name: '环孢素 A',
    code: 'Cyclosporin A · CsA',
    targets: ['PPP3CA', 'PPP3CB'],
    drugClass: '钙调磷酸酶抑制剂',
    drugClassEn: 'Calcineurin inhibitor',
    mechanism: '与亲环蛋白（Cyclophilin）形成复合物结合钙调磷酸酶催化亚基（PP2B/PPP3C）——NFAT 的 SRR1/SPRIIIT 去磷酸化被阻断，T 细胞激活基因（IL-2）转录关闭。',
    mechanismEn:
      'Forms a complex with cyclophilin that binds the calcineurin catalytic subunit (PP2B/PPP3C) — dephosphorylation of the NFAT SRR1/SPRIIIT motifs is blocked, switching off transcription of T-cell activation genes (IL-2).',
    source: 'fda',
    indication: '器官移植抗排斥',
    indicationEn: 'Anti-rejection prophylaxis in organ transplantation',
  },
  {
    id: 'kn93',
    name: 'KN-93',
    code: 'KN-93',
    targets: ['CAMK2A', 'CAMK2B', 'CAMK2G', 'CAMK2D'],
    drugClass: 'CaMKII 抑制剂',
    drugClassEn: 'CaMKII inhibitor',
    mechanism: '模拟 CaMKII 自抑制结构域，结合 Ca²⁺/CaM 结合位点邻近别构口袋——Thr286 自磷酸化与持续活性（autonomous activity）被阻断。',
    mechanismEn:
      'Mimics the CaMKII autoinhibitory domain, binding an allosteric pocket adjacent to the Ca²⁺/CaM binding site — Thr286 autophosphorylation and autonomous activity are blocked.',
    source: 'tool',
    indication: '实验室研究用',
    indicationEn: 'For laboratory research use',
  },
];
