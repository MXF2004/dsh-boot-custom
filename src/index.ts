/**
 * Host half of the DSH boot animation plugin (`dsh-boot-custom`).
 *
 * Responsibilities:
 *  - resolve and persist user configuration (0.1.7 `configEditor` → 0.1.x
 *    `ctx.settings` → `<profile>/boot-custom/config.json`);
 *  - push the first-frame mask into the web server's structured injection
 *    table (`webserver/index-inject`), so the desktop carrier renders it
 *    through `collectIndexInjections()` without touching `dist/index.html`;
 *  - publish the resolved configuration to the browser half as a global row
 *    on every index render;
 *  - serve the read/write routes used by the settings panel.
 *
 * Hard rule: nothing in this file may throw out of `apply`. The DSH web boot
 * fails the whole GUI when a plugin activation throws, so every path logs a
 * warning and degrades instead.
 *
 * @module dsh-boot-custom
 */

import { randomBytes } from 'node:crypto'

import { PACKAGE_NAME, PLUGIN_VERSION, SETTINGS_NAMESPACE } from './shared/constants.js'
import { resolveGreeting } from './shared/config.js'
import type { BootAnimationMeta } from './shared/types.js'
import { buildInjectionRows, type IndexInjectionRow } from './host/first-frame.js'
import { registerConfigRoutes, type RouteHostContext } from './host/routes.js'
import { Config } from './host/schema.js'
import { HostConfigStore, type StoreHostContext } from './host/store.js'

export { Config }

/**
 * Bundle row id, package name and host export are deliberately the same
 * string: `cordis.patch.yml` resolves the module by package name, and the
 * loader keys the entry by this id.
 */
export const name = PACKAGE_NAME

/**
 * Required services. `webServer` is the HTTP carrier that renders the index
 * (the desktop GUI is served over loopback HTTP) and owns the event this
 * plugin injects into. It is part of the shipped desktop profile.
 */
export const inject = ['webServer']

/** Minimal structural face of the cordis context used by the host half. */
interface HostContext extends StoreHostContext, RouteHostContext {
  effect(callback: () => (() => void) | void, label?: string): unknown
  on(event: string, listener: (...args: never[]) => void): unknown
}

/** Forward a listener registration to `ctx.on` without ever throwing. */
function safeOn(ctx: HostContext, event: string, listener: (...args: never[]) => void): void {
  try {
    ctx.on(event, listener)
  } catch (error) {
    console.warn(`[dsh-boot-custom] could not subscribe to ${event}:`, error)
  }
}

/**
 * Plugin activation.
 *
 * @param ctx - host context.
 * @param config - the entry's effective configuration (volatile references on
 *   0.1.7+, plain values on older hosts).
 */
export function apply(ctx: HostContext, config?: unknown): void {
  try {
    applyImpl(ctx, config)
  } catch (error) {
    // Contract: activation failures are logged, never thrown. A broken boot
    // animation must not take the GUI down.
    console.warn('[dsh-boot-custom] activation failed; the GUI boots without the animation:', error)
  }
}

/** The real activation body, wrapped by {@link apply}. */
function applyImpl(ctx: HostContext, config: unknown): void {
  const store = new HostConfigStore(ctx, config)
  try {
    ctx.effect(
      () => () => {
        store.dispose()
      },
      'dsh-boot-custom: config store',
    )
  } catch (error) {
    console.warn('[dsh-boot-custom] config store cleanup could not be registered:', error)
  }

  const writeToken = randomBytes(24).toString('hex')
  registerConfigRoutes(ctx, store, writeToken)

  const meta: BootAnimationMeta = {
    name: PACKAGE_NAME,
    version: PLUGIN_VERSION,
    writeMode: store.mode,
    writeToken,
  }

  // First-frame injection. Runs synchronously on every index render, so the
  // rows always carry the value resolved at that moment.
  safeOn(ctx, 'webserver/index-inject', ((table: IndexInjectionRow[]) => {
    try {
      if (!Array.isArray(table)) return
      const current = store.current()
      // Resolve the greeting once per render so the mask and the browser half
      // agree on the same line (important for the random mode).
      const rows = buildInjectionRows(current, {
        ...meta,
        greeting: resolveGreeting(current),
        startedAt: Date.now(),
      })
      table.push(...rows)
    } catch (error) {
      console.warn('[dsh-boot-custom] index injection failed; serving without the mask:', error)
    }
  }) as (...args: never[]) => void)

  // 0.1.x settings commits.
  safeOn(ctx, 'settings/updated', ((namespace: unknown) => {
    try {
      if (namespace === SETTINGS_NAMESPACE) store.refresh()
    } catch (error) {
      console.warn('[dsh-boot-custom] settings refresh failed:', error)
    }
  }) as (...args: never[]) => void)

  // 0.1.7 volatile config edits: the host mutates the references in place and
  // announces it. This listener is inert on hosts that never emit it.
  safeOn(ctx, 'loader/volatile-update', (() => {
    try {
      store.refresh()
    } catch (error) {
      console.warn('[dsh-boot-custom] volatile refresh failed:', error)
    }
  }) as (...args: never[]) => void)

  const current = store.current()
  console.info(
    `[dsh-boot-custom] active (store=${store.mode}, enabled=${String(current.enabled)}, ` +
      `mode=${current.mode}, videos=${String(current.videos.length)})`,
  )
}
