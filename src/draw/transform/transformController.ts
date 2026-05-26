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

let session: Session | null = null;

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

	// Fast bake using aCoords instead of getBoundingRect
	const baked = bakeSelectionBitmap(c, objects);
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

	// Render the overlay immediately so it masks the real objects exactly.
	// We DO NOT set opacity=0 or patch the tile cache yet.
}

export function schedule(): void {
	if (!session) return;
	session.dirty = true;
	if (session.rafId !== null) return;
	session.rafId = flush();
}

export function end(c: Canvas): void {
	if (!session) return;
	if (session.rafId !== null) cancelAnimationFrame(session.rafId);

	const s = session;
	session = null;

	if (s.moveHappened) {
		// Restore opacities so the tilecache can bake them again
		s.objects.forEach((o, i) => (o.opacity = s.savedOpacity[i]));

		const mgr = useDrawObjectManager();

		// Patch the old area where they started
		mgr.scheduleRectPatch({
			x: s.origin.left,
			y: s.origin.top,
			w: s.origin.width,
			h: s.origin.height,
		});

		s.target.setCoords();

		// Patch the new area where they landed
		for (const o of s.objects) {
			o.setCoords();
			mgr.scheduleObjectPatch(o);
		}

		// ANTI-FLICKER: Wait for the TileCache to finish its async render
		// before tearing down the top overlay. This bridges the 1-2 frame visual gap.
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (s.bitmap) s.bitmap.close();
				if (!session) {
					clearTopContext(c);
					const active = c.getActiveObject();
					if (active) active._renderControls(c.getTopContext());
				}
			});
		});
	} else {
		// If no movement happened (just a click), teardown immediately
		s.target.setCoords();
		s.bitmap.close();
		clearTopContext(c);

		const active = c.getActiveObject();
		if (active) active._renderControls(c.getTopContext());
	}
}

export function cancel(c: Canvas): void {
	end(c);
}

// ─── rAF flush ───────────────────────────────────────────────────────────────

function flush(): void {
	if (!session) return;
	session.rafId = null;
	if (!session.dirty) return;
	session.dirty = false;
	renderOverlay(session);
}

// ─── Bitmap baking (Optimized) ───────────────────────────────────────────────

function bakeSelectionBitmap(
	c: Canvas,
	objects: FabricObject[],
): {
	bitmap: ImageBitmap;
	origin: { left: number; top: number; width: number; height: number };
} | null {
	const visible = objects.filter((o) => o.visible !== false);
	if (visible.length === 0) return null;

	const PAD = 8;
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;

	// FAST BOUNDS: Use aCoords. It is instantaneous compared to getBoundingRect
	for (const o of visible) {
		const coords = o.aCoords;
		if (coords) {
			minX = Math.min(minX, coords.tl.x, coords.tr.x, coords.bl.x, coords.br.x);
			minY = Math.min(minY, coords.tl.y, coords.tr.y, coords.bl.y, coords.br.y);
			maxX = Math.max(maxX, coords.tl.x, coords.tr.x, coords.bl.x, coords.br.x);
			maxY = Math.max(maxY, coords.tl.y, coords.tr.y, coords.bl.y, coords.br.y);
		} else {
			// Fallback if aCoords isn't populated yet
			const b = o.getBoundingRect();
			if (b.left < minX) minX = b.left;
			if (b.top < minY) minY = b.top;
			if (b.left + b.width > maxX) maxX = b.left + b.width;
			if (b.top + b.height > maxY) maxY = b.top + b.height;
		}
	}

	minX -= PAD;
	minY -= PAD;
	maxX += PAD;
	maxY += PAD;

	const worldW = maxX - minX;
	const worldH = maxY - minY;
	if (worldW <= 0 || worldH <= 0) return null;

	const zoom = c.viewportTransform![0];
	const dpr = window.devicePixelRatio || 1;
	let scale = zoom * dpr;

	// Auto-scale down resolution for massive selections to save GPU
	if (visible.length > 150) {
		scale *= 0.5;
	} else if (visible.length > 50) {
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

	const zMap = useDrawObjectManager().getZIndexMap();
	const sorted = [...visible].sort(
		(a, b) => (zMap.get(a) ?? 0) - (zMap.get(b) ?? 0),
	);

	for (const o of sorted) {
		try {
			o.render(ctx as any);
		} catch (err) {
			console.warn("[transformController] bake render failed", err);
		}
	}

	let bitmap: ImageBitmap;
	try {
		bitmap = off.transferToImageBitmap();
	} catch (err) {
		return null;
	}

	return {
		bitmap,
		origin: { left: minX, top: minY, width: worldW, height: worldH },
	};
}

// ─── Overlay blit ────────────────────────────────────────────────────────────

function renderOverlay(s: Session): void {
	const c = s.canvas;
	const topCtx = c.getTopContext();
	const dpr = window.devicePixelRatio || 1; // Explicitly ensure dpr is pulled
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
