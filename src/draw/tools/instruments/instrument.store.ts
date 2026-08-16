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
	maxCompassRadiusPx,
	maxRulerLengthPx,
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

	function displayGeometry(): InstrumentGeometry | null {
		const current = geometry.value;
		const viewport = viewportMetrics();
		if (!current || !viewport) return current;

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
			return {
				...current,
				center: { ...current.center },
				length: lengthPx / viewport.zoom,
				width: widthPx / viewport.zoom,
			};
		}

		const maxRadiusPx = maxCompassRadiusPx(viewport);
		const radiusPx = Math.min(
			compassScreenRadius.value ?? current.radius * viewport.zoom,
			maxRadiusPx,
		);
		return {
			...current,
			center: { ...current.center },
			radius: radiusPx / viewport.zoom,
		};
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

	function setRulerAngle(angle: number) {
		if (geometry.value?.type !== "ruler") return;
		geometry.value = { ...geometry.value, angle };
		ensureInViewport();
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
		if (displayed.type === "ruler") {
			const length = displayed.length * viewport.zoom;
			// Reserve room for the midpoint rotation knob as well as the body.
			const width = displayed.width * viewport.zoom + 84;
			halfWidth =
				(Math.abs(Math.cos(displayed.angle)) * length +
					Math.abs(Math.sin(displayed.angle)) * width) /
				2;
			halfHeight =
				(Math.abs(Math.sin(displayed.angle)) * length +
					Math.abs(Math.cos(displayed.angle)) * width) /
				2;
		} else {
			halfWidth = displayed.radius * viewport.zoom;
			halfHeight = halfWidth;
		}

		const padding = 12;
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

	function ensureInViewport() {
		if (!geometry.value) return;
		const center = clampCenterToViewport(geometry.value.center);
		geometry.value = { ...geometry.value, center };
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
		endStroke,
		scenePointFromClient,
	};
});
