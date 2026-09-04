import type { MatrixConfig } from '../types'
import { defaultConfig, isStoredConfig, normalizeConfig, singleGroups } from '../types'

export interface ParsedMatrix {
  labels: string[] | null
  counts: number[][]
}

/**
 * 解析貼上的 CSV / JSON 文字。
 *
 * 支援格式：
 * - JSON 2D 陣列：[[6350,301],[393,1210]]
 * - JSON 物件：{"labels":["non_nsvt","nsvt"],"counts":[[6350,301],[393,1210]]}
 * - 完整設定檔 JSON（含 version / style）
 * - CSV（逗號、tab 或空白分隔），可含表頭列與表頭欄
 */
export function parsePasted(text: string): ParsedMatrix | MatrixConfig {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('內容是空的')

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const data = JSON.parse(trimmed)
    if (Array.isArray(data)) {
      return { labels: null, counts: asNumberGrid(data) }
    }
    if (data && typeof data === 'object') {
      if (isStoredConfig(data)) {
        return normalizeConfig(data)
      }
      if (Array.isArray(data.counts)) {
        const counts = asNumberGrid(data.counts)
        const labels = Array.isArray(data.labels) ? data.labels.map(String) : null
        return { labels, counts }
      }
    }
    throw new Error('無法辨識的 JSON 結構，需要 2D 陣列或 {labels, counts}')
  }

  return parseCsv(trimmed)
}

function asNumberGrid(data: unknown[]): number[][] {
  const grid = data.map((row) => {
    if (!Array.isArray(row)) throw new Error('JSON 陣列必須是 2D（陣列的陣列）')
    return row.map((v) => {
      const n = Number(v)
      if (!Number.isFinite(n) || n < 0) throw new Error(`無效的數值：${String(v)}`)
      return n
    })
  })
  validateSquare(grid)
  return grid
}

function parseCsv(text: string): ParsedMatrix {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  const rows = lines.map((l) => l.split(/[,\t]|\s{2,}| /).map((c) => c.trim()).filter((c) => c !== ''))

  const firstRowIsHeader = rows[0].some((c) => Number.isNaN(Number(c)))
  let labels: string[] | null = null
  let body = rows

  if (firstRowIsHeader) {
    labels = rows[0]
    body = rows.slice(1)
    // 表頭列可能比資料列多一格（左上角空格），或首欄是列標籤
    const firstColIsHeader = body.every((r) => Number.isNaN(Number(r[0])))
    if (firstColIsHeader) {
      labels = body.map((r) => r[0])
      body = body.map((r) => r.slice(1))
    } else if (labels.length === body[0].length + 1) {
      labels = labels.slice(1)
    }
  }

  const counts = body.map((r) =>
    r.map((c) => {
      const n = Number(c)
      if (!Number.isFinite(n) || n < 0) throw new Error(`無效的數值：${c}`)
      return n
    }),
  )
  validateSquare(counts)
  if (labels && labels.length !== counts.length) labels = null
  return { labels, counts }
}

function validateSquare(grid: number[][]) {
  const n = grid.length
  if (n < 2 || n > 10) throw new Error(`矩陣大小需為 2–10 類，目前為 ${n}`)
  for (const row of grid) {
    if (row.length !== n) throw new Error(`矩陣必須是方陣（${n}×${n}），有一列長度為 ${row.length}`)
  }
}

/** 把解析結果套進設定，重設排序 */
export function applyParsed(parsed: ParsedMatrix, base: MatrixConfig): MatrixConfig {
  const n = parsed.counts.length
  const fallback = defaultConfig()
  return {
    ...base,
    labels: parsed.labels ?? Array.from({ length: n }, (_, i) => base.labels[i] ?? fallback.labels[i] ?? `class_${i + 1}`),
    counts: parsed.counts,
    groups: singleGroups(n),
  }
}
