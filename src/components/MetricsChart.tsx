import type { RefObject } from 'react'
import type { MatrixConfig } from '../types'
import { METRIC_DEFS } from '../types'
import { mergeCounts, groupLabel } from '../lib/merge'
import { computeMetrics } from '../lib/metrics'
import type { ClassMetrics, AverageMetrics } from '../lib/metrics'

interface Props {
  cfg: MatrixConfig
  svgRef: RefObject<SVGSVGElement>
}

const SURFACE = '#FFFFFF'
const INK = '#111111'
const INK_MUTED = '#52514E'
const RULE = '#D9D8D3'
const GRID = '#E9E8E4'
const ZEBRA = '#F5F4F1'
const MONO = "ui-monospace, Consolas, monospace"
/** 依 METRIC_DEFS 的固定順序配色（分類色，已驗證 CVD 分離度）；顏色跟著指標而非排名 */
const SERIES = ['#2A78D6', '#EB6834', '#1BAF7A', '#EDA100']

const textW = (s: string, fs: number) => s.length * fs * 0.62

export default function MetricsChart({ cfg, svgRef }: Props) {
  const { style } = cfg
  const merged = mergeCounts(cfg.counts, cfg.groups)
  const labels = cfg.groups.map((g) => groupLabel(g, cfg.labels))
  const metrics = computeMetrics(merged, labels)
  const cols = METRIC_DEFS.filter((d) => style.metricsChartColumns.includes(d.key))

  const fmt = (v: number) => `${(v * 100).toFixed(style.metricsChartDecimals)}%`
  const subtitle = `Overall Accuracy ${fmt(metrics.accuracy)}  ·  N = ${metrics.total}`

  const shared = { style, metrics, cols, fmt, subtitle, svgRef }
  return style.metricsChartMode === 'table' ? <Table {...shared} /> : <Bars {...shared} />
}

interface ViewProps {
  style: MatrixConfig['style']
  metrics: ReturnType<typeof computeMetrics>
  cols: typeof METRIC_DEFS
  fmt: (v: number) => string
  subtitle: string
  svgRef: RefObject<SVGSVGElement>
}

function cellValue(
  key: (typeof METRIC_DEFS)[number]['key'],
  row: ClassMetrics | AverageMetrics,
  support: number,
  fmt: (v: number) => string,
) {
  if (key === 'support') return String(support)
  return fmt(row[key])
}

function Table({ style, metrics, cols, fmt, subtitle, svgRef }: ViewProps) {
  const fs = style.metricsChartFontSize
  const rowH = Math.round(fs * 2.1)
  const padX = 28

  const classRows = metrics.perClass.map((c) => ({
    label: c.label,
    cells: cols.map((col) => cellValue(col.key, c, c.support, fmt)),
    avg: false,
  }))
  const avgRows = style.metricsChartShowAverages
    ? [
        { label: 'Macro avg', cells: cols.map((col) => cellValue(col.key, metrics.macro, metrics.total, fmt)), avg: true },
        { label: 'Weighted avg', cells: cols.map((col) => cellValue(col.key, metrics.weighted, metrics.total, fmt)), avg: true },
      ]
    : []
  const rows = [...classRows, ...avgRows]

  const labelW = Math.max(...rows.map((r) => textW(r.label, fs)), textW('Class', fs)) + 28
  const colWs = cols.map((col, i) =>
    Math.max(textW(col.short, fs), ...rows.map((r) => textW(r.cells[i], fs))) + 28,
  )
  // 每欄的右邊界（數值靠右對齊）
  const colX = colWs.reduce<number[]>((acc, w, i) => [...acc, (acc[i - 1] ?? padX + labelW) + w], [])

  const titleH = style.metricsChartTitle ? Math.round(fs * 2.4) : 8
  const subH = Math.round(fs * 1.8)
  const headTop = titleH + subH
  const bodyTop = headTop + rowH
  const W = padX * 2 + labelW + colWs.reduce((a, b) => a + b, 0)
  const H = bodyTop + rowH * rows.length + Math.round(fs * 1.2)

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={style.metricsChartTitle || 'Performance metrics'}
    >
      <rect x={0} y={0} width={W} height={H} fill={SURFACE} />
      {style.metricsChartTitle && (
        <text x={W / 2} y={Math.round(fs * 1.6)} textAnchor="middle" fontFamily={style.fontFamily} fontSize={Math.round(fs * 1.35)} fill={INK}>
          {style.metricsChartTitle}
        </text>
      )}
      <text x={W / 2} y={headTop - Math.round(fs * 0.7)} textAnchor="middle" fontFamily={MONO} fontSize={Math.round(fs * 0.92)} fill={INK_MUTED}>
        {subtitle}
      </text>

      {rows.map((_, i) =>
        i % 2 === 1 ? (
          <rect key={`zebra-${i}`} x={padX} y={bodyTop + i * rowH} width={W - padX * 2} height={rowH} fill={ZEBRA} />
        ) : null,
      )}

      <text x={padX + 4} y={headTop + rowH * 0.68} fontFamily={style.fontFamily} fontSize={fs} fontWeight={600} fill={INK_MUTED}>
        Class
      </text>
      {cols.map((col, i) => (
        <text key={col.key} x={colX[i] - 14} y={headTop + rowH * 0.68} textAnchor="end" fontFamily={style.fontFamily} fontSize={fs} fontWeight={600} fill={INK_MUTED}>
          {col.short}
        </text>
      ))}
      <line x1={padX} y1={bodyTop} x2={W - padX} y2={bodyTop} stroke={RULE} strokeWidth={1.5} />

      {rows.map((r, i) => (
        <g key={`${r.label}-${i}`}>
          {r.avg && i === metrics.perClass.length && (
            <line x1={padX} y1={bodyTop + i * rowH} x2={W - padX} y2={bodyTop + i * rowH} stroke={RULE} strokeWidth={1.5} />
          )}
          <text x={padX + 4} y={bodyTop + i * rowH + rowH * 0.68} fontFamily={style.fontFamily} fontSize={fs} fontWeight={r.avg ? 600 : 400} fill={r.avg ? INK_MUTED : INK}>
            {r.label}
          </text>
          {r.cells.map((cell, j) => (
            <text key={cols[j].key} x={colX[j] - 14} y={bodyTop + i * rowH + rowH * 0.68} textAnchor="end" fontFamily={MONO} fontSize={fs} fill={r.avg ? INK_MUTED : INK}>
              {cell}
            </text>
          ))}
        </g>
      ))}
    </svg>
  )
}

/** 上緣圓角、下緣貼齊基線的長條 */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

function Bars({ style, metrics, cols, fmt, subtitle, svgRef }: ViewProps) {
  const fs = style.metricsChartFontSize
  // 長條用同一條 0–100% 軸，support 是計數不同尺度，故只畫比例類指標
  const series = cols.filter((c) => c.ratio)
  const rows = [
    ...metrics.perClass.map((c) => ({ label: c.label, values: c })),
    ...(style.metricsChartShowAverages
      ? [
          { label: 'Macro avg', values: metrics.macro },
          { label: 'Weighted avg', values: metrics.weighted },
        ]
      : []),
  ]

  const barW = Math.round(fs * 2.6)
  const barGap = 2
  const groupInner = series.length * barW + (series.length - 1) * barGap
  const labelFs = Math.round(fs * 0.85)
  const groupW = Math.max(
    groupInner + Math.round(barW * 0.8),
    Math.max(...rows.map((r) => textW(r.label, labelFs))) + 16,
  )

  const plotH = Math.round(fs * 17)
  const padL = Math.round(textW('100%', labelFs)) + 28
  const padR = 28
  const titleH = style.metricsChartTitle ? Math.round(fs * 2.4) : 8
  const subH = Math.round(fs * 1.8)
  const legendH = Math.round(fs * 2.2)
  // 長條頂端的數值標籤要有空間，否則會壓到 100% 網格線與圖例
  const headroom = Math.round(fs * 1.1)
  const legendTop = titleH + subH
  const plotTop = legendTop + legendH + headroom
  const W = padL + groupW * rows.length + padR
  const H = plotTop + plotH + Math.round(fs * 2.6)
  const baseline = plotTop + plotH

  const legendGap = Math.round(fs * 1.6)
  const legendItemW = series.map((s) => fs + 8 + textW(s.label, labelFs))
  const legendTotal = legendItemW.reduce((a, b) => a + b, 0) + legendGap * (series.length - 1)
  let legendX = (W - legendTotal) / 2

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={style.metricsChartTitle || 'Performance metrics'}
    >
      <rect x={0} y={0} width={W} height={H} fill={SURFACE} />
      {style.metricsChartTitle && (
        <text x={W / 2} y={Math.round(fs * 1.6)} textAnchor="middle" fontFamily={style.fontFamily} fontSize={Math.round(fs * 1.35)} fill={INK}>
          {style.metricsChartTitle}
        </text>
      )}
      <text x={W / 2} y={titleH + subH - Math.round(fs * 0.7)} textAnchor="middle" fontFamily={MONO} fontSize={Math.round(fs * 0.92)} fill={INK_MUTED}>
        {subtitle}
      </text>

      {series.map((s, i) => {
        const x = legendX
        legendX += legendItemW[i] + legendGap
        return (
          <g key={s.key}>
            <rect x={x} y={legendTop + Math.round(fs * 0.5)} width={fs} height={fs} rx={3} fill={SERIES[METRIC_DEFS.findIndex((d) => d.key === s.key)]} />
            <text x={x + fs + 8} y={legendTop + Math.round(fs * 1.5) - 1} fontFamily={style.fontFamily} fontSize={labelFs} fill={INK_MUTED}>
              {s.label}
            </text>
          </g>
        )
      })}

      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={padL} y1={baseline - plotH * t} x2={W - padR} y2={baseline - plotH * t} stroke={t === 0 ? RULE : GRID} strokeWidth={t === 0 ? 1.5 : 1} />
          <text x={padL - 12} y={baseline - plotH * t + labelFs * 0.36} textAnchor="end" fontFamily={MONO} fontSize={labelFs} fill={INK_MUTED}>
            {t * 100}%
          </text>
        </g>
      ))}

      {series.length === 0 && (
        <text x={W / 2} y={plotTop + plotH / 2} textAnchor="middle" fontFamily={style.fontFamily} fontSize={fs} fill={INK_MUTED}>
          請至少勾選一項比例指標（Support 為計數，長條圖不適用）
        </text>
      )}

      {rows.map((r, g) => {
        const gx = padL + g * groupW + (groupW - groupInner) / 2
        return (
          <g key={`${r.label}-${g}`}>
            {series.map((s, i) => {
              const v = r.values[s.key as keyof AverageMetrics]
              const h = plotH * v
              const x = gx + i * (barW + barGap)
              return (
                <g key={s.key}>
                  {h >= 0.5 && (
                    <path d={barPath(x, baseline - h, barW, h)} fill={SERIES[METRIC_DEFS.findIndex((d) => d.key === s.key)]} />
                  )}
                  <text x={x + barW / 2} y={baseline - h - 7} textAnchor="middle" fontFamily={MONO} fontSize={Math.round(fs * 0.72)} fill={INK}>
                    {fmt(v).replace('%', '')}
                  </text>
                </g>
              )
            })}
            <text x={padL + g * groupW + groupW / 2} y={baseline + labelFs * 1.7} textAnchor="middle" fontFamily={style.fontFamily} fontSize={labelFs} fill={INK}>
              {r.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
