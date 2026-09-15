/**
 * 通路 × 细胞类型表达矩阵（科学分类）
 *
 * 原则（参照 Alberts MBoC / UniProt Tissue specificity / KEGG PATHWAY 疾病注释）：
 *  1. "管家级"信号机械（MAPK / PI3K-Akt / TGF-β / JAK-STAT / cAMP / Ca²⁺ / mTOR /
 *     NF-κB / Apoptosis / p53 / AMPK / Hippo / HIF-1 / FoxO / Sphingolipid / Ras）
 *     在有核细胞中普遍表达 → 默认 active，不逐一登记。
 *  2. 仅登记"低活性 / 未检出"组合（INACTIVE_MATRIX），每条附双语科学注释；
 *     其余组合一律视为 active。
 *  3. signature（特征通路）由 cell-types.ts 的 pathways 字派生（单一真源）。
 *  4. 癌细胞系（KRAS G12D）几乎所有通路活性异常——保留高活性事实，
 *     仅 cGAS-STING 按其"免疫冷肿瘤"表型标为低活性。
 */

import { CELL_TYPE_MAP, CELL_TYPES } from './cell-types';

export type PathwayCellActivity = 'signature' | 'active' | 'inactive';

export interface PathwayCellNote {
  zh: string;
  en: string;
}

/** 低活性 / 未检出组合登记表 */
const INACTIVE_MATRIX: Record<string, Partial<Record<string, PathwayCellNote>>> = {
  // Wnt —— 成体心肌静默
  hsa04310: {
    cardiomyocyte: {
      zh: '成体心肌 Wnt/β-catenin 信号静默，仅在心脏发育与损伤修复时短暂重新激活',
      en: 'Wnt/β-catenin signaling is silent in adult myocardium and only transiently re-engaged during development and injury repair',
    },
  },
  // Notch —— 成体心肌静默
  hsa04330: {
    cardiomyocyte: {
      zh: '成体心肌 Notch 信号基本静默，仅在新生儿期心脏再生与损伤反应中重新激活',
      en: 'Notch signaling is largely silent in adult cardiomyocytes, re-engaged only in neonatal cardiac regeneration and injury responses',
    },
  },
  // VEGF —— 血管内皮为中心的通路；本细胞系中多数为旁分泌"分泌源"角色
  hsa04370: {
    hepatocyte: {
      zh: '肝细胞是 VEGF 分泌源，血管生成信号由肝血窦内皮细胞的 VEGFR 承担（旁分泌方向）',
      en: 'Hepatocytes are a VEGF source; the angiogenic signal is received by sinusoidal-endothelial VEGFRs (paracrine direction)',
    },
    tcell: {
      zh: 'T 细胞 VEGFR 表达极低，肿瘤源性 VEGF 主要经旁分泌阻碍 T 细胞浸润（免疫抑制微环境）',
      en: 'T cells express negligible VEGFR; tumor-derived VEGF instead impedes T-cell infiltration paracrinally (immunosuppressive niche)',
    },
    epithelial: {
      zh: '肠上皮以 VEGF 分泌参与黏膜血管维护，自身 VEGFR 激酶信号弱（旁分泌为主）',
      en: 'Intestinal epithelium mainly secretes VEGF to support mucosal vasculature; its own VEGFR kinase signaling is weak',
    },
    cardiomyocyte: {
      zh: '心肌细胞是心脏 VEGF 的主要分泌源，冠脉血管网的 VEGFR 信号由内皮细胞承担',
      en: 'Cardiomyocytes are the heart\'s principal VEGF source; coronary VEGFR signaling resides in endothelial cells',
    },
  },
  // Toll 样受体 —— 髓系/屏障上皮的 PRR 特征
  hsa04620: {
    neuron: {
      zh: '神经元 TLR 转录水平低，中枢模式识别主要由小胶质细胞（TLR2/4/9）承担',
      en: 'Neuronal TLR expression is low; CNS pattern recognition is borne mainly by microglia (TLR2/4/9)',
    },
    tcell: {
      zh: '模式识别受体是髓系特征（巨噬细胞/树突状细胞），T 细胞仅有 TLR2/TLR9 的协同刺激作用',
      en: 'Pattern-recognition receptors are a myeloid trait (macrophages/dendritic cells); T cells show only TLR2/TLR9 co-stimulation',
    },
    cardiomyocyte: {
      zh: '心肌细胞 TLR4 表达低，心脏炎症感知主要由驻留心脏巨噬细胞承担',
      en: 'Cardiomyocyte TLR4 is low; cardiac inflammatory sensing is handled by resident cardiac macrophages',
    },
  },
  // 细胞周期 —— 终末分化细胞锁死 G0
  hsa04110: {
    neuron: {
      zh: '成熟神经元为终末分化细胞——永久退出细胞周期（G0 锁定）',
      en: 'Mature neurons are terminally differentiated — permanently withdrawn from the cell cycle (G0 locked)',
    },
    cardiomyocyte: {
      zh: '成体心肌细胞更新率 ~1%/年，绝大多数停留于 G0 期（再生医学核心难题）',
      en: 'Adult cardiomyocyte turnover is ~1%/year with the vast majority locked in G0 (a central regenerative-medicine challenge)',
    },
  },
  // ErbB —— 上皮/胶质/心肌谱系特征
  hsa04012: {
    tcell: {
      zh: 'ErbB 受体家族（EGFR/HER2-4）主要表达于上皮、胶质与心肌谱系，淋巴细胞不表达',
      en: 'The ErbB receptor family (EGFR/HER2-4) marks epithelial, glial and cardiac lineages and is absent from lymphocytes',
    },
  },
  // Hedgehog —— 发育/间质对话通路
  hsa04340: {
    neuron: {
      zh: 'Hh 在神经管腹侧模式化完成后即下调，成熟神经元 Hh 信号静默（仅少突胶质前体维持应答）',
      en: 'Hh is downregulated after ventral neural-tube patterning; mature neurons are Hh-silent (only oligodendrocyte precursors stay responsive)',
    },
    tcell: {
      zh: 'Hh 是发育与间质对话通路，外周成熟 T 细胞应答极低',
      en: 'Hh is a developmental/stromal dialogue pathway; peripheral mature T cells respond minimally',
    },
  },
  // NOD 样受体 —— 髓系/屏障上皮的炎症小体特征
  hsa04621: {
    neuron: {
      zh: '中枢炎症小体活性位于小胶质细胞与星形胶质细胞（NLRP3/AIM2），神经元自身低表达',
      en: 'CNS inflammasome activity resides in microglia and astrocytes (NLRP3/AIM2); neurons themselves express little',
    },
    tcell: {
      zh: '炎症小体效应（pro-IL-1β 转录 + caspase-1 切割）是髓系特征，T 细胞缺乏 IL1B 转录程序',
      en: 'Inflammasome output (pro-IL-1β transcription + caspase-1 cleavage) is a myeloid trait; T cells lack the IL1B transcriptional program',
    },
    fibroblast: {
      zh: 'NLR 模式识别集中于髓系与屏障上皮，成纤维细胞炎症小体活性低',
      en: 'NLR pattern recognition is concentrated in myeloid and barrier epithelium; fibroblast inflammasome activity is low',
    },
  },
  // cGAS-STING —— 胞质 DNA 感知
  hsa04623: {
    neuron: {
      zh: '终末分化神经元胞质 DNA 感知需求低（无复制压力），中枢 DNA 感知主要在小胶质细胞',
      en: 'Post-mitotic neurons have little need for cytosolic DNA sensing; CNS DNA sensing resides mainly in microglia',
    },
    cancer: {
      zh: 'PDAC 常见表观沉默 STING（染色质压缩驱导，免疫冷肿瘤特征），胞质 DNA 感知由肿瘤基质细胞承担',
      en: 'PDAC frequently shows epigenetic STING silencing (chromatin-compaction driven, an immune-cold trait); cytosolic DNA sensing falls to stromal cells',
    },
  },
};

/** 通路在指定细胞中的活性分级（signature 派生自 cell-types.ts 的特征通路表） */
export function pathwayActivity(pathwayId: string, cellId: string): PathwayCellActivity {
  const inactive = INACTIVE_MATRIX[pathwayId]?.[cellId];
  if (inactive) return 'inactive';
  return CELL_TYPE_MAP.get(cellId)?.pathways.includes(pathwayId) ? 'signature' : 'active';
}

/** 低活性科学注释（无则 null） */
export function inactiveNote(pathwayId: string, cellId: string): PathwayCellNote | null {
  return INACTIVE_MATRIX[pathwayId]?.[cellId] ?? null;
}

export interface PathwayCellExpr {
  cellId: string;
  name: string;
  nameEn: string;
  activity: PathwayCellActivity;
}

/** 通路在全部 7 类细胞中的表达谱（通路详情/分布徽标用） */
export function pathwayExpression(pathwayId: string): PathwayCellExpr[] {
  return CELL_TYPES.map((c) => ({
    cellId: c.id,
    name: c.name,
    nameEn: c.nameEn,
    activity: pathwayActivity(pathwayId, c.id),
  }));
}
