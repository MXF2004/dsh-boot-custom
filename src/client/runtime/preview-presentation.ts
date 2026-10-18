/**
 * Preview presentation.
 *
 * A preview must own the whole window: the Settings modal sits in its own
 * body-level portal (z-index 1000) and would otherwise float over the
 * animation. There is no public "reopen this section" API in the 0.2.x
 * settings shell, so closing the modal would lose the active section and the
 * user's draft. Instead this module hides the modal's portal in place and
 * restores it exactly:
 *
 *  - `html.dba-previewing` carries a CSS rule for the current/next portal
 *    node (the shell may replace it while the preview runs);
 *  - the current portal also gets inline `visibility/pointer-events/opacity`
 *    as a fallback for engines without `:has()`;
 *  - the restore is idempotent and refcounted, so overlapping preview starts
 *    cannot unhide the modal early;
 *  - focus is moved out of the now-invisible dialog so Esc/Space still reach
 *    the preview's capture-phase skip handler.
 *
 * The modal's own state (open, active section, draft) is untouched.
 *
 * @module dsh-boot-custom/client/runtime/preview-presentation
 */

import { DOC_CLASSES } from '../../shared/constants.js'

/** Marks the settings dialog in the 0.2.x shell. */
const PANEL_SELECTOR = '[data-shortcut-modal="settings"]'
/** Inline properties used as the no-`:has()` fallback. */
const PROPERTIES = ['visibility', 'pointer-events', 'opacity'] as const

/** Saved inline declaration (value + priority) for one property. */
interface SavedDeclaration {
  name: string
  value: string
  priority: string
}

let count = 0
let target: HTMLElement | null = null
let previous: SavedDeclaration[] | null = null

/** Find the body-level portal root that contains the settings dialog. */
function findSettingsPortal(): HTMLElement | null {
  try {
    const panel = document.querySelector(PANEL_SELECTOR)
    if (!(panel instanceof HTMLElement)) return null
    // 0.2.x: the dialog is a child of the body-level `role="presentation"`
    // portal. `closest` keeps the target correct if the shell adds an inner
    // wrapper; `parentElement` remains the fallback for other structures.
    const presentation = panel.closest('[role="presentation"]')
    const portal =
      presentation instanceof HTMLElement && presentation.parentElement === document.body
        ? presentation
        : panel.parentElement
    // Guard against ever hiding the app root or body itself on a shell whose
    // structure differs from the 0.2.x settings portal.
    if (portal === null || portal === document.body || portal.id === 'root') return null
    return portal
  } catch {
    return null
  }
}

/** Save the inline declarations this module is about to override. */
function saveInline(element: HTMLElement): SavedDeclaration[] {
  return PROPERTIES.map((name) => ({
    name,
    value: element.style.getPropertyValue(name),
    priority: element.style.getPropertyPriority(name),
  }))
}

/** Restore the saved inline declarations exactly. */
function restoreInline(element: HTMLElement, saved: SavedDeclaration[]): void {
  for (const declaration of saved) {
    try {
      if (declaration.value === '') element.style.removeProperty(declaration.name)
      else element.style.setProperty(declaration.name, declaration.value, declaration.priority)
    } catch {
      // A detached/frozen style node is already effectively restored.
    }
  }
}

/**
 * Hide the Settings modal for a preview.
 *
 * @returns an idempotent restore function; call it when the preview ends.
 */
export function hideSettingsForPreview(): () => void {
  if (count === 0) {
    try {
      document.documentElement.classList.add(DOC_CLASSES.previewing)
    } catch {
      // A missing documentElement only loses the CSS fallback.
    }
    target = findSettingsPortal()
    if (target !== null) {
      previous = saveInline(target)
      try {
        target.style.setProperty('visibility', 'hidden', 'important')
        target.style.setProperty('pointer-events', 'none', 'important')
        target.style.setProperty('opacity', '0', 'important')
      } catch {
        // The CSS class covers the common case.
      }
    } else {
      previous = null
    }
    // A focused control inside the hidden dialog would otherwise keep the
    // keydown guard treating the preview as "typing in a field".
    try {
      const active = document.activeElement
      if (active instanceof HTMLElement) active.blur()
    } catch {
      // Ignore a non-blurrable active element.
    }
  }
  count += 1

  let released = false
  return () => {
    if (released) return
    released = true
    count = Math.max(0, count - 1)
    if (count > 0) return
    try {
      document.documentElement.classList.remove(DOC_CLASSES.previewing)
    } catch {
      // Ignore.
    }
    if (target !== null && previous !== null) {
      restoreInline(target, previous)
    }
    target = null
    previous = null
  }
}
