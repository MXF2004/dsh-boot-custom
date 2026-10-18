/**
 * Small DOM helpers shared by the controller.
 *
 * @module dsh-boot-custom/client/boot/dom
 */

/** Create a div with an optional class name. */
export function div(className?: string): HTMLDivElement {
  const element = document.createElement('div')
  if (className !== undefined) element.className = className
  return element
}

/** Set a CSS custom property on an element, ignoring frozen styles. */
export function setVar(element: HTMLElement, name: string, value: string): void {
  try {
    element.style.setProperty(name, value)
  } catch {
    // A detached element still accepts styles, but a hostile environment may not.
  }
}

/** Remove a CSS custom property so the stylesheet fallback applies again. */
export function clearVar(element: HTMLElement, name: string): void {
  try {
    element.style.removeProperty(name)
  } catch {
    // Ignore.
  }
}

/** Escape a string for use inside a CSS `url("…")`-style value. */
export function cssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ')
}

/** Reduce motion for an element (used when the user asked for less motion). */
export function disableAnimations(element: HTMLElement): void {
  try {
    element.style.animation = 'none'
    element.style.transition = 'none'
  } catch {
    // Ignore.
  }
}

/** True when the element (or an ancestor) is an editable field. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return target.closest('[contenteditable="true"]') !== null
}
