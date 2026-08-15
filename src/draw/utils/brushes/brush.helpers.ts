import type { TSimplePathData } from "fabric";
import * as fabric from "fabric";
import {
	restoreStrokeDefaults,
	stripStrokeDefaults,
} from "@/draw/objects/strokeDefaults";

/**
 * Supersampling factor for procedurally generated brush TEXTURES (charcoal
 * stamps, crayon/spray/neon pattern canvases).
 *
 * DELIBERATELY DEVICE-INDEPENDENT. These generators used to read
 * `window.devicePixelRatio`, which made the same stroke render differently
 * depending on WHERE it was rasterized:
 *   • the tile worker defines `window` (the DOM shim aliases globalThis) but has
 *     no `devicePixelRatio`, so it fell back to 1 while the main thread used
 *     2–3 → a worker-baked tile and the live/local render disagreed on the
 *     texture, i.e. the stroke visibly changed the moment its tile baked;
 *   • two devices with different DPRs produced different art for the same
 *     drawing after a reload or a sync.
 * Two of the call sites also read `window.devicePixelRatio` with NO `|| 1`
 * fallback, so in a worker they computed NaN canvas dimensions outright.
 *
 * A texture is a small fixed-size asset, not viewport pixels — it does not need
 * to track the display. Pinning it makes the render deterministic everywhere,
 * which is what the tile cache (and multiplayer) requires. 2 is the shared
 * baseline; a generator may deterministically supersample further under its own
 * bounded pixel budget (charcoal does this for sharper grain).
 */
export const TEXTURE_SUPERSAMPLE = 2;

/**
 * Hard ceiling on ONE procedural brush raster.
 *
 * Neon, Crayon and Spray each allocate a single canvas covering the WHOLE
 * stroke bounding box at `TEXTURE_SUPERSAMPLE`, with no clamp of any kind:
 *
 *   off.width  = ceil(worldWidth  * 2)
 *   off.height = ceil(worldHeight * 2)
 *
 * The canvas is infinite, so the bounding box is unbounded. A stroke dragged
 * 5,000 world units across asks for 10,000 x 10,000 RGBA — 400 MB — and past
 * the browser's own canvas limits the allocation simply fails, which is a dead
 * stroke or a dead renderer rather than a slow one.
 *
 * It is not only a draw-time cost either. These bitmaps are deliberately NOT
 * serialized ("deterministic, so the bitmap can be dropped from the payload and
 * rebuilt"), so every such stroke re-allocates its full-bbox canvas on every
 * document LOAD. That is the shape of "either drawing opens fine, opening both
 * crashes" (docs/DRAW_ENGINE_STABILITY_AUDIT.md → DRAW-05).
 *
 * 2048² = 4.2 Mpx = 16 MB, which is a full-quality 1024 x 1024 world-unit
 * stroke at 2x supersample. Anything larger degrades in SHARPNESS instead of
 * failing — for a glow, a spray or a crayon texture at that scale, invisible.
 */
const MAX_TEXTURE_PIXELS = 2048 * 2048;
const MAX_TEXTURE_DIMENSION = 4096;

export interface TextureRaster {
	/** Effective supersample. Equals `TEXTURE_SUPERSAMPLE` when nothing is
	 *  clamped, so the common stroke is bit-identical to before. */
	scale: number;
	width: number;
	height: number;
}

/**
 * Pick the backing-store size for a procedural stroke raster covering
 * `worldWidth` x `worldHeight`.
 *
 * DEVICE-INDEPENDENT, exactly like `TEXTURE_SUPERSAMPLE` and for the same
 * reason: the same stroke is rasterized on the main thread AND in the tile
 * bakery worker, and on every device that opens the document. A budget that
 * varied by device would make a worker-baked tile disagree with the live
 * render, and two devices disagree about the same drawing — the precise bug
 * that pinning the supersample was introduced to fix. So this is a constant,
 * sized for the weakest target rather than measured per device.
 *
 * Returns `null` for a degenerate box, matching what the callers already do.
 */
export function fitTextureRaster(
	worldWidth: number,
	worldHeight: number,
): TextureRaster | null {
	if (
		!(worldWidth > 0) ||
		!(worldHeight > 0) ||
		!Number.isFinite(worldWidth) ||
		!Number.isFinite(worldHeight)
	) {
		return null;
	}
	const scale = Math.min(
		TEXTURE_SUPERSAMPLE,
		MAX_TEXTURE_DIMENSION / worldWidth,
		MAX_TEXTURE_DIMENSION / worldHeight,
		Math.sqrt(MAX_TEXTURE_PIXELS / (worldWidth * worldHeight)),
	);
	return {
		scale,
		width: Math.max(1, Math.ceil(worldWidth * scale)),
		height: Math.max(1, Math.ceil(worldHeight * scale)),
	};
}

/**
 * Ensures that nested properties like clipPath and shadow are converted
 * from raw JSON objects into real Fabric class instances before
 * the parent object is instantiated.
 */
/**
 * Remove `type` from a serialized object before it reaches a constructor.
 *
 * fabric v6 derives `type` from the CLASS, so assigning it per-instance logs
 * "fabric: Setting type has no effect" and does nothing. Our `fromObject`
 * implementations pass the raw JSON (which carries `type`) into `new XStroke`,
 * so this fired once per stroke on every enliven — the whole scene on load, and
 * again on every worker re-enliven. The registry has already resolved the class
 * by then, so the field is dead weight.
 */
export function stripType<T>(object: T): T {
	if (!object || typeof object !== "object" || !("type" in (object as any))) {
		return object;
	}
	// NON-DESTRUCTIVE — returns a copy. Deleting in place corrupted the caller's
	// blob: at load, `drawload.helper` stashes the exact source JSON as
	// `__bakeJSON` and ships it to the tile worker, so stripping `type` from it
	// left the worker unable to resolve the class and unable to enliven anything.
	const { type: _type, ...rest } = object as any;
	return rest as T;
}

/**
 * Run a `Path` subclass's `super.toObject()` WITHOUT paying for its path array.
 *
 * `Path.toObject` is `{ ...super.toObject(props), path: this.path.map(cmd =>
 * cmd.slice()) }` — a deep copy of every segment. Every stroke class here then
 * does `delete baseObj.path`, because each one rebuilds its geometry in
 * `fromObject` from a compact representation (a compressed trace, a seed, a
 * point list) instead. So that copy was allocated and discarded, every time.
 *
 * The cost is not marginal on a big board: a WaterColorStroke is 3 bristles × N
 * base points, so `this.path` holds ~3N commands and one `toJSON()` allocated
 * ~3N throwaway arrays. Pencil and eraser strokes are the same shape and far
 * more numerous. Serialization runs on the MAIN thread — in each idle flush
 * batch (192 objects) and in `flushObjects` inside every tile's bake prologue —
 * so this landed directly on pan / zoom frames.
 *
 * Emptying `path` for the duration makes that `.map` a no-op. `Path.toObject`
 * reads nothing else from it, and `FabricObject.toObject` never touches it.
 *
 * @param self the stroke instance
 * @param superToObject a bound reference to `super.toObject`
 * @param props extra properties to serialize
 */
export function toObjectWithoutPath(
	self: any,
	superToObject: (props?: string[]) => any,
	props: string[] = [],
): any {
	let out: any;
	if (
		typeof self._hasCompactPathGeometry === "function" &&
		self._hasCompactPathGeometry() &&
		typeof self._serializeWithPathSuppressed === "function"
	) {
		// A TracedPath has no resident Fabric path array to swap out. Its getter
		// returns [] only while Path.toObject runs, so serialization does not
		// materialize the geometry merely to deep-copy and discard it.
		out = self._serializeWithPathSuppressed(() => superToObject(props));
	} else {
		const realPath = self.path;
		self.path = [];
		try {
			out = superToObject(props);
		} finally {
			// finally, not a trailing assignment: a throw inside toObject must never
			// leave the LIVE object with an empty path — that would blank the stroke.
			self.path = realPath;
		}
	}
	delete out.path;
	// Drop everything still at its default. Symmetric with restoreStrokeDefaults
	// in enlivenStrokeProps below — the two must always ship together.
	stripStrokeDefaults(out);
	return out;
}

/**
 * Run a `FabricImage` subclass's `super.toObject()` WITHOUT paying for the
 * bitmap encode it is about to throw away.
 *
 * `Image.toObject` sets `src: this.getSrc()`, and `getSrc()` checks
 * `element.toDataURL` FIRST — which every procedural stroke's element is,
 * because these classes are rasterized into an offscreen CANVAS. So the base
 * call runs a synchronous PNG encode of the stroke's whole bounding box, and
 * the caller's very next line is `delete baseObj.src`, because the stroke is
 * rebuilt from its compressed trace in `fromObject`.
 *
 * That encode is not marginal: it is a single ATOMIC, un-yieldable block, and
 * the raster is the stroke's full bbox at TEXTURE_SUPERSAMPLE — a long stroke
 * across a phone screen is megapixels. Serialization runs on the MAIN thread
 * (draft save, sync payload, history entry) and yields BETWEEN objects, so one
 * such stroke is one long task no scheduler can split. This is the shape of the
 * multi-hundred-ms `documentSerializeObject` stalls in the ANR reports.
 *
 * Suppressing `getSrc` for the duration makes it `''` — and the result is then
 * deleted anyway, so no persisted byte changes.
 *
 * @param self the stroke instance
 * @param superToObject a bound reference to `super.toObject`
 * @param props extra properties to serialize
 */
export function toObjectWithoutSrc(
	self: any,
	superToObject: (props?: string[]) => any,
	props: string[] = [],
): any {
	const hadOwnGetSrc = Object.hasOwn(self, "getSrc");
	const ownGetSrc = self.getSrc;
	self.getSrc = () => "";
	let out: any;
	try {
		out = superToObject(props);
	} finally {
		// Restore exactly what was there — an own override (see the eraser's baked
		// clip image) must survive, and everything else must fall back through to
		// the prototype rather than keep a stub.
		if (hadOwnGetSrc) self.getSrc = ownGetSrc;
		else delete self.getSrc;
	}
	delete out.src;
	return out;
}

export async function enlivenStrokeProps(object: any): Promise<any> {
	// COPY FIRST — never mutate the caller's serialized blob.
	//
	// At load, `drawload.helper` stashes the exact JSON an object was enlivened
	// FROM as `__bakeJSON` and ships that to the tile worker, so anything we write
	// into it travels to postMessage. Writing LIVE instances here (an enlivened
	// ClippingGroup, a Shadow) made the payload un-structured-cloneable:
	// postMessage threw and the fallback re-serialized the whole batch with
	// `JSON.parse(JSON.stringify(...))` — up to 192 objects per batch, on the main
	// thread, which is what made loading a dense drawing crawl (and logged
	// "[TileBakery] upsert payload was not structured-cloneable").
	//
	// The worker wants the RAW clipPath/shadow JSON anyway — it enlivens them
	// itself. So keep the original pristine and enliven only on our copy.
	const out = restoreStrokeDefaults({ ...object });

	// 1. Enliven the ClipPath (The culprit for the 'transform' error)
	if (out.clipPath && !(out.clipPath instanceof fabric.FabricObject)) {
		const enlivened = await fabric.util.enlivenObjects([out.clipPath]);
		out.clipPath = enlivened[0];
	}

	// 2. Enliven the Shadow
	if (out.shadow && !(out.shadow instanceof fabric.Shadow)) {
		out.shadow = new fabric.Shadow(out.shadow);
	}

	// 3. Drop `type` before it reaches a constructor.
	//
	// In fabric v6 `type` is derived from the CLASS (`static type`), not stored
	// per instance, so assigning it logs
	//   "fabric: Setting type has no effect ..."
	// and every one of our strokes hit it: `fromObject` passes the raw JSON —
	// which carries `type` — straight into `new XStroke(props)`, whose `super()`
	// assigns the options onto the instance. That fired once per stroke on every
	// enliven, i.e. for the whole scene on load and again on every worker
	// re-enliven, and fabric's logger builds the message string each time.
	//
	// The class is already resolved by the registry before we get here, so the
	// field is pure dead weight. Deleting it removes the warning AND the work.
	return stripType(out);
}

function getSqSegDist(
	px: number,
	py: number,
	p1x: number,
	p1y: number,
	p2x: number,
	p2y: number,
) {
	let x = p1x,
		y = p1y,
		dx = p2x - x,
		dy = p2y - y;
	if (dx !== 0 || dy !== 0) {
		const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
		if (t > 1) {
			x = p2x;
			y = p2y;
		} else if (t > 0) {
			x += dx * t;
			y += dy * t;
		}
	}
	dx = px - x;
	dy = py - y;
	return dx * dx + dy * dy;
}

function simplifyDPStep(
	points: any[],
	first: number,
	last: number,
	sqTolerance: number,
	simplified: any[],
) {
	let maxSqDist = sqTolerance,
		index = -1;

	for (let i = first + 1; i < last; i++) {
		const sqDist = getSqSegDist(
			points[i].x,
			points[i].y,
			points[first].x,
			points[first].y,
			points[last].x,
			points[last].y,
		);
		if (sqDist > maxSqDist) {
			index = i;
			maxSqDist = sqDist;
		}
	}

	if (index > -1) {
		if (index - first > 1)
			simplifyDPStep(points, first, index, sqTolerance, simplified);
		simplified.push(points[index]);
		if (last - index > 1)
			simplifyDPStep(points, index, last, sqTolerance, simplified);
	}
}

export function simplifyPathDouglasPeucker(
	commands: TSimplePathData,
	tolerance: number,
): TSimplePathData {
	if (commands.length <= 2) return commands;
	const sqTolerance = tolerance !== undefined ? tolerance * tolerance : 1;

	// Map SVG commands to actionable points (using the destination X, Y of each command)
	const points = commands.map((cmd) => {
		const len = cmd.length;
		return { x: cmd[len - 2] as number, y: cmd[len - 1] as number, cmd: cmd };
	});

	const last = points.length - 1;
	const simplified = [points[0]]; // Always keep the starting 'M'

	simplifyDPStep(points, 0, last, sqTolerance, simplified);

	simplified.push(points[last]); // Always keep the final point

	return simplified.map((p) => p.cmd) as TSimplePathData;
}
