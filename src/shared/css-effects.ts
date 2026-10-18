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

import type { CssAnimationStyle } from './types.js'

/** Every selectable backdrop style, in settings-page order. */
export const CSS_ANIMATION_STYLES: readonly CssAnimationStyle[] = [
  'breathe',
  'aurora',
  'starfield',
  'sweep',
  'pulse',
  'grid',
  'spotlight',
  'none',
] as const

/** Chinese labels for the settings page and docs. */
export const CSS_ANIMATION_LABELS: Record<CssAnimationStyle, string> = {
  breathe: '呼吸光晕',
  aurora: '极光流影',
  starfield: '星河流转',
  sweep: '光带扫过',
  pulse: '脉冲涟漪',
  grid: '霓虹网格',
  spotlight: '旋转光锥',
  none: '纯净背景',
}

const KF_BREATHE = `
@keyframes dba-fx-breathe {
  0%, 100% { opacity: 0.10; transform: scale3d(0.94, 0.94, 1); }
  50% { opacity: 0.28; transform: scale3d(1.06, 1.06, 1); }
}
`
const KF_AURORA = `
@keyframes dba-fx-aurora {
  0% { opacity: 0.50; transform: translate3d(-4%, 2%, 0) rotate(-6deg) scale3d(1.02, 1.02, 1); }
  100% { opacity: 0.74; transform: translate3d(5%, -3%, 0) rotate(7deg) scale3d(1.16, 1.16, 1); }
}
`
const KF_SPIN = `
@keyframes dba-fx-spin {
  to { transform: rotate(360deg); }
}
`
const KF_STARS = `
@keyframes dba-fx-stars {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-130px, 260px, 0); }
}
`
const KF_TWINKLE = `
@keyframes dba-fx-twinkle {
  0%, 100% { opacity: 0.32; }
  50% { opacity: 0.72; }
}
`
const KF_SWEEP = `
@keyframes dba-fx-sweep {
  0% { opacity: 0; transform: translate3d(-75%, 0, 0) skewX(-10deg); }
  12% { opacity: 0.72; }
  55% { opacity: 0.72; }
  100% { opacity: 0; transform: translate3d(75%, 0, 0) skewX(-10deg); }
}
`
const KF_PULSE = `
@keyframes dba-fx-pulse {
  0% { opacity: 0; transform: scale3d(0.35, 0.35, 1); }
  12% { opacity: 0.55; }
  100% { opacity: 0; transform: scale3d(1.9, 1.9, 1); }
}
`
const KF_GRID = `
@keyframes dba-fx-grid {
  from { background-position: 0 0, 0 0; }
  to { background-position: 0 44px, 0 0; }
}
`
const KF_GRID_GLOW = `
@keyframes dba-fx-grid-glow {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.62; }
}
`

/** Keyframes each style actually uses, so the host can emit only those. */
const STYLE_KEYFRAMES: Record<CssAnimationStyle, readonly string[]> = {
  breathe: [KF_BREATHE],
  aurora: [KF_AURORA, KF_SPIN],
  starfield: [KF_STARS, KF_TWINKLE],
  sweep: [KF_SWEEP],
  pulse: [KF_PULSE],
  grid: [KF_GRID, KF_GRID_GLOW],
  spotlight: [KF_SPIN, KF_TWINKLE],
  none: [],
}

/** Accent used when the config carries no usable logo glow color. */
const DEFAULT_ACCENT = '#4f9dff'

/**
 * Build the backdrop-effect CSS for one selector.
 *
 * @param selector - The element that owns the effect (the client fallback or
 *   the first-frame mask). Its `data-css-style` attribute selects the style.
 * @param styles - Styles to emit; the host emits only the active one, the
 *   client emits every style so live settings changes need no stylesheet
 *   rebuild.
 */
export function buildCssEffectCss(
  selector: string,
  styles: readonly CssAnimationStyle[] = CSS_ANIMATION_STYLES,
): string {
  const s = selector
  const accent = `var(--dba-fx-accent, ${DEFAULT_ACCENT})`
  const uniqueStyles = [...new Set(styles)]
  // Only ship the keyframes the selected styles can actually reference. The
  // host injects one style into the first-frame row; the client requests all.
  const keyframes = [...new Set(uniqueStyles.flatMap((style) => STYLE_KEYFRAMES[style]))].join('\n')
  const blocks: string[] = [
    keyframes,
    `
${s}::before,
${s}::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0;
  will-change: transform, opacity;
}
${s} > * {
  position: relative;
  z-index: 1;
}
`,
  ]

  for (const style of uniqueStyles) {
    if (style === 'breathe') {
      blocks.push(`
${s}[data-css-style="breathe"]::before {
  inset: 12%;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 48%, ${accent}, transparent 68%);
  filter: blur(46px);
  animation: dba-fx-breathe 7s ease-in-out infinite;
}
`)
    } else if (style === 'aurora') {
      blocks.push(`
${s}[data-css-style="aurora"]::before {
  inset: -22%;
  background:
    radial-gradient(42% 48% at 24% 30%, color-mix(in srgb, ${accent} 56%, transparent), transparent 70%),
    radial-gradient(46% 52% at 76% 24%, color-mix(in srgb, #8b5cf6 52%, transparent), transparent 72%),
    radial-gradient(52% 56% at 54% 84%, color-mix(in srgb, #22d3ee 46%, transparent), transparent 72%);
  filter: blur(52px);
  animation: dba-fx-aurora 18s ease-in-out infinite alternate;
}
${s}[data-css-style="aurora"]::after {
  inset: -30%;
  background: conic-gradient(from 210deg at 50% 50%, transparent 0deg, color-mix(in srgb, ${accent} 26%, transparent) 55deg, transparent 120deg, transparent 360deg);
  filter: blur(54px);
  opacity: 0.38;
  animation: dba-fx-spin 32s linear infinite;
}
`)
    } else if (style === 'starfield') {
      blocks.push(`
${s}[data-css-style="starfield"]::before {
  inset: -45%;
  background-image:
    radial-gradient(2px 2px at 24px 38px, rgba(255, 255, 255, 0.98), transparent 55%),
    radial-gradient(1.3px 1.3px at 132px 96px, rgba(255, 255, 255, 0.82), transparent 55%),
    radial-gradient(2.2px 2.2px at 208px 42px, rgba(255, 255, 255, 0.95), transparent 55%),
    radial-gradient(1.3px 1.3px at 74px 186px, rgba(255, 255, 255, 0.72), transparent 55%),
    radial-gradient(1.7px 1.7px at 176px 218px, rgba(255, 255, 255, 0.88), transparent 55%),
    radial-gradient(1.2px 1.2px at 42px 118px, rgba(255, 255, 255, 0.62), transparent 55%),
    radial-gradient(1.6px 1.6px at 196px 150px, rgba(255, 255, 255, 0.78), transparent 55%);
  background-size: 240px 240px;
  opacity: 0.9;
  animation: dba-fx-stars 34s linear infinite;
}
${s}[data-css-style="starfield"]::after {
  inset: 0;
  background: radial-gradient(circle at 50% 46%, color-mix(in srgb, ${accent} 22%, transparent), transparent 62%);
  animation: dba-fx-twinkle 5.5s ease-in-out infinite;
}
`)
    } else if (style === 'sweep') {
      blocks.push(`
${s}[data-css-style="sweep"]::after {
  inset: -40%;
  background: linear-gradient(115deg, transparent 38%, rgba(255, 255, 255, 0.06) 46%, color-mix(in srgb, ${accent} 26%, transparent) 50%, rgba(255, 255, 255, 0.04) 54%, transparent 62%);
  mix-blend-mode: screen;
  animation: dba-fx-sweep 8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
`)
    } else if (style === 'pulse') {
      blocks.push(`
${s}[data-css-style="pulse"]::before,
${s}[data-css-style="pulse"]::after {
  inset: auto;
  left: 50%;
  top: 50%;
  width: 46vmin;
  height: 46vmin;
  margin: -23vmin 0 0 -23vmin;
  border: 1px solid color-mix(in srgb, ${accent} 55%, transparent);
  border-radius: 50%;
  box-shadow: inset 0 0 40px color-mix(in srgb, ${accent} 12%, transparent);
  animation: dba-fx-pulse 5s ease-out infinite;
}
${s}[data-css-style="pulse"]::after {
  animation-delay: 2.5s;
}
`)
    } else if (style === 'grid') {
      blocks.push(`
${s}[data-css-style="grid"]::before {
  inset: auto 0 -6% 0;
  height: 72%;
  background-image:
    linear-gradient(color-mix(in srgb, ${accent} 50%, transparent) 2px, transparent 2px),
    linear-gradient(90deg, color-mix(in srgb, ${accent} 50%, transparent) 2px, transparent 2px);
  background-size: 48px 48px;
  opacity: 0.5;
  transform: perspective(700px) rotateX(56deg);
  transform-origin: 50% 100%;
  -webkit-mask-image: linear-gradient(to top, #000 28%, transparent 92%);
  mask-image: linear-gradient(to top, #000 28%, transparent 92%);
  animation: dba-fx-grid 3.4s linear infinite;
}
${s}[data-css-style="grid"]::after {
  inset: auto 0 44% 0;
  height: 22%;
  background: radial-gradient(58% 100% at 50% 100%, color-mix(in srgb, ${accent} 34%, transparent), transparent 72%);
  filter: blur(24px);
  animation: dba-fx-grid-glow 6s ease-in-out infinite;
}
`)
    } else if (style === 'spotlight') {
      blocks.push(`
${s}[data-css-style="spotlight"]::before {
  inset: -35%;
  border-radius: 50%;
  background: conic-gradient(from 0deg at 50% 50%, transparent 0deg, transparent 28deg, color-mix(in srgb, ${accent} 34%, transparent) 52deg, transparent 82deg, transparent 180deg, color-mix(in srgb, #8b5cf6 18%, transparent) 230deg, transparent 280deg);
  filter: blur(38px);
  opacity: 0.68;
  animation: dba-fx-spin 20s linear infinite;
}
${s}[data-css-style="spotlight"]::after {
  inset: 8%;
  background: radial-gradient(circle at 50% 50%, color-mix(in srgb, ${accent} 10%, transparent), transparent 65%);
  animation: dba-fx-twinkle 7s ease-in-out infinite;
}
`)
    }
    // `none` intentionally emits no style rule: the base gradient remains.
  }

  return blocks.join('\n')
}
