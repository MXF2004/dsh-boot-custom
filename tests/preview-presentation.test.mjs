/**
 * Preview presentation tests.
 *
 * The Settings modal is a body-level portal owned by the shell. A preview
 * hides it in place (never closes it), so the active section and the user's
 * draft survive. These tests exercise the real module through an in-memory
 * esbuild transform, which keeps the assertion on the shipped source rather
 * than a copy.
 */

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

const dom = new JSDOM(
  `<!doctype html><html><body>
    <div id="settings-portal" role="presentation" style="visibility: visible">
      <div data-shortcut-modal="settings"><input id="draft-field" value="draft"></div>
    </div>
  </body></html>`,
  { url: 'http://127.0.0.1:4507/' },
)

for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
})) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
}

const entry = fileURLToPath(new URL('../src/client/runtime/preview-presentation.ts', import.meta.url))
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
const { hideSettingsForPreview } = await import(moduleUrl)

/** The fake settings portal in the jsdom document. */
function portal() {
  const node = dom.window.document.getElementById('settings-portal')
  assert.ok(node)
  return node
}

test('hides the settings portal, releases focus and restores inline styles exactly', () => {
  const root = portal()
  const field = dom.window.document.getElementById('draft-field')
  field.focus()
  assert.equal(dom.window.document.activeElement, field)

  const restore = hideSettingsForPreview()
  assert.equal(dom.window.document.documentElement.classList.contains('dba-previewing'), true)
  assert.equal(root.style.visibility, 'hidden')
  assert.equal(root.style.pointerEvents, 'none')
  assert.equal(root.style.opacity, '0')
  assert.notEqual(dom.window.document.activeElement, field, 'focus leaves the hidden dialog')

  restore()
  assert.equal(dom.window.document.documentElement.classList.contains('dba-previewing'), false)
  assert.equal(root.style.visibility, 'visible', 'the previous inline visibility is restored')
  assert.equal(root.style.pointerEvents, '')
  assert.equal(root.style.opacity, '')
})

test('is idempotent and refcounted across overlapping preview starts', () => {
  const root = portal()
  const first = hideSettingsForPreview()
  const second = hideSettingsForPreview()
  assert.equal(root.style.visibility, 'hidden')

  first()
  first()
  assert.equal(root.style.visibility, 'hidden', 'the second preview still owns the hide')
  assert.equal(dom.window.document.documentElement.classList.contains('dba-previewing'), true)

  second()
  assert.equal(root.style.visibility, 'visible')
  assert.equal(dom.window.document.documentElement.classList.contains('dba-previewing'), false)
})

test('does nothing dangerous when the settings portal is absent', () => {
  const root = portal()
  root.remove()
  const restore = hideSettingsForPreview()
  assert.equal(dom.window.document.documentElement.classList.contains('dba-previewing'), true)
  restore()
  assert.equal(dom.window.document.documentElement.classList.contains('dba-previewing'), false)
  assert.equal(root.style.visibility, 'visible', 'an absent portal keeps its previous inline style')
})
