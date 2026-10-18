/**
 * Settings-panel stylesheet.
 *
 * Theme-neutral on purpose: surfaces and borders derive from `currentColor`
 * with `color-mix`, so the panel follows the DSH theme in both light and dark
 * mode without importing theme tokens (which are not part of the slot
 * contract). Only the accent is fixed.
 *
 * @module dsh-boot-custom/client/settings/styles
 */

import { DOM_IDS } from '../../shared/constants.js'

/** The complete panel stylesheet. */
const STYLE_TEXT = `
/*
 * The shell's outer dialog is overflow:hidden, but Chromium can still move
 * its scrollTop when a focused field is brought into view, pushing the header
 * and the × button out of the panel. The clip value makes that element
 * non-scrollable while keeping the rounded-corner clipping; the options child
 * remains the only scroll container.
 */
[data-shortcut-modal="settings"] {
  overflow: clip !important;
}

.dba-set {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
  line-height: 1.5;
  color: inherit;
  padding-bottom: 8px;
}
.dba-set *, .dba-set *::before, .dba-set *::after { box-sizing: border-box; }

.dba-set-header {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 2px 4px;
}
.dba-set-title-main { font-size: 15px; font-weight: 650; letter-spacing: 0.01em; }
.dba-set-status { font-size: 11.5px; opacity: 0.7; }
.dba-set-status[data-tone="error"] { color: #ef6b6b; opacity: 1; }

.dba-set-section {
  border: 1px solid color-mix(in srgb, currentColor 13%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, currentColor 2.5%, transparent);
  overflow: hidden;
}
.dba-set-summary {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 10px 13px;
  cursor: pointer;
  user-select: none;
  list-style: none;
}
.dba-set-summary::-webkit-details-marker { display: none; }
.dba-set-summary::before {
  content: "\\25B8";
  font-size: 10px;
  opacity: 0.55;
  transition: transform 150ms ease;
  transform-origin: 50% 50%;
  display: inline-block;
}
.dba-set-section[open] > .dba-set-summary::before { transform: rotate(90deg); }
.dba-set-title { font-weight: 600; font-size: 13px; }
.dba-set-hint { font-size: 11px; opacity: 0.55; }
.dba-set-body {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 2px 14px 14px;
}

.dba-set-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(190px, 1.5fr);
  gap: 6px 16px;
  align-items: center;
}
@media (max-width: 620px) { .dba-set-row { grid-template-columns: 1fr; } }
.dba-set-row-label { font-size: 12.5px; min-width: 0; }
.dba-set-row-label small { display: block; font-size: 11px; opacity: 0.55; margin-top: 2px; }
.dba-set-row-control {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}
.dba-set-row-control > .dba-set-input,
.dba-set-row-control > .dba-set-slider,
.dba-set-row-control > .dba-set-color,
.dba-set-row-control > .dba-set-videos { flex: 1 1 100%; }

.dba-set-input {
  width: 100%;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  background: color-mix(in srgb, currentColor 4%, transparent);
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  outline: none;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}
.dba-set-input::placeholder { color: currentColor; opacity: 0.35; }
.dba-set-input:focus {
  border-color: #4f9dff;
  box-shadow: 0 0 0 2px rgba(79, 157, 255, 0.22);
}
.dba-set-mono { font-family: ui-monospace, SFMono-Regular, "Cascadia Mono", Consolas, monospace; font-size: 11.5px; }
textarea.dba-set-input { resize: vertical; min-height: 54px; line-height: 1.45; }
.dba-set-select { cursor: pointer; }
.dba-set-select option { color: #111; background: #fff; }

.dba-set-switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; }
.dba-set-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.dba-set-switch-track {
  position: relative;
  flex: 0 0 auto;
  width: 34px;
  height: 19px;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 20%, transparent);
  transition: background 170ms ease;
}
.dba-set-switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  transition: transform 170ms ease;
}
.dba-set-switch input:checked + .dba-set-switch-track { background: #4f9dff; }
.dba-set-switch input:checked + .dba-set-switch-track .dba-set-switch-thumb { transform: translateX(15px); }
.dba-set-switch input:focus-visible + .dba-set-switch-track { outline: 2px solid #4f9dff; outline-offset: 2px; }
.dba-set-switch input:disabled + .dba-set-switch-track { opacity: 0.45; }

.dba-set-slider { display: flex; align-items: center; gap: 10px; width: 100%; }
.dba-set-slider input[type="range"] { flex: 1 1 auto; min-width: 110px; accent-color: #4f9dff; }
.dba-set-slider-value {
  flex: 0 0 auto;
  min-width: 52px;
  text-align: right;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

.dba-set-color { display: flex; align-items: center; gap: 8px; width: 100%; }
.dba-set-swatch {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
}
.dba-set-color-text { flex: 1 1 auto; }

.dba-set-button {
  padding: 6px 12px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  background: color-mix(in srgb, currentColor 5%, transparent);
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, opacity 140ms ease;
  white-space: nowrap;
}
.dba-set-button:hover:not(:disabled) { background: color-mix(in srgb, currentColor 10%, transparent); }
.dba-set-button:disabled { opacity: 0.45; cursor: not-allowed; }
.dba-set-button--primary { background: #4f9dff; border-color: #4f9dff; color: #fff; font-weight: 600; }
.dba-set-button--primary:hover:not(:disabled) { background: #3f8df0; border-color: #3f8df0; }
.dba-set-button--danger { color: #ef6b6b; border-color: color-mix(in srgb, #ef6b6b 45%, transparent); }
.dba-set-button--danger:hover:not(:disabled) { background: rgba(239, 107, 107, 0.12); }

.dba-set-notice {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  background: color-mix(in srgb, currentColor 4%, transparent);
  font-size: 11.5px;
  line-height: 1.55;
}
.dba-set-notice--info { background: rgba(79, 157, 255, 0.08); border-color: rgba(79, 157, 255, 0.3); }
.dba-set-notice--warn { background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.34); }
.dba-set-notice--error { background: rgba(239, 107, 107, 0.1); border-color: rgba(239, 107, 107, 0.36); }

.dba-set-videos { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.dba-set-video-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 7px;
  border-radius: 7px;
  background: color-mix(in srgb, currentColor 5%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 9%, transparent);
}
.dba-set-video-index { flex: 0 0 auto; width: 18px; font-size: 10.5px; opacity: 0.5; text-align: center; }
.dba-set-video-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
}
.dba-set-icon-button {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
  opacity: 0.72;
}
.dba-set-icon-button:hover:not(:disabled) { opacity: 1; background: color-mix(in srgb, currentColor 10%, transparent); }
.dba-set-icon-button:disabled { opacity: 0.25; cursor: not-allowed; }

.dba-set-inline { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; width: 100%; }
.dba-set-inline > .dba-set-input { flex: 1 1 200px; width: auto; }
.dba-set-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 4px 2px 0;
}
.dba-set-spacer { flex: 1 1 auto; }
.dba-set-count { font-size: 11px; opacity: 0.55; }
.dba-set-hidden-input { display: none; }
`

/**
 * Install the panel stylesheet once.
 *
 * @returns a disposer removing the `<style>` element.
 */
export function ensureSettingsStyles(): () => void {
  try {
    if (document.getElementById(DOM_IDS.settingsStyle) !== null) return () => undefined
    const style = document.createElement('style')
    style.id = DOM_IDS.settingsStyle
    style.textContent = STYLE_TEXT
    ;(document.head ?? document.documentElement).appendChild(style)
    return () => {
      try {
        style.remove()
      } catch {
        // Document replaced.
      }
    }
  } catch (error) {
    console.warn('[dsh-boot-custom] settings styles could not be installed:', error)
    return () => undefined
  }
}
