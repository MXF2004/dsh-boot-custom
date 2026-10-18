/**
 * Browser-side configuration store.
 *
 * Reads the inline snapshot the host injected (`__BOOT_ANIM_CONFIG__`) so the
 * animation can start with zero network latency, then keeps it live through
 * one of two writable seams:
 *
 *  - `ctx.settingsScope` — the 0.1.x settings namespace, bound lazily through
 *    `ctx.inject` because the settings plugin may mount after this one;
 *  - the host config route — the 0.1.7 `configEditor` path and the JSON
 *    fallback.
 *
 * Every write is normalized before it leaves the browser, so the panel can
 * never persist a value the renderer would refuse.
 *
 * @module dsh-boot-custom/client/settings/store
 */

import { ROUTES, SETTINGS_NAMESPACE } from '../../shared/constants.js'
import { deepClone, deepMerge, normalizeConfig } from '../../shared/config.js'
import { DEFAULT_CONFIG } from '../../shared/defaults.js'
import type { BootAnimationConfig, ConfigWriteMode } from '../../shared/types.js'
import { readInjectedConfig, readInjectedMeta } from '../runtime/env.js'

/** Save lifecycle surfaced by the panel. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** Snapshot published by `ctx.settingsScope`. */
interface ScopeSnapshot {
  status?: 'loading' | 'ready' | 'unavailable'
  value?: unknown
}

/** One namespace owner handle on the browser side. */
export interface ClientSettingsScope {
  getSnapshot(): ScopeSnapshot
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
  mutate?(ops: readonly { op: 'set' | 'unset'; path: string[]; value?: unknown }[]): Promise<void>
}

/** The `settingsScope` service face. */
export interface ClientSettingsScopeService {
  bind(spec: { namespace: string; decode?: (value: unknown) => unknown }): ClientSettingsScope
}

/** Request/response shape of the host config route. */
interface RouteResponse {
  ok?: boolean
  config?: unknown
  error?: string
}

/** Resolve a route against the document base (the GUI sets `<base href="/">`). */
function routeUrl(path: string): string {
  const relative = path.replace(/^\//, '')
  try {
    return new URL(relative, document.baseURI).toString()
  } catch {
    return relative
  }
}

/** Browser configuration store. */
export class ClientConfigStore {
  private value: BootAnimationConfig = readInjectedConfig()
  private readonly injectedMeta = readInjectedMeta()
  private readonly listeners = new Set<(config: BootAnimationConfig) => void>()
  private readonly statusListeners = new Set<(status: SaveStatus, error: string) => void>()
  private scope: ClientSettingsScope | null = null
  private scopeOff: (() => void) | null = null
  /** True only while the bound namespace reports a ready snapshot. */
  private scopeReady = false
  private status: SaveStatus = 'idle'
  private error = ''
  private idleTimer = 0
  private disposed = false

  /** How writes are persisted right now. */
  get writeMode(): ConfigWriteMode {
    if (this.scope !== null && this.scopeReady) return 'settings'
    return this.injectedMeta?.writeMode === 'config-editor' ? 'config-editor' : 'file'
  }

  /** The current configuration. */
  current(): BootAnimationConfig {
    return this.value
  }

  /** Subscribe to configuration replacements. */
  subscribe(listener: (config: BootAnimationConfig) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Subscribe to save-status changes. */
  subscribeStatus(listener: (status: SaveStatus, error: string) => void): () => void {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  /** Current save status plus the last error message. */
  getStatus(): { status: SaveStatus; error: string } {
    return { status: this.status, error: this.error }
  }

  /**
   * Attach the live settings namespace (called from `ctx.inject`, which can
   * run after the first paint).
   */
  attachSettingsScope(service: ClientSettingsScopeService | undefined): void {
    if (this.disposed || service === undefined) return
    this.detachSettingsScope()
    try {
      const scope = service.bind({
        namespace: SETTINGS_NAMESPACE,
        decode: (value: unknown) => normalizeConfig(value),
      })
      const sync = (): void => {
        try {
          const snapshot = scope.getSnapshot()
          // Only a READY namespace may own writes. On a host that does not
          // register this namespace the snapshot stays `unavailable`, and the
          // host route (config editor / JSON fallback) remains the write path.
          this.scopeReady = snapshot.status === 'ready'
          if (this.scopeReady && snapshot.value !== undefined) {
            this.publish(normalizeConfig(snapshot.value))
          }
        } catch (error) {
          this.scopeReady = false
          console.warn('[dsh-boot-custom] settings snapshot could not be read:', error)
        }
      }
      sync()
      this.scopeOff = scope.subscribe(sync)
      this.scope = scope
    } catch (error) {
      this.scopeReady = false
      console.warn('[dsh-boot-custom] settings scope could not be bound; using the host route:', error)
    }
  }

  /** Detach the settings namespace (plugin unload / hot reload). */
  detachSettingsScope(): void {
    try {
      this.scopeOff?.()
    } catch {
      // Provider already disposed.
    }
    this.scopeOff = null
    this.scope = null
    this.scopeReady = false
  }

  /** Best-effort refresh from the host route (route mode only). */
  async refreshFromHost(): Promise<void> {
    if (this.disposed || (this.scope !== null && this.scopeReady)) return
    try {
      const response = await fetch(routeUrl(ROUTES.config), {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      })
      if (!response.ok) return
      const payload = (await response.json()) as RouteResponse
      if (payload.config !== undefined) this.publish(normalizeConfig(payload.config))
    } catch {
      // The injected snapshot remains the source of truth.
    }
  }

  /**
   * Persist a complete configuration.
   *
   * @param next - draft or complete config; normalized before writing.
   */
  async save(next: unknown): Promise<void> {
    if (this.disposed) return
    const normalized = normalizeConfig(next)
    this.publish(normalized)
    this.setStatus('saving', '')
    try {
      if (this.scope !== null && this.scopeReady) {
        await this.writeScope(normalized)
      } else {
        await this.writeRoute(ROUTES.config, { config: normalized })
      }
      this.setStatus('saved', '')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[dsh-boot-custom] configuration could not be saved:', error)
      this.setStatus('error', message)
    }
  }

  /** Restore defaults through the active seam. */
  async reset(): Promise<void> {
    if (this.disposed) return
    this.setStatus('saving', '')
    try {
      if (this.scope !== null && this.scopeReady) {
        await this.clearScope()
      } else {
        await this.writeRoute(ROUTES.reset, {})
      }
      this.publish(normalizeConfig(DEFAULT_CONFIG))
      this.setStatus('saved', '')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[dsh-boot-custom] defaults could not be restored:', error)
      this.setStatus('error', message)
    }
  }

  /** Release subscriptions and timers. */
  dispose(): void {
    this.disposed = true
    this.detachSettingsScope()
    this.listeners.clear()
    this.statusListeners.clear()
    if (this.idleTimer !== 0) {
      window.clearTimeout(this.idleTimer)
      this.idleTimer = 0
    }
  }

  /** Publish a replacement to every subscriber. */
  private publish(next: BootAnimationConfig): void {
    this.value = next
    for (const listener of [...this.listeners]) {
      try {
        listener(next)
      } catch (error) {
        console.warn('[dsh-boot-custom] config listener failed:', error)
      }
    }
  }

  /** Update the save status and schedule the idle transition. */
  private setStatus(status: SaveStatus, error: string): void {
    this.status = status
    this.error = error
    for (const listener of [...this.statusListeners]) {
      try {
        listener(status, error)
      } catch (listenerError) {
        console.warn('[dsh-boot-custom] status listener failed:', listenerError)
      }
    }
    if (this.idleTimer !== 0) {
      window.clearTimeout(this.idleTimer)
      this.idleTimer = 0
    }
    if (status === 'saved') {
      this.idleTimer = window.setTimeout(() => {
        this.status = 'idle'
        for (const listener of [...this.statusListeners]) {
          try {
            listener('idle', '')
          } catch {
            // Ignore.
          }
        }
      }, 1800)
    }
  }

  /** Write every top-level field through the settings scope. */
  private async writeScope(config: BootAnimationConfig): Promise<void> {
    const scope = this.scope
    if (scope === null) throw new Error('settings scope is not bound')
    const plain = deepClone(config) as unknown as Record<string, unknown>
    const keys = Object.keys(DEFAULT_CONFIG)
    if (typeof scope.mutate === 'function') {
      const ops = keys
        .filter((key) => key in plain)
        .map((key) => ({ op: 'set' as const, path: [key], value: plain[key] }))
      await scope.mutate(ops)
      return
    }
    for (const key of keys) {
      if (key in plain) await scope.set(key, plain[key])
    }
  }

  /** Clear every top-level field (schema defaults re-apply). */
  private async clearScope(): Promise<void> {
    const scope = this.scope
    if (scope === null) throw new Error('settings scope is not bound')
    const keys = Object.keys(DEFAULT_CONFIG)
    if (typeof scope.mutate === 'function') {
      await scope.mutate(keys.map((key) => ({ op: 'unset' as const, path: [key] })))
      return
    }
    for (const key of keys) await scope.unset(key)
  }

  /** POST to a host route and adopt the returned configuration. */
  private async writeRoute(path: string, body: unknown): Promise<void> {
    const response = await fetch(routeUrl(path), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Required by the host: proves a same-origin script made the request.
        'x-dsh-boot-custom': '1',
      },
      body: JSON.stringify(body),
    })
    const payload = (await response.json().catch(() => ({}))) as RouteResponse
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error ?? `HTTP ${String(response.status)}`)
    }
    if (payload.config !== undefined) {
      this.publish(normalizeConfig(deepMerge(this.value, payload.config)))
    }
  }
}
