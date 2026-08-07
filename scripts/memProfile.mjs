#!/usr/bin/env node
// Android memory sampler.
//
// Samples `dumpsys meminfo` for the app while you run a scripted scenario by
// hand, then reports whether memory came back down. This is the only number
// that matters for the "app dies after twenty minutes on a cheap phone" class
// of bug: JS heap alone misses decoded bitmaps, canvas backing stores,
// ImageBitmaps, worker heaps and GPU textures, which is where a WebView
// actually runs out.
//
//   node scripts/memProfile.mjs --label "home-gallery-draw-loop"
//   node scripts/memProfile.mjs --interval 3 --duration 600
//
// No low-end phone? Use an emulator with a constrained RAM/heap profile — it
// reproduces the memory ceiling even though it does not reproduce CPU or GPU
// behaviour:
//
//   $ANDROID_HOME/tools/bin/avdmanager create avd -n lowend \
//       -k "system-images;android-34;google_apis;arm64-v8a" -d "Nexus 5"
//   # then in ~/.android/avd/lowend.avd/config.ini:
//   #   hw.ramSize=2048
//   #   vm.heapSize=192
//   emulator -avd lowend -memory 2048
//
// Trim-memory behaviour (STAB-16) can be exercised on the same emulator:
//   adb shell am send-trim-memory ninja.sketchmate.app RUNNING_CRITICAL

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const PACKAGE = "ninja.sketchmate.app";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};

const intervalSec = Number(arg("interval", 5));
const durationSec = Number(arg("duration", 300));
const label = arg("label", "session");
const outDir = "bench/memory";

const adb = (...a) => spawnSync("adb", a, { encoding: "utf8" });

const devices = adb("devices").stdout || "";
const attached = devices
	.split("\n")
	.slice(1)
	.filter((l) => l.trim().endsWith("device"));
if (attached.length === 0) {
	console.error(
		"[mem] no device or emulator attached.\n" +
			"Start one (`emulator -avd <name>`) or connect a phone with USB debugging on.\n" +
			'If adb is not on PATH: export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"',
	);
	process.exit(1);
}

/** Parse the TOTAL PSS / heap lines out of `dumpsys meminfo`. */
function sample() {
	const out = adb("shell", "dumpsys", "meminfo", PACKAGE).stdout || "";
	if (out.includes("No process found")) return null;
	const num = (re) => {
		const m = out.match(re);
		return m ? Number(m[1]) : null;
	};
	return {
		t: Date.now(),
		totalPss: num(/TOTAL PSS:\s+(\d+)/) ?? num(/TOTAL\s+(\d+)/),
		nativeHeap: num(/Native Heap\s+(\d+)/),
		dalvikHeap: num(/Dalvik Heap\s+(\d+)/),
		graphics: num(/Graphics\s+(\d+)/),
		eglMtrack: num(/EGL mtrack\s+(\d+)/),
	};
}

const first = sample();
if (!first) {
	console.error(
		`[mem] ${PACKAGE} is not running. Launch the app, then re-run this.`,
	);
	process.exit(1);
}

const mb = (kb) => (kb == null ? "   —  " : (kb / 1024).toFixed(1).padStart(7));

console.log(`
[mem] sampling ${PACKAGE} every ${intervalSec}s for ${durationSec}s
[mem] run your scenario now, e.g. 10x:  Home -> Gallery (scroll) -> Draw (add
      content) -> Home -> Chat -> Profile.  Ctrl-C to stop early.

        t     TOTAL     Native    Dalvik   Graphics
`);

const samples = [];
let stop = false;
process.on("SIGINT", () => {
	stop = true;
});

const started = Date.now();
while (!stop && (Date.now() - started) / 1000 < durationSec) {
	const s = sample();
	if (s) {
		samples.push(s);
		const secs = ((s.t - started) / 1000).toFixed(0).padStart(5);
		console.log(
			`  ${secs}s ${mb(s.totalPss)} MB ${mb(s.nativeHeap)} MB ${mb(s.dalvikHeap)} MB ${mb(s.graphics)} MB`,
		);
	} else {
		console.log("  (process gone — was it killed?)");
	}
	await new Promise((r) => setTimeout(r, intervalSec * 1000));
}

if (samples.length < 2) {
	console.error("[mem] not enough samples.");
	process.exit(1);
}

const pss = samples.map((s) => s.totalPss).filter((v) => v != null);
const start = pss[0];
const end = pss[pss.length - 1];
const peak = Math.max(...pss);

// Least-squares slope over the series: the question is not "did it spike" but
// "did each cycle leave more behind than the last".
const n = pss.length;
const meanX = (n - 1) / 2;
const meanY = pss.reduce((a, b) => a + b, 0) / n;
let num = 0;
let den = 0;
for (let i = 0; i < n; i++) {
	num += (i - meanX) * (pss[i] - meanY);
	den += (i - meanX) ** 2;
}
const slopeKbPerSample = den === 0 ? 0 : num / den;
const driftMbPerMin = (slopeKbPerSample / 1024) * (60 / intervalSec);

console.log(`
[mem] samples ${n}
      start   ${(start / 1024).toFixed(1)} MB
      end     ${(end / 1024).toFixed(1)} MB
      peak    ${(peak / 1024).toFixed(1)} MB
      retained ${((end - start) / 1024).toFixed(1)} MB
      drift    ${driftMbPerMin.toFixed(2)} MB/min

[mem] Interpretation: a healthy loop returns near its start after the last
      cycle. Sustained positive drift across repeats of the SAME scenario is
      the signal — a single peak is not.
`);

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const file = `${outDir}/${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(
	file,
	JSON.stringify(
		{
			package: PACKAGE,
			label,
			intervalSec,
			samples,
			start,
			end,
			peak,
			driftMbPerMin,
		},
		null,
		2,
	),
);
console.log(`[mem] wrote ${file}\n`);
