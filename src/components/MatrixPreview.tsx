import type { RefObject } from 'react'
import type { MatrixConfig } from '../types'
import { shade, textColorFor } from '../lib/colormap'
import { computeMetrics, rowSums, colSums } from '../lib/metrics'

interface Props {
  cfg: MatrixConfig
  svgRef: RefObject<SVGSVGElement>
}

const CELL = 240

export default function MatrixPreview({ cfg, svgRef }: Props) {
  const { style } = cfg
  const n = cfg.order.length

  // 依顯示順序重排（列 = true、欄 = predicted）
  let m = cfg.order.map((ti) => cfg.order.map((pj) => cfg.counts[ti][pj]))
  const displayLabels = cfg.order.map((i) => cfg.labels[i])
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

  if (cfg.transpose) {
    m = m[0].map((_, j) => m.map((r) => r[j]))
    pct = pct[0].map((_, j) => pct.map((r) => r[j]))
    ;[xTitle, yTitle] = [yTitle, xTitle]
  }

  const pad = { l: 110, t: 70, r: style.showColorbar ? 110 : 30, b: 90 }
  const W = pad.l + CELL * n + pad.r
  const H = pad.t + CELL * n + pad.b
  const fs = style.valueFontSize
  const lfs = style.labelFontSize

  // metrics 是「真實方向」的統計，transpose 只影響顯示，不影響 P/R 計算
  const metricsSource = cfg.order.map((ti) => cfg.order.map((pj) => cfg.counts[ti][pj]))
  const metrics = computeMetrics(metricsSource, displayLabels)
  const metricsLines = [
    `Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%`,
    ...metrics.perClass.map(
      (c) => `${c.label}  P: ${(c.precision * 100).toFixed(1)}%  R: ${(c.recall * 100).toFixed(1)}%`,
    ),
  ]
  const mBoxW = Math.max(280, 12 + Math.max(...metricsLines.map((l) => l.length)) * 9)
  const mBoxH = 22 * metricsLines.length + 16

  const cbX = pad.l + n * CELL + 30
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
          <text x={pad.l + i * CELL + CELL / 2} y={pad.t + n * CELL + 28} textAnchor="middle" fontFamily={style.fontFamily} fontSize={lfs} fill="#111111">
            {label}
          </text>
        </g>
      ))}

      <text x={pad.l + (n * CELL) / 2} y={H - 28} textAnchor="middle" fontFamily={style.fontFamily} fontSize={lfs + 3} fill="#111111">
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
            x={pad.l + n * CELL - mBoxW - 14}
            y={pad.t + n * CELL - mBoxH - 14}
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
              x={pad.l + n * CELL - 26}
              y={pad.t + n * CELL - mBoxH - 14 + 24 + k * 22}
              textAnchor="end"
              fontFamily="ui-monospace, Consolas, monospace"
              fontSize={15}
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
