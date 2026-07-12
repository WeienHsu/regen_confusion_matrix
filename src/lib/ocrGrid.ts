/**
 * OCR 結果的網格重建與類別名稱比對（純邏輯、不碰瀏覽器 API，可獨立測試）。
 * 影像處理與 Tesseract worker 的部分在 ocr.ts。
 */

export interface Token {
  value: number
  cx: number
  cy: number
  h: number
}

/** 括號百分比 token（如 "(95.2)"、"(0.0)"、"(<0.1)"、"(4.5%)"），作為格子定位錨點 */
export interface Anchor {
  cx: number
  cy: number
  h: number
  /** 百分比數值；0 代表該格確定是 0 */
  pct: number
}

/** 類別名稱候選字，保留位置供之後與網格幾何比對 */
export interface LabelCandidate {
  text: string
  cx: number
  cy: number
}

/** 網格幾何：由錨點或整數聚類推得的列/欄中心與間距（影像像素座標） */
export interface GridGeometry {
  colCenters: number[]
  rowCenters: number[]
  pitchX: number
  pitchY: number
}

export interface Word {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

export interface OcrResult {
  /** 成功聚類成 k×k 網格時的數值（k 為自動偵測的類別數）；失敗為 null */
  grid: number[][] | null
  /** true 表示有格子的數字沒讀到、以 0 補上，需要使用者逐格核對 */
  needsReview: boolean
  /** 所有辨識到的整數 token（依閱讀順序），供無法聚類時預填參考 */
  numbers: number[]
  /** 依網格位置比對出的類別名稱；讀不到的位置為 null（由呼叫端補 class_N），全部讀不到為 null */
  labels: (string | null)[] | null
}

/**
 * 依序取得各影像變體的 OCR 字詞並重建網格與類別名稱。
 * getWords 由呼叫端提供（瀏覽器端是 Tesseract worker），成功即提前返回、
 * 不會浪費後續變體的 OCR 時間。
 *
 * 類別名稱以「網格幾何位置」比對（左側對齊列中心 = y 軸、下方對齊欄中心 = x 軸），
 * 並跨變體合併——強化變體會洗掉彩色標籤文字，常要靠原圖變體補回。
 */
export async function recognizeFromWords(
  getWords: (variantIndex: number) => Promise<Word[]>,
  variantCount: number,
  nHint: number,
): Promise<OcrResult> {
  // 各變體的標籤候選字都收集起來：所有變體共用同一個像素座標系，
  // 之後拿任一變體推得的網格幾何都能比對
  const candidateSets: LabelCandidate[][] = []
  const resolveLabels = (geometry: GridGeometry) => {
    const votes: string[][] = geometry.rowCenters.map(() => [])
    for (const set of candidateSets) {
      labelHitsFromGeometry(set, geometry).forEach((hits, i) => votes[i].push(...hits))
    }
    const labels = votes.map(pickByVote)
    return labels.some((l) => l !== null) ? labels : null
  }

  let bestIncomplete: (OcrResult & { reviewCount: number; geometry: GridGeometry }) | null = null
  let weakGrid: (OcrResult & { geometry: GridGeometry }) | null = null
  let bestNumbers: number[] = []
  let bestFreqLabels: string[] | null = null
  for (let variantIndex = 0; variantIndex < variantCount; variantIndex++) {
    const words = await getWords(variantIndex)
    const { tokens, anchors, labelCandidates } = extractTokens(words)
    candidateSets.push(labelCandidates)
    const numbers = [...tokens].sort((a, b) => a.cy - b.cy || a.cx - b.cx).map((t) => t.value)
    if (numbers.length > bestNumbers.length) {
      bestNumbers = numbers
      bestFreqLabels = matchLabels(labelCandidates.map((c) => c.text), nHint)
    }

    // 策略 1：百分比錨點——每一格（含 0 的格子）都有 "(xx.x)"，
    // 能可靠決定網格大小與位置，全零的列/欄也不會被漏掉
    const anchored = anchorGrid(anchors, tokens)
    if (anchored) {
      if (anchored.reviewCount === 0) {
        return {
          grid: anchored.grid,
          needsReview: false,
          numbers,
          labels: resolveLabels(anchored.geometry),
        }
      }
      if (!bestIncomplete || anchored.reviewCount < bestIncomplete.reviewCount) {
        // 先留著，看看其他變體能否完整讀到；標籤等收齊所有變體後再比對
        bestIncomplete = {
          grid: anchored.grid,
          needsReview: true,
          reviewCount: anchored.reviewCount,
          numbers,
          labels: null,
          geometry: anchored.geometry,
        }
      }
      continue
    }

    // 圖上明顯有百分比標註（錨點 >= 4）卻湊不出完整錨點網格，
    // 代表這個變體漏字嚴重（常見：對角線彩色數字），整數聚類會拼出
    // 看似合法但錯誤的網格 —— 不信任它，換下一個變體再試
    const clustered = clusterToGrid(tokens, nHint)
    if (clustered) {
      if (anchors.length < 4) {
        return {
          grid: clustered.grid,
          needsReview: false,
          numbers,
          labels: resolveLabels(clustered.geometry),
        }
      }
      if (!weakGrid) {
        weakGrid = {
          grid: clustered.grid,
          needsReview: true,
          numbers,
          labels: null,
          geometry: clustered.geometry,
        }
      }
    }
  }
  if (bestIncomplete) {
    const { reviewCount: _rc, geometry, ...result } = bestIncomplete
    return { ...result, labels: resolveLabels(geometry) }
  }
  if (weakGrid) {
    const { geometry, ...result } = weakGrid
    return { ...result, labels: resolveLabels(geometry) }
  }
  return { grid: null, needsReview: true, numbers: bestNumbers, labels: bestFreqLabels }
}

const RESERVED_WORDS = new Set([
  'true', 'predicted', 'label', 'confusion', 'matrix', 'test', 'train', 'validation',
  'accuracy', 'precision', 'recall', 'percentage', 'prec', 'rec',
])

const PCT_RE = /^\(<?\s*(\d+(?:[.,]\d+)?)\s*%?\)$/

export function extractTokens(words: Word[]): {
  tokens: Token[]
  anchors: Anchor[]
  labelCandidates: LabelCandidate[]
} {
  const tokens: Token[] = []
  const anchors: Anchor[] = []
  const labelCandidates: LabelCandidate[] = []
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
      labelCandidates.push({ text, cx, cy })
    } else if (/^[A-HJ-NP-Z]$/.test(text)) {
      // 單字母類別名稱（如 N/S/V/Q/X），排除 I 與 O 避免和 1、0 混淆
      labelCandidates.push({ text, cx, cy })
    }
  }
  return { tokens, anchors, labelCandidates }
}

/**
 * 用括號百分比錨點重建 k×k 網格：錨點必須自成 k 列、每列 k 個。
 * 每個錨點往正上方找最近的整數 token 當作該格數值；找不到時補 0——
 * 若該格百分比為 0 則可確定，否則列入 reviewCount 請使用者核對。
 */
export function anchorGrid(
  anchors: Anchor[],
  tokens: Token[],
): { grid: number[][]; reviewCount: number; geometry: GridGeometry } | null {
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
  const pitchX = median(adjacentDiffs(colCenters))
  const pitchY = median(adjacentDiffs(rowCenters))

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
  return { grid, reviewCount, geometry: { colCenters, rowCenters, pitchX, pitchY } }
}

function adjacentDiffs(xs: number[]): number[] {
  return xs.slice(1).map((v, i) => v - xs[i])
}

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

/**
 * 依 y 座標分列、x 座標排欄，並自動偵測類別數：
 * 「剛好有 k 列、每列剛好 k 個整數」即視為 k×k 網格。
 * 若多個 k 成立，優先採用與目前設定相同的 nHint，否則取最大的 k。
 */
export function clusterToGrid(
  tokens: Token[],
  nHint: number,
): { grid: number[][]; geometry: GridGeometry } | null {
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
      const colCenters = Array.from({ length: k }, (_, j) =>
        rows.reduce((s, r) => s + r[j].cx, 0) / k,
      )
      const rowCenters = rows.map((r) => r.reduce((s, t) => s + t.cy, 0) / k)
      return {
        grid: rows.map((r) => r.map((t) => t.value)),
        geometry: {
          colCenters,
          rowCenters,
          pitchX: median(adjacentDiffs(colCenters)),
          pitchY: median(adjacentDiffs(rowCenters)),
        },
      }
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

/**
 * 以網格幾何位置比對類別名稱，回傳每個位置命中的候選字（可能 0～2 個）：
 * - y 軸標籤：在網格左側、垂直位置與第 i 列中心對齊的候選字（取最靠近網格者）
 * - x 軸標籤：在網格下方、水平位置與第 j 欄中心對齊的候選字（取最靠近網格者）
 * 呼叫端把多個影像變體的命中結果集中後用 pickByVote 表決。
 */
export function labelHitsFromGeometry(
  candidates: LabelCandidate[],
  geom: GridGeometry,
): string[][] {
  const { colCenters, rowCenters, pitchX, pitchY } = geom
  const k = rowCenters.length
  const gridLeft = colCenters[0] - pitchX / 2
  const gridBottom = rowCenters[k - 1] + pitchY / 2

  return Array.from({ length: k }, (_, i) => {
    const yAxis = candidates
      .filter((c) => c.cx < gridLeft && Math.abs(c.cy - rowCenters[i]) < pitchY * 0.45)
      .sort((a, b) => b.cx - a.cx)[0]
    const xAxis = candidates
      .filter(
        (c) =>
          c.cy > gridBottom &&
          c.cy < gridBottom + pitchY * 0.9 &&
          Math.abs(c.cx - colCenters[i]) < pitchX * 0.45,
      )
      .sort((a, b) => a.cy - b.cy)[0]
    // x 軸放前面：表決平手時優先採用。y 軸旁有旋轉的軸標題（Tesseract 讀
    // 直排文字常吐出殘字、恰好落在列中心帶內），x 軸的水平文字相對可靠
    return [xAxis?.text, yAxis?.text].filter((t): t is string => t !== undefined)
  })
}

/**
 * 表決單一位置的類別名稱：近似重複（截尾）先合併，取票數最多者；
 * 平手取較長者。OCR 偶爾把某軸的字讀錯（例如把旋轉的軸標題殘字誤當
 * 標籤），但同一個字通常能在另一軸或其他影像變體被正確讀到而勝出。
 */
export function pickByVote(hits: string[]): string | null {
  const groups: { rep: string; count: number }[] = []
  for (const t of hits) {
    const g = groups.find(
      (g) => (g.rep.includes(t) || t.includes(g.rep)) && Math.abs(g.rep.length - t.length) <= 2,
    )
    if (g) {
      g.count += 1
      if (t.length > g.rep.length) g.rep = t
    } else {
      groups.push({ rep: t, count: 1 })
    }
  }
  groups.sort((a, b) => b.count - a.count || b.rep.length - a.rep.length)
  return groups[0]?.rep ?? null
}

/**
 * 無網格幾何可用時的退路：類別名稱在圖上會出現兩次（y 軸與 x 軸各一次）。
 * 先合併近似重複的候選字（OCR 常把同一個標籤截尾，如 non_nsvt / non_nsv），
 * 再取出現至少兩次者，依首次出現順序排列；剛好湊滿 n 個才採用，寧缺勿錯。
 */
export function matchLabels(candidates: string[], n: number): string[] | null {
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

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] ?? 0
}
