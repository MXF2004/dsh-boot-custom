/**
 * Browser environment helpers.
 *
 * All host globals are read through defensive accessors: this bundle runs
 * inside a classic-script module loader where the global object is shared with
 * the shell, so a missing or foreign value must degrade rather than throw.
 *
 * @module dsh-boot-custom/client/runtime/env
 */

import { GLOBALS } from '../../shared/constants.js'
import { isRecord, normalizeConfig } from '../../shared/config.js'
import type { BootAnimationConfig, BootAnimationMeta } from '../../shared/types.js'

/** Globals this plugin may publish or consume. */
interface DshBootGlobals {
  __BOOT_ANIM_CONFIG__?: unknown
  __BOOT_ANIM_META__?: unknown
  __BOOT_ANIM_FIRST_FRAME__?: { end?: () => void }
  __BOOT_ANIM_FIRST_FRAME_CLAIMED__?: boolean
  __DSH_BOOT_READY__?: Promise<unknown> | { promise?: Promise<unknown> }
  dshDesktop?: { getPathForFile?: (file: File) => string | undefined }
}

/** Narrow access to the shared global object. */
function globals(): DshBootGlobals {
  return globalThis as unknown as DshBootGlobals
}

/** Read the config the host injected into the document, normalized. */
export function readInjectedConfig(): BootAnimationConfig {
  try {
    return normalizeConfig(globals().__BOOT_ANIM_CONFIG__)
  } catch (error) {
    console.warn('[dsh-boot-custom] injected config unreadable; using defaults:', error)
    return normalizeConfig({})
  }
}

/** Read the host meta row, when present. */
export function readInjectedMeta(): BootAnimationMeta | undefined {
  const meta = globals().__BOOT_ANIM_META__
  if (!isRecord(meta)) return undefined
  const name = typeof meta.name === 'string' ? meta.name : ''
  const version = typeof meta.version === 'number' ? meta.version : 0
  const writeMode =
    meta.writeMode === 'config-editor' || meta.writeMode === 'settings' || meta.writeMode === 'file'
      ? meta.writeMode
      : 'file'
  const greeting = typeof meta.greeting === 'string' ? meta.greeting : undefined
  const startedAt =
    typeof meta.startedAt === 'number' && Number.isFinite(meta.startedAt) ? meta.startedAt : undefined
  return {
    name,
    version,
    writeMode,
    ...(greeting === undefined ? {} : { greeting }),
    ...(startedAt === undefined ? {} : { startedAt }),
  }
}

/** `prefers-reduced-motion: reduce`, computed defensively. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** True when the shell prefers Chinese (default for the product copy). */
export function isChinese(): boolean {
  try {
    const language = navigator.language || document.documentElement.lang || ''
    return !/^en\b/i.test(language)
  } catch {
    return true
  }
}

/** Pick the Chinese string unless the shell is explicitly English. */
export function pickText(zh: string, en: string): string {
  return isChinese() ? zh : en
}

/**
 * Claim the injected first-frame mask.
 *
 * Contract order matters: the CLAIMED flag is set before `end()` runs, so the
 * script's own 12s fallback sees the claim and stands down. When the script is
 * missing (older host, script blocked) the mask node is removed directly.
 */
export function claimFirstFrame(): void {
  try {
    globals().__BOOT_ANIM_FIRST_FRAME_CLAIMED__ = true
  } catch {
    // Frozen global object: the node removal below still applies.
  }
  try {
    globals().__BOOT_ANIM_FIRST_FRAME__?.end?.()
  } catch (error) {
    console.warn('[dsh-boot-custom] first-frame end() failed:', error)
  }
  try {
    const node = document.getElementById('dsh-boot-custom-first-frame')
    if (node !== null) node.remove()
  } catch {
    // Nothing to remove.
  }
}

/** Promise-like returned by the host's boot-ready deferred. */
function bootReadyPromise(): Promise<unknown> | undefined {
  const value = globals().__DSH_BOOT_READY__
  if (value instanceof Promise) return value
  if (value !== null && typeof value === 'object' && value.promise instanceof Promise) return value.promise
  return undefined
}

/**
 * Await the host's "injected state is installed" deferred. This deliberately
 * does NOT mean "the UI is ready": on the served form it resolves at the end
 * of the document parse, before the shell boots.
 */
export async function awaitInjectedState(): Promise<void> {
  const promise = bootReadyPromise()
  if (promise === undefined) return
  try {
    await promise
  } catch {
    // A rejected boot deferred is the shell's problem; the mask is independent.
  }
}

/**
 * Titlebar height in CSS pixels.
 *
 * Priority: Window Controls Overlay geometry (exact) → the CSS
 * `env(titlebar-area-height)` fallback (handled by the stylesheet) → 0.
 * No pixel value is ever hard-coded.
 */
export function readTitlebarHeight(): number {
  try {
    const overlay = (
      navigator as Navigator & {
        windowControlsOverlay?: {
          getTitlebarAreaRect?: () => DOMRectReadOnly | { height?: number }
        }
      }
    ).windowControlsOverlay
    if (overlay !== undefined && typeof overlay.getTitlebarAreaRect === 'function') {
      const rect = overlay.getTitlebarAreaRect()
      const height = typeof rect.height === 'number' ? rect.height : Number.NaN
      if (Number.isFinite(height) && height >= 0) return height
    }
  } catch {
    // The API is absent on the web target.
  }
  return 0
}

/** The Window Controls Overlay object, when the platform exposes it. */
export function windowControlsOverlay(): (EventTarget & { getTitlebarAreaRect?: () => DOMRectReadOnly }) | undefined {
  try {
    const overlay = (navigator as Navigator & { windowControlsOverlay?: EventTarget }).windowControlsOverlay
    return overlay as (EventTarget & { getTitlebarAreaRect?: () => DOMRectReadOnly }) | undefined
  } catch {
    return undefined
  }
}

/**
 * Best-effort absolute path for a picked file.
 *
 * Chromium hides the real path from a sandboxed renderer. Electron exposes it
 * only through a preload bridge (`webUtils.getPathForFile`) or the legacy
 * `File.path` field; when neither exists the caller must fall back to an
 * Object URL (preview only) or an explicit base64 carry.
 */
export function filePathOf(file: File): string | undefined {
  const legacy = (file as File & { path?: unknown }).path
  if (typeof legacy === 'string' && legacy.trim().length > 0) return legacy
  const bridge = globals().dshDesktop
  if (bridge !== undefined && typeof bridge.getPathForFile === 'function') {
    try {
      const path = bridge.getPathForFile(file)
      if (typeof path === 'string' && path.trim().length > 0) return path
    } catch {
      // Bridge refused (sandboxed file); fall through.
    }
  }
  return undefined
}

/** Read a file as a data URL, rejecting files above `maxBytes`. */
export function readFileAsDataUrl(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`file is ${String(file.size)} bytes; the limit is ${String(maxBytes)}`))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(result)
      else reject(new Error('file read produced no string'))
    }
    reader.readAsDataURL(file)
  })
}

/** File extension in lower case (without the dot). */
export function extensionOf(file: File): string {
  const match = /\.([a-z0-9]+)$/i.exec(file.name)
  return match?.[1]?.toLowerCase() ?? ''
}

/** Whether a data URL carries an audio payload. */
export function isAudioDataUrl(value: string): boolean {
  return /^data:audio\//i.test(value)
}
