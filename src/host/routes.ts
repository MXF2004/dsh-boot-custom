/**
 * Host HTTP routes for the settings panel.
 *
 * These routes are the write/read path for every host that does not expose a
 * browser-side settings service (and the fallback for the 0.1.7 config editor
 * path). They are plain `node:http` handlers registered on `ctx.webServer`.
 *
 * Failure policy: every handler is wrapped, returns JSON in every branch, and
 * never lets an exception reach the server's request lifecycle.
 *
 * @module dsh-boot-custom/host/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import { ROUTES } from '../shared/constants.js'
import { deepMerge, normalizeConfig } from '../shared/config.js'
import { LIMITS, type BootAnimationConfig, type ConfigWriteMode } from '../shared/types.js'

/** Minimal structural face of the web-server service. */
export interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** Host context needed to mount the routes. */
export interface RouteHostContext {
  webServer?: WebServerLike
  effect(callback: () => (() => void) | void, label?: string): void
}

/** Store face consumed by the routes. */
export interface RouteConfigStore {
  readonly mode: ConfigWriteMode
  current(): BootAnimationConfig
  save(next: unknown): Promise<BootAnimationConfig>
  reset(): Promise<BootAnimationConfig>
}

/** JSON response body. */
interface ConfigResponse {
  ok: boolean
  writeMode?: ConfigWriteMode
  config?: BootAnimationConfig
  error?: string
}

/** Send a JSON response with the headers that keep it inert. */
function sendJson(res: ServerResponse, status: number, payload: ConfigResponse): void {
  try {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
    })
    res.end(body)
  } catch {
    try {
      res.writeHead(500)
      res.end()
    } catch {
      // The socket may already be gone.
    }
  }
}

/** Read a size-capped JSON request body. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer)
    size += buffer.length
    if (size > LIMITS.maxBodyBytes) throw new Error('request body is too large')
    chunks.push(buffer)
  }
  if (size === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  return JSON.parse(text) as unknown
}

/**
 * True when the request's Host header is a loopback authority. DNS rebinding
 * keeps the browser's Origin but changes Host; rejecting non-loopback Hosts
 * prevents a remote page from reaching the local write server.
 */
export function isLoopbackHost(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  const host = value.trim().toLowerCase()
  let name = host
  if (host.startsWith('[')) {
    const end = host.indexOf(']')
    if (end < 0) return false
    name = host.slice(0, end + 1)
  } else {
    const first = host.indexOf(':')
    if (first >= 0 && first === host.lastIndexOf(':')) name = host.slice(0, first)
  }
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]' || name === '::1'
}

/** True when the request carries the host-generated session token. */
function hasWriteToken(req: IncomingMessage, token: string): boolean {
  if (token.length === 0) return false
  const header = req.headers['x-dsh-boot-custom-token']
  return typeof header === 'string' && header === token
}

/**
 * Reject cross-origin writes. A same-origin `fetch` sends an Origin header; a
 * mismatching one means another page is driving the local server.
 */
function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin.length === 0) return true
  try {
    const parsed = new URL(origin)
    const host = req.headers.host
    return typeof host === 'string' && parsed.host === host
  } catch {
    return false
  }
}

/** Host + session-token guard shared by reads and writes. */
function authorizeRequest(req: IncomingMessage, token: string): string | undefined {
  if (!isLoopbackHost(req.headers.host)) return 'loopback host required'
  if (!hasWriteToken(req, token)) return 'missing plugin session token'
  if (!isSameOrigin(req)) return 'cross-origin request refused'
  return undefined
}

/** Method + content-type + host/token guard shared by the write routes. */
function authorizeWrite(req: IncomingMessage, token: string): string | undefined {
  const denied = authorizeRequest(req, token)
  if (denied !== undefined) return denied
  const contentType = req.headers['content-type']
  if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('application/json')) {
    return 'content-type must be application/json'
  }
  // A custom header cannot ride a cross-site simple request, so requiring it
  // doubles as CSRF protection for the local loopback server.
  if (req.headers['x-dsh-boot-custom'] !== '1') return 'missing plugin request header'
  return undefined
}

/** Register the config routes; no-op when the host has no web server. */
export function registerConfigRoutes(
  ctx: RouteHostContext,
  store: RouteConfigStore,
  writeToken: string,
): void {
  const server = ctx.webServer
  if (server === undefined || server === null || typeof server.register !== 'function') {
    console.warn('[dsh-boot-custom] no web server: the settings panel will read injected config only')
    return
  }

  const readHandler = (req: IncomingMessage, res: ServerResponse): void => {
    try {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      const denied = authorizeRequest(req, writeToken)
      if (denied !== undefined) {
        sendJson(res, 403, { ok: false, error: denied })
        return
      }
      sendJson(res, 200, { ok: true, writeMode: store.mode, config: store.current() })
    } catch (error) {
      console.warn('[dsh-boot-custom] config read failed:', error)
      sendJson(res, 500, { ok: false, error: 'config read failed' })
    }
  }

  const writeHandler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      const denied = authorizeWrite(req, writeToken)
      if (denied !== undefined) {
        sendJson(res, 403, { ok: false, error: denied })
        return
      }
      const body = await readJsonBody(req)
      const incoming =
        typeof body === 'object' && body !== null && !Array.isArray(body) && 'config' in body
          ? (body as { config: unknown }).config
          : body
      // A partial patch merges over the current value; arrays replace.
      const merged = normalizeConfig(deepMerge(store.current(), incoming))
      const config = await store.save(merged)
      sendJson(res, 200, { ok: true, writeMode: store.mode, config })
    } catch (error) {
      console.warn('[dsh-boot-custom] config write failed:', error)
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'config write failed',
      })
    }
  }

  const resetHandler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      const denied = authorizeWrite(req, writeToken)
      if (denied !== undefined) {
        sendJson(res, 403, { ok: false, error: denied })
        return
      }
      // Drain the body so the connection can be reused.
      await readJsonBody(req).catch(() => undefined)
      const config = await store.reset()
      sendJson(res, 200, { ok: true, writeMode: store.mode, config })
    } catch (error) {
      console.warn('[dsh-boot-custom] config reset failed:', error)
      sendJson(res, 500, { ok: false, error: 'config reset failed' })
    }
  }

  const configHandler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method === 'GET') {
      readHandler(req, res)
      return
    }
    await writeHandler(req, res)
  }

  try {
    ctx.effect(() => {
      const disposers: Array<() => void> = []
      try {
        // One exact route per path: the web server rejects duplicate paths, so
        // method dispatch lives inside the handler.
        disposers.push(server.register({ kind: 'exact', path: ROUTES.config, handler: configHandler }))
        disposers.push(server.register({ kind: 'exact', path: ROUTES.reset, handler: resetHandler }))
      } catch (error) {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            // Registration failed part-way; releasing what succeeded is enough.
          }
        }
        throw error
      }
      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            // Idempotent release.
          }
        }
      }
    }, 'dsh-boot-custom: config routes')
  } catch (error) {
    console.warn('[dsh-boot-custom] config routes could not be registered:', error)
  }
}
