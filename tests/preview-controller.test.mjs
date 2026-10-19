/**
 * Controller-level preview lifecycle test.
 *
 * The Settings panel hides itself for a preview and relies on the controller's
 * `onDispose` callback to restore it. This test drives the real controller
 * from source (bundled in memory by esbuild) through the preview-skip path and
 * verifies the teardown actually fires — including with `allowSkip: false` and
 * a locked countdown, because a preview must always be dismissible.
 */

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:4507/',
  pretendToBeVisual: true,
})
const { window } = dom
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

for (const [key, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  KeyboardEvent: window.KeyboardEvent,
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  getComputedStyle: window.getComputedStyle.bind(window),
})) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
}

const entry = fileURLToPath(new URL('../src/client/boot/controller.ts', import.meta.url))
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
const { BootController } = await import(moduleUrl)
const { normalizeConfig } = await import('../lib/shared/config.js')

test('a preview dismisses immediately, tears down and reports onDispose/onFinished', async () => {
  const host = window.document.createElement('div')
  window.document.body.appendChild(host)
  let disposed = 0
  let finished = 0
  const config = normalizeConfig({
    enabled: true,
    mode: 'css',
    // The real boot would refuse to skip here; a preview must not.
    allowSkip: false,
    countdown: { enabled: true, seconds: 10 },
    progress: { enabled: true },
    transition: { style: 'fade', duration: 0.1 },
  })
  const controller = new BootController({
    ctx: {
      on() {
        return () => undefined
      },
    },
    getConfig: () => config,
    onFinished: () => {
      finished += 1
    },
  })

  const detach = controller.attach(host)
  controller.playPreview(config, () => {
    disposed += 1
  })

  assert.ok(window.document.getElementById('dsh-boot-custom-root'), 'preview overlay mounted')
  // Any key dismisses a preview, not just Escape/Space.
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true }))
  assert.equal(
    window.document.getElementById('dsh-boot-custom-root')?.dataset.state,
    'exiting',
    'a preview ignores allowSkip/countdown and accepts an arbitrary key',
  )

  await new Promise((resolve) => setTimeout(resolve, 500))

  assert.equal(disposed, 1, 'the panel restoration callback ran exactly once')
  assert.equal(finished, 1, 'the slot manager was told the preview finished')
  assert.equal(window.document.getElementById('dsh-boot-custom-root'), null, 'preview overlay removed')
  assert.equal(window.document.getElementById('dsh-boot-custom-titlebar-style'), null, 'caption fusion restored')

  detach()
  controller.dispose()
  host.remove()
})

test('custom audio starts in CSS mode even without a video', async () => {
  const host = window.document.createElement('div')
  window.document.body.appendChild(host)
  const previousAudio = globalThis.Audio
  let created = 0
  let played = 0
  class AudioStub {
    constructor() {
      created += 1
      this.volume = 0
      this.currentTime = 0
      this.preload = ''
      this.loop = false
    }
    addEventListener() {}
    load() {}
    play() {
      played += 1
      return Promise.resolve()
    }
    pause() {}
    removeAttribute() {}
  }
  globalThis.Audio = AudioStub

  try {
    const config = normalizeConfig({
      enabled: true,
      mode: 'css',
      videos: [],
      audio: {
        enabled: true,
        source: 'custom',
        file: 'https://example.test/boot.mp3',
        volume: 80,
        fade: false,
      },
      countdown: { enabled: false },
      progress: { enabled: false },
      transition: { style: 'fade', duration: 0.1 },
    })
    let disposed = 0
    const controller = new BootController({
      ctx: {
        on() {
          return () => undefined
        },
      },
      getConfig: () => config,
      onFinished: () => undefined,
    })
    const detach = controller.attach(host)
    controller.playPreview(config, () => {
      disposed += 1
    })
    await new Promise((resolve) => setTimeout(resolve, 80))
    assert.equal(created, 1, 'a custom audio element was created')
    assert.equal(played, 1, 'custom audio played even with mode=css and no videos')

    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal(disposed, 1)
    detach()
    controller.dispose()
  } finally {
    globalThis.Audio = previousAudio
    host.remove()
  }
})
