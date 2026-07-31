<template>
	<aside class="perf-panel" :class="{ compact: running }">
		<header class="perf-header">
			<div>
				<p class="perf-eyebrow">Draw engine bench</p>
				<h2>{{ running ? "Recording…" : report ? report.name : "Ready" }}</h2>
			</div>
			<span v-if="running" class="perf-timer">{{ elapsedSeconds }}s</span>
			<button
				v-else
				class="perf-close"
				aria-label="Close performance capture"
				@click="emit('close')"
			>
				×
			</button>
		</header>

		<p v-if="!running && !report" class="perf-intro">
			Start recording, use the drawing normally, then stop. Pan, zoom, draw,
			erase, and undo the behavior you want to investigate.
		</p>

		<div v-if="automationEnabled" class="automation">
			<strong>Automated stress run</strong>
			<p>
				Erases and restores the loaded drawing, then runs 80 deeper erases
				with zoom and undo/redo against a temporary fixture.
			</p>
			<button :disabled="running" @click="runAutomation">
				{{ automatedRunning ? progressLabel : "Run real engine scenario" }}
			</button>
		</div>

		<div class="perf-actions">
			<button v-if="!running" class="primary" @click="start">Start capture</button>
			<button v-else class="danger" @click="finish">Stop capture</button>
			<button v-if="report" @click="copyReport">Copy JSON</button>
			<button v-if="report" @click="downloadReport">Download</button>
		</div>

		<div v-if="report" class="perf-summary">
			<span>{{ report.frames.samples }} frames</span>
			<span>{{ Math.round(report.durationMs / 100) / 10 }} seconds</span>
			<span>{{ criticalCount }} critical</span>
		</div>

		<div v-if="report" class="perf-metrics">
			<details
				v-for="metric in sortedMetrics"
				:key="metric.id"
				class="perf-metric"
				:class="metric.status"
				:open="metric.status === 'critical'"
			>
				<summary>
					<span class="status-dot" />
					<span class="metric-label">{{ metric.label }}</span>
					<strong>{{ metric.formattedValue }}</strong>
				</summary>
				<div class="metric-help">
					<p>{{ metric.summary }}</p>
					<p><b>Budget:</b> {{ metric.budget }}</p>
					<p><b>Meaning:</b> {{ metric.meaning }}</p>
					<p><b>If high:</b> {{ metric.whenHigh }}</p>
				</div>
			</details>
		</div>

		<p v-if="message" class="perf-message">{{ message }}</p>
	</aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useDrawStore } from "@/draw/session/draw.store";
import {
	runLiveDrawingBenchmark,
	type LiveBenchmarkProgress,
} from "@/draw/benchmark/liveDrawingBenchmark";
import {
	startBenchmarkSession,
	type BenchmarkSession,
} from "@/draw/benchmark/benchmarkSession";
import type { BenchmarkReport } from "@/draw/benchmark/benchmark.types";

const props = withDefaults(
	defineProps<{
		autoStartSignal?: number;
	}>(),
	{ autoStartSignal: 0 },
);
const emit = defineEmits(["close"]);
const session = ref<BenchmarkSession | null>(null);
const report = ref<BenchmarkReport | null>(null);
const elapsedSeconds = ref(0);
const message = ref("");
let timer: ReturnType<typeof setInterval> | null = null;
const route = useRoute();
const drawStore = useDrawStore();
const automatedRunning = ref(false);
const progress = ref<LiveBenchmarkProgress | null>(null);
const automationEnabled = computed(
	() => import.meta.env.DEV && route.query.bench === "1",
);
const progressLabel = computed(() => {
	if (!progress.value) return "Starting…";
	return `${progress.value.step} ${progress.value.current}/${progress.value.total}`;
});

const running = computed(() => session.value !== null);
const statusOrder = {
	critical: 0,
	warning: 1,
	good: 2,
	unavailable: 3,
} as const;
const sortedMetrics = computed(() =>
	report.value
		? [...report.value.metrics].sort(
				(a, b) => statusOrder[a.status] - statusOrder[b.status],
			)
		: [],
);
const criticalCount = computed(
	() =>
		report.value?.metrics.filter((metric) => metric.status === "critical")
			.length,
);

function start() {
	if (session.value) return;
	report.value = null;
	message.value = "";
	session.value = startBenchmarkSession();
	elapsedSeconds.value = 0;
	timer = setInterval(() => {
		if (!session.value) return;
		elapsedSeconds.value = Math.floor(
			(Date.now() - session.value.startedAt) / 1000,
		);
	}, 250);
}

onMounted(() => {
	if (props.autoStartSignal > 0) start();
});

watch(
	() => props.autoStartSignal,
	(next, previous) => {
		if (next > previous) start();
	},
);

function finish() {
	if (!session.value) return;
	report.value = session.value.finish();
	session.value = null;
	if (timer) clearInterval(timer);
	timer = null;
}

async function runAutomation() {
	automatedRunning.value = true;
	progress.value = null;
	start();
	try {
		await runLiveDrawingBenchmark(drawStore.getCanvas(), (next) => {
			progress.value = next;
		});
		message.value = "Automated scenario completed and fixture removed.";
	} catch (error) {
		message.value =
			error instanceof Error ? error.message : "Automated scenario failed.";
	} finally {
		finish();
		automatedRunning.value = false;
		progress.value = null;
	}
}

function reportJson(): string {
	return JSON.stringify(report.value, null, 2);
}

async function copyReport() {
	await navigator.clipboard.writeText(reportJson());
	message.value = "Report copied.";
}

function downloadReport() {
	const blob = new Blob([reportJson()], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `sketchmate-draw-bench-${Date.now()}.json`;
	anchor.click();
	URL.revokeObjectURL(url);
}

onBeforeUnmount(() => {
	if (timer) clearInterval(timer);
	session.value?.finish();
});
</script>

<style scoped>
.perf-panel {
	position: absolute;
	z-index: 100;
	top: max(12px, env(safe-area-inset-top));
	right: 12px;
	width: min(390px, calc(100vw - 24px));
	max-height: calc(100vh - 24px - env(safe-area-inset-top));
	overflow: auto;
	padding: 16px;
	border: 1px solid rgb(255 255 255 / 18%);
	border-radius: 18px;
	background: rgb(22 24 29 / 94%);
	box-shadow: 0 18px 60px rgb(0 0 0 / 35%);
	color: #f8fafc;
	font-family: ui-sans-serif, system-ui, sans-serif;
	backdrop-filter: blur(16px);
}

.perf-panel.compact {
	width: min(230px, calc(100vw - 24px));
}

.perf-header,
.perf-actions,
.perf-summary,
.perf-metric summary {
	display: flex;
	align-items: center;
}

.perf-header,
.perf-metric summary {
	justify-content: space-between;
}

.perf-eyebrow {
	margin: 0 0 2px;
	color: #fbad83;
	font-size: 10px;
	font-weight: 800;
	letter-spacing: 0.14em;
	text-transform: uppercase;
}

h2 {
	margin: 0;
	font-size: 18px;
}

.perf-close {
	display: grid;
	width: 32px;
	height: 32px;
	padding: 0;
	border: 0;
	border-radius: 10px;
	background: rgb(255 255 255 / 8%);
	color: #f8fafc;
	font-size: 22px;
	line-height: 1;
	place-items: center;
}

.perf-timer,
.perf-summary {
	color: #cbd5e1;
	font-size: 12px;
}

.perf-intro,
.perf-message {
	color: #cbd5e1;
	font-size: 13px;
	line-height: 1.45;
}

.perf-actions {
	flex-wrap: wrap;
	gap: 8px;
	margin: 14px 0;
}

.automation {
	display: grid;
	gap: 8px;
	margin-top: 14px;
	padding: 12px;
	border: 1px solid rgb(251 173 131 / 30%);
	border-radius: 12px;
	background: rgb(251 173 131 / 8%);
	font-size: 12px;
}

.automation p {
	margin: 0;
	color: #cbd5e1;
	line-height: 1.4;
}

button {
	padding: 8px 11px;
	border: 1px solid rgb(255 255 255 / 15%);
	border-radius: 10px;
	background: #343944;
	color: white;
	font-weight: 700;
}

button.primary {
	background: #f69a6d;
	color: #241b17;
}

button.danger {
	background: #f87171;
	color: #2b1111;
}

.perf-summary {
	gap: 12px;
	margin-bottom: 10px;
}

.perf-metrics {
	display: grid;
	gap: 7px;
}

.perf-metric {
	border: 1px solid rgb(255 255 255 / 10%);
	border-radius: 11px;
	background: rgb(255 255 255 / 4%);
}

.perf-metric summary {
	gap: 9px;
	padding: 10px;
	cursor: pointer;
	list-style: none;
	font-size: 12px;
}

.metric-label {
	flex: 1;
}

.status-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #64748b;
}

.good .status-dot {
	background: #4ade80;
}

.warning .status-dot {
	background: #facc15;
}

.critical .status-dot {
	background: #fb7185;
}

.metric-help {
	padding: 0 10px 10px 27px;
	color: #cbd5e1;
	font-size: 11px;
	line-height: 1.4;
}

.metric-help p {
	margin: 5px 0;
}
</style>
