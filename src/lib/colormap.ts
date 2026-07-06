import type { CmapName } from '../types'

/** 各色階的淺色端與深色端（近似 matplotlib 同名 colormap） */
const CMAP_ENDS: Record<Exclude<CmapName, 'Custom'>, [string, string]> = {
  Blues: ['#F7FBFF', '#08306B'],
  Greens: ['#F7FCF5', '#00441B'],
  Reds: ['#FFF5F0', '#67000D'],
  Purples: ['#FCFBFD', '#3F007D'],
  Greys: ['#FFFFFF', '#111111'],
}

function hex2rgb(h: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

/** t ∈ [0,1] 對應色階顏色 */
export function shade(cmap: CmapName, customColor: string, t: number): string {
  const [lo, hi] = cmap === 'Custom' ? ['#FFFFFF', customColor] : CMAP_ENDS[cmap]
  const a = hex2rgb(lo)
  const b = hex2rgb(hi)
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, t))))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/** 判斷該格文字要用深色或淺色 */
export function textColorFor(t: number): string {
  return t > 0.5 ? '#FFFFFF' : '#111111'
}
