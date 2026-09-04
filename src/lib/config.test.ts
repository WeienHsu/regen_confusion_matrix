import { describe, it, expect } from 'vitest'
import { isStoredConfig, normalizeConfig, defaultConfig } from '../types'

/** v1 匯出的設定檔：用 order，metricsPosition 只有 inside / outside */
const V1 = {
  version: 1,
  labels: ['a', 'b', 'c'],
  counts: [
    [5, 1, 0],
    [2, 4, 1],
    [0, 3, 6],
  ],
  order: [2, 0, 1],
  transpose: true,
  style: { title: '舊標題', metricsPosition: 'inside', metricsFontSize: 20 },
}

describe('normalizeConfig', () => {
  it('v1 的 order 轉成單成員 groups 並保留順序', () => {
    expect(normalizeConfig(V1).groups).toEqual([
      { name: null, members: [2] },
      { name: null, members: [0] },
      { name: null, members: [1] },
    ])
  })

  it('v1 的 metricsPosition 遷移到新的位置代號', () => {
    expect(normalizeConfig(V1).style.metricsPosition).toBe('inside-br')
    expect(normalizeConfig({ ...V1, style: { metricsPosition: 'outside' } }).style.metricsPosition).toBe('below')
  })

  it('保留 v1 已有的樣式，缺的欄位補預設值', () => {
    const style = normalizeConfig(V1).style
    expect(style.title).toBe('舊標題')
    expect(style.metricsFontSize).toBe(20)
    expect(style.metricsChartMode).toBe(defaultConfig().style.metricsChartMode)
  })

  it('版本一律升級為目前版本', () => {
    expect(normalizeConfig(V1).version).toBe(defaultConfig().version)
  })

  it('groups 沒有恰好用到每個類別一次時退回未合併狀態', () => {
    const broken = normalizeConfig({ ...V1, order: undefined, groups: [{ name: null, members: [0, 0] }] })
    expect(broken.groups).toEqual([
      { name: null, members: [0] },
      { name: null, members: [1] },
      { name: null, members: [2] },
    ])
  })

  it('合併過的 groups 原樣保留', () => {
    const groups = [
      { name: 'a+b', members: [0, 1] },
      { name: null, members: [2] },
    ]
    expect(normalizeConfig({ ...V1, version: 2, order: undefined, groups }).groups).toEqual(groups)
  })
})

describe('isStoredConfig', () => {
  it('接受 v1 與 v2', () => {
    expect(isStoredConfig(V1)).toBe(true)
    expect(isStoredConfig({ ...V1, version: 2 })).toBe(true)
  })

  it('拒絕非設定檔的 JSON', () => {
    expect(isStoredConfig([[1, 2], [3, 4]])).toBe(false)
    expect(isStoredConfig({ counts: [[1]] })).toBe(false)
    expect(isStoredConfig(null)).toBe(false)
  })
})
