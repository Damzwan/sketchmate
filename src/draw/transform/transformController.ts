import { Canvas, FabricObject } from "fabric";
import { useDrawObjectManager } from "@/draw/store/drawObjectManager.store";

interface SelectionRefs {
	left: number;
	top: number;
	scaleX: number;
	scaleY: number;
	angle: number;
}

interface Session {
	canvas: Canvas;
	objects: FabricObject[];
	target: FabricObject;
	savedOpacity: number[];
	bitmap: ImageBitmap;
	origin: { left: number; top: number; width: number; height: number };
	refs: SelectionRefs;
	moveHappened: boolean;
	dirty: boolean;
	rafId: number | null;
}

interface CachedBake {
	bitmap: ImageBitmap;
	origin: { left: number; top: number; width: number; height: number };
	state: {
		scaleX: number;
		scaleY: number;
		angle: number;
		width: number;
		height: number;
	};
}

let session: Session | null = null;
let cachedBake: CachedBake | null = null;

// ─── Public API ──────────────────────────────────────────────────────────────

export function isActive(): boolean {
	return session !== null;
}

export function moveHappened(): boolean {
	return session?.moveHappened ?? false;
}

export function markMoved(): void {
	if (!session || session.moveHappened) return;
	session.moveHappened = true;
	renderOverlay(session);

	session.objects.forEach((o) => (o.opacity = 0));

	const mgr = useDrawObjectManager();
	mgr.scheduleRectPatch({
		x: session.origin.left,
		y: session.origin.top,
		w: session.origin.width,
		h: session.origin.height,
	});
}

export function activeObjects(): readonly FabricObject[] {
	return session?.objects ?? [];
}

export function begin(c: Canvas, target: FabricObject): void {
	if (session) return;

	const objects =
		target.type === "activeselection" || target.type === "ActiveSelection"
			? [...(target as any)._objects]
			: [target];

	const baked = bakeSelectionBitmap(c, target);
	if (!baked) return;

	const refs: SelectionRefs = {
		left: target.left ?? 0,
		top: target.top ?? 0,
		scaleX: target.scaleX ?? 1,
		scaleY: target.scaleY ?? 1,
		angle: target.angle ?? 0,
	};

	const savedOpacity = objects.map((o) => o.opacity);

	session = {
		canvas: c,
		objects,
		target,
		savedOpacity,
		bitmap: baked.bitmap,
		origin: baked.origin,
		refs,
		moveHappened: false,
		dirty: false,
		rafId: null,
	};
}

export function schedule(): void {
	if (!session) return;
	session.dirty = true;
	if (session.rafId !== null) return;
	flush();
}

export function end(c: Canvas): void {
	if (!session) return;
	if (session.rafId !== null) cancelAnimationFrame(session.rafId);

	const s = session;
	session = null;

	if (s.moveHappened) {
		s.objects.forEach((o, i) => (o.opacity = s.savedOpacity[i]));

		const mgr = useDrawObjectManager();

		mgr.scheduleRectPatch({
			x: s.origin.left,
			y: s.origin.top,
			w: s.origin.width,
			h: s.origin.height,
		});

		s.target.setCoords();

		for (const o of s.objects) {
			o.setCoords();
			mgr.updateQuadTree(o);
			mgr.scheduleObjectPatch(o);
		}

		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				// Removed bitmap.close() here so the cache survives across drops!
				if (!session) {
					clearTopContext(c);
					const active = c.getActiveObject();
					if (active) active._renderControls(c.getTopContext());
				}
			});
		});
	} else {
		s.target.setCoords();
		clearTopContext(c);

		const active = c.getActiveObject();
		if (active) active._renderControls(c.getTopContext());
	}
}

export function cancel(c: Canvas): void {
	end(c);
}

export function invalidateCache(): void {
	if (cachedBake?.bitmap) {
		cachedBake.bitmap.close();
	}
	cachedBake = null;
}

// ─── rAF flush ───────────────────────────────────────────────────────────────

function flush(): void {
	if (!session) return;
	session.rafId = null;
	if (!session.dirty) return;
	session.dirty = false;
	renderOverlay(session);
}

// ─── Bitmap baking (Optimized + Caching) ─────────────────────────────────────

function bakeSelectionBitmap(
	c: Canvas,
	target: FabricObject,
): {
	bitmap: ImageBitmap;
	origin: { left: number; top: number; width: number; height: number };
} | null {
	const PAD = 8;
	const b = target.getBoundingRect();

	const curState = {
		scaleX: target.scaleX ?? 1,
		scaleY: target.scaleY ?? 1,
		angle: target.angle ?? 0,
		width: target.width ?? 0,
		height: target.height ?? 0,
	};

	// 1. FAST CACHE RETURN: If we only translated the object, reuse the bitmap!
	if (cachedBake) {
		if (
			cachedBake.state.scaleX === curState.scaleX &&
			cachedBake.state.scaleY === curState.scaleY &&
			cachedBake.state.angle === curState.angle &&
			cachedBake.state.width === curState.width &&
			cachedBake.state.height === curState.height
		) {
			return {
				bitmap: cachedBake.bitmap,
				origin: {
					left: b.left - PAD,
					top: b.top - PAD,
					width: cachedBake.origin.width,
					height: cachedBake.origin.height,
				},
			};
		} else {
			// Geometry changed (scaled/rotated) - invalidate and rebake
			invalidateCache();
		}
	}

	// 2. FULL BAKE: (Executes on first select, or after scaling/rotating)
	let minX = b.left - PAD;
	let minY = b.top - PAD;
	let maxX = b.left + b.width + PAD;
	let maxY = b.top + b.height + PAD;

	const worldW = maxX - minX;
	const worldH = maxY - minY;
	if (worldW <= 0 || worldH <= 0) return null;

	const zoom = c.viewportTransform![0];
	const dpr = window.devicePixelRatio || 1;
	let scale = zoom * dpr;

	const childCount =
		target.type === "activeselection" || target.type === "ActiveSelection"
			? (target as any)._objects?.length || 1
			: 1;

	if (childCount > 150) {
		scale *= 0.5;
	} else if (childCount > 50) {
		scale *= 0.75;
	}

	let physW = Math.ceil(worldW * scale);
	let physH = Math.ceil(worldH * scale);

	const MAX_DIM = 2048;
	if (physW > MAX_DIM || physH > MAX_DIM) {
		const factor = Math.min(MAX_DIM / physW, MAX_DIM / physH);
		physW = Math.max(1, Math.floor(physW * factor));
		physH = Math.max(1, Math.floor(physH * factor));
		scale *= factor;
	}

	const off = new OffscreenCanvas(physW, physH);
	const ctx = off.getContext("2d", { alpha: true });
	if (!ctx) return null;

	ctx.scale(scale, scale);
	ctx.translate(-minX, -minY);

	if (target.type === "activeselection" || target.type === "ActiveSelection") {
		const zMap = useDrawObjectManager().getZIndexMap();
		(target as any)._objects?.sort(
			(a: FabricObject, b: FabricObject) =>
				(zMap.get(a) ?? 0) - (zMap.get(b) ?? 0),
		);
	}

	try {
		target.render(ctx as any);
	} catch (err) {
		console.warn("[transformController] bake render failed", err);
	}

	let bitmap: ImageBitmap;
	try {
		bitmap = off.transferToImageBitmap();
	} catch (err) {
		return null;
	}

	cachedBake = {
		bitmap,
		origin: { left: minX, top: minY, width: worldW, height: worldH },
		state: curState,
	};

	return {
		bitmap,
		origin: cachedBake.origin,
	};
}

// ─── Overlay blit ────────────────────────────────────────────────────────────

function renderOverlay(s: Session): void {
	const c = s.canvas;
	const topCtx = c.getTopContext();
	const dpr = window.devicePixelRatio || 1;
	const vpt = c.viewportTransform!;

	topCtx.save();
	topCtx.setTransform(1, 0, 0, 1, 0, 0);
	topCtx.clearRect(0, 0, c.getElement().width, c.getElement().height);
	topCtx.restore();

	topCtx.save();
	topCtx.transform(
		vpt[0] * dpr,
		vpt[1] * dpr,
		vpt[2] * dpr,
		vpt[3] * dpr,
		vpt[4] * dpr,
		vpt[5] * dpr,
	);

	const t = s.target;
	const curLeft = t.left ?? 0;
	const curTop = t.top ?? 0;
	const curScaleX = t.scaleX ?? 1;
	const curScaleY = t.scaleY ?? 1;
	const curAngle = t.angle ?? 0;

	const sx = curScaleX / s.refs.scaleX;
	const sy = curScaleY / s.refs.scaleY;
	const angleDelta = curAngle - s.refs.angle;

	topCtx.translate(curLeft, curTop);
	topCtx.rotate((angleDelta * Math.PI) / 180);
	topCtx.scale(sx, sy);

	const pivotInBboxX = s.refs.left - s.origin.left;
	const pivotInBboxY = s.refs.top - s.origin.top;
	topCtx.drawImage(
		s.bitmap,
		-pivotInBboxX,
		-pivotInBboxY,
		s.origin.width,
		s.origin.height,
	);

	topCtx.restore();

	// @ts-ignore
	if (!c.skipControlsDrawing) c.drawControls(topCtx);
}

function clearTopContext(c: Canvas): void {
	const topCtx = c.getTopContext();
	topCtx.save();
	topCtx.setTransform(1, 0, 0, 1, 0, 0);
	topCtx.clearRect(0, 0, c.getElement().width, c.getElement().height);
	topCtx.restore();
}
