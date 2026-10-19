/**
 * End-to-end settings write-path test.
 *
 * A real `node:http` server hosts `registerConfigRoutes()` and a real file
 * store; the real browser `ClientConfigStore` (bundled from source) saves and
 * resets through `fetch`. This is the path the old suite never exercised.
 */

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

import { HostConfigStore } from '../lib/host/store.js'
import { registerConfigRoutes } from '../lib/host/routes.js'
import { normalizeConfig } from '../lib/shared/config.js'
import { DEFAULT_CONFIG } from '../lib/shared/defaults.js'

const entry = fileURLToPath(new URL('../src/client/settings/store.ts', import.meta.url))
const bundle = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: ['chrome120'],
  logLevel: 'silent',
})
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
const { ClientConfigStore } = await import(moduleUrl)

/** Install the subset of browser globals the client store needs. */
function installDom(url) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url,
    pretendToBeVisual: true,
  })
  const { window } = dom
  for (const [key, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    getComputedStyle: window.getComputedStyle.bind(window),
  })) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
  return dom
}

/** Run one server + real store + real client store scenario. */
async function withRouteHarness(body) {
  const profile = mkdtempSync(join(tmpdir(), 'dba-route-'))
  const previousProfile = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = profile
  const hostStore = new HostConfigStore({}, {})
  const routes = new Map()
  const token = 'route-test-token'
  registerConfigRoutes(
    {
      webServer: {
        register(route) {
          routes.set(route.path, route.handler)
          return () => undefined
        },
      },
      effect(callback) {
        callback()
      },
    },
    hostStore,
    token,
  )
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    const handler = routes.get(path)
    if (handler === undefined) {
      res.writeHead(404)
      res.end()
      return
    }
    void handler(req, res)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const dom = installDom(`http://127.0.0.1:${port}/`)
  globalThis.__BOOT_ANIM_CONFIG__ = normalizeConfig({ enabled: true, logo: { text: 'Initial' } })
  globalThis.__BOOT_ANIM_META__ = {
    name: 'dsh-boot-custom',
    version: '1.0.2',
    writeMode: 'file',
    writeToken: token,
  }
  try {
    await body({ hostStore, token, port })
  } finally {
    server.close()
    hostStore.dispose()
    dom.window.close()
    if (previousProfile === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previousProfile
    rmSync(profile, { recursive: true, force: true })
  }
}

test('the real client store saves and resets through the real host route', async () => {
  await withRouteHarness(async ({ hostStore }) => {
    const client = new ClientConfigStore()
    await client.save({ logo: { text: 'WrittenThroughRoute' }, playing: { rate: 1.5 } })
    assert.equal(client.getStatus().status, 'saved')
    assert.equal(hostStore.current().logo.text, 'WrittenThroughRoute')
    assert.equal(hostStore.current().playing.rate, 1.5)

    await client.reset()
    assert.equal(client.getStatus().status, 'saved')
    assert.equal(hostStore.current().logo.text, DEFAULT_CONFIG.logo.text)
    assert.equal(hostStore.current().playing.rate, DEFAULT_CONFIG.playing.rate)
    client.dispose()
  })
})

test('a wrong session token is rejected and reported by the client', async () => {
  await withRouteHarness(async () => {
    const warn = console.warn
    console.warn = () => undefined
    try {
      globalThis.__BOOT_ANIM_META__ = { name: 'dsh-boot-custom', version: '1.0.2', writeMode: 'file', writeToken: 'wrong' }
      const client = new ClientConfigStore()
      await client.save({ logo: { text: 'MustNotPersist' } })
      assert.equal(client.getStatus().status, 'error')
      assert.match(client.getStatus().error, /token|403/i)
      client.dispose()
    } finally {
      console.warn = warn
    }
  })
})
