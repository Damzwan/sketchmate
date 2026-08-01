# SketchMate Drawing Engine

A deep reference for the custom canvas rendering engine: how it works, why it is
built the way it is, where it hurts today, and what to do next.

> **Audience:** engineers working on the `src/draw/` module. Assumes familiarity
> with Fabric.js, the Canvas 2D API, and `OffscreenCanvas`/`ImageBitmap`.

> **Production ANRs / crashes:** see
> [`DRAW_ENGINE_PERF.md`](./DRAW_ENGINE_PERF.md) — the ranked remediation plan
> for the 0.4.3 Android ANR + GPU-driver crash signatures. Note that the "Current
> limitations" and "Roadmap" sections below **predate the tileBakery worker
> landing**; the perf doc supersedes them on worker status.

---

## Table of contents

1. [TL;DR](#tldr)
2. [Why a custom renderer](#why-a-custom-renderer)
3. [Architecture at a glance](#architecture-at-a-glance)
4. [The layers](#the-layers)
   - [RenderEngine — the orchestrator](#rendercore--the-orchestrator)
   - [CommittedLayer — the tiled cache](#committedlayer--the-tiled-cache)
   - [WorldOverview — the low-res base](#worldoverview--the-low-res-base)
   - [LiveLayer — in-flight objects](#livelayer--in-flight-objects)
5. [Supporting systems](#supporting-systems)
   - [Spatial index (drawObjectManager + QuadTree)](#spatial-index-drawobjectmanager--quadtree)
   - [TransformController — the GPU drag layer](#transformcontroller--the-gpu-drag-layer)
   - [Layers (the drawing-layer document, not the render tiers)](#layers)
   - [The tile renderer](#the-tile-renderer)
   - [The yielder](#the-yielder)
6. [How a frame is produced](#how-a-frame-is-produced)
7. [How an edit propagates (invalidation seams)](#how-an-edit-propagates-invalidation-seams)
8. [Coordinate systems, tiers and zoom](#coordinate-systems-tiers-and-zoom)
9. [Memory management](#memory-management)
10. [Sync & history integration](#sync--history-integration)
11. [Key invariants (read before you touch anything)](#key-invariants-read-before-you-touch-anything)
12. [Instrumentation & debugging](#instrumentation--debugging)
13. [Current limitations](#current-limitations)
14. [Roadmap / next steps](#roadmap--next-steps)
15. [Recent optimizations](#recent-optimizations)
16. [Glossary](#glossary)

---

## TL;DR

SketchMate draws on an **infinite canvas** that can hold thousands of objects.
Fabric's default renderer repaints every object every frame, which collapses on
large boards and low-end phones. So we **replaced Fabric's renderer** and keep
Fabric only as an **object model + event bus + input/transform system**.

Our renderer is a **tiled, cached compositor**:

- The world is diced into **tiles** at several **zoom tiers**. Each tile is an
  `ImageBitmap` that is a *pure function of (objects in that region, generation)*.
- Every frame we **composite** the handful of tiles under the viewport with a few
  `drawImage` calls — no per-object rendering in the steady state.
- A single low-res **overview** bitmap is the far-zoom picture and the fallback
  under any not-yet-baked tile, so the screen is never blank.
- **In-flight** objects (the stroke you are drawing, a remote drag) render
  directly over the tiles until they settle and bake.
- Baking is **incremental, debounced, viewport-prioritized and yield-friendly**,
  so it never blocks input.

The result: frame cost is **O(visible tiles)**, essentially independent of total
object count, and heavy work is chunked so the main thread stays responsive.

---

## Why a custom renderer

Fabric's `canvas.renderAll()` iterates **every** object and re-rasterizes it into
the visible canvas on each frame. Problems on our workload:

- **Unbounded frame cost.** A 5,000-object collaborative board repaints 5,000
  objects per frame even when 20 are visible.
- **No spatial culling worth the name.** Fabric's `isOnScreen` helps, but the
  per-object iteration and state churn still dominate.
- **Object caching backfires.** Per-object `_cacheCanvas` bitmaps multiply memory
  and thrash on zoom, and clip/erase groups (`needsItsOwnCache`) re-rasterize
  whole clip stacks.
- **Jank on commit.** Big selection drags, erases, undo/redo each triggered
  full-canvas repaints.

We keep everything Fabric is genuinely good at — the object model, serialization
(`toObject`/`enlivenObjects`), hit-testing, controls, and the input/transform
pipeline — and we take over **only the pixels**.

[`fabricSetup.ts`](../src/draw/canvas/fabricSetup.ts) applies global Fabric
defaults once. Per-canvas target finding, mouse handling, selection, and
transforms live in
[`fabricInteractions.ts`](../src/draw/canvas/fabricInteractions.ts).

---

## Architecture at a glance

```
                         ┌──────────────────────────────────────────┐
   Fabric.Canvas         │            drawObjectManager (store)      │
   (object model,        │  • objectMap: id → FabricObject           │
    events, input) ─────▶│  • InfiniteQuadtreeManager (spatial index)│
                         │  • z-index map (__z stamps)               │
                         │  • fabric events → core lifecycle calls   │
                         └───────────────┬──────────────────────────┘
                                         │  spatialIndex.query(rect) → z-sorted objs
                                         ▼
                         ┌──────────────────────────────────────────┐
                         │                RenderEngine                 │
                         │  frame loop · bake loop · coalescing      │
                         └───┬───────────────┬───────────────┬───────┘
                             │               │               │
                             ▼               ▼               ▼
                   ┌───────────────┐ ┌──────────────┐ ┌──────────────┐
                   │ CommittedLayer│ │ WorldOverview │ │  LiveLayer   │
                   │ tiled bitmap  │ │ 1 low-res bmp │ │ in-flight    │
                   │ cache (tiers) │ │ (base/fallbk) │ │ objects      │
                   └───────────────┘ └──────────────┘ └──────────────┘
                             │               │               │
                             └───────────────┴───────────────┘
                                         │ every frame:
                                         ▼  committed.composite() → live.composite()
                                  ┌──────────────┐
                                  │ visible <canvas> (lower ctx) │
                                  └──────────────┘

   Parallel path (not in the frame loop):
   TransformController → GPU drag <canvas> layer (CSS-transformed ImageBitmap)
```

Files:

| Concern | File |
| --- | --- |
| Render engine entry | [`rendering/renderEngine.ts`](../src/draw/rendering/renderEngine.ts) |
| Frames, baking, invalidation, and overview | [`rendering/coordination/`](../src/draw/rendering/coordination/) |
| Committed tile-cache entry | [`rendering/committedLayer.ts`](../src/draw/rendering/committedLayer.ts) |
| Tile geometry, compositing, baking, and stamps | [`rendering/tiles/`](../src/draw/rendering/tiles/) |
| Low-res base | [`rendering/worldOverview.ts`](../src/draw/rendering/worldOverview.ts) |
| In-flight objects | [`rendering/liveLayer.ts`](../src/draw/rendering/liveLayer.ts) |
| Canvas/engine bridge | [`canvas/drawObjectManager.ts`](../src/draw/canvas/drawObjectManager.ts) |
| Fabric events and interactions | [`canvas/`](../src/draw/canvas/) |
| Gestures and shortcuts | [`input/`](../src/draw/input/) |
| Spatial index and z-order | [`objects/indexing/`](../src/draw/objects/indexing/) |
| Layer document, policy and engine-facing registry | [`layers/`](../src/draw/layers/) |
| Quadtree | [`utils/QuadTree.ts`](../src/draw/utils/QuadTree.ts) |
| Drag layer | [`transform/transformController.ts`](../src/draw/transform/transformController.ts) |
| Tile object renderer | [`rendering/fabricTileRenderer.ts`](../src/draw/rendering/fabricTileRenderer.ts) |
| Cooperative yielding | [`scheduling/yielder.ts`](../src/draw/scheduling/yielder.ts) |
| Fabric setup and interactions | [`canvas/`](../src/draw/canvas/) |
| Orphaned bake worker | [`workers/tile.worker.ts`](../src/draw/workers/tile.worker.ts) |

---

## The layers

### RenderEngine — the orchestrator

[`renderEngine.ts`](../src/draw/rendering/renderEngine.ts) is the only public
engine entry. Frame, bake, invalidation, and overview behavior live in focused
modules under
[`rendering/coordination/`](../src/draw/rendering/coordination/).

- **Frame loop** — `requestFrame()` schedules one `requestAnimationFrame`;
  `renderNow()` clears the canvas, composites the committed tiles, then composites
  the live layer on top. Frames are **only** scheduled on change or gesture — this
  is not a free-running 60 Hz loop.
- **Bake loop** — `scheduleBake()` debounces (`bakeDebounceMs`, default 80 ms)
  and runs `runBake()`, which asks `CommittedLayer` to rebuild stale/missing tiles
  under the viewport. Bakes are abortable (`AbortController`) and re-entrancy-safe
  (`baking` / `bakeAgain`).

RenderEngine also implements the cleverness that keeps things smooth:

- **Viewport gating** — off-screen edits invalidate cheaply but never take a live
  slot or schedule a composite.
- **Remote-modify coalescing** — `onObjectChangedCoalesced()` collapses a stream
  of remote drag events into **one** destructive rebuild per frame on the unioned
  rect, while the live overlay stays smooth per event.
- **Batch invalidation** — `invalidateRegions()` drains a batch of edits (remote
  sync, undo/redo) into one pass: drop regions, patch/defer overview, a single
  frame + bake. Nearby rects merge; far-apart rects stay separate so we don't
  over-invalidate the empty span between two edits.
- **Deferred off-screen overview patches** — `pendingOverview` holds patches for
  invisible regions and flushes them on bake / pan-end, so an invisible edit
  doesn't pay a clip+redraw.
- **Stamping fast paths** — draw commit (`additiveStamp`), erase
  (`eraseStamp`), and transform commit (`stampBitmapRegion`) punch pixels straight
  into existing fresh tiles instead of re-rendering objects.

### CommittedLayer — the tiled cache

[`committedLayer.ts`](../src/draw/committedLayer.ts) is the only public tile-cache
entry. Geometry, storage, compositing, baking, and stamping live under
[`tiles/`](../src/draw/rendering/tiles/). Core idea:

> A tile is a **pure function** of *(the objects intersecting its region, a
> generation counter)*. Tiles are **never mutated in place** during normal
> invalidation — they are dropped or rebuilt wholesale from the spatial index.

Key state:

- `tiles: Map<"tier:tx:ty", Tile>` — each `Tile` holds an `ImageBitmap | null`
  (null = "fresh empty", genuinely nothing there), its `builtGen`, `lastUsed`,
  and byte cost.
- `gen: Map<key, number>` — the **current** generation of a tile key. A tile is
  **fresh** iff `tile.builtGen === gen.get(key)`. Invalidation = bump the gen.
  This is how a rebuild-in-flight is detected as stale and discarded.
- A **pool** of `OffscreenCanvas` for baking, shrunk to `0×0` when idle to release
  backing store on mobile.

Compositing (`composite()`): for the active tier, walk the tiles under the
viewport. Present tiles are `drawImage`'d directly. Missing/stale tiles look for a
**fallback**: a coarser tile scaled up or finer tiles scaled down
(`findBestSource`, bounded by `FALLBACK_DEPTH`, capped to 1 while gesturing).
Anything still uncovered is filled by the **overview**, clipped to just those
cells. Draw order is always: overview → fallback tiles → present tiles.

Baking (`bake()` → `rebuildTile()`): query the index for the tile's padded world
rect, render each object into a pooled `OffscreenCanvas` through the tile
renderer, `transferToImageBitmap()` (zero-copy), gen-check, store. Work is
prioritized center-out from the viewport and yields every `CHUNK` objects.

There is also a **synchronous** repair path (`rebuildRectSync` / `rebuildTileSync`,
bounded by `maxTiles`) used for instant feedback at drag seams, where waiting for
the async bake would show a hole. Settled discrete edits (undo/redo/delete/move)
also have a sharp-transition path: visible tiles at the current tier retain their
previous full-resolution bitmap until the replacement generation lands. Every
other tier is invalidated normally, and a gesture revokes the transition, so a
zoom can never resurrect old object positions.

### WorldOverview — the low-res base

[`worldOverview.ts`](../src/draw/rendering/worldOverview.ts) is one adaptive
`OffscreenCanvas` mapped to the content bounds. Its dimensions follow the
content aspect ratio and target the first tile-backed tier's density. The
configured `overviewPx²` remains a hard pixel budget (768² on low-end mobile,
1024² on other mobile, 2048² on desktop). It plays two roles:

1. The **far-zoom picture** — at or below `OVERVIEW_TIER` we just `drawImage` the
   overview, no tiles.
2. The **base layer** under every not-yet-baked tile, so the viewport is never
   blank and never flashes white.

It is kept *correct* (not merely approximate) by **localized patching**:
`patchRect(rect)` clears that sub-region and redraws exactly the objects there
from the index — so add / remove / move / erase / undo all stay consistent with
zero drift. A full `rebuildIfNeeded()` (O(all objects), low-res, yielded) only
runs when coverage grows or the bitmap is globally dirty. Dense patches are
subdivided and drained in 3–4 ms slices on low-end devices; gestures abort or
defer overview work so it does not compete with input.
`patchRect` refuses regions beyond the profile's `overviewPatchMax` and sends
them through that incremental subdivision path instead of janking one frame.

### LiveLayer — in-flight objects

[`liveLayer.ts`](../src/draw/liveLayer.ts) is a small, bounded (`liveMax`, 64/32)
set of objects rendered **directly** over the committed tiles every frame in world
space, viewport-culled. Used for:

- The stroke you are actively drawing.
- A newly-added object during its bake window (sharp vector until the tile lands).
- Remote drags (smooth per-event while the destructive rebuild coalesces).

Items carry a TTL (`NORMAL_TTL_MS` 5 s, `ERASE_TTL_MS` 1.5 s) so a missed
demotion can never leave the layer permanently full. `gcExpired()` returns expired
normal rects so their overview patch (deferred at add time) can be folded in.

**Demotion** (`demoteSettled` in RenderEngine): once a live object's region is fully
baked, remove it from the live layer and fold its rect into the overview — one
extra frame ensures the semi-transparent stroke isn't drawn twice (live + tile).

---

## Supporting systems

### Spatial index (drawObjectManager + QuadTree)

[`drawObjectManager.ts`](../src/draw/canvas/drawObjectManager.ts) is the
bridge between Fabric and the engine, and the owner of the spatial index.

- **`InfiniteQuadtreeManager`** ([`QuadTree.ts`](../src/draw/utils/QuadTree.ts)) —
  the world is chunked into 4096-unit cells, each an independent quadtree, so the
  index is unbounded without one giant tree. A tile query almost always hits one
  chunk (fast path, no dedup).
- **`spatialIndex.query(rect)`** returns objects **z-sorted** (via `__z` stamps
  from the z-index map). This is what every bake and overview patch calls.
- **Bounds caching** — `cachedBounds()` memoizes `getBoundingRect()` keyed by a
  transform signature (`boundsSig`), so measuring an object is cheap and repeated
  measures during a commit collapse to one.
- **Fabric events → core** — `object:added/removed/modified`, `erasing:end`,
  style/layer/flip/filter change events are translated into `core.onObjectAdded`,
  `onObjectRemoved`, `onObjectChanged(Coalesced)`, `onErase`, `invalidateRegions`.
- **Batch mode** — `beginBatch()`/`endBatch()` collect region rects and flush one
  `invalidateRegions` pass; used by undo/redo and bulk removals.

### TransformController — the GPU drag layer

[`transformController.ts`](../src/draw/transform/transformController.ts) makes
moving/scaling/rotating a selection cheap and smooth. Instead of re-rendering N
objects every pointer move, it:

1. **Bakes the selection once** into an `ImageBitmap` (cached, keyed on shape +
   zoom, *not* position; prewarmed during idle so the next grab is a cache hit).
2. Puts that bitmap on a **separate `<canvas>` layer** above Fabric's, and moves
   it with a pure **CSS transform** (`translate/rotate/scale`) — GPU-composited,
   zero canvas work per frame.
3. On commit, **stamps** the bitmap into the tiles at the new position
   (`stampBitmapRegion` → O(touched tiles) `drawImage`), drops the old footprint,
   and schedules a bake to repaint the tiles exactly (correct z-order). The GPU
   layer hides only once the new position is actually baked (`hideWhenReady`).

Ownership (`ownedIds`) persists through the post-commit bake so the manager keeps
skipping the object's own modified-events until its tiles land.

### Layers

Layers are **metadata, not extra render buffers**. There is still exactly one
tile cache, one overview and one live layer; a per-layer tile stack would
multiply the single largest memory consumer on the device class that already
ANRs (a mobile tile is ~270 KB against a 40 MB low-end budget).

- **Membership** — objects carry `layerId`, registered in fabric's
  `customProperties` ([`fabricSetup.ts`](../src/draw/canvas/fabricSetup.ts)). It
  therefore rides inside every `toJSON`: drafts, the `draw-event` wire, history
  entries and the worker mirror. **No new sync message and no server change.**
  Objects predating layers carry no `layerId` and fold into `BASE_LAYER_ID`.
- **Order** — paint order is `(layer rank, explicit z)`. `compareRenderOrder`
  ([`layers/layerRegistry.ts`](../src/draw/layers/layerRegistry.ts)) replaces
  every z-only sort. Reordering layers changes ranks, never object z, so no
  renumbering. "Bring to front" stays inside its layer for free, because rank
  dominates the comparison.
- **Visibility** — applied by filtering `spatialIndex.query` /`queryBounds`
  ([`objects/indexing/spatialIndex.ts`](../src/draw/objects/indexing/spatialIndex.ts)).
  That is the one function tiles, the overview, the live layer and the worker
  object lists all read, so every surface agrees by construction. Guarded by a
  `Set.size` check: nothing hidden costs nothing per object.
- **Lock** — hit-testing only, via `queryInteractive`. Locked content still
  renders. `queryAll` is the explicit opt-out for bookkeeping that must see
  everything (erase-undo repair, claimed-area enforcement).
- **Selection and erasing are scoped to the active layer** (`querySelectable`,
  used by `findTarget`, the lasso and the eraser's candidates) — the standard
  layer-editor rule. Skipped entirely for single-layer documents. Switching
  layers discards the active selection, since it could otherwise be dragged but
  never re-picked.
- **The eraser needs both halves.** Narrowing its candidates only fixes the
  commit; the live mask is separate, so other layers visibly vanished mid-stroke
  and snapped back on release. Both sides now read one predicate pair —
  [`tools/erasePolicy.ts`](../src/draw/tools/erasePolicy.ts): `isEraseTarget`
  backs `CustomEraserBrush.erasableFilter` (threaded through `walk`/`walk2`/
  `draw`), and `isEraseProtected` selects what `protectObjectsProvider` hands to
  the mask. The provider deliberately returns **only protected objects** rather
  than everything-minus-dimming, so the mask cannot be wrong because two
  predicates disagree — and it renders strictly fewer objects. Neither may ever
  mutate `obj.erasable`: it is serialized, so the change would persist and sync
  to peers. The programmatic brush (remote/replayed erases, which carry explicit
  targets) is left unfiltered. `attachProviders` re-runs on the brush-reuse path,
  because a brush instance outlives tool selections and a missing provider fails
  silently by erasing too much.
- **A destination-out punch is not layer-aware and cannot be made so.** The
  erase fast path (`eraseStamp` + `overview.eraseObject`) subtracts the stroke
  straight out of bitmaps that hold every layer composited together, so it
  removes whatever else sits under the stroke. `canPunchRegion` (a
  `RenderEngineOptions` hook, supplied by `drawObjectManager.isRegionSingleLayer`)
  vetoes the fast path when another layer has content in the erased rect; that
  erase falls back to `markDirtyAndRebuildSync`, which re-renders from the
  objects and so applies only the clipPaths that actually changed. Single-layer
  documents short-circuit to `true` and keep the punch. Any FUTURE pixel-level
  subtract path must consult the same hook.
- Bucket fill still samples **every visible layer** for barriers, and drops the
  fill on the active layer. Sampling only the active layer is the Photoshop
  default and breaks the common case — colour under lineart floods the canvas
  because no barrier exists on that layer.
- **`topmost` means render-topmost, not last-on-canvas.** `onObjectAdded`'s two
  fast paths (the additive tile stamp and the live overlay) both paint the new
  object ON TOP, so they are only valid when nothing outranks it. A stroke on a
  low layer is still appended last to the fabric canvas, so the old canvas-order
  test handed it both — and it showed above the content covering it until the
  bake corrected it. `isRenderTopmost` in `drawObjectManager` adds the layer
  check; the overlap query only runs when the object is genuinely below
  something. A non-topmost add instead keeps its stale-but-usable tiles and gets
  a bounded synchronous sub-rect repair, so it appears at once and in order.
- **Invalidating a toggle** — `invalidateLayer(id)` invalidates only that
  layer's content bounds (computed from quadtree entries), not the whole cache.
  A reorder passes `null` and does mark everything dirty — that one genuinely
  restacks the board.

**Policy** ([`layers/layer.types.ts`](../src/draw/layers/layer.types.ts)):

| | Solo | Private room | Public lobby |
| --- | --- | --- | --- |
| Layer set | document state: persisted in `json.layers`, undoable | same, and **replicated** | 4 fixed layers with constant ids, derived locally by every peer |
| Add / delete / rename / reorder | yes | yes, as `LayerOp`s | no |
| Visibility / lock | local view state — never synced, never undoable | same | same |
| Move objects between layers | yes | yes | yes |

Object→layer moves ride the existing `objectStyleChanged` → `ObjectStyleChanged`
sync event in every mode.

**Replication needs no conflict resolver, because the ops cannot conflict.**
Every `LayerOp` is idempotent and carries an **absolute fractional order key**
instead of an index — the same trick `ExplicitZIndex` uses for objects. An
index-based reorder means something different depending on what else has been
replayed, so two peers restructuring at once diverge; an absolute key states
where the layer now sits, so a replayed backlog and a live stream converge on
the same stack. `rename`/`reorder` are last-writer-wins on `(at, by)`, `remove`
leaves a tombstone so a late op cannot resurrect a layer, and `remove` never
touches objects — their originator deletes them through the normal object-
removal sync, so a double-delete is impossible.

Public lobbies stay fixed on purpose: strangers must not be able to restructure
a board out from under each other, and a constant set needs no replication.

`DrawSyncingEvent.LayerDocument` is a **v4** action. Shipping any new action type
is only safe because `minimum_online_version` blocks room entry
([`drawSyncing.socket.ts`](../src/service/api/socket/drawSyncing.socket.ts)) — a
v3 client looks the handler up in a map with no fallback and would throw,
killing the rest of its action queue. Bump the server-side minimum before
enabling it. (This build guards unknown types on receipt; deployed ones do not.)

Nothing about layers is ever sent, replayed or reconciled: a room's set is a
constant, so there is no layer document to conflict over, and an old peer
receiving `{ layerId }` inside a style patch sets a prop it ignores. A dedicated
sync event would have been a new `action.type` on a wire whose consumers look
the type up in a map with no fallback.

Per-layer **opacity is deliberately not implemented**. Group-correct opacity
needs an extra scratch canvas per translucent layer per tile; per-object alpha
is cheap but wrong for overlapping strokes. Neither earns its place until the
feature is asked for.

### The tile renderer

[`drawTileRenderer.helper.ts`](../src/draw/rendering/fabricTileRenderer.ts) —
`isolatedTileRenderer(ctx, obj)` renders a single object into a tile. It forces
`visible = true` (guards against transient undefined-visible during load),
`objectCaching = false` (render directly, never blit a stale per-object cache),
and `isOnScreen = () => true` (bypass Fabric's main-viewport culling — we are
baking off-screen background tiles). **All three are saved and restored** so
baking never permanently mutates object state. It also culls a group's children
against the tile rect (a group is ONE index entry, so every tile under its union
would otherwise render every child) — and `setCoords()` each child first, per
invariant 16. It deliberately does **not** force
`obj.dirty` — that re-rasterized clip/erase groups on every tile render (the
historical super-linear erase lag).

### The yielder

[`yielding.helper.ts`](../src/draw/scheduling/yielder.ts) — a cooperative
scheduler. `createYielder({ budgetMs })` gives back a `shouldYield()` /
`yield()` pair. `shouldYield()` is true when the per-frame time budget is spent
**or** `navigator.scheduling.isInputPending()` reports pending input. `yield()`
uses `MessageChannel` (faster than `setTimeout(0)`, not clamped to 4 ms) normally,
or a full `requestAnimationFrame` when input is pending so the browser can
dispatch input and paint before we resume. Budget is 8 ms desktop, 4 ms low-end.

This is what lets a big bake or overview rebuild run without freezing the UI.

---

## How a frame is produced

```
requestFrame()                    // dedup: at most one RAF in flight
  └─ requestAnimationFrame
       └─ renderNow()
            ├─ if loading → bail (loading gate prevents white flash)
            ├─ live.gcExpired() → patchOverview(expired rects)
            ├─ committed.composite(ctx, vpt, size, dpr, bg, gesturing?1:0)
            │     ├─ clear + bg fill
            │     ├─ tier ≤ OVERVIEW_TIER → just overview.composite(); done
            │     ├─ else walk viewport tiles → present / uncovered
            │     ├─ uncovered → findBestSource (coarser↑ / finer↓) or overview
            │     └─ drawImage: overview gaps → fallback tiles → present tiles
            ├─ live.composite(ctx, vpt, dpr, renderLive, viewWorld)  // culled
            ├─ if pendingDemote & !needsBake → demoteSettled()
            ├─ if needsBake → scheduleBake()
            └─ afterComposite()   // re-render active-object selection controls
```

Steady state (no stale tiles) is a clear + a handful of `drawImage` calls. As of
the latest optimization pass, the composite tile-walk also **allocates no
per-frame descriptors** — the scratch buffers are reused.

---

## How an edit propagates (invalidation seams)

Every mutation must reach the engine through a **seam** or its pixels won't
repaint. The seams and what they do:

| Event / call | Handler | Engine effect |
| --- | --- | --- |
| `object:added` | `onObjectAdded` | index insert; stamp into tiles if topmost & stampable, else live overlay + mark dirty |
| `object:removed` | `onObjectRemoved` | index remove; destructive invalidate old rect |
| `object:modified` | `onObjectModified` | index update; coalesced destructive rebuild (or owned by transform controller) |
| `erasing:end` | `onErase` | stamp `destination-out` into tiles + overview (fast path), or rebuild |
| style/layer/flip/filter | `handleStyleChange` | index update; single → precise, multi → merged `invalidateRegions` |
| transform commit | `commit()` | `offsetQuadTree`/`updateQuadTree`, drop old, stamp bitmap into new, bake |
| remote batch / undo / redo | `beginBatch`/`endBatch` | collect rects → one `invalidateRegions` |

**The invariant:** *invalidate exactly where you mutate.* A new mutation path must
either fire one of these events or call `updateQuadTree` / `markDirty` /
`invalidateRegions`. If it doesn't, the tile cache never learns the region
changed and the screen shows stale pixels.

---

## Coordinate systems, tiers and zoom

- **World space** — the infinite drawing coordinate system. Object bounds, quadtree
  entries, tile regions and the overview all live here.
- **Screen/device space** — world through the viewport transform `vpt` and DPR.
- **Zoom tiers** — `ZOOM_TIERS = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32]`.
  `pickActiveTier(zoom)` selects the tier ≥ effective zoom (×`renderScale`, with a
  1.15 tolerance). Each tier has its own tile grid; a tile's world size is
  `TILE / tier`.
- **`OVERVIEW_TIER` (1)** — at or below this tier the overview *is* the picture;
  tiles aren't composited at all. Above it, tiles are authoritative and the
  overview only fills gaps.
- **`renderScale`** — `min(devicePixelRatio, maxRenderScale)` (2 desktop, 1.5
  low-end). Caps the resolution we bake at.
- **Tile size** — 512 px desktop, 384 px mobile, plus a 2 px overscan (`OS`) to
  avoid seams.

Minimum zoom is the first tier above `OVERVIEW_TIER`, divided by `renderScale`.
The viewport therefore never settles in the overview-only range. Maximum zoom
is `ZOOM_TIERS[last] / renderScale`.

---

## Memory management

- **Honest tile-engine budget.** `memoryBudgetMB` is 128 MB desktop, 72 MB mobile,
  32 MB low-end mobile, and 24 MB on severely constrained (≤2 GB / ≤2-core)
  mobile. It covers the main-thread tile cache, overview and retained bake-canvas
  pool. It does **not** represent the whole WebView process (Fabric
  lower/upper canvases, transform snapshots and the worker mirror/assets are
  separate allocations).
  Fixed costs (overview bitmap + pool ceiling) are **subtracted** up front so the
  configured tile-engine total stays under its limit, not just the bitmap map.
- **Tile eviction (`ensureMemory`).** When storing a tile would exceed the hard
  cap, evict least-recently-used tiles down to a low-water mark (85%) in one
  sorted pass — this amortizes so a burst of stores during a pan doesn't re-sort
  the whole tile map every store.
- **Pool trimming (`trimPool`).** Idle `OffscreenCanvas` pool entries are shrunk
  to `0×0` on bake-done / reset so backing store is released promptly.
- **Empty-tile pruning (`pruneEmpties`).** Long-untouched "fresh empty" tiles are
  dropped (and their gen entry) so the maps don't grow unbounded on a sparse
  infinite canvas.
- **Side-map pruning.** LRU eviction and failed/aborted in-flight requests drop
  their generation and dirty-region keys once no bitmap/request can observe
  them, so infinite-canvas navigation cannot grow bookkeeping without bound.
- **Overview backing release.** Atomic overview rebuilds temporarily keep old and
  new canvases, but replaced, aborted and reset canvases are explicitly resized
  to `0×0` rather than waiting for WebView GC to reclaim their backing stores.
- **Transform area cap.** Low-end selection/vacated snapshots are bounded by
  total pixels (1.0–1.5 MP), not only a 2048 px edge. This bounds both their
  `ImageBitmap`s and the DOM canvases that display them while dragging.
- **Worker-mirror virtualization.** The bakery keeps a large hot Fabric working
  set while tiles are actively baking, then trims it after 30 seconds idle. Its
  compact JSON source mirror is independently byte-capped (24 MB low-end
  mobile, 48 MB other mobile, 96 MB desktop). Missing evicted entries are
  restored lazily through the normal authoritative-main-scene retry path.
- **Zero-copy transfer.** `transferToImageBitmap()` (not `createImageBitmap`)
  moves the canvas pixels into a bitmap with no memcpy; the canvas resets and
  stays poolable.
- **Packed pencil and eraser geometry.** `OptimizedPencilStroke` and
  `OptimizedEraserStroke` keep resident paths as a `Uint8Array` command stream
  plus `Float32Array` coordinates instead of Fabric's array-of-arrays. Rendering,
  bounds, complexity, SVG export and compact serialization read those typed
  arrays directly; the normal `path` shape is materialized only for rare
  compatibility consumers such as lasso selection. Per-target eraser clip
  clones share one immutable geometry buffer, so an erase across many objects
  no longer multiplies the stroke geometry. The runtime kill switch is
  `?compactStrokeGeometry=off` (reload required).

---

## Sync & history integration

The engine is **local** — it renders whatever is in the Fabric canvas. Multiplayer
and undo/redo are separate systems that mutate the canvas, and those mutations
reach the engine through the same seams as local edits.

- **Bundle split.** `sync/session.store.ts` is *light* room/lobby state (no fabric
  imports). `sync/drawSyncEngine.ts` is the *heavy* canvas-sync engine, loaded
  only inside a live session. This keeps the fabric/render engine out of the
  app-start bundle. (See `docs`-adjacent memory `draw-bundle-split`.)
- **Wire.** The client emits `draw-event { roomId, action }`; the server
  (`sketchmate_server`) buffers by **spreading** `action` into a replay buffer and
  re-broadcasts to peers (mixed client versions v1/v2/v3, with legacy bridge paths
  for snapshots). Remote actions are applied via `drawSyncingMapping`
  ([`sync/syncActions.ts`](../src/draw/sync/syncActions.ts)),
  which calls the same history/action helpers as local edits.
- **History.** `history/history.store.ts` records undo/redo actions; the
  handlers in `history/historyActions.ts` + `history/operations/*` apply them,
  wrapped in `beginBatch/endBatch` so a multi-region undo coalesces into one
  invalidation. Object moves are stored as **diffs** (`getObjectDiff`) and applied
  in bulk (`applyObjectModificationsBulk`), which tracks old and new footprints
  separately so a long move doesn't invalidate the empty span between them.
- **Payload compaction.** Pencil and watercolor strokes serialize a
  delta-encoded, rounded `compressedTrace` and drop the raw `path`. A live
  pencil stroke also keeps its resident render geometry in typed arrays rather
  than Fabric command arrays. A live watercolor stroke retains only its numeric
  trace beside its expanded Fabric path, not a second `Point[]` graph.
- **Autosave snapshot.** Autosave serializes the live scene once in short time
  slices and persists that detached JSON directly. It does not clone every
  Fabric object or rebuild a second `StaticCanvas` for the draft thumbnail.

---

## Key invariants (read before you touch anything)

1. **Invalidate exactly where you mutate.** Every mutation path fires a seam event
   or calls `updateQuadTree`/`markDirty`/`invalidateRegions`. Miss it → stale tiles.
2. **A tile is a pure function of (objects, gen).** Never mutate a tile bitmap in
   place except via the explicit stamp paths, which bump the gen.
3. **Freshness is gen equality.** `builtGen === gen.get(key)`. A rebuild that
   `await`s must re-check the gen before storing, or it stores a stale bitmap.
4. **Semi-transparent strokes must not be drawn twice.** A live overlay's overview
   patch is deferred until demote; demote happens only after the tile is baked.
   Breaking this doubles opacity (0.45 → 0.70) until the next pan/zoom.
5. **All-or-nothing stamping.** Only stamp a region when *every* covered tile is
   stampable; a partial stamp leaves stale tiles with no live fallback → flicker.
6. **The loading gate suppresses paints** during a room join until the overview is
   warmed, or you get a white flash.
7. **`isolatedTileRenderer` restores every flag it forces.** Baking must be
   side-effect free on object state.
8. **The bake worker mirror (if wired) must be fed a delta at every seam** and its
   messages must stay FIFO — see the roadmap.
9. **`usable` and `fresh` are different questions.** `fresh` (`builtGen === gen`)
   means "no re-bake needed"; `usable` means "these pixels are safe to show".
   A stamp produces `usable && !fresh` (draw now, re-bake for exact z); an
   invalidation produces `!usable && !fresh`. Never collapse them into one flag —
   doing so silently sends every drag commit to the blurry overview.
10. **Anything that bumps a generation must say WHERE.** Go through
    `invalidateKey(key, rect)`; `null` means "whole tile" and is always safe. A
    missing dirty-rect entry is treated as whole-tile dirty, never as clean.
11. **Never invalidate a region you are about to stamp.** The stamp bumps the
    generation itself, so a pre-emptive `markDirty` turns the fast path into
    dead code with no error anywhere.
12. **Layer state enters through the spatial index, nowhere else.** A new
    consumer that filters or sorts objects itself will disagree with the tiles.
    Sort with `compareRenderOrder`; pick with `queryInteractive`; only
    bookkeeping uses `queryAll`.
13. **Composite destinations are integer-snapped outward.** Fragments overlap by
    <1px; they never gap. A gap shows the canvas background and reads as a
    rendering defect (the "white lines" report).

14. **A synchronous repair is budgeted in TIME, not in tiles.** A tile count is
    a proxy that any edit wider than the cap silently exceeds, leaving the tail
    of the edit on the overview until the async bake — which is what a blurry
    undo/redo actually is. Repairs are clipped to the viewport, so the work is
    bounded regardless; `DISCRETE_REPAIR_BUDGET_MS` is the real limit. And when
    a repair does run out of time, the follow-up bake skips the coalescing
    debounce: the unrepaired part has nothing to coalesce with.
15. **Snap a HOLE inward and a FILL outward.** Both rules exist to prevent a
    sub-pixel gap. A composite destination is snapped outward so fragments
    overlap (12); a clip hole — the drag-origin cut in `vacatedLayerMask` — must
    be snapped inward, or the hole outruns the pixels painted behind it and the
    sliver renders as bare canvas colour.

16. **A group child's `getBoundingRect()` lies until you `setCoords()` it.**
    Fabric caches `aCoords` in the object's PARENT plane and multiplies by the
    group matrix at read time. Entering a group rewrites the child's transform
    into the group's plane but refreshes nested coords only when
    `subTargetCheck` is on — it is off. So every child of a freshly built group
    (a merge) still carries its old world coords and measures a phantom rect
    offset by the group's centre. The tile renderer's per-child cull then
    rejected every child in the tiles it actually occupies and the merged
    drawing baked BLANK — invisible after the first bake, while still selectable
    (the group's own bounds are fine) and still visible before it, because the
    stamp and live paths pass no `clipRect` and never cull.
17. **An invalidation without its repair is a blur.** `markDirty` drops the
    region to a fallback; the bounded synchronous repair is what makes that
    invisible. The engine refuses that repair while `gesturing` / `mutating` /
    `loading` / `erasing`, and `scheduleBake` refuses too — so a caller that
    invalidates inside one of those windows must either be covering those pixels
    itself (the transform controller's CSS layers) or hand the rects to the
    batch and let the flush do it AFTER the flag clears. Invalidating mid-window
    and hoping is what left a moved selection, and its undo/redo, sitting on the
    overview until the debounced bake landed.

> Visual-artifact / zoom / worker roadmap: see
> [`DRAW_ENGINE_V3_PLAN.md`](./DRAW_ENGINE_V3_PLAN.md).

---

## Instrumentation & debugging

- **`__comp` counters.** When `CommittedLayer` is constructed with `debug: true`,
  `composite()` accumulates `globalThis.__comp = { frames, ms, maxMs, cells,
  missFrames }`. Read it from the console to profile composite cost and overview
  "miss" frames. Off (and free) in production.
- **`debug` flag** also enables render-failure warnings in the bake paths.
- **Fabric debug** — [`utils/fabricDebug.ts`](../src/utils/fabricDebug.ts).
- Handy console probes: `useDrawObjectManager().getVisibleObjects().length`,
  `getContentBounds()`, `getZoomLimits()`.

---

## Current limitations

1. **Baking is 100% main-thread.** `rebuildTile` renders Fabric objects into an
   `OffscreenCanvas` on the main thread. It is chunked and yields, but a dense
   region (hundreds of objects in a tile, complex clip/erase groups) still spends
   real main-thread time, and a burst of invalidations (paste, big remote batch,
   undo of a large action) can produce visible hitching on low-end devices. This
   is the single biggest remaining jank source.
2. **A fully-built bake worker exists but is wired to nothing.**
   [`workers/tile.worker.ts`](../src/draw/workers/tile.worker.ts) implements the
   entire protocol (`upsert`/`batch-upsert`/`remove`/`clear`/`bake`/`additive`, a
   worker-side Fabric mirror with `document`/`img` mocks, transferable bitmaps) but
   has **zero importers**. Only the eraser and bucket-fill workers are actually
   used. The design is done; the wiring and its invariants are not.
3. **Text + fonts in a worker are unsolved.** A worker has no `@font-face`, so
   text would bake blank there. Any worker offload needs either FontFace loading
   in the worker or a client-side refusal of text tiles (main-thread fallback).
4. **Overview resolution is bounded.** A very large board can still exceed the
   overview pixel budget. The tile-backed zoom floor and progressive tile bakes
   keep that lower-resolution bitmap temporary.
5. **Compositing is CPU `drawImage`.** Fine for a few dozen tiles, but there is no
   GPU batch path; a pathological viewport (many small fallback fragments from
   `findBestSource`) does many `drawImage` calls.
6. **Sync payloads are JSON, and the server is not payload-agnostic.** It spreads
   `action` into its buffer and replays to mixed-version peers, so a binary wire
   format is **not** backwards-compatible without a server bridge + version gate.
   Only pencil/watercolor/eraser strokes are compacted; texture brushes serialize
   full point arrays.
7. **Bounds signatures are strings.** `boundsSig` builds a template string per
   bounds check; cheap individually, but it is on hot paths (every commit, every
   quadtree update).
8. **`computeContentBounds` is O(all objects).** Recomputed on every batch end /
   load end / reset rather than maintained incrementally.
9. **No persistent tile cache.** Every room join re-bakes from scratch; nothing is
   kept across reloads.
10. **Per-frame control re-render.** `afterComposite` clears and re-renders active
    selection controls every frame when something is selected; minor, but it is
    unconditional.

---

## Roadmap / next steps

Ordered roughly by value-to-risk. Items 1–2 are the headline wins.

### 1. Offload baking to the tile worker (staged) — *highest impact*

The worker is already written; the risk is wiring, mirror drift, fonts and
latency, not authoring. Stage it so the app stays stable:

- **Phase 0 — pilot on the overview.** Wire `tile.worker` behind a flag for the
  **overview rebuild only** (rare, one bitmap out, visually forgiving). This
  proves the worker-side Fabric mirror stays in sync, that `@font-face` loading in
  the worker works, and that bitmap transfer plumbing is correct — on the surface
  where a small mistake is least visible.
- **Phase 1 — async tile bakes.** Route *full* `rebuildTile` bakes through the
  worker. Keep the gen-check on return (discard stale), add a kill-switch after N
  failures that falls back to the existing main-thread `rebuildTileSync` path
  seamlessly.
- **Phase 2 — keep stamps on the main thread.** `additiveStamp`, `eraseStamp`,
  `stampBitmapRegion` are already O(touched tiles) and latency-sensitive; leave
  them local. Only whole-object rebuilds go async.
- **Invariant to enforce:** every mutation seam must feed the worker mirror a
  per-object delta (or `updateQuadTree` equivalent), and worker messages must stay
  FIFO (never concurrent, never upsert-before-bake reordering) or the mirror
  drifts.

Expected result: the last main-thread jank source disappears; baking a dense
region no longer competes with input.

### 2. Stroke/point compaction beyond pencil — *source-level win*

Pencil/watercolor/eraser already Douglas–Peucker simplify at capture. Extend
**coordinate rounding + compact serialization** (à la `compressedTrace`) to the
texture brushes' custom point arrays. Do **not** drop points from texture brushes
(density is the look) — only round and delta-encode in `toObject`. Cuts serialize
cost, wire bytes, snapshot size and enliven cost everywhere at once.

### 3. Backwards-compatible sync payload shrink (not binary) — *stability-first*

Full binary is not server-BC (see limitation 6). Instead:

- Round/compact all stroke payloads (item 2).
- Strip default/unused Fabric props from `toObject` for our stroke types.
- If/when a true binary wire is worth it, do it as a **v4** with a server bridge
  (decode binary → object for legacy peers, pass-through for v4), mirroring the
  existing v3 snapshot url/buffer bridge. Big, stateful — schedule deliberately.

### 4. Overview mip pyramid — *quality*

Reconsider overview mip levels only if the Phase 5 benchmark shows temporary
fallback blur remains visible after adaptive sizing and progressive tile bakes.

### 5. Persistent tile cache (IndexedDB) — *cold-start*

Key tiles by `(roomId, tier, tx, ty, contentHash/gen)` and persist bitmaps. On
rejoin, warm from disk instead of re-baking. Instant warm reloads, less cold-start
CPU. Needs an invalidation story tied to the sync sequence id.

### 6. WebGL / WebGPU tile compositor — *endgame*

Replace the N `drawImage` calls in `composite()` with one textured-quad batch.
Turns compositing into a single GPU draw regardless of tile count, and makes
sub-pixel scaling of fallback tiers free. Large change; the right move only once
the worker bake lands and CPU compositing is the measured bottleneck.

### 7. Incremental content bounds — *cleanup*

Maintain `contentBounds` incrementally as objects are added/removed/moved instead
of recomputing O(all objects) at every batch/load boundary.

### 8. Numeric bounds signature — *micro*

Replace `boundsSig`'s template string with a cheap numeric hash to cut string
allocation on commit/update hot paths. Low priority; measure first.

### 9. Formalize instrumentation — *process*

Promote `__comp` into a dev HUD (frame ms, bake queue depth, tile count, memory,
miss rate) and wire a CI perf budget (e.g. a headless bench that fails if composite
p95 regresses). Makes future perf work measurable instead of anecdotal.

---

## Recent optimizations

Applied in the latest pass (all low-risk, behavior-preserving):

- **Instrumentation gated behind `debug`** — the `__comp` counters + two
  `performance.now()` calls no longer run every composite frame in production.
- **Amortized tile eviction** — `ensureMemory` evicts LRU to an 85% low-water mark
  in one sorted pass instead of snapshotting+sorting the whole tile map on every
  store during a pan (the "eviction storm").
- **Zero-allocation composite** — the per-frame `present`/`uncovered`/`fallback`/
  `needsOverview` arrays and their `Draw` descriptors are now reused instance
  scratch, count-tracked; a steady-state frame allocates nothing.
- **Non-destructive tile render** — `isolatedTileRenderer` now saves/restores
  `visible` (previously forced `true` permanently), so baking can't leak
  meant-to-be-hidden content or corrupt object state.

---

## Glossary

| Term | Meaning |
| --- | --- |
| **Tile** | A cached `ImageBitmap` for one `tier:tx:ty` cell; pure function of its objects + gen. |
| **Tier** | A zoom level with its own tile grid (`ZOOM_TIERS`). |
| **Overview** | The single low-res bitmap: far-zoom picture + fallback base under unbaked tiles. |
| **Live / in-flight** | Objects rendered directly over tiles each frame until they settle and bake. |
| **Bake** | Rebuilding a stale/missing tile from the objects in its region. |
| **Stamp** | Punching pixels (a stroke, an eraser, a drag bitmap) straight into fresh tiles without re-rendering objects. |
| **Generation (gen)** | Per-tile-key counter; invalidation bumps it; freshness is `builtGen === gen`. |
| **Demote** | Removing a settled live object once its tile is baked, folding it into the overview. |
| **Seam** | A mutation point that must invalidate the engine. |
| **Content bounds** | The world bounding box of all objects; drives overview coverage. |

---

*Last updated: 2026-07-11. Keep this in sync with `src/draw/` — especially the
invariants section and the worker status in "Current limitations".*
