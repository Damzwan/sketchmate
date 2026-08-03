import * as fabric from "fabric";
import type { FabricObject } from "fabric";
import { v4 as uuidv4 } from "uuid";
import {
	enlivenObjectsTimeSlivered,
	migrateLegacyOrigin,
} from "@/draw/document/serialization";
import { computeBounds, exportBoundingBoxImage } from "@/draw/document/export";
import { FLATTENED_IMAGE_MAX_DIMENSION } from "@/draw/tools/imageDownsampling";
import { MAX_RENDER_SCALE } from "@/draw/config/renderQuality.config";

/**
 * Resolution of a flattened saved object.
 *
 * Solo documents can afford a legible raster; a room replays the object to every
 * peer, so its payload is bounded far harder there (see
 * MAX_ROOM_SAVED_DRAWING_JSON_BYTES). Both are well above
 * INSERTED_IMAGE_MAX_DIMENSION (256) — that bound exists for photos the user
 * inserts by the dozen, whereas this replaces an entire drawing and is the only
 * thing the user gets to look at.
 */
export const FLATTENED_SAVED_OBJECT_MAX_DIMENSION = 768;
export const FLATTENED_SAVED_OBJECT_ROOM_MAX_DIMENSION = 512;

/**
 * A flattened LAYER stays in the document the user is actively drawing on and
 * replaces content they can still see at 1:1, so it gets a much higher ceiling
 * than an imported saved object.
 *
 * Same constant the draft/document restore path exempts from the inserted-photo
 * bound — they MUST agree, or every reload quietly resamples the raster.
 */
export const FLATTENED_LAYER_MAX_DIMENSION = FLATTENED_IMAGE_MAX_DIMENSION;

/** `exportBoundingBoxImage` hardcodes this margin around the content box; the
 *  placement maths below has to use the same number to land pixel-aligned. */
const EXPORT_PADDING = 50;

/**
 * Below this many raster pixels, encode losslessly (PNG) instead of WebP.
 * ~1.5MP of mostly-transparent line art is a modest PNG, and it avoids the
 * lossy artefacts entirely. Above it, the size difference stops being modest.
 */
const LOSSLESS_PIXEL_BUDGET = 1_500_000;

/** Data-URL length past which the lossless bet has clearly lost and the raster
 *  is re-encoded as WebP. Comfortably under MAX_ROOM_SAVED_DRAWING_JSON_BYTES. */
const LOSSLESS_BYTE_BUDGET = 320_000;

/**
 * Render a set of LIVE fabric objects into one image object covering exactly the
 * world rect they occupied.
 *
 * Renders straight off the live objects — no clone, no re-enliven. The exporter
 * only ever asks its canvas for `getObjects()`, `backgroundColor` and
 * `skipOffscreen`, so a minimal stand-in keeps peak memory at ONE copy of the
 * scene instead of two. The objects themselves are untouched (the exporter
 * restores `visible`/`objectCaching` per object).
 */
export async function rasterizeObjectsToImage(
	objects: FabricObject[],
	options: {
		userId?: string;
		maxDimension: number;
		signal?: AbortSignal;
	},
): Promise<fabric.FabricObject | null> {
	if (!objects.length) return null;

	const bounds = computeBounds(objects, EXPORT_PADDING);
	if (
		!Number.isFinite(bounds.minX) ||
		!(bounds.width > 0) ||
		!(bounds.height > 0)
	) {
		return null;
	}

	const extent = Math.max(bounds.width, bounds.height);

	// Render at DEVICE pixels, not world pixels.
	//
	// The exporter's scale is `maxSize / extent`. Capping maxSize at the extent
	// means one world unit → one raster pixel, and the canvas then paints that
	// raster onto a 2–3x DPR backing store: a 10px stroke that was crisp vector
	// geometry becomes 10 source pixels stretched over 20–30 device pixels. It
	// reads as an obvious quality drop precisely when the content is SMALL, and
	// hides on a big drawing only because the maxDimension cap was already
	// downsampling everything uniformly there.
	//
	// MAX_RENDER_SCALE, not raw devicePixelRatio: it is exactly the resolution the
	// committed tiles rasterize vector content at, so matching it puts the raster
	// on equal footing with the strokes it replaced — no more, which would be
	// wasted pixels the compositor only downsamples again. (renderQuality.config
	// is explicit that nothing in the engine may read window.devicePixelRatio.)
	//
	// It cannot survive zooming in past that — rasterizing is still lossy, which
	// is what the flatten confirmation warns about.
	const maxSize = Math.min(options.maxDimension, extent * MAX_RENDER_SCALE);

	const surface = {
		getObjects: () => objects,
		backgroundColor: "transparent",
		skipOffscreen: false,
	};

	// Lossless for anything small enough to afford it. WebP's chroma subsampling
	// puts coloured halos around thin dark strokes on transparency — the exact
	// case ("a couple of lines") where the artefact is most visible and the PNG
	// is cheapest, since line art over transparency compresses extremely well.
	const scale = maxSize / extent;
	const pixels = bounds.width * scale * (bounds.height * scale);

	const encode = (format: "image/png" | "image/webp") =>
		exportBoundingBoxImage(surface as any, {
			maxSize,
			asDataUrl: true,
			quality: format === "image/png" ? 1 : 0.94,
			format,
			signal: options.signal,
		});

	let dataUrl =
		pixels <= LOSSLESS_PIXEL_BUDGET
			? ((await encode("image/png"))?.img as string | undefined)
			: ((await encode("image/webp"))?.img as string | undefined);

	// Line art was the bet; a dense, colourful region of the same pixel count is
	// the case that loses it. Re-encode rather than let a flatten in a room blow
	// past the wire budget (this raster crosses it on the add and inside every
	// undo of it) or bloat a draft.
	if (typeof dataUrl === "string" && dataUrl.length > LOSSLESS_BYTE_BUDGET) {
		dataUrl = (await encode("image/webp"))?.img as string | undefined;
	}
	if (typeof dataUrl !== "string" || !dataUrl) return null;

	// A data URL, deliberately — same shape every other image in the document has
	// (see addImageToCanvas). A remote src would make the canvas's origin depend
	// on CORS headers, and one tainted image breaks EVERY later export of the
	// whole drawing.
	const image = await fabric.Image.fromURL(dataUrl);
	image.set({
		id: uuidv4(),
		userId: options.userId,
		originX: "left",
		originY: "top",
		left: bounds.minX,
		top: bounds.minY,
		// The raster covers the padded content box; scaling it back to that exact
		// rect is what makes a flatten look like nothing moved.
		scaleX: bounds.width / (image.width || 1),
		scaleY: bounds.height / (image.height || 1),
		// The strokes are gone; the flag lets the UI explain why this one can't be
		// broken apart.
		flattened: true,
	} as any);
	image.setCoords();
	return image;
}

/**
 * Rasterize an oversized saved scene into ONE static image object.
 *
 * A drawing past MAX_SAVED_OBJECTS is not something the live document can carry
 * — every object of it is indexed, z-ordered, baked, serialized on every save
 * and (in a room) replicated. Refusing to open it at all is the honest but
 * miserable answer; this is the other one: the user gets their artwork, placed
 * and movable, at the cost of no longer being able to edit the individual
 * strokes inside it.
 *
 * The N objects are still enlivened, but only into a throwaway scratch canvas
 * that is disposed before we return, so the cost is a one-off import spike
 * rather than a permanently heavier document.
 *
 * Returns null when the scene rasterizes to nothing (every object filtered out,
 * or an empty/failed export) — callers should treat that as "nothing imported".
 */
export async function flattenSavedObjectsToImage(
	objectsJSON: any[],
	options: {
		userId?: string;
		maxDimension?: number;
		signal?: AbortSignal;
	} = {},
): Promise<fabric.FabricObject | null> {
	if (!Array.isArray(objectsJSON) || objectsJSON.length === 0) return null;

	// Backing store stays 1×1: object coordinates and the bounded export helper
	// do not depend on it, and sizing it to the scene's world extent is how you
	// ask a WebView for a multi-gigabyte canvas.
	const scratch = new fabric.StaticCanvas(undefined, {
		width: 1,
		height: 1,
		renderOnAddRemove: false,
	});

	try {
		scratch.backgroundColor = "transparent";

		const objects: FabricObject[] = [];
		await enlivenObjectsTimeSlivered(
			objectsJSON,
			(obj) => {
				const migrated = migrateLegacyOrigin(obj);
				scratch.add(migrated as any);
				objects.push(migrated);
			},
			options.signal,
		);
		if (objects.length === 0) return null;

		return await rasterizeObjectsToImage(objects, {
			userId: options.userId,
			maxDimension:
				options.maxDimension ?? FLATTENED_SAVED_OBJECT_MAX_DIMENSION,
			signal: options.signal,
		});
	} finally {
		// Drop the enlivened scene before the caller does anything else with the
		// real canvas — this is the peak-memory moment of the whole import.
		try {
			scratch.dispose();
		} catch {
			/* a disposed/never-initialised scratch canvas is not worth a throw */
		}
	}
}
