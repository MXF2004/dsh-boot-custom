import { defineConfig } from '@playwright/test'

/**
 * Tier-1 browser harness.
 *
 * Locally on Windows we reuse the installed Edge (channel: msedge) so no
 * browser download is required; CI installs the Playwright Chromium build.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    headless: true,
    channel:
      process.env.PLAYWRIGHT_CHANNEL ??
      (process.platform === 'win32' && process.env.CI !== 'true' ? 'msedge' : undefined),
    trace: 'retain-on-failure',
  },
})
