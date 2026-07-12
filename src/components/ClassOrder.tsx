import type { MatrixConfig } from '../types'
import Section from './Section'

interface Props {
  cfg: MatrixConfig
  onChange: (cfg: MatrixConfig) => void
}

export default function ClassOrder({ cfg, onChange }: Props) {
  function move(pos: number, dir: -1 | 1) {
    const order = [...cfg.order]
    const target = pos + dir
    if (target < 0 || target >= order.length) return
    ;[order[pos], order[target]] = [order[target], order[pos]]
    onChange({ ...cfg, order })
  }

  return (
    <Section title="2 · 排序與軸向">
      <div className="classlist">
        {cfg.order.map((labelIdx, pos) => (
          <div className="classitem" key={labelIdx}>
            <span className="idx num">{pos + 1}</span>
            <span className="name">{cfg.labels[labelIdx]}</span>
            <button className="mini" title="上移" aria-label={`將 ${cfg.labels[labelIdx]} 上移`} disabled={pos === 0} onClick={() => move(pos, -1)}>
              ↑
            </button>
            <button
              className="mini"
              title="下移"
              aria-label={`將 ${cfg.labels[labelIdx]} 下移`}
              disabled={pos === cfg.order.length - 1}
              onClick={() => move(pos, 1)}
            >
              ↓
            </button>
          </div>
        ))}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={cfg.transpose}
          onChange={(e) => onChange({ ...cfg, transpose: e.target.checked })}
        />
        交換 True / Predicted 軸
      </label>
    </Section>
  )
}
