import type { BenchmarkScene } from "@/draw/benchmark/sceneFactory";
import type { WorldRect } from "@/draw/rendering/committedLayer";

export type BenchmarkScenarioId =
	| "zoom-ladder"
	| "pan-sweep"
	| "undo-redo-storm"
	| "remote-add-burst"
	| "move-selection"
	| "gesture-during-bake";

export interface BenchmarkDriver {
	setViewport(viewport: WorldRect, zoom: number): void | Promise<void>;
	invalidate(rect: WorldRect): void | Promise<void>;
	add(rect: WorldRect): void | Promise<void>;
	beginGesture(): void | Promise<void>;
	endGesture(): void | Promise<void>;
	settle(): void | Promise<void>;
}

interface ScenarioDefinition {
	label: string;
	description: string;
	run(scene: BenchmarkScene, driver: BenchmarkDriver): Promise<void>;
}

function centerViewport(
	scene: BenchmarkScene,
	zoom: number,
	width = 1280,
	height = 720,
): WorldRect {
	const anchor = scene.objects[0].bounds;
	return {
		x: anchor.x + anchor.w / 2 - width / zoom / 2,
		y: anchor.y + anchor.h / 2 - height / zoom / 2,
		w: width / zoom,
		h: height / zoom,
	};
}

function objectRect(scene: BenchmarkScene, index: number): WorldRect {
	return { ...scene.objects[index % scene.objects.length].bounds };
}

export const BENCHMARK_SCENARIOS: Record<
	BenchmarkScenarioId,
	ScenarioDefinition
> = {
	"zoom-ladder": {
		label: "Zoom ladder",
		description: "Walk every tile-backed zoom tier in and back out.",
		async run(scene, driver) {
			for (const zoom of [0.25, 0.5, 1, 2, 4, 8, 16]) {
				await driver.setViewport(centerViewport(scene, zoom), zoom);
			}
			for (const zoom of [8, 4, 2, 1, 0.5, 0.25]) {
				await driver.setViewport(centerViewport(scene, zoom), zoom);
			}
			await driver.settle();
		},
	},
	"pan-sweep": {
		label: "Pan sweep",
		description: "Cross a large drawing at a stable 1× zoom.",
		async run(scene, driver) {
			const steps = 24;
			const path = [...scene.objects].sort(
				(a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y,
			);
			for (let index = 0; index <= steps; index++) {
				const ratio = index / steps;
				const anchor = path[Math.floor(ratio * (path.length - 1))].bounds;
				await driver.setViewport(
					{
						x: anchor.x + anchor.w / 2 - 640,
						y: anchor.y + anchor.h / 2 - 360,
						w: 1280,
						h: 720,
					},
					1,
				);
			}
			await driver.settle();
		},
	},
	"undo-redo-storm": {
		label: "Undo/redo storm",
		description: "Repeated small destructive edits in one dense cluster.",
		async run(scene, driver) {
			for (let index = 0; index < 40; index++) {
				await driver.invalidate(objectRect(scene, index));
			}
			await driver.settle();
		},
	},
	"remote-add-burst": {
		label: "Remote add burst",
		description: "One hundred incoming additions spread across the board.",
		async run(scene, driver) {
			for (let index = 0; index < 100; index++) {
				await driver.add(objectRect(scene, index * 7));
			}
			await driver.settle();
		},
	},
	"move-selection": {
		label: "Move selection",
		description: "Moves a medium selection repeatedly across tile boundaries.",
		async run(scene, driver) {
			let rect = objectRect(scene, 0);
			rect = { x: rect.x, y: rect.y, w: 420, h: 320 };
			for (let index = 0; index < 16; index++) {
				const next = { ...rect, x: rect.x + 140, y: rect.y + 55 };
				await driver.invalidate(rect);
				await driver.add(next);
				rect = next;
			}
			await driver.settle();
		},
	},
	"gesture-during-bake": {
		label: "Gesture during bake",
		description:
			"Starts a large invalidation, then immediately pans and zooms.",
		async run(scene, driver) {
			await driver.invalidate({ ...scene.bounds });
			await driver.beginGesture();
			for (let index = 0; index < 12; index++) {
				const zoom = 1 + index * 0.2;
				const viewport = centerViewport(scene, zoom);
				viewport.x += index * 90;
				await driver.setViewport(viewport, zoom);
			}
			await driver.endGesture();
			await driver.settle();
		},
	},
};

export async function runBenchmarkScenario(
	scene: BenchmarkScene,
	scenarioId: BenchmarkScenarioId,
	driver: BenchmarkDriver,
): Promise<void> {
	await BENCHMARK_SCENARIOS[scenarioId].run(scene, driver);
}
