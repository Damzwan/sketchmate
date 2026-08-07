/**
 * `navigator.scheduling.isInputPending()` is an experimental Chromium API with
 * no lib.dom typing. Declared here rather than suppressed per-call site: the
 * previous `@ts-expect-error` trio silently covered the wrong lines because the
 * directive only applies to the line that follows it, and the `if` spans four.
 */
interface NavigatorScheduling {
	isInputPending?: (options?: { includeContinuous?: boolean }) => boolean;
}

const _scheduling = (): NavigatorScheduling | undefined =>
	typeof navigator === "undefined"
		? undefined
		: (navigator as Navigator & { scheduling?: NavigatorScheduling })
				.scheduling;

const _isInputPending = (): boolean => {
	const scheduling = _scheduling();
	if (typeof scheduling?.isInputPending !== "function") return false;
	return scheduling.isInputPending({ includeContinuous: true });
};

const _isVisible = (): boolean => {
	return (
		typeof document === "undefined" || document.visibilityState !== "hidden"
	);
};

/**
 * Wait one animation frame. When the tab is hidden, RAF is throttled to 1 Hz
 * or paused entirely — in that case we fall back to a 16ms timeout so
 * background work still progresses.
 */
interface YieldResume {
	at: number;
	label: string;
}

const recentYieldResumes: YieldResume[] = [];
const MAX_YIELD_RESUMES = 256;

function recordYieldResume(label: string): void {
	recentYieldResumes.push({ at: performance.now(), label });
	if (recentYieldResumes.length > MAX_YIELD_RESUMES) recentYieldResumes.shift();
}

/**
 * Resolve a Long Animation Frame script start to the scheduler continuation
 * that began at the same time. Chrome otherwise reports every continuation as
 * the shared `MessagePort.onmessage`, hiding the subsystem that resumed.
 */
export function yieldLabelAt(executionStart: number): string {
	let closest: YieldResume | undefined;
	let closestDistance = Infinity;
	for (let i = recentYieldResumes.length - 1; i >= 0; i--) {
		const resume = recentYieldResumes[i];
		const distance = Math.abs(resume.at - executionStart);
		if (distance < closestDistance) {
			closest = resume;
			closestDistance = distance;
		}
		if (resume.at < executionStart - 10) break;
	}
	return closestDistance <= 3 ? (closest?.label ?? "") : "";
}

export function nextFrame(label = "unattributed"): Promise<void> {
	if (!_isVisible()) {
		return new Promise((resolve) =>
			setTimeout(() => {
				recordYieldResume(label);
				resolve();
			}, 16),
		);
	}
	return new Promise((resolve) =>
		requestAnimationFrame(() => {
			recordYieldResume(label);
			resolve();
		}),
	);
}

/**
 * Quick yield — suitable when you just need the event loop to run one
 * iteration. Uses MessageChannel which is faster than setTimeout and not
 * subject to the 4ms minimum. This is what we want when the user is NOT
 * gesturing — we yield fast and keep working.
 *
 * If input IS pending, we wait a full RAF instead so the browser can dispatch
 * the input event AND repaint before we resume.
 */
function quickTaskYield(label: string): Promise<void> {
	// MessageChannel postMessage is the fastest reliable yield. It runs as a
	// task (not microtask), so it allows input/network/etc to interleave, but
	// resolves much faster than setTimeout(0) which gets clamped to 4ms.
	if (typeof MessageChannel !== "undefined") {
		return new Promise((resolve) => {
			const channel = new MessageChannel();
			channel.port1.onmessage = () => {
				recordYieldResume(label);
				channel.port1.close();
				channel.port2.close();
				resolve();
			};
			channel.port2.postMessage(null);
		});
	}
	return new Promise((resolve) =>
		setTimeout(() => {
			recordYieldResume(label);
			resolve();
		}, 0),
	);
}

export function yieldToMain(label = "unattributed"): Promise<void> {
	if (_isInputPending()) return nextFrame(label);
	return quickTaskYield(label);
}

export interface Yielder {
	/** Reset the frame timer to NOW. Call when starting a new work batch. */
	reset(): void;
	/** Returns true if we should yield: budget exhausted OR input pending. */
	shouldYield(): boolean;
	/** Yield to the browser. If input pending, waits a full RAF; otherwise quick yield. */
	yield(): Promise<void>;
	/** Convenience: shouldYield → yield → reset. */
	maybeYield(): Promise<void>;
	/** Force a yield regardless of budget. */
	forceYield(): Promise<void>;
}

export interface YielderOptions {
	/** Time budget per frame in ms. Default 8ms (half a 60Hz frame). */
	budgetMs?: number;
	/**
	 * Maximum wall time background work may keep resuming through quick task
	 * yields without giving the browser a full animation-frame opportunity.
	 *
	 * `navigator.scheduling.isInputPending()` normally upgrades a quick yield to
	 * RAF as soon as touch input is queued, but that API is absent or reports late
	 * in some Android WebViews. A finite interval is the backstop: quick yields
	 * retain high bake throughput inside the interval, then one RAF lets input,
	 * rendering and compositor work run before the background loop continues.
	 * Omitted = retain the old input-pending-only behaviour.
	 */
	frameYieldIntervalMs?: number;
	/** Signal that aborts pending yields. */
	signal?: AbortSignal;
	/** Stable subsystem name used to attribute resumed long-frame work. */
	label?: string;
}

/**
 * Create a yielder for a long-running operation. Each operation should have
 * its own yielder so the budget timer is per-operation.
 */
export function createYielder(opts: YielderOptions = {}): Yielder {
	const budgetMs = opts.budgetMs ?? 8;
	const frameYieldIntervalMs =
		opts.frameYieldIntervalMs === undefined
			? Infinity
			: Math.max(0, opts.frameYieldIntervalMs);
	const signal = opts.signal;
	const label = opts.label ?? "unattributed";
	let frameStart = performance.now();
	let lastFrameYield = frameStart;

	const shouldYield = () => {
		if (signal?.aborted) return true;
		if (_isInputPending()) return true;
		return performance.now() - frameStart >= budgetMs;
	};

	const reset = () => {
		frameStart = performance.now();
	};

	const doYield = async () => {
		// If input is pending, wait a full RAF so the browser actually dispatches
		// input events and paints before we resume. A short yield isn't enough
		// because we'd just re-enter our loop before the input task runs.
		//
		// Periodically do the same even without a positive isInputPending signal.
		// MessageChannel is excellent for throughput, but an uninterrupted chain of
		// quick continuations can starve touch delivery on affected WebViews. This
		// keeps most yields quick and pays for at most one RAF per configured window.
		if (
			_isInputPending() ||
			performance.now() - lastFrameYield >= frameYieldIntervalMs
		) {
			await nextFrame(label);
			lastFrameYield = performance.now();
		} else {
			// We already made the input/frame decision above. Do not re-check through
			// yieldToMain(): if the answer changed between checks it could take a RAF
			// without advancing lastFrameYield, immediately paying for a second RAF.
			await quickTaskYield(label);
		}
		reset();
	};

	return {
		reset,
		shouldYield,
		yield: doYield,
		maybeYield: async () => {
			if (shouldYield()) await doYield();
		},
		forceYield: doYield,
	};
}
