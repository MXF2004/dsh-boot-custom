/**
 * Accessibility contract for the settings primitives.
 *
 * Every control rendered inside `Row` must receive a real accessible name from
 * the row label, and its hint must be exposed through `aria-describedby`.
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

const entry = fileURLToPath(new URL('../src/client/settings/controls.tsx', import.meta.url))
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
const moduleUrl = new URL('../.tmp/controls-a11y.mjs', import.meta.url)
mkdirSync(new URL('../.tmp', import.meta.url), { recursive: true })
writeFileSync(moduleUrl, bundle.outputFiles[0].text, 'utf8')
const controls = await import(pathToFileURL(fileURLToPath(moduleUrl)).href)

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1/',
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
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  getComputedStyle: window.getComputedStyle.bind(window),
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
}
const { default: axe } = await import('axe-core')

test('row labels and hints are wired to the real controls', async () => {
  const h = React.createElement
  const root = createRoot(window.document.getElementById('root'))
  await act(async () => {
    root.render(
      h(
        React.Fragment,
        null,
        h(
          controls.Row,
          { label: 'Enable sound', hint: 'Muted on autoplay refusal' },
          h(controls.Switch, { checked: false, onChange: () => undefined }),
        ),
        h(controls.Row, { label: 'Greeting text' }, h(controls.TextField, { value: 'Hi', onChange: () => undefined })),
        h(
          controls.Row,
          { label: 'Volume' },
          h(controls.Slider, { value: 50, min: 0, max: 100, step: 1, onChange: () => undefined }),
        ),
        h(
          controls.Row,
          { label: 'Transition' },
          h(controls.Select, {
            value: 'fade',
            options: [{ value: 'fade', label: 'Fade' }],
            onChange: () => undefined,
          }),
        ),
        h(controls.Row, { label: 'Logo color' }, h(controls.ColorField, { value: '#ffffff', onChange: () => undefined })),
        h(controls.Button, { onClick: () => undefined, title: 'Move up' }, '↑'),
        h(controls.Notice, { tone: 'error' }, 'Save failed'),
      ),
    )
  })

  const controlsList = Array.from(window.document.querySelectorAll('input, select'))
  assert.ok(controlsList.length >= 6)
  for (const control of controlsList) {
    const id = control.getAttribute('id')
    const ariaLabel = control.getAttribute('aria-label')
    if (id === null) {
      assert.ok(ariaLabel, `${control.tagName.toLowerCase()} without an id still has aria-label`)
      continue
    }
    const label = window.document.querySelector(`label[for="${id}"]`)
    assert.ok(label, `${control.tagName.toLowerCase()} has a label`)
    assert.ok(label.textContent.trim().length > 0, `${control.tagName.toLowerCase()} label is non-empty`)
    const describedBy = control.getAttribute('aria-describedby')
    if (describedBy !== null) {
      assert.ok(window.document.getElementById(describedBy), 'aria-describedby points to a real hint')
    }
  }

  assert.equal(window.document.querySelector('button[title="Move up"]').getAttribute('aria-label'), 'Move up')
  const notice = window.document.querySelector('[role="alert"]')
  assert.ok(notice)
  assert.equal(notice.getAttribute('aria-live'), 'assertive')

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
