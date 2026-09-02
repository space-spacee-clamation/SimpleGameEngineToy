import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base './' + hash 路由：构建产物可以直接双击 dist/index.html 打开
export default defineConfig({
  base: './',
  plugins: [vue()],
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 }
})
