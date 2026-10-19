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
/** Where the loading progress reads its value from. */
export type ProgressStyle = 'line' | 'capsule' | 'glow';
/** Screen edge the progress bar hugs. */
export type ProgressPosition = 'top' | 'bottom';
/** Exit transition family. */
export type TransitionStyle = 'fade' | 'slide-up' | 'zoom' | 'black' | 'blur';
/** CSS-only backdrop animation family. */
export type CssAnimationStyle = 'breathe' | 'aurora' | 'starfield' | 'sweep' | 'pulse' | 'grid' | 'spotlight' | 'none';
/** Video rotation policy across boots. */
export type VideoRotationMode = 'random' | 'sequence';
/** Greeting source. */
export type GreetingMode = 'fixed' | 'time' | 'random';
/** Greeting entrance animation. */
export type GreetingAnimation = 'fade' | 'typewriter';
/** Countdown placement. */
export type CountdownPosition = 'center' | 'bottom-right' | 'above-progress';
/** Audio source: the video's own track or a dedicated sound file. */
export type AudioSource = 'video' | 'custom';
/** The six non-overlapping greeting periods of a day. */
export type TimeSlot = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';
/** Per-period greeting copy. */
export interface TimeSlotTexts {
    dawn: string;
    morning: string;
    noon: string;
    afternoon: string;
    evening: string;
    night: string;
}
/** Logo watermark / CSS-mode hero text. */
export interface LogoConfig {
    enabled: boolean;
    /** Multi-line text; rendered with `white-space: pre-line`. */
    text: string;
    fontSize: number;
    color: string;
    glow: boolean;
    glowColor: string;
    /** Vertical anchor as a percentage of the titlebar-safe area (0 = top). */
    vertical: number;
    fontFamily: string;
    /** Overlay the logo on top of a running video (watermark mode). */
    overlayInVideo: boolean;
}
/** Boot greeting lines. */
export interface GreetingConfig {
    enabled: boolean;
    mode: GreetingMode;
    fixedText: string;
    timeTexts: TimeSlotTexts;
    /** One line per entry; picked at random on every boot. */
    randomTexts: string[];
    fontSize: number;
    color: string;
    glow: boolean;
    glowColor: string;
    fontFamily: string;
    /** Vertical anchor as a percentage of the titlebar-safe area (0 = top). */
    vertical: number;
    animation: GreetingAnimation;
    overlayInVideo: boolean;
}
/** Real loading progress bar. */
export interface ProgressConfig {
    enabled: boolean;
    style: ProgressStyle;
    color: string;
    trackColor: string;
    position: ProgressPosition;
    showPercent: boolean;
    /** Bind to real boot signals instead of a time-simulated ramp. */
    realProgress: boolean;
}
/** Skip countdown. */
export interface CountdownConfig {
    enabled: boolean;
    /** 0..10 seconds; 0 unlocks skipping immediately. */
    seconds: number;
    fontSize: number;
    color: string;
    glow: boolean;
    glowColor: string;
    position: CountdownPosition;
    /** Text after the number, e.g. "\u79d2\u540e\u53ef\u8df3\u8fc7". */
    hintText: string;
    /** Render the hint next to the number. */
    showHint: boolean;
}
/** Exit transition. */
export interface TransitionConfig {
    style: TransitionStyle;
    /** 0.1..2 seconds. */
    duration: number;
}
/** Audio. */
export interface AudioConfig {
    enabled: boolean;
    source: AudioSource;
    /** Local path, http(s) URL, plugin-relative path or `data:audio/...`. */
    file: string;
    /** 0..100. */
    volume: number;
    fade: boolean;
}
/** Playback controls. */
export interface PlayingConfig {
    /** 0.25..2, step 0.25. */
    rate: number;
    /** Backdrop shown behind video / CSS fallback. */
    background: string;
}
/** The complete, normalized boot animation configuration. */
export interface BootAnimationConfig {
    version: number;
    /** Master switch; when false the plugin injects no mask and renders nothing. */
    enabled: boolean;
    /** `css` renders the built-in animated fallback selected by `cssAnimation`. */
    mode: 'video' | 'css';
    /** Backdrop animation used by the CSS fallback (and a failed video). */
    cssAnimation: CssAnimationStyle;
    /** Master skip switch. When false the countdown is hidden and skipping is refused. */
    allowSkip: boolean;
    /**
     * Minimum seconds the animation stays on screen before the app page is
     * revealed. The app-ready gate is still required, so a slow UI keeps the
     * animation up longer. 0 disables the extra wait.
     */
    bootDuration: number;
    /** Video sources: file paths, http(s) URLs, plugin-relative paths or data URIs. */
    videos: string[];
    videoMode: VideoRotationMode;
    playing: PlayingConfig;
    logo: LogoConfig;
    greeting: GreetingConfig;
    progress: ProgressConfig;
    countdown: CountdownConfig;
    transition: TransitionConfig;
    audio: AudioConfig;
}
/** Persistence mode resolved by the host and consumed by the settings panel. */
export type ConfigWriteMode = 'config-editor' | 'settings' | 'file';
/** Payload published on `window.__BOOT_ANIM_META__`. */
export interface BootAnimationMeta {
    name: string;
    version: string;
    writeMode: ConfigWriteMode;
    /** Random per-activation token required by the local config routes. */
    writeToken?: string;
    /**
     * Epoch milliseconds of the index render that painted the first-frame mask.
     * `bootDuration` counts from this instant, so the mask's on-screen time is
     * part of the animation rather than extra startup latency.
     */
    startedAt?: number;
    /**
     * The greeting resolved by the host when the index was rendered. The browser
     * half reuses it for the boot run so the first-frame mask and the animation
     * show the same line (important for the random mode).
     */
    greeting?: string;
}
/** Hard limits shared by validation, the UI and the host body parser. */
export declare const LIMITS: {
    /** Maximum number of managed video sources. */
    readonly maxVideos: 30;
    /** Maximum accepted `data:` video payload (base64 characters). */
    readonly maxDataVideoChars: number;
    /** Maximum accepted `data:` audio payload (base64 characters). */
    readonly maxDataAudioChars: number;
    /** Maximum JSON body accepted by the host config route. */
    readonly maxBodyBytes: number;
    /** Preferred total injected-config JSON size; larger values are degraded. */
    readonly maxInjectedConfigChars: number;
    /** Absolute injected-config ceiling; above this the animation is disabled. */
    readonly maxInjectedConfigHardChars: number;
    /** Files larger than this get the "prefer a local path" warning. */
    readonly largeFileBytes: number;
    /** Hard ceiling for a single local file turned into base64 (matches 96 Mi encoded chars). */
    readonly maxBase64SourceBytes: number;
    /** Total visible boot budget from the first-frame paint before forced teardown. */
    readonly hardTimeoutMs: 20000;
    /** Self-defence timeout of the injected first-frame mask. */
    readonly firstFrameFallbackMs: 12000;
    /** Minimum time the animation stays on screen even when the UI is ready. */
    readonly minVisibleMs: 900;
    /** Upper bound of the configurable animation duration (seconds). */
    readonly maxBootDuration: 18;
};
