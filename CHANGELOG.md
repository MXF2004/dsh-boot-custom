# Changelog

All notable changes to this project are documented here.

## [1.0.2] - 2026-10-19

Test-and-a11y hardening release driven by the v1.0.1 audit.

### Fixed

- Inline config injection is bounded: >32 Mi-char payloads drop data/long media from the HTML copy, >128 Mi chars disable the animation for that render; persisted config is untouched.
- Audio `data:` sources now use `maxDataAudioChars` (16 Mi) instead of the video ceiling.
- The 20 s hard timeout counts from the first-frame paint, matching the documented budget.
- The boot overlay traps Tab, makes the app root inert, restores the previous focus, and exposes a proper dialog label.
- All settings controls receive names from their `Row` label; hints are wired with `aria-describedby`; icon buttons expose `aria-label`; notices use alert/status live regions.
- Transition documentation now correctly says five styles (the implementation and `TransitionStyle` union have five).

### Added

- Host → client injection integration tests through the real JSON serialization boundary.
- Real `node:http` + `ClientConfigStore` save/reset integration tests, including a rejected token.
- Readiness clock seam with 4 s UI-deadline and minimum-visible-time tests; hard-timeout timing test.
- axe-core WCAG A/AA gates for the controls and the full settings panel.
- Playwright first-frame injection and real BootController E2E (mask, pointer transparency, globals, `</script>` safety, double-gate exit).
- CI coverage step, Windows test job, Playwright job; `docs/compat-matrix.md`.
- 69 node:test cases plus 3 Playwright browser cases.

## [1.0.1] - 2026-10-19

Review-driven correctness, accessibility and local-security release.

### Fixed

- Custom audio now starts in CSS mode, with an empty video list, after video failure, and under reduced motion instead of only from the video-ready callback.
- The first-frame mask can no longer lock the GUI: it is `pointer-events: none` and has a pure-CSS 12 s fade-out even when the injected script is blocked.
- Resetting clears the legacy `config.json` too, so old values cannot resurrect on the next refresh; migration also removes the file after a successful settings import.
- `npm run build:client` no longer deletes the host artifacts (`lib/index.js`, `lib/host/*`).
- The typewriter timer stops when the greeting is complete instead of running for the whole animation.
- Only explicitly Chinese locales receive Chinese copy; German/French/etc. now get English.
- Base64 conversion limit now matches the 96 Mi-character encoded config cap (72 MiB source).
- Oversized `config.json` is preserved, ignored and cached; repeated refreshes no longer re-parse it.
- UNC paths and remote `file://` authorities are rejected to avoid outbound SMB/NTLM traffic.
- The injected release version is now `1.0.1` (string) and pinned to `package.json` by a contract test.
- First-frame cleanup removes only its own marked stylesheet, not unrelated `<style>` elements.
- The boot overlay is a labelled modal dialog, focuses itself, and marks the app root inert while it is visible.

### Security

- Config read/write routes now require a loopback `Host` and a random per-activation session token injected into the page, closing the DNS-rebinding gap.
- The legacy custom request header remains as an additional CSRF check.

### Tests

- 54 tests, including new coverage for CSS-mode custom audio, route host/token enforcement, legacy-file reset, and version synchronization.

## [1.0.0] - 2026-10-18

First stable release.

### Added

- 8 pure-CSS backdrop styles: breathe, aurora, starfield, sweep, pulse, grid, spotlight, none.
- Configurable minimum boot duration (`bootDuration`, 0–18 s; default 3 s) with the app page revealed only after the animation and app-ready gates both pass.
- Any-key and pointer-click skipping, respecting `allowSkip` and the countdown.
- First-frame anti-flash mask injected through `webserver/index-inject`.
- In-settings preview that hides the Settings modal and restores it afterwards.
- Windows caption-strip fusion with adaptive glyph color.
- Full-window fixed overlay that ignores sidebar/layout offsets.

### Changed

- Project renamed from `dsh-boot-animation` to `dsh-boot-custom` (package, patch row, routes, settings namespace, data directory and DOM ids).
- Default boot duration reduced from 5 s to 3 s for faster startup.
- Boot duration is measured from the first-frame paint, so mask time counts toward the configured delay instead of being added on top.
- Client bundle is minified at build time (~178 KB → ~99 KB).
- First-frame injection emits only the active CSS style's keyframes.
- Fallback CSS effects pause while a video is playing.
- Settings shell outer dialog is pinned to `overflow: clip`; a “关闭设置” fallback action was added.

### Fixed

- Entrance animations no longer override the logo/greeting centering transform.
- Settings modal no longer stays above previews or gets focus-scrolled away from its header.
- Stale `dsh-boot-animation` profile rows are documented for removal.

## [0.0.1]

- Initial internal build: video rotation, local file picker, playback rate, audio, transitions, logo, progress, countdown, greeting and first-frame mask.
