import { describe, expect, it } from 'vitest'
import { binarizeRgba, grayTone, warmTextTone } from './binarize'

/** 把 [r,g,b] 陣列組成 RGBA byte array */
function rgba(pixels: [number, number, number][]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach(([r, g, b], i) => {
    out[i * 4] = r
    out[i * 4 + 1] = g
    out[i * 4 + 2] = b
    out[i * 4 + 3] = 255
  })
  return out
}

describe('tone 函式', () => {
  it('warmTextTone 把暖色（紅/橘）變暗、藍與白變亮', () => {
    expect(warmTextTone(255, 0, 0)).toBe(0) // 紅 → 黑
    expect(warmTextTone(255, 128, 40)).toBe(40) // 橘 → 很暗
    expect(warmTextTone(50, 50, 200)).toBe(255) // 藍 → 白
    expect(warmTextTone(255, 255, 255)).toBe(255) // 白 → 白
  })

  it('grayTone 是標準亮度灰階', () => {
    expect(grayTone(255, 255, 255)).toBe(255)
    expect(grayTone(0, 0, 0)).toBe(0)
    expect(grayTone(255, 0, 0)).toBe(76)
  })
})

describe('binarizeRgba', () => {
  it('依 Otsu 門檻把雙峰影像分成黑白', () => {
    // 一半深灰、一半淺灰
    const data = rgba([
      ...Array.from({ length: 8 }, () => [40, 40, 40] as [number, number, number]),
      ...Array.from({ length: 8 }, () => [220, 220, 220] as [number, number, number]),
    ])
    const out = binarizeRgba(data, grayTone)
    for (let i = 0; i < 8; i++) expect(out[i * 4]).toBe(0)
    for (let i = 8; i < 16; i++) expect(out[i * 4]).toBe(255)
    // alpha 全為 255
    for (let i = 0; i < 16; i++) expect(out[i * 4 + 3]).toBe(255)
  })

  it('warmTextTone 讓藍底上的紅字變成白底黑字', () => {
    const data = rgba([
      ...Array.from({ length: 12 }, () => [30, 60, 180] as [number, number, number]), // 藍底
      ...Array.from({ length: 4 }, () => [230, 60, 40] as [number, number, number]), // 紅字
    ])
    const out = binarizeRgba(data, warmTextTone)
    for (let i = 0; i < 12; i++) expect(out[i * 4]).toBe(255) // 底 → 白
    for (let i = 12; i < 16; i++) expect(out[i * 4]).toBe(0) // 字 → 黑
  })
})
