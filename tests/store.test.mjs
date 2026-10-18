/**
 * Host configuration-store tests.
 *
 * The 0.2.1 desktop runtime exposes `configEditor.edit(entry, change)` — the
 * entry OBJECT plus a change FUNCTION — which is easy to get wrong. These
 * tests pin that contract and the two fallback layers (settings namespace and
 * the JSON document).
 */

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  HostConfigStore,
  resolveConfigEditor,
  resolveConfigEntry,
} from '../lib/host/store.js'
import { DEFAULT_CONFIG } from '../lib/shared/defaults.js'

/** Run `body` with DSH_PROFILE_DIR pointing at a throwaway directory. */
async function withTempProfile(body) {
  const dir = mkdtempSync(join(tmpdir(), 'dba-store-'))
  const previous = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = dir
  try {
    await body(dir)
  } finally {
    if (previous === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previous
    rmSync(dir, { recursive: true, force: true })
  }
}

test('resolveConfigEditor accepts a direct service and ctx.get', () => {
  const editor = { edit() {} }
  assert.equal(resolveConfigEditor({ configEditor: editor }), editor)
  assert.equal(
    resolveConfigEditor({
      get(name) {
        return name === 'configEditor' ? editor : undefined
      },
    }),
    editor,
  )
  assert.equal(resolveConfigEditor({}), undefined)
})

test('resolveConfigEntry prefers the fiber entry and falls back to the loader', () => {
  const own = { options: { id: 'dsh-boot-custom' } }
  assert.equal(resolveConfigEntry({ fiber: { entry: own } }), own)

  const other = { options: { id: 'other' } }
  const viaLoader = resolveConfigEntry({
    loader: {
      entries() {
        return [other, own]
      },
    },
  })
  assert.equal(viaLoader, own)
  assert.equal(resolveConfigEntry({}), undefined)
})

test('the config-editor store calls edit(entry, changeFn) and returns the next config', async () => {
  const entry = { options: { id: 'dsh-boot-custom' } }
  let captured
  const ctx = {
    fiber: { entry },
    configEditor: {
      edit(nextEntry, change) {
        captured = { entry: nextEntry, change }
        return Promise.resolve('committed')
      },
    },
  }
  const store = new HostConfigStore(ctx, { enabled: true, logo: { text: 'Initial' } })
  assert.equal(store.mode, 'config-editor')
  assert.equal(store.current().logo.text, 'Initial')

  await store.save({ logo: { text: 'Changed' }, videos: ['https://a/1.mp4'] })
  assert.equal(captured.entry, entry, 'the loader entry object is passed, not the row id')
  assert.equal(typeof captured.change, 'function', 'the second argument is a change function')

  const next = captured.change({}, {})
  assert.equal(next.logo.text, 'Changed')
  assert.deepEqual(next.videos, ['https://a/1.mp4'])
  assert.equal(store.current().logo.text, 'Changed')
})

test('the file fallback persists atomically and resets to defaults', async () => {
  await withTempProfile(async (dir) => {
    const store = new HostConfigStore({}, {})
    assert.equal(store.mode, 'file')
    await store.save({ logo: { text: 'FileSaved' }, playing: { rate: 1.5 } })
    const path = join(dir, 'boot-custom', 'config.json')
    assert.equal(existsSync(path), true)
    const persisted = JSON.parse(readFileSync(path, 'utf8'))
    assert.equal(persisted.logo.text, 'FileSaved')
    assert.equal(persisted.playing.rate, 1.5)

    await store.reset()
    assert.equal(store.current().logo.text, DEFAULT_CONFIG.logo.text)
    store.dispose()
  })
})

test('the settings fallback reads overrides, writes through replace and watches commits', async () => {
  await withTempProfile(async () => {
    let user = { logo: { text: 'FromSettings' } }
    let replaced
    const watchers = []
    const scope = {
      get() {
        return { ...DEFAULT_CONFIG, ...user }
      },
      watch(callback) {
        watchers.push(callback)
        return () => undefined
      },
      replace(section) {
        replaced = section
        user = section
        return Promise.resolve()
      },
      update(patch) {
        user = { ...user, ...patch }
        return Promise.resolve()
      },
    }
    const ctx = {
      settings: {
        register() {
          return scope
        },
        describe() {
          return [{ ns: 'boot-custom', user }]
        },
      },
    }

    const store = new HostConfigStore(ctx, {})
    assert.equal(store.mode, 'settings')
    assert.equal(store.current().logo.text, 'FromSettings')

    await store.save({ logo: { text: 'Written' } })
    assert.equal(replaced.logo.text, 'Written')

    // A committed namespace change refreshes the cached value.
    user = { logo: { text: 'ExternallyChanged' } }
    for (const watcher of watchers) watcher()
    assert.equal(store.current().logo.text, 'ExternallyChanged')

    await store.reset()
    assert.deepEqual(replaced, {}, 'reset clears the user section so schema defaults re-apply')
    assert.equal(store.current().logo.text, DEFAULT_CONFIG.logo.text)
    store.dispose()
  })
})
