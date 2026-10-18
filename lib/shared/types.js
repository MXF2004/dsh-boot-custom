/**
 * Shared configuration model for the DSH boot animation plugin (`dsh-boot-custom`).
 *
 * This module is imported by BOTH halves of the plugin:
 *  - the host half (`src/index.ts`) to build the schemastery `Config`, persist
 *    the user section and render the first-frame injection;
 *  - the browser half (`src/client/**`) to drive the animation and the settings
 *    panel.
 *
 * It therefore contains no `node:` imports and no browser globals: only pure
 * data and pure functions. Every value that reaches injected CSS/HTML is
 * sanitized here so a hostile or hand-edited config cannot break out of the
 * injection row.
 *
 * @module dsh-boot-custom/shared/types
 */
/** Hard limits shared by validation, the UI and the host body parser. */
export const LIMITS = {
    /** Maximum number of managed video sources. */
    maxVideos: 30,
    /** Maximum accepted `data:` video payload (base64 characters). */
    maxDataVideoChars: 96 * 1024 * 1024,
    /** Maximum accepted `data:` audio payload (base64 characters). */
    maxDataAudioChars: 16 * 1024 * 1024,
    /** Maximum JSON body accepted by the host config route. */
    maxBodyBytes: 128 * 1024 * 1024,
    /** Files larger than this get the "prefer a local path" warning. */
    largeFileBytes: 50 * 1024 * 1024,
    /** Hard ceiling for a single local file turned into base64. */
    maxBase64SourceBytes: 80 * 1024 * 1024,
    /** Total visible boot budget before the forced teardown. */
    hardTimeoutMs: 20_000,
    /** Self-defence timeout of the injected first-frame mask. */
    firstFrameFallbackMs: 12_000,
    /** Minimum time the animation stays on screen even when the UI is ready. */
    minVisibleMs: 900,
    /** Upper bound of the configurable animation duration (seconds). */
    maxBootDuration: 18,
};
