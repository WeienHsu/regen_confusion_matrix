# Confusion Matrix Formatter

將既有的 confusion matrix（圖片或數值）重新轉換成你要的格式與樣式，並輸出高品質圖檔。

## 功能

- **資料輸入**：手動輸入、貼上 CSV / JSON、上傳 PNG 圖片（OCR 輔助辨識 + 手動修正）
- **排序與軸向**：自訂類別排序（支援多類別）、True / Predicted 軸互換
- **樣式**：標題、色階（Blues / Greens / Reds / Purples / Greys / 自訂單色）、字體、字級、數值顯示模式（數量 / 百分比 / 兩者）、百分比基準（列 / 欄 / 全體）、colorbar 與 metrics 摘要框開關、metrics 摘要框位置（圖內右下 / 圖表下方，避免遮擋格子）與字級
- **匯出**：PNG（1×/2×/4× 解析度）、SVG 向量圖、複製到剪貼簿、設定檔 JSON（可重新載入繼續編輯）

## 使用方式

### 線上使用（GitHub Pages）

部署於 GitHub Pages：<https://weienhsu.github.io/regen_confusion_matrix/>

### 本機使用

```bash
git clone https://github.com/WeienHsu/regen_confusion_matrix.git
cd regen_confusion_matrix
npm install
npm run dev
```

## 開發流程

- `main`：穩定分支，GitHub Pages 由此分支觸發部署
- `develop`：開發整合分支，功能完成並確認後發 PR 回 `main`

## 技術棧

React + Vite + TypeScript，SVG 渲染，Tesseract.js（瀏覽器端 OCR）。

OCR 的 worker / core / 英文語言資料全部由本站提供（`scripts/copy-tesseract-assets.mjs`
會在 dev / build 時從 node_modules 複製到 `public/tesseract/core/`；語言資料
`public/tesseract/lang/eng.traineddata.gz` 已進版控），不依賴外部 CDN。

## 設定檔格式

「存設定檔」會輸出包含數值、排序、軸向與所有樣式的 JSON（`version: 1`），
之後可用「載入設定檔」或直接貼到「貼上 CSV / JSON」分頁還原繼續編輯。
