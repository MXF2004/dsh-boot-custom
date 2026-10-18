/**
 * Browser half of the DSH boot animation plugin (`dsh-boot-custom`).
 *
 * Activation is intentionally tiny and failure-contained. It:
 *  1. installs the overlay + panel stylesheets;
 *  2. creates the config store (inline snapshot → live settings/route sync);
 *  3. creates the controller and registers the animation container as a
 *     `shell.overlay` entry whose visual host is mounted under `<body>` for
 *     viewport-relative fixed positioning (the slot owns its lifecycle);
 *  4. registers the "开机动画" settings page into `settings.section`;
 *  5. optionally binds `ctx.settingsScope` for live persistence.
 *
 * `inject` is exported explicitly: without the `slots` declaration the loader
 * leaves the plugin PENDING (no error, no UI). Every other service is optional
 * and reached through `ctx.inject`, so a profile without the settings plugin
 * still boots the animation.
 *
 * @module dsh-boot-custom/client
 */

import * as React from 'react'

import { SLOTS } from '../shared/constants.js'
import { BootController } from './boot/controller.js'
import { ensureBootStyles } from './boot/styles.js'
import { claimFirstFrame } from './runtime/env.js'
import { OverlayManager, type SlotRegistryLike } from './overlay.js'
import { createSettingsPanel } from './settings/panel.js'
import { ClientConfigStore, type ClientSettingsScopeService } from './settings/store.js'
import { ensureSettingsStyles } from './settings/styles.js'

/**
 * Explicit service dependency. `slots` is the renderer-owned composition
 * registry; declaring it is what lets the loader activate this plugin instead
 * of leaving it PENDING.
 */
export const inject = ['slots'] as const

/** Minimal structural face of the client context. */
interface ClientContext {
  effect(callback: () => (() => void) | void, label?: string): unknown
  on(event: string, listener: (...args: never[]) => void): unknown
  /** Optional service lookup; safe on both the static and dynamic facades. */
  get?(name: string): unknown
  inject?(
    dependencies: string[],
    callback: (ctx: ClientContext) => (() => void) | void,
  ): unknown
  slots: SlotRegistryLike
  settingsScope?: ClientSettingsScopeService
}

/** Register a cleanup through `ctx.effect` without letting a failure abort apply. */
function safeEffect(ctx: ClientContext, callback: () => (() => void) | void, label: string): void {
  try {
    ctx.effect(callback, label)
  } catch (error) {
    console.warn(`[dsh-boot-custom] effect "${label}" could not be registered:`, error)
    try {
      const disposer = callback()
      if (typeof disposer === 'function') disposer()
    } catch {
      // The callback may have created nothing.
    }
  }
}

/**
 * Plugin activation.
 *
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  try {
    applyImpl(ctx)
  } catch (error) {
    // A boot animation failure must never block the GUI: claim the mask and
    // leave the app usable.
    console.warn('[dsh-boot-custom] client activation failed; the GUI continues:', error)
    claimFirstFrame()
  }
}

/** Activation body, wrapped by {@link apply}. */
function applyImpl(ctx: ClientContext): void {
  safeEffect(ctx, () => ensureBootStyles(), 'dsh-boot-custom: overlay styles')
  safeEffect(ctx, () => ensureSettingsStyles(), 'dsh-boot-custom: settings styles')

  const store = new ClientConfigStore()
  let manager: OverlayManager | null = null

  const controller = new BootController({
    ctx,
    getConfig: () => store.current(),
    onFinished: () => {
      // Remove the slot entry after the run: nothing is left inside the
      // shell overlay between boots, and a preview re-registers it.
      manager?.release()
    },
  })

  manager = new OverlayManager({ ctx, controller })
  manager.ensure()

  const panel = createSettingsPanel({
    store,
    preview: (config, onDispose) => manager?.playPreview(config, onDispose),
    updatePreview: (config) => controller.updateLive(config),
  })

  // Settings page: `settings.section` is declared by the settings shell later
  // in the boot, so wait for the declaration (the slot registry owns the wait).
  try {
    ctx.slots.inject(SLOTS.settingsSection, () => {
      try {
        return ctx.slots.register(
          {
            name: SLOTS.settingsSection,
            id: 'boot-custom',
            order: 120,
            label: () => '开机动画',
          },
          panel as unknown as React.ComponentType<never>,
        )
      } catch (error) {
        console.warn('[dsh-boot-custom] settings page could not be registered:', error)
        return () => undefined
      }
    })
  } catch (error) {
    console.warn('[dsh-boot-custom] settings slot is unavailable in this profile:', error)
  }

  // Optional live settings namespace (0.1.x). `ctx.inject` only wires the
  // callback when the service actually mounts, so a profile without the
  // settings plugin keeps the injected snapshot instead of going PENDING.
  const attachScope = (scope: ClientSettingsScopeService | undefined): void => {
    if (scope === undefined) return
    try {
      store.attachSettingsScope(scope)
    } catch (error) {
      console.warn('[dsh-boot-custom] settings scope binding failed:', error)
    }
  }

  /**
   * Optional service lookup.
   *
   * 0.2.x dynamic plugin contexts expose `ctx.get(name)` and gate direct
   * `ctx.service` reads behind the plugin's `inject` declaration; a static
   * cordis context offers both. Only `get` is used for optional services so
   * neither facade can throw here.
   */
  const optionalService = (name: string): unknown => {
    try {
      return typeof ctx.get === 'function' ? ctx.get(name) : undefined
    } catch {
      return undefined
    }
  }

  const scopeService = optionalService('settingsScope')
  if (scopeService !== undefined && scopeService !== null) {
    attachScope(scopeService as ClientSettingsScopeService)
  }

  // `ctx.inject` is a static-cordis affordance; the 0.2.x dynamic facade
  // withholds it and its property guard records a failure for unknown reads.
  // The `in` check avoids even probing it there.
  let optionalInject: unknown
  try {
    if ('inject' in ctx) optionalInject = (ctx as { inject?: unknown }).inject
  } catch {
    optionalInject = undefined
  }
  if (typeof optionalInject === 'function') {
    try {
      ;(
        optionalInject as (
          dependencies: string[],
          callback: (scopeCtx: ClientContext) => (() => void) | void,
        ) => unknown
      ).call(
        ctx,
        ['settingsScope'],
        (scopeCtx: ClientContext) => {
          attachScope(scopeCtx.settingsScope)
          return () => store.detachSettingsScope()
        },
      )
    } catch (error) {
      console.warn('[dsh-boot-custom] settings scope injection failed:', error)
    }
  }

  // Pick up a config changed after the page was served (route modes only).
  void store.refreshFromHost()

  safeEffect(
    ctx,
    () => () => {
      try {
        manager?.dispose()
      } catch (error) {
        console.warn('[dsh-boot-custom] overlay manager dispose failed:', error)
      }
      try {
        controller.dispose()
      } catch (error) {
        console.warn('[dsh-boot-custom] controller dispose failed:', error)
      }
      try {
        store.dispose()
      } catch (error) {
        console.warn('[dsh-boot-custom] store dispose failed:', error)
      }
    },
    'dsh-boot-custom: lifecycle',
  )

  console.info(
    `[dsh-boot-custom] client ready (store=${store.writeMode}, enabled=${String(store.current().enabled)})`,
  )
}
