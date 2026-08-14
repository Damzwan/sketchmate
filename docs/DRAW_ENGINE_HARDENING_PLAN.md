# Draw engine hardening — ANR, crash, parallelism

*Written 2026-08-14, from the `20:29:41` SIGABRT and its attached metrics
snapshot. Companion to [`DRAW_ENGINE_PERF.md`](./DRAW_ENGINE_PERF.md), which
covers the 0.4.3 cohort; this doc is the follow-up pass over the WHOLE engine.*

---

## What the field data actually says

```
loafBlockingMsMax   459.2      longTasks 93 over 1412 s
longTaskMsMax       373
tileMB / tileLimit  64.89 / 65.17     tilePressure 0.88 sustained
tileCountMax        266
lastPhase           overviewPatch 0.3 ms, ageMs 445
```

Two independent problems, and it matters that they are independent:

**The blocks are not in the renderer.** The largest recorded draw phases are
`erasedSweep` 385.8 ms, `overviewBuild` 210.4 ms and `localBake` 128.7 ms — and
all three are WALL CLOCK across a yielded loop, not blocks (`erasedSweep` wraps
`drainCleanup`, which yields on an 8 ms budget; `overviewBuild` and `localBake`
say so in their own comments). The genuinely blocking numbers are
`loafBlockingMsMax 459.2` and `longTaskMsMax 373`, and `lastPhase` was 445 ms
stale when they were sampled — i.e. **the long tasks happen outside every
instrumented draw phase.** Anyone chasing `erasedSweep` because it is the
biggest number in the snapshot is chasing the wrong thing.

**The crash is GPU allocator lifecycle.** `scudo::reportInvalidChunkState` ←
`scudo::Allocator::deallocate` ← `libGLESv2_adreno`, on Android's HWUI
RenderThread (`libhwui` … `android::Thread::_threadLoop`), entered through
`libwebviewchromium_plat_support`. Invalid chunk state on free = double free or
a free/use race inside the driver. It is reached while the tile cache sits
**pinned at 100 % of its budget** (64.89 of 65.17 MB), which means every single
bake evicts, so every bake is one texture allocated and one destroyed, forever.

---

## Findings, ranked

### F1 — Room snapshot serializes and gzips on the main thread  ·  P0 · ANR

`service/api/socket/drawRoomHandlers.socket.ts`, `request-canvas-state`:

```ts
const canvasString = JSON.stringify(createRoomCanvasSnapshot(canvas));
const stream = new Blob([canvasString]).stream()
  .pipeThrough(new CompressionStream("gzip"));
```

Three un-yielded blocks in a row, sized by the whole board:

1. `canvas.toJSON()` over every object (erased objects drag their whole
   clipPath group through it),
2. one `JSON.stringify` of the result,
3. `CompressionStream` — piped from the main thread, and this project's own
   `service/draftGzip.worker.ts` exists precisely because "`CompressionStream`
   does its deflate synchronously per chunk on whatever thread pumps it".

The server asks for this on a timer: **six snapshot PUTs inside the ten minutes
of the crash trail.** That is the shape of `longTasks: 93` with nothing in
`phaseMsMax` to account for it.

Everything needed to fix it already exists and is already used by the draft
path — `generateChunkedJSON` (yields per object), `documentJsonToBlob` (yields,
and never builds one giant string), `gzipBlob` (worker, with inline fallback).
The room path simply never adopted them.

**Status: fixed.**

### F2 — Tile cache pinned at 100 % ⇒ texture alloc/free on every bake  ·  P0 · crash

`tilePressure 0.88` is the *sampled* figure; `tileMBMax` equals `tileLimitMB` to
within 0.3 MB. A steady state at the limit means `reserve()` runs an eviction
for every tile stored, and each cycle is `transferToImageBitmap()` (allocate a
texture) plus `close()` (destroy one). Under undo spam — 40 undo clicks in the
trail — each undo invalidates the edited region at all nine tiers, so the churn
rate is multiplied again.

That is the documented Adreno texture-lifecycle cohort, and it is the only thing
in the session touching GPU allocation at that rate.

Two changes, neither of which reduces what the user can see:

- **Recycle instead of reallocate.** A canvas-backed tile is stamped in place
  and its surface returns to the pool on eviction; a bitmap-backed one cannot
  be, so it costs the driver an allocate and a free. The hot set was capped far
  below the viewport working set, so almost every visible tile took the
  allocating path. Raising the cap only helps if the POOL can actually hand the
  canvases back — `poolMax` below `hotTileMax` just moves the churn from
  bitmaps to canvases.
- **Do not sit at the limit.** Trim stale, far-from-active tiles when the engine
  goes idle, so the cache runs with headroom and a bake does not have to evict
  to store. Idle trimming is free; evicting on the critical path is not.

**Status: fixed.**

### F3 — `erasedSweep` 385.8 ms is NOT a block  ·  documentation only

`drainCleanup` yields on an 8 ms budget and backs off entirely during a
transform session. The number is the wall clock of the whole drain, which spans
many frames by design. Recorded here so the next reader does not re-derive it.

### F4 — `eraseCommit` 72.6 ms is NOT a block either  ·  correction

`enqueueEraseCommit` wraps `await work()`, so like F3 this is wall clock across
a chain that already yields to the main thread between commits. Recorded here
because an earlier revision of this document called it synchronous; it is not.

### F7 — Per-object instrumentation cost more than the renders  ·  P1 · low-end CPU · **fixed**

`recordRenderObject` looked cheap, and per PHASE it is. Per OBJECT it is not: two
`performance.now()` reads at the call site plus a third inside `recordPhase` (for
`lastPhaseAt`), around a Fabric render that is frequently tens of microseconds —
run once per object PER TILE. A dense board hands one tile a few thousand objects
and a bake pass covers ~40 of them; the overview build visits every object on the
board in one pass; `documentSerializeObject` now also runs on every room snapshot
(F1). That is six figures of clock reads per pass, on the exact devices this
instrumentation exists to protect.

Fixed by sampling: `shouldTimeRenderObject()` gates the clock reads at 1-in-31 on
mobile, 1-in-7 elsewhere, from one shared counter. `phaseMsMax` and
`slowestRenderObject` are extreme-value statistics and survive sampling; the
per-object `Total`/`Count` become samples and are labelled as such.

The stride is PRIME deliberately. A 512-iteration test of two sites interleaving
in lockstep showed an even stride aliasing perfectly against them and starving
one site of samples entirely.

### F8 — The tile bakery worker is still off by default  ·  P1 · biggest remaining parallelism win

`getDrawRenderBackend()` returns `"main"` unless a query parameter or
localStorage opts in, so every tile rasterizes on the main thread — which is why
every finding above is about that path. The worker's own P0 blockers are all
marked fixed in `DRAW_ENGINE_PERF.md` (F1 flush, F2 self-disabling, F3 refusals).

Not flipped here: the field snapshot has `backend: "main"`, so `refusalRate: 0`
and `localFallbacks: 0` are trivially zero and say nothing about how the worker
would behave on that device. Enabling it needs a measured cohort, not a guess.

### F5 — Lobby thumbnail export  ·  P2

`request-lobby-thumbnail` → `exportBoundingBoxImage` → `exportWithMainThreadChunking`,
which is chunked and yields. Lower risk than F1, but it renders the whole board
on demand and could move to the existing preview worker.

### F6 — Parallelism still on the table

- The tile bakery worker exists and is **off by default** (`renderBackend` is
  `"main"` unless a query param or localStorage opts in). Everything above is
  about the main-thread path because that is what ships.
- `canvas.toJSON()` per object is the single biggest remaining main-thread cost
  in both the snapshot and draft paths. The worker mirror already keeps a
  serialized copy per object; a snapshot could be assembled from it instead of
  re-serializing.

---

## Order of work

1. **F1** — snapshot off the main thread. Highest confidence, lowest risk.
2. **F2** — stop the texture churn.
3. **F7** — stop paying for instrumentation on low-end. Done.
4. **F8** — enable the worker for a measured cohort. Biggest remaining win,
   and the one that needs field data rather than reasoning.
5. F5/F6 — opportunistic.
