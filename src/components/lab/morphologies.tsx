'use client';

/**
 * 虚拟细胞形态学渲染 —— 7 种细胞类型的 SVG 显微结构绘制
 * 组织学参照: Ross & Pawlina Histology / Alberts MBoC
 * 全部为静态装饰层（低透明度），信号分子节点叠加其上
 */
import { memo } from 'react';
import type { MorphologyKey } from '@/data/cell-types';
import { getGeometry, type CellGeometry } from '@/lib/simulation/layout';
import { useLang } from '@/lib/i18n';

interface Props {
  morph: MorphologyKey;
  tint: [string, string];
}

/* ---------------- 细胞器子组件 ---------------- */

function Bilayer({ geom }: { geom: CellGeometry }) {
  const { membraneY, membraneH, bodyX0, bodyX1 } = geom;
  const w = bodyX1 - bodyX0;
  const headR = 6.2;
  const pitch = 14.5;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let x = bodyX0 + 8; x < bodyX1 - 4; x += pitch) {
    top.push(`<circle cx="${x.toFixed(1)}" cy="${membraneY + 6}" r="${headR}"/>`);
    bottom.push(`<circle cx="${(x + pitch / 2).toFixed(1)}" cy="${membraneY + membraneH - 6}" r="${headR}"/>`);
  }
  return (
    <g>
      {/* 膜间隙底色 */}
      <rect
        x={bodyX0} y={membraneY} width={w} height={membraneH}
        fill="url(#membraneGrad)" opacity={0.5} rx={4}
      />
      {/* 磷脂头部两排（交错） */}
      <g fill="#5eead4" opacity={0.5} dangerouslySetInnerHTML={{ __html: top.join('') }} />
      <g fill="#2dd4bf" opacity={0.5} dangerouslySetInnerHTML={{ __html: bottom.join('') }} />
      {/* 尾部示意 */}
      <g stroke="#115e59" strokeWidth={1} opacity={0.35}>
        <line x1={bodyX0} y1={membraneY + 13} x2={bodyX1} y2={membraneY + 13} />
        <line x1={bodyX0} y1={membraneY + membraneH - 13} x2={bodyX1} y2={membraneY + membraneH - 13} />
      </g>
      {/* 糖萼 */}
      <g stroke="#a78afa" strokeWidth={1} opacity={0.18}>
        {Array.from({ length: Math.floor(w / 30) }, (_, i) => (
          <line key={i} x1={bodyX0 + 15 + i * 30} y1={membraneY + 2} x2={bodyX0 + 15 + i * 30} y2={membraneY - 9} />
        ))}
      </g>
    </g>
  );
}

function Nucleus({ cx, cy, r, abnormal = false }: { cx: number; cy: number; r: number; abnormal?: boolean }) {
  const pores = 16;
  const poreEls = Array.from({ length: pores }, (_, i) => {
    const ang = (Math.PI * 2 * i) / pores;
    return (
      <circle
        key={i}
        cx={cx + Math.cos(ang) * (r - 4)} cy={cy + Math.sin(ang) * (r - 4)}
        r={4.4} fill="#0f172a" stroke="#34d399" strokeWidth={1.4} opacity={0.85}
      />
    );
  });
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 7} fill="#020617" opacity={0.55} />
      <circle cx={cx} cy={cy} r={r} fill="url(#nucleusGrad)" stroke="#34d399" strokeWidth={2.2} opacity={0.92} />
      <circle cx={cx} cy={cy} r={r - 9} fill="none" stroke="#10b981" strokeWidth={1} opacity={0.5} strokeDasharray="3 5" />
      {poreEls}
      {/* 染色质 */}
      <g stroke="#94a3b8" strokeWidth={2} fill="none" opacity={abnormal ? 0.4 : 0.26}>
        <path d={`M ${cx - r * 0.55} ${cy - r * 0.3} q ${r * 0.3} ${-r * 0.18} ${r * 0.6} 0 t ${r * 0.35} ${r * 0.12}`} />
        <path d={`M ${cx - r * 0.4} ${cy + r * 0.25} q ${r * 0.35} ${r * 0.15} ${r * 0.7} 0 t ${r * 0.3} ${-r * 0.1}`} />
        <path d={`M ${cx + r * 0.1} ${cy - r * 0.55} q ${r * 0.2} ${r * 0.3} ${r * 0.05} ${r * 0.5}`} />
        {abnormal && (
          <path d={`M ${cx - r * 0.2} ${cy + r * 0.5} q ${r * 0.25} ${r * 0.2} ${r * 0.5} ${-r * 0.05} t ${-r * 0.2} ${-r * 0.25}`} stroke="#f87171" />
        )}
      </g>
      {/* 核仁 */}
      <circle cx={cx + r * 0.24} cy={cy - r * 0.18} r={r * 0.16} fill="#fbbf24" opacity={0.28} />
      <circle cx={cx + r * 0.24} cy={cy - r * 0.18} r={r * 0.1} fill="#f59e0b" opacity={0.22} />
    </g>
  );
}

function Mitochondrion({ x, y, rot, scale = 1 }: { x: number; y: number; rot: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${scale})`}>
      <ellipse rx={54} ry={22} fill="#1c1917" opacity={0.72} stroke="#f59e0b" strokeWidth={1.6} />
      <path
        d="M -36 0 q 9 -14 18 0 q 9 14 18 0 q 9 -14 18 0 q 9 14 18 0 M -30 -6 q 7 -10 14 0 q 7 10 14 0 q 7 -10 14 0"
        fill="none" stroke="#f59e0b" strokeWidth={1.2} opacity={0.55}
      />
      <ellipse rx={54} ry={22} fill="none" stroke="#fbbf24" strokeWidth={0.6} opacity={0.3} />
    </g>
  );
}

function RoughER({ x, y, w = 180, rows = 4 }: { x: number; y: number; w?: number; rows?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: rows }, (_, i) => {
        const yOff = i * 17;
        return (
          <g key={i}>
            <path
              d={`M 0 ${yOff} q ${w / 6} ${-11} ${w / 3} 0 t ${w / 3} 0 t ${w / 3} 0`}
              fill="none" stroke="#2dd4bf" strokeWidth={1.6} opacity={0.5}
            />
            {Array.from({ length: Math.floor(w / 17) }, (_, j) => (
              <circle key={j} cx={8 + j * 17 + (i % 2) * 5} cy={yOff - 3.4} r={2} fill="#5eead4" opacity={0.5} />
            ))}
          </g>
        );
      })}
    </g>
  );
}

function Golgi({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {Array.from({ length: 4 }, (_, i) => (
        <path
          key={i}
          d={`M ${-46 + i * 3} ${i * 13} q ${30 - i * 2} ${-16} ${60 - i * 4} 0 q ${16 - i} ${8} ${26 - i * 2} ${14}`}
          fill="none" stroke="#fbbf24" strokeWidth={2.4 - i * 0.3} opacity={0.5}
        />
      ))}
      <circle cx={-58} cy={46} r={5} fill="#fbbf24" opacity={0.4} />
      <circle cx={-40} cy={58} r={4} fill="#fbbf24" opacity={0.35} />
      <circle cx={70} cy={42} r={5} fill="#fbbf24" opacity={0.4} />
    </g>
  );
}

function Cytoskeleton({ geom }: { geom: CellGeometry }) {
  const { bodyX0, bodyX1 } = geom;
  return (
    <g stroke="#94a3b8" strokeWidth={1} opacity={0.16} fill="none">
      <path d={`M ${bodyX0 + 60} 700 C ${bodyX0 + 260} 560, ${bodyX1 - 300} 470, ${bodyX1 - 60} 300`} />
      <path d={`M ${bodyX0 + 120} 720 C ${bodyX0 + 320} 640, ${bodyX1 - 380} 620, ${bodyX1 - 110} 330`} />
      <path d={`M ${bodyX0 + 200} 214 C ${bodyX0 + 330} 330, ${bodyX0 + 480} 380, ${bodyX0 + 520} 500`} />
    </g>
  );
}

/* ---------------- 细胞体轮廓 ---------------- */

function BodyOutline({ morph, geom }: { morph: MorphologyKey; geom: CellGeometry }) {
  const { membraneY, bodyX0, bodyX1, membraneH } = geom;
  const bottom = 752;
  switch (morph) {
    case 'hepatocyte':
      return (
        <path
          d={`M ${bodyX0} ${membraneY + membraneH} L ${bodyX0 - 6} ${560} Q ${bodyX0 - 10} ${bottom - 30} ${bodyX0 + 90} ${bottom}
              L ${bodyX1 - 60} ${bottom} Q ${bodyX1 + 10} ${bottom - 40} ${bodyX1} ${560} L ${bodyX1} ${membraneY + membraneH} Z`}
          fill="url(#cytoGrad)" stroke="#14b8a6" strokeWidth={1.4} opacity={0.92}
        />
      );
    case 'neuron':
      return (
        <path
          d={`M ${bodyX0} ${membraneY + membraneH} L ${bodyX0 - 14} 400 Q ${bodyX0 - 18} ${bottom - 90} ${bodyX0 + 110} ${bottom - 30}
              Q 600 ${bottom + 10} ${bodyX1 - 40} ${bottom - 90} Q ${bodyX1 + 8} ${bottom - 150} ${bodyX1} 420
              L ${bodyX1} ${membraneY + membraneH} Z`}
          fill="url(#cytoGrad)" stroke="#14b8a6" strokeWidth={1.4} opacity={0.92}
        />
      );
    case 'tcell':
      return (
        <path
          d={`M ${bodyX0} ${membraneY + membraneH} C ${bodyX0 - 30} 460, ${bodyX0 - 20} 640, ${(bodyX0 + bodyX1) / 2} ${bottom - 6}
              C ${bodyX1 + 20} 640, ${bodyX1 + 30} 460, ${bodyX1} ${membraneY + membraneH} Z`}
          fill="url(#cytoGrad)" stroke="#14b8a6" strokeWidth={1.4} opacity={0.92}
        />
      );
    case 'epithelial':
      return (
        <path
          d={`M ${bodyX0} ${membraneY + membraneH} L ${bodyX0 - 10} 620 Q ${bodyX0 - 12} ${bottom - 40} ${bodyX0 + 60} ${bottom - 28}
              L ${bodyX1 - 60} ${bottom - 28} Q ${bodyX1 + 12} ${bottom - 40} ${bodyX1 + 10} 620
              L ${bodyX1} ${membraneY + membraneH} Z`}
          fill="url(#cytoGrad)" stroke="#14b8a6" strokeWidth={1.4} opacity={0.92}
        />
      );
    case 'cardiomyocyte':
      return (
        <path
          d={`M ${bodyX0} ${membraneY + membraneH} L ${bodyX0 - 26} 480 Q ${bodyX0 - 28} ${bottom - 20} ${bodyX0 + 70} ${bottom - 12}
              L ${bodyX1 - 70} ${bottom - 12} Q ${bodyX1 + 28} ${bottom - 20} ${bodyX1 + 26} 480
              L ${bodyX1} ${membraneY + membraneH} Z`}
          fill="url(#cytoGrad)" stroke="#14b8a6" strokeWidth={1.4} opacity={0.92}
        />
      );
    case 'fibroblast':
      return (
        <path
          d={`M ${bodyX0} ${membraneY + membraneH} Q ${bodyX0 - 90} 480, ${bodyX0 + 120} ${bottom - 60}
              Q 600 ${bottom + 14}, ${bodyX1 - 120} ${bottom - 60} Q ${bodyX1 + 90} 480, ${bodyX1} ${membraneY + membraneH} Z`}
          fill="url(#cytoGrad)" stroke="#14b8a6" strokeWidth={1.4} opacity={0.92}
        />
      );
    case 'cancer':
      return (
        <path
          d={`M ${bodyX0} ${membraneY + membraneH}
              C ${bodyX0 - 26} 380, ${bodyX0 + 6} 300, ${bodyX0 + 60} 320 C ${bodyX0 + 40} 420, ${bodyX0 + 90} 560, ${bodyX0 + 130} ${bottom - 44}
              C ${bodyX0 + 240} ${bottom + 6}, ${bodyX1 - 260} ${bottom + 2}, ${bodyX1 - 120} ${bottom - 52}
              C ${bodyX1 - 40} 560, ${bodyX1 - 60} 400, ${bodyX1 - 4} 330 C ${bodyX1 + 30} 380, ${bodyX1 + 20} 430, ${bodyX1} ${membraneY + membraneH} Z`}
          fill="url(#cytoGrad)" stroke="#f43f5e" strokeWidth={1.8} opacity={0.9}
        />
      );
  }
}

/* ---------------- 形态学特化结构 ---------------- */

function MorphExtras({ morph, geom }: { morph: MorphologyKey; geom: CellGeometry }) {
  const { t } = useLang();
  const { membraneY, bodyX0, bodyX1, membraneH } = geom;
  switch (morph) {
    case 'hepatocyte':
      return (
        <g>
          {/* 糖原颗粒 */}
          <g fill="#fbbf24" opacity={0.3}>
            {Array.from({ length: 26 }, (_, i) => (
              <circle key={i} cx={180 + (i * 73) % 900} cy={236 + ((i * 41) % 26)} r={3.4} />
            ))}
          </g>
          {/* 胆小管 */}
          <path d={`M ${bodyX0 + 40} ${membraneY + membraneH + 14} q 40 -8 80 0 q 40 8 80 0`} fill="none" stroke="#fbbf24" strokeWidth={2.6} opacity={0.4} />
          <text x={bodyX0 + 52} y={membraneY + membraneH + 40} fill="#fbbf24" fontSize={10} opacity={0.55}>{t('morph.bileCanaliculus')}</text>
        </g>
      );
    case 'neuron':
      return (
        <g>
          {/* 树突（向上穿过胞膜进入细胞外区） */}
          <g stroke="#14b8a6" strokeWidth={10} strokeLinecap="round" fill="none" opacity={0.34}>
            <path d={`M 420 ${membraneY + 30} C 400 ${membraneY - 60} 380 ${membraneY - 70} 360 96`} />
            <path d={`M 560 ${membraneY + 30} C 560 ${membraneY - 80} 545 ${membraneY - 90} 560 70`} />
            <path d={`M 700 ${membraneY + 30} C 720 ${membraneY - 50} 740 ${membraneY - 70} 770 100`} />
          </g>
          <g stroke="#14b8a6" strokeWidth={3.4} strokeLinecap="round" opacity={0.5}>
            <path d="M 400 118 l -14 -22 M 566 92 l -10 -24 M 748 112 l 16 -20 M 384 150 l -20 -12 M 572 130 l 22 -10" />
          </g>
          {/* 轴突 + 髓鞘 */}
          <path d="M 925 470 L 1190 470" stroke="#14b8a6" strokeWidth={9} opacity={0.4} strokeLinecap="round" />
          <g fill="none" stroke="#e2e8f0" strokeWidth={7} opacity={0.28}>
            <rect x={955} y={452} width={44} height={36} rx={8} />
            <rect x={1015} y={452} width={44} height={36} rx={8} />
            <rect x={1075} y={452} width={44} height={36} rx={8} />
          </g>
          {/* 轴突终末 */}
          <path d="M 1180 470 q 14 -16 26 -8 q 12 8 0 18 q -12 8 -26 -10 z" fill="#14b8a6" opacity={0.35} />
          <text x={930} y={500} fill="#5eead4" fontSize={10} opacity={0.6}>{t('morph.axon')}</text>
          <text x={340} y={92} fill="#5eead4" fontSize={10} opacity={0.6}>{t('morph.dendrite')}</text>
          {/* Nissl 小体（rER 团块） */}
          <g opacity={0.75}>
            <RoughER x={330} y={300} w={110} rows={3} />
            <RoughER x={660} y={310} w={100} rows={2} />
          </g>
        </g>
      );
    case 'tcell':
      return (
        <g>
          {/* 微绒毛 */}
          <g stroke="#2dd4bf" strokeWidth={2.2} opacity={0.45} strokeLinecap="round">
            {Array.from({ length: 24 }, (_, i) => {
              const x = bodyX0 + 20 + (i * 26);
              const len = 10 + (i % 4) * 5;
              return <line key={i} x1={x} y1={membraneY + 4} x2={x + (i % 3 - 1) * 5} y2={membraneY - len} />;
            })}
          </g>
          <text x={bodyX0 + 10} y={membraneY - 30} fill="#5eead4" fontSize={10} opacity={0.6}>{t('morph.microvilli')}</text>
        </g>
      );
    case 'epithelial':
      return (
        <g>
          {/* 顶部微绒毛（刷状缘） */}
          <g stroke="#5eead4" strokeWidth={2.4} opacity={0.6} strokeLinecap="round">
            {Array.from({ length: 36 }, (_, i) => {
              const x = bodyX0 + 8 + i * 15;
              return <line key={i} x1={x} y1={membraneY + 2} x2={x} y2={membraneY - 15} />;
            })}
          </g>
          {/* 紧密连接 + 桥粒 */}
          <g>
            <path d={`M ${bodyX0 - 4} ${membraneY + membraneH + 26} l 0 8 M ${bodyX0 + 2} ${membraneY + membraneH + 34} l 0 8`} stroke="#f43f5e" strokeWidth={3} opacity={0.7} />
            <path d={`M ${bodyX1 + 4} ${membraneY + membraneH + 26} l 0 8 M ${bodyX1 - 2} ${membraneY + membraneH + 34} l 0 8`} stroke="#f43f5e" strokeWidth={3} opacity={0.7} />
            <text x={bodyX0 - 78} y={membraneY + membraneH + 42} fill="#fda4af" fontSize={9.5} opacity={0.75}>{t('morph.tightJunction')}</text>
          </g>
          {/* 基底板 */}
          <path d={`M ${bodyX0 - 26} 762 Q 600 770, ${bodyX1 + 26} 762`} stroke="#fbbf24" strokeWidth={3.4} fill="none" opacity={0.4} />
          <text x={bodyX1 - 80} y={775} fill="#fbbf24" fontSize={9.5} opacity={0.6}>{t('morph.basementMembrane')}</text>
        </g>
      );
    case 'cardiomyocyte': {
      // 肌原纤维横纹 + 闰盘
      const rows = [268, 306, 344, 382, 620, 658, 696];
      return (
        <g>
          <g opacity={0.3}>
            {rows.map((y) => (
              <g key={y}>
                {Array.from({ length: 60 }, (_, i) => {
                  const x = bodyX0 + 30 + i * 16;
                  return x < bodyX1 - 30 ? <rect key={i} x={x} y={y} width={5} height={30} fill="#f87171" opacity={0.75} /> : null;
                })}
                <line x1={bodyX0 + 30} y1={y + 15} x2={bodyX1 - 30} y2={y + 15} stroke="#fca5a5" strokeWidth={0.8} opacity={0.7} />
              </g>
            ))}
          </g>
          {/* 闰盘（右侧） */}
          <path d={`M ${bodyX1 - 34} 240 l 16 20 l -16 20 l 16 20 l -16 20`} fill="none" stroke="#f43f5e" strokeWidth={3.2} opacity={0.75} />
          <text x={bodyX1 - 106} y={236} fill="#fda4af" fontSize={10} opacity={0.7}>{t('morph.intercalatedDisc')}</text>
          {/* 平行线粒体列 */}
          <Mitochondrion x={bodyX0 + 120} y={560} rot={2} scale={0.9} />
          <Mitochondrion x={bodyX0 + 320} y={580} rot={-2} scale={0.9} />
          <Mitochondrion x={bodyX1 - 320} y={575} rot={3} scale={0.85} />
        </g>
      );
    }
    case 'fibroblast':
      return (
        <g>
          {/* 细胞外胶原纤维 */}
          <g stroke="#fbbf24" strokeWidth={2} fill="none" opacity={0.3}>
            <path d="M 130 90 q 60 26 120 0 t 120 0" />
            <path d="M 150 118 q 60 26 120 0 t 120 0" />
            <path d="M 980 96 q 55 24 110 0 t 110 0" />
          </g>
          <text x={128} y={70} fill="#fbbf24" fontSize={10} opacity={0.6}>{t('morph.collagen')}</text>
          {/* 发达的 rER */}
          <g opacity={0.85}>
            <RoughER x={220} y={640} w={190} rows={4} />
            <RoughER x={820} y={650} w={160} rows={3} />
          </g>
        </g>
      );
    case 'cancer':
      return (
        <g>
          {/* 膜出芽（blebs） */}
          <g fill="#7f1d1d" stroke="#f43f5e" strokeWidth={1.2} opacity={0.55}>
            <circle cx={bodyX0 + 150} cy={316} r={13} />
            <circle cx={bodyX0 + 70} cy={396} r={9} />
            <circle cx={bodyX1 - 90} cy={344} r={11} />
            <circle cx={bodyX1 - 170} cy={303} r={8} />
          </g>
          <text x={bodyX0 + 110} y={288} fill="#fda4af" fontSize={10} opacity={0.7}>{t('morph.blebs')}</text>
        </g>
      );
  }
}

/* ---------------- 主组件 ---------------- */

export const CellMorphology = memo(function CellMorphology({ morph, tint }: Props) {
  const geom = getGeometry(morph);
  return (
    <g>
      <defs>
        <linearGradient id="cytoGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tint[0]} stopOpacity={0.5} />
          <stop offset="55%" stopColor={tint[1]} stopOpacity={0.42} />
          <stop offset="100%" stopColor={tint[1]} stopOpacity={0.55} />
        </linearGradient>
        <radialGradient id="nucleusGrad" cx="0.42" cy="0.38" r="0.75">
          <stop offset="0%" stopColor="#134e4a" stopOpacity={0.85} />
          <stop offset="70%" stopColor="#022c22" stopOpacity={0.8} />
          <stop offset="100%" stopColor="#022c22" stopOpacity={0.9} />
        </radialGradient>
      </defs>

      {/* 细胞质 */}
      <g style={{ filter: 'url(#softGlow)' }}>
        <BodyOutline morph={morph} geom={geom} />
      </g>

      {/* 核糖体散布 */}
      <g fill="#94a3b8" opacity={0.28}>
        {Array.from({ length: 46 }, (_, i) => (
          <circle key={i} cx={bodyX_rand(geom, i, 1)} cy={250 + (i * 67) % 460} r={2.2} />
        ))}
      </g>

      <Cytoskeleton geom={geom} />

      {/* 细胞器（依形态差异化） */}
      <Organelles morph={morph} geom={geom} />

      {/* 细胞核 */}
      {geom.nuclei.map((n, i) => (
        <Nucleus key={i} cx={n.cx} cy={n.cy} r={n.r} abnormal={morph === 'cancer'} />
      ))}

      {/* 磷脂双分子层 */}
      <Bilayer geom={geom} />

      {/* 形态学特化结构 */}
      <MorphExtras morph={morph} geom={geom} />
    </g>
  );
});

function bodyX_rand(geom: CellGeometry, i: number, salt: number): number {
  const span = geom.bodyX1 - geom.bodyX0 - 120;
  return geom.bodyX0 + 60 + ((i * 197 + salt * 89) % span);
}

function Organelles({ morph, geom }: { morph: MorphologyKey; geom: CellGeometry }) {
  const { bodyX0, bodyX1 } = geom;
  switch (morph) {
    case 'hepatocyte':
      return (
        <g>
          <Mitochondrion x={bodyX0 + 130} y={320} rot={-4} />
          <Mitochondrion x={bodyX0 + 330} y={380} rot={6} scale={0.9} />
          <Mitochondrion x={bodyX1 - 210} y={330} rot={3} />
          <Mitochondrion x={bodyX1 - 90} y={700} rot={-8} scale={0.85} />
          <Mitochondrion x={300} y={680} rot={5} scale={0.9} />
          <RoughER x={bodyX0 + 90} y={620} w={170} rows={3} />
          <Golgi x={bodyX0 + 120} y={470} scale={0.9} />
          {/* 过氧化物酶体 */}
          <g fill="#f43f5e" opacity={0.3}>
            <circle cx={bodyX1 - 330} cy={640} r={6} />
            <circle cx={bodyX1 - 290} cy={690} r={5} />
          </g>
        </g>
      );
    case 'neuron':
      return (
        <g>
          <Mitochondrion x={430} y={620} rot={8} />
          <Mitochondrion x={700} y={650} rot={-6} scale={0.85} />
          <Golgi x={380} y={440} scale={0.8} />
        </g>
      );
    case 'tcell':
      return (
        <g>
          <Mitochondrion x={bodyX0 + 120} y={300} rot={-6} scale={0.75} />
          <Mitochondrion x={bodyX1 - 130} y={290} rot={5} scale={0.75} />
          <Golgi x={bodyX1 - 190} y={660} scale={0.7} />
        </g>
      );
    case 'epithelial':
      return (
        <g>
          <Mitochondrion x={bodyX0 + 120} y={330} rot={-3} scale={0.8} />
          <Mitochondrion x={bodyX1 - 120} y={340} rot={4} scale={0.8} />
          <RoughER x={bodyX0 + 100} y={430} w={130} rows={3} />
          <Golgi x={bodyX0 + 120} y={640} scale={0.75} />
        </g>
      );
    case 'cardiomyocyte':
      return <g />;
    case 'fibroblast':
      return (
        <g>
          <Mitochondrion x={500} y={300} rot={2} scale={0.8} />
          <Golgi x={430} y={470} scale={0.9} />
        </g>
      );
    case 'cancer':
      return (
        <g>
          <Mitochondrion x={bodyX0 + 160} y={300} rot={14} scale={0.7} />
          <Mitochondrion x={bodyX1 - 170} y={620} rot={-10} scale={0.65} />
          <Mitochondrion x={700} y={690} rot={8} scale={0.6} />
          {/* 病理核分裂象 */}
          <g stroke="#f43f5e" strokeWidth={2} opacity={0.5} fill="none">
            <path d="M 960 620 q 30 -50 60 -46 M 960 620 q -30 50 -60 46" />
            <path d="M 980 596 l 14 -12 M 940 644 l -14 12" />
          </g>
        </g>
      );
  }
}
