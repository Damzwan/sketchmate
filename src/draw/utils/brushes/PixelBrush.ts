import { BaseBrush, Canvas, FabricObject, Point } from "fabric";
import { enlivenStrokeProps } from "@/draw/utils/brushes/brush.helpers";
import { getTopContextEpoch } from "@/draw/rendering/fabricRenderState";
import * as fabric from "fabric";

export class PixelBrush extends BaseBrush {
	/** Live-preview incremental state — see _render. */
	private _renderedUpTo = 0;
	private _renderedVpt = "";
	private _renderedEpoch = -1;
	private _points: Point[] = [];
	public pixelSize: number = 5;

	// Vital signs: tracking the stamp instead of coordinates
	private _stampCanvas!: HTMLCanvasElement;
	private _stampSize: number = 0;

	constructor(canvas: Canvas) {
		super(canvas);
	}

	// TREATMENT: Generate a single bitmap stamp of the brush tip
	private _generateBrushTipCanvas() {
		const radius = this.width / 2;
		const step = this.pixelSize;

		const gridMax = Math.ceil(radius / step) * step;
		this._stampSize = gridMax * 2 + step;

		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = this._stampSize;
		const ctx = canvas.getContext("2d")!;
		ctx.fillStyle = this.color as string;

		const center = this._stampSize / 2;
		const start = -Math.floor(radius / step) * step;
		const end = Math.floor(radius / step) * step;

		// Overlap each cell by 1px so neighbours can't leave an AA seam when the
		// stamp is later scaled/blitted at fractional device coordinates. Same colour
		// over same colour, so the overlap is invisible — it only guarantees coverage.
		const overlap = 1;

		for (let dx = start; dx <= end; dx += step) {
			for (let dy = start; dy <= end; dy += step) {
				const distance = Math.sqrt(dx * dx + dy * dy);
				if (distance <= radius) {
					const probability = 1 - Math.pow(distance / radius, 3);
					if (Math.random() < probability || distance <= step) {
						ctx.fillRect(
							center + dx - step / 2,
							center + dy - step / 2,
							step + overlap,
							step + overlap,
						);
					}
				}
			}
		}
		return canvas;
	}

	onMouseDown(pointer: Point) {
		this._points = [];
		this._renderedUpTo = 0; // new stroke → repaint from scratch
		this._renderedVpt = "";
		this._stampCanvas = this._generateBrushTipCanvas(); // Bake the stamp!
		this._addPoint(pointer, true);
	}

	// RE-ATTACHED ORGAN: The mouse move handler
	onMouseMove(pointer: Point) {
		// NB: no clearContext — _render draws only the NEW stamps (see there).
		if (this._addPoint(pointer)) this._render();
	}

	onMouseUp() {
		if (this._points.length > 0) {
			const stroke = new PixelStroke(this._points, {
				fill: this.color,
				pixelSize: this.pixelSize,
				stampCanvas: this._stampCanvas,
				stampSize: this._stampSize,
				stampDataUrl: this._stampCanvas.toDataURL(), // Keep for syncing/saving
			});
			this.canvas.add(stroke);
			this.canvas.clearContext(this.canvas.contextTop);
			this.canvas.fire("path:created", { path: stroke });
		}
		return false;
	}

	// RE-ATTACHED ORGAN: Bresenham's Line Algorithm (The Sutures)
	private _addPoint(pointer: Point, isFirstPoint = false) {
		const targetX = Math.floor(pointer.x / this.pixelSize) * this.pixelSize;
		const targetY = Math.floor(pointer.y / this.pixelSize) * this.pixelSize;

		if (this._points.length === 0 || isFirstPoint) {
			this._points.push(new Point(targetX, targetY));
			return true;
		}

		const lastPoint = this._points[this._points.length - 1];

		if (targetX === lastPoint.x && targetY === lastPoint.y) {
			return false; // Mouse hasn't moved to a new pixel cell yet
		}

		let x0 = lastPoint.x;
		let y0 = lastPoint.y;
		const x1 = targetX;
		const y1 = targetY;

		const dx = Math.abs(x1 - x0);
		const dy = Math.abs(y1 - y0);
		const sx = x0 < x1 ? this.pixelSize : -this.pixelSize;
		const sy = y0 < y1 ? this.pixelSize : -this.pixelSize;
		let err = dx - dy;

		let pointsAdded = false;

		while (true) {
			if (x0 !== lastPoint.x || y0 !== lastPoint.y) {
				this._points.push(new Point(x0, y0));
				pointsAdded = true;
			}

			if (
				Math.abs(x0 - x1) < this.pixelSize / 2 &&
				Math.abs(y0 - y1) < this.pixelSize / 2
			) {
				break;
			}

			const e2 = 2 * err;
			if (e2 > -dy) {
				err -= dy;
				x0 += sx;
			}
			if (e2 < dx) {
				err += dx;
				y0 += sy;
			}
		}

		return pointsAdded;
	}

	/**
	 * INCREMENTAL live preview — draws only stamps added since the last call.
	 * Was clear + redraw-all on EVERY pointer move, i.e. O(n^2) blits over a
	 * stroke. Each stamp is composited exactly once either way, so the result is
	 * identical. Falls back to a full repaint when the viewport moved (the
	 * preview is drawn in world space) or a new stroke started.
	 */
	_render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
		const vpt = this.canvas.viewportTransform;
		const vptKey = vpt ? vpt.join(",") : "";
		const isTop = ctx === this.canvas.contextTop;
		const stale =
			vptKey !== this._renderedVpt ||
			getTopContextEpoch() !== this._renderedEpoch ||
			this._renderedUpTo > this._points.length;

		let from = this._renderedUpTo;
		if (!isTop || stale) {
			if (isTop) this.canvas.clearContext(ctx);
			from = 0;
		}

		ctx.save();
		if (vpt) ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
		ctx.imageSmoothingEnabled = false;

		const offset = this._stampSize / 2;
		for (let i = from; i < this._points.length; i++) {
			const p = this._points[i];
			ctx.drawImage(this._stampCanvas, Math.round(p.x - offset), Math.round(p.y - offset));
		}
		ctx.restore();

		if (isTop) {
			this._renderedUpTo = this._points.length;
			this._renderedVpt = vptKey;
			this._renderedEpoch = getTopContextEpoch();
		}
	}
}

export class PixelStroke extends FabricObject {
	static type = "PixelStroke";

	// The tile worker CANNOT render this stroke: `_render` blits `stampCanvas`,
	// and the worker rebuilds it via `fromObject` → `fabric.util.loadImage(
	// stampDataUrl)` — image decoding that doesn't exist in a worker. So a
	// worker bake produced a BLANK tile: the stroke showed at overview / locally-
	// baked tiers but VANISHED at worker-baked tiers, and disappeared after a
	// move (which triggers a worker re-bake). This flag makes the bakery refuse
	// it → it bakes on the main thread (or overlays via the hybrid path), where
	// image loading works. Charcoal rebuilds its stamp procedurally and Circle is
	// vector, so only this one needs it.
	static bakesOnMainThread = true;

	static cacheProperties = [
		...FabricObject.cacheProperties,
		"points",
		"pixelSize",
		"stampSize",
		"stampDataUrl",
		"minX",
		"minY",
	];

	public points: Point[];
	public pixelSize: number;
	public stampCanvas?: HTMLCanvasElement;
	public stampSize: number;
	public stampDataUrl?: string;
	public minX: number = 0;
	public minY: number = 0;

	constructor(pointsOrOptions: Point[] | any, options: any = {}) {
		const isInitialEntry = Array.isArray(pointsOrOptions);
		const data = isInitialEntry ? options : pointsOrOptions;
		const points = isInitialEntry ? pointsOrOptions : data.points || [];

		super(data);

		this.points = points;
		this.pixelSize = data.pixelSize || 5;
		this.stampCanvas = data.stampCanvas;
		this.stampSize = data.stampSize || 0;
		this.stampDataUrl = data.stampDataUrl;
		this.minX = data.minX || 0;
		this.minY = data.minY || 0;

		this.originX = "center";
		this.originY = "center";

		if (typeof data.left !== "number") {
			this._calcDimensions();
		}
	}

	private _calcDimensions() {
		if (!this.points.length) return;

		let minX = this.points[0].x,
			maxX = this.points[0].x;
		let minY = this.points[0].y,
			maxY = this.points[0].y;

		for (const p of this.points) {
			if (p.x < minX) minX = p.x;
			if (p.x > maxX) maxX = p.x;
			if (p.y < minY) minY = p.y;
			if (p.y > maxY) maxY = p.y;
		}

		this.minX = minX;
		this.minY = minY;

		this.width = maxX - minX + this.stampSize;
		this.height = maxY - minY + this.stampSize;
		this.left = minX - this.stampSize / 2 + this.width / 2;
		this.top = minY - this.stampSize / 2 + this.height / 2;
	}

	_render(ctx: CanvasRenderingContext2D) {
		if (!this.stampCanvas) return;
		ctx.save();
		ctx.imageSmoothingEnabled = false;

		const offset = this.stampSize / 2;

		// To prevent the sub-pixel shift, calculate the local coordinates
		// based directly on the EXACT global integer targets the Brush preview used.
		const initialLeft = this.minX - offset + this.width / 2;
		const initialTop = this.minY - offset + this.height / 2;

		for (const p of this.points) {
			// 1. Recreate the precise integer coordinates the preview mapped to
			const targetX = Math.round(p.x - offset);
			const targetY = Math.round(p.y - offset);

			// 2. Map those absolute coordinates to the object's relative space.
			// (Do not round these, as any float values perfectly cancel out the translation matrix)
			const renderX = targetX - initialLeft;
			const renderY = targetY - initialTop;

			ctx.drawImage(this.stampCanvas, renderX, renderY);
		}
		ctx.restore();
	}

	toObject(additionalProperties: string[] = []) {
		return super.toObject([
			"left",
			"top",
			"points",
			"pixelSize",
			"stampDataUrl",
			"stampSize",
			"minX",
			"minY",
			...additionalProperties,
		]);
	}

	static async fromObject(object: any) {
		// enlivenStrokeProps returns a COPY, so the stamp canvas is attached to
		// that — never to `object`. Writing an HTMLCanvasElement into the source
		// blob made it un-structured-cloneable, and at load that blob is stashed
		// as `__bakeJSON` and posted to the tile worker: postMessage threw and the
		// fallback re-serialized the whole batch with JSON.stringify/parse on the
		// main thread. That was the dense-drawing load stall.
		const props = await enlivenStrokeProps(object);
		if (object.stampDataUrl && !props.stampCanvas) {
			const img = await fabric.util.loadImage(object.stampDataUrl);

			const canvas = document.createElement("canvas");
			canvas.width = canvas.height = object.stampSize;
			canvas.getContext("2d")?.drawImage(img, 0, 0);

			props.stampCanvas = canvas;
		}

		return new PixelStroke(props);
	}
}