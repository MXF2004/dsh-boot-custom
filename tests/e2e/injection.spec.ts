/**
 * Tier-1 browser test for the real first-frame injection payload.
 *
 * This is deliberately a narrow E2E slice: it renders the exact row table that
 * `buildInjectionRows()` produces (with the host's `<` escaping) and checks
 * that a real Chromium/Edge page paints the mask, consumes the globals, and
 * cannot be broken out of the injected script.
 */

import assert from 'node:assert/strict'
import { test, expect } from '@playwright/test'

import { buildInjectionRows } from '../../lib/host/first-frame.js'
import { normalizeConfig } from '../../lib/shared/config.js'

/** Serialize one global exactly like dsh-host-webserver's index renderer. */
function scriptValue(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

/** Compose the injection rows into a minimal index document. */
function renderDocument(rows) {
  let head = ''
  let bodyStart = ''
  let bodyEnd = ''
  for (const row of rows) {
    if (row.kind === 'global') {
      head += `<script>globalThis[${JSON.stringify(row.name)}] = ${scriptValue(row.value)}</script>`
    } else if (row.kind === 'style') {
      head += `<style>${row.text}</style>`
    } else if (row.kind === 'html') {
      bodyStart += row.html
    } else if (row.kind === 'script') {
      bodyEnd += `<script>${row.text}</script>`
    }
  }
  return `<!doctype html><html><head>${head}</head><body><div id="root"></div>${bodyStart}${bodyEnd}</body></html>`
}

test('the real injection payload paints a non-blocking mask and reaches the client globals', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const config = normalizeConfig({
    enabled: true,
    logo: { text: 'E2E boot' },
    playing: { background: '#0b1220' },
  })
  const rows = buildInjectionRows(config, {
    name: 'dsh-boot-custom',
    version: '1.0.2',
    writeMode: 'file',
    writeToken: 'e2e-token',
  })
  await page.setContent(renderDocument(rows), { waitUntil: 'load' })

  const mask = page.locator('#dsh-boot-custom-first-frame')
  await expect(mask).toBeVisible()
  const style = await mask.evaluate((element) => {
    const computed = getComputedStyle(element)
    return {
      pointerEvents: computed.pointerEvents,
      background: computed.backgroundColor,
      text: element.textContent ?? '',
    }
  })
  assert(style.pointerEvents === 'none', 'mask must not block the app')
  assert(style.background === 'rgb(11, 18, 32)', 'mask paints the configured background')
  assert(style.text.includes('E2E boot'), 'mask renders the logo')

  const globals = await page.evaluate(() => {
    const g = globalThis as unknown as {
      __BOOT_ANIM_CONFIG__: { enabled: boolean }
      __BOOT_ANIM_META__: { writeToken: string; version: string }
    }
    return {
      enabled: g.__BOOT_ANIM_CONFIG__.enabled,
      token: g.__BOOT_ANIM_META__.writeToken,
      version: g.__BOOT_ANIM_META__.version,
    }
  })
  assert(globals.enabled === true)
  assert(globals.token === 'e2e-token')
  assert(globals.version === '1.0.2')

  await page.evaluate(() => globalThis.__BOOT_ANIM_FIRST_FRAME__.end())
  await expect(mask).toHaveCount(0)
  assert.deepEqual(errors, [])
})

test('user text cannot close the injected script', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const payload = '</script><script>globalThis.__PWNED__ = true</script>'
  const config = normalizeConfig({
    enabled: true,
    greeting: { enabled: true, mode: 'fixed', fixedText: payload },
  })
  const rows = buildInjectionRows(config, {
    name: 'dsh-boot-custom',
    version: '1.0.2',
    writeMode: 'file',
  })
  await page.setContent(renderDocument(rows), { waitUntil: 'load' })

  const result = await page.evaluate(() => {
    const g = globalThis as unknown as {
      __PWNED__?: boolean
      __BOOT_ANIM_CONFIG__: { greeting: { fixedText: string } }
    }
    return {
      pwned: g.__PWNED__,
      greeting: g.__BOOT_ANIM_CONFIG__.greeting.fixedText,
    }
  })
  assert.equal(result.pwned, undefined)
  assert.equal(result.greeting, payload)
  assert.deepEqual(errors, [])
})
