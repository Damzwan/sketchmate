// deviceProfile.ts
//
// What KIND of device is this, in the two dimensions the ANR reports actually
// discriminate on: the GPU, and whether Android itself considers the device
// low-memory.
//
// WHY THIS EXISTS
//
// The draw engine picks its render DPR and tile budget from
// `navigator.hardwareConcurrency` and `navigator.deviceMemory`. Both are weak
// proxies. `deviceMemory` is quantised to powers of two and clamped at 8, and
// an octa-core Cortex-A53 reports the same `hardwareConcurrency` as a flagship.
// Neither says anything about the GPU — and the 0.4.4 ANR cluster
// (`libIMGegl.so KEGLGetDrawableParameters` + "Unresponsive GPU" + native lock
// contention) implicates Imagination's EGL path, not the Adreno cohort the
// earlier work was tuned against. It does not, by itself, identify a specific
// GPU model, device-memory tier, or one universal root cause.
//
// WebView rendering is integrated with the app window's HWUI pipeline. A GPU
// or RenderThread stall can therefore keep the UI thread from completing a
// frame and dispatching input. That makes "which GPU" a useful render-policy
// and telemetry input, while full Play Console traces remain the source of
// truth for any individual ANR.
//
// TWO SIGNALS
//
//   1. `WEBGL_debug_renderer_info` → "PowerVR Rogue GE8320". Available in the
//      WebView, costs one throwaway WebGL context.
//   2. `ActivityManager.isLowRamDevice()` plus physical/advertised RAM, forwarded
//      by MainActivity. These are platform-level memory signals for which no
//      equivalent high-fidelity JS API exists.
//
// WHY IT IS PERSISTED RATHER THAN READ LIVE
//
// Both signals are asynchronous or non-trivial to obtain (a WebGL context, a
// native round trip), but the values they feed — `MAX_RENDER_SCALE`, the memory
// profile — are resolved ONCE, synchronously, while the
// canvas is being constructed, and must not change mid-session (see
// `renderQuality.config.ts`). So the profile is written to `localStorage` when
// it is learned and read back synchronously on every later boot. The first
// session on a new install runs on the old CPU/memory heuristics; every session
// after it runs on the real device class.
//
// This module must stay free of app dependencies (no router, no stores, no
// fabric): it is read during canvas construction and during app bootstrap.

const STORAGE_KEY = "device_profile_v1";

export type GpuClass = "weak" | "ok" | "unknown";

export interface DeviceProfile {
	/** Raw `UNMASKED_RENDERER_WEBGL`, kept verbatim for telemetry. */
	gpu?: string;
	gpuClass: GpuClass;
	/** `ActivityManager.isLowRamDevice()`. Undefined until native reports it. */
	lowRam?: boolean;
	totalMemMB?: number;
	/** Active Android WebView provider/build, for field correlation only. */
	webViewPackage?: string;
	webViewVersion?: string;
}

/**
 * Android's advertised 3 GB tier, with a little OEM/reporting tolerance.
 *
 * `MemoryInfo.totalMem` excludes fixed reservations on older Android releases,
 * so a retail 3 GB device can report below 3072 MB. Conversely a 4 GB device
 * remains comfortably above this ceiling. This catches the 8-core/3-GB phones
 * that `navigator.deviceMemory` commonly rounds into the 4 GB bucket.
 */
export const SEVERE_PHYSICAL_MEMORY_MAX_MB = 3_200;

export function isSeverelyMemoryConstrained(
	totalMemMB: number | null | undefined,
): boolean {
	return (
		typeof totalMemMB === "number" &&
		Number.isFinite(totalMemMB) &&
		totalMemMB > 0 &&
		totalMemMB <= SEVERE_PHYSICAL_MEMORY_MAX_MB
	);
}

const UNKNOWN: DeviceProfile = { gpuClass: "unknown" };

/**
 * GPU families that cannot absorb the tile pipeline's texture traffic.
 *
 * Deliberately a family/generation match rather than an exact model list: these
 * are the budget parts that ship in 2 GB Android phones and the naming is
 * stable enough to match on, while an exact list goes stale every year.
 *
 *   • PowerVR — includes older and lower-end Android families (SGX, Rogue GE
 *     variants and BXM). The weak class is only promoted to the severe tier in
 *     combination with the memory predicates below.
 *   • Mali-4xx / Mali-T* — pre-Bifrost, universally slow.
 *   • Mali-G31 / G51 / G52 — the entry Bifrost/Valhall tier. G57 and above are
 *     deliberately excluded: they ship in capable mid-range parts and demoting
 *     them would cost resolution on devices that do not ANR.
 *   • Adreno below 600 — 2xx/3xx/4xx/5xx.
 *
 * Anything unrecognised is NOT treated as weak: a false positive costs every
 * user on an unknown-but-capable GPU real resolution, and the CPU/memory
 * heuristics still catch genuinely small devices on their own.
 */
export function classifyGpuRenderer(
	renderer: string | null | undefined,
): GpuClass {
	if (!renderer) return "unknown";
	const r = renderer.toLowerCase();

	if (r.includes("powervr")) return "weak";
	if (/mali-?\s?4\d{2}/.test(r)) return "weak";
	if (/mali-?\s?t\d{3}/.test(r)) return "weak";
	if (/mali-?\s?g(31|51|52)\b/.test(r)) return "weak";

	const adreno = /adreno[^\d]*(\d{3})/.exec(r);
	if (adreno) {
		const model = Number(adreno[1]);
		if (Number.isFinite(model) && model < 600) return "weak";
	}

	// Software rasterizers: SwiftShader/llvmpipe mean there is no GPU at all,
	// which is the same policy answer as a weak one.
	if (r.includes("swiftshader") || r.includes("llvmpipe")) return "weak";

	return "ok";
}

/** Merge semantics for a partial update, kept pure so persistence is testable. */
export function mergeDeviceProfile(
	current: DeviceProfile,
	update: Partial<DeviceProfile>,
): DeviceProfile {
	const next: DeviceProfile = { ...current };
	if (update.gpu !== undefined) next.gpu = update.gpu;
	// Never let a later "unknown" erase a class we already learned.
	if (update.gpuClass !== undefined && update.gpuClass !== "unknown") {
		next.gpuClass = update.gpuClass;
	}
	if (update.lowRam !== undefined) next.lowRam = update.lowRam;
	if (update.totalMemMB !== undefined) next.totalMemMB = update.totalMemMB;
	if (update.webViewPackage !== undefined)
		next.webViewPackage = update.webViewPackage;
	if (update.webViewVersion !== undefined)
		next.webViewVersion = update.webViewVersion;
	return next;
}

function readStored(): DeviceProfile {
	if (typeof localStorage === "undefined") return UNKNOWN;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return UNKNOWN;
		const parsed = JSON.parse(raw) as DeviceProfile;
		if (!parsed || typeof parsed !== "object") return UNKNOWN;
		return {
			gpu: typeof parsed.gpu === "string" ? parsed.gpu : undefined,
			gpuClass:
				parsed.gpuClass === "weak" || parsed.gpuClass === "ok"
					? parsed.gpuClass
					: "unknown",
			lowRam: typeof parsed.lowRam === "boolean" ? parsed.lowRam : undefined,
			totalMemMB:
				typeof parsed.totalMemMB === "number" ? parsed.totalMemMB : undefined,
			webViewPackage:
				typeof parsed.webViewPackage === "string"
					? parsed.webViewPackage
					: undefined,
			webViewVersion:
				typeof parsed.webViewVersion === "string"
					? parsed.webViewVersion
					: undefined,
		};
	} catch {
		// A corrupt or unreadable profile must never stop the app from starting.
		return UNKNOWN;
	}
}

function writeStored(profile: DeviceProfile): void {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
	} catch {
		/* private mode / quota — the app runs on the live value for this session */
	}
}

/**
 * The profile as it stood when this module was first imported.
 *
 * Frozen for the session ON PURPOSE. `renderQuality.config` and the memory
 * profile derive session-long constants from it, and a value that changed
 * halfway through would desync the canvas backing store from the composite
 * transform. Updates land in storage and take effect on the next launch.
 */
let sessionProfile: DeviceProfile = readStored();

/** The session's device profile. Stable for the whole session. */
export function deviceProfile(): DeviceProfile {
	return sessionProfile;
}

/** True when Android itself, or the GPU string, says this is a small device. */
export const IS_WEAK_GPU_DEVICE = sessionProfile.gpuClass === "weak";
export const IS_LOW_RAM_DEVICE = sessionProfile.lowRam === true;

/**
 * Record what we have learned, for the NEXT launch.
 *
 * The live `sessionProfile` is updated too, but only so telemetry reports what
 * was actually measured rather than last launch's copy — nothing derives render
 * constants from it after start-up.
 */
export function updateDeviceProfile(update: Partial<DeviceProfile>): void {
	const next = mergeDeviceProfile(sessionProfile, update);
	if (
		next.gpu === sessionProfile.gpu &&
		next.gpuClass === sessionProfile.gpuClass &&
		next.lowRam === sessionProfile.lowRam &&
		next.totalMemMB === sessionProfile.totalMemMB &&
		next.webViewPackage === sessionProfile.webViewPackage &&
		next.webViewVersion === sessionProfile.webViewVersion
	) {
		return;
	}
	sessionProfile = next;
	writeStored(next);
}

let probed = false;

/** A stable renderer string never needs a fresh EGL context on every launch. */
export function shouldProbeGpu(profile: DeviceProfile): boolean {
	return !profile.gpu || profile.gpuClass === "unknown";
}

/**
 * Read the GPU string once and remember it.
 *
 * Costs one WebGL context, which is why it is explicit and idempotent rather
 * than lazy behind a getter: the caller decides when to spend it (idle time
 * after boot), never the render path. The context is released immediately —
 * a retained one is an EGL surface on a device that has few to spare.
 */
export function probeGpuRenderer(): string | null {
	if (probed) return sessionProfile.gpu ?? null;
	probed = true;
	// Creating and explicitly losing a WebGL context is itself EGL lifecycle
	// traffic. The GPU cannot change underneath an installed Android app, so once
	// a useful renderer is persisted, reuse it instead of repeating that work on
	// every cold start — especially on the driver cohort this probe is meant to
	// identify.
	if (!shouldProbeGpu(sessionProfile)) return sessionProfile.gpu ?? null;
	if (typeof document === "undefined") return null;

	let canvas: HTMLCanvasElement | null = null;
	let gl: WebGLRenderingContext | null = null;
	try {
		canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		gl = (canvas.getContext("webgl", {
			// A probe never draws, so refuse nothing and keep the allocation minimal.
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			preserveDrawingBuffer: false,
			failIfMajorPerformanceCaveat: false,
		}) ??
			canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
		if (!gl) return null;

		const ext = gl.getExtension("WEBGL_debug_renderer_info");
		const renderer = ext
			? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string)
			: (gl.getParameter(gl.RENDERER) as string);
		if (typeof renderer !== "string" || !renderer) return null;

		updateDeviceProfile({
			gpu: renderer,
			gpuClass: classifyGpuRenderer(renderer),
		});
		return renderer;
	} catch {
		// Blocked extension, lost context, no GL at all — the CPU/memory
		// heuristics stand on their own.
		return null;
	} finally {
		try {
			gl?.getExtension("WEBGL_lose_context")?.loseContext();
		} catch {
			/* nothing to release */
		}
		if (canvas) {
			canvas.width = 0;
			canvas.height = 0;
		}
	}
}

export const NATIVE_DEVICE_PROFILE_EVENT = "nativeDeviceProfile";

interface NativeDeviceProfileDetail {
	lowRam?: boolean;
	totalMemMB?: number;
	webViewPackage?: string;
	webViewVersion?: string;
}

let nativeListener: ((event: Event) => void) | null = null;

/**
 * Listen for MainActivity's one-shot device report.
 *
 * Same `triggerWindowJSEvent` convention as `nativeImeInset` and
 * `nativeTrimMemory` — a Capacitor plugin listener would need a whole plugin
 * class to carry two fields.
 */
export function installNativeDeviceProfileBridge(): void {
	if (nativeListener || typeof window === "undefined") return;
	nativeListener = (event: Event) => {
		const detail = (event as CustomEvent<NativeDeviceProfileDetail>).detail;
		if (!detail) return;
		updateDeviceProfile({
			lowRam: typeof detail.lowRam === "boolean" ? detail.lowRam : undefined,
			totalMemMB:
				typeof detail.totalMemMB === "number" ? detail.totalMemMB : undefined,
			webViewPackage:
				typeof detail.webViewPackage === "string" && detail.webViewPackage
					? detail.webViewPackage
					: undefined,
			webViewVersion:
				typeof detail.webViewVersion === "string" && detail.webViewVersion
					? detail.webViewVersion
					: undefined,
		});
	};
	window.addEventListener(NATIVE_DEVICE_PROFILE_EVENT, nativeListener);
}
