import type { Canvas, FabricObject } from "fabric";
import * as fabric from "fabric";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import { useDrawHistoryManager } from "@/draw/history/history.store";
import { useEraser } from "@/draw/tools/eraser.store";
import { OptimizedEraserStroke } from "@/draw/utils/brushes/CustomEraserBrush";
import { OptimizedPencilStroke } from "@/draw/utils/brushes/CustomPencilBrush";
import { v4 } from "@/utils/uuid";

const ERASE_STROKES = 80;
const FIXTURE_STROKES = 6;
const DRAWING_ERASE_STROKES = 12;

export interface LiveBenchmarkProgress {
	step: string;
	current: number;
	total: number;
}

function nextFrame(): Promise<void> {
	return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function visibleWorld(canvas: Canvas) {
	const vpt = canvas.viewportTransform!;
	const zoom = vpt[0];
	return {
		x: -vpt[4] / zoom,
		y: -vpt[5] / zoom,
		w: canvas.width / zoom,
		h: canvas.height / zoom,
	};
}

function createFixtureStroke(
	world: ReturnType<typeof visibleWorld>,
	index: number,
): OptimizedPencilStroke {
	const y = world.y + world.h * (0.2 + (index / (FIXTURE_STROKES - 1)) * 0.6);
	const points: any[] = [["M", world.x + world.w * 0.12, y]];
	for (let point = 1; point <= 180; point++) {
		const ratio = point / 180;
		points.push([
			"L",
			world.x + world.w * (0.12 + ratio * 0.76),
			y + Math.sin(ratio * Math.PI * 18 + index) * world.h * 0.018,
		]);
	}

	const stroke = new OptimizedPencilStroke(points, {
		fill: null,
		stroke: `hsl(${18 + index * 22} 78% 52%)`,
		strokeWidth: Math.max(5, world.w / 180),
		strokeLineCap: "round",
		strokeLineJoin: "round",
	});
	stroke.set({ id: v4(), erasable: true });
	return stroke;
}

function createEraseStroke(
	world: ReturnType<typeof visibleWorld>,
	index: number,
): OptimizedEraserStroke {
	const ratio = (index + 0.5) / ERASE_STROKES;
	const x = world.x + world.w * (0.13 + ratio * 0.74);
	const wobble = Math.sin(index * 1.7) * world.w * 0.012;
	const stroke = new OptimizedEraserStroke(
		[
			["M", x, world.y + world.h * 0.12],
			["Q", x + wobble, world.y + world.h * 0.5, x, world.y + world.h * 0.88],
		] as any,
		{
			fill: null,
			stroke: "black",
			strokeWidth: Math.max(12, world.w / 90),
			strokeLineCap: "round",
			strokeLineJoin: "round",
			globalCompositeOperation: "destination-out",
		},
	);
	stroke.id = v4();
	return stroke;
}

async function exerciseZoom(canvas: Canvas, index: number): Promise<void> {
	const manager = useDrawObjectManager();
	const center = new fabric.Point(canvas.width / 2, canvas.height / 2);
	const limits = manager.getZoomLimits();
	const factors = [0.72, 1.35, 0.85, 1.18];
	const nextZoom = Math.max(
		limits.min,
		Math.min(canvas.getZoom() * factors[index % factors.length], limits.max),
	);

	manager.onGestureStart();
	canvas.fire("gestureStart");
	canvas.zoomToPoint(center, nextZoom);
	canvas.fire("zoomChanged");
	manager.renderViewportNow();
	canvas.fire("gestureEnd");
	manager.onGestureEnd();
	await nextFrame();
}

async function removeFixture(
	canvas: Canvas,
	fixture: FabricObject[],
): Promise<void> {
	for (const object of fixture) canvas.remove(object);
	useDrawHistoryManager().reset();
	useDrawObjectManager().renderViewport();
	await nextFrame();
}

async function stressLoadedDrawing(
	canvas: Canvas,
	world: ReturnType<typeof visibleWorld>,
	onProgress?: (progress: LiveBenchmarkProgress) => void,
): Promise<void> {
	if (
		!canvas
			.getObjects()
			.some((object) => object.id && object.erasable !== false)
	) {
		return;
	}

	const eraser = useEraser();
	const history = useDrawHistoryManager();
	const manager = useDrawObjectManager();
	const committedStrokeIds: string[] = [];
	const commits: Promise<void>[] = [];
	for (let index = 0; index < DRAWING_ERASE_STROKES; index++) {
		const stroke = createEraseStroke(
			world,
			Math.floor((index / DRAWING_ERASE_STROKES) * ERASE_STROKES),
		);
		const bounds = stroke.getBoundingRect();
		const pad = stroke.strokeWidth ?? 0;
		const nearby = manager.query({
			x: bounds.left - pad,
			y: bounds.top - pad,
			w: bounds.width + pad * 2,
			h: bounds.height + pad * 2,
		});
		const targets = nearby.filter((object) => {
			try {
				return (
					object.id &&
					object.erasable !== false &&
					object.intersectsWithObject(stroke)
				);
			} catch {
				return false;
			}
		});
		if (targets.length === 0) continue;

		commits.push(eraser.commitProgrammaticErase(stroke, targets));
		committedStrokeIds.push(stroke.id as string);
		onProgress?.({
			step: "Loaded drawing erase",
			current: index + 1,
			total: DRAWING_ERASE_STROKES,
		});
		if (index % 3 === 2) await exerciseZoom(canvas, index);
	}
	await Promise.all(commits);

	if (!history.hasRecentEraseActions(committedStrokeIds)) {
		throw new Error(
			"Live benchmark stopped: its erase history was not retained safely.",
		);
	}

	for (let index = 0; index < committedStrokeIds.length; index++)
		await history.undo();
	for (let index = 0; index < committedStrokeIds.length; index++)
		await history.redo();
	for (let index = 0; index < committedStrokeIds.length; index++) {
		await history.undo();
		onProgress?.({
			step: "Loaded drawing restore",
			current: index + 1,
			total: committedStrokeIds.length,
		});
	}
}

/**
 * Exercises the production canvas, clip, tile, and history paths. The fixture
 * is isolated from the user's drawing and removed when the run finishes.
 */
export async function runLiveDrawingBenchmark(
	canvas: Canvas,
	onProgress?: (progress: LiveBenchmarkProgress) => void,
): Promise<void> {
	const originalVpt = [...canvas.viewportTransform!] as fabric.TMat2D;
	const world = visibleWorld(canvas);
	const fixture = Array.from({ length: FIXTURE_STROKES }, (_, index) =>
		createFixtureStroke(world, index),
	);
	const eraser = useEraser();
	const history = useDrawHistoryManager();

	try {
		await stressLoadedDrawing(canvas, world, onProgress);

		for (let index = 0; index < fixture.length; index++) {
			canvas.add(fixture[index]);
			onProgress?.({
				step: "Drawing fixture",
				current: index + 1,
				total: fixture.length,
			});
			await nextFrame();
		}

		const fixtureCommits: Promise<void>[] = [];
		for (let index = 0; index < ERASE_STROKES; index++) {
			const stroke = createEraseStroke(world, index);
			fixtureCommits.push(eraser.commitProgrammaticErase(stroke, fixture));
			onProgress?.({
				step: "Erasing and zooming",
				current: index + 1,
				total: ERASE_STROKES,
			});
			if (index % 4 === 3) await exerciseZoom(canvas, index);
		}
		await Promise.all(fixtureCommits);

		const undoCount = Math.min(50, history.undoStackCounter);
		for (let index = 0; index < undoCount; index++) {
			await history.undo();
			onProgress?.({
				step: "Undo storm",
				current: index + 1,
				total: undoCount,
			});
		}
		for (let index = 0; index < undoCount; index++) {
			await history.redo();
			onProgress?.({
				step: "Redo storm",
				current: index + 1,
				total: undoCount,
			});
		}
		for (let index = 0; index < undoCount; index++) {
			await history.undo();
			onProgress?.({
				step: "Restoring fixture",
				current: index + 1,
				total: undoCount,
			});
		}
	} finally {
		canvas.setViewportTransform(originalVpt);
		canvas.fire("zoomChanged");
		eraser.releaseProgrammaticEraser();
		await removeFixture(canvas, fixture);
	}
}
