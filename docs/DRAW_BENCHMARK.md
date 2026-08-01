# Draw engine benchmark

The benchmark has two layers because they answer different questions.

## Tier A: deterministic regression gate

Tier A uses seeded scenes and scripted interactions. It records counts rather
than wall-clock time, so it stays stable across laptops and CI runners.

Run:

```sh
pnpm bench:check
```

The gate compares representative scene/scenario pairs with
`bench/baseline/algorithmic.json`. Workload metrics may increase by at most 5%.
A reduction passes. Update the baseline only when an intentional architecture
change explains the new counts.

Scenes:

- `pencil-500`: normal clustered drawing
- `watercolor-300`: expensive per-object raster work
- `mixed-lobby-2000`: large distributed multiplayer world
- `erased-heavy`: clip and erase pressure
- `sticker-mix`: text/image hybrid-render pressure

Scenarios are reusable driver scripts in `src/draw/benchmark/benchScenarios.ts`.
The counting driver is used by CI. The same interface is the seam for automated
real-canvas runs.

## Tier B: real browser or device

In development, open:

```text
/bench
```

The dashboard can launch a blank drawing or load a canvas URL. The drawing URL
contains `perf=1`, which opens the performance recorder.

1. Press **Start capture**.
2. Reproduce one behavior: pan, zoom, erase, undo/redo, or draw.
3. Press **Stop capture**.
4. Expand warning/critical metrics for their meaning and likely cause.
5. Copy or download the JSON before comparing another device or build.

Use one behavior per capture. A mixed session is harder to diagnose because a
single maximum may come from a different interaction than the visible problem.

## Reading results

- Frame p95 answers whether normal interaction feels smooth.
- Slow-frame rate answers how often visible jank occurs.
- Long-task max answers whether JavaScript blocked input.
- Composite max is the cost of assembling the current tile picture.
- Tile drawing max points toward GPU upload/fill pressure.
- Tile memory pressure shows cache eviction and bitmap-allocation risk.
- Visible tiles max explains unusually expensive composite passes.
- Fallback search max points toward tile lookup overhead.
- Local bake max is main-thread raster work.
- Overview build/patch max is zoomed-out fallback work.
- Serialization flush max is main-thread worker preparation.
- Worker bake max is worker queue plus raster round-trip.
- Refusal rate shows how much work cannot stay in the worker.
- Worker pauses and hard errors are health failures, not tuning signals.

The report includes device DPR, render DPR, hardware concurrency, memory hint,
user agent, and render backend. Compare timings only between equivalent device
and backend cohorts.

## Real canvas fixtures

Real drawings should supplement the seeded scenes. Keep network loading out of
Tier A. For repeatable release checks, store approved fixture JSON locally or
provide stable URLs to the `/bench` loader, then capture the same interaction on
desktop and the target Android devices.

Do not commit private user drawings. Sanitise ownership metadata and external
image URLs before turning a drawing into a repository fixture.

## JSON size versus resident path memory

The Ctrl+Shift+D canvas debugger reports these separately. **Serialized JSON
Footprint** is the save/sync payload produced by `canvas.toObject()`. Packed
pencil geometry deliberately keeps the existing `compressedTrace` schema, so
that number is expected to remain unchanged.

**Est. Resident Path Geometry** measures the representation held by live Fabric
objects. Compact paths use their typed-array byte lengths; ordinary Fabric paths
use a V8 object-layout estimate. **Est. Saved by Packed Paths** compares the live
representation with the estimated array-of-arrays equivalent. Nested group and
clip paths are included, and shared eraser geometry is counted once in resident
memory while its Fabric equivalent is counted once per clip clone. The estimate
is for relative comparisons rather than an exact whole-process heap measurement;
browser heaps, tile bitmaps, history, JSON mirrors, and GPU memory are separate.
