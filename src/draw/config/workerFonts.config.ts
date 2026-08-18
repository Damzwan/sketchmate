// workerFonts.config.ts
//
// The font faces the tile-bake worker registers into its own FontFaceSet.
//
// A worker has no CSS, so it never sees the `@font-face` rules in
// theme/fonts.css. That is why the bakery REFUSED any tile containing text: a
// worker bake would have measured and drawn with fallback metrics, and wrong
// glyphs baked into a committed tile are a correctness bug, not a perf trade.
//
// Chromium exposes `WorkerGlobalScope.fonts`, so the worker can register the
// same faces programmatically and render text correctly. This module is the
// single list both sides agree on — it must stay in sync with theme/fonts.css.
//
// `new URL(..., import.meta.url)` is resolved by Vite at build time into the
// hashed asset URL, and works inside a module worker, so the worker fetches the
// exact same file the page does (already warm in the HTTP cache).
//
// Weight matters: Cabin Sketch ships regular + bold as separate files, and
// registering only one would silently synthesise the other.

export interface WorkerFontSpec {
	family: string;
	weight: string;
	url: string;
}

export const WORKER_FONTS: WorkerFontSpec[] = [
	{
		family: "Amatic SC",
		weight: "400",
		url: new URL(
			"../../assets/fonts/amatic-sc-v28-latin-regular.woff2",
			import.meta.url,
		).href,
	},
	{
		family: "Anton",
		weight: "400",
		url: new URL(
			"../../assets/fonts/anton-v27-latin-regular.woff2",
			import.meta.url,
		).href,
	},
	{
		family: "Cabin Sketch",
		weight: "400",
		url: new URL(
			"../../assets/fonts/cabin-sketch-v23-latin-regular.woff2",
			import.meta.url,
		).href,
	},
	{
		family: "Cabin Sketch",
		weight: "700",
		url: new URL(
			"../../assets/fonts/cabin-sketch-v23-latin-700.woff2",
			import.meta.url,
		).href,
	},
	{
		family: "Chokokutai",
		weight: "400",
		url: new URL(
			"../../assets/fonts/chokokutai-v12-latin-regular.woff2",
			import.meta.url,
		).href,
	},
	{
		family: "Dancing Script",
		weight: "400",
		url: new URL(
			"../../assets/fonts/dancing-script-v29-latin-regular.woff2",
			import.meta.url,
		).href,
	},
	{
		family: "Indie Flower",
		weight: "400",
		url: new URL(
			"../../assets/fonts/indie-flower-v24-latin-regular.woff2",
			import.meta.url,
		).href,
	},
	{
		family: "Krub",
		weight: "400",
		url: new URL(
			"../../assets/fonts/krub-v11-latin-regular.woff2",
			import.meta.url,
		).href,
	},
	{
		family: "Rubik Puddles",
		weight: "400",
		url: new URL(
			"../../assets/fonts/rubik-puddles-v2-latin-regular.woff2",
			import.meta.url,
		).href,
	},
	{
		family: "Celtic MD",
		weight: "400",
		url: new URL("../../assets/fonts/celticmd.ttf", import.meta.url).href,
	},
];
