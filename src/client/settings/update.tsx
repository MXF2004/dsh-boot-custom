/**
 * In-page update card for the "开机动画" settings page.
 *
 * Checking and installing happen on the host; this component only renders the
 * release state and polls the host's update status. The host validates the
 * loopback origin and per-activation token, and the asset URL is resolved from
 * the fixed GitHub repository, never from the browser.
 *
 * @module dsh-boot-custom/client/settings/update
 */

import * as React from 'react'

import { PLUGIN_VERSION, ROUTES } from '../../shared/constants.js'
import { readInjectedMeta } from '../runtime/env.js'
import { Button, Notice, Section } from './controls.js'

const h = React.createElement

type Phase =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'starting'
  | 'running'
  | 'done'
  | 'failed'

interface UiState {
  phase: Phase
  current: string
  latest?: string
  canApply?: boolean
  releaseUrl?: string
  message?: string
  manual?: string
}

interface JsonResult {
  status: number
  ok: boolean
  payload: Record<string, unknown>
}

/** Resolve a route against the document base. */
function routeUrl(path: string): string {
  const relative = path.replace(/^\//, '')
  try {
    return new URL(relative, document.baseURI).toString()
  } catch {
    return relative
  }
}

/** Headers proving this request came from the host-injected page. */
function authHeaders(): Record<string, string> {
  const token = readInjectedMeta()?.writeToken
  return token === undefined || token.length === 0 ? {} : { 'x-dsh-boot-custom-token': token }
}

/** Fetch JSON with a bounded timeout and no HTTP throw. */
async function fetchJson(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<JsonResult> {
  try {
    const headers = new Headers(init.headers)
    if (!headers.has('accept')) headers.set('accept', 'application/json')
    const response = await fetch(routeUrl(path), {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    return { status: response.status, ok: response.ok, payload }
  } catch (error) {
    return {
      status: 0,
      ok: false,
      payload: { error: error instanceof Error ? error.message : '网络请求失败' },
    }
  }
}

function text(payload: Record<string, unknown>, key: string): string | undefined {
  return typeof payload[key] === 'string' ? payload[key] : undefined
}

function bool(payload: Record<string, unknown>, key: string): boolean | undefined {
  return typeof payload[key] === 'boolean' ? payload[key] : undefined
}

/** Update card. Renders nothing that could block the rest of the panel. */
export function UpdateSection(): React.ReactElement {
  const initialVersion = readInjectedMeta()?.version ?? PLUGIN_VERSION
  const [state, setState] = React.useState<UiState>({
    phase: 'idle',
    current: initialVersion,
  })
  const alive = React.useRef(true)
  const checking = React.useRef(false)

  React.useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const check = React.useCallback(async (): Promise<void> => {
    if (checking.current) return
    checking.current = true
    setState((previous) => ({ ...previous, phase: 'checking', message: '正在检查 GitHub Releases…' }))
    const result = await fetchJson(
      ROUTES.update,
      { method: 'GET', headers: authHeaders(), cache: 'no-store' },
      12_000,
    )
    checking.current = false
    if (!alive.current) return
    if (!result.ok || result.payload.ok !== true) {
      setState((previous) => ({
        ...previous,
        phase: 'failed',
        message: text(result.payload, 'error') ?? `检查更新失败（HTTP ${String(result.status)}）`,
      }))
      return
    }
    const current = text(result.payload, 'current') ?? initialVersion
    const latest = text(result.payload, 'latest')
    const available = bool(result.payload, 'available') === true
    const canApply = bool(result.payload, 'canApply') === true
    const releaseUrl = text(result.payload, 'releaseUrl')
    const manual = text(result.payload, 'manual')
    setState({
      phase: available ? 'available' : 'current',
      current,
      latest,
      canApply,
      releaseUrl,
      manual,
      message: available
        ? `发现新版本 v${latest ?? ''}。`
        : `已是最新版本 v${current}。`,
    })
  }, [initialVersion])

  const start = React.useCallback(async (): Promise<void> => {
    const latest = state.latest
    if (latest === undefined) return
    setState((previous) => ({
      ...previous,
      phase: 'starting',
      message: `正在准备更新到 v${latest}…`,
    }))
    const result = await fetchJson(
      ROUTES.update,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dsh-boot-custom': '1',
          ...authHeaders(),
        },
        body: '{}',
      },
      20_000,
    )
    if (!alive.current) return
    if (result.status === 202 || result.payload.ok === true) {
      setState((previous) => ({
        ...previous,
        phase: 'running',
        latest,
        message: `正在更新到 v${latest}… 更新期间请不要关闭 DSH。`,
      }))
      return
    }
    const status = result.payload.ok === false ? result.status : 0
    setState((previous) => ({
      ...previous,
      phase: 'failed',
      message:
        text(result.payload, 'error') ??
        (status === 503
          ? '当前宿主未提供页面内更新，请使用下面的命令手动更新。'
          : `启动更新失败（HTTP ${String(status)}）`),
      manual: text(result.payload, 'manual') ?? previous.manual,
    }))
  }, [state.latest])

  // Poll while the host installs. A plugin reload can briefly drop the route;
  // report a restart hint rather than leaving the panel stuck in "running".
  React.useEffect(() => {
    if (state.phase !== 'running') return undefined
    let cancelled = false
    let failures = 0
    const tick = async (): Promise<void> => {
      const result = await fetchJson(
        ROUTES.updateStatus,
        { method: 'GET', headers: authHeaders(), cache: 'no-store' },
        8_000,
      )
      if (cancelled || !alive.current) return
      if (!result.ok) {
        failures += 1
        if (failures >= 3) {
          setState((previous) => ({
            ...previous,
            phase: 'done',
            message:
              '更新已开始；如果页面没有自动恢复，请完全退出并重启 DSH 后查看版本。',
          }))
        }
        return
      }
      const raw = result.payload.state
      const hostState =
        typeof raw === 'object' && raw !== null && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {}
      const phase = text(hostState, 'phase')
      if (phase === 'done') {
        const latest = text(hostState, 'latest') ?? state.latest
        setState((previous) => ({
          ...previous,
          phase: 'done',
          latest,
          message: `更新完成：v${latest ?? ''}。请完全退出并重启 DSH 以加载新版本。`,
        }))
      } else if (phase === 'failed') {
        setState((previous) => ({
          ...previous,
          phase: 'failed',
          message: text(hostState, 'error') ?? '更新失败，请手动更新。',
        }))
      }
    }
    const timer = window.setInterval(() => void tick(), 1_500)
    void tick()
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [state.phase, state.latest])

  const busy =
    state.phase === 'checking' || state.phase === 'starting' || state.phase === 'running'
  const showUpdate = state.phase === 'available' && state.canApply !== false
  const tone =
    state.phase === 'failed' ? 'error' : state.phase === 'available' ? 'info' : 'info'

  return h(
    Section,
    { title: '插件更新', hint: '从 GitHub Releases 检查并安装新版本', defaultOpen: true },
    h(
      'div',
      { className: 'dba-set-inline' },
      h('span', { className: 'dba-set-count' }, `当前版本 v${state.current}`),
      h(
        Button,
        {
          onClick: () => void check(),
          disabled: busy,
        },
        state.phase === 'checking' ? '检查中…' : '检查更新',
      ),
      showUpdate
        ? h(
            Button,
            {
              variant: 'primary',
              onClick: () => void start(),
              disabled: busy,
            },
            `更新到 v${state.latest ?? ''}`,
          )
        : null,
      state.releaseUrl !== undefined &&
      state.releaseUrl.startsWith('https://github.com/')
        ? h(
            'a',
            {
              className: 'dba-set-count',
              href: state.releaseUrl,
              target: '_blank',
              rel: 'noreferrer',
            },
            '更新说明',
          )
        : null,
    ),
    state.message === undefined
      ? null
      : h(Notice, { tone }, state.message),
    state.manual === undefined
      ? null
      : h(
          Notice,
          { tone: 'warn' },
          h('code', { className: 'dba-set-mono' }, state.manual),
        ),
  )
}