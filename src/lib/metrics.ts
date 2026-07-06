/** m 的列為 true label、欄為 predicted label */
export interface Metrics {
  accuracy: number
  /** 依顯示順序的每類 precision / recall */
  perClass: { label: string; precision: number; recall: number }[]
}

export function rowSums(m: number[][]): number[] {
  return m.map((r) => r.reduce((a, b) => a + b, 0))
}

export function colSums(m: number[][]): number[] {
  return m[0].map((_, j) => m.reduce((a, r) => a + r[j], 0))
}

export function computeMetrics(m: number[][], labels: string[]): Metrics {
  const total = m.flat().reduce((a, b) => a + b, 0)
  const diag = m.reduce((a, r, i) => a + r[i], 0)
  const rs = rowSums(m)
  const cs = colSums(m)
  return {
    accuracy: total ? diag / total : 0,
    perClass: labels.map((label, k) => ({
      label,
      precision: cs[k] ? m[k][k] / cs[k] : 0,
      recall: rs[k] ? m[k][k] / rs[k] : 0,
    })),
  }
}
