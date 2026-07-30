# Draw engine v3 — visual-artifact + zoom + worker plan

Companion to [`DRAW_ENGINE.md`](./DRAW_ENGINE.md) (how it works) and
[`DRAW_ENGINE_PERF.md`](./DRAW_ENGINE_PERF.md) (ANR/crash remediation, 21
review passes).

**This doc covers the next class of problems: the ones the user SEES.** Blur,
shift, ghosting, white seams, and a zoom range that is wrong at both ends. Plus
the worker's remaining structural cost, and the measurement harness that should
have existed before any of the previous 21 passes.

*Written 2026-07-30.*

---

## Erase performance — read this first (2026-07-30, second pass)

Measured, not guessed: a 23 s session of *zoom in → erase a lot → zoom out →
spam undo* on a dense board, main backend, desktop DPR 1.

```
longTaskMsMax 2447    longTaskMsTotal 4102    frames.maxMs 2850
phaseMsTotal: localBake 2534 | rebuildSync 2148 | overviewBuild 1032 | overviewPatch 937
phaseCount:   localBake  101 | rebuildSync  163 | overviewBuild    6 | overviewPatch  307
              eraseClipApply 3168 (118 ms total)  eraseClipUndo 2956 (16 ms total)
compositeMsMax 0.8    tileDrawMsMax 0.1    searchMsMax 0.1
```

**The clip work is not the problem.** 3168 clip applies cost 118 ms and 2956
clip undos cost 16 ms — a rounding error. Every millisecond that hurts is spent
**re-rasterizing tiles and the overview**: 6.6 s of the 23 s session, and the
composite itself is idle (0.8 ms worst frame).

Three mechanisms, in order of size:

### EP1 — a repair re-rendered the whole tile for a thin trail ✅ implemented

`rebuildTileSync` re-queried and re-rendered **every object in the tile** even
when the edit was a 40-unit eraser trail crossing a 384-unit tile. On a dense
board with erased objects (each one a `ClippingGroup` whose mask fabric
rasterizes at tier resolution) that measured **13 ms per call, 268 ms worst**,
163 times.

`repairTileRegionSync(tier, tx, ty, changedRect)` keeps the existing bitmap,
clears only the changed sub-rect (intersected with the tile, padded like a
normal bake), and re-renders only the objects intersecting it, in z-order,
clipped. Cost scales with the **edit**, not the tile. Declines and falls back to
a full rebuild when the sub-rect covers >60% of the tile, when the tile has no
bitmap, or when nothing recorded what changed.

Wired into both paths: `rebuildRectSync` passes its rect, and the **async local
bake** now tries the same repair first using the tile's recorded `dirtyRects`
entry — turning many 25 ms full bakes into single-digit-ms patches.

### EP2 — every undo in a burst paid for a full repair pass ✅ implemented

Holding undo queues one history op per keypress. Each op ran its own
invalidation: a synchronous tile repair, an overview patch, and a bake of the
whole invalidated region — then the next keypress threw all of it away. That is
the 163 sync repairs and 307 overview patches above.

`enqueueHistoryOp` now opens a **burst window** at ENQUEUE time and closes it
when the last queued op finishes:

- `setMutating(true)` + `beginBatch()` on the first enqueue,
- `endBatch()` (one coalesced invalidation + one repair) then
  `setMutating(false)` when the queue drains.

`dropRegionEraseUndo` became batch-aware to match: inside a batch it records the
changed rect and marks the re-bake region stale (bookkeeping only, no
rendering), instead of invalidating immediately. 50 undos → **one** repair pass.

Trade: during a long burst a restored object only becomes visible when the burst
ends. Bursts are key-repeat length, and the alternative is what the metrics
show.

### EP3 — bakes rasterized half-applied undos → permanent holes ✅ implemented

The correctness half of the report ("my drawing will have a lot of holes").

A history op mutates objects one at a time and **yields between them** (added
deliberately, to keep input responsive). A bake scheduled by the previous action
lands in one of those gaps, rasterizes a scene where some objects have had the
stroke removed and others have not, and stores it as a **fresh** tile. Nothing
invalidates it again — so the wrong pixels are permanent until something else
happens to touch that region.

New `mutating` flag on the engine (distinct from `erasing`: it suspends baking
but NOT frames, so the user still sees each step). `scheduleBake` and `runBake`
both respect it, and `setMutating(true)` aborts anything already in flight.

**Invariant 19: never bake while a multi-step mutation is in progress.** Any
future path that mutates the scene across an `await` must hold the mutation
window, or it will bake a torn state and store it as correct.

### Third capture (18 s, heavier erase) — what moved and what got worse

```
localBake      2534 ms / 101  →   761 ms / 25     EP1 working
overviewBuild  1032 ms /   6  →   345 ms /  2
rebuildSync    2148 ms / 163  →  3578 ms / 621    WORSE
overviewPatch   937 ms / 307  →  2200 ms / 637    WORSE
longTaskMsMax      2447 ms    →  3447 ms
```

`rebuildSync` and `overviewPatch` moved together, ~620 times each — one call
site doing both, once per object. Not undo (that is batched now): it is the
**deferred fully-erased sweep deleting objects one at a time**.

### EP4 — the erased-check sweep deleted objects unbatched ✅ implemented

`finalizeCleanup` looped `c.remove(obj)`. Every removal fires `object:removed` →
`destructiveInvalidate` → a synchronous tile repair **and** an overview patch,
per object. A heavy erase fully consumes hundreds of objects, so the sweep alone
produced 621 sync repairs (3.6 s) and 637 overview patches (2.2 s) — more than
everything the erase itself cost.

Now wrapped in `beginBatch()`/`endBatch()` **and** a mutation window: one repair
pass for the whole sweep, and no bake can land between two deletions and store a
tile that has some of them and not others.

### EP5 — the sweep could delete objects nothing could restore ✅ implemented

The other half of "erasing + zooming + undoing keeps holes".

The sweep is deferred, so by the time it deletes, its erase action may have been
**trimmed out of history** (`MAX_HISTORY_ACTIONS` is 50, and a long erase burst
pushes 50 actions quickly). `erasing:cleanup_done` then finds no action to
record the deletion on and returns — but `finalizeCleanup` has already removed
the objects. They are gone from the canvas with nothing able to bring them back:
a permanent hole, exactly matching "erase a lot, undo a lot, holes remain".

`finalizeCleanup` now asks history first (`hasErasingAction(strokeId)`, checking
both stacks) and skips the deletion entirely when the answer is no. Keeping a
fully-erased object costs a little memory and renders to nothing — strictly the
better failure mode. The guard is **injected** at history init rather than
imported, because history already imports the eraser store and a cycle between
two pinia stores is its own class of bug.

### EP6 — a dense overview patch no longer triggers an O(scene) rebuild ✅ implemented

`patchRect` refuses a region holding more than `overviewPatchMax` objects, and
the old answer was `markDirty()` + a full rebuild: 267–472 ms re-rendering the
**whole board** to fix a region that might be a few percent of it.

`splitOverviewPatch` subdivides into quadrants instead — each holds roughly a
quarter of the objects, so one or two splits puts every piece under the cap.
Pieces drain on an 8 ms budget. Total work stays proportional to the objects in
the original rect (only boundary objects render twice).

The split queue is deliberately **separate from `pendingOverview`**: that queue
merges nearby rects at flush time, which would glue the quadrants straight back
into the rect they came from — an endless split/merge loop. A full rebuild
survives only as the last resort for a region too small to split further.

### EP7 — the biggest number was the least actionable ✅ instrumented

`longTaskMsMax` has now twice been several times larger than any measured phase
(2447 ms, then 3447 ms), which means the block was **outside** the instrumented
set. Added `historyOp`, `eraseCommit` and `erasedSweep` phases (wall clock —
all three yield internally, so compare them against `longTasks`, not against
frame time). Next capture should attribute it.

### Fourth capture — perf resolved, one hole mechanism left

```
longTasks 0    longTaskMsMax 0    frames.maxMs 50    slowFrameRate 0.45%
rebuildSync 118 ms / 16    overviewPatch 180 ms / 232    overviewBuild 0 ms / 0
localBake 433 ms / 77      erasedSweep 1861 ms / 10 (wall clock, yields)
historyOp 180 ms / 12      eraseCommit 56 ms / 11
```

Every phase is inside budget and the Long Tasks API reports **nothing**. The
remaining report is correctness only: small permanent holes, "more in the
beginning".

### EP8 — a sub-rect repair marked a tile fresh while still owing another edit ✅ implemented

That is the hole, and the "in the beginning" detail is the tell.

`repairTileRegionSync` repainted the rect the CALLER passed and then stored the
tile under the current generation — i.e. **fresh**. But a tile can owe more than
one edit: erase A invalidates region A, its bake is still pending, and undo B
then repairs region B of the same tile. Region A is silently dropped, the tile
is declared correct, and nothing will ever invalidate it again. The erase hole
from A is on screen for the rest of the session.

It is worst early on because that is when the tile cache is cold and several
tiles are carrying a backlog at the same time — exactly the reported pattern.

The repair now consults `dirtyRects`, which is the authoritative record of what
is owed on that tile, and repaints the **union** of it and the caller's rect.
Two refusals were added with it: a `null` entry (whole tile wrong) and a stale
tile with no recorded region both fall through to the full rebuild, since a
sub-rect repair cannot be correct there.

**Invariant 21: a partial repair may only mark a tile fresh if it covered
everything the tile owed.** Anything that stores a tile as current while
`dirtyRects` still holds an unrepainted region creates permanently wrong pixels.

### EP9 — the overview split could chase a region it can never patch ✅ implemented

`patchRect` fails for two very different reasons: too many objects (subdivide —
EP6) and *outside the bitmap's mapping* because content grew (only a rebuild can
fix it, since the mapping itself must change). EP6 treated both as "subdivide",
so an out-of-coverage rect was split down to the 8-unit floor before finally
falling back. `overview.covers(rect)` now separates the two up front.

### EP10 — intersecting erase strokes revived an undone erase ✅ implemented

The residual holes, and the "only with INTERSECTING strokes" report is what
identifies it exactly.

Strokes A and B both erase object O (they intersect, so they share targets).
Together they consume O, so the fully-erased sweep deletes it — and the sweep is
DEFERRED, so the sweep that finishes may be **A's**, while O's clip snapshot at
that moment already holds `{A, B}`.

```
erase A        O.clip = {A}
erase B        O.clip = {A, B}
A's sweep runs → O fully erased → deleted, snapshot clip = {A, B}, recorded under A
undo B         → O is off-canvas; nothing happens
undo A         → O restored from snapshot {A, B}, then A removed → {B}
```

O comes back still erased by B — whose undo already happened. That erase is now
permanent, and the hole sits exactly where the two strokes crossed. Two strokes
that do NOT intersect never share an object, which is why they always undo
cleanly, and a single stroke has nothing to revive.

Fix: everything on the **redo stack is undone by definition**, so a restored
snapshot must not keep its strokes. `undoneEraseStrokeIds()` is exposed through
`HistoryContext` (not imported — the history store owns the stacks and an
operation module importing it back would be a cycle), and `stripClipStrokes`
drops those children from every revived object, clearing the clipPath entirely
when nothing is left.

`stripClipStrokes` lives in `operations/eraseClip.ts`, a deliberate LEAF module
with no store/canvas imports, so it is unit-testable without pulling the engine
and the DOM into the test env.

**Invariant 22: a snapshot restored from history is not automatically valid.**
It captures the state at capture time; any action undone since must be
re-subtracted from it before the object goes back on the canvas.

### Still open on the eraser, in priority order

1. ~~Overview rebuild is O(scene) and fires on patch failure.~~ Done — EP6.
2. **Erased objects are expensive to rasterize, per tile.** Fabric force-caches
   any object with a clipPath (`needsItsOwnCache`), and the cache is
   invalidated on every clip mutation — so an undo re-rasterizes each affected
   object's whole mask at tier scale. A per-object mask cache keyed by
   `(id, clipRevision, tier)`, reused across tiles and across repairs, is the
   structural fix. Measure `localBake` per tile after EP1 before building it.
3. **`FLATTEN_ERASE_CLIP_AFTER` is 72** (`LIVE_ERASE_STROKES` 64 + 8), so the
   mask stays a 60+ child vector stack for a heavily erased object. That is a
   deliberate trade for undo fidelity — every stroke in history stays a vector
   — but it is also why per-object render cost stays high. Item 2 removes the
   need to trade at all.
4. **`__bakedClipStrokes` is runtime-only.** It is never serialized, so any
   object re-enlivened after a flatten (reload, remote apply, undo of an add)
   loses the retained vectors and its baked erases become permanently
   un-undoable — the `[EraseUndo] … not removable` warning. Fix is to serialize
   the retained stroke ids alongside the flattened mask.

### Other big performance concerns spotted in the same capture

- **`overviewBuild` 472 ms worst** — see item 1 above. It is yielded, so it does
  not show as one long task, but it is 1 s of main-thread work per session.
- **`longTaskMsMax` 2447 ms is not attributed.** No single measured phase
  accounts for it, so something outside the instrumented set is blocking:
  candidates are the erased-check sweep (`toCanvasElement` + readback per
  object), `computeContentBounds`, and the enliven of restored objects. Next
  capture should wrap the whole history op in a `historyOp` phase and the erase
  commit in an `eraseCommit` phase; without that the biggest number in the
  report is the least actionable one.
- **`tileMemoryPressure` 56% with 172 tiles at DPR 1.** On a DPR-3 phone the
  same board is ~4x the bytes at the same tile count. Worth re-checking the
  mobile budget against a real device before the next release.
- The `/bench` route is not earning its keep (agreed). The **manual capture is
  the useful artifact** — keep the metric catalog and the export, drop the
  scripted scenarios unless they start catching regressions.

---

## TL;DR — what is actually wrong

Six reports, four root causes, and they are **not** independent:

| # | Report | Root cause |
| --- | --- | --- |
| 1 | Move / undo / redo / remote-add makes tiles blurry and shift | The tile stamp fast path is **dead code**, and stale-but-correct pixels are thrown away wholesale. Every edit therefore drops the whole tile to the whole-board overview. |
| 2 | Zoom in/out on a big drawing → overview is blurry, jump is too big | The overview is ONE bitmap over the whole board, so its resolution is `PX / boardSize` — it degrades as the board grows. It is used as the *picture* up to tier 2. |
| 3 | Too much zoom-out, too little zoom-in | `ZOOM_TIERS` is skewed low. Agreed — see [Z1](#z1--retier). |
| 4 | Fully zoomed out is too blurry, especially in a busy lobby | Same overview resolution problem as #2, plus no content-aware zoom floor. |
| 5 | White lines during bake / undo / redo | Fallback tile fragments land on **fractional** device rects, and partially-covered cells have gaps with nothing painted under them. |
| 6 | Worker slower than main; zoom + bake lag | Rasterization moved off-thread; the per-tile main-thread prologue and the composite did not. Plus a GPU upload burst with no admission control. |

**The single most important finding: the transform-commit stamp never runs.**

[`transformController.ts:243`](../src/draw/transform/transformController.ts#L243)
calls `mgr.scheduleRectPatch(newRect)` → `core.markDirty(newRect)`, which bumps
the generation of every tile in the new footprint. Two lines later,
[`:254`](../src/draw/transform/transformController.ts#L254) calls
`stampRegionBitmap`, whose first check per tile is

```ts
const fresh = !!t && t.builtGen === oldGen   // just bumped → ALWAYS false
```

so every tile is skipped, `complete` is false, `stamped` is false, and the whole
O(touched tiles) drag-commit fast path — the one the perf doc describes as "the
pixels the user already sees become the tile content immediately" — has been
inert. What the user gets instead: the entire new footprint invalidated, the GPU
layer held until the async bake lands, and the region rendered from the
**overview** meanwhile. That is precisely "when moving, the tiles become blurry
and move".

And even after fixing the ordering, `composite()` would still refuse those
pixels: the active-tier path requires `isFresh`, while `stampBitmapRegion`
deliberately stores under the OLD `builtGen`. That guard was added (correctly)
to stop stale tiles resurrecting moved objects, but it also killed the one case
where stale pixels are *known good*. The two concepts have to be separated.

---

## The mental model this plan adds

Today a tile is binary: **fresh** (composite it) or **not fresh** (pretend it
does not exist). That is why every edit falls all the way to the whole-board
overview — a 4096×-downscaled approximation — for pixels that were 99% correct.

v3 splits that into two independent axes:

| Axis | Question | Set by |
| --- | --- | --- |
| `builtGen === gen` (**fresh**) | Does this tile need a re-bake? | invalidation |
| `usable` | Are the pixels currently on screen-correct? | invalidation vs. stamping |
| `dirtyRect` | *Which part* of the tile is wrong? | the invalidating rect |

- A **stamped** tile (drag commit) is `usable: true`, not fresh → composite it
  now, re-bake later for exact z-order. No blur, no wait.
- An **edited** tile is `usable: false` with a `dirtyRect` → composite the sharp
  stale pixels everywhere EXCEPT the dirty sub-rect, and cover only the sub-rect
  from the fallback ladder / overview. A 40×40 edit inside a 512px tile blurs
  40×40 px, not the whole tile.
- No `dirtyRect` recorded (`markAllDirty`, unknown provenance) → whole tile
  dirty = exactly today's behaviour. **Fail-safe by construction.**

This is the change that makes reports 1 and 5 go away, and it shrinks 2/4 as a
side effect (far less of the screen ever shows overview pixels).

---

## Phase 1 — artifacts (ships first, no new subsystems)

### A1 — separate "needs re-bake" from "pixels are wrong" ✅ implemented

`Tile.usable` in [`committedLayer.ts`](../src/draw/committedLayer.ts).

- `store()` takes `usable`; normal bakes store `usable: true` **and** fresh.
- `markDirty` / `markTierDirty` / `dropOtherTiers` set `usable = false`.
- `stampBitmapRegion` stores `usable: true`, `builtGen` behind → draws instantly,
  re-bakes for exact z later.
- `composite()` draws `fresh || usable`; `needsBake` still keys off `fresh` only.
- Fallback search (`coarserDraw` / `finerDraws`) still requires **fresh** —
  a scaled cross-tier source is a guess, and a stale one compounds the guess.

Tiles constructed without the field are treated as unusable, so anything the
engine did not explicitly bless keeps the old conservative behaviour.

### A2 — stamp the drag commit BEFORE invalidating it ✅ implemented

[`transformController.ts`](../src/draw/transform/transformController.ts): stamp
first, then mark dirty **only if the stamp did not cover everything**.
`stampBitmapRegion` already bumps the gen of every tile it touches (stamped or
not), so the bake still repaints the region exactly — the extra `markDirty` was
never load-bearing, it just pre-emptively destroyed its own fast path.

### A3 — sub-tile invalidation ✅ implemented

`CommittedLayer.dirtyRects: Map<key, WorldRect | null>` (null = whole tile).
Unioned per invalidation, cleared on `store()`.

`composite()` gains a third bucket beside `present` / `uncovered`:

```
partial: a stale tile whose dirtyRect covers only part of the cell
  → the cell goes to the fallback/overview path for FULL coverage
  → then the stale bitmap is drawn on top, clipped to (cell MINUS dirtyRect)
```

Draw order becomes: overview → fallback tiers → **partial stale** → present.
Because the cell is fully covered underneath before the partial overlay, this
can never open a hole (see A4).

Cost: one extra `clip()` + `drawImage` per partially-dirty visible tile, only
while a bake is pending. Steady state is unchanged and still allocation-free.

### A4 — white lines ✅ implemented

Three distinct mechanisms, all in the composite path:

1. **Fractional fallback destinations.** `finerDraws` computed
   `ddx = dx + (ix0 - cellWorld.x) * dpw` and friends as floats. Adjacent
   fragments therefore left sub-pixel gaps that the background showed through —
   thin lines, exactly at fragment boundaries, exactly while tiles are baking.
   Now snapped: `floor` the near edge, `ceil` the far edge, so fragments
   **overlap by <1px instead of gapping by <1px**. (They are opaque tile content
   in the same z-plane, so overlap is invisible; a gap is not.)
2. **Overview dest rect.** Same float problem, plus edge AA against transparent
   at the clip boundary. Expanded outward by 1 device px; it is clipped to the
   uncovered cells anyway, so the expansion cannot leak.
3. **Uncovered cells with a partial stale tile** (A3) are covered by the
   fallback/overview ladder *before* the stale overlay, never after.

### A6 — batching stripped undo/redo of BOTH fast paths ✅ implemented

Follow-up report: move is fixed, but **undo/redo of an added stroke still
blurs for a second**. A1–A4 could not help, because neither the additive nor
the repair path was reached at all.

`drawHistoryManager.undo()` / `redo()` wrap *every* action in
`beginBatch()`/`endBatch()`
([history.store.ts](../src/draw/history/history.store.ts)). Batch mode routed
everything through `noteRegion()` → one `invalidateRegions()` at flush, which
did **logical invalidation only**. Two consequences:

1. **Undo of an add (a removal)** lost the bounded synchronous repair that the
   unbatched path has always done (`destructiveInvalidate` → `rebuildRectSync`,
   ≤6 visible tiles). So the region sat on the overview for the 80 ms bake
   debounce plus the worker round-trip.
2. **Redo of an add (a re-add)** never reached `core.onObjectAdded` at all —
   its rect was flattened into the same destructive list. No `additiveStamp`,
   no live overlay: an operation that only ADDS pixels threw away the entire
   footprint and re-rendered it from a whole-board approximation.

Fixes:

- `invalidateRegions()` now performs the same bounded sync repair, with the
  budget shared across the **whole batch** (so a 300-object undo costs no more
  main-thread rendering than a single deletion) and gated on the usual
  gesture/load/erase seams. `rebuildRectSync` returns its tile count so the
  budget can be spent across rects.
- `endBatch()` keeps added objects in a separate `batchAdds` list and replays
  them through `core.onObjectAdded` **after** the destructive pass — so they
  get the stamp / live-overlay path exactly like an interactive stroke.
  Capped at 16 per batch; bulk pastes and big remote replays keep the coalesced
  behaviour. Objects added and removed within the same batch are skipped.

### A7 — an add must not invalidate what it does not change ✅ implemented

Even on the interactive path, `onObjectAdded`'s fallback branch did
`markDirty(rect)` before putting the object on the live layer. That is wrong in
kind: a topmost, source-over object **only adds pixels**, so the tile underneath
is not incorrect — it is incomplete, and the live overlay is already supplying
exactly the missing part.

`CommittedLayer.markStale(rect)` bumps the generation (re-bake still owed) while
leaving `usable` and the dirty sub-rect untouched. The composite then shows
**sharp tiles + sharp live object**, which is pixel-identical to the baked
result, instead of dropping to the overview for the whole bake window.

Guard: only when the object is topmost, `globalCompositeOperation` is
source-over, and `live.add()` actually accepted it (the layer is bounded). Any
of those false → the old destructive path, unchanged.

### A8 — a style change repaired its tiles, then invalidated them again ✅ implemented

Third report: move and undo/redo are fixed, but **changing an object's stroke
colour still blurs it**.

`onObjectChanged` did:

```ts
if (oldRect) this.destructiveInvalidate(oldRect); // markDirty + bounded sync repair
if (rect)    this.additiveInvalidate(rect);       // markDirty AGAIN (no repair)
```

For a style change the two rects are the **same region** — the object did not
move — so the repair was thrown away by the very next line and the footprint
fell to the overview until the async bake. Same shape as the A2 defect: a fast
path destroyed by something that ran immediately after it.

Fixed by routing both footprints through `invalidateRegions([oldRect, rect])`,
which merges overlapping rects, invalidates everything **first**, and then
repairs once from the shared batch budget. A move (rects far apart) still keeps
them separate, so nothing over-invalidates the empty span between.

### A9 — erase undo/redo blurred the objects, not the stroke ✅ implemented

Same report, second half. The erase history handlers built

```ts
rect = union(strokeFootprint, unionBounds(everyAffectedObject))
```

and invalidated **all** of it. An eraser stroke drawn across a drawing touches
objects whose full bounding boxes cover most of the canvas, so undoing one thin
erase trail threw away a screenful of correct pixels — and `dropRegionEraseUndo`
deliberately used **zero** sync tiles when the bakery is alive (E4/E6, to avoid
main-thread clip renders), so the whole thing sat on the overview until the
worker came back.

The two rects mean different things and now get different treatment, via
`RenderEngine.invalidateChanged(changedRect, rebakeRect, maxSyncTiles)`:

- `rebakeRect` (the union) → `markStale`: those tiles must re-render from
  objects whose clips changed, but their pixels are not wrong yet.
- `changedRect` (the stroke footprint) → `markDirty`: the only place pixels
  actually differ, and the only place that may blur.

Because the changed rect is now a thin trail instead of the union, a small sync
repair is affordable again: **2 tiles** with the bakery alive (was 0), full
repair without it. The overview patch still covers the whole changed rect — it
holds the hole punched in at erase time and must be repainted from the
now-un-erased objects, or the undone stroke stays visible in every fallback.

Known residual: undoing past a *flattened* clip (E3) un-flattens it, which
re-renders that object slightly differently (vector mask instead of an upscaled
image) across the whole previously-flattened area. Those tiles are stale and
re-bake correctly; until they do they show the old mask. Visually near-identical
— and far better than blurring the region.

### A10 — the fallback ladder is empty exactly when zoomed in ✅ implemented

Fourth report: residual blur, **only noticeable when zoomed in a lot**, on move
and on move undo/redo.

Zoom is the amplifier, and the mechanism is specific. An edit bumps the
generation at **every** tier, and `findBestSource` required `isFresh` — so after
any edit the entire cross-tier ladder was rejected and uncovered cells went
straight to the overview. At 1x that is a mild softening. At 16x the overview is
a whole-board bitmap being upscaled ~60x, which is the "jarring blur" that
survived A1–A9. Two extra factors compound at high zoom: a tile covers
`tileSize / tier` world units, so a moved object spans dozens of tiles (the
6-tile repair budget covers a sliver), and the tiers holding data may be 4+
steps away — past `FALLBACK_DEPTH` 3 — so there was no candidate at all.

Fixes:

- **Cross-tier sources may be stale, with their dirty rect punched out.**
  `fallbackHole(key, tile)` returns "trust all" (fresh or usable), "trust
  outside this rect" (stale with a recorded dirty rect), or "do not trust"
  (stale with unknown provenance — `markAllDirty`, or a tile that predates the
  record). `Draw` carries the hole in device px; holed fragments are drawn with
  the same even-odd clip as A3, and their cell is added to the overview pass so
  the hole is never bare. A stale coarser tile is a few times softer than the
  active tier; the overview is orders of magnitude softer.
- **`FALLBACK_DEPTH` 3 → 5.** Zooming 1x → 16x is four tier steps; at depth 3
  the search could not reach the data. It is map lookups only (`searchMsMax`
  tracks it) and a gesture still caps it at 1.
- **The vacated region of a move is not covered by anything.** The transform
  commit passed `coveredByLayer: true` for the OLD footprint, which skips the
  sync repair — but the GPU drag layer is at the NEW position. The area the
  object came from was left on the overview until the bake. Now repaired,
  bounded to 4 tiles (half the pre-worker cost).
- **`dropOtherTiers` after a bitmap stamp.** Only the active tier receives
  stamped pixels, so other tiers still showed the region without the object that
  just moved in. They are now lazily invalidated with that rect, so the
  cross-tier fallback punches it out and takes the (already patched) overview
  there instead.

Residual, by construction: a coarse tile upscaled 16x is still visibly softer
than a baked tile. Fully removing that means baking the active tier faster
(Phase 3 / W2–W3), not more fallback tricks.

### A11 — two sources over one pixel = doubled alpha ✅ implemented

Regression introduced by A3 + A10, reported as **"random darker squares on
drawings with low-opacity strokes, when undoing/redoing and when zooming"**.

Tile bitmaps are transparent except where content is, so a 0.45-alpha stroke is
0.45 alpha *in the tile*. The overview holds the same stroke at the same alpha.
Painting both over the same pixel gives `1 - 0.55²` = **0.70** — a visibly
darker patch shaped exactly like a tile.

Three overlaps existed, all mine:

1. The overview was drawn under the **whole cell**, then the stale tile was
   drawn back over the untouched part (A3).
2. Same for a holed cross-tier fallback (A10).
3. A cell could take its own stale tile **and** a cross-tier fallback.

Fixed by making coverage a partition instead of a stack:

- Overview coverage is now an arbitrary **rect list**, not one entry per cell.
  It gets exactly the punched hole when a tile source is used, and the whole
  cell only when no tile source exists at all.
- A cell that uses its own stale tile takes **no** cross-tier fallback: one
  source per region, always.

Also corrected from A4: fragment destinations are floored on **both** edges, so
fragment *i*'s far edge is bit-identical to *i+1*'s near edge — no gap and no
overlap. The earlier floor/ceil traded the white gap for a 1px overlap, which on
semi-transparent tile content is a dark seam.

Guarded by `never paints two sources over the same pixels`, which asserts the
exact clip rects.

### A12 — `getZoomLimits` crashed on re-entering the draw view ✅ implemented

```
TypeError: Cannot read properties of undefined (reading 'el')
    at getZoomLimits (canvas/drawObjectManager.ts)
    at enablePCGestures (input/gestures.ts)
```

The store is a Pinia singleton that **outlives the canvas**. The former
content-aware limit read the old canvas element during setup. Zoom limits no
longer inspect the canvas or DOM; they come directly from the render tier
configuration.

### A5 — fixed tile-backed zoom floor ✅ implemented

The earlier content-aware floor made navigation unpredictable: drawing farther
from the center changed how far the same user could zoom out.

The floor is now `firstTileBackedTier / renderScale`. With the default ladder,
tiers `0` and `1` are overview-only, so tier `2` (`0.5`) defines the minimum.
At render scale `2`, the viewport floor is therefore `0.25`. Content bounds no
longer affect zoom limits.

### Z1 — retier ✅ implemented

```diff
- ZOOM_TIERS = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16]
+ ZOOM_TIERS = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32]
```

Agreed with the report, and worth being explicit about what it buys:

- The ladder's mathematical floor moved from 0.031 to 0.0625 at render scale
  `2`. Navigation now uses the stricter tile-backed floor from A5.
- `maxUsableZoom` = `tiers[last] / renderScale` → 8 → **16**. An 8× ceiling is
  low for a sketch app; the added tier is baked at `MAX_RENDER_SCALE`, so it is
  genuinely sharper, not an upscale.
- Tile count is unchanged (still 9 tiers); memory is unchanged (the budget is
  bytes, not tiers).
- `OVERVIEW_TIER` **must move with it**. It is an index, and the indices all
  shifted by one. Keeping it at 2 would silently promote the pure-overview path
  from `zoom ≤ 0.14` to `zoom ≤ 0.29` — twice as much blurry screen. See Z2.

### Z2 — `overviewTier` is an INDEX and must move with the ladder ✅ implemented

`OVERVIEW_TIER` is the tier at and below which the overview **is** the picture
and no tiles are composited at all. It is an index, so Z1 shifting the ladder
means `2 → 1` merely to *preserve* today's zoom threshold (0.25). Leaving it at
2 would have doubled the zoom range drawn from a single whole-board bitmap —
the opposite of what reports 2 and 4 ask for.

**Going further (`overviewTier: 0`) is tempting and wrong today.** Worked
through: a tier-1 tile covers `tileSize / 0.25` ≈ 1536 world units. The zoom at
which tier 1 is active is ~0.06–0.125, so a phone viewport spans ~18k × 36k
world units — **~290 tiles, ~170 MB**, against a 40–72 MB mobile budget. It
would thrash the cache and turn a zoom-out into a 290-tile bake pass. The
coarse end of the range needs a cheap whole-board representation until either
the overview gets resolution (O1) or coarse tiles get cheaper.

So the blurry zone shrinks in Phase 1 by **raising its floor**, not by removing
it: the tier floor goes 0.031 → 0.0625 (Z1) and the content-aware clamp (A5)
usually stops the user well before even that.

---

## Phase 2 — adaptive overview ✅ complete

The fixed square overview wasted pixels on empty space for wide or tall boards.
It now targets the density of the first tile-backed tier and follows the content
aspect ratio.

The existing `overviewPx²` allocation is a hard pixel budget, not a starting
size. Small boards allocate only the pixels needed for the target density.
Large boards scale down uniformly to stay inside the budget, and no edge may
exceed 4096 pixels. This improves fallback sharpness without reducing the tile
cache or increasing peak overview memory.

The worker protocol now accepts overview width and height separately, and the
worker overview renderer is connected to the engine when the worker backend is
enabled.

### O2 — overview mip chain: not needed

The fixed tile-backed zoom floor means users cannot settle in the overview-only
range. The overview is now a temporary base while tiles bake. Maintaining 2–3
extra bitmaps would increase memory and update cost for little visible benefit.

---

## Phase 3 — the worker

### W1 — answering the three hypotheses directly

**"GPU texture upload stampede"** — real, but not in the shape described. Two
mitigations already exist: `lanes = 2`
([`committedLayer.ts:725`](../src/draw/committedLayer.ts#L725)) so at most two
bakes are in flight, and `requestBakeProgressFrame`'s trailing-timer throttle
(~8 composites/sec, R29). The burst that survives is the **final composite of a
pass** and any **tier change**, where every visible cell is new at once. Fix is
admission control, not more throttling — see W2.

**"Message queue flooding"** — does not apply as coded. With 2 lanes the worker
can have at most 2 bake replies outstanding; there is no 30-message dump. The
message volume that *is* unbounded is `upsert`/flush, and that is already
time-budgeted and idle-scheduled (R22/R26). Do not spend effort here without a
`__drawPerf()` number showing otherwise.

**"Style recalculation / layout thrashing"** — plausible and untested. Cheap to
settle: `PerformanceObserver` for `layout-shift` plus a check for Vue
reactivity wired to zoom/tile state (a zoom-percentage indicator re-rendering on
every gesture frame would do it). Add it to the bench (Phase 5) rather than
guessing.

### W2 — GPU upload admission control

The first `drawImage` of a freshly-stored `ImageBitmap` uploads it as a texture.
Cap how many *newly stored* bitmaps a single composite may touch (start at 4):
above the cap, the remaining cells keep drawing their existing fallback for one
more frame and are admitted next frame. Uploads then spread over frames by
construction instead of clumping on the switch frame. `tileDrawMsMax` is the
before/after number and already exists.

### W3 — move the tile→object resolution into the worker

The largest remaining per-tile main-thread cost (R32's list): `index.query` + a
z-sort + a `workerCanRender` scan + `flushObjects`' structured clone, **per
tile**. The worker mirror already receives every object via
`upsert`/`translate`/`remove`, so it can hold bounds + z and answer "which ids
are in this tile" itself. That collapses ~4 main-thread items × ~40 tiles into
**one message per bake pass**.

This is the single biggest worker win left and the prerequisite for the
composite ever leaving the main thread (`transferControlToOffscreen`, R32's
structural answer).

### W4 — would multiple workers help? — **No, not in this architecture.**

Each bakery worker owns a **full mirror of the scene** (JSON strings + an
enlivened Fabric LRU + bitmap assets). N workers means:

- N× mirror memory, on devices already showing `libwebviewchromium` OOM.
- N× `postMessage` + structured clone **on the main thread** for every upsert —
  i.e. more of exactly the cost we are removing.
- N× enliven of the same objects, since the LRUs are independent.
- On the Android cohort, `hardwareConcurrency` is 4–8 and is *shared with the
  compositor and GPU threads* — the ones already in the ANR signature. Adding
  raster threads there competes with the thing that is timing out.

What DOES parallelize, in order:

1. W3 first (one worker that owns the index) — then the tile loop is inside the
   worker, and *that* is where a raster pool can be added without touching the
   main thread at all.
2. A pool of **stateless** raster workers behind the owner worker, fed
   transferables. No mirror duplication because they render pre-resolved
   display lists, not scene objects.
3. Desktop-only, behind a flag, gated on `hardwareConcurrency >= 8`.

Verdict: revisit after W3 ships and the bench shows worker raster (not the
prologue) is the bottleneck.

---

## Phase 4 — de-god-ing the modules

Pure mechanical extraction, no behaviour change, with existing tests as the
guard.

**Status: complete.** Each subsystem has one public entry:

- `rendering/renderEngine.ts` exports `RenderEngine`.
- `rendering/committedLayer.ts` exports `CommittedLayer`.
- `canvas/drawObjectManager.ts` connects Fabric to the render engine.

The implementation folders are deliberately internal:
`rendering/coordination/` owns scheduling and invalidation,
`rendering/tiles/` owns the committed cache, and `rendering/bakery/` owns worker
support. Fabric integration lives in `canvas/`, gestures in `input/`, and object
lookup in `objects/indexing/`.

| File | Now | Split into |
| --- | --- | --- |
| `committedLayer.ts` | 1435 | `rendering/tiles/tileGeometry.ts` · `tileStore.ts` · `tileCompositor.ts` · `tileBaker.ts` · `tileStamps.ts` |
| `renderEngine.ts` | 1013 | `rendering/coordination/renderFrames.ts` · `renderBakeCoordinator.ts` · `renderInvalidationCoordinator.ts` · `renderOverviewCoordinator.ts` |
| `drawObjectManager.ts` | 1263 | `objects/indexing/spatialIndex.ts` · `zIndex.ts` · `canvas/fabricEventBridge.ts` · `input/gestureController.ts` · `rendering/liveObjectRenderer.ts` |
| `tileBakeryClient.ts` | 1227 | `rendering/bakery/protocol.ts` · `health.ts` · `assets.ts` |

Ordering rule: **do this after Phase 1 lands and before Phase 3.** Phase 3
rewrites the bake path; doing it inside a 1400-line file is how the previous 21
reviews each found a bug in a seam nobody could see.

---

## Phase 5 — the standardized bench (this should exist before anything else)

Every finding in `DRAW_ENGINE_PERF.md` is "desktop + code reasoning". The
counters exist (`snapshotDrawMetrics()` / `__drawPerf()`); what is missing is a
**repeatable scene + repeatable interaction + a stored baseline**.

> **Implemented foundation:** seeded scene factory, reusable scenario driver,
> deterministic CI baseline (`pnpm bench:check`), dev-only `/bench` dashboard,
> real-device frame recorder, explained metric budgets, and JSON export. See
> [`DRAW_BENCHMARK.md`](./DRAW_BENCHMARK.md). Automated real-pixel artifact
> assertions remain the next extension.

### B1 — deterministic scene factory

`src/draw/testing/sceneFactory.ts` — seeded RNG, no network, no fabric canvas
required:

| Scene | Shape | Targets |
| --- | --- | --- |
| `pencil-500` | 500 pencil strokes, clustered | baseline |
| `watercolor-300` | heaviest per-object render | R27/R30 territory |
| `mixed-lobby-2000` | 40 drawing-sized clusters spread over a big world | reports 2 + 4 |
| `erased-heavy` | 200 strokes, 60 erase ops, some flattened clips | E-series |
| `sticker-mix` | strokes + images + text | hybrid/refusal paths |

### B2 — scripted scenarios, driven at the engine API

`src/draw/testing/benchScenarios.ts`, each a pure sequence against `RenderEngine`
with a fake `Surface`: `zoomInLadder`, `zoomOutLadder`, `panSweep`,
`undoRedoStorm`, `remoteAddBurst`, `moveSelection`, `eraseSweep`,
`gestureDuringBake` (the R20 case).

### B3 — two tiers of measurement

**Tier A — headless, deterministic, CI-gating (vitest).** The tile renderer is a
counting stub; no real raster, so numbers do not flake. Measures *algorithmic*
cost, which is what actually regressed in every past incident:

```
tilesBaked, tilesRefused, objectsRendered, compositeDrawCalls,
cellsUncovered, overviewPatches, overviewRebuilds, syncRepairTiles,
invalidatedCellsPerEdit
```

`invalidatedCellsPerEdit` alone would have caught the A2 defect: a one-object
move should dirty ~4 cells, not the whole footprint at every tier.

**Tier B — real pixels, real device.** A dev-only route (`/bench`, `DEV` guard)
that builds a scene, runs the same scripts on real rAF, and emits
`snapshotDrawMetrics()` plus a frame-time histogram as JSON. Drivable by the
existing Cypress setup for desktop, and by URL on a real Android build — which
is the only way to close the "field confirmation" gap the perf doc keeps
flagging.

### B4 — artifact assertions (turns reports 1/2/5 into tests)

The subjective reports become pixel assertions on Tier B:

- **White-line detector:** after every scenario frame, no run of ≥3 background-
  coloured pixels may appear strictly inside `contentBounds`. Fails today (A4's
  bug), passes after.
- **Blur/jump detector:** capture the composite before an edit and after it;
  outside the edit rect, PSNR must stay above a threshold. Report #1 is exactly
  "the pixels outside my edit changed", so this measures it directly.
- **Sharpness ladder:** at each zoom tier, measure high-frequency energy
  (variance of Laplacian) of a fixed scene. Report #2 is "the step between tiers
  is too big" — this produces the actual step size per tier, so Z1/Z2/O1 can be
  tuned against a number instead of a feeling.

### B5 — baselines + regression gate

`bench/baseline/<scene>.<scenario>.json` committed; `scripts/benchCompare.mjs`
diffs with per-metric thresholds; `pnpm bench:check` fails the build on
regression. Tier A in CI, Tier B run manually per release and on the Android
cohort.

---

## Suggested order of work

1. **Phase 1** (A1–A5, Z1, Z2) — the visible artifacts. Small, contained,
   individually revertable.
2. **Phase 5 Tier A** (B1–B3a) — before touching the bake path again, so Phase 3
   is measured rather than reasoned about.
3. **Phase 4** — split the modules while behaviour is stable and tested.
4. **Phase 3** (W2, W3) — the worker's remaining structural cost.
5. **Phase 2** (O1, then maybe O2) — re-measure first; Z2 may have absorbed it.
6. **W4 revisit** — only if the bench says raster, not the prologue, dominates.

---

## What landed in this pass, and how to check it

| Change | Files |
| --- | --- |
| A1 `Tile.usable` + `invalidateKey` as the single invalidation door | `committedLayer.ts` |
| A2 stamp-before-invalidate on transform commit | `transformController.ts`, `renderEngine.ts` |
| A3 sub-tile dirty rects + partial stale overlay in `composite()` | `committedLayer.ts` |
| A4 outward-snapped fallback + overview destinations | `committedLayer.ts`, `worldOverview.ts` |
| A5 fixed tile-backed zoom floor | `rendering/zoomLevels.ts`, `input/gestures.ts`, `canvas/viewport.ts` |
| A6 batch-shared sync repair + adds replayed through the add path | `renderEngine.ts`, `committedLayer.ts`, `canvas/drawObjectManager.ts` |
| A7 `markStale` for additive adds | `committedLayer.ts`, `renderEngine.ts` |
| A8 style change: one merged invalidation, then one repair | `renderEngine.ts` |
| A9 erase undo/redo: changed-rect vs rebake-rect split | `renderEngine.ts`, `canvas/drawObjectManager.ts`, `history/erase.helper.ts` |
| A10 stale cross-tier fallbacks with hole punch, depth 3→5, vacated-region repair, `dropOtherTiers` after stamp | `committedLayer.ts`, `renderEngine.ts`, `transformController.ts` |
| A11 coverage is a partition, one source per pixel; shared-edge fragment snap | `committedLayer.ts` |
| A12 `getZoomLimits` tolerates a stale canvas | `canvas/drawObjectManager.ts` |
| Z1/Z2 ladder `[0.125 … 32]`, `overviewTier: 1` | `committedLayer.ts`, `canvas/drawObjectManager.ts` |

Guarded by 6 new cases in `committedLayer.test.ts` (stamped-tile compositing,
partial overlay, whole-tile edit, `markStale` showability, rect union,
`markAllDirty` dominance).

**Not verified in-app** — this environment cannot open a draw session (the
sandbox is backend-gated, as every prior review in `DRAW_ENGINE_PERF.md` notes).
On a device, the checks are:

1. **Move an object on a dense board.** The GPU drag layer should now vanish
   *instantly* on release with the tiles already showing the result — no blur,
   no shift, no wait for the bake. (Before: guaranteed blur, every time.)
2. **Undo/redo a stroke.** Only the stroke's own footprint should soften; the
   surrounding tile must stay sharp and must not move.
3. **Watch for white lines** during a bake pass and at tier changes.
4. `__drawPerf()`: `tileDrawMsMax` should be flat or lower (fewer overview
   composites), `compositeMsMax` up slightly on edit frames (the partial
   overlays), `longTaskMsMax` unchanged.
5. **Zoom out fully** on a lobby board — it should stop while the drawing is
   still comfortably readable, not at a 3% smear.

---

## Invariants this plan adds

Append these to `DRAW_ENGINE.md`'s invariant list when Phase 1 lands:

9. **`usable` and `fresh` are different questions.** `fresh` = "no re-bake
   needed". `usable` = "these pixels are safe to show". A stamp produces
   `usable && !fresh`; an invalidation produces `!usable && !fresh`. Never
   collapse them back into one flag.
10. **Anything that bumps a gen must say WHERE.** `markDirtyKey(key, rect)`
    records the sub-rect; passing `null` means "whole tile" and is always safe.
    A missing entry is treated as whole-tile dirty — never as clean.
11. **Never invalidate a region you are about to stamp.** The stamp bumps the
    gen itself. Pre-invalidating turns the fast path into dead code silently
    (this is how A2 hid for months).
12. **Composite destinations are integer-snapped, outward.** Fragments overlap;
    they never gap. A gap shows the background colour and reads as a defect.
13. **Batching may coalesce SCHEDULING, never the visual path.** An add batched
    with a removal is still an add: it must reach `onObjectAdded` and keep its
    stamp / live-overlay route. Flattening every seam into one rect list is
    what made undo/redo blur (A6).
14. **Additive edits use `markStale`, destructive edits use `markDirty`.** If
    the new content is topmost and source-over, the tile beneath is incomplete,
    not wrong — invalidating it trades a correct sharp picture for a blurry one.
15. **"Which tiles must re-bake" is not "which pixels changed".** They differ
    whenever an edit mutates objects that are much bigger than the edit (erase
    is the canonical case). Pass both — `markStale` the re-bake region,
    `markDirty` only the changed one.
16. **Never invalidate after repairing the same region.** Invalidate every
    footprint first, repair once at the end. Two seams have now shipped with a
    repair silently undone by the next line (A2, A8); assume the third exists.
17. **Composite coverage is a PARTITION, never a stack.** Exactly one source
    paints any given pixel. Tile content is semi-transparent wherever a stroke
    is, so two sources over one pixel double its alpha (0.45 → 0.70) and read as
    darker rectangles. Adjacent fragments therefore share bit-identical edges
    (floor both sides — never floor/ceil), and the overview fills only the
    regions no tile source claims.
18. **The object manager outlives the canvas.** It is a pinia singleton, and on
    re-entry gestures are wired before `init(canvas)` rebinds `c`. Anything
    reading `c` outside a seam must tolerate a disposed canvas.
19. **Never bake while a multi-step mutation is in progress.** A history op — or
    any scene edit spanning an `await` — must hold the engine's mutation window
    (`setMutating`). A bake landing between its yields rasterizes a torn scene
    and stores it as a FRESH tile, which nothing invalidates again: permanent
    wrong pixels, e.g. holes that survive an undo.
20. **Repair the region that changed, not the tile that contains it.** A tile is
    the cache granularity, not the edit granularity. `dirtyRects` already
    records where the edit was — use it. A full tile rebuild for a thin erase
    trail is 10-50x the necessary work on a dense board.
21. **A partial repair may only mark a tile fresh if it covered everything the
    tile owed.** `dirtyRects` is the record of what is owed; repaint the union
    of it and whatever the caller asked for, or decline. Storing a tile as
    current while an unrepainted region is still recorded produces permanently
    wrong pixels that no later invalidation will fix.
22. **A snapshot restored from history is not automatically valid.** It captures
    the state at capture time. Anything undone since (everything on the redo
    stack) must be re-subtracted before the object goes back on the canvas —
    otherwise restoring it silently re-applies an edit the user already undid.
