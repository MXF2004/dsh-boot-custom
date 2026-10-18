/**
 * "The application is usable" signal.
 *
 * The host's `__DSH_BOOT_READY__` deferred only means the injected boot state
 * is installed (it resolves at the end of the document parse), so it cannot
 * drive the exit on its own. This module combines:
 *
 *  - the `app/ready` client event when the client runtime emits it;
 *  - a DOM readiness probe over the live slot seats (root populated, the
 *    overlay layer mounted, at least one shell seat present);
 *  - a 4s UI deadline so an unusual layout can never pin the animation open;
 *  - the configured minimum visible time, so a fast machine does not flash.
 *
 * @module dsh-boot-custom/client/boot/ready
 */

import type { Ledger } from '../runtime/ledger.js'

/** Minimal client-context face used to subscribe to `app/ready`. */
export interface ReadyContext {
  on(event: string, listener: (...args: never[]) => void): unknown
}

/** Options for {@link createReadySignal}. */
export interface ReadyOptions {
  /** Effect ledger that owns the probes. */
  ledger: Ledger
  /** Client context (for `app/ready`). */
  ctx: ReadyContext
  /** Minimum time from animation start before the signal may resolve. */
  minVisibleMs: number
  /** Fixed lifetime for a preview run. */
  previewMs?: number
}

/** Handle over the readiness promise. */
export interface ReadySignal {
  readonly promise: Promise<void>
  /** Resolve early (a probe or an external event already proved readiness). */
  markReady(reason: string): void
  /** Stop probing without resolving. */
  dispose(): void
}

/** How long the DOM probe tolerates a layout without the known shell seats. */
const UI_DEADLINE_MS = 4000

/** True when the DOM shows a mounted, navigable shell. */
function domLooksReady(): boolean {
  try {
    if (document.readyState === 'loading') return false
    const root = document.getElementById('root')
    if (root === null || root.childElementCount === 0) return false
    if (document.querySelector('[data-slot="shell.overlay"]') === null) return false
    return (
      document.querySelector('[data-slot="sidebar"]') !== null ||
      document.querySelector('[data-slot="main"]') !== null
    )
  } catch {
    return false
  }
}

/**
 * Create the readiness signal.
 *
 * @param options - ledger, context, minimum visible time and preview lifetime.
 * @returns the promise plus a manual resolver.
 */
export function createReadySignal(options: ReadyOptions): ReadySignal {
  const { ledger, ctx } = options
  const startedAt = performance.now()
  const minVisibleMs = Math.max(0, options.minVisibleMs)
  let settled = false
  let finishTimer = 0
  let resolvePromise: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })

  const finish = (): void => {
    if (settled) return
    settled = true
    resolvePromise()
  }

  /** Resolve once the minimum visible time has elapsed. */
  const scheduleFinish = (): void => {
    if (settled || finishTimer !== 0) return
    const elapsed = performance.now() - startedAt
    const wait = Math.max(0, minVisibleMs - elapsed)
    finishTimer = ledger.timeout(finish, wait)
  }

  if (options.previewMs !== undefined) {
    ledger.timeout(() => finish(), Math.max(0, options.previewMs))
    return {
      promise,
      markReady: () => scheduleFinish(),
      dispose: () => {
        settled = true
      },
    }
  }

  // The authoritative event, when the client runtime emits one.
  try {
    const disposer = ctx.on('app/ready', (() => {
      try {
        scheduleFinish()
      } catch (error) {
        console.warn('[dsh-boot-custom] app/ready handler failed:', error)
      }
    }) as (...args: never[]) => void)
    if (typeof disposer === 'function') {
      ledger.add(disposer as () => void)
    } else if (
      disposer !== null &&
      typeof disposer === 'object' &&
      typeof (disposer as { dispose?: unknown }).dispose === 'function'
    ) {
      const owner = disposer as { dispose: () => void }
      ledger.add(() => owner.dispose())
    }
  } catch {
    // Older client runtimes have no such event; the DOM probe covers it.
  }

  let consecutive = 0
  ledger.interval(() => {
    if (settled) return
    try {
      if (domLooksReady()) consecutive += 1
      else consecutive = 0
      if (consecutive >= 2) {
        scheduleFinish()
        return
      }
      const elapsed = performance.now() - startedAt
      if (elapsed > UI_DEADLINE_MS) scheduleFinish()
    } catch (error) {
      console.warn('[dsh-boot-custom] readiness probe failed:', error)
      scheduleFinish()
    }
  }, 150)

  return {
    promise,
    markReady: () => scheduleFinish(),
    dispose: () => {
      settled = true
    },
  }
}
