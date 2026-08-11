import type { Bounded, WorldRect } from "../committedLayer";
import { RenderFrames } from "./renderFrames";

export abstract class RenderBakeCoordinator<
	T extends Bounded,
> extends RenderFrames<T> {
	// ── bake ─────────────────────────────────────────────────────────────────
	/**
	 * @param immediate Skip the debounce. The debounce exists to coalesce a
	 *   STREAM of edits (a remote drag, a burst of sync actions). A discrete
	 *   edit that could not finish repairing itself has nothing to coalesce
	 *   with, and every millisecond of debounce is a millisecond the unrepaired
	 *   part spends on the overview.
	 */
	scheduleBake(immediate = false): void {
		if (this.gesturing || this.loading || this.erasing || this.mutating) return;
		if (this.baking) {
			this.bakeAgain = true;
			return;
		}
		if (this.bakeTimer !== null) {
			if (!immediate) return;
			clearTimeout(this.bakeTimer);
			this.bakeTimer = null;
		}
		this.bakeTimer = setTimeout(
			() => {
				this.bakeTimer = null;
				void this.runBake();
			},
			immediate ? 0 : this.bakeDebounce,
		);
	}

	abortBakes(): void {
		// Abort local continuations first. bakeryCancel settles its promises with
		// a declined result, which must observe an already-aborted signal or it
		// could enter the compatibility renderer on main.
		this.bakeCtrl?.abort();
		this.bakeCtrl = null;
		// The overview rebuild is O(whole scene) on the MAIN thread — by far the
		// biggest thing to stop when the user starts interacting. It is resumed by
		// scheduleOverviewRebuild (the overview stays marked dirty, and the temp
		// canvas it was building is simply dropped).
		this.overviewCtrl?.abort();
		this.overviewCtrl = null;
		this.cancelRemoteWork?.();
		this.bakeAgain = false;
		if (this.bakeTimer !== null) {
			clearTimeout(this.bakeTimer);
			this.bakeTimer = null;
		}
		if (this.progressRaf) {
			cancelAnimationFrame(this.progressRaf);
			this.progressRaf = 0;
		}
		if (this.progressTimer) {
			clearTimeout(this.progressTimer);
			this.progressTimer = null;
		}
	}
	/**
	 * Bake the current viewport ONCE, awaited, as part of a load reveal.
	 *
	 * The load path used to reveal the canvas as soon as the overview existed.
	 * That is enough to not be blank, but on a large board the first bake pass is
	 * still tens of tiles of main-thread rasterization, so the user got a canvas
	 * that looked ready and then fought them for several seconds on the first pan
	 * or zoom. Waiting for the visible tiles here converts that into loading time,
	 * which is time the user has already accepted.
	 *
	 * NOT routed through `runBake`: that returns immediately while `loading` is
	 * set, and `loading` is exactly what must stay set until this finishes (it is
	 * what suppresses painting a half-built frame).
	 *
	 * `budgetMs` bounds the WAIT, not the work. On timeout the pass keeps running
	 * and its tiles land normally — aborting would throw away everything baked so
	 * far and leave the user waiting for it to be redone. The reveal is safe at
	 * any point because the overview is already built, so the worst case is a
	 * soft picture that sharpens, never a blank one.
	 */
	async bakeVisibleBlocking(
		budgetMs: number,
		signal?: AbortSignal,
	): Promise<void> {
		if (this.baking || signal?.aborted) return;
		const ctrl = new AbortController();
		this.bakeCtrl = ctrl;
		this.baking = true;
		this.bakeAgain = false;
		// Teardown (leaving the route mid-load) must still be able to stop it.
		const abort = () => ctrl.abort();
		signal?.addEventListener("abort", abort, { once: true });

		const pass = this.committed
			.bake(
				this.surface.getVpt(),
				this.surface.getSize(),
				this.surface.getDpr(),
				this.makeYielder,
				ctrl.signal,
				this.contentBounds,
			)
			.catch(() => {
				/* aborted / transient — the normal bake will pick up what is left */
			})
			.finally(() => {
				signal?.removeEventListener("abort", abort);
				this.baking = false;
				if (this.bakeCtrl === ctrl) this.bakeCtrl = null;
			});

		await new Promise<void>((resolve) => {
			let settled = false;
			const done = () => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve();
			};
			const timer = setTimeout(done, budgetMs);
			void pass.then(done, done);
		});
	}

	protected async runBake(): Promise<void> {
		if (this.gesturing || this.loading || this.erasing || this.mutating) return;
		if (this.baking) {
			this.bakeAgain = true;
			return;
		}
		this.baking = true;
		this.bakeAgain = false;
		this.flushPendingOverview(); // off-screen patches now matter (we're about to bake)
		const ctrl = new AbortController();
		this.bakeCtrl = ctrl;
		try {
			await this.committed.bake(
				this.surface.getVpt(),
				this.surface.getSize(),
				this.surface.getDpr(),
				this.makeYielder,
				ctrl.signal,
				this.contentBounds,
				() => this.requestBakeProgressFrame(),
			);
		} catch {
			/* aborted / transient */
		}
		this.baking = false;
		if (this.bakeCtrl === ctrl) this.bakeCtrl = null;
		if (ctrl.signal.aborted) {
			if (this.bakeAgain) {
				this.bakeAgain = false;
				this.scheduleBake();
			}
			return;
		}
		this.pendingDemote = true;
		this.requestFrame();
		if (this.committed.overview.isDirty()) {
			// Visible tiles outrank overview work in the worker. If an overview
			// yielded to this bake pass, retry it now that the interactive queue
			// has drained.
			this.scheduleOverviewRebuild();
		}
		if (this.bakeAgain) {
			this.bakeAgain = false;
			this.scheduleBake();
		} else {
			this.committed.trimPool();
			this.committed.pruneEmpties();
		}
	}

	protected demoteSettled(): number {
		if (this.live.isEmpty()) return 0;
		// NB: do NOT blanket-block on overview.isDirty here. isRegionReady already
		// returns !overview.isDirty at OVERVIEW tier; at fine tiers the baked tile
		// is authoritative and overview state is irrelevant. The old blanket gate
		// stranded a live item on top of its own freshly-baked tile whenever the
		// overview happened to be mid-rebuild — so a semi-transparent stroke was
		// drawn twice (live + tile ≈ 0.70 not 0.45) and, since demote only retries
		// after a bake, it stayed doubled until the next zoom/pan/stroke.
		const zoom = this.surface.getVpt()[0];
		const ids = this.live.settledIds((rect) =>
			this.committed.isRegionReady(rect, zoom),
		);
		// The overview patch was DEFERRED at add time (a live-covered stroke must
		// not also sit in the overview, or a semi-transparent stroke draws twice:
		// overview + live ≈ 0.70 not 0.45). Now that the tile is baked and we're
		// dropping the overlay, fold the strokes into the overview so far-zoom /
		// tile-eviction fallbacks stay correct.
		//
		// MERGED, not one patch per id. Every demoted stroke used to get its own
		// patchOverview → patchRect, and patchRect is a synchronous clear + redraw
		// of every object in the rect. Demotion is all-at-once (it fires on the
		// frame a bake pass completes), so a full live layer meant up to `liveMax`
		// of those in ONE frame — landing exactly on the frame where the tiles
		// replace the blur. Strokes drawn together also overlap, so each patch was
		// re-rendering its neighbours' objects again.
		//
		// mergeRects collapses the clustered common case to one or two patches and
		// keeps genuinely far-apart edits separate. A merged rect that turns out
		// too dense fails the overviewPatchMax gate and defers to the async yielded
		// rebuild — which is the correct outcome, not a regression.
		const rects: WorldRect[] = [];
		for (const id of ids) {
			const rect = this.live.rectOf(id);
			this.live.remove(id);
			if (rect) rects.push(rect);
		}
		for (const r of this.mergeRects(rects)) this.patchOverview(r);
		return ids.length;
	}
}
