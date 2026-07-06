/**
 * 產生給 OCR 依序嘗試的影像變體。
 *
 * matplotlib 產生的 confusion matrix 常用彩色數字（紅/橘字）畫在藍底或白底上，
 * 轉灰階後對比極低，是 OCR 失敗的主因。R−B 通道差可把暖色文字變黑、
 * 藍/白背景變白，再以 Otsu 門檻二值化成乾淨的黑白稿。
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
    const warmText = binarized(src, (r, _g, b) => 255 - clamp(r - b))
    const gray = binarized(src, (r, g, b) => Math.round(0.299 * r + 0.587 * g + 0.114 * b))
    return [file, warmText, gray]
  } catch {
    // 無法解碼就直接用原檔（例如罕見格式），讓 Tesseract 自己處理
    return [file]
  }
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/** 依 tone 函式轉單色調後，用 Otsu 門檻二值化 */
function binarized(src: ImageData, tone: (r: number, g: number, b: number) => number): HTMLCanvasElement {
  const { width, height, data } = src
  const vals = new Uint8Array(width * height)
  const hist = new Array<number>(256).fill(0)
  for (let p = 0, q = 0; p < data.length; p += 4, q++) {
    const v = tone(data[p], data[p + 1], data[p + 2])
    vals[q] = v
    hist[v]++
  }
  const threshold = otsu(hist, vals.length)
  const out = new ImageData(width, height)
  for (let q = 0, p = 0; q < vals.length; q++, p += 4) {
    const v = vals[q] > threshold ? 255 : 0
    out.data[p] = out.data[p + 1] = out.data[p + 2] = v
    out.data[p + 3] = 255
  }
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  c.getContext('2d')!.putImageData(out, 0, 0)
  return c
}

function otsu(hist: number[], total: number): number {
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}
