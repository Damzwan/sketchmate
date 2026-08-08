# Drawing engine — Fabric.js dependency decision

**Decision date:** 2026-08-08

**Scope:** `src/draw/**`, the six drawing-engine design/audit documents, the
installed Fabric 7.2.0 package, `@erase2d/fabric` 1.2.1, and the local Fabric.js
7.4.0 source checkout at commit `f5d3cd9c0`.

## Decision

Do **not** replace Fabric with a clean-room engine in one project, and do not copy
an ad-hoc selection of Fabric internals into SketchMate.

Do continue moving toward a SketchMate-owned engine, but use a **strangler
migration**:

1. Keep the existing tile cache, compositor, overview, scheduling, spatial index,
   history, sync, layers, and memory policy. They are already the custom engine
   and solve problems that removing Fabric would not solve.
2. Put Fabric behind one application-owned runtime adapter. New draw-domain code
   should depend on SketchMate records and interfaces, not `Canvas` or
   `FabricObject`.
3. Make compact SketchMate document records canonical and render the custom
   stroke types directly into tiles/workers. Use Fabric as a compatibility
   renderer for rich and legacy types during the migration.
4. Hydrate only the small interactive working set into Fabric: active drawing,
   selection, text editing, and any object without a native SketchMate renderer.
5. Reconsider removing the final Fabric interaction runtime only after the above
   steps have made that remaining surface small and measurable.

This is a **yes** to owning the drawing engine and a **no** to a big-bang Fabric
rewrite. Fabric may remain a bounded compatibility and interaction component
indefinitely; that is a valid end state, not a failed migration.

Confidence is medium-high. The code makes the dependency boundary and current
pain clear. The exact performance and stability gain of native object renderers
still needs a device-measured pilot.

## Expected return by concern

| Concern | Big-bang replacement | Recommended staged path |
| --- | --- | --- |
| Performance | High theoretical ceiling, but no benefit until broad parity | Medium-high where it matters: bounded custom stroke renders and no worker enlivening; steady-state tile composition is already custom |
| Development speed | Strongly negative for a long parity period | Short-term adapter cost, then smaller upgrade blast radius and app-owned contracts |
| Stability | High regression risk across documents, erase, transforms, text, and rooms | Dual-render/type-by-type rollout with Fabric fallback and rollback |
| Memory | Helps only if the new model is compact and lazily hydrated | Directly targets total-scene Fabric residency through canonical records |
| Bundle size | Best theoretical result, at the price of recreating behavior | Immediate modular-entry opportunity measured at about 107 KB gzip, then per-worker/type removal |

The staged path captures most of the architectural upside before committing to
the most expensive part: replacing the interactive canvas, controls, and text
editing.

## Why the question is well founded

SketchMate already works around several Fabric assumptions:

- Fabric's whole-scene renderer is bypassed by the committed tile compositor.
- Object caching is disabled, then overridden again per render because clip paths
  can force it back on and cache scale follows the live viewport rather than the
  tile tier.
- Tile rendering temporarily replaces `isOnScreen`, `getTotalObjectScaling`,
  `visible`, and child visibility before calling `obj.render()`.
- Canvas selection, pointer, transform, control drawing, zoom, and add/insert
  behavior are patched or overridden.
- Workers provide `window`, `document`, and image shims so Fabric objects can be
  enlivened and rendered outside a browser document.
- Groups require explicit child coordinate refresh and culling because Fabric's
  cached child coordinates and renderer traversal do not match tile-local work.
- Erasing depends on an additional Fabric extension and maintains per-object
  clipping graphs that are expensive to rasterize at multiple tiers.

Those are real maintenance and correctness costs. The boundary is not clean today.

The conclusion is nevertheless not “remove Fabric immediately,” because the same
code also shows how much Fabric still supplies.

## What SketchMate owns and what Fabric still owns

| Responsibility | Current owner | Replacement status |
| --- | --- | --- |
| Infinite-world tile cache, fallback ladder, overview, composition | SketchMate | Keep |
| Invalidation, generation correctness, repair, bake scheduling | SketchMate | Keep |
| Spatial lookup, explicit z/layer ordering | SketchMate | Keep |
| GPU/memory budgets and pressure release | SketchMate | Keep |
| Sync, history, persistence orchestration | SketchMate | Keep, move to records |
| Custom stroke capture/geometry | Mostly SketchMate subclasses | Best first native-render target |
| Primitive rasterization and clip composition | Fabric `object.render()` | Replace incrementally |
| Object transforms, bounds, coordinate planes | Fabric, with SketchMate patches | Adapter first; replace late |
| Pointer targeting, selection, controls, transform state | Fabric, heavily overridden | Keep for the interactive set |
| Text layout/editing and font metrics | Fabric `IText` | Keep until a dedicated need exists |
| Images and filters | Fabric | Keep as fallback; bound decoded assets |
| Groups, active selections, clip paths | Fabric + `@erase2d/fabric` | Avoid in canonical records; adapt |
| JSON enlivening and class registry | Fabric | Preserve as a legacy codec during migration |

The difficult part of a fresh engine is therefore not drawing lines. It is the
combined behavior of transforms, hit testing, controls, group coordinate planes,
text layout, image/filter loading, clipping, serialization compatibility, and
undo/sync semantics.

The local Fabric 7.4.0 source gives a useful size check. Its non-test core is about
41,600 TypeScript lines. Canvas code is about 6,200 lines, controls 2,200, object
geometry/rendering 4,500, IText 3,300, and text layout another 2,850. SketchMate's
own non-test `src/draw` TypeScript is already about 41,200 lines. A parity rewrite
would create another substantial engine beside the one that must continue shipping.

These are source-size indicators, not an estimate that every line must be copied.
They show why “use a few pieces” must be defined by a narrow adapter rather than by
copying files until behavior happens to match.

## Coupling census

The current dependency is broad:

- 90 of 175 non-test source files under `src/draw` import from `fabric`.
- 44 of those imports are runtime dependencies; 46 are type-only dependencies.
- 20 non-test files use a namespace import (`import * as fabric`), which makes
  the required API surface and tree-shaking less explicit.
- 22 SketchMate classes extend a Fabric object or brush class.
- Non-test code has approximately 50 `_objects` references, 10 direct
  `_renderControls` references, 15 `_activeObject` references, and 17
  `_currentTransform` references. It also patches Fabric prototypes globally.

Not every underscore member is equally unstable, and counts include comments in
some cases. The census is a boundary indicator: an upgrade or replacement affects
far more than `fabricSetup.ts` and `fabricTileRenderer.ts`.

The first architectural task is therefore dependency containment. A rewrite
started before containment would chase Fabric semantics through most draw domains
while new features continued to add more dependencies.

## Performance and stability analysis

### What removing Fabric can improve

1. **Bounded render atoms.** The yielder can pause between objects but cannot
   interrupt one `obj.render()`. Native stroke renderers can be segmented by tile,
   point block, or time slice.
2. **No Fabric cache negotiation in tile rendering.** Native renderers can consume
   `(record, tile transform, quality)` without temporarily mutating live objects.
3. **No full-scene live object graph.** Canonical records plus viewport hydration
   address the main scene-memory finding in the stability audit.
4. **Cheaper workers.** Record renderers remove DOM/image shims, class-registry
   bootstrapping, repeated enlivening, and Fabric object LRUs for supported types.
5. **One coordinate contract.** Bounds, transforms, culling, serialization, and
   rendering can share application-owned math instead of translating between
   Fabric's live canvas plane and tile/world planes.
6. **Smaller compatibility surface.** Fabric upgrades become adapter work instead
   of changes across tools, history, sync, workers, and rendering.

### What removing Fabric does not automatically improve

- Tile invalidation correctness, fallback artifacts, GPU texture churn, and
  overview behavior are SketchMate concerns and remain.
- Raster-backed brush pixels, source images, history payloads, and decoded assets
  can still cause OOMs in a custom object model.
- Text and images remain indivisible or expensive unless their own implementations
  are redesigned.
- A custom renderer that hydrates the entire document into rich class instances
  merely recreates the resident-memory problem under different names.
- Replacing tiling with direct scene rendering reintroduces scene-dependent frame
  cost and contradicts the measured shape of SketchMate's workload.

The valuable target is not “Fabric-free.” It is **compact canonical records,
bounded interactive hydration, and tile-native rendering**.

## Bundle analysis

The current package entry leaves a cheaper optimization available before a rewrite.
`fabric` 7.2.0 exposes both the default bundled entry and a modular `fabric/es`
entry. A diagnostic production build changed only the resolver for exact `fabric`
imports and produced the following output:

| Generated JavaScript | Current entry | `fabric/es` experiment | Difference |
| --- | ---: | ---: | ---: |
| All JS, raw | 5,238,756 B | 4,861,049 B | **-377,707 B (-7.2%)** |
| All JS, gzip sum | 1,500,126 B | 1,392,998 B | **-107,128 B (-7.1%)** |
| Main Fabric-heavy chunk, gzip | 88,065 B | 35,361 B | **-52,704 B** |
| Tile bakery worker, gzip | 102,782 B | 55,466 B | **-47,316 B** |
| Eraser analysis worker, gzip | 99,469 B | 52,141 B | **-47,328 B** |

Some code moved into other shared chunks, so the total row—not the three chunk
rows added together—is the valid application saving. The experiment was a build
only. It did not run document round trips, worker class registration, erasing,
filters, or device tests and must not be shipped as an alias-only change.

The production configuration currently defaults tile rendering to the main
backend, so shrinking the tile worker is primarily a delivery/precache win until
that backend is enabled. The main Fabric chunk and the used eraser worker remain
relevant to runtime parse/execute cost. Bundle measurements and runtime profiles
must therefore be reported separately.

This result changes the bundle-size argument:

- roughly 107 KB gzip is plausibly recoverable without replacing Fabric;
- the remaining Fabric cost is spread across main and worker contexts, so removing
  Fabric only from the main canvas would not collect the full theoretical saving;
- bundle size alone does not justify a clean-room rewrite.

The local Fabric 7.4.0 checkout is moving toward separate `@fabricjs/core` and
`@fabricjs/browser` packages. That is strategically useful: workers could use an
environment-neutral core while the main interaction surface uses the browser
entry. It should be evaluated as a separate upgrade after the 7.2 ESM experiment,
because SketchMate's private API patches and `@erase2d/fabric` compatibility make
an upgrade and an architecture change risky to combine.

## Options considered

| Option | Up-front effort | Long-term control | Initial stability | Bundle potential | Decision |
| --- | --- | --- | --- | --- | --- |
| Keep the present broad hybrid | Low | Medium | Medium | Current baseline | Not sufficient; coupling keeps growing |
| Modular Fabric + application adapter + native record renderers | Medium, staged | High | High if dual-run | Good | **Recommended** |
| Maintain a trimmed Fabric fork | High and recurring | High | Medium-low | Good | Avoid unless an upstreamable hook is impossible |
| Copy selected Fabric source files | Looks medium, becomes high | Medium | Low | Uncertain | Reject; creates an implicit fork |
| Clean-room full replacement | Very high | Maximum | Low until parity | Best theoretical | Defer until Fabric is already a small adapter |

### Why a Fabric fork is not the default

A fork could expose the exact render and transform hooks SketchMate wants, but it
also takes ownership of Fabric's browser fixes, text behavior, image loading,
serialization migrations, and security/compatibility maintenance. SketchMate would
still need an adapter because application code should not bind to fork internals.

Prefer, in order:

1. public modular imports;
2. an application-owned adapter;
3. small changes that can be contributed upstream;
4. a narrow, version-pinned patch only when a measured blocker has no public hook.

Fabric is MIT licensed, so reuse is legally possible, but copied source must retain
the applicable copyright and license notices. The larger objection is maintenance,
not permission.

## Target architecture

```text
persisted / remote Fabric-compatible JSON
                    |
                    v
          legacy codec + migrations
                    |
                    v
     canonical SketchMate scene records
  id · type · bounds · transform · z/layer · revision · payload
         |                 |                    |
         |                 |                    +--> history / sync deltas
         |                 +-----------------------> spatial chunks / index
         |
         +--> native renderer registry --> tile worker / overview / export
         |          |
         |          +--> Fabric fallback renderer for unsupported records
         |
         +--> interactive hydration adapter
                    |
                    +--> bounded Fabric Canvas working set
                         selection · controls · text editing · legacy objects
```

Three rules make this architecture different from today's worker mirror:

1. Records, not Fabric objects, are authoritative.
2. Bounds and z/layer metadata exist without enlivening an object.
3. Fabric hydration is a cache that can be discarded, not the document itself.

## Migration plan

### Phase 0 — collect a compatibility baseline

- Add representative persisted drawings to a versioned fixture corpus: every
  custom brush, text/font styles, images and filters, nested groups, erased and
  compacted clips, layers, old payload versions, and room snapshots.
- Record JSON round-trip, pixel snapshots at selected tiers, hit targets, bounds,
  transform results, and undo/redo behavior.
- Run the existing deterministic benchmark and Android real-device scenarios.
- Trial `fabric/es` behind a build flag. Verify class registry initialization in
  the main thread, tile worker, eraser worker, and preview worker before adopting.

This is the first pull because it can improve delivery size immediately and builds
the safety net required by every later phase.

### Phase 1 — contain Fabric

- Create one `draw/fabric-runtime/` boundary with explicit modules for canvas
  interaction, object hydration/serialization, fallback rendering, and types.
- Replace `FabricObject` in domain contracts with SketchMate `SceneObjectId`,
  `WorldBounds`, `Transform`, `SerializedRecord`, and narrow capability interfaces.
- Ban new direct `fabric` imports outside the boundary and temporary migration
  allowlist. Track the allowlist in CI.
- Replace namespace imports with named adapter calls so the required surface is
  visible.

This phase is valuable even if no object renderer is ever replaced. It reduces
upgrade blast radius and makes development ownership clear.

### Phase 2 — introduce canonical records without changing pixels

- Add a record store keyed by ID and spatial chunk/revision.
- Decode current Fabric JSON into records and retain a lossless legacy payload for
  types not yet understood natively.
- Drive index, layer, history, and sync metadata from records.
- Initially hydrate records back into Fabric for every render so behavior remains
  unchanged; then add byte/accounting metrics to compare record and live-object
  residency.

Do not change the persisted or room wire format in this phase. The codec is a
compatibility seam, not a flag day.

### Phase 3 — native-render SketchMate stroke types

Start with `OptimizedPencilStroke`, then the custom types whose geometry is already
owned by SketchMate. Each renderer accepts a record, a world-to-tile transform, a
clip rect, and a quality tier. It must be usable in the tile worker, overview,
preview, and export paths.

For each type:

1. dual-render native and Fabric outputs in tests;
2. compare pixels/bounds at multiple transforms and tiers;
3. enable native rendering behind a per-type flag;
4. remove Fabric enlivening for settled off-screen instances only after parity;
5. retain the Fabric codec for old documents and rollback.

This attacks the important costs—render atoms, worker enlivening, and resident
objects—without first rebuilding text, controls, or group semantics.

### Phase 4 — bound the Fabric working set

- Hydrate the viewport plus an interaction halo, the active selection, in-progress
  strokes, text being edited, and unsupported records.
- Replace large `ActiveSelection`s with an ID set and aggregate transform proxy;
  apply final transforms to records in yielded slices.
- Evict settled off-screen Fabric instances by estimated retained bytes, not count.
- Keep the native tile pipeline authoritative so eviction cannot change pixels.

This phase realizes the stability audit's highest-value long-term recommendation.

### Phase 5 — decide on the final interaction runtime

Only now evaluate a custom pointer/selection/control system. Keep Fabric if its
bounded interactive set is stable, fast, and small. Replace it only if field data
shows that the remaining runtime is still a material source of ANRs, crashes,
bundle cost, or development friction.

Text editing should be among the last capabilities considered for replacement.
Native browser editing overlaid on canvas or a dedicated text engine is a separate
product project, not incidental cleanup.

## Gates and success criteria

The migration should advance only when the previous step passes these gates:

### Compatibility

- Existing documents and room snapshots decode without silent object loss.
- Load-save-load preserves supported properties and stable IDs/layers/z-order.
- Native and Fabric renderers meet per-type pixel and bounds tolerances.
- Undo/redo, erase intersections, grouping, and transform seams retain the current
  invariants in `DRAW_ENGINE.md` and `DRAW_ENGINE_V3_PLAN.md`.

### Performance and stability

- No regression in frame p95, long tasks, bake p95/max, or missed/fallback frames
  on the deterministic and Android scenarios.
- Main live-object retained bytes become proportional to the interactive working
  set rather than total document complexity.
- Native types no longer require Fabric enlivening in workers.
- GPU/bitmap budgets remain explicit; a smaller object model is not allowed to
  hide unbounded raster allocations.

### Bundle and development

- Adopt the modular entry only if the verified production build keeps a material
  net saving (the diagnostic result suggests a target of at least 80 KB gzip).
- Track Fabric code separately in main and each worker; totals must include shared
  chunk movement.
- New features can be implemented against records without touching Fabric private
  state.
- Fabric upgrades are confined to the runtime adapter and compatibility fixtures.

## When a full Fabric removal becomes worth it

Re-open the full-removal decision when all of the following are true:

1. Direct Fabric imports are confined to the runtime adapter.
2. Most rendered object weight on representative documents uses native renderers.
3. The Fabric live set is bounded and no longer canonical.
4. Text, image/filter, group/clip, and old-document fallbacks have explicit owners.
5. Measurements show the remaining Fabric runtime still costs enough to justify
   rebuilding pointer targeting, transforms, controls, and editing.

If conditions 1–4 are true and condition 5 is false, stop. The hybrid has reached
its optimal form.

## Recommended next three pulls

1. **Modular-entry spike:** build-flagged `fabric/es`, explicit class registration,
   fixture round trips, worker/eraser/preview smoke tests, bundle report, and
   Android benchmark. Do not mix this with the 7.4 upgrade.
2. **Fabric boundary:** introduce `draw/fabric-runtime/`, application-owned draw
   types, and a CI allowlist for direct Fabric imports. No behavior change.
3. **Native pencil pilot:** render `OptimizedPencilStroke` from compact record
   geometry in tiles and preview/export, dual-run against Fabric, and measure CPU,
   heap, worker size, and visual parity.

These pulls give useful results even if the migration stops after any one of them.
