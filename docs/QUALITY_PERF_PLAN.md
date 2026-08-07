# SketchMate code quality & performance plan

**Created:** 2026-08-07
**App version:** 0.4.4 · branch `develop`
**Primary target:** low-end Android System WebView (≤4 cores, 2–3 GB RAM)
**Explicitly out of scope:** drawing engine internals (tile policy, bakery, brushes, transform). Owned by [`DRAW_ENGINE_PERF.md`](./DRAW_ENGINE_PERF.md) / [`DRAW_ENGINE_V3_PLAN.md`](./DRAW_ENGINE_V3_PLAN.md). Only the engine's *lifecycle boundary* (worker teardown, memory-pressure hooks) is touched here.

Companion doc: [`PERFORMANCE_STABILITY_AUDIT.md`](./PERFORMANCE_STABILITY_AUDIT.md) (2026-08-01). This plan re-verifies its open items against current `develop` and adds the packaging / toolchain / upgrade workstreams.

---

## 1. Measured baseline (re-run 2026-08-07)

| Check | Result | Delta vs audit |
|---|---|---|
| `vitest run` | **Pass** — 62 files, 317 tests, 3.9 s | improved (was 47/208) |
| `vue-tsc --noEmit` | **Fail — 62 errors** | still failing, but bounded |
| `eslint` | **Broken** — ESLint 9 flat-config vs legacy `.eslintrc.cjs` | unchanged |
| Repo CI | **None** (no `.github/`) | unchanged |
| Pre-commit hook | `.husky/pre-commit` → `pnpm run lint_fix_and_add` → **`git add .`** | new finding |
| Sentry | Present (`src/observability/sentry.ts`, lazy chunk) | STAB-02 partly closed |

### Cold-start payload (from current `dist/`)

`index.html` emits **16 `modulepreload` links + entry = 1,503,199 raw bytes fetched, parsed and evaluated before first paint.**

| Artifact | Raw | Gzip | What it is |
|---|---:|---:|---|
| `toast.service-*.js` | **1,118,339** | **237,445** | **The entire Ionic component library.** Eager. |
| `index-*.js` (entry) | 315,392 | 104,908 | App shell, Firebase, stores |
| ~13 × `p-*.js` | ~70,000 | — | Ionic stencil lazy chunks, also preloaded |
| `dist-*.js` | 339,968 | 37,207 | `@lottiefiles/dotlottie-web` (lazy) |
| `tileBakery.worker-*.js` | 339,968 | 102,618 | draw worker (lazy) |
| `eraser.worker-*.js` | 331,776 | 99,260 | draw worker (lazy) |
| `layerRegistry-*.js` | 294,912 | 88,088 | draw graph (lazy) |
| `FeedbackMenu-*.js` | 212,992 | 66,883 | lazy, second direct Firestore path |
| `PhotoSwiper-*.js` | 212,992 | 58,686 | lazy |

### The single biggest finding

`node_modules/@ionic/vue/dist/index.js` is a **pre-bundled 104 KB single module** containing ~130 Vue wrappers, each with a module-scope `defineCustomElement()` side effect, each statically importing `@ionic/core/components/ion-*.js`.

Because it is one module with side effects, **no bundler can tree-shake it.** Importing `IonicVue` — which `main.ts` must do — drags in all ~130 components.

**The app uses 46 of them.** Top usage: `ion-icon` ×377, `ion-button` ×157, `ion-item` ×44, `ion-spinner` ×36, `ion-popover` ×27, `ion-content` ×27, `ion-modal` ×24.

On a low-end WebView this is not just 237 kB of transfer — it is ~1.1 MB of source parsed and compiled, ~130 registered custom element classes, and all their CSS strings resident for the process lifetime. **This is the largest single memory and startup item in the app outside the drawing engine.**

---

## 2. Priority order and rationale

The ordering is deliberate: **guardrails before changes, cheap wins before risky upgrades, and framework upgrades last** so that when something regresses on a real device we know which change caused it.

| Phase | Theme | Effort | Expected payoff |
|---|---|---|---|
| **P0** | Guardrails: typecheck green, one linter, CI, device memory harness | 2–3 d | Makes every later phase verifiable |
| **P1** | Dependency surgery: remove dead deps, align duplicates | 1–2 d | Smaller install, less audit noise, fewer bundle dupes |
| **P2** | Cold start & eager bundle (Ionic trim, entry split) | 3–5 d | **Largest measurable win** |
| **P3** | Memory ceilings: unbounded stores, logout resets, trim-memory | 4–6 d | Fixes the "app dies after 20 min" class |
| **P4** | Bug-prone code cleanup | 3–4 d | Fewer regressions; unblocks strict TS |
| **P5** | Framework upgrades: vue-router 5, pinia 4, VueUse 14, Vite/TS | 3–5 d | Maintenance; **not** a perf win — see §7 |
| **P6** | Bun migration + Heroku | 2–3 d | Build/CI speed only |
| **P7** | Vue 3.6 exploitation (Vapor where safe) | spike | Speculative; gated on P2 |

---

## 3. P0 — Guardrails — **DONE (2026-08-07, branch `chore/p0-guardrails`)**

| Item | Status |
|---|---|
| P0.1 `vue-tsc --noEmit` green | **Done** — 0 errors (was 62) |
| P0.2 One linter (Biome) | **Done** — ESLint + 7 packages removed |
| P0.3 Pre-commit hook | **Done** — no longer `git add .` |
| P0.4 `verify` script + CI + budget | **Done** — `.github/workflows/verify.yml`, `scripts/checkBudget.mjs` |
| P0.5 Device memory harness | **Partial** — `scripts/memProfile.mjs` written; not yet run (no low-end device; use a constrained emulator) |

`pnpm verify` = Biome → `vue-tsc --noEmit` → Vitest (317) → build → budget. Exits 0.

### Findings the gate surfaced

Type errors were not cosmetic. Real bugs fixed while getting to zero:

- **Rectangle shape creation threw.** `shapeActions.ts` built a plain `{x,y,w,h}` object literal instead of a `Rect`, so `o.set(...)` failed. `Rect` was imported and unused — the branch had never worked since the refactor.
- **Double-send window in `SendHub`.** `shareService.isSending = true` assigned to a `computed`, a silent no-op, so the guard was false through `getDataToSend()` and a 400 ms timer. Added a `setSending` action.
- **`RoomMenu`** assigned to the `publicLobbyName` computed — also a no-op.
- **`Shortcut.manual`** was referenced in `shortcutManager` but missing from the enum: the Help-menu shortcut was dead. Added as `"?"`.
- **`fmtCountdown` / `BalloonMenu`** fed optional `reset_at` to `new Date()` → Invalid Date → NaN countdown.
- **`eraser.store`** read a store-level brush ref inside a queued async commit that could run after disposal.
- **`yielder.ts`**: three `@ts-ignore` covered the wrong lines (a directive only applies to the next line, and the `if` spanned four).
- **`colors.config`** typed `colorsPerRoute` as `Record<FRONTEND_ROUTES, …>` while defining 4 of 12 routes.
- **Stale Fabric 5 API**: `fabric/fabric-impl` type imports, and `getBoundingRect(true, true)` at 25 call sites — Fabric 7 ignores both args.
- **Dead files deleted**: `CustomizationCard.vue` (unreferenced; imported a component removed in `75ac0a0`), `workers/tile.worker.ts` (unreferenced; superseded by `tileBakery.worker.ts`).

### Environment defect worth knowing about

`node_modules/typescript@5.9.3` had been **hand-edited**: one line deleted from `lib.es2022.array.d.ts` (removing `Array.prototype.at`) and a mangled parameter name in `lib.dom.d.ts`. That alone produced 9 phantom "Property 'at' does not exist" errors that no config change could fix. Repaired by reinstalling. A frozen-install CI job would never have shown these — which is part of the argument for having one.

### Biome caveats recorded in `biome.json`

Biome does not parse Vue templates. `noUnusedVariables`, `noUnusedImports`, `noUnusedFunctionParameters` and `useImportType` are therefore **off for `*.vue`** — with them on, the autofixer renames or deletes bindings that the template uses. (`useImportType` also crashes Biome 2.4.15 on `src/views/draw.view.vue`.) `noVueDuplicateKeys` is off for `*.vue` too: it is an Options-API rule and misfires on `<script setup>` props.

Deferred to P4 as churn without bug value: `noDoubleEquals` (55 — the `!= undefined` idiom here is deliberate and "fixing" it would change behaviour), `useIterableCallbackReturn` (48), `useOptionalChain` (19), `useLiteralKeys` (16), `noAssignInExpressions` (15), `useTemplate` (8).

### Baseline now enforced

`scripts/checkBudget.mjs` fails the build above **1,474 kB raw / 365 kB gzip** eager cold-start payload, or a single chunk over 1,098 kB. Budgets ratchet down only.

---

## 3b. P0 detail (as planned)

### P0.1 Make `vue-tsc` green and keep it green

62 errors. They are tractable and cluster tightly:

| Group | Count | Fix |
|---|---:|---|
| `TS2550` — `.at()`, `.toSorted()` missing | 9 | `tsconfig.json`: `lib: ["ESNext","DOM"]` is right but `target: "ESNext"` with `moduleResolution: "Node"` mismatches. Set `moduleResolution: "Bundler"`, add `"DOM.Iterable"`. Removes the whole group. |
| Fabric 7 generic contract mismatches (`CustomEraserBrush.ts` ×7, `CustomEraserStroke.test.ts` ×4, `tile.worker.ts` ×5) | 16 | Audit STAB-15 already identified stale `@types/fabric` 5.3 against runtime Fabric 7.2. Remove `@types/fabric`; fix the `toObject` variance with a narrow declared override — **do not** paper over with `as any`. |
| Component prop / store assignment errors (`SendHub.vue` ×5, `CustomizationCard.vue` ×3, `PostCommentDrawer.vue` ×3, …) | ~20 | Real contract mismatches. Fix individually. |
| `unknown` in catch, misc | ~17 | Mechanical. |

**Rule:** after this lands, `vue-tsc --noEmit` is a release blocker. No baseline file, no `skipLibCheck` widening.

Note `tsconfig.json` currently has `"moduleResolution": "Node"` while the project is `"type": "module"` with Vite 8 — that's a latent source of resolution bugs beyond the 9 lib errors.

### P0.2 One linter, not two

`.eslintrc.cjs` (ESLint 9 can't read it) **and** `biome.json` (linter disabled) both exist. Pick **Biome** — it's already installed at 2.4.15, already the formatter, already matches the tab/double-quote style in the tree, and is 10–50× faster which matters for a pre-commit hook.

- Enable `linter.rules.recommended` in `biome.json`, plus `correctness/noUnusedImports` (replaces `eslint-plugin-unused-imports`).
- Delete `.eslintrc.cjs`, `.eslintignore`, and drop `eslint`, `@typescript-eslint/*`, `eslint-plugin-vue`, `eslint-plugin-unused-imports`, `@vue/eslint-config-typescript` (6 packages).
- Caveat: Biome's Vue SFC `<template>` linting is weaker than `eslint-plugin-vue`. Accept it; `vue-tsc` covers template type errors, which is the part that catches real bugs.

### P0.3 Fix the pre-commit hook

```json
"lint_fix_and_add": "git add ."
```

This stages **every** file in the working tree on every commit, including files the developer deliberately left out. That is a real footgun, not a style issue. Replace with `biome check --write --staged` + `git add` of only the touched paths, or drop the hook and rely on CI.

### P0.4 `verify` script + CI

```json
"verify": "biome check . && vue-tsc --noEmit && vitest run && vite build && node scripts/checkBudget.mjs"
```

Add `.github/workflows/verify.yml` running it on PR. `scripts/checkBudget.mjs` asserts:
- eager cold-start bytes (entry + all `modulepreload`) ≤ budget
- no single chunk > 400 kB raw

Seed the budget at today's **1,503,199 raw / ~350 kB gz** so it can only ratchet down.

### P0.5 Device memory harness

Nothing in P3 can be claimed done without this. A scripted loop, run on a real low-end device:

```bash
adb shell dumpsys meminfo ninja.sketchmate.app | grep -E "TOTAL PSS|Native Heap|Graphics"
```

sampled at each route transition across a fixed 10-minute scenario (Home → Gallery scroll 500 items → Draw → Home → Chat → Profile → repeat ×3). Record PSS, Native Heap, Graphics, and `performance.memory.usedJSHeapSize`. Commit the script; commit the baseline numbers.

---

## 4. P1 — Dependency surgery

### P1.1 Remove — zero imports found in `src/`

Verified by `grep -E "from ['\"]<pkg>"` across `src/`:

| Package | Why it's here | Action |
|---|---|---|
| `@revenuecat/purchases-js` | web SDK; native `purchases-capacitor` is what's used | remove |
| `browser-image-compression` | superseded by `compressorjs` | remove |
| `@vueuse/components` | never imported | remove |
| `@vuepic/vue-datepicker` | never imported | remove |
| `mixpanel-browser` | never imported | remove |
| `uglify-js` | Vite/rolldown minifies | remove |
| `autoprefixer` | Tailwind 4 has its own pipeline | remove |
| `npm`, `pnpm`, `i`, `install` | **package managers listed as app runtime dependencies** | remove |
| `serve` | dev convenience, unused | remove |

That is 11 packages, 4 of which are package managers. `i` and `install` are almost certainly typo-installs.

**Expected:** production dependency count drops sharply (audit measured 467), and `pnpm audit --prod` becomes readable — most of its 52 advisories route through these tooling packages, not shipped code.

### P1.2 Move to `devDependencies`

`express` — only `server.js` (the Heroku static host) uses it. It must stay installed on Heroku, so this needs the Heroku `NPM_CONFIG_PRODUCTION=false` / `--prod=false` treatment, **or** better: see P6.3, which removes Express entirely.

### P1.3 Align duplicate versions

| Duplicate | Cause | Fix |
|---|---|---|
| `@ionic/core` 8.7.10 **and** 8.8.1 | `@ionic/core` pinned to `8.7.10` in manifest; `@ionic/vue` requires exact `8.8.x` | Remove the direct `@ionic/core` dependency entirely — it's a transitive of `@ionic/vue`. Let one version resolve. Bump `@ionic/vue` + `@ionic/vue-router` to 8.8.17 together (they peer-pin each other exactly). |
| `@vueuse/core` 10.11.1 **and** 14.3.0 | direct dep on 10, DatePicker pulled 14 | DatePicker is being removed (P1.1) → bump direct dep to 14.4.0 in P5. |
| `ionicons` 7.4.0 **and** 8.0.13 | direct devDep on 7; `@ionic/vue` peers `^8.0.13` | Bump direct dep to 8. Check the 14 files importing `ionicons` for renamed icons. |
| `@firebase/firestore` 4.12.0 direct **and** via `firebase` | `FeedbackMenu.vue` imports the direct package | Change that one import to `firebase/firestore`; drop the direct dep. Kills a duplicate Firestore in `FeedbackMenu` (212 kB chunk). |
| `ws` 8.18.3 / 8.19.0 | transitive | `pnpm dedupe` after the above |
| `@types/fabric` (5.3, targets Fabric 5 API) | stale | remove; Fabric 7 ships its own types |

Run `pnpm dedupe` **only after** manifests are aligned, and review the lockfile diff.

### P1.4 Verify-then-remove candidates

`d3-contour`, `point-in-polygon`, `svg-path-properties`, `q-floodfill` each appear in exactly 1–2 draw files. They're small and legitimate — leave them. Listed only so nobody re-audits them.

---

## 5. P2 — Cold start and eager bundle (the big one)

### P2.1 Ionic component trimming — target −60% of the 1.1 MB eager chunk

The templates are already written in kebab-case (`<ion-button>`, `<ion-icon>`), **not** PascalCase — meaning Vue resolves them as custom elements at runtime, not as imported Vue components. This is a large piece of luck: **the fix requires almost no template edits.**

**Approach — stub the unused core components at resolve time.**

1. Build-time scan of `src/**/*.vue` extracting every `<ion-*>` tag → the used-set (currently 46). Emit `src/generated/ionicUsedComponents.json`.
2. Vite `resolve.alias` maps every `@ionic/core/components/ion-<unused>.js` to a stub module exporting a no-op `defineCustomElement` and inert placeholders.
3. `@ionic/vue`'s wrappers for unused components then evaluate harmlessly, register nothing, and the ~84 unused core component implementations plus their CSS never enter the graph.
4. Dev-mode guard: the stub's `defineCustomElement` `console.error`s if invoked in dev, so a component used only via a controller API (`alertController`, `actionSheetController`, `pickerController` — these are **not** visible to a template scan) fails loudly instead of silently rendering nothing.

**Known blind spots that must be added to the used-set by hand:** anything created through Ionic's imperative controllers, anything Ionic itself composes internally (`ion-modal` pulls `ion-backdrop`; `ion-select` pulls `ion-alert`/`ion-popover`/`ion-action-sheet`). Build the used-set as *scan result ∪ manual allowlist*, and treat the manual list as the risky part.

**Risk:** this is a non-standard technique against a vendor's pre-bundled dist. It is reversible (delete the alias block) and it is verifiable (the dev guard + a Cypress smoke pass over every route). If it proves unstable, fall back to P2.1b.

**P2.1b fallback:** `pnpm patch` `@ionic/vue/dist/index.js` to split the ~130 wrappers into separate modules so normal tree-shaking works, and upstream it as an issue to `ionic-team/ionic-framework`. More robust, but the patch must be re-applied on every Ionic bump.

**Acceptance:** eager cold-start bytes ≤ 700 kB raw. Every route renders identically in a full Cypress pass. No `defineCustomElement` dev-guard hits.

### P2.2 Split `main.ts`'s eager helper imports

`src/main.ts` statically imports two barrel helpers that drag the world into the entry chunk:

- `@/helper/general.helper` → `compressorjs`, `firebase/app`, `@revenuecat/purchases-capacitor`, `@capacitor-firebase/authentication`, the router, and 5 stores.
- `@/helper/notification.helper` → `firebase/messaging` (loaded even on native, where push goes through Capacitor).

`general.helper.ts` is a 30-import grab-bag. Split by responsibility:

| New module | Contents | Loading |
|---|---|---|
| `helper/platform.ts` | `isMobile`, `isNative`, `IS_PROD`, `whenIdle` | eager, tiny |
| `helper/image.ts` | Compressor-based helpers | **dynamic import at call site** |
| `helper/billing.ts` | RevenueCat | dynamic, on paywall open |
| `helper/firebase.ts` | `initFirebase`, auth | eager (needed at boot) |
| `helper/messaging.ts` | `firebase/messaging` | **dynamic, web only** — `if (!Capacitor.isNativePlatform())` |

Note `document.store.ts:25` already carries a comment explaining it deliberately avoids `whenIdle` from `general.helper` because of the transitive weight. That comment is the bug report — fix the cause.

### P2.3 Kill the forced draw prefetch on constrained devices

`src/views/home.view.vue:169-173`:

```ts
whenIdle(() => { import("@/views/draw.view.vue").catch(() => {}) }, 1500)
```

`whenIdle` has a **1500 ms timeout**, so on a device that never goes idle — exactly a low-end phone during startup — it fires anyway and parses the ~600 kB draw graph while boot hydration is still running. That is a self-inflicted jank spike on the weakest devices.

Replace with intent-based prefetch: `pointerdown`/`touchstart` on the draw entry button. Keep the idle prefetch **only** when `!isMobile() || navigator.hardwareConcurrency > 4`.

### P2.4 Build config hygiene

`vite.config.ts` issues:

```ts
import tailwindcss from './node_modules/@tailwindcss/vite/dist/index.mjs'
```

A hardcoded `node_modules` path. This breaks under pnpm hoisting changes, breaks in a Docker build, and **will break under Bun** (P6). Change to `import tailwindcss from '@tailwindcss/vite'`. If that import was working around a resolution error, fix the resolution error.

Also:
- `visualizer()` runs on **every** build, writing a 1 MB `stats.html`. Gate behind `process.env.ANALYZE`.
- `VitePWA.devOptions.enabled: true` builds a service worker in dev — slows HMR and causes stale-asset confusion. Gate it.
- No `build.target` set. Set it explicitly to match `.browserslistrc` intent, then **raise `.browserslistrc`**: `Chrome >= 79` (2019) forces down-levelling of `??`, `?.`, class fields, and async generators. `minSdkVersion = 24` doesn't justify it — Android WebView is Play-updatable, so Android 7 devices run a modern Chromium. `Chrome >= 100` is safe and meaningfully reduces emitted code.
- `stats.html` and `dev-dist/` are committed at repo root. Add to `.gitignore`.

### P2.5 Icon strategy (measure before acting)

377 `<ion-icon>` uses, and separately `@mdi/js` imported in **121 files**. Two icon systems. `ion-icon` fetches SVGs at runtime by name — each is a network request or a cache lookup, and on cold start that's a burst. `@mdi/js` inlines path strings, which tree-shakes well.

Consolidating on `@mdi/js` + a 20-line `<Icon>` component would remove `ion-icon` from the eager set and delete `ionicons` entirely. **This is a 377-site change — measure the actual win in P2.1 first.** If Ionic trimming already achieves the budget, defer this.

---

## 6. P3 — Memory ceilings

Re-verified against current `develop`. Status column corrects the audit where it has drifted.

| ID | Item | Verified status 2026-08-07 |
|---|---|---|
| STAB-06 | `inbox.store` grows unbounded with pagination | **Open** — no cap/slice/splice present |
| STAB-09 | Doodle history uncapped deep clones | **Open** — `past`/`future` unbounded at `BackgroundSketchPadModal.vue:469-500` |
| STAB-10 | `chatWidget.store` no reset, no cap | **Open** — zero reset/clear functions; not in the logout reset list |
| STAB-14 | IDB transaction completion | **Mostly closed** — `transaction.oncomplete` at `:442`; reads at `:626`, `:667` still lack `onerror` |
| STAB-16 | No Android `onTrimMemory` | **Open** — nothing in `MainActivity.java` |
| STAB-17 | `network.store` listener not idempotent | **Open** — `Network.addListener` with no guard, no handle retained |

### P3.1 Store reset matrix — the systemic fix

**16 of 22 Pinia stores have no reset or clear function.** Logout (`auth.store.ts:435-441`) resets 7 of them. The rest — `inbox`, `chatWidget`, `notification`, `quota`, `friend`, `parental`, `photoswiper`, `balloon`, `menu`, `session`, `dateOfBirth`, `ambientPause` — carry the previous account's data into the next login.

This is both a memory leak **and** a correctness/privacy bug: account B can see account A's inbox items and chat heads.

Fix as one systematic change, not 16 ad-hoc ones:
1. Every store exposes `resetRuntimeState()`.
2. A single `resetAllStores()` in one module enumerates them; logout calls only that.
3. A unit test asserts every store in `src/store/*.ts` is present in the reset registry — so a new store cannot be added without one. This is the part that keeps it fixed.

### P3.2 Bounded collections

| Target | Bound |
|---|---|
| `inbox.store` items | Sliding window (e.g. 200) with ID-keyed index; dedupe all 3 ingress paths (batch, socket sync, single fetch) |
| `chatWidget` heads | LRU cap 8, active head protected; track and clear bounce timers |
| Doodle `past`/`future` | Cap by action count **and** estimated points; clear opposite stack on push; release on modal close |
| Chat conversation overview | Virtualize or paginate; cap dormant conversation objects, keep unread metadata separately |
| PhotoSwiper input | Bounded slice or lazy resolver, not the full retained gallery |

### P3.3 Android memory-pressure bridge (STAB-16)

Highest leverage item for "app gets killed on low-end Android."

1. `MainActivity.java`: override `onTrimMemory(int level)`, forward to JS via a Capacitor event.
2. JS handler, idempotent and cheap:
   - `TRIM_MEMORY_RUNNING_MODERATE` → drop off-screen gallery/feed decoded content, unmount PhotoSwiper
   - `TRIM_MEMORY_RUNNING_LOW` → + clear dormant chat histories, stop ambient/Lottie warm caches, terminate idle draw workers
   - `TRIM_MEMORY_RUNNING_CRITICAL` / `UI_HIDDEN` → + shed draw fallback caches (**never** live document data), prioritize detached draft snapshot
3. Report every event to Sentry as a breadcrumb with the current route.

Test with `adb shell am send-trim-memory ninja.sketchmate.app <LEVEL>`.

### P3.4 Lifecycle hygiene (STAB-17)

- `network.store.init()` — guard against double-registration, retain the handle, remove on teardown.
- `auth.store.ts:471-490` — clear the 10 s timeout when init resolves early.
- `ProfileWorld.vue:399-415` — first mount warms **every** sprite type with a forced 2 s idle timeout. Gate by device tier; do not compete with cold startup.
- 54 `addEventListener` vs 38 `removeEventListener` across `src/`. The 16-listener gap is worth a one-pass audit — some are legitimately process-lifetime, but they should be identified, not assumed.

---

## 7. P4 — Bug-prone code

Signals across `src/` (99,743 LOC, 513 files):

| Signal | Count | Read |
|---|---:|---|
| `as any` | 530 | Every one is a place the compiler was overruled |
| `: any` | 668 | |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | 41 | Each hides a real error |
| Non-null `!.` | 153 | Each a potential runtime TypeError |
| `catch {}` — silently swallowed | 4 | Fix all 4 |
| `console.log` in shipped code | 24 | Route through the observability layer or delete |
| `setTimeout` | 127 | Cross-reference with cleanup; this is where leaks live |
| `TODO`/`FIXME`/`HACK` | 34 | Triage: fix, ticket, or delete |

**Do not** attempt a blanket `any` purge — 1,198 sites is a multi-week grind with real regression risk and little user-visible payoff. Instead:

1. Fix all 4 silent `catch {}` and all 41 `@ts-ignore` (the ignores are the ones actively hiding bugs).
2. Enable `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` **on `src/store/**` and `src/service/**` only**, via a scoped tsconfig. These are the layers where a wrong type becomes a wrong network call or a corrupted store.
3. Leave `src/draw/**` alone — Fabric's generics are the source of most of the noise and the engine is out of scope.
4. Ban new `any` in changed lines via a Biome rule scoped to non-draw paths.

`eslint.config` removal (P0.2) plus `@types/fabric` removal (P1.3) will themselves resolve a chunk of the 62 type errors.

---

## 8. P5 — Framework upgrades

### 8.1 Vue 3.6 — already in, mostly

`vue@3.6.0-rc.2` is already installed (uncommitted in `package.json`), 317 tests pass on it, and `@ionic/vue` 8.8.1 works with it.

**What you already get for free:** the alien-signals reactivity rewrite is the 3.6 default — no opt-in, no code change. Lower per-ref memory and faster dependency tracking across every store and component. This is the largest Vue-side win and it is already banked.

**Vapor Mode is not usable app-wide here.** Vapor components cannot host vDOM children through the normal slot path, and this app's component tree is Ionic-rooted (`IonApp` → `IonRouterOutlet` → `IonPage` → everything). Realistic scope: leaf components with no Ionic tags and no slots — e.g. gallery `Thumbnail`, feed card sub-components, chat message rows. Those are also the highest-instance-count components, so a targeted spike is worth it, but **treat it as P7, gated behind P2 shipping.** Do not plan capacity against a Vapor win.

**Action now:** track the 3.6 stable release (expected autumn 2026) and move off `-rc.2` before the next store submission. Shipping an RC of the framework to production is a real risk that should be a conscious decision, not an accident of a `package.json` edit.

### 8.2 vue-router 4.6.4 → 5.2.0

**Feasibility: good. Perf benefit: ~none — be clear-eyed about this.** v5 dist is 57 KB vs v4's 62 KB. This is a maintenance/future-proofing move, not an optimization.

App-side surface is tiny — the only vue-router imports across `src/` are `RouteRecordRaw`, `onBeforeRouteLeave`, `useRoute`, `useRouter`, and the methods `push` / `replace` / `currentRoute` / `isReady` / `back`. All stable across the major.

**The entire risk is `@ionic/vue-router`,** which declares no `vue-router` peer range and imports `parseQuery`, `createRouter`, `createWebHistory`, `createWebHashHistory`, `createMemoryHistory`. Verified: **all five still exist in vue-router 5.2.0.** Ionic also wraps the router to drive its own navigation stack, so it touches `router.options` and normalized location shapes — that's where a break would surface.

Plan:
1. `pnpm.overrides` to force `vue-router@5` under `@ionic/vue-router`.
2. Full Cypress route pass + manual Android back-button / tab-switch / `IonNav` regression sweep. Ionic's stack behaviour is the thing to test, not URL matching.
3. If it breaks: revert. There is no user-visible cost to staying on v4.

Also worth knowing: vue-router 5 peer-depends `pinia ^3.0.4 || ^4.0.2` and `vite ^7.3.0 || ^8.0.0` — both satisfied.

### 8.3 Other upgrades

| Package | Current | Target | Note |
|---|---|---|---|
| `pinia` | 3.0.4 | 4.0.2 | Peers `vue ^3.5.11`, `typescript >=5.6`. Do **with** vue-router 5, they're coupled. |
| `@vueuse/core` | 10.11.1 | 14.4.0 | 4 majors. Removes the duplicate copy. Review changed composables individually. |
| `@ionic/vue` + `@ionic/vue-router` | 8.8.1 | 8.8.17 | Must move in lockstep — exact peer pin. |
| `ionicons` | 7.4.0 | 8.0.13 | Check the 14 importing files for renames. |
| `vite` | 8.2.0 | 8.2.1 | Trivial. |
| `typescript` | 5.9.3 | **hold** | TS 7.0.2 (native Go port) exists and would cut `vue-tsc` time hugely — but `vue-tsc` is at 3.3.9 and its TS 7 support must be confirmed first. **Spike, don't schedule.** |
| `fabric` | 7.2.0 | 7.4.0 | **Do not bundle with anything else.** Audit is explicit: never combine a Fabric runtime bump with drawing lifecycle changes. Its own PR, its own device pass. |
| `cypress` | 12.17.4 | current | 3 majors behind; the E2E suite is a P2 acceptance gate, so it needs to actually run. |
| `husky` | 8.0.3 | 9.x | `husky install` is deprecated in 9. |

---

## 9. P6 — Bun migration and Heroku

**Verified constraint: Heroku's official Node.js buildpack supports npm, Yarn and pnpm — selected by lockfile. It does not support Bun or `bun.lock`.** Bun on Heroku means a community buildpack ([jmlow/heroku-buildpack-bun](https://github.com/jmlow/heroku-buildpack-bun), [confact/bun-buildpack](https://github.com/confact/bun-buildpack), [kilterset/heroku-bun-buildpack](https://github.com/kilterset/heroku-bun-buildpack) for Fir) or a container deploy.

### Recommended: hybrid, staged

**What Heroku actually runs for this app is a static file server.** `server.js` is 44 lines: HTTPS redirect, cache headers, static dist, SPA fallback. That is the entire production runtime. Nothing about it benefits from Bun.

**Where Bun actually helps is install and build time — locally and in CI.** So:

**Stage 1 — Bun for dev and CI, Node + pnpm on Heroku.**
- Add `bun.lock` alongside `pnpm-lock.yaml`? No — two lockfiles drift. Instead: keep pnpm as the single source of truth, and use `bun --bun run vite build` for local dev only. Cheap, reversible, zero deploy risk.
- Precondition: **fix the hardcoded `./node_modules/@tailwindcss/vite/dist/index.mjs` import in `vite.config.ts` first** (P2.4) — it will not resolve under Bun's layout.

**Stage 2 — full Bun, decided on evidence.** Only if Stage 1 shows a build-time win worth the risk. Then pick one:
- **(a) Container deploy** (`heroku.yml` + Dockerfile, `oven/bun` base). Full control, officially supported deploy mechanism, no third-party buildpack trust. **Recommended if Stage 2 happens.**
- **(b) Community buildpack.** Less work, but you inherit an unmaintained-buildpack risk on your production deploy path for a static file server. Poor trade.

**Do not** migrate Heroku to Bun and upgrade the framework stack in the same window. If the PWA breaks you need to know which one did it.

### P6.3 Simplify the server regardless

If the container route is taken, `server.js` becomes ~15 lines of `Bun.serve` and `express` (plus `@types/express`) leaves the dependency list entirely. Even staying on Node, Express 5 for 44 lines of static serving is more surface than the job needs.

**Scope note:** Heroku serves the PWA only. The Android app ships `dist` inside the APK via `cap sync`. So Heroku risk is contained to web users — but that's still real users, and the deploy path is the app-update mechanism for them.

---

## 10. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Ionic component stubbing breaks a controller-created component | **High** if done naively | Manual allowlist + dev-mode `defineCustomElement` guard + full Cypress route pass. Single revertible alias block. |
| Vue 3.6 RC has a production bug | Medium | Move to 3.6 stable before next store submission; keep the 3.5.41 pin one revert away |
| `@ionic/vue-router` breaks on vue-router 5 | Medium | Override + full navigation regression sweep; revert is free |
| Store reset refactor breaks a login flow | Medium | Registry test + manual A→B account switch on device |
| `onTrimMemory` shedding drops live draft data | **High severity** if wrong | Never touch the live document; test with `am send-trim-memory` at every level with unsaved work open |
| Bun on Heroku via community buildpack | Medium | Prefer container deploy; stage behind a dev-only Bun trial |
| Fabric 7.2 → 7.4 regresses drawing | Medium | Isolated PR, own device pass, never bundled with lifecycle work |

---

## 11. Sequencing

```
P0  Guardrails ────────────────────────────────────┐
      typecheck green · Biome only · CI · budget   │  everything below
      pre-commit fix · device memory harness       │  is measured against this
                                                   │
P1  Dependency surgery ────────────────────────────┤  independent, ship early
      remove 11 · align 6 duplicates · dedupe      │
                                                   │
P2  Cold start ────────────────────────────────────┤  biggest win
      Ionic trim · helper split · prefetch gate    │
      vite config hygiene                          │
                                                   │
P3  Memory ceilings ───────────────────────────────┤  parallel with P2
      store reset matrix · bounded collections     │
      onTrimMemory bridge · lifecycle hygiene      │
                                                   │
P4  Bug-prone code ────────────────────────────────┤  continuous
                                                   │
P5  Framework upgrades ────────────────────────────┤  after P2 is stable
      vue-router 5 + pinia 4 (together)            │
      VueUse 14 · Ionic 8.8.17 · Vue 3.6 stable    │
      fabric 7.4 (isolated)                        │
                                                   │
P6  Bun ───────────────────────────────────────────┤  last; dev/CI first
                                                   │
P7  Vapor spike ───────────────────────────────────┘  gated on P2 shipping
```

---

## 12. Definition of done

- `pnpm verify` green: Biome, `vue-tsc --noEmit` (0 errors), 317+ tests, build, budget check. Enforced in CI.
- Eager cold-start payload ≤ **700 kB raw** (from 1,503,199).
- Every Pinia store has `resetRuntimeState()`; a test enforces registry completeness.
- 10 × (Home → Gallery 500 items → Draw → Home) on a low-end device shows **no monotonic PSS growth** post-GC.
- `adb shell am send-trim-memory` at every level sheds bounded memory, loses no draft, corrupts no navigation.
- Zero package managers in `dependencies`. One `@ionic/core`, one `@vueuse/core`, one `ionicons`, one Firestore path.
- Vue on 3.6 **stable**, not an RC, before the next store submission.
- Heroku PWA deploy verified end-to-end after any toolchain change.

---

## 13. What this plan deliberately does not do

- **Retune the drawing engine.** No tile budgets, brushes, bakery, or transform changes. Its lifecycle boundary (worker teardown, trim-memory participation) is in scope; its internals are not.
- **Purge all 1,198 `any` sites.** Scoped to stores/services where a type error becomes a data error.
- **Promise a Vapor Mode win.** Ionic-rooted trees make it a leaf-component optimization at best.
- **Promise a perf win from vue-router 5.** It is a maintenance upgrade; the bundle delta is −5 KB.
