import { describe, it, expect } from 'vitest'
import { mergeCounts, groupLabel } from './merge'
import { singleGroups } from '../types'

const M = [
  [10, 2, 3],
  [4, 20, 6],
  [7, 8, 30],
]

describe('mergeCounts', () => {
  it('每組一個成員時等同原矩陣', () => {
    expect(mergeCounts(M, singleGroups(3))).toEqual(M)
  })

  it('每組一個成員時依群組順序重排', () => {
    const reversed = [
      { name: null, members: [2] },
      { name: null, members: [1] },
      { name: null, members: [0] },
    ]
    expect(mergeCounts(M, reversed)).toEqual([
      [30, 8, 7],
      [6, 20, 4],
      [3, 2, 10],
    ])
  })

  it('合併前兩類時做 block sum', () => {
    const groups = [
      { name: null, members: [0, 1] },
      { name: null, members: [2] },
    ]
    // [[10+2+4+20, 3+6], [7+8, 30]]
    expect(mergeCounts(M, groups)).toEqual([
      [36, 9],
      [15, 30],
    ])
  })

  it('合併不改變總數', () => {
    const groups = [
      { name: null, members: [0, 2] },
      { name: null, members: [1] },
    ]
    const sum = (g: number[][]) => g.flat().reduce((a, b) => a + b, 0)
    expect(sum(mergeCounts(M, groups))).toBe(sum(M))
  })

  it('全部併成一類時只剩總數', () => {
    expect(mergeCounts(M, [{ name: null, members: [0, 1, 2] }])).toEqual([[90]])
  })
})

describe('groupLabel', () => {
  const labels = ['a', 'b', 'c']

  it('未命名時以 + 串接成員名稱', () => {
    expect(groupLabel({ name: null, members: [0, 1] }, labels)).toBe('a+b')
  })

  it('自訂名稱優先', () => {
    expect(groupLabel({ name: 'ab', members: [0, 1] }, labels)).toBe('ab')
  })
})
