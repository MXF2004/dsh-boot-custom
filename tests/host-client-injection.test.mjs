/**
 * Host → client injection integration test.
 *
 * The host test suite and the client suite used to agree with hand-written
 * literals rather than with each other. This test takes the real row table
 * produced by `buildInjectionRows()`, crosses the JSON serialization boundary
 * used by index.html, and feeds it to the real browser-side reader.
 */

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

import { buildInjectionRows } from '../lib/host/first-frame.js'
import { GLOBALS } from '../lib/shared/constants.js'
import { normalizeConfig } from '../lib/shared/config.js'

const entry = new URL('../src/client/runtime/env.ts', import.meta.url)
const bundle = await build({
  entryPoints: [fileURLToPath(entry)],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  target: ['chrome120'],
  logLevel: 'silent',
})
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
const env = await import(moduleUrl)

/** Apply the two global rows exactly as the host renders them. */
function applyRows(rows) {
  for (const row of rows) {
    if (row.kind !== 'global') continue
    globalThis[row.name] = JSON.parse(JSON.stringify(row.value))
  }
}

test('real host rows are consumable by the real client reader', () => {
  const config = normalizeConfig({
    enabled: true,
    logo: { text: 'Injected logo' },
    greeting: { enabled: true, mode: 'fixed', fixedText: 'Injected greeting' },
    videos: ['https://example.test/intro.mp4'],
    audio: { enabled: true, source: 'custom', file: 'https://example.test/boot.mp3' },
  })
  const meta = {
    name: 'dsh-boot-custom',
    version: '1.0.2',
    writeMode: 'file',
    writeToken: 'session-token',
  }
  const rows = buildInjectionRows(config, meta)
  assert.deepEqual(
    rows.filter((row) => row.kind === 'global').map((row) => row.name),
    [GLOBALS.config, GLOBALS.meta],
    'the global row names are the ones the client consumes',
  )
  applyRows(rows)

  const consumed = env.readInjectedConfig()
  assert.equal(consumed.logo.text, 'Injected logo')
  assert.equal(consumed.greeting.fixedText, 'Injected greeting')
  assert.deepEqual(consumed.videos, ['https://example.test/intro.mp4'])
  assert.equal(consumed.audio.file, 'https://example.test/boot.mp3')

  const consumedMeta = env.readInjectedMeta()
  assert.equal(consumedMeta.version, '1.0.2')
  assert.equal(consumedMeta.writeMode, 'file')
  assert.equal(consumedMeta.writeToken, 'session-token')
})

test('the disabled branch still reaches the client as a complete config', () => {
  const rows = buildInjectionRows(normalizeConfig({ enabled: false }), {
    name: 'dsh-boot-custom',
    version: '1.0.2',
    writeMode: 'settings',
  })
  assert.equal(rows.filter((row) => row.kind === 'style').length, 0)
  applyRows(rows)
  assert.equal(env.readInjectedConfig().enabled, false)
  assert.equal(env.readInjectedMeta().writeMode, 'settings')
})
