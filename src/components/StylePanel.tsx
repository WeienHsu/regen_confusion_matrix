import type { MatrixConfig, MetricKey, StyleConfig } from '../types'
import { FONT_OPTIONS, METRIC_DEFS } from '../types'
import Section from './Section'
import NumberInput from './NumberInput'

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
    <Section title="3 · 樣式">
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
        <NumberInput id="st-fs-title" min={12} max={72} value={s.titleFontSize} onCommit={(v) => set('titleFontSize', v)} />
      </div>
      <div className="row">
        <label htmlFor="st-fs-value">數值字級</label>
        <NumberInput id="st-fs-value" min={10} max={60} value={s.valueFontSize} onCommit={(v) => set('valueFontSize', v)} />
      </div>
      <div className="row">
        <label htmlFor="st-fs-label">標籤字級</label>
        <NumberInput id="st-fs-label" min={8} max={40} value={s.labelFontSize} onCommit={(v) => set('labelFontSize', v)} />
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
              <optgroup label="圖外（不遮擋格子）">
                <option value="below">矩陣下方</option>
                <option value="right">矩陣右側</option>
              </optgroup>
              <optgroup label="圖內（會蓋住格子）">
                <option value="inside-tl">左上角</option>
                <option value="inside-tr">右上角</option>
                <option value="inside-bl">左下角</option>
                <option value="inside-br">右下角</option>
              </optgroup>
            </select>
          </div>
          <div className="row">
            <label htmlFor="st-mfs">Metrics 字級</label>
            <NumberInput id="st-mfs" min={8} max={30} value={s.metricsFontSize} onCommit={(v) => set('metricsFontSize', v)} />
          </div>
        </>
      )}
    </Section>
  )
}

export function MetricsChartPanel({ cfg, onChange }: Props) {
  const s = cfg.style
  function set<K extends keyof StyleConfig>(key: K, value: StyleConfig[K]) {
    onChange({ ...cfg, style: { ...s, [key]: value } })
  }

  function toggleColumn(key: MetricKey, on: boolean) {
    const next = METRIC_DEFS.filter(
      (d) => (d.key === key ? on : s.metricsChartColumns.includes(d.key)),
    ).map((d) => d.key)
    if (next.length) set('metricsChartColumns', next)
  }

  return (
    <Section title="4 · 指標圖（第二張圖）">
      <div className="row">
        <label htmlFor="mc-title">標題</label>
        <input id="mc-title" type="text" value={s.metricsChartTitle} onChange={(e) => set('metricsChartTitle', e.target.value)} />
      </div>
      <div className="row">
        <label htmlFor="mc-mode">呈現方式</label>
        <select id="mc-mode" value={s.metricsChartMode} onChange={(e) => set('metricsChartMode', e.target.value as StyleConfig['metricsChartMode'])}>
          <option value="table">表格</option>
          <option value="bar">長條圖</option>
        </select>
      </div>
      <div className="checkgrid">
        {METRIC_DEFS.map((d) => (
          <label className="check" key={d.key}>
            <input
              type="checkbox"
              checked={s.metricsChartColumns.includes(d.key)}
              onChange={(e) => toggleColumn(d.key, e.target.checked)}
            />
            {d.label}
          </label>
        ))}
      </div>
      <div className="row">
        <label htmlFor="mc-dec">小數位數</label>
        <NumberInput id="mc-dec" min={0} max={4} value={s.metricsChartDecimals} onCommit={(v) => set('metricsChartDecimals', v)} />
      </div>
      <div className="row">
        <label htmlFor="mc-fs">字級</label>
        <NumberInput id="mc-fs" min={10} max={40} value={s.metricsChartFontSize} onCommit={(v) => set('metricsChartFontSize', v)} />
      </div>
      <label className="check">
        <input type="checkbox" checked={s.metricsChartShowAverages} onChange={(e) => set('metricsChartShowAverages', e.target.checked)} />
        顯示 Macro / Weighted 平均
      </label>
      <p className="hint">
        指標以合併後的類別、one-vs-rest 計算。長條圖只畫比例類指標（Support 是計數，尺度不同故略過）。
      </p>
    </Section>
  )
}
