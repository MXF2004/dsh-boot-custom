/**
 * First-frame contract tests.
 *
 * The mask is the only part of the plugin that runs before the app bundle, so
 * its handoff rules are tested against real script execution in a VM:
 *  - `end()` sets the CLAIMED flag before hiding;
 *  - the 12s fallback hides an unclaimed mask;
 *  - the 12s fallback stands down once the client claimed the mask.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'

import { buildFirstFrameMarkup, buildFirstFrameScript, buildFirstFrameStyle, buildInjectionRows } from '../lib/host/first-frame.js'
import { normalizeConfig } from '../lib/shared/config.js'

const MASK_ID = 'dsh-boot-custom-first-frame'

/** Build a minimal document whose mask node and stylesheet record removals. */
function fakeDocument() {
  const removed = []
  const stylesRemoved = []
  const element = {
    style: {},
    parentNode: {
      removeChild(node) {
        removed.push(node)
      },
    },
  }
  const styleSheet = {
    textContent: `/* dsh-boot-custom-first-frame-style */\n#${MASK_ID} { background: #000; } html, body { background: #000 !important; }`,
    parentNode: {
      removeChild(node) {
        stylesRemoved.push(node)
      },
    },
  }
  return {
    element,
    removed,
    styleSheet,
    stylesRemoved,
    document: {
      getElementById(id) {
        return id === MASK_ID ? element : null
      },
      getElementsByTagName(tag) {
        return tag === 'style' ? [styleSheet] : []
      },
    },
  }
}

/** Run the injected script inside a fresh VM context. */
function runScript(script) {
  const { element, removed, document, styleSheet, stylesRemoved } = fakeDocument()
  const timers = []
  const sandbox = {
    document,
    console,
    setTimeout(callback, ms) {
      timers.push({ callback, ms })
      return timers.length
    },
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(script, sandbox)
  return { sandbox, element, removed, timers, styleSheet, stylesRemoved }
}

/** Run the single timer with the requested delay. */
function runTimer(timers, ms) {
  const timer = timers.find((entry) => entry.ms === ms)
  assert.ok(timer, `expected a ${String(ms)}ms timer`)
  timer.callback()
}

test('the script installs the end() hook and hides on claim', () => {
  const { sandbox, element, removed, timers, styleSheet, stylesRemoved } = runScript(buildFirstFrameScript())
  assert.equal(typeof sandbox.__BOOT_ANIM_FIRST_FRAME__, 'object')
  assert.equal(typeof sandbox.__BOOT_ANIM_FIRST_FRAME__.end, 'function')

  sandbox.__BOOT_ANIM_FIRST_FRAME__.end()
  assert.equal(sandbox.__BOOT_ANIM_FIRST_FRAME_CLAIMED__, true)
  assert.equal(element.style.opacity, '0')
  assert.equal(element.style.transition, 'opacity 160ms ease')

  runTimer(timers, 200)
  assert.deepEqual(removed, [element])
  // The injected stylesheet must not outlive the mask: its `html, body`
  // background rule would otherwise override the app theme forever.
  assert.deepEqual(stylesRemoved, [styleSheet])
})

test('the 12s self-defence hides an UNCLAIMED mask', () => {
  const context = runScript(buildFirstFrameScript())
  assert.notEqual(context.element.style.opacity, '0')
  const fallback = context.timers.filter((entry) => entry.ms === 12_000)
  assert.equal(fallback.length, 1)
  fallback[0].callback()
  assert.equal(context.element.style.opacity, '0')
  runTimer(context.timers, 200)
  assert.deepEqual(context.removed, [context.element])
  assert.deepEqual(context.stylesRemoved, [context.styleSheet])
})

test('the 12s self-defence stands down when the client claimed the mask', () => {
  const context = runScript(buildFirstFrameScript())
  context.sandbox.__BOOT_ANIM_FIRST_FRAME_CLAIMED__ = true
  const fallback = context.timers.filter((entry) => entry.ms === 12_000)
  assert.equal(fallback.length, 1)
  fallback[0].callback()
  assert.equal(context.element.style.opacity, undefined)
})

test('the script is idempotent when installed twice', () => {
  const { sandbox } = runScript(buildFirstFrameScript())
  const first = sandbox.__BOOT_ANIM_FIRST_FRAME__
  vm.runInContext(buildFirstFrameScript(), sandbox)
  assert.equal(sandbox.__BOOT_ANIM_FIRST_FRAME__, first)
})

test('the stylesheet and markup are injection-safe and escape user text', () => {
  const config = normalizeConfig({
    enabled: true,
    playing: { background: '#123456' },
    logo: { text: '<img src=x onerror="alert(1)">' },
    greeting: { enabled: true, mode: 'fixed', fixedText: '</style><script>alert(1)</script>' },
  })
  const style = buildFirstFrameStyle(config)
  const markup = buildFirstFrameMarkup(config)
  assert.ok(style.includes('#123456'))
  assert.ok(style.startsWith('/* dsh-boot-custom-first-frame-style */'), 'style has an exact cleanup marker')
  assert.ok(style.includes('pointer-events: none'), 'mask never blocks input')
  assert.ok(style.includes('dba-ff-timeout'), 'CSS-only timeout backs up the injected script')
  assert.equal(style.toLowerCase().includes('</style'), false)
  // Native caption strip: transparent, with light glyphs on this dark surface.
  assert.ok(style.includes('--dsw-specific-sidebar-fill'))
  assert.ok(style.includes('--dsw-alias-label-primary'))
  assert.ok(style.includes('background-color: rgba(0, 0, 0, 0) !important'))
  assert.ok(style.includes('#f9fafb'))
  assert.ok(style.includes('dba-fx-breathe'))
  assert.equal(markup.includes('<img src=x'), false)
  assert.ok(markup.includes('&lt;img src=x'))
  assert.equal(markup.toLowerCase().includes('</style'), false)
  assert.equal(markup.toLowerCase().includes('<script'), false)
  assert.ok(markup.includes('dsh-boot-custom-first-frame'))
  assert.ok(markup.includes('data-css-style="breathe"'))
})

test('the first frame carries the selected CSS animation style', () => {
  const config = normalizeConfig({ cssAnimation: 'aurora' })
  const style = buildFirstFrameStyle(config)
  const markup = buildFirstFrameMarkup(config)
  assert.ok(style.includes(`#${MASK_ID}[data-css-style="aurora"]`))
  assert.ok(style.includes('dba-fx-aurora'))
  assert.ok(style.includes('dba-fx-spin'))
  // The startup HTML must not carry unused style keyframes.
  assert.equal(style.includes('dba-fx-breathe'), false)
  assert.equal(style.includes('dba-fx-stars'), false)
  assert.equal(style.includes(`#${MASK_ID}[data-css-style="starfield"]`), false)
  assert.ok(markup.includes('data-css-style="aurora"'))
})

test('caption fusion follows a light launch background', () => {
  const style = buildFirstFrameStyle(normalizeConfig({ playing: { background: '#f9fafb' } }))
  assert.ok(style.includes('--dsw-specific-sidebar-fill'))
  assert.ok(style.includes('background-color: rgba(0, 0, 0, 0) !important'))
  assert.ok(style.includes('#0f1115'))
})

test('injection rows follow the documented render order', () => {
  const config = normalizeConfig({ enabled: true })
  const rows = buildInjectionRows(config, { name: 'dsh-boot-custom', version: '1.0.1', writeMode: 'file' })
  assert.deepEqual(
    rows.map((row) => `${row.kind}${row.placement === undefined ? '' : `:${row.placement}`}`),
    ['global', 'global', 'style', 'html:body', 'script:body'],
  )
  const globals = rows.filter((row) => row.kind === 'global')
  assert.equal(globals[0].name, '__BOOT_ANIM_CONFIG__')
  assert.equal(globals[1].name, '__BOOT_ANIM_META__')
  assert.equal(globals[1].value.writeMode, 'file')
})

test('a disabled plugin injects the config global but no mask', () => {
  const config = normalizeConfig({ enabled: false })
  const rows = buildInjectionRows(config, { name: 'dsh-boot-custom', version: '1.0.1', writeMode: 'settings' })
  assert.deepEqual(
    rows.map((row) => row.kind),
    ['global', 'global'],
  )
  assert.equal(rows[0].value.enabled, false)
})

test('rows are JSON-serializable (the table feeds two renderers)', () => {
  const rows = buildInjectionRows(normalizeConfig({ enabled: true }), {
    name: 'dsh-boot-custom',
    version: '1.0.1',
    writeMode: 'file',
  })
  const json = JSON.parse(JSON.stringify(rows))
  assert.deepEqual(json[0].value.enabled, true)
})
