# Weekly Art Competition

Design and implementation plan for the weekly themed drawing competition:
home card → competition page → voting → winners moment → cosmetic reward.

> **Audience:** engineers working across `sketchmate` (Ionic/Vue client),
> `sketchmate_server` (Koa + Mongoose) and `sketchmate-platform` (Nuxt admin).
> Read [FEED.md](FEED.md) and [FAMILIES_POLICY.md](FAMILIES_POLICY.md) first —
> this feature reuses the post pipeline and inherits the age gating.

Status: **Phases 1–7 and 9 are implemented** — the full loop runs unattended:
theme opens, entries land, votes are cast, notifications go out on local-time
slots, the cron scores and grants on Sunday evening, and the winners moment
fires on next app open. Users can suggest and upvote next week's theme.

Known gaps, all called out again in [§12](#12-task-breakdown):

- **Task 8.1/8.2 are partial.** `competition_entry` and `competition_comment`
  are reportable and wired through quarantine; `competition_theme` is not.
- **Task 8.3 is not started.** Removing a winning entry after the announcement
  does not promote the runner-up.
- **Task 10.3** (load check against a synthetic week) is not started.
- **Task 10.4 is half-done.** `MIN_ENTRIES_TO_ANNOUNCE` already skips the
  podium and records `skipped_reason`, but nothing renders that state and the
  theme is not carried to the following week.

Every constant here is a starting value, not a law; they all live in one config
file (Task 1.1) so they can be tuned without touching logic.

The home card is live, so the feature is user-visible behind the kill switch
(`COMPETITION_ENABLED=0`). Rewards only appear once a competition's categories
have `reward_items` set — until the admin page exists (Phase 9), that is done
directly on the competition document or via the dev create route.

---

## Table of contents

1. [What we are building](#1-what-we-are-building)
2. [Decisions taken](#2-decisions-taken)
3. [Weekly cycle](#3-weekly-cycle)
4. [Data model](#4-data-model)
5. [API surface](#5-api-surface)
6. [Client surfaces](#6-client-surfaces)
7. [Rewards and the shop loop](#7-rewards-and-the-shop-loop)
8. [Notifications](#8-notifications)
9. [Moderation and abuse](#9-moderation-and-abuse)
10. [Admin page (sketchmate-platform)](#10-admin-page-sketchmate-platform)
11. [Testing as a solo dev](#11-testing-as-a-solo-dev)
12. [Task breakdown](#12-task-breakdown)
13. [Risks and open questions](#13-risks-and-open-questions)
14. [Rollout](#14-rollout)

---

## 1. What we are building

Every week the app runs one themed competition.

- **Home screen, top slot** — a colourful card: theme, phase, countdown, entry
  count, and what this week's winner gets. Tap → competition page.
- **Competition page** — this week's entries in a scrollable grid/list. Each
  entry can receive a vote in one of several **categories**. Vote budget per
  category is limited. Live tallies are hidden.
- **End of week** — cron closes the competition, computes winners per category,
  grants each winner a cosmetic from the catalog, and publishes results.
- **Next app open** — a **winners moment**: podium, the winning drawing, the
  artist, and *exactly which cosmetic they won* with a direct link to it in the
  shop.
- **Themes** — users can suggest and upvote next week's theme; suggestions are
  moderated and approved in the admin page, then auto-consumed by the cron.

Design goal, same spirit as the feed: **it must run itself**. The only recurring
manual work is approving theme suggestions, and even that has an automatic
fallback so a week never breaks because nobody looked at the queue.

---

## 2. Decisions taken

These were the open questions in the original brief. Answers, with reasons.

### 2.1 Entries are NOT posts

Entries live in their own `competition_entries` collection.

Why not reuse `posts`:

- Posts are bound to a daily quota (`quota.config.ts`, 2/day free). A
  competition entry must not eat a user's posting budget, and must not be
  blocked by it.
- Posts carry feed machinery — gravity score, `post_views` seen ledger, repeat
  suppression. An entry's ranking is votes, not decayed engagement.
- Deleting a post is a normal user action. Withdrawing an entry mid-vote is not
  the same thing, and it must not silently destroy cast votes.

What *is* reused verbatim:

- The S3 presigned upload flow (`drawing_url` / `image_url` / `thumbnail_url`
  + `aspect_ratio`) — identical shape to `POST /v2/post/upload-urls`.
- The report/moderation pipeline (`report_model`, `REPORTABLE`).
- The profanity service for any free text (`censorText`).
- The card rendering language of `FeedPostCard.vue`.

### 2.2 Competition entries stay separate from feed posts

SendHub does not offer an “also post to feed” shortcut. Entering the competition
creates only a competition entry. Publishing to the community feed remains its
own explicit destination with its own caption, comment/remix settings and quota.
This avoids a hidden second publish and makes the user’s audience choice clear.

Past submissions **never** get converted into posts later by a job. Old entries
stay visible in the competition page's archive detail and on the artist's
profile under a dedicated *Competitions* tab (Task 3.4). The tab reuses the
fullscreen photo swiper for comments and owner deletion while submissions are
still open. One source of truth, zero migration jobs, and the user's sharing
choice is respected forever.

### 2.3 Submission and voting overlap; results land Sunday evening

Two states, not four. Submissions run Mon–Fri, voting runs Mon until **Sunday
18:00 UTC**, and that is when results are announced. Rationale:

- A separate "voting only" week doubles the cycle length and halves how often
  the feature feels alive.
- **Announcing Sunday evening, not at the Monday rollover.** Sunday evening is
  when people are actually in the app; Monday 00:00 UTC is the middle of the
  night across most of the user base, so the moment would be discovered hours
  later as a stale notification. 18:00 UTC is evening in Europe, afternoon in
  the Americas, and still Sunday nearly everywhere.
- The gap between the announcement and the next Monday is deliberate: for those
  ~6 hours the results are the only competition content in the app, with no new
  theme competing for attention.
- Closing submissions on Friday bounds the late-entry disadvantage, and
  [§2.7](#27-late-entries-must-still-be-able-to-win) removes the rest of it.
- **Tallies stay hidden until reveal.** This kills bandwagon voting, removes
  "I'm 4th, why bother", and is what makes the Sunday moment a moment.

Users always see *their own* votes and their remaining budget.

### 2.4 One entry per user per competition

Replaceable while submissions are open (re-submitting overwrites the drawing and
resets `submitted_at`), locked afterwards. Keeps the grid diverse and stops one
prolific user from occupying the podium.

### 2.5 Rewards are real catalog SKUs, not bespoke trophies

Winners are granted existing paid cosmetics via the same `$addToSet: inventory`
path the admin grant route already uses. A bespoke "winner-only" item would be
unsellable and therefore worthless as a shop driver. See
[§7](#7-rewards-and-the-shop-loop).

One exception: a single earned title, `title.champion`, granted to any
first-place winner ever. Titles are already "earned, never sold"
(`titles.router.ts`), so this fits the existing rule.

### 2.6 Theme suggestions are moderated, not auto-published

User-suggested themes are user-generated content on a surface shown to *every*
user including minors. Play already rejected v140 over child social features
(see [FAMILIES_POLICY.md](FAMILIES_POLICY.md)); an unmoderated global text field
is exactly the kind of thing that gets looked at again. Suggestions therefore go
`pending → approved → used`, approved in the admin page, and the cron only ever
consumes `approved`. If the approved pool is empty, it falls back to a
hardcoded evergreen theme list — a week never fails to start.

### 2.7 Late entries must still be able to win

Raw vote counts are not a measure of quality — they are a measure of *exposure ×
quality*. An entry posted Monday morning is on screen for five days; one posted
Thursday night gets a fraction of that. Ranking on raw votes hands the win to
whoever submitted earliest, and everyone learns to dump something in on Monday
rather than make something good by Friday.

Two mechanisms, and both are needed — one fixes the measurement, the other fixes
the thing being measured.

**1. Score on vote rate, not vote count.** Every entry counts *impressions*
(same rule as the feed: on screen for more than 1.5 seconds), so the ratio
`votes / impressions` is available. A raw ratio is far too noisy at small
samples — a 1-vote, 1-impression entry would beat 40 votes from 200 views — so
the ranking uses the **Wilson score lower bound** at 95% confidence:

```
        p̂ + z²/2n − z·√( (p̂(1−p̂) + z²/4n) / n )
score = ────────────────────────────────────────      p̂ = votes/impressions
                    1 + z²/n                           z  = 1.96
```

This is "the vote rate we can be confident this entry is at least as good as".
It converges on the true rate with volume and stays pessimistic when the sample
is thin, which is exactly the property needed: a late entry with few impressions
is not punished for being late, but it also cannot win off five friends.

`MIN_IMPRESSIONS_TO_WIN` (25) is an additional eligibility floor. Wilson already
handles small samples gracefully, but the floor closes the "submit at 23:50, get
five taps from a group chat" hole outright rather than statistically.

**2. Balance the exposure in the first place.** Normalising is a correction;
the better fix is not needing much correction. `GET /:id/entries` orders by
**exposure bucket ascending, then the per-viewer hash** — under-seen entries go
to the front of everyone's grid until they catch up. A Thursday entry is shown
*more* than a Monday one for the rest of the week, so it reaches a comparable
impression count by Sunday and the ratio is computed on a fair sample.

The per-viewer hash still decides order *within* a bucket, so no two users see
the same grid and there is no single "top slot" to win.

Consequences to keep in mind:

- Impression tracking is now load-bearing for *results*, not just analytics. If
  the client stops reporting impressions, entries stay in bucket 0 and no fair
  rate can be computed. The scorer therefore refuses to crown a winner when
  verified exposure is implausibly low; it never falls back to raw votes.
- Exact score ties use a deterministic week/category lottery. Submission time
  is never a tie-breaker, so entering earlier carries no scoring advantage.
- Withdrawing and re-entering resets nothing: impressions live on the entry
  document, and re-submitting replaces the artwork on the same entry.

---

## 3. Weekly cycle

All boundaries are **UTC**, aligned to Monday 00:00. Local-time display is the
client's job (the server already stores `user.timezone` for notification
scheduling).

```
Mon 00:00   competition N opens         phase = open
            ├── submissions accepted    (Mon–Fri)
            └── votes accepted          (Mon–Sun)

Fri 00:00   submissions close           phase = voting
            └── votes still accepted    (Fri–Sun)

Sun 18:00   competition N closes        phase = closed → scored → announced
            └── results are the only competition content until Monday

Mon 00:00   competition N+1 opens
```

The competition window is therefore 6d 18h, not a full 7 days, and there is a
deliberate ~6-hour gap before the next one starts.

**The results hold.** `getActiveCompetition()` does not simply return "whatever
is live". A competition that has *ended* outranks a live one while it is still
owed its results moment — either it has not been scored and announced yet, or
it was announced less than `results_grace_ms` ago (`CYCLE.results_grace_ms`,
6h, snapshotted per competition at creation). Only after that does selection
fall through to the live competition, and finally to the last announcement ever
made.

Two windows make this load-bearing rather than theoretical:

- **`ends_at` → announce.** The cron is hourly, so for up to an hour the week is
  over but nothing has been scored. Without the hold the app would move on
  before the results it is waiting for exist.
- **Compressed test cycles.** A test competition runs *on top of* the live
  weekly one by construction ([§11.1](#111-compressed-cycles)), so the instant
  it ends the real competition becomes live again and the winners moment
  disappears before anyone can look at it. Test cycles get a proportional
  `results_grace_ms` (`TEST_CYCLE.results_grace_ms`, 3 min) instead of the real
  six hours, and a freshly created test still outranks the previous test's
  hold — otherwise iterating would mean waiting out the grace each time.

Both halves are bounded. `SCORING_HOLD_MS` (2h — two cron ticks) caps the
"still counting" hold: past that, scoring is not late, it is failing, and
pinning the app to a week that will never produce a podium is worse than
showing the one that is actually running. `RESULTS_LOOKBACK_MS` (2d) caps the
lookup itself, so nothing ancient can resurface.

State machine on the competition document:

| phase | submissions | votes | results visible |
|---|---|---|---|
| `scheduled` | no | no | no |
| `open` | yes | yes | no |
| `voting` | no | yes | no |
| `closed` | no | no | no (transient, scoring in progress) |
| `announced` | no | no | yes |

`closed` exists so scoring, moderation re-check and reward granting happen
*before* anything is shown. Never announce from a document that is still
accepting writes.

**Driver:** one job appended to the existing hourly cron in
`sketchmate_server/src/main.ts` (`cron.schedule('0 */1 * * *', ...)`). Hourly,
not per-minute: every transition is date-driven and idempotent, so a phase can
flip up to an hour late without anything breaking. The client never advances a
phase; it derives display state from `phase` + timestamps and re-fetches on
`onIonViewDidEnter`.

The job is **idempotent and self-healing**: it recomputes the phase each run
from `now` vs the stored dates, and if no competition exists for the current
week it creates one. A server that was down all weekend catches up on boot.

---

## 4. Data model

New collections in `sketchmate_server/src/models/competition.model.ts`.

### 4.1 `competitions`

```ts
{
  _id: ObjectId,
  week_key: string,            // "2026-W33" — unique, the idempotency key
  theme: string,               // "Your pet as a superhero"
  theme_blurb?: string,        // one line of flavour on the card
  theme_source_id?: ObjectId,  // ref competition_themes, when user-suggested
  accent: string,              // palette key for the colourful card, e.g. "sunset"

  starts_at: Date,             // Mon 00:00 UTC
  submissions_close_at: Date,  // Fri 00:00 UTC  (starts_at + 4d)
  ends_at: Date,               // Sun 18:00 UTC  (starts_at + 6d 18h)
  results_grace_ms?: number,   // how long the results stay in front — §3

  phase: 'scheduled' | 'open' | 'voting' | 'closed' | 'announced',

  categories: [{
    id: string,                // 'overall' | 'funniest' | 'most_creative'
    label: string,
    emoji: string,
    votes_per_user: number,    // budget for THIS category
    reward_items: string[],    // catalog item ids granted to 1st place
  }],

  entry_count: number,         // denormalised, $inc on submit/withdraw
  voter_count: number,         // distinct voters, $inc on first vote

  results?: [{
    category_id: string,
    entry_id: ObjectId,
    user_id: ObjectId,
    votes: number,
    granted_items: string[],   // what was ACTUALLY granted (audit trail)
  }],
  announced_at?: Date,
}
```

`week_key` unique index. It is what makes "create this week's competition" safe
to call from any number of cron ticks or dynos.

`reward_items` is snapshotted **on the competition**, not read from the catalog
at grant time — so changing the catalog later never rewrites history.

### 4.2 `competition_entries`

```ts
{
  _id: ObjectId,
  competition_id: ObjectId,
  user_id: ObjectId,

  drawing_url: string,         // .gz vector source, same as posts
  image_url: string,
  thumbnail_url: string,
  aspect_ratio: number,
  caption?: string,            // optional, profanity-filtered twin stored
  caption_filtered?: string,

  post_id?: ObjectId,          // set when "also share to feed" was checked

  vote_counts: Map<string, number>,   // category_id → count (hidden until reveal)
  total_votes: number,
  // Exposure. Load-bearing for scoring, not just analytics — see §2.7.
  impressions: number,
  comment_count: number,         // denormalised, comments live separately

  status: 'active' | 'under_review' | 'removed' | 'withdrawn',
  reports_count: number,
  moderation: { quarantined_at, removed_at, last_report_at, last_report_reason },

  submitted_at: Date,
  createdAt, updatedAt,
}
```

Indexes:

```
{ competition_id: 1, user_id: 1 }            unique  // one entry per user
{ competition_id: 1, status: 1, submitted_at: -1 }   // grid, shuffled read
{ competition_id: 1, status: 1, impressions: 1 }     // exposure-balanced order
{ user_id: 1, submitted_at: -1 }                     // profile archive strip
{ status: 1, 'moderation.quarantined_at': 1 }        // mod queue
```

Competition comments use their own `competition_comments` collection with the
same author, filtered-text, status and pagination shape as post comments. They
remain available after results are announced, so archived weeks are still
social rather than becoming dead screenshots.

### 4.3 `competition_votes`

```ts
{
  competition_id: ObjectId,
  entry_id: ObjectId,
  voter_id: ObjectId,
  category_id: string,
  createdAt: Date,
}
```

```
{ competition_id: 1, voter_id: 1, entry_id: 1, category_id: 1 }  unique (legacy-safe)
{ competition_id: 1, voter_id: 1, entry_id: 1, slot: 1 }        unique partial
{ competition_id: 1, voter_id: 1 }                               // budget query
{ entry_id: 1, category_id: 1 }                                  // recount
```

The partial slot index is the real enforcement of "one category per entry" for
new votes. Legacy votes are lazily collapsed to their newest category and moved
into the deterministic `entry` slot when the voter opens the competition.
the budget check is a count query. **Never trust a client-side budget.**

Votes are kept after the competition closes — they are the audit trail for a
disputed result and the input for a recount if a winner is removed.

### 4.4 `competition_themes`

```ts
{
  text: string,                // "Your pet as a superhero"
  text_filtered?: string,
  suggested_by?: ObjectId,     // null = curated by us
  cycle_competition_id?: ObjectId, // cycle choosing this for the following competition
  status: 'pending' | 'approved' | 'rejected' | 'used',
  upvotes: number,
  used_in?: ObjectId,          // ref competitions
  rejected_reason?: string,
  createdAt: Date,
}
```

Plus `competition_theme_votes { theme_id, user_id }` unique — same pattern,
same reason.

### 4.5 User document additions

`sketchmate_server/src/models/user.model.ts`:

```ts
competition: {
  notifications: { type: Boolean, default: true },   // see §8
  last_seen_results_week: { type: String },          // "2026-W33", drives the moment
  wins: { type: Number, default: 0 },                // profile flex, cheap
}
```

`last_seen_results_week` is **server-side on purpose**: the winners moment must
fire once per user, not once per device, and must not re-fire after a reinstall
of an announcement the user already saw.

---

## 5. API surface

New router `sketchmate_server/src/api/router/competition.router.ts`, mounted at
`/v2/competition` in `router.ts`.

All routes: `requireAuth`. Write routes that put content in front of strangers
also take `requireAdultAccount(...)` and the relevant `requireCapability`,
matching `post.router.ts` exactly.

| Method | Path | Guards | Purpose |
|---|---|---|---|
| GET | `/current` | auth | Active competition + viewer state (has_entered, votes_left per category). Cheap; polled by the home card. |
| GET | `/:id/entries?cursor=&limit=` | auth | Paged entries, `status: active` only, exposure-balanced seeded shuffle (see below). |
| GET | `/:id` | auth | One current or archived competition for detail views. |
| GET | `/entry/:entry_id` | auth | One entry standalone. Exists so a notification deep link can open a drawing the grid has never loaded. |
| POST | `/:id/impressions` | auth | `{ entry_ids }` seen for >1.5s. Batched, same contract as `POST /post/views`. Feeds §2.7 scoring. |
| POST | `/upload-urls` | auth, `CREATE_POST`, adult | Presigned S3 URLs. Same shape as the post route. |
| POST | `/:id/enter` | auth, `CREATE_POST`, adult | Create/replace a competition-only entry. Legacy `share_to_feed` input is ignored by current clients. |
| DELETE | `/:id/entry` | auth | Delete an owned current or historical entry; votes and comments are removed with it. |
| POST | `/:id/vote` | auth, `REACT_TO_POST`, adult | `{ entry_id, category_id }` → cast or move this drawing's vote to that category. |
| DELETE | `/:id/vote` | auth | `{ entry_id, category_id }` → remove this drawing's vote and refund its category budget. |
| GET/POST | `/entry/:entry_id/comments`, `/entry/:entry_id/comment` | auth; writes adult + `COMMENT_ON_POST` | Read or add entry comments. |
| DELETE | `/entry/:entry_id/comment/:comment_id` | auth | Delete as comment author or entry owner. |
| GET | `/:id/results` | auth | 404/409 unless `phase === 'announced'`. Podium + reward metadata. |
| GET | `/archive?limit=` | auth | Past announced competitions, newest first. |
| GET | `/themes` | auth, adult | Approved-pending themes + my upvotes. |
| POST | `/themes` | auth, `CREATE_POST`, adult | Suggest a theme. Limited to one per active competition cycle. |
| POST | `/themes/:id/upvote` | auth, adult | Toggle upvote. |

**Entry ordering.** `?cursor=` paginates a deterministic, exposure-balanced
shuffle. The sort key is `(floor(impressions / EXPOSURE_BUCKET), hash(entry_id +
viewer_id + week_key))`:

- The **bucket** pushes under-seen entries to the front of everyone's grid, so a
  Friday entry catches up on impressions instead of losing on exposure (§2.7).
- The **hash** orders within a bucket, so every user sees a different grid and
  there is no single top slot to win.

Do not use `$sample` — it duplicates and drops rows across pages.

**Vote write.** One transaction-free but safe sequence:

1. `insertOne` into `competition_votes` — the unique index rejects duplicates.
2. On success, `$inc` `vote_counts.<category>` and `total_votes` on the entry.

If step 2 fails, the recount at scoring time (`countDocuments` per entry per
category) is authoritative. Denormalised counters are a display convenience;
**scoring always recounts from `competition_votes`.**

**Budget check.** Before step 1: `countDocuments({competition_id, voter_id,
category_id})` vs `votes_per_user`. Racy by a vote or two under concurrent
requests from one user; acceptable, and clamped by the unique index. If it ever
matters, make the budget check a conditional update on a per-user counter doc.

**Self-voting** is rejected server-side (`entry.user_id === voter_id` → 400).

---

## 6. Client surfaces

### 6.1 Home card — `components/home/CompetitionCard.vue`

Top of `home.view.vue`, above `HomeQuickActions`, below the guest/age banners.

The card's `/current` inputs are mirrored into `localStorage`
(`competition_card_v1`, 3-day TTL) and read back **synchronously** when the
store is created, so a returning user sees the real theme on frame one instead
of a placeholder that swaps a network round trip later. It is a paint hint
only: `refresh()` still runs immediately, and the phase is re-derived from the
clock by `phaseFor()`, so a cache written on Tuesday can show "voting closed"
but never a stale "submissions open". `cardReady` (cache or fetch) gates the
skeleton; `hydrated` (fetch only) still gates the grid and the vote budget.

States:

- **Loading** — only on a genuine first run. The card's own silhouette in the
  week's accent gradient with a transform-only shimmer, not a grey slab: the
  fetch resolving should be a text swap, not a block becoming a card.
- **Open, not entered** — theme, countdown to `submissions_close_at`, entry
  count, reward preview ("Winner gets 🎨 Sakura theme"), CTA *"Draw your entry"*.
- **Open, entered** — thumbnail of your entry, *"You're in"*, countdown, CTA
  *"See the entries"*.
- **Voting** — *"Submissions closed"*, votes-left chip, countdown to `ends_at`.
- **Announced (not yet seen)** — gold treatment, *"Results are in"*. Tapping it
  opens the winners moment rather than the page.
- **Under 13** — locked variant reusing `AgeGatedBanner` copy. No entries, no
  themes, no votes shown.

Countdown ticks with a single shared 1s interval, paused via the existing
`ambientPause.store` so it does not spin while the app is backgrounded.

### 6.2 Competition page — `views/competition.view.vue`

New route `FRONTEND_ROUTES.competition = "competition"`, **lazy** — see
[draw bundle split](DRAW_MODULE_ARCHITECTURE.md); this page must not pull the
draw engine into the app-start chunk. It renders entries from `image_url`
(raster), never by replaying the vector document.

Sections:

1. **Header** — theme, phase, countdown and one short explanation.
2. **Top actions** — make-entry CTA, the leading next-week theme, and past
   weeks. The CTA opens the drawing page with competition sharing preselected.
3. **Vote budget bar** — sticky, one labeled chip per category. A chip can jump
   back to an entry the viewer voted for.
4. **Compact entry grid** — two-column cards using feed-grade avatar,
   customization, lazy image and memory behavior. Tapping a card opens a bottom
   sheet for category voting and comments; public totals remain hidden.
5. **Archive detail** — every past week opens to its winners and all entries,
   with comments still available.
6. **Themes sheet** — suggest and upvote without pushing the gallery below a
   large wall of controls. Uses `BaseSheetModal` like every other sheet, so the
   handle, the close control and the background match the rest of the app. It
   is the one competition surface that does **not** take the week accent:
   background and tertiary only, with `secondary` for the voted state. The
   accent marks *this* week's competition, and this sheet is about the next one.

Reuse `LazyMount`, the intersection-observer image loading and the release-on-
leave behaviour that `CommunityFeed` already implements — the entry grid has the
same memory profile as the feed and the same low-end Android constraints apply
(see [bounding memory](PERFORMANCE_STABILITY_AUDIT.md)).

Two bounds the feed does not need, because the feed is a flat 20 posts and this
grid paginates:

- **`MAX_LOADED_ENTRIES` (180).** Past this the page stops paginating. Card 200
  is worth nothing and costs a decoded bitmap, a `ProfileWorld` and a
  `ProfileEffect`.
- **Retention band (1500px).** `content-visibility: auto` skips layout and paint
  for offscreen cards but keeps their content resident. A second
  IntersectionObserver per card drops `visible` outside the band, releasing the
  artwork and the customization scenes. The band is wide on purpose — scrolling
  back a screen or two must not re-decode anything — and the impression latch is
  separate, so a card re-entering never double-counts.

Voting is optimistic: flip the chip, `$inc` locally, roll back and toast on
error.

### 6.3 Submit flow — a section in `SendHub.vue`

**No new sheet.** `components/draw/send/SendHub.vue` is already the one share
surface: toggleable sections (Gallery & Mates / Community Post / Balloon), all
fired together by one **Send** button through `shareService.runBatch()`.
The competition is a **fourth section** in exactly that pattern.

```
Gallery & Mates          [✓]
🏆 Weekly Competition    [ ]   ← new, only while phase === 'open'
Community Post           [ ]
Release Balloon          [ ]
```

Rules for the section:

- Rendered between "Gallery & Mates" and "Community Post" — high enough to be
  seen, not above the default save action.
- `v-if`: `!isUnderAge && competitionStore.canEnter`. Absent entirely when there
  is no open competition, so the sheet is unchanged in a normal week.
- Body: theme line, deadline countdown, and — when expanded — an optional
  caption input (same styling as the post caption). There is no cross-post
  control; Community Post is a separate explicit destination.
- If the user already entered, the competition destination is disabled. Delete
  the current entry first to reopen the one-entry slot.
- Selecting it does not consume post quota. The quota lines stay on the
  Community Post section where they belong.
- Send runs `shareService.submitCompetitionEntry(processedData, settings)` as
  one more task in the existing batch, sharing the same
  `exportDrawingBlobs()` → `uploadAssets()` pipeline as the other three. Zero
  duplicated export code.

Everything else in `SendHub` is untouched — same header, same preview, same
bottom Send button, same background-share timing.

### 6.4 Accent colour — one token, four surfaces

The competition has a per-week **accent** (`competition.accent`, e.g. `sunset`).
It is defined once in `config/competition.config.ts` as a small preset table:

```ts
export const COMPETITION_ACCENTS = {
  sunset:  { from: '#FF9A6C', to: '#FFD36E', ink: '#7A3412', emoji: '🌅' },
  ocean:   { ... },
  forest:  { ... },
  candy:   { ... },
} as const;
```

Shared verbatim between server (`sketchmate_server/src/config`) and client
(`src/config`) — same duplication contract as `moderation.policy.ts`: pure data,
no imports, both copies must stay identical.

Every competition surface reads the *same* accent for the *same* week:

- home card gradient,
- the `SendHub` competition section (icon tint, selected ring, expanded
  background) — so the sheet visibly matches the card the user tapped,
- competition page header,
- winners modal frame.

Never hardcode a competition colour in a component. If the accent is missing or
unknown, fall back to the app's `secondary`.

### 6.5 Winners moment — `components/competition/WinnersModal.vue`

**The modal never opens itself.** It used to auto-fire on app open, like
what's-new. It no longer does: a results screen taking over the app before the
user asks for it is an interruption, not a moment, and the home card already
does the job by going gold with *"Results are in"*.

Entry points, all deliberate:

- the home card in its `announced` state,
- `CompetitionResultsCard` on the competition page,
- an archived competition,
- a results or win notification.

`hasUnseenResults` still exists and still drives the card's gold treatment;
`last_seen_results_week` is now only written when the user actually opens and
closes the modal, so the card keeps flagging the result until they look.

Content, in this order — the order is the point:

1. **The artwork, big.** Not a grid, not a stat. The drawing first.
2. **The artist, as their real `ProfileCard`.** Not an avatar + name row —
   the actual `components/profile/PreviewProfileCard.vue` (which renders the
   production `ProfileCard` at `zoom: 0.7`), so the winner's full customization
   shows: theme, world, effects, font, decoration, title, signature, background
   sketch. Winning is the loudest place in the app to flex a paid setup, and it
   advertises the customization system to everyone who did not win.
   - Requires the results payload to carry the winner's **full**
     `customization` object, not `PUBLIC_USER_FIELDS`' subset. Hydrate winners
     with the same projection `ProfileCard` gets on the profile view.
   - Ambient world/effects are animated here (this is a one-off moment, not a
     scrolling list) but `staticWorld` on low-end devices — reuse the
     `document.documentElement.classList.contains('low-end')` check the home
     view already does.
   - Follow button inline, under the card.
3. **What they won** — the cosmetic, rendered as a real shop card with its
   name and preview: *"🎨 Sakura — Soft cherry blossom"*. Tapping it deep-links
   to that item in the shop.
4. **Other categories** — smaller, one row each.
5. **Next week's theme** + *"Draw your entry"* CTA.

Marks seen via `POST /v2/competition/:id/seen` (fire-and-forget, sets
`last_seen_results_week`). If the user was a winner, the modal opens on a
personal *"You won 🏆"* variant with the confetti/reaction burst component.

### 6.5 Stores

- `store/competition.store.ts` — current competition, viewer state, entries
  page, vote budget, optimistic vote map. Must register in
  `resetStores.ts` / satisfy `storeResetContract.test.ts`.
- Keep it out of the draw chunk: import only from `@/service/api/competition.api`
  and shared types.

---

## 7. Rewards and the shop loop

The competition exists to make cosmetics feel desirable. Concretely:

### 7.1 Winning must be unmissable

A win is the single most valuable thing this feature produces. It is surfaced in
five places, and all five ship together — a win that only exists inside one
modal is a win the user's friends never see.

| Surface | What it shows |
|---|---|
| Push notification | *"🏆 You won Funniest — Sakura theme is yours"*. Sent even if the weekly-competition toggle suppressed the other sends? No — the toggle is respected, but this one ignores every *engagement* suppression rule. |
| In-app notification | `notification_model` row, `type: 'announcement'`, with the entry thumbnail as `target_preview` and the granted item in `payload`. Bell badge, persists. |
| Winners moment | Personal *"You won"* variant of the modal, confetti (`ReactionBurst`), reward card. |
| Profile | `title.champion` (equippable title) + a wins counter/trophy row on `ProfileCard`, driven by `user.competition.wins`. |
| Everywhere their art appears | A small 🏆 winner badge on the artist's competition entries (current and archived) and — when the entry was cross-posted — on the feed post card. |

`title.champion` is granted on a **first** win only; subsequent wins increment
`wins`. Titles are earned-not-sold, consistent with `titles.router.ts`.

The badge lookup must be cheap: store `is_winner: boolean` + `won_category` on
the **entry document** at announce time, and expose `competition_wins` in
`PUBLIC_USER_FIELDS`. No join per card.

### 7.2 Reward mechanics

- **Winner grant** = one existing catalog SKU per category, chosen per week
  in the admin page from the live catalog. Server does
  `$addToSet: { inventory: { $each: reward_items } }` — reuse the code path in
  `admin.inventory.router.ts`, extracted into a shared
  `grantItems(userId, items, reason)` service (Task 1.4) so both routes and the
  cron use one implementation.
- **Rotate the reward across categories** so the announcement is not always the
  same theme. Prefer showcasing items with low ownership.
- **The moment sells the item.** The winners modal states the item by name with
  its shop art and a direct link. Losing a week and seeing a nice item is the
  intended purchase trigger, not an accident.
- **Winner's flex is visible.** `user.competition.wins` is shown on the profile,
  and first-place grants `title.champion`. Other users see the title in the feed
  and on entries — free advertising for participation.
- **Never give away everything.** One item per category per week (3 items/week
  max). Do not put bundles or Lifetime in the reward pool.

Track `competition_reward_shop_open` → `purchase` in Mixpanel to see whether the
loop actually converts (Task 10.1). If it does not after ~6 weeks, the answer is
better item selection, not more items.

---

## 8. Notifications

Notifications are the sharpest tool here and the easiest way to make the feature
annoying. Rules:

- **One preference**, `user.competition.notifications`, default **on**, exposed
  in `components/settings/SettingSwitches.vue` as *"Weekly competition"* with
  the subtitle *"New theme, last call, and results. Max 3 a week."* Honest
  labelling beats a settings maze.
- **Hard cap: 3 per week**, and each one is individually suppressible by
  behaviour:

| When | Sent to | Suppressed if |
|---|---|---|
| Mon, local ~10:00 | everyone opted in | user has not entered or voted in the last 3 weeks |
| Fri, local ~18:00 ("last call") | opted in, **not entered** | already entered, or never entered any competition |
| local ≥19:00 after the announcement (results) | opted in **and** entered or voted this week | user is a winner — they got the better push already |

- **Winners always get a push** regardless of the engagement suppressions above
  (still respecting the preference toggle). Getting told you won is the payoff.
- Scheduling uses the existing `user.timezone` field and the hourly cron: each
  tick sends to users whose local hour matches the slot. Same approach the
  server already uses for time-of-day sends.
- Add `NotificationType.competition_*` entries to `types/types.ts` and builders
  to `config/notification.config.ts`. Priority `normal`, not `max` — this is not
  a strike or a DM.

### 8.1 In-app rows

The bell is not an interruption, so it carries more than the three pushes do.
Every one of these is `notification_model` `type: 'competition'`, discriminated
by `payload.kind`, and **none of them counts against the 3/week push cap** —
`PUSH_SLOTS` is the cap's definition and these are not in it.

| `payload.kind` | Sent to | When | Tap opens |
|---|---|---|---|
| `win` | each winner | at announce | winners modal, personal variant |
| `results` | every other entrant and voter | at announce | winners modal |
| `submissions_closed` | everyone who entered | first tick after `submissions_close_at` | competition page |
| `entry_comment` | the entry's artist | on each comment, merged per entry | the fullscreen viewer on that drawing, comments open, **in place** |

The comment tap does not navigate. `useCompetitionEntryViewer` opens the swiper
over whatever screen the user is on (normally the notification list), because
reading a reply is not a reason to strand someone on the competition page when
they close it. That viewer is read-only — voting and deleting stay on the page,
which owns the vote budget and the grid a deletion has to be removed from.

`submissions_closed` is claimed on the **competition** document
(`submissions_closed_notified_at`) before the per-user fan-out. The entrant set
is frozen the moment submissions close, so one pass is the whole job — without
the claim the driver would re-walk every entrant on every tick for the rest of
the voting window only to have the per-user ledger reject each one.

`entry_comment` uses `merge_count` aggregation keyed on the entry, the same
shape as a comment on a feed post, and is in-app only: a competition entry is
already a noisier surface than a post, and the push budget belongs to the three
slots above.

---

## 9. Moderation and abuse

### 9.1 Reporting

Add to `REPORTABLE` in **both** `moderation.policy.ts` files (server and client
copies must stay identical):

```ts
competition_entry: { quarantine_threshold: 2, auto_hide: false, label: 'Entry' },
competition_comment: { quarantine_threshold: 2, auto_hide: false, label: 'Competition comment' },
competition_theme:  { quarantine_threshold: 2, auto_hide: true,  label: 'Theme' },  // NOT IMPLEMENTED
```

The first two are in. `competition_theme` is **not** — suggestions are still
protected only by the moderated `pending → approved` queue and the profanity
filter, with no user-facing report path. See Task 8.1.

`competition_entry` threshold 2, not 3 like posts: an entry is on a promoted
surface with a prize attached, so err toward review. Themes `auto_hide: true` —
a theme is short text with no artistic value to protect, and it is displayed to
everyone including minors.

The report route (`moderation.router.ts`) needs the new target types wired into
its quarantine handling, `content_snapshot`, and strike attribution. No new
strike ladder entries — a bad entry is a bad post.

### 9.2 Quarantine effects

- `status: 'under_review'` → entry hidden from `/entries`, hidden from results,
  **votes preserved**. If cleared, it re-enters with its votes intact.
- `status: 'removed'` → excluded permanently. If it had won, the scoring rerun
  promotes the runner-up.
- **Scoring re-checks status immediately before granting.** Never grant a reward
  to a removed entry; never announce one.

### 9.3 Vote integrity

- Unique index (§4.3) prevents double-voting.
- Self-voting rejected.
- Budget enforced server-side.
- **Accounts younger than 48h cannot vote.** The cheapest brigade is a handful
  of throwaway accounts; a small age floor kills most of it without touching
  legitimate new users, who can still enter and browse.
- Log `voter_id → entry.user_id` concentration per week. If one entry's votes
  come overwhelmingly from accounts created the same day, flag it in the admin
  page rather than auto-punishing — v1 keeps a human in the loop for accusations.

### 9.4 Age gating

The competition is a stranger surface. Under-13 accounts get the locked card,
and every write route carries `requireAdultAccount`, enforced server-side so a
replayed request cannot enter a child's drawing into a public contest. This is a
Play-policy requirement, not a UX preference — see
[FAMILIES_POLICY.md](FAMILIES_POLICY.md).

### 9.5 Profanity

Captions and theme suggestions run through `censorText` and store the censored
twin, exactly like post comments. Client renders the twin when
`user.profanity_filter` is on.

---

## 10. Admin page (sketchmate-platform)

New Nuxt page `app/pages/competitions.vue`, same auth shape as
`moderation.vue`: Firebase Google sign-in → ID token → `Authorization: Bearer`
against the server, gated by `requireAdminAuth` (`is_admin: true`).

Server side: `api/router/admin.competition.router.ts` mounted at
`/admin/competition`.

Tabs:

1. **Schedule** — list of competitions (past, current, and every scheduled
   future week). Creation uses server-provided Monday 00:00 UTC cycle slots;
   arbitrary dates are impossible and the unique `week_key` enforces one
   competition per week. Empty upcoming weeks can be deleted. Theme, blurb,
   accent, categories and rewards use the live catalog. Dates never move.
2. **Theme queue** — pending suggestions with author, upvotes, filtered text.
   Approve / reject (with reason) / promote straight to next week. This is the
   one recurring manual task; batch it once a week in a couple of minutes.
3. **Entries** — grid for the active competition, force-remove with reason
   (writes a `moderation_action`), and the vote-concentration flags from §9.3.
4. **Results** — for `closed`/`announced` weeks: computed standings, a
   **Recompute** button (recounts from `competition_votes`), a manual
   **Announce now** override, a **Re-grant** button for a failed grant, and a
   full audit list of what was granted to whom.

Everything on this page is an override for a system that already runs by itself.
If the page is never opened, the competition still opens, closes, scores, grants
and announces — using fallback themes from the constant pool.

---

## 11. Testing as a solo dev

A weekly feature is untestable if the only way to see a state transition is to
wait a week. **Nobody should ever wait for a real Monday.** Testing tooling is
not a phase-10 nicety here — it is built in Phase 1, before the feature works,
because every later phase depends on being able to reach `announced` in under a
minute.

### 11.1 Compressed cycles

`competition.config.ts` exports the cycle as durations, not as "Monday":

```ts
export const CYCLE = {
  duration_ms:            6 * DAY + 18 * HOUR,
  submissions_close_ms:   4 * DAY,   // offset from starts_at
  results_grace_ms:       6 * HOUR,  // how long the results stay in front — §3
};
```

A competition created with `{ duration_ms: 6 * MINUTE, submissions_close_ms:
4 * MINUTE, results_grace_ms: 3 * MINUTE }` runs a full week in six minutes and
exercises the *real* cron path, real scoring and real granting. `week_key` for
such a competition is `test-<timestamp>` so it can never collide with a real
week.

The phase advancer must therefore never compute phases from calendar maths —
only from `now` vs the stored `starts_at` / `submissions_close_at` / `ends_at`.
That is the single design rule that makes all of this work.

**The advancer runs every minute outside production.** Hourly is right for a
real week, but a six-minute cycle transitions four times inside a single gap
between hourly ticks, so the only way to reach `announced` would be to press
"Announce now" — skipping exactly the cron path the test exists to exercise. The
per-minute tick is gated on the same condition as the dev routes
(`NODE_ENV !== 'production' || ALLOW_DEV_COMPETITION=1`) and `advancePhases()`
is idempotent, so it costs one indexed query when no test is running.

Together with the results hold ([§3](#3-weekly-cycle)), a test cycle now walks
itself: open → voting → closed → scored → announced → winners moment → grace
expires → back to the real week.

### 11.2 Dev routes — `/dev/competition`

Modelled on the existing `devModeration.router.ts` (same shape, same
`requireAdminAuth`, and additionally refuses to mount when
`NODE_ENV === 'production'` unless `ALLOW_DEV_COMPETITION=1`).

| Route | Effect |
|---|---|
| `POST /create` | Create a competition with arbitrary durations, theme, categories and rewards. Defaults to a 6-minute cycle. |
| `POST /:id/phase` | Force `phase` to any value, shifting the timestamps to stay consistent. |
| `POST /:id/fast-forward` | Shift all timestamps back by N minutes — "make it Sunday now". |
| `POST /:id/seed-entries` | Create N entries on **real other accounts** using sample images, each flagged `seeded: true`. The single most useful one: a page with 40 entries behaves nothing like a page with 2. |
| `POST /:id/seed-votes` | Scatter M votes across the entries so scoring has a real distribution and a tie to break. |
| `POST /:id/score` | Run `scoreCompetition()` + `announceCompetition()` immediately, out of band from the cron. |
| `POST /:id/reset-seen` | Clear `last_seen_results_week` for me (or all users) so the winners moment fires again. |
| `POST /:id/force-win` | Make my own entry win a category — the only sane way to test the "you won" push, badge, title grant and personal modal variant. |
| `DELETE /:id` | Nuke a competition and all its entries/votes, revoking its grants first. Test data only (refuses on a competition without a `test-` week key unless `?force=1`). |

### 11.2.1 Seeded entries must never pay out

`seed-entries` attaches entries to **real user accounts**, deliberately: real
avatars, worlds and titles are what make the grid look like production. That
also makes a seeded entry indistinguishable from a genuine one everywhere it
matters, so it is flagged `seeded: true` and that flag is load-bearing:

- `announceCompetition` gives a seeded winner the podium slot and the
  `is_winner` badge, but **no** `grantItems`, no `title.champion`, no `wins`
  increment, and `granted_items` stays empty.
- `notifyWinners` skips them entirely, and the participant fan-out, the
  engagement checks and the last-call suppression all filter
  `seeded: { $ne: true }`. Nobody is told how a competition they never entered
  turned out.
- `seed-votes` and `force-win` flag their votes the same way.

Without this the dev panel quietly pays real cosmetics to real strangers and
pushes them a "You won Funniest" notification.

`results[].granted_items` is the only record of what an announce actually wrote,
which is why `DELETE /:id` revokes before it deletes rather than after. Drop the
competitions collection without that order and the items are stranded on real
accounts with nothing left to trace them by — the recovery key then becomes
`title.champion` / `competition.wins > 0`, both of which only
`announceCompetition()` ever writes.

`force-win` and `seed-entries` are what turn a week-long feature into a
30-second loop. Build them in Phase 1.

### 11.3 Client dev panel

A `CompetitionDevPanel.vue`, rendered only under `import.meta.env.DEV` (same
gate `inventory.store`'s `devUnlockAll` uses), reachable from the existing
`DevNote.vue` surface. Buttons wrap the dev routes above: *Start test cycle*,
*Seed 20 entries*, *Seed votes*, *Skip to voting*, *Announce now*, *Make me win*,
*Show winners modal again*.

Combined with `DEV_UNLOCK_ALL` already in `inventory.store`, one person can walk
the entire feature — enter, vote, close, score, grant, announce, moment, badge —
without a second device and without waiting.

### 11.4 Automated checks

Worth the keystrokes, in this order:

1. `competition.service` phase transitions — a table-driven test over `now`
   values asserting the resulting phase. Pure function, no DB.
2. Scoring — given entries + votes fixtures, assert winners, tie-break by
   `submitted_at`, and that `removed` entries are excluded.
3. Idempotency — call `announceCompetition()` twice, assert one grant.
4. Store reset contract — `competition.store` must satisfy the existing
   `storeResetContract.test.ts`.

### 11.5 Second-account testing

Voting needs a second user. Fastest path is `seed-entries` with fake authors
plus one real second account (the web build at `localhost` signed in with a
different Google account, alongside the device). Do not build multi-account
switching for this.

---

## 12. Task breakdown

Dependencies in brackets. Phases 1–5 are the shippable core; 6–10 are
independently landable on top.

### Phase 1 — Server foundation ✅ done

- **1.1 `config/competition.config.ts`** — cycle **durations** (§11.1, never
  calendar maths), default categories and vote budgets, `COMPETITION_ACCENTS`
  (§6.4), fallback theme pool, notification slots, vote age floor. Pure data, no
  imports, duplicated verbatim into the client. *(none)*
- **1.2 `models/competition.model.ts`** — the four schemas + indexes from §4.
  *(1.1)*
- **1.3 User model additions** — `competition.{notifications,
  last_seen_results_week, wins}`. *(none)*
- **1.4 Extract `services/inventory.service.ts`** — `grantItems(userId, items,
  reason)` pulled out of `admin.inventory.router.ts`; the router becomes a
  caller. Pure refactor, no behaviour change. *(none)*
- **1.5 `services/competition.service.ts`** — `ensureCurrentCompetition()`,
  `advancePhases()`, `scoreCompetition()`, `announceCompetition()`. All
  idempotent, all keyed on `week_key`. *(1.1, 1.2, 1.4)*
- **1.6 Cron wiring** — hook `advancePhases()` into the hourly job in `main.ts`.
  Catch-up safe on boot. *(1.5)*
- **1.7 `api/router/devCompetition.router.ts`** — every route in §11.2. Built
  now, not later; Phases 3–8 are untestable without it. *(1.5)*

### Phase 2 — Entries ✅ done

> Competition Entry and Community Post are independent SendHub destinations.
> The competition section never silently creates a feed post.

- **2.1 `api/router/competition.router.ts`** — `/current`, `/upload-urls`,
  `/enter`, `/entry` (delete), `/:id/entries` with the seeded shuffle. Guards
  per §5. *(1.2)*
- **2.2 Explicit audience choice** — competition submission creates only the
  entry; community publishing remains in the existing post section. *(2.1)*
- **2.3 Client API + store** — `service/api/competition.api.ts`,
  `store/competition.store.ts`, reset-contract registration. *(2.1)*
- **2.4 `SendHub` competition section** — fourth toggleable section per §6.3,
  accent-tinted per §6.4, `shareService.submitCompetitionEntry()` joining the
  existing `runBatch()`. *(2.3)*
- **2.5 `CompetitionDevPanel.vue`** — DEV-only client panel wrapping the dev
  routes (§11.3). *(1.7, 2.3)*
- **2.6 `phaseFor` unit tests** — `src/config/competition.config.test.ts`, the
  table-driven phase check from §11.4. *(1.1)*

### Phase 3 — Competition page and voting ✅ done

> Two things landed here that the plan put elsewhere, both because the page is
> unshippable without them: a minimal slice of Task 8.1/8.2 (`competition_entry`
> in `REPORTABLE` plus the resolve/snapshot/quarantine/remove/restore cases), and
> impression tracking (Task 3.5), which fair scoring depends on.
>
> Archive cards now open an interactive detail view with winners, all entries,
> fullscreen artwork and comments.

- **3.1 Vote routes** — `POST`/`DELETE /:id/vote` with unique-index insert,
  budget check, self-vote and account-age rejection. *(1.2)*
- **3.2 `views/competition.view.vue` + route** — lazy route, header, sticky
  budget bar, entry grid with feed-grade image handling and release-on-leave.
  *(2.3, 3.1)*
- **3.3 `components/competition/EntryCard.vue`** — artwork, artist identity
  (reuse the feed's author components), per-category vote chips, report
  overflow. *(3.2)*
- **3.4 Archive** — `/archive` route + tab, and the *Competitions* strip on the
  profile view. *(3.2)*
- **3.5 Impression tracking** — `impressions` counter on the entry,
  `POST /:id/impressions`, exposure-balanced ordering, and the client's
  IntersectionObserver + 1.5s dwell batcher. Load-bearing for fair scoring
  (§2.7), so it ships with the grid, not later. *(3.2)*

### Phase 4 — Home card ✅ done

- **4.1 `components/home/CompetitionCard.vue`** — all states from §6.1, shared
  countdown tick, ambient-pause aware. *(2.3)*
- **4.2 Mount in `home.view.vue`** — top slot, refresh on
  `onIonViewDidEnter`, under-13 locked variant. *(4.1)*

### Phase 5 — Results, rewards, the moment ✅ done

> The winners modal fetches results lazily on open and marks them seen on
> **close**, not on open: a modal killed by a crash or an app switch should come
> back rather than being silently spent.
>
> It also yields to the what's-new modal — two full-screen moments racing on the
> same app open is the failure this ordering avoids. Results simply fire on the
> next open.

- **5.1 Scoring** — recount from `competition_votes`, status re-check, Wilson
  lower bound on `votes / impressions` with the `MIN_IMPRESSIONS_TO_WIN` floor.
  Insufficient exposure skips results instead of falling back to raw votes;
  exact ties use a deterministic week/category lottery. *(1.5, 3.1, 3.5)*
- **5.2 Reward granting** — `grantItems` per winner, `title.champion` for
  firsts, `wins` increment, `granted_items` audit written back. Retry-safe.
  *(5.1, 1.4)*
- **5.3 `/results` route + client fetch** — winners hydrated with the **full**
  `customization` object, not `PUBLIC_USER_FIELDS`. *(5.1)*
- **5.4 `WinnersModal.vue` + `useCompetitionResultsPrompt.ts`** — trigger rules
  from §6.5, `PreviewProfileCard` for the winner, priority against existing
  modals, `/seen` marking. *(5.3)*
- **5.6 Win visibility** — `title.champion` on first win, `wins` counter and
  trophy row on `ProfileCard`, `is_winner`/`won_category` denormalised onto the
  entry, winner badge on entry cards and cross-posted feed posts,
  `competition_wins` in `PUBLIC_USER_FIELDS` (§7.1). *(5.2)*
- **5.5 Shop deep link** — route the reward card to the right shop item
  (`inventory.store.findSkuForItem` already maps item → SKU). *(5.4)*

### Phase 6 — Notifications ✅ done

> `competition_notifications` is the at-most-once ledger: the hourly pass picks
> users whose LOCAL hour matches a slot, and without the unique index a clock
> change, a timezone update mid-week or a double tick would each resend. It also
> answers the 3-per-week cap.
>
> The preference write is its own route, not the generic user `/update` — that
> one `$set`s whole objects and would silently wipe `last_seen_results_week` and
> `wins` alongside the toggle.

- **6.1 Types + builders** — `NotificationType.competition_*`,
  `notification.config.ts` builders. *(none)*
- **6.2 Scheduled sends** — the three slots in §8, timezone-aware, with the
  suppression rules and the 3/week cap. *(1.6, 6.1)*
- **6.3 Winner push + in-app `announcement` rows.** *(5.2, 6.1)*
- **6.4 Settings toggle** — `SettingSwitches.vue` entry, persisted through the
  existing profile-update route. *(1.3)*

### Phase 7 — Theme suggestions ✅ done

- **7.1 Routes** — `GET/POST /themes`, `POST /themes/:id/upvote`, one
  suggestion per competition cycle, `censorText` on write. A newly active
  competition starts a fresh next-theme vote. *(1.2)*
- **7.2 Themes tab** — suggest + upvote UI, own-suggestion status display.
  *(3.2, 7.1)*
- **7.3 Auto-consume** — `ensureCurrentCompetition()` picks the highest-upvoted
  `approved` theme, marks it `used`, falls back to the constant pool when empty.
  *(1.5, 7.1)*

### Phase 8 — Moderation

- **8.1 `REPORTABLE` additions** in both policy files, kept identical.
  ⚠️ *partial* — `competition_entry` and `competition_comment` are in;
  `competition_theme` is not. *(none)*
- **8.2 Report pipeline wiring** — quarantine, snapshot, strike attribution for
  the new target types. ⚠️ *partial*, same reason as 8.1. *(8.1, 1.2)*
- **8.3 Removal → rescore** ❌ *not started* — removing a winner should promote
  the runner-up and revoke nothing already granted (do not claw back; note it in
  the audit). Today removing a winner leaves the stale podium in `results[]`.
  *(5.1, 8.2)*
- **8.4 Vote-concentration flagging** ✅ done — the admin entries tab shows the
  share of an entry's votes that came from accounts under a week old, and flags
  anything over 60%. Surfaced to a human; never auto-actioned. *(3.1, 9.2)*

### Phase 9 — Admin page ✅ done

> A running week accepts **cosmetic edits only** (blurb, accent). Theme and
> dates lock the moment it opens: changing what people entered under mid-week is
> not an edit, it is a different competition. Rewards stay editable until the
> week closes, because nothing has been granted yet and picking the prize a few
> days in is normal.
>
> The results tab shows `grant_confirmed` per winner — checked against the
> user's actual inventory, not against `granted_items` — so "did the grant land?"
> has an answer before anyone presses Re-grant.

- **9.1 `admin.competition.router.ts`** — CRUD, theme queue actions, recompute,
  announce-now, re-grant, entry removal. All `requireAdminAuth`. *(1.5, 5.1)*
- **9.2 `app/pages/competitions.vue`** — four tabs from §10, `moderation.vue`
  auth pattern. *(9.1)*
- **9.3 Catalog reward picker** — serve the catalog from the server so the
  platform does not duplicate `catalog.config.ts`. *(9.1)*

### Phase 10 — Analytics and hardening

- **10.1 Mixpanel** ✅ done — `competition_card_open`, `_page_open`,
  `_entry_submit` (server + client, with `shared_to_feed`), `_vote_cast`,
  `_results_view`, `_reward_shop_open`, `_theme_suggest`, `_theme_upvote`.
  *(4.1, 3.2, 5.4)*
- **10.2 Kill switch** — server config flag; `/current` returns null and the
  home card renders nothing. Ship this **with Phase 4**, not at the end.
- **10.3 Load check** — entry grid and vote path against a synthetic week of
  ~500 entries and ~5k votes; verify index usage on the scoring aggregation.
- **10.4 Low-participation fallback** ⚠️ *partial* — `MIN_ENTRIES_TO_ANNOUNCE`
  already skips the podium and writes `skipped_reason` on the competition.
  Still missing: rendering that as a gentle "not enough entries" state instead
  of an empty results screen, and carrying the theme to next week rather than
  burning it. *(5.1)*

---

## 13. Risks and open questions

**The brief makes sense.** The parts worth flagging before anyone writes code:

1. **Empty first weeks are the real failure mode.** A competition page with four
   entries looks dead and kills the feature before it starts. Mitigations:
   Task 10.4, seeding the first two weeks by inviting active posters directly,
   and keeping the home card in "not entered" state until there is something to
   show. Consider a soft launch to a subset before the card goes to everyone.
2. **Vote brigading via group chats** is not solvable with technical controls
   alone at this scale. Hidden tallies (§2.3), the account-age floor and the
   concentration flag (§9.3) raise the cost enough for v1. Do not build vote
   weighting until there is evidence it is needed.
3. **Reward inflation devalues the shop.** 3 items/week is ~150/year given
   away. If competition winners become the main way to obtain cosmetics, sales
   fall rather than rise. Keep it to one item per category, never bundles, and
   revisit the number against actual purchase data.
4. **User-submitted themes are a Play-policy exposure.** Moderated queue,
   profanity filter, auto-hide on report, adult-gated (§2.6, §9.4). Do not
   loosen this to save admin time.
5. **"Entries are not posts" costs some duplicated UI.** Accepted deliberately;
   the alternative — overloading `posts` with a competition flag — pollutes the
   feed's ranking, quota and suppression logic, all of which are already
   carefully tuned (see [FEED.md](FEED.md)).
6. **Open:** should a losing entry be shareable to the feed *after* results,
   as a one-tap action? Nice recovery for non-winners, but it needs quota rules
   and a "posted late" edge case. Deferred out of v1; the data model already
   supports it (`post_id` is nullable and settable later).
7. **Open:** per-category budgets (3 each) vs one shared pool. Per-category is
   specified because it forces engagement with every category; a shared pool is
   simpler but collapses to everyone spending everything on "overall". Revisit
   after week 4 with real distribution data.

---

## 14. Rollout

1. Phases 1–2 behind the kill switch, no client surface. Verify the cron opens
   and closes a week correctly against a shortened test cycle.
2. Phase 3 + 4 to internal/admin accounts only (`is_admin`), one full real week.
3. Phase 5 — run one complete cycle end to end, including a manual
   `Announce now`, before any user sees a results modal.
4. Enable for all 13+ users. Watch entry count, vote count per voter, and
   `_reward_shop_open` → purchase.
5. Phases 6–9 land after two clean public weeks. Notifications last, on purpose:
   they amplify whatever the feature already is, good or bad.
