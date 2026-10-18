/**
 * Pure configuration sanitization and small shared helpers.
 *
 * Everything here is total: no input can make it throw, and every output is
 * safe to place in an injected `<style>`/HTML row. Both halves call
 * {@link normalizeConfig} before using a value, so a hand-edited settings file
 * can never produce invalid CSS, an unsafe URL scheme or an out-of-range
 * number.
 *
 * @module dsh-boot-custom/shared/config
 */
import { type BootAnimationConfig, type TimeSlot, type TimeSlotTexts, type VideoRotationMode } from './types.js';
/** True for a plain non-array object. */
export declare function isRecord(value: unknown): value is Record<string, unknown>;
/** Deep clone of JSON-shaped data (no cycles assumed, as for a config file). */
export declare function deepClone<T>(value: T): T;
/**
 * Merge `patch` over `base`. Plain objects merge recursively; arrays and
 * scalars replace. `undefined` leaves the base value untouched.
 */
export declare function deepMerge<T>(base: T, patch: unknown): T;
/** Clamp `value` into `[min, max]`, optionally rounding to `step`. */
export declare function clampNumber(value: unknown, min: number, max: number, step: number, fallback: number): number;
/** Read a boolean, falling back for anything that is not a real boolean. */
export declare function readBool(value: unknown, fallback: boolean): boolean;
/** Read one member of a string union, falling back for unknown members. */
export declare function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T;
/** Strip control characters (newlines/tabs preserved) and cap the length. */
export declare function readText(value: unknown, fallback: string, maxLength: number): string;
/**
 * Validate a color value before it can reach injected CSS. Anything outside
 * the grammar falls back, which keeps a config edit from closing the rule.
 */
export declare function readColor(value: unknown, fallback: string): string;
/** Restrict a font-family list to characters that cannot escape a CSS value. */
export declare function readFontFamily(value: unknown, fallback: string): string;
/**
 * Validate a media source before it becomes a `video/audio` `src`.
 *
 * Accepted schemes: http(s), file, blob and `data:video|audio`. Relative paths
 * (including plugin-relative `./x.mp4`) pass because they have no scheme.
 */
export declare function readMediaSource(value: unknown, fallback?: string): string;
/** Normalize one file/path source for the `videos` list, dropping duplicates. */
export declare function readVideoList(value: unknown, fallback: string[]): string[];
/** Normalize one line list (used by random greetings). */
export declare function readLineList(value: unknown, fallback: string[]): string[];
/** Normalize the six per-period greeting lines. */
export declare function readTimeTexts(value: unknown, fallback: TimeSlotTexts): TimeSlotTexts;
/**
 * Coerce arbitrary input into a complete, valid configuration.
 *
 * @param input - possibly-partial, possibly-hostile user configuration.
 * @returns a fresh object; never the same reference as `input`.
 */
export declare function normalizeConfig(input: unknown): BootAnimationConfig;
/**
 * The greeting period for `date` (local time).
 *
 * Six non-overlapping periods: 0-4 dawn, 5-8 morning, 9-11 noon, 12-17
 * afternoon, 18-22 evening, 23 night.
 */
export declare function timeSlotFor(date: Date): TimeSlot;
/**
 * Resolve the greeting line for one boot.
 *
 * @param config - normalized configuration.
 * @param date - clock used for the time-of-day mode.
 * @param random - injectable RNG so the behavior is testable.
 * @returns a possibly multi-line string; never empty.
 */
export declare function resolveGreeting(config: BootAnimationConfig, date?: Date, random?: () => number): string;
/**
 * Pick the video index for this boot.
 *
 * @param count - number of sources.
 * @param mode - random or sequence.
 * @param random - injectable RNG.
 * @param cursor - previous sequential cursor (persisted by the browser half).
 * @returns the index, or `-1` when there is nothing to play.
 */
export declare function pickVideoIndex(count: number, mode: VideoRotationMode, random?: () => number, cursor?: number): number;
/** Next sequential cursor after playing `index`. */
export declare function nextCursor(index: number, count: number): number;
/** Escape a string for a text/attribute context in injected HTML. */
export declare function escapeHtml(value: string): string;
/** True when the source is a `data:` URI (base64 or percent-encoded). */
export declare function isDataUrl(value: string): boolean;
/** True when the source is a local filesystem path or `file:` URL. */
export declare function isLocalPath(value: string): boolean;
/**
 * Turn a Windows/UNC path into a media URL usable by a `<video>` element.
 * `encodeURI` keeps the drive colon and slashes while escaping spaces and
 * non-ASCII characters. Unknown input is returned trimmed.
 */
export declare function toMediaUrl(value: string): string;
/** sRGB color with straight alpha, used by the titlebar contrast math. */
export interface RgbaColor {
    r: number;
    g: number;
    b: number;
    a: number;
}
/** Symbol color used on dark launch backgrounds (matches the desktop palette). */
export declare const TITLEBAR_SYMBOL_LIGHT = "#f9fafb";
/** Symbol color used on light launch backgrounds (matches the desktop palette). */
export declare const TITLEBAR_SYMBOL_DARK = "#0f1115";
/**
 * Parse the CSS color forms the plugin accepts: hex (3/4/6/8 digits),
 * rgb()/rgba(), hsl()/hsla() and the common named colors. Unknown formats
 * return `undefined` so the caller can fall back instead of guessing.
 */
export declare function parseCssColor(value: string): RgbaColor | undefined;
/** WCAG relative luminance for one opaque sRGB color. */
export declare function relativeLuminance(color: Pick<RgbaColor, 'r' | 'g' | 'b'>): number;
/**
 * Pick a caption-glyph color that stays readable on the launch background.
 *
 * Translucent colors are composited over the default boot backdrop first, so
 * `rgba(255, 255, 255, 0.2)` is not treated as white. Unknown formats fall
 * back to the light glyph (the safe choice for a dark boot screen).
 *
 * @param background - the configured launch background or a sampled frame color.
 * @returns `TITLEBAR_SYMBOL_LIGHT` or `TITLEBAR_SYMBOL_DARK`.
 */
export declare function contrastSymbolColor(background: string): string;
/** Human-readable byte size used by the settings panel warnings. */
export declare function formatBytes(bytes: number): string;
/** Short display label for a long data URI or path. */
export declare function sourceLabel(source: string): string;
