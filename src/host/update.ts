/**
 * In-page update support.
 *
 * The settings panel asks the host to compare its running version with the
 * latest GitHub Release and, when a newer release exists, hands the release
 * tarball to DSH's own Plugin Manager. Using the managed install path (rather
 * than spawning pnpm ourselves) keeps profile locking, bundle validation,
 * rollback and HMR/reload behavior in one place.
 *
 * Update state lives on `globalThis`: a successful HMR reload replaces this
 * module while the client may still be polling, and the state has to survive
 * that reload. The browser sees only GitHub release metadata and the fixed
 * install command; it never chooses an arbitrary install spec.
 *
 * @module dsh-boot-custom/host/update
 */

import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename } from 'node:path'

import { isRecord } from '../shared/config.js'
import { PLUGIN_VERSION, ROUTES, UPDATE } from '../shared/constants.js'
import { authorizeRequest, authorizeWrite, type RouteHostContext } from './routes.js'

/** GitHub release data resolved for the settings panel. */
export interface UpdateInfo {
  current: string
  latest: string
  available: boolean
  /** False when the host cannot apply updates through Plugin Manager. */
  canApply: boolean
  assetUrl?: string
  releaseUrl?: string
  notes?: string
  /** Command to run when the host cannot apply the update itself. */
  manual?: string
}

/** Successful or refused release lookup. */
export type UpdateCheck = ({ ok: true } & UpdateInfo) | { ok: false; error: string }

/** Managed install face of `@deepseek-ai/dsh-plugin-manager`. */
export interface PluginManagerLike {
  installBundle(
    spec: string,
    options?: { enabled?: boolean; saveExact?: boolean; requestId?: string },
  ): Promise<unknown>
}

/** Host context needed by the update routes. */
export interface UpdateHostContext extends RouteHostContext {
  get?(name: string): unknown
  pluginManager?: unknown
}

/** Observable update phase shared with the settings panel. */
export interface UpdateState {
  phase: 'idle' | 'running' | 'done' | 'failed'
  current: string
  latest?: string
  startedAt?: number
  finishedAt?: number
  application?: string
  restartRequired?: boolean
  error?: string
}

/** Result of starting an update. */
export type BeginUpdate =
  | { ok: true; state: UpdateState }
  | { ok: false; status: number; error: string; manual?: string }

/** Test seams for the routes. */
export interface UpdateRouteOptions {
  check?(current: string, canApply: boolean): Promise<UpdateCheck>
  manager?: PluginManagerLike
}

const STATE_KEY = Symbol.for('dsh-boot-custom.update-state')

interface GlobalWithState {
  [STATE_KEY]?: UpdateState
}

/** Copy the current update state for the browser. */
export function readUpdateState(): UpdateState {
  const holder = globalThis as unknown as GlobalWithState
  const state = holder[STATE_KEY]
  if (state === undefined) return { phase: 'idle', current: PLUGIN_VERSION }
  return { ...state }
}

/** Replace the process-wide update state. */
function writeUpdateState(next: UpdateState): void {
  ;(globalThis as unknown as GlobalWithState)[STATE_KEY] = next
}

interface ParsedVersion {
  core: [number, number, number]
  prerelease: string[]
}

/** Parse `v1.2.3[-pre][+build]`; undefined for anything else. */
export function parseVersion(value: string): ParsedVersion | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    value.trim(),
  )
  if (match === null) return undefined
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) {
    return undefined
  }
  const prerelease = match[4] === undefined ? [] : match[4].split('.')
  return { core: [major, minor, patch], prerelease }
}

/** Compare two semantic versions; 0 when either input is unparsable. */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === undefined || b === undefined) return 0
  for (let index = 0; index < 3; index += 1) {
    const delta = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (delta !== 0) return delta > 0 ? 1 : -1
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0
  if (a.prerelease.length === 0) return 1
  if (b.prerelease.length === 0) return -1
  const length = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const one = a.prerelease[index]
    const two = b.prerelease[index]
    if (one === undefined) return -1
    if (two === undefined) return 1
    if (one === two) continue
    const oneNumeric = /^\d+$/.test(one)
    const twoNumeric = /^\d+$/.test(two)
    if (oneNumeric && twoNumeric) return Number(one) > Number(two) ? 1 : -1
    if (oneNumeric) return -1
    if (twoNumeric) return 1
    return one > two ? 1 : -1
  }
  return 0
}

/** Read one release payload without trusting anything beyond the fixed repo. */
export function parseLatestRelease(
  payload: unknown,
  current: string,
  canApply: boolean,
): UpdateCheck {
  if (!isRecord(payload)) return { ok: false, error: 'GitHub release payload is not an object' }
  const tag = typeof payload.tag_name === 'string' ? payload.tag_name : ''
  const version = tag.replace(/^v/i, '')
  if (parseVersion(version) === undefined) {
    return { ok: false, error: 'GitHub release has no valid version tag' }
  }
  const releaseUrl =
    typeof payload.html_url === 'string' && payload.html_url.startsWith('https://github.com/')
      ? payload.html_url
      : `https://github.com/${UPDATE.repo}/releases/tag/${tag}`
  const assets = Array.isArray(payload.assets) ? payload.assets : []
  let assetUrl: string | undefined
  for (const asset of assets) {
    if (!isRecord(asset)) continue
    const name = typeof asset.name === 'string' ? asset.name : ''
    const url = typeof asset.browser_download_url === 'string' ? asset.browser_download_url : ''
    if (name.startsWith('dsh-boot-custom-') && name.endsWith('.tgz') && url.startsWith(UPDATE.assetPrefix)) {
      assetUrl = url
      break
    }
  }
  if (assetUrl === undefined) {
    return { ok: false, error: 'latest GitHub release has no installable .tgz asset' }
  }
  return {
    ok: true,
    current,
    latest: version,
    available: compareVersions(version, current) > 0,
    canApply,
    assetUrl,
    releaseUrl,
    notes: typeof payload.body === 'string' ? payload.body.slice(0, 4000) : undefined,
  }
}

/** Race a promise against a hard deadline, even if its implementation ignores aborts. */
async function withDeadline<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  try {
    return await Promise.race([operation, deadline])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Query the fixed public repository for its latest release. */
export async function checkForUpdate(options: {
  current: string
  canApply: boolean
  fetch?: typeof fetch
  timeoutMs?: number
}): Promise<UpdateCheck> {
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') return { ok: false, error: 'fetch is unavailable' }
  const timeoutMs = options.timeoutMs ?? 20_000
  try {
    const response = await withDeadline(
      fetchImpl(UPDATE.api, {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': `dsh-boot-custom/${options.current}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      }),
      timeoutMs,
      'GitHub release lookup timed out',
    )
    if (!response.ok) return { ok: false, error: `GitHub API HTTP ${String(response.status)}` }
    return parseLatestRelease(await response.json(), options.current, options.canApply)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'GitHub release lookup failed',
    }
  }
}

/** Resolve the Plugin Manager service without assuming it is active. */
export function resolvePluginManager(ctx: UpdateHostContext): PluginManagerLike | undefined {
  const probe = (value: unknown): PluginManagerLike | undefined => {
    if (!isRecord(value) || typeof value.installBundle !== 'function') return undefined
    return value as unknown as PluginManagerLike
  }
  try {
    const viaGet = ctx.get?.('pluginManager')
    const found = probe(viaGet)
    if (found !== undefined) return found
  } catch {
    // A guarded service facade may throw on property lookup.
  }
  try {
    return probe(ctx.pluginManager)
  } catch {
    return undefined
  }
}

/** Manual fallback shown when the host has no Plugin Manager. */
export function manualUpdateCommand(assetUrl: string): string {
  const profileDir = process.env.DSH_PROFILE_DIR
  const profile = profileDir === undefined || profileDir.length === 0 ? 'desktop' : basename(profileDir)
  return `dsh plugin --profile "${profile}" add "${assetUrl}"`
}

/** Keep only the fields the client needs from an install result. */
function summarizeResult(value: unknown): {
  application?: string
  restartRequired?: boolean
  error?: string
} {
  if (!isRecord(value)) return {}
  const application = typeof value.application === 'string' ? value.application : undefined
  const error = typeof value.error === 'string' ? value.error : undefined
  return {
    ...(application === undefined ? {} : { application }),
    ...(application === 'restart-required' ? { restartRequired: true } : {}),
    ...(error === undefined ? {} : { error }),
  }
}

/** Start a managed install of the release asset and return immediately. */
export function beginUpdate(
  info: UpdateInfo,
  manager: PluginManagerLike | undefined,
): BeginUpdate {
  if (!info.available) return { ok: false, status: 409, error: 'already up to date' }
  const assetUrl = info.assetUrl
  if (assetUrl === undefined) return { ok: false, status: 409, error: 'release has no asset' }
  if (manager === undefined) {
    return {
      ok: false,
      status: 503,
      error: 'host Plugin Manager is unavailable',
      manual: manualUpdateCommand(assetUrl),
    }
  }
  if (readUpdateState().phase === 'running') {
    return { ok: false, status: 409, error: 'an update is already running' }
  }
  const state: UpdateState = {
    phase: 'running',
    current: info.current,
    latest: info.latest,
    startedAt: Date.now(),
  }
  writeUpdateState(state)
  const requestId = randomBytes(12).toString('hex')
  setImmediate(() => {
    let operation: Promise<unknown>
    try {
      operation = manager.installBundle(assetUrl, {
        enabled: true,
        saveExact: true,
        requestId,
      })
    } catch (error) {
      writeUpdateState({
        ...state,
        phase: 'failed',
        finishedAt: Date.now(),
        error: error instanceof Error ? error.message : 'update could not start',
      })
      return
    }
    operation.then(
      (result) => {
        const summary = summarizeResult(result)
        writeUpdateState({
          ...state,
          ...summary,
          phase: summary.application === 'failed' || summary.error !== undefined ? 'failed' : 'done',
          finishedAt: Date.now(),
        })
      },
      (error: unknown) => {
        writeUpdateState({
          ...state,
          phase: 'failed',
          finishedAt: Date.now(),
          error: error instanceof Error ? error.message : 'update failed',
        })
      },
    )
  })
  return { ok: true, state }
}

/** Send one inert JSON response. */
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  try {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
    })
    res.end(JSON.stringify(payload))
  } catch {
    try {
      res.writeHead(500)
      res.end()
    } catch {
      // Socket already gone.
    }
  }
}

/** Drain a small request body so the connection can be reused. */
async function drain(req: IncomingMessage): Promise<void> {
  for await (const _chunk of req) {
    // No body fields are accepted; the checked release decides the asset.
  }
}

/**
 * Register the check/start/status routes.
 *
 * @param ctx - host context with webServer and optional Plugin Manager.
 * @param writeToken - per-activation session token.
 * @param options - test seams.
 */
export function registerUpdateRoutes(
  ctx: UpdateHostContext,
  writeToken: string,
  options: UpdateRouteOptions = {},
): void {
  const server = ctx.webServer
  if (server === undefined || server === null || typeof server.register !== 'function') {
    console.warn('[dsh-boot-custom] no web server: the in-page update button is unavailable')
    return
  }
  const manager = options.manager ?? resolvePluginManager(ctx)
  const check =
    options.check ??
    ((current: string, canApply: boolean) => checkForUpdate({ current, canApply }))
  console.info(
    `[dsh-boot-custom] update button ready (pluginManager=${manager === undefined ? 'unavailable' : 'available'})`,
  )

  const checkHandler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
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
      const activeManager = options.manager ?? resolvePluginManager(ctx)
      const result = await check(PLUGIN_VERSION, activeManager !== undefined)
      const payload =
        result.ok && result.available && !result.canApply && result.assetUrl !== undefined
          ? { ...result, manual: manualUpdateCommand(result.assetUrl) }
          : result
      sendJson(res, result.ok ? 200 : 502, payload)
    } catch (error) {
      console.warn('[dsh-boot-custom] update check failed:', error)
      sendJson(res, 500, { ok: false, error: 'update check failed' })
    }
  }

  const startHandler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
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
      await drain(req)
      const activeManager = options.manager ?? resolvePluginManager(ctx)
      const checked = await check(PLUGIN_VERSION, activeManager !== undefined)
      if (!checked.ok) {
        sendJson(res, 502, checked)
        return
      }
      const began = beginUpdate(checked, activeManager)
      if (!began.ok) {
        sendJson(res, began.status, began)
        return
      }
      sendJson(res, 202, { ok: true, state: began.state })
    } catch (error) {
      console.warn('[dsh-boot-custom] update start failed:', error)
      sendJson(res, 500, { ok: false, error: 'update start failed' })
    }
  }

  const statusHandler = (req: IncomingMessage, res: ServerResponse): void => {
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
      sendJson(res, 200, { ok: true, state: readUpdateState() })
    } catch (error) {
      console.warn('[dsh-boot-custom] update status failed:', error)
      sendJson(res, 500, { ok: false, error: 'update status failed' })
    }
  }

  const updateHandler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method === 'GET') {
      await checkHandler(req, res)
      return
    }
    await startHandler(req, res)
  }

  try {
    ctx.effect(() => {
      const disposers: Array<() => void> = []
      try {
        // One exact route per path: the web server rejects duplicate paths, so
        // GET (check) and POST (start) share a single handler.
        disposers.push(server.register({ kind: 'exact', path: ROUTES.update, handler: updateHandler }))
        disposers.push(
          server.register({ kind: 'exact', path: ROUTES.updateStatus, handler: statusHandler }),
        )
      } catch (error) {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            // Registration failed part-way; release what succeeded.
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
    }, 'dsh-boot-custom: update routes')
  } catch (error) {
    console.warn('[dsh-boot-custom] update routes could not be registered:', error)
  }
}