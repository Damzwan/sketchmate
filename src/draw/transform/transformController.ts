import { Canvas, FabricObject } from "fabric";
import { useDrawObjectManager } from "@/draw/store/drawObjectManager.store";
import { WorldRect } from "@/draw/tilecache";

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

	// The object has officially started moving/rotating.
	// Hide it from the tile cache NOW.
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

	// DEFERRED HIDING: Do NOT set opacity to 0 yet.
	// Do NOT schedule a rect patch.
	// We just let the overlay sit exactly on top of the real object.

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

	renderOverlay(session);
}

export function schedule(): void {
	if (!session) return;
	session.dirty = true;
	if (session.rafId !== null) return;
	session.rafId = requestAnimationFrame(flush);
}

export function end(c: Canvas): void {
	if (!session) return;
	if (session.rafId !== null) cancelAnimationFrame(session.rafId);

	const s = session;
	session = null;

	// Only restore opacity and patch if we actually hid them
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
			mgr.scheduleObjectPatch(o);
		}
	} else {
		// Even if no movement, keep coordinates synced just in case
		s.target.setCoords();
	}

	// Tear down the overlay
	s.bitmap.close();
	clearTopContext(c);

	const active = c.getActiveObject();
	if (active) active._renderControls(c.getTopContext());
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

// ─── Bitmap baking ───────────────────────────────────────────────────────────

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
	for (const o of visible) {
		// @ts-ignore
		const b = o.getBoundingRect(true, true);
		if (b.left < minX) minX = b.left;
		if (b.top < minY) minY = b.top;
		if (b.left + b.width > maxX) maxX = b.left + b.width;
		if (b.top + b.height > maxY) maxY = b.top + b.height;
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

	let physW = Math.ceil(worldW * scale);
	let physH = Math.ceil(worldH * scale);

	const MAX_DIM = 4096;
	if (physW > MAX_DIM || physH > MAX_DIM) {
		const factor = Math.min(MAX_DIM / physW, MAX_DIM / physH);
		physW = Math.max(1, Math.floor(physW * factor));
		physH = Math.max(1, Math.floor(physH * factor));
		scale *= factor;
	}

	const off = new OffscreenCanvas(physW, physH);
	const ctx = off.getContext("2d");
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
		// @ts-ignore
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
	const dpr = 1;
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
