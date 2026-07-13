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
  const allTokens: Token[] = []
  const allAnchors: Anchor[] = []
  for (let variantIndex = 0; variantIndex < variantCount; variantIndex++) {
    const words = await getWords(variantIndex)
    const { tokens, anchors, labelCandidates } = extractTokens(words)
    candidateSets.push(labelCandidates)
    allTokens.push(...tokens)
    allAnchors.push(...anchors)
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
  // 沒有任何變體能單獨拼出完整網格時，把所有變體的 token 合併再試一次：
  // 深底白字（反相變體才讀得到）與淺底深字（灰階變體才讀得到）常分屬
  // 不同變體、各自都不完整，但所有變體共用同一像素座標系，合併後
  // 每格取多數決即可互補，不需要額外的 OCR 時間。
  if (variantCount > 1) {
    const mergedAnchors = dedupAnchors(allAnchors)
    const anchored = anchorGrid(mergedAnchors, allTokens)
    if (anchored) {
      if (anchored.reviewCount === 0) {
        return {
          grid: anchored.grid,
          needsReview: false,
          numbers: bestNumbers,
          labels: resolveLabels(anchored.geometry),
        }
      }
      if (!bestIncomplete || anchored.reviewCount < bestIncomplete.reviewCount) {
        bestIncomplete = {
          grid: anchored.grid,
          needsReview: true,
          reviewCount: anchored.reviewCount,
          numbers: bestNumbers,
          labels: null,
          geometry: anchored.geometry,
        }
      }
    } else {
      const clustered = clusterToGrid(allTokens, nHint)
      if (clustered) {
        if (mergedAnchors.length < 4) {
          return {
            grid: clustered.grid,
            needsReview: false,
            numbers: bestNumbers,
            labels: resolveLabels(clustered.geometry),
          }
        }
        if (!weakGrid) {
          weakGrid = {
            grid: clustered.grid,
            needsReview: true,
            numbers: bestNumbers,
            labels: null,
            geometry: clustered.geometry,
          }
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

/**
 * 跨變體合併時去除同位置的重複錨點（各變體對同一格都會讀到同一個百分比）。
 * 保留先出現者（排前面的變體優先）。
 */
function dedupAnchors(anchors: Anchor[]): Anchor[] {
  const out: Anchor[] = []
  for (const a of anchors) {
    const dup = out.some(
      (b) => Math.abs(b.cx - a.cx) < b.h && Math.abs(b.cy - a.cy) < b.h * 0.6,
    )
    if (!dup) out.push(a)
  }
  return out
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
  const anchors: Anchor[] = []
  const numberWords: { word: Word; value: number }[] = []
  const labelWords: { word: Word; text: string }[] = []
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
      numberWords.push({ word: w, value: Number(text.replace(/,/g, '')) })
    } else if (/^[A-Za-z_][A-Za-z0-9_-]{2,}$/.test(text) && !RESERVED_WORDS.has(text.toLowerCase())) {
      labelWords.push({ word: w, text })
    } else if (/^[A-HJ-NP-Z]$/.test(text)) {
      // 單字母類別名稱（如 N/S/V/Q/X），排除 I 與 O 避免和 1、0 混淆
      labelWords.push({ word: w, text })
    }
  }

  // 「Entity 1」這種帶編號的標籤：編號緊貼在標籤字右側，若當成資料數字
  // 會在網格外多出一排假 token、毀掉聚類 —— 併回標籤、不進 tokens。
  // 只對 3 字以上的標籤吸收，避免把長數字被 OCR 切開的殘片誤併給單字母。
  const tokens: Token[] = []
  for (const { word: w, value } of numberWords) {
    const label = labelWords.find(({ word: lw, text }) => {
      if (text.length < 3 || w.text.trim().length > 4) return false
      const lh = lw.bbox.y1 - lw.bbox.y0
      const gap = w.bbox.x0 - lw.bbox.x1
      const overlap = Math.min(w.bbox.y1, lw.bbox.y1) - Math.max(w.bbox.y0, lw.bbox.y0)
      return gap > -lh * 0.2 && gap < lh * 0.8 && overlap > (w.bbox.y1 - w.bbox.y0) * 0.5
    })
    if (label) {
      label.text = `${label.text} ${w.text.trim()}`
      label.word = { ...label.word, bbox: { ...label.word.bbox, x1: w.bbox.x1 } }
    } else {
      const { x0, y0, x1, y1 } = w.bbox
      tokens.push({ value, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: y1 - y0 })
    }
  }
  const labelCandidates = labelWords.map(({ word: lw, text }) => ({
    text,
    cx: (lw.bbox.x0 + lw.bbox.x1) / 2,
    cy: (lw.bbox.y0 + lw.bbox.y1) / 2,
  }))
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
  return cluster1d(items, (t) => t.cy, 1.5)
}

/**
 * 依 x 座標把 token 分欄。欄距（格子寬）幾乎都大於字高，
 * 而同一欄內置中對齊的數字 cx 抖動遠小於字高，用 1 倍字高當門檻。
 */
function clusterCols<T extends { cx: number; h: number }>(items: T[]): T[][] {
  return cluster1d(items, (t) => t.cx, 1.0)
}

/** 一維鏈式聚類：依 key 排序，相鄰間距超過 gapFactor 倍中位字高就切開 */
function cluster1d<T extends { h: number }>(
  items: T[],
  key: (t: T) => number,
  gapFactor: number,
): T[][] {
  const sorted = [...items].sort((a, b) => key(a) - key(b))
  const gap = median(sorted.map((t) => t.h)) * gapFactor

  const groups: T[][] = []
  for (const t of sorted) {
    const last = groups[groups.length - 1]
    if (last && Math.abs(key(t) - key(last[last.length - 1])) <= gap) {
      last.push(t)
    } else {
      groups.push([t])
    }
  }
  return groups
}

/**
 * 依 y 座標分列、x 座標分欄，並自動偵測類別數，重建 k×k 網格。
 *
 * 為了容忍網格外的雜訊數字（colorbar 刻度、軸旁殘字），不要求
 * 「每列剛好 k 個」，而是找出「在至少 k 列都有 token 的 k 個欄」
 * （雜訊欄如 colorbar 刻度湊不滿 k 列、自然被排除），再取
 * 「這些欄全部有值」的列組成網格；列裡多餘的 token 直接忽略。
 *
 * marginal 總和（很多工具會在底部/右側加總和列/欄）會讓網格多一列/欄：
 * 允許 k+1 並以「數值恰好等於各欄/列加總」驗證後剝除，驗不過就放棄，
 * 寧缺勿錯。若多個 k 成立，優先採用與目前設定相同的 nHint，否則取最大的 k。
 */
export function clusterToGrid(
  tokens: Token[],
  nHint: number,
): { grid: number[][]; geometry: GridGeometry } | null {
  if (tokens.length < 4) return null

  const rows = clusterRows(tokens)
  const cols = clusterCols(tokens)
  const rowIndex = new Map<Token, number>()
  rows.forEach((row, i) => row.forEach((t) => rowIndex.set(t, i)))
  // support[c] = 欄 c 涵蓋的列集合
  const support = cols.map((col) => new Set(col.map((t) => rowIndex.get(t)!)))

  const candidates: number[] = []
  for (let k = 2; k <= 10; k++) {
    const n = support.filter((s) => s.size >= k).length
    if (n === k || n === k + 1) candidates.push(k)
  }
  candidates.sort((a, b) => (a === nHint ? -1 : b === nHint ? 1 : b - a))

  for (const k of candidates) {
    const chosenCols = cols.filter((_, c) => support[c].size >= k)
    // 每個選中欄都有 token 的列才算網格列
    const fullRowIdx = rows
      .map((_, i) => i)
      .filter((i) => chosenCols.every((col) => col.some((t) => rowIndex.get(t) === i)))
    if (fullRowIdx.length !== k && fullRowIdx.length !== k + 1) continue

    // 每格取多數決的 token（單一變體通常只有一個；跨變體合併時同格會有多票）
    const cells = fullRowIdx.map((i) =>
      chosenCols.map((col) => pickCellToken(col.filter((t) => rowIndex.get(t) === i))),
    )
    const stripped = stripMargins(cells)
    if (!stripped) continue
    const kk = stripped.length
    if (kk < 2 || kk > 10 || stripped[0].length !== kk) continue
    if (!columnsAligned(stripped)) continue

    const colCenters = Array.from({ length: kk }, (_, j) =>
      stripped.reduce((s, r) => s + r[j].cx, 0) / kk,
    )
    const rowCenters = stripped.map((r) => r.reduce((s, t) => s + t.cy, 0) / kk)
    return {
      grid: stripped.map((r) => r.map((t) => t.value)),
      geometry: {
        colCenters,
        rowCenters,
        pitchX: median(adjacentDiffs(colCenters)),
        pitchY: median(adjacentDiffs(rowCenters)),
      },
    }
  }
  return null
}

/** 同一格有多個 token（跨變體合併）時取多數決的值，平手取先出現者（排前面的變體優先） */
function pickCellToken(ts: Token[]): Token {
  const count = new Map<number, number>()
  for (const t of ts) count.set(t.value, (count.get(t.value) ?? 0) + 1)
  return [...ts].sort((a, b) => count.get(b.value)! - count.get(a.value)!)[0]
}

/**
 * 剝除 marginal 總和列/欄：
 * - 列比欄多 1 → 最後一列必須恰等於各欄加總，剝除
 * - 欄比列多 1 → 最後一欄必須恰等於各列加總，剝除
 * - 正方形但最後一列與最後一欄「同時」都是加總（含右下角總計）→ 兩者都剝除
 * 數值驗證用恰好相等，避免誤殺真實資料；驗不過回傳 null 放棄這個候選。
 */
function stripMargins(cells: Token[][]): Token[][] | null {
  const nRows = cells.length
  const nCols = cells[0].length
  const colSum = (rows: Token[][], j: number) => rows.reduce((s, r) => s + r[j].value, 0)
  const rowSum = (row: Token[], upTo: number) => row.slice(0, upTo).reduce((s, t) => s + t.value, 0)

  if (nRows === nCols + 1) {
    const body = cells.slice(0, -1)
    const last = cells[nRows - 1]
    return last.every((t, j) => t.value === colSum(body, j)) ? body : null
  }
  if (nCols === nRows + 1) {
    const body = cells.map((r) => r.slice(0, -1))
    return cells.every((r, i) => r[nCols - 1].value === rowSum(body[i], nCols - 1)) ? body : null
  }
  if (nRows === nCols && nRows >= 3) {
    const body = cells.slice(0, -1).map((r) => r.slice(0, -1))
    const bothMargins =
      cells[nRows - 1].slice(0, -1).every((t, j) => t.value === colSum(body, j)) &&
      cells.slice(0, -1).every((r, i) => r[nCols - 1].value === rowSum(body[i], nCols - 1)) &&
      cells[nRows - 1][nCols - 1].value === body.reduce((s, r) => s + rowSum(r, r.length), 0)
    if (bothMargins && body.length >= 2) return body
  }
  return cells
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
