# SketchMate Relationship Dynamics

How two users become connected, what each connection state permits, and the
anti-pestering rules that govern the transitions between them.

> **Audience:** engineers touching `sketchmate_server/src/api/router/relationship.router.ts`,
> `src/api/services/mate-request.policy.ts`, `src/api/services/chat.service.ts`,
> or the client-side `src/composables/chat/*` gates.

---

## Table of contents

1. [The one-document model](#the-one-document-model)
2. [The state machine](#the-state-machine)
3. [Follows are a separate axis](#follows-are-a-separate-axis)
4. [Entry points](#entry-points)
5. [The trial](#the-trial)
6. [Becoming mates](#becoming-mates)
7. [Anti-pestering: the decline ladder](#anti-pestering-the-decline-ladder)
8. [Notification suppression](#notification-suppression)
9. [Leaving: unfriend, block, expiry](#leaving-unfriend-block-expiry)
10. [Counter integrity](#counter-integrity)
11. [Quotas and capabilities](#quotas-and-capabilities)
12. [Client-side gates](#client-side-gates)
13. [Invariants](#invariants)
14. [Known limitations](#known-limitations)

---

## The one-document model

Every pair of users shares **exactly one** `relationships` document, keyed by a
sorted `users` array:

```ts
{
  users: [ObjectId, ObjectId],   // ALWAYS sorted — uniqueness depends on it
  chat_status: 'none' | 'pending_invite' | 'temporary' | 'expired'
             | 'pending_mate' | 'mate' | 'blocked',
  conversation_id, action_user_id, blocked_by,
  follows: [{ follower, followed }],
  mate_requests: [{ requester, declines, attempts, last_requested_at, cooldown_until }],
  expires_at, deleted_at
}
```

Uniqueness is enforced by `{ 'users.0': 1, 'users.1': 1 }`.

> **The sorting is load-bearing.** A past bug read the pair with an
> order-insensitive `users: { $all: [...] }` but wrote with an exact
> `{ users: sortedUsers }` upsert. Any document whose array happened to be
> unsorted was found by the read and missed by the write, so the upsert inserted
> a *second* document for the same pair — which surfaced as duplicate
> invitations. See the comment in `chat.service.ts`. If you add a query here,
> sort the ids.

`action_user_id` means "whose move are we waiting on" — it is the only record of
who initiated the pending action, and several handlers must read it *before*
clearing it.

---

## The state machine

```
                    first DM sent
        none ──────────────────────────► pending_invite
          ▲                                   │
          │ decline (if no follows)            │ accept
          │                                    ▼
          │                     ┌────────► temporary ◄──── balloon match
          │                     │          (24h trial)     (skips invite)
          │           decline / │             │
          │           cancel    │             │ mate request
          │           (trial    │             ▼
          │            alive)   └──────── pending_mate
          │                                   │
          │                          ┌────────┴────────┐
          │                   accept │                 │ decline / cancel
          │                          ▼                 │ (trial expired)
          │                        mate                ▼
          │                          │              expired
          │                unfriend  │                 │
          │                          ▼                 │
          └───────────────────── expired ◄─────────────┘
                                     │
                     TTL 30d (deleted_at) → document removed

   any state ──── block ────► blocked ──── unblock ────► none (or deleted)
```

`none` exists so a relationship can survive with only a follow edge and no chat.

---

## Follows are a separate axis

Follows live in the same document but are **independent of `chat_status`**. You
can follow someone you have never messaged; the relationship sits at `none` with
a populated `follows` array.

- One-way, and stored per direction: `{ follower, followed }`.
- Following **never** creates a chat or a trial.
- Unfollow is silent — no notification, by design.
- Follow fires an in-app notification only (`channels: { in_app: true }`),
  aggregated under `follow:<targetId>`.
- Blocking wipes `follows: []` entirely, in both directions.

The feed reads this axis directly: mates rank above follows, which rank above
global discovery. See [FEED.md](./FEED.md).

---

## Entry points

There are exactly three ways a relationship starts:

| Entry | Resulting state | Notes |
|---|---|---|
| **First DM** | `pending_invite` | `chat.service.ts` upserts on first message |
| **Balloon match** | `temporary` | Skips the invite step via `relationshipOverride` |
| **Follow** | `none` | Graph edge only, no chat |

The balloon path is the interesting one: accepting a balloon is already a mutual
opt-in, so it grants the 24h trial directly rather than asking the recipient to
accept an invite they effectively already accepted.

---

## The trial

Accepting a `pending_invite` sets `chat_status: 'temporary'` and
`expires_at = now + 24h`.

During the trial both people can chat freely. The trial is what makes the mate
request meaningful — you ask someone to be permanent *after* you have actually
talked.

When it lapses the relationship goes `expired`. Note the state is evaluated
lazily: several handlers compute

```ts
const isTrialValid = rel.expires_at && dayjs().isBefore(dayjs(rel.expires_at));
```

rather than relying on a background job. There is no sweeper — `expired` is
mostly written at the moment of the next interaction.

---

## Becoming mates

`POST /:conversation_id/mate-request` → `pending_mate`, with `action_user_id`
set to the asker.

Accepting (`POST /:id/respond` with `action: 'accept'`) promotes to `mate`,
clears `expires_at`/`cooldown_until`/`deleted_at`, and increments
`stats.mates` for both users.

The promotion is a **compare-and-set**, not a read-then-save:

```ts
relationship_model.updateOne(
  { _id: rel._id, chat_status: 'pending_mate' },   // ← the filter IS the lock
  { $set: { chat_status: 'mate' }, $unset: { ... } }
);
// only credit +1 if transitioned.modifiedCount > 0
```

Two overlapping accepts (double tap, retry) would otherwise both read
`pending_mate` and both award +1, permanently inflating the counter.

---

## Anti-pestering: the decline ladder

**The problem.** Declining a mate request dropped the relationship straight back
to `temporary` and cleared `action_user_id`, so the requester could re-send
immediately — and every send fires a push. Nothing capped the loop. On an app
with minors that is a safety issue, not just an annoyance.

**Why not a flat rate limit.** "One request per hour" is the obvious move and
the wrong one: it caps the *rate* of pestering without ever ending it. What
works is treating a decline as information — each "no" costs the asker more than
the last.

The ladder, in `mate-request.policy.ts`:

| Decline | Cooldown |
|---|---|
| 1st | 6 hours |
| 2nd | 12 hours |
| 3rd | 24 hours |
| 4th | 7 days |
| 5th | locked — no further requests in this relationship |

It starts short deliberately. A trial is 24 hours, and the common case is not a
pest: it is someone who said no, thought about it, and changed their mind while
the trial is still alive. Burning the whole trial on a first decline punished
that person to deter a rarer one. Six hours still breaks a tapping loop, and
reaching the 7-day rung takes four separate rejections across more than a day
and a half.

### Three properties to preserve

- **Per direction.** The ledger is `mate_requests[]`, one entry per requester.
  Being declined never blocks the *other* person from asking. A shared lock
  would let one "no" deadlock a pair who both later change their minds — and the
  partner asking is exactly the healthy path out of a lock.
- **Cancels cost too, but don't count as declines.** Withdrawing a request still
  re-pinged the partner, so it takes a flat 1h cooldown
  (`CANCEL_COOLDOWN_HOURS`). It is not a rejection, so it must not move anyone
  up the ladder — otherwise cancel-and-resend is a free way around every
  cooldown in the policy.
- **Monotonic.** `declines` only ever grows. Anything that resets it on a state
  change hands an unlimited budget to whoever is willing to wait for that state
  change.

### Where the ledger is written

| Event | Function | Effect |
|---|---|---|
| Request sent | `recordMateRequestSent` | `attempts++`, clears cooldown |
| Partner declines | `recordMateRequestDeclined` | `declines++`, sets next rung |
| Requester cancels | `recordMateRequestCancelled` | 1h cooldown, ladder untouched |
| Gate check | `canSendMateRequest` | pure — returns allowed / cooldown / locked |

The decline handler captures `action_user_id` **before** clearing it — that
field is the only record of who asked.

---

## Notification suppression

Only the **first** mate request to a given partner may send a push. Every repeat
is in-app only:

```ts
push: isRepeat ? false : mateRequestPushNotification(...)
```

The harm was never the request itself — it was the notification. Repeats still
land (the `chat:mate_requested` socket event updates the UI, and the request is
waiting when they next open the app), they just cannot buzz a phone.

`isRepeatMateRequest` keys on `attempts`, not `declines`, because
cancel-and-resend re-pings the partner exactly as hard as decline-and-resend.
It **must** be read before `recordMateRequestSent`, which increments the
counter it reads.

### Push vs socket vs in-app

`dispatchNotification` takes three independent channels:

| Channel | Used for |
|---|---|
| `socket` | Live UI updates; a custom `{ event, data }` overrides the default |
| `push` | FCM. `false` to suppress |
| `in_app` | Persists a row in the notification centre |

Most relationship events use `in_app: false` + a custom socket event + a push:
the socket payload carries the whole populated conversation so the client can
re-render without a refetch.

The decline payload deliberately includes `mateRequestStateFor(rel, requesterId)`.
Without it the requester's client would re-render a live "Become Mates" button
the instant they were declined, and only discover the cooldown by having the
next request rejected.

---

## Leaving: unfriend, block, expiry

### Unfriend

`PUT /unfriend/:target_id` → `expired`, plus:

- `deleted_at = now + 30d` — the TTL index removes the document after that.
- The conversation gets the same 30-day `deleted_at`.

**There is no re-invite cooldown.** There used to be a 48h `cooldown_until` on
the relationship document, and it was *never enforced* — nothing on the server
read it before creating a `pending_invite`, so anyone who reached the pair from
the friend picker or a profile sheet re-invited immediately. It only greyed out
the banner button for the user who read it and believed it.

It was also aimed wrong. It fires on the **pair**, so a mis-tap or a fight
patched up an hour later cost both people two days, while the case it looks like
it guards — being re-invited by someone who just removed you — is what `block`
is for. The weekly mate cap is the real brake now: re-friending spends a slot,
which paces churn without a timer the user can't see coming.

Don't confuse it with `mate_requests[].cooldown_until` (the decline ladder),
which is a different field, IS enforced, and should stay: that one is asymmetric
— it protects the person being asked from the person asking.

Also a compare-and-set, for the same reason as the accept path. This one is
documented at length in the source because it caused **negative `stats.mates`**:
the old code read, guarded on the read, updated unconditionally, then
decremented. Two overlapping unfriends each read `mate` and each decremented, so
one `+1` was cancelled by two `-1`s. The status filter is now part of the write,
and the decrement is additionally clamped with `$max: [0, ...]`.

### Block

`POST /block` → `blocked`, sets `blocked_by`, and **wipes `follows: []`**.
Stat corrections walk the old `follows` array to decrement both users' follower
/ following counts, and drop `stats.mates` if the pair were mates. All clamped
at 0.

Only `blocked_by` can unblock. Unblock returns the relationship to `none` if a
conversation exists, or deletes the document outright if not.

Blocked users are filtered out of the feed, of balloon matching, and of the
network lists.

### Expiry

There is no background sweeper. `expired` is written at the moment of the next
interaction, and `deleted_at` (TTL) is what actually reclaims documents — 30
days after an unfriend.

---

## Counter integrity

`user.stats.{mates, followers, following}` are denormalised counters, and every
path that touches them has been a source of drift at some point. Rules:

1. **Guard the transition, not the read.** Put the expected state in the update
   filter so exactly one concurrent request wins.
2. **Only credit when `modifiedCount > 0`.**
3. **Always clamp:** `$max: [0, { $add: [{ $ifNull: ['$stats.x', 0] }, delta] }]`.
   A counter that can go negative eventually does.

`src/scripts/audit-relationship-integrity.ts` exists to find pairs that drifted.

---

## Quotas and capabilities

Two independent gates sit in front of these routes:

**Mate quota** — a *rate*, not a ceiling: `mates_per_week` per tier (free 3,
pro/lifetime `null` = unlimited), checked by `assertMateQuota`.

> **Why it is not a total cap any more.** It used to be `max_mates` (free 10,
> pro 50). That punished people for friendships they already had: a user who
> arrived with 12 mates was permanently at the limit and every relationship
> surface told them so. It also asked them to *manage* a friends list, which is
> not a thing anyone wants to do. The goal was always to slow connecting down,
> not to bound it — so the limit moved onto the rate of new bonds and left the
> existing ones alone. Everyone starts at 0 used, because the counter only sees
> mates formed after the change.

Usage lives in `quota_usage_model.mates_made`, one row per user per UTC day, and
the gate sums a rolling `MATE_WINDOW_DAYS` (7) window ending today. Slots
therefore free up one at a time — a mate made on day D stops counting at the
start of D+7 — and `reset_at` carries the moment the oldest one ages out.

Both sides of a new friendship spend a slot, so:

- The accept path checks **both** users and refuses if either is out. The 429
  carries `blocker: 'self' | 'partner'`, because "you're out" is upgradeable and
  "they're out" is not.
- `recordMateMade` runs for both users, and only inside the
  `modifiedCount > 0` branch of the compare-and-set — otherwise a double-tapped
  accept would spend two weekly slots on one friendship.
- Unfriending and blocking do **not** refund a slot. You spent it when the bond
  formed; giving it back would make unfriend-and-refriend a way around the pace.

The send route gates the asker up front too, so a capped user isn't invited to
queue a request they can't complete this week.

**Moderation capabilities** — `requireCapability(...)` middleware:

| Capability | Route |
|---|---|
| `SEND_MATE_REQUEST` | `POST /:conversation_id/mate-request` |
| `FOLLOW_USER` | `PUT /follow/:target_id` (checked inline, returns 403 `capability_blocked`) |

Restricted users get a structured 403 carrying `restriction.level`, `reason` and
`expires_at` so the client can explain itself.

---

## Client-side gates

`useMateRequestGate.ts` renders the affordance from two fields the server ships
on the conversation:

```ts
mate_request_locked: boolean
mate_request_cooldown_until: string | null
```

Copy is computed from the timestamp with dayjs relative time, so **the client
has no hardcoded durations** — changing the ladder needs no frontend change.

`useRelationshipActions.ts` also handles the 429 from the send route
(`mate_request_cooldown` / `mate_request_locked`) and writes the returned state
back onto the chat. The gate can go stale — the client hides the button when it
knows about a cooldown, but the server is authoritative and the 429 is the
backstop.

---

## Invariants

Read before touching this module:

1. **`users` is always sorted.** Reads and writes must agree, or you create
   duplicate pair documents.
2. **`declines` is monotonic.** Never reset it on a state change.
3. **The ledger is per direction.** Never make a decline block both parties.
4. **`isRepeatMateRequest` runs before `recordMateRequestSent`.**
5. **`action_user_id` is captured before it is cleared** in the decline path.
6. **State transitions that move a counter are compare-and-set.**
7. **Every counter decrement is clamped at 0.**
8. **The decline socket payload carries the requester's fresh gate state.**

---

## Known limitations

- **No global outbound cap on *requests*.** The ladder is per pair, so someone
  can send one request each to hundreds of different users and trip nothing. The
  weekly mate quota bounds how many of those can actually *land* (3/week on
  free), which takes the worst of the mass-blast case off the table, but the
  outbound requests themselves — and the notification each one fires — are still
  unguarded on a per-target basis. A decline-ratio circuit breaker would be the
  industry-standard companion. Deliberately deferred.
- **Pro has no pace limit at all.** Unlimited is the product decision, not an
  oversight, but it does mean the abuse ceiling for a paying account is set
  entirely by the per-pair ladder.
- **No expiry sweeper.** `temporary` → `expired` only materialises on the next
  interaction, so a query filtering on `chat_status: 'temporary'` can match
  pairs whose trial actually lapsed. Anything that cares must also check
  `expires_at` — the network list already does.
- **The 5th decline is a permanent, irreversible per-pair lock.** No mainstream
  platform does this; they rely on the recipient's block instead. Reaching it
  takes four rejections across 1.5+ days, so it is hard to hit by accident, but
  it is unrecoverable from the UI and will eventually be a support request. If
  it becomes one, the smallest fix is to make the last rung repeat (e.g. 30d)
  rather than lock.
- **`stats.*` are denormalised with no reconciliation job.** The audit script is
  manual.
