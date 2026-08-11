import * as fabric from "fabric";
import { type Canvas, FabricImage, PatternBrush, Point } from "fabric";
import { isLayerHidden } from "@/draw/layers/layerRegistry";
import {
	enlivenStrokeProps,
	TEXTURE_SUPERSAMPLE,
} from "@/draw/utils/brushes/brush.helpers";

// Deterministic PRNG so the random crayon texture regenerates identically from
// a stored seed (no need to serialise the bitmap — same trick as charcoal).
function seededRandom(seed: number) {
	return () => {
		let t = (seed += 0x6d2b79f5);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const PATTERN_SIZE = 128;

// Build the waxy crayon pattern tile. Seeded → identical on every device/reload.
function buildPatternCanvas(seed: number, color: string): HTMLCanvasElement {
	const rand = seededRandom(seed);
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = PATTERN_SIZE;
	const ctx = canvas.getContext("2d")!;

	ctx.fillStyle = color;
	ctx.globalAlpha = 0.35;
	ctx.fillRect(0, 0, PATTERN_SIZE, PATTERN_SIZE);

	ctx.globalAlpha = 0.85;
	for (let i = 0; i < 2500; i++) {
		const x = rand() * PATTERN_SIZE;
		const y = rand() * PATTERN_SIZE;
		const r = rand() * 1.5 + 0.5;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	}

	ctx.globalCompositeOperation = "destination-out";
	ctx.globalAlpha = 0.6;
	for (let i = 0; i < 1500; i++) {
		const x = rand() * PATTERN_SIZE;
		const y = rand() * PATTERN_SIZE;
		const r = rand() * 2 + 0.5;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	}
	return canvas;
}

// Quadratic-midpoint smoothing, identical at creation AND regeneration so the
// baked geometry never drifts between draw-time and reload.
function buildSmoothPath(points: Point[], ox: number, oy: number): Path2D {
	const p = new Path2D();
	if (points.length === 0) return p;
	let p1 = points[0];
	p.moveTo(p1.x - ox, p1.y - oy);
	for (let i = 1; i < points.length; i++) {
		const p2 = points[i];
		const midX = (p1.x + p2.x) / 2;
		const midY = (p1.y + p2.y) / 2;
		p.quadraticCurveTo(p1.x - ox, p1.y - oy, midX - ox, midY - oy);
		p1 = p2;
	}
	p.lineTo(p1.x - ox, p1.y - oy);
	return p;
}

// Pure renderer: (points, color, width, seed) → patterned crayon stroke as a
// FabricImage. The pattern is phase-anchored to WORLD 0,0 — the same anchor the
// live preview uses — so preview and committed are pixel-for-pixel the same.
export function generateCrayonImage(
	points: Point[],
	color: string,
	width: number,
	seed: number,
): FabricImage | null {
	if (points.length === 0) return null;

	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const pt of points) {
		if (pt.x < minX) minX = pt.x;
		if (pt.x > maxX) maxX = pt.x;
		if (pt.y < minY) minY = pt.y;
		if (pt.y > maxY) maxY = pt.y;
	}
	const pad = width; // half-width + round cap headroom
	minX -= pad;
	minY -= pad;
	maxX += pad;
	maxY += pad;

	const w = Math.ceil(maxX - minX);
	const h = Math.ceil(maxY - minY);
	if (w <= 0 || h <= 0) return null;

	// Textural brush → softening on extreme zoom-in is acceptable; keep memory
	// modest with a small headroom multiplier.
	// Device-independent — see TEXTURE_SUPERSAMPLE.
	const dpr = TEXTURE_SUPERSAMPLE;

	const off = document.createElement("canvas");
	off.width = Math.ceil(w * dpr);
	off.height = Math.ceil(h * dpr);
	const ctx = off.getContext("2d");
	if (!ctx) return null;
	ctx.scale(dpr, dpr);

	const patternCanvas = buildPatternCanvas(seed, color);
	const pattern = ctx.createPattern(patternCanvas, "repeat")!;

	// Phase-lock the pattern to world 0,0. Local (0,0) of this canvas is world
	// (minX, minY); shifting the pattern by -origin (mod tile) makes the texel at
	// any world point depend only on the world coordinate — identical to the live
	// preview, which tiles from world 0,0 through the viewport transform.
	const phaseX = ((minX % PATTERN_SIZE) + PATTERN_SIZE) % PATTERN_SIZE;
	const phaseY = ((minY % PATTERN_SIZE) + PATTERN_SIZE) % PATTERN_SIZE;
	try {
		pattern.setTransform(new DOMMatrix().translate(-phaseX, -phaseY));
	} catch {
		/* setTransform unsupported → tiny phase diff, invisible in noise */
	}

	ctx.strokeStyle = pattern;
	ctx.lineWidth = width;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.stroke(buildSmoothPath(points, minX, minY));

	return new FabricImage(off, {
		left: minX + w / 2,
		top: minY + h / 2,
		originX: "center",
		originY: "center",
		scaleX: 1 / dpr,
		scaleY: 1 / dpr,
		objectCaching: false,
		interactive: false,
	});
}

export class CrayonStroke extends FabricImage {
	static override type = "CrayonStroke";
	static override cacheProperties = [
		...FabricImage.cacheProperties,
		"color",
		"baseWidth",
		"seed",
		"compressedTrace",
	];

	public crayonPoints: Point[] = [];
	public color: string = "#000000";
	public baseWidth: number = 10;
	public seed: number = 0;

	constructor(element: any, options: any) {
		super(element, options);
		this.color = options.color;
		this.baseWidth = options.baseWidth;
		this.seed = options.seed;
		if (options.compressedTrace) {
			this.crayonPoints = this._inflate(options.compressedTrace);
		} else {
			this.crayonPoints = options.crayonPoints || [];
		}
	}

	private _inflate(c: number[]): Point[] {
		const out: Point[] = [];
		let lastX = 0,
			lastY = 0;
		for (let i = 0; i < c.length; i += 2) {
			let ix = c[i],
				iy = c[i + 1];
			if (i > 0) {
				ix += lastX;
				iy += lastY;
			}
			lastX = ix;
			lastY = iy;
			out.push(new Point(ix / 10, iy / 10));
		}
		return out;
	}

	// @ts-expect-error
	toObject(additionalProperties: string[] = []) {
		const flat: number[] = [];
		let lastX = 0,
			lastY = 0;
		for (let i = 0; i < this.crayonPoints.length; i++) {
			const p = this.crayonPoints[i];
			const ix = Math.round(p.x * 10),
				iy = Math.round(p.y * 10);
			if (i === 0) flat.push(ix, iy);
			else flat.push(ix - lastX, iy - lastY);
			lastX = ix;
			lastY = iy;
		}
		const baseObj = super.toObject([
			"color",
			"baseWidth",
			"seed",
			...additionalProperties,
		] as any);
		delete (baseObj as any).src; // drop the bitmap — the payload win
		return { ...baseObj, compressedTrace: flat };
	}

	static override async fromObject(object: any) {
		// Pixels supplied by the tile worker (transferred ImageBitmap). Use them
		// directly instead of re-running the generator on every enliven — that
		// regeneration is why these strokes were refused off-thread.
		if (object.__workerBitmap) {
			const props = await enlivenStrokeProps(object);
			return new CrayonStroke(object.__workerBitmap, props);
		}
		if (!object.src) {
			const pts: Point[] = [];
			let lastX = 0,
				lastY = 0;
			const c = object.compressedTrace || [];
			for (let i = 0; i < c.length; i += 2) {
				let ix = c[i],
					iy = c[i + 1];
				if (i > 0) {
					ix += lastX;
					iy += lastY;
				}
				lastX = ix;
				lastY = iy;
				pts.push(new Point(ix / 10, iy / 10));
			}
			const img = generateCrayonImage(
				pts,
				object.color,
				object.baseWidth,
				object.seed,
			);
			if (img) {
				const props = await enlivenStrokeProps(object);
				return new CrayonStroke(img.getElement(), {
					...props,
					crayonPoints: pts,
				});
			}
		}
		return fabric.util.enlivenObjects([object]).then((e) => e[0]);
	}
}

export class CrayonBrush extends PatternBrush {
	private _seed = 0;
	private _patternCanvas?: HTMLCanvasElement;

	constructor(canvas: Canvas) {
		super(canvas);
		this.decimate = 0;
		this.strokeLineCap = "round";
		this.strokeLineJoin = "round";
	}

	override needsFullRender() {
		return true;
	}
	_needsFullRender() {
		return true;
	}

	override onMouseDown(pointer: Point, ev: any) {
		// New seed + pattern per stroke; the SAME pattern drives the live preview
		// AND the committed flatten, so they can't disagree.
		this._seed = Math.floor(Math.random() * 1_000_000);
		this._patternCanvas = buildPatternCanvas(this._seed, this.color as string);
		super.onMouseDown(pointer, ev);
	}

	// Live preview: stroke the in-progress trace with the SAME seeded pattern,
	// tiling in world space (ctx is viewport-transformed here), so the texture
	// layout matches the committed image exactly — no solid→pattern pop, no phase
	// mismatch.
	override _render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
		const pts = (this as any)._points as Point[];
		if (!pts || pts.length === 0 || !this._patternCanvas) return;

		this._saveAndTransform(ctx);
		const pattern = ctx.createPattern(this._patternCanvas, "repeat")!;
		ctx.strokeStyle = pattern;
		ctx.lineWidth = this.width;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";

		ctx.beginPath();
		let p1 = pts[0];
		ctx.moveTo(p1.x, p1.y);
		for (let i = 1; i < pts.length; i++) {
			const p2 = pts[i];
			const mid = p1.midPointFrom(p2);
			ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y);
			p1 = p2;
		}
		ctx.lineTo(p1.x, p1.y);
		ctx.stroke();
		ctx.restore();
	}

	override onMouseUp(o: { e: any }): boolean {
		if (!this.canvas._isMainEvent?.(o.e)) return true;
		this._finalizeAndAddPath();
		return false;
	}

	override _finalizeAndAddPath(): void {
		const topCtx = this.canvas.contextTop;
		const pts = ((this as any)._points as Point[]) || [];

		if (pts.length === 0) {
			this.canvas.clearContext(topCtx);
			this._reset?.();
			return;
		}

		const img = generateCrayonImage(
			pts,
			this.color as string,
			this.width,
			this._seed,
		);
		if (img) {
			const stroke = new CrayonStroke(img.getElement(), {
				...img.toObject(),
				color: this.color,
				baseWidth: this.width,
				seed: this._seed,
				crayonPoints: [...pts],
			});

			this.canvas.clearContext(topCtx);
			this.canvas.fire("before:path:created", { path: stroke });
			this.canvas.add(stroke);
			stroke.setCoords();

			// Manual flush (no requestRenderAll) so it's visible before the tile bake.
			// A hidden layer deliberately skips this compatibility path.
			if (!isLayerHidden((stroke as any).layerId)) {
				const mainCtx = this.canvas.getContext();
				mainCtx.save();
				const vpt = this.canvas.viewportTransform;
				if (vpt)
					mainCtx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
				stroke.render(mainCtx);
				mainCtx.restore();
			}

			this.canvas.fire("path:created", { path: stroke });
		} else {
			this.canvas.clearContext(topCtx);
		}
		this._reset?.();
	}
}
