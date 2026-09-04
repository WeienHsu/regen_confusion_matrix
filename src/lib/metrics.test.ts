import { describe, it, expect } from 'vitest'
import { computeMetrics } from './metrics'

// 列 = true、欄 = predicted，故對 class_0 而言 TP=80 FN=20 FP=10 TN=90
const BINARY = [
  [80, 20],
  [10, 90],
]

describe('computeMetrics', () => {
  it('2×2 的 TP/FP/FN/TN 與五項指標', () => {
    const { accuracy, total, perClass } = computeMetrics(BINARY, ['pos', 'neg'])
    expect(total).toBe(200)
    expect(accuracy).toBeCloseTo(170 / 200)

    const pos = perClass[0]
    expect([pos.tp, pos.fn, pos.fp, pos.tn]).toEqual([80, 20, 10, 90])
    expect(pos.support).toBe(100)
    expect(pos.sensitivity).toBeCloseTo(0.8)
    expect(pos.specificity).toBeCloseTo(0.9)
    expect(pos.precision).toBeCloseTo(80 / 90)
    expect(pos.f1).toBeCloseTo((2 * (80 / 90) * 0.8) / (80 / 90 + 0.8))
  })

  it('多類別以 one-vs-rest 展開', () => {
    const m = [
      [5, 1, 0],
      [2, 4, 1],
      [0, 3, 6],
    ]
    const c1 = computeMetrics(m, ['a', 'b', 'c']).perClass[1]
    expect(c1.tp).toBe(4)
    expect(c1.fn).toBe(3) // 列 1 其餘：2 + 1
    expect(c1.fp).toBe(4) // 欄 1 其餘：1 + 3
    expect(c1.tn).toBe(22 - 4 - 3 - 4)
    expect(c1.sensitivity).toBeCloseTo(4 / 7)
    expect(c1.precision).toBeCloseTo(4 / 8)
  })

  it('完全對角時所有指標為 1', () => {
    const { accuracy, perClass, macro } = computeMetrics(
      [
        [7, 0],
        [0, 3],
      ],
      ['a', 'b'],
    )
    expect(accuracy).toBe(1)
    for (const c of perClass) {
      expect(c.sensitivity).toBe(1)
      expect(c.specificity).toBe(1)
      expect(c.precision).toBe(1)
      expect(c.f1).toBe(1)
    }
    expect(macro.f1).toBe(1)
  })

  it('類別平衡時 macro 與 weighted 相等', () => {
    const { macro, weighted } = computeMetrics(BINARY, ['pos', 'neg'])
    expect(macro.sensitivity).toBeCloseTo(0.85)
    expect(weighted.sensitivity).toBeCloseTo(macro.sensitivity)
    expect(weighted.f1).toBeCloseTo(macro.f1)
  })

  it('類別不平衡時 weighted 偏向 support 大的類別', () => {
    const m = [
      [90, 10], // support 100，sensitivity 0.9
      [5, 5], // support 10，sensitivity 0.5
    ]
    const { macro, weighted } = computeMetrics(m, ['a', 'b'])
    expect(macro.sensitivity).toBeCloseTo(0.7)
    expect(weighted.sensitivity).toBeCloseTo((0.9 * 100 + 0.5 * 10) / 110)
  })

  it('分母為 0 時回傳 0 而非 NaN', () => {
    const { accuracy, perClass, macro } = computeMetrics(
      [
        [0, 0],
        [0, 0],
      ],
      ['a', 'b'],
    )
    expect(accuracy).toBe(0)
    expect(perClass.every((c) => c.sensitivity === 0 && c.f1 === 0)).toBe(true)
    expect(macro.precision).toBe(0)
  })

  it('某類沒有任何樣本時不影響其他類', () => {
    const empty = computeMetrics(
      [
        [5, 0],
        [0, 0],
      ],
      ['a', 'b'],
    ).perClass[1]
    expect(empty.support).toBe(0)
    expect(empty.sensitivity).toBe(0)
    expect(empty.specificity).toBe(1)
  })
})
