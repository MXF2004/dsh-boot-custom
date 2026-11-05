/**
 * In-page update tests.
 *
 * The update button must never build an install spec from browser input: the
 * host resolves the fixed GitHub release, validates its asset URL, and hands
 * that URL to the managed Plugin Manager. These tests pin the version compare,
 * release parsing, route authentication, and the managed-install handoff.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { ROUTES } from '../lib/shared/constants.js'
import {
  beginUpdate,
  checkForUpdate,
  compareVersions,
  manualUpdateCommand,
  parseLatestRelease,
  readUpdateState,
  registerUpdateRoutes,
} from '../lib/host/update.js'

const TOKEN = 'update-session-token'
const ASSET = 'https://github.com/MXF2004/dsh-boot-custom/releases/download/v1.0.5/dsh-boot-custom-1.0.5.tgz'
const RELEASE = 'https://github.com/MXF2004/dsh-boot-custom/releases/tag/v1.0.5'

function releasePayload(overrides = {}) {
  return {
    tag_name: 'v1.0.5',
    html_url: RELEASE,
    body: 'Release notes',
    assets: [
      { name: 'dsh-boot-custom-1.0.5.tgz', browser_download_url: ASSET },
    ],
    ...overrides,
  }
}

function fakeResponse() {
  const result = { status: 0, body: '' }
  return {
    result,
    writeHead(status) {
      result.status = status
    },
    end(body) {
      result.body = typeof body === 'string' ? body : ''
    },
  }
}

function fakeRequest(method, headers, body) {
  return {
    method,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body))
    },
  }
}

/** Wait for the process-wide update state to settle. */
async function waitForPhase(phase, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs
  while (readUpdateState().phase !== phase) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for update phase ${phase}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

test('compareVersions orders stable and prerelease versions', () => {
  assert.equal(compareVersions('1.0.4', '1.0.5'), -1)
  assert.equal(compareVersions('1.0.10', '1.0.9'), 1)
  assert.equal(compareVersions('v1.0.5', '1.0.5'), 0)
  assert.equal(compareVersions('1.0.5-rc.1', '1.0.5'), -1)
  assert.equal(compareVersions('1.0.5', '1.0.5-rc.1'), 1)
  assert.equal(compareVersions('1.0.5-rc.2', '1.0.5-rc.10'), -1)
  assert.equal(compareVersions('not-a-version', '1.0.5'), 0)
})

test('parseLatestRelease accepts only the fixed repository asset', () => {
  const found = parseLatestRelease(releasePayload(), '1.0.4', true)
  assert.equal(found.ok, true)
  assert.equal(found.latest, '1.0.5')
  assert.equal(found.available, true)
  assert.equal(found.assetUrl, ASSET)
  assert.equal(found.releaseUrl, RELEASE)

  const current = parseLatestRelease(releasePayload({ tag_name: 'v1.0.4' }), '1.0.4', true)
  assert.equal(current.ok, true)
  assert.equal(current.available, false)

  const foreign = parseLatestRelease(
    releasePayload({
      assets: [
        {
          name: 'dsh-boot-custom-1.0.5.tgz',
          browser_download_url: 'https://evil.example/dsh-boot-custom-1.0.5.tgz',
        },
      ],
    }),
    '1.0.4',
    true,
  )
  assert.equal(foreign.ok, false)

  const noAsset = parseLatestRelease(releasePayload({ assets: [] }), '1.0.4', true)
  assert.equal(noAsset.ok, false)
})

test('checkForUpdate reports HTTP and network failures without throwing', async () => {
  const ok = await checkForUpdate({
    current: '1.0.4',
    canApply: true,
    fetch: async () => new Response(JSON.stringify(releasePayload()), { status: 200 }),
  })
  assert.equal(ok.ok, true)
  assert.equal(ok.latest, '1.0.5')

  const http = await checkForUpdate({
    current: '1.0.4',
    canApply: true,
    fetch: async () => new Response('no', { status: 404 }),
  })
  assert.equal(http.ok, false)
  assert.match(http.error, /404/)

  const network = await checkForUpdate({
    current: '1.0.4',
    canApply: true,
    fetch: async () => {
      throw new Error('offline')
    },
  })
  assert.equal(network.ok, false)
  assert.match(network.error, /offline/)
})

test('beginUpdate hands the validated asset to Plugin Manager', async () => {
  const calls = []
  const manager = {
    installBundle(spec, options) {
      calls.push({ spec, options })
      return Promise.resolve({ application: 'applied' })
    },
  }
  const info = {
    current: '1.0.4',
    latest: '1.0.5',
    available: true,
    canApply: true,
    assetUrl: ASSET,
  }
  const started = beginUpdate(info, manager)
  assert.equal(started.ok, true)
  assert.equal(readUpdateState().phase, 'running')

  await waitForPhase('done')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].spec, ASSET)
  assert.equal(calls[0].options.enabled, true)
  assert.equal(calls[0].options.saveExact, true)
  assert.equal(typeof calls[0].options.requestId, 'string')
  assert.equal(readUpdateState().phase, 'done')
})

test('beginUpdate refuses an unavailable manager and a stale release', () => {
  const info = {
    current: '1.0.4',
    latest: '1.0.5',
    available: true,
    canApply: false,
    assetUrl: ASSET,
  }
  const manual = beginUpdate(info, undefined)
  assert.equal(manual.ok, false)
  assert.equal(manual.status, 503)
  assert.match(manual.manual, /dsh plugin --profile .* add /)
  assert.match(manual.manual, /dsh-boot-custom-1\.0\.5\.tgz/)

  const stale = beginUpdate({ ...info, available: false }, { installBundle: async () => undefined })
  assert.equal(stale.ok, false)
  assert.equal(stale.status, 409)

  assert.match(manualUpdateCommand(ASSET), /dsh plugin --profile .* add /)
})

test('update routes enforce the token and start the managed install', async () => {
  const routes = new Map()
  const calls = []
  const manager = {
    installBundle(spec, options) {
      calls.push({ spec, options })
      return Promise.resolve({ application: 'restart-required' })
    },
  }
  const info = {
    current: '1.0.4',
    latest: '1.0.5',
    available: true,
    canApply: true,
    assetUrl: ASSET,
    releaseUrl: RELEASE,
  }
  const ctx = {
    webServer: {
      register(route) {
        routes.set(route.path, route.handler)
        return () => undefined
      },
    },
    effect(callback) {
      callback()
    },
  }
  registerUpdateRoutes(ctx, TOKEN, {
    manager,
    check: async () => ({ ok: true, ...info }),
  })

  const update = routes.get(ROUTES.update)
  const status = routes.get(ROUTES.updateStatus)
  assert.equal(typeof update, 'function')
  assert.equal(typeof status, 'function')

  const denied = fakeResponse()
  await update(fakeRequest('GET', { host: '127.0.0.1:4507' }), denied)
  assert.equal(denied.result.status, 403)

  const checked = fakeResponse()
  await update(
    fakeRequest('GET', {
      host: '127.0.0.1:4507',
      'x-dsh-boot-custom-token': TOKEN,
    }),
    checked,
  )
  assert.equal(checked.result.status, 200)
  assert.equal(JSON.parse(checked.result.body).latest, '1.0.5')

  const started = fakeResponse()
  await update(
    fakeRequest(
      'POST',
      {
        host: '127.0.0.1:4507',
        'content-type': 'application/json',
        'x-dsh-boot-custom': '1',
        'x-dsh-boot-custom-token': TOKEN,
      },
      {},
    ),
    started,
  )
  assert.equal(started.result.status, 202)
  await waitForPhase('done')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].spec, ASSET)

  const statusResponse = fakeResponse()
  await status(
    fakeRequest('GET', {
      host: '127.0.0.1:4507',
      'x-dsh-boot-custom-token': TOKEN,
    }),
    statusResponse,
  )
  assert.equal(statusResponse.result.status, 200)
  const state = JSON.parse(statusResponse.result.body).state
  assert.equal(state.phase, 'done')
  assert.equal(state.restartRequired, true)
})