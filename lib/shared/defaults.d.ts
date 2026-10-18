/**
 * Built-in defaults. The host schema, the JSON fallback file and the browser
 * panel all resolve over this one object, so "restore defaults" is a single
 * source of truth and never drifts between the two halves.
 *
 * @module dsh-boot-custom/shared/defaults
 */
import type { BootAnimationConfig, TimeSlotTexts } from './types.js';
/** Default per-period greetings (6 periods, Chinese-first product copy). */
export declare const DEFAULT_TIME_TEXTS: TimeSlotTexts;
/** Default random greeting lines. */
export declare const DEFAULT_RANDOM_TEXTS: string[];
/** The complete default configuration. */
export declare const DEFAULT_CONFIG: BootAnimationConfig;
