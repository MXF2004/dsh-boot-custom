/**
 * Full settings-panel accessibility gate.
 *
 * Renders the real panel (all sections, ~50 controls) in jsdom and runs the
 * WCAG A/AA axe rules. This catches unnamed controls that the primitive-level
 * test cannot see.
 */

import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { normalizeConfig } from '../lib/shared/config.js'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1/',
  pretendToBeVisual: true,
})
const { window } = dom
window.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent() {
    return false
  },
})
for (const [key, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  getComputedStyle: window.getComputedStyle.bind(window),
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
}
const { default: axe } = await import('axe-core')

const entry = fileURLToPath(new URL('../src/client/settings/panel.tsx', import.meta.url))
const bundle = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: ['chrome120'],
  external: ['react'],
  logLevel: 'silent',
})
const generated = new URL('../.tmp/panel-a11y.mjs', import.meta.url)
mkdirSync(new URL('../.tmp', import.meta.url), { recursive: true })
writeFileSync(generated, bundle.outputFiles[0].text, 'utf8')
const { createSettingsPanel } = await import(pathToFileURL(fileURLToPath(generated)).href)

/** Minimal store/bridge used by the panel when it is only being rendered. */
function fakeDeps() {
  const config = normalizeConfig({})
  return {
    store: {
      current: () => config,
      getStatus: () => ({ status: 'idle', error: '' }),
      subscribe: () => () => undefined,
      subscribeStatus: () => () => undefined,
      writeMode: 'file',
      save: async () => undefined,
      reset: async () => undefined,
    },
    preview: () => undefined,
    updatePreview: () => undefined,
  }
}

test('the full settings panel has accessible names and no critical axe findings', async () => {
  const Panel = createSettingsPanel(fakeDeps())
  const root = createRoot(window.document.getElementById('root'))
  await act(async () => {
    root.render(React.createElement(Panel, { close: () => undefined }))
  })

  const controls = Array.from(window.document.querySelectorAll('input, select, textarea, button'))
  assert.ok(controls.length > 30, 'the panel renders its full control set')
  for (const control of controls) {
    const tag = control.tagName.toLowerCase()
    const id = control.getAttribute('id')
    const ariaLabel = control.getAttribute('aria-label')
    const label = id === null ? null : window.document.querySelector(`label[for="${id}"]`)
    const text = (control.textContent ?? '').trim()
    const title = control.getAttribute('title')
    assert.ok(
      ariaLabel !== null || label !== null || text.length > 0 || title !== null,
      `${tag} has an accessible name: ${control.outerHTML.slice(0, 300)}`,
    )
  }

  const results = await axe.run(window.document.getElementById('root'), {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    rules: { 'color-contrast': { enabled: false } },
  })
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  )
  assert.deepEqual(
    blocking.map((violation) => violation.id),
    [],
    'axe reports no critical/serious WCAG A/AA violations',
  )
  await act(async () => {
    root.unmount()
  })
})
