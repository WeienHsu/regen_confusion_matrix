import { createWorker } from 'tesseract.js'

export interface OcrResult {
  /** 若成功聚類成 n×n，回傳網格數值；否則為 null */
  grid: number[][] | null
  /** 所有辨識到的整數 token（依閱讀順序），供無法聚類時參考 */
  numbers: number[]
  /** 圖片中偵測到的候選類別名稱（軸標籤文字） */
  labelCandidates: string[]
}

interface Token {
  value: number
  cx: number
  cy: number
  h: number
}

/**
 * 對 confusion matrix 圖片做 OCR，抽出格子裡的整數。
 *
 * 策略：只取「純整數」token（格子計數），排除含 %、小數點、括號的
 * token（百分比、colorbar 刻度、metrics 摘要），再依 y 座標聚類成列、
 * x 座標排序成欄。結果一律由使用者確認修正，OCR 只負責預填。
 */
export async function recognizeMatrix(
  image: File | string,
  n: number,
  onProgress?: (p: number) => void,
): Promise<OcrResult> {
  // worker / core / 語言資料一律由本站提供（見 scripts/copy-tesseract-assets.mjs），
  // 不打外部 CDN，離線 clone 下來也能用
  const base = import.meta.env.BASE_URL
  const worker = await createWorker('eng', 1, {
    workerPath: `${base}tesseract/core/worker.min.js`,
    corePath: `${base}tesseract/core`,
    langPath: `${base}tesseract/lang`,
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress)
    },
  })
  let result
  try {
    result = await worker.recognize(image)
  } finally {
    await worker.terminate()
  }

  const words = result.data.words ?? []
  const tokens: Token[] = []
  const labelCandidates: string[] = []

  for (const w of words) {
    const text = w.text.trim()
    if (/^\d{1,3}(,\d{3})+$|^\d+$/.test(text)) {
      const value = Number(text.replace(/,/g, ''))
      const { x0, y0, x1, y1 } = w.bbox
      tokens.push({ value, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: y1 - y0 })
    } else if (/^[A-Za-z_][A-Za-z0-9_-]{2,}$/.test(text) && !RESERVED_WORDS.has(text.toLowerCase())) {
      labelCandidates.push(text)
    }
  }

  const numbers = [...tokens]
    .sort((a, b) => a.cy - b.cy || a.cx - b.cx)
    .map((t) => t.value)

  return { grid: clusterToGrid(tokens, n), numbers, labelCandidates }
}

const RESERVED_WORDS = new Set([
  'true', 'predicted', 'label', 'confusion', 'matrix', 'test', 'train', 'validation',
  'accuracy', 'precision', 'recall', 'percentage', 'prec', 'rec',
])

/** 依 y 座標分列、x 座標排欄；剛好湊成 n×n 才回傳 */
function clusterToGrid(tokens: Token[], n: number): number[][] | null {
  if (tokens.length < n * n) return null

  const sorted = [...tokens].sort((a, b) => a.cy - b.cy)
  const medianH = median(sorted.map((t) => t.h))
  const rowGap = medianH * 1.5

  const rows: Token[][] = []
  for (const t of sorted) {
    const last = rows[rows.length - 1]
    if (last && Math.abs(t.cy - last[last.length - 1].cy) <= rowGap) {
      last.push(t)
    } else {
      rows.push([t])
    }
  }

  // 只留剛好 n 個 token 的列（格子列），其餘（標題年份等雜訊）捨棄
  const candidateRows = rows.filter((r) => r.length === n)
  if (candidateRows.length !== n) return null

  return candidateRows.map((r) => [...r].sort((a, b) => a.cx - b.cx).map((t) => t.value))
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] ?? 0
}
