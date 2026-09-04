# 計劃：類別合併、Metrics 位置擴充、指標圖表

分支：`feature/class-merge-and-metrics`（自 `develop` 開出）

## 目標

1. 類別可指定合併（class_1 + class_2 併成一類），合併結果同步影響矩陣與指標
2. Metrics 摘要框位置擴充，且不遮擋矩陣格子
3. 計算 sensitivity / specificity / precision / F1 / accuracy，輸出**另一張**圖（表格或長條圖）
4. 介面順暢度優化（前三項完成後再處理）

## 設計決策

- **合併用群組表示，不動原始資料**：`MatrixConfig.order: number[]` 升級為
  `groups: ClassGroup[]`，`ClassGroup = { name: string | null; members: number[] }`。
  合併即 block sum：`merged[a][b] = Σ_{i∈g_a, j∈g_b} counts[i][j]`。原始 `counts`
  永遠保留，可隨時拆開。原本的排序是「每組一個成員」的特例，排序與合併統一成同一結構。
- **設定檔升到 `version: 2`**，`normalizeConfig` 保留讀取 v1（`order` → 單成員 groups、
  `metricsPosition: inside/outside` → `inside-br`/`below`）。
- **指標一律以合併後的矩陣計算**，多類別用 one-vs-rest 展開 TP/FP/FN/TN。
- **兩張圖分頁切換**，各自一個 SVG ref，匯出作用於當前分頁。非 active 的圖仍保持
  render（`display:none`），因為匯出是自行序列化 SVG、不依賴版面。

---

## 步驟

### 1. `src/types.ts`：資料模型升級

**做什麼**：新增 `ClassGroup`、`MetricKey`、`MetricsPosition`（6 個位置）、
指標圖樣式欄位（`metricsChartMode` / `metricsChartColumns` / `metricsChartDecimals` /
`metricsChartShowAverages` / `metricsChartFontSize` / `metricsChartTitle`）。
`order` 改為 `groups`，`normalizeConfig` 加入 v1 → v2 遷移，`resizeMatrix` 改產生 groups。

**如何驗證**：`npm run build` 型別檢查通過；用舊版匯出的設定檔（含 `order` 與
`metricsPosition: "inside"`）載入後矩陣、排序、metrics 位置都正確。

### 2. `src/lib/merge.ts`：合併運算（新檔）

**做什麼**：`mergeCounts(counts, groups)` 做 block sum；`groupLabel(group, labels)`
產生顯示名稱（自訂名稱優先，否則成員名以 `+` 串接）。

**如何驗證**：`src/lib/merge.test.ts` — 3×3 矩陣合併前兩類後，
總數守恆、對角線值等於手算的 block sum、單成員群組等同原矩陣。

### 3. `src/lib/metrics.ts`：指標計算擴充

**做什麼**：per-class one-vs-rest 算出 TP/FP/FN/TN、sensitivity(recall/TPR)、
specificity(TNR)、precision(PPV)、F1、support，加上整體 accuracy 與
macro / weighted 平均。分母為 0 時回傳 0。

**如何驗證**：`src/lib/metrics.test.ts` — 用已知的 2×2（TP/FP/FN/TN 直接可讀）
驗證五項指標；用完全對角的矩陣驗證所有指標為 1；驗證 macro 與 weighted
在類別平衡時相等。

### 4. `src/components/ClassOrder.tsx`：群組化 UI

**做什麼**：每個群組一列，顯示自動名稱（可覆寫）與成員 chips；
操作為 ↑↓ 排序、「＋ 併入下一組」合併相鄰群組、「拆開」還原成單成員群組。
群組數降到 1 時停用合併。

**如何驗證**：dev server 上把 3 類合併成 2 組，預覽的矩陣變 2×2 且數值等於
block sum；按「拆開」後回到 3×3 原值。

### 5. `src/components/MatrixPreview.tsx`：畫合併後矩陣 + 6 個 metrics 位置

**做什麼**：改用 `mergeCounts` 的結果與群組名稱；`metricsPosition` 支援
圖內四角與圖外（下方 / 右側），圖外位置實際擴充畫布（`pad.r` / `H`），確保不遮擋格子。

**如何驗證**：六個位置逐一切換，摘要框都完整落在畫布內且不覆蓋任何格子
（圖內四角為刻意覆蓋，但貼齊角落）；匯出 PNG 尺寸與預覽一致。

### 6. `src/components/MetricsChart.tsx`：第二張圖（新檔）

**做什麼**：獨立 SVG，兩種模式 —
- 表格：列＝類別，欄＝勾選的指標，底部加 Overall Accuracy 與 Macro / Weighted 平均列
- 長條圖：每類一組長條比較各指標（0–100%），含圖例；`support` 不適用比例軸故在長條模式忽略

**如何驗證**：與表格模式的數字互相對照一致；切換欄位勾選時版面寬度隨之調整不溢出。

### 7. `StylePanel` / `App` / `ExportBar` / `App.css`：介面接線

**做什麼**：樣式面板新增「指標圖」區塊（模式、欄位勾選、小數位數、平均列、字級、標題）；
App 預覽區加分頁與兩個 svgRef；ExportBar 依當前分頁決定匯出目標與檔名
（`confusion_matrix.*` / `metrics.*`）。

**如何驗證**：兩個分頁分別下載 PNG / SVG / 複製剪貼簿，檔名與內容都對應正確；
存設定檔再載入，兩張圖都還原。

### 8. 測試與文件

**做什麼**：`package.json` 加 `test` script（vitest，因專案為 vite 5 故釘 vitest 2.x）；
README 補充合併、metrics 位置、指標圖與 `npm test` 說明。

**如何驗證**：`npm test` 全綠、`npm run build` 通過。

---

## 尚未處理

第 4 項「介面順暢度優化」待前三項落地後另行討論（初步方向：左欄 section 過長，
考慮改可折疊或分頁；預覽區 sticky）。
