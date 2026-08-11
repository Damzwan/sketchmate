 # SketchMate code quality audit

**Created:** 2026-08-11
**App version:** 0.4.4 · branch `competitions`
**Scope:** the whole of `src/` — readability, type safety, reuse, and the perf
that follows from them. Complements [`QUALITY_PERF_PLAN.md`](./QUALITY_PERF_PLAN.md),
which owns bundle size, memory ceilings and the toolchain, and
[`DRAW_ENGINE_PERF.md`](./DRAW_ENGINE_PERF.md), which owns engine internals.

This picks up where that plan stopped. P0–P3, P5 and P6 are closed there. **P4
("bug-prone code") is the one phase never executed**, and it is exactly the
ground this audit covers — widened from "fix the ignores" to "make the
application layer as good as the engine layer already is."

---

## 1. Measured baseline (2026-08-11)

Everything below was run, not estimated.

| Gate | Result                                |
|---|---------------------------------------|
| `biome check .` | **Clean** — 580 files, 0 diagnostics  |
| `vue-tsc --noEmit` | **Clean** — 0 error s                 |
| `vitest run` | **Pass** — 69 files, 426 tests, 4.4 s |

The guardrails from P0 held. Nothing in this audit is about a broken gate; it is
about what the gates were configured not to see.

### Size and shape

`src/` is **108,398 lines across 567 TS/Vue files** (212 of them `.vue`).

| Area | LOC | Share |
|---|---:|---:|
| `src/draw` | 47,178 | 44% |
| `src/components` | 39,716 | 37% |
| `src/store` | 6,092 | 6% |
| `src/service` | 3,412 | 3% |
| `src/views` | 3,116 | 3% |
| `src/composables` | 2,359 | 2% |
| `src/config` | 2,308 | 2% |
| `src/helper` | 1,900 | 2% |
| `src/types` | 1,346 | 1% |
| `src/utils` | 499 | <1% |

### Signals

| Signal | Count | Where it concentrates |
|---|---:|---|
| `as any` | 529 | 815 of all `any` are in `src/draw` |
| `: any` | 632 | 309 outside `draw` — the tractable half |
| `@ts-expect-error` | 24 | 23 in `draw` (Fabric), 1 in `chat.store` |
| `console.*` | 196 | 129 `error`, 43 `warn`, 24 `log` (16 of the logs are `fabricDebug.ts`) |
| Silent `catch {}` | 3 | all `CustomEraserBrush.ts` |
| Non-null `!.` | 135 | |
| `setTimeout` / `setInterval` | 139 / 18 | |
| `addEventListener` vs `removeEventListener` | 49 vs 36 | 13-listener gap |
| `TODO`/`FIXME`/`HACK` | 33 | 22 in `draw` |
| `.vue` files > 300 lines | 42 | largest 1,264 |
| Inline `style=` / `:style=` | 324 / 310 | |
| Hardcoded hex colors | 364 | outside the theme layer |
| `<img>` without `loading="lazy"` | 79 of 88 | |
| `alertController.create` sites | 21 | |

### What is already good, and worth saying out loud

- **Every `v-for` is keyed.** Zero misses across 174 sites. That is unusual.
- **187 of 212 SFCs use `<script setup>`**, and 120 of 124 `defineProps` are
  type-generic, not runtime-object. The Vue idiom is consistent.
- **All 12 routes are lazy**, with a comment on the one that had to be argued for.
- **The comments are genuinely good.** `FeedPostCard.vue`'s note about
  `content-visibility` clipping a descendant's box-shadow, `resetStores.ts`'s
  three documented deliberate no-op resets, `uuid.ts`'s explanation that
  `randomUUID` is secure-context-only and `ionic serve --external` is not — this
  codebase explains *why*, which is the expensive kind of comment and the kind
  most codebases lack.
- **The draw engine is the best-tested part of the app** and the docs module
  around it is exemplary.

---

## 2. Verdict

**Grade: B. Two codebases in one repo, and they are not the same quality.**

`src/draw` is a well-documented, heavily tested subsystem with an explicit
architecture doc, a stated dependency direction, and a migration plan for its
one big known debt (the Fabric boundary). Its `any` count is high, but it is
*load-bearing* `any` — Fabric 7's generics against a custom brush hierarchy —
and the plan already, correctly, rules out purging it.

`src/components` + `src/store` is the other 45,000 lines, and it has:

- **zero tests.** 60 of 69 test files live in `src/draw`. `src/components` has
  **none**, `src/views` has none, `src/store` has one and it only asserts that
  reset functions exist. The half of the app users actually touch is unverified.
- **`any` at the data boundary**, which is the one place the plan itself said
  not to tolerate it: `userCache.store` types a *user cache* as `any`, and
  `server.types.ts` types `img`, `comments` and `payload` as `any`.
- **Five to six near-identical modals**, two near-identical comment drawers, two
  near-identical pagers, two near-identical swiper composables.
- **36 `.vue` files calling `service/api` directly**, bypassing the store layer
  the rest of the app routes through.

The gap is not carelessness — it is the predictable result of the engine getting
a doc, a plan and a test suite while the feature layer got shipped. The fix is to
give the feature layer the same three things.

---

## 3. Findings, ranked by leverage

### F1 — The app layer has no tests (highest severity)

426 tests, and the feature half of the app contributes ~10 of them. Every
refactor proposed below is riskier than it needs to be because nothing catches
a regression in a store or a component.

This is also why the `any` cleanup is scarier than it should be: with `chat.store`
typed as `any`, the compiler cannot catch a shape mistake, and no test can either.

**Not** a call for broad component coverage. The targets are narrow: the stores
that own network-shaped data (`chat`, `competition`, `inbox`, `post`,
`userCache`), and the pure logic already extracted into composables.

### F2 — `any` at the data boundary, not in the engine

309 `any` outside `draw`, and they cluster hard:

| File | Count | What it is |
|---|---:|---|
| `store/chat.store.ts` | 18 | `participants: any[]`, `message: any`, API responses cast |
| `utils/fabricDebug.ts` | 14 | dev tool; low value to fix |
| `store/photoswiper.store.ts` | 12 | |
| `components/photoswiper/SwiperCommentDrawer.vue` | 12 | |
| `views/customization.view.vue` | 10 | |
| `types/server.types.ts` | 10 | `img: any` ×6, `comments: any[]`, `payload?: any` |
| `store/friend.store.ts` | 7 | |
| `store/userCache.store.ts` | 6 | **the cache's value type is `any`** |

`server.types.ts` is the root. Everything downstream that touches an `img` or a
`comments` array inherits `any` from it, and then casts to make it fit. Type the
source and a large share of the 309 collapses without touching the call sites.

`store/userCache.store.ts` is the sharpest single example: `writeMany(users: any[])`,
`peek(id): any | undefined`, `getUser(id): any | undefined`, `upsert(user: any)`.
This is a typed-language codebase with an untyped cache of its central domain
object.

### F3 — Six modals that are one modal

`DecorationModal`, `EffectModal`, `FontEffectModal`, `FontModal`, `ThemeModal`,
`WorldModal` — 1,078 lines across six files sharing the same `defineProps`
(`customization: Partial<Customization>`, `previewMode?: "profile" | "chat"`),
the same `defineEmits(["close", "select"])`, the same `useUnlockItem` /
`usePickerPreview` / `useInventoryStore` wiring, the same `BaseSheetModal` +
`PreviewSurfacePager` shell, and the same unlock-button footer down to the
`Unlocking…` string.

They differ only in which catalog they page through and how a tile renders.
That is a `<slot>`, not a file.

Same pattern at three other pairs:

| Pair | Lines |
|---|---|
| `PostCommentDrawer.vue` / `SwiperCommentDrawer.vue` | 458 / 515 |
| `PreviewSurfacePager.vue` / `ChatWidgetStylePager.vue` | 584 / 472 |
| `usePostSwiper.ts` / `useInboxSwiper.ts` | 97 / 149 |

And inside the engine: the **brush registry is copy-pasted into four files** —
`draw/canvas/fabricSetup.ts:54`, `draw/document/preview.worker.ts:113`,
`draw/workers/eraser.worker.ts:189`, `draw/workers/tileBakery.worker.ts:175`.
Ten `[Stroke, "Stroke"]` pairs, four times. Adding a brush means remembering four
places, and forgetting one produces a stroke that draws on the main thread and
vanishes when baked. This one is worth fixing despite the engine being
out of scope elsewhere, because it is a correctness trap, not a style issue.

### F4 — `general.helper.ts` is a 25-export grab bag imported by 140 files

P2.2 split off `platform` / `image` / `billing` / `firebase`. What is left still
mixes, in one module: `svg()` (an icon path wrapper, and the reason most of the
140 imports exist), date sorting, age math and DOB gating, deeplink listener
setup, PWA install prompt, back-button behaviour, router-ready watcher, app color
theming, device fingerprinting, and `shuffleArray`.

`svg()` alone probably accounts for most of those 140 edges. Pulling it into
`@/helper/icon.ts` would cut the coupling graph substantially for one file move.

The remaining `any`s in it are the tell: `installPrompt: Ref<any>`,
`toDataUrl(blob: any)`, `shuffleArray(array: any[]): Array<T>` — a generic
function that takes `any[]` and asserts the element type.

### F5 — Components reach past the store layer

36 `.vue` files import from `service/api` directly. Some are legitimately
one-shot calls with no shared state, but the list includes `CommunityFeed`,
`ChatWidget`, `PhotoSwiper`, `UserContextSheet` and `Shop` — components that
*also* use stores, so the same screen fetches through two paths with two
different error and caching behaviours.

Related: `service/api/http.ts` reaches the other way, importing
`useModerationStore` and `useMenuStore` to open a menu on a `capability_blocked`
response. The transport layer opens UI. It works, but it means the HTTP client
cannot be tested or reused without Pinia.

### F6 — 42 SFCs over 300 lines

| File | Lines |
|---|---:|
| `BackgroundSketchPadModal.vue` | 1,264 |
| `SendHub.vue` | 978 |
| `FeedPostCard.vue` | 834 |
| `PreviewDrawing.vue` | 641 |
| `ArtistHighlights.vue` | 627 |
| `ChatWidget.vue` | 622 |
| `Shop.vue` | 608 |

`SendHub.vue` has 25 `v-if` branches and 32 imports; `FeedPostCard.vue` has 16
and 25. These are the files where a change is most likely to break something
unrelated, and they are also the files with no test.

`BackgroundSketchPadModal.vue` at 1,264 lines is a full drawing surface with its
own undo/redo history living in a profile-customization modal — the same
`past`/`future` stacks P3.2 had to bound by hand precisely because they were not
the engine's.

### F7 — Styling is not systematized

324 inline `style=` plus 310 `:style=` bindings, and 364 hardcoded hex colors
outside `src/theme`. `FeedPostCard.vue` repeats
`:style="{ color: headerPalette.desc, textShadow: headerTextShadow }"` four
times in one template.

This is a polish and a perf item at once: inline style objects rebuild on every
render, and a hardcoded hex is a theme that will be wrong the next time the
palette moves.

### F8 — Perf leftovers

Real, measured, and cheap:

- **79 of 88 `<img>` have no `loading="lazy"`**; only 12 set `decoding`. In a
  feed-and-gallery app on low-end Android this is the single cheapest win left.
- **Two icon systems still coexist**: 425 `<ion-icon>` uses, 133 files importing
  `@mdi/js`, 15 importing `ionicons`. This is `QUALITY_PERF_PLAN.md` §P2.5,
  deferred pending measurement. The measurement is now available: the Ionic trim
  landed at 1,125 kB eager raw against a 700 kB target, and `ion-icon` is part of
  the floor.
- **Only 4 `shallowRef` and 7 `markRaw` in the entire app.** `chat.store` (1,173
  lines) and `post.store` deep-reactify arrays of server objects that are never
  mutated field-by-field. `shallowRef` + replace-whole-array is strictly cheaper.
- **13-listener gap** between `addEventListener` (49) and `removeEventListener`
  (36). P3.4 flagged a 16-gap; it narrowed but was never closed out.

### F9 — Hygiene

- 3 silent `catch {}` in `CustomEraserBrush.ts:729,785,798`. The engine's own
  worker has a comment at `tileBakery.worker.ts:622` explaining that a bare
  `catch {}` once hid a consistently-failing stroke. Same file family, same trap,
  still open.
- 24 `console.log` in shipped code. 16 are `fabricDebug.ts` (a dev tool — gate
  the module, don't edit the lines). The other 8 are real:
  `LoginMainPage.vue:328` logs an auth error code, `scanner.service.ts:88` logs a
  video element, `billing.helper.ts:20` logs a RevenueCat success on every boot.
- 33 `TODO`s, several of which are questions rather than tasks
  (`objectHistory.ts:609` — `unSelect(); // TODO necessary?`). A question in a
  comment never gets answered. Either answer it or delete it.
- `ShapesMenu.vue:78`: `setTimeout(..., 1); // TODO does not make any sense`.
  A 1 ms timer whose author documented not knowing why it is there.

### F10 — tsconfig leaves strictness on the table

`strict: true` is on, but every one of these is unset:

`noUncheckedIndexedAccess` · `exactOptionalPropertyTypes` · `noImplicitOverride`
· `noUnusedLocals` · `noFallthroughCasesInSwitch` · `noPropertyAccessFromIndexSignature`

`QUALITY_PERF_PLAN.md` §7 already proposed scoping the first two to
`src/store/**` and `src/service/**`. That is still the right call. The other
four are cheap enough to turn on globally — `noImplicitOverride` in particular
matters here, because the brush hierarchy is deep and override-heavy.

Also: Biome has `noExplicitAny` **off**. That was the right decision when there
were 1,161 of them. It is why the count can still grow silently.

---

## 4. Action plan

Ordered so each phase makes the next one safer. Effort is engineering days for
one developer who knows the codebase.

### Q0 — Stop the bleed — **DONE (2026-08-11, branch `competitions`)**

| Item | Status |
|---|---|
| Q0.1 Biome `noExplicitAny` warn outside `draw` | **Done** — 373 warnings at the baseline |
| Q0.2 `noFallthroughCasesInSwitch` + `noImplicitOverride` | **Done** — 0 and 63 findings |
| Q0.3 `noUnusedLocals` | **Adopted as a sweep, not a gate** — see below |
| Q0.4 Scoped strict tsconfig | **Reworked** — scoping is not possible here; shipped project-wide and opt-in |

`biome.json` became **`biome.jsonc`**. The rationale for exempting `src/draw`
belongs next to the rule, and Biome type-checks its own `.json` as strict JSON,
so the comment could not live there. Biome discovers either filename.

#### `noImplicitOverride` earned its place immediately

63 members across 13 files were overriding a base-class member with no `override`
keyword — 60 of them in the Fabric brush hierarchy (`TracedPath`,
`CustomEraserBrush`, `PixelBrush`, and eight more). Exactly the risk the audit
predicted: a deep, override-heavy hierarchy against a vendor base class, where a
renamed upstream method silently becomes a new method instead of an error.

Applied from the compiler's own diagnostics rather than by hand, then corrected
for modifier order (`static async fromObject` → `static override async`).

#### `noUnusedLocals`: 52 dead bindings found, but it cannot be a gate

It found real dead code in 30 files — unused imports, orphaned computeds, and
whole abandoned features:

- `home.view.vue` still held `ALL_QUICK_ACTIONS`, `visibleQuickActions`,
  `getCardLayoutClasses` and `getImageLayoutClasses` — **byte-identical copies**
  of what `HomeQuickActions.vue` owns since the extraction, plus three unused
  image imports.
- `SelectImgStyleMenu.vue` kept the entire grayscale / sepia / invert filter
  block (three computeds, three handlers, `IonToggle`) after the toggles were
  removed from its template.
- `MoreToolsMenu.vue` kept `openStickerMenu` / `openEmblemMenu` /
  `openShapesMenu` and three icons.
- `worldOverview.ts`'s `CHUNK` was write-only, with a `biome-ignore` explaining
  it was kept deliberately. The explanation moved onto the `renderChunk` option
  it comes from; the dead field went.

**It still cannot be enabled globally.** It does not understand Vue string
template refs: `<div ref="root">` is invisible to it, so a binding the template
populates reads as dead. Two of the hits were exactly that —
`useAmbientVisibility` creates `root`, the template fills it, and nothing in
`<script>` reads it. Deleting either would have silently broken ambient
rendering on `ProfileWorld` and `ProfileEffect`.

(`:ref="root"` was tried as a way to make the binding statically visible. It
does not work: templates auto-unwrap, so the ref object never reaches the VNode.
Reverted.)

Five *other* template refs — `contentEl`, `doodleZoneRef`, `rootEl`,
`scrollContainer`, `mailInput` — turned out to be genuinely dead: bound by the
template and read by nobody. Those were removed along with their `ref=`
attributes.

The flag lives in `tsconfig.strict.json`, which is `.ts`-only in practice. A
manual sweep over `*.vue` is worth repeating occasionally, with a human checking
each hit.

#### The scoped strict tsconfig does not work — measured, not assumed

The audit proposed scoping `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes` to `src/store/**` + `src/service/**`. **The type
graph is not separable.** Stores import `.vue` components, and Fabric's module
augmentation lives in `src/draw/canvas/fabric.types.ts`; a subset program drops
both and reports ~189 phantom errors that say nothing about strictness.

Measured project-wide instead, against a green baseline:

| Flag | Errors |
|---|---:|
| `exactOptionalPropertyTypes` | 153 |
| `noPropertyAccessFromIndexSignature` | 124 |
| `noUncheckedIndexedAccess` | 934 |

None is a 0.5-day item. `tsconfig.strict.json` ships project-wide with the
cheapest one enabled and the other two recorded, behind
`pnpm typecheck:strict` — **not** in `pnpm verify`, because it does not pass yet.

**Verified:** `biome check` exit 0 · `vue-tsc --noEmit` 0 errors · 426 tests
pass · build + budget pass (1137.1 kB raw / 301.2 kB gzip).

### Q0 — as planned

1. Biome: turn `noExplicitAny` **on as `warn`, scoped to everything except
   `src/draw/**`** via an `overrides` block. Draw keeps it off — the Fabric
   generics are not worth fighting and the plan already says so.
2. tsconfig: add `noUnusedLocals`, `noFallthroughCasesInSwitch`,
   `noImplicitOverride`. Fix the fallout in the same commit.
3. Add a second tsconfig (`tsconfig.strict.json`) with
   `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, `include`-ing only
   `src/store/**` and `src/service/**`, and add it to `pnpm verify`.

### Q1 — Type the data spine — **DONE (2026-08-11, branch `competitions`)**

| File | `any` before | after |
|---|---:|---:|
| `types/server.types.ts` | 10 | **0** |
| `store/userCache.store.ts` | 6 | **0** |
| `store/chat.store.ts` | 18 | **0** |
| `store/friend.store.ts` | 7 | **0** |
| `service/api/*.ts` | 7 | **0** |

Non-draw `any`: **309 → 260.** `src/draw` untouched at 815, as intended. The
last `@ts-expect-error` outside `draw` is gone.

**The estimate of 120–150 removed was wrong; the real number is ~49.** The
premise — that the spine's `any` propagated outward and typing it would collapse
call sites — did not hold. Downstream code mostly spreads these objects rather
than reading fields off them, so it neither inherited the `any` nor broke when
the types arrived. The remaining 260 are their own sites (`photoswiper.store`
12, `SwiperCommentDrawer` 12, `customization.view` 10, …) and need their own
pass. The value delivered here is the four bugs below, not the count.

#### The server repo is the reason `img: any` existed

`src/types/server.types.ts` (1,022 lines) is a hand-maintained copy of
`sketchmate_server/src/types/types.ts` (994 lines). They agree everywhere except
the upload params — and there they disagree *semantically*:

- **Server**: `img` is a parsed multipart upload. `mongodb.ts` reads
  `params.img.filepath` and `params.img.mimetype` and hands them to
  `s3Creator.uploadFile`.
- **Client**: `img` is a `Blob`/`BlobPart` appended to a `FormData`.

One interface name, two incompatible types. `any` was the only thing that let
both compile. Now typed from the client's side (`Blob`, `BlobPart`, `string`)
with the divergence documented in the file; the three server-only shapes
(`UploadProfileImgParams`, `CreateBalloonPostParams`, `SendParams` — no client
call site) are `unknown` and labelled as handler inputs.

**For the monorepo:** the split to make is upload *transport* (client) vs upload
*handler input* (server). Do not try to reconcile them into one interface.

#### Three API contracts were simply wrong

Each was declared one way, returned another, and the caller reached past the lie
with `as any`:

| Function | Declared | Actually returns |
|---|---|---|
| `chat.api.getChatMessages` | `BaseMessage[]` | `{ data, hasMore }` |
| `user.api.fetchOnlineFriends` | `NetworkUser[]` ("hydrated objects") | `string[]` of ids |
| `user.api.getFullProfile` | `profile: any` | `PublicUser & { relationship?, chat_status? }` |

Anyone writing new code against the declared types would have broken. All three
now match the server, verified against the router source.

#### Two latent runtime bugs the `any` was hiding

- **`PostCommentDrawer.submitComment`** did `res.comment.author = user.value`,
  where `user` is `User | undefined`. Undefined author → the template reads
  `comment.author.name` → crash. It also assigned the *entire* logged-in `User`
  (subscriptions, parental controls, moderation state) into a comment list
  entry. Now hydrates the identity triple only, with a fallback.
- **`UserContextSheet.report()`** read `targetProfile.value._id` unguarded while
  every other read in that file uses `?.`. `targetProfile` is null until the
  profile resolves, so reporting before load threw.

#### Types added

`PublicUser` (the server's `PUBLIC_USER_FIELDS` projection — what `userCache`
actually stores), `UserCompetitionState` (present on the server model, missing
from the app copy, which is why `competition.store` reached for `as any`),
`NotificationPayload` + `CompetitionNotificationKind` (built from the five
server producers, with a variant table), `ChatNotification`,
`OptimisticMessage`, `IncomingConversation` + `participantId()`.

`IncomingConversation` is the one worth knowing about: REST populates
`participants` into `Mate[]`, but the socket sometimes sends raw id strings.
`addIncomingMessage` always coped with both — that is what its `as any` casts
and its `@ts-expect-error` were for. Naming the union made the participant
resolution collapse into one documented `incomingProfiles` decision instead of
three scattered re-checks.

Optimistic messages now carry `conversation_id`, `is_invite` and `updatedAt`
instead of leaving them undefined, so nothing downstream has to special-case an
in-flight message.

**Not verified:** authenticated routes were not walked. The login route renders
clean against the dev server, `vue-tsc` is template-aware and green, and the
build passes — but signing in would create a real record in the Firebase
project, so the signed-in sweep is still outstanding. (Same gap
`QUALITY_PERF_PLAN.md` §P2 records for the Ionic trim.)

#### Q1 follow-up found during Q2

The original “`service/api/*.ts` → 0” line overlooked three `inbox.api`
contracts and the HTTP error payload. They are now typed: inbox upload URLs use
`PresignedUploadBundle`, comment pages use `GetInboxCommentsRes`, and posting an
inbox comment uses the server's actual `InboxComment` response. That last one
exposed a real update bug: the caller passed the raw comment to a store method
expecting `{ comment, inbox_item_id }`, so the just-posted comment was not added
locally. The caller now constructs the store ingress shape explicitly. Root
`service/api/*.ts` is now genuinely at zero explicit `any`; the remaining API
`any`s are confined to socket adapters.

### Q1 — as planned

1. `types/server.types.ts` — replace the 10 `any`s. `img: any` (×6) is the big
   one; it appears to be a URL-or-object union that was never written down.
   Write it down.
2. `store/userCache.store.ts` — type the cache as `User`. Six sites, and it
   propagates outward to `chat.store` and `friend.store` for free.
3. `store/chat.store.ts` — 18 `any`s, mostly `participants: any[]` and
   `(await getChatMessages(...)) as any`. The API functions have return types;
   the casts are discarding them. Delete the casts, fix what breaks.
4. Delete `chat.store.ts:303`'s `@ts-expect-error` — the only one outside `draw`.

**Do not** touch `src/draw`'s 815, and do not touch `fabricDebug.ts`'s 14.

### Q2 — Extract the reusable layer — **DONE (2026-08-11, branch `competitions`)**

| Item | Result |
|---|---|
| Confirmation alerts | `useConfirm()` now owns the standard two-button alert. Only the one-button child-safety notice and the layer-name input still create alerts directly. |
| Customization catalogs | Six pickers now share `CatalogPickerModal`, `CatalogPickerTile` and `useCatalogPicker`; their combined implementation fell from 1,078 to 711 lines while keeping catalog-specific tile content in each wrapper. |
| Fabric brush registration | One `BRUSH_REGISTRY` / `registerBrushClasses()` feeds the main canvas and all three workers. |
| Comment drawers | The 459-line post-only drawer was deleted. Feed, fullscreen posts, inbox items and competitions now use one subject-aware `CommentDrawer`. |
| Pagers | `PreviewSurfacePager` and `ChatWidgetStylePager` share the centered-snap, rAF scroll tracking and visibility restoration in `useSnapPager`. Their different surface layouts remain separate. |
| Swiper composables | The actually duplicated remix flow (room guard, confirmation, close, route transition and same-page canvas replacement) moved to `useDrawingRemix`; post/inbox deletion, seen and commenting behavior stays in its domain composable. |

This phase also typed the six picker `select` events, removing the corresponding
template-side `any` casts. Across the current Q0–Q2 worktree the change is about
1,700 net lines smaller.

The proposed clone-detector acceptance check was not a valid binary gate. The
same naive 6-line scan also flags intentional structural similarity in brush
implementations, benchmark/reporting code and component CSS, including areas
outside Q2. It still reports the two preview pagers because their templates and
styles intentionally render similar controls, even though their duplicated
state machine is now shared. Q2 is instead checked by the concrete invariants
above: one alert builder, one catalog behavior layer, one brush registry, one
comment drawer and one snap-pager state machine.

**Verified:** `pnpm verify` passes — Biome (282 ratcheted warnings, exit 0),
`vue-tsc` 0 errors, 426 tests, production build and bundle budget (1137.8 kB raw
/ 301.5 kB gzip). The app boots to the login route in the local browser. As in
Q1, the signed-in walkthrough remains outstanding because creating an anonymous
session writes a real Firebase user.

### Q2 — as planned

This is the "make stuff reusable" ask, in order of payoff.

1. **`useConfirm()`** — one composable wrapping `alertController.create`. 21
   sites, all building the same `{ header, message, buttons: [cancel, confirm] }`
   shape by hand. Roughly 250 lines become 21 calls.
2. **`<CatalogPickerModal>`** — one generic modal taking a catalog, a tile slot,
   and a preview slot. Collapses the six customization modals (1,078 lines) to
   one shell plus six small tile components. This is the single largest
   duplication in the repo.
3. **Shared brush registry** — one exported `BRUSH_REGISTRY` in
   `draw/utils/brushes/registry.ts`, imported by `fabricSetup` and all three
   workers. Correctness fix disguised as a refactor; do it even though `draw` is
   otherwise out of scope.
4. **Merge the comment drawers** into one `<CommentDrawer>` taking a
   subject (post or inbox item) — 973 lines down to roughly 550.
5. **Merge the two swiper composables** and the two pagers, in that order (the
   composables are smaller and de-risk the pagers).

**Done when:** the naive clone detector run for this audit
(6-line normalized blocks) reports no cross-file duplicate outside generated
code. Re-run it as the acceptance check.

### Q3 — Split the giants (4–5 d)

Top-down, and only these seven. Do not attempt all 42.

`BackgroundSketchPadModal` (1,264) → `SendHub` (978) → `FeedPostCard` (834) →
`PreviewDrawing` (641) → `ArtistHighlights` (627) → `ChatWidget` (622) →
`Shop` (608).

Rule for each: pull the `<script setup>` logic into a composable next to the
component, leave the template and the wiring. That gets the logic under test
(Q4) without a risky template rewrite. `SendHub`'s 25 `v-if` branches are the
exception — that one needs the template broken up too, and it should be last
because it is the send path.

**Done when:** no SFC over ~400 lines among the seven, and each has a
composable that Q4 can test.

### Q4 — Test the application layer (3–4 d)

Runs *after* Q2/Q3 so the tests are written against the extracted shapes, not
the ones about to change.

1. Store tests for `chat`, `competition`, `inbox`, `post`, `userCache` —
   ingress dedupe, the P3.2 bounds (they are asserted nowhere), optimistic
   message reconciliation, and reset.
2. Composable tests for everything under `src/composables` — 23 files, 2 tested.
   These are pure and fast.
3. The composables extracted in Q3.

**Done when:** `src/store` + `src/composables` have real coverage and the draw
share of the suite drops below 70%.

Explicitly **not** in scope: an E2E suite. `QUALITY_PERF_PLAN.md` §8 removed
Cypress because there were no specs; re-adding it is new work with its own
justification, not part of this audit.

### Q5 — Perf (2–3 d)

1. **Images**: `loading="lazy"` + `decoding="async"` + intrinsic `width`/`height`
   on the 79 unlazy `<img>`. Mechanical, and the largest per-hour win in this
   plan on a low-end device.
2. **`shallowRef` in the list stores** — `chat`, `post`, `inbox`. These hold
   server objects replaced wholesale; deep reactivity buys nothing and costs a
   proxy per field per item.
3. **Icon consolidation (P2.5)** — 425 `<ion-icon>` → an `<Icon>` component over
   `@mdi/js`, which 133 files already import. Removes `ionicons` entirely and
   takes `ion-icon` out of the eager Ionic set. It is a 425-site change, so it
   wants its own PR and its own budget measurement, but it is the remaining path
   to the 700 kB target §P2 missed.
4. **Close the listener gap** — 49 vs 36, one pass.
5. Ratchet `scripts/checkBudget.mjs` down after 3 lands.

### Q6 — Hygiene (1–2 d)

1. Fix the 3 silent `catch {}` in `CustomEraserBrush.ts`.
2. Gate `fabricDebug.ts` behind `import.meta.env.DEV` at the module boundary;
   delete the 8 real `console.log`s elsewhere or route them through Sentry.
3. Triage all 33 `TODO`s: fix, ticket, or delete. Any `TODO` that is a question
   gets answered or removed — `ShapesMenu.vue:78` and `objectHistory.ts:609`
   first.
4. Sweep the 364 hardcoded hex colors into the theme layer, starting with
   `FeedPostCard` and the chat components.

---

## 5. Sequencing

```
Q0  Stop the bleed ─────────────────────────────┐  0.5 d, do today
      biome any-warn · tsconfig flags           │
      scoped strict tsconfig                    │
                                                │
Q1  Type the data spine ────────────────────────┤  2–3 d
      server.types · userCache · chat.store     │
                                                │
Q2  Extract the reusable layer ─────────────────┤  3–4 d  ← biggest LOC win
      useConfirm · CatalogPickerModal           │
      brush registry · comment drawers · pagers │
                                                │
Q3  Split the giants ───────────────────────────┤  4–5 d
      logic → composables, 7 files              │
                                                │
Q4  Test the application layer ─────────────────┤  3–4 d  ← highest severity
      stores · composables                      │
                                                │
Q5  Perf ───────────────────────────────────────┤  2–3 d  (1 is same-day cheap)
      img lazy · shallowRef · icons · listeners │
                                                │
Q6  Hygiene ────────────────────────────────────┘  1–2 d, continuous
```

**Total: ~16–21 days.** Q0 and Q5.1 are same-day wins and should not wait for
the rest.

If only three phases happen, make them **Q0, Q1, Q4** — the guardrail, the
types at the boundary, and the tests. Q2 and Q3 are the satisfying ones, but
they are refactors, and refactors without Q4 are how a working app breaks.

---

## 6. Definition of done

- `pnpm verify` green, plus the scoped strict tsconfig.
- Biome warns on new `any` outside `src/draw`.
- Non-draw `any` under 150 (from 309). Draw untouched.
- Zero `@ts-expect-error` outside `src/draw`.
- Clone detector: no cross-file 6-line duplicate outside generated code.
- No SFC over 400 lines except the seven listed, and none of those over 600.
- `src/store` and `src/composables` have real test coverage; draw is under 70%
  of the suite.
- Every `<img>` lazy-loaded with intrinsic dimensions.
- Zero silent `catch {}`; zero shipped `console.log` outside dev-gated modules.
- `TODO` count under 10, and every survivor is a task, not a question.

---

## 7. What this audit deliberately does not do

- **Purge `src/draw`'s 815 `any` or its 23 `@ts-expect-error`.** They are Fabric
  7 generics against a custom brush hierarchy. `QUALITY_PERF_PLAN.md` §7 ruled
  this out and it was right. The Fabric boundary migration in
  [`DRAW_ENGINE_FABRIC_DECISION.md`](./DRAW_ENGINE_FABRIC_DECISION.md) is what
  actually removes them, and it is a separate project.
- **Retune the draw engine.** The brush registry is the one exception, and only
  because four copies of a registry is a correctness trap.
- **Add an E2E suite.** Different decision, different justification.
- **Rewrite templates for their own sake.** Q3 moves logic out; it does not
  restyle markup that works.
- **Promise a framework-level perf win.** Q5 is images, reactivity depth and
  icons — measurable, boring, and real. Vapor Mode remains P7 in the other plan
  and remains speculative.
