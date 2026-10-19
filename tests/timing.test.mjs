/** Hard-timeout arithmetic: the budget counts from the first-frame paint. */

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const entry = fileURLToPath(new URL('../src/client/boot/timing.ts', import.meta.url))
const output = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  target: ['chrome120'],
  logLevel: 'silent',
})
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`
const { remainingHardTimeoutMs } = await import(moduleUrl)

test('the hard timeout is reduced by time already spent on the mask', () => {
  assert.equal(remainingHardTimeoutMs(0), 20_000)
  assert.equal(remainingHardTimeoutMs(5_000), 15_000)
  assert.equal(remainingHardTimeoutMs(25_000), 0)
  assert.equal(remainingHardTimeoutMs(-1), 20_000)
  assert.equal(remainingHardTimeoutMs(Number.NaN), 20_000)
})
