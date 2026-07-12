import type { MatrixConfig, StyleConfig } from '../types'
import { FONT_OPTIONS } from '../types'

interface Props {
  cfg: MatrixConfig
  onChange: (cfg: MatrixConfig) => void
}

export default function StylePanel({ cfg, onChange }: Props) {
  const s = cfg.style
  function set<K extends keyof StyleConfig>(key: K, value: StyleConfig[K]) {
    onChange({ ...cfg, style: { ...s, [key]: value } })
  }

  return (
    <div className="card">
      <h2>3 · 樣式</h2>
      <div className="row">
        <label htmlFor="st-title">標題</label>
        <input id="st-title" type="text" value={s.title} onChange={(e) => set('title', e.target.value)} />
      </div>
      <div className="row">
        <label htmlFor="st-xaxis">X 軸標題</label>
        <input id="st-xaxis" type="text" value={s.xAxisTitle} onChange={(e) => set('xAxisTitle', e.target.value)} />
      </div>
      <div className="row">
        <label htmlFor="st-yaxis">Y 軸標題</label>
        <input id="st-yaxis" type="text" value={s.yAxisTitle} onChange={(e) => set('yAxisTitle', e.target.value)} />
      </div>
      <div className="row">
        <label htmlFor="st-cmap">色階</label>
        <select id="st-cmap" value={s.cmap} onChange={(e) => set('cmap', e.target.value as StyleConfig['cmap'])}>
          <option value="Blues">Blues</option>
          <option value="Greens">Greens</option>
          <option value="Reds">Reds</option>
          <option value="Purples">Purples</option>
          <option value="Greys">Greys</option>
          <option value="Custom">自訂單色…</option>
        </select>
        <input
          type="color"
          aria-label="自訂色階深色端"
          title="自訂色階深色端"
          value={s.customColor}
          onChange={(e) => {
            onChange({ ...cfg, style: { ...s, customColor: e.target.value, cmap: 'Custom' } })
          }}
        />
      </div>
      <div className="row">
        <label htmlFor="st-font">字體</label>
        <select id="st-font" value={s.fontFamily} onChange={(e) => set('fontFamily', e.target.value)}>
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>
      <div className="row">
        <label htmlFor="st-fs-title">標題字級</label>
        <input id="st-fs-title" type="number" min={12} max={72} value={s.titleFontSize} onChange={(e) => set('titleFontSize', Number(e.target.value) || 24)} />
      </div>
      <div className="row">
        <label htmlFor="st-fs-value">數值字級</label>
        <input id="st-fs-value" type="number" min={10} max={60} value={s.valueFontSize} onChange={(e) => set('valueFontSize', Number(e.target.value) || 26)} />
      </div>
      <div className="row">
        <label htmlFor="st-fs-label">標籤字級</label>
        <input id="st-fs-label" type="number" min={8} max={40} value={s.labelFontSize} onChange={(e) => set('labelFontSize', Number(e.target.value) || 16)} />
      </div>
      <div className="row">
        <label htmlFor="st-valmode">數值顯示</label>
        <select id="st-valmode" value={s.valueMode} onChange={(e) => set('valueMode', e.target.value as StyleConfig['valueMode'])}>
          <option value="both">數量 + 百分比</option>
          <option value="count">只顯示數量</option>
          <option value="pct">只顯示百分比</option>
        </select>
      </div>
      <div className="row">
        <label htmlFor="st-norm">百分比基準</label>
        <select id="st-norm" value={s.normalize} onChange={(e) => set('normalize', e.target.value as StyleConfig['normalize'])}>
          <option value="row">依 True label</option>
          <option value="col">依 Predicted label</option>
          <option value="all">依全體總數</option>
        </select>
      </div>
      <label className="check">
        <input type="checkbox" checked={s.showColorbar} onChange={(e) => set('showColorbar', e.target.checked)} />
        顯示 colorbar
      </label>
      <label className="check">
        <input type="checkbox" checked={s.showMetrics} onChange={(e) => set('showMetrics', e.target.checked)} />
        顯示 metrics 摘要框（Accuracy / Precision / Recall）
      </label>
      {s.showMetrics && (
        <>
          <div className="row">
            <label htmlFor="st-mpos">Metrics 位置</label>
            <select id="st-mpos" value={s.metricsPosition} onChange={(e) => set('metricsPosition', e.target.value as StyleConfig['metricsPosition'])}>
              <option value="inside">圖內（矩陣右下角）</option>
              <option value="outside">圖表下方（不遮擋格子）</option>
            </select>
          </div>
          <div className="row">
            <label htmlFor="st-mfs">Metrics 字級</label>
            <input id="st-mfs" type="number" min={8} max={30} value={s.metricsFontSize} onChange={(e) => set('metricsFontSize', Number(e.target.value) || 15)} />
          </div>
        </>
      )}
    </div>
  )
}
