/* ============ v60 细胞器图鉴（Organelle Atlas） ============
 * 结构/功能/临床/标志物四维双语百科 —— 每条 latin 与 3D 悬停锚点（HoverTarget.latin）
 * 严格同名, 「在细胞中定位」按钮经此联动相机飞行 + 脉冲高亮。
 * 内容审校基准: Molecular Biology of the Cell (Alberts 6e) / 细胞生物学 (翟中和 5e)
 */

export type AtlasGroup = 'nuclear' | 'endomembrane' | 'energy' | 'cytoskeleton' | 'surface' | 'vesicle' | 'specialized';

export interface OrgAtlasEntry {
  /** 与 HoverTarget.latin 严格同名（联动定位的联接键） */
  latin: string;
  zh: string;
  group: AtlasGroup;
  /** 关键尺度事实（双语同串, 含单位） */
  size: { zh: string; en: string };
  /** 超微结构 */
  structure: { zh: string; en: string };
  /** 生理功能 */
  physiology: { zh: string; en: string };
  /** 临床/疾病关联 */
  clinic: { zh: string; en: string };
  /** 标志蛋白/分子（供学生实验设计参考） */
  marker: { zh: string; en: string };
  /** 强调色（面板组头与定位按钮一致的语义色） */
  accent: 'emerald' | 'teal' | 'amber' | 'rose' | 'fuchsia' | 'slate';
}

export const ATLAS_GROUP_ORDER: AtlasGroup[] = ['nuclear', 'endomembrane', 'vesicle', 'energy', 'cytoskeleton', 'surface', 'specialized'];

export const ATLAS_GROUP_LABEL: Record<AtlasGroup, { zh: string; en: string }> = {
  nuclear: { zh: '核区 · 遗传系统', en: 'Nuclear · Genome' },
  endomembrane: { zh: '内膜系统', en: 'Endomembrane' },
  vesicle: { zh: '运输与降解', en: 'Traffic & degradation' },
  energy: { zh: '能量与代谢', en: 'Energy & metabolism' },
  cytoskeleton: { zh: '细胞骨架', en: 'Cytoskeleton' },
  surface: { zh: '细胞表面', en: 'Cell surface' },
  specialized: { zh: '特化结构 · 细胞类型专属', en: 'Specialized · cell-type specific' },
};

export const ORG_ATLAS: OrgAtlasEntry[] = [
  {
    latin: 'Nuclear envelope',
    zh: '核被膜',
    group: 'nuclear',
    size: { zh: '双膜总厚 ≈ 40 nm · 外膜续接粗面内质网', en: 'Double membrane ≈ 40 nm · outer sheet continues into rough ER' },
    structure: {
      zh: '内外两层平行核膜 + 20–40 nm 核周间隙; 内膜下衬以核纤层（V 型中间丝网格）; 外膜表面可附着核糖体并与 rER 膜连续 —— 核质与胞质实际是连续膜系统上的两个分区',
      en: 'Inner and outer membranes separated by a 20–40 nm perinuclear space; the inner face is lined by the nuclear lamina (a mesh of V-shaped intermediate filaments); the outer membrane carries ribosomes and is continuous with rough ER — nucleus and cytoplasm are two compartments of one membrane system',
    },
    physiology: {
      zh: '为基因组提供物理分区: 把转录/复制与翻译在时空上解耦, 使真核基因表达获得 RNA 加工（剪接、加帽、加尾）这一层调控维度; 核纤层维持核形并锚定异染色质',
      en: 'Physically partitions the genome, decoupling transcription and translation in space-time and thereby enabling RNA-level regulation (capping, splicing, polyadenylation); the lamina maintains nuclear shape and anchors heterochromatin',
    },
    clinic: {
      zh: '核纤层蛋白 LMNA 突变 → 早衰（Hutchinson–Gilford progeria）、扩张型心肌病与脂肪营养不良等「核纤层病」谱系; 核被膜在有丝分裂前期必须有序解体, 解体异常与染色体错误分离相关',
      en: 'LMNA lamin mutations cause progeria (Hutchinson–Gilford), dilated cardiomyopathy and lipodystrophies (laminopathies); its timely mitotic disassembly is a prerequisite for accurate chromosome segregation',
    },
    marker: { zh: 'Lamin B（核纤层）· NPC 抗原 · LBR', en: 'Lamin B (lamina) · NPC antigens · LBR' },
    accent: 'emerald',
  },
  {
    latin: 'Nuclear pore complex',
    zh: '核孔复合体',
    group: 'nuclear',
    size: { zh: '直径 ≈ 120 nm · 分子量 ~110 MDa · 每核 2,000–5,000 个', en: 'Ø ≈ 120 nm · ~110 MDa · 2,000–5,000 per nucleus' },
    structure: {
      zh: '八重旋转对称的篮状大分子机器: 胞质环 + 核质环夹住辐条与中央转运子, 核侧伸出篮状结构; ~30 种核孔蛋白（Nup）组装, 内衬无结构 FG 重复链构成选择性凝胶相',
      en: 'An eight-fold rotational basket: cytoplasmic and nucleoplasmic rings clamp spokes around a central transporter; ~30 nucleoporins assemble it, and disordered FG-repeat chains line the channel forming a selective phase',
    },
    physiology: {
      zh: '核质双向选择性运输: <40 kDa 分子被动扩散, 输入蛋白/输出蛋白·Ran-GTP 酶循环驱动主动运输（转录因子入核、mRNA 出核）; FG 相 «选择性禁运» 兼具通透屏障与速度（无膜融合步骤）',
      en: 'Gated nucleocytoplasmic transport: passives below ~40 kDa diffuse, while importins/exportins powered by the Ran-GTPase cycle ferry cargo (transcription factors in, mRNAs out); the FG phase combines barrier with speed without membrane fusion',
    },
    clinic: {
      zh: '肿瘤与神经退行性疾病中 NPC 数量与 Nup 表达普遍改变; 某些病毒（流感、HIV）劫持 CRM1 输出通道输出其基因组; 核运输因子突变致原发性脑白质营养不良与不育',
      en: 'NPC composition is broadly rewired in cancer and neurodegeneration; viruses (influenza, HIV) hijack CRM1 export; mutations of transport factors cause leukodystrophies and infertility',
    },
    marker: { zh: 'Nup153 · Nup358/RanBP2 · mAb414（泛 NPC）', en: 'Nup153 · Nup358/RanBP2 · mAb414 (pan-NPC)' },
    accent: 'emerald',
  },
  {
    latin: 'Nucleolus',
    zh: '核仁',
    group: 'nuclear',
    size: { zh: '直径 1–3 µm · 每核 1–4 个（随 rDNA 活性）', en: 'Ø 1–3 µm · 1–4 per nucleus' },
    structure: {
      zh: '非膜包裹的液-液相分离凝聚体: 纤维中心（FC, 含沉默 rDNA）→ 致密纤维组分（DFC, 转录中的 rDNA + RPA194）→ 颗粒组分（GC, 加工装配区）三同心壳层',
      en: 'A membraneless, phase-separated condensate with three concentric zones: fibrillar centers (silent rDNA), dense fibrillar component (actively transcribed rDNA + RPA194) and the granular component (processing/assembly)',
    },
    physiology: {
      zh: 'rRNA 转录（RNA Pol I, 45S 前体）→ 加工为 18S/5.8S/28S → 与 5S（Pol III）和核糖体蛋白装配大小亚基前体并输出至胞质; 兼为应激传感器（p53 稳态的核仁监视通路）',
      en: 'Transcribes 45S pre-rRNA (Pol I), processes it into 18S/5.8S/28S and assembles pre-ribosomal subunits for export; also a stress sensor feeding the nucleolar-surveillance arm of p53 stabilization',
    },
    clinic: {
      zh: '核仁增大/增多是恶性肿瘤经典病理指征（高核糖体生物合成需求）; 抑制 Pol I 的 CX-5461 等在血液肿瘤临床试验; Bowen–Conradi 与 Treacher Collins 综合征源于核仁装配因子突变',
      en: 'Enlarged/multiple nucleoli are a classic hallmark of malignancy; Pol I inhibitors (CX-5461) are in haematological trials; Bowen–Conradi and Treacher Collins syndromes stem from nucleolar assembly-factor mutations',
    },
    marker: { zh: 'Fibrillarin（DFC）· Nucleolin（GC）· UBF（FC）', en: 'Fibrillarin (DFC) · Nucleolin (GC) · UBF (FC)' },
    accent: 'emerald',
  },
  {
    latin: 'Heterochromatin',
    zh: '异染色质',
    group: 'nuclear',
    size: { zh: '30 nm 级致密纤维 · 核边缘与核仁周围聚集', en: '30-nm-class compaction · clusters at the nuclear periphery' },
    structure: {
      zh: '高度压缩的核小体阵列（H3K9me3/H4K20me3 修饰 + HP1 桥连）, 借 LEM 结构域蛋白锚定于核纤层内侧; 组成型（着丝粒/端粒重复）与兼性（发育沉默基因）两类',
      en: 'Densely packed nucleosome arrays (H3K9me3/H4K20me3 with HP1 bridging) anchored to the lamina via LEM-domain proteins; constitutive (centromeres, telomeres) and facultative classes',
    },
    physiology: {
      zh: '转录沉默认区: 维持基因组稳定（抑制重复元件重组）、细胞身份锁定的表遗传记忆载体; 「染色体疆域」外缘即异染色质带 —— 基因表达的空间调控层',
      en: 'A transcriptionally silent compartment that suppresses repeat recombination and locks in cell identity; the outer rim of chromosome territories is heterochromatic — a spatial layer of gene control',
    },
    clinic: {
      zh: 'PEV（位置效应花斑）首次揭示异染色质可遗传性; ICF 综合征（DNMT3B 突变）异染色质松散致免疫缺陷; 肿瘤中全局异染色质丢失与基因组不稳定并行',
      en: 'Position-effect variegation first revealed its heritability; ICF syndrome (DNMT3B) loosens heterochromatin causing immunodeficiency; global heterochromatin loss parallels instability in tumours',
    },
    marker: { zh: 'HP1α · H3K9me3 · CENP-A（着丝粒型）', en: 'HP1α · H3K9me3 · CENP-A (centromeric)' },
    accent: 'emerald',
  },
  {
    latin: 'Mitochondrion',
    zh: '线粒体',
    group: 'energy',
    size: { zh: '长 1–4 µm · 肝细胞 ≈ 1,000–2,000 个/胞', en: '1–4 µm long · 1,000–2,000 per hepatocyte' },
    structure: {
      zh: '双层膜: 外膜（孔蛋白通道）+ 内膜折叠成板层嵴（ATP 合酶 F₁ 头朝基质突出, 像「棒棒糖」列阵）; 基质含环状 mtDNA（16569 bp）+ 核糖体 + TCA 酶系; 膜间隙富细胞色素 c',
      en: 'Double membrane: porin-channelled outer membrane plus inner membrane folded into lamellar cristae studded with F₁ heads of ATP synthase; the matrix keeps circular mtDNA (16,569 bp), ribosomes and TCA enzymes; cytochrome c resides in the intermembrane space',
    },
    physiology: {
      zh: '氧化磷酸化中心: 基质 TCA 循环产 NADH/FADH₂ → 内膜电子传递链泵 H⁺ 形成质子动力势 → ATP 合酶旋转催化合成 ATP; 兼为 β 氧化、凋亡启动（cyt c 释放）、Ca²⁺ 缓冲与热产生（UCP 解偶联）平台',
      en: 'Oxidative phosphorylation hub: TCA reducing equivalents feed the electron-transport chain, which pumps H⁺ into a proton-motive force that ATP synthase converts to ATP; also the stage for β-oxidation, apoptosis initiation (cyt c release), Ca²⁺ buffering and UCP-mediated thermogenesis',
    },
    clinic: {
      zh: 'mtDNA 突变母系遗传病（MELAS、LHON 视神经萎缩）; 老化与帕金森中 mtDNA 突变累积; 肿瘤 Warburg 效应重编程线粒体代谢; 若干化疗药靠诱导线粒体凋亡通路起效',
      en: 'Maternally inherited mtDNA disorders (MELAS, LHON); mutation accumulation in aging and Parkinson; tumours rewire mitochondrial metabolism (Warburg); several chemotherapeutics act via the mitochondrial apoptotic gate',
    },
    marker: { zh: 'COX IV（内膜）· TOM20（外膜）· HSP60（基质）', en: 'COX IV (inner) · TOM20 (outer) · HSP60 (matrix)' },
    accent: 'amber',
  },
  {
    latin: 'Rough ER',
    zh: '粗面内质网',
    group: 'endomembrane',
    size: { zh: '核周囊池宽 ≈ 60–100 nm · 外周管网延伸至胞质', en: 'Perinuclear cisternae 60–100 nm wide, tubules radiate outward' },
    structure: {
      zh: '扁平囊池层叠于核周（外核膜直接出芽延续）+ 外周管状网; 胞质面满铺结合态核糖体（多聚核糖体螺旋）, 腔面驻留分子伴侣（BiP）与糖基化酶; 与中间丝共定位',
      en: 'Flattened cisternae stacked around the nucleus (continuous with the outer nuclear membrane) plus peripheral tubules; cytosolic face studded with bound polyribosomes, luminal face hosting BiP and glycosyltransferases',
    },
    physiology: {
      zh: '分泌蛋白/膜蛋白/Ig 的共翻译易位合成: SRP 识别信号肽 → Sec61 易位子入腔 → BiP 折叠质检 + N-连接糖基化起始 → COPII 出芽运往 CGN; 错误折叠蛋白经 ERAD 逆易位回胞质降解; 未折叠蛋白反应（UPR）整合应激',
      en: 'Co-translational synthesis of secreted, membrane and receptor proteins: SRP reads the signal peptide, Sec61 translocates, BiP quality-controls and N-glycosylation starts before COPII export; misfits are retro-translocated for ERAD, and the UPR integrates proteostatic stress',
    },
    clinic: {
      zh: '浆细胞骨髓瘤（M 蛋白大量合成）见显著扩张的 rER; 囊性纤维化 ΔF508 CFTR 即在 rER 被 ERAD 降解; SERCA 靶向药物（毒胡萝卜素）经 rER 钙库扰动诱导肿瘤应激',
      en: 'Florid rER distension marks myeloma plasma cells; ΔF508 CFTR is ERAD-degraded; thapsigargin-type SERCA poisons weaponize ER stress in experimental oncology',
    },
    marker: { zh: 'Sec61β · Calnexin · BiP/GRP78（腔）· Ribophorin', en: 'Sec61β · Calnexin · BiP/GRP78 (lumen) · Ribophorin' },
    accent: 'teal',
  },
  {
    latin: 'Smooth ER',
    zh: '滑面内质网',
    group: 'endomembrane',
    size: { zh: '管网直径 ≈ 30–60 nm · 肝细胞中成片集聚', en: 'Tubules 30–60 nm · abundant in hepatocytes' },
    structure: {
      zh: '无核糖体的细管交织网（曲率由 Reticulon/REEB 膜整形蛋白稳定）; 与 rER 连续但管径更细; 肌细胞特化为肌浆网（纵小管+终池）, 肝细胞含细胞色素 P450 酶系嵌入管膜',
      en: 'Ribosome-free anastomosing tubules stabilized by reticulons; continuous with rough ER but finer; specialized as sarcoplasmic reticulum in muscle and as the P450-bearing detox network in liver',
    },
    physiology: {
      zh: '脂质与类固醇合成（磷脂翻转酶维持不对称）、肝解毒 I 相（CYP450 羟化）与 II 相结合、Ca²⁺ 摄取储存（SERCA）/IP₃R·RyR 释放; 神经元 sER 兼为局部 Ca²⁺ 微域调控器',
      en: 'Lipid and steroid synthesis, hepatic CYP450 phase-I detoxification, Ca²⁺ uptake (SERCA) and release (IP₃R/RyR); neuronal sER additionally shapes local Ca²⁺ microdomains',
    },
    clinic: {
      zh: '苯巴比妥慢性给药 → 肝细胞 sER/CYP450 代偿性增殖（耐受性机制）; 恶性高热 = RyR1 突变致 sER 钙释放失控; sER 应激与脂毒性肝炎相关',
      en: 'Chronic phenobarbital proliferates hepatic sER/CYP450 (tolerance); malignant hyperthermia is RyR1-gated Ca²⁺ runaway; sER stress accompanies lipotoxic hepatitis',
    },
    marker: { zh: 'Calreticulin（腔）· SERCA2 · CYP2E1（肝）', en: 'Calreticulin (lumen) · SERCA2 · CYP2E1 (liver)' },
    accent: 'teal',
  },
  {
    latin: 'Golgi apparatus',
    zh: '高尔基体',
    group: 'endomembrane',
    size: { zh: '扁平囊 3–10 层/堆 · 囊间距 ≈ 15 nm · 高尔基堆数随细胞类型', en: '3–10 cisternae per stack · 15 nm spacing' },
    structure: {
      zh: '顺面（CGN, 凸向核）→ 中间囊 → 反面（TGN, 凹向质膜）的极性囊堆; 两侧糖基化酶梯度分布; 中心体旁经 Golgin 微管捕获定位; 肌腱/杯状细胞中多堆成「高尔基区」',
      en: 'A polarized stack from the cis (CGN, convex, nuclear-facing) through medial cisternae to the trans (TGN, concave); glycosyltransferase gradients along the axis; positioned near the centrosome via golgin microtubule capture',
    },
    physiology: {
      zh: '分泌通路枢纽: N-糖链修剪+O-糖起始+糖胺聚糖链延伸、蛋白硫酸化/磷酸化、蛋白聚糖装配; TGN 三向分选（网格蛋白囊泡→内体/溶酶体、分泌颗粒→调节分泌、组成型分泌泡→质膜）; 有丝分裂期离散重聚',
      en: 'The secretory hub: N-glycan trimming, O-glycans, GAG elongation, sulfation; TGN sorts three ways (clathrin→endosomes/lysosomes, regulated granules, constitutive vesicles); disperses and reassembles each mitosis',
    },
    clinic: {
      zh: '先天性糖基化障碍（CDG）多为高尔基糖基转移酶突变; 霍乱毒素经逆向运输穿越高尔基体入 ER; 阿尔茨海默病中高尔基碎裂与 tau 过度磷酸化相关',
      en: 'Congenital disorders of glycosylation map onto Golgi glycosyltransferases; cholera toxin retro-traffics through it to the ER; fragmentation accompanies tau pathology in Alzheimer disease',
    },
    marker: { zh: 'GM130（顺面）· TGN46（反面）· Golgin-97', en: 'GM130 (cis) · TGN46 (trans) · Golgin-97' },
    accent: 'teal',
  },
  {
    latin: 'Transport vesicle',
    zh: '运输小泡',
    group: 'vesicle',
    size: { zh: '直径 50–100 nm（COPII 偏小/网格蛋白偏大）', en: 'Ø 50–100 nm (COPII smaller, clathrin larger)' },
    structure: {
      zh: '脂双层小泡 + 外壳机器: COPII（Sec23/24+Sec13/31, 出芽于 rER）、COPI（逆向回收, 高尔基内/回 rER）、网格蛋白+接头蛋白（TGN 与质膜内吞）; 泡膜嵌 v-SNARE, 靶膜 t-SNARE',
      en: 'A lipid-bilayer bud plus coat machinery: COPII (ER export), COPI (retrograde retrieval), clathrin/adaptors (TGN and endocytosis); v-SNAREs ride the vesicle to meet t-SNAREs on target membranes',
    },
    physiology: {
      zh: '膜交通的「集装箱」: GTP 酶控制出芽方向, Rab GTP 酶打「邮政编码」锚定栓系因子, SNARE 螺旋拉链驱动膜融合 —— 三层分子逻辑保证定向与保真; 每泡货物经分选信号富集',
      en: 'The container of membrane traffic: Arf/Sar GTPases sculpt the bud, Rabs address it to tethering factors, SNARE zippering fuses it — three molecular layers of directionality and fidelity',
    },
    clinic: {
      zh: '变形杆菌毒素经逆向 COPI 通路致病; SNARE 的肉毒杆菌神经毒素裂解致突触麻痹; CHED 先天性溶血性贫血源于 COPI 亚基突变',
      en: 'Shiga toxin rides retrograde COPI; botulinum neurotoxins proteolyze SNAREs; CHED anaemia arises from COPI subunit mutations',
    },
    marker: { zh: 'Sec24（COPII）· β-COP（COPI）· Clathrin 重链', en: 'Sec24 (COPII) · β-COP (COPI) · clathrin heavy chain' },
    accent: 'fuchsia',
  },
  {
    latin: 'Lysosome',
    zh: '溶酶体',
    group: 'vesicle',
    size: { zh: '直径 0.1–1 µm · 肝细胞数百个', en: 'Ø 0.1–1 µm · hundreds in a hepatocyte' },
    structure: {
      zh: '单层膜酸性区室（腔内 pH 4.5–5.0, V-ATP 酶泵 H⁺ + ClC-7 通道平衡电荷）; ≥60 种酸性水解酶（糖苷酶/蛋白酶/脂酶/核酸酶）+ 高度糖基化的 LAMP 膜蛋白保护层; mTORC1·V-ATP 酶·氨基酸传感复合体驻膜',
      en: 'A single-membrane acid compartment (pH 4.5–5.0 via V-ATPase with ClC-7 counterion balance) carrying ≥60 acid hydrolases; LAMP heavily glycosylated to shield the membrane; mTORC1 senses amino acids here',
    },
    physiology: {
      zh: '细胞「胃 + 回收站」: 吞噬/内吞货物与自噬体融合后降解为单体再利用; 溶酶体-自噬轴是营养传感与细胞器质量控制核心（mTORC1 抑制 → TFEB 核易位启动自噬-溶酶体生物发生程序）',
      en: 'Stomach and recycling centre: degrades phagocytic/endocytic and autophagic cargo into monomers; the autophagy-lysosome axis is the nutrient-sensing and organelle-QC core (mTORC1 off → TFEB drives lysosomal biogenesis)',
    },
    clinic: {
      zh: '溶酶体贮积症家族（戈谢病、法布里病、Tay–Sachs）= 单一水解酶缺陷致底物堆积, 酶替代疗法已上市多种; 溶酶体膜通透化（LMP）是凋亡/焦亡放大的节点',
      en: 'Lysosomal storage disorders (Gaucher, Fabry, Tay–Sachs) each trace to one hydrolase; enzyme-replacement is available for several; lysosomal membrane permeabilization amplifies death signalling',
    },
    marker: { zh: 'LAMP1/LAMP2 · Cathepsin D · LysoTracker 酸性探针', en: 'LAMP1/LAMP2 · Cathepsin D · LysoTracker' },
    accent: 'fuchsia',
  },
  {
    latin: 'Multivesicular body',
    zh: '多泡体',
    group: 'vesicle',
    size: { zh: '直径 0.2–0.5 µm · 腔内囊泡 ≈ 50 nm', en: 'Ø 0.2–0.5 µm · intraluminal vesicles ≈ 50 nm' },
    structure: {
      zh: '晚期内体: 界膜内陷出芽成腔内囊泡（ILV）—— 「泡中泡」; ILV 膜外翻暴露 cargo 于腔; ESCRT-0/I/II/III 机器（分选泛素化货物 + 膜剪切）装配之',
      en: 'A late endosome whose limiting membrane invaginates into intraluminal vesicles — bubbles within a bubble; ESCRT-0/I/II/III machinery sorts ubiquitinated cargo and snips the bud neck',
    },
    physiology: {
      zh: '降级路由与信号时长开关: 被内吞的受体（如 EGFR）要么回收再利用、要么经 MVB→溶酶体降解而终止信号; ILV 亦可被外泌为外泌体实现细胞间通信（mRNA/miRNA/蛋白载体）',
      en: 'The switch between signalling duration and degradation: internalized receptors are either recycled or sunk with the MVB into lysosomes to extinguish signalling; ILVs can instead be released as exosomes for intercellular RNA/protein exchange',
    },
    clinic: {
      zh: 'HIV Gag 募集 ESCRT 出芽释放病毒颗粒（转运必需）—— 以 ESCRT 为靶的抗病毒方向; 肿瘤外泌体介导免疫抑制与转移前微环境; CHMP2B 突变（ESCRT-III）与额颞叶痴呆相关',
      en: 'HIV pincers ESCRT to bud virions — a druggable node; tumour exosomes sculpt pre-metastatic niches; CHMP2B (ESCRT-III) mutations link to frontotemporal dementia',
    },
    marker: { zh: 'CD63 · CD9（四跨膜蛋白）· HRS（ESCRT-0）', en: 'CD63 · CD9 (tetraspanins) · HRS (ESCRT-0)' },
    accent: 'fuchsia',
  },
  {
    latin: 'Autophagosome',
    zh: '自噬体',
    group: 'vesicle',
    size: { zh: '直径 0.5–1.5 µm · 双层膜封闭', en: 'Ø 0.5–1.5 µm · double-membraned' },
    structure: {
      zh: '隔离膜（phagophore）生长包绕货物 → 双膜自噬体闭合; 膜源多元（ER 的 omegasome 瓦片、高尔基/内体 ATG9 囊泡供给）; LC3-II 嵌入膜面（脂化标志）',
      en: 'A phagophore grows around cargo and seals into a double-membrane autophagosome; membranes hail from ER omegasomes and ATG9 vesicles; lipidated LC3-II embeds as the canonical tag',
    },
    physiology: {
      zh: '巨自噬: ULK1 复合体起始 → Beclin-PI3KC3 核化 → ATG8/LC3 结合闭合 → 与溶酶体融合成自噬溶酶体; 选择性受体（p62/SQSTM1）识别泛素化货物 —— 清除受损线粒体（线粒体自噬）与聚集蛋白; AMPK 感知能量不足触发',
      en: 'Macroautophagy: ULK1 nucleates, Beclin-PI3KC3 supplies PI3P, LC3 seals the cup, and the product fuses with lysosomes; p62-type receptors grab ubiquitinated cargo for selective mitophagy or aggregate clearance; AMPK triggers it under energy stress',
    },
    clinic: {
      zh: '自噬流不足与神经退行（帕金森 PINK1/Parkin 线粒体自噬轴）、衰老相关; 肿瘤中情境双刃（抑瘤/促存营养 recycling）; 氯喹类抑制剂用于调控自噬的临床试验多项进行',
      en: 'Defective flux ties to neurodegeneration (PINK1/Parkin mitophagy) and aging; in cancer it cuts both ways; chloroquine-type blockers populate clinical trials',
    },
    marker: { zh: 'LC3B（脂化型 II）· ATG5 · p62/SQSTM1 · ULK1', en: 'LC3B-II · ATG5 · p62/SQSTM1 · ULK1' },
    accent: 'fuchsia',
  },
  {
    latin: 'Peroxisome',
    zh: '过氧化物酶体',
    group: 'energy',
    size: { zh: '直径 0.2–1 µm · 单层膜', en: 'Ø 0.2–1 µm · single membrane' },
    structure: {
      zh: '单层膜区室, 基质含晶态尿酸氧化酶核心（啮齿类明显）; 膜上 ABCD 转运体（ALDP）输入极长链脂肪酸的活化 CoA; 蛋白分全 Pex5/Pex7 循环输入（不需要囊泡运输的例外通路）',
      en: 'A single-membrane organelle with a paracrystalline urate-oxidase core (prominent in rodents); ABCD/ALDP transporters import activated VLCFA; matrix proteins import via the Pex5/Pex7 shuttles — traffic without vesicles',
    },
    physiology: {
      zh: '脂肪酸 β 氧化（极长链/支链）→ 过氧化氢酶分解副产 H₂O₂（2H₂O₂→2H₂O+O₂ 的「安全阀」）; 缩醛磷脂合成、胆汁酸与尿酸氧化; 与线粒体分工解毒（醇类、D-氨基酸氧化酶）',
      en: 'β-oxidation of very-long/branched chains with catalase defusing H₂O₂ (2H₂O₂→2H₂O+O₂); plasmalogen synthesis, bile-acid and urate oxidation; detox duties shared with mitochondria',
    },
    clinic: {
      zh: '过氧化物酶体病二类: 生成缺陷（Zellweger 综合征, PEX 基因群, 严重神经-肝异常）与单酶缺陷（X-ALD 极长链脂肪酸堆积, Lorenzo 油与造血干细胞移植治疗）; 缩醛磷脂缺失也是 RCDP 根因',
      en: 'Two disease classes: biogenesis defects (Zellweger spectrum, PEX genes) versus single-enzyme defects (X-ALD VLCFA accumulation, Lorenzo oil and HSCT); plasmalogen loss underlies RCDP',
    },
    marker: { zh: 'Catalase · PMP70（膜）· PEX14', en: 'Catalase · PMP70 (membrane) · PEX14' },
    accent: 'amber',
  },
  {
    latin: 'Lipid droplet',
    zh: '脂滴',
    group: 'energy',
    size: { zh: '直径 0.1–10 µm（肝细胞大滴/脂肪细胞单房巨滴）', en: 'Ø 0.1–10 µm (hepatocyte droplets to unilocular adipocyte giants)' },
    structure: {
      zh: '唯一「细胞器内单层膜」: 中性脂核心（甘油三酯+胆固醇酯）外包磷脂单层与外围蛋白（perilipin 家族披甲, PLIN1 脂肪型/PLIN2 泛型）; 出芽于 sER 膜之间, 表面嵌 Rab 与酯酶',
      en: 'The only organelle bounded by a monolayer: a neutral-lipid core (TAG + cholesteryl esters) under a phospholipid monolayer armoured by perilipins; buds between sER leaflets and carries Rabs and lipases',
    },
    physiology: {
      zh: '能量与膜原料缓冲库: 脂肪甘油三酯脂肪酶（ATGL→HSL→MGL）级联按需释放脂肪酸; 磷脂合成的原料泵; 脂滴-线粒体接触介导 β 氧化直接供能; 脂滴-自噬（lipophagy）是另一条降级通路',
      en: 'Buffer of energy and membrane precursors: the ATGL→HSL→MGL lipase cascade releases fatty acids on demand; lipophagy is an alternative clearance route; droplet-mitochondria apposition feeds β-oxidation directly',
    },
    clinic: {
      zh: '肝脂肪变性（NAFLD/MAFLD）= 脂滴过度蓄积 → 脂毒性肝炎 → 肝纤维化; PLIN2 敲除可抵抗饮食性脂肪肝; 肿瘤脂代谢重编程中脂滴作为「燃料库」支持快速增殖',
      en: 'Hepatic steatosis (MAFLD) is droplet overload progressing to lipotoxic hepatitis; PLIN2-null mice resist fatty liver; tumours stockpile droplets as fuel depots for rapid proliferation',
    },
    marker: { zh: 'Perilipin 2/ADRP · TIP47 · BODIPY 染色', en: 'Perilipin 2/ADRP · TIP47 · BODIPY staining' },
    accent: 'amber',
  },
  {
    latin: 'Microtubules',
    zh: '微管',
    group: 'cytoskeleton',
    size: { zh: '外径 25 nm · 13 原纤维 · 长度可数 µm–数十 µm', en: 'Ø 25 nm · 13 protofilaments' },
    structure: {
      zh: 'α/β 微管蛋白异二聚体头尾聚合的中空管; β 管 (+) 端聚合快、α 管 (−) 端稳定; GTP 帽调控「动态不稳定性」（生长↔塌缩切换）; 中心体/基体为主要 MTOC; MAP（tau、MAP2）调节稳定性',
      en: 'Hollow tubes of head-to-tail α/β tubulin dimers; the plus end grows fast, minus ends anchor; a GTP cap governs dynamic instability (growth ↔ catastrophe); centrosomes/basal bodies are the classic MTOCs',
    },
    physiology: {
      zh: '胞内高速公路: 驱动蛋白（+向 胞体→突触末梢）与动力蛋白（−向 回胞体）沿微管货物运输; 有丝分裂纺锤体（着丝粒-极微管+星体微管+区间微管三族）实施染色体分配; 纤毛/鞭毛轴丝为 9+2 微管马达系统',
      en: 'Intracellular highways for kinesin (plus-end) and dynein (minus-end) cargo; the mitotic spindle (kinetochore, astral and interpolar classes) partitions chromosomes; 9+2 axonemes power cilia and flagella',
    },
    clinic: {
      zh: '紫杉醇稳定微管 / 长春碱类促塌缩 —— 两类抗肿瘤药从相反方向冻结分裂纺锤体; 原发性纤毛运动障碍（PCD）= 动力蛋白臂缺陷; tau 过度磷酸化（阿尔茨海默）使微管失稳',
      en: 'Paclitaxel stabilizes and vinca alkaloids catastrophize microtubules — opposite routes to the same mitotic arrest; primary ciliary dyskinesia is a dynein-arm defect; tau hyperphosphorylation destabilizes neuronal microtubules',
    },
    marker: { zh: 'α-Tubulin（乙酰化 K40）· γ-Tubulin（MTOC）· EB1（+端追踪）', en: 'Acetylated α-tubulin (K40) · γ-tubulin (MTOC) · EB1 (+TIP)' },
    accent: 'slate',
  },
  {
    latin: 'Centrosome',
    zh: '中心体',
    group: 'cytoskeleton',
    size: { zh: '直径 ≈ 1 µm（母/子中心粒 各 9×3 微管三联体 + 中心粒周围基质）', en: '≈ 1 µm — mother/daughter centrioles plus pericentriolar material' },
    structure: {
      zh: '一对垂直正交的中心粒（0.2 µm × 0.4 µm, 9 组微管三联体 + 远端/亚远端附属结构）嵌入 γ-微管蛋白环复合体（γ-TuRC）密集的 PCM; 母中心粒远端附属是原纤毛锚定脚手架',
      en: 'Two orthogonally paired centrioles (9 triplet microtubules with distal/subdistal appendages) embedded in γ-TuRC-rich pericentriolar material; the mother centriole\'s appendages template the primary cilium',
    },
    physiology: {
      zh: '主要微管组织中心: γ-TuRC 成核新微管 (−) 端; 细胞周期中精确复制一次（G1 期原中心粒萌发）, G2 期分离, M 期极化成双星纺锤极; 也是原纤毛的 basal body 分化前体',
      en: 'The principal MTOC: γ-TuRC nucleates microtubule minus ends; it reduplicates once per cycle (procentrioles in G1, disengagement in G2, bipolar spindle poles in M) and differentiates into the basal body of the primary cilium',
    },
    clinic: {
      zh: '癌细胞常见中心体扩增 → 多极纺锤体 → 染色体非整倍体（基因组不稳定引擎）; 原纤毛缺失（BBS/Meckel 综合征）致多囊肾等多器官发育缺陷; 不育可溯及精子鞭毛中心粒结构缺陷',
      en: 'Centrosome amplification in tumours multipolarizes spindles and drives aneuploidy; ciliopathies (BBS, Meckel) trace to centrosome-derived basal bodies; male infertility can reflect sperm centriole defects',
    },
    marker: { zh: 'γ-Tubulin · Pericentrin · Centrin · CEP152', en: 'γ-Tubulin · Pericentrin · Centrin · CEP152' },
    accent: 'slate',
  },
  {
    latin: 'Intermediate filaments',
    zh: '中间丝',
    group: 'cytoskeleton',
    size: { zh: '直径 ≈ 10 nm（介于微管与肌动蛋白之间 · 无极性）', en: 'Ø ≈ 10 nm · apolar' },
    structure: {
      zh: '组织/细胞类型特异性亚基（上皮角蛋白、间充质波形蛋白、神经元 NF-L/M/H、核内 lamins）: α 螺旋杆区二聚体 → 反向平行四聚体（无极性!）→ 8 四聚体绞合成绳; 非动态 —— 无踏车, 靠交换重构',
      en: 'Type-specific subunits (keratins, vimentin, neurofilaments, nuclear lamins): coiled-coil dimers assemble into apolar tetramers and 8-stranded ropes; no treadmilling — remodeled by subunit exchange',
    },
    physiology: {
      zh: '机械韧性骨架: 从核纤层到桥粒的连续张拉网络分散应力（「安全气囊」角色）; 角蛋白网络为上皮提供抗剪切强度; 神经丝决定轴突 caliber 与传导速度',
      en: 'The mechanical tough guy: a continuous tensile network from lamina to desmosomes spreading stress; keratin cables give epithelia shear strength; neurofilament density sets axon calibre and conduction speed',
    },
    clinic: {
      zh: '大疱性表皮松解症（K5/K14 突变 → 轻微摩擦即起疱）; 间皮瘤/癌诊断免疫组化的角蛋白分型利器; ALS 中神经丝聚集; GFAP 是星形胶质细胞肿瘤标志',
      en: 'Epidermolysis bullosa simplex (K5/K14) blisters at a touch; keratin typing underpins carcinoma vs mesothelioma diagnostics; neurofilament aggregates in ALS; GFAP marks astrocytic tumours',
    },
    marker: { zh: 'Vimentin · Pan-CK/EMA（角蛋白）· GFAP（星形）· NF-L', en: 'Vimentin · Pan-CK/EMA · GFAP · NF-L' },
    accent: 'slate',
  },
  {
    latin: 'Cortical actin',
    zh: '皮层肌动蛋白',
    group: 'cytoskeleton',
    size: { zh: '肌动蛋白丝 Ø 7 nm · 皮层厚 ≈ 100–200 nm', en: 'F-actin Ø 7 nm · cortex ≈ 100–200 nm' },
    structure: {
      zh: '肌动球蛋白皮层紧贴质膜下: branched 网（Arp2/3 成核 + 丝正端踏车伸长; 巅峰速率 ~2 µm/min）+ myosin-II 微丝束交联; ERM 蛋白膜锚定; 与锚定/紧密连接蛋白互锁',
      en: 'An actomyosin sheet beneath the membrane: Arp2/3-branched networks treadmilling at ~2 µm/min crosslinked by myosin-II minifilaments, ERM-tethered to the membrane and interlocked with junctional proteins',
    },
    physiology: {
      zh: '形态与运动引擎: 片足/丝足探路、胞质分裂收缩环、内吞/胞吐的膜动力学辅助、皮质流（cortical flow）重构极性; 皮层张力是细胞命运决定（YAP/TAZ Hippo 通路力学传感）的直接输入',
      en: 'The engine of shape and movement: lamellipodia/filopodia probing, the cytokinetic contractile ring, endo/exocytic membrane dynamics and cortical flows establishing polarity; cortex tension feeds Hippo-YAP mechanotransduction',
    },
    clinic: {
      zh: '肌动蛋白聚合抑制剂细胞松弛素/拉春库林 A 为经典实验工具; 侵袭性肿瘤皮层重塑（invadopodia 降解基质）依赖 cortactin–Arp2/3; 某些心肌病源于肌动蛋白编码基因突变',
      en: 'Cytochalasin and latrunculin are the classic perturbation tools; invadopodia of invasive tumours ride the cortactin–Arp2/3 axis; cardiomyopathies map onto actin-coding genes',
    },
    marker: { zh: 'Phalloidin 标记 F-肌动蛋白 · Cortactin · Myosin IIA 重链', en: 'Phalloidin (F-actin) · Cortactin · Myosin IIA heavy chain' },
    accent: 'slate',
  },
  {
    latin: 'Plasma membrane',
    zh: '质膜',
    group: 'surface',
    size: { zh: '厚 ≈ 7.5 nm · 人红细胞膜面积 ≈ 145 µm²', en: '≈ 7.5 nm thick · erythrocyte ≈ 145 µm²' },
    structure: {
      zh: '磷脂双层流动镶嵌: 内外小叶脂质不对称（PS/PE 内叶, PC/SM 外叶, 由翻转酶/扰翻酶维护）; 跨膜/外周蛋白镶嵌; 胆固醇调节流动性; 皮层肌动蛋白与脂筏（SM+胆固醇 ordered 相）构成信号平台',
      en: 'A fluid mosaic with leaflet asymmetry (PS/PE inner, PC/SM outer, maintained by flippases/scramblases), cholesterol-tuned viscosity, and raft (SM+cholesterol) signalling platforms wired to the cortical cytoskeleton',
    },
    physiology: {
      zh: '选择性渗透屏障 + 信号换能器阵列: 受体酪氨酸激酶/GPCR/离子通道换能胞外信号; Na⁺/K⁺ 泵维持膜电位（−30~−90 mV）; 囊泡进出（内吞/胞吐）经膜面积循环维持恒定',
      en: 'A selective barrier and transducer array: RTKs, GPCRs and channels convert extracellular cues; the Na⁺/K⁺ pump holds membrane potential (−30 to −90 mV); endo/exocytosis recycles membrane area homeostatically',
    },
    clinic: {
      zh: '绝大多数药物靶点为膜蛋白（~60% 现行药物靶点!）; 镰刀型贫血即膜脂不对称崩溃（PS 外翻 → 凝血级联）; 膜抗原分型（血型/CD 簇）是输血与免疫分型基础',
      en: 'About 60% of modern drugs target membrane proteins; sickled erythrocytes lose lipid asymmetry (PS exposure, procoagulant); blood-group and CD antigens underpin transfusion and immunophenotyping',
    },
    marker: { zh: 'CellMask 深染 · Caveolin（小凹）· Na⁺/K⁺ ATPase', en: 'CellMask · Caveolin (caveolae) · Na⁺/K⁺ ATPase' },
    accent: 'rose',
  },
  {
    latin: 'Glycocalyx',
    zh: '糖萼',
    group: 'surface',
    size: { zh: '厚度 10–500 nm（内皮最厚）· 覆盖所有真核细胞表面', en: '10–500 nm thick (deepest on endothelia)' },
    structure: {
      zh: '质膜外被多糖绒层: 膜蛋白/脂的糖链（N-/O-连接聚糖）+ 蛋白聚糖 GAG 链（硫酸乙酰肝素/硫酸软骨素）+ 吸附的分泌型黏蛋白; 唾液酸终末带负电荷',
      en: 'A polysaccharide felt atop the membrane: N-/O-linked glycans of proteins and lipids plus proteoglycan GAG chains (heparan sulfate, chondroitin sulfate) with adsorbed mucins; terminal sialic acids confer net negative charge',
    },
    physiology: {
      zh: '机械缓冲与润滑（关节滑液糖萼）; 分子筛效应限制接近膜的大分子; 病原体受体相似物（模拟识别位）与选择素配体的「滚动锚」; 甘露糖/唾液酸模式被先天免疫凝集素读取',
      en: 'Cushion and lubricant; a size-selective sieve for approaching macromolecules; it carries selectin ligands for leucocyte rolling and decoy receptors for pathogens; lectins of innate immunity read its glycan patterns',
    },
    clinic: {
      zh: '肿瘤异常糖基化（sialyl-LewisX 增高 → 促转移与免疫逃逸）; 内皮糖萼脱落是脓毒症/糖尿病血管并发症早期事件; 红细胞糖萼即 ABO 血型抗原基础',
      en: 'Tumour glycans (sialyl-LewisX) drive metastasis and immune evasion; sepsis and diabetes shed the endothelial coat early; the erythrocyte glycocalyx is the ABO blood group chemistry',
    },
    marker: { zh: 'WGA/ConA 凝集素染色 · Heparan sulfate · MUC 家族', en: 'WGA/ConA lectins · Heparan sulfate · MUC family' },
    accent: 'rose',
  },
  {
    latin: 'Polysomes',
    zh: '多聚核糖体',
    group: 'endomembrane',
    size: { zh: '核糖体 Ø 25–30 nm · 一条 mRNA 上 3–30 个（间距 ≈ 80 nt）', en: 'Ribosome Ø 25–30 nm · 3–30 per mRNA' },
    structure: {
      zh: '一条 mRNA 上等距排布的核糖体串: 平面螺旋（胞质 mRNA）或沿 sER 膜刻痕列队（信号肽 mRNA）; 大小亚基 40S+60S=80S; rRNA 催化中心（核酶本质）',
      en: 'Ribosomes queued at ~80-nt spacing along one mRNA: planar spirals in the cytosol or rows on ER membranes; 40S+60S=80S with the rRNA core as the actual catalyst',
    },
    physiology: {
      zh: '翻译吞吐引擎: 多核糖体并行解码同一 mRNA → 蛋白产率放大数十倍; 游离型合成胞质/核/线粒体蛋白, 膜结合型经 SRP 共翻译入 rER; mTORC1 经 4E-BP/S6K 磷酸化调谐整体翻译速率',
      en: 'The throughput engine of translation — dozens of ribosomes amplify protein yield per message; free polysomes make cytosolic/nuclear/mitochondrial proteins while membrane-bound ones co-translationaly enter rough ER; mTORC1 dials global output via 4E-BP/S6K',
    },
    clinic: {
      zh: '多聚体/单体比值是肝合成功能经典化验（肝病下降）; 催吐毒素（蓖麻蛋白 A 链）灭活 60S 大亚基 GTP 酶依赖步骤; 一批抗生素（大环内酯/四环素/氨基糖苷）靶点即细菌核糖体差异位点',
      en: 'The polysome/monosome ratio is a classic liver-function readout; ricin A chain depurinate the 60S scaffold; macrolides, tetracyclines and aminoglycosides exploit bacterial-ribosome differences',
    },
    marker: { zh: 'RPLP0 · puromycin 标记新生链 · O-propargyl-puromycin 探针', en: 'RPLP0 · puromycylated nascent chains (OPP probe)' },
    accent: 'teal',
  },
  {
    latin: 'Glycogen rosette',
    zh: '糖原玫瑰结',
    group: 'energy',
    size: { zh: '颗粒 Ø 10–40 nm（β 颗粒聚成 α 玫瑰结, 可达 0.1 µm）', en: 'β particles 10–40 nm, α rosettes to 0.1 µm' },
    structure: {
      zh: '葡萄糖以 α-1,4 糖苷键线性聚合 + α-1,6 分支（每 4–6 残基一分支 → 树状爆破形）层层放大; 糖原蛋白自引物起始; 颗粒结合糖原磷酸化酶/合酶/脱支酶与调节激酶',
      en: 'Glucose polymerized α-1,4 with α-1,6 branches every 4–6 residues — an explosively arborescent bush started from glycogenin; phosphorylase, synthase and debranching enzymes ride the particle',
    },
    physiology: {
      zh: '葡萄糖快取储蓄: 肝糖原 ~100 g 维持血糖（G6P 酶去磷酸后输出）, 肌糖原 ~400 g 只供自身收缩（缺 G6P 酶）; 磷酸化酶-合酶经 PKA/CaMK/AMPK 双向激素调控（肾上腺素 vs 胰岛素）',
      en: 'Rapid glucose reserve: ~100 g hepatic glycogen buffers blood glucose (G6Pase-expressing), ~400 g muscle glycogen is strictly local (no G6Pase); phosphorylase/synthase toggle through PKA, CaMK and AMPK under adrenaline-versus-insulin control',
    },
    clinic: {
      zh: '糖原贮积症谱系（von Gierke Ia = G6P 酶; McArdle V = 肌磷酸化酶; Pompe II = 溶酶体 α-葡糖苷酶, 即「婴儿型心肥大」）; 糖尿病可见肝细胞核内糖原空泡（糖原核）',
      en: 'Glycogen storage diseases (von Gierke Ia G6Pase, McArdle V muscle phosphorylase, Pompe II lysosomal α-glucosidase); diabetic «glycogen nuclei» appear in hepatocytes',
    },
    marker: { zh: 'PAS 染色（过碘酸-雪夫）· Glycogenin · GS（合酶）', en: 'PAS stain · Glycogenin · Glycogen synthase' },
    accent: 'amber',
  },
  /* ============ v61 特化结构续编（HOVER_TARGETS 特化清单 → ORG_ATLAS） ============ */
  {
    latin: 'Peripheral rough ER',
    zh: '外周粗面内质网',
    group: 'endomembrane',
    size: { zh: '管网 Ø ≈ 60–100 nm · 从核周延伸至皮层（占胞质体积 5–15%）', en: 'Tubules Ø ≈ 60–100 nm · perinuclear to cortex' },
    structure: {
      zh: '核周囊池向外延伸的三维管网: 粗面（核糖体满铺）与滑面（无核糖体）区段在同一连续膜上交替; 管网由 RTN（reticulon）/DP1 曲率蛋白塑造, 肌球蛋白-微管马达牵引滑动重塑',
      en: 'A continuous 3-D lattice running from perinuclear cisternae to the cortex: rough (ribosome-studded) and smooth tracts alternate on one membrane, tubulated by RTN/DP1 curvature proteins and remodelled by motor-driven sliding',
    },
    physiology: {
      zh: '分泌蛋白/膜蛋白合成的分散车间（就近投递原则减少运输距离）; ER 网络兼作 Ca²⁺ 瞬时缓冲库与脂质分配干道; 与线粒体形成 ER-线粒体接触点（MAM）交换钙与脂',
      en: 'Decentralized factories for secretory and membrane proteins (shortening delivery distance); the lattice doubles as a Ca²⁺ buffer and lipid-distribution highway, and ER–mitochondria contacts (MAMs) exchange calcium and lipids',
    },
    clinic: {
      zh: '未折叠蛋白应答（UPR）传感器（IRE1/ATF6/PERK）分布全管网 —— 合成应激超载时启动凋亡开关; ER 磷酸酶 SERCA 与肌萎缩侧索硬化/帕金森病蛋白稳态相关',
      en: 'UPR sensors (IRE1/ATF6/PERK) stud the whole lattice and flip apoptotic switches under secretory overload; SERCA and ER proteostasis link to ALS and Parkinson disease',
    },
    marker: { zh: 'Sec61β（易位子）· Calnexin · Rtn4（reticulon）', en: 'Sec61β (translocon) · Calnexin · Rtn4' },
    accent: 'teal',
  },
  {
    latin: 'Cytoplasmic actin network',
    zh: '胞质肌动蛋白网',
    group: 'cytoskeleton',
    size: { zh: '细丝 Ø ≈ 7 nm · 肌动蛋白占胞质蛋白总量 1–5%', en: 'Filaments Ø ≈ 7 nm · actin is 1–5% of cell protein' },
    structure: {
      zh: '球形 G-肌动蛋白 ATP 酶循环聚合为双螺旋 F-丝; 正端（倒刺端）快速伸长、负端解离 → 「踏车」循环; Arp2/3 复合体在母丝侧方分支成 Y 型网; 丝长由加帽蛋白（CapZ/gelsolin）与切断蛋白（cofilin）调谐',
      en: 'G-actin treadmills into two-stranded helical F-filaments with fast barbed-end growth; Arp2/3 branches daughter filaments into Y-junctioned meshes, while cappers (CapZ, gelsolin) and severing cofilin tune filament length',
    },
    physiology: {
      zh: '皮层张力与形态的「液态骨架」: 应力纤维牵拉黏着斑、丝足/片足探索基质、内吞领口收缩; 马达蛋白肌球蛋白家族沿丝行走产生收缩; Rho 家族 GTP 酶（RhoA/Rac1/Cdc42）分区开关网络形态',
      en: 'The liquid skeleton of the cortex: stress fibers pull on focal adhesions, filopodia and lamellipodia explore substrate, and endocytic collars constrict; myosin motors walk the filaments while Rho-family GTPases zone the network architecture',
    },
    clinic: {
      zh: '细胞迁移失控是肿瘤转移引擎（Rac/Cdc42 过度活化）; 细胞松驰素/latrunculin 剥蚀肌动网 → 凋亡或停滞; 肌动蛋白突变致 Baraitser-Winter 综合征（脑畸形+耳聋）',
      en: 'Derailed migration (hyperactive Rac/Cdc42) powers metastasis; cytochalasins and latrunculin poison the network; ACTB/G1 mutations cause Baraitser–Winter syndrome',
    },
    marker: { zh: 'Phalloidin（F-丝特异）· Arp3 · Cofilin pSer3', en: 'Phalloidin (F-actin) · Arp3 · Cofilin pSer3' },
    accent: 'slate',
  },
  {
    latin: 'CGN · cis-Golgi network',
    zh: '顺面高尔基网（CGN）',
    group: 'endomembrane',
    size: { zh: '管网厚 ≈ 60–80 nm · 覆盖顺面 ≈ 1–2 µm² 入货面', en: '≈ 60–80 nm tubules across the cis entry face' },
    structure: {
      zh: '高尔基垛堆顺面（面向内质网）的疏松管网帽: 与 ER 出口位点（ERES）借 COPII 小泡与「内质网-高尔基中间 compartment（ERGIC）」接力; 弯月形囊池边缘穿孔成管',
      en: 'A perforated tubular cap over the cis-most cisterna, fed from ER exit sites through COPII vesicles and the ER–Golgi intermediate compartment (ERGIC)',
    },
    physiology: {
      zh: '入货码头: 接收新生分泌货物并执行首轮修饰 —— 高甘露糖型 N-糖修剪（甘露糖苷酶 I）、未折叠货物的质量回收（KDEL 受体逆向抓取逃逸 ER 蛋白）; COPI 外被 retrograde 运输返航膜成分',
      en: 'The receiving dock: first-pass glycan trimming (mannosidase I) and quality control that retrieves escaped ER residents via KDEL receptors; COPI coats run the retrograde return of membrane components',
    },
    clinic: {
      zh: 'COPII 组分突变 → 软骨营养不良（SED 楔形变, 分泌胶原滞留）; GM130 golgin 自身抗体见于风湿病与肿瘤副癌综合征（神经系统）',
      en: 'COPII component mutations cause skeletal dysplasias (secreted collagen retained); anti-GM130 autoantibodies mark rheumatic disease and paraneoplastic neurologic syndromes',
    },
    marker: { zh: 'GM130 · Rab2 · KDEL 受体（ERGIC/CGN）', en: 'GM130 · Rab2 · KDEL receptor' },
    accent: 'teal',
  },
  {
    latin: 'TGN · trans-Golgi network',
    zh: '反面高尔基网（TGN）',
    group: 'endomembrane',
    size: { zh: '管网厚 ≈ 80–100 nm · 出货面面积 ≈ 入货面 2 倍', en: '≈ 80–100 nm tubules, ~2× the cis face area' },
    structure: {
      zh: '高尔基垛堆反面（面向质膜）的多穿孔管网: clathrin/AP1 网格蛋白被膜与 GGA 接头在此出芽; 酸性梯度由 V-ATP 酶部分建立（pH ≈ 6.0）; 人类细胞常为独立于垛堆的分散管网',
      en: 'The perforated exit network on the trans face: clathrin/AP1 and GGA adaptors bud carriers here; a V-ATPase establishes a mildly acidic lumen (pH ≈ 6.0); in human cells TGN tubules often detach from the stack',
    },
    physiology: {
      zh: '分拣枢纽「三航线岔口」: ① 组成型分泌泡直送质膜; ② 网格蛋白囊泡（M6P 标记）携溶酶体酶奔内体; ③ 调节型分泌颗粒（内分泌/神经细胞）待刺激胞吐; 蛋白聚糖与 O-连接糖链的终末修饰（唾液酸化/岩藻糖化）在此完成',
      en: 'The three-route sorting switch: constitutive vesicles straight to the plasma membrane, clathrin carriers bearing M6P-tagged lysosomal enzymes toward endosomes, and regulated secretory granules held for stimulus; terminal sialylation and fucosylation finish here',
    },
    clinic: {
      zh: 'TGN 是外毒素逆向运输关键站台（霍乱/志贺毒素经 retrograde 入 ER）; GOLGA/giantin 自身抗体见于干燥综合征; SARS-CoV-2 复制复合物驻留 ERGIC-TGN 膜系',
      en: 'Retrograde traffic of cholera and Shiga toxins passes through the TGN to reach ER; anti-giantin antibodies mark Sjögren syndrome; SARS-CoV-2 replication organelles colonize ERGIC–TGN membranes',
    },
    marker: { zh: 'TGN46 · Rab6 · Clathrin/AP1 · CI-M6P 受体', en: 'TGN46 · Rab6 · Clathrin/AP1 · CI-M6P receptor' },
    accent: 'teal',
  },
  {
    latin: 'Secretory transport (TGN→PM)',
    zh: '组成型分泌运输',
    group: 'endomembrane',
    size: { zh: '载体 Ø 100–300 nm · 巡航速度 ≈ 1–4 µm/s（马达驱动）', en: 'Carriers Ø 100–300 nm · 1–4 µm/s' },
    structure: {
      zh: 'TGN 出芽的无外被分泌载体: 囊泡外被仅短暂 COP/网格蛋白残迹; 出芽后招募连接蛋白（如 exocyst 的 Sec6/8 停靠复合体）与 Rab 家族 GTP 酶组成身份标签',
      en: 'Uncoated TGN-budded carriers whose identity is written by Rab GTPases and tether complexes (exocyst Sec6/8) rather than a persistent coat',
    },
    physiology: {
      zh: '默认航线（不排队不审批）: 膜脂/膜蛋白/胞外基质蛋白持续外送, 维持质膜面积稳态; 载体沿微管（kinesin 外向马达）巡航, 临近皮层换肌动蛋白短驳; SNARE 螺旋拉链驱动融合释放货物',
      en: 'The default route — no waiting, no gate: membrane lipid, membrane protein and ECM cargo stream outward to hold plasma-membrane area steady; kinesins haul carriers along microtubules, actin handles the last metres, and SNARE zippers drive fusion',
    },
    clinic: {
      zh: '病毒出芽窃用组成型分泌机器（流感 HA/HIV Gag 出芽位）; Sec8/exocyst 错位见于转移性乳腺癌; 囊性纤维化 CFTR 折叠失败即滞留于 ER-TGN 段无法面膜',
      en: 'Viruses pirate the route for budding (influenza HA, HIV Gag); exocyst mislocalization marks metastatic breast cancer; misfolded CFTR is the classic cargo that never reaches the surface',
    },
    marker: { zh: 'Rab8/Rab10 · Sec8（exocyst）· SNAP23/STX4 SNARE', en: 'Rab8/Rab10 · Sec8 (exocyst) · SNAP23/STX4 SNAREs' },
    accent: 'teal',
  },
  {
    latin: 'Microvilli',
    zh: '微绒毛（刷状缘）',
    group: 'specialized',
    size: { zh: '长 ≈ 1–2 µm · Ø ≈ 100 nm · 每小肠上皮细胞 ~3,000 根（面积放大 20×）', en: '1–2 µm long, Ø ≈ 100 nm · ~3,000 per enterocyte (20× surface)' },
    structure: {
      zh: '质膜指状突起的核心是 20–30 根平行肌动蛋白束（绒毛蛋白/丝束蛋白横向交联）, 根部插入终末网横向丝网; 束尖端由 ezrin-膜接头悬挂于膜内侧面; 表面覆糖萼与消化酶锚',
      en: 'Each projection is cored by 20–30 parallel actin filaments cross-linked by villin and fimbrin, rooted in the terminal web; ezrin tethers the bundle tip to the membrane, and the coat carries anchored digestive enzymes',
    },
    physiology: {
      zh: '吸收极性的表面积放大器（肠吸收 20 倍/近曲小管 15 倍刷状缘）; 指缘蛋白肌球蛋白-1a 使膜沿束下滑实现快速更新; 也是机械感受与「糖萼-酶锚」消化平台',
      en: 'Polarity-driven surface amplifiers — a 20× intestinal and 15× proximal-tubule brush border; myosin-1a keeps the membrane sliding along the core for rapid renewal, and the border doubles as a mechano-sensing digestive platform',
    },
    clinic: {
      zh: '乳糜泻绒毛萎缩 → 吸收不良; MYO1A 突变致进行性失聪（毛细胞静纤毛同为肌动束突起）; 肠道菌群定植沿微绒毛间隙靶向',
      en: 'Coeliac atrophy flattens the border into malabsorption; MYO1A mutations cause progressive deafness (stereocilia share the design); commensal colonization targets intermicrovillar space',
    },
    marker: { zh: 'Villin · Fimbrin · Myosin-1a · EBP50', en: 'Villin · Fimbrin · Myosin-1a · EBP50' },
    accent: 'amber',
  },
  {
    latin: 'Terminal web',
    zh: '终末网',
    group: 'specialized',
    size: { zh: '厚 ≈ 0.1–0.2 µm · 横贯细胞顶端胞质', en: '≈ 0.1–0.2 µm thick across the apical cytoplasm' },
    structure: {
      zh: '微绒毛根束尖端张开散开的横向肌动蛋白网: 与肌球蛋白-II 双极丝、血影蛋白交联器混编; 网缘附着中间丝（角蛋白束）与连接复合体（紧密连接/桥粒）的胞质面',
      en: 'Horizontal actin mesh into which microvillar rootlets splay, interwoven with bipolar myosin-II filaments and spectrin cross-links; keratin bundles and junctional complexes anchor its margins',
    },
    physiology: {
      zh: '刷状缘的地基与张力均压器: 收缩可整体改变刷状缘角度（流动性微调吸收面）; 为微绒毛束提供机械锚定与侧向间隔（栅栏效应防止根束缠绕）; 参与顶端囊泡运输的路由',
      en: 'The brush border foundation and tension equalizer — its contraction re-aims the whole border and paces absorption; it anchors and fences the rootlets, and routes apical vesicle traffic',
    },
    clinic: {
      zh: '肌球蛋白-II 重链或血影蛋白缺陷 → 微绒毛倒伏/簇化（失渗漏性腹泻模型）; 终末网是细菌肠毒素（C. difficile TcdB）肌动蛋白解聚的靶区之一',
      en: 'Myosin-II or spectrin loss flattens and clumps microvilli (secretory diarrhea models); the web is a target zone of actin-disrupting toxins such as C. difficile TcdB',
    },
    marker: { zh: 'Myosin-II · Spectrin β（非红细胞）· Tropomyosin', en: 'Myosin-II · β-spectrin (non-erythroid) · Tropomyosin' },
    accent: 'amber',
  },
  {
    latin: 'Tight junction',
    zh: '紧密连接（封闭索）',
    group: 'specialized',
    size: { zh: '封闭索 Ø ≈ 10 nm · 网孔残留 <1–2 nm（「紧密」不等 于绝对密封）', en: 'Sealing strands Ø ≈ 10 nm · residual pore <1–2 nm' },
    structure: {
      zh: '相邻细胞质膜对吻的蛋白质「焊线」网络: claudin 家族（≥26 亚型）双链跨膜构成主索, occludin 与 ZO-1/2 支架扣合至皮层肌动蛋白; 环细胞腰带状走行的犬牙交错网',
      en: 'Kissed-together membranes welded by a belt-like anastomosing network of claudin (26+ isoforms) double-strand filaments, occludin, and ZO-1/2 scaffolds clamped onto cortical actin',
    },
    physiology: {
      zh: '上皮栅栏功能双职: ① 封闭细胞旁路（决定跨上皮电阻 TER, 防分子渗漏）; ② 顶-底侧膜蛋白分区（膜蛋白不许翻越连接带 → 极性成立）; claudin 亚型组合决定离子选择性（如肾髓袢 K⁺ 回漏）',
      en: 'Dual epithelial gatekeeper: it seals the paracellular route (setting TER) and fences apical from basolateral membrane proteins — polarity itself; claudin mix defines ion selectivity, e.g. K⁺ backleak in Henle’s loop',
    },
    clinic: {
      zh: '幽门螺杆菌 CagA 与产气荚膜梭菌毒素直接解构 claudin/occludin（腹泻-炎症）; CLDN16/19 突变 → 低镁血症（肾小管镁漏）; 肿瘤转移早期 EMT 使紧密连接整体退役',
      en: 'H. pylori CagA and C. perfringens enterotoxin dismantle claudins outright; CLDN16/19 mutations cause renal magnesium wasting; EMT retires junctions early in metastasis',
    },
    marker: { zh: 'Claudin-1/-4 · Occludin · ZO-1（封闭复合体金标）', en: 'Claudin-1/-4 · Occludin · ZO-1' },
    accent: 'rose',
  },
  {
    latin: 'Desmosome',
    zh: '桥粒',
    group: 'specialized',
    size: { zh: '直径 ≈ 0.2–0.5 µm · 皮层斑厚 ≈ 15–20 nm', en: 'Ø ≈ 0.2–0.5 µm plaque ≈ 15–20 nm' },
    structure: {
      zh: '纽扣式超强黏着: 跨膜 cadherin 家族成员——desmoglein/desmocollin 胞外域钙依赖互扣; 胞质斑由 plakoglobin + desmoplakin 组装, 尾端钳住中间丝（角蛋白）马尾——「铆钉中间丝缆绳」',
      en: 'Button-spot super-adhesion: extracellular desmoglein/desmocollin (cadherin family) interlock calcium-dependently, while a cytoplasmic plaque of plakoglobin and desmoplakin clamps keratin intermediate filaments — rivets for the rope',
    },
    physiology: {
      zh: '组织抗张强度的机械保险（心肌/表皮/子宫平滑肌富集）: 应力分散入中间丝网防撕裂; 与半桥粒（基膜侧）构成「细胞-细胞 / 细胞-基质」双锚系统; PKA 磷酸化即时调松紧',
      en: 'Mechanical insurance of tissue tensile strength (rich in myocardium, epidermis, uterus): stress is dissipated into the intermediate-filament lattice; paired with hemidesmosomes it completes the dual anchorage system',
    },
    clinic: {
      zh: '天疱疮自身抗体打靶 desmoglein-3/1 → 皮肤水疱（棘层松解）; 心肌 desmoplakin 突变 → 致心律失常性右室心肌病（ARVC）; 治疗性抗 EGFR/抗 PD-1 药物可诱发苔藓样桥粒损伤',
      en: 'Pemphigus autoantibodies against desmoglein-3/1 cause acantholytic blisters; desmoplakin mutations underlie arrhythmogenic right-ventricular cardiomyopathy; EGFR and PD-1 inhibitors can trigger lichenoid desmosomal injury',
    },
    marker: { zh: 'Desmoglein 1/3 · Desmoplakin I/II · Plakoglobin', en: 'Desmoglein 1/3 · Desmoplakin I/II · Plakoglobin' },
    accent: 'rose',
  },
  {
    latin: 'Basal lamina',
    zh: '基底膜（基板）',
    group: 'specialized',
    size: { zh: '基板厚 ≈ 50–100 nm（+网板则总厚 0.1–1 µm）', en: 'Lamina ≈ 50–100 nm (+ reticular layer)' },
    structure: {
      zh: '「层粘连蛋白-IV 型胶原自组装织物」: LN 三臂与巢蛋白交联成二维网格, IV 型胶原网夹层其间, perlecan 硫酸乙酰肝素蛋白聚糖充填; 由上方上皮而非下方结缔组织分泌——属上皮自己的产品',
      en: 'A self-assembling weave of laminin three-armed and type-IV collagen networks stitched by nidogen and cushioned with perlecan; secreted by the epithelium itself, not the stroma below',
    },
    physiology: {
      zh: '上皮的极性基准面与滤膜: LN-整联蛋白（α6β4 经半桥粒）信号决定基底侧身份; 大分子滤过屏障（肾小球滤膜三层之一）; 生长因子库（VEGF/FGF 结合于肝素链富集区）; 创伤后 perlecan/LN 网最先重建',
      en: 'The polarity datum and filter: laminin–integrin signalling (α6β4 via hemidesmosomes) assigns basal identity; it is one leaflet of the glomerular filter and a heparan-bound reservoir of VEGF/FGF; the lamina is first rebuilt after wounding',
    },
    clinic: {
      zh: 'Goodpasture 综合征抗 IV 型胶原 α3 链 → 肺出血-肾炎; 糖尿病基底膜异常增厚（视网膜/肾小球）→ 微血管并发症; 层粘连蛋白-332 大疱性表皮松解症突变 → 生后致死性皮肤脆弱',
      en: 'Goodpasture antibodies against collagen IV α3 chain cause lung–kidney syndromes; diabetic thickening wrecks glomeruli and retina; laminin-332 junctional epidermolysis bullosa is perinatally lethal fragility',
    },
    marker: { zh: 'Laminin（α/β/γ 链）· Collagen IV · Perlecan', en: 'Laminin chains · Collagen IV · Perlecan' },
    accent: 'rose',
  },
  {
    latin: 'Bile canaliculus',
    zh: '胆小管',
    group: 'specialized',
    size: { zh: 'Ø ≈ 0.5–1 µm · 肝细胞板内两细胞对合围成', en: 'Ø ≈ 0.5–1 µm between hepatocyte pairs' },
    structure: {
      zh: '相邻两肝细胞顶膜对合的毛细管道: 腔面密布微绒毛; 两侧以紧密连接封索锁边（胆-血屏障）; 桥粒与黏着连接在外周加固为连接复合体; 管-膜界面锚定 MRP2/A BCB1 转运体',
      en: 'A hairline canal formed by two apposed apical membranes, microvilli-lined and sealed by tight-junction belts (the blood–bile barrier) with desmosomes reinforcing the rim; canalicular transporters MRP2/ABCB11 stud the lining',
    },
    physiology: {
      zh: '胆汁定向分泌的终端管道: 肝细胞将胆盐/胆红素葡萄糖醛酸酯经 ABC 转运体泵入管腔 → 小管收缩（肌动蛋白-肌球蛋白泵）蠕动推送 → 赫令管 → 胆管; 紧密连接失效则胆汁返流入血（黄疸机制之一）',
      en: 'The terminal duct of vectorial bile secretion: ABC pumps load canalicular bile salts and conjugated bilirubin, an acto-myosin pump peristalses the fluid toward canals of Hering; junction failure regurgitates bile into blood',
    },
    clinic: {
      zh: '胆汁淤积性肝病（妊娠 IC P/药物性）即小管泵/封闭索失效; MDR3/ABCB4 突变 → 低磷脂胆石症; 剖视肝板见胆小管网断裂是肝毒性病理金标准之一',
      en: 'Cholestatic disorders (intrahepatic cholestasis of pregnancy, drug injury) mark pump or seal failure; ABCB4/MDR3 mutation causes low-phospholipid cholelithiasis; canalicular disruption is a classic readout of hepatotoxicity',
    },
    marker: { zh: 'MRP2/ABCC2 · BSEP/ABCB11 · ZO-1 · CK7（胆管分化）', en: 'MRP2/ABCC2 · BSEP/ABCB11 · ZO-1 · CK7' },
    accent: 'amber',
  },
  {
    latin: 'Binucleate (~25%)',
    zh: '双核肝细胞',
    group: 'specialized',
    size: { zh: '成人肝 ≈ 25–30% 双核 · 老年与病理态升至 >50%', en: '≈ 25–30% of adult hepatocytes, rising >50% with age' },
    structure: {
      zh: '单个巨大细胞内两个独立间期核（各含完整二倍体基因组）: 两核各自保留核被膜/核仁; 源自胞质分裂未完成 —— 有丝分裂末期收缩环未缢断而核分裂已完成（也可经核内复制再分裂）',
      en: 'Two independent interphase nuclei, each diploid, in one cytoplasm — the mitotic nuclear division finished while the cytokinetic ring never cut through; endoreduplication then division is an alternative route',
    },
    physiology: {
      zh: '肝强大的再生与代谢冗余表现: 双核细胞代谢通量倍增、可「一分为二」再进入单核池（反向补给）; 哺乳动物心肌与肝都属终末分化冗余策略; 肝板损伤时双核细胞优先再进入细胞周期',
      en: 'A badge of hepatic redundancy: doubled metabolic throughput, the ability to cleave back into mononuclear progeny, and priority cell-cycle re-entry during liver regeneration',
    },
    clinic: {
      zh: '双核比例是肝再生活性的病理计量指标（肝切除术后升高）; 慢性损伤/酒精肝向多倍体-多核演化（巨细胞变）; 与肝细胞癌倍体异质性相关',
      en: 'Binucleation indexes regenerative activity (spikes post-hepatectomy); chronic injury and alcohol drive polyploid giant-cell change, feeding hepatocellular-carcinoma heterogeneity',
    },
    marker: { zh: '免疫组化两核 Ki-67 同步与否 · 泛核标记 DAPI ×2 计数', en: 'Synchronous/discoordinate Ki-67 in twin nuclei · DAPI count' },
    accent: 'emerald',
  },
  {
    latin: 'Myelinated axon',
    zh: '髓鞘轴突（郎飞氏结）',
    group: 'specialized',
    size: { zh: '髓鞘厚 ≈ 轴突直径的 25%（g 比值 ≈ 0.6）; 结间体长 0.2–2 mm', en: 'Sheath ≈ 25% of axon calibre (g-ratio ≈ 0.6) · internodes 0.2–2 mm' },
    structure: {
      zh: '少突胶质细胞（CNS）或施万细胞（PNS）质膜螺旋包裹轴突: 致密髓磷脂堆叠成绝缘层; 结间体两端暴露轴膜成郎飞氏结（Nav 通道密集）; 结旁"卡箍"（Caspr/4.1B）锁住髓鞘边缘防离子渗漏',
      en: 'Oligodendrocyte (CNS) or Schwann-cell (PNS) membrane spiralled into compact myelin; nodes of Ranvier bare the axon between internodes, crowded with Nav channels, while paranodal Caspr/4.1B loops clamp the sheath edges',
    },
    physiology: {
      zh: '跳跃传导: 动作电位只在结间再生 → 传导速度提升至 100 m/s（较无髓纤维 100 倍）且能耗锐减（仅结部泵 Na⁺）; 髓鞘同时供给轴突代谢营养（乳酸穿梭）支持长轴突存活',
      en: 'Saltatory conduction — spikes regenerate only at nodes, reaching 100 m/s at a hundred-fold energy saving; myelin also lactate-shuttles metabolic support along the axon',
    },
    clinic: {
      zh: '多发性硬化即自身免疫脱髓鞘（视力/运动/感觉发作）; 白喉毒素断裂施万细胞蛋白合成 → 周围脱髓瘫; GBS 蛋印迹始于结旁解锚; 拨髓鞘化失败是脑白质营养不良（如佩-梅病 PLP1）',
      en: 'Multiple sclerosis is autoimmune demyelination; diphtheria toxin stalls Schwann protein synthesis; GBS begins with paranodal de-anchoring; failure of myelination itself underlies Pelizaeus–Merzbacher (PLP1) leukodystrophy',
    },
    marker: { zh: 'MBP（髓鞘碱性蛋白）· PLP · Nav1.6（结）· Caspr（结旁）', en: 'MBP · PLP · Nav1.6 (node) · Caspr (paranode)' },
    accent: 'fuchsia',
  },
  {
    latin: 'Basal dendrite',
    zh: '基底树突（棘突）',
    group: 'specialized',
    size: { zh: '锥体神经元 4–6 支基树突 · 每支再分 3–5 级 · 总长可逾 1 mm', en: '4–6 basal arbors per pyramidal neuron · >1 mm total' },
    structure: {
      zh: '胞体基部辐射伸展的分支树: 主干含 MAP2 微管束 + 神经丝; 分支递减中轴突规则失效（微管双向混合取向）; 整面缀满蘑菇/细长/粗短三型树突棘（每个 0.5–2 µm 蘑菇柄+球头）',
      en: 'Arborizing trees radiating from the soma base: MAP2-bound microtubules with mixed polarity in branches, their whole surface studded with mushroom, thin and stubby spines (0.5–2 µm each)',
    },
    physiology: {
      zh: '神经元 90%+ 突触输入的接收面: 树突棘是生化微舱（孤立钙事件 → 局部可塑性）; 棘颈粗细门控突触电位衰减 —— LTP 学习伴随棘头膨大/新棘生长; 树突自身可发局部反传锋（树突计算）',
      en: 'The receiving surface for >90% of synaptic input: each spine is a biochemical microcompartment hosting local plasticity, neck geometry gates signal decay, and LTP grows spine heads — dendrites even fire local backpropagating spikes',
    },
    clinic: {
      zh: '精神分裂症/自闭症谱系的「树突棘修剪异常」; Fragile X 综合征棘密度异常高（成熟蘑菇棘少）; 兴奋性毒性早期棘丢失 → 癫痫回路重塑',
      en: 'Schizophrenia and autism spectrum show pruning anomalies; fragile-X spines stay dense and immature; excitotoxicity strips spines early, rewiring epileptic circuits',
    },
    marker: { zh: 'MAP2 · PSD-95（棘头致密）· Spinophilin · GFP 形态填充', en: 'MAP2 · PSD-95 · Spinophilin · GFP fill' },
    accent: 'fuchsia',
  },
  {
    latin: 'Synaptic bouton',
    zh: '突触扣结',
    group: 'specialized',
    size: { zh: 'Ø 0.5–2 µm · 突触活性区 Ø ≈ 0.3 µm · 囊泡池 10⁵ 数量级', en: 'Ø 0.5–2 µm · active zone Ø ≈ 0.3 µm · ~10⁵ vesicles' },
    structure: {
      zh: '轴突末梢的球状膨大: 突触前膜密布活性区（Piccolo/Bassoon 支架网格精确锚定 Ca²⁺ 通道于囊泡释放位 20 nm 内）; 清亮突触囊泡（Ø ≈ 40 nm, 谷氨酸/GABA）+ 致密核心大致密芯囊泡（神经肽）双池',
      en: 'A terminal swell harbouring the active zone — Piccolo/Bassoon scaffolds pin Ca²⁺ channels within 20 nm of docked vesicles — plus a clear-vesicle transmitter pool and dense-core neuropeptide granules',
    },
    physiology: {
      zh: '化学突触换能器: 动作电位 → Ca²⁺ 瞬时入流（vSNARE 触发 SNARE 拉链亚毫秒同步释放）→ 量子化递质扩散 20 nm 突触间隙; 囊泡经「 kiss-and-run/全融合」后网格蛋白回收再充填（维持高频发放）',
      en: 'The chemical transducer: an incoming spike lets Ca²⁺ rush in, triggering SNARE-driven quantal release across the 20-nm cleft in sub-millisecond synchrony; vesicles recycle by kiss-and-run or full collapse to sustain firing',
    },
    clinic: {
      zh: '肉毒毒素切割 SNARE（BoNT 切 VAMP/Syntaxin/SNAP-25）→ 麻痹性的治疗应用; 突触前 α-突触核蛋白聚集是帕金森病理早期事件; 癫痫发作性衰竭即扣结囊泡池耗竭',
      en: 'Botulinum toxins cleave SNAREs for therapeutic paralysis; presynaptic α-synuclein aggregates seed Parkinson disease; seizure run-down is bouton vesicle-pool exhaustion',
    },
    marker: { zh: 'Synaptophysin · Bassoon · Synapsin I · VGLUT1/VGAT', en: 'Synaptophysin · Bassoon · Synapsin I · VGLUT1/VGAT' },
    accent: 'fuchsia',
  },
  {
    latin: 'Apical tuft',
    zh: '顶端树突丛',
    group: 'specialized',
    size: { zh: '层 1 主束 + 二级扇幅 ≈ 300–600 µm · 距胞体 0.5–1 mm', en: 'Layer-1 bouquet ≈ 300–600 µm wide, 0.5–1 mm from soma' },
    structure: {
      zh: '锥体神经元顶树突主干穿皮质全层直达第一层的扇形分支丛: 主干沿途发出侧枝（斜枝）; 顶端缺树突棘而丛部密集; 与 Cajal-Retzius 细胞和丘脑-皮层第一层输入形成特化突触',
      en: 'The apical trunk climbs the cortical column to layer 1, where it blossoms into a spine-studded tuft receiving dedicated thalamic and Cajal–Retzius inputs',
    },
    physiology: {
      zh: '皮层柱的「顶层天线」: 接受自上而下的反馈（高级皮层）与丘脑非特异投射的「放大器」输入; 顶丛 NMDA 峰叠加躯体锋 → 「协同发放」检出（感觉与记忆关联检测的耦合器）; 顶丛活跃时整个神经元可塑性被解锁',
      en: 'The column’s top antenna: bottom-up feedback and nonspecific thalamic drive converge here, NMDA spikes in the tuft couple to somatic firing for coincidence detection and gate whole-cell plasticity',
    },
    clinic: {
      zh: '顶丛发育畸形见于无脑回/皮质发育不良（癫痫源头）; 精神分裂症顶树突主干长度与丛复杂度下降; 睡眠纺锤波与顶丛钙事件耦合异常是精神疾病生物标志研究方向',
      en: 'Tuft maldevelopment accompanies lissencephaly and focal dysplasia (epileptogenic); schizophrenia shortens apical trunks; sleep-spindle-to-tuft coupling is an emerging psychiatric biomarker',
    },
    marker: { zh: 'LAMP5（中间神经元特异输入）· CaMKIIα · Neurogranin（顶丛富集）', en: 'LAMP5 · CaMKIIα · Neurogranin (tuft-enriched)' },
    accent: 'fuchsia',
  },
  {
    latin: 'Myofibril',
    zh: '肌原纤维（肌节）',
    group: 'specialized',
    size: { zh: 'Ø ≈ 1–2 µm · 肌节长 2.2–2.6 µm（心肌端型偏短）· 心肌细胞含 ~50 条', en: 'Ø ≈ 1–2 µm · sarcomere 2.2–2.6 µm · ~50 per cardiomyocyte' },
    structure: {
      zh: '肌节串联的建筑: 粗丝（肌球蛋白 + titin 弹簧中轴）与细丝（肌动蛋白 + 原肌球蛋白 + 肌钙蛋白）六角阵交错; Z 盘 α-辅肌动蛋白锚定细丝; M 线与 A/I 带构成横纹; nebulin 刻度尺规定细丝长度',
      en: 'Sarcomeres in series: thick (myosin + titin spring) and thin (actin–tropomyosin–troponin) filaments interdigitate in hexagonal arrays, Z-discs anchor thin filaments, and nebulin sets their exact length',
    },
    physiology: {
      zh: '横桥循环引擎: Ca²⁺ 与肌钙蛋白 C 结合 → 原肌球蛋白移位暴露肌动结合位 → 粗丝棘轮步进拉 Z 盘靠拢（收缩）; titin 弹性回缩是舒张被动张力来源; 每心肌细胞数百肌节并联串联 → 服从长-张力关系',
      en: 'The cross-bridge engine: Ca²⁺ binds troponin C, tropomyosin shifts, and myosin ratchets the Z-discs together; titin’s recoil supplies passive diastolic tension; series-parallel sarcomeres obey the length–tension curve',
    },
    clinic: {
      zh: '肥厚型心肌病 60%+ 为肌节基因错义突变（MYH7/MYBPC3）; 扩张型心肌病 titin 截断突变（TTNtv）; 肌钙蛋白 T/I 是心肌梗死血清金标准 —— 血中浓度直接反映肌节降解',
      en: 'Hypertrophic cardiomyopathy is mostly sarcomere missense (MYH7/MYBPC3); TTN truncation drives dilated cardiomyopathy; troponins T/I in serum are the infarction gold standard — literally shredded sarcomere',
    },
    marker: { zh: 'α-actinin（Z 盘）· Titin · Myosin heavy chain · α-actin（心肌型）', en: 'α-actinin (Z-disc) · Titin · Myosin heavy chain · cardiac α-actin' },
    accent: 'rose',
  },
  {
    latin: 'Intercalated disc',
    zh: '闰盘',
    group: 'specialized',
    size: { zh: '梯级状横阶 + 纵桥 · 心肌细胞端-端专有连接复合体', en: 'Stepped transverse and longitudinal junctions joining myocyte ends' },
    structure: {
      zh: '心肌端-端复合体三种组分分区布置: ① 桥粒+黏着连接（fascia adherens, N-cadherin 缠 actin）担任机械「铆钉」于横阶; ② 缝隙连接（connexin-43 六聚体半通道对接成 2 nm 水孔）聚居于纵桥端; ③ desmin 中间丝锚入桥粒斑',
      en: 'Three junctions in one stepped disc: desmosomes and N-cadherin fasciae adherentes rivet the transverse steps to actin, while connexin-43 gap junctions cluster on the longitudinal bridges and desmin lashes the plaques',
    },
    physiology: {
      zh: '心肌的机械-电双耦联: 黏着/桥粒将收缩力逐细胞传递（心脏作为合胞体的机械基础）; 缝隙连接 2 nm 孔道允许离子与 cAMP 直接胞间扩散 → 动作电位以 0.3–0.5 m/s 同步扫过全心（电合胞体）; 缺血时连接子磷酸化丢失 → 传导延迟 → 折返性心律失常',
      en: 'Mechano-electrical coupling in one disc: adhesion passes tension cell-to-cell while 2-nm connexon pores let ions and cAMP diffuse — spikes sweep the heart at 0.3–0.5 m/s; ischaemic dephosphorylation of connexins delays conduction and seeds re-entry',
    },
    clinic: {
      zh: '致心律失常性心肌病（ACM）即桥粒组分（plakoglobin/JUP/DSP）突变 → 心肌被脂肪纤维替换; Cx43 重构见于心衰/房颤; 抗连接蛋白毒素模拟物是潜在抗心律失常研究方向',
      en: 'ACM arises from desmosomal mutations (JUP, DSP) replacing myocardium with fibrofat; Cx43 remodelling marks heart failure and atrial fibrillation; connexin-mimetic peptides are anti-arrhythmic candidates',
    },
    marker: { zh: 'Connexin-43 · N-cadherin · Plakoglobin（γ-catenin）· Desmin', en: 'Connexin-43 · N-cadherin · Plakoglobin · Desmin' },
    accent: 'rose',
  },
  {
    latin: 'T-tubule',
    zh: 'T 小管',
    group: 'specialized',
    size: { zh: 'Ø ≈ 20–450 nm（心室最粗）· 每肌节两处 · 深入细胞至 Z 线位', en: 'Ø ≈ 20–450 nm · two per sarcomere at the Z-lines' },
    structure: {
      zh: '质膜内陷成的横行细管网络: 在 Z 线位（心肌）/A-I 交界（骨骼肌）向内凹入; 管腔与细胞外空间直接连续（管内即细胞外液）; 管壁上 L 型钙通道（Cav1.2）与 RyR2 在接点并列成二联体/三联体',
      en: 'Plasma membrane tubules invaginating at Z-lines (cardiac) or A–I junctions, their lumen continuous with extracellular space; Cav1.2 channels on the wall face RyR2 across a 12–15 nm dyadic cleft',
    },
    physiology: {
      zh: '兴奋-收缩耦联的「深水炸弹通道」: 动作电位沿 T 小管直达细胞深处（10 µm 扩散限制被攻克）; L 型钙通道小电流经 12 nm 缝隙 → RyR2 大释放（钙致钙释放放大 10×）→ 全细胞同步收缩; 心肌不依赖胞外钙库（与骨骼肌本质差异）',
      en: 'The excitation–contraction conduit: spikes race down the tubules to the cell core, where a small Cav1.2 current across the 12-nm dyadic gap triggers ten-fold RyR2 calcium-induced calcium release — synchronous contraction without external Ca²⁺ store dependence',
    },
    clinic: {
      zh: '心衰 T 小管网脱构（tubule remodeling）→ E-C 耦联失同步（收缩无力）; Duchenne 肌营养不良 dystrophin 断链 → T 小管畸形; 运动性横纹肌溶解可见 T 小管肿胀裂解',
      en: 'Heart failure detangles the tubular network, desynchronizing E–C coupling; Duchenne dystrophy deforms tubules via dystrophin loss; exertional rhabdomyolysis swells and ruptures them',
    },
    marker: { zh: 'Cav1.2（DHPR）· Junctophilin-2 · Bin1/amphiphysin-2（管形成）', en: 'Cav1.2 (DHPR) · Junctophilin-2 · Bin1/amphiphysin-2' },
    accent: 'rose',
  },
  {
    latin: 'Sarcoplasmic reticulum',
    zh: '肌浆网（SR）',
    group: 'specialized',
    size: { zh: '网管 Ø ≈ 20–40 nm · 环绕每条肌原纤维 · 纵管+终池', en: 'Tubules Ø ≈ 20–40 nm sleeving every myofibril' },
    structure: {
      zh: '肌细胞特化的滑面 ER: 纵行网管沿肌节缠绕 + Z 线/两端膨大终池（与 T 小管构成二联体）; 终池膜密布 RyR1/RyR2 释放通道四方阵; 纵管 SERCA2a 泵 + calsequestrin 腔内钙缓冲蛋白构成储-释-收三件套',
      en: 'Muscle-specialized smooth ER: longitudinal tubules sleeve each sarcomere, terminal cisternae face T-tubules as dyads, RyR square arrays stud the cisternae, and longitudinal SERCA2a pumps with calsequestrin buffers complete the store-release-reuptake triad',
    },
    physiology: {
      zh: '钙循环蓄电池: 舒张期 SERCA（ATP 驱动, 受 phospholamban 抑制调谐）将胞质 Ca²⁺ 回收至腔（calsequestrin 低亲和大量结合 → 每循环转运 ≥2 万离子）; 收缩信号一来 RyR 开闸放钙; β 肾上腺能 PKA 磷酸化 phospholamban 解抑 → 变力效应',
      en: 'The calcium battery: SERCA pumps (ATP-driven, tuned by phospholamban) recharge the lumen where calsequestrin buffers ~20,000 ions per cycle; RyR gates discharge on command, and β-adrenergic PKA disinhibits the pump for positive inotropy',
    },
    clinic: {
      zh: '心肌磷蛋白（PLN）突变 → 家族性扩张型心肌病; 恶性高热 = RyR1 突变麻醉下失控放钙; CASQ2 突变致儿茶酚胺多形室速（CPVT）; 心衰特征之一即 SERCA2a 下调（钙循环衰减）',
      en: 'PLN mutations cause familial dilated cardiomyopathy; malignant hyperthermia is anaesthetic-triggered RyR1 runaway; CASQ2 loss underlies catecholaminergic polymorphic VT; failing hearts downshift SERCA2a',
    },
    marker: { zh: 'SERCA2a · RyR2 · Calsequestrin · Phospholamban', en: 'SERCA2a · RyR2 · Calsequestrin · Phospholamban' },
    accent: 'rose',
  },
  {
    latin: 'Stress fiber',
    zh: '应力纤维',
    group: 'specialized',
    size: { zh: '束径 ≈ 0.2–0.5 µm · 长 2–20 µm · 10–30 根反平行肌动丝', en: 'Bundles Ø ≈ 0.2–0.5 µm · 2–20 µm long' },
    structure: {
      zh: '反平行肌动蛋白束 + 间隔 α-辅肌动蛋白/束凝蛋白横向交联 + myosin-II 双极丝周期插入（形成 0.5 µm 周期「点状」荧光表型）; 两端锚入黏着斑（integrin 聚簇）; 组分含 tropomyosin/calponin 型平滑肌样配比',
      en: 'Anti-parallel actin bundles cross-linked by α-actinin with periodic myosin-II bipolar filaments (the dotted fluorescent banding), both ends terminating in integrin focal adhesions',
    },
    physiology: {
      zh: '细胞牵引力的传导缆绳: 收缩产生 pN–nN 级张力经黏着斑传给胞外基质（机械感受信号源 —— YAP/TAO 通路的上游）; 成纤维细胞的「运动残迹」; RhoA-ROCK 激活 → 应力纤维组装（与片足互斥的迁移极性分工）',
      en: 'The tension cable: contractility in the piconewton-to-nannewton range is delivered to ECM through focal adhesions — the upstream of YAP/TAO mechanosensing; RhoA–ROCK assembles them at the expense of lamellipodia',
    },
    clinic: {
      zh: '病理性心肌纤维化 = 成纤维细胞应力纤维活化 + 胶原沉积; 抗纤维化方向（FAK/ROCK 抑制剂）直击应力纤维-黏着斑轴; 肿瘤相关成纤维细胞（CAF）应力纤维重组促基质刚度梯度',
      en: 'Cardiac fibrosis is fibroblast stress-fibre activation plus collagen deposition; FAK/ROCK inhibitors target the fibre–adhesion axis; carcinoma-associated fibroblasts rewire stress fibres to stiffen matrix highways',
    },
    marker: { zh: 'α-SMA（活化标志）· Vinculin · p-FAK（Y397）· Phalloidin 束纹', en: 'α-SMA · Vinculin · p-FAK (Y397) · phalloidin banding' },
    accent: 'slate',
  },
  {
    latin: 'Collagen fiber',
    zh: '胶原纤维（I 型）',
    group: 'specialized',
    size: { zh: '原纤维 Ø 20–300 nm · 纤维束可 >10 µm · D-周期 67 nm', en: 'Fibrils Ø 20–300 nm · D-period 67 nm' },
    structure: {
      zh: '三股 α 链左手螺旋缠绕成原胶原 → 分泌后切去 C/N 前肽自组装为交错 67 nm D-周期的原纤维 → 束状聚成纤维; 共价交联（赖氨酰氧化酶 LOX 催化）随年龄增加（组织越老越硬）',
      en: 'Three left-handed α chains wind into tropocollagen; after secretion and propeptide clipping, molecules quarter-stagger into 67-nm D-perioded fibrils bundled into fibres, then LOX-cross-linked ever tighter with age',
    },
    physiology: {
      zh: '结缔组织的抗张钢筋（抗拉强度 ≈ 钢的同一数量级）: 皮肤/骨/腱/角膜 I 型为骨含量之 90%; 交联密度与取向由成纤维细胞应力反馈实时调校; 与弹性蛋白网络编成「钢筋-橡皮」复合织物',
      en: 'The tensile rebar of connective tissue (tensile strength on the order of steel): type I is 90% of bone organic matrix; fibroblasts retune crosslink density and orientation against stress feedback, braided with elastin into steel-and-rubber composites',
    },
    clinic: {
      zh: '坏血病 = 抗坏血酸缺乏 → 脯氨酰羟化停摆 → 原胶原不稳（牙龈出血/伤口不愈）; Ehlers-Danlos 综合征胶原/加工酶突变 → 关节过伸皮肤高弹; 纤维化疾病（肝/肺）即胶原过量沉积; LOX 靶点抗转移策略处于临床',
      en: 'Scurvy stalls prolyl hydroxylation and melts the triple helix; Ehlers–Danlos variants give hypermobile, hyperelastic tissue; fibrosis is collagen overdosing; LOX inhibitors are anti-metastatic candidates',
    },
    marker: { zh: 'I 型胶原（COL1A1/2）· Picrosirius red 偏振 · HSP47（伴侣）', en: 'Collagen I (COL1A1/2) · picrosirius red · HSP47' },
    accent: 'amber',
  },
  {
    latin: 'Membrane blebbing',
    zh: '膜出芽（侵袭表型）',
    group: 'specialized',
    size: { zh: '芽泡 Ø 1–5 µm · 持续 0.5–2 分钟/循环 · 速率 ≈ 0.1 µm/s', en: 'Bleb Ø 1–5 µm · 0.5–2 min per cycle' },
    structure: {
      zh: '皮层肌动蛋白网局部解聚 → 膜-皮层脱偶联: 流体膜在胞内压力下呈球形外鼓（缺乏皮层支撑即无定形）; 芽颈部 myosin-I 聚集环缩; 回缩期皮层于泡内重装配',
      en: 'Local cortical-actin disassembly detaches membrane from cortex, and hydrostatic pressure blows a spherical bulge lacking any scaffold; a myosin-I neck ring constricts while actin re-assembles inside for retraction',
    },
    physiology: {
      zh: '双面表型: 生理性（细胞分裂末/凋亡早期/胚胎压实）与病理性侵袭（amoeboid 迁移 —— 无蛋白酶降解, 以流体形变硬挤过基质孔; EMT 后下调整联蛋白的肿瘤细胞尤其依赖）; RhoA-ROCK-myosin 亢进 + ERK-MKL1 通路是驱动核心',
      en: 'A dual-face phenotype: physiological during cytokinesis, apoptosis and compaction, but invasive when tumour cells switch to amoeboid migration — no proteolysis, pure shape-shifting squeezing through matrix pores, driven by hyperactive RhoA–ROCK–myosin',
    },
    clinic: {
      zh: '侵袭性肿瘤治导标志: blebbing + 高 ROCK 活性 = 酪氨酸激酶抑制剂耐受/转移能力增强; 体外循环肿瘤细胞捕获计数中出芽型占比是转移风险分层指标; 紫杉醇类微管药可诱发恶性出芽表型',
      en: 'Blebbing with high ROCK activity flags TKI-tolerant, metastatic states; the blebbing fraction among captured circulating tumour cells stratifies risk; microtubule poisons can force the switch',
    },
    marker: { zh: 'pMLC2（Thr18/Ser19）· ROCK1 · Ezrin（颈部）· Annexin A1', en: 'pMLC2 · ROCK1 · Ezrin (neck) · Annexin A1' },
    accent: 'rose',
  },
  {
    latin: 'Micronucleus',
    zh: '微核',
    group: 'specialized',
    size: { zh: 'Ø ≈ 主核 1/16–1/3 · 有完整核被膜', en: '1/16–1/3 of the main nucleus' },
    structure: {
      zh: '分裂后期滞后的整条染色体/无着丝粒断片被自己的核被膜重新包裹: 膜装配走「非经典」路径（LEM2/BAF 快速封口）; 常复制滞后（下一 S 期同步或永久停滞）; 与主核核孔组成有差异 → 转录不充分',
      en: 'A lagging whole chromosome or acentric fragment re-wrapped by its own envelope via the atypical LEM2/BAF sealing pathway; often replication-slaved to the main nucleus, with reduced nucleoporin and transcription',
    },
    physiology: {
      zh: '基因组不稳定的现象学标志: 着丝粒-微管附着错误/染色体碎裂（chromothripsis）的后果容器; 主核破裂时染色质混入即形成「内陷微核」; 可被先天免疫 cGAS-STING 识别为「胞内断裂 DNA」→ 促炎信号',
      en: 'The readout of genome instability — the container for missegregation and chromothripsis; rupture spills DNA that cGAS–STING reads as cytosolic broken DNA, firing innate inflammation',
    },
    clinic: {
      zh: '微核试验（cytokinesis-block micronucleus assay）是遗传毒理学金标准（辐照/化学诱变剂剂量-效应曲线）; 肿瘤化疗后淋巴细胞微核率是基因组损伤计量; 微核破裂 → 染色体碎裂 → 二次癌变的种子床',
      en: 'The cytokinesis-block micronucleus assay is the genotoxicology gold standard; post-chemotherapy lymphocyte micronuclei dose the damage; rupture-seeded chromothripsis can ignite secondary cancers',
    },
    marker: { zh: 'γ-H2AX（断裂标识）· cGAS（破裂后弥散）· Lamin B（膜完整性）· CENP-F（滞后者）', en: 'γ-H2AX · cGAS (post-rupture) · Lamin B · CENP-F' },
    accent: 'emerald',
  },
  {
    latin: 'TCR microcluster',
    zh: 'TCR/CD3 微簇',
    group: 'specialized',
    size: { zh: '簇径 ≈ 100–300 nm · 活化后数秒内于免疫突触形成 · 数十 TCR/簇', en: 'Clusters Ø ≈ 100–300 nm · tens of TCRs each' },
    structure: {
      zh: 'T 细胞与 APC 接触面（免疫突触）上 TCR-CD3 复合体的亚微米聚簇: 接触中央 smac（TCR + PKCθ）与外环 p-smac（整联蛋白 LFA-1 黏附环）同心分层; 簇经皮层 actin 向心流被推挤合并',
      en: 'Sub-micron TCR–CD3 clusters within the immunological synapse, concentrically zoned into a central SMAC (TCR, PKCθ) ringed by LFA-1 adhesion (pSMAC), herded and merged by centripetal cortical-actin flow',
    },
    physiology: {
      zh: '抗原识别的数字化放大器: 单簇内 ~10–100 个 TCR 共享极少数 pMHC（串激 serial triggering）→ ZAP70 级联超过激活阈值; 簇尺寸与寿命决定激动剂 vs 拮抗剂判别（动力学甄别）; 簇-肌动流耦合是触发耐受或激活的机械检查点',
      en: 'The digital amplifier of antigen recognition: a handful of pMHC serially triggers tens of TCRs in one cluster, crossing the ZAP70 threshold; cluster lifetime encodes agonist versus antagonist discrimination, actin-flow coupling gates activation versus tolerance',
    },
    clinic: {
      zh: 'CAR-T 设计即绕过 MHC-TCR 微簇逻辑直接 CD3ζ 融合信号; 自身免疫 TCR 簇甄别失效（胸腺阴性选择漏洞）; 免疫检查点抑制剂效力与突触簇稳定性正相关',
      en: 'CAR-T engineering bypasses microcluster logic by fusing CD3ζ directly; autoimmune escape traces to faulty thymic negative selection of cluster-competent clones; checkpoint blockade potency tracks synapse cluster stability',
    },
    marker: { zh: 'CD3ζ pY142 · ZAP70 · LAT 簇化 · PKCθ（中央 smac）', en: 'CD3ζ pY142 · ZAP70 · LAT clustering · PKCθ' },
    accent: 'fuchsia',
  },
];

/** 按当前 3D 悬停锚点集合过滤图鉴可用性（未呈现的结构给出禁用态而非隐藏 —— 学习完整性优先） */
export function atlasEntryFor(latin: string): OrgAtlasEntry | undefined {
  return ORG_ATLAS.find((e) => e.latin === latin);
}
