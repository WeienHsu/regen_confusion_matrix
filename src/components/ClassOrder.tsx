import type { ClassGroup, MatrixConfig } from '../types'
import { groupLabel } from '../lib/merge'
import Section from './Section'

interface Props {
  cfg: MatrixConfig
  onChange: (cfg: MatrixConfig) => void
}

export default function ClassOrder({ cfg, onChange }: Props) {
  const groups = cfg.groups

  function setGroups(next: ClassGroup[]) {
    onChange({ ...cfg, groups: next })
  }

  function move(pos: number, dir: -1 | 1) {
    const next = [...groups]
    const target = pos + dir
    if (target < 0 || target >= next.length) return
    ;[next[pos], next[target]] = [next[target], next[pos]]
    setGroups(next)
  }

  /** 與下一組合併；名稱回到自動串接 */
  function mergeDown(pos: number) {
    const next = [...groups]
    next.splice(pos, 2, { name: null, members: [...next[pos].members, ...next[pos + 1].members] })
    setGroups(next)
  }

  /** 拆回單成員群組，位置維持原處 */
  function split(pos: number) {
    const next = [...groups]
    next.splice(pos, 1, ...groups[pos].members.map((i) => ({ name: null, members: [i] })))
    setGroups(next)
  }

  function rename(pos: number, name: string) {
    const next = [...groups]
    next[pos] = { ...next[pos], name: name.trim() === '' ? null : name }
    setGroups(next)
  }

  return (
    <Section title="2 · 類別合併與排序">
      <div className="classlist">
        {groups.map((g, pos) => {
          const auto = groupLabel({ ...g, name: null }, cfg.labels)
          const merged = g.members.length > 1
          return (
            <div className={`classitem ${merged ? 'merged' : ''}`} key={g.members.join('-')}>
              <span className="idx num">{pos + 1}</span>
              <input
                className="name"
                value={g.name ?? ''}
                placeholder={auto}
                aria-label={`${auto} 的顯示名稱`}
                title={merged ? `合併自 ${auto}（留空則自動命名）` : '顯示名稱（留空則用原名）'}
                onChange={(e) => rename(pos, e.target.value)}
              />
              <button className="mini" title="上移" aria-label={`將 ${auto} 上移`} disabled={pos === 0} onClick={() => move(pos, -1)}>
                ↑
              </button>
              <button
                className="mini"
                title="下移"
                aria-label={`將 ${auto} 下移`}
                disabled={pos === groups.length - 1}
                onClick={() => move(pos, 1)}
              >
                ↓
              </button>
              <button
                className="mini"
                title="與下一組合併"
                aria-label={`將 ${auto} 與下一組合併`}
                disabled={pos === groups.length - 1}
                onClick={() => mergeDown(pos)}
              >
                ＋
              </button>
              <button
                className="mini"
                title="拆開這個合併群組"
                aria-label={`拆開 ${auto}`}
                disabled={!merged}
                onClick={() => split(pos)}
              >
                ⤫
              </button>
            </div>
          )
        })}
      </div>
      <p className="hint">
        ＋ 會把該列與下一列合併成一類（數值以 block sum 相加，指標也依合併後計算）；
        ⤫ 拆回原本的類別。想合併不相鄰的類別，先用 ↑↓ 移到一起。
      </p>
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
