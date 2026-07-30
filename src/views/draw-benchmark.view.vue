<template>
	<main class="bench-page">
		<section class="hero">
			<p class="eyebrow">Development only</p>
			<h1>Draw engine bench</h1>
			<p>
				Deterministic counts catch algorithmic regressions. Manual captures
				measure real rendering on this browser or device.
			</p>
		</section>

		<section class="card">
			<div class="section-heading">
				<div>
					<p class="eyebrow">Tier A</p>
					<h2>Deterministic scenario</h2>
				</div>
				<button :disabled="running" @click="runSelected">
					{{ running ? "Running…" : "Run scenario" }}
				</button>
			</div>

			<div class="controls">
				<label>
					Scene
					<select v-model="sceneId">
						<option
							v-for="(scene, id) in BENCHMARK_SCENES"
							:key="id"
							:value="id"
						>
							{{ scene.label }}
						</option>
					</select>
				</label>
				<label>
					Scenario
					<select v-model="scenarioId">
						<option
							v-for="(scenario, id) in BENCHMARK_SCENARIOS"
							:key="id"
							:value="id"
						>
							{{ scenario.label }}
						</option>
					</select>
				</label>
			</div>

			<p class="description">{{ selectedScene.description }}</p>
			<p class="description">{{ selectedScenario.description }}</p>
			<p class="note">
				Cell counts are potential coverage across every zoom tier, before the
				engine limits work to cached and in-flight tiles.
			</p>

			<div v-if="algorithmicResult" class="result-grid">
				<div v-for="item in algorithmicSummary" :key="item.label">
					<span>{{ item.label }}</span>
					<strong>{{ item.value }}</strong>
				</div>
			</div>
		</section>

		<section class="card">
			<div class="section-heading">
				<div>
					<p class="eyebrow">Tier B</p>
					<h2>Real browser or device</h2>
				</div>
			</div>
			<p class="description">
				Open a drawing with the recorder. Run the automated real-engine
				scenario or capture your own interaction, then export the report.
			</p>
			<label>
				Optional canvas URL
				<input
					v-model.trim="canvasUrl"
					type="url"
					placeholder="https://…/canvas.json.gz"
				/>
			</label>
			<div class="button-row">
				<button @click="openManualBench(false)">Open blank drawing</button>
				<button :disabled="!canvasUrl" @click="openManualBench(true)">
					Load canvas URL
				</button>
			</div>
		</section>

		<section class="card">
			<p class="eyebrow">Metric dictionary</p>
			<h2>What the numbers mean</h2>
			<div class="dictionary">
				<details v-for="metric in DRAW_METRIC_CATALOG" :key="metric.id">
					<summary>{{ metric.label }}</summary>
					<p>{{ metric.summary }}</p>
					<p><b>Budget:</b> {{ describeMetricBudget(metric) }}</p>
					<p><b>Meaning:</b> {{ metric.meaning }}</p>
					<p><b>If high:</b> {{ metric.whenHigh }}</p>
				</details>
			</div>
		</section>
	</main>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import {
	BENCHMARK_SCENARIOS,
	type BenchmarkScenarioId,
} from "@/draw/benchmark/benchScenarios";
import {
	BENCHMARK_SCENES,
	type BenchmarkSceneId,
} from "@/draw/benchmark/sceneFactory";
import {
	runHeadlessBenchmark,
	type HeadlessBenchmarkResult,
} from "@/draw/benchmark/headlessBenchmark";
import {
	DRAW_METRIC_CATALOG,
	describeMetricBudget,
} from "@/draw/benchmark/metricCatalog";
import { FRONTEND_ROUTES } from "@/types/router.types";

const router = useRouter();
const sceneId = ref<BenchmarkSceneId>("pencil-500");
const scenarioId = ref<BenchmarkScenarioId>("zoom-ladder");
const canvasUrl = ref("");
const running = ref(false);
const algorithmicResult = ref<HeadlessBenchmarkResult | null>(null);

const selectedScene = computed(() => BENCHMARK_SCENES[sceneId.value]);
const selectedScenario = computed(() => BENCHMARK_SCENARIOS[scenarioId.value]);
const algorithmicSummary = computed(() => {
	const result = algorithmicResult.value;
	if (!result) return [];
	return [
		{ label: "Objects", value: result.objectCount },
		{ label: "Operations", value: result.operations },
		{ label: "Viewport changes", value: result.viewportChanges },
		{ label: "Invalidations", value: result.invalidations },
		{ label: "Added regions", value: result.additions },
		{ label: "Invalidated cells", value: result.totalInvalidatedCells },
		{
			label: "Worst cells per edit",
			value: result.maxInvalidatedCellsPerEdit,
		},
		{ label: "Object intersections", value: result.objectsTouched },
		{ label: "Weighted object work", value: result.weightedObjectWork },
	];
});

async function runSelected() {
	running.value = true;
	try {
		algorithmicResult.value = await runHeadlessBenchmark(
			sceneId.value,
			scenarioId.value,
		);
	} finally {
		running.value = false;
	}
}

function openManualBench(withCanvas: boolean) {
	const query: Record<string, string> = { perf: "1", bench: "1" };
	if (withCanvas && canvasUrl.value) query.canvas_url = canvasUrl.value;
	void router.push({ path: `/${FRONTEND_ROUTES.draw}`, query });
}
</script>

<style scoped>
.bench-page {
	min-height: 100vh;
	padding: 48px clamp(18px, 4vw, 64px);
	background: #111318;
	color: #f8fafc;
	font-family: ui-sans-serif, system-ui, sans-serif;
}

.hero,
.card {
	max-width: 960px;
	margin-inline: auto;
}

.hero {
	margin-bottom: 28px;
}

.hero h1 {
	margin: 2px 0 8px;
	font-size: clamp(34px, 6vw, 64px);
	letter-spacing: -0.04em;
}

.hero > p:last-child,
.description {
	max-width: 720px;
	color: #aeb7c5;
	line-height: 1.55;
}

.note {
	color: #7f8a9a;
	font-size: 12px;
}

.eyebrow {
	margin: 0;
	color: #fbad83;
	font-size: 11px;
	font-weight: 900;
	letter-spacing: 0.16em;
	text-transform: uppercase;
}

.card {
	margin-bottom: 18px;
	padding: clamp(18px, 3vw, 28px);
	border: 1px solid #2e3440;
	border-radius: 22px;
	background: #1a1e25;
}

.section-heading,
.button-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

h2 {
	margin: 3px 0 10px;
	font-size: 22px;
}

.controls {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 12px;
	margin: 20px 0 12px;
}

label {
	display: grid;
	gap: 7px;
	color: #cbd5e1;
	font-size: 12px;
	font-weight: 800;
}

select,
input,
button {
	min-height: 42px;
	border: 1px solid #3b4350;
	border-radius: 11px;
	background: #272d37;
	color: #f8fafc;
	font: inherit;
}

select,
input {
	width: 100%;
	padding: 0 12px;
}

button {
	padding: 0 15px;
	font-weight: 800;
	cursor: pointer;
}

button:hover:not(:disabled) {
	border-color: #fbad83;
}

button:disabled {
	cursor: not-allowed;
	opacity: 0.45;
}

.button-row {
	justify-content: flex-start;
	margin-top: 14px;
}

.result-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
	gap: 9px;
	margin-top: 20px;
}

.result-grid div {
	display: grid;
	gap: 4px;
	padding: 12px;
	border-radius: 12px;
	background: #242933;
}

.result-grid span {
	color: #9ca7b7;
	font-size: 11px;
}

.result-grid strong {
	font-size: 20px;
}

.dictionary {
	display: grid;
	gap: 8px;
	margin-top: 16px;
}

.dictionary details {
	padding: 12px 14px;
	border: 1px solid #313845;
	border-radius: 11px;
	background: #222730;
}

.dictionary summary {
	cursor: pointer;
	font-weight: 800;
}

.dictionary p {
	margin: 8px 0 0;
	color: #b4bdca;
	font-size: 13px;
	line-height: 1.45;
}

@media (max-width: 600px) {
	.section-heading,
	.button-row {
		align-items: stretch;
		flex-direction: column;
	}
}
</style>
