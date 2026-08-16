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

interface RulerScreenSize {
	length: number;
	width: number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export const useInstrumentStore = defineStore("instrument", () => {
	let canvas: Canvas | null = null;
	let strokeConstraint: StrokeConstraint | null = null;
	let cachedRect: DOMRect | null = null;

	const geometry = ref<InstrumentGeometry | null>(null);
	const rulerScreenSize = ref<RulerScreenSize | null>(null);
	const compassScreenRadius = ref<number | null>(null);
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
		rulerScreenSize.value = null;
		compassScreenRadius.value = null;
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
	const cacheInputs = new Float64Array(5);
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
		if (
			cacheInputs[0] !== zoom ||
			cacheInputs[1] !== width ||
			cacheInputs[2] !== height
		) {
			return false;
		}
		if (current.type === "ruler") {
			return (
				cacheInputs[3] === (rulerScreenSize.value?.length ?? -1) &&
				cacheInputs[4] === (rulerScreenSize.value?.width ?? -1)
			);
		}
		return cacheInputs[3] === (compassScreenRadius.value ?? -1);
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
		if (current.type === "ruler") {
			cacheInputs[3] = rulerScreenSize.value?.length ?? -1;
			cacheInputs[4] = rulerScreenSize.value?.width ?? -1;
		} else {
			cacheInputs[3] = compassScreenRadius.value ?? -1;
		}
		return display;
	}

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
			const preferred = rulerScreenSize.value ?? {
				length: current.length * viewport.zoom,
				width: current.width * viewport.zoom,
			};
			const lengthPx = Math.min(preferred.length, maxLengthPx);
			const widthPx = Math.min(
				preferred.width,
				Math.max(32, Math.min(96, maxLengthPx / 2)),
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
		const radiusPx = Math.min(
			compassScreenRadius.value ?? current.radius * viewport.zoom,
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
		const minDimension = viewport?.minDimension ?? 600;
		if (type === "ruler") {
			rulerScreenSize.value = {
				length: clamp(minDimension * 0.68, 220, 520),
				width: clamp(minDimension * 0.1, 54, 72),
			};
			compassScreenRadius.value = null;
			geometry.value = {
				type,
				center,
				length: worldSize(rulerScreenSize.value.length),
				width: worldSize(rulerScreenSize.value.width),
				angle: -Math.PI / 12,
			};
		} else {
			compassScreenRadius.value = clamp(minDimension * 0.22, 78, 190);
			rulerScreenSize.value = null;
			geometry.value = {
				type,
				center,
				radius: worldSize(compassScreenRadius.value),
			};
		}
		ensureInViewport();
	}

	function remove() {
		geometry.value = null;
		strokeConstraint = null;
		rulerScreenSize.value = null;
		compassScreenRadius.value = null;
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

	function setRulerLength(length: number) {
		if (geometry.value?.type !== "ruler") return;
		const viewport = viewportMetrics();
		const zoom = viewport?.zoom ?? 1;
		const maxLengthPx = maxRulerLengthPx(
			viewport ?? { width: 600, height: 600 },
		);
		const previous = rulerScreenSize.value ?? {
			length: geometry.value.length * zoom,
			width: geometry.value.width * zoom,
		};
		const lengthPx = clamp(
			length * zoom,
			Math.min(120, maxLengthPx),
			maxLengthPx,
		);
		const scale = lengthPx / Math.max(previous.length, 0.001);
		const widthPx = clamp(previous.width * scale, 42, 96);
		rulerScreenSize.value = { length: lengthPx, width: widthPx };
		geometry.value = {
			...geometry.value,
			length: lengthPx / zoom,
			width: widthPx / zoom,
		};
		ensureInViewport();
	}

	function setCompassRadius(radius: number) {
		if (geometry.value?.type !== "compass") return;
		const viewport = viewportMetrics();
		const zoom = viewport?.zoom ?? 1;
		const maxRadiusPx = maxCompassRadiusPx(
			viewport ?? { width: 600, height: 600 },
		);
		const radiusPx = clamp(
			radius * zoom,
			Math.min(36, maxRadiusPx),
			maxRadiusPx,
		);
		compassScreenRadius.value = radiusPx;
		geometry.value = {
			...geometry.value,
			radius: radiusPx / zoom,
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
	 * Re-clamp after something that could have pushed the instrument out of
	 * reach — a resize, a zoom, a size change.
	 *
	 * Writes only when the clamp actually MOVED it. This runs on every
	 * `viewport:changed`, i.e. once per frame of every pan and pinch, and an
	 * unconditional write replaced `geometry` with an identical object each time,
	 * invalidating every overlay computed for nothing.
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

	function beginStroke(point: InstrumentPoint): InstrumentPoint {
		strokeConstraint = createStrokeConstraint(
			displayGeometry(),
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
		beginStroke,
		constrainStroke,
		hasConstraint,
		endStroke,
		scenePointFromClient,
	};
});
