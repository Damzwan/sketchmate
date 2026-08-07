// Static host for the built web app on Heroku.
//
// This serves `dist/` and nothing else — no API, no SSR. The API lives
// elsewhere; the only reason a Node process exists here at all is that Heroku
// has no static-site product.
//
// Three things this file has to get right, because nothing upstream does them:
//
// 1. COMPRESSION. Heroku's router does not compress for you and Vite does not
//    emit pre-compressed assets, so without `compression` here every web
//    visitor downloads the raw bytes. That is ~6.6 MB of assets instead of
//    ~2.9 MB, and it makes the gzip figures in the cold-start budget fiction
//    on web.
//
// 2. CACHE HEADERS PER FILE TYPE. `/assets/*` filenames are content-hashed by
//    Vite and can be cached forever. `index.html` and `sw.js` must NOT be: they
//    are the files that point at the hashed ones, so a cached copy of either
//    pins a user to a deployment whose assets have already been deleted — a
//    white screen that a reload does not fix.
//
// 3. HTTPS. Capacitor deep links and the service worker both require it.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import express from "express";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "dist");

const app = express();

app.disable("x-powered-by");

// Behind Heroku's router, so `req.secure` and the client IP come from
// X-Forwarded-*. Without this the redirect below cannot see the real scheme.
app.set("trust proxy", true);

app.use(compression());

if (process.env.NODE_ENV === "production") {
	app.use((req, res, next) => {
		if (req.secure) return next();
		return res.redirect(301, `https://${req.get("Host")}${req.url}`);
	});
}

// Deep-link association files (assetlinks.json, apple-app-site-association).
// Short cache: these change when app signing or bundle ids change, and a stale
// copy silently breaks deep links on every device that holds it.
app.use(
	"/.well-known",
	express.static(join(dist, ".well-known"), {
		maxAge: "1h",
		setHeaders: (res) => res.type("application/json"),
	}),
);

// Content-hashed by Vite: a given URL's bytes can never change, so this is the
// one place `immutable` is honest.
app.use(
	"/assets",
	express.static(join(dist, "assets"), {
		maxAge: "1y",
		immutable: true,
		index: false,
	}),
);

// SPA fallback. `no-store` rather than `no-cache`: this response body names the
// current build's hashed entry chunk, and serving a stale one is the white
// screen described above.
const serveApp = (_req, res) => {
	res.set("Cache-Control", "no-store");
	res.sendFile(join(dist, "index.html"));
};

// `_headers` and `_redirects` configure Cloudflare Pages (see
// docs/HOSTING_CLOUDFLARE.md). Vite copies them out of public/ into dist/, so
// here they would be publicly fetchable files that mean nothing. Treat them as
// any other unrecognised path and hand back the app.
app.get(["/_headers", "/_redirects"], serveApp);

// Everything else in dist — icons, manifest, sw.js, workbox runtime. Revalidate
// every time: `sw.js` in particular must be re-fetched or an autoUpdate PWA can
// never learn there is a new build.
app.use(
	express.static(dist, {
		index: false,
		setHeaders: (res) => res.set("Cache-Control", "no-cache"),
	}),
);

app.get(/.*/, serveApp);

const port = process.env.PORT || 3000;
app.listen(port, () => {
	console.log(`Serving dist/ on http://localhost:${port}`);
});
