/**
 * Shared-model tests: normalization, security filters and greeting/rotation
 * logic. These are the pure functions both halves trust, so they get the
 * densest coverage.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  contrastSymbolColor,
  deepMerge,
  normalizeConfig,
  parseCssColor,
  pickVideoIndex,
  readColor,
  readMediaSource,
  readText,
  relativeLuminance,
  resolveGreeting,
  TITLEBAR_SYMBOL_DARK,
  TITLEBAR_SYMBOL_LIGHT,
  timeSlotFor,
  toMediaUrl,
} from '../lib/shared/config.js'
import { CSS_ANIMATION_STYLES } from '../lib/shared/css-effects.js'
import { DEFAULT_CONFIG } from '../lib/shared/defaults.js'
import { LIMITS } from '../lib/shared/types.js'

/** A local date at a specific hour (month is irrelevant to the slot logic). */
function atHour(hour) {
  return new Date(2026, 0, 1, hour, 0, 0, 0)
}

test('defaults are complete, normalized and stable', () => {
  const config = normalizeConfig(undefined)
  assert.equal(config.enabled, true)
  assert.equal(config.mode, 'css')
  assert.equal(config.cssAnimation, 'breathe')
  assert.equal(config.allowSkip, true)
  assert.equal(config.bootDuration, 3)
  assert.equal(config.playing.rate, 1)
  assert.equal(config.playing.background, '#0b1220')
  assert.equal(config.countdown.seconds, 3)
  assert.equal(config.countdown.hintText, '秒后可跳过')
  assert.equal(config.transition.style, 'fade')
  assert.equal(config.transition.duration, 0.3)
  assert.equal(config.audio.enabled, false)
  assert.equal(config.audio.source, 'video')
  assert.equal(config.audio.volume, 50)
  assert.equal(config.audio.fade, true)
  assert.deepEqual(config.videos, [])
  assert.equal(config.progress.realProgress, true)
  // The defaults object itself must never be mutated by normalization.
  assert.deepEqual(DEFAULT_CONFIG.videos, [])
})

test('css animation styles are enum-constrained', () => {
  assert.equal(normalizeConfig({ cssAnimation: 'aurora' }).cssAnimation, 'aurora')
  for (const style of CSS_ANIMATION_STYLES) {
    assert.equal(normalizeConfig({ cssAnimation: style }).cssAnimation, style)
  }
  assert.equal(normalizeConfig({ cssAnimation: 'hologram' }).cssAnimation, 'breathe')
  assert.equal(normalizeConfig({ cssAnimation: 42 }).cssAnimation, 'breathe')
})

test('numbers clamp to their documented ranges and steps', () => {
  const config = normalizeConfig({
    playing: { rate: 1.7 },
    logo: { fontSize: 999, vertical: -20 },
    greeting: { fontSize: 1, vertical: 400 },
    countdown: { seconds: 4.6, fontSize: 1000 },
    transition: { duration: 9 },
    audio: { volume: 250 },
    bootDuration: 99,
  })
  assert.equal(config.bootDuration, 18)
  assert.equal(normalizeConfig({ bootDuration: -5 }).bootDuration, 0)
  assert.equal(normalizeConfig({ bootDuration: 2.3 }).bootDuration, 2.5)
  assert.equal(config.playing.rate, 1.75)
  assert.equal(config.logo.fontSize, 160)
  assert.equal(config.logo.vertical, 0)
  assert.equal(config.greeting.fontSize, 8)
  assert.equal(config.greeting.vertical, 100)
  assert.equal(config.countdown.seconds, 5)
  assert.equal(config.countdown.fontSize, 56)
  assert.equal(config.transition.duration, 2)
  assert.equal(config.audio.volume, 100)

  const low = normalizeConfig({
    playing: { rate: -4 },
    countdown: { seconds: -2 },
    transition: { duration: 0.01 },
    audio: { volume: -50 },
  })
  assert.equal(low.playing.rate, 0.25)
  assert.equal(low.countdown.seconds, 0)
  assert.equal(low.transition.duration, 0.1)
  assert.equal(low.audio.volume, 0)
})

test('invalid types fall back instead of throwing', () => {
  for (const hostile of [null, 42, 'text', [], { deeply: { nested: true } }]) {
    const config = normalizeConfig(hostile)
    assert.equal(config.playing.rate, 1)
    assert.equal(config.mode, 'css')
  }
  const coerced = normalizeConfig({ enabled: 'yes', mode: 'hologram', allowSkip: 1 })
  assert.equal(coerced.enabled, true)
  assert.equal(coerced.mode, 'css')
  assert.equal(coerced.allowSkip, true)
})

test('colors outside the CSS grammar are rejected', () => {
  assert.equal(readColor('#fff', '#000'), '#fff')
  assert.equal(readColor('#0b1220', '#000'), '#0b1220')
  assert.equal(readColor('rgba(79, 157, 255, 0.4)', '#000'), 'rgba(79, 157, 255, 0.4)')
  assert.equal(readColor('hsl(210 80% 60%)', '#000'), 'hsl(210 80% 60%)')
  assert.equal(readColor('red', '#000'), 'red')
  assert.equal(readColor('red;background:url(x)', '#000'), '#000')
  assert.equal(readColor('url(javascript:alert(1))', '#000'), '#000')
  assert.equal(readColor('#12', '#000'), '#000')

  const config = normalizeConfig({ logo: { color: 'red;} body { background: black' } })
  assert.equal(config.logo.color, DEFAULT_CONFIG.logo.color)
})

test('font families cannot escape a CSS value', () => {
  const config = normalizeConfig({ logo: { fontFamily: 'Inter; } body { display:none' } })
  assert.equal(config.logo.fontFamily, DEFAULT_CONFIG.logo.fontFamily)
  assert.equal(normalizeConfig({ logo: { fontFamily: '"Noto Sans", system-ui' } }).logo.fontFamily, '"Noto Sans", system-ui')
})

test('media sources accept only safe schemes', () => {
  assert.equal(readMediaSource('https://example.com/a.mp4'), 'https://example.com/a.mp4')
  assert.equal(readMediaSource('file:///C:/videos/a.mp4'), 'file:///C:/videos/a.mp4')
  assert.equal(readMediaSource('file://server/share/a.mp4'), '', 'remote file authority rejected')
  assert.equal(readMediaSource('\\\\server\\share\\a.mp4'), '', 'UNC path rejected')
  assert.equal(readMediaSource('//server/share/a.mp4'), '', 'forward-slash UNC rejected')
  assert.equal(readMediaSource('C:\\videos\\a.mp4'), 'C:\\videos\\a.mp4')
  assert.equal(readMediaSource('./assets/intro.webm'), './assets/intro.webm')
  assert.equal(readMediaSource('data:video/mp4;base64,AAAA'), 'data:video/mp4;base64,AAAA')
  assert.equal(readMediaSource('data:audio/mpeg;base64,AAAA'), 'data:audio/mpeg;base64,AAAA')
  assert.equal(readMediaSource('javascript:alert(1)'), '')
  assert.equal(readMediaSource('data:text/html;base64,AAAA'), '')
  assert.equal(readMediaSource('ftp://example.com/a.mp4'), '')
})

test('audio data URLs use the smaller audio cap', () => {
  const prefix = 'data:audio/mpeg;base64,'
  const tooLarge = prefix + 'A'.repeat(LIMITS.maxDataAudioChars - prefix.length + 1)
  assert.equal(readMediaSource(tooLarge, '', 'audio'), '', 'audio payload over its own cap is rejected')
  assert.equal(readMediaSource(prefix + 'AAAA', '', 'audio'), prefix + 'AAAA')
  assert.equal(
    readMediaSource(prefix + 'AAAA', '', 'video'),
    prefix + 'AAAA',
    'the same small source remains valid for the video reader',
  )
})

test('video lists dedupe, drop unsafe entries and cap the count', () => {
  const config = normalizeConfig({
    videos: ['https://a/1.mp4', 'javascript:alert(1)', 'https://a/1.mp4', './2.webm', 'data:text/html,x'],
  })
  assert.deepEqual(config.videos, ['https://a/1.mp4', './2.webm'])

  const many = Array.from({ length: 40 }, (_, index) => `https://a/${String(index)}.mp4`)
  assert.equal(normalizeConfig({ videos: many }).videos.length, 30)
})

test('multi-line text keeps newlines but strips control characters', () => {
  assert.equal(readText('a\nb\tc\u0007d', '', 100), 'a\nb\tcd')
  const config = normalizeConfig({ logo: { text: 'Line 1\nLine 2' } })
  assert.equal(config.logo.text, 'Line 1\nLine 2')
  assert.equal(normalizeConfig({ logo: { text: 'x'.repeat(500) } }).logo.text.length, 200)
})

test('the six greeting periods are non-overlapping and total', () => {
  assert.deepEqual(
    [0, 2, 4, 5, 8, 9, 11, 12, 17, 18, 22, 23].map((hour) => timeSlotFor(atHour(hour))),
    [
      'dawn',
      'dawn',
      'dawn',
      'morning',
      'morning',
      'noon',
      'noon',
      'afternoon',
      'afternoon',
      'evening',
      'evening',
      'night',
    ],
  )
})

test('greeting modes resolve correctly and never return empty', () => {
  const timeConfig = normalizeConfig({
    greeting: { mode: 'time', timeTexts: { dawn: '凌晨好', night: '深夜好' } },
  })
  assert.equal(resolveGreeting(timeConfig, atHour(2)), '凌晨好')
  assert.equal(resolveGreeting(timeConfig, atHour(23)), '深夜好')

  const fixed = normalizeConfig({ greeting: { mode: 'fixed', fixedText: '固定问候' } })
  assert.equal(resolveGreeting(fixed, atHour(9)), '固定问候')

  const random = normalizeConfig({ greeting: { mode: 'random', randomTexts: ['A', 'B', 'C'] } })
  assert.equal(resolveGreeting(random, atHour(9), () => 0), 'A')
  assert.equal(resolveGreeting(random, atHour(9), () => 0.99), 'C')
  assert.equal(
    resolveGreeting(normalizeConfig({ greeting: { mode: 'fixed', fixedText: '' } }), atHour(9)),
    '欢迎回来',
  )
})

test('random lines survive round-trip through normalization', () => {
  const config = normalizeConfig({ greeting: { mode: 'random', randomTexts: ['第一行\n第二行', '  ', 'Emoji 🚀'] } })
  assert.deepEqual(config.greeting.randomTexts, ['第一行\n第二行', 'Emoji 🚀'])
  assert.equal(normalizeConfig({ greeting: { randomTexts: [] } }).greeting.randomTexts.length > 0, true)
})

test('video rotation: sequence wraps, random stays in range', () => {
  assert.equal(pickVideoIndex(3, 'sequence', Math.random, 0), 0)
  assert.equal(pickVideoIndex(3, 'sequence', Math.random, 3), 0)
  assert.equal(pickVideoIndex(3, 'sequence', Math.random, 4), 1)
  assert.equal(pickVideoIndex(3, 'sequence', Math.random, -1), 2)
  assert.equal(pickVideoIndex(3, 'random', () => 0, 0), 0)
  assert.equal(pickVideoIndex(3, 'random', () => 0.99, 0), 2)
  assert.equal(pickVideoIndex(0, 'random', () => 0.5, 0), -1)
})

test('Windows paths become usable file URLs', () => {
  assert.equal(toMediaUrl('C:\\videos\\intro clip.mp4'), 'file:///C:/videos/intro%20clip.mp4')
  assert.equal(toMediaUrl('file:///C:/videos/a.mp4'), 'file:///C:/videos/a.mp4')
  assert.equal(toMediaUrl('file://server/share/a.mp4'), '', 'remote file authority rejected')
  assert.equal(toMediaUrl('\\\\server\\share\\a.mp4'), '', 'UNC path rejected')
  assert.equal(toMediaUrl('//server/share/a.mp4'), '', 'forward-slash UNC rejected')
  assert.equal(toMediaUrl('https://example.com/a.mp4'), 'https://example.com/a.mp4')
  assert.equal(toMediaUrl('  ./a.webm  '), './a.webm')
})

test('deepMerge ignores prototype-polluting keys', () => {
  const merged = deepMerge({ safe: 1 }, JSON.parse('{"__proto__":{"polluted":true},"x":2}'))
  assert.equal(merged.safe, 1)
  assert.equal(merged.x, 2)
  assert.equal({}.polluted, undefined)
})

test('normalization returns a fresh object', () => {
  const input = { logo: { text: 'A' }, videos: ['https://a/1.mp4'] }
  const config = normalizeConfig(input)
  config.logo.text = 'B'
  config.videos.push('https://a/2.mp4')
  assert.equal(input.logo.text, 'A')
  assert.equal(input.videos.length, 1)
})

test('CSS colors parse into sRGB channels', () => {
  assert.deepEqual(parseCssColor('#0b1220'), { r: 11, g: 18, b: 32, a: 1 })
  assert.deepEqual(parseCssColor('#abc'), { r: 170, g: 187, b: 204, a: 1 })
  assert.deepEqual(parseCssColor('#0b122080'), { r: 11, g: 18, b: 32, a: 128 / 255 })
  const rgba = parseCssColor('rgba(255, 255, 255, 0.5)')
  assert.equal(rgba.r, 255)
  assert.equal(rgba.a, 0.5)
  assert.equal(parseCssColor('rgb(100% 50% 0%)').r, 255)
  const hsl = parseCssColor('hsl(210 80% 60%)')
  assert.ok(Math.abs(hsl.r - 71) <= 1 && Math.abs(hsl.g - 153) <= 1 && Math.abs(hsl.b - 235) <= 1)
  assert.deepEqual(parseCssColor('white'), { r: 255, g: 255, b: 255, a: 1 })
  assert.deepEqual(parseCssColor('transparent'), { r: 0, g: 0, b: 0, a: 0 })
  assert.equal(parseCssColor('not-a-color'), undefined)
})

test('relative luminance orders dark and light colors', () => {
  assert.ok(relativeLuminance({ r: 0, g: 0, b: 0 }) < 0.01)
  assert.ok(relativeLuminance({ r: 255, g: 255, b: 255 }) > 0.99)
  assert.ok(relativeLuminance({ r: 249, g: 250, b: 251 }) > relativeLuminance({ r: 27, g: 27, b: 28 }))
})

test('caption glyphs adapt to the launch background', () => {
  assert.equal(contrastSymbolColor('#0b1220'), TITLEBAR_SYMBOL_LIGHT)
  assert.equal(contrastSymbolColor('#000000'), TITLEBAR_SYMBOL_LIGHT)
  assert.equal(contrastSymbolColor('#f9fafb'), TITLEBAR_SYMBOL_DARK)
  assert.equal(contrastSymbolColor('#ffffff'), TITLEBAR_SYMBOL_DARK)
  assert.equal(contrastSymbolColor('rgb(245, 245, 245)'), TITLEBAR_SYMBOL_DARK)
  assert.equal(contrastSymbolColor('rgba(0, 0, 0, 0.9)'), TITLEBAR_SYMBOL_LIGHT)
  assert.equal(contrastSymbolColor('white'), TITLEBAR_SYMBOL_DARK)
  assert.equal(contrastSymbolColor('black'), TITLEBAR_SYMBOL_LIGHT)
  assert.equal(
    contrastSymbolColor('#808080'),
    TITLEBAR_SYMBOL_DARK,
    'mid gray chooses the higher-contrast dark glyph instead of a fixed 0.5 threshold',
  )
  // Unknown formats fall back to the light glyph (safe on a dark boot screen).
  assert.equal(contrastSymbolColor('transparent'), TITLEBAR_SYMBOL_LIGHT)
  assert.equal(contrastSymbolColor('hsl(210 80% 60%)'), TITLEBAR_SYMBOL_DARK)
  assert.equal(contrastSymbolColor('not-a-color'), TITLEBAR_SYMBOL_LIGHT)
})
