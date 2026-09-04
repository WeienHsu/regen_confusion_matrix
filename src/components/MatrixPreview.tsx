import type { RefObject } from 'react'
import type { MatrixConfig } from '../types'
import { shade, textColorFor } from '../lib/colormap'
import { mergeCounts, groupLabel } from '../lib/merge'
import { computeMetrics, rowSums, colSums } from '../lib/metrics'

interface Props {
  cfg: MatrixConfig
  svgRef: RefObject<SVGSVGElement>
}

const CELL = 240
/** colorbar 佔用的右側寬度（色條 + 刻度文字） */
const CB_W = 110

export default function MatrixPreview({ cfg, svgRef }: Props) {
  const { style } = cfg
  const n = cfg.groups.length

  // 依群組合併並重排（列 = true、欄 = predicted）
  let m = mergeCounts(cfg.counts, cfg.groups)
  const displayLabels = cfg.groups.map((g) => groupLabel(g, cfg.labels))
  let xTitle = style.xAxisTitle
  let yTitle = style.yAxisTitle

  // 百分比一律以「真實語意」計算（row = 依 True label、col = 依 Predicted label），
  // 之後才跟矩陣一起轉置，所以 transpose 不會改變百分比的意義
  const total = m.flat().reduce((a, b) => a + b, 0) || 1
  const rs = rowSums(m).map((v) => v || 1)
  const cs = colSums(m).map((v) => v || 1)
  let pct = m.map((row, i) =>
    row.map((v, j) =>
      style.normalize === 'row' ? v / rs[i] : style.normalize === 'col' ? v / cs[j] : v / total,
    ),
  )

  // metrics 是「真實方向」的統計，transpose 只影響顯示，不影響 P/R 計算
  const metrics = computeMetrics(m, displayLabels)

  if (cfg.transpose) {
    m = m[0].map((_, j) => m.map((r) => r[j]))
    pct = pct[0].map((_, j) => pct.map((r) => r[j]))
    ;[xTitle, yTitle] = [yTitle, xTitle]
  }

  const fs = style.valueFontSize
  const lfs = style.labelFontSize

  const metricsLines = [
    `Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%`,
    ...metrics.perClass.map(
      (c) =>
        `${c.label}  P: ${(c.precision * 100).toFixed(1)}%  R: ${(c.sensitivity * 100).toFixed(1)}%`,
    ),
  ]
  const mfs = style.metricsFontSize
  const mLineH = Math.round(mfs * 1.5)
  const mBoxW = Math.max(mfs * 19, 24 + Math.max(...metricsLines.map((l) => l.length)) * mfs * 0.62)
  const mBoxH = mLineH * metricsLines.length + 16
  const pos = style.metricsPosition
  const showBelow = style.showMetrics && pos === 'below'
  const showRight = style.showMetrics && pos === 'right'

  // 左側要容得下最長的類別名稱（合併後的名稱可能很長），否則會被畫布邊界裁掉
  const tickW = Math.max(...displayLabels.map((l) => l.length * lfs * 0.62))
  const pad = {
    l: Math.max(110, Math.round(tickW) + 58),
    t: 70,
    r: (style.showColorbar ? CB_W : 30) + (showRight ? mBoxW + 24 : 0),
    b: 90,
  }
  const W = pad.l + CELL * n + pad.r
  // 圖外模式：在 x 軸標題下方多留一塊放 metrics 框，完全不遮擋格子
  const H = pad.t + CELL * n + pad.b + (showBelow ? mBoxH + 14 : 0)

  const gridR = pad.l + n * CELL
  const gridB = pad.t + n * CELL
  const inset = 14
  const boxXY: Record<typeof pos, [number, number]> = {
    'inside-tl': [pad.l + inset, pad.t + inset],
    'inside-tr': [gridR - mBoxW - inset, pad.t + inset],
    'inside-bl': [pad.l + inset, gridB - mBoxH - inset],
    'inside-br': [gridR - mBoxW - inset, gridB - mBoxH - inset],
    below: [gridR - mBoxW, gridB + pad.b - inset],
    right: [gridR + (style.showColorbar ? CB_W : 20), pad.t],
  }
  const [mBoxX, mBoxY] = boxXY[pos]

  const cbX = gridR + 30
  const cbH = n * CELL

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={style.title || 'Confusion matrix'}
    >
      <rect x={0} y={0} width={W} height={H} fill="#FFFFFF" />
      <text x={W / 2} y={42} textAnchor="middle" fontFamily={style.fontFamily} fontSize={style.titleFontSize} fill="#111111">
        {style.title}
      </text>

      {m.map((row, i) =>
        row.map((v, j) => {
          const t = pct[i][j]
          const x = pad.l + j * CELL
          const y = pad.t + i * CELL
          const lines: string[] = []
          if (style.valueMode !== 'pct') lines.push(String(v))
          if (style.valueMode !== 'count') lines.push(`(${(t * 100).toFixed(1)}%)`)
          return (
            <g key={`${i}-${j}`}>
              <rect x={x} y={y} width={CELL} height={CELL} fill={shade(style.cmap, style.customColor, t)} stroke="#FFFFFF" strokeWidth={2} />
              {lines.map((txt, k) => (
                <text
                  key={k}
                  x={x + CELL / 2}
                  y={y + CELL / 2 + (k - (lines.length - 1) / 2) * (fs * 1.25) + fs * 0.35}
                  textAnchor="middle"
                  fontFamily={style.fontFamily}
                  fontSize={fs}
                  fill={textColorFor(t)}
                >
                  {txt}
                </text>
              ))}
            </g>
          )
        }),
      )}

      {displayLabels.map((label, i) => (
        <g key={`ticks-${i}`}>
          <text x={pad.l - 12} y={pad.t + i * CELL + CELL / 2 + lfs * 0.35} textAnchor="end" fontFamily={style.fontFamily} fontSize={lfs} fill="#111111">
            {label}
          </text>
          <text x={pad.l + i * CELL + CELL / 2} y={gridB + 28} textAnchor="middle" fontFamily={style.fontFamily} fontSize={lfs} fill="#111111">
            {label}
          </text>
        </g>
      ))}

      <text x={pad.l + (n * CELL) / 2} y={gridB + pad.b - 28} textAnchor="middle" fontFamily={style.fontFamily} fontSize={lfs + 3} fill="#111111">
        {xTitle}
      </text>
      <text textAnchor="middle" fontFamily={style.fontFamily} fontSize={lfs + 3} fill="#111111" transform={`translate(30 ${pad.t + (n * CELL) / 2}) rotate(-90)`}>
        {yTitle}
      </text>

      {style.showColorbar && (
        <g>
          <defs>
            <linearGradient id="cm-colorbar" x1="0" y1="1" x2="0" y2="0">
              {Array.from({ length: 11 }, (_, s) => (
                <stop key={s} offset={`${s * 10}%`} stopColor={shade(style.cmap, style.customColor, s / 10)} />
              ))}
            </linearGradient>
          </defs>
          <rect x={cbX} y={pad.t} width={26} height={cbH} fill="url(#cm-colorbar)" stroke="#999999" strokeWidth={0.5} />
          {Array.from({ length: 5 }, (_, s) => {
            const v = s / 4
            return (
              <text key={s} x={cbX + 34} y={pad.t + cbH * (1 - v) + 5} fontFamily={style.fontFamily} fontSize={14} fill="#111111">
                {(v * 100).toFixed(0)}%
              </text>
            )
          })}
        </g>
      )}

      {style.showMetrics && (
        <g>
          <rect
            x={mBoxX}
            y={mBoxY}
            width={mBoxW}
            height={mBoxH}
            rx={6}
            fill="#F0F0F0"
            fillOpacity={0.92}
            stroke="#555555"
          />
          {metricsLines.map((line, k) => (
            <text
              key={k}
              x={mBoxX + 12}
              y={mBoxY + 8 + (k + 1) * mLineH - Math.round(mfs * 0.35)}
              fontFamily="ui-monospace, Consolas, monospace"
              fontSize={mfs}
              fontWeight={k === 0 ? 700 : 400}
              fill="#111111"
            >
              {line}
            </text>
          ))}
        </g>
      )}
    </svg>
  )
}
