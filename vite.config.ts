import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Main bundle is large (charts, PDF, etc.); default 500 kB warning is noisy, not an error
    chunkSizeWarningLimit: 2600,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // lottie-web uses eval; known third-party limitation
        if (
          warning.message?.includes('Use of eval') &&
          warning.id?.includes('lottie')
        ) {
          return
        }
        defaultHandler(warning)
      },
    },
  },
  server: {
    proxy: {
      '/api/ollama': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
      },
    },
  },
})
