import * as fabric from "fabric";
import { BaseBrush, FabricObject, type Point } from "fabric";
import { getRenderDpr } from "@/draw/config/renderQuality.config";
import { getTopContextEpoch } from "@/draw/rendering/fabricRenderState";
import { SmudgeMode } from "@/draw/tools/tool.types";
import {
	bakedCanvasDataUrl,
	warmBakedCanvasEncode,
} from "@/draw/utils/brushes/bakedImageSource";
import { enlivenStrokeProps } from "@/draw/utils/brushes/brush.helpers";
import {
	applyPatchAlpha,
	clampBounds,
	fitPatchRaster,
	growBounds,
	type PixelBounds,
	smudgeSpacing,
	smudgeStampAlpha,
	stampPositions,
	unionBounds,
} from "@/draw/utils/brushes/smudgePatch";

/**
 * SMUDGE — drag the colours that are already on the canvas.
 *
 * ## How it works
 *
 * Everything else in `brushes/` paints something new. Smudge has to paint with
 * what is already there, on an engine whose canvas is a tiled cache of VECTOR
 * objects — there is no pixel buffer to reach into and rearrange.
 *
 * So the stroke works on a copy:
 *
 *   1. **mouse:down** — blit the visible canvas into an offscreen working
 *      buffer. One GPU-side `drawImage`, never `getImageData`: a readback of
 *      the live drawing surface permanently demotes it to software rendering in
 *      Chromium and fences the driver on the Adreno/Mali stacks (see
 *      `canvasPixelRead.ts`). Every later read is against the working buffer,
 *      which is declared `willReadFrequently` because it is meant to be read.
 *   2. **mouse:move** — stamp along the segment. Each stamp lifts a soft-edged
 *      disc out of the working buffer and lays it back down slightly further
 *      along, so colour is carried by the tip exactly like wet paint. The
 *      changed region is blitted to the top context as the live preview.
 *   3. **mouse:up** — diff the smeared region against the untouched canvas,
 *      keep only what changed (see `applyPatchAlpha`), and add THAT as a single
 *      `SmudgeStroke` object.
 *
 * ## Why the result is an object
 *
 * The engine's contract is that a tile is a pure function of the objects in it,
 * baked anywhere — main thread, tile worker, another device after a sync. A
 * stroke that meant "whatever pixels happened to be underneath at the time"
 * could not satisfy that. Baking the smear into a self-contained bitmap can:
 * it renders identically everywhere, undoes like any other object, and travels
 * over the wire as ordinary object JSON.
 *
 * The trade this accepts: a smudge is a snapshot. Move or recolour a stroke
 * that was smudged earlier and the smear stays where it was — the same bargain
 * every raster app makes, and the reason the patch keeps only changed pixels
 * rather than a rectangle of baked-in background.
 */
export class SmudgeBrush extends BaseBrush {
	/** 0-100. How much colour each stamp carries. */
	public smudgeStrength = 60;
	public smudgeMode: SmudgeMode = SmudgeMode.Pull;

	/**
	 * `cancelPenAction` empties this to abort a stroke mid-gesture, so the state
	 * that decides "is there anything to commit" has to live in it.
	 */
	private _points: Point[] = [];

	/** The smear, in device pixels of the visible canvas. */
	private _work?: CanvasRenderingContext2D;
	/** One tip-sized scratch surface, reused for every stamp. */
	private _stamp?: CanvasRenderingContext2D;
	/** Soft radial falloff, drawn once per stroke. */
	private _mask?: HTMLCanvasElement;
	/** 1x1 reader used by Blend to average a disc. */
	private _average?: CanvasRenderingContext2D;

	private _radius = 0;
	private _dpr = 1;
	private _dirty: PixelBounds | null = null;
	private _lastX = 0;
	private _lastY = 0;
	private _vptKey = "";
	private _epoch = -1;

	/** Tip diameter ceiling in device pixels — see `_beginStroke`. */
	private static readonly MAX_TIP_PX = 768;

	onMouseDown(pointer: Point) {
		this._reset();
		if (!this._beginStroke()) return;
		this._points.push(pointer);
		const device = this._toDevice(pointer);
		this._lastX = device.x;
		this._lastY = device.y;
	}

	onMouseMove(pointer: Point) {
		if (!this._work) return;

		// The whole stroke is expressed in the viewport the snapshot was taken in.
		// A pan or zoom mid-stroke (a two-finger gesture that beat the drawing
		// cancel) would smear the wrong pixels onto the wrong place, so drop it.
		if (this._vptKey !== this._viewportKey()) {
			this._abort();
			return;
		}

		this._points.push(pointer);
		const { x, y } = this._toDevice(pointer);
		const spacing = smudgeSpacing(this._radius);
		let touched: PixelBounds | null = null;

		for (const step of stampPositions(
			this._lastX,
			this._lastY,
			x,
			y,
			spacing,
		)) {
			this._stampAt(this._lastX, this._lastY, step.x, step.y);
			touched = growBounds(touched, step.x, step.y, this._radius + 1);
			this._lastX = step.x;
			this._lastY = step.y;
		}

		if (!touched) return;
		this._dirty = unionBounds(this._dirty, touched);
		this._preview(touched);
	}

	onMouseUp() {
		const canvas = this.canvas;
		const stroke = this._points.length > 1 ? this._buildStroke() : null;

		this._reset();
		canvas.clearContext(canvas.contextTop);

		if (stroke) {
			canvas.add(stroke);
			stroke.setCoords();
			canvas.fire("path:created", { path: stroke });
		}
		return false;
	}

	/**
	 * Fabric's "repaint your live preview" hook, called from `renderTopLayer`
	 * after anything wipes the shared top context mid-stroke.
	 *
	 * Moves blit only the region they touched (see `_preview`); this repaints the
	 * whole smear so far. Without it a frame landing mid-stroke — a remote sync
	 * edit, selection controls redrawing — would erase the smear from the screen
	 * until the finger moved again.
	 */
	_render() {
		this._epoch = getTopContextEpoch();
		this._blit(this._dirty);
	}

	/** Called by `cancelPenAction`, and by us whenever the stroke is unusable. */
	override _reset = () => {
		// Zeroing the backing stores hands the memory back now rather than at the
		// next GC — these are viewport-sized surfaces on a phone.
		for (const context of [this._work, this._stamp, this._average]) {
			if (context) {
				context.canvas.width = 0;
				context.canvas.height = 0;
			}
		}
		this._work = undefined;
		this._stamp = undefined;
		this._average = undefined;
		this._mask = undefined;
		this._points = [];
		this._dirty = null;
	};

	// ────────────────────────────────────────────────────────────── stroke setup

	private _abort() {
		this._reset();
		this.canvas.clearContext(this.canvas.contextTop);
		(this.canvas as any)._isCurrentlyDrawing = false;
	}

	private _beginStroke(): boolean {
		const element = this.canvas.getElement?.() as HTMLCanvasElement | undefined;
		const cssWidth = this.canvas.getWidth();
		if (!element?.width || !element.height || !cssWidth) return false;

		// Derived from the element rather than assumed: this must agree with
		// whatever fabric actually sized the backing store to, capped DPR included.
		this._dpr = element.width / cssWidth || getRenderDpr();

		const work = document.createElement("canvas");
		work.width = element.width;
		work.height = element.height;
		const workContext = work.getContext("2d", {
			willReadFrequently: true,
		}) as CanvasRenderingContext2D | null;
		if (!workContext) return false;

		try {
			workContext.drawImage(element, 0, 0);
			// Probe one pixel NOW rather than discovering the problem at commit
			// time. Blitting a canvas tainted by a cross-origin image does not
			// throw — it silently taints the destination, and the first read is what
			// fails. Finding that out at mouse:up would mean a stroke the user drew,
			// watched, and then lost with no explanation.
			workContext.getImageData(0, 0, 1, 1);
		} catch {
			this.canvas.fire("smudge:blocked", {});
			work.width = 0;
			work.height = 0;
			return false;
		}

		this._work = workContext;
		this._radius = Math.min(
			SmudgeBrush.MAX_TIP_PX / 2,
			Math.max(2, (this.width * this.canvas.getZoom() * this._dpr) / 2),
		);
		this._vptKey = this._viewportKey();
		this._epoch = getTopContextEpoch();
		this._buildTip();
		return true;
	}

	/** The reusable tip: one scratch surface plus its soft alpha falloff. */
	private _buildTip() {
		const diameter = Math.max(2, Math.ceil(this._radius * 2));

		const stamp = document.createElement("canvas");
		stamp.width = diameter;
		stamp.height = diameter;
		this._stamp = stamp.getContext("2d", {
			willReadFrequently: true,
		}) as CanvasRenderingContext2D;

		const mask = document.createElement("canvas");
		mask.width = diameter;
		mask.height = diameter;
		const maskContext = mask.getContext("2d")!;
		const centre = diameter / 2;
		const gradient = maskContext.createRadialGradient(
			centre,
			centre,
			0,
			centre,
			centre,
			centre,
		);
		// Flat core, fast falloff: a linear ramp makes the tip feel like it has no
		// centre, and a hard disc leaves a visible rim on every stamp.
		gradient.addColorStop(0, "rgba(255,255,255,1)");
		gradient.addColorStop(0.55, "rgba(255,255,255,0.85)");
		gradient.addColorStop(1, "rgba(255,255,255,0)");
		maskContext.fillStyle = gradient;
		maskContext.fillRect(0, 0, diameter, diameter);
		this._mask = mask;

		const average = document.createElement("canvas");
		average.width = 1;
		average.height = 1;
		this._average = average.getContext("2d", {
			willReadFrequently: true,
		}) as CanvasRenderingContext2D;
	}

	// ─────────────────────────────────────────────────────────────────── stamping

	private _stampAt(fromX: number, fromY: number, toX: number, toY: number) {
		const work = this._work;
		const stamp = this._stamp;
		const mask = this._mask;
		if (!work || !stamp || !mask) return;

		const diameter = mask.width;
		const alpha = smudgeStampAlpha(this.smudgeStrength);

		// Blend needs the colours under the tip WHERE IT IS, not where it came from.
		const sourceX = this.smudgeMode === SmudgeMode.Pull ? fromX : toX;
		const sourceY = this.smudgeMode === SmudgeMode.Pull ? fromY : toY;

		// `copy` clears and fills in one pass; a source rect that hangs off the
		// edge of the buffer simply yields transparent there.
		stamp.globalCompositeOperation = "copy";
		stamp.drawImage(
			work.canvas,
			sourceX - diameter / 2,
			sourceY - diameter / 2,
			diameter,
			diameter,
			0,
			0,
			diameter,
			diameter,
		);
		stamp.globalCompositeOperation = "destination-in";
		stamp.drawImage(mask, 0, 0);
		stamp.globalCompositeOperation = "source-over";

		const left = toX - diameter / 2;
		const top = toY - diameter / 2;

		work.save();
		work.globalAlpha = alpha;

		if (this.smudgeMode === SmudgeMode.Blend) {
			// Recolour the MASKED stamp rather than filling a circle: a plain arc has
			// a hard rim, and every stamp would leave a visible disc outline behind.
			const average = this._averageColour(diameter);
			stamp.globalCompositeOperation = "source-in";
			stamp.fillStyle = average;
			stamp.fillRect(0, 0, diameter, diameter);
			stamp.globalCompositeOperation = "source-over";
			work.globalAlpha = alpha * 0.8;
			work.drawImage(stamp.canvas, left, top);
		} else if (this.smudgeMode === SmudgeMode.Blur) {
			const blur = Math.max(1, this._radius * 0.35);
			if (typeof work.filter === "string") {
				work.filter = `blur(${blur.toFixed(2)}px)`;
				work.drawImage(stamp.canvas, left, top);
			} else {
				// Safari before 15.4 has no canvas `filter`. Four offset copies at a
				// quarter alpha each is a crude box blur, but it is the same GESTURE
				// and it degrades quietly instead of doing nothing at all.
				work.globalAlpha = alpha / 4;
				const offset = Math.max(1, blur / 2);
				for (const [dx, dy] of [
					[-offset, 0],
					[offset, 0],
					[0, -offset],
					[0, offset],
				]) {
					work.drawImage(stamp.canvas, left + dx, top + dy);
				}
			}
		} else {
			work.drawImage(stamp.canvas, left, top);
		}

		work.restore();
	}

	/** Average colour under the tip, read off a 1x1 downscale of the stamp. */
	private _averageColour(diameter: number): string {
		const average = this._average;
		const stamp = this._stamp;
		if (!average || !stamp) return "rgba(0,0,0,0)";
		average.globalCompositeOperation = "copy";
		average.drawImage(stamp.canvas, 0, 0, diameter, diameter, 0, 0, 1, 1);
		const [r, g, b] = average.getImageData(0, 0, 1, 1).data;
		return `rgb(${r},${g},${b})`;
	}

	// ──────────────────────────────────────────────────────────────────── preview

	/**
	 * Show the smear before it is committed.
	 *
	 * Only the region this move touched is blitted — until something else wipes
	 * the shared top context, in which case the whole smear so far is repainted
	 * (the epoch dance every incremental brush preview here does).
	 */
	private _preview(touched: PixelBounds) {
		const epoch = getTopContextEpoch();
		const region = epoch === this._epoch ? touched : (this._dirty ?? touched);
		this._epoch = epoch;
		this._blit(region);
	}

	/** Copy one region of the working buffer onto the shared top context. */
	private _blit(region: PixelBounds | null) {
		const work = this._work;
		if (!work || !region) return;
		const top = this.canvas.contextTop;

		const box = clampBounds(region, work.canvas.width, work.canvas.height);
		if (!box) return;

		const width = box.maxX - box.minX;
		const height = box.maxY - box.minY;
		const dpr = this._dpr;
		top.drawImage(
			work.canvas,
			box.minX,
			box.minY,
			width,
			height,
			box.minX / dpr,
			box.minY / dpr,
			width / dpr,
			height / dpr,
		);
	}

	// ───────────────────────────────────────────────────────────────── committing

	private _buildStroke(): SmudgeStroke | null {
		const work = this._work;
		const element = this.canvas.getElement?.() as HTMLCanvasElement | undefined;
		const box = clampBounds(
			this._dirty,
			work?.canvas.width ?? 0,
			work?.canvas.height ?? 0,
		);
		if (!work || !element || !box) return null;

		const deviceWidth = box.maxX - box.minX;
		const deviceHeight = box.maxY - box.minY;
		const raster = fitPatchRaster(deviceWidth, deviceHeight);
		if (!raster) return null;

		const patch = document.createElement("canvas");
		patch.width = raster.width;
		patch.height = raster.height;
		const patchContext = patch.getContext("2d", {
			willReadFrequently: true,
		}) as CanvasRenderingContext2D | null;
		if (!patchContext) return null;

		// The untouched canvas is still on screen — nothing was committed to it
		// during the stroke — so the "before" picture can be re-blitted from it
		// instead of being carried around as a second viewport-sized buffer.
		const before = document.createElement("canvas");
		before.width = raster.width;
		before.height = raster.height;
		const beforeContext = before.getContext("2d", {
			willReadFrequently: true,
		}) as CanvasRenderingContext2D | null;
		if (!beforeContext) return null;

		try {
			patchContext.drawImage(
				work.canvas,
				box.minX,
				box.minY,
				deviceWidth,
				deviceHeight,
				0,
				0,
				raster.width,
				raster.height,
			);
			beforeContext.drawImage(
				element,
				box.minX,
				box.minY,
				deviceWidth,
				deviceHeight,
				0,
				0,
				raster.width,
				raster.height,
			);

			const smudged = patchContext.getImageData(
				0,
				0,
				raster.width,
				raster.height,
			);
			const original = beforeContext.getImageData(
				0,
				0,
				raster.width,
				raster.height,
			);
			if (!applyPatchAlpha(smudged.data, original.data)) return null;
			patchContext.putImageData(smudged, 0, 0);
		} catch {
			return null;
		} finally {
			before.width = 0;
			before.height = 0;
		}

		// Device pixels → CSS pixels → world units.
		const zoom = this.canvas.getZoom() || 1;
		const vpt = this.canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0];
		const worldWidth = deviceWidth / this._dpr / zoom;
		const worldHeight = deviceHeight / this._dpr / zoom;
		const worldLeft = (box.minX / this._dpr - vpt[4]) / zoom;
		const worldTop = (box.minY / this._dpr - vpt[5]) / zoom;

		warmBakedCanvasEncode(patch);

		return new SmudgeStroke({
			// CENTRE, not the top-left corner: fabric v6 defaults originX/originY to
			// `center`, so `left`/`top` name the centre point unless the origin is
			// changed. Handing it a corner drew every smudge half a patch up and to
			// the left of the pixels it was lifted from.
			left: worldLeft + worldWidth / 2,
			top: worldTop + worldHeight / 2,
			width: worldWidth,
			height: worldHeight,
			stampCanvas: patch,
		});
	}

	private _viewportKey(): string {
		return (this.canvas.viewportTransform ?? []).join(",");
	}

	private _toDevice(pointer: Point): { x: number; y: number } {
		const vpt = this.canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0];
		return {
			x: (pointer.x * vpt[0] + vpt[4]) * this._dpr,
			y: (pointer.y * vpt[3] + vpt[5]) * this._dpr,
		};
	}
}

/**
 * A committed smear: one bitmap, positioned in world space.
 *
 * Modelled on `PixelStroke` — the bitmap lives on `stampCanvas`, which is the
 * field `BakeryAssets` looks for when deciding what it can ship to the tile
 * worker as an `ImageBitmap`, and it serializes as a memoized PNG so no frame
 * ever pays for the encode twice.
 */
export class SmudgeStroke extends FabricObject {
	static override type = "SmudgeStroke";

	/**
	 * Rebuilding this object from JSON needs `loadImage`, which does not exist in
	 * the bake worker — same story as `PixelStroke`. The worker can still render
	 * it once the bitmap has been transferred as an asset; until then the bakery
	 * keeps it on the main thread rather than baking a blank tile.
	 */
	static bakesOnMainThread = true;

	static override cacheProperties = [
		...FabricObject.cacheProperties,
		"patchSrc",
	];

	public stampCanvas?: HTMLCanvasElement;
	public patchSrc?: string;

	constructor(options: any = {}) {
		// Origin pinned rather than inherited: `left`/`top` are computed as the
		// patch's CENTRE, and a default that drifts would move every existing
		// smudge in every saved drawing by half its own size.
		super({
			strokeWidth: 0,
			originX: "center",
			originY: "center",
			...options,
		});
		this.stampCanvas = options.stampCanvas;
		this.patchSrc = options.patchSrc;
	}

	override _render(ctx: CanvasRenderingContext2D) {
		const source = this.stampCanvas ?? (this as any).__workerBitmap;
		if (!source) return;
		ctx.drawImage(
			source,
			-this.width / 2,
			-this.height / 2,
			this.width,
			this.height,
		);
	}

	override toObject(additionalProperties: string[] = []) {
		const patchSrc = this.stampCanvas
			? bakedCanvasDataUrl(this.stampCanvas)
			: this.patchSrc;
		return {
			...super.toObject([
				"left",
				"top",
				"width",
				"height",
				...additionalProperties,
			]),
			patchSrc,
		};
	}

	static override async fromObject(object: any) {
		// A COPY, never the caller's blob: at load the source JSON is stashed and
		// posted to the tile worker, and an HTMLCanvasElement written into it is
		// not structured-cloneable (see PixelStroke.fromObject).
		const props = await enlivenStrokeProps(object);
		if (object.patchSrc && !props.stampCanvas) {
			const image = await fabric.util.loadImage(object.patchSrc);
			const canvas = document.createElement("canvas");
			canvas.width = image.naturalWidth || image.width;
			canvas.height = image.naturalHeight || image.height;
			canvas.getContext("2d")?.drawImage(image, 0, 0);
			props.stampCanvas = canvas;
		}
		return new SmudgeStroke(props);
	}
}
