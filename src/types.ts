export type CmapName = 'Blues' | 'Greens' | 'Reds' | 'Purples' | 'Greys' | 'Custom'

export type ValueMode = 'both' | 'count' | 'pct'
export type Normalize = 'row' | 'col' | 'all'

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
    labels: ['non_nsvt', 'nsvt'],
    counts: [
      [6350, 301],
      [393, 1210],
    ],
    order: [0, 1],
    transpose: false,
    style: {
      title: 'Test Confusion Matrix (th=0.98)',
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
      xAxisTitle: 'Predicted Label',
      yAxisTitle: 'True Label',
    },
  }
}

/** 調整類別數量，保留既有的名稱與數值 */
export function resizeMatrix(cfg: MatrixConfig, n: number): MatrixConfig {
  const labels = Array.from({ length: n }, (_, i) => cfg.labels[i] ?? `class_${i + 1}`)
  const counts = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => cfg.counts[i]?.[j] ?? 0),
  )
  return { ...cfg, labels, counts, order: Array.from({ length: n }, (_, i) => i) }
}
