import type { Bounded, WorldRect } from "../committedLayer";
import { getObjectBounds, mergeNearbyRects, unionRects } from "./invalidation";
import { RenderInvalidationCoordinator } from "./renderInvalidationCoordinator";

/**
 * Breathing room at the far end of the zoom range: the floor must let the whole
 * drawing sit on screen with a margin, not pressed against the bezels.
 *
 * Kept BELOW the 0.8 padding the fit-to-content helpers in canvas/viewport.ts
 * use, so those fits land inside the range instead of being clamped back up by
 * it — a floor that equals the fit would crop every "fit to content".
 */
const FIT_ZOOM_MARGIN = 0.75;

export abstract class RenderOverviewCoordinator<
	T extends Bounded,
> extends RenderInvalidationCoordinator<T> {
	/** Dense overview regions being subdivided instead of triggering a full
	 *  O(scene) rebuild. Never merged — see scheduleOverviewSplitDrain. */
	protected overviewSplitQueue: WorldRect[] = [];
	protected overviewSplitTimer: any = null;

	// ── gesture / loading / erase seams ──────────────────────────────────────
	setGesturing(on: boolean): void {
		this.gesturing = on;
		if (on) {
			// A discrete history edit may briefly retain the previous active-tier
			// bitmap while its replacement bakes. That is intentionally scoped to the
			// unchanged viewport; panning/zooming must use honest cross-tier fallback.
			this.committed.dropSharpTransitions();
			this.abortBakes();
		} else {
			if (!this.erasing) this.flushPendingOverview();
			this.requestFrame();
			this.scheduleBake();
			// abortBakes() may have killed a rebuild mid-flight. It left the overview
			// marked dirty, but nothing else re-arms it — patchOverview only schedules
			// on a patch FAILURE — so without this an interrupted rebuild never
			// finishes and the far-zoom base layer stays stale for the session.
			if (this.committed.overview.isDirty()) this.scheduleOverviewRebuild();
		}
	}

	setLoading(on: boolean): void {
		this.loading = on;
		if (on) {
			this.committed.dropSharpTransitions();
			this.abortBakes();
			this.live.clear();
		}
	}

	setErasing(on: boolean): void {
		this.erasing = on;
		if (on) {
			this.committed.dropSharpTransitions();
			this.abortBakes();
		} else {
			if (!this.gesturing) this.flushPendingOverview();
			this.requestFrame();
			this.scheduleBake();
		}
	}

	/**
	 * Open/close a multi-step scene mutation (one history op, or a whole burst of
	 * them while the user holds undo).
	 *
	 * Baking is suspended for the duration. A history op applies its clip/object
	 * changes one at a time and YIELDS between them, so without this a bake runs
	 * against a half-applied scene and stores the result as a fresh tile — the
	 * permanent holes after undo spam. Frames keep running, so the user still
	 * sees each step.
	 */
	setMutating(on: boolean): void {
		if (this.mutating === on) return;
		this.mutating = on;
		if (on) {
			this.abortBakes();
			return;
		}
		if (this.pendingOverview.length > 0) {
			// A history burst can touch thousands of clipped objects. Patching the
			// queued regions here renders them synchronously on main just as the
			// user releases Undo. Rebuild from the committed worker mirror instead;
			// the previous overview remains a coherent fallback until it lands.
			this.pendingOverview = [];
			this.committed.overview.markDirty();
			this.scheduleOverviewRebuild();
		}
		this.requestFrame();
		this.scheduleBake();
	}

	pickActiveTier(zoom: number): number {
		return this.committed.pickActiveTier(zoom);
	}

	setContentBounds(rect: WorldRect | null): void {
		this.contentBounds = rect ? { ...rect } : null;
	}

	/** The bounds the engine currently believes content occupies — maintained
	 *  incrementally by growContentBounds, so this is O(1) unlike the store's
	 *  full recompute. Read-only: callers must not mutate the returned rect. */
	getContentBounds(): WorldRect | null {
		return this.contentBounds;
	}

	markAllDirty(): void {
		this.committed.markAllDirty();
		this.requestFrame();
		this.scheduleBake();
	}

	warmOverview(): void {
		const repaint = () => this.requestFrame();
		void this.committed.overview
			.rebuildIfNeeded(
				this.contentBounds,
				this.makeYielder("overview-build") as any,
				this.newOverviewSignal(),
			)
			.then(repaint, repaint); // repaint even if the build rejected — never leave a blank first frame
	}

	/**
	 * Fresh abort signal for an overview rebuild, replacing any previous one.
	 *
	 * A full rebuild is an O(whole scene) main-thread render — the single most
	 * expensive thing this engine does on the main thread. It used to be handed
	 * `new AbortController().signal`: a controller nobody kept and nobody ever
	 * aborted, so once started it ran to completion no matter what the user did.
	 * Load a heavy board and zoom while it is still going and every gesture frame
	 * competes with it — the "load a big drawing, try to zoom, it lags" report.
	 *
	 * Tracking the controller lets abortBakes() (gesture / erase / load / reset)
	 * stop it. The half-built bitmap is a TEMP canvas that is only swapped in at
	 * the end, so abandoning it is free and the previous overview stays on screen.
	 * setGesturing(false) re-schedules, so the rebuild resumes when the user stops.
	 */
	protected newOverviewSignal(): AbortSignal {
		this.overviewCtrl?.abort();
		this.overviewCtrl = new AbortController();
		return this.overviewCtrl.signal;
	}

	/**
	 * Build the overview bitmap and RESOLVE only once it's ready. Used by the load
	 * reveal: after a room-join reset the overview is null, so the caller awaits
	 * this (paints are suppressed by the loading gate meanwhile) before flipping
	 * loading off — the very first painted frame then shows the overview as the
	 * base layer instead of a blank white flash. Never throws.
	 */
	async warmOverviewBlocking(): Promise<void> {
		try {
			// DELIBERATELY NOT newOverviewSignal(). This one must run to completion:
			// the caller flips `loading` off the moment it resolves, and an aborted
			// rebuild leaves the overview null — a blank white first frame, which is
			// the exact failure this method exists to prevent. Touching the screen
			// mid-load must not be able to cause that.
			await this.committed.overview.rebuildIfNeeded(
				this.contentBounds,
				this.makeYielder("overview-load") as any,
				new AbortController().signal,
			);
		} catch {
			/* non-fatal — fall through to the normal frame */
		}
	}

	/**
	 * Snapshot the already-maintained world overview for draft metadata. This is
	 * intentionally a copy-only operation: autosave must not reconstruct the
	 * entire Fabric scene merely to produce a 640px gallery image.
	 */
	createDraftThumbnailBlob(
		maxSize: number,
		quality: number,
		background?: string,
	): Promise<Blob | null> {
		return this.committed.overview.createThumbnailBlob(
			this.contentBounds,
			maxSize,
			quality,
			background,
		);
	}

	/**
	 * On-screen edits patch the overview immediately (it's the fallback base
	 * layer under not-yet-baked tiles). Off-screen edits DEFER the patch (item
	 * C): an invisible region isn't drawn until the user pans there, and the
	 * flush points (bake / pan-end) refresh it before those tiles render. Saves
	 * an O(objects-in-region) clip+redraw per invisible edit.
	 */
	protected patchOverview(rect: WorldRect): void {
		if (this.committed.overview.usesRemoteRenderer()) {
			// Keep the previous overview coherent while the existing worker path
			// rebuilds it. A local patch would synchronously redraw every object
			// intersecting this edit, which is unbounded for dense erase regions.
			this.committed.overview.markDirty();
			this.scheduleOverviewRebuild();
			return;
		}
		// Active gestures and erase bursts defer too. patchRect is a synchronous
		// render of up to
		// overviewPatchMax objects into the overview canvas — the same class of
		// main-thread block as a bake, and it lands on a gesture frame. It gets
		// there via renderNow's gcExpired(): a live overlay whose demote never
		// happened (because the bake was aborted) hits its TTL mid-gesture and
		// folds itself into the overview right then. Defer to the flush that
		// the interaction-end flush already performs.
		if (
			this.gesturing ||
			this.erasing ||
			this.mutating ||
			!this.intersectsView(rect)
		) {
			this.deferOverview(rect);
			return;
		}
		// Cost is gated by OBJECT COUNT, not area: patchRect re-renders only the
		// objects actually in the rect and bails (→ async rebuild) past
		// overviewPatchMax. A drag's OLD footprint can be huge in area yet nearly
		// empty (the objects moved away), so an area gate here wrongly deferred it
		// to the ~250ms async rebuild — leaving the objects ghosted at the old
		// spot during a fast drag. The count gate clears that footprint instantly
		// when it's sparse, and still defers genuinely dense regions.
		if (this.committed.overview.patchRect(rect, this.overviewPatchMax)) return;
		this.splitOverviewPatch(rect);
	}

	/**
	 * A patch that is too dense is SPLIT, not escalated to a full rebuild.
	 *
	 * `patchRect` refuses a region holding more than `overviewPatchMax` objects,
	 * and the old answer was `markDirty()` + `scheduleOverviewRebuild()` — an
	 * O(whole scene) re-render (measured 267–472 ms) to fix a region that might
	 * be a few percent of the board. On a dense drawing an erase burst tripped
	 * that repeatedly.
	 *
	 * Quadrants hold roughly a quarter of the objects each, so one or two splits
	 * puts every piece under the cap. Total work stays proportional to the
	 * objects in the ORIGINAL rect (only boundary objects render twice), and the
	 * pieces are drained on a time budget instead of in one block. A full
	 * rebuild remains the last resort for a region too small to split — that
	 * means genuinely thousands of objects in a few world units.
	 */
	protected splitOverviewPatch(rect: WorldRect): void {
		const MIN_SPLIT = 8; // world units
		if (
			rect.w <= MIN_SPLIT ||
			rect.h <= MIN_SPLIT ||
			this.overviewSplitQueue.length >= 512 ||
			// Outside the bitmap's mapping (content grew). No subdivision of it can
			// ever be patched — only a rebuild, which re-maps to the new bounds.
			!this.committed.overview.covers(rect)
		) {
			this.committed.overview.markDirty();
			this.scheduleOverviewRebuild();
			return;
		}
		const hw = rect.w / 2;
		const hh = rect.h / 2;
		this.overviewSplitQueue.push(
			{ x: rect.x, y: rect.y, w: hw, h: hh },
			{ x: rect.x + hw, y: rect.y, w: hw, h: hh },
			{ x: rect.x, y: rect.y + hh, w: hw, h: hh },
			{ x: rect.x + hw, y: rect.y + hh, w: hw, h: hh },
		);
		this.scheduleOverviewSplitDrain();
	}

	/**
	 * Drain split pieces on a time budget. Deliberately NOT the `pendingOverview`
	 * queue: that one merges nearby rects at flush time, which would glue the
	 * quadrants straight back into the rect they came from — an endless
	 * split/merge loop.
	 */
	protected scheduleOverviewSplitDrain(): void {
		if (this.overviewSplitTimer !== null) return;
		this.overviewSplitTimer = setTimeout(() => {
			this.overviewSplitTimer = null;
			if (this.gesturing || this.loading || this.erasing || this.mutating) {
				this.scheduleOverviewSplitDrain();
				return;
			}
			const budgetMs = this.overviewWorkBudgetMs;
			const t0 = performance.now();
			while (this.overviewSplitQueue.length) {
				if (performance.now() - t0 >= budgetMs) break;
				const piece = this.overviewSplitQueue.shift()!;
				if (!this.committed.overview.patchRect(piece, this.overviewPatchMax)) {
					this.splitOverviewPatch(piece);
				}
			}
			if (this.overviewSplitQueue.length) this.scheduleOverviewSplitDrain();
			else this.requestFrame();
		}, 0);
	}

	protected deferOverview(rect: WorldRect): void {
		this.pendingOverview.push({ ...rect });
		if (this.pendingOverview.length <= 256) return;

		// Never turn queue pressure into synchronous rendering on an interaction.
		// Arithmetic coalescing is cheap; the next bake/settle flush does the paint.
		this.coalescePendingOverview();
	}

	/** Collapse the deferred-patch queue to a single bounding rect. Allocation
	 *  relief only — no rendering — so it is safe on a gesture frame. */
	protected coalescePendingOverview(): void {
		if (this.pendingOverview.length <= 1) return;
		let u = this.pendingOverview[0];
		for (let i = 1; i < this.pendingOverview.length; i++)
			u = this.union(u, this.pendingOverview[i]);
		this.pendingOverview = [u];
	}

	/**
	 * Apply the deferred overview patches.
	 *
	 * BUDGETED. Each `patchRect` is a synchronous clear + redraw of every object
	 * in its rect, and this used to run the whole queue in one go — on the
	 * gesture-end frame (setGesturing(false)) and at the head of every bake pass.
	 * With heavy brushes that is an unbounded main-thread block landing exactly
	 * where the user is still moving: a pan is a sequence of gesture / 180ms
	 * settle cycles, so this fired repeatedly through what feels like one gesture.
	 *
	 * Merge first (overlapping deferred rects re-render each other's objects),
	 * then spend at most `budgetMs` and push the rest back for the next flush
	 * point. Anything still queued is picked up by the bake that follows, and by
	 * the next gesture end.
	 */
	protected flushPendingOverview(budgetMs = this.overviewWorkBudgetMs): void {
		if (this.pendingOverview.length === 0) return;
		if (this.committed.overview.usesRemoteRenderer()) {
			this.pendingOverview = [];
			this.committed.overview.markDirty();
			this.scheduleOverviewRebuild();
			return;
		}
		const rects = this.mergeRects(this.pendingOverview);
		this.pendingOverview = [];
		const t0 = performance.now();
		for (let i = 0; i < rects.length; i++) {
			if (i > 0 && performance.now() - t0 >= budgetMs) {
				// Out of budget — requeue the remainder rather than blocking on.
				for (let j = i; j < rects.length; j++)
					this.pendingOverview.push(rects[j]);
				break;
			}
			// Too dense → subdivide instead of escalating to a full rebuild.
			if (!this.committed.overview.patchRect(rects[i], this.overviewPatchMax))
				this.splitOverviewPatch(rects[i]);
		}
	}

	protected scheduleOverviewRebuild(): void {
		if (this.overviewTimer !== null) return;
		this.overviewTimer = setTimeout(() => {
			this.overviewTimer = null;
			if (this.gesturing || this.loading || this.erasing || this.mutating) {
				this.scheduleOverviewRebuild();
				return;
			}
			void this.committed.overview
				.rebuildIfNeeded(
					this.contentBounds,
					this.makeYielder("overview-rebuild") as any,
					this.newOverviewSignal(),
				)
				.then(() => {
					this.requestFrame();
					this.scheduleBake();
				});
		}, 250);
	}

	isRegionBaked(rect: WorldRect): boolean {
		return this.committed.isRegionReady(rect, this.surface.getVpt()[0]);
	}

	reset(): void {
		this.abortBakes();
		if (this.overviewTimer !== null) {
			clearTimeout(this.overviewTimer);
			this.overviewTimer = null;
		}
		if (this.remoteRaf) {
			cancelAnimationFrame(this.remoteRaf);
			this.remoteRaf = 0;
		}
		if (this.overviewSplitTimer !== null) {
			clearTimeout(this.overviewSplitTimer);
			this.overviewSplitTimer = null;
		}
		this.overviewSplitQueue = [];
		this.pendingRemote = null;
		this.pendingOverview = [];
		this.live.clear();
		this.committed.reset();
		this.contentBounds = null;
	}

	/**
	 * Give the GPU-backed TILE cache back, without tearing the engine down and
	 * without ever leaving the board blank.
	 *
	 * For the app being BACKGROUNDED or Android signalling memory pressure. The
	 * WebView renderer runs in its own sandboxed process with its own limit, and
	 * on a 2 GB device that limit is low — `libwebviewchromium.so SIGTRAP` is a
	 * Chromium CHECK(), most often exactly this. A backgrounded tab still holding
	 * a full tile cache is the easiest process in the system to kill, and the user
	 * comes back to a cold start instead of their drawing.
	 *
	 * THE OVERVIEW IS DELIBERATELY KEPT.
	 *
	 * An earlier version of this called `reset()`, which drops the overview too.
	 * That is wrong, and it fails in the worst possible way. The overview is the
	 * base layer under every not-yet-baked tile — with no tiles AND no overview,
	 * `composite` paints the background colour and nothing else, i.e. the whole
	 * drawing goes blank. Recovering then needs a full O(scene) overview rebuild,
	 * and that rebuild is abortable, so every pan the confused user makes cancels
	 * it again: the board stays white and only fills in tile-by-tile as they
	 * navigate. That is precisely the "it loads, then goes white, then comes back
	 * if I pan around a lot" report.
	 *
	 * The economics are not close either. On a mid Android the tile cache is tens
	 * of megabytes; the overview is ONE bitmap (1024² × 4 ≈ 4 MB). Keeping it
	 * costs a rounding error of what this method reclaims and removes the blank
	 * -board failure mode outright.
	 *
	 * `contentBounds` also survives, so the overview stays valid and no O(all
	 * objects) recompute is needed on return.
	 *
	 * Everything released here is a cache. The scene itself (fabric objects, the
	 * quadtree, history) is untouched, so `restoreFromRelease()` is a repaint,
	 * not a reload.
	 */
	releaseGraphicsMemory(): void {
		this.abortBakes();
		if (this.overviewTimer !== null) {
			clearTimeout(this.overviewTimer);
			this.overviewTimer = null;
		}
		if (this.remoteRaf) {
			cancelAnimationFrame(this.remoteRaf);
			this.remoteRaf = 0;
		}
		if (this.overviewSplitTimer !== null) {
			clearTimeout(this.overviewSplitTimer);
			this.overviewSplitTimer = null;
		}
		this.overviewSplitQueue = [];
		this.pendingRemote = null;
		this.pendingOverview = [];
		this.live.clear();
		// Tiles + canvas pool only. NOT the overview, NOT contentBounds.
		this.committed.releaseTiles();
	}

	/**
	 * Come back from `releaseGraphicsMemory()`.
	 *
	 * Normally a plain repaint: the overview survived the release, so the very
	 * first frame already shows the whole drawing (soft, at overview resolution)
	 * and the bake sharpens it from there.
	 *
	 * The overview can still be missing — a release that happened before the
	 * first build ever completed, or a rebuild that was aborted. In that case a
	 * frame would paint bare background, so this takes the same BLOCKING,
	 * non-abortable rebuild the load path uses. `warmOverview()` would be wrong
	 * here for the same reason it is wrong during load: it is abortable, and with
	 * no tiles to fall back on an aborted rebuild leaves the board blank with
	 * nothing to re-arm it except a bake that gesturing keeps deferring.
	 */
	restoreFromRelease(): void {
		if (this.committed.overview.isDirty()) {
			void this.warmOverviewBlocking().then(() => {
				this.requestFrame();
				this.scheduleBake();
			});
			return;
		}
		this.requestFrame();
		this.scheduleBake();
	}

	/**
	 * Stop everything and never paint again.
	 *
	 * `reset()` clears state but leaves the engine live, which is right between
	 * documents. This is for the canvas going AWAY: the surface it draws through
	 * is about to be disposed, so any frame or bake still scheduled would reach
	 * into a dead fabric canvas.
	 */
	destroy(): void {
		this.frames.cancel();
		if (this.progressRaf) {
			cancelAnimationFrame(this.progressRaf);
			this.progressRaf = 0;
		}
		if (this.progressTimer !== null) {
			clearTimeout(this.progressTimer);
			this.progressTimer = null;
		}
		if (this.bakeTimer !== null) {
			clearTimeout(this.bakeTimer);
			this.bakeTimer = null;
		}
		this.reset();
		// Belt and braces: a bake already awaiting a worker reply resumes after
		// this returns, and every scheduling path checks `loading` first.
		this.loading = true;
	}

	// ── helpers ──────────────────────────────────────────────────────────────
	protected boundsOf(obj: T): WorldRect | null {
		return getObjectBounds(obj);
	}

	protected cachedViewWorld: WorldRect | null = null;
	protected viewWorldFrame = -1;

	protected getViewWorld(): WorldRect {
		if (this.viewWorldFrame !== this.frameCounter || !this.cachedViewWorld) {
			this.cachedViewWorld = this.committed.viewWorld(
				this.surface.getVpt(),
				this.surface.getSize(),
				this.surface.getDpr(),
			);
			this.viewWorldFrame = this.frameCounter;
		}
		return this.cachedViewWorld;
	}

	protected intersectsView(r: WorldRect): boolean {
		const v = this.getViewWorld();
		return !(
			r.x + r.w < v.x ||
			r.x > v.x + v.w ||
			r.y + r.h < v.y ||
			r.y > v.y + v.h
		);
	}

	protected union(a: WorldRect, b: WorldRect): WorldRect {
		return unionRects(a, b);
	}

	/** Merge overlapping / near rects; far-apart rects stay separate. Pathological
	 *  batches (>64 rects) collapse to one bounding union. */
	protected mergeRects(rects: WorldRect[]): WorldRect[] {
		return mergeNearbyRects(rects);
	}

	protected growContentBounds(r: WorldRect): void {
		if (!this.contentBounds) {
			this.contentBounds = { ...r };
			return;
		}
		const c = this.contentBounds;
		const x = Math.min(c.x, r.x),
			y = Math.min(c.y, r.y);
		const x2 = Math.max(c.x + c.w, r.x + r.w),
			y2 = Math.max(c.y + c.h, r.y + r.h);
		this.contentBounds = { x, y, w: x2 - x, h: y2 - y };
	}

	protected additiveInvalidate(rect: WorldRect): void {
		this.committed.markDirty(rect);
		this.patchOverview(rect);
	}

	/**
	 * The zoom at which the whole drawing fits on screen, in CSS px per world
	 * unit. `Infinity` while there is nothing to fit.
	 *
	 * `getSize()` reports the BACKING STORE, so it is divided by the render DPR to
	 * get CSS pixels — zoom is a CSS-space quantity everywhere else in the engine.
	 */
	protected fitToContentZoom(): number {
		const c = this.contentBounds;
		if (!c || !(c.w > 0) || !(c.h > 0)) return Number.POSITIVE_INFINITY;
		const { w, h } = this.surface.getSize();
		const dpr = this.surface.getDpr() || 1;
		const cssW = w / dpr;
		const cssH = h / dpr;
		if (!(cssW > 0) || !(cssH > 0)) return Number.POSITIVE_INFINITY;
		return Math.min(cssW / c.w, cssH / c.h) * FIT_ZOOM_MARGIN;
	}

	get minZoom(): number {
		return this.committed.minViewportZoomFor(this.fitToContentZoom());
	}

	get maxZoom(): number {
		return this.committed.maxUsableZoom;
	}
}
