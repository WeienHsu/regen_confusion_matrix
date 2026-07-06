// 把 Tesseract.js 的 worker 與 core 從 node_modules 複製到 public/，
// 讓 OCR 完全由本站提供、不依賴外部 CDN（離線 clone 下來也能用）。
// 語言資料（public/tesseract/lang/eng.traineddata.gz）已直接進版控。
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'tesseract', 'core')
mkdirSync(out, { recursive: true })

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  // 只需要 LSTM 推論用的 core（SIMD 與非 SIMD 兩種，由 worker 依環境挑選）
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
]

for (const [src, dest] of files) {
  cpSync(join(root, 'node_modules', src), join(out, dest))
}
console.log(`copied ${files.length} tesseract assets -> public/tesseract/core`)
