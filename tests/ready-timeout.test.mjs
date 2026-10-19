/**
 * Readiness-deadline tests with an injected clock.
 *
 * The 4 s UI deadline and the minimum-visible timer used to be untestable
 * because they read the real clock and the real ledger. These tests drive the
 * real implementation with explicit time steps.
 */

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const entry = fileURLToPath(new URL('../src/client/boot/ready.ts', import.meta.url))
const bundle = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  target: ['chrome120'],
  logLevel: 'silent',
})
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
const { createReadySignal } = await import(moduleUrl)

/** A ledger that records timers instead of scheduling them. */
function fakeLedger() {
  const intervals = []
  const timeouts = []
  return {
    intervals,
    timeouts,
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
}

test('the UI deadline resolves an app that never becomes ready', async () => {
  const ledger = fakeLedger()
  let now = 0
  const signal = createReadySignal({
    ledger,
    ctx: { on: () => () => undefined },
    minVisibleMs: 0,
    now: () => now,
    uiDeadlineMs: 4000,
    probeIntervalMs: 150,
  })
  assert.equal(ledger.intervals.length, 1)
  const probe = ledger.intervals[0]
  now = 3900
  probe.callback()
  assert.equal(ledger.timeouts.length, 0, 'not yet past the deadline')
  now = 4100
  probe.callback()
  assert.equal(ledger.timeouts.length, 1, 'deadline schedules the finish')
  ledger.timeouts[0].callback()
  await signal.promise
})

test('app/ready waits for the minimum visible time and then resolves', async () => {
  const ledger = fakeLedger()
  let now = 0
  let readyListener
  const signal = createReadySignal({
    ledger,
    ctx: {
      on(_event, listener) {
        readyListener = listener
        return () => undefined
      },
    },
    minVisibleMs: 900,
    now: () => now,
    uiDeadlineMs: 4000,
    probeIntervalMs: 150,
  })
  readyListener()
  assert.equal(ledger.timeouts.length, 1)
  assert.equal(ledger.timeouts[0].ms, 900)
  now = 900
  ledger.timeouts[0].callback()
  await signal.promise
})

test('a preview has a fixed lifetime and no DOM probe', async () => {
  const ledger = fakeLedger()
  const signal = createReadySignal({
    ledger,
    ctx: { on: () => () => undefined },
    minVisibleMs: 0,
    previewMs: 1250,
    now: () => 0,
  })
  assert.equal(ledger.intervals.length, 0)
  assert.equal(ledger.timeouts[0].ms, 1250)
  ledger.timeouts[0].callback()
  await signal.promise
})
