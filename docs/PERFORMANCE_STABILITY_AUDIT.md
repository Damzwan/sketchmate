# SketchMate performance, ANR, and crash-risk audit

**Audit date:** 2026-08-01  
**Application version:** 0.4.4  
**Primary target:** Android Capacitor System WebView, with iOS/PWA implications noted where relevant  
**Status:** Active remediation; first pass completed for STAB-01, STAB-03, STAB-04, STAB-05, and the rendering portion of STAB-06

## Executive conclusion

SketchMate already contains serious performance engineering in its drawing renderer: capped render DPR, device-specific tile budgets, time-sliced scene loading, bounded draw history, worker cancellation, bitmap disposal, low-end animation modes, and a performance recorder. Those controls materially reduce risk.

The first remediation pass now closes the largest lifecycle defect outside the inner render loop: drawing exit detaches a save snapshot and disposes the Fabric/session graph, including render state, handlers, timers, and session workers. Device-loop and heap validation remain required before this item can be considered production-verified.

The next risk cluster is cumulative memory. Home now enumerates a dedicated metadata store instead of every draft payload, and Gallery now mounts only a viewport-buffered thumbnail window. Gallery metadata still grows with pagination, while customization retains uncapped full-scene history snapshots and chat has several unbounded collections. These are the next resident-heap targets.

The app also lacks a dependable feedback loop. There is no repository-visible JavaScript/native crash collector, ANR/exit-reason pipeline, memory-pressure bridge, or enforced release check. The production bundle currently builds even though type checking and linting fail. That makes regressions easier to introduce and much harder to attribute.

### Recommended decision

Do not start by retuning the tile engine again. Execute the first four pull requests in the roadmap below: establish telemetry and release gates, implement a race-safe drawing teardown, make drawing workers session-scoped, then make Home load draft metadata only. These changes attack the highest-confidence cross-app failure paths without changing drawing quality.

## Scope and method

The review covered:

- app boot, routing, global overlays, authentication hydration, resume behavior, and native listeners;
- Home/community feed and local drafts;
- Gallery/inbox, thumbnails, swiper integration, and pagination;
- Settings and profile customization, including animated worlds and sketch/signature editors;
- the drawing session, canvas lifecycle, renderer, tile store, overview, history, autosave, IndexedDB, worker clients, eraser, bucket fill, and room exit;
- chat overview, widget, message/cache policies, lobby chat, socket acknowledgements, timers, and logout;
- Pinia store retention and reset behavior;
- dependency graph, production audit, build chunks, type checking, linting, unit tests, and Android WebView configuration.

This is a static and build-time audit. It did **not** include Play Console ANR traces, production crash symbols, physical-device heap profiles, Android release-build smoke tests, or a long-running device soak. Consequently, findings are marked as either **confirmed** from code behavior or **pressure risk** requiring field validation.

The existing draw-specific investigations remain authoritative for renderer internals and known production traces: [`DRAW_ENGINE_PERF.md`](./DRAW_ENGINE_PERF.md), [`DRAW_ENGINE.md`](./DRAW_ENGINE.md), and [`DRAW_BENCHMARK.md`](./DRAW_BENCHMARK.md). This report adds the app-wide lifecycle and cumulative-memory view.

## Severity, confidence, and pull-size scale

| Label | Meaning |
|---|---|
| **P0** | Credible direct ANR/crash/data-loss path or the observability needed to control one; handle before feature work. |
| **P1** | High-probability jank, memory growth, or release-integrity risk; schedule in the next stabilization cycle. |
| **P2** | Bounded or situational degradation; address after P0/P1 or alongside nearby feature work. |
| **P3** | Hygiene or low-frequency edge case. |
| **Confirmed** | The problematic lifecycle or bound is directly visible in code. |
| **Pressure risk** | The code creates measurable pressure, but production impact needs device/field evidence. |
| **XS** | Up to half a day, normally one focused change. |
| **S** | Half to one engineering day. |
| **M** | Two to four engineering days, including tests. |
| **L** | One to two sprints or an architectural change. |

Pull sizes are estimates, not deadlines. Native store releases and rollout observation add calendar time.

## Measured baseline

Commands were run from the repository root on 2026-08-01.

| Check | Result | Interpretation |
|---|---:|---|
| `pnpm build` | Pass; 1,242 modules; 13.15 s | Production assets can be emitted. Vite reports chunks over 500 kB. |
| Main JS entry | 1,449,710 B raw; 359,941 B gzip | Large parse/compile/evaluation surface for cold WebView startup. |
| Selected draw route/worker artifacts | About 1.70 MB raw / 525 kB gzip if all selected paths activate | Drawing is correctly split, but first-use compilation and worker startup remain substantial. |
| `pnpm exec vitest run` | Pass; 47 files, 208 tests | Good renderer/unit coverage; not a lifecycle or device-soak guarantee. |
| `pnpm exec vue-tsc --noEmit` | Fail | Type errors are not release-blocking. Several affect drawing/store contracts, not only test types. |
| `pnpm lint .` | Fail before linting | ESLint 9 expects flat config; the repository still uses legacy `.eslintrc.cjs`. |
| `pnpm audit --prod` | 52 advisories: 2 critical, 26 high, 23 moderate, 1 low; 467 production dependencies | The production dependency set is inflated by package managers/build/server tools and contains actionable runtime/supply-chain findings. |
| Repository CI | No `.github` workflow found | No repository-visible automated release gate was found. |

Notable emitted files:

| Artifact | Raw | Gzip | Notes |
|---|---:|---:|---|
| Main entry | 1,449.7 kB | 359.9 kB | Ionic, Firebase/messaging, Capacitor helpers, CompressorJS, stores, and app shell contribute. |
| `layerRegistry` draw chunk | 294.5 kB | 89.7 kB | Fabric/draw graph. |
| Tile bakery worker | 332.6 kB | 101.5 kB | Separate WebView worker parse and resident heap. |
| Eraser worker | 321.4 kB | 97.9 kB | Constructed when its client module evaluates. |
| Preview worker | 323.2 kB | 98.6 kB | Used by draft snapshot generation. |
| Photo swiper | 214.4 kB | 61.2 kB | Lazy, but significant on Gallery first use. |
| Feedback menu | 212.9 kB | 68.6 kB | Includes a second direct Firestore dependency path. |

Bundle sizes are not RAM estimates. Parsed code, reactive state, DOM, decoded images, canvas backing stores, ImageBitmaps, worker heaps, and GPU textures are separate allocations.

## Surface-by-surface assessment

| Surface | Risk | Assessment |
|---|---:|---|
| `App.vue` / global shell | Medium | Overlay chunking and conditional mounting are good. The shell still initializes global listeners/stores eagerly, and helper imports make the cold entry broader than the visible UI requires. |
| Home | High | Feed result/DOM bounds are good. Full draft-payload enumeration and forced draw prefetch are the important remaining risks. |
| Gallery | High | Pagination controls network batch size but not resident data, Vue component, observer, or decoded-image count. True windowing is needed. |
| Settings | Low | The reviewed settings screen is comparatively light and bounded. Keep network mutations single-flight and avoid adding animated previews or heavy eager account modules. No Settings-specific ANR path was found. |
| Customization | Medium–High | Lazy picker sheets, ambient pause, static low-end previews, and cleanup are strong. Uncapped doodle history and global sprite warming can still create pressure. |
| Drawing engine | Critical | Inner-render protections are mature. Route/session disposal, initialization cancellation, and worker ownership are the remaining cross-app failure boundary. |
| Chat widget | Medium | Message/lobby/toast limits are good. Heads, overview rows, closed over-cap history, ACKs, timers, and account reset need explicit bounds. |
| Pinia/auth stores | Medium | Several caches are bounded/reset correctly. Inbox/drafts/widget retention and concurrent hydration are the main store-level risks. |
| Android native layer | High operationally | Release shrinking, hardware acceleration, and avoiding `largeHeap` are correct. Exit-reason telemetry and memory-pressure shedding are missing. |
| Packages/release tooling | High operationally | The build passes, but type/lint gates do not. Version duplication and inflated production dependencies increase regression and supply-chain exposure. |

## Threat register

| ID | Priority | Finding | Status | Pull | Primary area |
|---|---:|---|---|---:|---|
| STAB-01 | P0 | Drawing session is not destroyed on route exit | Implemented; device validation pending | M | Drawing lifecycle |
| STAB-02 | P0 | Production ANR/crash/memory-pressure feedback loop is absent | Confirmed | M | Native/platform |
| STAB-03 | P1 | Drawing initialization is not cancellable or failure-safe | Implemented; lifecycle tests pending | M | Drawing lifecycle |
| STAB-04 | P1 | Drawing worker lifetime and bucket-fill failure paths outlive work | Implemented; fault-injection pending | M | Drawing workers |
| STAB-05 | P1 | Home loads every full draft payload into memory | Implemented; migration/device validation pending | M | Home/storage |
| STAB-06 | P1 | Gallery DOM/store/decoded-image footprint grows with every page | Partially implemented; metadata cache remains unbounded | L | Gallery |
| STAB-07 | P1 | Release build does not enforce typecheck, lint, tests, or size budgets | Confirmed | M | Tooling/CI |
| STAB-08 | P1 | Cold entry and forced Home prefetch compete with startup hydration | Confirmed | M | App boot/bundles |
| STAB-09 | P1 | Custom doodle history stores uncapped deep scene copies | Confirmed | S | Customization |
| STAB-10 | P2 | Chat widget state is unbounded and not reset on logout | Confirmed | S | Chat/store lifecycle |
| STAB-11 | P2 | Conversation and message-history UI can exceed intended bounds | Confirmed | M | Chat |
| STAB-12 | P2 | Chat send acknowledgements and typing timers can remain pending/burst | Confirmed | S | Chat/socket |
| STAB-13 | P2 | Login/resume hydration launches broad concurrent replacement bursts | Pressure risk | M | Auth/app lifecycle |
| STAB-14 | P2 | IndexedDB completion/error handling can report early or hang | Confirmed | S | Draft persistence |
| STAB-15 | P2 | Dependency duplication and production-package inflation increase risk | Confirmed | M | Packages |
| STAB-16 | P2 | Android does not shed WebView workloads on memory pressure | Confirmed | M | Android/native |
| STAB-17 | P3 | Small listeners/timers lack idempotency or cancellation | Confirmed | XS | App/store hygiene |

## Detailed findings and acceptance criteria

### STAB-01 — Drawing session is not destroyed on route exit

**First-pass remediation (2026-08-01):** Implemented an idempotent session release path. Exit now cancels initialization, waits for an active eraser commit, detaches the JSON/thumbnail snapshot required for persistence, then releases history, sync, tools, claims, shortcuts, gestures, events, UI timers, preview state, renderer/index state, workers, and Fabric canvas. `DrawMain` unmount and Ionic `onIonViewDidLeave` provide repeat-safe backstops. A failed exit snapshot keeps the drawing open and restarts autosave.

**Why it matters:** This is the highest-confidence cross-app memory defect. Leaving Drawing stops the room and autosave, but does not dispose the live canvas or its complete session graph. A later screen can therefore run while Fabric backing stores, draw objects, spatial indexes, render resources, workers, and handlers remain reachable.

**Evidence:**

- `src/views/draw.view.vue:31` calls only `performRoomExit()` on view leave.
- `src/components/draw/DrawMain.vue:188` has an empty unmount hook.
- `src/components/draw/DrawExitGuard.vue:37-63` starts a background save and navigates without destroying the draw session.
- `src/draw/canvas/canvasController.ts:32-47` already has `destroyCanvas()`, but it is called at the beginning of the *next* initialization, not on exit.
- `src/draw/canvas/drawObjectManager.ts:483-487` destroys the renderer but leaves its object map/index bookkeeping intact until a future rebuild.
- `src/draw/input/shortcutManager.ts:359-367` installs a window key listener whose `destroy()` is not part of exit.
- `src/draw/ui/drawUI.store.ts:82-84` exposes empty `init()`/`destroy()` methods and retains avatar timeouts/state.

**Important race:** `exitWithBackgroundSave()` first serializes the live canvas (`src/draw/document/document.store.ts:416-456`). Destroying the canvas immediately after starting that floating promise can corrupt or abort the snapshot. The solution must explicitly detach a snapshot before freeing the live scene.

**Recommendation:** Add a single idempotent `drawSession.dispose(reason)` orchestrator. Exit should: stop new input; cancel async initialization; stop autosave; await or synchronously detach the JSON/thumbnail inputs needed by the background save; leave the room; destroy UI/tool/history/event/shortcut state; destroy the render engine and Fabric canvas; terminate session workers; clear indexes/maps/timers; then navigate. It must also be safe after partial initialization and after a failed load.

**Acceptance criteria:**

- Ten cycles of Home → Drawing → add content → Home produce no increasing count of canvases, Workers, window listeners, Fabric objects, or renderer tiles.
- `adb shell dumpsys meminfo <package>` post-GC/post-idle memory has no monotonic growth across the cycle; establish an allowed variance from device baselines.
- A background save made during exit remains reopenable after process kill.
- Exit during cold load, remote load, worker bake, erasure cleanup, and bucket fill does not produce unhandled rejection or late UI mutation.
- Unit tests cover dispose before init, during init, after init, repeated dispose, and snapshot-before-dispose ordering.

### STAB-02 — Production feedback loop is absent

**Why it matters:** ANR reduction cannot be managed from aggregate crash rate alone. The repository has an excellent draw performance snapshot, but no visible pipeline tying JavaScript exceptions, native exits, device/GPU/WebView version, memory pressure, current route, draw metrics, and release cohort together.

**Evidence:** No Sentry/Crashlytics-style collector, `ApplicationExitInfo` ingestion, or `onTrimMemory` implementation was found. `MainActivity.java` handles IME insets and notification dismissal only. Existing draw metrics are local/manual unless exported by the user.

**Recommendation:** Install one production error/performance pipeline with both native Android and browser SDK coverage. On the next launch, collect Android historical exit reasons where supported; attach app version, WebView version, manufacturer/model, ABI, memory class, raw/render DPR, draw backend/protocol cohort, route, last interaction, tile/overview/worker metrics, and whether the app was backgrounded. Sample performance breadcrumbs; never attach drawing or message content. Define ANR and crash-free-session dashboards before rollout.

**Acceptance criteria:**

- Every release is distinguishable by app/build version and remote experiment cohort.
- A forced JS error, native exception in a test build, low-memory callback, and simulated process death appear with route/device context.
- Draw performance snapshots can be attached by ID or summary without personal content.
- The team can answer which device/WebView/render-backend cohort caused an ANR increase within one business day.

### STAB-03 — Drawing initialization is not cancellable or failure-safe

**First-pass remediation (2026-08-01):** Each initialization now owns an `AbortController` and generation number. Route exit/superseding initialization aborts fetch and time-sliced enlivening, and generation assertions guard continuations after awaits. Loading state clears in `finally`; initialization errors propagate to `DrawMain`, which reports a recoverable toast. The scheduled animation frame and room-menu timer are cancelled on unmount.

**Why it matters:** Route exit or component destruction can happen while IndexedDB, network fetch, JSON parsing, object enlivening, fonts, socket login, or canvas initialization is awaiting. Late continuations can join a room or mutate disposed UI. Failures can also leave the global loading state stuck.

**Evidence:**

- `src/components/draw/DrawMain.vue:123-172` schedules an async initialization in `requestAnimationFrame`, retains no frame ID/abort token, and attaches no rejection handler.
- The room-menu timeout at `DrawMain.vue:181-185` is not retained or cancelled.
- `src/draw/session/draw.store.ts:50-86` sets `isLoadingCanvas = true` and clears it only on success; there is no `try/finally`.
- `src/draw/document/document.store.ts:248-252` catches load errors and returns normally, so initialization continues with a potentially blank/partial canvas and no failure signal.

**Recommendation:** Give each drawing mount a generation token and `AbortController`. Propagate the signal through load/enliven/worker startup where practical; validate the generation after every await. Use `try/catch/finally` to reset loading and present a recoverable load error. Cancel the frame and timeouts on exit.

**Acceptance criteria:** Navigating away at every awaited phase produces no socket join, menu open, canvas mutation, or state write from the abandoned generation. A failed remote/IDB load displays retry/back and always clears loading.

### STAB-04 — Worker lifetime and bucket-fill failure paths outlive work

**First-pass remediation (2026-08-01):** Erasure analysis is now lazy and terminates on timeout, error, post failure, or session exit while settling retained requests conservatively. Bucket fill accepts a session abort signal, has a 15-second deadline, settles listeners/promises on all failure paths, terminates stuck work, and recreates lazily. Tile bakery now exposes a session shutdown that cancels idle work, terminates its worker, and clears retained dirty/batch state.

**Why it matters:** Workers have their own compiled code, JS heap, WASM/canvas state, and transferred buffers. Keeping them for the app lifetime defeats route-level code splitting and makes memory pressure on the next screen worse.

**Evidence:**

- `src/draw/tools/erasureAnalysisClient.ts:7-12` constructs an eraser worker at module evaluation and never terminates/recreates it. Individual requests do have a good 10-second timeout.
- `src/draw/tools/bucketFill.ts:52-90` lazily creates a singleton worker but has no request timeout, abort path, or termination/recreation on a silent worker hang.
- Mobile bucket fill escalates to a 2048×2048 canvas (`bucketFill.ts:21-48`), creating a 16.8 MB RGBA buffer before other temporary/worker/contour allocations. Main-thread object rasterization at `bucketFill.ts:179-195` is synchronous.
- The tile bakery has a robust internal `teardown()` (`tileBakeryClient.ts:261-278`), but no exported session-shutdown action. `bakeryClear()` can retain or even instantiate the worker (`tileBakeryClient.ts:618-627`).

**Recommendation:** Make all drawing workers lazy, abortable, and owned by the drawing session. Export shutdown functions that settle pending work, close bitmaps, clear retained object references, terminate, and allow clean recreation. Add a bucket-fill deadline and terminate/recreate on failure. Apply the severe-device profile to fill escalation and consider time-slicing main-thread object raster preparation.

**Acceptance criteria:** Worker count returns to the non-drawing baseline after exit; a deliberately hung worker settles the UI action within the deadline; fill failure allows the next fill; exit during a 2048 fill releases the session without a late result.

### STAB-05 — Home loads every full draft payload

**First-pass remediation (2026-08-01):** IndexedDB schema version 3 adds a `canvasMetadata` store and backfills it without deleting the existing payload store. Saves and deletes update payload and metadata atomically in one transaction. Home/MyDrafts now enumerate `DrawingDraftMetadata` only; opening a draft still reads the one full payload by ID.

**Why it matters:** Draft list UI needs an ID, timestamp, and thumbnail, but `getAll()` returns the full JSON Blob for every draft. Home then retains the entire array. A user with many complex drawings can enter Home with a large IDB read, structured-clone cost, JS/Blob retention, and decoded thumbnail set—while the previous draw session may still be resident.

**Evidence:**

- `DrawingDraft` includes `json`, `thumbnail`, and metadata (`src/draw/document/document.store.ts:22-27`).
- `getAllDrafts()` uses object-store `getAll()` (`document.store.ts:503-511`).
- Home assigns the complete result to `localDrafts` (`src/views/home.view.vue:221-226`).

**Recommendation:** Migrate to metadata-only listing: separate metadata and payload stores, or store payload under a separate key and enumerate metadata with a cursor/index. Fetch JSON only when opening one draft. Bound retained draft thumbnails and establish a storage quota/retention policy with explicit user control rather than silent deletion.

**Acceptance criteria:** Home list memory and IDB transfer are independent of total draft JSON bytes. A test database with 100 large drafts reads only metadata/thumbnail fields; opening one draft fetches one payload.

### STAB-06 — Gallery grows with every page

**First-pass remediation (2026-08-01):** Gallery cells are observed by one shared `IntersectionObserver`; only a 700 px viewport buffer mounts `Thumbnail`, bounding active image decodes, component watchers, long-press handlers, and per-thumbnail `ResizeObserver`s. Leaving an Ionic-cached Gallery unmounts all thumbnails and disconnects observation. Inbox batch, sync, and single-item ingress now deduplicate by ID. This is intentionally marked partial: lightweight inbox metadata and comment previews still accumulate, and PhotoSwiper still receives the complete retained collection.

**Why it matters:** CSS `content-visibility` can skip off-screen rendering work, but it does not unmount Vue components, disconnect their observers, remove store objects, or guarantee decoded bitmap reclamation. Every page remains in the Pinia array and every item remains a `Thumbnail` component.

**Evidence:**

- `src/store/inbox.store.ts:32-70` appends 30-item pages with no resident cap.
- New-item synchronization prepends with no ID deduplication/cap (`inbox.store.ts:86-95`); single-item fetches also push (`:105-116`).
- Socket comments append to each retained item’s comments array (`:127-140`).
- `src/views/gallery.view.vue:61-89` renders all grouped items.
- Every mounted thumbnail owns a watcher and `ResizeObserver` (`src/components/gallery/Thumbnail.vue:114-149`). Cleanup is correct only after unmount.

**Recommendation:** Implement a windowed/virtualized grid or bounded sliding page cache. Keep a stable item-by-ID index and lightweight page metadata; deduplicate all ingress paths. Cap comment previews and fetch full comments in the drawer. Pass a bounded collection or lazy resolver to PhotoSwiper rather than the entire retained gallery.

**Acceptance criteria:** After scrolling through at least 1,000 synthetic items, mounted thumbnail/observer/image counts remain within a fixed window and memory plateaus. Returning to earlier items preserves scroll position and reloads data without duplicates.

### STAB-07 — Release checks are not enforced

**Why it matters:** Vite transpilation is not type checking. A green production build currently coexists with TypeScript failures and a nonfunctional lint command.

**Evidence:** `package.json:11` runs only `vite build`. `vue-tsc` currently reports errors in drawing props/store assignments/Fabric contracts and other app code. ESLint 9 cannot consume the legacy config. No repository CI workflow was found.

**Recommendation:** Create a single `verify` script and CI/release job: frozen install, lint, `vue-tsc --noEmit`, unit tests, production build, bundle-budget check, and Android release compile/smoke stage. Fix or explicitly baseline existing errors; do not silently ignore the command. Add focused lifecycle tests from this audit.

**Acceptance criteria:** A type error, lint violation, failed unit test, oversized entry/chunk, or Android release compile failure blocks release. The same command runs locally and in CI.

### STAB-08 — Startup work and Home prefetch

**Why it matters:** On a cold WebView, network/auth/store hydration, module parsing, Vue mount, Ionic registration, and native plugin initialization compete on one UI process. Home then forces parsing of the large drawing graph after 1.5 seconds even if the browser never becomes idle.

**Evidence:**

- The main entry is 1.45 MB raw / 360 kB gzip.
- `src/main.ts:19-30` statically imports notification and general helpers. `general.helper.ts:2` makes CompressorJS part of the entry; it also imports Firebase/auth/RevenueCat/router concerns. `notification.helper.ts:14` imports Firebase messaging even on native.
- `src/views/home.view.vue:166-170` uses `whenIdle(..., 1500)` to import the draw route. The timeout forces work under load.
- Auth background hydration starts ten operations together (`src/store/auth.store.ts:293-311`).

**Recommendation:** Split helpers by responsibility and platform. Dynamically import image compression at the call site, web Firebase messaging only on web, and native billing only when needed. Review selective Ionic registration because bundle analysis shows the full Ionic component set contributes heavily to the entry. Disable forced draw prefetch on constrained/native devices; use genuine idle after first interaction or intent-based prefetch on touch/hover. Add an entry gzip budget and startup trace.

**Acceptance criteria:** Main gzip decreases by an agreed first target (recommend at least 20% without feature removal); cold-start interaction is not delayed by draw parsing on constrained devices; first meaningful navigation and router/splash timing are captured on representative phones.

### STAB-09 — Custom doodle history is uncapped

**Why it matters:** Each committed gesture snapshots the complete stroke scene. As the drawing grows, every subsequent history entry retains another deep copy, creating approximately quadratic retained point growth in a long customization session.

**Evidence:** `src/components/profile/customization/BackgroundSketchPadModal.vue:468-500` keeps uncapped `past` and `future` arrays and deep-clones every stroke/point. Lifecycle cleanup for observers/frames is otherwise present. The main drawing history is already capped at 50 actions; this editor is not.

**Recommendation:** Cap both stacks by action count and estimated points/bytes. Prefer operation deltas for add/erase if the editor remains feature-rich. Clear the opposite stack and release snapshots promptly. Track `fitView()` timeouts as part of modal cleanup.

**Acceptance criteria:** A 500-gesture synthetic session remains under the configured history budget, preserves the most recent undo depth, and releases all snapshots when the modal closes.

### STAB-10 — Chat widget state is unbounded and survives logout

**Why it matters:** Every incoming/opened conversation can create a customized chat head. Those heads are rendered with avatar/profile decoration UI. The auth logout resets the chat store but not the widget store, allowing the previous account’s head IDs/active tab/UI flags to persist into another login.

**Evidence:**

- `src/store/chatWidget.store.ts:11-13` defines uncapped head and bounce arrays.
- `addChatHead()` only deduplicates and prepends (`:41-45`); every new-message alert calls it (`:86-93`).
- No reset action is exposed by the widget store.
- `src/store/auth.store.ts:432-439` clears chat and several other stores but not `chatWidget`.

**Recommendation:** Add `resetRuntimeState()` and call it on logout/account change. Apply an LRU cap (for example 6–8), protecting the active head. Track/clear bounce timers.

**Acceptance criteria:** Account B sees no account A chat head or active tab; a burst across 100 conversations never exceeds the configured head/component limit.

### STAB-11 — Conversation/message UI can exceed intended bounds

**Why it matters:** Direct-message histories have good 300→200 trimming and an eight-conversation cache, but trimming is allowed only while pinned to the bottom. A user can page far back, close the panel, and leave an oversized cached history. Conversation overview lists are not paginated/windowed and mount a full customized `ConversationItem` per active chat.

**Evidence:**

- Bounds and bottom-only trimming are documented at `src/store/chat.store.ts:54-89`.
- Up to eight histories remain cached (`:65-127`).
- `src/components/chat/ChatOverview.vue:169-177` renders every regular conversation; its computed list covers all active/pending chats (`:275-293`).

**Recommendation:** When a thread’s content DOM is released or the panel closes, trim it safely because there is no visible scroll anchor to preserve. Paginate or virtualize the overview and cap dormant conversation objects while keeping unread/summary metadata separately.

**Acceptance criteria:** Loading 2,000 old messages then closing the panel returns that thread to its cap; 1,000 conversations do not create 1,000 mounted `ConversationItem` trees.

### STAB-12 — Chat acknowledgements and typing timers

**Why it matters:** Socket connectivity does not guarantee a server acknowledgement. A send can remain `sending` forever, protecting its conversation from cache pruning. Repeated typing events create one timeout per event rather than replacing a per-sender timeout.

**Evidence:** `src/service/api/socket/chat.socket.ts:177-195` has no acknowledgement deadline. `src/store/chat.store.ts:630-637` creates untracked typing timeouts.

**Recommendation:** Use a socket acknowledgement timeout or explicit timer, transition optimistic messages to retryable error, and deduplicate server responses by local key. Maintain one typing-expiry timer per sender and clear all on logout/disconnect.

**Acceptance criteria:** With acknowledgements intentionally dropped, sends enter error within the deadline and can retry exactly once without duplicate delivery. Typing timer count is bounded by active senders.

### STAB-13 — Hydration and resume bursts

**Why it matters:** On login, ten store/network operations run concurrently. After only five seconds in the background, resume replaces inbox, chats, quota, notification, inventory, lobby, and other state together, then reloads the active conversation. Network concurrency is useful, but response parsing and reactive replacements can converge into a main-thread burst exactly when Android is resuming the WebView.

**Evidence:** `src/store/auth.store.ts:293-311` and `:358-383`; `src/service/activeViewSync.ts:13-42`.

**Recommendation:** Instrument before changing behavior. Divide critical/visible, near-term, and idle hydration; add single-flight guards and freshness TTLs per store. On resume, refresh only the visible route first, then schedule other stores with a concurrency limit and generation token. Avoid replacing unchanged large arrays.

**Acceptance criteria:** Resume traces show no long task above the agreed threshold; duplicate resume/login signals coalesce; visible-route data updates first; stale responses cannot overwrite a newer account/session.

### STAB-14 — IndexedDB completion and errors

**Why it matters:** Draft durability is crash-sensitive. A request’s success means the `put` was accepted, not necessarily that the transaction committed. Reads without `onerror` can remain pending on failure. Schema deletion is started but not awaited before reopening.

**Evidence:**

- `runSave()` resolves on `req.onsuccess`, not `transaction.oncomplete` (`src/draw/document/document.store.ts:311-321`).
- `getDraft()` and `getAllDrafts()` define no error/abort handlers (`:466-474`, `:503-511`).
- Schema rebuild calls `deleteDatabase()` and immediately permits another `open()` (`:125-137`).

**Recommendation:** Resolve writes only on transaction completion and handle abort/error. Add error/timeout paths to reads. Await database deletion and handle `blocked`; close on version change. Surface a recoverable storage error instead of silently showing a blank canvas.

**Acceptance criteria:** Simulated transaction abort never marks a draft saved; read/open/delete failures settle with an error; process-kill tests after the saved indicator reopen the latest committed draft.

### STAB-15 — Dependency graph and production-package inflation

**Why it matters:** Duplicate framework versions increase install/bundle complexity and compatibility risk. Node-only package managers/build tools classified as production inflate audit noise and supply-chain surface.

**Confirmed issues:**

- `@ionic/core` is pinned to 8.7.10 while `@ionic/vue`/router resolve 8.8.1, leaving two Ionic core versions in the lockfile.
- Direct `@firebase/firestore` 4.12.0 coexists with Firebase’s 4.8.0 path; `FeedbackMenu.vue` imports the direct package rather than `firebase/firestore`.
- Direct VueUse 10 and DatePicker’s VueUse 14 are both installed.
- `@types/fabric` 5.3 targets a much older API than runtime Fabric 7.2, contributing to invalid types.
- `ionicons` 7 coexists with Ionic’s ionicons 8 path.
- `npm`, `pnpm`, `i`, `install`, `serve`, and `autoprefixer` are production dependencies. `express` should be isolated to the server deployment if that entry point remains required.
- No source import was found for `@revenuecat/purchases-js`, `browser-image-compression`, or `@vueuse/components`; verify and remove if genuinely unused.
- The live production audit includes critical/high paths through direct Firestore/protobuf, Firebase database/websocket-driver, Socket.IO/Fabric `ws`, Express routing, and tooling packages. Some Node-only paths do not ship in the WebView bundle, but still matter to builds/server/supply chain.

**Recommendation:** Do package cleanup in controlled groups: remove unused/tooling production entries; align Ionic/ionicons; remove obsolete Fabric types; consolidate Firebase imports/version; then upgrade advisory-bearing browser/runtime packages with device regression tests. Run `pnpm dedupe` only after manifest alignment and review the lockfile diff. Do not combine the Fabric runtime upgrade with drawing lifecycle changes.

**Acceptance criteria:** One intended Ionic core, one intended Firestore line, no package manager as application runtime dependency, audit output triaged by actual deployment surface, typecheck improved, and build/device tests pass.

### STAB-16 — No native memory-pressure shedding

**Why it matters:** Web code cannot reliably know Android’s process-wide memory pressure, especially GPU/native bitmap pressure. The app can proactively release Gallery/Feed/chat content and draw worker/tile caches before the OS kills the WebView process.

**Evidence:** `android/app/src/main/java/ninja/sketchmate/app/MainActivity.java` has no `onTrimMemory()` forwarding. Hardware acceleration is explicitly enabled and `largeHeap` is not requested (`AndroidManifest.xml:55-62`), both appropriate. Draw budgets are static after device classification.

**Recommendation:** Forward meaningful `ComponentCallbacks2` trim levels to a small JS event. On moderate/background levels, release off-screen feed/gallery/photo-swiper decoded content and idle workers; on critical levels, stop animation warm caches, clear dormant chat histories, reduce/clear draw fallback caches without losing live document data, and prioritize a detached draft snapshot. Keep actions idempotent and cheap. Record every event in telemetry.

**Acceptance criteria:** `adb shell am send-trim-memory` test levels trigger the expected bounded release actions without losing the active draft or corrupting navigation; memory falls in device profiles; repeated events are safe.

### STAB-17 — Small lifecycle hygiene

These are not credible ANR causes alone, but are cheap to remove:

- `src/store/network.store.ts:10-13` installs a listener without an idempotency guard or retained handle.
- `src/store/auth.store.ts:471-490` does not clear its 10-second timeout when initialization resolves early.
- `BackgroundSketchPadModal` retains a 300 ms transition timeout and a second 180 ms measurement timeout without tracking both, though its observers and RAFs are otherwise cleaned up.
- Profile world cleanup is strong, but first mount warms/prefetches every sprite type with a forced 2-second idle timeout (`src/components/profile/ProfileWorld.vue:399-415`). Gate that warm-up by device tier and actual catalog intent; do not compete with cold startup.

## Memory model: local budgets are not a process budget

The drawing engine’s explicit budgets are good, but several large pools coexist:

| Pool | Current bound/behavior | Risk note |
|---|---|---|
| Fabric lower + upper canvases | Render DPR capped at 1.5 low-end / 2 otherwise | At 1080×2400 CSS px and DPR 1.5, one RGBA backing store is about 23.3 MB; two are about 46.7 MB before other canvases/textures. |
| Draw tiles + overview | 24 MB severe, 32 MB low-end, 72 MB normal mobile; overview 768/1024 px | Budget includes tile policy, not all Fabric/GPU/worker copies. |
| Tile bakery worker mirror | JSON cap 24 MB low-end / 48 MB mobile plus enlivened objects and canvas | Separate worker heap and raster allocations. |
| Transform surfaces | Low-end aggregate cap 1.0–1.5 Mpx; larger on normal mobile | Multiple live/vacated/DOM surfaces can overlap transiently. |
| Bucket fill | 1200² then 2048² mobile | 5.8 MB then 16.8 MB for one RGBA buffer, plus canvas, worker algorithm, contour output, and scene raster work. |
| Draft snapshot | Detached JSON + Blob + thumbnail worker | Can overlap the live scene during exit/autosave. |
| Gallery/Home | No gallery page cap; Home loads all full draft payloads | Competes with retained draw memory after navigation. |
| Images/Lottie/profile effects | On-screen gating and shared/frozen modes exist | Decoded bitmap/GPU memory is not visible in JS heap. |

The right target is a **route-level process budget**, not simply smaller tile numbers. Measure Android PSS, graphics memory, worker count, canvas pixels, decoded image count, JS heap where available, and draw-engine internal bytes together at route transitions.

## Existing safeguards worth preserving

- Global overlays in `App.vue` are mostly async and mounted only when opened.
- Chat panel content is released after close; messages are `markRaw`, histories are capped/cached, toasts are capped at three, and lobby chat is capped.
- Community feed results and post cache are bounded; expensive feed DOM is released immediately on constrained Android and after a delay elsewhere.
- Gallery cells and chat rows use `content-visibility` to reduce off-screen layout/paint.
- Profile worlds use intersection gating, frozen/static low-end modes, shared sprite resources, and explicit destroy on unmount.
- Drawing uses capped DPR, per-device tile/overview/transform budgets, time slicing, spatial queries, bitmap close/disposal, bounded history, cancellable bakery requests, and a performance capture panel.
- Draft thumbnails are worker-generated and the worker is terminated per job.
- Android release minification/resource shrinking are enabled; hardware acceleration remains enabled; `largeHeap` is not used.

These controls should be regression-tested, not removed during cleanup.

## Pull-request roadmap

Each row is intended to be independently reviewable and reversible. Where two items are coupled, the dependency is explicit.

| Pull | Size | Scope | Depends on | Ship gate |
|---:|---:|---|---|---|
| 1 | M | Production telemetry, release/build IDs, Android exit reasons, route/draw context, privacy filter | None | Test events visible; dashboards exist. |
| 2 | M | Repair lint config; add `typecheck`, `verify`, unit/build gates and initial bundle budget | None | Green locally/CI; existing failures fixed or explicitly baselined. |
| 3 | M | Race-safe `drawSession.dispose()` and initialization cancellation | Pull 1 preferred | Ten-cycle lifecycle soak and exit-save kill test pass. |
| 4 | M | Session-scope eraser/fill/bakery workers; fill timeout/recovery | Pull 3 | Worker count returns to baseline; hang tests pass. |
| 5 | M | Draft metadata/payload storage migration and metadata-only Home query | None | 100-large-draft test has flat list memory. |
| 6 | L | Gallery virtualization/bounded pages, dedupe index, bounded comments/swiper resolver | Pull 1 preferred | 1,000-item scroll memory plateaus. |
| 7 | S | Cap customization doodle history; track remaining modal timers | None | 500-gesture budget test passes. |
| 8 | S | Reset/cap chat widget, ACK timeout, per-sender typing timers, closed-thread trim | None | Burst/account-switch/history tests pass. |
| 9 | M | Startup import split, native/web notification split, constrained-device prefetch policy | Pull 1 | Entry gzip and startup trace improve without feature regression. |
| 10 | M | Package graph cleanup and advisory upgrades in controlled groups | Pull 2 | Frozen install, verify, Android release smoke pass. |
| 11 | M | Android `onTrimMemory` bridge and route-aware cache shedding | Pulls 1, 3, 4 | Trim-level device tests pass with no data loss. |
| 12 | M | Staged/freshness-aware login and resume hydration | Pull 1 | Resume trace and stale-generation tests pass. |

### Easy first pulls

If the team needs very small, low-conflict work while the P0 lifecycle design is reviewed:

1. Fix/clear `waitUntilInitialized()`’s timer and make `networkStore.init()` idempotent.
2. Add/reset/cap the chat-widget store.
3. Add a socket acknowledgement deadline and per-sender typing timer map.
4. Cap customization history by action and point budget.
5. Disable forced draw prefetch for `low-end`/`android-wv` until startup data proves it beneficial.
6. Move obvious build/package-manager dependencies out of `dependencies`, one manifest-only pull at a time.

These are useful, but they should not displace Pulls 1–4.

## Field test and release matrix

### Representative devices

At minimum, maintain:

- Android Go/2 GB, 2–4 core, DPR 2–3;
- low/mid Qualcomm Adreno device implicated by existing GPU traces;
- modern 4–6 GB Android with current System WebView;
- one older supported Android/WebView combination;
- current iPhone and one older supported iPhone if iOS is shipped;
- desktop Chrome as a correctness baseline, not the performance acceptance device.

Record OS, System WebView version, GPU/driver, memory class, DPR/render DPR, thermal state, battery saver, and backend/protocol cohort.

### Required scenarios

1. Cold start, login, Home usable, immediately open Drawing.
2. Open a large local and remote drawing; pan/zoom, select/move, undo/redo, erase, bucket fill, autosave, background/resume, exit.
3. Repeat Home ↔ Drawing ten times, including exit during initialization and save.
4. Gallery continuous scroll through 1,000 synthetic items, open/close PhotoSwiper repeatedly, then open Drawing.
5. Home with 100 large drafts; open one, save, kill process, reopen.
6. Chat with 1,000 conversations, eight cached long threads, 2,000-message history load, message/typing bursts, missing ACK, logout/login to another account.
7. Customization with animated world/effects plus 500 doodle gestures and repeated modal opens.
8. Background for 6 seconds and several minutes; resume on Home, Gallery, Chat, and Drawing.
9. Trigger Android memory trim levels and verify graceful release.
10. Run while thermally throttled/battery saver and with poor/offline network.

### Suggested service-level gates

Set numerical production targets from the current Play baseline rather than inventing absolute promises. The first dashboard should track:

- user-perceived ANR rate and overall ANR rate by release/device/WebView;
- crash-free users/sessions and native GPU/WebView crash signatures;
- cold-start time to interactive and first route transition;
- p95/p99 long-task duration and input delay during drawing;
- PSS/graphics memory before Drawing, peak Drawing, and post-exit recovery;
- worker/canvas/observer/component counts in lifecycle soak tests;
- draw bake timeout/deferral/cancel/bitmap-memory metrics;
- draft save failure/abort and reopen-after-kill success;
- Gallery item count versus resident memory;
- bundle entry and route/worker gzip budgets.

Release rollback criteria should be written before each stabilization experiment. Compare cohorts only when app version, WebView/device class, and draw backend/protocol are known.

## Adjacent security/reliability notes

These are not primary ANR findings but belong in the release backlog:

- `android:usesCleartextTraffic="true"` is enabled application-wide. Replace it with HTTPS-only or a narrowly scoped debug/network security configuration.
- Legacy external-storage read/write permissions remain in the manifest; validate against current target SDK behavior and remove if unused.
- The production dependency audit should be repeated after package classification cleanup. Do not treat fewer audit rows as proof of browser exploitability or safety; triage each path by whether it ships to WebView, native, server, or build infrastructure.

## Definition of done for the stabilization program

The program is complete only when:

- drawing exit deterministically releases session resources without losing drafts;
- route memory plateaus under repeat and high-volume tests;
- all long-lived lists/workers/history stacks have explicit bounds or lifecycle ownership;
- production failures are attributable by release/device/WebView/route/cohort;
- release verification is automated and green;
- package and bundle budgets are explicit;
- Play ANR/crash metrics improve over a statistically meaningful rollout window without a drawing-quality or save-integrity regression.

Until production telemetry and physical-device soaks are available, this document should be treated as a ranked engineering hypothesis set—not proof that every possible ANR or crash has been eliminated.
