/* ============ v60 细胞器图鉴（Organelle Atlas） ============
 * 结构/功能/临床/标志物四维双语百科 —— 每条 latin 与 3D 悬停锚点（HoverTarget.latin）
 * 严格同名, 「在细胞中定位」按钮经此联动相机飞行 + 脉冲高亮。
 * 内容审校基准: Molecular Biology of the Cell (Alberts 6e) / 细胞生物学 (翟中和 5e)
 */

export type AtlasGroup = 'nuclear' | 'endomembrane' | 'energy' | 'cytoskeleton' | 'surface' | 'vesicle';

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

export const ATLAS_GROUP_ORDER: AtlasGroup[] = ['nuclear', 'endomembrane', 'vesicle', 'energy', 'cytoskeleton', 'surface'];

export const ATLAS_GROUP_LABEL: Record<AtlasGroup, { zh: string; en: string }> = {
  nuclear: { zh: '核区 · 遗传系统', en: 'Nuclear · Genome' },
  endomembrane: { zh: '内膜系统', en: 'Endomembrane' },
  vesicle: { zh: '运输与降解', en: 'Traffic & degradation' },
  energy: { zh: '能量与代谢', en: 'Energy & metabolism' },
  cytoskeleton: { zh: '细胞骨架', en: 'Cytoskeleton' },
  surface: { zh: '细胞表面', en: 'Cell surface' },
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
];

/** 按当前 3D 悬停锚点集合过滤图鉴可用性（未呈现的结构给出禁用态而非隐藏 —— 学习完整性优先） */
export function atlasEntryFor(latin: string): OrgAtlasEntry | undefined {
  return ORG_ATLAS.find((e) => e.latin === latin);
}
