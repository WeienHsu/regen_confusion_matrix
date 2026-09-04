# Confusion Matrix Formatter

將既有的 confusion matrix（圖片或數值）重新轉換成你要的格式與樣式，並輸出高品質圖檔。

## 功能

- **資料輸入**：手動輸入（含放大編輯視窗與 Enter/↑↓ 鍵盤跳格）、貼上 CSV / JSON、
  上傳 PNG 圖片（OCR 輔助辨識 + 手動修正；自動偵測類別數、自動辨識軸上的類別名稱、
  多種影像強化支援彩色數字、以格子內的百分比文字定位網格）
- **類別合併與排序**：自訂類別排序、把多個類別合併成一類（例如 `class_1+class_2`，
  數值以 block sum 相加、指標依合併後計算，原始資料保留可隨時拆開）、True / Predicted 軸互換
- **樣式**：標題、色階（Blues / Greens / Reds / Purples / Greys / 自訂單色）、字體、字級（標題 / 數值 / 標籤分開調整）、數值顯示模式（數量 / 百分比 / 兩者）、百分比基準（列 / 欄 / 全體）、colorbar 與 metrics 摘要框開關、metrics 摘要框位置（圖內四角 / 矩陣下方 / 矩陣右側，圖外位置會自動擴大畫布不遮擋格子）與字級
- **指標圖（第二張圖）**：sensitivity / specificity / precision / F1 / support 與整體
  accuracy、macro 與 weighted 平均，多類別以 one-vs-rest 計算；可切換表格或長條圖呈現，
  與混淆矩陣分開匯出
- **匯出**：PNG（1×/2×/4× 解析度）、SVG 向量圖、複製到剪貼簿、設定檔 JSON（可重新載入繼續編輯）。
  匯出作用於預覽區當前分頁（混淆矩陣 / 指標圖）

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

### 內網 / 自架部署（給區網其他機器使用）

本專案是純靜態網站（OCR 資產也全部內建），部署 = 伺服 `dist/` 資料夾，完全不需要對外網路。

**方式一：`npm run serve`（最簡單，內網小工具夠用）**

```bash
npm install
npm run serve
```

會先 build 再以 `vite preview` 綁定所有網卡，其他機器開
`http://<主機IP>:4173/regen_confusion_matrix/` 即可使用（注意子路徑）。
記得防火牆放行 4173 port。

要讓它常駐、開機自啟，搭配 pm2：

```bash
npm install -g pm2
pm2 start npm --name cm-formatter -- run serve
pm2 save
pm2 startup   # 依照畫面指示執行產生的指令，即可開機自啟
```

**方式二：nginx / 任何靜態伺服器（長期正式部署建議）**

想部署在網站根路徑時，先以 `--base=/` 重新 build：

```bash
npx vite build --base=/
```

再把 `dist/` 指給靜態伺服器，例如 nginx：

```nginx
server {
    listen 80;
    root /path/to/regen_confusion_matrix/dist;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

若要保留 `/regen_confusion_matrix/` 子路徑則不用改 base，直接：

```nginx
location /regen_confusion_matrix/ {
    alias /path/to/regen_confusion_matrix/dist/;
}
```

## 開發流程

- `main`：穩定分支，GitHub Pages 由此分支觸發部署
- `develop`：開發整合分支，功能完成並確認後發 PR 回 `main`

## 技術棧

React + Vite + TypeScript，SVG 渲染，Tesseract.js（瀏覽器端 OCR）。

OCR 的 worker / core / 英文語言資料全部由本站提供（`scripts/copy-tesseract-assets.mjs`
會在 dev / build 時從 node_modules 複製到 `public/tesseract/core/`；語言資料
`public/tesseract/lang/eng.traineddata.gz` 已進版控），不依賴外部 CDN。

## 測試

```bash
npm test
```

以 vitest 覆蓋純函數的正確性：類別合併的 block sum、one-vs-rest 指標計算、
以及設定檔的版本遷移。（專案使用 vite 5，故 vitest 釘在 2.x。）

## 設定檔格式

「存設定檔」會輸出包含數值、類別群組、軸向與所有樣式的 JSON（`version: 2`），
之後可用「載入設定檔」或直接貼到「貼上 CSV / JSON」分頁還原繼續編輯。

v1 設定檔仍可載入：`order` 會轉成未合併的類別群組，
`metricsPosition` 的 `inside` / `outside` 會對應到 `inside-br` / `below`。
