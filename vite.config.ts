import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const mcapWasmDataUrlPrefix = '\0mcap-wasm-data-url:'
const mcapWasmImporterPattern = /[/\\]@foxglove[/\\]wasm-(?:bz2|lz4|zstd)[/\\]/

function mcapWasmDataUrlPlugin(): Plugin {
  return {
    name: 'mcap-wasm-data-url',
    enforce: 'pre',
    resolveId(source, importer) {
      if (
        !importer
        || !source.endsWith('.wasm')
        || !mcapWasmImporterPattern.test(importer)
      ) {
        return null
      }

      const filePath = path.resolve(path.dirname(importer), source)
      return `${mcapWasmDataUrlPrefix}${filePath}`
    },
    load(id) {
      if (!id.startsWith(mcapWasmDataUrlPrefix)) {
        return null
      }

      const filePath = id.slice(mcapWasmDataUrlPrefix.length)
      const wasm = readFileSync(filePath, 'base64')
      return `module.exports = ${JSON.stringify(`data:application/wasm;base64,${wasm}`)};`
    },
  }
}

export default defineConfig({
  assetsInclude: ['**/*.wasm'],
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  // @mcap/support loads Emscripten modules whose CommonJS glue calls require()
  // for WASM files. Keep Vite's dependency optimizer from wrapping those files
  // as JavaScript modules.
  optimizeDeps: {
    // MapLibre loads its worker as a sibling ESM asset. Let Vite preserve that
    // package boundary instead of generating a fragile optimized worker path.
    exclude: ['maplibre-gl'],
    entries: [
      'index.html',
      'src/core/workers/mcap.worker.ts',
    ],
    rolldownOptions: {
      plugins: [mcapWasmDataUrlPlugin()],
    },
  },
  worker: {
    format: 'es',
    plugins: () => [mcapWasmDataUrlPlugin()],
  },
})
