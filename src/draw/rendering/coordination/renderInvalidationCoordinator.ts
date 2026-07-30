import type { Bounded, WorldRect } from "../committedLayer";
import type { LiveMode } from "../liveLayer";
import { MAX_SYNC_REPAIR_TILES } from "./renderEngineBase";
import { RenderBakeCoordinator } from "./renderBakeCoordinator";

export abstract class RenderInvalidationCoordinator<
	T extends Bounded,
> extends RenderBakeCoordinator<T> {
	onObjectAdded(obj: T, topmost = false): void {
		const rect = this.boundsOf(obj);
		if (!rect) return;
		this.growContentBounds(rect);
		const tier = this.committed.pickActiveTier(this.surface.getVpt()[0]);

		const gco = (obj as any).globalCompositeOperation;
		const stampSafe = !gco || gco === "source-over";

		const canStamp =
			topmost &&
			stampSafe &&
			tier > this.committed.overviewTier &&
			!this.gesturing &&
			this.intersectsView(rect) &&
			// All-or-nothing: only stamp when EVERY covered tile is stampable.
			// A partial stamp leaves stale tiles with no live fallback → flicker.
			this.committed.canStampAll(rect, tier);

		if (canStamp) {
			this.committed.dropOtherTiers(rect, tier);
			this.committed.additiveStamp(rect, obj, tier);
			this.patchOverview(rect);
			this.requestFrame();
			this.scheduleBake();
			return;
		}

		// Fallback: live overlay covers the stroke sharply until the tile bakes.
		//
		// An add is ADDITIVE and, when it is topmost and source-over, the existing
		// tile pixels stay exactly right — the live overlay supplies the only
		// thing they are missing. So the tiles are marked stale (re-bake) but stay
		// USABLE, and the composite shows sharp tiles + a sharp live object.
		// Marking them dirty instead dropped the whole footprint to the overview
		// for the entire bake round-trip, which is the "redo a stroke and
		// everything around it blurs for a second" report.
		const willLive =
			topmost &&
			stampSafe &&
			this.intersectsView(rect) &&
			this.live.add(obj, rect, "normal");
		if (willLive) {
			this.committed.markStale(rect);
			// Do NOT patch the overview here — the live overlay is the sole copy
			// during the bake window, so a semi-transparent stroke stays single.
			// The overview is folded in at demote (see demoteSettled).
		} else {
			this.committed.markDirty(rect);
			this.patchOverview(rect);
		}
		this.requestFrame();
		this.scheduleBake();
	}

	onObjectRemoved(obj: T, oldRect?: WorldRect): void {
		const rect = oldRect ?? this.boundsOf(obj);
		if (obj.id) this.live.remove(obj.id);
		if (rect) {
			this.destructiveInvalidate(rect);
			if (this.intersectsView(rect)) this.requestFrame();
		}
		this.scheduleBake();
	}

	onObjectChanged(obj: T, oldRect?: WorldRect): void {
		const rect = this.boundsOf(obj);
		// ONE pass over both footprints.
		//
		// This used to be `destructiveInvalidate(oldRect)` — which does the
		// bounded synchronous repair — followed by `additiveInvalidate(rect)`,
		// which marks the very same tiles dirty again. For a style change (stroke
		// colour, width, opacity) the two rects are the SAME region, so the repair
		// was undone the instant it happened and the object's footprint fell to
		// the overview until the async bake: the "changing an object's style
		// blurs it for a second" report. invalidateRegions merges overlapping
		// rects, invalidates everything first, then repairs once.
		const rects: WorldRect[] = [];
		if (oldRect) rects.push(oldRect);
		if (rect) rects.push(rect);
		if (!rects.length) return;
		this.invalidateRegions(rects);
	}

	/**
	 * An edit whose CHANGED pixels are smaller than the region that must
	 * re-bake. Erase undo/redo is the case that matters: the pixels change only
	 * under the eraser stroke, but every object that stroke touched has a
	 * different clip now and must be re-rendered — and those objects' bounds can
	 * cover most of the drawing.
	 *
	 * Invalidating the union made the whole union unusable, i.e. blurred an
	 * entire drawing to undo one small erase. Splitting it keeps every tile
	 * showable outside the stroke: `markStale` queues the re-bake without
	 * touching trust, `markDirty` marks only the stroke's own footprint wrong.
	 */
	/**
	 * Queue a re-bake for a region WITHOUT touching what is currently shown.
	 * For a caller that is coalescing several edits and will invalidate the
	 * actually-changed pixels once at the end.
	 */
	markRegionStale(rect: WorldRect): void {
		this.growContentBounds(rect);
		this.committed.markStale(rect);
	}

	invalidateChanged(
		changedRect: WorldRect,
		rebakeRect: WorldRect | null,
		maxSyncTiles = MAX_SYNC_REPAIR_TILES,
		deferOverview = false,
	): void {
		this.growContentBounds(changedRect);
		if (rebakeRect) {
			this.growContentBounds(rebakeRect);
			this.committed.markStale(rebakeRect);
		}
		this.committed.markDirty(changedRect);
		const vpt = this.surface.getVpt();
		const tier = this.committed.pickActiveTier(vpt[0]);
		if (
			maxSyncTiles > 0 &&
			!this.gesturing &&
			!this.loading &&
			!this.erasing &&
			tier > this.committed.overviewTier
		) {
			const vw = this.committed.viewWorld(
				vpt,
				this.surface.getSize(),
				this.surface.getDpr(),
			);
			this.committed.rebuildRectSync(changedRect, tier, vw, maxSyncTiles);
		}
		// The overview carries the erase hole punched into it at erase time, so it
		// MUST be repainted from the (now un-erased) objects or the undone stroke
		// stays visible in every fallback.
		if (deferOverview) this.deferOverview(changedRect);
		else this.patchOverview(changedRect);
		if (this.intersectsView(changedRect)) this.requestFrame();
		this.scheduleBake();
	}

	/**
	 * Coalesced change — for STREAMED remote drags. The live overlay keeps it
	 * smooth per-event (viewport-culled); the destructive sync-rebuild runs at
	 * most ONCE per frame on the unioned rect.
	 */
	onObjectChangedCoalesced(obj: T, oldRect?: WorldRect): void {
		const cur = this.boundsOf(obj);
		if (cur) {
			this.growContentBounds(cur);
			if (this.intersectsView(cur)) this.live.add(obj, cur, "normal");
		}
		let r: WorldRect | null = cur;
		if (oldRect) r = cur ? this.union(cur, oldRect) : oldRect;
		if (!r) return;
		this.pendingRemote = this.pendingRemote
			? this.union(this.pendingRemote, r)
			: { ...r };
		this.scheduleRemoteFlush();
	}

	protected scheduleRemoteFlush(): void {
		if (this.remoteRaf) return;
		this.remoteRaf = requestAnimationFrame(() => {
			this.remoteRaf = 0;
			if (this.gesturing || this.loading) {
				this.scheduleRemoteFlush();
				return;
			}
			const rect = this.pendingRemote;
			this.pendingRemote = null;
			if (!rect) return;
			this.destructiveInvalidate(rect);
			if (this.intersectsView(rect)) this.requestFrame();
			this.scheduleBake();
		});
	}

	/**
	 * BATCH invalidation for a drained remote-event queue (item A). Many
	 * adds/removes/edits collapse into ONE pass: invalidate each region at every tier
	 * (so removed / moved objects can't ghost), patch the overview (on-screen) or
	 * defer it (off-screen), then a SINGLE requestFrame + scheduleBake. No
	 * per-rect synchronous rebuild — the async bake refreshes; the overview
	 * covers holes. Nearby rects are merged so a multi-stroke region is one drop;
	 * far-apart edits stay separate so we don't over-invalidate the whole span.
	 */
	invalidateRegions(rects: WorldRect[]): void {
		if (rects.length === 0) return;
		const merged = this.mergeRects(rects);
		let anyInView = false;

		// BOUNDED SYNCHRONOUS REPAIR, shared across the whole batch.
		//
		// A single (unbatched) edit has always repaired up to MAX_SYNC_REPAIR_TILES
		// visible tiles right away — that is what makes a delete or a style change
		// look instant. Every undo and redo, however, runs inside
		// beginBatch/endBatch (drawHistoryManager wraps them unconditionally), and
		// this path did logical invalidation ONLY. So the edited region fell to the
		// low-res overview for the whole 80ms debounce + bake round-trip: the
		// "undo a stroke and it goes blurry for a second" report.
		//
		// The budget is per BATCH, not per rect, so a 300-object undo still costs
		// at most the same handful of tile renders as one deletion. Interaction
		// seams (gesture / load / erase) still skip it — there the async bake and
		// the overview are the right answer.
		const vpt = this.surface.getVpt();
		const tier = this.committed.pickActiveTier(vpt[0]);
		const canRepair =
			!this.gesturing &&
			!this.loading &&
			!this.erasing &&
			tier > this.committed.overviewTier;
		const vw = canRepair
			? this.committed.viewWorld(
					vpt,
					this.surface.getSize(),
					this.surface.getDpr(),
				)
			: null;
		let repairBudget = MAX_SYNC_REPAIR_TILES;

		for (const rect of merged) {
			this.growContentBounds(rect);
			this.committed.markDirty(rect);
			const inView = this.intersectsView(rect);
			if (vw && inView && repairBudget > 0) {
				repairBudget -= this.committed.rebuildRectSync(
					rect,
					tier,
					vw,
					repairBudget,
				);
			}
			this.patchOverview(rect);
			if (inView) anyInView = true;
		}
		if (anyInView) this.requestFrame();
		this.scheduleBake();
	}

	/**
	 * Erase commit. Fast path (canStamp: plain destination-out stroke, not
	 * selective): punch the stroke straight into the existing tile bitmaps —
	 * pixel-exact, O(touched tiles), ZERO object re-rendering, stamped tiles
	 * stay fresh so no rebake. The overview gets the same exact punch. Other
	 * tiers are dropped lazily. Fallback (inverted / selective lobby erase):
	 * the old synchronous rebuild from objects.
	 */
	onErase(eraserObj: T, rect: WorldRect, canStamp = false): void {
		const tier = this.committed.pickActiveTier(this.surface.getVpt()[0]);
		if (!canStamp) {
			this.markDirtyAndRebuildSync(rect, tier);
			return;
		}

		let complete = true;
		if (tier > this.committed.overviewTier) {
			complete = this.committed.eraseStamp(rect, eraserObj, tier);
			this.committed.dropOtherTiers(rect, tier);
		} else {
			// Overview zoom: the overview IS the picture; tiles just go stale and
			// rebuild (with updated clips) when the user zooms back in.
			this.committed.markDirty(rect);
		}

		if (!this.committed.overview.eraseObject(eraserObj)) {
			this.committed.overview.markDirty();
			this.scheduleOverviewRebuild();
		}

		if (this.intersectsView(rect)) this.requestFrame();
		if (!complete) this.scheduleBake();
	}

	protected destructiveInvalidate(rect: WorldRect): void {
		const vpt = this.surface.getVpt();
		const tier = this.committed.pickActiveTier(vpt[0]);
		// Logical invalidation is enough: stale tiles are excluded from both direct
		// compositing and fallback search. Retaining their textures until LRU
		// pressure avoids an immediate GPU destruction storm.
		this.committed.markDirty(rect);
		// Never put synchronous object rendering on an active interaction frame.
		// The overview/fallback covers the hole and the normal yielded bake resumes
		// after the gesture/load/erase seam.
		if (
			!this.gesturing &&
			!this.loading &&
			!this.erasing &&
			tier > this.committed.overviewTier
		) {
			const size = this.surface.getSize();
			const dpr = this.surface.getDpr();
			const vw = this.committed.viewWorld(vpt, size, dpr);
			this.committed.rebuildRectSync(rect, tier, vw, MAX_SYNC_REPAIR_TILES);
		}
		this.patchOverview(rect);
	}

	dropRegion(rect: WorldRect): void {
		this.destructiveInvalidate(rect);
		if (this.intersectsView(rect)) this.requestFrame();
		this.scheduleBake();
	}

	/**
	 * Logical invalidation with BOUNDED sync repair, for drag seams on big
	 * selections. The old ≤32-tile sync rebuild froze the release frame when the
	 * region was dense; here at most `maxSyncTiles` viewport
	 * tiles rebuild synchronously for instant feedback and the rest show the
	 * overview fallback until the async bake lands (the GPU drag layer covers
	 * the selection itself throughout).
	 */
	dropRegionLight(rect: WorldRect, maxSyncTiles = 6): void {
		const vpt = this.surface.getVpt();
		const tier = this.committed.pickActiveTier(vpt[0]);
		this.committed.markDirty(rect);
		if (maxSyncTiles > 0 && tier > this.committed.overviewTier) {
			const vw = this.committed.viewWorld(
				vpt,
				this.surface.getSize(),
				this.surface.getDpr(),
			);
			this.committed.rebuildRectSync(rect, tier, vw, maxSyncTiles);
		}
		this.patchOverview(rect);
		if (this.intersectsView(rect)) this.requestFrame();
		this.scheduleBake();
	}

	/**
	 * Commit a transform by stamping the drag-layer bitmap into the tiles at
	 * the new position (see CommittedLayer.stampBitmapRegion). Returns true if
	 * the whole region is covered — caller may hide its GPU layer immediately.
	 */
	stampRegionBitmap(
		rect: WorldRect,
		bmp: ImageBitmap,
		m: [number, number, number, number, number, number],
	): boolean {
		const tier = this.committed.pickActiveTier(this.surface.getVpt()[0]);
		if (tier <= this.committed.overviewTier) {
			// No tiles at this zoom — the overview IS the picture, so fall back to
			// the normal invalidation path. Callers must not have to know that.
			this.markDirty(rect);
			return false;
		}
		// The moved content may extend the board, and the overview has to show it
		// at its NEW position (it is the base under every unbaked tile, and the
		// whole picture when zoomed out). This used to be done by the CALLER via a
		// markDirty of the same rect — which also invalidated every tile we are
		// about to stamp, making the stamp fail on all of them. Doing the two
		// halves here keeps the bookkeeping without destroying the fast path.
		this.growContentBounds(rect);
		const complete = this.committed.stampBitmapRegion(rect, tier, bmp, m);
		// Only the ACTIVE tier gets the stamped pixels, so every other tier still
		// shows this region without the object that just moved into it. Mark them
		// (lazily — no texture is destroyed) so the cross-tier fallback punches
		// that rect out and takes the overview there instead, which was patched
		// below and does have the object.
		this.committed.dropOtherTiers(rect, tier);
		this.patchOverview(rect);
		if (this.intersectsView(rect)) this.requestFrame();
		this.scheduleBake(); // stamped tiles are stale — bake repaints them exactly
		return complete;
	}

	// ── direct live control ──────────────────────────────────────────────────
	liveAdd(obj: T, mode: LiveMode = "normal"): boolean {
		const rect = this.boundsOf(obj);
		if (!rect) return false;
		if (!this.intersectsView(rect)) return false;
		return this.live.add(obj, rect, mode);
	}

	liveRemove(id: string): void {
		this.live.remove(id);
		this.requestFrame();
	}

	markDirty(rect: WorldRect): void {
		// Content may have MOVED into this rect (e.g. a drag committed via
		// scheduleRectPatch). Grow bounds so the overview — which only renders
		// within contentBounds — covers the new region; otherwise a move past the
		// old extent is invisible until something else (a stroke) grows bounds.
		this.growContentBounds(rect);
		this.additiveInvalidate(rect);
		if (this.intersectsView(rect)) this.requestFrame();
		this.scheduleBake();
	}

	markDirtyAndRebuildSync(rect: WorldRect, tier: number): void {
		this.growContentBounds(rect);
		this.committed.markDirty(rect);
		if (
			!this.gesturing &&
			!this.loading &&
			!this.erasing &&
			tier > this.committed.overviewTier
		) {
			const vpt = this.surface.getVpt();
			const vw = this.committed.viewWorld(
				vpt,
				this.surface.getSize(),
				this.surface.getDpr(),
			);
			this.committed.rebuildRectSync(rect, tier, vw, MAX_SYNC_REPAIR_TILES);
		}
		this.patchOverview(rect);
		this.requestFrame();
		this.scheduleBake();
	}
}
