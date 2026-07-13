import { binarizeRgba, grayTone, invertedGrayTone, warmTextTone } from './binarize'
import type { Tone } from './binarize'

/**
 * 產生給 OCR 依序嘗試的影像變體。
 *
 * matplotlib 產生的 confusion matrix 常用彩色數字（紅/橘字）畫在藍底或白底上，
 * 轉灰階後對比極低，是 OCR 失敗的主因。R−B 通道差可把暖色文字變黑、
 * 藍/白背景變白，再以 Otsu 門檻二值化成乾淨的黑白稿（純數學在 binarize.ts）。
 *
 * 另一個主因是深色格上的白字（色階深處、飽和底色的對角線格），
 * 二值化後變成黑底白字讀不動 —— 反相灰階變體把它翻成白底黑字。
 * 反相變體排最後：先前就能成功的圖在前面的變體提前返回、不受影響。
 */
export async function buildVariants(file: File): Promise<(File | HTMLCanvasElement)[]> {
  try {
    const bmp = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bmp.width
    canvas.height = bmp.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return [file]
    ctx.drawImage(bmp, 0, 0)
    const src = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return [
      file,
      binarizedCanvas(src, warmTextTone),
      binarizedCanvas(src, grayTone),
      binarizedCanvas(src, invertedGrayTone),
    ]
  } catch {
    // 無法解碼就直接用原檔（例如罕見格式），讓 Tesseract 自己處理
    return [file]
  }
}

function binarizedCanvas(src: ImageData, tone: Tone): HTMLCanvasElement {
  const out = new ImageData(binarizeRgba(src.data, tone), src.width, src.height)
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  c.getContext('2d')!.putImageData(out, 0, 0)
  return c
}
