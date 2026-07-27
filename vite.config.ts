import { defineConfig } from 'vite'
// @ts-ignore
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from './node_modules/@tailwindcss/vite/dist/index.mjs'


// https://vitejs.dev/config/
export default defineConfig({
  define: {
    '__APP_VERSION__': JSON.stringify(process.env.npm_package_version)
  },
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Swiper Element registers these web components at runtime. Without
          // this, Vue tries to resolve them as Vue components on every render.
          isCustomElement: (tag) => tag.startsWith('swiper-')
        }
      }
    }),
    tailwindcss(),
    visualizer() as any,
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'injectManifest',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        rollupFormat: 'iife',
        maximumFileSizeToCacheInBytes: 5097152
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
  assetsInclude: ['**/*.md', '**/*.lottie'],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  optimizeDeps: {
    exclude: [`@ionic/pwa-elements/loader`]
  }
})
