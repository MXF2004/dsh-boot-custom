/**
 * Video playback layer.
 *
 * Exactly one `<video>` element exists at a time: the selected source gets
 * `preload="auto"`, every other entry in the list stays a plain string. On a
 * switch (load failure, or falling back to the CSS animation) the old element
 * is paused, its `src` removed and `load()` called so the decoder is released
 * before it leaves the DOM.
 *
 * @module dsh-boot-custom/client/boot/video
 */

import { sourceLabel, toMediaUrl } from '../../shared/config.js'
import type { BootAnimationConfig } from '../../shared/types.js'
import type { Ledger } from '../runtime/ledger.js'

/** Callbacks the controller supplies. */
export interface VideoLayerCallbacks {
  /** The current element produced a first frame. */
  onReady(video: HTMLVideoElement): void
  /** Every source failed; the caller must show the CSS fallback. */
  onExhausted(reason: string): void
  /** The current element ended naturally (last frame stays visible). */
  onEnded(): void
  /** Autoplay with sound was refused; the layer muted itself and retried. */
  onAutoplayBlocked?(): void
}

/** Time allowed between `load()` and the first playable frame. */
const READY_TIMEOUT_MS = 9000

/** One video element with sequential failure fallback. */
export class VideoLayer {
  private readonly container: HTMLElement
  private readonly ledger: Ledger
  private readonly callbacks: VideoLayerCallbacks
  private config: BootAnimationConfig
  private element: HTMLVideoElement | null = null
  private currentCleanup: (() => void) | null = null
  private sources: string[] = []
  private cursor = 0
  private attempts = 0
  private disposed = false
  private muted = true

  /**
   * @param container - media layer element.
   * @param config - normalized configuration.
   * @param ledger - run ledger.
   * @param callbacks - readiness / failure / end sinks.
   */
  constructor(
    container: HTMLElement,
    config: BootAnimationConfig,
    ledger: Ledger,
    callbacks: VideoLayerCallbacks,
  ) {
    this.container = container
    this.config = config
    this.ledger = ledger
    this.callbacks = callbacks
  }

  /** Begin playing `sources[cursor]`, falling through the list on failure. */
  start(sources: string[], cursor: number): void {
    this.sources = [...sources]
    this.cursor = this.sources.length === 0 ? 0 : Math.max(0, cursor) % this.sources.length
    this.attempts = 0
    if (this.sources.length === 0) {
      this.callbacks.onExhausted('no sources configured')
      return
    }
    this.loadCurrent()
  }

  /** Apply a playback-rate change immediately and remember it for switches. */
  setRate(rate: number): void {
    this.config = { ...this.config, playing: { ...this.config.playing, rate } }
    if (this.element !== null) {
      try {
        this.element.playbackRate = rate
      } catch {
        // Out-of-range values are impossible after normalization.
      }
    }
  }

  /** Apply a volume change to the current element. */
  setVolume(volume: number): void {
    if (this.element !== null) {
      try {
        this.element.volume = Math.min(1, Math.max(0, volume))
      } catch {
        // Some platforms freeze volume on muted elements.
      }
    }
  }

  /** Mute or unmute the current element. */
  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.element !== null) {
      try {
        this.element.muted = muted
      } catch {
        // Keep the previous state.
      }
    }
  }

  /** The live element, when one is playing. */
  video(): HTMLVideoElement | null {
    return this.element
  }

  /** Release the current element and every tracked media resource. */
  dispose(): void {
    this.disposed = true
    this.currentCleanup?.()
    this.currentCleanup = null
    this.element = null
  }

  /** Load one source into a fresh element. */
  private loadCurrent(): void {
    if (this.disposed) return
    const source = this.sources[this.cursor]
    if (source === undefined) {
      this.callbacks.onExhausted('source list exhausted')
      return
    }
    this.currentCleanup?.()
    this.currentCleanup = null

    let video: HTMLVideoElement
    try {
      video = document.createElement('video')
    } catch (error) {
      console.warn('[dsh-boot-custom] video element could not be created:', error)
      this.callbacks.onExhausted('video element unavailable')
      return
    }

    video.preload = 'auto'
    video.autoplay = true
    video.playsInline = true
    video.controls = false
    video.muted = this.muted
    try {
      video.playbackRate = this.config.playing.rate
      video.volume = 1
    } catch {
      // Ignore: rate is re-applied on metadata.
    }
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.setAttribute('aria-hidden', 'true')
    video.tabIndex = -1

    const controller = new AbortController()
    let settled = false
    let failed = false
    let timer = 0

    const release = (): void => {
      window.clearTimeout(timer)
      controller.abort()
      try {
        video.pause()
        video.removeAttribute('src')
        video.load()
      } catch {
        // Element already detached.
      }
      try {
        video.remove()
      } catch {
        // Not in a document.
      }
    }

    const fail = (reason: string): void => {
      if (settled || failed) return
      failed = true
      settled = true
      release()
      if (this.element === video) this.element = null
      this.currentCleanup = null
      this.tryNext(`video failed (${reason})`)
    }

    timer = window.setTimeout(() => {
      if (!settled) fail('first frame timed out')
    }, READY_TIMEOUT_MS)

    const markReady = (): void => {
      if (settled || failed) return
      settled = true
      window.clearTimeout(timer)
      try {
        video.playbackRate = this.config.playing.rate
      } catch {
        // Ignore.
      }
      try {
        this.element = video
        this.callbacks.onReady(video)
      } catch (error) {
        console.warn('[dsh-boot-custom] video ready callback failed:', error)
      }
    }

    video.addEventListener('loadeddata', markReady, { signal: controller.signal })
    video.addEventListener('canplay', markReady, { signal: controller.signal })
    video.addEventListener('playing', markReady, { signal: controller.signal })
    video.addEventListener(
      'error',
      () => {
        const code = video.error?.code
        fail(code === undefined ? 'media error' : `media error ${String(code)}`)
      },
      { signal: controller.signal },
    )
    video.addEventListener(
      'ended',
      () => {
        if (this.element === video) {
          try {
            this.callbacks.onEnded()
          } catch (error) {
            console.warn('[dsh-boot-custom] video end callback failed:', error)
          }
        }
      },
      { signal: controller.signal },
    )

    this.currentCleanup = release
    this.ledger.add(release)
    this.element = video
    try {
      video.src = toMediaUrl(source)
      this.container.appendChild(video)
      video.load()
      const play = video.play()
      if (play !== undefined && typeof play.catch === 'function') {
        play.catch((error: unknown) => {
          // Autoplay with sound is often refused. Muting and retrying keeps the
          // animation alive instead of treating it as a media failure.
          const name = error instanceof Error ? error.name : ''
          if (name === 'NotAllowedError' && !video.muted) {
            try {
              video.muted = true
              this.muted = true
              this.callbacks.onAutoplayBlocked?.()
              void video.play().catch(() => fail('autoplay refused'))
              return
            } catch {
              // Fall through to the failure path.
            }
          }
          if (name === 'NotAllowedError' || name === 'AbortError') {
            // AbortError is expected when a switch tears the element down.
            if (name === 'AbortError') return
          }
          console.warn(`[dsh-boot-custom] playback rejected for ${sourceLabel(source)}:`, error)
          fail('playback rejected')
        })
      }
    } catch (error) {
      console.warn(`[dsh-boot-custom] video could not be attached (${sourceLabel(source)}):`, error)
      fail('attach failed')
    }
  }

  /** Move to the next configured source, or report exhaustion. */
  private tryNext(reason: string): void {
    if (this.disposed) return
    this.attempts += 1
    if (this.attempts >= this.sources.length) {
      console.warn(`[dsh-boot-custom] every video source failed; using the CSS fallback (${reason})`)
      this.callbacks.onExhausted(reason)
      return
    }
    this.cursor = (this.cursor + 1) % this.sources.length
    console.warn(
      `[dsh-boot-custom] switching to the next video source (${reason}); ` +
        `${String(this.attempts)}/${String(this.sources.length)} failed`,
    )
    this.loadCurrent()
  }
}
