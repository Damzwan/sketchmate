import type { WorldRect } from "@/draw/rendering/committedLayer";

export type BenchmarkSceneId =
	| "pencil-500"
	| "watercolor-300"
	| "mixed-lobby-2000"
	| "erased-heavy"
	| "sticker-mix";

export type BenchmarkObjectKind =
	| "pencil"
	| "watercolor"
	| "text"
	| "image"
	| "erased";

export interface BenchmarkObject {
	id: string;
	kind: BenchmarkObjectKind;
	bounds: WorldRect;
	complexity: number;
	getBoundingRect(): {
		left: number;
		top: number;
		width: number;
		height: number;
	};
}

export interface BenchmarkScene {
	id: BenchmarkSceneId;
	label: string;
	description: string;
	objects: BenchmarkObject[];
	bounds: WorldRect;
}

interface SceneDefinition {
	label: string;
	description: string;
	count: number;
	spread: number;
	clusters: number;
	kinds: readonly BenchmarkObjectKind[];
}

export const BENCHMARK_SCENES: Record<BenchmarkSceneId, SceneDefinition> = {
	"pencil-500": {
		label: "Pencil 500",
		description: "Clustered lightweight strokes. The normal baseline.",
		count: 500,
		spread: 2_400,
		clusters: 5,
		kinds: ["pencil"],
	},
	"watercolor-300": {
		label: "Watercolor 300",
		description: "Fewer objects with much heavier rasterization cost.",
		count: 300,
		spread: 2_400,
		clusters: 5,
		kinds: ["watercolor"],
	},
	"mixed-lobby-2000": {
		label: "Mixed lobby 2000",
		description: "Forty drawing clusters spread across a large shared world.",
		count: 2_000,
		spread: 24_000,
		clusters: 40,
		kinds: ["pencil", "watercolor", "text", "image"],
	},
	"erased-heavy": {
		label: "Erased heavy",
		description: "Dense strokes with expensive clip-like objects.",
		count: 260,
		spread: 2_800,
		clusters: 4,
		kinds: ["pencil", "erased", "erased"],
	},
	"sticker-mix": {
		label: "Sticker mix",
		description: "Strokes, text, and images that exercise hybrid rendering.",
		count: 600,
		spread: 4_000,
		clusters: 8,
		kinds: ["pencil", "pencil", "text", "image"],
	},
};

function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 4_294_967_296;
	};
}

function hash(value: string): number {
	let result = 2166136261;
	for (let index = 0; index < value.length; index++) {
		result ^= value.charCodeAt(index);
		result = Math.imul(result, 16777619);
	}
	return result >>> 0;
}

function complexity(kind: BenchmarkObjectKind): number {
	if (kind === "watercolor") return 8;
	if (kind === "erased") return 6;
	if (kind === "image") return 4;
	if (kind === "text") return 3;
	return 1;
}

function unionBounds(objects: BenchmarkObject[]): WorldRect {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const object of objects) {
		const rect = object.bounds;
		minX = Math.min(minX, rect.x);
		minY = Math.min(minY, rect.y);
		maxX = Math.max(maxX, rect.x + rect.w);
		maxY = Math.max(maxY, rect.y + rect.h);
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function createBenchmarkScene(id: BenchmarkSceneId): BenchmarkScene {
	const definition = BENCHMARK_SCENES[id];
	const random = seededRandom(hash(id));
	const objects: BenchmarkObject[] = [];
	const columns = Math.ceil(Math.sqrt(definition.clusters));
	const clusterGap = definition.spread / Math.max(1, columns - 1);

	for (let index = 0; index < definition.count; index++) {
		const cluster = index % definition.clusters;
		const column = cluster % columns;
		const row = Math.floor(cluster / columns);
		const centerX = column * clusterGap - definition.spread / 2;
		const centerY = row * clusterGap - definition.spread / 2;
		const kind =
			definition.kinds[Math.floor(random() * definition.kinds.length)];
		const width = 18 + random() * (kind === "image" ? 180 : 90);
		const height = 14 + random() * (kind === "text" ? 70 : 100);
		const bounds = {
			x: centerX + (random() - 0.5) * 520,
			y: centerY + (random() - 0.5) * 520,
			w: width,
			h: height,
		};
		objects.push({
			id: `${id}-${index}`,
			kind,
			bounds,
			complexity: complexity(kind),
			getBoundingRect: () => ({
				left: bounds.x,
				top: bounds.y,
				width: bounds.w,
				height: bounds.h,
			}),
		});
	}

	return {
		id,
		label: definition.label,
		description: definition.description,
		objects,
		bounds: unionBounds(objects),
	};
}
