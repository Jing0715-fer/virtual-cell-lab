/**
 * 教学引导模式 —— 分步讲解经典信号级联
 * 每步聚焦一个分子：相机飞行 + 分子高亮 + 残基级科学注释
 * 数据来源: 手工策划级联（MAPK 等经典通路）+ 自动级联推导（其余通路回退）
 * 注释文本复用 NODE_NOTES / CURATED_EVENTS（分子级精确注释体系）
 */
import type { PathwayGraph, CoreNode, CoreEdge } from '@/types/kegg';
import { NODE_NOTES, getCuratedEvent, fallbackNote } from '@/lib/simulation/molecular-notes';
import { KIND_ZH, COMPARTMENT_ZH } from '@/lib/simulation/engine';

export interface TourStep {
  /** 聚焦分子（核心子图 node id） */
  nodeId: string;
  label: string;
  /** 站点标题（如「③ GEF 转位」） */
  title: string;
  /** 分子功能注释 */
  text: string;
  /** 与上一站的级联注释（残基级） */
  edgeNote?: string;
  /** 区室标签（如「细胞质 → 细胞核」） */
  phaseTag: string;
}

interface CuratedChain {
  /** 有序节点 id 序列 */
  chain: string[];
  /** 每站标题 */
  titles: string[];
}

/**
 * 手工策划的经典教学级联（标题 + 顺序经过教学设计审核）
 * MAPK: 生长因子 → 受体 → 接头 → GEF → 小 G 蛋白 → 三级激酶 → TF → 即早基因
 * PI3K-Akt: 生长因子 → RTK → 脂质激酶 → 脂信使 → 双磷酸化 → 代谢/存活/翻译（三条分支汇合）
 * JAK-STAT: 细胞因子 → 受体链 → Janus 激酶 → STAT 磷酸化二聚体入核 → 增殖基因 + 负反馈
 * cAMP: 肾上腺素 → GPCR → Gs → 腺苷酸环化酶 → 第二信使 → 双分支（PKA/EPAC）→ 即早基因
 * TGF-β: 配体 → 双受体接力磷酸化 → R-Smad/Co-Smad 入核 → 靶基因 + I-Smad 负反馈 + 受体降解
 * Wnt: 配体 → Fz/LRP 共受体 → DVL 信号体 → 破坏复合体解体 → β-cat 入核 → 增殖基因 + DKK1 拮抗闭环
 * Notch: 配体牵拉 → S2/S3 顺序切割 → NICD 入核 → CSL 开关 + MAML 共激活 → HES/HEY + Fringe 微调
 * mTOR: 生长输入汇合 → TSC/RHEB 开关 → mTORC1 三条输出臂（S6K/4E-BP1/ULK1）→ AMPK 能量刹车反馈
 * NF-κB: LPS 识别 → MyD88/IRAK/TRAF6 泛素支架 → TAK1→IKK → IκBα 降解 → p65 入核 → A20 负反馈
 * Apoptosis: FasL → 死亡受体 → Caspase-8 → tBid 汇合线粒体臂 → 凋亡小体 → 执行级联 → PARP 拆解终点
 * p53: ATM→CHK2 → p53 三分支（p21 阻滞/PUMA-NOXA 凋亡/Sestrin 代谢）→ MDM2 负反馈环
 * AMPK: α1-AR→CaMKKβ → AMPK Thr172 → ACC 脂肪酸氧化 → TSC2/RHEB/mTOR 关闭 → ULK1 自噬 → PGC-1α 生成
 * Ca²⁺: ACh → PLCβ→IP3R → Ca²⁺ 释放 → RyR2 CICR 放大 → CaM 分拣（CaMKII/Calcineurin）→ NFAT 入核 → SERCA 复位
 */
const CURATED_TOURS: Record<string, CuratedChain> = {
  hsa04010: {
    chain: ['EGF', 'EGFR', 'GRB2', 'SOS1', 'HRAS', 'RAF1', 'MAP2K1', 'MAPK1', 'ELK1', 'FOS'],
    titles: [
      '信号起点 · 配体扩散',
      '受体识别 · 二聚活化',
      '接头募集 · SH2 停靠',
      'GEF 转位 · 膜定位激活',
      'RAS 开关 · GTP 装载',
      'MAPKKK · 级联第一级',
      'MAPKK · 双特异性磷酸化',
      'MAPK · 终端效应激酶',
      '转录因子 · 入核磷酸化',
      '即早基因 · 转录应答',
    ],
  },
  hsa04151: {
    chain: ['IGF1', 'IGF1R', 'PIK3CA', 'cpd:C05981', 'PDPK1', 'AKT1', 'TSC2', 'RHEB', 'MTOR', 'RPS6KB1', 'EIF4EBP1'],
    titles: [
      '信号起点 · IGF-1 扩散',
      'RTK 识别 · IRS 接头平台',
      '脂质激酶 · PI3K 膜激活',
      '脂质第二信使 · PIP3 富集',
      'PDK1 · Thr308 引导磷酸化',
      'Akt · Ser473 完全激活',
      'TSC1/2 · GAP 抑制解除',
      'Rheb · GTP 态维持',
      'mTORC1 · 生长开关',
      'S6K1 · 核糖体亚基磷酸化',
      '4E-BP1 · 帽依赖翻译启动',
    ],
  },
  hsa04630: {
    chain: ['IL2', 'IL2RA', 'JAK1', 'STAT5A', 'MYC', 'BCL2L1', 'SOCS1', 'JAK1', 'STAT5A'],
    titles: [
      '信号起点 · IL-2 自分泌',
      '高亲和受体 · 三链组装',
      'Janus 激酶 · 交叉磷酸化',
      'STAT5 · Y694 磷酸化二聚体',
      '增殖基因 · c-myc 转录',
      '存活信号 · Bcl-xL 抗凋亡',
      '负反馈 · SOCS 诱导表达',
      '信号关闭 · JAK 泛素化',
      '回落 · STAT 信号重置',
    ],
  },
  hsa04024: {
    chain: ['EPI', 'ADRB2', 'GNAS', 'ADCY1', 'cpd:C00575', 'PRKACA', 'CREB1', 'FOS', 'RAPGEF3', 'RAP1A'],
    titles: [
      '信号起点 · 肾上腺素风暴',
      'GPCR 识别 · TM6 外旋',
      'Gs 蛋白 · 核苷酸交换',
      '腺苷酸环化酶 · ATP 环化',
      '第二信使 · cAMP 级联放大',
      'PKA · 催化亚基解离',
      'CREB · Ser133 磷酸化',
      '即早基因 · CRE 转录应答',
      'EPAC 支路 · 非激酶分支',
      'Rap1 · 整合素激活终点',
    ],
  },
  hsa04350: {
    chain: ['TGFB1', 'TGFBR2', 'TGFBR1', 'SMAD2', 'SMAD4', 'ID1', 'SMAD6', 'SMURF2'],
    titles: [
      '信号起点 · 潜伏态唤醒',
      'II 型受体 · 组成性激酶',
      'I 型受体 · GS 域接力',
      'R-Smad · SSXS 磷酸化',
      'Co-Smad · 异源三聚体入核',
      '靶基因 · 分化抑制应答',
      'I-Smad · 自诱导负反馈',
      '信号衰减 · 受体泛素化降解',
    ],
  },
  hsa04310: {
    chain: ['WNT3A', 'FZD1', 'LRP5', 'DVL1', 'AXIN1', 'GSK3B', 'CTNNB1', 'TCF7L2', 'CCND1', 'DKK1'],
    titles: [
      '信号起点 · 脂质化配体',
      'Frizzled · CRD 识别',
      '共受体 · signalosome 聚集',
      'Dishevelled · 信号体支架',
      '破坏复合体 · 解体',
      'GSK3β · 磷酸化降解停摆',
      'β-catenin · 免于降解入核',
      'TCF4 · 转录开关翻转',
      'Cyclin D1 · G1/S 增殖程序',
      '拮抗闭环 · DKK1 负反馈',
    ],
  },
  hsa04330: {
    chain: ['DLL1', 'NOTCH1', 'ADAM17', 'PSEN1', 'NCSTN', 'RBPJ', 'MAML1', 'HES1', 'HEY1', 'LFNG'],
    titles: [
      '信号起点 · 相邻细胞配体',
      '受体牵拉 · 变构暴露 S2',
      'S2 切割 · ADAM 金属蛋白酶',
      'S3 膜内切割 · γ-分泌酶催化',
      '底物递呈 · Nicastrin 门控',
      'NICD 入核 · CSL 转换开关',
      '共激活子 · MAML 包裹组装',
      'HES1 · bHLH 抑制子诱导',
      'HEY1 · 双臂抑制网络',
      '通路微调 · Fringe 糖基化',
    ],
  },
  hsa04150: {
    chain: ['AKT1', 'TSC1', 'RHEB', 'MTOR', 'RPS6KB1', 'RPS6', 'EIF4EBP1', 'EIF4E', 'ULK1', 'PRKAA1'],
    titles: [
      '生长输入 · Akt 汇合点',
      'TSC1/2 · GAP 负调控闸',
      'Rheb · GTP 装载开关',
      'mTORC1 · 营养与生长中枢',
      'S6K1 · 翻译机器臂',
      'RPS6 · 核糖体生物发生',
      '4E-BP1 · 翻译抑制解除',
      'eIF4E · 帽依赖翻译启动',
      'ULK1 · 自噬闸门',
      'AMPK · 能量刹车反馈',
    ],
  },
  hsa04064: {
    chain: ['TLR4', 'MYD88', 'IRAK1', 'TRAF6', 'MAP3K7', 'IKBKB', 'NFKBIA', 'RELA', 'BCL2L1', 'TNFAIP3'],
    titles: [
      '模式识别 · LPS 受体四聚',
      'MyD88 · TIR 接头募集',
      'IRAK1 · 受体近端激酶',
      'TRAF6 · K63 泛素支架',
      'TAK1 · MAP3K7 磷酸化',
      'IKKβ · IκB 激酶催化亚基',
      'IκBα · 磷酸化-降解',
      'p65 · NF-κB 核转位',
      'Bcl-xL · 存活程序基因',
      'A20 · 负反馈信号关闭',
    ],
  },
  hsa04210: {
    chain: ['FASLG', 'FAS', 'FADD', 'CASP8', 'BID', 'BAX', 'CYCS', 'APAF1', 'CASP9', 'CASP3', 'PARP1'],
    titles: [
      '死亡信号 · FasL 呈递',
      'Fas · 死亡受体三聚',
      'FADD · 死亡域接头',
      'Caspase-8 · 起始胱天蛋白酶',
      'tBid · 线粒体穿针引线',
      'Bax · 外膜孔道成形',
      '细胞色素 c · 线粒体释放',
      'Apaf-1 · 凋亡小体组装',
      'Caspase-9 · 执行级联点火',
      'Caspase-3 · 主要执行蛋白酶',
      'PARP · 细胞拆解终点',
    ],
  },
  hsa04115: {
    chain: ['ATM', 'CHEK2', 'TP53', 'CDKN1A', 'BBC3', 'PMAIP1', 'SESN1', 'MDM2'],
    titles: [
      '损伤感受 · ATM 激酶',
      'CHK2 · 检查点中继',
      'p53 · 基因组卫士',
      'p21 · G1/S 阻滞',
      'PUMA · 凋亡准备',
      'NOXA · 凋亡执行',
      'Sestrin · 代谢检查点',
      'MDM2 · 负反馈环',
    ],
  },
  hsa04152: {
    chain: ['ADRA1A', 'CAMKK2', 'PRKAA1', 'ACACA', 'TSC2', 'RHEB', 'MTOR', 'ULK1', 'PPARGC1A'],
    titles: [
      '应激输入 · α1 肾上腺素能',
      'CaMKKβ · 钙敏感激活激酶',
      'AMPK · 能量电荷传感器',
      'ACC · 脂肪酸氧化闸门',
      'TSC2 · 生长抑制加固',
      'Rheb · 处于钳制之下',
      'mTOR · 合成代谢关闭',
      'ULK1 · 自噬启动',
      'PGC-1α · 线粒体生成程序',
    ],
  },
  hsa04020: {
    chain: ['ACh', 'PLCB1', 'ITPR1', 'cpd:C00076', 'RYR2', 'CALM1', 'CAMK2A', 'PPP3CA', 'NFATC1', 'ATP2A2'],
    titles: [
      '信号起点 · 乙酰胆碱',
      'PLCβ · PIP2 水解',
      'IP3R · 钙释放通道',
      'Ca²⁺ · 通用第二信使',
      'RyR2 · 钙诱导钙释放',
      '钙调蛋白 · Ca²⁺ 感受器',
      'CaMKII · 记忆激酶',
      '钙调磷酸酶 · 去磷酸化门',
      'NFAT · 核转位终点',
      'SERCA · 信号复位泵',
    ],
  },
  // ============ Task 25 新增策划通路教学级联 ============
  hsa04370: {
    chain: ['VEGFA', 'KDR', 'PLCG1', 'PRKCA', 'RAF1', 'MAP2K1', 'MAPK1', 'PLA2G4B'],
    titles: [
      '信号起点 · 血管内皮生长因子',
      'VEGFR2 · 激酶域自磷酸化',
      'PLCγ · 脂质信使生成',
      'PKCα · DAG 激活转位',
      'Raf-1 · MAPKKK 膜招募',
      'MEK · 双特异性磷酸化',
      'ERK · 终端效应激酶',
      'cPLA2β · 花生四烯酸输出',
    ],
  },
  hsa04390: {
    chain: ['NF2', 'STK3', 'LATS2', 'MOB1A', 'YAP1', 'TEAD1', 'CCN2'],
    titles: [
      '上游哨兵 · merlin 接触抑制',
      'MST2 · 级联启动激酶',
      'LATS2 · 核心抑制激酶',
      'MOB1 · 激活亚基协同',
      'YAP · 被标记的命运',
      'TEAD · 核内转录开关',
      'CTGF · 生长基因终点',
    ],
  },
  hsa04066: {
    chain: ['cpd:C00007', 'EGLN1', 'HIF1A', 'VHL', 'ARNT', 'CREBBP', 'VEGFA', 'SLC2A1'],
    titles: [
      '辅底物 · 分子氧',
      'PHD2 · 氧感受器羟化酶',
      'HIF-1α · 缺氧主开关',
      'VHL · 泛素降解裁决',
      'ARNT · 二聚伙伴',
      'CBP · 组蛋白乙酰化',
      'VEGFA · 血管生成输出',
      'GLUT1 · 代谢重编程终点',
    ],
  },
  hsa04068: {
    chain: ['INS', 'INSR', 'IRS1', 'PIK3CA', 'cpd:C05981', 'PDPK1', 'AKT1', 'FOXO1', 'CDKN1B'],
    titles: [
      '信号起点 · 胰岛素',
      'INSR · 受体自磷酸化',
      'IRS1 · 接头平台',
      'PI3K · 脂质激酶',
      'PIP₃ · 脂质第二信使',
      'PDK1 · Thr308 引导',
      'Akt · 完全激活',
      'FoxO1 · 核排斥命运',
      'p27 · 靶基因终点',
    ],
  },
  hsa04620: {
    chain: ['CD14', 'TLR4', 'MYD88', 'IRAK4', 'IRAK1', 'TRAF6', 'MAP3K7', 'IKBKB', 'NFKB1'],
    titles: [
      '共受体 · LPS 衣递呈',
      'TLR4 · 危险识别',
      'MyD88 · 衔接子募集',
      'IRAK4 · 上游信号激酶',
      'IRAK1 · 自磷酸化激活',
      'TRAF6 · K63 泛素支架',
      'TAK1 · 双线出击',
      'IKKβ · IκBα 磷酸化',
      'NF-κB · 炎症总开关终点',
    ],
  },
  hsa04110: {
    chain: ['CCND1', 'CDK4', 'RB1', 'E2F1', 'CCNE1', 'CDK2', 'CCNA2', 'CDK1', 'PLK1', 'CDC20'],
    titles: [
      'G1 引擎 · Cyclin D',
      'CDK4 · Rb 起始磷酸化',
      'Rb · 抑癌闸门失守',
      'E2F · 转录释放',
      'Cyclin E · 限制点越过',
      'CDK2 · S 期自主推进',
      'Cyclin A · 复制完成',
      'CDK1 · MPF 有丝分裂驱动',
      'PLK1 · 有丝分裂辅助激酶',
      'APC/C · 后期触发终点',
    ],
  },
  hsa04012: {
    chain: ['EGF', 'EGFR', 'GRB2', 'SOS1', 'HRAS', 'ARAF', 'MAP2K1', 'MAPK1', 'MYC'],
    titles: [
      '信号起点 · EGF 扩散',
      'EGFR · 二聚体平台',
      'GRB2 · pY 停靠',
      'SOS · RAS 的 GEF',
      'HRAS · GTP 装载',
      'ARAF · 家族代表 MEKK',
      'MEK · 双特异性接力',
      'ERK · 终端激酶',
      'c-Myc · 增殖基因终点',
    ],
  },
};

/** 手工策划链的补充文案（引导语，教育性 framing） */
const CURATED_INTROS: Record<string, string> = {
  hsa04010:
    '经典 RTK-RAS-ERK 级联：一次生长因子刺激如何在 10 站之内从细胞外抵达细胞核内的基因。',
  hsa04151:
    '细胞的“生长开关”：IGF-1 如何在 11 站内接力激活 PI3K-Akt-mTOR 轴，最终开启帽依赖翻译机器（丝氨酸/苏氨酸磷酸化全程）。',
  hsa04630:
    '免疫细胞的增殖指令：IL-2 自分泌信号 9 站往返——从细胞因子到 JAK-STAT5 核内转录，再经 SOCS 负反馈关闭（含信号重置）。',
  hsa04024:
    '最古老的第一信使系统：肾上腺素 → GPCR → Gs → cAMP 第二信使放大 1000 倍，经 PKA 与 EPAC 双分支抵达基因与粘附终点。',
  hsa04350:
    '上皮的“刹车信号”：TGF-β 经双受体接力磷酸化唤醒 R-Smad，8 站完成从细胞外到核内基因的旅程——末两站演示信号如何自我关闭（I-Smad 反馈 + 受体降解）。',
  hsa04310:
    '胚胎发育的核心开关：Wnt 如何在 10 站内“解散”破坏复合体、让 β-catenin 免于降解入核开启增殖程序——最后一站 DKK1 演示通路自带的外部关闭机制。',
  hsa04330:
    '不需要第二信使的捷径：Notch 信号经“配体牵拉 + 三次蛋白酶切割”直接释放转录因子入核——10 站看懂发育生物学最直接的细胞对话，末站揭示 Fringe 糖基化如何微调配体选择性。',
  hsa04150:
    '生长的中央账本：mTORC1 如何在 10 站内将生长因子信号兑换成核糖体、翻译与自噬的决策——最后一站 AMPK 演示能量匮乏时整套程序如何被叫停。',
  hsa04064:
    '炎症的总开关：LPS 识别如何在 10 站内点亮 NF-κB——从受体四聚到 IκBα 降解再到核内基因程序，末站 A20 揭示通路如何自我关闭（K63 泛素链全程参与）。',
  hsa04210:
    '细胞的程序性死亡：FasL 一次结合如何在 11 站内从死亡受体抵达线粒体、装配凋亡小体、并最终拆解整个细胞——外源与内源凋亡途径在 tBid 站汇合。',
  hsa04115:
    '基因组的最后防线：DNA 双链断裂如何在 8 站内唤醒 p53——三条分支基因（阻滞/凋亡/代谢）与 MDM2 负反馈构成完整的应激决策网络。',
  hsa04152:
    '细胞的能量仪表盘：AMPK 如何感知 AMP:ATP 比值并关闭一切耗能程序——9 站走完从钙信号到脂肪酸氧化、自噬与线粒体生成的完整节能动员。',
  hsa04020:
    '最迅速的第二信使：乙酰胆碱如何在 10 站内引发钙离子火花——从 ER 释放到 CICR 放大、经钙调蛋白分拣给激酶与磷酸酶，最终由 SERCA 泵回 ER 复位（全程毫秒级）。',
  hsa04370:
    '血管生成的启动密码：VEGF 如何在 8 站内从内皮细胞外抵达花生四烯酸输出——经典 RTK-PLCγ-PKC-Raf-MEK-ERK 级联的血管版。',
  hsa04390:
    '器官大小的刹车踏板：接触抑制信号如何在 7 站内经 merlin-MST2-LATS2 磷酸化 YAP——最后一站揭示刹车松开时 YAP-TEAD 如何驱动 CTGF 生长程序。',
  hsa04066:
    '细胞如何感知氧气：8 站看完 HIF-1 的双重命运——常氧时被 PHD 羟基化 + VHL 泛素化分钟级清除，缺氧时稳定积累与 ARNT 二聚驱动 VEGFA/GLUT1 应答。',
  hsa04068:
    '代谢与长寿的交叉路口：胰岛素如何在 9 站内经 PI3K-Akt 将 FoxO 驱逐出核——反过来，应激/能量匮乏时 FoxO 入核启动 p27 阻滞与抗氧化程序。',
  hsa04620:
    '先天免疫的第一声警报：LPS 如何在 9 站内点亮 NF-κB——从 CD14/TLR4 识别到 IRAK-TRAF6 泛素支架再到 IκBα 降解（K63 泛素链全程参与）。',
  hsa04110:
    '生命的复制时钟：10 站走完细胞周期引擎——从 Cyclin D 起步、Rb 闸门失守、E2F 释放，到 MPF 驱动有丝分裂与 APC/C 触发后期退出。',
  hsa04012:
    '受体二聚体的组合密码：EGF 如何在 9 站内激活 EGFR-GRB2-RAS-ERK 级联——HER2/HER3 异二聚体为何是最强增殖单元的分子基础。',
};

const EDGE_BIDIRECTIONAL = new Set(['binding', 'association']);

/** 邻居推导：信号下游（含 KGML 反向绘制的 binding 边） */
function downstream(nodeId: string, edges: CoreEdge[]): CoreEdge[] {
  const out: CoreEdge[] = [];
  for (const e of edges) {
    if (e.source === nodeId) out.push(e);
    else if (e.target === nodeId && EDGE_BIDIRECTIONAL.has(e.kind)) out.push(e);
  }
  return out;
}

function neighborOf(e: CoreEdge, id: string): string | null {
  if (e.source === id) return e.target;
  if (e.target === id) return e.source;
  return null;
}

/**
 * 自动推导级联（未手工策划的通路）:
 * 从首选配体出发贪心游走 —— 优先残基级策划注释边，其次层级递进，游走深度 ≤ 11
 */
function autoChain(graph: PathwayGraph): string[] {
  const nodes = graph.core.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = graph.core.edges;

  // 起点: 有下游连接的配体（tier 0）；无配体则从最高连接度的受体开始
  const ligands = nodes.filter((n) => n.tier === 0 && downstream(n.id, edges).length > 0);
  const receptors = nodes.filter((n) => n.tier === 1);
  let start: string | null = ligands[0]?.id ?? null;
  if (!start) {
    const bestRec = receptors
      .map((n) => ({ n, deg: downstream(n.id, edges).length }))
      .sort((a, b) => b.deg - a.deg)[0];
    start = bestRec?.n.id ?? null;
  }
  if (!start) return [];

  const chain: string[] = [start];
  const visited = new Set([start]);
  let cur = start;
  while (chain.length < 11) {
    const nexts = downstream(cur, edges)
      .map((e) => neighborOf(e, cur))
      .filter((id): id is string => !!id && !visited.has(id));
    if (nexts.length === 0) break;
    const curTier = byId.get(cur)?.tier ?? 0;
    const scored = nexts.map((id) => {
      const n = byId.get(id);
      if (!n) return { id, s: -1 };
      let s = 0;
      if (getCuratedEvent(cur, id) || getCuratedEvent(id, cur)) s += 6;
      if (n.tier === curTier + 1) s += 4;
      else if (n.tier > curTier) s += 2;
      if (n.kind === 'tf' || n.kind === 'gene') s += 1;
      return { id, s };
    });
    scored.sort((a, b) => b.s - a.s);
    // 终点: 到达靶基因（tier 6）后停止
    const nxt = scored[0].id;
    chain.push(nxt);
    visited.add(nxt);
    cur = nxt;
    if ((byId.get(nxt)?.tier ?? 0) >= 6) break;
  }
  return chain;
}

/** 构建教学引导步骤序列（同分子复现站去重: 保留首次出现） */
export function buildGuidedTour(graph: PathwayGraph): TourStep[] {
  const curated = CURATED_TOURS[graph.meta.id];
  const rawChain = curated ? curated.chain.filter((id) => graph.core.nodes.some((n) => n.id === id)) : autoChain(graph);
  // 同分子复现（如 JAK-STAT 负反馈环）: 只保留首次出现，避免引导卡重复跳转
  const chain: string[] = [];
  for (const id of rawChain) {
    if (!chain.includes(id)) chain.push(id);
  }
  if (chain.length === 0) return [];

  const byId = new Map(graph.core.nodes.map((n) => [n.id, n]));
  const roman = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];
  const steps: TourStep[] = [];

  // 标题跟随去重后的链（同站复现时沿用原策划标题）
  const titleAt = new Map<string, string>();
  if (curated) {
    curated.chain.forEach((id, i) => {
      if (!titleAt.has(id) && curated.titles[i]) titleAt.set(id, curated.titles[i]);
    });
  }

  chain.forEach((id, i) => {
    const node = byId.get(id);
    if (!node) return;
    const prev = i > 0 ? byId.get(chain[i - 1]) : null;
    const text =
      NODE_NOTES[id] ?? NODE_NOTES[node.label] ??
      fallbackNote(node.label, KIND_ZH[node.kind] ?? '分子', COMPARTMENT_ZH[node.compartment] ?? '细胞');
    let edgeNote: string | undefined;
    if (prev) {
      edgeNote =
        getCuratedEvent(prev.id, id) ??
        getCuratedEvent(id, prev.id) ??
        getCuratedEvent(prev.label, node.label) ??
        getCuratedEvent(node.label, prev.label);
    }
    steps.push({
      nodeId: id,
      label: node.label,
      title: titleAt.get(id) ?? `${roman[i] ?? ''} ${node.label} · ${KIND_ZH[node.kind] ?? '分子'}`,
      text,
      edgeNote,
      phaseTag: `${COMPARTMENT_ZH[node.compartment] ?? '细胞'} · 层级 L${node.tier}`,
    });
  });
  return steps;
}

/** 引导模式开场语（引导教学 framing） */
export function tourIntro(graph: PathwayGraph, stepCount: number): string {
  return (
    CURATED_INTROS[graph.meta.id] ??
    `${graph.meta.nameZh}：沿主信号流逐站讲解，共 ${stepCount} 站（自动推导级联，注释来自 KEGG 关系语义与策划注释库）。`
  );
}
