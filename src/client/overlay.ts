/**
 * `shell.overlay` slot integration.
 *
 * The animation is registered as a `shell.overlay` entry, so the shell owns
 * its lifecycle. Its visual host is mounted directly under `<body>` from the
 * entry's React effect: the app frame uses grid/transform layout, which would
 * otherwise become the containing block for `position: fixed` and shift (or
 * clip) the overlay by the sidebar width. A body-level host keeps the overlay
 * viewport-relative for the boot run and previews alike.
 *
 * The manager keeps the registration alive only while an animation is on
 * screen:
 *
 *  - `ensure()` registers directly (the spec's preferred path) and falls back
 *    to `slots.inject` when the layout has not declared the slot yet;
 *  - after a run finishes the entry is unregistered, so nothing is left in the
 *    slot list;
 *  - a preview requested while the entry is absent re-registers it and starts
 *    as soon as React mounted the host element.
 *
 * @module dsh-boot-custom/client/overlay
 */

import * as React from 'react'

import { DOM_IDS, SLOTS } from '../shared/constants.js'
import type { BootAnimationConfig } from '../shared/types.js'
import type { BootController } from './boot/controller.js'

/** The slot registry face used here. */
export interface SlotRegistryLike {
  register(options: Record<string, unknown>, component: React.ComponentType<never>): () => void
  inject(key: string, callback: () => (() => void) | void): () => void
}

/** Context face required by the manager. */
export interface OverlayContext {
  slots: SlotRegistryLike
}

/** Services for one overlay registration. */
export interface OverlayManagerOptions {
  ctx: OverlayContext
  controller: BootController
}

/** Registration options for a list slot entry. */
const ENTRY_OPTIONS = {
  name: SLOTS.overlay,
  id: 'boot-custom',
  order: 1000,
} as const

/** Owns the slot entry for the animation container. */
export class OverlayManager {
  private readonly options: OverlayManagerOptions
  private disposer: (() => void) | null = null
  private registered = false
  private pending: { config: BootAnimationConfig; onDispose: (() => void) | undefined } | null = null
  private disposed = false

  /**
   * @param options - slot registry and controller.
   */
  constructor(options: OverlayManagerOptions) {
    this.options = options
  }

  /** Register the entry when it is not registered yet. */
  ensure(): void {
    if (this.disposed || this.disposer !== null) return
    const manager = this
    const controller = this.options.controller

    const OverlayEntry = function BootAnimationOverlay(): React.ReactElement | null {
      React.useEffect(() => {
        let host: HTMLDivElement | null = null
        try {
          host = document.createElement('div')
          host.id = DOM_IDS.overlaySlot
          host.className = 'dba-slot'
          host.setAttribute('data-dsh-boot-anim', 'slot')
          // Mount the slot-owned host directly under <body>. The app frame
          // uses grid/transform layout, which would otherwise become the
          // containing block for our `position: fixed` overlay and shift it by
          // the sidebar width. A body-level host makes the overlay viewport-
          // relative for both the boot run and previews.
          document.body.appendChild(host)
        } catch (error) {
          console.warn('[dsh-boot-custom] overlay host could not be mounted:', error)
          host?.remove()
          return undefined
        }
        const detach = controller.attach(host)
        manager.onAttached()
        return () => {
          detach()
          try {
            host?.remove()
          } catch {
            // Already detached by React or the shell.
          }
          host = null
        }
      }, [])
      return null
    }

    try {
      this.disposer = this.options.ctx.slots.register(
        ENTRY_OPTIONS as unknown as Record<string, unknown>,
        OverlayEntry as unknown as React.ComponentType<never>,
      )
      this.registered = true
      return
    } catch {
      // The layout has not declared `shell.overlay` yet (activation order).
      // `slots.inject` waits for the declaration and keeps the caller's fiber
      // as the owner, so plugin unload cancels the wait.
    }

    try {
      this.disposer = this.options.ctx.slots.inject(SLOTS.overlay, () => {
        this.registered = true
        return this.options.ctx.slots.register(
          ENTRY_OPTIONS as unknown as Record<string, unknown>,
          OverlayEntry as unknown as React.ComponentType<never>,
        )
      })
    } catch (error) {
      console.warn('[dsh-boot-custom] shell.overlay registration failed:', error)
    }
  }

  /**
   * Play a preview; registers the slot first when the boot entry was released.
   *
   * @param config - draft configuration.
   * @param onDispose - releases temporary Object URLs when the run ends.
   */
  playPreview(config: BootAnimationConfig, onDispose?: () => void): void {
    if (this.disposed) {
      onDispose?.()
      return
    }
    const controller = this.options.controller
    if (this.registered && controller.attached) {
      controller.playPreview(config, onDispose)
      return
    }
    this.pending = { config, onDispose }
    this.ensure()
  }

  /** Unregister the slot entry (called when a run finished). */
  release(): void {
    const disposer = this.disposer
    this.disposer = null
    this.registered = false
    if (disposer !== null) {
      try {
        disposer()
      } catch (error) {
        console.warn('[dsh-boot-custom] overlay entry could not be released:', error)
      }
    }
  }

  /** Release everything (plugin unload / hot reload). */
  dispose(): void {
    this.disposed = true
    this.release()
    const pending = this.pending
    this.pending = null
    if (pending !== null) {
      try {
        pending.onDispose?.()
      } catch {
        // Ignore.
      }
    }
  }

  /** Slot mounted: start the pending preview or the boot animation. */
  private onAttached(): void {
    const pending = this.pending
    this.pending = null
    if (pending !== null) {
      this.options.controller.playPreview(pending.config, pending.onDispose)
      return
    }
    this.options.controller.startBoot()
  }
}
