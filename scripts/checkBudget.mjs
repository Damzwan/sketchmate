#!/usr/bin/env node
// Cold-start payload budget.
//
// Measures what a first-time visitor must fetch, parse and evaluate before the
// app can render: the entry script plus every <link rel="modulepreload"> the
// build emits into index.html. Bundle bytes are not RAM, but on a low-end
// Android WebView parsed code is the dominant startup cost, and this is the one
// number that goes up silently.
//
// Budgets ratchet DOWN only. Lower them as work lands; never raise them to make
// a red build green.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const BUDGETS = {
	// Baseline measured 2026-08-07 at 1,503,199 raw / ~350 kB gzip.
	// Ratcheted 2026-08-07 after P2.1 (Ionic trim) + P2.2 (main.ts split):
	// 1,125.3 kB raw / 297.2 kB gzip, largest chunk 766.8 kB.
	eagerRawBytes: 1_180_000,
	eagerGzipBytes: 310_000,
	// Largest single emitted chunk. Today this is the Ionic component bundle.
	singleChunkRawBytes: 800_000,
};

const indexPath = join(dist, "index.html");
if (!existsSync(indexPath)) {
	console.error("[budget] dist/index.html not found — run `vite build` first.");
	process.exit(1);
}

const html = readFileSync(indexPath, "utf8");

// Entry <script src> plus every modulepreload target.
const refs = new Set();
for (const m of html.matchAll(/<script[^>]+src="\/([^"]+\.js)"/g))
	refs.add(m[1]);
for (const m of html.matchAll(
	/<link[^>]+rel="modulepreload"[^>]+href="\/([^"]+\.js)"/g,
))
	refs.add(m[1]);

if (refs.size === 0) {
	console.error("[budget] parsed no entry/preload scripts from index.html.");
	process.exit(1);
}

let eagerRaw = 0;
let eagerGzip = 0;
const rows = [];
for (const ref of [...refs].sort()) {
	const file = join(dist, ref);
	if (!existsSync(file)) continue;
	const buf = readFileSync(file);
	const gzip = gzipSync(buf).length;
	eagerRaw += buf.length;
	eagerGzip += gzip;
	rows.push({ ref, raw: buf.length, gzip });
}

rows.sort((a, b) => b.raw - a.raw);

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

console.log(`\n[budget] ${rows.length} eager scripts\n`);
for (const r of rows.slice(0, 8)) {
	console.log(
		`  ${kb(r.raw).padStart(10)}  ${kb(r.gzip).padStart(9)} gz  ${r.ref}`,
	);
}
if (rows.length > 8) console.log(`  … ${rows.length - 8} more`);

// Largest single chunk anywhere in the build.
let biggest = { name: "", size: 0 };
const assetsDir = join(dist, "assets");
if (existsSync(assetsDir)) {
	const { readdirSync } = await import("node:fs");
	for (const name of readdirSync(assetsDir)) {
		if (!name.endsWith(".js")) continue;
		const size = statSync(join(assetsDir, name)).size;
		if (size > biggest.size) biggest = { name, size };
	}
}

const checks = [
	["eager raw", eagerRaw, BUDGETS.eagerRawBytes],
	["eager gzip", eagerGzip, BUDGETS.eagerGzipBytes],
	[
		`largest chunk (${biggest.name})`,
		biggest.size,
		BUDGETS.singleChunkRawBytes,
	],
];

console.log("");
let failed = false;
for (const [label, actual, budget] of checks) {
	const ok = actual <= budget;
	if (!ok) failed = true;
	console.log(
		`  ${ok ? "PASS" : "FAIL"}  ${label}: ${kb(actual)} / ${kb(budget)}`,
	);
}

if (failed) {
	console.error(
		"\n[budget] cold-start payload exceeded its budget.\n" +
			"Reduce the payload. Do not raise the budget to make this pass.\n",
	);
	process.exit(1);
}
console.log("\n[budget] within budget.\n");
