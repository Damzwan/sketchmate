# Drawing engine stability and memory audit

**Audit date:** 2026-08-01  
**Target:** Android Capacitor WebView  
**Scope:** `src/draw/**`, with the saved-drawing import path investigated first  
**Status:** First corrective pass implemented; device profiling and the remaining roadmap are open

## Executive conclusion

The tile-based renderer is directionally appropriate for SketchMate. An infinite,
zoomable, mostly-vector canvas should not repaint its complete scene graph on every
pan, zoom, or small edit. The existing engine correctly pursues a committed tile
cache, a low-resolution whole-world fallback, a small live-vector overlay, and a
persistent worker mirror.

The present stability problem is not “tiles are inherently wrong.” It is that the
renderer sits beside several other complete or near-complete representations of the
same drawing. During a large saved-object import the application can temporarily
hold:

1. the current live Fabric scene;
2. the parsed saved-drawing JSON;
3. the newly enlivened Fabric scene;
4. history JSON for the entire import;
5. the tile worker's raw JSON mirror;
6. the worker's enlivened Fabric-object LRU;
7. bitmap assets for raster-backed brushes;
8. overview, tile, selection, and Fabric canvas backing stores.

Several of those stores are bounded by object count rather than retained bytes or
pixels. A single object may be a three-point line or a multi-megabyte bitmap/clip,
so an object-count ceiling cannot provide an OOM ceiling.

The saved-object crash also contained concrete algorithmic defects: duplicate
renderer registration left duplicate quadtree entries; large imports constructed
two scene-sized `ActiveSelection`s; and z assignment copied/scanned the full Fabric
stack per appended object. These have been corrected in the first pass.

### Recommendation

Keep the tile architecture for now. Prioritize import peak memory, raster-brush
backing stores, history bytes, and worker-mirror bytes before considering a renderer
rewrite. The long-term architecture should be a **chunked document model feeding the
existing tile renderer**, so off-screen objects can remain compact records instead
of live Fabric instances.

## Current rendering architecture

```text
Persisted / remote JSON
        |
        v
Main Fabric scene ──> object map + quadtree + explicit z
        |                         |
        |                         +──> whole-world overview
        |                         +──> visible tile queries
        |                                      |
        |                                      v
        |                              committed ImageBitmap tiles
        |
        +──> history / sync serialization
        |
        +──> tile-bakery deltas ──> worker JSON mirror
                                           |
                                           +──> worker Fabric-object LRU
                                           +──> transferred bitmap assets
```

The tile store bounds tile bitmaps, but it does not bound the main Fabric scene,
history, source JSON, worker live objects, raster-brush canvases, or erased-object
clip masks. Those are the dominant remaining heap/graphics-memory risks.

## Saved-object import failure analysis

The original `addSavedFabricObjectToCanvas` path performed the following:

1. Fetch and parse the entire saved drawing.
2. Enliven all objects off-canvas while retaining their source JSON for the worker.
3. Build an `ActiveSelection` over all objects to scale and center them.
4. Add each object to Fabric.
5. The permanent renderer `object:added` listener registers, serializes, indexes,
   and invalidates every object.
6. Manually call `registerAddedObjects(objects)`, repeating step 5.
7. Emit `objects:added`, synchronously serializing all objects for history and,
   in rooms, stringifying them for sync.
8. Build another `ActiveSelection` over all objects to select the result.
9. Background worker flushing structured-clones and stringifies the imported JSON,
   then begins enlivening objects again for tiles.

### Confirmed defects corrected in this pass

#### DRAW-01 — Duplicate renderer registration and stale quadtree entries

**Severity:** P0  
**Effort:** S  
**Status:** Fixed

`actionWithoutEvents()` suspends named tool/history/sync services, but permanent
renderer listeners intentionally remain attached. Therefore `c.add(obj)` already
called `onObjectAdded`. The explicit `registerAddedObjects(objects)` registered each
object again.

`addToQuadTree` replaced the entry in `entryMap` without removing the previous
entry from the tree. Queries could return the same logical object multiple times,
causing repeated rasterization and persistent CPU inflation after the import.

The redundant registration has been removed and quadtree insertion is now
idempotent as a defensive invariant.

#### DRAW-02 — Scene-sized ActiveSelection work during import

**Severity:** P0  
**Effort:** M  
**Status:** Fixed

Fabric's `ActiveSelection` synchronously enters every child into a group, rewrites
transforms, runs layout, and later reverses the operation. This is not interruptible
and scales poorly into thousands of objects.

Import placement now computes bounds in yielded slices and applies one equivalent
uniform affine transform directly to each detached object. Imports are rejected
above 200 objects (or the payload byte ceiling), and every supported import is
wrapped in `ActiveSelection` only after placement and commit so it remains selected.

#### DRAW-03 — O(N²) z assignment during append

**Severity:** P0  
**Effort:** XS  
**Status:** Fixed

Every appended object called `Canvas.getObjects()`, which copies the complete stack,
then searched it to learn that the object was last. Importing N objects onto an
existing scene therefore allocated and scanned roughly O(N²) stack entries.

The z-index receives the internal stack as a read-only view and its existing tail
fast path now makes ordinary append O(1) per object. The import commit also yields
between slices while renderer invalidation remains batched.

## Resident-memory model

These are independent ceilings; they must not be mistaken for one aggregate limit.

| Resident component | Current bound | Risk |
| --- | ---: | --- |
| Fabric lower + upper canvases | viewport × capped DPR × 4 bytes each | Bounded, but paid continuously |
| Tile bitmaps + tile canvas pool | device profile, approximately 24–72 MB before internal deductions | Explicitly bounded |
| World overview | 768²–2048² RGBA, plus a temporary canvas while rebuilding | Explicitly bounded |
| Transform/selection/vacated bitmaps | area/dimension profile, more than one may coexist | Bounded individually, not as one aggregate |
| Main Fabric objects | complete scene | Unbounded |
| Parsed document/import JSON | complete source until references clear | Documents remain unbounded; saved imports are 4 MB solo / 512 KB room |
| History | 400/1200 retained-object weight, minimum five actions | Bulk import is ID-only until undo; other actions remain byte-estimated |
| Worker raw JSON mirror | 24/48/96 MB, trimmed after idle | Burst can exceed cap before idle trim |
| Worker live Fabric LRU | 2,048/8,192 objects during work | **Byte-unbounded** |
| Worker bitmap assets | 24 MB mobile / 64 MB desktop | Explicitly bounded |
| Raster-backed brush element | stroke bounding box × supersample × 4 | **Pixel-unbounded** |
| Flattened erase masks | 4 MP per object; 8 MP mobile / 32 MP desktop per session | Aggregate-bounded |
| Retained baked erase strokes | 64 per object; 2,048 mobile / 8,192 desktop per session | Aggregate-bounded and pruned with history |

## Prioritized remaining findings

### DRAW-04 — Bulk import creates and retains a scene-sized history payload

**Status:** Main-thread fix implemented

**Severity:** P0  
**Effort:** M  
**Pull level:** 1

The `objects:added` history handler calls `toJSON(targets)` synchronously and retains
the result for redo. The history weight is object-count based, and `MIN_ACTIONS = 5`
means one multi-thousand-object import is retained even when it exceeds the nominal
budget by itself.

In a room, the sync handler serializes the same array and `emitDrawSyncingEvent`
performs an atomic `JSON.stringify` before rejecting payloads over 0.6 MB. A large
import therefore pays the dangerous work before learning that the operation cannot
be sent.

The saved-import event now records object IDs only. If the user reaches that undo,
the exact object snapshots are serialized one at a time with frame yields before
the objects are removed; that materialized snapshot becomes the redo payload.
Every saved import is rejected above 200 objects or 4 MB before Fabric enlivening;
collaboration rooms use a tighter 512 KB source ceiling for the live-sync format.

**Remaining:**

- Enforce history by estimated bytes as well as object count. A single action above
  the hard byte ceiling must not be protected by the five-action floor.

### DRAW-05 — Raster-backed brushes allocate monolithic, pixel-unbounded canvases

**Severity:** P0  
**Effort:** L  
**Pull level:** 1

Neon, Crayon, and Spray regenerate one canvas covering the complete stroke bounding
box at `TEXTURE_SUPERSAMPLE`. A sparse 5,000 × 5,000 diagonal stroke at 2× requires
100 million RGBA pixels, approximately 400 MB, before Fabric/worker copies. These
objects also retain their point/dot traces, so vector/procedural data and raster
pixels coexist.

This is a strong explanation for “either drawing loads alone, combining them
crashes”: the second drawing regenerates its monolithic brush rasters while the
first drawing, its tiles, and the worker are already resident.

**Action:**

- Add an immediate per-object pixel/dimension guard for old and new content.
- Degrade safely by lowering supersampling when the requested area exceeds the
  device profile.
- Replace monolithic stroke rasters with fixed-size sparse chunks (for example,
  256–512 px cells) or render the procedural trace directly into requested tiles.
- Pack Spray/Crayon/Neon point data into typed arrays; do not retain thousands of
  `{x,y,...}` objects.
- Include requested raster pixels in enliven complexity so 16 large bitmap strokes
  are never regenerated concurrently.

### DRAW-06 — Worker live-object memory is count-bounded, not byte-bounded

**Severity:** P0  
**Effort:** M  
**Pull level:** 2

The tile worker can retain 2,048 live Fabric objects on a constrained mobile device.
That may be cheap for short pencil lines but enormous for raster strokes, groups,
images, or deep clip paths. Its raw JSON cap is applied only after a 30-second idle
timer, allowing a load/import burst to exceed the intended ceiling.

**Action:** Track estimated bytes for raw JSON, live geometry, clip children, and
assets. Evict during ingestion/bake, not only after idle. Use both an object cap and
a byte cap. Make the active working-set target respond to Android memory-pressure
signals when that bridge is added.

### DRAW-07 — The main thread always hydrates the complete scene

**Severity:** P1  
**Effort:** XL  
**Pull level:** 4

Tiles bound rendered pixels but every document object remains a live Fabric instance
on the main thread and is duplicated as compact JSON/live objects in the worker.
Consequently, steady-state memory still grows with total document complexity even
when almost all content is off-screen.

**Action:** Introduce a canonical, compact document-record layer keyed by object ID
and spatial chunk. Keep bounds, z/layer, type, and compact serialized geometry in the
record. Hydrate Fabric objects for the viewport, selection, interaction halo, and
active history operations; dehydrate settled off-screen objects. Feed records/deltas
to the existing worker and tile renderer. This is the highest-value long-term change
and is preferable to discarding tiling.

### DRAW-08 — Full erase snapshots and restores the whole canvas atomically

**Status:** Resolved on the main thread

**Severity:** P0  
**Effort:** M  
**Pull level:** 2

Solo full erase calls `canvas.toJSON()` synchronously, retains the full snapshot in
history, and undo uses `canvas.loadFromJSON()`. This can create the same main-thread
and heap spike as saved import.

Solo full erase now detaches and retains the existing Fabric instances as its undo
payload. It performs no `canvas.toJSON()` and undo performs no `loadFromJSON()`;
restoration re-adds the objects through a batched, time-sliced loop.

### DRAW-09 — Source images are visually scaled but not decoded/downsampled

**Status:** Resolved

**Severity:** P0  
**Effort:** S–M  
**Pull level:** 1

`addImageToCanvas` scales a Fabric image to 256 world units but keeps the original
decoded source. A 12–48 MP photo may therefore retain tens or hundreds of megabytes
while appearing small. Imported saved drawings can contain the same sources.

New image insertion now downloads and decodes the source only long enough to render
it into a maximum 256 px scratch canvas, encodes the bounded result as WebP, closes
the original bitmap, and gives Fabric only the resized source. During legacy draft
and saved-object enlivening, old full-resolution Fabric image elements are similarly
replaced with bounded WebP elements while their world-space geometry is preserved;
downstream serialization receives the bounded source.

### DRAW-10 — Eraser compaction is bounded per object, not per session

**Status:** Resolved for the current compaction representation

**Severity:** P1  
**Effort:** M–L  
**Pull level:** 3

Each heavily erased object may own a flattened mask up to roughly 4 MP and retain up
to 400 off-tree stroke objects for undo. Applying the cap independently to many
objects permits a very large aggregate. Serialization of a canvas-backed mask can
also create a large base64 string.

Compaction now enforces a session-wide pixel budget (8 MP mobile, 32 MP desktop)
in addition to the 4 MP per-object ceiling. Off-tree undo vectors are pruned as
soon as their history action expires and are capped at 2,048 mobile / 8,192 desktop
per session. If compaction cannot fit without discarding undoable geometry it is
skipped and the live vector clips remain authoritative.

### DRAW-11 — Bucket fill has a high transient-memory peak

**Severity:** P1  
**Effort:** M  
**Pull level:** 3

The mobile escalation reaches 2,048²: approximately 16.8 MB for the scratch canvas,
another 16.8 MB for `ImageData`, plus worker scan state and contour arrays. Peak
memory is substantially higher than the comment's single-buffer estimate. Main-thread
Fabric rasterization of all intersecting objects occurs before transfer.

**Action:** Use the device memory profile to cap escalation; release/zero the source
canvas immediately after transferring `ImageData`; reuse buffers where practical;
and add peak-byte metrics. Consider a lower-resolution retry with barrier dilation
before allocating the 2,048² level on constrained devices.

### DRAW-12 — Selection and lasso can still construct unbounded ActiveSelections

**Severity:** P1  
**Effort:** S–L  
**Pull level:** 2

Saved import is now capped, but lasso can select every intersecting object and then
synchronously construct an `ActiveSelection`. Selection prewarming adds a transform
bitmap and may re-render many children.

**Action:** Apply a safe mobile selection cap immediately. Longer term, represent a
large selection as an ID set + aggregate transform proxy, applying the final matrix
to members in yielded slices rather than grouping every Fabric object.

### DRAW-13 — Import/load complexity ignores decoded pixels and several deep graphs

**Severity:** P1  
**Effort:** M  
**Pull level:** 2

The enliven scheduler accounts for path length, watercolor complexity, and nested
objects. It does not adequately price bitmap dimensions, base64 payloads, clip depth,
procedural raster regeneration, or a single pathological object. Yielding between
batches cannot interrupt one object's `fromObject` implementation.

**Action:** Add a preflight document budget: source bytes, object count, total path
coordinates, total requested decoded/raster pixels, maximum group/clip depth, and
maximum single-object cost. Reject or degrade before enlivening. Feed this estimate
into batch selection so large objects run alone.

### DRAW-14 — Saved import is not session-cancellable

**Severity:** P1  
**Effort:** S–M  
**Pull level:** 2

Document initialization is cancellable, but a saved-object fetch/enliven/layout/
commit does not own a session abort signal. Exiting during import can allow a late
continuation to touch a disposed canvas. Starting a second import can overlap the
first.

**Action:** Give each import an `AbortController`, cancel the previous import, and
register it with draw-session teardown. On cancellation during a yielded commit,
roll back the subset already added inside the same renderer batch.

### DRAW-15 — Tile effectiveness depends on worker compatibility and scene content

**Severity:** P2  
**Effort:** Measurement first  
**Pull level:** 1 instrumentation, later implementation

The worker/hybrid system is sophisticated and the tile store has a real byte budget.
Its value falls when tiles contain unsupported/interleaved images, groups, image
clips, or unavailable fonts. Local fallback is bounded for safety, which can leave
overview pixels visible longer rather than crash; that is preferable but may feel
slow.

**Action:** Make decisions from `__drawPerf()` field data. Track worker remote/hybrid/
refusal rates, local bake maximum, worker live/raw estimated bytes, tile churn, and
long-task attribution for representative documents. Do not tune tile size or cache
budget without measuring GPU texture churn and cache hit rate together.

## Is the tile approach the best option?

### Keep it when

- drawings are much larger than the viewport;
- users pan/zoom frequently but edit a small local region;
- vector rerender cost per visible region is high;
- sharpness at multiple zoom levels matters;
- the tile cache, worker mirror, and invalidation remain byte-bounded.

### It becomes counterproductive when

- the document is mostly a few already-rasterized full-scene images;
- most tiles always fall back to main-thread rendering;
- edits invalidate nearly the whole board continuously;
- worker scene duplication costs more memory than it saves CPU;
- bitmap churn causes more GPU pressure than direct rendering.

### Decision for SketchMate

Do not replace tiling yet. The code already avoids full-scene repaint during normal
interaction and bounds tile pixels. Replacing it with ordinary Fabric rendering
would reintroduce O(visible scene) work on every frame and would not solve live
object/history/raster-brush memory.

The best long-term form is:

```text
compact chunked document records
        ├── hydrate small interactive Fabric working set
        ├── feed tile worker by spatial chunk/revision
        └── persist/history through structural deltas
```

This retains the tile renderer's strengths while eliminating the full scene graph
duplication that currently dominates memory.

The active optimization track is main-thread rendering. New worker architecture,
worker cache redesign, and viewport hydration are deferred; the immediate pulls
must remain correct and bounded without depending on a worker backend.

## Diagnostic Android build

Use `pnpm build_android_test` for profiling builds. It sets
`VITE_DRAW_TESTING=si`, emits source maps for `chrome://inspect`, and configures a
separate Sentry `*-draw-testing` environment with 100% tracing/session profiling,
SDK debug logs, browser long-task/long-animation-frame instrumentation, and the
saved-import phase spans. The Sentry SDK is code-split and initialized before Vue
mounts; failure to initialize monitoring does not prevent app startup.

Normal `pnpm build_android` keeps production sampling and does not emit source maps.
Browser profiling depends on the Android WebView exposing the JS Self-Profiling API;
transactions, spans, breadcrumbs, JS errors, and native ANR capture do not depend on
that optional browser profiler.

## Pull sequence

| Pull | Contents | Size | Expected outcome |
| --- | --- | --- | --- |
| 1 | Import duplicate/O(N²)/ActiveSelection fixes; image pixel cap; import preflight metrics; raster request guard | M | Stops known import explosions quickly |
| 2 | Byte-budgeted history; bulk-add ID-only undo; yielded full erase; cancellable import; lasso cap | M–L | Removes scene-sized main-thread/history spikes |
| 3 | Session-wide bucket budget and legacy image migration | M | Completes aggregate main-thread ceilings |
| 4 | Chunk Neon/Crayon/Spray rasters; pack traces; compact Watercolor/Calligraphy resident geometry | L–XL | Large reduction in resident and import memory |
| 5 | Chunked canonical document + viewport hydration | XL | Makes main-scene memory scale with working set, not whole board |

## Device validation protocol

Use the same saved drawing for every cohort and test at least:

- pencil-only vectors;
- Neon/Crayon/Spray long diagonal strokes;
- watercolor/calligraphy-heavy content;
- repeated erases and flattened clips;
- high-resolution images;
- a mixed real user drawing;
- importing a drawing into a scene of comparable size.

For each test:

1. Record `__drawBackend()` and a baseline `__drawPerf()` snapshot.
2. Record Android process memory before load, after load, after import, after 30 s
   idle, and after route exit using `adb shell dumpsys meminfo ninja.sketchmate.app`.
3. Record `performance.memory.usedJSHeapSize` where the inspected WebView exposes it.
4. Capture `__drawPerf()` after import and after pan/zoom/edit.
5. Keep `__setDrawBackend("main")` fixed for the current implementation track.
6. Repeat the import/exit cycle ten times and verify memory returns to a stable band.

### Release gates

- No import or full-erase main-thread task should approach the Android five-second
  ANR window; target under 50 ms per interruptible slice and investigate any task
  above 100 ms.
- Import peak resident memory must have a defined device-class ceiling and must not
  exceed it for the supported document budget.
- Tile, worker raw JSON, worker live objects, bitmap assets, transform buffers,
  history, and erase masks must each report bytes and an aggregate estimate.
- Cancelling import or leaving the route must stop all remaining work and return
  workers/canvases to the non-drawing baseline.
- Sentry events for OOM/ANR must include draw backend, object count, source bytes,
  raster pixel estimate, history estimate, worker estimates, and the last draw phase,
  without attaching drawing content.
