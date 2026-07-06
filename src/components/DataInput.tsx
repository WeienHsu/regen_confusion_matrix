import { useRef, useState } from 'react'
import type { MatrixConfig } from '../types'
import { resizeMatrix } from '../types'
import { parsePasted, applyParsed } from '../lib/parse'
import { recognizeMatrix } from '../lib/ocr'

interface Props {
  cfg: MatrixConfig
  onChange: (cfg: MatrixConfig) => void
}

type Tab = 'manual' | 'paste' | 'image'

export default function DataInput({ cfg, onChange }: Props) {
  const [tab, setTab] = useState<Tab>('manual')
  const [pasteText, setPasteText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [ocrState, setOcrState] = useState<'idle' | 'running' | 'done' | 'partial' | 'failed'>('idle')
  const [ocrProgress, setOcrProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageFileRef = useRef<File | null>(null)

  const n = cfg.labels.length

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
        const counts = result.grid
        onChange({ ...cfg, ...resizeToGrid(cfg, counts, result.labels) })
        setOcrState('done')
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

  return (
    <div className="card">
      <h2>1 · 資料輸入</h2>
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
          </div>
          <div className="grid-scroll">
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
                        <input
                          type="number"
                          min={0}
                          aria-label={`True ${cfg.labels[i]}、Predicted ${cfg.labels[j]}`}
                          value={v}
                          onChange={(e) => setCount(i, j, Number(e.target.value) || 0)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">列 = True label、欄 = Predicted label。欄位名稱可直接編輯。</p>
          {imageUrl && (ocrState === 'done' || ocrState === 'partial') && (
            <>
              {ocrState === 'done' && (
                <p className="hint ok">已自動填入 OCR 辨識結果，請對照下方原圖核對修正。</p>
              )}
              {ocrState === 'partial' && (
                <p className="hint warn">OCR 無法確定格子位置，已依閱讀順序預填，請務必對照下方原圖逐格核對。</p>
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
                {ocrState === 'running' ? `辨識中… ${(ocrProgress * 100).toFixed(0)}%` : `OCR 辨識（${n}×${n}）`}
              </button>
              {ocrState === 'failed' && (
                <p className="hint warn">辨識不到足夠的數字，請改用手動輸入（原圖保留在此對照）。</p>
              )}
              <p className="hint">
                OCR 為輔助預填，辨識完成會自動切到「手動輸入」，並在表格下方保留原圖對照。
                類別數請先在「手動輸入」設定正確。
              </p>
            </>
          )}
        </>
      )}

      {error && <p className="hint warn">{error}</p>}
    </div>
  )
}

function resizeToGrid(
  cfg: MatrixConfig,
  counts: number[][],
  ocrLabels: string[] | null,
): Pick<MatrixConfig, 'labels' | 'counts' | 'order'> {
  const n = counts.length
  return {
    labels: ocrLabels ?? Array.from({ length: n }, (_, i) => cfg.labels[i] ?? `class_${i + 1}`),
    counts,
    order: Array.from({ length: n }, (_, i) => i),
  }
}
