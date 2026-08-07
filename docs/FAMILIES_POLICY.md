# Families policy — social features for child accounts

Why this exists: Play rejected version code 140 under the "Social Apps & Features"
requirement of the Families policy. The age gate at the time only blocked
*stranger* surfaces (name search, public lobbies, public posts, balloons). Everything
peer-to-peer — adding mates by QR/link, 1:1 chat, sending drawings, shared drawing
rooms — was fully on for under-13 accounts with no adult involvement and no safety
reminder outside the chat panel.

## The three requirements, and where each is met

| Requirement | Implementation |
| --- | --- |
| Safety reminder before exchanging freeform media/info | `useParentalStore().ensureCanExchange(feature)` shows a blocking "Stay safe online" alert that must be acknowledged, re-shown every 30 days. Also restated in `AgeGatedBanner` on home and in the chat overview banner. |
| Adult action before enabling personal-info exchange | Every peer feature is **off by default** on a child account. The switches live behind the adult gate (`presentAdultGate`, mental-math challenge) — a child cannot reach them, so entering the sheet *is* the adult action. Each row states what it enables; there is no second per-toggle confirmation. |
| Adults can manage social features | `ParentalControlsModal` — adult gate → per-feature toggles, an "always off under 13" list, and the birthday correction. Reachable from Settings → Parental Controls, from the home banner, and from every locked surface ("I'm a parent"). |

## Model

`User.parental` (`ParentalControls` in `src/types/server.types.ts`):

- `allow_mate_add`, `allow_mate_chat`, `allow_mate_send`, `allow_rooms` — absent/false
  always means *not allowed*. Never default a missing flag to true.
- `reviewed_at` — an adult opened the controls through the gate.
- `safety_ack_at` — last acknowledgement of the safety reminder (mirrored in
  localStorage so the reminder survives a failed write).

`isUnderAge` in `auth.store` is **default-deny**: an account with no `date_of_birth`
counts as a child account. Anything else leaves a window (guest sign-in, a failed DOB
save, a legacy row) where a possibly-under-13 account has full social access.

## Enforcement points

One call, `ensureCanExchange(feature)`, guards each surface. It returns false when the
caller must not proceed, after showing either the locked notice or the safety reminder.

- `mate_add` — `ConnectionHub` (QR + personal link are hidden entirely when locked, and
  the reminder clears before the code renders), `useRelationshipActions` (request /
  accept mate, accept invite).
- `mate_chat` — `ChatInputFooter.handleSend` and the composer's locked state,
  `ChatWidget.onWillPresent`.
- `mate_send` — `SendHub` mate picker visibility and `executeShares`.
- `rooms` — `socketJoinRoom`, the single choke point every room entry funnels through
  (room menu, chat invite, deep link, push notification), plus `RoomMenu`'s locked view.

Stranger surfaces stay hidden on age alone and have no toggle: name search, public
lobbies, community posts/comments, balloons.

## Server (`sketchmate_server`, separate repo)

`api/services/parental.service.ts` mirrors the client rules — unknown age = child,
missing flag = off — and caches age + flags per user for 30s (invalidated on write).

- `requireChildFeature(feature)` — Koa middleware, 403 `{ error: 'parental_locked',
  feature, message }`. On inbox publish / upload-urls / comment (`mate_send`) and mate
  request (`mate_add`).
- `isFeatureAllowed` — inline on relationship `POST /:id/respond` when the action is
  `accept`. Declining is never gated.
- `checkSocketChildFeature` — `chat:send_message` (`mate_chat`), `join-room` and
  `friend-invite` (`rooms`). Sockets can't run Koa middleware.
- `requireAdultAccount(reason)` — stranger surfaces with no parental override: post
  publish/upload-urls/comment, balloon send/accept. Public lobby joins reject with
  `AGE_RESTRICTED`.
- `sanitizeParental` in `updateUser` — rebuilds the object field by field and writes
  dotted paths, so a payload can't smuggle keys in or blank out flags it didn't name.
  Both timestamps come from the server clock.
- `searchMate` now also excludes accounts with no `date_of_birth`, matching the
  client's default-deny. Balloon candidate filters likewise treat unknown age as child.
