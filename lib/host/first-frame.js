/**
 * First-frame mask generation.
 *
 * The host pushes these rows into the web server's structured injection table
 * (`webserver/index-inject`). The served form renders them into the document
 * text, so the mask is painted by the browser parser before the application
 * bundle runs — that is what removes the native white flash.
 *
 * Three invariants matter:
 *  1. The rows are pure JSON data (no functions), because the same table feeds
 *     the served form and the desktop static-worker interpreter.
 *  2. The script defines `globalThis.__BOOT_ANIM_FIRST_FRAME__.end()`. The
 *     browser half calls it with the CLAIMED flag set first; the 12s
 *     self-defence fallback only fires when nobody claimed the mask.
 *  3. Every interpolated value is sanitized by `shared/config.ts`; text is
 *     HTML-escaped and colors/fonts are grammar-checked.
 *
 * @module dsh-boot-custom/host/first-frame
 */
import { DOM_IDS, GLOBALS } from '../shared/constants.js';
import { contrastSymbolColor, escapeHtml, resolveGreeting } from '../shared/config.js';
import { buildCssEffectCss } from '../shared/css-effects.js';
import { DEFAULT_CONFIG } from '../shared/defaults.js';
import { LIMITS } from '../shared/types.js';
/** Marker used by the injected script to remove exactly its own stylesheet. */
const STYLE_MARKER = 'dsh-boot-custom-first-frame-style';
/** Render a multi-line text block safely (whitespace preserved by CSS). */
function textBlock(value) {
    return escapeHtml(value);
}
/**
 * The first-frame stylesheet.
 *
 * Covers the whole viewport (titlebar included) with the configured
 * background, paints the logo/greeting immediately and disables every
 * animation under `prefers-reduced-motion: reduce` while keeping the solid
 * mask (the accessibility requirement: no white flash, no motion).
 *
 * @param config - normalized configuration.
 * @returns CSS text safe to place inside a `<style>` element.
 */
export function buildFirstFrameStyle(config) {
    const { logo, greeting, playing, cssAnimation } = config;
    const logoRule = logo.enabled
        ? `
  #${DOM_IDS.firstFrame} .dba-ff-logo {
    font-size: ${logo.fontSize}px;
    color: ${logo.color};
    font-family: ${logo.fontFamily}, system-ui, -apple-system, "Segoe UI", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji";
    text-shadow: ${logo.glow ? `0 0 28px ${logo.glowColor}, 0 0 64px ${logo.glowColor}` : 'none'};
    white-space: pre-line;
    text-align: center;
    line-height: 1.18;
    animation: dba-ff-breathe 3.2s ease-in-out infinite;
    will-change: opacity, transform;
  }`
        : '';
    const greetingRule = greeting.enabled
        ? `
  #${DOM_IDS.firstFrame} .dba-ff-greeting {
    margin-top: 18px;
    font-size: ${greeting.fontSize}px;
    color: ${greeting.color};
    font-family: ${greeting.fontFamily}, system-ui, -apple-system, "Segoe UI", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji";
    text-shadow: ${greeting.glow ? `0 0 18px ${greeting.glowColor}` : 'none'};
    white-space: pre-line;
    text-align: center;
    opacity: 0.92;
  }`
        : '';
    return `/* ${STYLE_MARKER} */
  html, body { background: ${playing.background} !important; }
  #${DOM_IDS.firstFrame} {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    display: grid;
    place-items: center;
    padding: max(0px, env(titlebar-area-height, 0px)) 24px 24px;
    box-sizing: border-box;
    background: ${playing.background};
    overscroll-behavior: none;
    overflow: hidden;
    /* Decorative only: never allow an unremoved mask to lock input. */
    pointer-events: none;
    opacity: 1;
    contain: strict;
    --dba-fx-accent: ${logo.glowColor};
    /* Pure-CSS self-defence: even if the injected script is blocked or
       stripped, the opaque mask fades out and releases the screen. */
    animation: dba-ff-timeout ${LIMITS.firstFrameFallbackMs}ms linear forwards;
  }
  @keyframes dba-ff-timeout {
    0%, 99% { opacity: 1; visibility: visible; }
    100% { opacity: 0; visibility: hidden; }
  }
  #${DOM_IDS.firstFrame} .dba-ff-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    max-width: min(90vw, 900px);
    text-align: center;
    will-change: opacity, transform;
    animation: dba-ff-enter 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes dba-ff-enter {
    from { opacity: 0; transform: translate3d(0, 10px, 0); }
    to { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes dba-ff-breathe {
    0%, 100% { opacity: 0.82; transform: scale(0.992); }
    50% { opacity: 1; transform: scale(1.012); }
  }${logoRule}${greetingRule}
  /*
   * Desktop caption fusion.
   *
   * The Windows preload measures a hidden probe whose background is
   * var(--dsw-specific-sidebar-fill) and whose color is
   * var(--dsw-alias-label-primary), then forwards those two computed values
   * to Electron's setTitleBarOverlay(). Scoping a transparent background and
   * an adaptive glyph color to that probe makes the native caption strip
   * transparent over the boot surface — without touching the app tokens, so
   * nothing behind the mask (or after it) changes color.
   */
  body > :is([style*="--dsw-specific-sidebar-fill"], [style*="--dsw-alias-label-primary"]) {
    background-color: rgba(0, 0, 0, 0) !important;
    color: var(--dba-titlebar-symbol, ${contrastSymbolColor(playing.background)}) !important;
  }
  ${buildCssEffectCss(`#${DOM_IDS.firstFrame}`, [cssAnimation])}
  @media (prefers-reduced-motion: reduce) {
    #${DOM_IDS.firstFrame} .dba-ff-inner,
    #${DOM_IDS.firstFrame} .dba-ff-logo { animation: none !important; opacity: 1 !important; transform: none !important; }
    #${DOM_IDS.firstFrame}::before,
    #${DOM_IDS.firstFrame}::after { animation: none !important; opacity: 0 !important; }
  }
`.trim();
}
/**
 * The mask markup. Rendered immediately after `<body>`, before the app root,
 * so the first painted frame is already the mask.
 *
 * @param config - normalized configuration.
 * @returns an HTML fragment.
 */
export function buildFirstFrameMarkup(config) {
    const logo = config.logo.enabled
        ? `<div class="dba-ff-logo">${textBlock(config.logo.text)}</div>`
        : '';
    const greeting = config.greeting.enabled
        ? `<div class="dba-ff-greeting">${textBlock(resolveGreeting(config))}</div>`
        : '';
    const inner = logo.length > 0 || greeting.length > 0 ? `<div class="dba-ff-inner">${logo}${greeting}</div>` : '';
    return `<div id="${DOM_IDS.firstFrame}" aria-hidden="true" data-dsh-boot-anim="first-frame" data-css-style="${config.cssAnimation}">${inner}</div>`;
}
/**
 * The first-frame controller script.
 *
 * Contract required by the runtime:
 *  - defines `__BOOT_ANIM_FIRST_FRAME__.end()`;
 *  - `end()` sets `__BOOT_ANIM_FIRST_FRAME_CLAIMED__` before hiding;
 *  - a 12s self-defence timer hides the mask ONLY when nobody claimed it.
 *
 * @returns classic-script source (contains no `</script`).
 */
export function buildFirstFrameScript() {
    return [
        '(function () {',
        '  "use strict";',
        `  var ID = ${JSON.stringify(DOM_IDS.firstFrame)};`,
        `  var STYLE = ${JSON.stringify(STYLE_MARKER)};`,
        `  var CLAIMED = ${JSON.stringify(GLOBALS.firstFrameClaimed)};`,
        `  var API = ${JSON.stringify(GLOBALS.firstFrame)};`,
        '  var g = globalThis;',
        '  if (g[API] && typeof g[API].end === "function") return;',
        '  var removed = false;',
        '  function node() {',
        '    try { return document.getElementById(ID); } catch (e) { return null; }',
        '  }',
        '  function dropStyle() {',
        '    try {',
        '      var list = typeof document.getElementsByTagName === "function" ? document.getElementsByTagName("style") : [];',
        '      for (var i = list.length - 1; i >= 0; i -= 1) {',
        '        var sheet = list[i];',
        '        var text = sheet && typeof sheet.textContent === "string" ? sheet.textContent.trimStart() : "";',
        '        if (sheet && text.indexOf("/*") === 0 && text.indexOf(STYLE) >= 0 && sheet.parentNode) {',
        '          sheet.parentNode.removeChild(sheet);',
        '        }',
        '      }',
        '    } catch (e) { /* the app theme reasserts itself when the sheet is gone */ }',
        '  }',
        '  function remove() {',
        '    if (removed) return;',
        '    removed = true;',
        '    try {',
        '      var el = node();',
        '      if (el && el.parentNode) el.parentNode.removeChild(el);',
        '    } catch (e) { /* the mask is decorative: never throw during boot */ }',
        '    dropStyle();',
        '  }',
        '  function hide() {',
        '    try {',
        '      var el = node();',
        '      if (!el) { remove(); return; }',
        '      el.style.transition = "opacity 160ms ease";',
        '      el.style.opacity = "0";',
        '      setTimeout(remove, 200);',
        '    } catch (e) { remove(); }',
        '  }',
        '  g[API] = {',
        '    end: function () {',
        '      try {',
        '        g[CLAIMED] = true;',
        '        hide();',
        '      } catch (e) { remove(); }',
        '    },',
        '    hide: hide',
        '  };',
        // Self-defence: only hides an UNCLAIMED mask, so a healthy client keeps
        // priority (it may still be fading its own overlay in).
        `  setTimeout(function () {`,
        '    try {',
        '      if (g[CLAIMED]) return;',
        '      hide();',
        '    } catch (e) { remove(); }',
        `  }, ${LIMITS.firstFrameFallbackMs});`,
        '})();',
    ].join('\n');
}
/** Serialize a value only to measure/validate the injected payload. */
function jsonLength(value) {
    try {
        return JSON.stringify(value)?.length ?? 0;
    }
    catch {
        return Number.POSITIVE_INFINITY;
    }
}
/** A media source is safe for inline injection when it is compact and non-data. */
function compactMediaSource(source) {
    return !source.startsWith('data:') && source.length <= 64 * 1024;
}
/**
 * Bound the config that is inlined into index.html. A valid config can carry
 * up to thirty 96 Mi-character data URLs, which would otherwise make the
 * first HTML response gigabytes long. The persisted config is untouched: only
 * the injected copy is degraded, and the UI can still read the full value
 * through the host route.
 */
function limitInjectionConfig(config) {
    const originalSize = jsonLength(config);
    if (originalSize <= LIMITS.maxInjectedConfigChars)
        return config;
    const stripped = {
        ...config,
        videos: config.videos.filter(compactMediaSource),
        audio: {
            ...config.audio,
            file: compactMediaSource(config.audio.file) ? config.audio.file : '',
        },
    };
    const strippedSize = jsonLength(stripped);
    if (strippedSize <= LIMITS.maxInjectedConfigChars) {
        console.warn(`[dsh-boot-custom] injected config was ${String(originalSize)} chars; data/long media sources were omitted from the first-frame payload`);
        return stripped;
    }
    if (strippedSize <= LIMITS.maxInjectedConfigHardChars) {
        console.warn(`[dsh-boot-custom] injected config remains ${String(strippedSize)} chars after media stripping`);
        return stripped;
    }
    console.warn(`[dsh-boot-custom] injected config exceeds ${String(LIMITS.maxInjectedConfigHardChars)} chars; disabling the boot animation for this render`);
    return { ...DEFAULT_CONFIG, enabled: false };
}
/**
 * Build the complete structured row table for one index render.
 *
 * Globals are always emitted (the browser half needs to know whether the
 * feature is disabled); the mask/style/script only exist when it is enabled.
 *
 * @param config - normalized configuration.
 * @param meta - plugin identity and resolved write mode.
 * @returns rows in render order.
 */
export function buildInjectionRows(config, meta) {
    const injectedConfig = limitInjectionConfig(config);
    const rows = [
        { kind: 'global', name: GLOBALS.config, value: injectedConfig },
        { kind: 'global', name: GLOBALS.meta, value: meta },
    ];
    if (!injectedConfig.enabled)
        return rows;
    rows.push({ kind: 'style', text: buildFirstFrameStyle(injectedConfig) });
    rows.push({ kind: 'html', placement: 'body', html: buildFirstFrameMarkup(injectedConfig) });
    rows.push({ kind: 'script', placement: 'body', text: buildFirstFrameScript() });
    return rows;
}
