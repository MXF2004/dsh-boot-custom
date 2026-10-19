/**
 * Real browser boot journey.
 *
 * Bundles the real BootController for the page, mounts it into a minimal DSH
 * shell seat, starts the actual boot run, and waits for the double-gate exit.
 * The shell is mocked; everything from the controller down to the DOM/exit is
 * the production implementation.
 */

import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'
import { test } from '@playwright/test'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const source = `
  import { BootController } from './src/client/boot/controller.ts'
  import { normalizeConfig } from './src/shared/config.ts'
  globalThis.__BOOT_TEST__ = { BootController, normalizeConfig }
`
const output = await build({
  stdin: { contents: source, resolveDir: repoRoot, loader: 'ts' },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  logLevel: 'silent',
})
const bundle = output.outputFiles[0].text

test('the real controller mounts, waits for app readiness and exits', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setContent(
    '<!doctype html><html><body><div id="root"><div data-slot="shell.overlay"></div><div data-slot="sidebar"></div><div data-slot="main"></div></div></body></html>',
    { waitUntil: 'load' },
  )
  await page.addScriptTag({ content: bundle })

  const result = await page.evaluate(async () => {
    const Test = globalThis.__BOOT_TEST__
    const config = Test.normalizeConfig({
      enabled: true,
      mode: 'css',
      bootDuration: 0,
      allowSkip: false,
      countdown: { enabled: false },
      progress: { enabled: false },
      transition: { style: 'fade', duration: 0.1 },
      logo: { enabled: true, text: 'E2E boot' },
      greeting: { enabled: false },
    })
    globalThis.__BOOT_ANIM_CONFIG__ = config
    globalThis.__BOOT_ANIM_META__ = {
      name: 'dsh-boot-custom',
      version: '1.0.2',
      writeMode: 'file',
      startedAt: Date.now(),
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const finished = new Promise((resolve) => {
      const controller = new Test.BootController({
        ctx: {
          on() {
            return () => undefined
          },
        },
        getConfig: () => config,
        onFinished: (kind, reason) => resolve({ kind, reason }),
      })
      controller.attach(host)
      controller.startBoot()
    })
    const outcome = await finished
    return {
      ...outcome,
      rootPresent: document.getElementById('dsh-boot-custom-root') !== null,
      maskPresent: document.getElementById('dsh-boot-custom-first-frame') !== null,
    }
  })

  assert.equal(result.kind, 'boot')
  assert.equal(result.reason, 'ready')
  assert.equal(result.rootPresent, false)
  assert.equal(result.maskPresent, false)
  assert.deepEqual(errors, [])
})
