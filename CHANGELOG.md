# Changelog

All notable changes to this project are documented here.

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
