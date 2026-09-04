import type { ClassGroup } from '../types'

/**
 * 依群組把 confusion matrix 的列 / 欄 block 相加：
 * merged[a][b] = Σ_{i∈groups[a], j∈groups[b]} counts[i][j]
 * 未合併（每組一個成員）時等同於單純重新排序。
 */
export function mergeCounts(counts: number[][], groups: ClassGroup[]): number[][] {
  return groups.map((ga) =>
    groups.map((gb) =>
      ga.members.reduce(
        (sum, i) => sum + gb.members.reduce((s, j) => s + (counts[i]?.[j] ?? 0), 0),
        0,
      ),
    ),
  )
}

/** 群組顯示名稱：自訂名稱優先，否則以 + 串接成員名稱 */
export function groupLabel(group: ClassGroup, labels: string[]): string {
  return group.name ?? group.members.map((i) => labels[i] ?? `class_${i + 1}`).join('+')
}
