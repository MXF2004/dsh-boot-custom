/**
 * DOM smoke test for the browser half.
 *
 * Mounts the real `shell.overlay` entry through React, then verifies the
 * production sequence end to end:
 *
 *   mask injected → entry mounts → countdown starts (5s) → the UI-ready probe
 *   fires at ~300ms → `app/ready` wins over the countdown → exit transition →
 *   overlay and mask are removed → the slot entry is released.
 *
 * Reduced motion is forced so the test never touches `<video>` (jsdom has no
 * media stack); this is also the documented accessibility path.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const dom = new JSDOM(
  `<!doctype html><html><head></head><body>
    <div id="dsh-boot-custom-first-frame" aria-hidden="true"></div>
    <div id="root">
      <div data-slot="shell.overlay"></div>
      <div data-slot="sidebar"></div>
    </div>
  </body></html>`,
  { url: 'http://127.0.0.1:4507/', pretendToBeVisual: true },
)

const { window } = dom
// Normal motion: the preview/boot is CSS-only here (no videos), so running the
// entrance animations lets the test assert the wrapper/inner split. Reduced
// motion deliberately skips those classes, which would hide that regression.
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

// Install the browser globals the classic bundle expects.
const globals = {
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  KeyboardEvent: window.KeyboardEvent,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  localStorage: window.localStorage,
}
for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
}
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })

let maskClaimed = false
globalThis.__BOOT_ANIM_CONFIG__ = {
  enabled: true,
  mode: 'css',
  allowSkip: true,
  bootDuration: 1.4,
  videos: [],
  countdown: { enabled: true, seconds: 5 },
  progress: { enabled: true, realProgress: true },
  logo: { enabled: true, text: 'SMOKE' },
  greeting: { enabled: true, mode: 'fixed', fixedText: 'Hello' },
  transition: { style: 'fade', duration: 0.1 },
}
globalThis.__BOOT_ANIM_META__ = {
  name: 'dsh-boot-custom',
  version: '1.0.1',
  writeMode: 'file',
  // The first-frame mask has already been on screen for one second; that time
  // must count against bootDuration instead of adding a full extra delay.
  startedAt: Date.now() - 1000,
}
globalThis.__BOOT_ANIM_FIRST_FRAME__ = {
  end() {
    maskClaimed = true
  },
}

/** React + react-dom are loaded after the globals exist. */
const React = await import('react')
const { createRoot } = await import('react-dom/client')
const act = React.act ?? (await import('react-dom/test-utils')).act

let definition
window.__ModuleLoader__ = {
  load(factoryDefinition) {
    definition = factoryDefinition
  },
}
await import('../lib/client.js')
assert.ok(definition, 'the bundle registered a module factory')
const client = definition.factory((request) => {
  if (request === 'react') return React
  throw new Error(`unexpected module request: ${request}`)
})

test('the overlay mounts, respects app-ready, exits and releases its slot', async () => {
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => {
    warnings.push(args.map(String).join(' '))
    originalWarn(...args)
  }

  const registered = []
  const disposers = []
  const fakeContext = {
    effect(callback) {
      const disposer = callback()
      if (typeof disposer === 'function') disposers.push(disposer)
      return disposer
    },
    on() {
      return () => undefined
    },
    slots: {
      register(options, component) {
        const entry = { options, component }
        registered.push(entry)
        return () => {
          const index = registered.indexOf(entry)
          if (index >= 0) registered.splice(index, 1)
        }
      },
      inject(_key, callback) {
        const disposer = callback()
        return typeof disposer === 'function' ? disposer : () => undefined
      },
    },
  }

  try {
    client.apply(fakeContext)

    const overlay = registered.find((entry) => entry.options.name === 'shell.overlay')
    assert.ok(overlay, 'shell.overlay entry registered directly in apply()')

    const settings = registered.find((entry) => entry.options.name === 'settings.section')
    assert.ok(settings, 'settings.section page registered')
    assert.equal(typeof settings.options.label, 'function')
    assert.equal(settings.options.label(), '开机动画')

    const container = window.document.createElement('div')
    window.document.body.appendChild(container)
    const reactRoot = createRoot(container)
    await act(async () => {
      reactRoot.render(React.createElement(overlay.component))
    })

    const overlayNode = window.document.getElementById('dsh-boot-custom-root')
    assert.ok(overlayNode, 'the overlay root is mounted')
    assert.equal(overlayNode.dataset.mode, 'css')

    // The slot-owned host is a direct body child, so the overlay's fixed
    // positioning is viewport-relative and cannot inherit a sidebar/grid
    // containing block from the app frame.
    const slotHost = window.document.getElementById('dsh-boot-custom-slot')
    assert.ok(slotHost, 'the slot-owned overlay host is mounted')
    assert.equal(slotHost.parentElement, window.document.body, 'overlay host is a direct body child')
    assert.equal(overlayNode.parentElement, slotHost, 'overlay root lives inside the body-level host')
    const bootStyle = window.document.getElementById('dsh-boot-custom-style')
    assert.ok(bootStyle.textContent.includes('#dsh-boot-custom-slot'))
    assert.ok(bootStyle.textContent.includes('display: contents'))

    // CSS backdrop effects: the fallback owns the selected style, and the full
    // stylesheet carries every option for instant live switching.
    const fallback = overlayNode.querySelector('.dba-fallback')
    assert.ok(fallback, 'fallback layer present')
    assert.equal(fallback.dataset.cssStyle, 'breathe')
    assert.equal(overlayNode.style.getPropertyValue('--dba-fx-accent').trim(), '#4f9dff')
    assert.ok(bootStyle.textContent.includes('.dba-fallback[data-css-style="aurora"]'))
    assert.ok(bootStyle.textContent.includes('@keyframes dba-fx-stars'))

    // The native caption strip is fused with the boot surface: a probe-scoped
    // transparent background plus a light glyph on this dark launch color.
    const titlebarStyle = window.document.getElementById('dsh-boot-custom-titlebar-style')
    assert.ok(titlebarStyle, 'titlebar fusion stylesheet installed')
    assert.ok(titlebarStyle.textContent.includes('background-color: rgba(0, 0, 0, 0) !important'))
    assert.equal(
      window.document.body.style.getPropertyValue('--dba-titlebar-symbol'),
      '#f9fafb',
      'light glyphs on the default dark background',
    )

    // Regression for the right-shift screenshot: the entrance/breathing
    // animations must live on inner nodes, never on the wrappers that own the
    // `left:50% + translate(-50%,-50%)` centering transform.
    await new Promise((resolve) => setTimeout(resolve, 200))
    const logoWrap = overlayNode.querySelector('.dba-logo-wrap')
    const logoNode = overlayNode.querySelector('.dba-logo')
    const logoText = overlayNode.querySelector('.dba-logo-text')
    const greetingWrap = overlayNode.querySelector('.dba-greeting-wrap')
    const greetingNode = overlayNode.querySelector('.dba-greeting')
    assert.equal(logoWrap.classList.contains('is-entering'), false)
    assert.equal(logoNode.classList.contains('is-entering'), true)
    assert.equal(logoText.classList.contains('is-breathing'), true)
    assert.equal(greetingWrap.classList.contains('is-entering'), false)
    assert.equal(greetingNode.classList.contains('is-entering'), true)
    assert.ok(bootStyle.textContent.includes('transform: translate3d(-50%, -50%, 0)'))
    assert.ok(bootStyle.textContent.includes('.dba-logo.is-entering'))
    assert.equal(bootStyle.textContent.includes('.dba-logo-wrap.is-entering'), false)

    // The configured 1.4 s floor is measured from the first-frame paint; one
    // second already elapsed, so only the 0.9 s minimum remains. The app-ready
    // probe must still not reveal the page before that floor.
    await new Promise((resolve) => setTimeout(resolve, 500))
    assert.ok(
      window.document.getElementById('dsh-boot-custom-root'),
      'app/ready must not reveal the page before the remaining animation floor',
    )

    // The countdown starts immediately and is 5s long; the ready probe must
    // win the race well before it, while the animation floor still applies.
    await new Promise((resolve) => setTimeout(resolve, 800))

    assert.equal(window.document.getElementById('dsh-boot-custom-root'), null, 'overlay removed after exit')
    assert.equal(window.document.getElementById('dsh-boot-custom-first-frame'), null, 'first-frame mask removed')
    assert.equal(maskClaimed, true, 'the client claimed the mask before hiding it')
    assert.equal(
      window.document.getElementById('dsh-boot-custom-titlebar-style'),
      null,
      'titlebar fusion removed with the overlay',
    )
    assert.equal(
      window.document.body.style.getPropertyValue('--dba-titlebar-symbol'),
      '',
      'the private glyph variable is cleared',
    )
    assert.equal(
      registered.some((entry) => entry.options.name === 'shell.overlay'),
      false,
      'the slot entry was released after the run',
    )
    assert.equal(
      warnings.some((line) => line.includes('activation failed')),
      false,
      `activation must not fail: ${warnings.join(' | ')}`,
    )

    await act(async () => {
      reactRoot.unmount()
    })
    assert.equal(
      window.document.getElementById('dsh-boot-custom-slot'),
      null,
      'the body-level slot host is removed on unmount',
    )
    container.remove()
  } finally {
    console.warn = originalWarn
    for (const dispose of disposers.reverse()) {
      try {
        dispose()
      } catch {
        // Ignore teardown noise.
      }
    }
  }
})
