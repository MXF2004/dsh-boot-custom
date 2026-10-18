/**
 * Boot-animation controller.
 *
 * One controller lives for the whole plugin activation. It owns the shared
 * listeners (safe-area geometry, skip keys) and exactly one run at a time. A
 * run is self-contained: its own ledger, DOM tree, media, progress tracker,
 * countdown and ready signal. Ending a run — by `app/ready`, skip, timeout or
 * preview completion — tears all of it down in reverse order and reports back
 * so the slot entry can be released.
 *
 * @module dsh-boot-custom/client/boot/controller
 */

import { DOM_IDS, SEQUENCE_STORAGE_KEY } from '../../shared/constants.js'
import { pickVideoIndex, resolveGreeting, nextCursor } from '../../shared/config.js'
import { LIMITS, type BootAnimationConfig, type TransitionStyle } from '../../shared/types.js'
import {
  claimFirstFrame,
  awaitInjectedState,
  pickText,
  prefersReducedMotion,
  readInjectedMeta,
  readTitlebarHeight,
  windowControlsOverlay,
} from '../runtime/env.js'
import { Ledger } from '../runtime/ledger.js'
import {
  beginTitlebarFusion,
  endTitlebarFusion,
  sampleVideoTopRight,
  updateTitlebarFusion,
} from '../runtime/titlebar.js'
import { AudioController } from './audio.js'
import { Countdown } from './countdown.js'
import { clearVar, disableAnimations, div, isEditableTarget, setVar } from './dom.js'
import { ProgressTracker } from './progress.js'
import { createReadySignal, type ReadyContext, type ReadySignal } from './ready.js'
import { VideoLayer } from './video.js'

/** Which lifecycle produced a run. */
export type FinishKind = 'boot' | 'preview'

/** Controller configuration. */
export interface BootControllerOptions {
  /** Client context used for the optional `app/ready` event. */
  ctx: ReadyContext
  /** Reads the freshest configuration (the store may update live). */
  getConfig(): BootAnimationConfig
  /** Called after a run is fully torn down. */
  onFinished?(kind: FinishKind, detail: string): void
}

/** Preview lifetime when the video does not end first. */
const PREVIEW_MS = 6500

/** DOM handles for one run. */
interface RunRefs {
  root: HTMLDivElement
  media: HTMLDivElement
  fallback: HTMLDivElement
  stage: HTMLDivElement
  logoWrap: HTMLDivElement
  greetingWrap: HTMLDivElement
  logo: HTMLDivElement
  /** Inner text node owner; keeps breathing transform off the centering wrapper. */
  logoText: HTMLDivElement
  greeting: HTMLDivElement
  progress: HTMLDivElement | null
  progressFill: HTMLDivElement | null
  progressPercent: HTMLSpanElement | null
}

/** One live animation run. */
interface Run {
  ledger: Ledger
  config: BootAnimationConfig
  preview: boolean
  state: 'running' | 'exiting' | 'done'
  refs: RunRefs
  reducedMotion: boolean
  audio: AudioController | null
  video: VideoLayer | null
  countdown: Countdown | null
  progress: ProgressTracker | null
  ready: ReadySignal | null
  onDispose: (() => void) | undefined
  greetingFull: string
  /** Video is expected for this run (drives logo/greeting visibility). */
  videoPlanned: boolean
}

/** Map the configured transition to the stylesheet class suffix. */
const TRANSITION_CLASS: Record<TransitionStyle, string> = {
  fade: 'dba-exit-fade',
  'slide-up': 'dba-exit-slide-up',
  zoom: 'dba-exit-zoom',
  black: 'dba-exit-black',
  blur: 'dba-exit-blur',
}

/** Read the sequential cursor (never throws, e.g. with storage disabled). */
function readSequenceCursor(): number {
  try {
    const raw = window.localStorage.getItem(SEQUENCE_STORAGE_KEY)
    const value = raw === null ? 0 : Number.parseInt(raw, 10)
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
  } catch {
    return 0
  }
}

/** Persist the sequential cursor (best effort). */
function writeSequenceCursor(value: number): void {
  try {
    window.localStorage.setItem(SEQUENCE_STORAGE_KEY, String(Math.max(0, Math.trunc(value))))
  } catch {
    // Storage may be disabled; the rotation simply restarts from 0 next boot.
  }
}

/** Build the complete overlay DOM for one run. */
function buildOverlay(config: BootAnimationConfig, reducedMotion: boolean): { refs: RunRefs; countdownHost: HTMLDivElement } {
  const root = div('dba-root dba-enter')
  root.id = DOM_IDS.overlayRoot
  root.dataset.mode = config.mode
  root.dataset.state = 'running'
  root.dataset.skippable = 'false'
  root.setAttribute('role', 'presentation')
  root.setAttribute('aria-label', pickText('开机动画', 'Boot animation'))
  setVar(root, '--dba-bg', config.playing.background)
  setVar(root, '--dba-fx-accent', config.logo.glowColor)
  setVar(root, '--dba-duration', `${config.transition.duration}s`)
  if (reducedMotion) {
    root.classList.remove('dba-enter')
    root.classList.add('dba-entered')
    disableAnimations(root)
  }

  const backdrop = div('dba-backdrop')
  const media = div('dba-media')
  const fallback = div('dba-fallback')
  fallback.dataset.cssStyle = config.cssAnimation
  const stage = div('dba-stage')
  const vignette = div('dba-vignette')

  const logoWrap = div('dba-logo-wrap')
  logoWrap.style.top = `${config.logo.vertical}%`
  const logo = div('dba-logo')
  logo.style.fontSize = `${config.logo.fontSize}px`
  logo.style.color = config.logo.color
  logo.style.fontFamily =
    `${config.logo.fontFamily}, system-ui, -apple-system, "Segoe UI", sans-serif, ` +
    '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"'
  logo.style.textShadow = config.logo.glow
    ? `0 0 26px ${config.logo.glowColor}, 0 0 60px ${config.logo.glowColor}`
    : 'none'
  // The wrapper owns `left:50% + translate(-50%,-50%)`. The entrance and
  // breathing transforms live on inner nodes so they cannot replace that
  // centering transform (which is what shifted the logo to the right before).
  const logoText = div('dba-logo-text')
  logoText.textContent = config.logo.text
  logo.appendChild(logoText)
  logoWrap.appendChild(logo)

  const greetingWrap = div('dba-greeting-wrap')
  greetingWrap.style.top = `${config.greeting.vertical}%`
  const greeting = div('dba-greeting')
  greeting.style.fontSize = `${config.greeting.fontSize}px`
  greeting.style.color = config.greeting.color
  greeting.style.fontFamily =
    `${config.greeting.fontFamily}, system-ui, -apple-system, "Segoe UI", sans-serif, ` +
    '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"'
  greeting.style.textShadow = config.greeting.glow ? `0 0 16px ${config.greeting.glowColor}` : 'none'
  greetingWrap.appendChild(greeting)

  stage.append(logoWrap, greetingWrap)

  let progress: HTMLDivElement | null = null
  let progressFill: HTMLDivElement | null = null
  let progressPercent: HTMLSpanElement | null = null
  if (config.progress.enabled) {
    progress = div('dba-progress')
    progress.dataset.position = config.progress.position
    progress.dataset.style = config.progress.style
    setVar(progress, '--dba-fill', config.progress.color)
    setVar(progress, '--dba-track', config.progress.trackColor)
    const track = div('dba-progress-track')
    progressFill = div('dba-progress-fill')
    track.appendChild(progressFill)
    progress.appendChild(track)
    if (config.progress.showPercent) {
      progressPercent = document.createElement('span')
      progressPercent.className = 'dba-percent'
      progressPercent.textContent = '0%'
      progress.appendChild(progressPercent)
    }
  }

  const countdownHost = div('dba-countdown-host')
  root.append(backdrop, media, fallback, stage, vignette)
  if (progress !== null) root.appendChild(progress)
  root.appendChild(countdownHost)

  return {
    refs: {
      root,
      media,
      fallback,
      stage,
      logoWrap,
      greetingWrap,
      logo,
      logoText,
      greeting,
      progress,
      progressFill,
      progressPercent,
    },
    countdownHost,
  }
}

/** Show or hide the logo/greeting wrappers. */
function setTextVisibility(refs: RunRefs, logoVisible: boolean, greetingVisible: boolean): void {
  refs.logoWrap.style.display = logoVisible ? '' : 'none'
  refs.greetingWrap.style.display = greetingVisible ? '' : 'none'
}

/** Boot-animation controller. */
export class BootController {
  private readonly options: BootControllerOptions
  private readonly baseLedger = new Ledger()
  private host: HTMLElement | null = null
  private run: Run | null = null
  private bootStarted = false
  private disposed = false

  /**
   * @param options - context, config source and finish callback.
   */
  constructor(options: BootControllerOptions) {
    this.options = options
    try {
      this.baseLedger.listen(window, 'resize', () => this.updateSafeArea())
      const overlay = windowControlsOverlay()
      if (overlay !== undefined && typeof overlay.addEventListener === 'function') {
        this.baseLedger.listen(overlay, 'geometrychange', () => this.updateSafeArea())
      }
      this.baseLedger.listen<KeyboardEvent>(
        document,
        'keydown',
        (event) => this.onKeyDown(event),
        { capture: true },
      )
    } catch (error) {
      console.warn('[dsh-boot-custom] global listeners could not be installed:', error)
    }
  }

  /** True while the slot host is attached. */
  get attached(): boolean {
    return this.host !== null
  }

  /** True while a preview run is on screen. */
  get previewing(): boolean {
    return this.run !== null && this.run.preview && this.run.state === 'running'
  }

  /**
   * Attach the controller to the slot host element.
   *
   * @param host - the element rendered by the `shell.overlay` entry.
   * @returns a disposer that detaches the current run.
   */
  attach(host: HTMLElement): () => void {
    this.host = host
    if (this.run !== null && !this.run.refs.root.isConnected) {
      try {
        host.appendChild(this.run.refs.root)
      } catch (error) {
        console.warn('[dsh-boot-custom] overlay could not be attached:', error)
      }
    }
    this.updateSafeArea()
    return () => {
      if (this.host !== host) return
      this.host = null
      const hadActiveRun = this.run !== null
      // The component unmounted: stop whatever is on screen. The next mount
      // re-registers the slot entry and can start a preview.
      this.endRun('detached', false)
      // A mid-run detach (React StrictMode remount, layout replacement) must
      // not permanently consume the one-shot boot animation.
      if (hadActiveRun && !this.disposed) this.bootStarted = false
    }
  }

  /** Start the one-shot boot animation (idempotent). */
  startBoot(): void {
    if (this.disposed || this.bootStarted) return
    try {
      const config = this.options.getConfig()
      if (!config.enabled) {
        this.bootStarted = true
        claimFirstFrame()
        endTitlebarFusion()
        this.options.onFinished?.('boot', 'disabled')
        return
      }
      if (this.host === null) {
        // The slot is not mounted yet; a later attach retries.
        console.warn('[dsh-boot-custom] boot requested before the overlay mounted')
        return
      }
      this.bootStarted = true
      this.begin(config, false, undefined)
    } catch (error) {
      this.bootStarted = true
      console.warn('[dsh-boot-custom] boot animation could not start:', error)
      claimFirstFrame()
      this.endRun('start-failed', false)
      endTitlebarFusion()
      this.options.onFinished?.('boot', 'start-failed')
    }
  }

  /**
   * Play the animation once for the settings preview.
   *
   * @param config - the draft configuration to visualize.
   * @param onDispose - releases temporary Object URLs when the run ends.
   */
  playPreview(config: BootAnimationConfig, onDispose?: () => void): void {
    if (this.disposed) {
      onDispose?.()
      return
    }
    if (this.host === null) {
      console.warn('[dsh-boot-custom] preview requested before the overlay mounted')
      onDispose?.()
      return
    }
    try {
      this.begin({ ...config, enabled: true }, true, onDispose)
    } catch (error) {
      console.warn('[dsh-boot-custom] preview could not start:', error)
      this.endRun('preview-failed', false)
      endTitlebarFusion()
      onDispose?.()
    }
  }

  /** Apply live control changes to a running preview (rate / volume / colors). */
  updateLive(config: BootAnimationConfig): void {
    const run = this.run
    if (run === null || !run.preview || run.state !== 'running') return
    try {
      run.config = config
      run.video?.setRate(config.playing.rate)
      run.audio?.setVolume(config.audio.volume)
      setVar(run.refs.root, '--dba-bg', config.playing.background)
      setVar(run.refs.root, '--dba-fx-accent', config.logo.glowColor)
      setVar(run.refs.root, '--dba-duration', `${config.transition.duration}s`)
      run.refs.fallback.dataset.cssStyle = config.cssAnimation
      run.refs.logoText.textContent = config.logo.text
      run.refs.logo.style.fontSize = `${config.logo.fontSize}px`
      run.refs.logo.style.color = config.logo.color
      // With a live video the sampled frame owns the caption contrast; only a
      // video-less preview follows the configured background immediately.
      if (run.video === null || run.video.video() === null) {
        updateTitlebarFusion(config.playing.background)
      }
      if (run.refs.progress !== null) {
        setVar(run.refs.progress, '--dba-fill', config.progress.color)
        setVar(run.refs.progress, '--dba-track', config.progress.trackColor)
      }
    } catch (error) {
      console.warn('[dsh-boot-custom] live preview update failed:', error)
    }
  }

  /** Attempt a skip; returns whether the request was accepted. */
  skip(): boolean {
    const run = this.run
    if (run === null || run.state !== 'running') return false
    // A preview is a sandbox presentation: the user must always be able to
    // dismiss it (click/Esc), regardless of the boot skip switch or countdown.
    if (run.preview) {
      this.beginExit(run, 'preview-skip')
      return true
    }
    if (!run.config.allowSkip) return false
    if (run.countdown !== null && !run.countdown.unlocked) return false
    this.beginExit(run, 'skip')
    return true
  }

  /** Stop everything and release global listeners. */
  dispose(): void {
    this.disposed = true
    this.endRun('disposed', false)
    endTitlebarFusion()
    this.baseLedger.dispose()
  }

  /** Start one run from a normalized config. */
  private begin(config: BootAnimationConfig, preview: boolean, onDispose: (() => void) | undefined): void {
    // A new run always replaces the old one silently (no extra slot churn).
    this.endRun('replaced', false)
    if (this.host === null) {
      onDispose?.()
      return
    }

    const reducedMotion = prefersReducedMotion()
    const ledger = new Ledger()
    const { refs, countdownHost } = buildOverlay(config, reducedMotion)
    const videoPlanned = config.mode === 'video' && config.videos.length > 0 && !reducedMotion
    const logoVisible = config.logo.enabled && (!videoPlanned || config.logo.overlayInVideo)
    const greetingVisible = config.greeting.enabled && (!videoPlanned || config.greeting.overlayInVideo)
    setTextVisibility(refs, logoVisible, greetingVisible)

    const injectedMeta = readInjectedMeta()
    const greetingFull = preview
      ? resolveGreeting(config)
      : injectedMeta?.greeting?.trim() || resolveGreeting(config)
    const run: Run = {
      ledger,
      config,
      preview,
      state: 'running',
      refs,
      reducedMotion,
      audio: null,
      video: null,
      countdown: null,
      progress: null,
      ready: null,
      onDispose,
      greetingFull,
      videoPlanned,
    }
    this.run = run

    try {
      this.host.appendChild(refs.root)
    } catch (error) {
      console.warn('[dsh-boot-custom] overlay could not be mounted:', error)
      this.endRun('mount-failed', false)
      return
    }
    this.updateSafeArea()

    // Blend the native caption strip into the full-window boot surface. The
    // rule is scoped to the desktop's probe, so app tokens stay untouched.
    beginTitlebarFusion(config.playing.background)

    // Click anywhere dismisses the run. For the real boot this is gated by
    // `allowSkip` and the countdown; a preview always closes so the Settings
    // panel can be restored.
    ledger.listen(refs.root, 'pointerdown', (event) => {
      if (!this.skip()) return
      try {
        event.preventDefault()
        event.stopPropagation()
      } catch {
        // Ignore.
      }
    })

    // Entry transition (mask fade-in handled by the stylesheet).
    if (!reducedMotion) {
      ledger.frame(() => {
        ledger.frame(() => {
          if (this.run === run && run.state === 'running') refs.root.classList.add('dba-entered')
        })
      })
    }

    // Text entrance: fade-up for the logo, fade-up or typewriter for greeting.
    if (!reducedMotion) {
      ledger.frame(() => {
        ledger.frame(() => {
          if (this.run !== run) return
          // Animate the inner nodes, never the wrappers that own the
          // centering transform.
          refs.logo.classList.add('is-entering')
          if (!reducedMotion) refs.logoText.classList.add('is-breathing')
          if (config.greeting.animation === 'typewriter' && greetingVisible) {
            this.typeGreeting(run)
          } else if (greetingVisible) {
            refs.greeting.classList.add('is-entering')
            refs.greeting.textContent = greetingFull
          } else {
            refs.greeting.textContent = greetingFull
          }
        })
      })
    } else {
      refs.greeting.textContent = greetingFull
    }

    // Countdown first: it must start ticking with the animation, independent of
    // media progress.
    const countdown = new Countdown({
      config,
      ledger,
      onUnlock: () => {
        if (this.run === run) refs.root.dataset.skippable = 'true'
      },
    })
    run.countdown = countdown
    if (countdown.element !== null) countdownHost.appendChild(countdown.element)
    if (config.allowSkip) refs.root.dataset.skippable = countdown.unlocked ? 'true' : 'false'

    // Audio is created even when disabled: its `wantsVideoMuted` answer decides
    // whether the video element may carry sound.
    const audio = new AudioController(config, ledger)
    run.audio = audio

    if (videoPlanned) {
      const video = new VideoLayer(refs.media, config, ledger, {
        onReady: (element) => {
          if (this.run !== run || run.state !== 'running') return
          refs.media.classList.add('is-visible')
          refs.fallback.classList.remove('is-visible')
          audio.attachVideo(element)
          audio.setVolume(config.audio.volume)
          audio.start()
          if (audio.blocked) {
            video.setMuted(true)
          }
          // Match the caption glyphs to the pixels actually behind them.
          updateTitlebarFusion(sampleVideoTopRight(element) ?? config.playing.background)
        },
        onExhausted: (reason) => {
          if (this.run !== run || run.state !== 'running') return
          this.showFallback(run, reason)
        },
        onEnded: () => {
          if (this.run !== run || run.state !== 'running') return
          if (run.preview) ledger.timeout(() => this.beginExit(run, 'video-ended'), 700)
        },
        onAutoplayBlocked: () => {
          audio.markBlocked()
          video.setMuted(true)
        },
      })
      run.video = video
      video.setMuted(audio.wantsVideoMuted)
      const sources = config.videos
      const cursor = preview ? 0 : readSequenceCursor()
      const index = preview ? 0 : pickVideoIndex(sources.length, config.videoMode, Math.random, cursor)
      if (index >= 0) {
        if (!preview && config.videoMode === 'sequence') {
          writeSequenceCursor(nextCursor(index, sources.length))
        }
        video.start(sources, index)
        // The frame under the caption changes as the video plays; resample at a
        // low cadence so the native strip follows scene brightness without
        // flooding the desktop IPC with updates.
        ledger.interval(() => {
          if (this.run !== run || run.state !== 'running') return
          const element = run.video?.video()
          if (!element) return
          const sampled = sampleVideoTopRight(element)
          if (sampled !== undefined) updateTitlebarFusion(sampled)
        }, 1600)
      } else {
        this.showFallback(run, 'no video source selected')
      }
    } else {
      refs.fallback.classList.add('is-visible')
    }

    // Progress tracker.
    if (config.progress.enabled) {
      const tracker = new ProgressTracker({
        real: config.progress.realProgress,
        ledger,
        sink: {
          onProgress: (percent) => this.paintProgress(run, percent),
          onComplete: () => {
            if (this.run === run && run.preview) this.beginExit(run, 'preview-progress')
          },
        },
      })
      run.progress = tracker
      tracker.start()
      this.paintProgress(run, 2)

      // Optional loader signal: some client runtimes emit `internal/plugin`
      // for every entry transition. When it exists, each emission is a real
      // milestone; when it does not, the DOM probe remains the source of truth.
      if (!preview && config.progress.realProgress) {
        try {
          const disposer = this.options.ctx.on('internal/plugin', (() => {
            try {
              tracker.raise(Math.max(40, tracker.percent + 2))
            } catch {
              // A progress raise is best-effort.
            }
          }) as (...args: never[]) => void)
          if (typeof disposer === 'function') ledger.add(disposer as () => void)
        } catch {
          // The event is not part of every runtime; ignore.
        }
      }
    }

    // Ready signal: `app/ready` + DOM probe, gated by the configured minimum
    // animation duration. The duration is measured from the first-frame paint
    // (the host stamps `startedAt` while rendering the index), so time already
    // spent on the mask is not added on top of the full delay. The app-ready
    // gate is still required, so a slow UI keeps the animation up longer.
    const configuredMs = reducedMotion ? 0 : Math.round(config.bootDuration * 1000)
    const elapsedMs =
      !preview && typeof injectedMeta?.startedAt === 'number' && Number.isFinite(injectedMeta.startedAt)
        ? Math.max(0, Date.now() - injectedMeta.startedAt)
        : 0
    const remainingMs = reducedMotion ? 0 : Math.max(0, configuredMs - elapsedMs)
    const bootVisibleMs = reducedMotion ? 0 : Math.max(LIMITS.minVisibleMs, remainingMs)
    const ready = createReadySignal({
      ledger,
      ctx: this.options.ctx,
      minVisibleMs: bootVisibleMs,
      previewMs: preview ? Math.max(PREVIEW_MS, configuredMs) : undefined,
    })
    run.ready = ready

    if (!preview) {
      // The host deferred only proves the injected state is installed; it is
      // used as one more real progress input, never as the exit trigger.
      void awaitInjectedState().then(() => {
        globalThis.__BOOT_ANIM_INJECTED_READY__ = true
      })
    }

    void ready.promise.then(() => {
      if (this.run !== run || run.state !== 'running') return
      run.progress?.complete()
      if (preview) {
        // A preview has its own fixed lifetime (PREVIEW_MS). Exit even when
        // the progress bar is disabled, so the Settings modal is always
        // restored by the panel's onDispose.
        ledger.timeout(() => this.beginExit(run, 'preview-complete'), 0)
        return
      }
      ledger.timeout(() => this.beginExit(run, 'ready'), config.progress.enabled ? 240 : 0)
    })

    // Hard safety net: nothing may keep the mask on screen for longer.
    ledger.timeout(() => this.beginExit(run, 'hard-timeout'), LIMITS.hardTimeoutMs)
  }

  /** Paint one progress value. */
  private paintProgress(run: Run, percent: number): void {
    const value = Math.max(0, Math.min(100, percent))
    try {
      if (run.refs.progressFill !== null) {
        run.refs.progressFill.style.transform = `scaleX(${(value / 100).toFixed(4)})`
      }
      if (run.refs.progressPercent !== null) {
        run.refs.progressPercent.textContent = `${String(Math.round(value))}%`
      }
    } catch {
      // Ignore a detached node.
    }
  }

  /** Reveal the CSS fallback and make the hero text visible again. */
  private showFallback(run: Run, reason: string): void {
    try {
      run.refs.media.classList.remove('is-visible')
      run.refs.fallback.classList.add('is-visible')
      setTextVisibility(run.refs, run.config.logo.enabled, run.config.greeting.enabled)
      run.audio?.finish()
      run.video?.dispose()
      run.video = null
      // No frame owns the caption area any more: follow the fallback surface.
      updateTitlebarFusion(run.config.playing.background)
      if (run.config.greeting.animation === 'typewriter' && run.refs.greeting.textContent === '') {
        run.refs.greeting.textContent = run.greetingFull
      }
    } catch (error) {
      console.warn('[dsh-boot-custom] fallback transition failed:', error)
    }
    console.warn(`[dsh-boot-custom] using the built-in CSS animation (${reason})`)
  }

  /** Typewriter entrance; reduced motion falls back to the full string. */
  private typeGreeting(run: Run): void {
    if (run.reducedMotion) {
      run.refs.greeting.textContent = run.greetingFull
      return
    }
    const text = run.greetingFull
    if (text.length === 0) {
      run.refs.greeting.textContent = ''
      return
    }
    const caret = document.createElement('span')
    caret.className = 'dba-caret'
    run.refs.greeting.textContent = ''
    run.refs.greeting.appendChild(caret)
    // 18–48ms per character keeps short greetings readable and long ones
    // bounded (about 1.6s total).
    const step = Math.max(18, Math.min(48, Math.round(1600 / text.length)))
    let index = 0
    run.ledger.interval(() => {
      if (this.run !== run || run.state !== 'running') return
      index += 1
      run.refs.greeting.textContent = text.slice(0, index)
      run.refs.greeting.appendChild(caret)
      if (index >= text.length) {
        caret.remove()
      }
    }, step)
  }

  /** Begin the configured exit transition. */
  private beginExit(run: Run, reason: string): void {
    if (this.run !== run || run.state !== 'running') return
    run.state = 'exiting'
    run.refs.root.dataset.state = 'exiting'
    try {
      run.countdown?.destroy()
      run.countdown = null
    } catch {
      // Ignore.
    }
    // Closing the loop: the claimed flag is set inside `claimFirstFrame`
    // before the mask is hidden, so the script's 12s fallback stands down.
    claimFirstFrame()
    run.audio?.finish()
    run.progress?.complete()
    const duration = run.reducedMotion ? 0.1 : run.config.transition.duration
    setVar(run.refs.root, '--dba-duration', `${duration}s`)
    const exitClass = TRANSITION_CLASS[run.config.transition.style]
    try {
      run.refs.root.classList.add(exitClass)
    } catch (error) {
      console.warn('[dsh-boot-custom] exit transition failed:', error)
    }
    run.ledger.timeout(() => this.finishRun(run, reason), Math.round(duration * 1000) + 80)
  }

  /** Final teardown of one run and slot release. */
  private finishRun(run: Run, reason: string): void {
    if (this.run !== run) return
    this.endRun(reason, true)
  }

  /**
   * Dispose the current run.
   *
   * @param reason - diagnostic reason for the finish callback.
   * @param notify - report to the slot manager (false for internal restarts).
   */
  private endRun(reason: string, notify: boolean): void {
    const run = this.run
    if (run === null) return
    this.run = null
    run.state = 'done'
    try {
      run.progress?.stop()
    } catch {
      // Ignore.
    }
    try {
      run.ready?.dispose()
    } catch {
      // Ignore.
    }
    try {
      run.countdown?.destroy()
    } catch {
      // Ignore.
    }
    try {
      run.audio?.dispose()
    } catch {
      // Ignore.
    }
    try {
      run.video?.dispose()
    } catch {
      // Ignore.
    }
    run.ledger.dispose()
    try {
      run.refs.root.remove()
    } catch {
      // Already detached.
    }
    // The app is exposed again: let the native caption strip return to the
    // theme's own sidebar/label colors.
    endTitlebarFusion()
    try {
      run.onDispose?.()
    } catch (error) {
      console.warn('[dsh-boot-custom] preview cleanup failed:', error)
    }
    if (notify) {
      try {
        this.options.onFinished?.(run.preview ? 'preview' : 'boot', reason)
      } catch (error) {
        console.warn('[dsh-boot-custom] finish callback failed:', error)
      }
    }
  }

  /** Keep the titlebar-safe variable in sync with the real window geometry. */
  private updateSafeArea(): void {
    const root = this.run?.refs.root
    if (root === undefined) return
    try {
      const height = readTitlebarHeight()
      if (height > 0) setVar(root, '--dba-titlebar', `${Math.round(height)}px`)
      else clearVar(root, '--dba-titlebar')
    } catch {
      // The stylesheet's env() fallback remains in charge.
    }
  }

  /** Any key skips with the documented focus/countdown guards. */
  private onKeyDown(event: KeyboardEvent): void {
    const run = this.run
    if (run === null || run.state !== 'running') return
    if (event.defaultPrevented || event.isComposing) return
    // A preview ignores the editable-target guard: the Settings modal may
    // still hold focus in its (now hidden) form, and a key must still dismiss
    // the preview rather than being swallowed by a stale input.
    if (!run.preview && (isEditableTarget(event.target) || isEditableTarget(document.activeElement))) return
    // The skip gates (allowSkip + countdown) still decide whether the input is
    // accepted; once they are open, every key skips, not just Esc/Space.
    if (!this.skip()) return
    try {
      event.preventDefault()
      event.stopPropagation()
      // The hidden Settings modal may have its own document-level key handler;
      // capture + immediate stop keeps the preview's dismissal first.
      event.stopImmediatePropagation()
    } catch {
      // Ignore.
    }
  }
}
