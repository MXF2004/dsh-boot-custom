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
import { DEFAULT_CONFIG } from './defaults.js';
import { CSS_ANIMATION_STYLES } from './css-effects.js';
import { LIMITS, } from './types.js';
/** True for a plain non-array object. */
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Deep clone of JSON-shaped data (no cycles assumed, as for a config file). */
export function deepClone(value) {
    if (Array.isArray(value))
        return value.map((entry) => deepClone(entry));
    if (isRecord(value)) {
        const out = {};
        for (const key of Object.keys(value))
            out[key] = deepClone(value[key]);
        return out;
    }
    return value;
}
/**
 * Merge `patch` over `base`. Plain objects merge recursively; arrays and
 * scalars replace. `undefined` leaves the base value untouched.
 */
export function deepMerge(base, patch) {
    if (patch === undefined)
        return deepClone(base);
    if (!isRecord(base) || !isRecord(patch))
        return deepClone(patch);
    const out = deepClone(base);
    for (const key of Object.keys(patch)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype')
            continue;
        const next = patch[key];
        if (next === undefined)
            continue;
        out[key] = isRecord(out[key]) && isRecord(next) ? deepMerge(out[key], next) : deepClone(next);
    }
    return out;
}
/** Clamp `value` into `[min, max]`, optionally rounding to `step`. */
export function clampNumber(value, min, max, step, fallback) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return fallback;
    const clamped = Math.min(max, Math.max(min, value));
    const stepped = Math.round(clamped / step) * step;
    // Re-clamp after rounding so 0.95 with step 0.1 cannot land at 1.0 when max is 0.9.
    return Math.min(max, Math.max(min, Number(stepped.toFixed(4))));
}
/** Read a boolean, falling back for anything that is not a real boolean. */
export function readBool(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}
/** Read one member of a string union, falling back for unknown members. */
export function readEnum(value, allowed, fallback) {
    return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}
/** Strip control characters (newlines/tabs preserved) and cap the length. */
export function readText(value, fallback, maxLength) {
    if (typeof value !== 'string')
        return fallback;
    const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}
/** Strict CSS color grammar: hex, rgb(a), hsl(a) or a CSS named color. */
const COLOR_PATTERN = /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\(\s*[-+0-9.%\s,/]+\)|[a-zA-Z]{3,20})$/i;
/**
 * Validate a color value before it can reach injected CSS. Anything outside
 * the grammar falls back, which keeps a config edit from closing the rule.
 */
export function readColor(value, fallback) {
    if (typeof value !== 'string')
        return fallback;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 64)
        return fallback;
    return COLOR_PATTERN.test(trimmed) ? trimmed : fallback;
}
/** Restrict a font-family list to characters that cannot escape a CSS value. */
export function readFontFamily(value, fallback) {
    if (typeof value !== 'string')
        return fallback;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 120)
        return fallback;
    return /^[\w\s,'"\-]+$/.test(trimmed) ? trimmed : fallback;
}
/**
 * Validate a media source before it becomes a `video/audio` `src`.
 *
 * Accepted schemes: http(s), file, blob and `data:video|audio`. Relative paths
 * (including plugin-relative `./x.mp4`) pass because they have no scheme.
 */
export function readMediaSource(value, fallback = '') {
    if (typeof value !== 'string')
        return fallback;
    const trimmed = value.trim();
    if (trimmed.length === 0)
        return fallback;
    if (trimmed.length > LIMITS.maxDataVideoChars)
        return fallback;
    if (/^data:/i.test(trimmed)) {
        return /^data:(?:video|audio)\/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)*,/i.test(trimmed) ? trimmed : fallback;
    }
    // Reject UNC paths and file URLs with a remote authority: they can trigger
    // outbound SMB/NTLM traffic from the desktop renderer.
    if (/^\\\\/.test(trimmed) || /^\/\//.test(trimmed))
        return fallback;
    if (/^file:\/\/[^/]/i.test(trimmed))
        return fallback;
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[a-z]:[\\/]/i.test(trimmed)) {
        return /^(?:https?|file|blob|dsh-plugin):/i.test(trimmed) ? trimmed : fallback;
    }
    return trimmed;
}
/** Normalize one file/path source for the `videos` list, dropping duplicates. */
export function readVideoList(value, fallback) {
    if (!Array.isArray(value))
        return [...fallback];
    const out = [];
    for (const entry of value) {
        const source = readMediaSource(entry);
        if (source.length === 0)
            continue;
        if (out.includes(source))
            continue;
        out.push(source);
        if (out.length >= LIMITS.maxVideos)
            break;
    }
    return out;
}
/** Normalize one line list (used by random greetings). */
export function readLineList(value, fallback) {
    if (!Array.isArray(value))
        return [...fallback];
    const out = [];
    for (const entry of value) {
        const line = readText(entry, '', 500).trim();
        if (line.length === 0)
            continue;
        out.push(line);
        if (out.length >= 50)
            break;
    }
    return out.length > 0 ? out : [...fallback];
}
/** Normalize the six per-period greeting lines. */
export function readTimeTexts(value, fallback) {
    const source = isRecord(value) ? value : {};
    const keys = ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night'];
    const out = { ...fallback };
    for (const key of keys)
        out[key] = readText(source[key], fallback[key], 500);
    return out;
}
/** Normalize one logo group. */
function normalizeLogo(value) {
    const base = DEFAULT_CONFIG.logo;
    const source = isRecord(value) ? value : {};
    return {
        enabled: readBool(source.enabled, base.enabled),
        text: readText(source.text, base.text, 200),
        fontSize: clampNumber(source.fontSize, 12, 160, 1, base.fontSize),
        color: readColor(source.color, base.color),
        glow: readBool(source.glow, base.glow),
        glowColor: readColor(source.glowColor, base.glowColor),
        vertical: clampNumber(source.vertical, 0, 100, 1, base.vertical),
        fontFamily: readFontFamily(source.fontFamily, base.fontFamily),
        overlayInVideo: readBool(source.overlayInVideo, base.overlayInVideo),
    };
}
/** Normalize one greeting group. */
function normalizeGreeting(value) {
    const base = DEFAULT_CONFIG.greeting;
    const source = isRecord(value) ? value : {};
    return {
        enabled: readBool(source.enabled, base.enabled),
        mode: readEnum(source.mode, ['fixed', 'time', 'random'], base.mode),
        fixedText: readText(source.fixedText, base.fixedText, 500),
        timeTexts: readTimeTexts(source.timeTexts, base.timeTexts),
        randomTexts: readLineList(source.randomTexts, base.randomTexts),
        fontSize: clampNumber(source.fontSize, 8, 96, 1, base.fontSize),
        color: readColor(source.color, base.color),
        glow: readBool(source.glow, base.glow),
        glowColor: readColor(source.glowColor, base.glowColor),
        fontFamily: readFontFamily(source.fontFamily, base.fontFamily),
        vertical: clampNumber(source.vertical, 0, 100, 1, base.vertical),
        animation: readEnum(source.animation, ['fade', 'typewriter'], base.animation),
        overlayInVideo: readBool(source.overlayInVideo, base.overlayInVideo),
    };
}
/**
 * Coerce arbitrary input into a complete, valid configuration.
 *
 * @param input - possibly-partial, possibly-hostile user configuration.
 * @returns a fresh object; never the same reference as `input`.
 */
export function normalizeConfig(input) {
    const source = isRecord(input) ? input : {};
    const base = DEFAULT_CONFIG;
    const playing = isRecord(source.playing) ? source.playing : {};
    const progress = isRecord(source.progress) ? source.progress : {};
    const countdown = isRecord(source.countdown) ? source.countdown : {};
    const transition = isRecord(source.transition) ? source.transition : {};
    const audio = isRecord(source.audio) ? source.audio : {};
    return {
        version: 1,
        enabled: readBool(source.enabled, base.enabled),
        mode: readEnum(source.mode, ['video', 'css'], base.mode),
        cssAnimation: readEnum(source.cssAnimation, CSS_ANIMATION_STYLES, base.cssAnimation),
        allowSkip: readBool(source.allowSkip, base.allowSkip),
        bootDuration: clampNumber(source.bootDuration, 0, LIMITS.maxBootDuration, 0.5, base.bootDuration),
        videos: readVideoList(source.videos, base.videos),
        videoMode: readEnum(source.videoMode, ['random', 'sequence'], base.videoMode),
        playing: {
            rate: clampNumber(playing.rate, 0.25, 2, 0.25, base.playing.rate),
            background: readColor(playing.background, base.playing.background),
        },
        logo: normalizeLogo(source.logo),
        greeting: normalizeGreeting(source.greeting),
        progress: {
            enabled: readBool(progress.enabled, base.progress.enabled),
            style: readEnum(progress.style, ['line', 'capsule', 'glow'], base.progress.style),
            color: readColor(progress.color, base.progress.color),
            trackColor: readColor(progress.trackColor, base.progress.trackColor),
            position: readEnum(progress.position, ['top', 'bottom'], base.progress.position),
            showPercent: readBool(progress.showPercent, base.progress.showPercent),
            realProgress: readBool(progress.realProgress, base.progress.realProgress),
        },
        countdown: {
            enabled: readBool(countdown.enabled, base.countdown.enabled),
            seconds: clampNumber(countdown.seconds, 0, 10, 1, base.countdown.seconds),
            fontSize: clampNumber(countdown.fontSize, 8, 56, 1, base.countdown.fontSize),
            color: readColor(countdown.color, base.countdown.color),
            glow: readBool(countdown.glow, base.countdown.glow),
            glowColor: readColor(countdown.glowColor, base.countdown.glowColor),
            position: readEnum(countdown.position, ['center', 'bottom-right', 'above-progress'], base.countdown.position),
            hintText: readText(countdown.hintText, base.countdown.hintText, 60),
            showHint: readBool(countdown.showHint, base.countdown.showHint),
        },
        transition: {
            style: readEnum(transition.style, ['fade', 'slide-up', 'zoom', 'black', 'blur'], base.transition.style),
            duration: clampNumber(transition.duration, 0.1, 2, 0.1, base.transition.duration),
        },
        audio: {
            enabled: readBool(audio.enabled, base.audio.enabled),
            source: readEnum(audio.source, ['video', 'custom'], base.audio.source),
            file: readMediaSource(audio.file, base.audio.file),
            volume: clampNumber(audio.volume, 0, 100, 1, base.audio.volume),
            fade: readBool(audio.fade, base.audio.fade),
        },
    };
}
/**
 * The greeting period for `date` (local time).
 *
 * Six non-overlapping periods: 0-4 dawn, 5-8 morning, 9-11 noon, 12-17
 * afternoon, 18-22 evening, 23 night.
 */
export function timeSlotFor(date) {
    const hour = date.getHours();
    if (hour < 5)
        return 'dawn';
    if (hour < 9)
        return 'morning';
    if (hour < 12)
        return 'noon';
    if (hour < 18)
        return 'afternoon';
    if (hour < 23)
        return 'evening';
    return 'night';
}
/**
 * Resolve the greeting line for one boot.
 *
 * @param config - normalized configuration.
 * @param date - clock used for the time-of-day mode.
 * @param random - injectable RNG so the behavior is testable.
 * @returns a possibly multi-line string; never empty.
 */
export function resolveGreeting(config, date = new Date(), random = Math.random) {
    const greeting = config.greeting;
    const slot = timeSlotFor(date);
    if (greeting.mode === 'time') {
        const line = greeting.timeTexts[slot];
        if (line.trim().length > 0)
            return line;
    }
    if (greeting.mode === 'random') {
        const lines = greeting.randomTexts.filter((line) => line.trim().length > 0);
        if (lines.length > 0) {
            const index = Math.min(lines.length - 1, Math.max(0, Math.floor(random() * lines.length)));
            return lines[index] ?? lines[0] ?? greeting.fixedText;
        }
    }
    return greeting.fixedText.trim().length > 0 ? greeting.fixedText : '欢迎回来';
}
/**
 * Pick the video index for this boot.
 *
 * @param count - number of sources.
 * @param mode - random or sequence.
 * @param random - injectable RNG.
 * @param cursor - previous sequential cursor (persisted by the browser half).
 * @returns the index, or `-1` when there is nothing to play.
 */
export function pickVideoIndex(count, mode, random = Math.random, cursor = 0) {
    if (!Number.isFinite(count) || count <= 0)
        return -1;
    if (mode === 'random') {
        const value = random();
        const safe = Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
        return Math.floor(safe * count);
    }
    return ((Math.trunc(cursor) % count) + count) % count;
}
/** Next sequential cursor after playing `index`. */
export function nextCursor(index, count) {
    if (count <= 0)
        return 0;
    return ((index + 1) % count + count) % count;
}
/** Escape a string for a text/attribute context in injected HTML. */
export function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
/** True when the source is a `data:` URI (base64 or percent-encoded). */
export function isDataUrl(value) {
    return /^data:/i.test(value.trim());
}
/** True when the source is a local filesystem path or `file:` URL. */
export function isLocalPath(value) {
    const trimmed = value.trim();
    return /^file:/i.test(trimmed) || /^[a-z]:[\\/]/i.test(trimmed);
}
/**
 * Turn a Windows/UNC path into a media URL usable by a `<video>` element.
 * `encodeURI` keeps the drive colon and slashes while escaping spaces and
 * non-ASCII characters. Unknown input is returned trimmed.
 */
export function toMediaUrl(value) {
    const trimmed = value.trim();
    if (trimmed.length === 0)
        return '';
    if (/^file:/i.test(trimmed)) {
        // `file:///...` (empty authority) only; reject remote file authorities.
        return /^file:\/\/[^/]/i.test(trimmed) ? '' : trimmed;
    }
    if (/^[a-z]:[\\/]/i.test(trimmed)) {
        const normalized = trimmed.replace(/\\/g, '/');
        return encodeURI(`file:///${normalized}`);
    }
    // UNC paths are deliberately not converted; they can leak NTLM credentials.
    if (/^\\\\/.test(trimmed) || /^\/\//.test(trimmed))
        return '';
    return trimmed;
}
/** Symbol color used on dark launch backgrounds (matches the desktop palette). */
export const TITLEBAR_SYMBOL_LIGHT = '#f9fafb';
/** Symbol color used on light launch backgrounds (matches the desktop palette). */
export const TITLEBAR_SYMBOL_DARK = '#0f1115';
/** Common CSS named colors accepted by the color filter, normalized to hex. */
const NAMED_COLORS = {
    white: '#ffffff',
    black: '#000000',
    transparent: 'rgba(0, 0, 0, 0)',
    gray: '#808080',
    grey: '#808080',
    silver: '#c0c0c0',
    red: '#ff0000',
    green: '#008000',
    blue: '#0000ff',
    yellow: '#ffff00',
    orange: '#ffa500',
    purple: '#800080',
    navy: '#000080',
    teal: '#008080',
    lime: '#00ff00',
    aqua: '#00ffff',
    fuchsia: '#ff00ff',
    maroon: '#800000',
};
/** Parse an alpha component (`0.5`, `50%`). */
function parseAlpha(part) {
    if (part === undefined)
        return 1;
    const numeric = Number.parseFloat(part);
    if (!Number.isFinite(numeric))
        return 1;
    const alpha = part.endsWith('%') ? numeric / 100 : numeric;
    return Math.min(1, Math.max(0, alpha));
}
/** Convert HSL (h in degrees, s/l in 0..1) to sRGB channels. */
function hslToRgb(hue, saturation, lightness) {
    const h = ((hue % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lightness - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60)
        [r, g, b] = [c, x, 0];
    else if (h < 120)
        [r, g, b] = [x, c, 0];
    else if (h < 180)
        [r, g, b] = [0, c, x];
    else if (h < 240)
        [r, g, b] = [0, x, c];
    else if (h < 300)
        [r, g, b] = [x, 0, c];
    else
        [r, g, b] = [c, 0, x];
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
/**
 * Parse the CSS color forms the plugin accepts: hex (3/4/6/8 digits),
 * rgb()/rgba(), hsl()/hsla() and the common named colors. Unknown formats
 * return `undefined` so the caller can fall back instead of guessing.
 */
export function parseCssColor(value) {
    const input = value.trim();
    if (input.length === 0)
        return undefined;
    const named = NAMED_COLORS[input.toLowerCase()];
    if (named !== undefined)
        return parseCssColor(named);
    if (input.startsWith('#')) {
        const hex = input.slice(1);
        if (!/^[0-9a-f]+$/i.test(hex))
            return undefined;
        if (hex.length === 3 || hex.length === 4) {
            const r = Number.parseInt(`${hex[0]}${hex[0]}`, 16);
            const g = Number.parseInt(`${hex[1]}${hex[1]}`, 16);
            const b = Number.parseInt(`${hex[2]}${hex[2]}`, 16);
            const a = hex.length === 4 ? Number.parseInt(`${hex[3]}${hex[3]}`, 16) / 255 : 1;
            return { r, g, b, a };
        }
        if (hex.length === 6 || hex.length === 8) {
            const r = Number.parseInt(hex.slice(0, 2), 16);
            const g = Number.parseInt(hex.slice(2, 4), 16);
            const b = Number.parseInt(hex.slice(4, 6), 16);
            const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
            return { r, g, b, a };
        }
        return undefined;
    }
    const hslMatch = /^hsla?\(\s*(-?[\d.]+)\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(input);
    if (hslMatch !== null) {
        const hue = Number.parseFloat(hslMatch[1] ?? '0');
        const saturation = Math.min(100, Math.max(0, Number.parseFloat(hslMatch[2] ?? '0'))) / 100;
        const lightness = Math.min(100, Math.max(0, Number.parseFloat(hslMatch[3] ?? '0'))) / 100;
        const rgb = hslToRgb(Number.isFinite(hue) ? hue : 0, saturation, lightness);
        return { ...rgb, a: parseAlpha(hslMatch[4]) };
    }
    const match = /^rgba?\(\s*([\d.]+%?)[,\s]+([\d.]+%?)[,\s]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(input);
    if (match === null)
        return undefined;
    const channel = (part) => {
        if (part === undefined)
            return 0;
        const numeric = Number.parseFloat(part);
        if (!Number.isFinite(numeric))
            return 0;
        const scaled = part.endsWith('%') ? (numeric / 100) * 255 : numeric;
        return Math.min(255, Math.max(0, scaled));
    };
    return {
        r: channel(match[1]),
        g: channel(match[2]),
        b: channel(match[3]),
        a: parseAlpha(match[4]),
    };
}
/** WCAG relative luminance for one opaque sRGB color. */
export function relativeLuminance(color) {
    const linear = (value) => {
        const channel = value / 255;
        return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}
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
export function contrastSymbolColor(background) {
    const parsed = parseCssColor(background);
    if (parsed === undefined)
        return TITLEBAR_SYMBOL_LIGHT;
    const alpha = parsed.a;
    const over = { r: 11, g: 18, b: 32 }; // DEFAULT_CONFIG.playing.background
    const color = {
        r: parsed.r * alpha + over.r * (1 - alpha),
        g: parsed.g * alpha + over.g * (1 - alpha),
        b: parsed.b * alpha + over.b * (1 - alpha),
    };
    return relativeLuminance(color) > 0.5 ? TITLEBAR_SYMBOL_DARK : TITLEBAR_SYMBOL_LIGHT;
}
/** Human-readable byte size used by the settings panel warnings. */
export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0)
        return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
/** Short display label for a long data URI or path. */
export function sourceLabel(source) {
    if (isDataUrl(source)) {
        const kind = /^data:([^;,]+)/i.exec(source)?.[1] ?? 'data';
        return `[${kind}] ${formatBytes(Math.floor((source.length * 3) / 4))}`;
    }
    return source;
}
