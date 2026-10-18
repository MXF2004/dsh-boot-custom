/**
 * Stylesheet for the boot overlay.
 *
 * Every animated property is `transform`, `opacity` or `filter` so the exit
 * transition runs on the compositor; `will-change` is scoped to the elements
 * that actually animate. The titlebar-safe area is a CSS variable whose
 * fallback is `env(titlebar-area-height)` — JavaScript only overrides it, it
 * never hard-codes a pixel value.
 *
 * @module dsh-boot-custom/client/boot/styles
 */

import { DOC_CLASSES, DOM_IDS } from '../../shared/constants.js'
import { buildCssEffectCss } from '../../shared/css-effects.js'

/** The complete overlay stylesheet. */
const STYLE_TEXT = `
/*
 * Preview presentation: the Settings modal lives in its own body-level portal
 * (z-index 1000). While a preview owns the window, hide that portal entirely
 * so it can neither float above the animation nor intercept clicks. The
 * class is removed by the panel when the preview ends.
 */
html.${DOC_CLASSES.previewing} body > div:has([data-shortcut-modal="settings"]) {
  visibility: hidden !important;
  pointer-events: none !important;
  opacity: 0 !important;
}

#${DOM_IDS.overlaySlot} {
  display: contents;
}

#${DOM_IDS.overlayRoot} {
  --dba-titlebar: env(titlebar-area-height, 0px);
  --dba-duration: 300ms;
  --dba-bg: #0b1220;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  overflow: hidden;
  background: var(--dba-bg);
  pointer-events: auto;
  opacity: 1;
  will-change: opacity, transform, filter;
  contain: strict;
  -webkit-user-select: none;
  user-select: none;
}

#${DOM_IDS.overlayRoot}[data-state="exiting"] { pointer-events: none; }

#${DOM_IDS.overlayRoot} * { box-sizing: border-box; }

#${DOM_IDS.overlayRoot} .dba-backdrop,
#${DOM_IDS.overlayRoot} .dba-media,
#${DOM_IDS.overlayRoot} .dba-fallback {
  position: absolute;
  inset: 0;
}

#${DOM_IDS.overlayRoot} .dba-backdrop { background: var(--dba-bg); }

#${DOM_IDS.overlayRoot} .dba-media {
  opacity: 0;
  transition: opacity 420ms ease;
  will-change: opacity;
}
#${DOM_IDS.overlayRoot} .dba-media.is-visible { opacity: 1; }

#${DOM_IDS.overlayRoot} .dba-media video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: transparent;
  display: block;
}

#${DOM_IDS.overlayRoot} .dba-fallback {
  background:
    radial-gradient(120% 90% at 50% 8%, rgba(79, 157, 255, 0.16), transparent 60%),
    radial-gradient(80% 70% at 50% 100%, rgba(79, 157, 255, 0.10), transparent 65%),
    var(--dba-bg);
  opacity: 0;
  overflow: hidden;
  transition: opacity 420ms ease;
}
#${DOM_IDS.overlayRoot} .dba-fallback.is-visible { opacity: 1; }

${buildCssEffectCss(`#${DOM_IDS.overlayRoot} .dba-fallback`)}

/*
 * Video mode hides the fallback while the video plays; pause its decorative
 * pseudo-elements so the CSS effects do not burn frames behind an invisible
 * layer. They resume when a load failure reveals the fallback. This rule must
 * follow the generated animation shorthands to win the cascade.
 */
#${DOM_IDS.overlayRoot} .dba-fallback:not(.is-visible)::before,
#${DOM_IDS.overlayRoot} .dba-fallback:not(.is-visible)::after {
  animation-play-state: paused;
}

#${DOM_IDS.overlayRoot} .dba-stage {
  position: absolute;
  left: 0;
  right: 0;
  top: var(--dba-titlebar);
  bottom: 0;
  overflow: hidden;
}

#${DOM_IDS.overlayRoot} .dba-logo-wrap,
#${DOM_IDS.overlayRoot} .dba-greeting-wrap {
  position: absolute;
  left: 50%;
  transform: translate3d(-50%, -50%, 0);
  max-width: min(88vw, 1100px);
  text-align: center;
}

#${DOM_IDS.overlayRoot} .dba-logo {
  white-space: pre-line;
  line-height: 1.15;
  letter-spacing: 0.01em;
  font-weight: 600;
  text-align: center;
}

#${DOM_IDS.overlayRoot} .dba-greeting {
  white-space: pre-line;
  line-height: 1.5;
  text-align: center;
  font-weight: 400;
  opacity: 0.94;
}

#${DOM_IDS.overlayRoot} .dba-greeting .dba-caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: -0.12em;
  background: currentColor;
  animation: dba-caret-blink 900ms steps(1, end) infinite;
}

#${DOM_IDS.overlayRoot} .dba-logo.is-entering,
#${DOM_IDS.overlayRoot} .dba-greeting.is-entering {
  animation: dba-rise-in 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

#${DOM_IDS.overlayRoot} .dba-logo-text {
  display: block;
}

#${DOM_IDS.overlayRoot} .dba-logo-text.is-breathing {
  animation: dba-breathe 3.4s ease-in-out infinite;
}

#${DOM_IDS.overlayRoot} .dba-progress {
  position: absolute;
  left: 0;
  right: 0;
  height: 8px;
  display: flex;
  align-items: center;
  pointer-events: none;
}
#${DOM_IDS.overlayRoot} .dba-progress[data-position="top"] { top: var(--dba-titlebar); }
#${DOM_IDS.overlayRoot} .dba-progress[data-position="bottom"] { bottom: 0; }

#${DOM_IDS.overlayRoot} .dba-progress-track {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: var(--dba-track, rgba(255, 255, 255, 0.14));
  transform: translateZ(0);
}
#${DOM_IDS.overlayRoot} .dba-progress[data-style="line"] .dba-progress-track {
  height: 2px;
  margin: 0;
  border-radius: 0;
}
#${DOM_IDS.overlayRoot} .dba-progress[data-style="capsule"] .dba-progress-track {
  height: 6px;
  margin: 0 22px;
  border-radius: 999px;
}
#${DOM_IDS.overlayRoot} .dba-progress[data-style="glow"] .dba-progress-track {
  height: 3px;
  margin: 0 16px;
  border-radius: 999px;
}

#${DOM_IDS.overlayRoot} .dba-progress-fill {
  position: absolute;
  inset: 0;
  transform-origin: 0 50%;
  transform: scaleX(0);
  background: var(--dba-fill, #4f9dff);
  border-radius: inherit;
  will-change: transform;
}
#${DOM_IDS.overlayRoot} .dba-progress[data-style="capsule"] .dba-progress-fill {
  box-shadow: 0 0 10px color-mix(in srgb, var(--dba-fill, #4f9dff) 55%, transparent);
}
#${DOM_IDS.overlayRoot} .dba-progress[data-style="glow"] .dba-progress-fill {
  background-image: linear-gradient(
    90deg,
    var(--dba-fill, #4f9dff),
    color-mix(in srgb, var(--dba-fill, #4f9dff) 45%, #ffffff)
  );
  box-shadow: 0 0 14px var(--dba-fill, #4f9dff), 0 0 30px var(--dba-fill, #4f9dff);
}
#${DOM_IDS.overlayRoot} .dba-progress[data-style="glow"] .dba-progress-track::after {
  content: "";
  position: absolute;
  inset: -8px 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.10), transparent);
  pointer-events: none;
}

#${DOM_IDS.overlayRoot} .dba-percent {
  position: absolute;
  right: 14px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--dba-fill, #4f9dff);
  opacity: 0.9;
}
#${DOM_IDS.overlayRoot} .dba-progress[data-position="top"] .dba-percent { top: 10px; }
#${DOM_IDS.overlayRoot} .dba-progress[data-position="bottom"] .dba-percent { bottom: 10px; }

#${DOM_IDS.overlayRoot} .dba-countdown {
  position: absolute;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  white-space: nowrap;
  transition: opacity 600ms ease;
  color: var(--dba-countdown-color, #cfe2f7);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  z-index: 3;
}
#${DOM_IDS.overlayRoot} .dba-countdown[data-position="center"] {
  left: 50%;
  top: calc(var(--dba-titlebar) + (100% - var(--dba-titlebar)) / 2);
  transform: translate(-50%, -50%);
  font-size: 40px;
}
#${DOM_IDS.overlayRoot} .dba-countdown[data-position="bottom-right"] {
  right: 26px;
  bottom: 30px;
  font-size: 15px;
}
#${DOM_IDS.overlayRoot} .dba-countdown[data-position="above-progress"] {
  right: 26px;
  font-size: 15px;
}
#${DOM_IDS.overlayRoot} .dba-countdown[data-position="above-progress"][data-progress-position="bottom"] { bottom: 30px; }
#${DOM_IDS.overlayRoot} .dba-countdown[data-position="above-progress"][data-progress-position="top"] {
  top: calc(var(--dba-titlebar) + 26px);
}
#${DOM_IDS.overlayRoot} .dba-countdown .dba-countdown-number {
  font-size: var(--dba-countdown-size, 15px);
  font-weight: 600;
}
#${DOM_IDS.overlayRoot} .dba-countdown .dba-countdown-hint {
  font-size: max(11px, calc(var(--dba-countdown-size, 15px) * 0.62));
  opacity: 0.78;
}
#${DOM_IDS.overlayRoot} .dba-countdown.is-fading { opacity: 0; }

#${DOM_IDS.overlayRoot}[data-mode="video"] .dba-fallback { opacity: 0; }
#${DOM_IDS.overlayRoot}[data-mode="video"] .dba-logo-wrap { opacity: 0.86; }
#${DOM_IDS.overlayRoot}[data-mode="video"] .dba-greeting-wrap { opacity: 0.72; }

#${DOM_IDS.overlayRoot} .dba-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(120% 100% at 50% 50%, transparent 46%, rgba(0, 0, 0, 0.34) 100%);
}

#${DOM_IDS.overlayRoot} .dba-enter { opacity: 0; }
#${DOM_IDS.overlayRoot}.dba-entered { opacity: 1; transition: opacity 380ms ease; }

#${DOM_IDS.overlayRoot}.dba-exit-fade {
  opacity: 0;
  transition: opacity var(--dba-duration) ease;
}
#${DOM_IDS.overlayRoot}.dba-exit-slide-up {
  opacity: 0;
  transform: translate3d(0, -4%, 0);
  transition: opacity var(--dba-duration) ease, transform var(--dba-duration) cubic-bezier(0.4, 0, 0.2, 1);
}
#${DOM_IDS.overlayRoot}.dba-exit-zoom {
  opacity: 0;
  transform: scale(1.06);
  filter: blur(2px);
  transition: opacity var(--dba-duration) ease, transform var(--dba-duration) ease, filter var(--dba-duration) ease;
}
#${DOM_IDS.overlayRoot}.dba-exit-blur {
  opacity: 0;
  filter: blur(14px);
  transition: opacity var(--dba-duration) ease, filter var(--dba-duration) ease;
}
#${DOM_IDS.overlayRoot}.dba-exit-black {
  background: #000;
  transition: opacity var(--dba-duration) ease;
}
#${DOM_IDS.overlayRoot}.dba-exit-black .dba-backdrop,
#${DOM_IDS.overlayRoot}.dba-exit-black .dba-media,
#${DOM_IDS.overlayRoot}.dba-exit-black .dba-stage,
#${DOM_IDS.overlayRoot}.dba-exit-black .dba-progress,
#${DOM_IDS.overlayRoot}.dba-exit-black .dba-countdown,
#${DOM_IDS.overlayRoot}.dba-exit-black .dba-vignette {
  opacity: 0;
  transition: opacity var(--dba-duration) ease;
}

@keyframes dba-rise-in {
  from { opacity: 0; transform: translate3d(0, 14px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes dba-breathe {
  0%, 100% { opacity: 0.86; transform: scale(0.994); }
  50% { opacity: 1; transform: scale(1.012); }
}
@keyframes dba-caret-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  #${DOM_IDS.overlayRoot},
  #${DOM_IDS.overlayRoot} * {
    animation: none !important;
    transition-duration: 100ms !important;
  }
  #${DOM_IDS.overlayRoot}.dba-exit-fade,
  #${DOM_IDS.overlayRoot}.dba-exit-slide-up,
  #${DOM_IDS.overlayRoot}.dba-exit-zoom,
  #${DOM_IDS.overlayRoot}.dba-exit-blur {
    transform: none !important;
    filter: none !important;
  }
  #${DOM_IDS.overlayRoot} .dba-fallback::before,
  #${DOM_IDS.overlayRoot} .dba-fallback::after {
    animation: none !important;
    opacity: 0 !important;
  }
}
`.trim()

/**
 * Install the overlay stylesheet once.
 *
 * @returns a disposer removing the `<style>` element.
 */
export function ensureBootStyles(): () => void {
  try {
    if (document.getElementById(DOM_IDS.clientStyle) !== null) return () => undefined
    const style = document.createElement('style')
    style.id = DOM_IDS.clientStyle
    style.textContent = STYLE_TEXT
    ;(document.head ?? document.documentElement).appendChild(style)
    return () => {
      try {
        style.remove()
      } catch {
        // Document already replaced.
      }
    }
  } catch (error) {
    console.warn('[dsh-boot-custom] overlay styles could not be installed:', error)
    return () => undefined
  }
}
