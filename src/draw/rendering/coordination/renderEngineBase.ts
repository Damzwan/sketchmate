import {
	type Bounded,
	CommittedLayer,
	type CommittedOptions,
	type SpatialIndex,
	type TileRenderer,
	type WorldRect,
	type Yieldable,
} from "../committedLayer";
import { LiveLayer, type LiveRenderer } from "../liveLayer";
import { FrameScheduler } from "./frameScheduler";

/** Min gap between intermediate bake-progress composites (see
 * requestBakeProgressFrame). ~8 updates/sec: still visibly progressive,
 * without a full composite every frame for the whole bake pass. */
export const PROGRESS_FRAME_MS = 120;
/** Synchronous repair exists only to hide a small seam. Anything beyond this
 * belongs in the yielded bake path; 32 dense tiles was an ANR-sized task. */
export const MAX_SYNC_REPAIR_TILES = 6;

/**
 * Wall-clock a DISCRETE edit (undo, redo, delete, style change) may spend
 * repairing what is on screen, shared across every rect in the batch.
 *
 * A tile COUNT was the wrong bound here. Any stroke longer than a few tiles
 * exhausted a 6-tile budget, and every tile past it sat on the low-res overview
 * until the async bake landed — 80 ms of debounce plus a worker round-trip.
 * That is the "undo, and it is blurry for a second" report: not a missing fast
 * path, just a budget that ran out mid-edit.
 *
 * Time is the honest bound, and the work is inherently capped anyway because
 * repairs are clipped to the viewport. Repairs are also cheap now — a sub-rect
 * repair repaints an edit's own footprint, not a whole tile.
 */
export const DISCRETE_REPAIR_BUDGET_MS = 12;

/** Per-rect tile cap inside a discrete repair; the deadline above is the real
 *  limit, this only stops one pathological rect from owning the whole slice. */
export const DISCRETE_REPAIR_TILES = 24;

export interface Surface {
	getContext(): CanvasRenderingContext2D;

	getSize(): { w: number; h: number };

	getVpt(): number[];

	getDpr(): number;

	getBackground(): string | undefined;
}

export interface RenderEngineOptions extends CommittedOptions {
	liveMax?: number;
	bakeDebounceMs?: number;
	/** Cancels render requests already posted to the remote renderer. */
	cancelRemoteWork?: () => void;
	/** Max objects a sync overview patch may render; denser regions defer to
	 *  the async yielded rebuild. */
	overviewPatchMax?: number;
	/** Main-thread slice for incremental overview repair queues. */
	overviewWorkBudgetMs?: number;
	afterComposite?: () => void;
	/**
	 * "Is a destination-out punch safe over this region?"
	 *
	 * The erase fast path subtracts the stroke straight out of the tile bitmap
	 * and the overview. Those hold the COMPOSITE of every layer, so the punch
	 * removes whatever else happens to sit under the stroke — content the erase
	 * is not allowed to touch. Returning false sends that erase down the honest
	 * path (invalidate + re-render from objects), where only the clipPaths that
	 * actually changed are applied.
	 *
	 * Left undefined = always safe, i.e. the pre-layers behaviour.
	 */
	canPunchRegion?: (rect: WorldRect) => boolean;
}

export abstract class RenderEngineBase<T extends Bounded> {
	protected readonly committed: CommittedLayer<T>;
	protected readonly live: LiveLayer<T>;
	protected readonly surface: Surface;
	protected readonly liveRender: LiveRenderer<T>;
	protected readonly makeYielder: (label?: string) => Yieldable;
	protected readonly afterComposite?: () => void;
	protected readonly canPunchRegion?: (rect: WorldRect) => boolean;
	protected readonly cancelRemoteWork?: () => void;
	protected readonly bakeDebounce: number;
	protected readonly overviewPatchMax: number;
	protected readonly overviewWorkBudgetMs: number;

	protected readonly frames: FrameScheduler;
	protected progressRaf = 0;
	protected progressTimer: any = null;
	protected lastProgressFrame = 0;
	protected bakeTimer: any = null;
	protected overviewTimer: any = null;
	protected bakeCtrl: AbortController | null = null;
	protected overviewCtrl: AbortController | null = null;
	protected gesturing = false;
	protected loading = false;
	protected erasing = false;
	/**
	 * A multi-step scene mutation (a history op, or a burst of them) is running.
	 *
	 * Baking must not start here. A history op mutates objects one at a time,
	 * yielding between them, so a bake that lands mid-op rasterizes a
	 * HALF-APPLIED state — some objects un-erased, some not — and stores that as
	 * a FRESH tile. Nothing invalidates it again, so the wrong pixels stay:
	 * "spam undo and the drawing keeps holes".
	 *
	 * Unlike `erasing` this does NOT suppress frames; the user should still see
	 * the composite update as the undo proceeds.
	 */
	protected mutating = false;
	protected baking = false;
	protected bakeAgain = false;
	protected pendingDemote = false;
	protected frameCounter = 0;

	// remote-modify coalescing
	protected pendingRemote: WorldRect | null = null;
	protected remoteRaf = 0;

	// deferred off-screen overview patches (item C)
	protected pendingOverview: WorldRect[] = [];

	protected contentBounds: WorldRect | null = null;

	constructor(
		index: SpatialIndex<T>,
		tileRenderer: TileRenderer<T>,
		liveRenderer: LiveRenderer<T>,
		surface: Surface,
		makeYielder: (label?: string) => Yieldable,
		opts: RenderEngineOptions = {},
	) {
		this.committed = new CommittedLayer<T>(index, tileRenderer, opts);
		this.live = new LiveLayer<T>({ max: opts.liveMax });
		this.surface = surface;
		this.liveRender = liveRenderer;
		this.makeYielder = makeYielder;
		this.afterComposite = opts.afterComposite;
		this.canPunchRegion = opts.canPunchRegion;
		this.cancelRemoteWork = opts.cancelRemoteWork;
		this.bakeDebounce = opts.bakeDebounceMs ?? 80;
		this.overviewPatchMax = opts.overviewPatchMax ?? 200;
		this.overviewWorkBudgetMs = opts.overviewWorkBudgetMs ?? 8;
		this.frames = new FrameScheduler(() => this.renderNow());
	}

	get tiers(): number[] {
		return this.committed.ZOOM_TIERS;
	}

	abstract requestFrame(): void;
	abstract scheduleBake(): void;
	abstract abortBakes(): void;
	protected abstract renderNow(): void;
	protected abstract requestBakeProgressFrame(): void;
	protected abstract demoteSettled(): number;
	protected abstract patchOverview(rect: WorldRect): void;
	protected abstract deferOverview(rect: WorldRect): void;
	protected abstract scheduleOverviewRebuild(): void;
	protected abstract flushPendingOverview(budgetMs?: number): void;
	protected abstract newOverviewSignal(): AbortSignal;
	protected abstract boundsOf(obj: T): WorldRect | null;
	protected abstract intersectsView(rect: WorldRect): boolean;
	protected abstract union(a: WorldRect, b: WorldRect): WorldRect;
	protected abstract mergeRects(rects: WorldRect[]): WorldRect[];
	protected abstract growContentBounds(rect: WorldRect): void;
	protected abstract additiveInvalidate(rect: WorldRect): void;
}
