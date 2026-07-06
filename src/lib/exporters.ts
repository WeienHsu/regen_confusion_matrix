import type { MatrixConfig } from '../types'

function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return new XMLSerializer().serializeToString(clone)
}

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

export function downloadSvg(svg: SVGSVGElement, filename = 'confusion_matrix.svg') {
  download(new Blob([serializeSvg(svg)], { type: 'image/svg+xml' }), filename)
}

function svgToCanvas(svg: SVGSVGElement, scale: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([serializeSvg(svg)], { type: 'image/svg+xml' }))
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(svg.viewBox.baseVal.width * scale)
      canvas.height = Math.round(svg.viewBox.baseVal.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('無法建立 canvas'))
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      resolve(canvas)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('SVG 轉換失敗'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 編碼失敗'))), 'image/png')
  })
}

export async function downloadPng(svg: SVGSVGElement, scale: number, filename = 'confusion_matrix.png') {
  const canvas = await svgToCanvas(svg, scale)
  download(await canvasToBlob(canvas), filename)
}

export async function copyPngToClipboard(svg: SVGSVGElement, scale: number) {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('此瀏覽器不支援複製圖片到剪貼簿')
  }
  const canvas = await svgToCanvas(svg, scale)
  const blob = await canvasToBlob(canvas)
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export function downloadConfig(cfg: MatrixConfig, filename = 'confusion_matrix_config.json') {
  download(new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' }), filename)
}
