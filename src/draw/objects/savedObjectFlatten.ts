import type { FabricObject } from "fabric";
import * as fabric from "fabric";
import { v4 as uuidv4 } from "uuid";
import {
	IS_LOW_END_DEVICE,
	MAX_RENDER_SCALE,
} from "@/draw/config/renderQuality.config";
import { computeBounds, exportBoundingBoxImage } from "@/draw/document/export";
import {
	enlivenObjectsTimeSlivered,
	migrateLegacyOrigin,
} from "@/draw/document/serialization";
import { FLATTENED_IMAGE_MAX_DIMENSION } from "@/draw/tools/imageDownsampling";

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

/**
 * What a single flatten canvas is allowed to be on THIS device.
 *
 * 4096² is a 67MB transient RGBA allocation plus the encode — fine on a desktop,
 * a real risk in a low-end WebView, which is the class of device that ANRs on
 * exactly this kind of allocation (see renderQuality.config). The DOCUMENT bound
 * stays at FLATTENED_IMAGE_MAX_DIMENSION for everyone, so a drawing flattened on
 * a desktop is not resampled when it is reopened on a phone.
 */
const flattenProductionCeiling = () =>
	IS_LOW_END_DEVICE ? 2048 : FLATTENED_IMAGE_MAX_DIMENSION;

/**
 * Raster size for a region of `extent` world units.
 *
 * Renders at DEVICE pixels, not world pixels. MAX_RENDER_SCALE is the resolution
 * the committed tiles rasterize vector content at, so matching it puts the raster
 * on equal footing with the strokes it replaced; going past it is pixels the
 * compositor only downsamples again. (renderQuality.config is explicit that
 * nothing here may read window.devicePixelRatio.)
 *
 * A big drawing still runs into the ceiling and loses some resolution — that is
 * the honest trade for staying ONE object, and what the flatten confirmation
 * warns about.
 */
export function flattenRasterSize(
	extent: number,
	maxDimension: number,
): number {
	return Math.min(
		maxDimension,
		flattenProductionCeiling(),
		extent * MAX_RENDER_SCALE,
	);
}

/** Lossless while it is affordable — see LOSSLESS_PIXEL_BUDGET. */
function pickFormat(pixels: number): "image/png" | "image/webp" {
	return pixels <= LOSSLESS_PIXEL_BUDGET ? "image/png" : "image/webp";
}

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
 * Render a set of LIVE fabric objects into ONE image object covering exactly the
 * world rect they occupied.
 *
 * Deliberately one object, not a grid.
 *
 * A tiled version reached full render-scale resolution on paper, and was wrong
 * in practice for two reasons. It made a flatten N draggable things — the user
 * has to grab the artwork piece by piece, which is not what "flatten this layer"
 * promises. And N adds land in a single batch, where each one past the engine's
 * bounded sync-repair budget keeps its previous tiles until an async bake lands:
 * that is the "tiles disappearing / not a perfect match" report, and it does not
 * happen with a single add.
 *
 * Resolution instead comes from the ceiling (FLATTENED_LAYER_MAX_DIMENSION) and
 * from rendering at DEVICE pixels — see the scale maths below.
 *
 * Renders straight off the live objects — no clone, no re-enliven, so peak
 * memory is ONE copy of the scene plus one canvas. The exporter only ever asks
 * its canvas for `getObjects()`, `backgroundColor` and `skipOffscreen`, so a
 * minimal stand-in is enough, and it restores `visible`/`objectCaching` per
 * object.
 */
export async function rasterizeObjectsToImages(
	objects: FabricObject[],
	options: {
		userId?: string;
		maxDimension: number;
		signal?: AbortSignal;
	},
): Promise<fabric.FabricObject[]> {
	if (!objects.length) return [];

	const bounds = computeBounds(objects, EXPORT_PADDING);
	if (
		!Number.isFinite(bounds.minX) ||
		!(bounds.width > 0) ||
		!(bounds.height > 0)
	) {
		return [];
	}

	const extent = Math.max(bounds.width, bounds.height);
	const maxSize = flattenRasterSize(extent, options.maxDimension);
	const scale = maxSize / extent;

	const surface = {
		getObjects: () => objects,
		backgroundColor: "transparent",
		skipOffscreen: false,
	};

	const encode = (format: "image/png" | "image/webp") =>
		exportBoundingBoxImage(surface as any, {
			maxSize,
			asDataUrl: true,
			quality: format === "image/png" ? 1 : 0.94,
			format,
			signal: options.signal,
		});

	// Lossless while it is affordable. WebP's chroma subsampling puts coloured
	// halos around thin dark strokes on transparency, and line art over
	// transparency is exactly what PNG compresses well.
	const pixels = bounds.width * scale * (bounds.height * scale);
	let dataUrl = (await encode(pickFormat(pixels)))?.img as string | undefined;

	// Line art was the bet PNG makes; a dense, colourful drawing is the case that
	// loses it. Re-encode rather than bloat a draft or blow a room's wire budget
	// (the raster crosses it on the add and inside every undo of it).
	if (typeof dataUrl === "string" && dataUrl.length > LOSSLESS_BYTE_BUDGET) {
		dataUrl = (await encode("image/webp"))?.img as string | undefined;
	}
	if (typeof dataUrl !== "string" || !dataUrl) return [];

	// A data URL, deliberately — same shape every other image in the document has
	// (see addImageToCanvas). A remote src would make the canvas's origin depend
	// on CORS headers, and one tainted image breaks EVERY later export of the
	// whole drawing.
	const image = await fabric.Image.fromURL(dataUrl);
	image.set({
		id: uuidv4(),
		userId: options.userId,
		// CENTER origin, like every other object in the document —
		// `InteractiveFabricObject.ownDefaults` (fabricSetup.ts) overrides fabric's
		// "left"/"top" globally, and `migrateLegacyOrigin` rewrites anything read
		// back that still carries the old one.
		//
		// This was the ONE place that set "left"/"top" explicitly, so a flattened
		// layer or imported saved object was the only left/top object in a
		// center-origin scene. Fabric rotates and scales about the origin, so the
		// raster swung around its top-left corner under the mobile rotate gesture
		// instead of turning in place.
		//
		// `left`/`top` are the origin POINT, so they move to the middle of the same
		// padded content box — the object does not move, only what its coordinates
		// mean does.
		originX: "center",
		originY: "center",
		left: bounds.minX + bounds.width / 2,
		top: bounds.minY + bounds.height / 2,
		// The raster covers the padded content box; scaling it back to that exact
		// rect is what makes a flatten look like nothing moved.
		scaleX: bounds.width / (image.width || 1),
		scaleY: bounds.height / (image.height || 1),
		// The strokes are gone; the flag keeps this raster at full resolution
		// through draft restore (see imageMaxDimensionFor).
		flattened: true,
	} as any);
	image.setCoords();
	return [image];
}

/**
 * Rasterize an oversized saved scene into static image objects.
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
 * Returns an empty array when the scene rasterizes to nothing (every object
 * filtered out, or a failed encode) — callers treat that as "nothing imported".
 */
export async function flattenSavedObjectsToImages(
	objectsJSON: any[],
	options: {
		userId?: string;
		maxDimension?: number;
		signal?: AbortSignal;
	} = {},
): Promise<fabric.FabricObject[]> {
	if (!Array.isArray(objectsJSON) || objectsJSON.length === 0) return [];

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
		if (objects.length === 0) return [];

		return await rasterizeObjectsToImages(objects, {
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
