import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'
import { VitePWA } from 'vite-plugin-pwa'
// https://vitejs.dev/config/
export default defineConfig({
  define: {
    '__APP_VERSION__': JSON.stringify(process.env.npm_package_version)
  },
  plugins: [
    vue(),
    visualizer({ gzipSize: true }) as any,
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'injectManifest',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        rollupFormat: 'iife'
      },
      srcDir: 'src',
      filename: 'sw.js',
      devOptions: {
        enabled: true,
        type: 'module'
      },
      workbox: {
        cleanupOutdatedCaches: true
      },
      manifest: {
        name: 'SketchMate',
        short_name: 'SketchMate',
        theme_color: '#FFAD83',
        background_color: '#FFD4B2',
        icons: [
          {
            src: 'android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  assetsInclude: ['**/*.md'],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  optimizeDeps: {
    exclude: [`@ionic/pwa-elements/loader`]
  }
})
