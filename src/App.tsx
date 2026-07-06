import { useRef, useState } from 'react'
import type { MatrixConfig } from './types'
import { defaultConfig } from './types'
import DataInput from './components/DataInput'
import ClassOrder from './components/ClassOrder'
import StylePanel from './components/StylePanel'
import MatrixPreview from './components/MatrixPreview'
import ExportBar from './components/ExportBar'
import './App.css'

export default function App() {
  const [cfg, setCfg] = useState<MatrixConfig>(defaultConfig)
  const svgRef = useRef<SVGSVGElement>(null)
  const n = cfg.order.length

  return (
    <>
      <header className="app">
        <div className="brand">
          <b>Confusion Matrix Formatter</b>
          <span>輸入或辨識 confusion matrix，重新排版後匯出高品質圖檔</span>
        </div>
        <div className="spacer" />
        <ExportBar cfg={cfg} onChange={setCfg} svgRef={svgRef} />
      </header>

      <div className="layout">
        <aside className="controls">
          <DataInput cfg={cfg} onChange={setCfg} />
          <ClassOrder cfg={cfg} onChange={setCfg} />
          <StylePanel cfg={cfg} onChange={setCfg} />
        </aside>

        <main className="preview">
          <div className="stagebar">
            <span className="pill">即時預覽</span>
            <span className="pill num">{n} × {n}</span>
          </div>
          <div className="stage">
            <MatrixPreview cfg={cfg} svgRef={svgRef} />
          </div>
          <p className="note">
            預覽以 SVG 渲染；匯出 PNG 時依所選倍率轉檔，SVG 為向量格式可無限縮放。
          </p>
        </main>
      </div>
    </>
  )
}
