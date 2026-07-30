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
	/** Max objects a sync overview patch may render; denser regions defer to
	 *  the async yielded rebuild. */
	overviewPatchMax?: number;
	afterComposite?: () => void;
}

export abstract class RenderEngineBase<T extends Bounded> {
	protected readonly committed: CommittedLayer<T>;
	protected readonly live: LiveLayer<T>;
	protected readonly surface: Surface;
	protected readonly liveRender: LiveRenderer<T>;
	protected readonly makeYielder: () => Yieldable;
	protected readonly afterComposite?: () => void;
	protected readonly bakeDebounce: number;
	protected readonly overviewPatchMax: number;

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
		makeYielder: () => Yieldable,
		opts: RenderEngineOptions = {},
	) {
		this.committed = new CommittedLayer<T>(index, tileRenderer, opts);
		this.live = new LiveLayer<T>({ max: opts.liveMax });
		this.surface = surface;
		this.liveRender = liveRenderer;
		this.makeYielder = makeYielder;
		this.afterComposite = opts.afterComposite;
		this.bakeDebounce = opts.bakeDebounceMs ?? 80;
		this.overviewPatchMax = opts.overviewPatchMax ?? 200;
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
