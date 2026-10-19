/**
 * Host assembly test: run the real `apply()` with a fake cordis context.
 *
 * This closes the gap between the store/routes unit tests and the actual
 * activation path that registers the index-injection listener and emits the
 * first-frame table.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply } from '../lib/index.js'

test('apply() emits a complete first-frame table and a session token', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dba-apply-'))
  const previous = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = profile
  const listeners = new Map()
  const disposers = []
  const routes = new Map()
  const ctx = {
    on(event, listener) {
      listeners.set(event, listener)
      return () => undefined
    },
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    webServer: {
      register(route) {
        routes.set(route.path, route.handler)
        return () => undefined
      },
    },
  }
  try {
    apply(ctx, { enabled: true, logo: { text: 'Applied host' } })
    assert.equal(listeners.has('webserver/index-inject'), true)
    assert.equal(routes.has('/plugins/dsh-boot-custom/config'), true)
    const table = []
    listeners.get('webserver/index-inject')(table)
    const config = table.find((row) => row.kind === 'global' && row.name === '__BOOT_ANIM_CONFIG__')
    const meta = table.find((row) => row.kind === 'global' && row.name === '__BOOT_ANIM_META__')
    assert.equal(config.value.logo.text, 'Applied host')
    assert.equal(typeof meta.value.writeToken, 'string')
    assert.ok(meta.value.writeToken.length >= 32)
    assert.equal(meta.value.version, '1.0.2')
    assert.ok(table.some((row) => row.kind === 'script'))
  } finally {
    for (const dispose of disposers) dispose()
    if (previous === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previous
    rmSync(profile, { recursive: true, force: true })
  }
})
