import { useEffect, useRef, useState } from 'react'
import type { MatrixConfig } from '../types'
import { resizeMatrix } from '../types'
import { parsePasted, applyParsed } from '../lib/parse'
import { recognizeMatrix } from '../lib/ocr'
import Section from './Section'
import NumberInput from './NumberInput'

interface Props {
  cfg: MatrixConfig
  onChange: (cfg: MatrixConfig) => void
}

type Tab = 'manual' | 'paste' | 'image'

export default function DataInput({ cfg, onChange }: Props) {
  const [tab, setTab] = useState<Tab>('manual')
  const [expanded, setExpanded] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [ocrState, setOcrState] = useState<'idle' | 'running' | 'done' | 'partial' | 'failed'>('idle')
  const [ocrProgress, setOcrProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageFileRef = useRef<File | null>(null)

  const n = cfg.labels.length

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  function setCount(i: number, j: number, v: number) {
    const counts = cfg.counts.map((row) => [...row])
    counts[i][j] = Math.max(0, v)
    onChange({ ...cfg, counts })
  }

  function setLabel(i: number, name: string) {
    const labels = [...cfg.labels]
    labels[i] = name
    onChange({ ...cfg, labels })
  }

  function handleParse() {
    setError(null)
    try {
      const parsed = parsePasted(pasteText)
      if ('version' in parsed) {
        onChange(parsed)
      } else {
        onChange(applyParsed(parsed, cfg))
      }
      setTab('manual')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function handleImageSelect(file: File) {
    imageFileRef.current = file
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl(URL.createObjectURL(file))
    setOcrState('idle')
  }

  async function handleOcr() {
    const file = imageFileRef.current
    if (!file) return
    setError(null)
    setOcrState('running')
    setOcrProgress(0)
    try {
      const result = await recognizeMatrix(file, n, setOcrProgress)
      if (result.grid) {
        onChange({ ...cfg, ...resizeToGrid(cfg, result.grid, result.labels) })
        setOcrState(result.needsReview ? 'partial' : 'done')
        setTab('manual') // 直接帶到已填好數值的表格，旁邊有原圖可對照修改
      } else if (result.numbers.length >= n * n) {
        // 無法確定網格位置時，依閱讀順序取前 n×n 個整數當草稿
        const flat = result.numbers.slice(0, n * n)
        const counts = Array.from({ length: n }, (_, i) => flat.slice(i * n, (i + 1) * n))
        onChange({ ...cfg, ...resizeToGrid(cfg, counts, result.labels) })
        setOcrState('partial')
        setTab('manual')
      } else {
        setOcrState('failed')
      }
    } catch (e) {
      setOcrState('failed')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /** Enter / ↑↓ 在同一欄的上下格之間移動（覆蓋 number input 原生的增減行為） */
  function onGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement
    if (!(t instanceof HTMLInputElement) || t.dataset.i === undefined) return
    let di = 0
    if (e.key === 'ArrowDown' || e.key === 'Enter') di = 1
    else if (e.key === 'ArrowUp') di = -1
    else return
    e.preventDefault()
    const next = e.currentTarget.querySelector<HTMLInputElement>(
      `input[data-i="${Number(t.dataset.i) + di}"][data-j="${t.dataset.j}"]`,
    )
    next?.focus()
    next?.select()
  }

  function renderGrid() {
    return (
      <div className="grid-scroll" onKeyDown={onGridKeyDown}>
        <table className="grid-input">
          <thead>
            <tr>
              <th aria-label="空白" />
              {cfg.labels.map((label, j) => (
                <th key={j}>
                  <input
                    aria-label={`類別 ${j + 1} 名稱`}
                    value={label}
                    onChange={(e) => setLabel(j, e.target.value)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cfg.counts.map((row, i) => (
              <tr key={i}>
                <th className="rowhead">{cfg.labels[i]}</th>
                {row.map((v, j) => (
                  <td key={j}>
                    <NumberInput
                      min={0}
                      data-i={i}
                      data-j={j}
                      aria-label={`True ${cfg.labels[i]}、Predicted ${cfg.labels[j]}`}
                      value={v}
                      onCommit={(val) => setCount(i, j, val)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <Section title="1 · 資料輸入">
      <div className="tabs" role="tablist">
        {(
          [
            ['manual', '手動輸入'],
            ['paste', '貼上 CSV / JSON'],
            ['image', '圖片 OCR'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'manual' && (
        <>
          <div className="row">
            <label htmlFor="n-classes">類別數</label>
            <select id="n-classes" value={n} onChange={(e) => onChange(resizeMatrix(cfg, Number(e.target.value)))}>
              {Array.from({ length: 9 }, (_, i) => i + 2).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <button className="btn" onClick={() => setExpanded(true)}>⤢ 放大編輯</button>
          </div>
          {renderGrid()}
          <p className="hint">
            列 = True label、欄 = Predicted label。欄位名稱可直接編輯；Enter / ↑↓ 可在上下格間移動。
          </p>
          {imageUrl && (ocrState === 'done' || ocrState === 'partial') && (
            <>
              {ocrState === 'done' && (
                <p className="hint ok">已自動填入 OCR 辨識結果，請對照下方原圖核對修正。</p>
              )}
              {ocrState === 'partial' && (
                <p className="hint warn">OCR 有部分數字無法確定（已盡量預填、缺漏補 0），請務必對照下方原圖逐格核對。</p>
              )}
              <img className="ocr-preview" src={imageUrl} alt="上傳的 confusion matrix 原圖對照" />
            </>
          )}
        </>
      )}

      {tab === 'paste' && (
        <>
          <textarea
            className="paste-area"
            rows={6}
            placeholder={'支援：\nCSV：6350,301\\n393,1210（可含表頭）\nJSON：[[6350,301],[393,1210]]\n或 {"labels":[...],"counts":[...]}\n或先前匯出的設定檔 JSON'}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <button className="btn" onClick={handleParse}>解析並套用</button>
        </>
      )}

      {tab === 'image' && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/bmp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleImageSelect(f)
            }}
          />
          <button className="btn" onClick={() => fileRef.current?.click()}>選擇圖片…</button>
          {imageUrl && (
            <>
              <img className="ocr-preview" src={imageUrl} alt="上傳的 confusion matrix 原圖" />
              <button className="btn primary" onClick={handleOcr} disabled={ocrState === 'running'}>
                {ocrState === 'running' ? `辨識中… ${(ocrProgress * 100).toFixed(0)}%` : 'OCR 辨識（自動偵測類別數）'}
              </button>
              {ocrState === 'failed' && (
                <p className="hint warn">
                  辨識不到足夠的數字。已嘗試多種影像強化仍失敗，請改用手動輸入（原圖保留在此對照），
                  或改上傳解析度較高、文字較清晰的圖。
                </p>
              )}
              <p className="hint">
                OCR 為輔助預填，會自動偵測類別數並嘗試多種影像強化（含彩色數字）。
                辨識完成會自動切到「手動輸入」，並在表格下方保留原圖對照。
              </p>
            </>
          )}
        </>
      )}

      {error && <p className="hint warn">{error}</p>}

      {expanded && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="放大編輯數值"
          onClick={(e) => {
            if (e.target === e.currentTarget) setExpanded(false)
          }}
        >
          <div className="modal-card">
            <div className="modal-head">
              <b>編輯數值（{n} × {n}）</b>
              <button className="btn primary" onClick={() => setExpanded(false)}>完成</button>
            </div>
            {renderGrid()}
            <p className="hint">Enter / ↑↓ 在上下格間移動；Esc、點背景或按「完成」關閉。修改會即時同步到預覽。</p>
          </div>
        </div>
      )}
    </Section>
  )
}

function resizeToGrid(
  cfg: MatrixConfig,
  counts: number[][],
  ocrLabels: (string | null)[] | null,
): Pick<MatrixConfig, 'labels' | 'counts' | 'order'> {
  const n = counts.length
  return {
    // OCR 讀到的類別名稱優先；讀不到的位置保留原名稱或補 class_N
    labels: Array.from({ length: n }, (_, i) => ocrLabels?.[i] ?? cfg.labels[i] ?? `class_${i + 1}`),
    counts,
    order: Array.from({ length: n }, (_, i) => i),
  }
}
