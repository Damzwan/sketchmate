import type { Bounded, WorldRect } from "../committedLayer";
import type { LiveMode } from "../liveLayer";
import { getObjectBounds, mergeNearbyRects, unionRects } from "./invalidation";
import { RenderInvalidationCoordinator } from "./renderInvalidationCoordinator";

export abstract class RenderOverviewCoordinator<
	T extends Bounded,
> extends RenderInvalidationCoordinator<T> {
	// ── gesture / loading / erase seams ──────────────────────────────────────
	setGesturing(on: boolean): void {
		this.gesturing = on;
		if (on) this.abortBakes();
		else {
			this.flushPendingOverview(); // regions we panned toward may now be visible
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
			this.abortBakes();
			this.live.clear();
		}
	}

	setErasing(on: boolean): void {
		this.erasing = on;
		if (on) this.abortBakes();
		else {
			this.requestFrame();
			this.scheduleBake();
		}
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
				this.makeYielder() as any,
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
				this.makeYielder() as any,
				new AbortController().signal,
			);
		} catch {
			/* non-fatal — fall through to the normal frame */
		}
	}

	/**
	 * On-screen edits patch the overview immediately (it's the fallback base
	 * layer under not-yet-baked tiles). Off-screen edits DEFER the patch (item
	 * C): an invisible region isn't drawn until the user pans there, and the
	 * flush points (bake / pan-end) refresh it before those tiles render. Saves
	 * an O(objects-in-region) clip+redraw per invisible edit.
	 */
	protected patchOverview(rect: WorldRect): void {
		// GESTURING defers too. patchRect is a synchronous render of up to
		// overviewPatchMax objects into the overview canvas — the same class of
		// main-thread block as a bake, and it lands on a gesture frame. It gets
		// there via renderNow's gcExpired(): a live overlay whose demote never
		// happened (because the bake was aborted) hits its TTL mid-gesture and
		// folds itself into the overview right then. Defer to the flush that
		// setGesturing(false) already performs.
		if (this.gesturing || !this.intersectsView(rect)) {
			this.pendingOverview.push({ ...rect });
			if (this.pendingOverview.length > 256) {
				// The overflow valve must not become a way for a gesture frame to run
				// the very patchRect we just deferred. Collapse to one bounding rect
				// instead — pure arithmetic, and the flush at gesture end patches the
				// union (or, if it's too dense, falls through to the async rebuild).
				if (this.gesturing) this.coalescePendingOverview();
				else this.flushPendingOverview();
			}
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
		this.committed.overview.markDirty();
		this.scheduleOverviewRebuild();
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
	protected flushPendingOverview(budgetMs = 8): void {
		if (this.pendingOverview.length === 0) return;
		const rects = this.mergeRects(this.pendingOverview);
		this.pendingOverview = [];
		let needRebuild = false;
		const t0 = performance.now();
		for (let i = 0; i < rects.length; i++) {
			if (i > 0 && performance.now() - t0 >= budgetMs) {
				// Out of budget — requeue the remainder rather than blocking on.
				for (let j = i; j < rects.length; j++)
					this.pendingOverview.push(rects[j]);
				break;
			}
			if (!this.committed.overview.patchRect(rects[i], this.overviewPatchMax))
				needRebuild = true;
		}
		if (needRebuild) {
			this.committed.overview.markDirty();
			this.scheduleOverviewRebuild();
		}
	}

	protected scheduleOverviewRebuild(): void {
		if (this.overviewTimer !== null) return;
		this.overviewTimer = setTimeout(() => {
			this.overviewTimer = null;
			if (this.gesturing || this.loading) {
				this.scheduleOverviewRebuild();
				return;
			}
			void this.committed.overview
				.rebuildIfNeeded(
					this.contentBounds,
					this.makeYielder() as any,
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
		this.pendingRemote = null;
		this.pendingOverview = [];
		this.live.clear();
		this.committed.reset();
		this.contentBounds = null;
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

	get minZoom(): number {
		return this.committed.minTiledZoom;
	}

	get maxZoom(): number {
		return this.committed.maxUsableZoom;
	}
}
