
// @ts-ignore — scheduling is experimental
const _isInputPending = (): boolean => {
  // @ts-ignore
  if (typeof navigator !== 'undefined' && navigator.scheduling && typeof navigator.scheduling.isInputPending === 'function') {
    // @ts-ignore
    return navigator.scheduling.isInputPending({ includeContinuous: true })
  }
  return false
}

const _isVisible = (): boolean => {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

/**
 * Wait one animation frame. When the tab is hidden, RAF is throttled to 1 Hz
 * or paused entirely — in that case we fall back to a 16ms timeout so
 * background work still progresses.
 */
export function nextFrame(): Promise<void> {
  if (!_isVisible()) {
    return new Promise(resolve => setTimeout(resolve, 16))
  }
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
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
export function yieldToMain(): Promise<void> {
  if (_isInputPending()) return nextFrame()

  // MessageChannel postMessage is the fastest reliable yield. It runs as a
  // task (not microtask), so it allows input/network/etc to interleave, but
  // resolves much faster than setTimeout(0) which gets clamped to 4ms.
  if (typeof MessageChannel !== 'undefined') {
    return new Promise(resolve => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => {
        channel.port1.close()
        resolve()
      }
      channel.port2.postMessage(null)
    })
  }
  return new Promise(resolve => setTimeout(resolve, 0))
}

export interface Yielder {
  /** Reset the frame timer to NOW. Call when starting a new work batch. */
  reset(): void
  /** Returns true if we should yield: budget exhausted OR input pending. */
  shouldYield(): boolean
  /** Yield to the browser. If input pending, waits a full RAF; otherwise quick yield. */
  yield(): Promise<void>
  /** Convenience: shouldYield → yield → reset. */
  maybeYield(): Promise<void>
  /** Force a yield regardless of budget. */
  forceYield(): Promise<void>
}

export interface YielderOptions {
  /** Time budget per frame in ms. Default 8ms (half a 60Hz frame). */
  budgetMs?: number
  /** Signal that aborts pending yields. */
  signal?: AbortSignal
}

/**
 * Create a yielder for a long-running operation. Each operation should have
 * its own yielder so the budget timer is per-operation.
 */
export function createYielder(opts: YielderOptions = {}): Yielder {
  const budgetMs = opts.budgetMs ?? 8
  const signal = opts.signal
  let frameStart = performance.now()

  const shouldYield = () => {
    if (signal?.aborted) return true
    if (_isInputPending()) return true
    return (performance.now() - frameStart) >= budgetMs
  }

  const reset = () => {
    frameStart = performance.now()
  }

  const doYield = async () => {
    // If input is pending, wait a full RAF so the browser actually dispatches
    // input events and paints before we resume. A short yield isn't enough
    // because we'd just re-enter our loop before the input task runs.
    if (_isInputPending()) {
      await nextFrame()
    } else {
      await yieldToMain()
    }
    reset()
  }

  return {
    reset,
    shouldYield,
    yield: doYield,
    maybeYield: async () => {
      if (shouldYield()) await doYield()
    },
    forceYield: doYield
  }
}