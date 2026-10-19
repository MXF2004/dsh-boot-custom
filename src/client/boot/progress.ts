/**
 * Loading-progress tracker.
 *
 * Two modes:
 *  - `real`: the ceiling is raised by genuine boot signals — document
 *    readiness, the app root, occupied shell slots, font loading and the
 *    host's injected-state deferred. The displayed value eases toward that
 *    ceiling, so the bar never jumps.
 *  - simulated: a time curve tops out at 94% until the ready signal arrives.
 *
 * Either way the tracker only reports; the controller decides when to exit.
 *
 * @module dsh-boot-custom/client/boot/progress
 */

import type { Ledger } from '../runtime/ledger.js'

/** Progress sink. */
export interface ProgressSink {
  /** Called with a 0..100 value whenever the displayed value moves. */
  onProgress(percent: number): void
  /** Called exactly once when the display reaches 100. */
  onComplete(): void
}

/** Tracker options. */
export interface ProgressOptions {
  /** Bind to real boot signals. */
  real: boolean
  /** Effect ledger owning the rAF/interval. */
  ledger: Ledger
  /** Sink for updates. */
  sink: ProgressSink
}

/** Exponential easing factor per millisecond (real mode). */
const REAL_SPEED = 0.006
/** Exponential easing factor per millisecond (simulated mode). */
const SIM_SPEED = 0.008
/** Simulated curves reach this plateau until the UI reports ready. */
const SIM_CEILING = 94

/**
 * Compute a real-signal ceiling from the live document.
 *
 * Every term is a genuine milestone rather than a delay: the app root only
 * exists after React mounted, slots only exist after their owners declared
 * them, and fonts only resolve after the shell requested them.
 */
function realCeiling(): number {
  let ceiling = 8
  try {
    if (document.readyState !== 'loading') ceiling = 18
    const root = document.getElementById('root')
    if (root !== null && root.childElementCount > 0) ceiling = Math.max(ceiling, 34)
    if (document.querySelector('[data-slot="shell.overlay"]') !== null) ceiling = Math.max(ceiling, 46)
    // Occupied shell seats are the strongest proxy for "the UI is assembling".
    let seats = 0
    for (const key of ['sidebar', 'main', 'conversation', 'rightbar']) {
      if (document.querySelector(`[data-slot="${key}"]`) !== null) seats += 1
    }
    ceiling = Math.max(ceiling, Math.min(72, 48 + seats * 6))
    if (document.readyState === 'complete') ceiling = Math.max(ceiling, 78)
    const fonts = (document as Document & { fonts?: { status?: string } }).fonts
    if (fonts?.status === 'loaded') ceiling = Math.max(ceiling, 86)
    if (globalThis.__BOOT_ANIM_INJECTED_READY__ === true) ceiling = Math.max(ceiling, 92)
  } catch {
    // A probing failure only lowers the ceiling.
  }
  return ceiling
}

/** Smooth, monotonic progress display. */
export class ProgressTracker {
  private readonly ledger: Ledger
  private readonly sink: ProgressSink
  private readonly real: boolean
  private displayed = 0
  private target = 8
  private startedAt = 0
  private lastFrame = 0
  private reported = -1
  private completed = false
  private stopped = false
  private rafId = 0

  /**
   * @param options - real/simulated choice, owning ledger and sink.
   */
  constructor(options: ProgressOptions) {
    this.ledger = options.ledger
    this.sink = options.sink
    this.real = options.real
  }

  /** Start the animation loop. */
  start(): void {
    if (this.startedAt !== 0) return
    this.startedAt = performance.now()
    this.lastFrame = this.startedAt
    this.displayed = 2
    this.target = this.real ? 8 : 6
    this.report(2)
    this.rafId = window.requestAnimationFrame(this.tick)
    this.ledger.add(() => window.cancelAnimationFrame(this.rafId))
    if (this.real) {
      this.ledger.interval(() => {
        this.raise(realCeiling())
      }, 180)
    }
  }

  /** Raise the ceiling (monotonic). */
  raise(percent: number): void {
    if (this.stopped || this.completed) return
    if (!Number.isFinite(percent)) return
    this.target = Math.max(this.target, Math.min(99.5, Math.max(0, percent)))
  }

  /** Drive the display to 100% (called when the UI is ready). */
  complete(): void {
    if (this.stopped || this.completed) return
    this.target = 100
  }

  /** The last reported value. */
  get percent(): number {
    return this.displayed
  }

  /** Stop the loop. Safe to call repeatedly. */
  stop(): void {
    this.stopped = true
    if (this.rafId !== 0) {
      try {
        window.cancelAnimationFrame(this.rafId)
      } catch {
        // Window already torn down.
      }
      this.rafId = 0
    }
  }

  /** One animation frame of easing. */
  private readonly tick = (now: number): void => {
    if (this.stopped) return
    if (this.completed) return
    const delta = Math.max(0, Math.min(80, now - this.lastFrame))
    this.lastFrame = now
    if (!this.real) {
      const elapsed = now - this.startedAt
      this.target = Math.max(
        this.target,
        Math.min(SIM_CEILING, 6 + (elapsed / 2600) * (SIM_CEILING - 6)),
      )
    }
    const speed = this.real ? REAL_SPEED : SIM_SPEED
    const factor = Math.min(0.85, delta * speed)
    this.displayed += (this.target - this.displayed) * factor
    // Snap tiny asymptotic remainders once the target is the finish line.
    if (this.target >= 99.9 && this.displayed > 99.4) this.displayed = 100
    this.report(this.displayed)
    if (this.displayed >= 100) {
      this.completed = true
      this.sink.onComplete()
      return
    }
    this.rafId = window.requestAnimationFrame(this.tick)
  }

  /** Emit only meaningful changes. */
  private report(value: number): void {
    const rounded = Math.round(value * 10) / 10
    if (rounded === this.reported) return
    this.reported = rounded
    try {
      this.sink.onProgress(rounded)
    } catch (error) {
      console.warn('[dsh-boot-custom] progress sink failed:', error)
    }
  }
}

/** Augment the global for the injected-state flag (set by the controller). */
declare global {
  var __BOOT_ANIM_INJECTED_READY__: boolean | undefined
}
