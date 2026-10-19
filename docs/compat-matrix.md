# Compatibility matrix

This matrix separates **executed** coverage from **declared/supported** targets.
Do not read an unexecuted row as verified.

## Runtime

| Dimension | Target | Status |
| --- | --- | --- |
| DSH desktop | 0.2.1-rc.2 (current app.asar) | Implemented; contract tests + local profile install |
| DSH desktop | 0.1.7+ fallbacks (`settings`, JSON, no `configEditor`) | Implemented; store tests |
| DSH web shell | `shell.overlay`, `settings.section`, `webserver/index-inject` | Contract tests |
| Node.js | `^22.13.0 || >=24.0.0` | CI Node 24 |
| Chromium | >= 120 (`target: chrome120` in the client build) | Playwright Chromium/Edge |

## OS and display

| Platform | Window/titlebar fusion | Overlay/pointer | Status |
| --- | --- | --- | --- |
| Windows 11 | Native caption probe + adaptive glyph color | Fixed body-level overlay | Local smoke; Windows CI runs unit/typecheck |
| Windows 10 | Uses the same `env(titlebar-area-*)` path | Fixed body-level overlay | Supported, not separately executed |
| macOS | Overlay + CSS titlebar fallback | Fixed body-level overlay | Supported, not executed |
| Linux | Overlay + CSS titlebar fallback | Fixed body-level overlay | CI unit tests only |

## DPI / zoom / viewport

| Case | Status |
| --- | --- |
| 100%, 125%, 150%, 200% Windows scaling | Manual matrix pending; titlebar height is read from `env()` / `windowControlsOverlay` |
| Browser zoom 80–200% | Manual matrix pending |
| 1280×720, 1920×1080, 2560×1440, 4K | Playwright mask test at 1280×720; other sizes pending |

## Time zone / locale

| Case | Status |
| --- | --- |
| `Asia/Shanghai`, `UTC`, `America/New_York` | `timeSlotFor()` is local-time based; unit tests use explicit local dates |
| `zh-CN`, `zh-TW` | Chinese copy via `isChinese()` |
| `en-US`, `de-DE`, `fr-FR` | English copy via `isChinese()` (covered by locale predicate) |

## Known limitations

- Full DSH desktop boot journey (real shell slots + video decode) is not covered by
  the Playwright mask harness; it needs a desktop UAT pass.
- Native caption fusion cannot be observed in jsdom/Playwright headless; Windows
  desktop is the authoritative environment.
- Screen-reader speech is not automated; the a11y contract test checks names,
  descriptions and live-region roles only.

## Gate commands

```bash
npm run typecheck
npm test
npm run test:coverage
npm run test:e2e
```

CI runs the unit/typecheck suite on Ubuntu and Windows, and the Playwright
first-frame injection suite on Ubuntu.
