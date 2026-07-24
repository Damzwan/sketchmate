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
| Pencil, WaterColor, Calligraphy | `Path` | Yes — vector |
| Pixel, Charcoal, Circle | `FabricObject` | Yes — offscreen 2D canvas via the worker `document` shim |
| Eraser (`OptimizedEraserStroke`) | `Path` + `ClippingGroup` clip | Yes, since ClippingGroup is now registered in the worker |
| **Neon, Spray, Crayon** | **`FabricImage`** | **No** — baked-bitmap strokes; now refused → local/overlay bake (R1) |

The image-backed three are the only ones that can't go off-thread. Making them
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
