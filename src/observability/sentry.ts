import * as Sentry from "@sentry/capacitor";
import * as SentryVue from "@sentry/vue";
import type { App as VueApp } from "vue";

const IS_PROD = import.meta.env.VITE_ENVIRONMENT === "prod";
export const IS_DRAW_TESTING = import.meta.env.VITE_DRAW_TESTING === "si";

let sentryInitialized = false;

export function initSentry(app: VueApp) {
	if (sentryInitialized) return;
	sentryInitialized = true;
	const environment = import.meta.env.VITE_ENVIRONMENT || "development";
	const integrations: any[] = [
		Sentry.browserTracingIntegration({
			enableLongTask: true,
			enableLongAnimationFrame: true,
		}),
	];
	if (IS_DRAW_TESTING) {
		// Browser profiling is a safe no-op when Android WebView does not expose
		// the JS Self-Profiling API. Keeping it diagnostic-only avoids production
		// profiling overhead and quota use.
		integrations.push(SentryVue.browserProfilingIntegration());
	}

	Sentry.init(
		{
			dsn: "https://bb1ec4b0dc787509006ffeb476017518@o4511837030711296.ingest.de.sentry.io/4511837041328208",
			siblingOptions: {
				vueOptions: {
					app,
					attachErrorHandler: true,
					// Component props may contain drawing/chat data and can be large.
					attachProps: false,
				},
			},
			integrations,
			// ── native crash / ANR reporting ───────────────────────────────────
			//
			// The failures that are killing the Play ranking are NOT JS errors:
			// they are ANRs (captured post-mortem by the native SDK out of
			// `ApplicationExitInfo`) and `libGLESv2_adreno` / `libgsl` SIGSEGVs
			// (captured by the NDK handler). The JS layer cannot observe either.
			//
			// `enableNdkScopeSync` defaults to FALSE, and without it everything the
			// draw engine writes with `Sentry.setContext` / `setTag` stays on the JS
			// side only — so a native crash report arrives with no idea how many
			// tiles were resident, which backend was running, or what phase was
			// last executing. That is precisely the information the report exists
			// to carry. See src/draw/diagnostics/drawDiagnostics.ts.
			enableNdkScopeSync: true,
			// ANR triage needs to know WHICH thread was blocked and on what; without
			// this an ANR event carries only the main thread's stack.
			attachThreads: true,
			attachStacktrace: true,
			// ANR reports are delivered on the NEXT app start, so the breadcrumb
			// trail from the session that died is the whole story. The default (100)
			// is easily exhausted by a long drawing session before the stall.
			maxBreadcrumbs: 200,
			tracesSampleRate: IS_DRAW_TESTING ? 1.0 : IS_PROD ? 0.1 : 1.0,
			profileSessionSampleRate: IS_DRAW_TESTING ? 1.0 : 0,
			profileLifecycle: "trace",
			// The API does not yet accept Sentry trace headers in CORS preflights.
			tracePropagationTargets: [],
			enableLogs: true,
			debug: !IS_PROD || IS_DRAW_TESTING,
			environment: IS_DRAW_TESTING
				? `${environment}-draw-testing`
				: environment,
		} as any,
		SentryVue.init,
	);
	Sentry.setTag("draw.testing", IS_DRAW_TESTING);
}
