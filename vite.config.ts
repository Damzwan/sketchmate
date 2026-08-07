import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
// @ts-expect-error — plain .mjs build script, no type declarations
import { ionicTrimAliases } from "./scripts/vite-ionic-trim.mjs";

// Stubs out every @ionic/core component the app never renders. See the plugin
// for why this is needed and how the dev-time guard works.
const ionicAliases = ionicTrimAliases(import.meta.dirname);

// https://vitejs.dev/config/
export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(process.env.npm_package_version),
	},
	plugins: [
		vue({
			template: {
				compilerOptions: {
					isCustomElement: (tag) => tag.startsWith("swiper-"),
				},
			},
		}),
		tailwindcss(),
		process.env.ANALYZE ? (visualizer() as any) : null,
		VitePWA({
			registerType: "autoUpdate",
			injectRegister: "auto",
			strategies: "injectManifest",
			injectManifest: {
				globPatterns: ["**/*.{js,css,html,svg}"],
				rollupFormat: "iife",
				maximumFileSizeToCacheInBytes: 5097152,
			},
			srcDir: "src",
			filename: "sw.js",
			devOptions: {
				enabled: false,
				type: "module",
			},
			workbox: {
				cleanupOutdatedCaches: true,
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
						type: "image/png",
					},
					{
						src: "android-chrome-512x512.png",
						sizes: "512x512",
						type: "image/png",
					},
				],
			},
		}),
	],
	assetsInclude: ["**/*.md", "**/*.lottie"],
	resolve: {
		// Switched to array syntax for exact alias matching
		alias: [
			{ find: "@", replacement: path.resolve(import.meta.dirname, "./src") },
			...ionicAliases,
		],
	},
	optimizeDeps: {
		exclude: [`@ionic/pwa-elements/loader`],
	},
	build: {
		target: ["es2022", "chrome100", "safari15"],
		sourcemap: process.env.VITE_DRAW_TESTING === "si",
	},
});
