import * as fabric from "fabric";
import { ActiveSelection, type Canvas, type FabricObject, Point } from "fabric";
import inside from "point-in-polygon";
import { svgPathProperties } from "svg-path-properties";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import type { FabricEvent } from "@/draw/canvas/fabricEvent.types";
import {
	capOrderedSelection,
	DRAW_SELECTION_OBJECT_LIMIT,
} from "@/draw/config/selectionBudget";
import { compareRenderOrder } from "@/draw/layers/layerRegistry";
import { recordPhase } from "@/draw/rendering/renderMetrics";
import { DrawTool, type ToolService } from "@/draw/tools/tool.types";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import * as transform from "@/draw/transform/transformController";
import type { Rect } from "@/draw/utils/QuadTree";
import { isMobile } from "@/helper/platform.helper";
import { useToast } from "@/service/toast.service";

type FabricObjectWithCache = FabricObject & {
	_lassoPoints?: number[][];
	_lassoMatrixSig?: string;
};

export function createLassoTool(): ToolService {
	let c: Canvas | undefined;
	let upperCtx: CanvasRenderingContext2D | null = null;

	let isDrawing = false;
	let rafId: number | null = null;
	let lassoPolygonPoints: number[][] = [];
	let lassoBBox = {
		minX: Infinity,
		minY: Infinity,
		maxX: -Infinity,
		maxY: -Infinity,
	};
	let pendingPointer: { x: number; y: number } | null = null;
	let ghostHighlighted: FabricObject[] = [];
	let lastHitTestAt = 0;
	let selectionRevision = 0;
	let interactionActive = false;

	const HIT_TEST_INTERVAL_MS = 32;
	const HIT_TEST_SLICE_MS = 5;
	const MAX_GHOST_HIGHLIGHTS = 150;

	const events: FabricEvent[] = [
		{ on: "mouse:down", handler: onMouseDown },
		{ on: "mouse:move", handler: onMouseMove },
		{ on: "mouse:up", handler: onMouseUp },
	];

	function init(canvas: Canvas) {
		c = canvas;
		upperCtx = (c as any).upperCanvasEl?.getContext("2d") ?? null;
		// No cache-clear listener needed: _lassoPoints is self-validating via a
		// transform-matrix signature (see getPathPoints), so undo / remote moves
		// can never leave stale hit-test points behind.
	}

	function destroy() {
		selectionRevision++;
		if (rafId !== null) cancelAnimationFrame(rafId);
		rafId = null;
		isDrawing = false;
		interactionActive = false;
		pendingPointer = null;
		lassoPolygonPoints = [];
		ghostHighlighted = [];
		upperCtx = null;
		c = undefined;
	}
	// ─── Drawing helpers ─────────────────────────────────────────────────────────

	function renderOverlay(highlightedObjects: FabricObject[]) {
		if (!upperCtx || !c) return;
		const renderStartedAt = performance.now();
		const el = (c as any).upperCanvasEl as HTMLCanvasElement;
		const vpt = c.viewportTransform as number[];
		const retina = c.getRetinaScaling();

		upperCtx.clearRect(0, 0, el.width, el.height);
		upperCtx.save();
		upperCtx.setTransform(
			vpt[0] * retina,
			vpt[1] * retina,
			vpt[2] * retina,
			vpt[3] * retina,
			vpt[4] * retina,
			vpt[5] * retina,
		);

		// 1. Draw the Lasso Path
		if (lassoPolygonPoints.length > 1) {
			upperCtx.beginPath();
			upperCtx.moveTo(lassoPolygonPoints[0][0], lassoPolygonPoints[0][1]);
			for (let i = 1; i < lassoPolygonPoints.length; i++) {
				upperCtx.lineTo(lassoPolygonPoints[i][0], lassoPolygonPoints[i][1]);
			}
			upperCtx.closePath();
			upperCtx.fillStyle = "rgba(0, 150, 255, 0.1)";
			upperCtx.fill();
			upperCtx.strokeStyle = "#007bff";
			upperCtx.lineWidth = 1.5 / vpt[0];
			upperCtx.setLineDash([5 / vpt[0], 5 / vpt[0]]);
			upperCtx.stroke();
		}

		// 2. Draw "Ghost" highlights with Padding
		// padding is visually constant (e.g., 4px) regardless of zoom
		const padding = 4 / vpt[0];
		upperCtx.fillStyle = "rgba(0, 123, 255, 0.35)";

		highlightedObjects.slice(0, MAX_GHOST_HIGHLIGHTS).forEach((obj) => {
			if (!upperCtx) return;
			const coords = obj.getCoords(); // [tl, tr, br, bl]

			// Calculate a center point to push coordinates outward
			const center = obj.getCenterPoint();

			upperCtx.beginPath();
			coords.forEach((p, i) => {
				// Move the point away from the center by the padding amount
				const dx = p.x - center.x;
				const dy = p.y - center.y;
				const dist = Math.hypot(dx, dy) || 1;

				const px = p.x + (dx / dist) * padding;
				const py = p.y + (dy / dist) * padding;

				if (i === 0) upperCtx!.moveTo(px, py);
				else upperCtx!.lineTo(px, py);
			});

			upperCtx.closePath();
			upperCtx.fill();
		});

		upperCtx.restore();
		recordPhase("lassoOverlay", performance.now() - renderStartedAt);
	}

	// ─── Handlers ────────────────────────────────────────────────────────────────

	function onMouseDown(o: any) {
		if (!isMobile() && o.e.button !== 0) return;
		selectionRevision++;
		if (!interactionActive) {
			useDrawObjectManager().onGestureStart();
			interactionActive = true;
		}
		isDrawing = true;
		const pointer = c!.getScenePoint(o.e);
		lassoPolygonPoints = [[pointer.x, pointer.y]];
		lassoBBox = {
			minX: pointer.x,
			minY: pointer.y,
			maxX: pointer.x,
			maxY: pointer.y,
		};
		pendingPointer = null;
		lastHitTestAt = 0;
	}

	function onMouseMove(o: any) {
		if (!isDrawing) return;
		pendingPointer = c!.getScenePoint(o.e);
		if (rafId === null) {
			rafId = requestAnimationFrame(() => processMove(false));
		}
	}

	function appendPendingPointer(force: boolean): boolean {
		if (!pendingPointer) return false;
		const { x, y } = pendingPointer;
		const last = lassoPolygonPoints[lassoPolygonPoints.length - 1];
		const sampleDistance = 6 / Math.max(0.01, c!.getZoom());
		const shouldSample = Math.hypot(x - last[0], y - last[1]) >= sampleDistance;
		if (shouldSample) {
			lassoPolygonPoints.push([x, y]);
			lassoBBox.minX = Math.min(lassoBBox.minX, x);
			lassoBBox.minY = Math.min(lassoBBox.minY, y);
			lassoBBox.maxX = Math.max(lassoBBox.maxX, x);
			lassoBBox.maxY = Math.max(lassoBBox.maxY, y);
		}
		return shouldSample || force;
	}

	function processMove(forceHitTest = false) {
		rafId = null;
		if (!isDrawing || !pendingPointer) return;
		if (!appendPendingPointer(forceHitTest)) return;

		const now = performance.now();
		if (!forceHitTest && now - lastHitTestAt < HIT_TEST_INTERVAL_MS) {
			renderOverlay(ghostHighlighted);
			return;
		}
		lastHitTestAt = now;

		ghostHighlighted = previewHits(queryCandidates(), lassoPolygonPoints);

		renderOverlay(ghostHighlighted);
	}

	async function onMouseUp() {
		if (rafId !== null) cancelAnimationFrame(rafId);
		rafId = null;
		if (!isDrawing) return;
		appendPendingPointer(true);
		isDrawing = false;
		const revision = ++selectionRevision;
		const polygon = lassoPolygonPoints.map((point) => [...point]);
		const candidates = queryCandidates();

		try {
			const selected = await collectFinalHits(candidates, polygon, revision);
			if (selected === null || revision !== selectionRevision) return;
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => resolve()),
			);
			if (revision !== selectionRevision) return;
			const el = (c as any).upperCanvasEl as HTMLCanvasElement;
			upperCtx?.clearRect(0, 0, el.width, el.height);
			if (selected.length > 0) applyFinalSelection(selected);
		} finally {
			if (revision === selectionRevision) {
				lassoPolygonPoints = [];
				ghostHighlighted = [];
				pendingPointer = null;
				if (interactionActive) {
					interactionActive = false;
					useDrawObjectManager().onGestureEnd();
				}
			}
		}
	}

	// ─── Logic ───────────────────────────────────────────────────────────────────

	function queryCandidates(): FabricObject[] {
		const queryStartedAt = performance.now();
		const rect: Rect = {
			x: lassoBBox.minX,
			y: lassoBBox.minY,
			w: lassoBBox.maxX - lassoBBox.minX,
			h: lassoBBox.maxY - lassoBBox.minY,
		};
		const candidates = useDrawObjectManager().querySelectable(
			rect,
		) as FabricObject[];
		recordPhase("lassoHitTest", performance.now() - queryStartedAt);
		return candidates;
	}

	function previewHits(
		candidates: FabricObject[],
		polygon: number[][],
	): FabricObject[] {
		const hits: FabricObject[] = [];
		const sliceStartedAt = performance.now();
		for (let i = 0; i < candidates.length; i++) {
			const obj = candidates[i];
			if (isInsideLasso(getPointRepresentation(obj), polygon, obj))
				hits.push(obj);
			if (performance.now() - sliceStartedAt >= HIT_TEST_SLICE_MS) break;
		}
		recordPhase("lassoHitTest", performance.now() - sliceStartedAt);
		return hits;
	}

	async function collectFinalHits(
		candidates: FabricObject[],
		polygon: number[][],
		revision: number,
	): Promise<FabricObject[] | null> {
		const hits: FabricObject[] = [];
		let sliceStartedAt = performance.now();
		for (let i = 0; i < candidates.length; i++) {
			const obj = candidates[i];
			if (isInsideLasso(getPointRepresentation(obj), polygon, obj))
				hits.push(obj);
			if (
				i + 1 < candidates.length &&
				performance.now() - sliceStartedAt >= HIT_TEST_SLICE_MS
			) {
				recordPhase("lassoHitTest", performance.now() - sliceStartedAt);
				await new Promise<void>((resolve) =>
					requestAnimationFrame(() => resolve()),
				);
				if (revision !== selectionRevision) return null;
				sliceStartedAt = performance.now();
			}
		}
		recordPhase("lassoHitTest", performance.now() - sliceStartedAt);
		return hits;
	}

	function isInsideLasso(
		pts: number[][],
		poly: number[][],
		obj: FabricObject,
	): boolean {
		if (pts.length === 0) return false;

		const visualWidth = obj.width! * obj.scaleX!;
		const visualHeight = obj.height! * obj.scaleY!;
		if (visualWidth < 10 && visualHeight < 10) {
			const center = obj.getCenterPoint();
			return inside([center.x, center.y], poly);
		}

		const insideCount = pts.reduce(
			(acc, p) => acc + (inside(p, poly) ? 1 : 0),
			0,
		);
		return insideCount / pts.length >= 0.85;
	}

	function getPointRepresentation(obj: FabricObjectWithCache): number[][] {
		if (obj instanceof fabric.Path) {
			return getPathPoints(obj as fabric.Path);
		}
		const coords = obj.getCoords().map((p) => [p.x, p.y]);
		const center = obj.getCenterPoint();
		coords.push([center.x, center.y]);
		return coords;
	}

	function getPathPoints(
		path: fabric.Path & { _lassoPoints?: number[][]; _lassoMatrixSig?: string },
	): number[][] {
		try {
			const matrix = path.calcTransformMatrix();
			const sig = matrix.join(",");
			if (path._lassoPoints && path._lassoMatrixSig === sig) {
				return path._lassoPoints;
			}
			// TracedPath's compatibility getter intentionally returns a detached
			// Fabric path. Read it once per cache miss instead of expanding it for
			// every check/map/forEach below.
			const pathData = path.path;
			if (!pathData || pathData.length === 0) return [];

			const pathString = pathData.map((cmd) => cmd.join(" ")).join(" ");
			const properties = new svgPathProperties(pathString);
			const totalLength = properties.getTotalLength();
			const points: number[][] = [];

			if (totalLength < 20) {
				pathData.forEach((cmd: any) => {
					if (cmd.length >= 3) {
						const rawP = new Point(
							cmd[cmd.length - 2] - path.pathOffset.x,
							cmd[cmd.length - 1] - path.pathOffset.y,
						);
						const transP = fabric.util.transformPoint(rawP, matrix);
						points.push([transP.x, transP.y]);
					}
				});
			} else {
				const numPoints = 12;
				const step = totalLength / numPoints;
				for (let i = 0; i <= totalLength; i += step) {
					const p = properties.getPointAtLength(i);
					const corrected = new Point(
						p.x - path.pathOffset.x,
						p.y - path.pathOffset.y,
					);
					const transformed = fabric.util.transformPoint(corrected, matrix);
					points.push([transformed.x, transformed.y]);
				}
			}

			path._lassoPoints = points;
			path._lassoMatrixSig = sig;
			return points;
		} catch {
			return [];
		}
	}

	function applyFinalSelection(objects: FabricObject[]) {
		const commitStartedAt = performance.now();
		try {
			const { selectTool } = useToolSelection();
			selectTool(DrawTool.Select);
			// Quadtree query order is arbitrary — sort by z like the normal drag
			// select does, else copies of the selection stack in the wrong order.
			useDrawObjectManager().getZIndexMap();
			const sortStartedAt = performance.now();
			const allSorted = [...objects].sort(compareRenderOrder);
			recordPhase("lassoSelectionSort", performance.now() - sortStartedAt);
			// Fabric constructs ActiveSelection synchronously: child coordinate entry,
			// layout and transform rewriting are one un-yieldable block, followed by a
			// one-call bitmap prewarm. A dense lasso used to hand it the entire board.
			// Keep the topmost members — the ones the user can actually see — when the
			// device-scaled safety ceiling is exceeded.
			const capped = capOrderedSelection(allSorted);
			const sorted = capped.objects;
			if (capped.omitted > 0) {
				void useToast().toast(
					`Selected the top ${DRAW_SELECTION_OBJECT_LIMIT} objects to keep this device responsive.`,
					{ color: "warning" },
				);
			}
			let activeObject: FabricObject | undefined;
			if (sorted.length > 1) {
				const constructStartedAt = performance.now();
				activeObject = new ActiveSelection(sorted, { canvas: c });
				recordPhase(
					"lassoSelectionConstruct",
					performance.now() - constructStartedAt,
				);
			} else {
				activeObject = sorted[0];
			}
			if (!activeObject) return;
			const activateStartedAt = performance.now();
			c!.setActiveObject(activeObject);
			recordPhase(
				"lassoSelectionActivate",
				performance.now() - activateStartedAt,
			);
			const topCtx = c!.getTopContext();
			const controlsStartedAt = performance.now();
			activeObject?._renderControls(topCtx);
			recordPhase(
				"lassoSelectionControls",
				performance.now() - controlsStartedAt,
			);
			const prewarmStartedAt = performance.now();
			transform.prewarm(c!);
			recordPhase(
				"lassoSelectionPrewarm",
				performance.now() - prewarmStartedAt,
			);
		} finally {
			recordPhase("lassoSelectionCommit", performance.now() - commitStartedAt);
		}
	}

	async function select() {
		if (!c) return;
		c.selection = false;
		c.skipTargetFind = true;
		c.defaultCursor = "crosshair";
	}

	return { select, events, init, destroy };
}
