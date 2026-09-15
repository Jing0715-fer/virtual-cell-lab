/**
 * 虚拟细胞系定义（7 种细胞类型）
 * 形态学与分子生物学参数参照标准细胞生物学教材（Alberts MBoC / Ross 组织学）
 */

export type MorphologyKey =
  | 'hepatocyte' // 肝细胞 — 大圆形，可有双核
  | 'neuron' // 神经元 — 胞体 + 树突/轴突
  | 'tcell' // T 淋巴细胞 — 小圆形，微绒毛，高核质比
  | 'epithelial' // 上皮细胞 — 柱状，微绒毛顶面，基底面
  | 'cardiomyocyte' // 心肌细胞 — 长条形，横纹，闰盘
  | 'fibroblast' // 成纤维细胞 — 梭形
  | 'cancer'; // 癌细胞 — 不规则，多核，出芽

export interface CellMutation {
  node: string; // 目标分子（CoreNode id）
  effect: 'constitutive' | 'knockout' | 'overexpress';
  note: string; // 分子病理学说明
  noteEn: string; // Molecular pathology note (English)
}

export interface CellFeature {
  label: string;
  value: string;
  labelEn: string;
  valueEn: string;
}

export interface CellType {
  id: string;
  name: string;
  nameEn: string;
  tagline: string;
  taglineEn: string;
  description: string;
  descriptionEn: string;
  morphology: MorphologyKey;
  diameter: string;
  diameterEn: string;
  nucleusNote: string;
  nucleusNoteEn: string;
  receptors: string[]; // 膜受体（基因符号）
  pathways: string[]; // KEGG pathway ids
  responsiveLigands: string[]; // 响应配体
  features: CellFeature[];
  mutations?: CellMutation[];
  disease?: string;
  diseaseEn?: string;
  tint: [string, string]; // 胞质渐变 [inner, outer]
  marker: string; // 标志分子
}

export const CELL_TYPES: CellType[] = [
  {
    id: 'hepatocyte',
    name: '肝细胞',
    nameEn: 'Hepatocyte',
    tagline: '机体代谢中枢 · 再生能力强',
    taglineEn: 'Metabolic hub of the body · High regenerative capacity',
    description:
      '肝细胞占肝实质细胞 80%，是体内代谢最活跃的细胞之一：糖原合成/分解、脂肪酸 β-氧化、尿素循环、白蛋白与凝血因子合成均在肝细胞完成。其顶面形成微胆管结构，基底面朝肝血窦；约 25% 肝细胞为双核，线粒体含量丰富（每细胞 1000–2000 个）。EGF/HGF 驱动的 MAPK 与 PI3K-Akt 通路介导肝再生（部分肝切除后 2 周内恢复原体积）；AMPK 传感营养状态调控脂代谢。',
    descriptionEn:
      'Hepatocytes account for ~80% of liver parenchymal cells and are among the most metabolically active cells in the body: glycogen synthesis/breakdown, fatty-acid β-oxidation, the urea cycle, and synthesis of albumin and clotting factors all take place here. The apical surface forms bile canaliculi while the basal surface faces the hepatic sinusoids; ~25% of hepatocytes are binucleate and mitochondria are abundant (1,000–2,000 per cell). EGF/HGF-driven MAPK and PI3K-Akt pathways mediate liver regeneration (original volume restored within 2 weeks after partial hepatectomy); AMPK senses nutrient status to regulate lipid metabolism.',
    morphology: 'hepatocyte',
    diameter: '20–30 μm',
    diameterEn: '20–30 μm',
    nucleusNote: '1–2 个圆形大核，核仁明显；约 25% 双核',
    nucleusNoteEn: '1–2 large round nuclei with prominent nucleoli; ~25% binucleate',
    receptors: ['EGFR', 'MET', 'IGF1R', 'INSR', 'TGFBR2', 'ADRB2'],
    pathways: ['hsa04010', 'hsa04151', 'hsa04152', 'hsa04350', 'hsa04068'],
    responsiveLigands: ['EGF', 'IGF1', 'INS', 'TGFB1'],
    features: [
      { label: '线粒体', value: '1000–2000 个/细胞', labelEn: 'Mitochondria', valueEn: '1,000–2,000 per cell' },
      { label: '粗面内质网', value: '丰富（白蛋白合成）', labelEn: 'Rough ER', valueEn: 'Abundant (albumin synthesis)' },
      { label: '过氧化物酶体', value: '丰富（极长链脂肪酸氧化）', labelEn: 'Peroxisomes', valueEn: 'Abundant (very-long-chain fatty-acid oxidation)' },
      { label: '糖原', value: '餐后可达胞质 8% 体积', labelEn: 'Glycogen', valueEn: 'Up to 8% of cytoplasmic volume postprandially' },
      { label: '标志分子', value: 'ALB / AFP（肝癌时重现）', labelEn: 'Marker molecules', valueEn: 'ALB / AFP (AFP re-emerges in HCC)' },
    ],
    tint: ['#134e4a', '#052e2b'],
    marker: 'ALB',
  },
  {
    id: 'neuron',
    name: '锥体神经元',
    nameEn: 'Pyramidal Neuron',
    tagline: '电兴奋 · 突触可塑性 · 长时程记忆',
    taglineEn: 'Electrically excitable · Synaptic plasticity · Long-term memory',
    description:
      '大脑皮层锥体神经元是主要的投射神经元，胞体呈三角锥形，顶端树突伸向皮层表面，基底树突横向展开。突触后谷氨酸受体（NMDA/AMPA）激活导致 Ca²⁺ 内流，经 CaMKII 自主磷酸化（LTP 分子开关）与 Calcineurin（LTD）双向调控突触强度；去甲肾上腺素经 β-AR → cAMP → PKA → CREB 通路启动即早基因（c-FOS、Arc）转录，固化长时记忆。BDNF/TrkB-MAPK 通路支持神经元存活与树突生长。',
    descriptionEn:
      'Cortical pyramidal neurons are the principal projection neurons: the soma is triangular-pyramidal, with an apical dendrite reaching toward the cortical surface and basal dendrites spreading laterally. Activation of postsynaptic glutamate receptors (NMDA/AMPA) allows Ca²⁺ influx, bidirectionally tuning synaptic strength via CaMKII autophosphorylation (the LTP molecular switch) and Calcineurin (LTD). Norepinephrine acts through β-AR → cAMP → PKA → CREB to trigger immediate-early gene transcription (c-FOS, Arc) that consolidates long-term memory. The BDNF/TrkB-MAPK pathway supports neuronal survival and dendritic growth.',
    morphology: 'neuron',
    diameter: '胞体 10–50 μm，轴突可 >1 m',
    diameterEn: 'Soma 10–50 μm; axon can exceed 1 m',
    nucleusNote: '单个大核，核仁明显，异染色质少（高转录活性）',
    nucleusNoteEn: 'Single large nucleus, prominent nucleolus, sparse heterochromatin (high transcriptional activity)',
    receptors: ['NTRK2', 'ADRB2', 'GRIA1', 'PLCB2'],
    pathways: ['hsa04020', 'hsa04024', 'hsa04010'],
    responsiveLigands: ['EPI', 'ACh', 'BDNF'],
    features: [
      { label: '突触数', value: '皮层锥体细胞 ~10⁴', labelEn: 'Synapses', valueEn: '~10⁴ per cortical pyramidal cell' },
      { label: '静息电位', value: '−70 mV（K⁺ 梯度主导）', labelEn: 'Resting potential', valueEn: '−70 mV (dominated by the K⁺ gradient)' },
      { label: '动作电位', value: 'Na⁺ 内流上升支 / K⁺ 外流复极', labelEn: 'Action potential', valueEn: 'Na⁺ influx upstroke / K⁺ efflux repolarization' },
      { label: 'LTP 分子开关', value: 'CaMKII Thr286 自磷酸化', labelEn: 'LTP molecular switch', valueEn: 'CaMKII Thr286 autophosphorylation' },
      { label: '线粒体', value: '密集分布于轴突终末与树突棘', labelEn: 'Mitochondria', valueEn: 'Enriched in axon terminals and dendritic spines' },
    ],
    tint: ['#155e50', '#06302a'],
    marker: 'MAP2 / NeuN',
  },
  {
    id: 'tcell',
    name: 'CD4⁺ T 淋巴细胞',
    nameEn: 'CD4⁺ T Cell (Th)',
    tagline: '适应性免疫指挥官 · IL-2 自分泌增殖',
    taglineEn: 'Commander of adaptive immunity · IL-2 autocrine proliferation',
    description:
      'CD4⁺ T 细胞经 TCR 识别抗原呈递细胞 MHC-II 提呈的肽段。TCR/CD3 信号经 Lck → ZAP70 → LAT 信号体，三路并行：PLCγ1 → IP3 → Ca²⁺ → Calcineurin → NFAT；RasGRP/Ras-MAPK → AP-1；IKK → NF-κB。NFAT·AP-1·NF-κB 三转录因子协同驱动 IL2 转录；IL-2 经 IL2R → JAK1/JAK3 → STAT5 自分泌回路驱动克隆增殖（免疫应答放大的核心）。环孢素抑制 Calcineurin 阻断该通路实现免疫抑制。钙信号持续振荡（NFAT 周期性入核）是 T 细胞激活的特征编码。',
    descriptionEn:
      'CD4⁺ T cells recognize peptide antigens presented on MHC-II by antigen-presenting cells via the TCR. TCR/CD3 signaling proceeds through Lck → ZAP70 → the LAT signalosome and then fans out into three parallel arms: PLCγ1 → IP3 → Ca²⁺ → Calcineurin → NFAT; RasGRP/Ras-MAPK → AP-1; and IKK → NF-κB. NFAT·AP-1·NF-κB cooperate to drive IL2 transcription; IL-2 then feeds an IL2R → JAK1/JAK3 → STAT5 autocrine loop that drives clonal expansion (the core of immune amplification). Cyclosporine blocks this pathway by inhibiting Calcineurin, achieving immunosuppression. Sustained Ca²⁺ oscillations (periodic NFAT nuclear entry) are the signature encoding of T-cell activation.',
    morphology: 'tcell',
    diameter: '6–9 μm（静止态）/ 9–12 μm（母细胞化）',
    diameterEn: '6–9 μm (resting) / 9–12 μm (blast-transformed)',
    nucleusNote: '单个大核占胞质约 80%（高核质比，染色质致密）',
    nucleusNoteEn: 'Single large nucleus filling ~80% of the cell (high N:C ratio, dense chromatin)',
    receptors: ['IL2RB', 'IL2RG', 'IFNGR1', 'PLCB2'],
    pathways: ['hsa04630', 'hsa04020', 'hsa04010', 'hsa04064', 'hsa04110'],
    responsiveLigands: ['IL2', 'IFNG', 'ACh'],
    features: [
      { label: 'TCR 多样性', value: '~10¹⁵ 克隆型（V(D)J 重排）', labelEn: 'TCR diversity', valueEn: '~10¹⁵ clonotypes (V(D)J recombination)' },
      { label: '识别机制', value: 'MHC-II 限制性（CD4 共受体）', labelEn: 'Recognition mode', valueEn: 'MHC-II restricted (CD4 co-receptor)' },
      { label: '效应亚群', value: 'Th1/Th2/Th17/Tfh/Treg', labelEn: 'Effector subsets', valueEn: 'Th1/Th2/Th17/Tfh/Treg' },
      { label: '免疫突触', value: 'TCR 微簇 → cSMAC 中心聚集', labelEn: 'Immunological synapse', valueEn: 'TCR microclusters converge into the central cSMAC' },
      { label: '代谢切换', value: '静息: 脂肪酸氧化 → 激活: 糖酵解', labelEn: 'Metabolic switch', valueEn: 'Resting: fatty-acid oxidation → Activated: glycolysis' },
    ],
    tint: ['#166534', '#052e16'],
    marker: 'CD4 / LCK',
  },
  {
    id: 'epithelial',
    name: '肠上皮细胞',
    nameEn: 'Intestinal Epithelial Cell',
    tagline: '屏障与吸收 · 干性维持 · 5 天更新周期',
    taglineEn: 'Barrier & absorption · Stemness maintenance · 5-day renewal cycle',
    description:
      '小肠上皮细胞单层覆盖隐窝-绒毛轴，顶端密集微绒毛（刷状缘）将吸收面积扩大 ~20 倍。隐窝底 Lgr5⁺ 干细胞经 Wnt/β-catenin 高信号维持干性，向上迁移过程中 Notch 侧抑制决定吸收/分泌谱系分化；Wnt 梯度下降与分化相关。绒毛顶部细胞接触 EGFR 配体（EGF/ amphiregulin）维持修复能力；TGF-β 与 Notch 共同抑制终末分化细胞增殖。整个上皮每 3–5 天完全更新，是体内更新最快的组织之一。',
    descriptionEn:
      'A single layer of small-intestinal epithelial cells lines the crypt–villus axis; dense apical microvilli (the brush border) enlarge the absorptive surface ~20-fold. Lgr5⁺ stem cells at the crypt base maintain stemness through high Wnt/β-catenin signaling, and Notch lateral inhibition during upward migration assigns absorptive versus secretory lineages; the declining Wnt gradient accompanies differentiation. Villus-tip cells receive EGFR ligands (EGF/amphiregulin) to sustain repair capacity, while TGF-β and Notch jointly restrain proliferation of terminally differentiated cells. The entire epithelium renews every 3–5 days — one of the fastest-turning tissues in the body.',
    morphology: 'epithelial',
    diameter: '高 20–25 μm × 宽 8–10 μm（柱状）',
    diameterEn: '20–25 μm tall × 8–10 μm wide (columnar)',
    nucleusNote: '单核，位于基底侧 1/3',
    nucleusNoteEn: 'Single nucleus, positioned in the basal third',
    receptors: ['EGFR', 'FZD7', 'NOTCH1', 'TGFBR2', 'LRP6'],
    pathways: ['hsa04310', 'hsa04330', 'hsa04350', 'hsa04010', 'hsa04390'],
    responsiveLigands: ['WNT3A', 'EGF', 'TGFB1', 'DLL1'],
    features: [
      { label: '微绒毛', value: '~3000 根/细胞，长约 1 μm', labelEn: 'Microvilli', valueEn: '~3,000 per cell, ~1 μm long' },
      { label: '紧密连接', value: 'Claudin/Occludin/ZO-1 组成屏障', labelEn: 'Tight junctions', valueEn: 'Claudin/Occludin/ZO-1 barrier' },
      { label: '更新周期', value: '3–5 天（隐窝→绒毛顶端脱落）', labelEn: 'Renewal cycle', valueEn: '3–5 days (crypt → exfoliation at villus tip)' },
      { label: '干细胞龛', value: 'Lgr5⁺ CBC 细胞，Wnt 高信号', labelEn: 'Stem-cell niche', valueEn: 'Lgr5⁺ crypt-base columnar cells, high Wnt' },
      { label: 'APC 突变', value: '>80% 结肠癌早期事件（Wnt 失控）', labelEn: 'APC mutation', valueEn: '>80% early event in colorectal cancer (runaway Wnt)' },
    ],
    tint: ['#115e59', '#042f2e'],
    marker: 'Villin / EPCAM',
  },
  {
    id: 'cardiomyocyte',
    name: '心肌细胞',
    nameEn: 'Cardiomyocyte',
    tagline: '节律收缩 · β-肾上腺素能调节 · 高线粒体含量',
    taglineEn: 'Rhythmic contraction · β-adrenergic regulation · Mitochondria-rich',
    description:
      '心肌细胞为分支圆柱形，端-端连接处形成闰盘（intercalated disc），含缝隙连接（Connexin43 介导电偶联）与桥粒。肌原纤维的肌节（2.0–2.2 μm）规律排列形成横纹。收缩由 Ca²⁺ 诱导 Ca²⁺ 释放（CICR）驱动：去极化经 L 型钙通道（Cav1.2）少量钙内流 → RyR2 大量释放 → CaM/TnC 触发收缩；SERCA（ATP2A2）/PLN 泵回收钙舒张。β1-AR → Gs → cAMP → PKA 磷酸化 L 型钙通道、PLN 与 RyR2，实现正性变力/变时；慢性 β 激动导致 PKA 超磷酸化 RyR2 Ser2808 致钙泄漏（心衰机制）。PI3K-Akt 介导存活与生理性肥大。',
    descriptionEn:
      'Cardiomyocytes are branched cylinders whose end-to-end junctions form intercalated discs containing gap junctions (Connexin43-mediated electrical coupling) and desmosomes. Regularly arrayed sarcomeres (2.0–2.2 μm) of the myofibrils produce the striations. Contraction is driven by Ca²⁺-induced Ca²⁺ release (CICR): depolarization allows a small Ca²⁺ influx through L-type channels (Cav1.2) → massive RyR2 release → CaM/TnC trigger contraction, while SERCA (ATP2A2)/PLN resequesters Ca²⁺ for relaxation. β1-AR → Gs → cAMP → PKA phosphorylates the L-type channel, PLN and RyR2, delivering positive inotropy/chronotropy; chronic β-stimulation causes PKA hyperphosphorylation of RyR2 at Ser2808 and Ca²⁺ leak (a heart-failure mechanism). PI3K-Akt mediates survival and physiological hypertrophy.',
    morphology: 'cardiomyocyte',
    diameter: '长 80–150 μm × 宽 10–20 μm',
    diameterEn: '80–150 μm long × 10–20 μm wide',
    nucleusNote: '1–2 个中央核（成体）',
    nucleusNoteEn: '1–2 centrally located nuclei (adult)',
    receptors: ['ADRB1', 'ADRB2', 'IGF1R', 'ATP2A2'],
    pathways: ['hsa04024', 'hsa04020', 'hsa04151', 'hsa04150', 'hsa04068'],
    responsiveLigands: ['EPI', 'IGF1'],
    features: [
      { label: '线粒体', value: '占胞质体积 30–35%', labelEn: 'Mitochondria', valueEn: '30–35% of cytoplasmic volume' },
      { label: '肌节长度', value: '静息 1.8–2.0 μm', labelEn: 'Sarcomere length', valueEn: '1.8–2.0 μm at rest' },
      { label: '动作电位', value: '平台期由 Ca²⁺ 内流维持 (~200 ms)', labelEn: 'Action potential', valueEn: 'Plateau sustained by Ca²⁺ influx (~200 ms)' },
      { label: '缝隙连接', value: 'Cx43 传导速度 0.3–0.5 m/s', labelEn: 'Gap junctions', valueEn: 'Cx43 conduction velocity 0.3–0.5 m/s' },
      { label: '再生能力', value: '极低（更新率 ~1%/年）', labelEn: 'Regenerative capacity', valueEn: 'Minimal (turnover ~1%/year)' },
    ],
    tint: ['#7c2d12', '#431407'],
    marker: 'cTnT / MYH7',
  },
  {
    id: 'fibroblast',
    name: '成纤维细胞',
    nameEn: 'Fibroblast',
    tagline: '细胞外基质工厂 · 创伤修复 · 纤维化',
    taglineEn: 'Extracellular-matrix factory · Wound repair · Fibrosis',
    description:
      '成纤维细胞是结缔组织常驻细胞，粗面内质网与高尔基体高度发达，分泌 I/III 型胶原、纤连蛋白与基质金属蛋白酶（MMP），维持 ECM 动态平衡。PDGF 与 TGF-β1 是关键驱动因子：TGF-β1 → Smad2/3/4 通路诱导胶原基因（COL1A1/2）与 PAI-1 转录，并推动成纤维细胞向肌成纤维细胞（α-SMA⁺）分化——伤口收缩与纤维化的细胞学基础。持续性 TGF-β 信号导致病理性纤维化（肝纤维化、肺纤维化、瘢痕疙瘩）；MMP/TIMP 失衡是 ECM 重塑紊乱的核心。',
    descriptionEn:
      'Fibroblasts are resident cells of connective tissue with highly developed rough ER and Golgi, secreting type I/III collagen, fibronectin and matrix metalloproteinases (MMPs) to keep the ECM in dynamic balance. PDGF and TGF-β1 are the key drivers: TGF-β1 → Smad2/3/4 signaling induces collagen genes (COL1A1/2) and PAI-1 transcription and pushes fibroblasts toward myofibroblast (α-SMA⁺) differentiation — the cellular basis of wound contraction and fibrosis. Persistent TGF-β signaling drives pathological fibrosis (liver fibrosis, pulmonary fibrosis, keloids); MMP/TIMP imbalance is central to disordered ECM remodeling.',
    morphology: 'fibroblast',
    diameter: '梭形，长 20–50 μm',
    diameterEn: 'Spindle-shaped, 20–50 μm long',
    nucleusNote: '单个椭圆核，核仁 1–2 个',
    nucleusNoteEn: 'Single ovoid nucleus with 1–2 nucleoli',
    receptors: ['PDGFRA', 'EGFR', 'TGFBR2', 'IGF1R'],
    pathways: ['hsa04350', 'hsa04010', 'hsa04151', 'hsa04370'],
    responsiveLigands: ['TGFB1', 'EGF', 'IGF1'],
    features: [
      { label: '分泌产物', value: 'I/III 型胶原、FN1、MMPs、TGF-β1', labelEn: 'Secretory output', valueEn: 'Type I/III collagen, FN1, MMPs, TGF-β1' },
      { label: 'rER 含量', value: '极丰富（蛋白分泌活跃）', labelEn: 'Rough ER content', valueEn: 'Very abundant (active protein secretion)' },
      { label: '肌成纤维细胞', value: 'α-SMA⁺ 应力纤维（创伤收缩）', labelEn: 'Myofibroblast', valueEn: 'α-SMA⁺ stress fibers (wound contraction)' },
      { label: 'ECM 更新', value: '胶原半衰期 60–90 天（皮肤）', labelEn: 'ECM turnover', valueEn: 'Collagen half-life 60–90 days (skin)' },
      { label: '病理角色', value: '器官纤维化（TGF-β1 慢性激活）', labelEn: 'Pathological role', valueEn: 'Organ fibrosis (chronic TGF-β1 activation)' },
    ],
    tint: ['#713f12', '#422006'],
    marker: 'Vimentin / COL1A1',
  },
  {
    id: 'cancer',
    name: '癌细胞 (KRAS G12D)',
    nameEn: 'Cancer Cell (KRAS-mutant)',
    tagline: '经典肿瘤 hallmarks · 组成性信号转导',
    taglineEn: 'Classic tumor hallmarks · Constitutive signaling',
    description:
      '该虚拟细胞系模拟胰腺导管腺癌样表型，携带一组典型驱动突变：① KRAS G12D——GTPase 活性丧失，RAS 组成性处于 GTP 结合态，RAF-MEK-ERK 通路持续激活（不依赖配体）；② PTEN 功能缺失——PIP3 积累，Akt 组成性活化，FOXO/BAD 磷酸化关闭凋亡倾向；③ TP53 R175H 突变——不仅丧失转录因子功能，且获得 p53 家族显性负/_gain-of-function 特性；④ 抗凋亡蛋白 BCL-2 / BCL-XL 过表达使凋亡阈值上移。对比正常细胞：本细胞系无需外源生长因子即可维持增殖信号（self-sufficiency in growth signals）——在模拟中不注射配体即可观察到 ERK 持续激活。该模型用于演示靶向治疗位点：MEK 抑制剂（曲美替尼）/ PI3K 抑制剂的作用逻辑。',
    descriptionEn:
      'This virtual cell line models a pancreatic ductal adenocarcinoma-like phenotype carrying a canonical set of driver mutations: ① KRAS G12D — loss of GTPase activity locks RAS in the GTP-bound state, keeping RAF-MEK-ERK constitutively active (ligand-independent); ② PTEN loss of function — PIP3 accumulates, Akt is constitutively active, and FOXO/BAD phosphorylation shuts off apoptotic propensity; ③ TP53 R175H — beyond losing transcription-factor function, it acquires dominant-negative/gain-of-function properties over the p53 family; ④ anti-apoptotic BCL-2/BCL-XL overexpression raises the apoptotic threshold. Compared with normal cells, this line sustains proliferative signaling without exogenous growth factors (self-sufficiency in growth signals) — in the simulation, ERK stays chronically active even with no ligand injected. The model demonstrates targeted-therapy logic: MEK inhibitors (trametinib) / PI3K inhibitors.',
    morphology: 'cancer',
    diameter: '大小不等 12–40 μm（核质比增高）',
    diameterEn: 'Heterogeneous 12–40 μm (elevated N:C ratio)',
    nucleusNote: '多形核 / 多核，核仁大而多（嗜银蛋白 AgNOR 增多）',
    nucleusNoteEn: 'Pleomorphic / multiple nuclei with large, numerous nucleoli (increased AgNORs)',
    receptors: ['EGFR', 'IGF1R', 'INTEGRINS', 'DR5'],
    pathways: ['hsa04010', 'hsa04151', 'hsa04115', 'hsa04210', 'hsa04110', 'hsa04066', 'hsa04012'],
    responsiveLigands: ['EGF', 'TGFB1', 'FASLG'],
    features: [
      { label: '增殖标记', value: 'Ki-67 指数 >60%（正常 <5%）', labelEn: 'Proliferation marker', valueEn: 'Ki-67 index >60% (normal <5%)' },
      { label: '糖酵解', value: 'Warburg 效应（有氧糖酵解主导）', labelEn: 'Glycolysis', valueEn: 'Warburg effect (aerobic glycolysis dominant)' },
      { label: '端粒', value: 'hTERT 重表达（端粒维持）', labelEn: 'Telomeres', valueEn: 'hTERT re-expression (telomere maintenance)' },
      { label: '基因组不稳定', value: '染色体不稳定 CIN / 拷贝数变异', labelEn: 'Genomic instability', valueEn: 'Chromosomal instability (CIN) / copy-number alterations' },
      { label: '靶向弱点', value: 'MEK 抑制剂 / PI3K 抑制剂', labelEn: 'Targetable vulnerabilities', valueEn: 'MEK inhibitors / PI3K inhibitors' },
    ],
    mutations: [
      {
        node: 'KRAS',
        effect: 'constitutive',
        note: 'KRAS G12D：GTPase 内源性活性丧失，组成性 RAS-GTP（突变频率：胰腺癌 ~90%，结直肠癌 ~45%）',
        noteEn:
          'KRAS G12D: loss of intrinsic GTPase activity yields constitutive RAS-GTP (mutation frequency: ~90% in pancreatic cancer, ~45% in colorectal cancer)',
      },
      {
        node: 'PTEN',
        effect: 'knockout',
        note: 'PTEN 双等位缺失：PIP3 无法去磷酸化，PIP3-Akt 持续激活',
        noteEn: 'PTEN biallelic loss: PIP3 can no longer be dephosphorylated; PIP3-Akt signaling stays on',
      },
      {
        node: 'TP53',
        effect: 'knockout',
        note: 'TP53 R175H 结构突变：丧失 DNA 结合与转录功能，p21/PUMA 通路关闭',
        noteEn:
          'TP53 R175H structural mutant: loses DNA-binding and transcriptional function, switching off the p21/PUMA program',
      },
    ],
    disease: '胰腺导管腺癌 (PDAC) 样表型',
    diseaseEn: 'Pancreatic ductal adenocarcinoma (PDAC)-like phenotype',
    tint: ['#7f1d1d', '#450a0a'],
    marker: 'MUC1 / CA19-9',
  },
];

export const CELL_TYPE_MAP = new Map(CELL_TYPES.map((c) => [c.id, c]));
