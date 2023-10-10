// vite.config.ts
import { defineConfig } from "file:///Users/dv/Projects/sketchmate_ionic/node_modules/.pnpm/vite@4.4.9_e3n6pnwg2k7txnqdohg4oknviu/node_modules/vite/dist/node/index.js";
import vue from "file:///Users/dv/Projects/sketchmate_ionic/node_modules/.pnpm/@vitejs+plugin-vue@4.3.3_vite@4.4.9+vue@3.3.4/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import path from "path";
import { visualizer } from "file:///Users/dv/Projects/sketchmate_ionic/node_modules/.pnpm/rollup-plugin-visualizer@5.9.2/node_modules/rollup-plugin-visualizer/dist/plugin/index.js";
import { VitePWA } from "file:///Users/dv/Projects/sketchmate_ionic/node_modules/.pnpm/vite-plugin-pwa@0.16.4_ljz65ozmbxarckyw56pyakpbme/node_modules/vite-plugin-pwa/dist/index.js";
var __vite_injected_original_dirname = "/Users/dv/Projects/sketchmate_ionic";
var vite_config_default = defineConfig({
  plugins: [
    vue(),
    visualizer({ gzipSize: true }),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      strategies: "injectManifest",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg}"],
        rollupFormat: "iife"
      },
      srcDir: "src",
      filename: "sw.js",
      devOptions: {
        enabled: true,
        type: "module"
      },
      workbox: {
        cleanupOutdatedCaches: true
      },
      manifest: {
        name: "SketchMate",
        short_name: "SketchMate",
        theme_color: "#FFAD83",
        background_color: "#FFD4B2",
        icons: [
          {
            src: "android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "android-chrome-512x512.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      }
    })
  ],
  assetsInclude: ["**/*.md"],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  optimizeDeps: {
    exclude: [`@ionic/pwa-elements/loader`]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvZHYvUHJvamVjdHMvc2tldGNobWF0ZV9pb25pY1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2R2L1Byb2plY3RzL3NrZXRjaG1hdGVfaW9uaWMvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL2R2L1Byb2plY3RzL3NrZXRjaG1hdGVfaW9uaWMvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHZ1ZSBmcm9tICdAdml0ZWpzL3BsdWdpbi12dWUnXG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJ1xuaW1wb3J0IHsgdmlzdWFsaXplciB9IGZyb20gJ3JvbGx1cC1wbHVnaW4tdmlzdWFsaXplcidcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tICd2aXRlLXBsdWdpbi1wd2EnXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIHZ1ZSgpLFxuICAgIHZpc3VhbGl6ZXIoeyBnemlwU2l6ZTogdHJ1ZSB9KSBhcyBhbnksXG4gICAgVml0ZVBXQSh7XG4gICAgICByZWdpc3RlclR5cGU6ICdhdXRvVXBkYXRlJyxcbiAgICAgIGluamVjdFJlZ2lzdGVyOiAnYXV0bycsXG4gICAgICBzdHJhdGVnaWVzOiAnaW5qZWN0TWFuaWZlc3QnLFxuICAgICAgaW5qZWN0TWFuaWZlc3Q6IHtcbiAgICAgICAgZ2xvYlBhdHRlcm5zOiBbJyoqLyoue2pzLGNzcyxodG1sLHN2Z30nXSxcbiAgICAgICAgcm9sbHVwRm9ybWF0OiAnaWlmZSdcbiAgICAgIH0sXG4gICAgICBzcmNEaXI6ICdzcmMnLFxuICAgICAgZmlsZW5hbWU6ICdzdy5qcycsXG4gICAgICBkZXZPcHRpb25zOiB7XG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgIHR5cGU6ICdtb2R1bGUnXG4gICAgICB9LFxuICAgICAgd29ya2JveDoge1xuICAgICAgICBjbGVhbnVwT3V0ZGF0ZWRDYWNoZXM6IHRydWVcbiAgICAgIH0sXG4gICAgICBtYW5pZmVzdDoge1xuICAgICAgICBuYW1lOiAnU2tldGNoTWF0ZScsXG4gICAgICAgIHNob3J0X25hbWU6ICdTa2V0Y2hNYXRlJyxcbiAgICAgICAgdGhlbWVfY29sb3I6ICcjRkZBRDgzJyxcbiAgICAgICAgYmFja2dyb3VuZF9jb2xvcjogJyNGRkQ0QjInLFxuICAgICAgICBpY29uczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIHNyYzogJ2FuZHJvaWQtY2hyb21lLTE5MngxOTIucG5nJyxcbiAgICAgICAgICAgIHNpemVzOiAnMTkyeDE5MicsXG4gICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJ1xuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgc3JjOiAnYW5kcm9pZC1jaHJvbWUtNTEyeDUxMi5wbmcnLFxuICAgICAgICAgICAgc2l6ZXM6ICc1MTJ4NTEyJyxcbiAgICAgICAgICAgIHR5cGU6ICdpbWFnZS9wbmcnXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9XG4gICAgfSlcbiAgXSxcbiAgYXNzZXRzSW5jbHVkZTogWycqKi8qLm1kJ10sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgJ0AnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMnKVxuICAgIH1cbiAgfSxcbiAgb3B0aW1pemVEZXBzOiB7XG4gICAgZXhjbHVkZTogW2BAaW9uaWMvcHdhLWVsZW1lbnRzL2xvYWRlcmBdXG4gIH1cbn0pXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTJSLFNBQVMsb0JBQW9CO0FBQ3hULE9BQU8sU0FBUztBQUNoQixPQUFPLFVBQVU7QUFDakIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBSnhCLElBQU0sbUNBQW1DO0FBTXpDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLElBQUk7QUFBQSxJQUNKLFdBQVcsRUFBRSxVQUFVLEtBQUssQ0FBQztBQUFBLElBQzdCLFFBQVE7QUFBQSxNQUNOLGNBQWM7QUFBQSxNQUNkLGdCQUFnQjtBQUFBLE1BQ2hCLFlBQVk7QUFBQSxNQUNaLGdCQUFnQjtBQUFBLFFBQ2QsY0FBYyxDQUFDLHdCQUF3QjtBQUFBLFFBQ3ZDLGNBQWM7QUFBQSxNQUNoQjtBQUFBLE1BQ0EsUUFBUTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsWUFBWTtBQUFBLFFBQ1YsU0FBUztBQUFBLFFBQ1QsTUFBTTtBQUFBLE1BQ1I7QUFBQSxNQUNBLFNBQVM7QUFBQSxRQUNQLHVCQUF1QjtBQUFBLE1BQ3pCO0FBQUEsTUFDQSxVQUFVO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWixhQUFhO0FBQUEsUUFDYixrQkFBa0I7QUFBQSxRQUNsQixPQUFPO0FBQUEsVUFDTDtBQUFBLFlBQ0UsS0FBSztBQUFBLFlBQ0wsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFVBQ1I7QUFBQSxVQUNBO0FBQUEsWUFDRSxLQUFLO0FBQUEsWUFDTCxPQUFPO0FBQUEsWUFDUCxNQUFNO0FBQUEsVUFDUjtBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0EsZUFBZSxDQUFDLFNBQVM7QUFBQSxFQUN6QixTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsSUFDdEM7QUFBQSxFQUNGO0FBQUEsRUFDQSxjQUFjO0FBQUEsSUFDWixTQUFTLENBQUMsNEJBQTRCO0FBQUEsRUFDeEM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
