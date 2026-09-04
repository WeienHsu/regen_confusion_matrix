export type CmapName = 'Blues' | 'Greens' | 'Reds' | 'Purples' | 'Greys' | 'Custom'

export type ValueMode = 'both' | 'count' | 'pct'
export type Normalize = 'row' | 'col' | 'all'
export type MetricsPosition =
  | 'inside-tl'
  | 'inside-tr'
  | 'inside-bl'
  | 'inside-br'
  | 'below'
  | 'right'
export type MetricsChartMode = 'table' | 'bar'
export type MetricKey = 'sensitivity' | 'specificity' | 'precision' | 'f1' | 'support'

export const METRIC_DEFS: { key: MetricKey; label: string; short: string; ratio: boolean }[] = [
  { key: 'sensitivity', label: 'Sensitivity (Recall)', short: 'Sens', ratio: true },
  { key: 'specificity', label: 'Specificity', short: 'Spec', ratio: true },
  { key: 'precision', label: 'Precision', short: 'Prec', ratio: true },
  { key: 'f1', label: 'F1 Score', short: 'F1', ratio: true },
  { key: 'support', label: 'Support', short: 'N', ratio: false },
]

/** 一個顯示用的類別群組；members 為原始類別索引，長度 > 1 即為合併類別 */
export interface ClassGroup {
  /** 自訂名稱；null 表示由成員名稱以 + 自動串接 */
  name: string | null
  members: number[]
}

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
  /** metrics 摘要框位置：圖內四角，或圖外（下方 / 右側，畫布會實際加大不遮擋格子） */
  metricsPosition: MetricsPosition
  metricsFontSize: number
  xAxisTitle: string
  yAxisTitle: string
  /** 以下為第二張「指標圖」的設定 */
  metricsChartTitle: string
  metricsChartMode: MetricsChartMode
  metricsChartColumns: MetricKey[]
  metricsChartDecimals: number
  metricsChartShowAverages: boolean
  metricsChartFontSize: number
}

export interface MatrixConfig {
  /** 設定檔格式版本；2 起以 groups 取代 order */
  version: 2
  /** 類別名稱，順序為原始輸入順序 */
  labels: string[]
  /** counts[i][j] = true label i、predicted label j 的數量（原始順序） */
  counts: number[][]
  /** 顯示用的類別群組，陣列順序即顯示順序 */
  groups: ClassGroup[]
  /** 是否交換 True / Predicted 軸 */
  transpose: boolean
  style: StyleConfig
}

export const CONFIG_VERSION = 2

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: '無襯線 Sans', value: "system-ui, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif" },
  { label: '襯線 Serif', value: "Georgia, 'Times New Roman', serif" },
  { label: '等寬 Mono', value: "ui-monospace, 'Cascadia Code', Consolas, 'Courier New', monospace" },
]

/** 每個類別各自成一組（未合併） */
export function singleGroups(n: number): ClassGroup[] {
  return Array.from({ length: n }, (_, i) => ({ name: null, members: [i] }))
}

export function defaultConfig(): MatrixConfig {
  return {
    version: CONFIG_VERSION,
    labels: ['class_1', 'class_2'],
    counts: [
      [85, 15],
      [10, 90],
    ],
    groups: singleGroups(2),
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
      metricsPosition: 'below',
      metricsFontSize: 15,
      xAxisTitle: 'Predicted Label',
      yAxisTitle: 'True Label',
      metricsChartTitle: 'Performance Metrics',
      metricsChartMode: 'table',
      metricsChartColumns: ['sensitivity', 'specificity', 'precision', 'f1', 'support'],
      metricsChartDecimals: 1,
      metricsChartShowAverages: true,
      metricsChartFontSize: 18,
    },
  }
}

/** 舊版設定檔的結構（v1 用 order、metricsPosition 只有 inside / outside） */
export interface StoredConfig {
  version?: number
  labels?: string[]
  counts?: number[][]
  order?: number[]
  groups?: ClassGroup[]
  transpose?: boolean
  style?: Record<string, unknown>
}

/** 判斷是否為本工具匯出的設定檔（含舊版 v1） */
export function isStoredConfig(data: unknown): data is StoredConfig {
  const d = data as StoredConfig | null
  return (
    !!d &&
    (d.version === 1 || d.version === CONFIG_VERSION) &&
    Array.isArray(d.counts) &&
    !!d.style
  )
}

const LEGACY_METRICS_POSITION: Record<string, MetricsPosition> = {
  inside: 'inside-br',
  outside: 'below',
}

/** 把任一版本的設定檔補齊成目前的結構，讓先前匯出的 JSON 都能繼續載入 */
export function normalizeConfig(data: StoredConfig): MatrixConfig {
  const base = defaultConfig()
  const style = { ...base.style, ...data.style } as StyleConfig

  const migrated = LEGACY_METRICS_POSITION[String(style.metricsPosition)]
  if (migrated) style.metricsPosition = migrated
  if (!Array.isArray(style.metricsChartColumns)) {
    style.metricsChartColumns = base.style.metricsChartColumns
  }

  const counts = data.counts ?? base.counts
  const labels = Array.from(
    { length: counts.length },
    (_, i) => data.labels?.[i] ?? `class_${i + 1}`,
  )
  const groups = data.groups ?? data.order?.map((i) => ({ name: null, members: [i] }))

  return {
    version: CONFIG_VERSION,
    labels,
    counts,
    groups: validGroups(groups, counts.length) ?? singleGroups(counts.length),
    transpose: data.transpose ?? base.transpose,
    style,
  }
}

/** 群組必須恰好用到每個原始類別一次，否則視為損毀改用預設 */
function validGroups(groups: ClassGroup[] | undefined, n: number): ClassGroup[] | null {
  if (!Array.isArray(groups)) return null
  const used = groups.flatMap((g) => g.members ?? [])
  const ok = used.length === n && new Set(used).size === n && used.every((i) => i >= 0 && i < n)
  return ok ? groups : null
}

/** 調整類別數量，保留既有的名稱與數值；合併狀態會重設 */
export function resizeMatrix(cfg: MatrixConfig, n: number): MatrixConfig {
  const labels = Array.from({ length: n }, (_, i) => cfg.labels[i] ?? `class_${i + 1}`)
  const counts = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => cfg.counts[i]?.[j] ?? 0),
  )
  return { ...cfg, labels, counts, groups: singleGroups(n) }
}
