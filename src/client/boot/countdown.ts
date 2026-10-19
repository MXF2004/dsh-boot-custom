/**
 * Skip countdown.
 *
 * The countdown starts with the animation and is deliberately independent of
 * media progress: during the countdown skipping is locked, and when it expires
 * only the skip capability unlocks — the animation is not ended. The caller
 * may still end the animation early when `app/ready` arrives; that is the
 * controller's timing rule, not this widget's.
 *
 * @module dsh-boot-custom/client/boot/countdown
 */

import type { BootAnimationConfig } from '../../shared/types.js'
import { pickText } from '../runtime/env.js'
import type { Ledger } from '../runtime/ledger.js'

/** Countdown wiring. */
export interface CountdownOptions {
  config: BootAnimationConfig
  ledger: Ledger
  /** Called once when skipping becomes legal. */
  onUnlock(): void
}

/** The hint that replaces the countdown once skipping unlocks. */
const UNLOCK_TEXT = { zh: '点击跳过', en: 'Click to skip' }
/** How long the unlocked hint stays before fading. */
const HINT_HOLD_MS = 1500

/** Visual skip countdown. */
export class Countdown {
  /** True when a skip would be accepted right now. */
  unlocked = false
  /** The rendered element, or null when the countdown is hidden. */
  readonly element: HTMLDivElement | null
  private readonly options: CountdownOptions
  private readonly numberNode: HTMLSpanElement | null
  private readonly hintNode: HTMLSpanElement | null
  private remaining = 0
  private intervalId = 0
  private destroyed = false

  /**
   * @param options - config, ledger and unlock callback.
   */
  constructor(options: CountdownOptions) {
    this.options = options
    const { config, ledger } = options
    if (!config.allowSkip || !config.countdown.enabled) {
      // No visible countdown: skip availability follows the master switch.
      this.unlocked = config.allowSkip
      this.element = null
      this.numberNode = null
      this.hintNode = null
      return
    }

    const element = document.createElement('div')
    element.className = 'dba-countdown'
    element.dataset.position = config.countdown.position
    element.dataset.progressPosition = config.progress.position
    element.setAttribute('role', 'status')
    // Do not announce every one-second decrement; announce only the actionable
    // "click to skip" state once the countdown unlocks.
    element.setAttribute('aria-live', 'off')
    element.style.setProperty('--dba-countdown-color', config.countdown.color)
    element.style.setProperty('--dba-countdown-size', `${String(config.countdown.fontSize)}px`)
    if (config.countdown.glow) {
      element.style.textShadow = `0 0 14px ${config.countdown.glowColor}, 0 0 34px ${config.countdown.glowColor}`
    }

    const number = document.createElement('span')
    number.className = 'dba-countdown-number'
    const hint = document.createElement('span')
    hint.className = 'dba-countdown-hint'
    element.append(number, hint)
    this.element = element
    this.numberNode = number
    this.hintNode = hint

    this.remaining = Math.max(0, Math.floor(config.countdown.seconds))
    if (this.remaining > 0) {
      number.textContent = String(this.remaining)
      hint.textContent = config.countdown.showHint ? config.countdown.hintText : ''
      ledger.interval(() => this.tick(), 1000)
      this.intervalId = 1
    } else {
      // 0 seconds: skipping is legal immediately.
      this.unlock()
    }
  }

  /** Stop timers and detach the element. */
  destroy(): void {
    this.destroyed = true
    if (this.intervalId !== 0) {
      // The ledger also clears it; this only shortens the window.
      this.intervalId = 0
    }
    try {
      this.element?.remove()
    } catch {
      // Already detached.
    }
  }

  /** One second elapsed. */
  private tick(): void {
    if (this.destroyed || this.unlocked) return
    this.remaining -= 1
    if (this.remaining > 0) {
      if (this.numberNode !== null) this.numberNode.textContent = String(this.remaining)
      return
    }
    this.unlock()
  }

  /** Unlock skipping, swap the copy to the actionable hint and fade it out. */
  private unlock(): void {
    if (this.unlocked) return
    this.unlocked = true
    if (this.numberNode !== null) this.numberNode.textContent = ''
    if (this.hintNode !== null) this.hintNode.textContent = pickText(UNLOCK_TEXT.zh, UNLOCK_TEXT.en)
    try {
      this.element?.setAttribute('aria-live', 'polite')
      this.element?.setAttribute('aria-atomic', 'true')
    } catch {
      // Ignore.
    }
    try {
      this.options.onUnlock()
    } catch (error) {
      console.warn('[dsh-boot-custom] skip unlock callback failed:', error)
    }
    this.options.ledger.timeout(() => {
      if (this.destroyed) return
      try {
        this.element?.classList.add('is-fading')
      } catch {
        // Ignore.
      }
    }, HINT_HOLD_MS)
  }
}
