/** Countdown live-region contract: silent decrement, one unlock announcement. */

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

import { normalizeConfig } from '../lib/shared/config.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://127.0.0.1/',
  pretendToBeVisual: true,
})
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
})) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
}

const entry = fileURLToPath(new URL('../src/client/boot/countdown.ts', import.meta.url))
const output = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: ['chrome120'],
  logLevel: 'silent',
})
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`
const { Countdown } = await import(moduleUrl)

test('the countdown stays silent until unlock and then announces once', () => {
  const intervals = []
  const timeouts = []
  const ledger = {
    interval(callback, ms) {
      intervals.push({ callback, ms })
      return intervals.length
    },
    timeout(callback, ms) {
      timeouts.push({ callback, ms })
      return timeouts.length
    },
    add() {},
  }
  let unlocks = 0
  const config = normalizeConfig({
    allowSkip: true,
    countdown: { enabled: true, seconds: 2 },
  })
  const countdown = new Countdown({
    config,
    ledger,
    onUnlock: () => {
      unlocks += 1
    },
  })
  assert.equal(countdown.element.getAttribute('aria-live'), 'off')
  assert.equal(unlocks, 0)
  intervals[0].callback()
  assert.equal(countdown.element.getAttribute('aria-live'), 'off')
  intervals[0].callback()
  assert.equal(unlocks, 1)
  assert.equal(countdown.element.getAttribute('aria-live'), 'polite')
  assert.equal(countdown.element.getAttribute('aria-atomic'), 'true')
  assert.ok(countdown.element.textContent.trim().length > 0)
  countdown.destroy()
})
