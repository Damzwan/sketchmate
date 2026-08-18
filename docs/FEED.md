# SketchMate Community Feed

How the home feed selects, ranks and paces content — and why it is built to end
rather than to scroll forever.

> **Audience:** engineers touching `src/components/home/CommunityFeed.vue`,
> `src/store/post.store.ts`, or `sketchmate_server/src/api/router/post.router.ts`.

---

## Table of contents

1. [Design goals](#design-goals)
2. [The three tabs](#the-three-tabs)
3. [Ranking: time-decayed score](#ranking-time-decayed-score)
4. [Repeat suppression](#repeat-suppression)
5. [The no-infinite-scroll contract](#the-no-infinite-scroll-contract)
6. [Request lifecycle](#request-lifecycle)
7. [Client caching](#client-caching)
8. [Privacy: feed_level](#privacy-feed_level)
9. [Tuning constants](#tuning-constants)
10. [Known limitations](#known-limitations)

---

## Design goals

The feed is deliberately **not** engagement-maximising. Three constraints shape
every decision here:

1. **It must end.** One capped fetch per tab, then a "You're all caught up"
   card. There is no pagination, no load-more, no scroll trigger.
2. **It must not repeat itself.** Returning to the app several times a day
   should not show the same drawings each time.
3. **It must respect `feed_level`.** A user who limited their feed to mates
   never sees strangers, on any tab.

Goal 1 makes goal 2 harder, not easier: with only ~20 slots and no paging, every
slot has to earn its place, and a stale ranking is immediately obvious.

---

## The three tabs

`GET /post/feed?tab=<tab>&limit=20`

| Tab | `tab` value | Selection |
|---|---|---|
| **For You** | `for_you` | Mates + follows (capped), then scored global discovery |
| **Mates** | `mates` | Only mates + follows, newest first |
| **Latest** | `latest` | Strict reverse-chronological |

### For You

Two-stage fill:

1. **Connections** — mates first, then follows, newest first, and bounded three
   ways:
   - Capped at `CONNECTION_SHARE` (40%) of the page when `feed_level === 'open'`.
     The cap exists because a few chatty mates would otherwise fill all 20 slots
     and global discovery would never run. When `feed_level === 'mates'` there
     is no discovery stage, so the cap is lifted to the full page.
   - Limited to the last `CONNECTION_WINDOW_DAYS` (10). "Newest first" is not
     the same as "recent": a mate who last posted in spring would otherwise
     hold a slot indefinitely.
   - Seen-aware — see [Repeat suppression](#repeat-suppression).

   A `feed_level === 'mates'` viewer whose window comes up short is topped up
   with older / already-seen connection posts, since no discovery stage exists
   to fill the gap for them.
2. **Discovery** — the remaining slots, scored (below), suppressed (below), and
   jittered.

### Mates

Chronological, mates ranked above follows. No scoring, no suppression — content
from people you chose to connect with is presented as-is.

### Latest

Strict `createdAt` descending. No ranking and no suppression by design: Latest
is the predictable, honest surface, and it refreshes on its own as people post.

Note: when `feed_level === 'mates'`, Latest and Mates return the same thing.
That is intentional — widening Latest to strangers would quietly override the
user's own privacy setting.

---

## Ranking: time-decayed score

Discovery used to sort by `views: -1`. That was broken in two compounding ways:

- **Static.** Same query, same top posts, every single request.
- **Self-reinforcing.** `POST /post/views` increments `views` on exactly the
  posts it just displayed. Being shown made a post rank higher, which got it
  shown more. Nothing could ever displace the top.

It is now a Hacker-News-style gravity score, computed in the aggregation:

```
          1 + reactions×3 + comments×5 + views×0.2
score =  ─────────────────────────────────────────
                    (ageHours + 2) ^ 1.5
```

Properties worth preserving:

- **Dividing by age** means a post has to keep earning its slot. Old content
  falls out on its own.
- **The `+ 1` in the numerator** lets a brand-new post with zero engagement
  still enter the pool, so "popular" and "new" blend on a single axis. The old
  code interleaved two separate queries by hand; that is no longer needed.
- **Comments outweigh reactions** (×5 vs ×3) — a comment costs more effort and
  is a stronger signal than a tap.
- **Views are heavily discounted** (×0.2) because they are the cheapest and
  most self-reinforcing signal.

Only posts from the last `DISCOVERY_WINDOW_DAYS` (30) are scored, which also
keeps the aggregation on an index instead of scanning all history.

### Jitter

After scoring, each candidate is multiplied by a random factor in `[0.75, 1.25]`
before the final sort. The route over-fetches `slots × 4` candidates so the
shuffle has room to work.

This is what actually breaks the "identical every open" feeling. The band is
wide enough to reorder near-equal posts, narrow enough that a genuinely strong
post is not buried.

---

## Repeat suppression

The `views` counter on a post is global — it says nothing about whether *you*
have seen it. The `post_views` collection is the per-viewer ledger:

```ts
{ user_id, post_id, seen_count, last_seen_at }
```

- Written by `POST /post/views`, which the client calls for posts that were
  on screen for **more than 1.5 seconds**. Delivery alone does not burn a post;
  only an actual impression does.
- `seen_count >= SEEN_SUPPRESS_AT` (2) → **suppressed**, excluded from
  discovery.
- `seen_count === 1` → **demoted**, still eligible but its score is multiplied
  by `SEEN_DEMOTE_FACTOR` (0.25).

The connection tier in For You applies the same ledger, adapted to a stage that
has no score to multiply:

- Suppressed posts are excluded **in the query**, not trimmed afterwards, so a
  mate whose only recent post is burned yields the slot to discovery instead of
  returning it and re-showing it.
- Demoted posts are stably reordered below unseen ones, preserving
  mate-then-follow, newest-first order within each group. The stage over-fetches
  `slots × 2` so there is unseen material to swap upward.

The Mates and Latest tabs stay unsuppressed and unwindowed by design.

So in practice a user sees a given post at most twice. Seeing something twice is
normal; seeing it on every app open was the bug.

### Why it is soft, and why it expires

Two escape hatches keep suppression from starving a young app:

- **TTL.** A 30-day index on `last_seen_at`, which the upsert refreshes. A post
  you keep being shown stays suppressed; one that dropped out of rotation
  becomes eligible again after the window. Nothing is suppressed permanently.
- **Filler fallback.** If the scored pool cannot fill the page, the route tops
  up with recent posts *ignoring* suppression. Showing a repeat beats showing a
  half-empty feed.

Only the most recent `SEEN_LOOKBACK` (400) ledger rows are consulted per
request, which bounds the `$nin`.

---

## The no-infinite-scroll contract

This is a product requirement, not an optimisation. Anyone touching the feed
should know exactly where it is enforced:

- **Server:** `/post/feed` takes `limit` and has **no cursor, no page, no
  offset parameter.** There is no way to ask for the next page. Adding one
  would break the contract.
- **Client:** `CommunityFeed.vue` fetches once per tab and renders the
  "You're all caught up" card at the end of every non-empty list. There is no
  `IntersectionObserver` on a load-more sentinel.

Switching tabs is *not* an escape hatch: each tab is its own single capped
fetch, and switching back serves the cached list rather than re-fetching.

> Historical note: an unused `loadMoreTrigger` div and a permanently-`false`
> `hasMore` ref used to sit in the template. They were dead code — the observer
> was never wired — and have been removed so the intent is not ambiguous.

---

## Request lifecycle

```
CommunityFeed.vue
  └─ postStore.getFeed(tab)
       └─ GET /post/feed?tab&limit
            ├─ feed_level === 'off'  → { feed: [] }
            ├─ loadAudience()        → mateIds / followIds / blockedIds
            ├─ per-tab selection     → LeanPost[]
            │    └─ for_you: selectConnectionPosts + selectDiscoveryPosts
            │         └─ loadSeenState() → suppressed / demoted
            ├─ dedupe by _id
            └─ hydrateFeedPosts()    → authors, viewer reactions, 2 comments each
```

`hydrateFeedPosts` (in `post.service.ts`) is shared by all three tabs: they
select posts differently but present them identically. It runs a fixed number of
queries regardless of page size — four: comment previews, viewer reactions,
viewer bookmarks, and one user lookup that covers post authors, comment authors
and credited users together.

> This claim used to be false. The comment previews were fetched with
> `Promise.all(postIds.map(id => find().sort().limit(2)))` — one query per post,
> so **20 round trips** for a 20-post page. They now come back from a single
> correlated `$lookup` (`fetchCommentPreviews`). The `$lookup` keeps the per-post
> `sort + limit`, which matters: a plain `$in` + group-in-memory would read every
> comment on every post in the page to keep two of them, so one post with a few
> thousand comments would cost more than the N+1 did. Measured on production: 40
> documents examined for 40 returned comments, index-driven off
> `{ post_id: 1, createdAt: -1 }`.

Grid surfaces (the profile gallery, the saved-posts page) use `hydrateGridPosts`
instead. A grid draws a thumbnail and nothing else, so it skips the comment
previews entirely; tapping a tile opens the photoswiper, which fetches the real
thread itself.

Impressions flow back independently:

```
IntersectionObserver (0.6 threshold, 1.5s dwell)
  └─ batched 3s  →  POST /post/views
       ├─ post.views++            (global counter)
       └─ post_views upsert       (per-viewer ledger, drives suppression)
```

---

## Client caching

`post.store.ts` holds one list per tab:

```ts
feedByTab: Record<FeedTab, FeedPost[]>
fetchedTabs: Record<FeedTab, boolean>
```

- A tab already fetched this session is **not** re-fetched on revisit. Pulling
  again would reshuffle the page under someone who had scrolled down it.
- `markFeedDirty()` calls `resetFeeds()`, invalidating **all three** tabs — every
  tab derives from `feed_level`, so a change to it invalidates more than the tab
  currently on screen.
- Mutations (`removePostLocally`, `toggleReactionLocally`, `deletePostComment`)
  iterate every tab list. The same post can sit in For You *and* Latest as two
  distinct objects; reacting in one must update both.

`selectTab()` clears `postElements` because switching re-renders the list and
detaches the cached nodes. Without that, a post carried over from the previous
tab never gets a fresh observer, never logs as seen, and never becomes eligible
for suppression. `viewedPosts` deliberately persists, so a post shown in two
tabs still only counts once per session.

---

## Privacy: feed_level

Set per user, three values:

| Value | Behaviour |
|---|---|
| `off` | No feed at all. All tabs return `[]`; the client shows a pointer to Settings. |
| `mates` | Mates and follows only. Discovery never runs; Latest narrows to connections. |
| `open` | Full feed including global discovery. |

Blocked users are excluded from discovery and from Latest. The viewer's own
posts are excluded from discovery and from global Latest.

---

## Tuning constants

All in `post.router.ts` unless noted.

| Constant | Value | Effect |
|---|---|---|
| `SEEN_SUPPRESS_AT` | 2 | Impressions before a post drops out of discovery |
| `SEEN_DEMOTE_FACTOR` | 0.25 | Score multiplier for a post seen once |
| `SEEN_LOOKBACK` | 400 | Ledger rows consulted per request |
| `DISCOVERY_WINDOW_DAYS` | 30 | Age limit for the scored pool |
| `CONNECTION_SHARE` | 0.4 | Max share of For You given to mates/follows |
| `CONNECTION_WINDOW_DAYS` | 10 | Age limit for the For You connection tier |
| `DISCOVERY_OVERFETCH` | 4 | Candidate multiplier before jitter |
| `POST_VIEW_TTL_DAYS` | 30 | Ledger expiry (`post.model.ts`) |

Raising `SEEN_SUPPRESS_AT` makes the feed repeat more but never run dry;
lowering it does the opposite. On a small catalogue the filler fallback absorbs
most of the difference.

---

## Known limitations

- **Suppression is impression-based, so it depends on the client reporting.**
  A client that never calls `/post/views` gets no suppression at all. It fails
  open, which is the right direction, but it is not authoritative.
- **`$nin` on up to 400 ObjectIds** per discovery query. Fine at current scale;
  if the ledger read ever shows up in profiling, move suppression into the
  aggregation as a `$lookup` + `$match` instead of round-tripping the ids.
- **No cross-session "you already saw this page" memory beyond the ledger.**
  Two opens within the 1.5s dwell window (open, glance, close) do not burn the
  posts — deliberate, but it means a very fast repeat open shows the same page.
- **Jitter is per-request and unseeded.** Two devices refreshing simultaneously
  get different orders. Harmless here, but it does mean the feed is not
  reproducible for debugging; log the selected ids if you need to trace one.
