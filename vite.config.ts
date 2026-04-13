import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Split heavy deps so Rollup never builds one enormous vendor chunk (large single allocations / OOM in CI). */
function vendorManualChunk (id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined
  if (id.includes('recharts')) return 'vendor-recharts'
  if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf'
  if (id.includes('lottie') || id.includes('@lottiefiles')) return 'vendor-lottie'
  if (id.includes('@supabase')) return 'vendor-supabase'
  if (id.includes('date-fns')) return 'vendor-date-fns'
  if (id.includes('lucide-react')) return 'vendor-icons'
  if (id.includes('@fontsource')) return 'vendor-fonts'
  if (id.includes('radix-ui')) return 'vendor-radix'
  if (id.includes('react-router')) return 'vendor-router'
  if (id.includes('react-dom')) return 'vendor-react'
  if (id.includes('node_modules/react/')) return 'vendor-react'
  return undefined
}

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
    // CI hosts (e.g. Cloudflare Pages) often OOM during vite build; these reduce peak RSS:
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: {
      // Default 20 parallel file ops can spike memory on small build VMs
      maxParallelFileOps: 1,
      output: {
        manualChunks: vendorManualChunk,
      },
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
