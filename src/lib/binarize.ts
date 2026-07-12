/**
 * 影像二值化的純數學部分（不碰 canvas，可獨立測試）。
 * canvas 包裝在 preprocess.ts。
 */

export type Tone = (r: number, g: number, b: number) => number

/** R−B 通道差把暖色（紅/橘）文字變黑、藍/白背景變白 */
export const warmTextTone: Tone = (r, _g, b) => 255 - clamp(r - b)

/** 標準灰階 */
export const grayTone: Tone = (r, g, b) => Math.round(0.299 * r + 0.587 * g + 0.114 * b)

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/** 依 tone 函式轉單色調後，用 Otsu 門檻二值化；輸入輸出皆為 RGBA byte array */
export function binarizeRgba(
  data: Uint8Array | Uint8ClampedArray,
  tone: Tone,
): Uint8ClampedArray<ArrayBuffer> {
  const count = data.length / 4
  const vals = new Uint8Array(count)
  const hist = new Array<number>(256).fill(0)
  for (let p = 0, q = 0; p < data.length; p += 4, q++) {
    const v = tone(data[p], data[p + 1], data[p + 2])
    vals[q] = v
    hist[v]++
  }
  const threshold = otsu(hist, count)
  const out = new Uint8ClampedArray(data.length)
  for (let q = 0, p = 0; q < count; q++, p += 4) {
    const v = vals[q] > threshold ? 255 : 0
    out[p] = out[p + 1] = out[p + 2] = v
    out[p + 3] = 255
  }
  return out
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
