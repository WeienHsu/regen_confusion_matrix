import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { MatrixConfig } from '../types'
import { downloadPng, downloadSvg, copyPngToClipboard, downloadConfig } from '../lib/exporters'

interface Props {
  cfg: MatrixConfig
  onChange: (cfg: MatrixConfig) => void
  svgRef: RefObject<SVGSVGElement>
}

export default function ExportBar({ cfg, onChange, svgRef }: Props) {
  const [scale, setScale] = useState(2)
  const [status, setStatus] = useState<string | null>(null)
  const configFileRef = useRef<HTMLInputElement>(null)

  function withSvg(fn: (svg: SVGSVGElement) => Promise<void> | void, okMsg?: string) {
    const svg = svgRef.current
    if (!svg) return
    Promise.resolve(fn(svg))
      .then(() => {
        if (okMsg) flash(okMsg)
      })
      .catch((e: unknown) => flash(e instanceof Error ? e.message : String(e)))
  }

  function flash(msg: string) {
    setStatus(msg)
    setTimeout(() => setStatus(null), 3000)
  }

  function loadConfigFile(file: File) {
    file
      .text()
      .then((text) => {
        const data = JSON.parse(text) as MatrixConfig
        if (data.version !== 1 || !Array.isArray(data.counts) || !data.style) {
          throw new Error('不是有效的設定檔')
        }
        onChange(data)
        flash('已載入設定檔')
      })
      .catch((e: unknown) => flash(e instanceof Error ? e.message : String(e)))
  }

  return (
    <div className="exportbar">
      <label className="scale-label" htmlFor="png-scale">PNG 解析度</label>
      <select id="png-scale" value={scale} onChange={(e) => setScale(Number(e.target.value))}>
        <option value={1}>1×</option>
        <option value={2}>2×</option>
        <option value={4}>4×</option>
      </select>
      <button className="btn primary" onClick={() => withSvg((svg) => downloadPng(svg, scale))}>下載 PNG</button>
      <button className="btn" onClick={() => withSvg((svg) => downloadSvg(svg))}>下載 SVG</button>
      <button className="btn" onClick={() => withSvg((svg) => copyPngToClipboard(svg, scale), '已複製 PNG 到剪貼簿')}>
        複製到剪貼簿
      </button>
      <span className="divider" />
      <button className="btn" onClick={() => downloadConfig(cfg)}>存設定檔</button>
      <button className="btn" onClick={() => configFileRef.current?.click()}>載入設定檔</button>
      <input
        ref={configFileRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) loadConfigFile(f)
          e.target.value = ''
        }}
      />
      {status && <span className="status" role="status">{status}</span>}
    </div>
  )
}
