# 開發指引

## 開發流程(必須遵守)

1. 功能在 feature 分支上開發
2. 完成並驗證後,先 merge 進 `develop` 分支並推送
3. 從 `develop` 發 PR 到 `main`(非草稿),由使用者確認後合併
4. **不要**直接從 feature 分支發 PR 到 `main`,也不要直接推 `main`
5. `main` 合併後會自動觸發 GitHub Pages 部署(`.github/workflows/deploy.yml`)

## 驗證

- 提交前跑 `npx tsc --noEmit` 與 `npm run build`
- OCR 相關修改:`src/lib/ocrGrid.ts` / `src/lib/binarize.ts` 是不碰瀏覽器 API 的純邏輯,
  可在 Node 直接以 tesseract.js + pngjs 驗證,不必開瀏覽器

## 架構速記

- React + Vite + TypeScript,矩陣以 SVG 渲染(`MatrixPreview.tsx`)
- OCR:`ocr.ts`(Tesseract worker 協調)→ `preprocess.ts`(影像變體)→
  `ocrGrid.ts`(網格重建、類別名稱位置比對)
- Tesseract 資產全部本站提供(`scripts/copy-tesseract-assets.mjs`),不依賴外部 CDN
