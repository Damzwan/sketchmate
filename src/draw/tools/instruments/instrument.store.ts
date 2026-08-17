import type { Canvas } from "fabric";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
	createStrokeConstraint,
	type InstrumentGeometry,
	type InstrumentPoint,
	type StrokeConstraint,
} from "@/draw/tools/instruments/instrumentGeometry";
import {
	compassCenterMarginPx,
	maxCompassRadiusPx,
	maxRulerLengthPx,
	rulerCenterMarginPx,
} from "@/draw/tools/instruments/instrumentViewport";

export type InstrumentType = "ruler" | "compass";

const SNAP_DISTANCE_PX = 22;

/**
 * An instrument lives in the DRAWING, not on the screen.
 *
 * Its size used to be held in screen pixels and the world size derived from the
 * zoom, so zooming out grew the instrument's world span while it kept the same
 * size under your finger. For the compass that is simply wrong: the radius IS
 * the circle you are about to draw, so placing it on a feature, zooming out and
 * drawing gave a bigger circle than the one you positioned. The ruler has the
 * same problem one level down — its two snap edges sit at ±width/2, so a
 * screen-pinned width slid the edge you had aligned to a stroke.
 *
 * So centre, angle, length, width and radius are all WORLD units and no
 * viewport change touches them. What stays in screen pixels is everything that
 * exists to be grabbed rather than to be measured: the handles, the drag puck,
 * and the display clamps below.
 */

/**
 * Display-only floors, in screen pixels.
 *
 * A world-anchored instrument can be zoomed down to a hairline, and a hairline
 * cannot be grabbed. These keep it visible and draggable at any zoom WITHOUT
 * touching the stored geometry — which is why `beginStroke` reads the stored
 * geometry rather than the display: a clamp that exists for grabbability must
 * never move the line you are drawing.
 */
const MIN_RULER_LENGTH_PX = 96;
const MIN_RULER_WIDTH_PX = 20;
const MAX_RULER_WIDTH_PX = 96;
const MIN_COMPASS_RADIUS_PX = 28;

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export const useInstrumentStore = defineStore("instrument", () => {
	let canvas: Canvas | null = null;
	let strokeConstraint: StrokeConstraint | null = null;
	let cachedRect: DOMRect | null = null;

	const geometry = ref<InstrumentGeometry | null>(null);
	const activeType = computed<InstrumentType | null>(
		() => geometry.value?.type ?? null,
	);

	function init(nextCanvas: Canvas) {
		canvas = nextCanvas;
		strokeConstraint = null;
		cachedRect = null;
	}

	function destroy() {
		canvas = null;
		strokeConstraint = null;
		cachedRect = null;
		geometry.value = null;
	}

	/**
	 * One layout read per frame. A drag delivers pointer samples faster than the
	 * display refreshes, and every metrics call used to force a synchronous
	 * layout — several per sample once clamping and scene conversion ran too.
	 */
	function canvasRect(): DOMRect | null {
		if (!canvas) return null;
		if (cachedRect) return cachedRect;
		cachedRect = canvas.upperCanvasEl.getBoundingClientRect();
		if (typeof requestAnimationFrame === "function") {
			requestAnimationFrame(() => {
				cachedRect = null;
			});
		} else {
			const rect = cachedRect;
			cachedRect = null;
			return rect;
		}
		return cachedRect;
	}

	function viewportMetrics() {
		const rect = canvasRect();
		if (!canvas || !rect) return null;
		return {
			rect,
			zoom: Math.max(canvas.getZoom(), 0.001),
			minDimension: Math.max(1, Math.min(rect.width, rect.height)),
			width: Math.max(1, rect.width),
			height: Math.max(1, rect.height),
		};
	}

	/**
	 * Inverse of the overlay's own scene→screen mapping (`vpt` applied to a
	 * point, in element-relative CSS pixels). Fabric's `getScenePoint` adds
	 * ancestor scroll offsets to the element rect, so round-tripping through it
	 * displaced the instrument on any scrolled ancestor.
	 */
	function viewportToScene(x: number, y: number): InstrumentPoint {
		const vpt = canvas?.viewportTransform;
		if (!vpt) return { x, y };
		const determinant = vpt[0] * vpt[3] - vpt[1] * vpt[2] || 0.001;
		const dx = x - vpt[4];
		const dy = y - vpt[5];
		return {
			x: (dx * vpt[3] - dy * vpt[2]) / determinant,
			y: (dy * vpt[0] - dx * vpt[1]) / determinant,
		};
	}

	function viewportCenter(): InstrumentPoint {
		const rect = canvasRect();
		if (!canvas || !rect) return { x: 0, y: 0 };
		return viewportToScene(rect.width / 2, rect.height / 2);
	}

	function worldSize(screenPixels: number): number {
		return screenPixels / Math.max(canvas?.getZoom() ?? 1, 0.001);
	}

	/**
	 * Memo for `displayGeometry`.
	 *
	 * It is called several times per frame — once per overlay computed, again
	 * from every clamp, again when a stroke starts — and each call was a fresh
	 * object plus the viewport maths behind it. The inputs are compared as
	 * numbers rather than through a serialized key so a cache hit allocates
	 * nothing at all.
	 */
	let cachedDisplay: InstrumentGeometry | null = null;
	const cacheInputs = new Float64Array(3);
	let cachedSource: InstrumentGeometry | null = null;

	function displayMatchesCache(
		current: InstrumentGeometry,
		zoom: number,
		width: number,
		height: number,
	): boolean {
		// Identity first: every mutation replaces the geometry object, so a match
		// here already rules out any change to centre, angle, length or radius.
		// Only the things OUTSIDE it still need comparing.
		if (cachedSource !== current || !cachedDisplay) return false;
		return (
			cacheInputs[0] === zoom &&
			cacheInputs[1] === width &&
			cacheInputs[2] === height
		);
	}

	function rememberDisplay(
		current: InstrumentGeometry,
		display: InstrumentGeometry,
		zoom: number,
		width: number,
		height: number,
	): InstrumentGeometry {
		cachedSource = current;
		cachedDisplay = display;
		cacheInputs[0] = zoom;
		cacheInputs[1] = width;
		cacheInputs[2] = height;
		return display;
	}

	/**
	 * The stored geometry, made grabbable at the current zoom.
	 *
	 * Ordinarily this returns the stored world size untouched — the instrument
	 * scales with the drawing like a ruler lying on paper. The clamps only bind
	 * at the extremes, where the true size is either too small to grab or so
	 * large that its SVG geometry stops being finite.
	 *
	 * FOR DISPLAY AND FOR HIT SURFACES ONLY. Snapping reads `geometry` directly:
	 * see the note on the clamp constants.
	 */
	function displayGeometry(): InstrumentGeometry | null {
		// Cheapest question first: with no instrument out there is nothing to
		// measure, and `viewportMetrics` costs a layout read.
		const current = geometry.value;
		if (!current) return null;
		const viewport = viewportMetrics();
		if (!viewport) return current;

		if (
			displayMatchesCache(
				current,
				viewport.zoom,
				viewport.width,
				viewport.height,
			)
		) {
			return cachedDisplay;
		}

		if (current.type === "ruler") {
			const maxLengthPx = maxRulerLengthPx(viewport);
			const lengthPx = clamp(
				current.length * viewport.zoom,
				Math.min(MIN_RULER_LENGTH_PX, maxLengthPx),
				maxLengthPx,
			);
			const widthPx = clamp(
				current.width * viewport.zoom,
				MIN_RULER_WIDTH_PX,
				Math.max(
					MIN_RULER_WIDTH_PX,
					Math.min(MAX_RULER_WIDTH_PX, lengthPx / 2),
				),
			);
			return rememberDisplay(
				current,
				{
					...current,
					center: { ...current.center },
					length: lengthPx / viewport.zoom,
					width: widthPx / viewport.zoom,
				},
				viewport.zoom,
				viewport.width,
				viewport.height,
			);
		}

		const maxRadiusPx = maxCompassRadiusPx(viewport);
		const radiusPx = clamp(
			current.radius * viewport.zoom,
			Math.min(MIN_COMPASS_RADIUS_PX, maxRadiusPx),
			maxRadiusPx,
		);
		return rememberDisplay(
			current,
			{
				...current,
				center: { ...current.center },
				radius: radiusPx / viewport.zoom,
			},
			viewport.zoom,
			viewport.width,
			viewport.height,
		);
	}

	function select(type: InstrumentType) {
		if (geometry.value?.type === type) {
			remove();
			return;
		}
		const viewport = viewportMetrics();
		const center = viewportCenter();
		strokeConstraint = null;
		// Sized against the screen ONCE, at the moment it is placed, then converted
		// to world units and left alone. A comfortable first size is a screen
		// question; everything after that is a drawing question.
		const minDimension = viewport?.minDimension ?? 600;
		if (type === "ruler") {
			geometry.value = {
				type,
				center,
				length: worldSize(clamp(minDimension * 0.68, 220, 520)),
				width: worldSize(clamp(minDimension * 0.1, 54, 72)),
				angle: -Math.PI / 12,
			};
		} else {
			geometry.value = {
				type,
				center,
				radius: worldSize(clamp(minDimension * 0.22, 78, 190)),
			};
		}
		ensureInViewport();
	}

	function remove() {
		geometry.value = null;
		strokeConstraint = null;
	}

	function setCenter(point: InstrumentPoint) {
		if (!geometry.value) return;
		geometry.value = {
			...geometry.value,
			center: clampCenterToViewport(point),
		};
	}

	/**
	 * Rotation changes the angle and NOTHING else.
	 *
	 * No re-clamp here: the ruler's clamp is rotation-invariant now, so calling
	 * it would be a no-op — but leaving the call in would invite the bug straight
	 * back the next time the margin rule grows an angle term.
	 */
	function setRulerAngle(angle: number) {
		if (geometry.value?.type !== "ruler") return;
		geometry.value = { ...geometry.value, angle };
	}

	/**
	 * Resize, in WORLD units.
	 *
	 * The size caps are expressed in screen pixels because they are about what
	 * you can see and reach while you are dragging the handle — so they are
	 * resolved against the CURRENT viewport and applied HERE, at the moment of
	 * the edit. Applying them continuously (as the display path used to) would
	 * let a zoom quietly shrink a ruler the user had deliberately sized.
	 */
	function setRulerLength(length: number) {
		if (geometry.value?.type !== "ruler") return;
		const viewport = viewportMetrics();
		const zoom = viewport?.zoom ?? 1;
		const maxLengthPx = maxRulerLengthPx(
			viewport ?? { width: 600, height: 600 },
		);
		const nextLength =
			clamp(length * zoom, Math.min(120, maxLengthPx), maxLengthPx) / zoom;
		// The body keeps its proportion to the length, as it always has.
		const scale = nextLength / Math.max(geometry.value.length, 0.001);
		const nextWidth =
			clamp(geometry.value.width * scale * zoom, 42, MAX_RULER_WIDTH_PX) / zoom;
		geometry.value = {
			...geometry.value,
			length: nextLength,
			width: nextWidth,
		};
		ensureInViewport();
	}

	/** @see setRulerLength — same world-units-in, edit-time-caps contract. */
	function setCompassRadius(radius: number) {
		if (geometry.value?.type !== "compass") return;
		const viewport = viewportMetrics();
		const zoom = viewport?.zoom ?? 1;
		const maxRadiusPx = maxCompassRadiusPx(
			viewport ?? { width: 600, height: 600 },
		);
		geometry.value = {
			...geometry.value,
			radius:
				clamp(radius * zoom, Math.min(36, maxRadiusPx), maxRadiusPx) / zoom,
		};
		ensureInViewport();
	}

	function clampCenterToViewport(point: InstrumentPoint): InstrumentPoint {
		const viewport = viewportMetrics();
		const displayed = displayGeometry();
		if (!canvas || !viewport || !displayed) return { ...point };
		const vpt = canvas.viewportTransform;
		const screen = {
			x: vpt[0] * point.x + vpt[2] * point.y + vpt[4],
			y: vpt[1] * point.x + vpt[3] * point.y + vpt[5],
		};

		let halfWidth: number;
		let halfHeight: number;
		let padding = 12;
		if (displayed.type === "ruler") {
			// The ruler is allowed to run off the edges of the screen — only its
			// CENTRE is kept in view, and by a margin that depends on nothing the
			// rotation can change. See rulerCenterMarginPx: a bounding-box clamp is
			// what made rotating drag the ruler sideways.
			halfWidth = 0;
			halfHeight = 0;
			padding = rulerCenterMarginPx(displayed.width * viewport.zoom);
		} else {
			// Same story as the ruler: only the grabbable middle is kept on screen.
			// Keeping the whole circumference in view pinned any circle wider than
			// the viewport to the exact centre of it.
			halfWidth = 0;
			halfHeight = 0;
			padding = compassCenterMarginPx(displayed.radius * viewport.zoom);
		}

		const x = clamp(
			screen.x,
			Math.min(viewport.rect.width / 2, halfWidth + padding),
			Math.max(
				viewport.rect.width / 2,
				viewport.rect.width - halfWidth - padding,
			),
		);
		const y = clamp(
			screen.y,
			Math.min(viewport.rect.height / 2, halfHeight + padding),
			Math.max(
				viewport.rect.height / 2,
				viewport.rect.height - halfHeight - padding,
			),
		);
		return viewportToScene(x, y);
	}

	/**
	 * Re-clamp after an EDIT that could have pushed the instrument out of reach —
	 * placing it, or growing it far enough that its drag surface no longer fits.
	 *
	 * Deliberately NOT called on `viewport:changed` any more. Doing so dragged
	 * the instrument along with every pan and pinch, which is the opposite of
	 * anchoring it to the drawing: you would line the ruler up with a stroke,
	 * pan, and find it had walked off that stroke. An instrument left behind by
	 * a pan is recovered with `recenter`, not by following the camera.
	 *
	 * Writes only when the clamp actually MOVED it, so an unchanged geometry
	 * object does not invalidate every overlay computed for nothing.
	 */
	function ensureInViewport() {
		const current = geometry.value;
		if (!current) return;
		const center = clampCenterToViewport(current.center);
		if (
			Math.abs(center.x - current.center.x) < 0.01 &&
			Math.abs(center.y - current.center.y) < 0.01
		) {
			return;
		}
		geometry.value = { ...current, center };
	}

	/**
	 * Is the instrument's centre off screen — i.e. left behind by a pan?
	 *
	 * The CENTRE, because that is what carries the drag surface: a ruler whose
	 * tips run off both edges is perfectly usable, one whose middle is off screen
	 * cannot be picked up.
	 */
	function isOutOfView(): boolean {
		const current = geometry.value;
		const viewport = viewportMetrics();
		if (!current || !viewport || !canvas) return false;
		const vpt = canvas.viewportTransform;
		const x = vpt[0] * current.center.x + vpt[2] * current.center.y + vpt[4];
		const y = vpt[1] * current.center.x + vpt[3] * current.center.y + vpt[5];
		return (
			x < 0 || y < 0 || x > viewport.rect.width || y > viewport.rect.height
		);
	}

	/** Bring an instrument the camera has left behind back under the user. */
	function recenter() {
		if (!geometry.value) return;
		geometry.value = { ...geometry.value, center: viewportCenter() };
		ensureInViewport();
	}

	/**
	 * Snapping reads the STORED geometry, never `displayGeometry`.
	 *
	 * The display clamps exist so a far-zoomed instrument stays visible and
	 * grabbable. If they fed the constraint, they would move the line being
	 * drawn — a ruler edge you had aligned to a stroke would rule somewhere else
	 * purely because of how far you happened to be zoomed out.
	 */
	function beginStroke(point: InstrumentPoint): InstrumentPoint {
		strokeConstraint = createStrokeConstraint(
			geometry.value,
			point,
			worldSize(SNAP_DISTANCE_PX),
		);
		return strokeConstraint?.(point) ?? point;
	}

	function constrainStroke(point: InstrumentPoint): InstrumentPoint {
		return strokeConstraint?.(point) ?? point;
	}

	/**
	 * Is the current stroke actually snapped to something?
	 *
	 * Deliberately NOT a ref: the drawing hook asks this for every pointer sample
	 * of every stroke, including the overwhelmingly common case of no instrument
	 * at all, and it exists so that case can skip the coordinate wrapping
	 * entirely. Making it reactive would put a dependency-tracking read on the
	 * same path it is meant to keep empty.
	 */
	function hasConstraint(): boolean {
		return strokeConstraint !== null;
	}

	function endStroke(point?: InstrumentPoint): InstrumentPoint | undefined {
		const result = point ? constrainStroke(point) : undefined;
		strokeConstraint = null;
		return result;
	}

	function scenePointFromClient(clientX: number, clientY: number) {
		const rect = canvasRect();
		if (!canvas || !rect) return null;
		return viewportToScene(clientX - rect.left, clientY - rect.top);
	}

	return {
		geometry,
		activeType,
		init,
		destroy,
		select,
		remove,
		setCenter,
		setRulerAngle,
		setRulerLength,
		setCompassRadius,
		displayGeometry,
		ensureInViewport,
		isOutOfView,
		recenter,
		beginStroke,
		constrainStroke,
		hasConstraint,
		endStroke,
		scenePointFromClient,
	};
});
