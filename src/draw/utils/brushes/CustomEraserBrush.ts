import * as fabric from "fabric";
import { Canvas, FabricObject, Group, Path, PencilBrush } from "fabric";
import { ClippingGroup } from "@erase2d/fabric";
import { bakeryMarkDirty } from "@/draw/rendering/bakery/tileBakeryClient";
import {
	stripType,
	toObjectWithoutPath,
} from "@/draw/utils/brushes/brush.helpers";
import { createYielder } from "@/draw/scheduling/yielder";
import {
	FLATTEN_ERASE_CLIP_AFTER,
	LIVE_ERASE_STROKES,
} from "@/draw/history/eraseUndoPolicy";
import { recordPhase } from "@/draw/rendering/renderMetrics";

const IS_MOBILE_ERASE =
	typeof navigator !== "undefined" && /Mobi|Android/i.test(navigator.userAgent);

function isPrimaryPointer(ev: Event | undefined): boolean {
	if (!ev) return true;

	// Mobile TouchEvent
	if ("touches" in ev) {
		return ev.touches.length <= 1;
	}

	// PointerEvent (desktop, stylus)
	if ("isPrimary" in ev) {
		return (ev as PointerEvent).isPrimary;
	}

	return true;
}

export type EventDetailMap = {
	start: fabric.TEvent<fabric.TPointerEvent>;
	move: fabric.TEvent<fabric.TPointerEvent>;
	end: {
		path: fabric.Path;
		targets: fabric.FabricObject[];
	};
	redraw: { type: "start" | "render" };
	cancel: never;
};

export type ErasingEventType = keyof EventDetailMap;

export type ErasingEvent<T extends ErasingEventType> = CustomEvent<
	EventDetailMap[T]
>;

const drawImage = (
	destination: CanvasRenderingContext2D,
	source: CanvasRenderingContext2D,
	globalCompositeOperation: GlobalCompositeOperation = "source-over",
	clipRect?: { x: number; y: number; w: number; h: number },
) => {
	destination.save();
	destination.imageSmoothingEnabled = true;
	destination.imageSmoothingQuality = "high";
	destination.globalCompositeOperation = globalCompositeOperation;
	destination.resetTransform();

	// FIX: Apply clipping region so the GPU only copies the affected area
	if (clipRect) {
		destination.beginPath();
		destination.rect(clipRect.x, clipRect.y, clipRect.w, clipRect.h);
		destination.clip();
	}

	destination.drawImage(source.canvas, 0, 0);
	destination.restore();
};

/**
 *
 * @param destination context to erase
 * @param source context on which the path is drawn upon
 * @param erasingEffect effect to apply to {@link source} after clipping {@link destination}:
 * - drawing all non erasable visuals to achieve a selective erasing effect.
 * - drawing all erasable visuals without their erasers to achieve an undo erasing effect.
 */
const erase = (
	destination: CanvasRenderingContext2D,
	source: CanvasRenderingContext2D,
	erasingEffect?: CanvasRenderingContext2D,
	clipRect?: { x: number; y: number; w: number; h: number },
) => {
	// clip destination
	drawImage(destination, source, "destination-out", clipRect);

	// draw erasing effect
	if (erasingEffect) {
		drawImage(source, erasingEffect, "source-in", clipRect);
	} else {
		source.save();
		source.resetTransform();

		// FIX: Only clear the exact rectangle on the source canvas
		if (clipRect) {
			source.clearRect(clipRect.x, clipRect.y, clipRect.w, clipRect.h);
		} else {
			source.clearRect(0, 0, source.canvas.width, source.canvas.height);
		}

		source.restore();
	}
};

function drawCanvas(
	ctx: CanvasRenderingContext2D,
	canvas: Canvas,
	objects: FabricObject[],
) {
	canvas.clearContext(ctx);

	ctx.imageSmoothingEnabled = canvas.imageSmoothingEnabled;
	ctx.imageSmoothingQuality = "high";
	// @ts-expect-error node-canvas stuff
	ctx.patternQuality = "best";

	canvas._renderBackground(ctx);

	ctx.save();
	ctx.transform(...canvas.viewportTransform);
	objects.forEach((object) => object.render(ctx));
	ctx.restore();

	const clipPath = canvas.clipPath;
	if (clipPath) {
		// fabric crap
		clipPath._set("canvas", canvas);
		clipPath.shouldCache();
		clipPath._transformDone = true;
		clipPath.renderCache({ forClipping: true });
		canvas.drawClipPathOnCanvas(ctx, clipPath as any);
	}

	canvas._renderOverlay(ctx);
}

function draw(
	ctx: CanvasRenderingContext2D,
	{ inverted, opacity }: { inverted: boolean; opacity: number },
	{
		canvas,
		objects = canvas._objectsToRender || canvas._objects,
		background = canvas.backgroundImage,
		overlay = canvas.overlayImage,
	}: {
		canvas: Canvas;
		objects?: FabricObject[];
		background?: FabricObject;
		overlay?: FabricObject;
	},
	/** What counts as erasable for THIS stroke. Anything it rejects is rendered
	 *  at full opacity into the mask, i.e. protected from the stroke. */
	isErasable: (object: FabricObject) => boolean = (object) => !!object.erasable,
) {
	// prepare tree
	const alpha = 1 - opacity;
	const restore = walk2(
		[
			...objects,
			...([background, overlay] as FabricObject[]).filter((d) => !!d),
		],
		isErasable,
	).map((object) => {
		if (!inverted) {
			//  render only non-erasable objects
			const opacity = object.opacity;
			object.opacity *= alpha;
			object.parent?.set("dirty", true);
			return { object, opacity };
		} else if (object.clipPath instanceof ClippingGroup) {
			//  render all objects without eraser
			object.clipPath["blockErasing"] = true;
			object.clipPath.set("dirty", true);
			object.set("dirty", true);
			return { object, clipPath: object.clipPath };
		}
	});

	// draw
	drawCanvas(ctx, canvas, objects);

	// restore
	restore.forEach((entry) => {
		if (!entry) {
			return;
		}
		if (entry.opacity) {
			entry.object.opacity = entry.opacity;
			entry.object.parent?.set("dirty", true);
		} else if (entry.clipPath) {
			entry.clipPath["blockErasing"] = false;
			entry.clipPath.set("dirty", true);
			entry.object.set("dirty", true);
		}
	});
}

function walk(
	objects: FabricObject[],
	path: Path,
	isErasable: (object: FabricObject) => boolean = (object) => !!object.erasable,
): FabricObject[] {
	return objects.flatMap((object) => {
		if (!isErasable(object) || !object.intersectsWithObject(path)) {
			return [];
		} else if (object instanceof Group && object.erasable === "deep") {
			return walk(object.getObjects(), path, isErasable);
		} else {
			return [object];
		}
	});
}

function walk2(
	objects: FabricObject[],
	isErasable: (object: FabricObject) => boolean = (object) => !!object.erasable,
): FabricObject[] {
	return objects.flatMap((object) => {
		if (!isErasable(object) || object.isNotVisible()) {
			return [];
		} else if (object instanceof Group && object.erasable === "deep") {
			return walk2(object.getObjects(), isErasable);
		} else {
			return [object];
		}
	});
}

const assertClippingGroup = (object: fabric.FabricObject) => {
	const curr = object.clipPath;

	if (curr instanceof ClippingGroup) {
		return curr;
	}

	const strokeWidth = object.strokeWidth;
	const strokeWidthFactor = new fabric.Point(strokeWidth, strokeWidth);
	const strokeVector = object.strokeUniform
		? strokeWidthFactor.divide(object.getObjectScaling())
		: strokeWidthFactor;

	const next = new ClippingGroup([], {
		width: object.width + strokeVector.x,
		height: object.height + strokeVector.y,
	});

	if (curr) {
		const { x, y } = curr.translateToOriginPoint(
			new fabric.Point(),
			curr.originX,
			curr.originY,
		);
		curr.originX = curr.originY = "center";
		fabric.util.sendObjectToPlane(
			curr,
			undefined,
			fabric.util.createTranslateMatrix(x, y),
		);
		next.add(curr as FabricObject);
	}

	return (object.clipPath = next);
};

export function commitErasing(
	object: fabric.FabricObject,
	sourceInObjectPlane: fabric.Path,
) {
	const clipPath = assertClippingGroup(object);
	clipPath.add(sourceInObjectPlane);
	clipPath.set("dirty", true);
	object.set("dirty", true);
}

/**
 * Fast per-target stroke clone. `source.clone()` is a full
 * toObject → compressedTrace → fromObject → SVG-parse round trip PER erased
 * object — a long stroke over many targets made commit() jank. The parsed
 * path array is never mutated (only transform props change via
 * sendObjectToPlane), so sharing it by reference is safe. `id` must be copied:
 * erase-undo removes clip children by stroke id.
 */
function clonePathForErase(source: fabric.Path): fabric.Path {
	const clone = new OptimizedEraserStroke(source.path as any, {
		id: (source as any).id,
		left: source.left,
		top: source.top,
		originX: source.originX,
		originY: source.originY,
		scaleX: source.scaleX,
		scaleY: source.scaleY,
		angle: source.angle,
		skewX: source.skewX,
		skewY: source.skewY,
		flipX: source.flipX,
		flipY: source.flipY,
		fill: source.fill,
		stroke: source.stroke,
		strokeWidth: source.strokeWidth,
		strokeLineCap: source.strokeLineCap,
		strokeLineJoin: source.strokeLineJoin,
		strokeMiterLimit: source.strokeMiterLimit,
		strokeDashArray: source.strokeDashArray,
		opacity: source.opacity,
		globalCompositeOperation: source.globalCompositeOperation,
	});
	return clone as unknown as fabric.Path;
}

export async function eraseObject(
	object: fabric.FabricObject,
	source: fabric.Path,
) {
	let clone: fabric.Path;
	try {
		clone = clonePathForErase(source);
	} catch {
		clone = await source.clone(); // fail safe to the slow exact clone
	}
	fabric.util.sendObjectToPlane(clone, undefined, object.calcTransformMatrix());
	commitErasing(object, clone);
	return clone;
}

export async function eraseCanvasDrawable(
	object: fabric.FabricObject,
	vpt: fabric.TMat2D | undefined,
	source: fabric.Path,
) {
	let clone: fabric.Path;
	try {
		clone = clonePathForErase(source);
	} catch {
		clone = await source.clone();
	}
	const d =
		vpt &&
		object.translateToOriginPoint(
			new fabric.Point(),
			object.originX,
			object.originY,
		);
	fabric.util.sendObjectToPlane(
		clone,
		undefined,
		d
			? fabric.util.multiplyTransformMatrixArray([
					[1, 0, 0, 1, d.x, d.y],
					// apply vpt from center of drawable
					vpt,
					[1, 0, 0, 1, -d.x, -d.y],
					object.calcTransformMatrix(),
				])
			: object.calcTransformMatrix(),
	);
	commitErasing(object, clone);
	return clone;
}

const setCanvasDimensions = (
	el: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
	{ width, height }: fabric.TSize,
	retinaScaling = 1,
) => {
	el.width = width;
	el.height = height;
	if (retinaScaling > 1) {
		el.setAttribute("width", (width * retinaScaling).toString());
		el.setAttribute("height", (height * retinaScaling).toString());
		ctx.scale(retinaScaling, retinaScaling);
	}
};

/**
 * Supports **selective** erasing: only erasable objects are affected by the eraser brush.
 *
 * Supports **{@link inverted}** erasing: the brush can "undo" erasing.
 *
 * Supports **alpha** erasing: setting the alpha channel of the `color` property controls the eraser intensity.
 *
 * In order to support selective erasing, the brush clips the entire canvas and
 * masks all non-erasable objects over the erased path, see {@link draw}.
 *
 * If **{@link inverted}** draws all objects, erasable objects without their eraser, over the erased path.
 * This achieves the desired effect of seeming to erase or undo erasing on erasable objects only.
 *
 * After erasing is done the `end` event {@link ErasingEndEvent} is fired, after which erasing will be committed to the tree.
 * @example
 * canvas = new Canvas();
 * const eraser = new EraserBrush(canvas);
 * canvas.freeDrawingBrush = eraser;
 * canvas.isDrawingMode = true;
 * eraser.on('start', (e) => {
 *    console.log('started erasing');
 *    // prevent erasing
 *    e.preventDefault();
 * });
 * eraser.on('end', (e) => {
 *    const { targets: erasedTargets, path } = e.detail;
 *    e.preventDefault(); // prevent erasing being committed to the tree
 *    eraser.commit({ targets: erasedTargets, path }); // commit manually since default was prevented
 * });
 *
 * In case of performance issues trace {@link drawEffect} calls and consider preventing it from executing
 * @example
 * const eraser = new EraserBrush(canvas);
 * eraser.on('redraw', (e) => {
 *    // prevent effect redraw on pointer down (e.g. useful if canvas didn't change)
 *    e.detail.type === 'start' && e.preventDefault());
 *    // prevent effect redraw after canvas has rendered (effect will become stale)
 *    e.detail.type === 'render' && e.preventDefault());
 * });
 */
export class CustomEraserBrush extends PencilBrush {
	/**
	 * When set to `true` the brush will create a visual effect of undoing erasing
	 */
	inverted = false;
	decimate = 1.5;
	effectContext: CanvasRenderingContext2D;

	/**
	 * Optional. Restricts the selective-erase mask render in {@link drawEffect}
	 * to the supplied objects (e.g. only on-screen ones), returned in paint
	 * (z) order. Off-viewport objects cannot contribute a visible pixel to a
	 * screen-space mask, so narrowing this avoids a full native re-render of
	 * every object on pointer-down. When unset, all canvas objects are used.
	 */
	protectObjectsProvider?: () => FabricObject[];

	/**
	 * Optional. Resolves the candidate objects tested against the eraser path in
	 * {@link _finalizeAndAddPath}, e.g. via a spatial index, instead of scanning
	 * the whole object list. {@link walk} still runs the precise intersection
	 * test, so an over-inclusive (padded) result is safe. When unset, all canvas
	 * objects are used.
	 */
	targetCandidatesProvider?: (path: Path) => FabricObject[];

	/**
	 * Optional. Overrides what this brush treats as erasable, for BOTH the live
	 * mask and the committed targets.
	 *
	 * Layer scoping needs exactly this. Restricting only the target candidates
	 * fixes the commit but not the stroke: {@link drawEffect} dims every erasable
	 * object under the pointer, so content on other layers visibly disappeared
	 * while erasing and snapped back on release. Rejecting it here renders it at
	 * full opacity into the mask instead — protected, like a non-erasable object.
	 *
	 * NB this must never mutate `obj.erasable`: that property is serialized
	 * (customProperties), so a mutation would persist and sync to peers.
	 */
	erasableFilter?: (object: FabricObject) => boolean;

	/**
	 * Once an object's ClippingGroup holds more than this many eraser strokes,
	 * the strokes are collapsed into a single cached bitmap mask (see
	 * {@link bakeClipGroupIfNeeded}). This bounds the per-render clip cost, which
	 * otherwise grows with every erase and makes repeated erasing super-linear.
	 * Set to 0 to disable (keep fully-vector clips).
	 */
	flattenClipAfter = FLATTEN_ERASE_CLIP_AFTER;

	/**
	 * When a flatten fires, this many of the NEWEST stroke children are kept as
	 * individual vectors (with their ids) so undo — which removes a stroke from
	 * the clip by id — still works for recent erases. Only the older overflow is
	 * baked into the single union image. Keep this comfortably above the erase
	 * undo depth retained by history.
	 */
	keepVectorClips = LIVE_ERASE_STROKES;

	private eventEmitter: EventTarget;
	private active = false;
	private _disposer?: VoidFunction;

	private _afterRenderHandler?: (opts: {
		ctx: CanvasRenderingContext2D;
	}) => void;
	private _isPrimaryPointerActive = false;

	constructor(canvas: fabric.Canvas) {
		super(canvas);
		const el = document.createElement("canvas");
		const ctx = el.getContext("2d");
		if (!ctx) {
			throw new Error("Failed to get context");
		}
		setCanvasDimensions(el, ctx, canvas, this.canvas.getRetinaScaling());
		this.effectContext = ctx;
		this.eventEmitter = new EventTarget();
	}

	/**
	 * @returns disposer make sure to call it to avoid memory leaks
	 */
	on<T extends ErasingEventType>(
		type: T,
		cb: (evt: ErasingEvent<T>) => any,
		options?: boolean | AddEventListenerOptions,
	) {
		this.eventEmitter.addEventListener(type, cb as EventListener, options);
		return () =>
			this.eventEmitter.removeEventListener(type, cb as EventListener, options);
	}

	/**
	 * Re-sync the effect canvas to the fabric canvas dimensions. Call when the
	 * brush is REUSED across tool selections — the canvas may have resized
	 * (rotation, keyboard) since the brush was constructed.
	 */
	syncDimensions(): void {
		setCanvasDimensions(
			this.effectContext.canvas,
			this.effectContext,
			this.canvas,
			this.canvas.getRetinaScaling(),
		);
	}

	drawEffect() {
		// Narrow the mask render to the provided objects when available.
		const objects = this.protectObjectsProvider?.();
		draw(
			this.effectContext,
			{
				opacity: new fabric.Color(this.color).getAlpha(),
				inverted: this.inverted,
			},
			objects ? { canvas: this.canvas, objects } : { canvas: this.canvas },
			this.erasableFilter,
		);
	}

	/**
	 * @override
	 */
	_setBrushStyles(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
		super._setBrushStyles(ctx);
		ctx.strokeStyle = "black";
	}

	/**
	 * @override strictly speaking the eraser needs a full render only if it has opacity set.
	 * However since {@link PencilBrush} is designed for subclassing that is what we have to work with.
	 */
	needsFullRender(): boolean {
		return true;
	}

	/**
	 * @override erase
	 */
	_render(ctx: CanvasRenderingContext2D = this.canvas.getTopContext()): void {
		super._render(ctx);

		// 1. Grab the points of the current stroke
		const points = this["_points"];
		if (!points || points.length === 0) return;

		// 2. Calculate the World bounding box of the stroke so far
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const p of points) {
			minX = Math.min(minX, p.x);
			minY = Math.min(minY, p.y);
			maxX = Math.max(maxX, p.x);
			maxY = Math.max(maxY, p.y);
		}

		// 3. Convert to physical screen pixels
		const vpt = this.canvas.viewportTransform!;
		const dpr = this.canvas.getRetinaScaling
			? this.canvas.getRetinaScaling()
			: window.devicePixelRatio || 1;

		// Pad the box by the brush width to ensure smooth anti-aliased edges aren't clipped
		const pad = (this.width / 2) * vpt[0] * dpr + 5;

		const screenMinX = (minX * vpt[0] + vpt[4]) * dpr;
		const screenMinY = (minY * vpt[3] + vpt[5]) * dpr;
		const screenMaxX = (maxX * vpt[0] + vpt[4]) * dpr;
		const screenMaxY = (maxY * vpt[3] + vpt[5]) * dpr;

		const clipRect = {
			x: screenMinX - pad,
			y: screenMinY - pad,
			w: screenMaxX - screenMinX + pad * 2,
			h: screenMaxY - screenMinY + pad * 2,
		};

		// 4. Pass the clipRect to drastically limit the GPU copy operation!
		erase(this.canvas.getContext(), ctx, this.effectContext, clipRect);
	}

	/**
	 * @override {@link drawEffect}
	 */

	onMouseDown(
		pointer: fabric.Point,
		context: fabric.TEvent<fabric.TPointerEvent>,
	): void {
		const ev = context?.e;
		if (!isPrimaryPointer(ev)) return; // ignore secondary touches/fingers

		// allow listeners to cancel
		if (
			!this.eventEmitter.dispatchEvent(
				new CustomEvent("start", { detail: context, cancelable: true }),
			)
		) {
			return;
		}

		this.active = true;

		// initial redraw if allowed
		this.eventEmitter.dispatchEvent(
			new CustomEvent("redraw", {
				detail: { type: "start" },
				cancelable: true,
			}),
		) && this.drawEffect();

		// attach after:render handler once
		if (!this._afterRenderHandler) {
			this._afterRenderHandler = ({
				ctx,
			}: {
				ctx: CanvasRenderingContext2D;
			}) => {
				if (ctx !== this.canvas.getContext()) return;

				this.eventEmitter.dispatchEvent(
					new CustomEvent("redraw", {
						detail: { type: "render" },
						cancelable: true,
					}),
				) && this.drawEffect();

				this._render();
			};
			this.canvas.on("after:render", this._afterRenderHandler);
		}

		super.onMouseDown(pointer, context);
	}

	/**
	 * @override run if active
	 */
	onMouseMove(
		pointer: fabric.Point,
		context: fabric.TEvent<fabric.TPointerEvent>,
	): void {
		const ev = context?.e;
		if (!isPrimaryPointer(ev)) return; // ignore secondary touches/fingers

		if (!this.active) return;

		this.eventEmitter.dispatchEvent(
			new CustomEvent("move", { detail: context, cancelable: true }),
		) && super.onMouseMove(pointer, context);
	}

	/**
	 * @override run if active, dispose of {@link drawEffect} listener
	 */
	onMouseUp(context: fabric.TEvent<fabric.TPointerEvent>): boolean {
		const ev = context?.e;
		if (!isPrimaryPointer(ev)) return false;

		if (this.active) {
			super.onMouseUp(context);
		}

		this.active = false;

		if (this._afterRenderHandler) {
			try {
				this.canvas.off("after:render", this._afterRenderHandler);
			} catch {}
			this._afterRenderHandler = undefined;
		}

		return false;
	}

	/**
	 * @override {@link fabric.PencilBrush} logic
	 */
	convertPointsToSVGPath(points: fabric.Point[]): fabric.util.TSimplePathData {
		return super.convertPointsToSVGPath(
			this.decimate ? this.decimatePoints(points, this.decimate) : points,
		);
	}

	/**
	 * @override
	 */
	// @ts-ignore
	createPath(pathData: fabric.util.TSimplePathData) {
		// We instantiate our synced class directly instead of using super.createPath()
		const path = new OptimizedEraserStroke(pathData, {
			fill: null,
			strokeWidth: this.width,
			strokeLineCap: this.strokeLineCap,
			strokeMiterLimit: this.strokeMiterLimit,
			strokeLineJoin: this.strokeLineJoin,
			strokeDashArray: this.strokeDashArray,

			// Inject the @erase2d specific logic
			...(this.inverted
				? {
						globalCompositeOperation: "source-over",
						stroke: "white",
					}
				: {
						globalCompositeOperation: "destination-out",
						stroke: "black",
						opacity: new fabric.Color(this.color).getAlpha(),
					}),
		});

		if (this.shadow) {
			// @ts-ignore - Fabric typing workaround
			this.shadow.affectStroke = true;
			path.shadow = new fabric.Shadow(this.shadow);
		}

		return path;
	}

	cancel(): void {
		this.active = false;

		if (this._afterRenderHandler) {
			try {
				this.canvas.off("after:render", this._afterRenderHandler);
			} catch {}
			this._afterRenderHandler = undefined;
		}

		// NOTE: the previous version of this block was corrupted (chained
		// assignments collapsed onto numeric literals, e.g. `0(this as any)...`)
		// and silently threw, so the point/flag reset never actually ran. Fixed.
		try {
			if (Array.isArray(this["_points"])) this["_points"].length = 0;
			(this as any)._lastPoint = null;
			(this as any)._decimatedPoints = [];
			(this as any)._isCurrentlyDrawing = false;
			(this as any)._needsFullRender = false;
		} catch {}

		this.canvas.forEachObject((obj) => {
			obj.set({
				selectable: true,
				evented: true,
				hasControls: true,
				hasBorders: true,
			});
		});

		this.canvas.clearContext(this.canvas.contextTop);
	}

	async commit({
		path,
		targets,
	}: EventDetailMap["end"]): Promise<Map<fabric.FabricObject, fabric.Path>> {
		// A big erase hits MANY objects. `eraseObject` per target — clone the
		// stroke into the object plane + add a clip child — is synchronous, and
		// running them all through Promise.all fired every body back-to-back with
		// NO yield to input: one long main-thread block that made a pan/zoom right
		// after a big erase stutter (ANR territory). Drive them through a yielder
		// so input can interleave. `eraseObject` bodies are synchronous, so this
		// is purely about spacing them, not concurrency — order is irrelevant
		// (destination-out masks commute).
		const result = new Map<fabric.FabricObject, fabric.Path>();
		const yielder = createYielder({
			budgetMs: IS_MOBILE_ERASE ? 4 : 8,
			label: "erase-apply",
		});
		for (const object of targets) {
			const startedAt = performance.now();
			try {
				result.set(object, await eraseObject(object, path));
			} finally {
				recordPhase("eraseClipApply", performance.now() - startedAt);
			}
			if (yielder.shouldYield()) await yielder.yield();
		}

		// Background / overlay drawables (at most two) — cheap, no yield needed.
		const drawables = [
			[
				this.canvas.backgroundImage,
				!this.canvas.backgroundVpt ? this.canvas.viewportTransform : undefined,
			],
			[
				this.canvas.overlayImage,
				!this.canvas.overlayVpt ? this.canvas.viewportTransform : undefined,
			],
		] as const;
		for (const [object, vptFlag] of drawables) {
			if (!object?.erasable) continue;
			result.set(
				object as FabricObject,
				await eraseCanvasDrawable(object as FabricObject, vptFlag, path),
			);
		}

		// Bound clip-path growth. Only objects hit by THIS stroke can have grown,
		// so we only check those. Amortized O(1) per stroke: a bake happens once
		// every `flattenClipAfter` strokes per object. Yielded too — a flatten
		// bake (toCanvasElement + toDataURL) is itself heavy.
		if (this.flattenClipAfter > 0) {
			yielder.reset();
			for (const object of targets) {
				try {
					await this.bakeClipGroupIfNeeded(object);
				} catch {
					// On ANY failure, leave the existing clip untouched. Never risk
					// corrupting a drawing for the sake of a perf optimization.
				}
				if (yielder.shouldYield()) await yielder.yield();
			}
		}

		return result;
	}

	/**
	 * Collapse an object's accumulated eraser strokes into a single cached
	 * bitmap mask, keeping the clip a {@link ClippingGroup} so @erase2d's
	 * rendering is unchanged.
	 *
	 * WHY: every erase adds a vector child to the object's ClippingGroup, and
	 * every subsequent render / tile re-bake / completeness check re-rasterizes
	 * the WHOLE accumulated stack. Erasing repeatedly over the same objects
	 * makes that stack grow, so each stroke is more expensive than the last —
	 * the cost is roughly O(objects x strokes^2). That is the "lags more and
	 * more" you're seeing; it is NOT the deferred cleanup.
	 *
	 * EQUIVALENCE: erasing is destination-out compositing, and
	 *   destination-out(A) then destination-out(B)  ==  destination-out(A u B).
	 * So replacing N stroke children with ONE image of their union, composited
	 * destination-out, produces exactly the same mask — but renders in O(1)
	 * forever after instead of O(N).
	 *
	 * TRADEOFF: the union is a bitmap, so erased EDGES become raster at the bake
	 * resolution (retina, capped). Strokes stay fully vector until the threshold,
	 * and the bake is at device resolution, so it's imperceptible at normal zoom.
	 * Raise `flattenClipAfter` (or set 0) if you need vector-sharp edges at deep
	 * zoom on heavily-erased objects.
	 *
	 * NOTE: the coordinate/scale placement of the baked image is the one thing
	 * worth eyeballing on a live test — verify erased regions don't shift after
	 * a bake fires. The method fails safe (keeps the original group) on error.
	 */
	private async bakeClipGroupIfNeeded(object: FabricObject): Promise<void> {
		const cg = object.clipPath as unknown;
		if (!(cg instanceof ClippingGroup)) return;

		const children = cg.getObjects();
		const bakedImages = children.filter((child) => child.type === "image");
		const vectorStrokes = children.filter((child) => child.type !== "image");
		if (
			vectorStrokes.length <= this.flattenClipAfter &&
			bakedImages.length <= 1
		) {
			return;
		}

		// PARTIAL flatten: bake only the OLDEST overflow, keep the newest
		// `keepVectorClips` as individual vector children WITH their stroke ids so
		// undo (removeStrokeFromClip by id) still restores recent erases exactly.
		// destination-out is commutative over the mask union, so baking a subset
		// and keeping the rest yields the identical hole. (A full flatten wiped
		// EVERY id, which is why undo stopped matching the original.)
		const vectorOverflow = vectorStrokes.slice(
			0,
			Math.max(0, vectorStrokes.length - this.keepVectorClips),
		);
		// Include an existing baked image so every compaction replaces it instead
		// of accumulating one image child per batch.
		const toBake = [...bakedImages, ...vectorOverflow];
		if (toBake.length === 0) return;

		// Render the union of the existing strokes' SHAPES (force source-over so
		// we get coverage, not the destination-out hole-punch). Clone so we never
		// mutate the live children.
		const clones = (await Promise.all(
			toBake.map((child) => child.clone()),
		)) as FabricObject[];
		clones.forEach((clone) => {
			(clone as any).globalCompositeOperation = "source-over";
			clone.set("dirty", true);
		});

		const union = new fabric.Group(clones);
		const center = union.getCenterPoint();
		const uw = union.width;
		const uh = union.height;
		if (!uw || !uh) return;

		// Retina resolution, capped so a giant object can't allocate a huge buffer.
		let multiplier = this.canvas.getRetinaScaling?.() || 1;
		const MAX_BAKE_PX = 4_194_304; // ~4MP
		const area = uw * uh * multiplier * multiplier;
		if (area > MAX_BAKE_PX) multiplier *= Math.sqrt(MAX_BAKE_PX / area);

		// @ts-ignore — toCanvasElement exists on Group
		const flattenStartedAt = performance.now();
		const el: HTMLCanvasElement = union.toCanvasElement({ multiplier });
		recordPhase("eraseClipFlatten", performance.now() - flattenStartedAt);
		if (!el.width || !el.height) return;

		const baked = new fabric.Image(el, {
			originX: "center",
			originY: "center",
			left: center.x,
			top: center.y,
			scaleX: uw / el.width,
			scaleY: uh / el.height,
			// Match how the strokes were composited inside the group, so the union
			// punches exactly the same holes.
			globalCompositeOperation: "destination-out",
		});
		// DELIBERATELY NOT setting `baked.src` here.
		//
		// This used to do `baked.src = el.toDataURL("image/png")` — a SYNCHRONOUS
		// PNG encode of a canvas up to MAX_BAKE_PX (~4MP), on the main thread, in
		// the middle of the erase commit. That is an atomic, un-yieldable block of
		// roughly 100-500ms on mobile: on its own enough to trip an ANR, and it
		// fired every `flattenClipAfter` strokes per object.
		//
		// It was also pure waste. fabric's `getSrc()` (used by `toObject`) checks
		// `if (element.toDataURL) return element.toDataURL()` FIRST — and our
		// element is a canvas — so serialization produces the identical data URL
		// on its own, from the canvas, whether or not `src` is set. Nothing in the
		// RENDER path reads `src` (only toObject/toString do), so dropping the
		// eager encode changes no pixels and no persisted output; it just moves
		// the cost to the moment something actually serializes, which is already
		// a yielded/background path (save, sync).
		(object as any).__hasImageClip = true;

		// Swap ONLY the baked (oldest) children for the single union image; the
		// newest `keepVectorClips` stay as-is. Order among destination-out
		// children is irrelevant to the resulting mask, so appending is safe.
		cg.remove(...toBake);
		cg.add(baked as unknown as FabricObject);
		cg.set("dirty", true);
		object.set("dirty", true);
		bakeryMarkDirty(object);

		// RETAIN the baked strokes OFF the render tree so erase-undo can still
		// remove them (undo matches by stroke id, which the image no longer
		// carries). They are small vectors and NOT in `cg._objects`, so they add
		// no render cost — only the image renders. On undo of a baked stroke the
		// clip is un-flattened from this list (see removeStrokeFromClip in
		// erase.helper), which also drops the image and its base64, freeing
		// memory. Bounded so a pathologically-erased object can't grow it without
		// limit; dropping the oldest just makes those very old erases
		// un-undoable, which is exactly the pre-fix behaviour.
		const RETAIN_CAP = 400;
		const prevRetained: FabricObject[] = (
			(object as any).__bakedClipStrokes ?? []
		).filter((child: FabricObject) => child.type !== "image");
		let retained = [...prevRetained, ...vectorOverflow];
		if (retained.length > RETAIN_CAP) {
			const drop = retained.slice(0, retained.length - RETAIN_CAP);
			drop.forEach((s) => (s as any).dispose?.());
			retained = retained.slice(retained.length - RETAIN_CAP);
		}
		(object as any).__bakedClipStrokes = retained;

		// Only the temporary source-over clones are dead; the originals are kept.
		clones.forEach((clone) => (clone as any).dispose?.());
	}

	/**
	 * @override handle events
	 */
	_finalizeAndAddPath(): void {
		const points = this["_points"];

		if (points.length < 2) {
			this.eventEmitter.dispatchEvent(
				new CustomEvent("cancel", {
					cancelable: false,
				}),
			);
			return;
		}

		const path = this.createPath(this.convertPointsToSVGPath(points));

		// Resolve candidates via the spatial index when available; walk() still
		// runs the precise intersection + deep-group recursion on this subset.
		const candidates = this.targetCandidatesProvider
			? this.targetCandidatesProvider(path)
			: this.canvas.getObjects();
		const targets = walk(candidates, path, this.erasableFilter);

		const r = path.getBoundingRect(true, true);

		const pad = (path.strokeWidth ?? 0) * 1.5;

		this.eventEmitter.dispatchEvent(
			new CustomEvent("end", {
				detail: {
					path,
					targets,

					dirtyRect: {
						x: r.left - pad,
						y: r.top - pad,
						w: r.width + pad * 2,
						h: r.height + pad * 2,
					},
				},
				cancelable: true,
			}),
		);

		this.canvas.clearContext(this.canvas.contextTop);

		this._resetShadow();
	}

	dispose() {
		const { canvas } = this.effectContext;
		// prompt GC
		canvas.width = canvas.height = 0;
		// release ref?
		// delete this.effectContext
	}
}

export class OptimizedEraserStroke extends Path {
	static type = "OptimizedEraserStroke";

	constructor(path: string | any[], options: any) {
		super(path, options);
	}

	// @ts-ignore
	toObject(additionalProperties: string[] = []) {
		// Preserve the composite operation essential for the masking effect.
		// Path.toObject deep-copies every segment and it is discarded below —
		// fromObject rebuilds from `compressedTrace`. See toObjectWithoutPath.
		const baseObj = toObjectWithoutPath(this, (p) => super.toObject(p as any), [
			"globalCompositeOperation",
			...additionalProperties,
		]);

		// DEFLATION: Compress the parsed path array
		const compressedTrace: (number | string)[] = [];
		let lastX = 0,
			lastY = 0;

		for (const cmd of this.path) {
			const type = cmd[0];

			if (type === "M" || type === "L") {
				const ix = Math.round((cmd[1] as number) * 10);
				const iy = Math.round((cmd[2] as number) * 10);

				if (type === "M") {
					compressedTrace.push("M", ix, iy);
				} else {
					compressedTrace.push("L", ix - lastX, iy - lastY);
				}
				lastX = ix;
				lastY = iy;
			} else if (type === "Q") {
				const icpx = Math.round((cmd[1] as number) * 10);
				const icpy = Math.round((cmd[2] as number) * 10);
				const ix = Math.round((cmd[3] as number) * 10);
				const iy = Math.round((cmd[4] as number) * 10);

				compressedTrace.push(
					"Q",
					icpx - lastX,
					icpy - lastY,
					ix - lastX,
					iy - lastY,
				);
				lastX = ix;
				lastY = iy;
			}
		}

		return {
			...baseObj,
			compressedTrace,
		};
	}

	static async fromObject(object: any) {
		// INFLATION: Convert the flat delta array back into an SVG string
		if (object.compressedTrace && !object.path) {
			let svg = "";
			let lastX = 0,
				lastY = 0;
			const trace = object.compressedTrace;

			for (let i = 0; i < trace.length; ) {
				const cmd = trace[i];

				if (cmd === "M" || cmd === "L") {
					let ix, iy;
					if (cmd === "M") {
						ix = trace[i + 1] as number;
						iy = trace[i + 2] as number;
					} else {
						ix = (trace[i + 1] as number) + lastX;
						iy = (trace[i + 2] as number) + lastY;
					}
					svg += `${cmd} ${ix / 10} ${iy / 10} `;
					lastX = ix;
					lastY = iy;
					i += 3;
				} else if (cmd === "Q") {
					const icpx = (trace[i + 1] as number) + lastX;
					const icpy = (trace[i + 2] as number) + lastY;
					const ix = (trace[i + 3] as number) + lastX;
					const iy = (trace[i + 4] as number) + lastY;

					svg += `Q ${icpx / 10} ${icpy / 10} ${ix / 10} ${iy / 10} `;
					lastX = ix;
					lastY = iy;
					i += 5;
				} else {
					i++;
				}
			}
			object.path = svg.trim();
		}
		// stripType: this path bypasses enlivenStrokeProps, so `type` would reach
		// the constructor and trigger fabric's "Setting type has no effect" log.
		return new OptimizedEraserStroke(object.path, stripType(object));
	}
}
