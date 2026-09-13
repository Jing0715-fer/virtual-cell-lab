/**
 * 分子区室 / 功能类别 / 信号层级分类算法
 *
 * 基于 KGML entry 的 label 与 aliases（基因符号 / 别名）做正则锚定匹配
 * （^(?:...)$ 全名匹配，等价于全名精确匹配），将每个分子分类为：
 *   compartment: extracellular | membrane | cytoplasm | nucleus
 *   kind: MoleculeKind（ligand/receptor/kinase/...）
 *   tier: 信号层级 0 配体 → 1 受体 → 2 GTPase/接头 → 3 激酶/酶/化合物
 *         → 4 磷酸酶 → 5 转录因子 → 6 靶基因（由 subgraph 按 GErel 边修正）
 *
 * 匹配优先级：compound 类型 → 离子通道 → 受体 → 配体 → 转录因子 →
 *             GTPase → 磷酸酶 → MAPK 级联 → 激酶 → 接头蛋白 → 磷脂酶 → 默认酶
 *
 * 正则全部为确定性完整词形（无空匹配分支），未识别基因保守归 enzyme。
 */

import type { Compartment, CoreEdge, CoreNode, KeggEntry, MoleculeKind } from '@/types/kegg';

export interface Classification {
  compartment: Compartment;
  kind: MoleculeKind;
  tier: number;
}

/** 离子通道型受体 / 钙释放通道（membrane，tier 1） */
const CHANNEL_RE =
  /^(?:CACNA\w+|CACNB\w+|RYR[123]|ATP2A\d|ATP2B\d|ORAI[12]|GRIA[1-4]|GRIN[1-4][ABDG]?|ITPR[123]|TRPC[1-7]|TRPV[1-6]|TRPM[1-8]|CNGA[1-3]|CNGB[1-3])$/;

/** 受体（RTK / 细胞因子受体 / GPCR / 跨膜丝苏氨酸激酶受体；membrane，tier 1） */
const RECEPTOR_RE =
  /^(?:EGFR|ERBB[1-4]|FGFR[1-4]|VEGFR[1-3]|FLT[134]|KDR|PDGFRA|PDGFRB|KIT|CSF1R|CSF3R|MET|MST1R|IGF1R|INSR|INSRR|NTRK[1-3]|ALK|LTK|ROS1|AXL|MER|TYRO3|DDR[12]|ROR[12]|RYK|EPHA\d+|EPHB\d+|TGFBR[12]|ACVR1|ACVR1B|ACVR2A|ACVR2B|ACVRL1|BMPR1A|BMPR1B|BMPR2|NOTCH[1-4]|FZD\d+|LRP[56]|IL[0-9]+R[AB]?|IL2RG|IL3RA|IL6R|IL6ST|IL7R|IL12RB[12]|IL23R|IFNGR[12]|IFNAR[12]|IFNLR[12]|LIFR|OSMR|LEPR|EPOR|GHR|CSF2RB|TNFRSF\d+\w?|LTBR|FAS|DR4|DR5|TLR[2-9]|TLR10|TLR11|ADRB[123]|ADRA1[AB]|ADRA2[ABCD]|DRD[1-5]|HTR[1-7]|ADORA[123AB]|CHRM[1-5]|CHRNA\d|CHRNB\d|CHRNG|ADCY\d+|OXTR|AVPR[12]|EDNRA|EDNRB|SSTR[1-5]|GNRHR|CRHR[12]|PTHR1|NPY[1-6]R|MC[1-6]R|AGTR[12]|F2R|F2RL[1-3]|PAR[1-4]|P2RX\d|P2RY\d|LPAR[1-6]|S1PR[1-5]|GABBR[12]|GRM[1-8]|MGLUR[1-8]|NMBR|GRPR|CALCRL|GHRHR)$/;

/** 分泌型配体（生长因子 / 细胞因子 / Wnt 等；extracellular，tier 0） */
const LIGAND_RE =
  /^(?:EGF|TGFA|AREG|EREG|HBEGF|BTC|TGFB[123]|IGF[12]|INS|IGFALS|IGFBP\d|FGF\d+\w?|WNT\d+[AB]?|DLL[134]|JAG[12]|IL\d+|IFNG|IFNA\d+|IFNB\d|IFNL\d?|EPO|THPO|GH1|GH2|TNF|LTA|LTB|FASLG|TNFSF\d+\w?|BDNF|NGF|NTF[3-7]|GDNF|ARTN|PSPN|CCL\d+|CXCL\d+|VEGF[ABCD]?|PLGF|PDGFA|PDGFB|HGF|MST1|BAFF|APRIL|CD40LG|LIGHT|BMP\d+[AB]?|INHBA|INHBB|INHBC|NODAL|LEFTY[12]|GDF\d+\w?|WIF1|SFRP[1-5]|DKK[1-4]|SOST|SOSTDC1|RSPO[1-4]|NRG[1-4]|CSF[123]|LIF|OSM|KITLG|FLT3LG|ANGPT[12]|ANGPTL\d|EDA)$/;

/** 转录因子 / 核内转录调控因子（nucleus，tier 5） */
const TF_RE =
  /^(?:FOS|FOSB|FOSL[12]|JUN|JUNB|JUND|JUNOS|MYC|MYCN|MYCL|MYCBP|ELK[1-4]|ETS[12]|ETV[1-7]|CREB[123]|CREM|ATF[1-7]\w?|STAT[1-6]\w*|SMAD[1-9]\w*|NFATC[1-4]\w*|NFAT5|NFKB1|NFKB2|RELA|RELB|REL|BCL3|NFKBIZ|SP[1-8]|E2F[1-8]|TP53|TCF3|TCF4|TCF7|TCF7L[12]|TCF12|LEF[12]|HES[1-7]|HEY[12L]|ID[1-4]\w?|SNAI[123]|SREBF[12]|SREBP[12][AC]?|PPARA|PPARD|PPARG|PPARGC1[AB]|FOXO[1-6]|HIF1A|HIF1B|ARNT|AR|ESR[123]|ESRR[ABG]|PGR|RBPJ|RBPJL|MAML[123]|GATA[1-6]\w?|RUNX[123]|MYOD1|MYOG|SRF|EGR[1-4]|KLF\d+|IRF[1-9]|XBP[123]|DDIT3|CHOP|NFIL3|BCL6|BCL11[AB]|PAX\d+\w?|FOXA[123]|CEBP[ABDEGZ]|SKI|SKIL|YAP1|TEAD[1-4]|NR4A[123]|MAF|MAFA|MAFB|MAFG|MAFK|BACH[12]|NFE2|NFE2L[12]|CRTC[123]|TSC22D[123]|EP300|CREBBP|KAT2[AB]|CTNNB1|ZEB[12]|TWIST[12]|AHR|NEUROD[1-6]|OLIG[123]|ASCL[1-4]|POU5F1|POU[1-6]F[1-3]?|MSX[12]|DLX[1-6]|CDX[1-4]|SOX\d+\w?|LYL1|LMO[124]|LDB[123]|LIMD1|GFI1|GFI1B|IKZF[1-5]|ERG|FLI1|ELF[1-5]|NFY[ABC]|CLOCK|ARNTL|BMAL[12]|PER[123]|CRY[12]|THRA|THRB|RARA|RARB|RARG|RXR[ABG]|VDR|NR5A[12]|NR0B[12]|NR1I[123]|NR2F[12]|NR3C[123]?|CIITA|FOXP[1-4]|BATF|AP1|JDP2|MEIS[123]|PBX[1-4]|HOX[ABCD]\d+|USF[12]|MITF|TFEB|TFE[123]|MXD[1-4]|MNT|SALL[1-4]|GLI[123]|GLIS[123]|FOXH1|FOXI1|FOXJ[12]|FOXN[123]|FOXQ1|FOXS1|FOXL2|FOXE1|FOXG1|FOXF1|WT1|SIX[1-6]|EYA[1-4]|PITX[123]|ISL1|LHX[1-9]|EMX[12]|OTX[12]|GBX[12]|IRX[1-6]|TGIF[12]|ZFPM[12]|HAND[12]|NEUROG[1-4]|NKX[2-5][1-9]|TFAP2[ABCDE]|TFAP[34]|TFAP4)$/;

/** 小 G 蛋白 / GTP 结合蛋白（cytoplasm，tier 2） */
const GTPASE_RE =
  /^(?:HRAS|KRAS|NRAS|MRAS|ERAS|RRAS|RRAS2|RIT1|RIN[12]|RAC[123]|RHO\w+|CDC42|RAB\w+|RAP1[AB]|RAP2[ABC]|RHEB|RRAG[ABCD]|ARF[1-6]|ARL\w+|RAN|DIRAS[123]|KRIT1|GNAS|GNAQ|GNA11|GNA14|GNA15|GNAI[1-4]|GNAT[1-3]|GNAO[12]|GNAZ|GNB[1-5]|GNG[1-13]|GEM|REM[12]|RASD[12]|RASL10[AB]|RASL11[AB])$/;

/**
 * 磷酸酶（cytoplasm，tier 4）催化亚基 PPPnC/PPPnG 命名。
 * PPP1Rxx 为调节亚基旧名，常作为 AXIN1/CASP9/TSC2 等的 KEGG 别名
 * 出现（如 AXIN1 alias "PPP1R49"），不应据此判为磷酸酶。
 */
const PHOSPHATASE_RE =
  /^(?:PPP[1-7][CG]\w*|DUSP\d+\w?|DUSP\dL?|PTEN|PTENP1|PTPN\d+\w?|PTPR[ABCDGJMNRSUV]\w*|CDC25[ABCD]|CDC14[AB]|SSH[1-3]|PDP[12]|PPM\d\w*|PHLPP[12]|INPP\w+|MTMR\d\w?|MTM[12]|SYNJ[12]|OCRL|CTDP1|UBLCP1|PPEF[12]|PPFIA\w+|PPFIBP[12]|SSU72|SBF[12]|EPM2A|PTPLA|SGPP[123]|SGPL1)$/;

/** MAPK 三级级联模块（cytoplasm，tier 3） */
const MAPK_CASCADE_RE =
  /^(?:MAPK\d+\w?|MAP2K\d+\w?|MAP3K\d+\w?|MAP4K\d+\w?|MAPKAPK\d\w?|MEK[12]|MKK[1-7]|ERK[123]|JNK[123]|SAPK[123]|MNK[12]|COT|TPL2|MEKK[1-4])$/;

/** 蛋白激酶（cytoplasm，tier 3） */
const KINASE_RE =
  /^(?:AKT[123]|PDPK[12]|PDK[1-4]|SGK[1-4]\w?|RSK[1-6]|RPS6KA[1-6]\w?|RPS6KB[12]|RPS6KL1|LKB1|STK\d+|PRKAA[12]|PRKAB[12]|PRKAG[123]|PRKACA|PRKACB|PRKAR1[AB]|PRKAR2[AB]|PRKCA|PRKCB|PRKCG|PRKCD|PRKCE|PRKCH|PRKCI|PRKCQ|PRKCZ|PRKD[123]|PRKX|PRKY|CAMK1|CAMK1D|CAMK1G|CAMK2[ABDG]|CAMK4|CAMKK[12]|CAMKV|PNCK|CDK\d+|CDKL\d|GSK3[AB]|CSNK\w+|IKBKB|IKBKE|CHUK|TBK1|JAK[123]|TYK2|SRC|FYN|YES1|LCK|HCK|LYN|BLK|FGR|FRK|MATK|CSK|ABL[12]|ARG|RAF1|BRAF|ARAF1|MOS|PAK[1-6]|ROCK[12]|LIMK[12]|ILK|PTK2|PTK2B|PTK6|SYK|ZAP70|BTK|ITK|TEC|BMX|TXK|EPHA\d+|EPHB\d+|ASK[123]|MLK[23]|DLK[12]|TAO[123]|TAOK[123]|NUAK[12]|MARK[1-4]|BRSK[12]|SNRK|SIK[123]|QIK|QSK|WNK[1-4]|CASK|TTK|MPS1|PLK[1-4]|NEK\d+|AURKA|AURKB|AURKC|BUB[123]|BUB1B|SRPK[123]|CLK[1-4]|DYRK[1-4][AB]?|HIPK[1-4]|IRAK[1-4]|RIPK[1-4]|ULK[123]|MYLK|MYLK2|MYLK3|MLCK|PIK3C[ABDG]|PIK3CG|PIK3C3|PIK3C2[ABG]|PI4K2[AB]|PI4KA|PI4KB|MTOR|ATM|ATR|PRKDC|CHEK[12]|CHK[12]|WEE[12]|PINK1|LRRK[12]|PASK|FASTK|MAST[1-4]|MASTL|SMG1|CERK|SPHK[12]|PKN[123]|PKD[123]|SLK|TESK[12]|NLK|MELK|CILK1|ICK|PBK|TOPK|GRK[1-7]|DAPK[123]|DRAK[12]|DMPK|MRCK[ABG]|MKNK[12]|MSK[12]|MAPKAPK[25]|PIM[123]|ARK5|AAK1|GAK|BMP2K|SBK[123]|YANK[12]|NIM1K|KIS|NIM1|MST[134]|STK3|STK4|MAP4K[1-5])$/;

/** 接头蛋白 / 支架蛋白（cytoplasm，tier 2） */
const ADAPTER_RE =
  /^(?:GRB2|GRB7|GRB10|GRB14|GRAP2|GADS|SOS[12]|SHC[1-4]|GAB[123]|IRS[1-4]|FRS[123]|DVL[123]|NCK[12]|CRK|CRKL|PIK3R[1235]|APBB[123]|KSR[12]|CNKSR[12]|FADD|TRADD|TRAF[1-7]|MYD88|TAB[123]|TICAM[12]|TOLLIP|PELI[123]|CBL|CBLB|CBLC|DOK[1-6]|SH2B[123]|SHB|SHD|BCAR[1-4]|LAT|LAT2|SLP76|BLNK|APS|CD2AP|PAG1|SLA|SLA2|APC|AXIN[12]|SOCS[1-7]|CISH|CFLAR|TSC[12]|RPTOR|RICTOR|MLST8|MAPKAP1|STRADA|CAB39|CAB39L|IKBKG|NEMO|ARHGEF\d+|RAPGEF[1-4]|ARAP[123]|CENTA[12]|CENTG[12]|EPS8|ABI[123]|WAVE[123]|WASF[1-3]|NCKAP1|NCKAP1L|DLG[1-4]|GRIP[12]|PICK1|LMO[124]|LDB[123]|LIMD1|NUMB|PARD[1-6]|PARD6[ABG]|LNX[12]|ITCH|NEDD4|NEDD4L|WWP[12]|SMURF[12]|SH3KBP1|SH3BP2|GAREM1|LPXN|SHIP[12]|SH3BGRL[123]|SH3GL[123]|SH3RF[12]|LDLRAP1)$/;

/** 磷脂酶（保守归 enzyme；cytoplasm，tier 3） */
const PHOSPHOLIPASE_RE =
  /^(?:PL[CG]\d+\w?|PLCB[123]|PLCG[12]|PLCD[123]|PLCE\d?|PLCL[12]|PLA2G\w+|PLD[123]|PLAA|PLA[12]G?)$/;

/**
 * 对单个 KGML entry 分类
 * @param entry KGML entry（label / aliases 为基因符号或别名）
 */
export function classifyEntry(entry: KeggEntry): Classification {
  // 1. 化合物（第二信使）→ 胞质，tier 3
  if (entry.type === 'compound') {
    return { compartment: 'cytoplasm', kind: 'compound', tier: 3 };
  }

  // map / group / ortholog / enzyme 等非基因类型 → 保守归酶
  if (entry.type === 'map' || entry.type === 'group' || entry.type === 'ortholog' || entry.type === 'enzyme') {
    return { compartment: 'cytoplasm', kind: 'enzyme', tier: 3 };
  }

  // 主 label 与别名符号集（统一大写）
  const labelSym = entry.label.trim().toUpperCase();
  const aliasSyms = entry.aliases
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0 && /^[A-Z0-9][A-Z0-9.\-_]+$/.test(s));

  /** 单符号分类链（优先级：通道→受体→配体→TF→GTPase→磷酸酶→MAPK级联→激酶→接头→磷脂酶） */
  const classifySymbol = (sym: string): Classification | null => {
    if (CHANNEL_RE.test(sym)) return { compartment: 'membrane', kind: 'channel', tier: 1 };
    if (RECEPTOR_RE.test(sym)) return { compartment: 'membrane', kind: 'receptor', tier: 1 };
    if (LIGAND_RE.test(sym)) return { compartment: 'extracellular', kind: 'ligand', tier: 0 };
    if (TF_RE.test(sym)) return { compartment: 'nucleus', kind: 'tf', tier: 5 };
    if (GTPASE_RE.test(sym)) return { compartment: 'cytoplasm', kind: 'gtpase', tier: 2 };
    if (PHOSPHATASE_RE.test(sym)) return { compartment: 'cytoplasm', kind: 'phosphatase', tier: 4 };
    if (MAPK_CASCADE_RE.test(sym)) return { compartment: 'cytoplasm', kind: 'kinase', tier: 3 };
    if (KINASE_RE.test(sym)) return { compartment: 'cytoplasm', kind: 'kinase', tier: 3 };
    if (ADAPTER_RE.test(sym)) return { compartment: 'cytoplasm', kind: 'adapter', tier: 2 };
    if (PHOSPHOLIPASE_RE.test(sym)) return { compartment: 'cytoplasm', kind: 'enzyme', tier: 3 };
    return null;
  };

  // 第一轮：主 label 精确判定（最可信 —— graphics.name 首项 / 种子提升后的符号）。
  // KGML 别名常与功能类别撞名（SOS1 的 alias "HGF"、AXIN1 的 alias "PPP1R49"、
  // STK4 的 alias "MST1"），因此 label 能定类时不再看 aliases
  if (labelSym && /^[A-Z0-9][A-Z0-9.\-_]+$/.test(labelSym)) {
    const byLabel = classifySymbol(labelSym);
    if (byLabel) return byLabel;
  }

  // 第二轮：任一别名判定（合并 entry 成员基因 / 家族别名）
  for (const sym of aliasSyms) {
    const byAlias = classifySymbol(sym);
    if (byAlias) return byAlias;
  }

  // 兜底：胞质酶，tier 3
  return { compartment: 'cytoplasm', kind: 'enzyme', tier: 3 };
}

/**
 * GErel 表达调控目标修正：
 * 作为 expression / repression 边 target 的基因上调为靶基因层级
 * （tier 6、细胞核、kind 'gene'）。由 subgraph 提取器在边生成后调用。
 */
export function applyExpressionTargets(nodes: CoreNode[], edges: CoreEdge[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    if (e.kind === 'expression' || e.kind === 'repression') {
      const t = byId.get(e.target);
      if (t) {
        t.kind = 'gene';
        t.compartment = 'nucleus';
        t.tier = 6;
      }
    }
  }
}
