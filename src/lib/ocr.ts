import { createWorker } from 'tesseract.js'
import { buildVariants } from './preprocess'
import { recognizeFromWords } from './ocrGrid'
import type { OcrResult } from './ocrGrid'

export type { OcrResult }

/**
 * 對 confusion matrix 圖片做 OCR，抽出格子裡的整數、自動偵測類別數並比對類別名稱。
 *
 * 彩色數字（紅/橘字）灰階對比低，因此依序嘗試多個影像變體
 * （原圖 → 暖色文字強化 → 灰階二值化），任一變體成功聚類就採用
 * （網格重建與標籤比對邏輯在 ocrGrid.ts）。
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
    return await recognizeFromWords(
      async (i) => {
        variantIndex = i
        const { data } = await worker.recognize(variants[i])
        return data.words ?? []
      },
      variantCount,
      nHint,
    )
  } finally {
    await worker.terminate()
  }
}
