/** m 的列為 true label、欄為 predicted label */
export interface ClassMetrics {
  label: string
  tp: number
  fp: number
  fn: number
  tn: number
  /** 該類的真實樣本數（列總和） */
  support: number
  /** TPR = TP / (TP + FN)，即 recall */
  sensitivity: number
  /** TNR = TN / (TN + FP) */
  specificity: number
  /** PPV = TP / (TP + FP) */
  precision: number
  f1: number
}

export type AverageMetrics = Pick<
  ClassMetrics,
  'sensitivity' | 'specificity' | 'precision' | 'f1'
>

export interface Metrics {
  total: number
  accuracy: number
  /** 依顯示順序的每類指標（多類別以 one-vs-rest 展開） */
  perClass: ClassMetrics[]
  /** 各類等權平均 */
  macro: AverageMetrics
  /** 依 support 加權平均 */
  weighted: AverageMetrics
}

export function rowSums(m: number[][]): number[] {
  return m.map((r) => r.reduce((a, b) => a + b, 0))
}

export function colSums(m: number[][]): number[] {
  return m[0].map((_, j) => m.reduce((a, r) => a + r[j], 0))
}

const ratio = (num: number, den: number) => (den ? num / den : 0)

export function computeMetrics(m: number[][], labels: string[]): Metrics {
  const total = m.flat().reduce((a, b) => a + b, 0)
  const diag = m.reduce((a, r, i) => a + r[i], 0)
  const rs = rowSums(m)
  const cs = colSums(m)

  const perClass: ClassMetrics[] = labels.map((label, k) => {
    const tp = m[k][k]
    const fn = rs[k] - tp
    const fp = cs[k] - tp
    const tn = total - tp - fn - fp
    const sensitivity = ratio(tp, tp + fn)
    const precision = ratio(tp, tp + fp)
    return {
      label,
      tp,
      fp,
      fn,
      tn,
      support: rs[k],
      sensitivity,
      specificity: ratio(tn, tn + fp),
      precision,
      f1: ratio(2 * precision * sensitivity, precision + sensitivity),
    }
  })

  const keys: (keyof AverageMetrics)[] = ['sensitivity', 'specificity', 'precision', 'f1']
  const average = (weight: (c: ClassMetrics) => number): AverageMetrics => {
    const w = perClass.reduce((a, c) => a + weight(c), 0)
    return Object.fromEntries(
      keys.map((k) => [k, ratio(perClass.reduce((a, c) => a + c[k] * weight(c), 0), w)]),
    ) as AverageMetrics
  }

  return {
    total,
    accuracy: ratio(diag, total),
    perClass,
    macro: average(() => 1),
    weighted: average((c) => c.support),
  }
}
