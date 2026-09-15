/**
 * KGML (KEGG XML) 解析器
 * 将 KEGG REST /get/{id}/kgml 返回的 XML 解析为结构化 JSON。
 *
 * 采用纯正则实现（KGML 属性规整、元素结构简单，正则可靠且零依赖）。
 * 注意：KGML 属性值可能跨行（换行缩进），因此先用非贪婪块匹配取出
 * 完整元素，再从元素字符串中逐个提取 key="value" 属性。
 */

import type { KeggEntry, KeggRelation } from '@/types/kegg';

/** group 类型 entry 的复合物成员映射 */
export interface KeggComponent {
  groupId: number;
  memberIds: number[];
}

export interface ParsedKgml {
  title: string;
  number: string;
  entries: KeggEntry[];
  relations: KeggRelation[];
  components: KeggComponent[];
}

/**
 * 常见第二信使 / 信号小分子的中文名映射表
 * （cpd id → 人类可读名；映射不到的保持 cpd id）
 * 数据核对自 https://rest.kegg.jp/get/cpd:Cxxxxx
 */
export const COMPOUND_NAMES: Record<string, string> = {
  C00076: 'Ca²⁺ (Calcium)',
  C00575: 'cAMP (环磷酸腺苷)',
  C00942: 'cGMP (环磷酸鸟苷)',
  C00165: 'DAG (二酰甘油)',
  C01245: 'IP₃ (肌醇 1,4,5-三磷酸)',
  C00002: 'ATP',
  C00008: 'ADP',
  C00044: 'GTP',
  C00035: 'GDP',
  C00020: 'AMP',
  C00004: 'NADH',
  C00003: 'NAD⁺',
  C00080: 'H⁺',
  C00009: 'Pi (无机磷酸)',
  C00059: 'PIP₂ (磷脂酰肌醇 4,5-二磷酸)',
  C00698: 'Cl⁻',
  C00238: 'K⁺',
  C01330: 'Na⁺',
  C00288: 'HCO₃⁻',
  C01996: 'ACh (乙酰胆碱)',
  C00788: '肾上腺素 (Epinephrine)',
  C00547: '去甲肾上腺素 (Norepinephrine)',
  C03758: '多巴胺 (Dopamine)',
  C00780: '血清素 (Serotonin/5-HT)',
  C00584: 'PGE₂ (前列腺素 E2)',
  C01312: 'PGI₂ (前列环素)',
  C00334: 'GABA (γ-氨基丁酸)',
  C00186: '乳酸 (L-Lactate)',
  C01089: 'β-羟基丁酸',
  C20792: '油酰乙醇胺 (OEA)',
  C20793: '3-羟基辛酸',
  C06124: 'S1P (鞘氨醇-1-磷酸)',
  C13050: 'cADPR (环 ADP 核糖)',
  C13051: 'NAADP',
  C11556: 'PI(3,5)P₂',
  C00212: '腺苷 (Adenosine)',
  C00042: '琥珀酸 (Succinate)',
  C00416: '磷脂酸 (Phosphatidate)',
  // —— 新增（HIF-1/PI3K/FoxO 等新策划通路涉及的辅底物与第二信使，
  //    名称核对自 rest.kegg.jp/get/cpd:Cxxxxx）——
  C05981: 'PIP₃ (磷脂酰肌醇 3,4,5-三磷酸)',
  C00007: 'O₂ (分子氧)',
  C14818: 'Fe²⁺ (二价铁离子)',
  C00072: '抗坏血酸 (Ascorbate)',
  C00026: '2-OG (2-氧代戊二酸)',
  C00533: 'NO (一氧化氮)',
  C00001: 'H₂O (水)',
  C05978: 'PIP₂ (磷脂酰肌醇 4,5-二磷酸)',
};

/** XML 实体反转义（&gt; &lt; &amp; &quot; &apos;） */
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

/** 从标签字符串中提取所有 key="value" 属性 */
function extractAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_][\w-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) {
    out[m[1]] = unescapeXml(m[2]);
  }
  return out;
}

/** graphics.name 别名串 → 主 label + 别名数组；去除 KEGG 省略号 */
function splitLabel(graphicsName: string): { label: string; aliases: string[] } {
  const parts = graphicsName
    .split(/\s*,\s*/)
    .map((p) => p.trim())
    .map((p) => p.replace(/\.{2,}$/, '').trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return { label: '', aliases: [] };
  return { label: parts[0], aliases: parts.slice(1) };
}

/** KEGG name 属性（空格分隔的 id 列表）→ keggIds；过滤 group 的 "undefined" 占位 */
function splitIds(name: string): string[] {
  return name
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== 'undefined');
}

const SELF_CLOSING_TAG = (name: string) => new RegExp(`<${name}\\b([^>]*?)\\/>`, 'g');

/**
 * 解析 KGML XML 文档
 * @example parseKgml(xmlString)
 */
export function parseKgml(xml: string): ParsedKgml {
  // ---- pathway 根元素（title / number）----
  const pathwayMatch = xml.match(/<pathway\b([^>]*?)>/);
  const pathwayAttrs = pathwayMatch ? extractAttrs(pathwayMatch[1]) : {};
  const title = pathwayAttrs['title'] ?? '';
  const number = pathwayAttrs['number'] ?? '';

  const entries: KeggEntry[] = [];
  const components: KeggComponent[] = [];

  // ---- entry 元素（含子元素 graphics / component，也可能自闭合）----
  const entryRe = /<entry\b([^>]*?)\/>|<entry\b([^>]*?)>([\s\S]*?)<\/entry>/g;
  let em: RegExpExecArray | null;
  while ((em = entryRe.exec(xml)) !== null) {
    const attrs = extractAttrs(em[1] ?? em[2] ?? '');
    const body = em[3] ?? '';

    const entryId = parseInt(attrs['id'] ?? '', 10);
    if (!Number.isFinite(entryId)) continue;

    const type = (attrs['type'] ?? 'gene') as KeggEntry['type'];
    const keggIds = splitIds(attrs['name'] ?? '');

    // graphics 子元素（group entry 可能缺 name 属性）
    const gMatch = body.match(/<graphics\b([^>]*?)\/>/);
    const gAttrs = gMatch ? extractAttrs(gMatch[1]) : {};
    const graphicsName = gAttrs['name'] ?? '';
    const { label, aliases } = splitLabel(graphicsName);

    // 化合物：KGML graphics.name 常直接是 cpd id（如 "C05981"）——优先用
    // 人类可读短名作为显示 label（如 "PIP₃"），原始 cpd id 与完整名保留在 aliases
    let finalLabel = label;
    let finalAliases = aliases;
    if (type === 'compound') {
      const cpdId = keggIds[0]?.replace(/^cpd:/, '') ?? label;
      const humanName = COMPOUND_NAMES[cpdId];
      if (humanName && (label === cpdId || label === '')) {
        // graphics 名为 cpd id → 替换为短名（括号前的主名）；原始 id 保留在 aliases
        finalLabel = humanName.split(' (')[0];
        finalAliases = [cpdId, humanName, ...aliases];
      } else {
        finalLabel = label || cpdId;
        if (humanName && !finalAliases.includes(humanName)) {
          finalAliases = [humanName, ...finalAliases];
        }
      }
    }

    // group 成员（复合物 component 子元素）
    const memberIds: number[] = [];
    const compRe = SELF_CLOSING_TAG('component');
    let cm: RegExpExecArray | null;
    while ((cm = compRe.exec(body)) !== null) {
      const cid = parseInt(extractAttrs(cm[1])['id'] ?? '', 10);
      if (Number.isFinite(cid)) memberIds.push(cid);
    }
    if (type === 'group' && memberIds.length > 0) {
      components.push({ groupId: entryId, memberIds });
    }

    entries.push({
      entryId,
      keggIds,
      type,
      label: finalLabel,
      aliases: finalAliases,
      shape: gAttrs['type'] ?? 'rectangle',
      x: parseInt(gAttrs['x'] ?? '0', 10) || 0,
      y: parseInt(gAttrs['y'] ?? '0', 10) || 0,
      w: parseInt(gAttrs['width'] ?? '0', 10) || 0,
      h: parseInt(gAttrs['height'] ?? '0', 10) || 0,
    });
  }

  // ---- relation 元素（含 subtype 子元素）----
  const relations: KeggRelation[] = [];
  const relRe = /<relation\b([^>]*?)\/>|<relation\b([^>]*?)>([\s\S]*?)<\/relation>/g;
  let rm: RegExpExecArray | null;
  while ((rm = relRe.exec(xml)) !== null) {
    const attrs = extractAttrs(rm[1] ?? rm[2] ?? '');
    const body = rm[3] ?? '';
    const entry1 = parseInt(attrs['entry1'] ?? '', 10);
    const entry2 = parseInt(attrs['entry2'] ?? '', 10);
    if (!Number.isFinite(entry1) || !Number.isFinite(entry2)) continue;

    const subtypes: { name: string; value: string }[] = [];
    const subRe = SELF_CLOSING_TAG('subtype');
    let sm: RegExpExecArray | null;
    while ((sm = subRe.exec(body)) !== null) {
      const sAttrs = extractAttrs(sm[1]);
      if (sAttrs['name']) {
        subtypes.push({ name: sAttrs['name'], value: sAttrs['value'] ?? '' });
      }
    }

    relations.push({
      entry1,
      entry2,
      type: attrs['type'] ?? 'PPrel',
      subtypes,
    });
  }

  return { title, number, entries, relations, components };
}
