import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: 'src/devtools/devtools.html', dest: '.' },
        { src: 'src/panel/panel.html', dest: '.' },
      ]
    })
  ],
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        panel: resolve(__dirname, 'src/panel/panel.html'),
        devtools: resolve(__dirname, 'src/devtools/devtools.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
})