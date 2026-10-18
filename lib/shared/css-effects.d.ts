/**
 * CSS-only backdrop animations.
 *
 * The styles are pure CSS so they work in the first-frame mask (host-built
 * stylesheet) and in the client fallback (static stylesheet) without adding
 * DOM nodes or JavaScript timers. Every effect runs on pseudo-elements of the
 * backdrop, behind the logo/greeting, and is disabled by the reduced-motion
 * rules in both halves.
 *
 * @module dsh-boot-custom/shared/css-effects
 */
import type { CssAnimationStyle } from './types.js';
/** Every selectable backdrop style, in settings-page order. */
export declare const CSS_ANIMATION_STYLES: readonly CssAnimationStyle[];
/** Chinese labels for the settings page and docs. */
export declare const CSS_ANIMATION_LABELS: Record<CssAnimationStyle, string>;
/**
 * Build the backdrop-effect CSS for one selector.
 *
 * @param selector - The element that owns the effect (the client fallback or
 *   the first-frame mask). Its `data-css-style` attribute selects the style.
 * @param styles - Styles to emit; the host emits only the active one, the
 *   client emits every style so live settings changes need no stylesheet
 *   rebuild.
 */
export declare function buildCssEffectCss(selector: string, styles?: readonly CssAnimationStyle[]): string;
