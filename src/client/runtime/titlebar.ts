/**
 * Native caption fusion.
 *
 * The Windows desktop preload measures a hidden probe whose computed
 * `background-color` is `var(--dsw-specific-sidebar-fill)` and whose `color`
 * is `var(--dsw-alias-label-primary)`, then forwards both to
 * `setTitleBarOverlay()` in the main process. That is why the caption strip
 * normally carries the app's sidebar color, independent of the boot surface.
 *
 * Instead of overriding those app-wide tokens (which would also restyle the
 * app behind the overlay), this module scopes a rule to the probe element:
 *
 *   - its background becomes fully transparent, so the full-window boot
 *     mask/overlay shows through the caption strip;
 *   - its color comes from `--dba-titlebar-symbol`, a private variable this
 *     module updates from the configured background (or a sampled video
 *     frame), so the native glyphs stay readable on dark and light surfaces.
 *
 * Adding/removing the style and changing the variable both trigger the
 * preload's MutationObserver, which re-sends the caption colors. Removing the
 * style restores the app's original caption appearance exactly.
 *
 * @module dsh-boot-custom/client/runtime/titlebar
 */

import { contrastSymbolColor } from '../../shared/config.js'

/** Private variable consumed by the probe rule. */
const SYMBOL_VAR = '--dba-titlebar-symbol'
/** Id of the titlebar-only stylesheet. */
const STYLE_ID = 'dsh-boot-custom-titlebar-style'
/** Matches the desktop preload's hidden caption probe by its inline tokens. */
const PROBE_SELECTOR =
  'body > :is([style*="--dsw-specific-sidebar-fill"], [style*="--dsw-alias-label-primary"])'

/** Caption sample width in CSS pixels (Windows caption buttons). */
const CAPTION_WIDTH = 150
/** Caption sample height in CSS pixels. */
const CAPTION_HEIGHT = 44
/** Last-resort restore if a run leaks past the controller's own 20 s stop. */
const SAFETY_MS = 25_000

let active = false
let styleElement: HTMLStyleElement | null = null
let currentSymbol = ''
let safetyTimer = 0

/** Arm (or re-arm) the last-resort restore timer. */
function armSafety(): void {
  if (safetyTimer !== 0) window.clearTimeout(safetyTimer)
  safetyTimer = window.setTimeout(() => {
    safetyTimer = 0
    endTitlebarFusion()
  }, SAFETY_MS)
}

/** Disarm the last-resort restore timer. */
function disarmSafety(): void {
  if (safetyTimer === 0) return
  window.clearTimeout(safetyTimer)
  safetyTimer = 0
}

/** Install the probe-scoped rule, once per activation streak. */
function ensureStyle(fallback: string): void {
  if (styleElement !== null && styleElement.isConnected) return
  try {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = [
      `${PROBE_SELECTOR} {`,
      '  background-color: rgba(0, 0, 0, 0) !important;',
      `  color: var(${SYMBOL_VAR}, ${fallback}) !important;`,
      '}',
    ].join('\n')
    ;(document.head ?? document.documentElement).appendChild(style)
    styleElement = style
  } catch (error) {
    console.warn('[dsh-boot-custom] titlebar stylesheet could not be installed:', error)
  }
}

/** Update the private glyph variable only when the contrast class changes. */
function setSymbol(background: string): void {
  const symbol = contrastSymbolColor(background)
  if (symbol === currentSymbol) return
  currentSymbol = symbol
  try {
    document.body?.style.setProperty(SYMBOL_VAR, symbol, 'important')
  } catch {
    // A frozen body style only loses the adaptive glyph color.
  }
}

/**
 * Start (or refresh) caption fusion for one boot/preview run.
 *
 * Idempotent: a second run reuses the installed rule and the saved app state
 * is never touched (the rule is scoped to the probe).
 *
 * @param background - the configured launch background.
 */
export function beginTitlebarFusion(background: string): void {
  try {
    ensureStyle(contrastSymbolColor(background))
    active = true
    setSymbol(background)
    armSafety()
  } catch (error) {
    console.warn('[dsh-boot-custom] titlebar fusion could not start:', error)
  }
}

/**
 * Refresh the glyph contrast from a new background sample.
 *
 * @param background - configured color or a sampled video frame color.
 */
export function updateTitlebarFusion(background: string): void {
  if (!active) return
  setSymbol(background)
}

/** Remove the rule and the private variable, restoring the app caption exactly. */
export function endTitlebarFusion(): void {
  if (!active && styleElement === null) {
    disarmSafety()
    return
  }
  disarmSafety()
  active = false
  currentSymbol = ''
  try {
    document.body?.style.removeProperty(SYMBOL_VAR)
  } catch {
    // Ignore a frozen style object.
  }
  try {
    styleElement?.remove()
  } catch {
    // Already detached.
  }
  styleElement = null
}

/**
 * Sample the color behind the native caption buttons.
 *
 * `object-fit: cover` is accounted for: the caption rect is mapped from the
 * element's displayed box back into the video frame, so a cropped video still
 * reports the pixels actually visible under the buttons. Cross-origin frames
 * taint the canvas and return `undefined`; the caller then keeps the
 * configured background color.
 *
 * @param video - the live video element.
 * @returns an `rgb(...)` color, or undefined when sampling is impossible.
 */
export function sampleVideoTopRight(video: HTMLVideoElement): string | undefined {
  try {
    const width = video.videoWidth
    const height = video.videoHeight
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) return undefined

    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 8
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context === null) return undefined

    let sourceX = Math.max(0, width - Math.floor(width * 0.22))
    let sourceY = 0
    let sourceWidth = Math.max(1, Math.floor(width * 0.22))
    let sourceHeight = Math.max(1, Math.floor(height * 0.14))

    const rect = video.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      // Mirrors object-fit: cover for a full-window video.
      const scale = Math.max(rect.width / width, rect.height / height)
      const drawnWidth = width * scale
      const drawnHeight = height * scale
      const offsetX = (rect.width - drawnWidth) / 2
      const offsetY = (rect.height - drawnHeight) / 2
      const captionWidth = Math.min(CAPTION_WIDTH, rect.width)
      const captionHeight = Math.min(CAPTION_HEIGHT, rect.height)
      const cssX = rect.width - captionWidth
      const cssY = 0
      const mappedX = (cssX - offsetX) / scale
      const mappedY = (cssY - offsetY) / scale
      sourceX = Math.max(0, Math.min(width - 1, mappedX))
      sourceY = Math.max(0, Math.min(height - 1, mappedY))
      sourceWidth = Math.max(1, Math.min(width - sourceX, captionWidth / scale))
      sourceHeight = Math.max(1, Math.min(height - sourceY, captionHeight / scale))
    }

    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, 16, 8)
    const data = context.getImageData(0, 0, 16, 8).data
    let red = 0
    let green = 0
    let blue = 0
    let weight = 0
    for (let index = 0; index + 3 < data.length; index += 4) {
      const alpha = (data[index + 3] ?? 0) / 255
      if (alpha <= 0) continue
      red += (data[index] ?? 0) * alpha
      green += (data[index + 1] ?? 0) * alpha
      blue += (data[index + 2] ?? 0) * alpha
      weight += alpha
    }
    if (weight <= 0) return undefined
    return `rgb(${String(Math.round(red / weight))}, ${String(Math.round(green / weight))}, ${String(
      Math.round(blue / weight),
    )})`
  } catch {
    // Tainted canvas or a video without a decodable frame.
    return undefined
  }
}
