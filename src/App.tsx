import { useRef, useState } from 'react'
import type { MatrixConfig } from './types'
import { defaultConfig } from './types'
import DataInput from './components/DataInput'
import ClassOrder from './components/ClassOrder'
import StylePanel, { MetricsChartPanel } from './components/StylePanel'
import MatrixPreview from './components/MatrixPreview'
import MetricsChart from './components/MetricsChart'
import ExportBar from './components/ExportBar'
import './App.css'

type View = 'matrix' | 'metrics'

const VIEWS: [View, string][] = [
  ['matrix', '混淆矩陣'],
  ['metrics', '指標圖'],
]

export default function App() {
  const [cfg, setCfg] = useState<MatrixConfig>(defaultConfig)
  const [view, setView] = useState<View>('matrix')
  const matrixRef = useRef<SVGSVGElement>(null)
  const metricsRef = useRef<SVGSVGElement>(null)
  const n = cfg.groups.length

  return (
    <>
      <header className="app">
        <div className="brand">
          <b>Confusion Matrix Formatter</b>
          <span>輸入或辨識 confusion matrix，重新排版後匯出高品質圖檔</span>
        </div>
        <div className="spacer" />
        <ExportBar
          cfg={cfg}
          onChange={setCfg}
          svgRef={view === 'matrix' ? matrixRef : metricsRef}
          filenameBase={view === 'matrix' ? 'confusion_matrix' : 'metrics'}
        />
      </header>

      <div className="layout">
        <aside className="controls">
          <DataInput cfg={cfg} onChange={setCfg} />
          <ClassOrder cfg={cfg} onChange={setCfg} />
          <StylePanel cfg={cfg} onChange={setCfg} />
          <MetricsChartPanel cfg={cfg} onChange={setCfg} />
        </aside>

        <main className="preview">
          <div className="stagebar">
            <div className="tabs" role="tablist">
              {VIEWS.map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={view === key}
                  className={`tab ${view === key ? 'active' : ''}`}
                  onClick={() => setView(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="pill num">{n} × {n}</span>
          </div>
          {/* 兩張圖都保持 render：匯出是自行序列化 SVG，隱藏中的那張仍可正常輸出 */}
          <div className="stage" hidden={view !== 'matrix'}>
            <MatrixPreview cfg={cfg} svgRef={matrixRef} />
          </div>
          <div className="stage" hidden={view !== 'metrics'}>
            <MetricsChart cfg={cfg} svgRef={metricsRef} />
          </div>
          <p className="note">
            匯出按鈕作用於目前分頁的圖。預覽以 SVG 渲染；匯出 PNG 時依所選倍率轉檔，
            SVG 為向量格式可無限縮放。
          </p>
        </main>
      </div>
    </>
  )
}
