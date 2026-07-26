# Draw engine — ANR / crash remediation plan

Companion to [`DRAW_ENGINE.md`](./DRAW_ENGINE.md). That doc says *how the engine
works*. This one says **why 0.4.3 still ANRs and crashes on Android, what to fix,
and in what order.**

> Scope: build **136 / 137 (0.4.3)** signatures only. The 0.4.2 (125) entries
> (Compose `FontFamilyResolver`, `Keyboard$1.onEnd` NPE) are separate, not draw
> engine, and are excluded.

*Written 2026-07-24. Branch `enginev2`.*

> **Status — P0 shipped, P1 mostly shipped.** See
> [Progress](#progress) for exactly what landed, what was measured, and what is
> still open. Findings below are kept in their original form so the reasoning
> stays readable; each fixed one is marked ✅ with a pointer to the change.

---

## TL;DR

The worker offload landed and it is the right architecture, but **three things
keep the main thread and the GPU on the hook**:

1. **The bake path still does unbounded synchronous serialization on the main
   thread.** `bakeryBakeTile` calls `flush()` per tile, which drains the *global*
   dirty set (up to 192 `toJSON()` + one structured clone) *inside* an
   un-yieldable stretch of the bake loop. This is almost certainly the "lag when
   an actual tile changes" you are feeling.
2. **The worker silently and permanently disables itself after 3 timeouts** —
   and a slow first bake produces 4 concurrent timeouts. Once dead, every tile
   bakes on the main thread for the rest of the session. Users in that state are
   running strictly worse than the pre-worker build. Prime ANR candidate.
3. **A tile containing any text / image / group / hidden object is refused
   wholesale** and falls back to the main-thread renderer. On a real board that
   is most tiles. The worker is helping much less than it looks like it is.

Separately, the crash signatures are **GPU-driver**, not JS: `libGLESv2_adreno`
/ `libgsl` SIGSEGV + "Unresponsive GPU" is tile-texture churn and uncapped DPR
fill rate, not a slow `for` loop.

And `minifyEnabled false` in `android/app/build.gradle` is the vitals warning —
one line, unrelated to the ANRs, free to fix.

---

## Reading the 0.4.3 signatures

| Signature | What it actually means | Suspected driver here |
| --- | --- | --- |
| `__futex_wait_ex` + Input dispatching timed out + **Unresponsive GPU** + Native lock contention (×5, ~40% of ANR volume) | The UI thread is blocked waiting on a lock held by the render/GPU thread. The GPU work queue is backed up. | Tile bitmap create/destroy churn → texture allocation storms; full-canvas clear+fill at uncapped DPR every frame. |
| `MessageQueue.nativePollOnce` + Input dispatching timed out | Classic "JS/main thread busy, no message pumped in time". | The synchronous `flush()` / `toJSON()` inside the bake loop; main-thread fallback bakes after the bakery shuts itself down. |
| `art::ConditionVariable::WaitHoldingLocks` + Unresponsive GPU | Java thread parked on a native lock, GPU again. | Same as row 1. |
| `libGLESv2_adreno.so` SIGSEGV / SIGABRT, `libgsl.so` SIGSEGV | Qualcomm GPU driver + its graphics-memory allocator faulting. Almost always texture/buffer allocation churn or exhaustion. | Tile `ImageBitmap` lifecycle: every bake pass replaces ~40 bitmaps, each a fresh GPU texture on first `drawImage`. |
| `libwebviewchromium.so` SIGTRAP (17 users, 14%) | A Chromium `CHECK()` fired — most commonly OOM or fatal GPU context loss. | Memory ceiling: tile budget + overview + fabric lower/upper canvases + drag layer, all at full DPR. |
| `ActivityThread.throwRemoteServiceException` | System killed a foreground service / bad notification. | Not draw engine. Track separately. |

The pattern is unambiguous: **more of this is GPU/memory than is JS.** Fixing
only the JS side will move the `nativePollOnce` ANR and leave the rest.

---

## Findings

Ranked by expected impact. File references are `path:line` on `enginev2`.

### F1 — ✅ FIXED — `flush()` runs the whole dirty set inside every tile bake — **P0**

[`tileBakery.service.ts:460`](../src/draw/services/tileBakery.service.ts#L460)

```ts
flush(w);                    // drains the GLOBAL dirty map, up to 192 items
flushObjects(w, objects);    // then the ones this tile actually needs
```

`flush()` is bounded by `MAX_FLUSH_ITEMS = 192`
([:215](../src/draw/services/tileBakery.service.ts#L215)) — but 192 fabric
`toJSON()` calls is a **30–150 ms synchronous block** on a mid Android, and
`postMessage` then structured-clones that whole payload on the calling thread.

Three things make it worse:

- It runs **per tile**. A bake pass touches ~40 tiles.
- `CommittedLayer.bake` runs **4 concurrent lanes**
  ([`committedLayer.ts:584`](../src/draw/committedLayer.ts#L584)), so up to four
  of these interleave.
- The yielder only checks **between** tiles
  ([`committedLayer.ts:591`](../src/draw/committedLayer.ts#L591)). Nothing inside
  `rebuildTile` can be interrupted. A single tile can hold the thread for 100 ms+.

There is already an idle drain (`bakeryFlushSoon` → `requestIdleCallback`,
[:216–237](../src/draw/services/tileBakery.service.ts#L216)). The bake-time
`flush()` bypasses it entirely and defeats its purpose.

**Fix:** delete the unconditional `flush(w)` from `bakeryBakeTile` and
`bakeryRenderOverview`. Keep only `flushObjects(w, objects)` — bounded by *this
tile's* dirty objects, which is what correctness actually requires (the comment
at [:283](../src/draw/services/tileBakery.service.ts#L283) already says so).
Global drain stays on idle. Then measure whether `flushObjects` itself needs a
cap + `missing`-driven retry for pathological tiles.

**Second-order:** benchmark `JSON.stringify` on main → `JSON.parse` in worker
against structured clone. For deep object graphs stringify+parse is usually
faster *and* it is chunkable, unlike structured clone.

### F2 — ✅ FIXED — The bakery permanently disables itself after 3 timeouts — **P0**

[`tileBakery.service.ts:31,47,338`](../src/draw/services/tileBakery.service.ts#L31)

```ts
const BAKE_TIMEOUT_MS = 2500;
const MAX_FAILURES = 3;
```

`failures` resets to 0 only **after a successful bake**
([:481](../src/draw/services/tileBakery.service.ts#L481)). With 4 lanes, four
requests are in flight at once. If the first pass is slow — cold worker, fabric
module parse, a big board's first enliven, a device under memory pressure — all
four time out before any success, `failures` hits 4, and `shutdown()` runs.

After shutdown:

- Every tile bakes on the main thread via `isolatedTileRenderer`.
- `dropRegionLight` flips from 0 sync tiles back to 8
  ([`drawObjectManager.store.ts:804`](../src/draw/store/drawObjectManager.store.ts#L804)),
  adding 8 full object renders per drag commit.
- The only signal is a `console.warn` nobody sees in production.

It is also a **death spiral**: a timeout does not cancel the worker's work. The
worker keeps rendering, the queue grows, every subsequent request times out too.

**Fix:**
- Timeouts must not count toward `MAX_FAILURES`. Only structured errors
  (`onerror`, `res.error`) should. Timeouts should decay a rolling score.
- Raise `BAKE_TIMEOUT_MS` substantially for the first N bakes (cold start).
- Make the timeout **per-request abandonment**, not a global health signal.
- Cap in-flight requests so a slow worker can't be queue-flooded.
- If the bakery does shut down, allow a **re-arm** after a quiet period rather
  than for-the-session.
- Emit a real telemetry event on shutdown so we can see how many users are in
  this state. My guess: it is the bulk of the ANR cohort.

### F3 — ✅ MOSTLY FIXED (text + hybrid overlay) — Any text / image / group in a tile refuses the whole tile — **P0**

[`tileBakery.service.ts:449–457`](../src/draw/services/tileBakery.service.ts#L449)

```ts
if (a.text !== undefined) return null;
if (a.type === 'image')   return null;
if (a.__hasImageClip)     return null;
if (a.group)              return null;
if (a.opacity === 0 || a.visible === false) return null;
```

One text object anywhere in a tile's padded query rect sends the **entire tile**
to the main-thread renderer — full object rendering, chunked and yielded, but
main thread. On a board with scattered text or stickers, most tiles refuse. This
is the most likely direct cause of "it still lags when a tile changes."

**Fix, staged:**

- **Phase A — fonts in the worker.** `WorkerGlobalScope.fonts` (FontFaceSet) +
  `new FontFace(...)` works in Chromium/Android WebView. Load the same faces as
  [`text.helper.ts`](../src/draw/helpers/text.helper.ts) `loadFonts()` into the
  worker at `initTileBakery`, feature-detect, and drop the text refusal when it
  succeeds. Removes the largest refusal class.
- **Phase B — images as transferables.** Images never need `fetch` in the
  worker: decode on main once, ship the `ImageBitmap` into the mirror as a
  transferable, keyed by src. Drops the `image` / `__hasImageClip` refusals.
- **Phase C — hybrid tiles.** For anything still un-shippable, use the pattern
  `bakeryRenderOverview` already implements
  ([:363–429](../src/draw/services/tileBakery.service.ts#L363)): worker returns a
  bitmap plus a `skipped` list, main overlays only those objects. **Correct only
  when every skipped object's `__z` is above every shipped object's** — assert
  that, and fall back to a full local bake otherwise.
- **Phase D — groups.** Mirror group children with absolute transforms so
  `a.group` stops being a refusal.

Track the refusal rate in telemetry first (see [Instrumentation](#instrumentation)) —
it tells us which phase is actually worth building.

### F4 — ✅ FIXED — Uncapped device pixel ratio — **P0 (GPU)**

[`drawObjectManager.store.ts:662`](../src/draw/store/drawObjectManager.store.ts#L662)

```ts
getDpr: () => window.devicePixelRatio || 1,
```

and [`fabricDefaults.helper.ts:193`](../src/draw/helpers/fabricDefaults.helper.ts#L193)
never sets `enableRetinaScaling`, so fabric defaults it **on** and sizes both the
lower and upper canvases at full DPR.

On a DPR-3 phone that is roughly `1080 × 2200 = 2.4 Mpx` per canvas, ×2 canvases,
plus the transform drag canvas
([`transformController.ts:501`](../src/draw/transform/transformController.ts#L501)).
Every frame does a full `clearRect` + `fillRect` over that
([`committedLayer.ts:340–345`](../src/draw/committedLayer.ts#L340)), plus
`rerenderActiveObjectControls` clears the whole top context again whenever
anything is selected
([`renderCore.ts` → `afterComposite`, wired at `drawObjectManager.store.ts:680`](../src/draw/store/drawObjectManager.store.ts#L680)).

The kicker: **tiles are baked at `maxRenderScale` ≤ 1.5–2 anyway**
([`drawObjectManager.store.ts:695`](../src/draw/store/drawObjectManager.store.ts#L695)),
so the extra device pixels are pure upscale for tile content. They only buy
sharpness for text edit mode and selection controls.

**Fix:** cap the composite DPR at `min(devicePixelRatio, maxRenderScale)` and set
`enableRetinaScaling: false` with an explicitly sized backing store at the same
cap. On a DPR-3 device that is a **~55% cut in per-frame fill rate** and a
proportional cut in canvas memory. Expected to move the "Unresponsive GPU" ANRs
more than anything else in this document.

Ship it behind a remote flag and A/B it against the ANR rate — it is a visible
quality trade and worth confirming the win is real.

### F5 — ⚠️ PARTLY FIXED (overview pool) — Tile bitmap churn is the GPU allocation storm — **P1 (GPU)** — *lazy dropOtherTiers still deferred, see below*

Every bake pass replaces ~40 `ImageBitmap`s: `transferToImageBitmap()` in the
worker, transfer, `store()` closes the previous one
([`committedLayer.ts:776–789`](../src/draw/committedLayer.ts#L776)), the new one
becomes a GPU texture on first `drawImage`. On mobile the budget is 40–72 MB at
~270 KB per 256px tile — 150–270 live tiles, cycling continuously during pan and
zoom. That is exactly the workload that faults `libgsl` / `libGLESv2_adreno`.

Contributing:

- `dropOtherTiers` runs on nearly every seam
  ([`renderCore.ts:708–713`](../src/draw/renderCore.ts#L708)) — an edit at tier 5
  destroys the tier 3/4/6/7 tiles covering that rect, all of which get re-baked
  the moment the user zooms. Amplifies churn a lot for a modest quality gain.
- The worker allocates a **fresh** `new OffscreenCanvas(px, px)` per overview
  render ([`tileBakery.worker.ts:315`](../src/draw/workers/tileBakery.worker.ts#L315))
  — 4 MB on mobile, never pooled. Tile renders correctly reuse one canvas
  ([:221](../src/draw/workers/tileBakery.worker.ts#L221)); the overview should too.

**Fix:**
- Lower the mobile tile budget and validate against real device memory rather
  than `deviceMemory` heuristics. Fewer, longer-lived textures beat many churning
  ones on Adreno.
- Make `dropOtherTiers` lazy: mark other tiers stale instead of destroying them,
  and only reclaim under memory pressure.
- Pool the worker's overview canvas.
- Consider a `willReadFrequently: false` / explicit hint audit on the composite
  context — and note the existing Android WebView gotcha in
  the `lottie-worker-android` memory (GPU 2D canvas flicker) applies to the same
  driver family.

### F6 — ✅ FIXED — `renderLive` forces `dirty = true` every frame — **P1**

[`drawObjectManager.store.ts:454–486`](../src/draw/store/drawObjectManager.store.ts#L454)

```ts
a.objectCaching = false;
a.dirty = true;
```

[`isolatedTileRenderer`](../src/draw/helpers/drawTileRenderer.helper.ts#L106)
deliberately does **not** do this, with a comment explaining exactly why: an
object with a clipPath is force-cached by fabric (`needsItsOwnCache()`), and
forcing `dirty` re-rasterizes the **whole clip stack** on every render — the
historical super-linear erase lag.

`renderLive` does it unconditionally, every frame, for every live item. A live
erased object therefore rebuilds its entire clip cache at 60 Hz. It also mutates
`a.shadow.blur` per frame ([:468](../src/draw/store/drawObjectManager.store.ts#L468)).

**Fix:** mirror the tile renderer — do not force `dirty`; apply the same
`getTotalObjectScaling` override so the cache regenerates at the right
resolution by itself.

### F7 — `spatialIndex.query` allocates + sorts per tile — **P2**

[`drawObjectManager.store.ts:166–177`](../src/draw/store/drawObjectManager.store.ts#L166)

Every tile bake allocates a new array and sorts it (~40 per bake pass), and
`getZIndexMap()` rebuilds **O(all objects)** whenever `isZIndexDirty` — which is
set on every `object:added` / `object:removed`
([:496,:510](../src/draw/store/drawObjectManager.store.ts#L496)). During a remote
sync burst that is a full rebuild between edits.

**Fix:** reusable scratch array + insertion-sorted quadtree results; incremental
`__z` stamping on add/remove instead of a full map rebuild.

### F8 — ✅ FIXED — Shared yielder across 4 bake lanes — **P2**

[`committedLayer.ts:584–596`](../src/draw/committedLayer.ts#L584). One `Yieldable`
is shared by four interleaved chains; whichever lane yields calls `reset()` on the
shared budget timer, so the effective budget is roughly `budgetMs / lanes`.
Give each lane its own yielder, or make the budget lane-aware.

### F9 — ✅ FIXED — No frame requested until the whole bake pass finishes — **P2 (perceived)**

`rebuildTile` never repaints; only `runBake` does at the end
([`renderCore.ts:200`](../src/draw/renderCore.ts#L200)). With 4 lanes over ~40
tiles the viewport stays on fallback/overview for the entire pass. A coalesced
`requestFrame()` on tile-stored (max one per RAF) would make the same work *feel*
dramatically faster with no extra compute.

### F10 — ✅ FIXED (needs a release smoke test) — R8 disabled — **P1**

[`android/app/build.gradle`](../android/app/build.gradle) —
`release { minifyEnabled false }`. This is the literal vitals warning.

`proguard-rules.pro` is the untouched template. Enabling R8 with Capacitor needs
rules for plugin reflection and `@JavascriptInterface`. Minimum:

```proguard
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class ninja.sketchmate.app.** { *; }
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
```

Enable `minifyEnabled` + `shrinkResources`, then **smoke-test every plugin path
on a release build** (push, camera, keyboard, Firebase auth, the widget) before
shipping. This does not touch the WebView, so it will not move the ANRs — it
clears the vitals flag and cuts APK size / startup.

---

## Plan

### P0 — stop the bleeding (target: next release)

| # | Change | Finding |
| --- | --- | --- |
| 1 | Drop the global `flush(w)` from `bakeryBakeTile` / `bakeryRenderOverview`; keep `flushObjects` only | F1 |
| 2 | Timeouts stop counting as failures; per-request abandonment; cold-start grace; re-arm after quiet | F2 |
| 3 | Cap composite DPR at `maxRenderScale`; `enableRetinaScaling: false` with explicit backing store | F4 |
| 4 | Ship the instrumentation below **first**, so 1–3 are measured, not assumed | — |

Items 1–3 are independent and individually revertable. Item 3 is a visible
quality trade and should go out behind a flag.

### P1 — make the worker actually carry the load

| # | Change | Finding |
| --- | --- | --- |
| 5 | Fonts in the worker → drop the text refusal | F3-A |
| 6 | Images as transferable `ImageBitmap` in the mirror → drop the image refusal | F3-B |
| 7 | `renderLive`: stop forcing `dirty`; adopt the tile renderer's tier-scale override | F6 |
| 8 | Lazy `dropOtherTiers` (stale, not destroy); pool the worker overview canvas; re-tune the mobile tile budget | F5 |
| 9 | Enable R8 + Capacitor proguard rules; full release smoke test | F10 |

### P2 — polish

| # | Change | Finding |
| --- | --- | --- |
| 10 | Hybrid tiles (worker bitmap + main-thread skipped overlay, z-order asserted) | F3-C |
| 11 | Coalesced repaint per stored tile | F9 |
| 12 | Per-lane yielders | F8 |
| 13 | Zero-alloc `spatialIndex.query`; incremental `__z` | F7 |
| 14 | Group mirroring with absolute transforms | F3-D |

### Deliberately not on this list

Items 4–9 of the [`DRAW_ENGINE.md` roadmap](./DRAW_ENGINE.md#roadmap--next-steps)
(overview mip pyramid, persistent tile cache, WebGL compositor, incremental
content bounds, numeric bounds signature). None of them address an ANR or crash
signature. The WebGL compositor in particular is the *right* long-term answer to
F4/F5, but it is a large change and should wait until the cheap fill-rate and
churn fixes are measured.

---

## Progress

### Landed (2026-07-24)

**P0**

| Finding | Change |
| --- | --- |
| F1 | `bakeryBakeTile` / `bakeryRenderOverview` no longer call the global `flush()`. Only `flushObjects(w, objects)` — bounded by the tile's own dirty objects — runs on the bake path; the rest of the dirty set drains on idle. `bakeryMarkDirty` now schedules that idle drain so the mirror still stays warm. |
| F2 | Health model rewritten in [`tileBakery.service.ts`](../src/draw/services/tileBakery.service.ts). Timeouts abandon a request and no longer count as faults; only structured errors do, on a decaying budget. Cold start gets a 20 s timeout vs 8 s warm. In-flight requests are capped. Shutdown became a 30 s **pause + re-arm** with a fresh worker; permanent disable only after repeated pauses or an unsupported environment. |
| F3 (text) | Worker now registers the app's own faces into its `FontFaceSet` ([`workerFonts.config.ts`](../src/draw/config/workerFonts.config.ts)) and reports which succeeded. Text is baked in the worker **only** for families it confirmed; anything else stays refused. |
| F4 | `MAX_RENDER_SCALE` in [`renderQuality.config.ts`](../src/draw/config/renderQuality.config.ts) is now the single cap for the tile bake scale, fabric's `config.devicePixelRatio` and the composite DPR. Applied via `applyRenderDpr()` **before** `new Canvas` (fabric sizes the backing store in the constructor). Bucket fill's pixel read switched to `getRetinaScaling()` — it would otherwise have sampled the wrong pixel once the cap bit. |
| — | [`drawMetrics.service.ts`](../src/draw/services/drawMetrics.service.ts): always-on counters for bakery pauses/disable, refusals by reason, flush ms, and a `longtask` observer. `__drawPerf()` in the console; `setDrawMetricsSink()` is the seam for a transport. |

**P1**

| Finding | Change |
| --- | --- |
| F6 | `renderLive` no longer forces `dirty = true` every frame. It mirrors `isolatedTileRenderer` instead: clear caching, report the viewport scale as total object scaling, let fabric's own `zoomChanged` regenerate the cache once per real change. Erased objects were re-rasterizing their whole clip stack at 60 Hz. |
| F5 (partial) | The worker's overview render uses a pooled canvas instead of `new OffscreenCanvas(px, px)` per rebuild (4 MB mobile / 16 MB desktop, thrown away each time). |
| F10 | `minifyEnabled true` + `shrinkResources true`, with Capacitor/Firebase/Gson reflection keep rules in [`proguard-rules.pro`](../android/app/proguard-rules.pro) and `SourceFile,LineNumberTable` kept so Play stack traces stay readable. |

**P1 / P2 second pass**

| Finding | Change |
| --- | --- |
| F3-C (hybrid tiles) | [`bakeryBakeTile`](../src/draw/services/tileBakery.service.ts) now **partitions** a tile's objects: everything the worker can render (all stroke types + text with a loaded face) is baked off-thread; whatever it can't (an image, a group, unloaded-font text) is returned in `skipped` and overlaid on the main thread by `CommittedLayer.overlaySkipped`. Correctness rests on one guard — the shippable set must be a z-**prefix** (all skipped objects sit above everything baked); the moment a shippable object appears above a skipped one, the z-orders interleave and it bails to a full local bake (`refuse("zorder")`). Transiently-hidden objects render in neither layer. So a board of strokes-plus-stickers now bakes the strokes off-thread and only paints the sticker locally, instead of refusing the whole tile. `tilesHybrid` / `hybridSkippedTotal` track it. |
| F8 (per-lane yielders) | Each of the 4 bake lanes gets its OWN yielder. The single shared one had every lane `reset()` the same budget timer, collapsing the effective per-lane budget to `budgetMs / lanes`. |
| F9 (progressive repaint) | `CommittedLayer.bake` takes an `onProgress` callback invoked after each tile stores; `RenderCore.requestBakeProgressFrame` composites the partial result on a coalesced RAF. The viewport now fills in tile-by-tile instead of staying on the overview/fallback for the whole ~40-tile pass. Deliberately bypasses `renderNow` so it doesn't re-trigger `scheduleBake` mid-pass. |

### Measured locally after the second pass

Desktop Chromium (DPR 1 window), a tile of 6 strokes with a blue image on top:

```
pure strokes tile → tilesRemote +2, tilesHybrid 0, refused 0
strokes + image on top → tilesRemote +1, tilesHybrid +1, hybridSkipped +1   (image overlaid, renders on top — verified visually)
stroke ABOVE the image → refused +1 { zorder } → full local bake (correct render)
bakeryPauses 0   bakeryDisabled 0   flushMsMax 0
```

The hybrid tile was screenshot-verified: worker-baked red strokes with the blue
image composited on top, z-order intact and indistinguishable from a full local
bake. The interleaved case correctly falls back.

### Measured locally after the changes

Desktop Chromium, DPR 2, a 4-stroke board plus one `IText` in **Anton**:

```
tilesRemote: 4   tilesRefused: 0   tilesFailed: 0   refusalRate: 0
flushMsMax: 0    bakeryPauses: 0   bakeryDisabled: 0   bakeTimeouts: 0
```

Before the font work every one of those tiles was refused (`text`) and baked on
the main thread. Glyphs were visually confirmed to render in Anton, not a
fallback face — the correctness risk that motivated the original refusal.

`flushMsMax: 0` is the F1 fix holding: no bake-path flush block is measurable.

**These numbers are from a desktop dev machine and prove the mechanisms work.
They say nothing about the Android cohort** — DPR 2 means the F4 cap is not even
biting here. The field numbers are still the open question.

### Still open

| # | Item | Finding | Note |
| --- | --- | --- | --- |
| 6 | Images as transferable `ImageBitmap` in the mirror — bake images fully off-thread | F3-B | **Superseded in practice by F3-C** for the common case (image overlaid locally, strokes off-thread). Only worth building if `hybridSkippedTotal / tilesHybrid` shows image-heavy tiles are a measured cost. |
| 8 | Lazy `dropOtherTiers` (mark stale, don't destroy) + re-tuned mobile tile budget | F5 | Still deferred. Marking stale instead of destroying keeps the bitmap in memory but `findBestSource` rejects stale tiles, so it buys nothing without ALSO allowing stale-tile fallback — which is the ghosting risk. Wants the field churn numbers (`tiles.evictions_per_min`) before committing. |
| 13 | Incremental `__z` stamping; zero-alloc `spatialIndex.query` | F7 | Lower value than the finding implies: adds are already batched (`beginBatch`/`endBatch`), so the O(all) `getZIndexMap` rebuild coalesces to once per batch, not per add. The zero-alloc scratch array is also UNSAFE with 4 concurrent bake lanes (a shared scratch clobbers between interleaved queries). Deprioritised. |
| 14 | Group mirroring with absolute transforms — bake groups off-thread | F3-D | Superseded by F3-C for correctness (groups overlay locally). Only build if `tileRefusals.zorder` shows groups force many interleave fallbacks. |
| — | A transport for `setDrawMetricsSink` — the counters exist but go nowhere in production | — | The gap between "fixed" and "confirmed fixed". No analytics backend exists yet. |
| — | Stroke serialization cost itself (rounding + delta encoding beyond pencil) | H4 | Would cut the eager `object:added` payload, the sync wire and snapshot size at once. |
| — | **Release-build smoke test for R8**: push, camera, keyboard, Firebase auth (Google + phone), share, widget | F10 | Needs a device + release build; not doable in this environment. |

---

## Second review — eraser, move/undo, groups, and a re-check of the ANR/crash risk

Triggered by six field reports. Findings, root causes, what was fixed, what
remains. Grouped by the report.

### E1 — ✅ FIXED — the worker never registered `ClippingGroup` → erased tiles baked wrong

The single most important finding of this pass, and it touches reports #1, #6.

`@erase2d`'s `ClippingGroup` (fabric `type: 'clipping'`) self-registers via a
module side-effect — but only where it is imported. `CustomEraserBrush` imports
it, so the **main thread** has it. The **tile worker never did**. So when the
worker enlivened an erased object, `classRegistry` had no class for `'clipping'`
and the clip was dropped (or the whole enliven threw and the object was
skipped). Net effect on any tile the worker baked for an erased object: the
**erase hole reappeared**, or the object **vanished**, until a main-thread
rebake happened to cover it.

Because erased objects (with a vector `ClippingGroup` clip) ARE worker-shippable
(`shippable()` returns true), this hit every normal erase. It is a strong
candidate for both "strokes remain / come back after erase" (#1) and the
worker-not-helping half of the erase lag (#6): tiles that looked wrong forced
repeated main-thread rebakes.

**Fixed:** [`tileBakery.worker.ts`](../src/draw/workers/tileBakery.worker.ts)
imports `ClippingGroup` and calls `classRegistry.setClass` on it (explicit so
the import isn't tree-shaken). Erased objects now bake correctly **and** stay
off-thread. `ClippingGroup.drawObject` uses only `fillRect` + `path.render`, so
it is worker-safe.

### E2 — ✅ FIXED — erase redo re-added a clip stroke it already had → unbounded growth

`redoErased` called `eraseObject` on every recorded target with no check for
whether that stroke was already in the object's clip. Normally undo removes it
first, so redo re-adds exactly one — balanced. But once a clip is **flattened**
(E3), undo can't remove the baked stroke by id, so the following redo **adds a
duplicate vector child**. Spamming undo/redo then grows the clip without bound,
and every render re-rasterizes an ever-bigger clip stack — progressive erase lag
and drift.

**Fixed:** `redoErased` skips any target whose clip already contains the stroke
id (`clipContainsStroke`). Idempotent redo, no growth.

### E5 — ✅ FIXED — erased edges blurry when zoomed in

The eraser's `ClippingGroup` clip is **always cached for masking**
(`renderCache({ forClipping: true })`), sized by the clip's OWN
`getTotalObjectScaling()`. During a bake `canvas` is null (worker) or the clip's
scale ignores the tile tier, so that scaling is ~1: the erase mask rasterizes at
1x and is upscaled to the tile's tier. Every erased edge blurred when you zoomed
in — the exact bug the object tier-scale fix already solved for objects, never
applied to the clip.

**Fixed:** both bake paths — `prepareForBake`
([`drawTileRenderer.helper.ts`](../src/draw/helpers/drawTileRenderer.helper.ts))
and the worker's `applyTierScaling`
([`tileBakery.worker.ts`](../src/draw/workers/tileBakery.worker.ts)) — now
recurse into `obj.clipPath`, giving the clip and its stroke children the same
tier-scale override + caching-off treatment as the object. The mask bakes at
tile resolution → sharp erased edges at any zoom. (Live rendering already tracked
viewport zoom, so it was never blurry; only committed tiles were.) The
*flattened* clip (E3) is still an image at capped resolution — E3's un-flatten
now restores vector sharpness on undo.

### E3 — ✅ FIXED — flattened clips can't be undone (now un-flatten on undo)

`bakeClipGroupIfNeeded` collapses an object's oldest eraser strokes into one
cached **image** once the clip exceeds `flattenClipAfter` (50), keeping the
newest `keepVectorClips` (40) as vectors. It bounds per-render clip cost — but
the baked strokes lose their ids, so `removeStrokeFromClip` can't undo them
(it logs "erase remains on this object"). So undoing an erase older than ~40
strokes-on-one-object silently fails: **"some strokes remain"** (#1), on
heavily-erased objects.

**Fixed** with the retain-and-un-flatten design:

- `bakeClipGroupIfNeeded` no longer disposes the baked strokes — it keeps them
  **off the render tree** in `object.__bakedClipStrokes` (bounded to 400; the
  oldest drop, which just makes ancient erases un-undoable as before). They are
  small vectors and NOT in `cg._objects`, so render stays O(1) — only the union
  image renders.
- `removeStrokeFromClip` (erase undo), when the stroke id isn't a live vector
  child, checks `__bakedClipStrokes`. If found, it **un-flattens**: drops the
  image(s), restores the retained strokes (minus the undone one) as vector
  children, clears `__hasImageClip`. The object is fully vector again — undoable,
  worker-shippable, and **sharp** (no upscaled mask) — and the base64 image is
  freed (net memory *drop* on undo). Fails safe (leaves the clip untouched) on
  any error.

So a heavily-erased object flattens for render speed, and undoing past the
flatten transparently restores full vector fidelity. The next live erase past
the threshold re-flattens.

### E4 — ✅ FIXED — erase undo/redo did an 8-tile synchronous main-thread rebuild

The heart of "everything gets laggier after erase undo/redo" (#6). Every erase
undo, and every non-stampable redo, called `dropRegionLight(rect, true)` →
`rebuildRectSync` of up to **8 tiles** over the union of *every object the
stroke touched* (often large), rendering each object's clip group, on the main
thread, on **each** undo/redo.

**Fixed:** `dropRegionEraseUndo` uses **2** sync tiles when the bakery is alive
(instant feedback under the cursor) and lets the worker rebake the region
off-thread — correct now that E1 makes erased objects bake right in the worker.
Falls back to the full sync repair only when the bakery is unavailable.

### M1 — move undo/redo correctness (#1) — no move-specific bug found; constrained by the wire

The move diff is stored as `{ forward, backward }` deltas and applied by
subtraction from live props. That is **mathematically reversible** (left/top/
scale/angle are all linear), so pure move undo/redo round-trips exactly. It is
also the **multiplayer wire format** (`drawSyncEngine`, `drawSyncing.config`) —
switching to absolute before/after states would break mixed-client sync, so it
stays diff-shaped.

The gross "object ended somewhere else" almost certainly rode in on the erase
bugs above (E1/E2 corrupting the shared region, or a fully-erased-then-restored
object) rather than the move math. **Re-test after E1–E4.** If it persists,
prime suspects, in order: (a) `getSelectedObjectOriginalStates()` going stale
when a move commits without a `before:transform` (the recorded delta would then
be wrong); (b) sub-pixel float drift over long spam (add rounding on apply).

### M2 — ghosting on move (#2)

Not a crash risk; a visible artifact. Most likely the old footprint's tiles at
**non-active tiers** (`dropOtherTiers` marks them, but the fallback search can
still surface a coarser stale tier for a frame) or the overview patch of the old
footprint **bailing to the async rebuild** on a dense region, so the fallback
shows the object at its old spot until the bake lands. The F9 progressive-repaint
frames can make that window visible where it used to be one atomic repaint.
Targeted fix (not done): on a transform commit, hold the progress repaint until
the new footprint is stamped, and widen the old-footprint invalidation pad.

### G1 — groups in the worker (#3, #5) — mostly a misconception; already works

A **top-level merged Group** has `obj.group === undefined` (it has no *parent*),
so it is **not** hit by the `grouped` refusal — it already bakes in the worker,
and `applyTierScaling` recurses its children for per-child culling and correct
cache resolution. So **heavy merged groups already render off-thread today.** The
`grouped` refusal only fires for an object currently *inside an ActiveSelection*
(the transient multi-select wrapper), which is correct — its transform is
selection-relative for those few frames.

The real cost of heavy groups is **serialization**, not baking: `toJSON` of a
500-child group is a big synchronous main-thread block on first flush and on any
`bakeryMarkDirty`. Mitigations that already exist: the load path stashes
`__bakeJSON` and ships it verbatim (no re-`toJSON`); the flush is idle-drained
and capped. What to add: avoid `bakeryMarkDirty`-ing a whole group for changes
that don't alter its geometry, and consider caching a group's serialized blob
until it actually mutates. Verify (couldn't in this env — solo-draw needs a
backend) that a heavy group actually reports `tilesRemote`, not `tilesRefused`.

### Y1 — per-lane yielder vs "just use the worker" (#4)

The per-lane yielder governs the **local fallback** bake — main-thread work that
only runs when the worker refuses or fails a tile. With E1 + F3-C, that fallback
is now rare, so the yielder matters less, but it is still the right tool for the
residual local bakes (it is not either/or). "Just use the worker for everything"
means eliminating the last refusals — images (`__hasImageClip`, `type:image`),
which need **F3-B: decode on main, ship the `ImageBitmap` into the mirror as a
transferable**. That is the one worth building next *if* `tileRefusals` shows
images dominate — the metrics now expose exactly that.

### Re-check — ANR / crash / memory risk after this pass

| Risk | Status |
| --- | --- |
| `nativePollOnce` (main-thread busy) from erase | **Reduced.** E1 stops erase-heavy boards from constantly falling back to main-thread bakes; E4 removes the 8-tile sync rebuild per undo/redo. |
| Unbounded clip growth on undo/redo spam | **Fixed** (E2). |
| `libwebviewchromium.so` SIGTRAP (OOM) | **Better.** History redo stack fixed earlier (H1); E3 now FREES the flatten image on undo and bounds retained strokes to 400. Residual: a still-flattened object keeps one base64 image until undone — acceptable. |
| `libGLESv2_adreno` / `libgsl` (GPU churn) | **Unchanged** — F5 lazy `dropOtherTiers` + budget still deferred pending field churn numbers. Still the top *crash* (not ANR) suspect. |
| Field confirmation | **Still the gap.** No metrics transport; every number here is desktop + code reasoning. |

Net: the erase path — the loudest of the six reports and a genuine main-thread /
correctness offender — is materially better. The remaining ANR/crash headroom is
GPU churn (F5) and the flatten memory (E3), both scoped above.

---

## Twentieth review — "gesture right as the tiles unblur" lags

*Written 2026-07-26.*

Report: zoom into a dense board, wait until the tiles are **about to sharpen**,
then start a gesture — it hitches. That moment is peak worker + GPU load, and
the abort path turned out to be main-thread-only.

`onGestureStart` → `RenderCore.setGesturing(true)` → `abortBakes()` flips an
`AbortController` ([`renderCore.ts:579`](../src/draw/renderCore.ts#L579)). That
stops the main-thread `drain()` loop and nothing else. Four consequences, all
fixed below.

### R20 — ✅ FIXED — the worker was never told to stop — **P0**

`abortBakes()` aborts a signal the *worker* cannot see. Every request already
posted (2 lanes, plus a possible overview) kept running: `ensureLiveMany` over a
dense tile's objects, a full render, `transferToImageBitmap` — and on arrival
`rebuildTile` closed the bitmap and threw it away
([`committedLayer.ts:658`](../src/draw/committedLayer.ts#L658)).

That is the worst possible moment to be busy. The worker's `OffscreenCanvas` is
GPU-backed, so its raster and the `transferToImageBitmap` flush contend with the
compositor frames driving the gesture — the same contention the `libgsl` /
"Unresponsive GPU" signatures point at (F5). It also explains why the symptom is
specific to *dense* boards and to the *unblur* moment: that is exactly when the
per-tile worker cost peaks.

**Fixed:** an epoch/cancel protocol.

- `bakeryCancel()` bumps `epoch`, settles every pending promise locally, and
  posts `{ t: 'cancel', epoch }`.
- The worker handles `cancel` **out of band** — before the FIFO `chain`. Chained,
  it would queue behind the very bake it cancels and land after it finished.
- `bake()` checks the epoch twice: at entry (drops queued tiles for free) and
  again after `ensureLiveMany`, its only await and its dominant cost. `overview()`
  checks per iteration, since it awaits per object.
- Stale requests reply `{ aborted: true }`. That is proof of life, never a fault:
  it must not touch `hardFailures` / `consecutiveTimeouts` (a cancel on every pan
  would otherwise march the bakery toward its 30s pause) and never
  `recordTileFailed()`.

**Call order is load-bearing.** `setGesturing(true)` must run *before*
`bakeryCancel()`. Cancelled requests resolve `null`, and `null` means "worker
declined" to `rebuildTile` — which falls through to a synchronous **main-thread**
bake. With the signal already aborted, `rebuildTile` bails first. Reversed, a
gesture would stop offloading tiles and start rendering them on the thread the
cancel exists to free.

### R21 — ✅ FIXED — the abandoned tile's pixels were binned — **P1 (perceived)**

The aborted in-flight bitmap was valid, finished, and paid for, and it got
`close()`d — so after the gesture the same tile baked again from scratch. Double
cost: the lag, then a slow re-sharpen.

**Fixed:** on abort, store it, guarded on `skipped` being empty (`overlaySkipped`
is a synchronous main-thread render — exactly what the abort is avoiding) and on
`gen` not having moved. `store()` itself is cheap: no GPU upload happens until
something draws the tile, and a tier change may mean it never is.

### R22 — ✅ FIXED — the idle flush ran *on* gesture frames — **P1**

`scheduleIdleFlush` → `requestIdleCallback(run, { timeout: 500 })` → `flush()`
drains up to `MAX_FLUSH_ITEMS` (192) `toJSON()` plus one structured clone inside
`postMessage`, then re-arms immediately while `dirty.size > 0`.

During a gesture the bake pass has just been aborted, so the main thread is idle
between frames — long idle windows, so the drain fired on nearly every gesture
frame. And `touchmove` is registered `{ passive: false }`
([`gestureDetector.ts:107`](../src/draw/utils/gestureDetector.ts#L107)), so any
main-thread block lands directly on input latency rather than merely dropping a
frame. On a freshly-loaded dense board `dirty` holds thousands (`bakerySeed`
marks every object at load), so this ran and ran.

**Fixed:** two changes.

- `bakeryPauseFlush(on)` parks the drain for the gesture; `onGestureEnd` re-arms
  it. Nothing is lost — the dirty refs stay parked, and a bake needing an
  unshipped id gets `missing` back and self-heals.
- `flush()` is now bounded by **time**, not just item count: it honours
  `deadline.timeRemaining()` (or `FLUSH_BUDGET_MS` on the `setTimeout` fallback).
  Per-object `toJSON()` cost spans ~two orders of magnitude — a 3-point line vs a
  4000-point watercolor path — so a flat 192 cap was never a time cap.

### R23 — ✅ FIXED — overview patches ran on gesture frames — **P2**

`renderNow` → `live.gcExpired()` → `patchOverview(rect)` →
`overview.patchRect(rect, overviewPatchMax)` is a synchronous render of up to 200
objects into the overview canvas. It reaches a gesture frame via TTL: a live
overlay whose demote never happened (because the bake was aborted) hits
`NORMAL_TTL_MS` mid-gesture and folds itself into the overview right then.

**Fixed:** `gesturing` now defers like an off-screen edit — the existing
`pendingOverview` queue, flushed by `setGesturing(false)` before its
`requestFrame()`. The >256 overflow valve would have re-introduced the same
synchronous patch on a gesture frame, so while gesturing it coalesces to one
bounding rect (arithmetic only) instead of flushing.

Trade: a remote edit arriving mid-gesture is not folded into the overview until
the gesture ends. Bounded by gesture duration, and the tiles/`live` layer still
cover the common cases.

### R24 — ✅ FIXED — the overview rebuild could not be interrupted — **P0**

Follow-up report: *"load a heavy drawing and try to zoom — it lags"*, and
*"zoom in, wait a micro bit, then pan — sometimes still lags"*. R20–R23 covered
the bake and the flush; the overview was untouched, and it is the single most
expensive main-thread thing this engine does.

`WorldOverview.rebuildIfNeeded` is an O(whole scene) render. Both callers passed
`new AbortController().signal` — a controller nobody held and nobody ever
aborted. So once a rebuild started it ran to completion regardless of what the
user did. Right after loading a heavy board the overview is dirty
(`markAllDirty()`), so a rebuild is exactly what is running when the user's first
zoom arrives.

**Fixed:** `RenderCore` tracks `overviewCtrl`; `abortBakes()` aborts it alongside
the bake, and `setGesturing(false)` re-arms via `scheduleOverviewRebuild()` when
the overview is still dirty (nothing else would — `patchOverview` only schedules
on a patch *failure*, so an interrupted rebuild would otherwise never finish).
Abandoning it is free: the rebuild builds into a TEMP canvas and only swaps at
the end, so the previous overview stays on screen throughout.

`warmOverviewBlocking` deliberately keeps a non-abortable signal. The load reveal
flips `loading` off the moment it resolves, and an aborted rebuild leaves the
overview null — the blank white first frame that method exists to prevent.

### R25 — ✅ FIXED — an un-yielded O(N) block *before* the yielded render — **P1**

Inside the same function, the "is this object big enough to leave a mark at
overview resolution" filter ran as a synchronous, un-yielded, un-abortable loop
over every object in the scene — and `getBoundingRect(true, true)` **recomputes**
coords rather than reading them. On a big board that is a single multi-hundred-ms
block landing *before* the carefully-yielded render loop even starts. R24's abort
cannot help here: there is no await to abort at.

**Fixed:** `SpatialIndex` gained an optional `queryBounds(rect)` returning the
rects the quadtree already tracks (kept current by `updateQuadTree` →
`cachedBounds`), so the recompute disappears entirely — the filter becomes a
plain arithmetic pass. The old path is kept for indexes without it, now yielded
every 128 objects and abort-checked.

### R26 — ✅ FIXED — R22's pause moved the flush cost onto the bake path — **P2**

Parking the idle drain for the gesture (R22) meant the dirty set was still deep
when the gesture ended. `RenderCore` restarts the bake `bakeDebounce` (80ms)
later, and everything not yet shipped is then paid for by `flushObjects` *inside
each tile's un-yieldable prologue* — a structured clone per tile. A plain idle
callback (timeout 500) routinely lost that race, so the pause relocated the cost
instead of removing it. This is the second half of "wait a micro bit, then pan".

**Fixed:** resuming after a gesture schedules the drain with a 40ms deadline so
it beats the bake debounce. Batches stay time-boxed (R22), so urgency does not
mean a long block. Subsequent batches return to the normal 500ms cadence.

### R27 — ✅ FIXED — every stroke class serialized a path array it threw away — **P1**

Third report, on a **watercolor-heavy** board: still hitches, and *"it happens at
the moment it wants to switch — the baking is done and we just have to replace
it"*.

`Path.toObject` is `{ ...super.toObject(props), path: this.path.map(cmd =>
cmd.slice()) }` — a deep copy of every segment. **Five** stroke classes then do
`delete baseObj.path`, because each rebuilds its geometry in `fromObject` from a
compact form instead: `WaterColorStroke`, `OptimizedPencilStroke`,
`OptimizedEraserStroke`, `CalligraphyStroke`, `BucketFillPath`. So that copy was
allocated and discarded on every single serialize — and serialization runs on the
MAIN thread, in each idle flush batch (192 objects) and in `flushObjects` inside
every tile's bake prologue.

Watercolor is the worst case by construction: `buildPathString` emits **3
bristles**, so `this.path` holds ~3N commands for N base points. Measured: a
120-point stroke is 363 path segments.

**Fixed:** `toObjectWithoutPath` in `brush.helpers` empties `this.path` for the
duration of the `super.toObject()` call (try/finally — a throw must never leave
the live object path-less), making the `.map` a no-op. All five classes use it.

**Measured, desktop node, 500 watercolor strokes: 7.1ms → 4.5ms.** Verified
round-trip: `path` still absent from the output, live path restored by reference,
`compressedTrace` identical, `fromObject` rebuilds the same 363 segments.

Worth being straight about the size of this: it removes ~37% of serialization
cost, not the whole hitch. The remaining 4.5ms is `super.toObject()` itself.

### R28 — ✅ FIXED — demotion fired one overview patch PER STROKE — **P1**

`demoteSettled` ran `patchOverview(rect)` for every demoted id, and `patchRect`
is a synchronous clear + redraw of every object in that rect. Demotion is
all-at-once — it fires on the frame a bake pass completes — so a full live layer
meant up to `liveMax` (32–64) of those in ONE frame, landing exactly on the frame
where tiles replace the blur. Strokes drawn together also overlap, so each patch
re-rendered its neighbours' objects again.

**Fixed:** collect the rects, `mergeRects` them, patch the merged set. The
clustered common case collapses to one or two patches; far-apart edits stay
separate. A merged rect too dense for `overviewPatchMax` fails the gate and
defers to the async yielded rebuild, which is the correct outcome.

NB this only bites when the live layer is populated (you drew, then zoomed). On a
freshly *loaded* board `live` is empty and demotion is a no-op — so it is not the
whole story for the load-then-zoom repro.

### R29 — ✅ FIXED — the progress-frame throttle DROPPED frames instead of deferring — **P1**

`requestBakeProgressFrame` returned early inside its 120ms window without
scheduling anything. So every tile that landed inside that window was never
composited progressively — its bitmap's first `drawImage`, and therefore its GPU
texture upload, was saved up for the single frame at the end of the pass. On a
dense board that is dozens of uploads in one frame: precisely "the switch is an
intense operation".

**Fixed:** a trailing timer re-requests at the end of the window, so uploads
actually spread at the intended ~8/sec instead of clumping. Cancelled in
`abortBakes()` with the rest.

### R30 — ✅ FIXED — the local bake checked abort every 64 objects — **P1**

Fourth report: better, but gesturing *while a bake is running* still spikes, and
it is watercolor-specific — *"pencil is just less heavy so you don't notice it"*.

That phrasing points at a cost that scales with per-object render weight, on the
main thread, during a gesture. `rebuildTile`'s LOCAL fallback is exactly that:

```ts
if (i % this.CHUNK === this.CHUNK - 1 && yielder.shouldYield()) {
  await yielder.yield()
  if (signal.aborted) { … return }
}
```

`CHUNK` defaulted to 64, and the abort is only checked when that condition
fires — so a gesture starting mid-tile waits for up to 64 objects to rasterize.
The count is standing in for a time budget, which only works if objects are
cheap. A `WaterColorStroke` is 3 bristles × N base points (measured: 363 path
segments for 120 points), stroked with round joins at `objectCaching = false`, so
64 of them is a tens-of-ms block with no way out of it.

**Fixed:** `renderChunk` is now device-aware — 8 low-end / 16 mobile / 32 desktop
— keeping the worst-case uninterruptible stretch to roughly a frame. The extra
`isInputPending()` calls cost far less than the block they interrupt.

NB this only fires for tiles the worker did **not** bake. If `localBake` shows up
big in the phase metrics below, the real question is *why* those tiles took the
local path — a paused bakery (`bakeryPauses`) dumps every tile onto the main
thread for 30s at a time, which would look exactly like this report.

### R31 — ✅ FIXED — `flushPendingOverview` was an unbounded synchronous loop — **P2**

It ran its whole queue in one go, at `setGesturing(false)` and at the head of
every bake pass, with each `patchRect` a synchronous clear + redraw of every
object in its rect. A pan is a *sequence* of gesture / 180ms-settle cycles, so
this fired repeatedly through what the user experiences as one continuous
gesture.

**Fixed:** merge the queued rects first (deferred rects overlap, so they were
re-rendering each other's objects), then spend at most 8ms and requeue the rest
for the next flush point.

### R32 — what the worker actually bought, and what it did not

Fifth report, and the right question: *"I thought the whole point of the bake
worker is that the main thread is super free — but zooming still lags when
baking a lot of tiles."*

Correct, and R20–R31 were all treating symptoms around the edge of it. **The
worker only moved RASTERIZATION off the main thread.** The main thread still
owns, per bake pass:

1. `index.query(q)` + a z-`sort()` — **per tile**
2. an O(objects-in-tile) `workerCanRender` loop building `shippable` / `ids` /
   `skipped` — **per tile**, and objects on tile seams are visited by several
3. `flushObjects` → `toJSON` + a structured clone — **per tile**
4. `postMessage` of the id list — **per tile**
5. `store()` + `ImageBitmap.close()` of the tile it replaces
6. **the entire composite, on every single frame**

(6) is the one that matters for the reported symptom, because **during a gesture
the bake is aborted — so the composite is the ONLY thing running.** If zooming
janks, it is not the bake. It is a full-surface clear + fill plus one `drawImage`
per visible tile, at `MAX_RENDER_SCALE`, every frame.

Two fixes land now; the structural answer is below them.

#### R32a — ✅ FIXED — the composite wrote the full surface TWICE per frame

```ts
ctx.clearRect(0, 0, px.w, px.h)
if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, px.w, px.h) }
```

When the background is opaque the fill already overwrites every pixel, so the
clear is pure waste — and it is the biggest *fixed* cost of a composite, paid on
every frame of every pan and zoom regardless of content. At `MAX_RENDER_SCALE` 2
on a phone that is ~1.3Mpx written twice.

**Fixed:** clear only when no opaque fill is coming. `isOpaqueColor` is
deliberately conservative — anything unrecognised keeps the old clear+fill, so
the worst case is the previous behaviour and never a stale-pixel bug.

#### R32b — ✅ FIXED — every gesture frame painted TWO frames late

`gestures.helper` did: `touchmove` → `requestAnimationFrame` → `syncVisuals()` →
`renderViewport()` → `core.requestFrame()` → **another** `requestAnimationFrame`
→ composite. Two chained RAFs, so the pixels for a touchmove at frame N landed at
frame N+2 — unconditionally, with **no CPU cost involved at all**. Constant
latency on every pan and zoom reads exactly like "the main thread is busy" even
when it is completely idle, and `touchmove` being a non-passive listener means
nothing can hide it.

**Fixed:** `RenderCore.renderFrameNow()` composites synchronously for callers
already inside a RAF, and cancels any frame already queued so it supersedes it
rather than doubling the work (hence `frameRaf` now being tracked).

#### The structural answer — move the composite off the main thread

To actually make the main thread free during pan/zoom, compositing has to leave
it, via `transferControlToOffscreen()` on a dedicated tile canvas in a worker.
It cannot be done to fabric's lower canvas — fabric owns that element and draws
selection/live content into it — so it means a separate composite layer beneath
fabric's, with fabric's own canvas kept transparent and used only for live
strokes and controls. Tile bitmaps would then be transferred worker→worker and
never touch the main thread at all; a pan/zoom would be one `postMessage` of the
viewport matrix per frame.

That is the real end state. It is a large change and is NOT done here.

Cheaper items in the same direction, none done yet:
- Cache the `workerCanRender` verdict per object (invalidated on dirty) instead
  of recomputing it for every object of every tile of every pass.
- `hasImageClip` memoizes only the TRUE answer; the false case re-walks
  `clipPath._objects` on every call, i.e. per object per tile. Memoize both.
- Move the spatial query itself into the worker. The mirror already receives
  every object via `upsert`/`translate`/`remove`, so it could hold bounds + z and
  resolve "which ids are in this tile" itself — collapsing items 1–4 above to a
  single message per bake pass instead of per tile.

### Instrumentation — composite + phase attribution (stop guessing)

Three rounds of reasoning got the obvious offenders but the switch frame was
still being diagnosed from the outside. A composite is a clear + fill, an
overview `drawImage`, a fallback-tier search, and one `drawImage` per visible
tile — with very different fixes. `recordComposite` now times the three parts
separately on every frame (three `performance.now()` pairs around blocks that
already cost milliseconds), surfaced in `__drawPerf()`:

| Field | Reads as |
| --- | --- |
| `tileDrawMsMax` high | GPU texture upload / fill rate — finding F5, and R29's clumping |
| `searchMsMax` high | `findBestSource` walking tiers per cell (depth 3 when not gesturing) |
| `compositeMsMax` high, both others low | the clear + fill itself → DPR / surface size |
| `flushMsMax` high | serialization — R27's territory |
| `longTaskMsMax` | ground truth that the main thread blocked at all |

And `phaseMsMax` / `phaseMsTotal` / `phaseCount` attribute every remaining
main-thread block that renders or serializes OBJECTS — i.e. everything whose cost
scales with brush weight, which is what makes a watercolor board hurt where the
same board in pencil does not:

| Phase | What it is | If it dominates |
| --- | --- | --- |
| `flushBake` | `toJSON` + structured clone inside a tile's bake prologue | R27 territory; the remaining cost is `super.toObject()` |
| `flushIdle` | the same, on the background drain | should be near-zero during gestures (R22 parks it) |
| `localBake` | a tile the worker refused → full main-thread render | check `bakeryPauses` and `tileRefusals` — *why* is it local? |
| `overlaySkipped` | hybrid tile: worker bitmap + main-thread objects on top | un-yielded by design; only safe while `skipped` is small |
| `overviewPatch` | `patchRect`: clear + redraw a region of the overview | R28 / R31 territory |
| `overviewBuild` | full O(scene) overview render (WALL CLOCK — it yields) | compare against `longTasks`, not against frame time |
| `rebuildSync` | synchronous tile repair (`destructiveInvalidate` et al) | still ungated — see "Still open" |

### Still open after this pass

- **`destructiveInvalidate` → `rebuildRectSync` is not gesture-gated.** A remote
  `object:removed` / `object:modified` arriving mid-gesture still does a
  synchronous ≤32-tile main-thread rebuild. The *streamed* path is already
  deferred (`scheduleRemoteFlush` re-schedules while gesturing); the one-shot
  callers are not. Same class of block as R23, larger.
- **`setErasing(true)` does not `bakeryCancel()`.** Identical waste to R20 —
  bakes are aborted, the worker keeps rasterizing — just on the erase seam
  instead of the gesture seam. One line, deliberately left out of this pass.
- **`findBestSource` allocates per frame.** `coarserDraw` / `finerDraws` build
  fresh `Draw` literals (and a fresh array) per uncovered cell per frame, unlike
  the pooled `_present` / `_uncovered`. Bites during a tier change, when every
  cell is uncovered. GC pressure only.
- **`spatialIndex.query` sorts per tile** (the surviving half of F7). ~40 sorts
  per bake pass, inside each tile's un-yieldable prologue. The `getZIndexMap()`
  half of F7 is NOT the problem the finding claims — `isZIndexDirty` is set by
  layer ops and resets, not by plain `object:added`, so the map is cached across
  a pass.
- **`flushObjects`'s per-tile structured clone** is now the largest remaining
  item in the tile prologue (R26 reduces how often it is loaded, not its cost).
  Bounded by the tile's own dirty objects by design (F1), so this is a real
  floor, not a bug — but it is un-yieldable and it is what a pan lands on.
- **Field confirmation.** Still desktop + code reasoning. The GPU-contention half
  of R20 does not reproduce on a desktop GPU.

---

## Nineteenth review — the real stall: the worker's `img` shim never settles

R17 was a genuine bug but not the one causing the stall — filtering
`WaterColorStroke` out of the enliven batch still "fixed" it afterwards. Every
case also enlivened cleanly in an isolated Node harness, which proved the class
was fine and the failure was **environmental**.

### R18 — ✅ FIXED — `loadImage` hangs forever in the worker

fabric's `loadImage`:

```js
const img = createImage();   // → document.createElement('img') → our worker SHIM
img.onload = done;  img.onerror = reject;  img.src = url;
```

The shim returned a plain object that ignored all of that, so **no event ever
fired and the promise never settled**. Any enliven touching an image hung
forever — and since the message pump is serial, that parked every later message:
`case 'bake'` simply stopped executing and every request timed out into the 30s
pause. A hang is also invisible to `Promise.allSettled`, so the per-object
isolation from R15 could not contain it either. That is why only *removing* the
object helped.

**Why WaterColorStroke, and why only old ones:** it is not about the class. Those
were strokes that had been **erased**, and `bakeClipGroupIfNeeded` flattens old
eraser strokes into a `fabric.Image` inside the ClippingGroup. Enlivening such an
object reaches `loadImage` → hang.

### R19 — ✅ FIXED — `__hasImageClip` is a runtime flag and does not survive a reload

The guards already refused image-clipped objects via `obj.__hasImageClip` — but
that flag is set at flatten time and **is never serialized**. After a save +
reload the image is still in the clip while the flag is gone, so the object
sailed past every guard and into the worker. Hence "older strokes": ones
flattened in a previous session.

**Fixed** on both sides, defence in depth:

- **Worker (containment):** the `img` shim now rejects asynchronously as soon as
  `src` is set. An unrecoverable pump stall becomes one skipped object.
- **Main (correctness):** `hasImageClip()` inspects the live `clipPath` for an
  image child instead of trusting the flag, memoizing the result back onto it. So
  these objects are refused up front and **bake locally, where images work** —
  they render correctly rather than merely failing safely.

The general lesson, which this whole sequence keeps repeating: a worker shim that
silently no-ops is far more dangerous than one that throws. Anything that hangs
in a serial pump takes the entire subsystem down with no error to trace.

## Eighteenth review — CONFIRMED root cause: `distanceFrom is not a function`

The trigger behind R15/R16, now reproduced rather than inferred.

### R17 — ✅ FIXED — `buildPathString` called Point methods on deserialized data

```ts
dist = basePoints[i - 1].distanceFrom(point);   // Point METHOD
```

`basePoints` comes from callers **and from deserialized JSON**, where a point is
a bare `{x, y}` object with no prototype. `distanceFrom` is then `undefined`:

```
old impl on same data -> throws: TypeError: prev.distanceFrom is not a function
```

**Older** WaterColorStrokes hit this every time — they were serialized before
`compressedTrace` existed, so their points round-trip as plain objects and take
the `options.basePoints` branch. Newer strokes decode `compressedTrace` into real
`Point`s in the constructor and were unaffected, which is exactly why this looked
like "only some strokes, only old drawings".

The throw rejected `util.enlivenObjects`, which (R15) was all-or-nothing — so one
old stroke destroyed the enliven of **every tile it appeared in**, and the old
fallback then re-enlivened those tiles sequentially. That is the whole chain:
old stroke → batch reject → slow sequential path → bake exceeds its budget →
timeouts → 30s pause → main-thread baking.

**Fixed** by making the geometry data-shape agnostic:

- `buildPathString` computes distance with plain arithmetic
  (`Math.hypot(point.x - prev.x, …)`), so it accepts `Point`s *and* bare
  `{x, y}`. The bristle points it builds internally are still real `Point`s, so
  `midPointFrom` stays valid.
- `width` is clamped when non-finite — older payloads can lack `strokeWidth`, and
  the caller divides it, which produced `NaN` coordinates and an unparseable
  `"M NaN NaN …"` path string.
- The constructor drops malformed `basePoints` entries instead of letting them
  throw mid-enliven.

Verified against the exact old shape (bare `{x,y}` points, missing
`strokeWidth`): now produces a valid path, and the old implementation throws on
the same input.

**The lesson worth keeping:** a class whose `fromObject` must survive JSON from
*every* app version cannot assume its own runtime types. Prototypes do not
survive serialization. Any `fromObject` reading array/point data should treat it
as plain data — the other brushes are worth auditing on the same basis.

## Seventeenth review — one broken stroke poisoned every tile it touched

Field finding: `ensureLiveMany` fails on a `WaterColorStroke`. Two defects — the
amplifier and (most likely) the trigger.

### R15 — ✅ FIXED — `enlivenObjects` is all-or-nothing, and the fallback was the slow path

```ts
const enlivened = await util.enlivenObjects(needJson)   // ONE bad object → whole batch rejects
} catch {
  for (...) out[i] = await ensureLive(ids[i])           // → re-enliven EVERYTHING, sequentially
}
```

So a single stroke whose `fromObject` throws made **every bake of every tile
containing it** take the slowest possible route — N sequential enlivens — and the
object still ended up missing. That is the "dense board takes ages then times
out" behaviour, and it was invisible because the failure was swallowed by a bare
`catch {}`.

**Fixed:** `Promise.allSettled` over per-object enlivens. Concurrency is kept
(they all start immediately; we await the set, not each in turn) while a failure
is contained to its own slot — the tile renders everything else. And failures are
now **reported once per type** (`noteEnlivenFailure`) instead of silently
swallowed, so a systematically broken class is visible rather than merely slow.

### R16 — ✅ FIXED (most likely trigger) — WaterColorStroke built a temp instance from RAW json

`WaterColorStroke.fromObject` is the only class that constructs an instance
*before* `enlivenStrokeProps` runs:

```ts
const tempInstance = new WaterColorStroke([], stripType(object));
```

At that point `clipPath` and `shadow` are still **raw JSON**. Handing those to a
fabric constructor is a genuine hazard — fabric expects live instances and calls
methods on them — and an **erased** WaterColorStroke always carries a `clipPath`
(the reported object has `erasable: true`). That throw is what took the batch
down.

**Fixed:** the temp instance exists only to decode `compressedTrace` into
`basePoints`, so it is now built from a bare copy with `clipPath`/`shadow` (and
`type`) stripped. The real instance still gets fully-enlivened props.

R16 is a strong hypothesis rather than a confirmed stack trace — but R15 makes
its cost survivable either way, and the new per-type warning will name the
culprit outright if anything else is still failing.

## Sixteenth review — `case 'bake'` never runs: the message pump was poisoned

Decisive observation from the field: a `console.log` inside the worker's
`case "bake"` **never fires** on a big drawing. So the tile was never rendered at
all — every request simply sat until its timeout, which is why no amount of
timeout tuning helped. Two structural defects in the pump, both fatal.

### R13 — ✅ FIXED — one rejected handler killed the pump permanently

```ts
chain = chain.then(async () => { ... })   // no rejection handler
```

`chain.then(onFulfilled)` **skips** `onFulfilled` when the chain is already
rejected, and propagates the rejection. So a single handler that rejects poisons
the chain **forever**: every later message is silently dropped, `case 'bake'`
never executes again, and every request times out until the bakery pauses. The
worker looks stuck because it effectively is — while still being alive enough to
receive messages.

Reproduced standalone:

```
OLD processed: ["old:a"]              ran the bakes after the failure: false
NEW processed: ["new:a","new:bake1","new:bake2"]   ran the bakes: true
```

**Fixed:** `chain = chain.then(run, run).catch(() => {})` — `run` is installed as
*both* the fulfilled and rejected handler, so the pump resumes after a failure,
and the trailing `catch` keeps the stored promise settled. (Same pattern already
used by `enqueueHistoryOp`.) The inner error reporting is now also wrapped, so a
failure while reporting a failure cannot escape.

### R14 — ✅ FIXED — a handler that never settles parks the pump forever

The pump is strictly serial, so one awaited handler that never resolves blocks
every later message just as completely as a rejection — same silent-stall
symptom, no error anywhere.

That is not hypothetical here: several `fromObject` implementations await image
decoding (`fabric.util.loadImage`), and the worker's `img` DOM shim never fires a
`load` or `error` event, so such a promise can hang indefinitely. A dense drawing
is simply more likely to contain one.

**Fixed:** `bake` and `overview` now run under a 15s watchdog
(`withWatchdog`). On expiry the handler rejects, the client falls back to a local
bake for that tile, and — critically — **the pump moves on**. Losing one tile is
always better than losing the worker.

Together these turn a permanent silent stall into, at worst, one slow tile.

## Fifteenth review — dense-tile timeouts: budget by WEIGHT, and measure it

Still timing out on a dense board after the fourteenth review. Two more real
defects, plus instrumentation — because this has now been diagnosed by inference
three times and needs a number instead.

### R11 — ✅ FIXED — the timeout ignored how much work the tile actually contained

The budget was flat (8s warm), later scaled only by queue depth. But the cost of
a tile is driven by **how many objects it holds**: a tile with 1200 strokes has
to enliven and render 1200 strokes. On a dense board that is legitimately slow,
and a flat budget declared it *stuck* — 8 in a row → 30s pause → everything on
the main thread, which is exactly the reported symptom.

**Fixed:** the budget is now
`(base + 6ms × objectCount) × (1 + queueDepth)`. A 1200-object tile gets ~15s of
its own budget instead of 8s for any tile. This only decides when we give up; it
never delays a healthy reply.

### R12 — ✅ FIXED — 4 bake lanes against a strictly serial worker

The worker renders through a **serial FIFO chain**, so extra lanes buy **no
parallelism at all** — they only deepen its queue. With 4 lanes every tile waited
behind 3 others, so each tile's end-to-end latency was ~4× its own render time.
Two consequences, both matching the report: tiles landed in late clumps rather
than sharpening one by one, and requests blew their budget while the worker was
perfectly healthy.

**Fixed:** `lanes` 4 → 2. Enough to keep the worker fed (one rendering, one
queued) at half the latency and half the queue depth.

### Instrumentation — stop guessing

`__drawPerf()` now reports the numbers that settle this:

| Field | Meaning |
| --- | --- |
| `bakeMsMax` / `bakeMsMean` | worker round-trip for ONE tile bake |
| `bakeObjectsMax` | objects in the heaviest tile dispatched |
| `bakeTimeouts` vs `bakeryPauses` | abandoned requests vs actual pauses |

That distinguishes the two remaining hypotheses, which need very different fixes:

- **`bakeObjectsMax` is huge (say >800) and `bakeMsMax` scales with it** → the
  tile genuinely contains that many objects. Long strokes have large bounding
  boxes, so each one is re-rendered in *every* tile it crosses: the cost is
  O(strokes × tiles crossed), not O(ink). The fix is finer-grained indexing
  (segment-level entries, or splitting long strokes), not tuning timeouts.
- **`bakeObjectsMax` is modest but `bakeMsMax` is still seconds** → the per-object
  cost is the problem (shadows on strokes are the prime suspect — canvas
  `shadowBlur` is extremely expensive and would be paid per object per tile).

Both are addressable, but they are different changes, and picking the wrong one
wastes another round.

## Fourteenth review — slow tile sharpening + the spurious 30s bakery pause

`[TileBakery] paused for 30000ms after timeout` on a dense zoom. Three causes,
compounding. The pause is a *symptom*: the worker was healthy and busy, not stuck.

### R8 — ✅ FIXED — the timeout charged a request for the queue ahead of it

The worker handles messages through a strictly serial FIFO chain, but the timer
started when we **posted**. `bake()` keeps **4 lanes** in flight, so on a dense
board (~2s per tile) the 4th request had already burned 6s queued before it even
started, and blew the 8s budget. Eight of those in a row tripped
`MAX_CONSECUTIVE_TIMEOUTS` → **pause 30s → every tile on the main thread**, which
is what made sharpening crawl.

**Fixed:** the budget now scales with queue depth —
`base * (1 + pending.size)` — so a timeout once again means "the worker is
stuck", not "the worker is busy".

### R9 — ✅ FIXED — the worker LRU went cold 4s after the last bake

`IDLE_SHRINK_MS = 4000` with `IDLE_MAX = 192` meant: pause four seconds, then
zoom, and the worker had thrown away nearly every enlivened object and had to
rebuild them all from JSON.

This was **masked for a long time** because the remote overview re-enlivened the
entire scene on every rebuild and kept the LRU hot as a side effect. Removing it
(R7 — still the right call) took that away, so every zoom started paying a full
cold re-enliven. That is why this surfaced immediately after the load fix.

**Fixed:** a pause of a few seconds is normal *interaction*, not "at rest" —
`IDLE_SHRINK_MS` 4s → 30s and `IDLE_MAX` 192 → 768 (`LIVE_MAX/4`). The working
set survives normal use; a genuinely idle canvas still releases the memory.

### R10 — ✅ FIXED — the worker enlivened a tile's objects one await at a time

```ts
for (let i = 0; i < ids.length; i++) objs[i] = await ensureLive(ids[i])
```

N sequential promise round-trips per tile — the same shape as the overview bug,
just per-tile. Replaced with `ensureLiveMany`, which collects everything not
already in the LRU and hands it to fabric in a **single** `enlivenObjects` call.
Falls back to the per-id path if that batch throws, so one bad object cannot
lose the tile.

**Verified** (standalone, index alignment — wrong order would corrupt z-order):

```
ids: ['a','b'(cached),'MISSING','c','d']
result: ["NEW_a","LIVE_b",null,"NEW_c","NEW_d"]   order preserved: true
```

Together: bakes get materially faster (R10), stop going cold between
interactions (R9), and can no longer trigger a false pause when they are merely
slow (R8).

## Thirteenth review — the 10–15s load: the worker overview re-enlivened the whole scene

### R7 — ✅ FIXED — `remoteOverview` was a pessimization, and it sat on the critical path

~1500 pencil strokes took 10–15s before anything appeared. Cause:

The overview is **one low-res bitmap covering the WHOLE board**, so rendering it
in the worker means the worker needs *every object in the scene*. Its loop is:

```ts
for (let i = 0; i < ids.length; i++) {
  const obj = await ensureLive(ids[i])   // JSON.parse + enlivenObjects, ONE AT A TIME
```

and `ensureLive` rebuilds each object from its JSON — for a pencil stroke that is
`inflateTrace` plus a `new Path(...)` with fabric's path normalisation. So the
worker re-created, **sequentially**, all 1500 objects that the main thread had
*just finished enlivening* during load. A complete duplicate enliven of the
drawing — and the load reveal **awaits it** (`warmOverviewBlocking`), so the user
watches a blank canvas throughout.

The LOCAL path renders the same overview directly from `visible[]` — the live,
already-enlivened objects — with **no rebuild at all**, yielding per object so it
never blocks input. Strictly less total work, which is exactly why the
pre-worker behaviour was faster.

**Fixed:** `remoteOverview` is no longer wired. The worker keeps what it is
genuinely good at — **tiles**: high-res, numerous, re-baked constantly, and each
one needs only the handful of objects intersecting it, so its enliven cost is
bounded per tile and amortized by the LRU instead of being O(whole scene) on the
path to first paint.

**The general lesson** (worth remembering before adding the next worker path):
moving work off-thread is only a win if the worker doesn't have to *reconstruct
state the main thread already holds*. Tiles pay that cost once per object and
reuse it across many bakes; a single whole-board bitmap pays it for every object
and uses each exactly once.

`bakeryRenderOverview` is left in the service, unwired — re-enabling it is a
one-line change if the mirror is ever kept permanently live, but it should not be
used for a cold load.

Cost of the revert: the overview render is main-thread again, O(N) *low-res*
renders, yielded. On a very large board that is a few hundred ms spread across
frames — versus 10–15s of nothing.

## Twelfth review — the dense-load stall: an un-cloneable upsert payload

### R6 — ✅ FIXED — `fromObject` polluted the blob that gets posted to the worker

Symptom: `[TileBakery] upsert payload was not structured-cloneable; sent a
JSON-sanitized copy`, and dense drawings loading slowly.

That warning is not cosmetic. It means `postMessage` **threw**, and the fallback
ran `JSON.parse(JSON.stringify(items))` — a full serialize *and* re-parse of up
to `MAX_FLUSH_ITEMS` (192) objects, **on the main thread, for every batch**. On a
dense drawing that is the load stall.

Root cause: `drawload.helper` stashes the exact source JSON an object was
enlivened FROM as `__bakeJSON` (to seed the mirror without a second `toJSON`) —
and it stashes it **after** `enlivenObjects` has run. Our `fromObject`
implementations mutate that blob in place:

| Where | Wrote into the source JSON | Cloneable? |
| --- | --- | --- |
| `PixelStroke.fromObject` | `object.stampCanvas = <HTMLCanvasElement>` | **No** |
| `CharcoalStroke.fromObject` | `object.stampCanvas = <HTMLCanvasElement>` | **No** |
| `enlivenStrokeProps` | `object.clipPath` / `object.shadow` = live fabric instances | **No** |
| `stripType` (mine, R4) | `delete object.type` | cloneable, but the worker then **cannot resolve the class** |

The first three predate this work; the fourth was mine from the previous review
and was worse than slow — it silently broke worker enlivening for every stroke
routed through `enlivenStrokeProps`.

**Fixed** by making the enliven path **non-destructive**:

- `enlivenStrokeProps` copies first (`const out = { ...object }`) and enlivens
  `clipPath`/`shadow` only on the copy. The worker wants the RAW clipPath JSON
  anyway — it enlivens it itself.
- `stripType` returns a copy instead of deleting in place, so `type` survives in
  the blob the worker needs it in.
- `PixelStroke` / `CharcoalStroke` attach their stamp canvas to the returned
  copy, never to `object`.

So `__bakeJSON` stays pristine: fully structured-cloneable (zero-copy
`postMessage`, no sanitize fallback) and complete (worker can resolve the class).

**Verified** (standalone, `structuredClone`):

```
source keeps type: true          props has no type: true
source.clipPath still plain JSON: true
source structured-clones: true
polluted shape: throws DataCloneError  -> the slow JSON-sanitize path
```

**Worth keeping in mind:** the `postUpsert` fallback silently converts this class
of bug into a large main-thread cost with only a `console.warn`. If that warning
ever reappears, something is writing a live object into a serialized blob again.

## Eleventh review — a self-inflicted load regression, fabric warnings, unblur cost

### R3 — ✅ FIXED (REGRESSION I INTRODUCED) — worker font loading blocked the whole message chain

**This is why loading and first-unblur got dramatically slower.** The worker's
`config` handler did:

```ts
post({ msgId: -1, fonts: await loadFonts() })
```

`loadFonts()` fetches and decodes **~10 font files**. That `await` sits inside
the FIFO-chained message handler (`chain = chain.then(...)`), so **every
subsequent message — every `upsert`, every `bake` — queued behind it.** On a cold
cache the entire mirror stalled for seconds: the drawing stayed blank long after
the loading indicator disappeared, and the first zoom took far longer to sharpen.
Introduced with the worker-fonts work (F3-A) and matches the report exactly
("before this was really fast").

**Fixed:** fire it off without awaiting —
`void loadFonts().then((fonts) => post({ msgId: -1, fonts }))`. The FIFO
guarantee we actually rely on (an upsert applied before the bake that reads it)
is untouched, and text tiles stay refused main-side until the `fonts` reply
arrives, so nothing can bake with a missing face meanwhile.

### R4 — ✅ FIXED — `fabric: Setting type has no effect` on every stroke enliven

fabric v6 derives `type` from the **class** (`static type`), so assigning it
per-instance does nothing and logs a warning. Our `fromObject` implementations
pass the raw JSON — which carries `type` — straight into `new XStroke(props)`,
whose `super()` assigns the options onto the instance. So it fired **once per
stroke on every enliven**: the whole scene on load, and again on every worker
re-enliven (the LRU re-enlivens constantly). Not just log noise — fabric builds
the message string every time.

Fixed centrally with `stripType()` in `brush.helpers`, called from
`enlivenStrokeProps` (covers Pencil, Charcoal, Circle, Calligraphy, Neon, Spray,
Crayon, Pixel, BucketFill) plus two paths that bypass that helper and had to be
handled directly: `OptimizedEraserStroke.fromObject` (never calls it) and
`WaterColorStroke.fromObject`'s temp instance (built from the raw JSON *before*
the helper runs).

### R5 — ⚠️ PARTLY FIXED — the hitch exactly when tiles replace the blur

Correctly diagnosed in the report: the cost is at tile-STORE time. Three
contributors, one of which I added:

1. **The F9 progress repaint (mine).** It fires once per stored tile, and a pass
   stores dozens — so a full composite ran on *every* animation frame for the
   whole bake pass, where previously there was a single composite at the end.
   A composite is a full-surface clear plus a `drawImage` per visible tile.
   **Fixed:** skip entirely while gesturing (covers tiles already in flight when
   the gesture starts — bakes are aborted, but in-flight ones still land), and
   throttle to ~8 updates/sec. Still visibly progressive, far cheaper. The final
   composite is still guaranteed by `runBake`'s own `requestFrame()`.
2. **GPU texture upload.** The first `drawImage` of each freshly stored
   `ImageBitmap` uploads it as a texture. Many tiles landing at once = many
   uploads in one frame. Inherent to the tile design — this is F5, still open,
   and the reason `dropOtherTiers` churn matters.
3. **`overlaySkipped` on hybrid tiles** — a synchronous main-thread render per
   tile that has skipped objects. Only bites on boards mixing images/bitmap
   strokes with strokes; F3-B's asset transfer reduces how often it triggers.

> None of this is verified in-app (sandbox is backend-gated). R3 is the one to
> check first — load time should return to what it was.

## Tenth review — cheaper per-stroke serialization (H4)

### Can it go to a worker? — No, and it's worth being precise about why

`toJSON()` cannot be off-threaded. The live fabric object exists **only** on the
main thread, and serializing it *is* the act of making it transferable — you
cannot hand the object to a worker without first serializing it. Chicken and egg.
What already runs off-thread is everything *after*: the tile-bakery worker does
its own `JSON.stringify` of the mirror payload on the worker side.

### Can compression help? — Not for this cost

Compression reduces **bytes**, not the object-graph traversal that `toJSON()`
performs, and that traversal is the main-thread cost being measured. Compressing
on the main thread would *add* to it. (The existing `compressedTrace` delta+round
encoding already shrinks the payload for pencil/eraser/watercolor; extending it to
the remaining brushes is worth doing for wire and snapshot size — see H4 — but it
does not move this frame cost.)

### X3 — ✅ FIXED — the same stroke was serialized THREE times per commit

The real lever, and it needs no format change at all. Committing one stroke fired
three separate `toJSON()` calls off the **same** `object:added` dispatch:

1. `drawSyncEngine` — the `draw-event` wire payload;
2. `drawHistoryManager` — the undo entry;
3. the tile-bakery mirror — via `bakeryMarkDirty` → deferred flush → `serialize()`.

At ~0.2 ms desktop / ~2 ms mid-Android for a long stroke, that is ~6 ms per
stroke on the very frame that is also stamping tiles.

**Fixed** with `serializeOnce()` (`helpers/object.helper.ts`): `toJSON()` memoized
per object per **microtask tick**. All three consumers now share one result, and
the bakery is seeded from it directly (`bakerySeed(obj, serializeOnce(obj))`)
instead of marking dirty and re-serializing later. **3 → 1.**

Output is byte-identical to `toJSON()`, so the wire format, history entries and
stored drawings are all unchanged — **fully backwards compatible**, purely
de-duplicated work.

**Why a tick and not a persistent cache:** a stale serialization would silently
corrupt an undo entry or a synced stroke. Scoping the memo to a single microtask
makes staleness structurally impossible — nothing mutates an object between two
handlers of the same synchronous event — while still catching all three
consumers.

**Invariant:** the result is shared, so callers must treat it as READ-ONLY.
Verified across the codebase: every consumer only reads it (`insertedIndex` and
friends are written to the *live object*, never the payload). Fabric's
`fromObject` *does* mutate the JSON it is handed, but that happens at enliven
time — undo/redo/remote-apply — long after this tick.

**Verified** (standalone harness, `serializeOnce` semantics):

```
same tick        -> toJSON calls: 1   (was 3), all consumers share one ref
after tick + mutation -> recomputes, reflects the new value, no stale reuse
```

## Ninth review — full sweep for remaining main-thread blockers

Targeted scan of `drawObjectManager`, `drawHistoryManager`, `drawSyncEngine` +
`drawSyncing.config`, `renderCore`, `committedLayer`, `worldOverview` and the
eraser, looking for the classic blockers: unbounded synchronous loops, pixel
readbacks, image encodes, clones, and serialization on hot paths.

### X1 — ✅ FIXED — a redundant synchronous PNG encode inside the erase commit

The single worst thing left, and it was pure waste.

`bakeClipGroupIfNeeded` did:

```ts
(baked as any).src = el.toDataURL("image/png");
```

That is a **synchronous PNG encode of a canvas up to `MAX_BAKE_PX` (~4 MP)**, on
the main thread, in the middle of the erase commit — atomic and un-yieldable,
roughly 100–500 ms on mobile, firing every `flattenClipAfter` strokes per
object. On its own enough to trip an ANR.

And it was **redundant**. fabric's `getSrc()` — which is what `toObject` uses —
begins with:

```js
if (element.toDataURL) return element.toDataURL();
```

Our element *is* a canvas, so serialization already produces the identical data
URL from it whether or not `src` was set. Nothing in the RENDER path reads `src`
(only `toObject`/`toString` do). So the eager encode changed no pixels and no
persisted output — it just moved a large cost onto the erase frame instead of
the moment something actually serializes, which is already a yielded background
path (save, sync). Deleted.

### X2 — ✅ FIXED — incremental previews could be wiped by a mid-stroke frame

A hazard introduced by D1 (previous review). `rerenderActiveObjectControls`
clears the shared TOP context on every composited frame while an object is
selected, and a frame can land mid-stroke (a remote sync edit, a demote
repaint). The old redraw-everything previews self-healed on the next pointer
move; the new incremental ones would not — the stroke would stay invisible until
pointer-up.

Fixed with a top-context epoch (`render.helper.ts`): the clear bumps it, and
each incremental brush repaints in full when it changes. Cheap, and it makes the
O(n) preview safe against any future clear as long as it goes through the helper.

### Checked and clean — no action needed

| Area | Why it's fine |
| --- | --- |
| Erased-check sweep (`eraser.store`) — `toCanvasElement` + `getImageData` per object | Already idle-scheduled, yielded (8 ms budget), coverage-capped with FIFO eviction, and the readback context uses `willReadFrequently: true`, which keeps the canvas CPU-backed and avoids a GPU pipeline stall. Good hygiene. |
| `getZIndexMap()` — O(all objects) | Already incremental: adds/removes stamp a single object; the full rebuild only runs on wholesale z changes (layer ops). |
| `computeContentBounds()` — O(all objects) | Already removed from `endBatch`; growth is covered incrementally by `growContentBounds`, and the full scan only runs on load/reset. |
| `composite()` per frame | Reuses instance scratch for the tile-draw descriptors; a steady-state frame allocates nothing. |
| Remote-sync drain | Sliced + yielded + per-slice batched (S1). |
| History | Lazy JSON payloads, both stacks capped, `actionWeight` no longer forces serialization (H1–H3). |
| `bake()` sort / lane setup | Bake-time, not per-frame, and bounded by the viewport tile count. |

### Inherent, accepted (not blockers)

- **~2 ms `toJSON` per committed stroke**, paid twice — once for the history
  entry, once for the sync wire. Required by both formats; the scalable fix is
  cheaper stroke serialization (H4), not deferral.
- **`union.toCanvasElement()` in the flatten** — a real render, still on the main
  thread, but it is actual work (not waste like X1) and is yielded between
  objects. Bounded by `MAX_BAKE_PX`.
- **Clip-asset transfer + lowering `flattenClipAfter`** — the remaining
  ceiling-lifter for erase, scoped in the eighth review.

## Eighth review — can per-object erase clips go? + O(n²) live previews

### Can we drop per-object `ClippingGroup` clips entirely? — analysed: NO, and why

The proposal: stop clipping each erased object and instead put the eraser stroke
in the scene as a z-ordered `destination-out` object, so a tile just composites
it in order. Attractive — it would make erased objects exactly as cheap as any
other. Three blockers, in increasing severity:

1. **It changes user-visible behaviour.** The clip lives in OBJECT space, so
   erased holes travel WITH the object: move an erased stroke and it stays
   erased (a layer mask). A scene-level mark stays where it was drawn, so
   dragging the object out from under it would UN-ERASE it. That is a semantic
   regression, not a refactor.
2. **It breaks selective erasing.** Scene-level `destination-out` hits
   everything below it in z — including content that must survive (other users'
   objects in a public lobby, claimed areas; the `selective` path). Restricting
   a mark to "only these objects" is per-object clipping again, just relocated.
3. **Wire + persistence.** The server spreads `action` into its replay buffer and
   re-broadcasts to MIXED-VERSION clients (see the `draw-sync-wire` note), so a
   new erase-mark object type would reach older clients as an unknown object —
   or a solid black stroke. Every stored drawing (IDB drafts, snapshots) also
   holds clip-based erases, so both representations would have to be supported
   indefinitely. That needs a v4 gate plus a bridge.

So the wholesale replacement is not the right move. **The bounded path that gets
most of the win without touching semantics or the wire is different — and the
asset work from the seventh review just unblocked it:**

`bakeClipGroupIfNeeded` already bounds per-render clip cost by collapsing old
strokes into one image. But that sets `__hasImageClip`, which the bakery
**refuses** → those objects fall back to MAIN-THREAD baking. So today the very
mechanism that bounds clip cost pushes work back onto the main thread, and
`flattenClipAfter` (50) can't be lowered without making that worse.

Fix, in order:
  1. Extend the `{ t:'asset' }` transfer to **clip** bitmaps — ship the flattened
     clip image keyed by object id (a second asset slot), have the worker
     rebuild a `ClippingGroup` around it, and drop the `__hasImageClip` refusal.
  2. Then lower `flattenClipAfter` from 50 to ~8. Per-render clip cost drops
     roughly 6× **and** those objects stay off the main thread.

Step 2 alone is a one-line change and is **not** safe before step 1 — it would
simply convert clip cost into main-thread bake cost. Scoped, not implemented:
it needs the second asset key plus worker-side clip reconstruction, and this
environment cannot verify rendering.

### D1 — ✅ FIXED — live stroke previews were O(n²) (Charcoal, Pixel, Circle)

Hunting the "drawing and zooming still lag on busy canvases" report. The
object-count-scaled suspects were already handled (incremental `__z` stamping;
`endBatch` no longer recomputing content bounds), so the remaining cost is
per-stroke — and it is significant.

All three stamp brushes did, on **every** qualifying pointer move:

```ts
this.canvas.clearContext(this.canvas.contextTop);
this._render();          // ← redraws EVERY stamp accumulated so far
```

So a stroke of n stamps costs **O(n²)** draw calls: a 500-stamp charcoal stroke
issues ~125 000 `drawImage`s instead of 500, and it gets progressively worse the
longer you hold the pointer down — while competing with the tile engine for the
same frames. That matches "lags a bit, especially on busy canvases", where the
main thread has least headroom to absorb it.

**Fixed** by rendering incrementally: each brush tracks how far it has drawn and
paints only the stamps added since. Because the old code cleared first, every
stamp was composited exactly once — and it still is — so output is
**pixel-identical** at O(n) total. Two cases still force a full repaint and are
handled explicitly: the viewport moved (the preview is drawn in WORLD space
through the vpt, so a mid-stroke zoom/pan invalidates what's on screen), and a
new stroke started.

WaterColor is deliberately left alone: it strokes a single alpha path, so
drawing only the new segment would double-composite at the joins.

## Seventh review — F3-B bitmap assets + bucket-fill escalation

### F3-B — ✅ IMPLEMENTED — bitmap-backed strokes now bake in the worker

The last class of objects forcing main-thread bakes: Pixel (tip stamp rebuilt
from `stampDataUrl` via image decoding — impossible in a worker) and the
`FabricImage` strokes Neon/Spray/Crayon (bitmap regenerated by an expensive
generator on every enliven). Any tile containing one fell back to a local bake.

**Design — ship the pixels once, as a transferable.** New `{ t:'asset', id,
bitmap }` message carrying an `ImageBitmap` (transferred, so no copy and no
main-thread encode). The worker keeps `assets: Map<id, ImageBitmap>` and injects
it at enliven time as `__workerBitmap`; the three image strokes short-circuit
their generator when it's present, and Pixel needs **no class change** — the
bitmap is injected as `stampCanvas`, which short-circuits its `loadImage`.

Why an asset rather than letting the worker regenerate (now that B2 made the
generators deterministic): regeneration would re-run a blurred-glow/pattern build
on *every* enliven, and the LRU re-enlivens constantly. Transferring the finished
pixels is strictly cheaper and removes the last correctness gamble.

**Fail-safe by construction.** An id whose asset hasn't landed is refused → local
bake, i.e. *exactly* the previous behaviour. So this can only add capability:
worst case it's today, best case the tile goes off-thread. `ensureAsset` is async
and fire-and-forget, so the current bake still takes the local route and the
*next* one uses the worker.

**Memory.** Bitmaps are the cost, so the sender caps the total shipped
(64 MB desktop / 24 MB mobile) and never re-sends. Past the cap nothing more is
sent and those objects keep baking locally. Deliberately **no worker-side
eviction**: silently dropping an asset would strand an object as unrenderable
with no way for the sender to learn of it. Assets are freed on `remove`/`clear`,
where the worker closes the bitmap and the sender releases the budget.

Real user images (`type === 'image'`) are still excluded — checked *before* the
asset path, since a real image is also `instanceof FabricImage`, and its pixels
are a photo (budget) and possibly cross-origin.

Expected effect: on boards using these brushes, tiles that previously forced a
main-thread render now bake off-thread. `tilesRemote` vs `tilesRefused` in
`__drawPerf()` is the measurement.

### BF1 — ✅ FIXED — large enclosed bucket fills rejected as "Area too large"

The edge-touch test is the only reliable "unbounded" signal, but at a fixed
buffer it **cannot distinguish a genuinely large CLOSED shape from a leak** —
both run off the border. So filling a big circle failed.

**Fix: retry with a bigger buffer while holding `pxScale` CONSTANT.** Barrier
legibility depends only on `pxScale` (a stroke must rasterize to
`>= MIN_BARRIER_PX` or the flood leaks through it), so growing the buffer at
fixed `pxScale` buys proportionally more world coverage with *identical* leak
behaviour — strictly more area, no accuracy trade. Buffers escalate
1200 → 2048 → 2600 px (mobile stops at 2048 on memory); only the transient
`ImageData` grows, and it lives in the worker for one fill.

The original protection is intact: a true empty-canvas flood still reaches the
border at *every* level and is rejected at the last one. Level 0 is byte-identical
to the previous behaviour, so ordinary small fills cost nothing extra — only a
fill that would previously have been *rejected* pays for a retry. The worker now
reports `edgeTouched` separately so only that case retries; the absolute
`MAX_WORLD_AREA` remains as a final sanity cap on the vector being built (raised,
since the edge test is the meaningful guard).

> Unverified in-app (sandbox is backend-gated). Both changes are build-clean and
> fail-safe; the checks on device are `tilesRefused` dropping on brush-heavy
> boards, and filling a large circle succeeding while filling empty canvas still
> refuses.

## Sixth review — brush determinism (the "mismatch"/"flash") + remote-sync smoothness

### B1 — ✅ FIXED — WaterColor changed shape once its tile baked

`getDeterministicNoise` is a position **hash** (`sin(x*k)*43758 mod 1`) — chaotic,
so any change to `x`/`y`, however small, gives a completely different value.
`WaterColorStroke.toObject` stores `basePoints` **rounded to 0.1** and DROPS the
baked `path`, so `fromObject` re-derives the bristle geometry from the rounded
points. Live/just-drawn used exact floats; anything re-hydrated (the worker
mirror round-trips through exactly this, plus reloads and sync) used rounded ones
→ **an entirely different set of bristles**. The stroke visibly changed the
moment its tile baked. That is the "watercolor looks different after commit".

**Fixed** by quantizing to the same 0.1 grid *inside* the hash, so
`noise(x) === noise(round(x, 0.1))` and serialize→deserialize is idempotent.
Live, committed, worker-baked and reloaded renders now agree. (The `wave` term
uses `sin(totalDist)`, which is continuous — rounding perturbs it
imperceptibly, so it needs no change.)

### B2 — ✅ FIXED — procedural brush textures differed between worker and main

`generateCharcoalStamp` and the Crayon/Neon/Spray pattern builders sized their
texture from `window.devicePixelRatio`. The tile worker's DOM shim aliases
`window` to `globalThis`, which **has no `devicePixelRatio`** — so the worker
supersampled at 1 while the main thread used 2–3, and the same stroke rendered
with different grain depending on where it was rasterized. On a worker-baked
tile the texture visibly changed. Two of the call sites (Spray, Neon) also had
**no `|| 1` fallback**, so off-main they computed `NaN` canvas dimensions.

**Fixed** with a shared device-independent `TEXTURE_SUPERSAMPLE` constant in
`brush.helpers.ts`. A brush texture is a small fixed asset, not viewport pixels —
pinning it makes rasterization deterministic across worker/main and across
devices, which is what a shared tile cache and multiplayer both require.

Together B1+B2 remove the two *provable* live-vs-committed divergences behind the
reported "flash / funky / looks different after drawing". Not visually confirmed
here (sandbox is backend-gated) — worth re-checking per brush on a device.

### S1 — ✅ FIXED — a remote burst blocked the local user's pan/zoom

Audit of `drawSyncEngine.processActionQueue`. What was already right: actions are
**queued**, the drain is **batched** (`beginBatch`/`endBatch` → one coalesced
`invalidateRegions`), and it is **gesture-gated on entry** (`isUsingGestures`).

What was wrong: the drain was a single `while` over the **entire** queue with no
yield. `await` on an already-resolved promise only drains microtasks, so a burst
(a fast remote drawer, or the replay buffer on join) applied every queued action
— enliven + add + index each — back-to-back with no chance for input to
dispatch. Exactly the "other people's events ruin my smoothness" case. And
naively adding a yield inside that one batch would have held it open across
frames, deferring a *local* stroke's invalidation to the end of the burst.

**Fixed** by slicing: each slice opens its own batch, applies actions until an
8 ms (4 ms mobile) budget is spent, closes the batch so that slice repaints, then
yields. Since `yielder.yield()` waits a full RAF when input is pending, an active
gesture throttles the drain to one slice per frame instead of competing with it.
Re-entrancy is unchanged.

**Not** done: viewport culling of remote actions. Off-screen remote edits still
pay enliven+add (they must — the object has to exist in the scene); only their
*rendering* is viewport-gated, by `invalidateRegions`. Time-slicing is the right
lever here, and that is what landed.

### Still open after this pass

- **All brushes worker-bakeable.** Blocked on the four bitmap-backed strokes
  (Pixel via `stampDataUrl`; Neon/Spray/Crayon as `FabricImage`). They bake on
  main today (correctly — see R1/R2). The fix is F3-B: `createImageBitmap` the
  element on main and post it as a **transferable** into the mirror, so the
  worker can `drawImage` it. Real project — new mirror protocol, per-object
  bitmap lifetime/eviction — and not safe to land without visual verification.
- **Eraser structural rewrite.** E9 removed the whole-object re-serialize; the
  remaining cost is that every erase still attaches a per-object `ClippingGroup`,
  so erased objects stay costlier to bake and bound forever. The ceiling-lifter
  is to stop representing erases as N per-object clips — see the note at the end
  of the fourth review. Still the largest single item.
- **Bucket fill "area too big"** — needs a repro to disambiguate (fill leaking
  past its enclosure vs. the `Area too large` toast firing on legitimate fills);
  the guards are the edge-touch test and `MAX_WORLD_AREA` in
  `bucketFill.worker.ts`, sized against `MAX_WORLD_DIM = 2500`.

## Fifth review — the structural erase change: clip-granular mirror sync + flash

### E9 — ✅ STRUCTURAL — erase syncs the worker mirror at CLIP granularity, not whole-object

**The root of "undo then pan lags with a lot of objects."** An erase mutates
only an object's `clipPath`, but the mirror sync marked the whole object dirty,
so the bake path re-serialized the ENTIRE object (its own — often large — path +
all props + the clip) for *every* touched object, on the pan/undo frame.

Two structural alternatives were rejected as wire/correctness-breaking:

- **Z-order eraser objects** (drop per-object clips, add a destination-out stroke
  above targets): cleanest for perf and undo, but destination-out hits *everything*
  below it → breaks selective erasing / claimed-area protection, and it changes
  the persisted + multiplayer representation (the server spreads `action` to
  mixed clients — see the `draw-sync-wire` memory). A v4 wire + a selective
  fallback — a multi-session project, not a safe single change.
- **Full stroke-delta protocol**: guessing the `ClippingGroup` JSON shape mirror-
  side is exactly where an unverifiable bug would hide.

**What landed** (`t: 'clipSet'`): erase commit / undo / redo ship just
`clipPath.toObject()` — the exact sub-tree a full `toJSON` puts under `clipPath`,
so the worker mirror ends up byte-identical — and CLEAR the object's dirty flag.
The bake/pan frame then re-serializes nothing. The clip serialization runs in the
already-yielded erase loops, not on the pan frame. `clip: null` clears it (undo
of the last erase). Unknown id → no-op → the next bake reports `missing` and
re-upserts in full (the safety net). Flattened clips (`__hasImageClip`, a base64
image) are excluded and take the old full-dirty path (they're worker-refused
anyway). Wire, persistence and undo semantics are all unchanged — this is purely
the local main↔worker mirror.

Net: an erase (or its undo/redo) no longer re-serializes whole objects on the
main thread. What remains on the erase frame is the clip `toObject` (yielded) and
the bounded `eraseStamp` over visible tiles.

### E10 — ✅ FIXED — the erase "flash"

On pointer-up the `mouse:up` backstop resumed the compositor immediately, while
the async (now yielded, so longer) commit + tile-stamp was still in flight — so a
composite painted the still-**un-stamped** (un-erased) tiles for a frame, then the
stamp landed: a flash. Fixed by keeping the compositor suspended through the
commit + stamp (the brush's destination-out result stays on the lower context, so
the screen shows the correct erased state meanwhile) and resuming — one clean
composite of the stamped tiles — only in `handleEraseEnd`'s `finally`. The
backstop is gated on the in-flight commit (`releaseErasing`, set synchronously by
`beginErasingCommit` on the brush's `onMouseUp`, before fabric fires `mouse:up`),
so it can't resume early. Worst case if the ordering assumption is ever wrong: the
flash persists — never a stuck/blank canvas (the `finally` always resumes).

### E8b — spam correctness — `clipContainsStroke` now checks baked strokes (prev turn), and clipSet keeps the mirror exact

Combined with E8 (redo idempotency across baked strokes), erase undo/redo is now
add/remove-one-clip-child on the object plus an exact clip delta to the mirror.
The residual known gap stays E3's `RETAIN_CAP` (an erase older than 400 strokes
on ONE object is dropped and can't be undone) — extreme, and unchanged.

> **Verification:** none of this could be exercised here (the sandbox can't open a
> solo-draw session — backend-gated). All build-clean and reasoned; the definitive
> check on a device is `__drawPerf().longTaskMsMax` before/after a big erase +
> pan, and a visual check of the flash + undo/redo spam.

## Fourth review — big-erase main-thread blocks + a spam correctness bug

### E7 — ✅ FIXED — the erase commit and undo/redo loops were unyielded O(objects)

A "big erase" hits many objects. Three O(objects) **synchronous** main-thread
loops made a pan/zoom started right after it stutter (ANR territory):

- `CustomEraserBrush.commit` ran every target's `eraseObject` (clone the stroke
  into the object plane + add a clip child) through `Promise.all` — which fires
  every synchronous body back-to-back with **no yield**. Plus the per-target
  `bakeClipGroupIfNeeded` (a flatten does `toCanvasElement` + `toDataURL`).
- `handleErasedAction` redo re-erased every target (`Promise.all` again) and ran
  `updateQuadTree` per object.
- Undo ran `removeStrokeFromClip` + `updateQuadTree` per object.

**Fixed:** all of these now run through a `createYielder` (4 ms mobile / 8 ms
desktop), sequentially, yielding when the budget is spent or input is pending.
`eraseObject` bodies are synchronous and order-independent (destination-out masks
commute), so this only *spaces* them — same result, but input interleaves. The
`longTasks` / `longTaskMsMax` counters in `__drawPerf()` are the check: a big
erase should no longer produce a >50 ms task.

Combined with E6 (erase undo now uses **0** sync tiles when the bakery is alive),
the erase path's main-thread footprint is: one small stroke `enlivenObjects`, the
bounded `eraseStamp` over *visible* tiles, and the yielded loops. The heavy
per-object rasterization is the worker's job.

### E8 — ✅ FIXED — redo double-erased strokes already baked into the image

`clipContainsStroke` (the redo idempotency guard) only checked live vector clip
children. After a flatten, a stroke lives in the union **image**, not as a vector
child, so the guard returned false and redo **re-added** it as a fresh vector.
That duplicate is then removed by a single later undo while the image copy stays
→ the erase never fully comes back on spam. Now `clipContainsStroke` also checks
`__bakedClipStrokes`, so redo treats baked strokes as already-applied.

### Still structural (not fixed) — the cost of per-object clips

Each erase adds a `ClippingGroup` clip to every touched object, and clipped
objects stay more expensive to serialize, rebake and bound *forever after*. The
yielding above removes the SPIKE; the steady-state cost of a heavily-erased board
remains. The real ceiling-lifter is to stop representing every erase as a
per-object clip — e.g. bake settled erases into the tiles only (they already are,
via `eraseStamp`) and keep a compact per-region erase record for rebakes, instead
of N growing clip stacks. Big redesign; measure with `longTaskMsMax` +
`tileRefusals` on a real device first to confirm it's worth it.

## Third review — brush regression, erase-undo pan block, export-to-worker

### R1 — ✅ FIXED — image-backed brush strokes vanished from worker-baked tiles on zoom

`NeonStroke`, `SprayStroke` and `CrayonStroke` **extend `FabricImage`** but
serialize under their own `type` (`'NeonStroke'`, …), so the worker's
`type === 'image'` refusal missed them. They were shipped to the worker, which
has no image element to render them with, so they baked blank / threw (caught by
the per-object `try`) and **disappeared** from every worker-baked tile — while
still showing at the overview tier and on locally-baked tiles. Zooming switches
tiers, so the strokes flickered in and out. This is the "some brushes appear/
disappear randomly when zooming" report, and the ClippingGroup + hybrid work
made the worker handle *more* tiles, so it surfaced now.

**Fixed:** `workerCanRender` / `shippable` refuse `obj instanceof FabricImage` —
which catches all three image-strokes and real images at once. They now bake
locally (or overlay via F3-C), correctly, on every tier. The other strokes are
worker-safe: Pixel/Charcoal/Circle use `document.createElement('canvas')` (the
worker's `document` shim returns an `OffscreenCanvas`), and WaterColor/
Calligraphy are vector `Path`s.

### E6 — ✅ FIXED — erase undo/redo blocked a pan started right after it

`dropRegionEraseUndo` still did 2 synchronous tile rebuilds, each rendering every
touched object's clip group on the main thread — enough that a pan started
immediately after an undo stuttered. The overview patch inside `dropRegionLight`
already re-renders the region from the (now un-erased) objects, so the composite
is correct at overview resolution instantly, and the worker rebakes the exact
tiles off-thread (a pan aborts that bake; the overview covers). Set the erase-
undo sync tiles to **0** when the bakery is alive.

Still main-thread on erase undo, and worth watching: `enlivenObjects` of the
stroke (one small parse) and, only for a *flattened* object, the un-flatten that
re-adds the retained vector strokes (bounded, ≤ the flatten batch). Neither is
the 8-tile clip render that E4 removed.

### "Erase undo not completely fixed" — remaining suspects

Better, not perfect. Without a live repro (this sandbox can't create a solo-draw
session — it's backend-gated) the residual is one of: (a) `RETAIN_CAP` (400) on
`__bakedClipStrokes` dropping the *oldest* baked strokes, so an erase older than
that on one object stays un-undoable (same as pre-fix, just a much higher
ceiling); (b) the deferred `erasing:cleanup_done` sweep landing after an undo has
moved the entry to the redo stack; (c) multi-image un-flatten when an object was
flattened more than once. Needs a device repro to pin.

### Export to a worker (exportBoundingBoxImage) — analysis

`exportBoundingBoxImage` re-renders **every object** into a native canvas. It is
yielded, but each `obj.render()` is synchronous and uncancellable, so on a big
board it still spends real main-thread time. Four callers, two shapes:

- **Live main canvas** — `useCanvasPreview.runPreview` (send preview) and
  `drawRoomHandlers` (lobby thumbnail, 400px). These re-render the whole live
  scene *while the user is interacting* → the "super lag".
- **Clone canvas** — `drawLoad.runSave` (autosave thumbnail, 300px, already
  yielded on cloned objects) and `object.action` (save action, 1080px, one-shot
  user action). These don't compete with the live tile engine.

**The live-canvas cases don't need a new worker at all.** The engine already
holds the whole scene as off-thread `ImageBitmap` tiles *and* a worker-built
`WorldOverview` bitmap (`remoteOverview` renders it off-thread; images/text are
overlaid main-side). All four `img` outputs are **previews/thumbnails** — the
real drawing is sent/saved as JSON and re-rendered by the recipient. So the
right move is:

1. Expose `RenderCore.exportContentBitmap(maxSize)` that composites the tiles
   (or the overview for small targets) covering `contentBounds` into an
   `OffscreenCanvas` — O(tiles) `drawImage`, no per-object render, includes
   everything already baked. For a 300–400px thumbnail the overview alone is
   ample and essentially free.
2. Point `useCanvasPreview` and `drawRoomHandlers` at it, falling back to the
   current `exportBoundingBoxImage` when the cache/overview isn't warm.
3. Leave the clone-canvas callers as-is (or feed them the same content bitmap
   captured at snapshot time) — a true off-thread render of *cloned* objects
   would need images shipped to the worker (F3-B), which isn't worth it for a
   thumbnail.

Not implemented this turn: it is a user-facing image path (gallery + lobby
thumbnails) and the overview→thumbnail mapping (padding, bounds) needs a live
visual check, which this sandbox can't run. Scoped and ready to build once a
device is available.

### Are the other brushes GPU/worker-optimized?

| Stroke | Base | Worker-safe? |
| --- | --- | --- |
| Pencil, WaterColor, Calligraphy, BucketFill | `Path` | Yes — vector |
| Circle | `FabricObject` | Yes — vector (`arc`/`fill`) |
| Charcoal | `FabricObject` | Yes — stamp rebuilt PROCEDURALLY from a seed (deterministic canvas ops) |
| Eraser (`OptimizedEraserStroke`) | `Path` + `ClippingGroup` clip | Yes, since ClippingGroup is registered in the worker |
| **Pixel** | **`FabricObject`** | **No** — `_render` blits a `stampCanvas` the worker rebuilds via `loadImage(stampDataUrl)` (image decoding, absent in a worker) → baked BLANK → vanished at worker tiers / after a move. Now refused via `static bakesOnMainThread` (R2). |
| **Neon, Spray, Crayon** | **`FabricImage`** | **No** — baked-bitmap strokes; refused → local/overlay bake (R1). |

### R2 — ✅ FIXED — PixelStroke vanished at worker tiers and after a move

Same disappear-on-zoom/move class as R1 but PixelStroke extends `FabricObject`,
not `FabricImage`, so the R1 guard missed it. It carries a `stampCanvas` (a small
tip bitmap) that its `fromObject` rebuilds from a base64 `stampDataUrl` via
`fabric.util.loadImage` — image decoding that a worker can't do. The worker baked
it blank; it survived at the overview tier and on main-thread bakes, and vanished
after a move (which forces a worker re-bake). Fixed with an explicit, extensible
opt-out: `static bakesOnMainThread = true` on PixelStroke, checked by
`workerCanRender` / `shippable`. It now bakes on the main thread (or via the F3-C
hybrid overlay), where `loadImage` works. Charcoal (procedural stamp) and Circle
(vector) were checked and stay on the worker.

The image-backed strokes are the only ones that can't go off-thread. Making them
worker-bakeable = F3-B (ship their baked bitmap as a transferable into the
mirror), worth it only if `tileRefusals.image` shows they dominate on real
boards — the metric is already there.

---

## Fourth review — memory + main-thread sweep

Three landed, all build-verified.

### P1 — ✅ FIXED — `computeContentBounds()` (O(all objects)) ran on every undo/redo

`endBatch` called `core.setContentBounds(computeContentBounds())`, an all-scene
scan, and `endBatch` fires on **every** undo/redo and **every** remote-sync
batch. It was redundant: the `invalidateRegions()` call right after already
`growContentBounds()` per rect, so growth is covered; the only thing skipped is
*shrink* after a removal, and a slightly-loose content bound merely makes the
overview cover a little extra empty space. The full recompute still runs on
load / reset. Removed from `endBatch` → no O(all) scan per interaction.

### P2 — ✅ FIXED — worker mirror stored the whole scene as parsed JSON graphs

The worker's `json` map holds every shippable object's serialized form and is
**never evicted** (only the enlivened `live` LRU shrinks). On a 10k-stroke board
that is the dominant non-tile allocation — parsed object graphs, ~50–200 MB, a
prime `libwebviewchromium.so` OOM driver. Now stored as **JSON strings**
(`JSON.stringify` on upsert, `JSON.parse` in `ensureLive`) — a string is far
smaller than its parsed graph, roughly halving the mirror, and enliven parses
its input anyway so the extra cost is negligible and off-thread. `translate`
parses/patches/re-stringifies per id on the worker; the main side still sends
one tiny message. Legacy-tolerant (handles a stored object too).

### P3 — ✅ FIXED — z-index map rebuilt O(all objects) after every stroke commit

`spatialIndex.query` calls `getZIndexMap()`, which fully rebuilds the id→z map
and re-stamps `__z` on **all** objects whenever `isZIndexDirty`. That flag was
set on every `object:added`, and the flag is consumed at bake time — so drawing
one stroke on an N-object board cost an O(N) z rebuild, i.e. **O(N²) over a
drawing session**. But `assignZOnAdd` only assigns the *new* object's z (append,
or a fractional mid-stack midpoint) — no existing object's z changes — so it is
now **stamped incrementally** (`__z` + `zIndexMap.set`) without flagging a full
rebuild. Removal drops its entry likewise. Layer ops (which move many objects'
z) and history restores still flag a full rebuild, so ordering stays exact;
the incremental path only runs for the pure single-append case. Drawing on a big
board is O(1) per stroke again.

### Looked at, left alone

| Candidate | Verdict |
| --- | --- |
| `boundsSig` template string per bounds check | A numeric hash risks a collision → wrong cached bounds → wrong *invalidation* rect (stale pixels). Not worth the correctness risk for a string alloc (DRAW_ENGINE #8). |
| `offsetQuadTree` per-object `boundsSig` on drag commit | Already a good trade — one string build avoids a later `getBoundingRect`. `quadtree.update` (O(log n)) is inherent. |
| Transform selection bake on grab (main thread) | Latency-sensitive and idle-prewarmed; reusing tiles would be a large change for a rare cost. |
| `afterComposite` control re-render every frame | Early-returns when nothing is selected; only redraws during an active selection. Minor. |

---

## History subsystem audit

[`drawHistoryManager.store.ts`](../src/draw/store/drawHistoryManager.store.ts) +
[`drawHistory.config.ts`](../src/draw/config/drawHistory.config.ts).

**Headline: history is not a major CPU offender, but it had an unbounded memory
path.** Worth stating plainly, because the obvious suspect — `toJSON()` on every
stroke commit — measures ~0.2 ms on desktop for an 800-segment
`OptimizedPencilStroke`, so ~2 ms on a mid Android. Real, on an already-crowded
frame, but not an ANR driver. The memory bug below is the one that matters, and
it points at the `libwebviewchromium.so` SIGTRAP cluster rather than the ANRs.

### H1 — ✅ FIXED — the redo stack was completely uncapped — **P0 (memory)**

`trimUndoStack()` bounded `undoStack` by count (`MAX_HISTORY`) *and* by retained
objects (`MAX_RETAINED_OBJECTS`, 400 mobile). `addToRedoStack` did neither:

```ts
function addToRedoStack(action) {
  redoStack.push(action);          // no count cap, no weight cap
  redoStackCounter.value = redoStack.length;
}
```

Every undo migrates its action from the undo stack to the redo stack, so undoing
N times moved N entries — including whole-canvas `prevCanvasJSON` snapshots and
erase `deletedObjectsJSON` payloads — into a container nothing ever trimmed.

It compounds: undoing an erase **forces its lazy payload to materialize**
(`undoErased` reads it), so what lands in the redo stack is the fully-serialized
version, not the deferred one. Holding undo down on a dense canvas was an
unbounded main-thread heap climb, on exactly the low-memory devices already
showing a Chromium OOM `CHECK()`.

**Fixed:** `trimStacks()` bounds both stacks, and the retained-object budget is
now **combined** rather than per-stack so the ceiling doesn't silently double.
Redo is evicted first — the user explicitly undid past those, so losing the far
end of redo beats losing the undo they are about to reach for.

Verified: 200 heavy actions pushed onto the redo stack settle at the
`MIN_ACTIONS` floor instead of retaining 200 × 300 = 60 000 serialized objects.

### H2 — ✅ FIXED — `actionWeight` defeated its own lazy params — **P1 (latent)**

```ts
for (const key of Object.keys(p)) {
  const v = p[key];        // fires defineLazyJSON's getter → full toJSON
```

`defineLazyJSON` exists so a wide erase doesn't serialize hundreds of objects on
the erase frame. Weighing the stack read every param straight through the
accessor and undid that. Today it is dodged only because the `Erasing` handler
precomputes `action.__w` — the code comment even warns "nothing may
enumerate-and-read params casually". That is a landmine, not a design: the next
lazy param without a hand-written `__w` silently loses its laziness.

**Fixed:** `actionWeight` skips accessor properties via
`getOwnPropertyDescriptor`. An un-precomputed lazy param is now merely
*under-counted*, which is safe, instead of being force-serialized. Verified: 0
getter reads across 21 trim passes.

### H3 — ✅ FIXED — `objectsDeleted` serialized the whole selection eagerly — **P1**

Deleting a 300-object selection ran 300 synchronous `toJSON()` calls in the
delete frame for an entry most users never undo. Now uses the existing
`defineLazyJSON` — unambiguously safe here for the same reason as the erase
payload: deleted objects are off-canvas and never mutate again, so serializing
later yields identical JSON. `redoObjectsDeleted` only reads `.id`, so a redo
after an undo costs nothing extra.

### H4 — deliberately NOT fixed — `object:added` stays eager

The same lazy treatment would save ~2 ms per stroke, and it is tempting because
`undoObjectsAdded` only ever reads `.id`. **It is not equivalent to the delete
case.** An added object stays on the canvas and keeps mutating, so a deferred
serialization captures its state at *undo* time, not at *add* time. That is only
correct while every intervening mutation has its own history entry undone first
— true today, and a silent restores-wrong-state bug the moment it isn't. Not
worth 2 ms.

The scalable win here is making the stroke cheaper to serialize (roadmap item 2
in `DRAW_ENGINE.md`: extend rounding + delta encoding beyond pencil), not
deferring it.

### Not addressed — noted for later

| Item | Why it was left |
| --- | --- |
| `endBatch()` → `computeContentBounds()` is O(all objects), and every undo/redo is wrapped in `beginBatch`/`endBatch` | ~0.2 ms at 10k objects — the fix is the incremental-bounds roadmap item (`DRAW_ENGINE.md` #7), not a history change |
| `object:modified` calls `getAbsoluteState` per selected object, twice per drag (once at `before:transform`) | `calcTransformMatrix` + `qrDecompose` is microseconds; ~1–2 ms for a 500-object selection on the release frame. Below the noise next to the tile work on that frame |
| `enqueueHistoryOp`'s FIFO chain has no depth bound | Spamming undo queues unbounded ops, but each is short and the chain is what prevents the clip-corruption race. Bounding it risks dropping user intent |
| `silentUndo`/`silentRedo` pop a stack and then `reset()` both | Looks redundant, but it is the sync engine's contract. Left alone without understanding the multiplayer invariants |

---

## Related fix — bucket fill silently did nothing on a same-colour click

Not a perf finding, but found and fixed during this work, and it explains a
long-standing "the bucket just doesn't respond" report.

`CustomFloodFill.fill()` bails before scanning when the replacement colour
matches the colour being replaced:

```ts
if (this.isSameColor(this._replacedColor, this._newColor, this._tolerance)) return;
```

Correct for a pixel painter — repainting a colour with itself is a no-op — but
the bucket's output is a vector **object**, not pixels. The worker was handed
the user's brush colour as the scan colour, so picking the colour you were about
to click on (most often the canvas background, clicking empty space — exactly
the case that takes the "insert underneath" branch) produced
`modifiedPixelsCount === 0` → `ok: false` with no `tooLarge` → `bucketFill`
returned null → `if (!img) return` in the tool. Completely silent, no toast.

Fixed in [`bucketFill.worker.ts`](../src/draw/helpers/tools/bucketFill.worker.ts):
the scan now uses a **sentinel** colour picked by seed luminance (black or
white, always far outside the tolerance), and the contour field is built from
`getFilledMask()` rather than re-scanning for pixels matching the fill colour.
The mask is exact — it cannot pick up a pre-existing pixel that merely shares
the colour — and it drops an O(area) `ImageData` allocation per fill. The brush
colour no longer enters the worker at all; it is applied to the fabric object by
the caller, which is the only place it was ever needed.

Verified in the running app: with the brush forced to `#FAF0E6FF` (the canvas
background) a fill is now created and lands at z below every intersecting
stroke; the normal different-colour path is geometrically unchanged.

**Worth noting separately:** `if (!img) return` in
[`bucket.store.ts`](../src/draw/store/tools/bucket.store.ts) still swallows every
other failure mode without feedback. Only `tooLarge` toasts.

---

## Instrumentation

We currently cannot tell which of F1–F5 dominates on the devices that crash.
`__comp` is `debug`-only and console-scoped
([`committedLayer.ts:445–454`](../src/draw/committedLayer.ts#L445)). **Ship this
before or alongside P0** — otherwise we are guessing.

Sampled (≈1% of sessions), batched, sent with existing analytics:

- `bakery.shutdown` — fires on `shutdown()`, with `failures`, cause
  (timeout vs error), session age. **Single most valuable number here.**
- `bakery.refusal_rate` — refused tiles / total tile bakes, bucketed by reason
  (text / image / group / hidden). Decides how much of F3 to build.
- `bake.flush_ms` — p50/p95 of the synchronous flush block. Proves or kills F1.
- `bake.pass_ms`, `bake.tiles_per_pass`.
- `composite.p95_ms`, `composite.miss_frames` — promote `__comp` out of `debug`
  with sampling.
- `longtask.count / longtask.max_ms` — `PerformanceObserver({type:'longtask'})`,
  attributed to the current engine phase.
- `tiles.live_count`, `tiles.bytes`, `tiles.evictions_per_min` — F5's smoking gun.
- `device` — DPR, `hardwareConcurrency`, `deviceMemory`, WebView version.
  Cross-reference against the Adreno crash cohort.

Then promote the same counters into a dev HUD (`?perfhud=1`) so local work is
measurable too.

---

## Open questions

All four are still open — the fixes are in, but nothing is confirmed on real
devices yet. The counters to answer them now exist; the transport does not.

1. **Is the bakery pausing in the field?** `bakeryPauses` / `bakeryDisabled`
   answer it. This remains the single most valuable number: if it was
   non-trivial before, F2 alone may be most of the ANR fix.
2. **Is the ANR cohort DPR-3+ Adreno specifically?** `device.dpr` vs
   `device.renderDpr` in the snapshot identifies who the F4 cap actually
   affects. On DPR ≤ 2 it is a no-op, so the win is concentrated in that cohort.
3. **Does `WorkerGlobalScope.fonts` work on the Android WebView versions our
   users run?** Implemented with a feature-detect and a per-family allowlist, so
   an unsupported WebView degrades to the old refuse-text behaviour rather than
   baking wrong glyphs. Confirmed working on desktop Chromium; **unverified on
   Android WebView** — `tileRefusals.text` will show it.
4. **What is the real refusal rate?** `refusalRate` + `tileRefusals` now break it
   down by reason. Text is handled; if `image` dominates what is left, build
   F3-B next, and if it is `grouped`, build F3-D.

A fifth, new: **does the F4 cap cost visible quality anyone notices?** It is a
deliberate sharpness-for-fill-rate trade on DPR-3 phones. Worth shipping behind
a remote flag and A/B-ing against the ANR rate rather than assuming.

---

*Keep this in sync with the findings as they are fixed — strike through what
lands, and move the confirmed-by-telemetry items out of "suspected".*
