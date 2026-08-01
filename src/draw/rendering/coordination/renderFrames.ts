import type { Bounded } from "../committedLayer";
import { PROGRESS_FRAME_MS, RenderEngineBase } from "./renderEngineBase";

export abstract class RenderFrames<
	T extends Bounded,
> extends RenderEngineBase<T> {
	// ── frame ────────────────────────────────────────────────────────────────
	requestFrame(): void {
		if (this.erasing) return; // brush owns the lower context during a stroke
		this.frames.request();
	}

	/**
	 * Coalesced intermediate repaint DURING a bake pass (F9). Composites whatever
	 * tiles have been stored so far so the viewport fills in progressively instead
	 * of staying on the overview/fallback for the whole ~40-tile pass.
	 *
	 * Deliberately does NOT go through renderNow: it must not run gcExpired /
	 * demote / scheduleBake (we are mid-bake — a fresh scheduleBake would just set
	 * bakeAgain and thrash). Pure composite + live overlay + control re-render.
	 */
	protected requestBakeProgressFrame(): void {
		if (
			this.progressRaf ||
			this.frames.hasPendingFrame ||
			this.loading ||
			this.erasing
		)
			return;
		// Not while the user is interacting. A composite is a full-surface clear +
		// a drawImage per visible tile, and the first drawImage of each freshly
		// stored ImageBitmap also uploads it as a GPU texture. Doing that on the
		// frames where a pan/zoom is being tracked is exactly the "it hitches right
		// as the tiles sharpen" symptom. Bakes are aborted on gesture start anyway;
		// this covers the tiles already in flight at that moment.
		if (this.gesturing) return;
		// THROTTLE. This fires once per stored tile, and a pass stores dozens — one
		// full composite per animation frame for the whole pass, where before there
		// was a single composite at the end. The point is progressive feedback, not
		// per-tile accuracy, so ~8 updates/sec keeps the fill visibly progressive at
		// a fraction of the cost. The final composite is guaranteed by runBake's
		// own requestFrame() when the pass completes.
		const now = performance.now();
		if (now - this.lastProgressFrame < PROGRESS_FRAME_MS) {
			// DEFER, don't drop. Dropping meant every tile that landed inside the
			// throttle window was never composited progressively — so its bitmap's
			// first drawImage (and therefore its GPU texture upload) was saved up for
			// the single frame at the end of the pass. On a dense board that is
			// dozens of uploads in one frame: the hitch exactly when the blur is
			// replaced. A trailing timer spreads them at the intended ~8/sec.
			if (!this.progressTimer) {
				this.progressTimer = setTimeout(
					() => {
						this.progressTimer = null;
						this.requestBakeProgressFrame();
					},
					PROGRESS_FRAME_MS - (now - this.lastProgressFrame),
				);
			}
			return;
		}
		this.lastProgressFrame = now;
		this.progressRaf = requestAnimationFrame(() => {
			this.progressRaf = 0;
			if (this.loading || this.erasing || this.gesturing) return;
			const ctx = this.surface.getContext();
			if (!ctx) return;
			this.frameCounter++;
			const vpt = this.surface.getVpt();
			const size = this.surface.getSize();
			const dpr = this.surface.getDpr();
			this.committed.composite(
				ctx,
				vpt,
				size,
				dpr,
				this.surface.getBackground(),
				this.gesturing ? 1 : 0,
			);
			const vw = this.committed.viewWorld(vpt, size, dpr);
			this.live.composite(ctx, vpt, dpr, this.liveRender, vw);
			this.afterComposite?.();
		});
	}

	/**
	 * Composite RIGHT NOW, synchronously.
	 *
	 * For callers that are ALREADY inside a requestAnimationFrame callback — the
	 * gesture handler. `requestFrame()` schedules another RAF, so a gesture frame
	 * went: touchmove → RAF (apply the new viewport transform) → requestFrame →
	 * RAF (composite). The pixels for a touchmove at frame N therefore landed at
	 * frame N+2, unconditionally, with no CPU cost involved. Two frames of
	 * latency on every pan and zoom reads exactly like "the main thread is busy"
	 * even when it is idle — and `touchmove` being a non-passive listener means
	 * nothing else can hide it.
	 *
	 * Cancels any already-scheduled frame so this replaces it rather than
	 * doubling the work.
	 */
	renderFrameNow(): void {
		if (this.erasing) return; // brush owns the lower context during a stroke
		this.frames.renderImmediately();
	}

	protected renderNow(): void {
		// While loading (room join / big load) the tiles + overview are being reset
		// and rebuilt. Painting now would show an empty committed layer + null
		// overview bitmap = a full white frame. Suppress every frame until the load
		// reveal (setLoading(false)) explicitly requests the first content frame.
		if (this.loading) return;
		this.frameCounter++;
		const ctx = this.surface.getContext();
		if (!ctx) return;
		const vpt = this.surface.getVpt();
		const size = this.surface.getSize();
		const dpr = this.surface.getDpr();

		const expired = this.live.gcExpired();
		for (const r of expired) this.patchOverview(r);
		const { needsBake } = this.committed.composite(
			ctx,
			vpt,
			size,
			dpr,
			this.surface.getBackground(),
			this.gesturing ? 1 : 0,
		);
		const vw = this.committed.viewWorld(vpt, size, dpr);
		this.live.composite(ctx, vpt, dpr, this.liveRender, vw);

		if (this.pendingDemote && !needsBake) {
			this.pendingDemote = false;
			// live was already composited ABOVE the now-baked tiles this frame, so a
			// semi-transparent stroke shows doubled until we repaint without it.
			// demoteSettled removes the settled overlays → request one more frame so
			// the next composite shows the tile alone (single intensity).
			if (this.demoteSettled() > 0) this.requestFrame();
		}

		if (needsBake) this.scheduleBake();
		this.afterComposite?.();
	}
}
