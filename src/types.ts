export type CmapName = 'Blues' | 'Greens' | 'Reds' | 'Purples' | 'Greys' | 'Custom'

export type ValueMode = 'both' | 'count' | 'pct'
export type Normalize = 'row' | 'col' | 'all'
export type MetricsPosition = 'inside' | 'outside'

export interface StyleConfig {
  title: string
  cmap: CmapName
  customColor: string
  fontFamily: string
  titleFontSize: number
  valueFontSize: number
  labelFontSize: number
  valueMode: ValueMode
  normalize: Normalize
  showColorbar: boolean
  showMetrics: boolean
  /** metrics 摘要框位置：inside = 矩陣右下角圖內、outside = 圖表下方（不遮擋格子） */
  metricsPosition: MetricsPosition
  metricsFontSize: number
  xAxisTitle: string
  yAxisTitle: string
}

export interface MatrixConfig {
  /** 設定檔格式版本，供之後相容性判斷 */
  version: 1
  /** 類別名稱，順序為原始輸入順序 */
  labels: string[]
  /** counts[i][j] = true label i、predicted label j 的數量（原始順序） */
  counts: number[][]
  /** 顯示順序：order[k] = 第 k 個顯示位置對應的原始類別索引 */
  order: number[]
  /** 是否交換 True / Predicted 軸 */
  transpose: boolean
  style: StyleConfig
}

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: '無襯線 Sans', value: "system-ui, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif" },
  { label: '襯線 Serif', value: "Georgia, 'Times New Roman', serif" },
  { label: '等寬 Mono', value: "ui-monospace, 'Cascadia Code', Consolas, 'Courier New', monospace" },
]

export function defaultConfig(): MatrixConfig {
  return {
    version: 1,
    labels: ['class_1', 'class_2'],
    counts: [
      [85, 15],
      [10, 90],
    ],
    order: [0, 1],
    transpose: false,
    style: {
      title: 'Confusion Matrix',
      cmap: 'Blues',
      customColor: '#0E7490',
      fontFamily: FONT_OPTIONS[2].value,
      titleFontSize: 24,
      valueFontSize: 26,
      labelFontSize: 16,
      valueMode: 'both',
      normalize: 'row',
      showColorbar: true,
      showMetrics: true,
      metricsPosition: 'inside',
      metricsFontSize: 15,
      xAxisTitle: 'Predicted Label',
      yAxisTitle: 'True Label',
    },
  }
}

/**
 * 補齊舊設定檔缺少的欄位（例如 version 1 早期沒有 metricsPosition），
 * 讓先前匯出的 JSON 都能繼續載入。
 */
export function normalizeConfig(data: MatrixConfig): MatrixConfig {
  const base = defaultConfig()
  return { ...base, ...data, style: { ...base.style, ...data.style } }
}

/** 調整類別數量，保留既有的名稱與數值 */
export function resizeMatrix(cfg: MatrixConfig, n: number): MatrixConfig {
  const labels = Array.from({ length: n }, (_, i) => cfg.labels[i] ?? `class_${i + 1}`)
  const counts = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => cfg.counts[i]?.[j] ?? 0),
  )
  return { ...cfg, labels, counts, order: Array.from({ length: n }, (_, i) => i) }
}
