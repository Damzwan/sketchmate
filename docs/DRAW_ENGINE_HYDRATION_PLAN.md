# Viewport-bounded hydration — implementation plan

*Written 2026-08-14. The concrete "how" for the record model sketched in
[`DRAW_ENGINE_FABRIC_DECISION.md`](./DRAW_ENGINE_FABRIC_DECISION.md) phases 2-3,
grounded in the symbols that exist in this repo today.*

**Goal:** steady-state object memory proportional to what the user is
interacting with, not to total drawing size.

**Non-goal:** removing Fabric. Fabric stays the renderer and the interaction
system. What changes is *how many live instances exist at once*.

---

## Read this first: the case against doing it yet

Hydration is the largest change on the table and the only one whose payoff is
unmeasured. Everything else in `DRAW_ENGINE_HARDENING_PLAN.md` was justified by
a number from the field. This is not, yet.

The specific risk is that it makes low-end **worse**. Enlivening is expensive —
`enlivenObjectsTimeSlivered` exists because doing it in bulk blocked the main
thread — so a hydration cache that thrashes pays that cost repeatedly, on the
devices least able to afford it, to save memory that may not have been the
binding constraint. The tile cache is bounded, the overview is bounded, the
brush rasters are now bounded. The live object graph is the last unbounded
thing, but "unbounded" is not the same as "dominant".

**So Stage 0 is not optional, and its exit criterion is a number.**

---

## Stage 0 — measure the thing before rewriting it

Add to `DrawMetricsSnapshot`:

- `sceneObjects` — `canvas.getObjects().length`.
- `sceneObjectsVisible` — what `index.query(viewportRect)` returns.
- `sceneRetainedBytesEstimate` — sum over objects of a cheap structural
  estimate: path command count, group child count, clipPath child count. The
  same fields `slowestRenderObject` already collects, so the walk is known-cheap
  and can reuse `shouldTimeRenderObject`-style sampling.

**Exit criterion:** field data shows `sceneObjects` routinely far exceeding
`sceneObjectsVisible` *and* the estimate is a material share of the renderer
process budget. If visible/total is typically > 1/3, stop — the ceiling on the
win is too low to justify the risk.

This is a day of work and it decides whether the rest happens.

---

## What already helps, and what actually blocks this

The index is **already ID-keyed and already carries bounds**, which is most of a
record store:

- `InfiniteQuadtreeManager` entries are `{ id, bounds }`, not object references
  (`spatialIndex.ts` → `queryObjects` maps `entries[i].id` through `objectMap`).
- `ExplicitZIndex` keys `byId: Map<string, number>`; `byObject` is a derived
  cache.
- `serializeAtRevision` already memoizes each object's JSON per mutation
  revision — a record store is close to free to populate.

Four things genuinely require a live Fabric instance:

1. **Tile rasterization** — `isolatedTileRenderer(ctx, obj, …)` calls
   `obj.render(ctx)`.
2. **Hit-testing and transforms** — fabric's own machinery, over
   `canvas._objects`.
3. **`canvas.getObjects()` as the document** — `zIndex.assignOnAdd` reads it for
   neighbour z, `rebuildIndexFromCanvas` walks it, export walks it, claimed-area
   enforcement walks it.
4. **Erase** — an erased object carries a `ClippingGroup` clipPath; merged art is
   a `Group`. Neither dehydrates to a compact record cheaply.

(3) is the one that makes this a real project rather than a patch.

---

## Stage 1 — records alongside the live graph, zero behaviour change

Add `src/draw/objects/recordStore.ts`:

```ts
interface SceneRecord { id: string; json: any; revision: number; layerId: string; }
```

- Populate on `object:added` and on index rebuild, from `serializeAtRevision`.
- Invalidate on mutation via the existing `objectMutationRevision`.
- The live Fabric object remains the source of truth. The store is a shadow.

Ship this on its own. It is observable only as memory (records duplicate JSON
that `serializeAtRevision` was already caching, so the delta should be near
zero) and it de-risks everything after it.

**Verify:** a test that record and live object agree after add / modify / undo /
remote sync, and that the store empties on `detach()`.

---

## Stage 2 — move consumers off the live graph

One consumer per PR, each independently revertable. In dependency order:

1. **z-index** — `assignOnAdd` currently needs `canvas.getObjects()` for
   neighbour z. Give the record store an ordered view so it can answer
   "what is below/above this id" without fabric's array.
2. **Serialization / snapshot / draft** — `generateChunkedJSON` iterates
   `canvas.getObjects()` and calls `serializeAtRevision`. Point it at records;
   it then no longer needs a live object at all, which also removes the last
   whole-scene walk from the room snapshot path.
3. **Claimed-area enforcement and layer queries** — already ID/bounds shaped.
4. **Export and thumbnails** — keep on the live graph for now; they are rare and
   already chunked.

After Stage 2 the only whole-scene consumers left are rendering and interaction.

---

## Stage 3 — bounded hydration cache

`objectMap.get(id)` becomes `hydrate(id)`:

- Backed by an LRU over live instances, bounded by **count and estimated bytes**
  (both, for the reason `drawMemoryProfile` gives: a count is not a bound on
  cost).
- **Hysteresis is mandatory.** Evict only well outside the viewport, and never
  an object that is selected, in-flight in the live layer, or referenced by the
  top N history entries. Thrash here is the failure mode that makes low-end
  worse, not better.
- Hydration is **async** (`enlivenObjectsTimeSlivered`). The bake loop already
  awaits and yields per object, so it can await hydration — this is the property
  that makes the whole design viable, and it is already true today.
- Cold path: the compositor must never *block* on hydration. A tile whose
  objects are not resident falls back to the coarser tier exactly as it does for
  an unbaked tile, and sharpens when the bake completes. The fallback ladder
  already does this; hydration just becomes another reason a tile is not ready.

**Verify:** the settle probe pattern from the tile work — drive real bake passes
over a scene larger than the hydration budget and assert the engine reaches a
settled state rather than oscillating. Cache thrash and tile thrash have the
same signature.

---

## Stage 4 — shrink `canvas._objects` to the interactive set

Only now does fabric's array stop being the document.

- Objects enter `canvas._objects` when hydrated, leave when evicted.
- `renderOnAddRemove: false` is already set, so add/remove does not repaint.
- Hit-testing already goes through `overrideFindTarget` and the spatial index
  (`fabricInteractions.ts`), so it queries the index, not fabric's array — this
  is the reason the override exists and it pays off here.
- **Selection is the sharp edge.** A selection can name objects that are not
  hydrated; it must be an ID set with hydration on demand, which is the same
  change finding #3 (unbounded `ActiveSelection`) wants anyway. Do them
  together — neither is sane alone.

---

## Erase and merged groups

Handle explicitly rather than discovering it in Stage 3.

- An erased object's `ClippingGroup` is part of its identity; the record must
  carry the clip as nested JSON and rehydrate it with the object. It is already
  serialized this way for sync, so the wire format exists.
- A merged `Group` is ONE index entry with a union bbox. It is also the object
  most expensive to enliven. Groups should be **pinned** in the hydration cache
  while any part of their bbox is near the viewport, rather than evicted and
  re-enlivened.

---

## Order, and where to stop

1. **Stage 0.** Measure. Gate everything else on the number.
2. Stage 1 — records as a shadow. Safe, independently useful (it removes the
   last whole-scene walk from the snapshot path in Stage 2).
3. Stage 2 — consumers, one PR each.
4. **Reassess.** Stages 1-2 alone may deliver enough — they remove whole-scene
   walks from serialization without touching residency at all.
5. Stages 3-4 only if Stage 0's number still justifies them, and only with the
   selection rework bundled in.
