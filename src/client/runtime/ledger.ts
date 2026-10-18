/**
 * Effect ledger.
 *
 * Every timer, animation frame, event listener and media element created by
 * one boot run is recorded here and released in reverse order. The controller
 * owns one ledger per run, so a skip, a timeout, a media switch and a preview
 * cycle all clean up through the same idempotent path. Nothing survives a
 * `dispose()`, which is what keeps repeated previews leak-free.
 *
 * @module dsh-boot-custom/client/runtime/ledger
 */

type Disposer = () => void

/** A tiny reverse-order disposer bag. */
export class Ledger {
  private readonly disposers: Disposer[] = []
  private disposed = false

  /** True after {@link dispose}. */
  get isDisposed(): boolean {
    return this.disposed
  }

  /** Record one disposer. Runs immediately when the ledger is already dead. */
  add(dispose: Disposer): void {
    if (this.disposed) {
      safeRun(dispose)
      return
    }
    this.disposers.push(dispose)
  }

  /** Run `callback` later; the timer is cleared on dispose. */
  timeout(callback: () => void, ms: number): number {
    const id = window.setTimeout(() => {
      if (!this.disposed) safeRun(callback)
    }, ms)
    this.add(() => window.clearTimeout(id))
    return id
  }

  /** Run `callback` every `ms`; the interval is cleared on dispose. */
  interval(callback: () => void, ms: number): number {
    const id = window.setInterval(() => {
      if (!this.disposed) safeRun(callback)
    }, ms)
    this.add(() => window.clearInterval(id))
    return id
  }

  /** Schedule one animation frame; cancelled on dispose. */
  frame(callback: (time: number) => void): number {
    let id = 0
    id = window.requestAnimationFrame((time) => {
      if (!this.disposed) safeRun(() => callback(time))
    })
    this.add(() => window.cancelAnimationFrame(id))
    return id
  }

  /** Add an event listener with automatic removal. */
  listen<E extends Event = Event>(
    target: EventTarget,
    type: string,
    handler: (event: E) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler as EventListener, options)
    this.add(() => target.removeEventListener(type, handler as EventListener, options))
  }

  /** Track a media element: pause, release its source and detach on dispose. */
  media(element: HTMLMediaElement): void {
    this.add(() => {
      try {
        element.pause()
        element.removeAttribute('src')
        element.load()
      } catch {
        // Detached or already torn down.
      }
      try {
        element.remove()
      } catch {
        // Not in a document.
      }
    })
  }

  /** Release every recorded effect, newest first. Idempotent. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (let index = this.disposers.length - 1; index >= 0; index -= 1) {
      const dispose = this.disposers[index]
      if (dispose !== undefined) safeRun(dispose)
    }
    this.disposers.length = 0
  }
}

/** Run a disposer, swallowing lifecycle failures. */
export function safeRun(callback: () => void): void {
  try {
    callback()
  } catch (error) {
    console.warn('[dsh-boot-custom] effect cleanup failed:', error)
  }
}
