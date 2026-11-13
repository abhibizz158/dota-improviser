import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { catalog, itemInfo } from './src/main/data.ts'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'dota-catalog',
      resolveId(id) { return id === 'virtual:dota-catalog' || id === 'virtual:dota-items' ? '\0' + id : undefined },
      load(id) { return id === '\0virtual:dota-catalog' ? 'export default ' + JSON.stringify(catalog) : id === '\0virtual:dota-items' ? 'export default ' + JSON.stringify(itemInfo) : undefined },
    },
  ],
  build: {
    outDir: 'dist/ui',
    rollupOptions: {
      output: {
        // Vendor code (React, icons) changes far less often than app code, so splitting it into its own chunk
        // lets the browser/Electron cache reuse it across app updates instead of re-fetching everything together.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react')) return 'vendor-react'
            if (id.includes('lucide-react')) return 'vendor-icons'
            return 'vendor'
          }
        },
      },
    },
  },
})
