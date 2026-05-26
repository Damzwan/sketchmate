// src/draw/transform/remoteTransformOverlay.ts
//
// Multi-session bitmap overlay for REMOTE (or any non-local) object
// modifications. Mirrors the local transformController pattern but supports
// N concurrent moving objects at once.

import { Canvas, FabricObject } from "fabric";
import { useDrawObjectManager } from "@/draw/store/drawObjectManager.store";
import { WorldRect } from "@/draw/tilecache";

interface RemoteSession {
	obj: FabricObject;
	bitmap: ImageBitmap | null;
	bakedOrigin: { left: number; top: number; width: number; height: number };
	bakedRefs: {
		left: number;
		top: number;
		scaleX: number;
		scaleY: number;
		angle: number;
	};
	savedOpacity: number;
	lastUpdate: number;
}

const sessions = new Map<string, RemoteSession>();
let c: Canvas | null = null;
let rafId: number | null = null;
let settleCheckTimer: any = null;

const SETTLE_MS = 200;
const SETTLE_CHECK_INTERVAL = 80;
const MAX_BITMAP_DIM = 4096;
const MOTION_BAKE_SCALE = 0.6;
const MAX_CONCURRENT_OVERLAYS = 12;

export function init(canvas: Canvas) {
	c = canvas;
}

export function handleRemoteModify(
	obj: FabricObject,
	oldRect: WorldRect | null,
): boolean {
	if (!c || !obj.id) return false;
	let s = sessions.get(obj.id);
	if (!s) {
		if (sessions.size >= MAX_CONCURRENT_OVERLAYS) return false;
		s = {
			obj,
			bitmap: null,
			bakedOrigin: { left: 0, top: 0, width: 0, height: 0 },
			bakedRefs: { left: 0, top: 0, scaleX: 1, scaleY: 1, angle: 0 },
			savedOpacity: obj.opacity,
			lastUpdate: performance.now(),
		};
		sessions.set(obj.id, s);
		obj.opacity = 0;
		if (oldRect) useDrawObjectManager().scheduleRectPatch(oldRect);
		ensureSettleCheck();
	} else {
		s.lastUpdate = performance.now();
	}
	requestRender();
	return true;
}

export function endSessions(ids: string[]) {
	for (const id of ids) {
		const s = sessions.get(id);
		if (s) endSession(s);
	}
	requestRender();
}

export function reset() {
	for (const s of sessions.values()) {
		if (s.bitmap) s.bitmap.close();
		s.obj.opacity = s.savedOpacity;
	}
	sessions.clear();
	clearTimeout(settleCheckTimer);
	settleCheckTimer = null;
	if (rafId !== null) {
		cancelAnimationFrame(rafId);
		rafId = null;
	}
	if (c) clearTopContext(c);
}

export function hasActiveSessions(): boolean {
	return sessions.size > 0;
}

export function isOverlayed(id: string): boolean {
	return sessions.has(id);
}

export function requestRender(): void {
	if (rafId !== null) return;
	if (sessions.size === 0) return;
	rafId = requestAnimationFrame(renderAll);
}

function renderAll() {
	rafId = null;
	if (!c || sessions.size === 0) return;
	for (const s of sessions.values()) {
		if (s.bitmap === null) bakeSessionBitmap(c, s);
	}
	renderOverlay(c);
}

function bakeSessionBitmap(canvas: Canvas, s: RemoteSession) {
	const wasOpacity = s.obj.opacity;
	s.obj.opacity = s.savedOpacity;
	try {
		// @ts-ignore
		const b = s.obj.getBoundingRect(true, true);
		const PAD = 8;
		const minX = b.left - PAD;
		const minY = b.top - PAD;
		const worldW = b.width + 2 * PAD;
		const worldH = b.height + 2 * PAD;
		if (worldW <= 0 || worldH <= 0) {
			s.obj.opacity = wasOpacity;
			return;
		}
		const zoom = canvas.viewportTransform![0];
		const dpr = window.devicePixelRatio || 1;
		let scale = zoom * dpr * MOTION_BAKE_SCALE;
		let physW = Math.ceil(worldW * scale);
		let physH = Math.ceil(worldH * scale);
		if (physW > MAX_BITMAP_DIM || physH > MAX_BITMAP_DIM) {
			const f = Math.min(MAX_BITMAP_DIM / physW, MAX_BITMAP_DIM / physH);
			physW = Math.max(1, Math.floor(physW * f));
			physH = Math.max(1, Math.floor(physH * f));
			scale *= f;
		}
		const off = new OffscreenCanvas(physW, physH);
		const ctx = off.getContext("2d");
		if (!ctx) {
			s.obj.opacity = wasOpacity;
			return;
		}
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "low";
		ctx.scale(scale, scale);
		ctx.translate(-minX, -minY);
		try {
			s.obj.render(ctx as any);
		} catch {
			s.obj.opacity = wasOpacity;
			return;
		}
		let bitmap: ImageBitmap;
		try {
			// @ts-ignore
			bitmap = off.transferToImageBitmap();
		} catch {
			s.obj.opacity = wasOpacity;
			return;
		}
		s.bitmap = bitmap;
		s.bakedOrigin = { left: minX, top: minY, width: worldW, height: worldH };
		s.bakedRefs = {
			left: s.obj.left ?? 0,
			top: s.obj.top ?? 0,
			scaleX: s.obj.scaleX ?? 1,
			scaleY: s.obj.scaleY ?? 1,
			angle: s.obj.angle ?? 0,
		};
	} finally {
		s.obj.opacity = 0;
	}
}

function renderOverlay(canvas: Canvas) {
	const topCtx = canvas.getTopContext();
	const vpt = canvas.viewportTransform!;
	const w = canvas.getElement().width;
	const h = canvas.getElement().height;

	topCtx.save();
	topCtx.setTransform(1, 0, 0, 1, 0, 0);
	topCtx.clearRect(0, 0, w, h);
	topCtx.restore();

	topCtx.save();
	topCtx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
	topCtx.imageSmoothingEnabled = true;
	topCtx.imageSmoothingQuality = "low";

	for (const s of sessions.values()) {
		if (!s.bitmap) continue;
		const o = s.obj;
		const curLeft = o.left ?? 0;
		const curTop = o.top ?? 0;
		const curScaleX = o.scaleX ?? 1;
		const curScaleY = o.scaleY ?? 1;
		const curAngle = o.angle ?? 0;
		const sx = curScaleX / s.bakedRefs.scaleX;
		const sy = curScaleY / s.bakedRefs.scaleY;
		const angleDelta = curAngle - s.bakedRefs.angle;
		topCtx.save();
		topCtx.translate(curLeft, curTop);
		topCtx.rotate((angleDelta * Math.PI) / 180);
		topCtx.scale(sx, sy);
		const pivotInBboxX = s.bakedRefs.left - s.bakedOrigin.left;
		const pivotInBboxY = s.bakedRefs.top - s.bakedOrigin.top;
		topCtx.drawImage(
			s.bitmap,
			-pivotInBboxX,
			-pivotInBboxY,
			s.bakedOrigin.width,
			s.bakedOrigin.height,
		);
		topCtx.restore();
	}
	topCtx.restore();

	const active = canvas.getActiveObject();
	if (active && active._renderControls) {
		active._renderControls(topCtx);
	}
}

function ensureSettleCheck() {
	if (settleCheckTimer !== null) return;
	settleCheckTimer = setInterval(checkSettled, SETTLE_CHECK_INTERVAL);
}

function checkSettled() {
	const now = performance.now();
	const toEnd: RemoteSession[] = [];
	for (const s of sessions.values()) {
		if (now - s.lastUpdate >= SETTLE_MS) toEnd.push(s);
	}
	for (const s of toEnd) endSession(s);
	if (sessions.size === 0) {
		clearInterval(settleCheckTimer);
		settleCheckTimer = null;
		if (c) clearTopContext(c);
	} else {
		requestRender();
	}
}

function endSession(s: RemoteSession) {
	s.obj.opacity = s.savedOpacity;
	s.obj.setCoords();
	useDrawObjectManager().scheduleObjectPatch(s.obj);
	if (s.bitmap) s.bitmap.close();
	sessions.delete(s.obj.id);
}

function clearTopContext(canvas: Canvas) {
	const topCtx = canvas.getTopContext();
	topCtx.save();
	topCtx.setTransform(1, 0, 0, 1, 0, 0);
	topCtx.clearRect(0, 0, canvas.getElement().width, canvas.getElement().height);
	topCtx.restore();
}
