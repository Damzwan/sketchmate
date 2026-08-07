# Moving `app.sketchmate.ninja` from Heroku to Cloudflare Pages

**Status:** PAUSED 2026-08-07 — staying on Heroku for now. Repo side is done
and committed (`public/_headers`, `public/_redirects`); both are inert on Heroku,
so nothing has to be reverted and this can be picked up whenever.

## Read this first — the wrong product blocks you immediately

> `Variables cannot be added to a Worker that only has static assets.`

That error means a **Worker** was created (Workers Static Assets), not a
**Pages** project. They are different products in the same dashboard section.

The message is about **runtime** bindings, and a Worker with no code has no
runtime to bind them to — hence the refusal. But this app never wants runtime
variables. `VITE_*` values are read by Vite **at build time** and compiled into
the JS bundle; by the time anything is served they are already string literals
in the assets. What is needed is a *build* variable, and a static-assets-only
Worker has nowhere to put one.

Fix: create the project via **Workers & Pages → Create → Pages → Connect to
Git**. Pages has first-class build settings — Settings → Environment variables →
Production — which is where the `VITE_*` values below go.

(If Workers is preferred later for edge-function reasons, the equivalent is
Workers Builds' own build variables, which is a different screen from the
runtime bindings that produced the error. Pages is simpler for a pure static
SPA, which is what this is.)

---

## Why this is the low-risk case

The thing being moved is a **subdomain**, and that is the whole difference.

Current DNS (verified 2026-08-07), all served from **name.com** nameservers:

| Record | Points at | After |
|---|---|---|
| `sketchmate.ninja` (apex) | `185.199.108/109/111.153` — GitHub Pages | **untouched** |
| `app.sketchmate.ninja` | `…herokudns.com` — the PWA | → Cloudflare Pages |
| `server.sketchmate.ninja` | `…herokudns.com` — the API | **untouched** |

An **apex** domain on Cloudflare Pages needs Cloudflare's own nameservers
(CNAME flattening — you cannot CNAME an apex). That would mean moving the whole
zone off name.com and re-creating every record, including the ones pointing at
GitHub Pages and the API. That is the migration people call a pain.

None of that applies here. `app.` is a subdomain, so Cloudflare issues the
certificate through domain-control validation and you point **one CNAME** at it
from name.com. Nameservers stay where they are. The API and the marketing site
never learn this happened.

**Rollback is that same one record.** Point the CNAME back at
`concave-gerbil-k03s51t0yh3t7mvh4f2ya0vf.herokudns.com` and you are on Heroku
again. Keep the dyno running until you have decided; it costs one month.

---

## Is Cloudflare Pages the right pick?

For "save money on a static SPA", yes.

- **Cloudflare Pages** — free, **unlimited bandwidth**, brotli, global CDN,
  `_headers`/`_redirects` give the cache control this app needs.
- **Netlify** — nicer DX, but the free tier caps bandwidth at 100 GB/month.
  This app ships ~2.9 MB of compressed assets per cold visitor.
- **Vercel** — the Hobby (free) tier **prohibits commercial use**, and
  SketchMate sells subscriptions. Not eligible; the real comparison is a paid
  plan against Cloudflare's free one.
- **GitHub Pages** — already hosting the apex, and free, but it cannot set
  response headers and has no SPA rewrite. For a PWA that needs `no-cache` on
  `sw.js` and a catch-all rewrite, it is the wrong tool.

One thing to know going in: Cloudflare now steers new projects toward **Workers
Static Assets** rather than Pages, and new investment goes there. Pages is still
supported and is less to learn for a pure static site, so it is the right
starting point — but if you later want an edge function (say, to serve
`apple-app-site-association`), that is the direction to move.

---

## What is already in the repo

`server.js` on Heroku does four things. Cloudflare does three of them for you:

| Job | On Cloudflare |
|---|---|
| HTTPS redirect | Automatic ("Always Use HTTPS") |
| Compression | Automatic, and **brotli** — better than the gzip Express does |
| Static serving / MIME / ranges | Built in |
| Cache-Control per file type | **`public/_headers`** — the one thing you must declare |
| SPA fallback | **`public/_redirects`** |

Both files live in `public/`, so Vite copies them into `dist/` verbatim. Neither
has a file extension, so the service worker's
`globPatterns: ["**/*.{js,css,html,svg}"]` skips them — precache count is
unchanged at 223 entries.

They are inert on Heroku, so they can be committed and deployed **before** the
cutover with no effect.

---

## Steps

### 1. Create the Pages project

Connect the repo in the Cloudflare dashboard (Workers & Pages → Create → Pages →
Connect to Git), production branch `develop`.

Build settings:

| Field | Value |
|---|---|
| Framework preset | None |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Root directory | *(blank)* |

Add build environment variables (Settings → Environment variables → Production):

```
NODE_VERSION            22
VITE_BACKEND            <same as .env>
VITE_FRONTEND           <same as .env>
VITE_VAPID_PUBLIC       <same as .env>
VITE_REVENUECAT_TEST_KEY    <same as .env>
VITE_REVENUECAT_ANDROID_KEY <same as .env>
VITE_MIXPANEL_TOKEN     <same as .env>
VITE_ENVIRONMENT        prod
```

Leave `VITE_DRAW_TESTING` **unset** — setting it to `si` ships source maps.

Every `VITE_*` value is compiled into the client bundle and is readable by
anyone who opens the app. That is true on Heroku today too; none of these are
secrets. Just do not add one that is.

### 2. Verify on `*.pages.dev` before touching DNS

The first build gives you `<project>.pages.dev`. Everything below can be checked
there while production still runs on Heroku:

```bash
curl -sI https://<project>.pages.dev/ | grep -i 'cache-control\|content-encoding'
```

- [ ] App loads and routes
- [ ] `/gallery` returns the app on a **hard refresh**, not a Pages 404
      (this is the `_redirects` rule — confirm it, do not assume it)
- [ ] `/index.html` → `Cache-Control: no-store`
- [ ] `/sw.js` → `Cache-Control: no-cache`
- [ ] `/assets/<hashed>.js` → `max-age=31536000, immutable`
- [ ] `/.well-known/assetlinks.json` → HTTP 200, `Content-Type: application/json`
- [ ] `content-encoding: br` on a JS asset
- [ ] Sign-in works — Firebase Auth authorised domains must include the
      `pages.dev` host for this test, or test auth only after the DNS cutover

### 3. Add the custom domain

Pages project → Custom domains → `app.sketchmate.ninja`. Cloudflare shows a
CNAME target (`<project>.pages.dev`).

### 4. Lower the TTL first, then switch

At name.com, on the `app` CNAME: set TTL to **300 seconds** and wait for the old
TTL to expire before changing the target. Then repoint:

```
app  CNAME  <project>.pages.dev
```

During propagation some users hit Heroku and some hit Cloudflare. Both serve the
same `dist`, so this is harmless — which is exactly why it is worth deploying
the current Heroku build first so the two are identical.

### 5. Post-cutover checks

- [ ] Re-run every curl check from step 2 against `app.sketchmate.ninja`
- [ ] Firebase Console → Authentication → Settings → **Authorized domains**
      still lists `app.sketchmate.ninja` (unchanged, but confirm)
- [ ] **Android App Links**: reinstall the app on a device and open a
      `https://app.sketchmate.ninja/...` link. Android caches the assetlinks
      verification result, so an already-installed app will keep working and
      will not prove anything. Or force it:
      `adb shell pm verify-app-links --re-verify ninja.sketchmate.app`
- [ ] Push notifications (the VAPID/service-worker path) still register on web
- [ ] An existing PWA install updates — the `no-cache` on `sw.js` is what makes
      this work; watch for the update to land rather than assuming it

### 6. Only then, remove the Heroku web dyno

Give it a week. When you are done:

- Delete `server.js`, `Procfile`
- `pnpm remove express compression`
- Drop the `heroku:start` script and the `engines` field if nothing else needs it
- Scale the `app` dyno to 0 **before** deleting anything, so rollback stays cheap

`server.sketchmate.ninja` stays on Heroku throughout. This changes nothing about
the API, and nothing about the Android app, which ships `dist` inside the APK
via `cap sync`.

---

## What this does not solve

Cloudflare serves the same bytes faster and cheaper. It does not make the bundle
smaller — the eager cold-start payload is still 1,124 kB raw / 297 kB gzip, and
P2.5 (the `ion-icon` → `@mdi/js` consolidation) is still the next real win.
