/**
 * Host-side schemastery schemas.
 *
 * Two schemas share one shape:
 *  - {@link Config} is the bundle entry's schema. Every top-level field is
 *    `.volatile()`, which is what DSH >= 0.1.7 projects into the entry's
 *    settings form and what makes `ctx.configEditor.edit()` accept a write.
 *    On schemastery < 3.18.4 — or a host that predates the volatile seam —
 *    the marker is inert and the field behaves as ordinary configuration.
 *  - {@link SettingsSchema} is the plain schema registered as the
 *    `boot-custom` settings namespace on hosts that predate
 *    `ctx.configEditor` (the 0.1.x fallback documented in the README).
 *
 * Both resolve exactly the same defaults, so a value that round-trips through
 * either store is indistinguishable once normalized by `shared/config.ts`.
 *
 * @module dsh-boot-custom/host/schema
 */
import z from '@deepseek-ai/schemastery';
import { CSS_ANIMATION_STYLES } from '../shared/css-effects.js';
import { DEFAULT_CONFIG } from '../shared/defaults.js';
import { LIMITS } from '../shared/types.js';
/** One enum field built from literal constants. */
function enumField(values, fallback) {
    const nodes = values.map((value) => z.const(value));
    const union = z.union(nodes);
    return union.default(fallback);
}
/**
 * Build the shared field dictionary.
 *
 * @param markVolatile - apply `.volatile()` to every top-level field.
 * @returns a schemastery object dictionary.
 */
function buildShape(markVolatile) {
    const maybeVolatile = (node) => {
        if (!markVolatile)
            return node;
        const volatile = node.volatile;
        // Guarded so schemastery < 3.18.4 degrades to a plain field instead of
        // throwing at module evaluation (which would take the whole plugin down).
        return typeof volatile === 'function' ? volatile.call(node) : node;
    };
    const timeTexts = z.object({
        dawn: z.string().default(DEFAULT_CONFIG.greeting.timeTexts.dawn),
        morning: z.string().default(DEFAULT_CONFIG.greeting.timeTexts.morning),
        noon: z.string().default(DEFAULT_CONFIG.greeting.timeTexts.noon),
        afternoon: z.string().default(DEFAULT_CONFIG.greeting.timeTexts.afternoon),
        evening: z.string().default(DEFAULT_CONFIG.greeting.timeTexts.evening),
        night: z.string().default(DEFAULT_CONFIG.greeting.timeTexts.night),
    });
    return {
        version: maybeVolatile(z.number().min(1).max(1).step(1).default(DEFAULT_CONFIG.version)),
        enabled: maybeVolatile(z.boolean().default(DEFAULT_CONFIG.enabled)),
        mode: maybeVolatile(enumField(['video', 'css'], DEFAULT_CONFIG.mode)),
        cssAnimation: maybeVolatile(enumField(CSS_ANIMATION_STYLES, DEFAULT_CONFIG.cssAnimation)),
        allowSkip: maybeVolatile(z.boolean().default(DEFAULT_CONFIG.allowSkip)),
        bootDuration: maybeVolatile(z.number().min(0).max(LIMITS.maxBootDuration).step(0.5).default(DEFAULT_CONFIG.bootDuration)),
        videos: maybeVolatile(z.array(z.string()).default([...DEFAULT_CONFIG.videos])),
        videoMode: maybeVolatile(enumField(['random', 'sequence'], DEFAULT_CONFIG.videoMode)),
        playing: maybeVolatile(z.object({
            rate: z.number().min(0.25).max(2).step(0.25).default(DEFAULT_CONFIG.playing.rate),
            background: z.string().default(DEFAULT_CONFIG.playing.background),
        })),
        logo: maybeVolatile(z.object({
            enabled: z.boolean().default(DEFAULT_CONFIG.logo.enabled),
            text: z.string().default(DEFAULT_CONFIG.logo.text),
            fontSize: z.number().min(12).max(160).step(1).default(DEFAULT_CONFIG.logo.fontSize),
            color: z.string().default(DEFAULT_CONFIG.logo.color),
            glow: z.boolean().default(DEFAULT_CONFIG.logo.glow),
            glowColor: z.string().default(DEFAULT_CONFIG.logo.glowColor),
            vertical: z.number().min(0).max(100).step(1).default(DEFAULT_CONFIG.logo.vertical),
            fontFamily: z.string().default(DEFAULT_CONFIG.logo.fontFamily),
            overlayInVideo: z.boolean().default(DEFAULT_CONFIG.logo.overlayInVideo),
        })),
        greeting: maybeVolatile(z.object({
            enabled: z.boolean().default(DEFAULT_CONFIG.greeting.enabled),
            mode: enumField(['fixed', 'time', 'random'], DEFAULT_CONFIG.greeting.mode),
            fixedText: z.string().default(DEFAULT_CONFIG.greeting.fixedText),
            timeTexts,
            randomTexts: z.array(z.string()).default([...DEFAULT_CONFIG.greeting.randomTexts]),
            fontSize: z.number().min(8).max(96).step(1).default(DEFAULT_CONFIG.greeting.fontSize),
            color: z.string().default(DEFAULT_CONFIG.greeting.color),
            glow: z.boolean().default(DEFAULT_CONFIG.greeting.glow),
            glowColor: z.string().default(DEFAULT_CONFIG.greeting.glowColor),
            fontFamily: z.string().default(DEFAULT_CONFIG.greeting.fontFamily),
            vertical: z.number().min(0).max(100).step(1).default(DEFAULT_CONFIG.greeting.vertical),
            animation: enumField(['fade', 'typewriter'], DEFAULT_CONFIG.greeting.animation),
            overlayInVideo: z.boolean().default(DEFAULT_CONFIG.greeting.overlayInVideo),
        })),
        progress: maybeVolatile(z.object({
            enabled: z.boolean().default(DEFAULT_CONFIG.progress.enabled),
            style: enumField(['line', 'capsule', 'glow'], DEFAULT_CONFIG.progress.style),
            color: z.string().default(DEFAULT_CONFIG.progress.color),
            trackColor: z.string().default(DEFAULT_CONFIG.progress.trackColor),
            position: enumField(['top', 'bottom'], DEFAULT_CONFIG.progress.position),
            showPercent: z.boolean().default(DEFAULT_CONFIG.progress.showPercent),
            realProgress: z.boolean().default(DEFAULT_CONFIG.progress.realProgress),
        })),
        countdown: maybeVolatile(z.object({
            enabled: z.boolean().default(DEFAULT_CONFIG.countdown.enabled),
            seconds: z.number().min(0).max(10).step(1).default(DEFAULT_CONFIG.countdown.seconds),
            fontSize: z.number().min(8).max(56).step(1).default(DEFAULT_CONFIG.countdown.fontSize),
            color: z.string().default(DEFAULT_CONFIG.countdown.color),
            glow: z.boolean().default(DEFAULT_CONFIG.countdown.glow),
            glowColor: z.string().default(DEFAULT_CONFIG.countdown.glowColor),
            position: enumField(['center', 'bottom-right', 'above-progress'], DEFAULT_CONFIG.countdown.position),
            hintText: z.string().default(DEFAULT_CONFIG.countdown.hintText),
            showHint: z.boolean().default(DEFAULT_CONFIG.countdown.showHint),
        })),
        transition: maybeVolatile(z.object({
            style: enumField(['fade', 'slide-up', 'zoom', 'black', 'blur'], DEFAULT_CONFIG.transition.style),
            duration: z.number().min(0.1).max(2).step(0.1).default(DEFAULT_CONFIG.transition.duration),
        })),
        audio: maybeVolatile(z.object({
            enabled: z.boolean().default(DEFAULT_CONFIG.audio.enabled),
            source: enumField(['video', 'custom'], DEFAULT_CONFIG.audio.source),
            file: z.string().default(DEFAULT_CONFIG.audio.file),
            volume: z.number().min(0).max(100).step(1).default(DEFAULT_CONFIG.audio.volume),
            fade: z.boolean().default(DEFAULT_CONFIG.audio.fade),
        })),
    };
}
/**
 * The bundle entry's schema: every top-level field is a volatile anchor.
 * This is the contract that makes the 0.1.7 settings form render and
 * `configEditor.edit(entryId, …)` accept writes.
 */
export const Config = z.object(buildShape(true));
/**
 * The plain namespace schema used by the 0.1.x `ctx.settings` fallback.
 * No volatile markers: the resolved value must be plain JSON so it can be
 * persisted in the settings document.
 */
export const SettingsSchema = z.object(buildShape(false));
