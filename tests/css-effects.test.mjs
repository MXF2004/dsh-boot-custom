/**
 * CSS backdrop style tests.
 *
 * The effects are generated as one selector-scoped string shared by the
 * first-frame injection and the client fallback stylesheet. These tests keep
 * the style list, labels, selector scoping and "only the active style" host
 * optimization honest.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCssEffectCss,
  CSS_ANIMATION_LABELS,
  CSS_ANIMATION_STYLES,
} from '../lib/shared/css-effects.js'

test('exposes several labelled styles with none as the opt-out', () => {
  assert.ok(CSS_ANIMATION_STYLES.length >= 7)
  for (const style of CSS_ANIMATION_STYLES) {
    assert.equal(typeof CSS_ANIMATION_LABELS[style], 'string')
    assert.ok(CSS_ANIMATION_LABELS[style].length > 0)
  }
  assert.ok(CSS_ANIMATION_STYLES.includes('none'))
})

test('emits selector-scoped rules and keyframes for every animated style', () => {
  const css = buildCssEffectCss('#probe')
  for (const style of CSS_ANIMATION_STYLES) {
    if (style === 'none') {
      assert.equal(css.includes('#probe[data-css-style="none"]'), false)
      continue
    }
    assert.ok(css.includes(`#probe[data-css-style="${style}"]`), style)
  }
  assert.ok(css.includes('#probe > *'))
  assert.ok(css.includes('@keyframes dba-fx-breathe'))
  assert.ok(css.includes('@keyframes dba-fx-stars'))
  assert.ok(css.includes('@keyframes dba-fx-pulse'))
  assert.equal(css.toLowerCase().includes('</style'), false)
})

test('emits only the active style for the first-frame injection', () => {
  const css = buildCssEffectCss('#probe', ['grid'])
  assert.ok(css.includes('#probe[data-css-style="grid"]'))
  assert.equal(css.includes('#probe[data-css-style="aurora"]'), false)
  assert.equal(css.includes('#probe[data-css-style="starfield"]'), false)
})
