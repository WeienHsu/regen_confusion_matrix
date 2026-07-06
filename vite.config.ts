import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 部署於 https://<user>.github.io/regen_confusion_matrix/
export default defineConfig({
  plugins: [react()],
  base: '/regen_confusion_matrix/',
})
