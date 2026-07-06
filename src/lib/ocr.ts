import { createWorker } from 'tesseract.js'
import { buildVariants } from './preprocess'

export interface OcrResult {
  /** 成功聚類成 k×k 網格時的數值（k 為自動偵測的類別數）；失敗為 null */
  grid: number[][] | null
  /** true 表示有格子的數字沒讀到、以 0 補上，需要使用者逐格核對 */
  needsReview: boolean
  /** 所有辨識到的整數 token（依閱讀順序），供無法聚類時預填參考 */
  numbers: number[]
  /** 可靠辨識出的類別名稱（軸標籤在 x/y 軸各出現一次、數量剛好等於類別數時才回傳） */
  labels: string[] | null
}

interface Token {
  value: number
  cx: number
  cy: number
  h: number
}

/** 括號百分比 token（如 "(95.2)"、"(0.0)"、"(<0.1)"、"(4.5%)"），作為格子定位錨點 */
interface Anchor {
  cx: number
  cy: number
  h: number
  /** 百分比數值；0 代表該格確定是 0 */
  pct: number
}

/**
 * 對 confusion matrix 圖片做 OCR，抽出格子裡的整數並自動偵測類別數。
 *
 * 彩色數字（紅/橘字）灰階對比低，因此依序嘗試多個影像變體
 * （原圖 → 暖色文字強化 → 灰階二值化），任一變體成功聚類就採用。
 * 結果一律由使用者確認修正，OCR 只負責預填。
 */
export async function recognizeMatrix(
  image: File,
  nHint: number,
  onProgress?: (p: number) => void,
): Promise<OcrResult> {
  // worker / core / 語言資料一律由本站提供（見 scripts/copy-tesseract-assets.mjs），
  // 不打外部 CDN，離線 clone 下來也能用
  const base = import.meta.env.BASE_URL
  let variantIndex = 0
  let variantCount = 1
  const worker = await createWorker('eng', 1, {
    workerPath: `${base}tesseract/core/worker.min.js`,
    corePath: `${base}tesseract/core`,
    langPath: `${base}tesseract/lang`,
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress((variantIndex + m.progress) / variantCount)
      }
    },
  })
  try {
    const variants = await buildVariants(image)
    variantCount = variants.length
    let bestIncomplete: (OcrResult & { reviewCount: number }) | null = null
    let weakGrid: OcrResult | null = null
    let bestNumbers: number[] = []
    let bestLabels: string[] | null = null
    for (variantIndex = 0; variantIndex < variants.length; variantIndex++) {
      const { data } = await worker.recognize(variants[variantIndex])
      const { tokens, anchors, labelCandidates } = extractTokens(data.words ?? [])
      const numbers = [...tokens].sort((a, b) => a.cy - b.cy || a.cx - b.cx).map((t) => t.value)
      if (numbers.length > bestNumbers.length) {
        bestNumbers = numbers
        bestLabels = matchLabels(labelCandidates, nHint)
      }

      // 策略 1：百分比錨點——每一格（含 0 的格子）都有 "(xx.x)"，
      // 能可靠決定網格大小與位置，全零的列/欄也不會被漏掉
      const anchored = anchorGrid(anchors, tokens)
      if (anchored) {
        const result: OcrResult & { reviewCount: number } = {
          grid: anchored.grid,
          needsReview: anchored.reviewCount > 0,
          reviewCount: anchored.reviewCount,
          numbers,
          labels: matchLabels(labelCandidates, anchored.grid.length),
        }
        if (anchored.reviewCount === 0) return result
        if (!bestIncomplete || result.reviewCount < bestIncomplete.reviewCount) {
          bestIncomplete = result // 先留著，看看其他變體能否完整讀到
        }
        continue
      }

      // 圖上明顯有百分比標註（錨點 >= 4）卻湊不出完整錨點網格，
      // 代表這個變體漏字嚴重（常見：對角線彩色數字），整數聚類會拼出
      // 看似合法但錯誤的網格 —— 不信任它，換下一個變體再試
      const grid = clusterToGrid(tokens, nHint)
      if (grid) {
        const result: OcrResult = {
          grid,
          needsReview: false,
          numbers,
          labels: matchLabels(labelCandidates, grid.length),
        }
        if (anchors.length < 4) return result
        if (!weakGrid) weakGrid = { ...result, needsReview: true }
      }
    }
    if (bestIncomplete) return bestIncomplete
    if (weakGrid) return weakGrid
    return { grid: null, needsReview: true, numbers: bestNumbers, labels: bestLabels }
  } finally {
    await worker.terminate()
  }
}

/**
 * 用括號百分比錨點重建 k×k 網格：錨點必須自成 k 列、每列 k 個。
 * 每個錨點往正上方找最近的整數 token 當作該格數值；找不到時補 0——
 * 若該格百分比為 0 則可確定，否則列入 reviewCount 請使用者核對。
 */
function anchorGrid(
  anchors: Anchor[],
  tokens: Token[],
): { grid: number[][]; reviewCount: number } | null {
  if (anchors.length < 4) return null
  const rows = clusterRows(anchors)
  const k = rows.length
  if (k < 2 || k > 10) return null
  if (!rows.every((r) => r.length === k)) return null
  const sortedRows = rows.map((r) => [...r].sort((a, b) => a.cx - b.cx))

  const colCenters = Array.from({ length: k }, (_, j) =>
    sortedRows.reduce((s, r) => s + r[j].cx, 0) / k,
  )
  const rowCenters = sortedRows.map((r) => r.reduce((s, a) => s + a.cy, 0) / k)
  const pitchX = k > 1 ? median(adjacentDiffs(colCenters)) : Number.MAX_SAFE_INTEGER
  const pitchY = k > 1 ? median(adjacentDiffs(rowCenters)) : Number.MAX_SAFE_INTEGER

  let reviewCount = 0
  const grid = sortedRows.map((row) =>
    row.map((a) => {
      // 數值就在百分比正上方（同一格內）
      const candidates = tokens.filter(
        (t) =>
          Math.abs(t.cx - a.cx) < pitchX * 0.45 &&
          a.cy - t.cy > 0 &&
          a.cy - t.cy < pitchY * 0.9,
      )
      if (candidates.length > 0) {
        candidates.sort((x, y) => (a.cy - x.cy) - (a.cy - y.cy))
        return candidates[0].value
      }
      if (a.pct > 0) reviewCount += 1
      return 0
    }),
  )
  return { grid, reviewCount }
}

function adjacentDiffs(xs: number[]): number[] {
  return xs.slice(1).map((v, i) => v - xs[i])
}

const RESERVED_WORDS = new Set([
  'true', 'predicted', 'label', 'confusion', 'matrix', 'test', 'train', 'validation',
  'accuracy', 'precision', 'recall', 'percentage', 'prec', 'rec',
])

interface Word {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

const PCT_RE = /^\(<?\s*(\d+(?:[.,]\d+)?)\s*%?\)$/

function extractTokens(words: Word[]): { tokens: Token[]; anchors: Anchor[]; labelCandidates: string[] } {
  const tokens: Token[] = []
  const anchors: Anchor[] = []
  const labelCandidates: string[] = []
  for (const w of words) {
    const text = w.text.trim()
    const { x0, y0, x1, y1 } = w.bbox
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    const h = y1 - y0

    const pctMatch = PCT_RE.exec(text)
    if (pctMatch) {
      anchors.push({ cx, cy, h, pct: parseFloat(pctMatch[1].replace(',', '.')) })
      continue
    }

    if (/^\d{1,3}(,\d{3})+$|^\d+$/.test(text)) {
      tokens.push({ value: Number(text.replace(/,/g, '')), cx, cy, h })
    } else if (/^[A-Za-z_][A-Za-z0-9_-]{2,}$/.test(text) && !RESERVED_WORDS.has(text.toLowerCase())) {
      labelCandidates.push(text)
    } else if (/^[A-HJ-NP-Z]$/.test(text)) {
      // 單字母類別名稱（如 N/S/V/Q/X），排除 I 與 O 避免和 1、0 混淆
      labelCandidates.push(text)
    }
  }
  return { tokens, anchors, labelCandidates }
}

/**
 * 類別名稱在圖上會出現兩次（y 軸與 x 軸各一次）。先合併近似重複的候選字
 * （OCR 常把同一個標籤截尾，如 non_nsvt / non_nsv），再取出現至少兩次者，
 * 依首次出現順序排列；剛好湊滿 n 個才採用，寧缺勿錯。
 */
function matchLabels(candidates: string[], n: number): string[] | null {
  // groups[i] = { rep: 代表字（取較長者）, count }
  const groups: { rep: string; count: number }[] = []
  for (const c of candidates) {
    const hit = groups.find(
      (g) =>
        (g.rep.includes(c) || c.includes(g.rep)) && Math.abs(g.rep.length - c.length) <= 2,
    )
    if (hit) {
      hit.count += 1
      if (c.length > hit.rep.length) hit.rep = c
    } else {
      groups.push({ rep: c, count: 1 })
    }
  }
  const repeated = groups.filter((g) => g.count >= 2).map((g) => g.rep)
  return repeated.length === n ? repeated : null
}

/**
 * 依 y 座標分列、x 座標排欄，並自動偵測類別數：
 * 「剛好有 k 列、每列剛好 k 個整數」即視為 k×k 網格。
 * 若多個 k 成立，優先採用與目前設定相同的 nHint，否則取最大的 k。
 */
/** 依 y 座標把項目分列（間距超過 1.5 倍中位字高就換列） */
function clusterRows<T extends { cy: number; h: number }>(items: T[]): T[][] {
  const sorted = [...items].sort((a, b) => a.cy - b.cy)
  const medianH = median(sorted.map((t) => t.h))
  const rowGap = medianH * 1.5

  const rows: T[][] = []
  for (const t of sorted) {
    const last = rows[rows.length - 1]
    if (last && Math.abs(t.cy - last[last.length - 1].cy) <= rowGap) {
      last.push(t)
    } else {
      rows.push([t])
    }
  }
  return rows
}

function clusterToGrid(tokens: Token[], nHint: number): number[][] | null {
  if (tokens.length < 4) return null

  const rows = clusterRows(tokens)

  const byLength = new Map<number, Token[][]>()
  for (const row of rows) {
    if (row.length < 2) continue
    const bucket = byLength.get(row.length) ?? []
    bucket.push(row)
    byLength.set(row.length, bucket)
  }

  const candidates = [...byLength.entries()]
    .filter(([k, rs]) => rs.length === k && k >= 2 && k <= 10)
    .map(([k]) => k)
    .sort((a, b) => (a === nHint ? -1 : b === nHint ? 1 : b - a))

  for (const k of candidates) {
    const rows = byLength.get(k)!.map((r) => [...r].sort((a, b) => a.cx - b.cx))
    if (columnsAligned(rows)) {
      return rows.map((r) => r.map((t) => t.value))
    }
  }
  return null
}

/**
 * 真正的網格各列的欄 x 座標必然上下對齊；雜訊拼出的假網格
 * （如軸標籤、colorbar 誤讀的散落數字）會在這裡被拒絕。
 */
function columnsAligned(rows: Token[][]): boolean {
  const k = rows.length
  const colCenters = Array.from({ length: k }, (_, j) => rows.reduce((s, r) => s + r[j].cx, 0) / k)
  const pitch = k > 1 ? median(adjacentDiffs(colCenters)) : 0
  if (pitch <= 0) return false
  const tolerance = pitch * 0.35
  return rows.every((r) => r.every((t, j) => Math.abs(t.cx - colCenters[j]) <= tolerance))
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] ?? 0
}
