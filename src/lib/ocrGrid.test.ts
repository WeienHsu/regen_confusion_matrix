import { describe, expect, it } from 'vitest'
import {
  anchorGrid,
  clusterToGrid,
  extractTokens,
  labelHitsFromGeometry,
  matchLabels,
  pickByVote,
  recognizeFromWords,
} from './ocrGrid'
import type { Anchor, GridGeometry, Token, Word } from './ocrGrid'

/** 以中心點座標建 word，寬高預設為一般數字大小 */
function word(text: string, cx: number, cy: number, w = 30, h = 20): Word {
  return { text, bbox: { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 } }
}

function token(value: number, cx: number, cy: number, h = 20): Token {
  return { value, cx, cy, h }
}

function anchor(pct: number, cx: number, cy: number, h = 14): Anchor {
  return { cx, cy, h, pct }
}

/** 建一個 k×k 的乾淨網格 token（左上角 cx0/cy0、間距 pitch） */
function gridTokens(values: number[][], cx0 = 100, cy0 = 100, pitch = 80): Token[] {
  return values.flatMap((row, i) => row.map((v, j) => token(v, cx0 + j * pitch, cy0 + i * pitch)))
}

describe('extractTokens', () => {
  it('抽出整數與千分位整數', () => {
    const { tokens } = extractTokens([word('42', 10, 10), word('1,234', 60, 10)])
    expect(tokens.map((t) => t.value)).toEqual([42, 1234])
  })

  it('把括號百分比當錨點（含 <、逗號小數與 % 符號）', () => {
    const { tokens, anchors } = extractTokens([
      word('(95.2)', 10, 10),
      word('(0.0)', 60, 10),
      word('(<0.1)', 110, 10),
      word('(4,5%)', 160, 10),
    ])
    expect(tokens).toHaveLength(0)
    expect(anchors.map((a) => a.pct)).toEqual([95.2, 0, 0.1, 4.5])
  })

  it('收集標籤候選字，排除保留字與小數', () => {
    const { tokens, labelCandidates } = extractTokens([
      word('cat', 10, 10),
      word('non_nsvt', 60, 10),
      word('Predicted', 110, 10),
      word('0.95', 160, 10),
    ])
    expect(tokens).toHaveLength(0)
    expect(labelCandidates.map((c) => c.text)).toEqual(['cat', 'non_nsvt'])
  })

  it('接受單字母類別（排除 I 與 O）', () => {
    const { labelCandidates } = extractTokens([
      word('N', 10, 10),
      word('I', 40, 10),
      word('O', 70, 10),
      word('V', 100, 10),
    ])
    expect(labelCandidates.map((c) => c.text)).toEqual(['N', 'V'])
  })
})

describe('anchorGrid', () => {
  it('用完整的 2×2 錨點網格取出正上方數值', () => {
    const anchors = [
      anchor(90, 100, 100), anchor(10, 200, 100),
      anchor(5, 100, 200), anchor(95, 200, 200),
    ]
    const tokens = [
      token(90, 100, 70), token(10, 200, 70),
      token(5, 100, 170), token(95, 200, 170),
    ]
    const res = anchorGrid(anchors, tokens)
    expect(res).not.toBeNull()
    expect(res!.grid).toEqual([[90, 10], [5, 95]])
    expect(res!.reviewCount).toBe(0)
  })

  it('漏讀的格子補 0：pct=0 不需核對、pct>0 列入 reviewCount', () => {
    const anchors = [
      anchor(90, 100, 100), anchor(10, 200, 100),
      anchor(0, 100, 200), anchor(95, 200, 200),
    ]
    const tokens = [
      token(90, 100, 70), token(10, 200, 70),
      // (0,0) 與 (1,1) 的數值都沒讀到
    ]
    const res = anchorGrid(anchors, tokens)
    expect(res!.grid).toEqual([[90, 10], [0, 0]])
    expect(res!.reviewCount).toBe(1)
  })

  it('錨點不足 4 個回傳 null', () => {
    expect(anchorGrid([anchor(50, 100, 100), anchor(50, 200, 100)], [])).toBeNull()
  })

  it('錨點列數與每列個數不一致回傳 null', () => {
    const anchors = [
      anchor(1, 100, 100), anchor(2, 200, 100), anchor(3, 300, 100),
      anchor(4, 100, 200), anchor(5, 200, 200),
    ]
    expect(anchorGrid(anchors, [])).toBeNull()
  })
})

describe('clusterToGrid', () => {
  it('把乾淨的 3×3 token 聚成網格並回報幾何', () => {
    const values = [
      [50, 2, 3],
      [4, 60, 6],
      [7, 8, 70],
    ]
    const res = clusterToGrid(gridTokens(values), 3)
    expect(res).not.toBeNull()
    expect(res!.grid).toEqual(values)
    expect(res!.geometry.colCenters).toEqual([100, 180, 260])
    expect(res!.geometry.rowCenters).toEqual([100, 180, 260])
    expect(res!.geometry.pitchX).toBe(80)
    expect(res!.geometry.pitchY).toBe(80)
  })

  it('支援千分位後的大數值 2×2', () => {
    const values = [
      [5600, 600],
      [500, 3300],
    ]
    expect(clusterToGrid(gridTokens(values, 150, 100, 120), 2)!.grid).toEqual(values)
  })

  it('欄沒有上下對齊的假網格被拒絕', () => {
    const tokens = [
      token(1, 100, 100), token(2, 200, 100),
      token(3, 180, 200), token(4, 300, 200), // 第二列 x 錯位
    ]
    expect(clusterToGrid(tokens, 2)).toBeNull()
  })

  it('token 少於 4 個回傳 null', () => {
    expect(clusterToGrid([token(1, 0, 0), token(2, 50, 0)], 2)).toBeNull()
  })
})

describe('labelHitsFromGeometry / pickByVote', () => {
  const geom: GridGeometry = {
    colCenters: [100, 200],
    rowCenters: [100, 200],
    pitchX: 100,
    pitchY: 100,
  }

  it('左側候選字對齊列中心、下方候選字對齊欄中心', () => {
    const hits = labelHitsFromGeometry(
      [
        { text: 'cat', cx: 30, cy: 100 },
        { text: 'dog', cx: 30, cy: 200 },
        { text: 'cat', cx: 100, cy: 280 },
        { text: 'dog', cx: 200, cy: 280 },
      ],
      geom,
    )
    expect(hits).toEqual([
      ['cat', 'cat'],
      ['dog', 'dog'],
    ])
  })

  it('網格內部與遠處的字不會被當成標籤', () => {
    const hits = labelHitsFromGeometry(
      [
        { text: 'inside', cx: 150, cy: 100 },
        { text: 'faraway', cx: 30, cy: 500 },
      ],
      geom,
    )
    expect(hits).toEqual([[], []])
  })

  it('pickByVote 合併近似重複並取票數最多者', () => {
    expect(pickByVote(['non_nsv', 'non_nsvt', 'xx'])).toBe('non_nsvt')
    expect(pickByVote([])).toBeNull()
  })
})

describe('matchLabels', () => {
  it('出現兩次（x/y 軸各一）的標籤剛好 n 個才採用', () => {
    expect(matchLabels(['cat', 'dog', 'cat', 'dog'], 2)).toEqual(['cat', 'dog'])
    expect(matchLabels(['cat', 'dog', 'cat'], 2)).toBeNull()
    expect(matchLabels(['cat', 'cat'], 2)).toBeNull()
  })

  it('合併截尾的近似重複（OCR 常讀掉字尾）', () => {
    expect(matchLabels(['non_nsvt', 'non_nsv', 'nsvt', 'nsvt'], 2)).toEqual(['non_nsvt', 'nsvt'])
  })
})

describe('recognizeFromWords', () => {
  const cleanGridWords = (values: number[][], cx0 = 100, cy0 = 100, pitch = 80): Word[] =>
    values.flatMap((row, i) => row.map((v, j) => word(String(v), cx0 + j * pitch, cy0 + i * pitch)))

  it('第一個變體成功就提前返回，不再嘗試後續變體', async () => {
    const values = [
      [9, 1],
      [2, 8],
    ]
    const calls: number[] = []
    const res = await recognizeFromWords(
      async (i) => {
        calls.push(i)
        return cleanGridWords(values)
      },
      3,
      2,
    )
    expect(res.grid).toEqual(values)
    expect(res.needsReview).toBe(false)
    expect(calls).toEqual([0])
  })

  it('依網格幾何比對左側與下方的類別名稱', async () => {
    const values = [
      [9, 1],
      [2, 8],
    ]
    const words = [
      ...cleanGridWords(values),
      word('cat', 30, 100), word('dog', 30, 180),
      word('cat', 100, 250), word('dog', 180, 250),
    ]
    const res = await recognizeFromWords(async () => words, 1, 2)
    expect(res.grid).toEqual(values)
    expect(res.labels).toEqual(['cat', 'dog'])
  })

  it('錨點完整但部分數值漏讀 → 保留最佳結果並要求核對', async () => {
    const words = [
      word('90', 100, 70), word('10', 200, 70),
      word('(90.0)', 100, 100), word('(10.0)', 200, 100),
      word('(5.0)', 100, 200), word('(95.0)', 200, 200),
    ]
    const res = await recognizeFromWords(async () => words, 1, 2)
    expect(res.grid).toEqual([[90, 10], [0, 0]])
    expect(res.needsReview).toBe(true)
  })

  it('圖上有大量百分比錨點卻拼不出錨點網格時，不信任整數聚類結果', async () => {
    // 錨點 5 個（湊不成方陣），整數剛好能聚成 2×2 —— 這是漏字嚴重的訊號
    const words = [
      word('9', 100, 100), word('1', 200, 100),
      word('2', 100, 200), word('8', 200, 200),
      word('(1.0)', 400, 100), word('(2.0)', 500, 100), word('(3.0)', 600, 100),
      word('(4.0)', 400, 200), word('(5.0)', 500, 200),
    ]
    const res = await recognizeFromWords(async () => words, 1, 2)
    expect(res.grid).toEqual([[9, 1], [2, 8]])
    expect(res.needsReview).toBe(true)
  })

  it('完全拼不出網格時回傳讀到的數字與頻率比對的標籤', async () => {
    const words = [
      word('7', 100, 100), word('3', 300, 400),
      word('cat', 30, 100), word('dog', 30, 180),
      word('cat', 100, 250), word('dog', 180, 250),
    ]
    const res = await recognizeFromWords(async () => words, 1, 2)
    expect(res.grid).toBeNull()
    expect(res.needsReview).toBe(true)
    expect(res.numbers).toEqual([7, 3])
    expect(res.labels).toEqual(['cat', 'dog'])
  })
})
