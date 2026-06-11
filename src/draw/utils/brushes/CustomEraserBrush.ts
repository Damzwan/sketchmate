import * as fabric from "fabric";
import { Canvas, FabricObject, Group, Path, PencilBrush } from "fabric";
import { ClippingGroup } from "@erase2d/fabric";

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
) => {
	destination.save();
	destination.imageSmoothingEnabled = true;
	destination.imageSmoothingQuality = "high";
	destination.globalCompositeOperation = globalCompositeOperation;
	destination.resetTransform();
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
) => {
	// clip destination
	drawImage(destination, source, "destination-out");

	// draw erasing effect
	if (erasingEffect) {
		drawImage(source, erasingEffect, "source-in");
	} else {
		source.save();
		source.resetTransform();
		source.clearRect(0, 0, source.canvas.width, source.canvas.height);
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
) {
	// prepare tree
	const alpha = 1 - opacity;
	const restore = walk2([
		...objects,
		...([background, overlay] as FabricObject[]).filter((d) => !!d),
	]).map((object) => {
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

function walk(objects: FabricObject[], path: Path): FabricObject[] {
	return objects.flatMap((object) => {
		if (!object.erasable || !object.intersectsWithObject(path)) {
			return [];
		} else if (object instanceof Group && object.erasable === "deep") {
			return walk(object.getObjects(), path);
		} else {
			return [object];
		}
	});
}

function walk2(objects: FabricObject[]): FabricObject[] {
	return objects.flatMap((object) => {
		if (!object.erasable || object.isNotVisible()) {
			return [];
		} else if (object instanceof Group && object.erasable === "deep") {
			return walk2(object.getObjects());
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

export async function eraseObject(
	object: fabric.FabricObject,
	source: fabric.Path,
) {
	const clone = await source.clone();
	fabric.util.sendObjectToPlane(clone, undefined, object.calcTransformMatrix());
	commitErasing(object, clone);
	return clone;
}

export async function eraseCanvasDrawable(
	object: fabric.FabricObject,
	vpt: fabric.TMat2D | undefined,
	source: fabric.Path,
) {
	const clone = await source.clone();
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
		erase(this.canvas.getContext(), ctx, this.effectContext);
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
		// this.canvas.requestRenderAll()
	}

	async commit({
		path,
		targets,
	}: EventDetailMap["end"]): Promise<Map<fabric.FabricObject, fabric.Path>> {
		return new Map(
			await Promise.all([
				...targets.map(async (object) => {
					return [object, await eraseObject(object, path)] as const;
				}),
				...(
					[
						[
							this.canvas.backgroundImage,
							!this.canvas.backgroundVpt
								? this.canvas.viewportTransform
								: undefined,
						],
						[
							this.canvas.overlayImage,
							!this.canvas.overlayVpt
								? this.canvas.viewportTransform
								: undefined,
						],
					] as const
				)
					.filter(([object]) => !!object?.erasable)
					.map(async ([object, vptFlag]) => {
						return [
							object,
							await eraseCanvasDrawable(object as FabricObject, vptFlag, path),
						] as [fabric.FabricObject, fabric.Path];
					}),
			]),
		);
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
		const targets = walk(candidates, path);

		this.eventEmitter.dispatchEvent(
			new CustomEvent("end", {
				detail: {
					path,
					targets,
				},
				cancelable: true,
			}),
		);

		this.canvas.clearContext(this.canvas.contextTop);

		// this.canvas.requestRenderAll()

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
		// Preserve the composite operation essential for the masking effect
		const baseObj = super.toObject([
			"globalCompositeOperation",
			...additionalProperties,
		] as any);

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

		delete (baseObj as any).path;
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
		return new OptimizedEraserStroke(object.path, object);
	}
}
