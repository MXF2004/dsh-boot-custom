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
import { type BootAnimationConfig, type BootAnimationMeta } from '../shared/types.js';
/** Structured index injection rows (mirrors `@deepseek-ai/dsh-host-webserver`). */
export type IndexInjectionRow = {
    kind: 'global';
    name: string;
    value: unknown;
} | {
    kind: 'script';
    placement: 'head' | 'body';
    text: string;
} | {
    kind: 'script-src';
    placement: 'head' | 'body';
    src: string;
} | {
    kind: 'script-preload';
    src: string;
} | {
    kind: 'style';
    text: string;
} | {
    kind: 'html';
    placement: 'head' | 'body';
    html: string;
};
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
export declare function buildFirstFrameStyle(config: BootAnimationConfig): string;
/**
 * The mask markup. Rendered immediately after `<body>`, before the app root,
 * so the first painted frame is already the mask.
 *
 * @param config - normalized configuration.
 * @returns an HTML fragment.
 */
export declare function buildFirstFrameMarkup(config: BootAnimationConfig): string;
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
export declare function buildFirstFrameScript(): string;
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
export declare function buildInjectionRows(config: BootAnimationConfig, meta: BootAnimationMeta): IndexInjectionRow[];
