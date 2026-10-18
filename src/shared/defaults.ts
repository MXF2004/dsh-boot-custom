/**
 * Built-in defaults. The host schema, the JSON fallback file and the browser
 * panel all resolve over this one object, so "restore defaults" is a single
 * source of truth and never drifts between the two halves.
 *
 * @module dsh-boot-custom/shared/defaults
 */

import type { BootAnimationConfig, TimeSlotTexts } from './types.js'

/** Default per-period greetings (6 periods, Chinese-first product copy). */
export const DEFAULT_TIME_TEXTS: TimeSlotTexts = {
  dawn: '凌晨了，注意休息',
  morning: '早上好，新的一天',
  noon: '中午好，记得休息一下',
  afternoon: '下午好，继续加油',
  evening: '晚上好，欢迎回来',
  night: '夜深了，早点休息',
}

/** Default random greeting lines. */
export const DEFAULT_RANDOM_TEXTS: string[] = [
  '欢迎回来',
  '今天也要闪闪发光',
  '准备好了吗？',
  '让灵感发生',
]

/** The complete default configuration. */
export const DEFAULT_CONFIG: BootAnimationConfig = {
  version: 1,
  enabled: true,
  mode: 'css',
  cssAnimation: 'breathe',
  allowSkip: true,
  bootDuration: 3,
  videos: [],
  videoMode: 'random',
  playing: {
    rate: 1,
    background: '#0b1220',
  },
  logo: {
    enabled: true,
    text: 'DeepSeek',
    fontSize: 64,
    color: '#eaf4ff',
    glow: true,
    glowColor: '#4f9dff',
    vertical: 40,
    fontFamily: 'system-ui',
    overlayInVideo: true,
  },
  greeting: {
    enabled: true,
    mode: 'time',
    fixedText: '欢迎回来',
    timeTexts: { ...DEFAULT_TIME_TEXTS },
    randomTexts: [...DEFAULT_RANDOM_TEXTS],
    fontSize: 20,
    color: '#a9c4e4',
    glow: false,
    glowColor: '#4f9dff',
    fontFamily: 'system-ui',
    vertical: 52,
    animation: 'fade',
    overlayInVideo: true,
  },
  progress: {
    enabled: true,
    style: 'capsule',
    color: '#4f9dff',
    trackColor: 'rgba(255, 255, 255, 0.14)',
    position: 'bottom',
    showPercent: false,
    realProgress: true,
  },
  countdown: {
    enabled: true,
    seconds: 3,
    fontSize: 15,
    color: '#cfe2f7',
    glow: false,
    glowColor: '#4f9dff',
    position: 'bottom-right',
    hintText: '秒后可跳过',
    showHint: true,
  },
  transition: {
    style: 'fade',
    duration: 0.3,
  },
  audio: {
    enabled: false,
    source: 'video',
    file: '',
    volume: 50,
    fade: true,
  },
}
