# Draw engine — main-thread performance review

**Written 2026-08-01.** Companion to `DRAW_ENGINE_PERF.md` (worker-era findings)
and `DRAW_ENGINE_STABILITY_AUDIT.md` (memory/import findings).

Scope: `src/draw/**` with the **`main` render backend assumed**
(`resolveDrawRenderBackend` defaults to `"main"`,
[renderBackend.config.ts:35](../src/draw/config/renderBackend.config.ts#L35)).
Goal: cut Android ANRs and native crashes on low-end devices.

This document only contains findings **not already covered** by the two existing
audits. Where an existing finding changes meaning under the main backend, that is
stated explicitly.

---

## 0. What changes when the backend is `main`

Most of `DRAW_ENGINE_PERF.md` (F1, F2, F3, F3-B, F3-C, F8, and every "worker
mirror" review) is **dead code path** in production. `configureTileBakery(false)`
tears the bakery down and `bakeryMarkDirty` / `bakeryFlushSoon` / `bakerySeed`
all early-return. Good — but it means:

- `isSafeCompatibilityBake` never gates anything (guarded on `this.remoteBaker`,
  [tileBaker.ts:261](../src/draw/rendering/tiles/tileBaker.ts#L261)). **Every**
  tile, at any density, rasterizes on the main thread.
- `lanes = 1` and there is no `waitForIdle` admission control.
- The `WorldOverview` full rebuild is an O(all objects) **main-thread** render
  ([worldOverview.ts:438](../src/draw/rendering/worldOverview.ts#L438)).
- Tile-worker memory findings (DRAW-06) are moot; main-thread heap findings are
  doubled in importance.

So the ANR surface is now exactly three things: **the local bake loop**, **the
synchronous repair/stamp paths**, and **GPU texture lifetime**. In that order of
subtlety, reverse order of impact.

---

## M1 — The engine's smallest indivisible unit of work is unbounded — **P0**

The async bake yields aggressively and correctly: `renderChunk` is 4 on a
severely constrained device and `shouldYield()` runs before object zero
([tileBaker.ts:328-353](../src/draw/rendering/tiles/tileBaker.ts#L328)).

But **the atom is `this.renderer(c2d, obj, scale, q)` — one Fabric
`obj.render()` — and nothing bounds it.** The doc's own measurement says a
clipped erase object costs "~13 ms per call (max 268 ms)"
([tileBaker.ts:586](../src/draw/rendering/tiles/tileBaker.ts#L586)). A yielder
cannot subdivide that. On a 2-core device with a slow GPU, a single 268 ms atom
inside a burst of them is exactly the `MessageQueue.nativePollOnce` ANR shape.

Worse, three paths run that atom **with no yielding at all**:

| Path | Yields? | Called from |
| --- | --- | --- |
| `rebuildTileSync` object loop ([:845](../src/draw/rendering/tiles/tileBaker.ts#L845)) | **no** | `rebuildRectSync` |
| `repairTileRegionSync` ([:747](../src/draw/rendering/tiles/tileBaker.ts#L747)) | **no** | `rebuildTileSync` |
| `WorldOverview.patchRect` ([:218](../src/draw/rendering/worldOverview.ts#L218)) | **no** | every `patchOverview` |

`rebuildRectSync` budgets by `REPAIR_BUDGET_MS = 6`, but the check is
`count > 0 && elapsed >= 6` — **the first tile always runs to completion no
matter what it costs** ([:562-568](../src/draw/rendering/tiles/tileBaker.ts#L562)).
Callers reaching this on a user-interaction frame: `destructiveInvalidate`,
`invalidateRegions` (every undo/redo/delete/style change),
`markDirtyAndRebuildSync` (every erase that can't stamp), and the lower-layer
stroke branch of `onObjectAdded`.

`overviewPatchMax` (32/48 on low end) gates `patchRect` by object **count**,
which does not bound cost: 32 watercolour strokes and 32 pencil lines are two
orders of magnitude apart.

### Action (cheap, ship first)

Add a **pre-flight cost estimate** and gate the synchronous paths on it, not on
object count. The ingredients already exist in `isSafeCompatibilityBake`:

```ts
// cheap, no rendering: sum over the query result
cost(obj) = (obj.complexity?.() ?? obj.path?.length ?? 8)
          + (obj.clipPath?._objects?.length ?? 0) * 40      // erase masks dominate
          + (obj._objects?.length ?? 0) * 4
          + sourcePixels(obj) / 4096                         // bitmap-backed brushes
```

- `rebuildRectSync` / `repairTileRegionSync` / `patchRect`: estimate before
  clearing anything; over budget → decline and let the yielded async path own it.
  Declining is already a supported outcome everywhere (the fallback ladder
  covers it).
- Drop `REPAIR_BUDGET_MS`'s `count > 0` exemption. A first tile over budget
  should be declined, not run.
- Feed the same estimate into the async loop so a heavy object runs alone in its
  slice instead of behind three others.

This is the single highest ANR-per-line-of-code change available.

---

## M2 — Per-stroke tile stamping is a continuous GPU texture create/destroy storm — **P0 (GPU)**

`DRAW_ENGINE_PERF.md` F5 blames the **bake pass** for texture churn. The bake
pass is debounced (80 ms), aborted on gesture, and bounded. The real churn is on
the **interactive** path and nothing throttles it.

`additiveStamp`, `eraseStamp` and `stampBitmapRegion`
([tileStamps.ts](../src/draw/rendering/tiles/tileStamps.ts)) all do, **per
covered tile, per stroke**:

1. `acquire()` a pooled `OffscreenCanvas`
2. `clearRect(0,0,388,388)` — full-surface write
3. `drawImage(t.bitmap, 0, 0)` — **reads the GPU texture back into the canvas**
4. render the new object
5. `transferToImageBitmap()` — **allocates a new GPU texture**
6. `store()` → `previous.bitmap?.close()` — **destroys the old texture**

At `tileSize: 384` + `overscanPx: 2`, one tile is 388² × 4 = **588 KB**. A stroke
typically covers 1–4 tiles. Sustained sketching at ~2 strokes/sec over 3 tiles:

> ≈ **3.5 MB/s of GPU texture allocation + 3.5 MB/s of texture destruction, for
> the entire session**, plus 2 full-tile fills per tile per stroke.

Erasing is worse: `onErase` stamps on every commit and the eraser fires them
continuously. `ensureMemory` → `evict` → `bitmap.close()` adds more destroys
under budget pressure.

This is a much better fit for `libgsl.so` SIGSEGV / `libGLESv2_adreno.so` SIGSEGV
/ "Unresponsive GPU" than a debounced bake pass is: it is **unbounded in time**
and correlates with *drawing*, which is what the crashing users are doing.

### Action

Make a hot tile a **persistent surface** instead of a bitmap that is rebuilt on
every touch.

Minimum viable version (no architectural rewrite):

```ts
type TileSurface = ImageBitmap | OffscreenCanvas;
```

- `additiveStamp` / `eraseStamp` on a tile whose surface is already an
  `OffscreenCanvas`: draw the object straight onto it. **Zero alloc, zero free,
  no full-tile blit, no clear.**
- The first stamp on a bitmap-backed tile promotes it: blit once into a canvas
  and keep the canvas.
- A **demotion pass** on bake completion / `onGestureEnd` / `trimPool` converts
  cold canvases back with one `transferToImageBitmap`.
- Cap the hot set (e.g. `tilePoolMax` sized: 2 on low end, 4 mid). Everything
  else stays a bitmap.

Churn drops from *per stroke* to *per idle period*. `composite` already handles
both source types — `drawImage` accepts an `OffscreenCanvas` — so the compositor
change is a type widening, not new logic.

**Measure both ways.** On some Adreno drivers canvas→canvas composite is slower
than bitmap→canvas. The metric that matters is `tileDrawMs` in `recordComposite`
vs. the crash rate, not one in isolation.

---

## M3 — Nine tiers share one LRU, and fallback sources compete with active tiles — **P1 (GPU/memory)**

`ZOOM_TIERS` is 9 entries. `MEM_HARD` on a severely constrained device is
`max(16 MB, 24 MB − 2.36 MB overview − 1.2 MB pool)` ≈ **20.4 MB ≈ 34 tiles**,
shared across all 9 tiers.

`FALLBACK_DEPTH = 5` deliberately keeps other tiers' tiles resident as fallback
sources, and `coarserDraw` / `finerDraws` call `touchTile(key, t)`
([tileCompositor.ts:711](../src/draw/rendering/tiles/tileCompositor.ts#L711),
[:801](../src/draw/rendering/tiles/tileCompositor.ts#L801)) — so a fallback tile
that is merely *sampled* gets its LRU position refreshed and competes on equal
terms with the tile the user is actually looking at.

`TileStore.reserve` then evicts in Map-insertion order. Zoom oscillation (pinch
in, pinch out) evicts active-tier tiles to make room for tiers nobody will draw
from directly → rebake → new texture → evict again. Texture thrash under a hard
budget is exactly what exhausts `libgsl`'s allocator.

### Action

- **Per-tier quota** inside `reserve()`: active tier ≥ 55% of the budget,
  active ± 1 ≤ 30%, everything else ≤ 15%. Evict from the over-quota class first.
- Give a fallback-only `touchTile` a **weaker** LRU bump (e.g. `lastUsed =
  now - 2000`) so sampling keeps a tile alive without letting it outrank a
  directly-composited one.
- Consider `FALLBACK_DEPTH = 3` on low-end and let the overview cover the rest.
  Depth 5 buys sharpness during a zoom; on a 20 MB budget it also guarantees the
  ladder cannot all be resident, so the deep entries mostly miss anyway.

---

## M4 — Objects re-rasterize once per tile, per bake, forever — **P1 (the main algorithmic win)**

`objectCaching` is globally `false` ([fabricSetup.ts:101](../src/draw/canvas/fabricSetup.ts#L101))
and `prepareForBake` force-clears it again per bake
([fabricTileRenderer.ts:49](../src/draw/rendering/fabricTileRenderer.ts#L49)).
Both decisions are individually correct (Fabric caches at the *live viewport*
zoom, which is wrong for a tier bake). The consequence is not:

> A stroke covering K tiles is fully re-stroked **K times per bake pass**, and
> again on every invalidation of any of those tiles, forever.

For a plain pencil path that is fine. For the objects that dominate the tail —
an erased object with a `ClippingGroup` mask, a watercolour path, a merged
Group — it is the whole cost.

The engine already has the exact primitives needed to fix this:
`objectMutationRevision(obj)` ([objectSerialization.ts:21](../src/draw/objects/objectSerialization.ts#L21))
gives a free invalidation key, and `TileStore` shows the byte-budgeted LRU
pattern.

### Action — tier-scoped sprite cache

- Key: `${obj.id}:${objectMutationRevision(obj)}:${tier}`.
- Value: `ImageBitmap` of the object's own bounding box rendered at
  `ZOOM_TIERS[tier]`.
- **Admit narrowly**: only when `cost(obj)` (M1's estimator) exceeds a threshold
  **and** the bbox at that tier is under a pixel cap (≤ 512² = 1 MB), so a long
  diagonal stroke never gets one.
- Byte-budgeted LRU, sized out of the same device profile (start at 25% of
  `tileBudgetMB`, taken from the tile budget, not added to it).
- On hit: `drawImage(sprite, …)` in place of `renderer(...)` in `rebuildTile`,
  `rebuildTileSync`, `repairTileRegion*`, `additiveStamp`.

Payoff compounds with M1: it makes the *atom* cheap, which is the only way the
un-yielded sync paths can ever be safe. An erased object with a 300-stroke mask
goes from ~13 ms per tile to one `drawImage`.

Note this is *not* the same as re-enabling `objectCaching` — it is keyed by tier
and by mutation revision, which is precisely what Fabric's own cache gets wrong.

---

## M5 — Coarse tiers and the overview are re-rendered from objects instead of downscaled — **P1**

Baking tier *T* re-queries and re-renders every object, even when the four tier
*T+1* tiles covering it are already fresh in the cache. Zooming out on a dense
board therefore repeats the entire scene render at each coarser tier.

The geometry for the mapping already exists — `finerDraws`
([tileCompositor.ts:735](../src/draw/rendering/tiles/tileCompositor.ts#L735))
computes exactly which finer tiles cover a coarse cell and at what source rect.

Same argument, larger: `WorldOverview.performRebuild` renders the whole board
into a 768² canvas on the main thread, object by object
([:444](../src/draw/rendering/worldOverview.ts#L444)). On a big board that is
*the* biggest main-thread job in the engine, and `abortBakes` calls it out as
such ([renderBakeCoordinator.ts:42](../src/draw/rendering/coordination/renderBakeCoordinator.ts#L42)).

### Action

- **Mipmap bake**: in `rebuildTile`, if every tier `T+1` tile covering this tile
  is present, has a bitmap and `isFresh`, build the tile by 2:1 `drawImage`
  downscale instead of rendering objects. Cap the chain at **one** level so
  resampling error cannot compound, and let the idle async pass replace it with
  a true render.
- **Overview from tiles**: when the overview is dirty and tier
  `OVERVIEW_TIER + 1` tiles cover part of the content bounds, seed that part by
  downscaling them and only object-render the uncovered remainder. Turns most
  overview rebuilds into a handful of `drawImage`s.

Both are strictly optional fast paths — declining falls back to today's code, so
the correctness risk is contained.

---

## M6 — Steady-state allocation churn in the per-frame path — **P2, but it is GC pause pressure**

Individually small; collectively they set the young-generation scavenge rate on a
device with a small heap, and a scavenge landing mid-gesture is indistinguishable
from jank.

**a) String tile keys.** `` `${tier}:${tx}:${ty}` `` is constructed per cell in
`composite` ([:106](../src/draw/rendering/tiles/tileCompositor.ts#L106)), again
per fallback probe in `coarserDraw` ([:695](../src/draw/rendering/tiles/tileCompositor.ts#L695))
and `finerDraws` ([:759](../src/draw/rendering/tiles/tileCompositor.ts#L759)) —
up to `FALLBACK_DEPTH` × 2 per uncovered cell — plus every stamp, bake and
invalidation. Order **100–200 string allocations per composited frame**, and
every `Map` lookup pays string hashing.

Fix: pack into a number. `tier` ≤ 4 bits, `tx`/`ty` ≤ 21 bits signed each = 46
bits, safely inside `Number.MAX_SAFE_INTEGER`. `Map<number, Tile>` removes both
the allocation and the hashing. `markDirty`/`markTierDirty`/`dropTiles` also stop
needing `key.split(":")` + `parseInt` ×3 per in-flight key.

**b) `spatialIndex.query` allocates two arrays and sorts, per call.**
`DRAW_ENGINE_PERF.md` F7 rates this P2 on the assumption the worker does the
querying. In `main` mode it is on the hot path: once per tile bake, once per sync
repair, once per region repair, once per overview patch
([spatialIndex.ts:51](../src/draw/objects/indexing/spatialIndex.ts#L51)).

Fix: reusable scratch arrays behind a `queryInto(rect, out)` variant, and skip
the sort when the z-index revision and the result set are unchanged since the
last query for the same rect (tile bakes re-query the same rect repeatedly).

**c) `prepareForBake` allocates a closure per node, per object, per tile.**
[fabricTileRenderer.ts:40](../src/draw/rendering/fabricTileRenderer.ts#L40)
builds `undo: Array<() => void>` and pushes 1–2 closures per subtree node, walks
the subtree twice, and calls `child.setCoords()` on **every** group child on
**every** tile. A merged Group with 500 children spanning 6 tiles = 3,000
`setCoords()` + ~3,000 closures per bake pass.

Fix:
- Replace the closure array with three parallel module-level scratch arrays
  (`objs[]`, `prevCaching[]`, `prevScaling[]`) reset per call — zero allocation.
- Stamp the group's `calcTransformMatrix()` revision and skip the `setCoords()`
  re-measure when it has not moved since the last prep.
- Cache the per-child cull decision keyed by `(group revision, tile key)`.

Also: assigning `o.getTotalObjectScaling = function(){…}` per bake adds an own
property to every Fabric object. After the first bake the shape is stable, but
the write itself is per object per tile and is not free.

---

## M7 — No memory-pressure or background release path — **P1 (crash, not ANR)**

`grep` finds no `visibilitychange`, no `App.addListener('pause')`, no
`onTrimMemory` bridge anywhere in `src/draw/**`. When the user backgrounds the
app or Android signals pressure, the engine keeps: the full tile cache, the
overview canvas, the canvas pool, fabric's lower + upper canvases and the
transform drag layer — every one of them a GPU allocation.

`libwebviewchromium.so SIGTRAP` is a Chromium `CHECK()`, most often renderer OOM.
The Android WebView renderer runs in its **own sandboxed process** with its own
limit, so `android:largeHeap` in the manifest would do nothing here — do not
spend time on it. Resident bytes in the renderer are the only lever.

### Action

- On `visibilitychange → hidden`: `committed.reset()` (closes every tile
  bitmap), `overview.reset()`, `trimPool(0)`, and drop the transform/vacated
  bitmaps. The cost of coming back is one overview warm, which is already a
  supported path (`warmOverviewBlocking`). Users do not see it.
- Add a small Capacitor plugin bridging `ComponentCallbacks2.onTrimMemory` to a
  JS event. On `TRIM_MEMORY_RUNNING_LOW` / `_CRITICAL`, halve the tile budget and
  evict; on `TRIM_MEMORY_UI_HIDDEN`, do the full release above.
  `DRAW_ENGINE_STABILITY_AUDIT.md` DRAW-06 flags this as "when that bridge is
  added" — it is worth building now. **It converts a crash into a blur.**
- Bound the sum, not the parts. Today `tileBudgetMB`, `overviewPx`,
  `transformMaxPixels` and the pool each have their own ceiling, so the worst
  case is their sum with no single owner. One `DrawMemoryLedger` that every
  allocator reserves from would make the aggregate honest.

---

## M8 — Sentry is initialized but wired for tracing, not for ANRs — **P0 (diagnosis)**

Current state ([general.helper.ts:467](../src/helper/general.helper.ts#L467)):
`browserTracingIntegration({ enableLongTask: true, enableLongAnimationFrame: true })`
at `tracesSampleRate: 0.1` in prod. As configured, **this will not tell you why
ANRs happen**:

1. Long-task spans only exist **inside an active transaction**, and 90% of prod
   sessions are unsampled. Most ANRs will be recorded with nothing attached.
2. An Android ANR is captured **post-mortem** by the native SDK from
   `ApplicationExitInfo`. It carries whatever scope was **already persisted** —
   so anything set at error time is too late by definition.
3. A `libGLESv2_adreno.so` SIGSEGV is a **native** crash. The JS SDK cannot see
   it at all.

### Action, in order

1. **Verify native capture actually works in a release build.** R8 was only just
   enabled (`minifyEnabled true`). Confirm `proguard-rules.pro` keeps
   `io.sentry.**`, then ship a build and check that `ApplicationNotResponding`
   and native-signal events arrive at all. If they do not, nothing below matters.
2. **Persist engine state to Sentry scope continuously**, not on error. A ~10 s
   interval while the draw route is mounted, writing `__drawPerf()` into
   `Sentry.setContext("draw", …)`. That snapshot is what an ANR report will
   carry.
3. **Tags that partition the crash cohort** — set once on canvas init:
   `draw.backend`, `draw.renderDpr`, `draw.rawDpr`, `draw.dprCapped`
   (`isRenderDprCapped()`), `draw.lowEnd`, `draw.deviceMemoryGB`,
   `draw.hardwareConcurrency`, plus `draw.objectCount` and `draw.tileBytes`
   refreshed with the context. This answers open questions 1–4 of
   `DRAW_ENGINE_PERF.md` in a single release.
4. **Long-task breadcrumbs with phase attribution.** `yieldLabelAt()`
   ([yielder.ts:44](../src/draw/scheduling/yielder.ts#L44)) already resolves a
   LoAF script start to the subsystem that resumed, and `recordPhase` already
   names the phases. Emit a `Sentry.addBreadcrumb` when a long task exceeds
   ~250 ms, carrying the attributed label. **Breadcrumbs are unsampled and they
   survive into the ANR report** — this is the single highest-value diagnostic
   available and it is a few dozen lines.
5. **A JS-side stall detector as a backstop.** `setInterval(fn, 1000)`; when it
   fires more than ~5 s late, `Sentry.captureMessage("draw main-thread stall")`
   with the lateness and the last `recordPhase`. This works even if native ANR
   reporting turns out to be off, and it attributes the stall to a phase, which
   the native report never will.
6. Keep the existing `enableLongTask` tracing, but do not rely on it for this.

---

## Recommended order

| # | Change | Effort | Expected effect |
| --- | --- | --- | --- |
| 1 | **M8** Sentry: native verification, persisted context, long-task breadcrumbs, stall detector | S | Turns every item below from a guess into a measurement |
| 2 | **M1** Cost-estimate gate on all synchronous render paths; drop the first-tile exemption | S | Directly removes the ANR-shaped blocks |
| 3 | **M7** `visibilitychange` release + `onTrimMemory` bridge | S–M | Converts OOM crashes into blurs |
| 4 | **M2** Persistent canvas for hot tiles, demote when cold | M | Kills the continuous Adreno texture churn |
| 5 | **M3** Per-tier quota + weaker fallback LRU bump | S | Stops the zoom-oscillation eviction storm |
| 6 | **M6** Integer tile keys, scratch-array queries, allocation-free `prepareForBake` | M | Lowers GC pause frequency |
| 7 | **M4** Tier-scoped sprite cache for expensive objects | M–L | Makes the render atom cheap; compounds with M1 |
| 8 | **M5** Mipmap tier bake + overview seeded from tiles | M | Removes the repeated whole-scene renders |

M1 + M8 together are a few days and should measurably move the ANR rate on their
own. Do not start M4/M5 before M8 is reporting.

---

## What is *not* worth doing

- `android:largeHeap="true"` — the WebView renderer is a separate process; it
  does not apply.
- Re-enabling Fabric `objectCaching` globally — it caches at live viewport zoom,
  which is exactly what M4's tier-keyed cache exists to avoid.
- Abandoning tiling. Both existing audits reach the same conclusion and the code
  supports it: the alternative reintroduces O(visible scene) per frame and fixes
  none of the memory findings.
- Tuning `tileSize` / `memoryBudgetMB` before M8 ships. Tile size trades cache
  hit rate against texture churn in opposite directions; changing it blind is as
  likely to make things worse.
