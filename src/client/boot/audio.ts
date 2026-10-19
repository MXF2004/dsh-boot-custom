/**
 * Audio layer.
 *
 * Two sources share one controller:
 *  - `video`: the element's own track drives the sound, so sync is exact;
 *  - `custom`: a detached `Audio` object plays the selected file alongside the
 *    video, following its play/pause/seek/end events.
 *
 * Autoplay policy is respected at every step: when the browser refuses sound
 * the controller reports `blocked`, the caller mutes the video and the
 * animation keeps playing silently. A failed audio load is never fatal.
 *
 * @module dsh-boot-custom/client/boot/audio
 */

import { toMediaUrl } from '../../shared/config.js'
import type { BootAnimationConfig } from '../../shared/types.js'
import type { Ledger } from '../runtime/ledger.js'

/** Fade length in milliseconds. */
const FADE_MS = 420
/** Fade-out window before the media ends, in seconds. */
const FADE_OUT_WINDOW_S = 1.2

/** Volume ramp handle. */
interface Ramp {
  cancel(): void
}

/** Audio output for one boot run. */
export class AudioController {
  private readonly ledger: Ledger
  private config: BootAnimationConfig
  private audio: HTMLAudioElement | null = null
  private video: HTMLVideoElement | null = null
  private videoAbort: AbortController | null = null
  private ramp: Ramp | null = null
  private fadeOutStarted = false
  private disposed = false
  /** True when the platform refused audible playback. */
  blocked = false
  /** True when the custom file failed to load (the animation continues muted). */
  failed = false
  /** True while audio is wanted and running. */
  active = false

  /**
   * @param config - normalized configuration.
   * @param ledger - run ledger.
   */
  constructor(config: BootAnimationConfig, ledger: Ledger) {
    this.config = config
    this.ledger = ledger
  }

  /** Whether this run wants any audio at all. */
  get enabled(): boolean {
    return this.config.audio.enabled && this.config.audio.volume > 0
  }

  /** Whether the video element must stay muted (custom audio or disabled). */
  get wantsVideoMuted(): boolean {
    return !this.enabled || this.config.audio.source === 'custom'
  }

  /** Bind the live video element and wire sync events. */
  attachVideo(video: HTMLVideoElement | null): void {
    this.videoAbort?.abort()
    this.videoAbort = null
    this.video = video
    if (video === null || this.disposed) return
    const controller = new AbortController()
    this.videoAbort = controller
    const signal = controller.signal
    video.addEventListener('play', () => void this.resume(), { signal })
    video.addEventListener('pause', () => this.pause(), { signal })
    video.addEventListener('ended', () => this.finish(), { signal })
    video.addEventListener(
      'seeked',
      () => {
        if (this.audio !== null && Number.isFinite(video.currentTime)) {
          try {
            this.audio.currentTime = video.currentTime
          } catch {
            // Seeking before metadata is ready.
          }
        }
      },
      { signal },
    )
    video.addEventListener('timeupdate', () => this.watchEnd(video), { signal })
  }

  /** Begin audio (called once the video produced a frame, or immediately). */
  start(): void {
    if (!this.enabled || this.disposed) {
      this.active = false
      return
    }
    if (this.config.audio.source === 'custom') {
      // Idempotent: the caller starts custom audio immediately in CSS mode and
      // again from the video-ready path in video mode.
      if (this.audio !== null || this.failed) return
      this.startCustom()
      return
    }
    const video = this.video
    if (video === null) {
      this.active = false
      return
    }
    this.active = true
    try {
      video.muted = false
      const target = this.targetVolume()
      video.volume = 0
      this.rampVolume(
        (value) => {
          try {
            video.volume = value
          } catch {
            // Volume control may be frozen.
          }
        },
        target,
      )
    } catch (error) {
      console.warn('[dsh-boot-custom] video audio could not be enabled:', error)
      this.blocked = true
      this.active = false
    }
  }

  /** Pause the custom track (video pause mirrors into it). */
  pause(): void {
    if (this.audio === null) return
    try {
      this.audio.pause()
    } catch {
      // Ignore.
    }
  }

  /** Resume the custom track. */
  async resume(): Promise<void> {
    if (this.config.audio.source !== 'custom' || this.audio === null || !this.enabled || this.disposed) return
    try {
      await this.audio.play()
      this.active = true
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      if (name === 'NotAllowedError') {
        this.blocked = true
        console.warn('[dsh-boot-custom] custom audio was blocked by the autoplay policy; continuing silently')
      } else if (name !== 'AbortError') {
        console.warn('[dsh-boot-custom] custom audio could not play:', error)
      }
      this.active = false
    }
  }

  /** Stop all audio and release the custom element. */
  finish(): void {
    this.ramp?.cancel()
    this.ramp = null
    if (this.audio !== null) {
      try {
        this.audio.pause()
      } catch {
        // Ignore.
      }
    }
    this.active = false
  }

  /** Apply a new volume (0..100) immediately. */
  setVolume(volume: number): void {
    this.config = {
      ...this.config,
      audio: { ...this.config.audio, volume: Math.min(100, Math.max(0, volume)) },
    }
    if (this.config.audio.source === 'video' && this.video !== null) {
      try {
        this.video.volume = this.targetVolume()
      } catch {
        // Ignore.
      }
    }
    if (this.audio !== null) {
      try {
        this.audio.volume = this.targetVolume()
      } catch {
        // Ignore.
      }
    }
  }

  /** The platform refused sound: keep the video muted from now on. */
  markBlocked(): void {
    this.blocked = true
    this.active = false
    if (this.video !== null) {
      try {
        this.video.muted = true
      } catch {
        // Ignore.
      }
    }
    this.pause()
  }

  /** Release every audio resource. */
  dispose(): void {
    this.disposed = true
    this.finish()
    this.videoAbort?.abort()
    this.videoAbort = null
    if (this.audio !== null) {
      try {
        this.audio.removeAttribute('src')
        this.audio.load()
      } catch {
        // Ignore.
      }
      this.audio = null
    }
  }

  /** Create and start the custom audio element. */
  private startCustom(): void {
    const file = this.config.audio.file
    if (file.length === 0) {
      this.failed = true
      this.active = false
      return
    }
    try {
      const audio = new Audio()
      audio.preload = 'auto'
      audio.loop = false
      audio.volume = 0
      const controller = new AbortController()
      audio.addEventListener(
        'error',
        () => {
          this.failed = true
          this.active = false
          console.warn('[dsh-boot-custom] custom audio failed to load; continuing muted')
          this.finish()
        },
        { signal: controller.signal },
      )
      audio.addEventListener(
        'loadedmetadata',
        () => {
          const video = this.video
          if (video !== null && Number.isFinite(video.currentTime)) {
            try {
              audio.currentTime = video.currentTime
            } catch {
              // Non-seekable source.
            }
          }
        },
        { signal: controller.signal },
      )
      this.audio = audio
      this.ledger.add(() => {
        controller.abort()
        try {
          audio.pause()
          audio.removeAttribute('src')
          audio.load()
        } catch {
          // Ignore.
        }
      })
      audio.src = toMediaUrl(file)
      audio.load()
      void this.resume().then(() => {
        if (!this.active || this.audio !== audio) return
        this.rampVolume(
          (value) => {
            try {
              audio.volume = value
            } catch {
              // Ignore.
            }
          },
          this.targetVolume(),
        )
      })
    } catch (error) {
      this.failed = true
      this.active = false
      console.warn('[dsh-boot-custom] custom audio could not be created:', error)
    }
  }

  /** Ramp down shortly before the media ends. */
  private watchEnd(video: HTMLVideoElement): void {
    if (this.fadeOutStarted || !this.config.audio.fade) return
    const duration = video.duration
    if (!Number.isFinite(duration) || duration <= 0) return
    if (duration - video.currentTime <= FADE_OUT_WINDOW_S) {
      this.fadeOutStarted = true
      if (this.config.audio.source === 'video') {
        const target = this.video
        if (target !== null) {
          const start = target.volume
          this.rampVolume(
            (value) => {
              try {
                target.volume = value
              } catch {
                // Ignore.
              }
            },
            0,
            start,
          )
        }
      } else if (this.audio !== null) {
        const audio = this.audio
        const start = audio.volume
        this.rampVolume(
          (value) => {
            try {
              audio.volume = value
            } catch {
              // Ignore.
            }
          },
          0,
          start,
        )
      }
    }
  }

  /** Target linear volume (0..1). */
  private targetVolume(): number {
    return Math.min(1, Math.max(0, this.config.audio.volume / 100))
  }

  /**
   * Ramp a volume setter from `from` to `target`. The element is captured by
   * the caller so a switch cannot write into a released element.
   */
  private rampVolume(write: (value: number) => void, target: number, from = 0): void {
    this.ramp?.cancel()
    if (!this.config.audio.fade) {
      write(target)
      return
    }
    const start = Math.max(0, Math.min(1, from))
    const startedAt = performance.now()
    let raf = 0
    let cancelled = false
    const step = (now: number): void => {
      if (cancelled || this.disposed) return
      const progress = Math.min(1, (now - startedAt) / FADE_MS)
      const eased = 1 - Math.pow(1 - progress, 3)
      write(start + (target - start) * eased)
      if (progress < 1) raf = window.requestAnimationFrame(step)
    }
    raf = window.requestAnimationFrame(step)
    const cancel = (): void => {
      if (cancelled) return
      cancelled = true
      window.cancelAnimationFrame(raf)
    }
    this.ramp = { cancel }
    this.ledger.add(cancel)
  }
}
