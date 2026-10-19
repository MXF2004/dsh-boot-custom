/**
 * The "开机动画" settings page.
 *
 * Registered into the `settings.section` list slot. The panel edits a local
 * draft, debounces saves through {@link ClientConfigStore}, previews the draft
 * through the live controller and never blocks on the host: every failure is
 * shown inline as a notice.
 *
 * Sections mirror the product spec: 基础 / 视频轮播 / 播放 / Logo / 问候语 /
 * 进度条 / 跳过倒计时 / 转场 / 音效 / 操作区.
 *
 * @module dsh-boot-custom/client/settings/panel
 */

import * as React from 'react'

import { deepMerge, formatBytes, normalizeConfig, sourceLabel } from '../../shared/config.js'
import { CSS_ANIMATION_LABELS, CSS_ANIMATION_STYLES } from '../../shared/css-effects.js'
import { LIMITS, type BootAnimationConfig } from '../../shared/types.js'
import { Button, ColorField, Notice, Row, Section, Select, Slider, Switch, TextArea, TextField } from './controls.js'
import { acceptFor, familyLabel, fileToDataUrl, inspectFile, revokeObjectUrl, type FileKind } from './files.js'
import type { ClientConfigStore, SaveStatus } from './store.js'
import { hideSettingsForPreview } from '../runtime/preview-presentation.js'

const h = React.createElement

/** Services the panel needs from the plugin activation. */
export interface PanelDeps {
  /** Shared browser config store. */
  store: ClientConfigStore
  /** Play the draft once in the overlay. */
  preview(config: BootAnimationConfig, onDispose?: () => void): void
  /** Apply live changes to a running preview. */
  updatePreview(config: BootAnimationConfig): void
}

/** A picked file waiting for the user's persistence choice. */
interface PendingFile {
  kind: FileKind
  file: File
  objectUrl?: string
  large: boolean
  tooLargeForBase64: boolean
  name: string
  size: number
}

/** Save-status state. */
interface StatusState {
  status: SaveStatus
  error: string
}

/** Debounce for configuration writes. */
const SAVE_DEBOUNCE_MS = 320

/** Editable multi-line list (one entry per line). */
function LinesEditor(props: {
  value: string[]
  onChange: (next: string[]) => void
  rows?: number
  placeholder?: string
}): React.ReactElement {
  const joined = props.value.join('\n')
  const [text, setText] = React.useState(joined)
  React.useEffect(() => {
    setText(joined)
  }, [joined])
  const commit = (): void => {
    props.onChange(
      text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    )
  }
  return h(TextArea, {
    value: text,
    onChange: setText,
    onBlur: commit,
    rows: props.rows ?? 4,
    placeholder: props.placeholder,
  })
}

/** Friendly label for a write mode. */
function modeLabel(mode: string): string {
  if (mode === 'settings') return '设置命名空间'
  if (mode === 'config-editor') return '配置编辑器（实时生效）'
  return '本地 JSON 配置'
}

/**
 * Build the panel component bound to one plugin activation.
 *
 * @param deps - store and preview bridge.
 * @returns a React component suitable for `ctx.slots.register`.
 */
export function createSettingsPanel(deps: PanelDeps): React.ComponentType<{ close?: () => void }> {
  return function BootAnimationSettings(props: { close?: () => void }): React.ReactElement {
    const [draft, setDraft] = React.useState<BootAnimationConfig>(() => deps.store.current())
    const [status, setStatus] = React.useState<StatusState>(() => deps.store.getStatus())
    const [notice, setNotice] = React.useState<{ tone: 'info' | 'warn' | 'error'; text: string } | null>(null)
    const [pending, setPending] = React.useState<PendingFile | null>(null)
    const [confirmReset, setConfirmReset] = React.useState(false)
    const [urlInput, setUrlInput] = React.useState('')
    const [audioUrlInput, setAudioUrlInput] = React.useState('')

    const draftRef = React.useRef(draft)
    const saveTimer = React.useRef(0)
    const unmounted = React.useRef(false)
    const objectUrls = React.useRef<Set<string>>(new Set())
    const videoInput = React.useRef<HTMLInputElement | null>(null)
    const audioInput = React.useRef<HTMLInputElement | null>(null)
    /** Restores the Settings modal for the current preview, when one is live. */
    const previewRestore = React.useRef<(() => void) | null>(null)

    // External replacements (settings namespace sync, defaults reset) win
    // over the local draft; the store publishes only normalized values.
    React.useEffect(() => {
      const offConfig = deps.store.subscribe((next) => {
        draftRef.current = next
        setDraft(next)
      })
      const offStatus = deps.store.subscribeStatus((nextStatus, error) => {
        setStatus({ status: nextStatus, error })
      })
      setStatus(deps.store.getStatus())
      return () => {
        offConfig()
        offStatus()
      }
    }, [])

    React.useEffect(() => {
      unmounted.current = false
      return () => {
        unmounted.current = true
        // Never leave the Settings modal hidden if the panel unmounts while a
        // preview is still on screen.
        previewRestore.current?.()
        previewRestore.current = null
        if (saveTimer.current !== 0) {
          window.clearTimeout(saveTimer.current)
          saveTimer.current = 0
          // Flush the last edit instead of losing it on panel close.
          void deps.store.save(draftRef.current)
        }
        for (const url of objectUrls.current) revokeObjectUrl(url)
        objectUrls.current.clear()
      }
    }, [])

    /*
     * The settings shell's `.panel` uses `overflow:hidden`, so a browser focus
     * scroll can still move its own scrollTop and push the header (including
     * the × button) out of view. `.options` is the intended scroll container;
     * keep the outer panel pinned at 0 so the close control stays reachable.
     */
    React.useEffect(() => {
      let panel: HTMLElement | null = null
      try {
        const found = document.querySelector('[data-shortcut-modal="settings"]')
        if (found instanceof HTMLElement) panel = found
      } catch {
        return undefined
      }
      if (panel === null) return undefined
      const target = panel
      const reset = (): void => {
        try {
          if (target.scrollTop !== 0) target.scrollTop = 0
          if (target.scrollLeft !== 0) target.scrollLeft = 0
        } catch {
          // Ignore a detached/frozen panel.
        }
      }
      reset()
      target.addEventListener('scroll', reset, { passive: true })
      return () => {
        target.removeEventListener('scroll', reset)
      }
    }, [])

    /** Apply a patch to the draft, schedule a save and refresh the preview. */
    const update = (patch: unknown): void => {
      const next = normalizeConfig(deepMerge(draftRef.current, patch))
      draftRef.current = next
      setDraft(next)
      try {
        deps.updatePreview(next)
      } catch {
        // A live preview is optional.
      }
      if (saveTimer.current !== 0) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = 0
        void deps.store.save(draftRef.current)
      }, SAVE_DEBOUNCE_MS)
    }

    /** Append a media source to the video list. */
    const addVideo = (input: string): boolean => {
      const clean = normalizeConfig({ videos: [input] }).videos[0]
      if (clean === undefined) {
        setNotice({ tone: 'error', text: '该地址不是可接受的视频源（支持 http/https/file/相对路径/data:video）。' })
        return false
      }
      const list = draftRef.current.videos
      if (list.includes(clean)) {
        setNotice({ tone: 'info', text: '该视频已在列表中。' })
        return false
      }
      if (list.length >= LIMITS.maxVideos) {
        setNotice({ tone: 'error', text: `最多管理 ${String(LIMITS.maxVideos)} 个视频源。` })
        return false
      }
      update({ videos: [...list, clean] })
      setNotice({ tone: 'info', text: '已添加到视频列表。' })
      return true
    }

    /** Remove one video source. */
    const removeVideo = (index: number): void => {
      const list = [...draftRef.current.videos]
      list.splice(index, 1)
      update({ videos: list })
    }

    /** Move one video source up or down. */
    const moveVideo = (index: number, delta: number): void => {
      const list = [...draftRef.current.videos]
      const target = index + delta
      if (target < 0 || target >= list.length) return
      const [entry] = list.splice(index, 1)
      if (entry === undefined) return
      list.splice(target, 0, entry)
      update({ videos: list })
    }

    /** Replace the custom audio source. */
    const setAudioFile = (source: string): void => {
      update({ audio: { file: source } })
    }

    /** Persist a picked file's path, or ask how to carry it. */
    const queueFile = (file: File, kind: FileKind): void => {
      let info: ReturnType<typeof inspectFile>
      try {
        info = inspectFile(file, kind)
      } catch (error) {
        setNotice({
          tone: 'error',
          text: `无法读取所选文件：${error instanceof Error ? error.message : String(error)}`,
        })
        return
      }
      if (!info.allowed) {
        setNotice({
          tone: 'error',
          text: `不支持的${familyLabel(kind)}格式。${
            kind === 'video' ? '请选择 MP4 / WebM / MOV。' : '请选择 MP3 / WAV / OGG。'
          }`,
        })
        return
      }
      if (info.source !== undefined) {
        if (kind === 'video') addVideo(info.source)
        else {
          setAudioFile(info.source)
          setNotice({ tone: 'info', text: '已使用本地文件绝对路径（file://）。' })
        }
        return
      }
      if (info.objectUrl !== undefined) objectUrls.current.add(info.objectUrl)
      setPending({
        kind,
        file,
        ...(info.objectUrl === undefined ? {} : { objectUrl: info.objectUrl }),
        large: info.large,
        tooLargeForBase64: info.tooLargeForBase64,
        name: info.name,
        size: info.size,
      })
    }

    /** Convert the pending file to base64 and persist it. */
    const confirmBase64 = (): void => {
      const current = pending
      if (current === null) return
      setPending(null)
      setNotice({ tone: 'info', text: '正在读取文件并转换为 base64…' })
      void fileToDataUrl(current.file, current.kind)
        .then((data) => {
          if (current.objectUrl !== undefined) {
            revokeObjectUrl(current.objectUrl)
            objectUrls.current.delete(current.objectUrl)
          }
          if (unmounted.current) return
          if (current.kind === 'video') addVideo(data)
          else setAudioFile(data)
          setNotice({
            tone: 'info',
            text:
              '已转换为 base64 并写入配置。' +
              (current.large ? '该文件超过 50MB，配置会明显变大，建议改用本地路径。' : ''),
          })
        })
        .catch((error: unknown) => {
          if (unmounted.current) return
          setNotice({
            tone: 'error',
            text: `转换失败：${error instanceof Error ? error.message : String(error)}`,
          })
        })
    }

    /**
     * Play a preview as a full-window presentation.
     *
     * The Settings modal is hidden before the animation starts and restored
     * when the run ends — by app-ready, progress completion, video end, a
     * click/Esc skip, or the controller timeout. A bounded safety timer also
     * restores it if the overlay never mounts at all.
     */
    const startPreview = (config: BootAnimationConfig, onDispose?: () => void): void => {
      previewRestore.current?.()
      previewRestore.current = null
      const restoreSettings = hideSettingsForPreview()
      let finished = false
      let safety = 0
      const finish = (): void => {
        if (finished) return
        finished = true
        if (safety !== 0) {
          window.clearTimeout(safety)
          safety = 0
        }
        try {
          restoreSettings()
        } catch {
          // The modal node may have been removed by the shell.
        }
        try {
          onDispose?.()
        } catch {
          // Object URL release is best-effort.
        }
        if (previewRestore.current === finish) previewRestore.current = null
      }
      previewRestore.current = finish
      safety = window.setTimeout(finish, 15_000)
      try {
        deps.preview(config, finish)
      } catch (error) {
        setNotice({
          tone: 'error',
          text: `预览启动失败：${error instanceof Error ? error.message : String(error)}`,
        })
        finish()
      }
    }

    /** Preview the pending file through a temporary Object URL. */
    const previewPending = (): void => {
      const current = pending
      if (current === null || current.objectUrl === undefined || current.kind !== 'video') return
      const url = current.objectUrl
      objectUrls.current.delete(url)
      setPending(null)
      const next = normalizeConfig({
        ...draftRef.current,
        mode: 'video',
        videos: [url],
        audio: { ...draftRef.current.audio, enabled: false },
      })
      startPreview({ ...next, enabled: true }, () => revokeObjectUrl(url))
      setNotice({ tone: 'info', text: '正在预览选中的本地视频（不会写入配置）。' })
    }

    /** Drop the pending file and release its Object URL. */
    const cancelPending = (): void => {
      const current = pending
      setPending(null)
      if (current?.objectUrl !== undefined) {
        revokeObjectUrl(current.objectUrl)
        objectUrls.current.delete(current.objectUrl)
      }
    }

    /** Add the typed network URL as a video source. */
    const addUrlVideo = (): void => {
      if (urlInput.trim().length === 0) {
        setNotice({ tone: 'error', text: '请输入视频地址。' })
        return
      }
      if (addVideo(urlInput)) setUrlInput('')
    }

    /** Add the typed network URL (or file path) as the custom audio. */
    const applyAudioUrl = (): void => {
      const clean = normalizeConfig({ audio: { file: audioUrlInput } }).audio.file
      if (clean.length === 0) {
        setNotice({ tone: 'error', text: '请输入有效的音频地址（http/https/file/相对路径/data:audio）。' })
        return
      }
      setAudioFile(clean)
      setAudioUrlInput('')
      setNotice({ tone: 'info', text: '已设置自定义音效。' })
    }

    /** Play the draft in the overlay. */
    const previewDraft = (): void => {
      startPreview({ ...draftRef.current, enabled: true })
    }

    /** Restore defaults through the active store. */
    const resetDefaults = (): void => {
      setConfirmReset(false)
      void deps.store.reset()
    }

    const d = draft
    const fileDialog = (kind: FileKind): React.ReactNode => {
      if (pending === null || pending.kind !== kind) return null
      return h(
        Notice,
        { tone: 'warn' },
        h('div', null, `${familyLabel(pending.kind)}：${pending.name} · ${formatBytes(pending.size)}`),
        pending.large
          ? h('div', null, '该文件超过 50MB：推荐保存本地绝对路径，不建议嵌入 base64。')
          : null,
        h(
          'div',
          { className: 'dba-set-inline', style: { marginTop: 8 } },
          h(
            Button,
            {
              variant: 'primary',
              disabled: pending.tooLargeForBase64,
              title: pending.tooLargeForBase64 ? '文件超过 base64 上限，请改用本地路径' : undefined,
              onClick: confirmBase64,
            },
            '跨设备携带（base64）',
          ),
          kind === 'video' && pending.objectUrl !== undefined
            ? h(Button, { onClick: previewPending }, '仅本次预览')
            : null,
          h(Button, { onClick: cancelPending }, '取消'),
        ),
        h(
          'div',
          { style: { marginTop: 6, opacity: 0.75 } },
          '沙箱未暴露绝对路径。也可以取消后在上方输入框粘贴 file:/// 绝对路径。',
        ),
      )
    }

    const statusText =
      status.status === 'saving'
        ? '保存中…'
        : status.status === 'saved'
          ? '已保存'
          : status.status === 'error'
            ? `保存失败：${status.error}`
            : '修改后自动保存'

    return h(
      'div',
      { className: 'dba-set' },
      h(
        'div',
        { className: 'dba-set-header' },
        h('div', { className: 'dba-set-title-main' }, '开机动画'),
        h(
          'div',
          {
            className: 'dba-set-status',
            'data-tone': status.status === 'error' ? 'error' : 'normal',
            role: 'status',
            'aria-live': 'polite',
          },
          `${statusText} · ${modeLabel(deps.store.writeMode)}`,
        ),
      ),

      // 1. 基础设置
      h(
        Section,
        { title: '基础设置', hint: '总开关 / 模式 / 时长 / 跳过', defaultOpen: true },
        h(Row, { label: '启用开机动画', hint: '关闭后不注入首帧遮罩' }, h(Switch, {
          checked: d.enabled,
          onChange: (value: boolean) => update({ enabled: value }),
        })),
        h(Row, { label: '动画模式' }, h(Select, {
          value: d.mode,
          options: [
            { value: 'css', label: 'CSS 动画（无视频）' },
            { value: 'video', label: '视频轮播' },
          ],
          onChange: (value: string) => update({ mode: value }),
        })),
        h(Row, { label: '允许跳过动画', hint: '关闭后倒计时隐藏，点击/任意键均无效' }, h(Switch, {
          checked: d.allowSkip,
          onChange: (value: boolean) => update({ allowSkip: value }),
        })),
        h(Row, {
          label: '启动动画时长',
          hint: '至少播放这么久再进入应用；应用未就绪时继续等待；0 表示不额外等待',
        }, h(Slider, {
          value: d.bootDuration,
          min: 0,
          max: LIMITS.maxBootDuration,
          step: 0.5,
          onChange: (value: number) => update({ bootDuration: value }),
          format: (value: number) => (value === 0 ? '不额外等待' : `${value.toFixed(1)}s`),
        })),
      ),

      // 2. 视频轮播管理
      h(
        Section,
        { title: '视频轮播管理', hint: `${String(d.videos.length)} / ${String(LIMITS.maxVideos)}` },
        h(
          'div',
          { className: 'dba-set-videos' },
          d.videos.length === 0
            ? h('div', { className: 'dba-set-count' }, '尚未添加视频。没有可用视频时将播放内置 CSS 动画。')
            : d.videos.map((source, index) =>
                h(
                  'div',
                  { className: 'dba-set-video-row', key: `${String(index)}-${source.slice(0, 32)}` },
                  h('span', { className: 'dba-set-video-index' }, String(index + 1)),
                  h('span', { className: 'dba-set-video-name', title: sourceLabel(source) }, sourceLabel(source)),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dba-set-icon-button',
                      title: '上移',
                      disabled: index === 0,
                      onClick: () => moveVideo(index, -1),
                    },
                    '↑',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dba-set-icon-button',
                      title: '下移',
                      disabled: index === d.videos.length - 1,
                      onClick: () => moveVideo(index, 1),
                    },
                    '↓',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dba-set-icon-button',
                      title: '删除',
                      onClick: () => removeVideo(index),
                    },
                    '✕',
                  ),
                ),
              ),
        ),
        h(
          'div',
          { className: 'dba-set-inline' },
          h(TextField, {
            value: urlInput,
            onChange: setUrlInput,
            placeholder: '网络视频地址或 file:/// 绝对路径',
            mono: true,
          }),
          h(Button, { onClick: addUrlVideo }, '添加视频'),
          h(Button, { onClick: () => videoInput.current?.click() }, '选择本地视频'),
          d.videos.length > 0
            ? h(Button, { variant: 'danger', onClick: () => update({ videos: [] }) }, '清空列表')
            : null,
        ),
        h('input', {
          ref: videoInput,
          className: 'dba-set-hidden-input',
          type: 'file',
          accept: acceptFor('video'),
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file !== undefined) queueFile(file, 'video')
          },
        }),
        fileDialog('video'),
        h(Row, { label: '轮播模式' }, h(Select, {
          value: d.videoMode,
          options: [
            { value: 'random', label: '随机单次' },
            { value: 'sequence', label: '顺序循环' },
          ],
          onChange: (value: string) => update({ videoMode: value }),
        })),
        h(
          Notice,
          { tone: 'info' },
          '本地视频默认保存 file:/// 绝对路径；仅当前选中的视频创建 video 元素并 preload="auto"，其余仅保留字符串。',
        ),
      ),

      // 3. 播放控制
      h(
        Section,
        { title: '播放控制' },
        h(Row, { label: '播放速度' }, h(Slider, {
          value: d.playing.rate,
          min: 0.25,
          max: 2,
          step: 0.25,
          onChange: (value: number) => update({ playing: { rate: value } }),
          format: (value: number) => `${value.toFixed(2)}x`,
        })),
        h(Row, { label: '背景颜色', hint: '视频未覆盖时的底色' }, h(ColorField, {
          value: d.playing.background,
          onChange: (value: string) => update({ playing: { background: value } }),
        })),
        h(Row, { label: 'CSS 动画风格', hint: 'CSS 模式或视频失败兜底时显示' }, h(Select, {
          value: d.cssAnimation,
          options: CSS_ANIMATION_STYLES.map((value) => ({
            value,
            label: CSS_ANIMATION_LABELS[value],
          })),
          onChange: (value: string) => update({ cssAnimation: value }),
        })),
      ),

      // 4. Logo 文字设置
      h(
        Section,
        { title: 'Logo 文字设置' },
        h(Row, { label: '显示 Logo' }, h(Switch, {
          checked: d.logo.enabled,
          onChange: (value: boolean) => update({ logo: { enabled: value } }),
        })),
        h(Row, { label: '文字内容', hint: '支持多行' }, h(TextArea, {
          value: d.logo.text,
          onChange: (value: string) => update({ logo: { text: value } }),
          rows: 2,
        })),
        h(Row, { label: '字体大小' }, h(Slider, {
          value: d.logo.fontSize,
          min: 12,
          max: 160,
          step: 1,
          onChange: (value: number) => update({ logo: { fontSize: value } }),
          format: (value: number) => `${String(value)}px`,
        })),
        h(Row, { label: '文字颜色' }, h(ColorField, {
          value: d.logo.color,
          onChange: (value: string) => update({ logo: { color: value } }),
        })),
        h(Row, { label: '发光效果' }, h(Switch, {
          checked: d.logo.glow,
          onChange: (value: boolean) => update({ logo: { glow: value } }),
        })),
        h(Row, { label: '发光颜色' }, h(ColorField, {
          value: d.logo.glowColor,
          onChange: (value: string) => update({ logo: { glowColor: value } }),
        })),
        h(Row, { label: '垂直位置', hint: '相对标题栏安全区域' }, h(Slider, {
          value: d.logo.vertical,
          min: 0,
          max: 100,
          step: 1,
          onChange: (value: number) => update({ logo: { vertical: value } }),
          format: (value: number) => `${String(value)}%`,
        })),
        h(Row, { label: '字体' }, h(TextField, {
          value: d.logo.fontFamily,
          onChange: (value: string) => update({ logo: { fontFamily: value } }),
          placeholder: 'system-ui',
        })),
        h(Row, { label: '视频模式叠加', hint: '以半透明水印显示在视频上' }, h(Switch, {
          checked: d.logo.overlayInVideo,
          onChange: (value: boolean) => update({ logo: { overlayInVideo: value } }),
        })),
      ),

      // 5. 问候语设置
      h(
        Section,
        { title: '问候语设置' },
        h(Row, { label: '显示问候语' }, h(Switch, {
          checked: d.greeting.enabled,
          onChange: (value: boolean) => update({ greeting: { enabled: value } }),
        })),
        h(Row, { label: '问候模式' }, h(Select, {
          value: d.greeting.mode,
          options: [
            { value: 'fixed', label: '固定文本' },
            { value: 'time', label: '分时段自动问候' },
            { value: 'random', label: '随机语录' },
          ],
          onChange: (value: string) => update({ greeting: { mode: value } }),
        })),
        d.greeting.mode === 'fixed'
          ? h(Row, { label: '固定文本', hint: '支持多行与 Emoji' }, h(TextArea, {
              value: d.greeting.fixedText,
              onChange: (value: string) => update({ greeting: { fixedText: value } }),
              rows: 2,
            }))
          : null,
        d.greeting.mode === 'time'
          ? h(
              'div',
              null,
              (
                [
                  ['dawn', '凌晨 0–4 点'],
                  ['morning', '早晨 5–8 点'],
                  ['noon', '中午 9–11 点'],
                  ['afternoon', '下午 12–17 点'],
                  ['evening', '晚上 18–22 点'],
                  ['night', '深夜 23 点'],
                ] as const
              ).map(([slot, label]) =>
                h(Row, { key: slot, label }, h(TextField, {
                  value: d.greeting.timeTexts[slot],
                  onChange: (value: string) => update({ greeting: { timeTexts: { [slot]: value } } }),
                })),
              ),
            )
          : null,
        d.greeting.mode === 'random'
          ? h(
              Row,
              { label: '随机语录', hint: '每行一条，Emoji 可用' },
              h(LinesEditor, {
                value: d.greeting.randomTexts,
                onChange: (lines: string[]) => update({ greeting: { randomTexts: lines } }),
                rows: 5,
              }),
            )
          : null,
        h(Row, { label: '字体大小' }, h(Slider, {
          value: d.greeting.fontSize,
          min: 8,
          max: 96,
          step: 1,
          onChange: (value: number) => update({ greeting: { fontSize: value } }),
          format: (value: number) => `${String(value)}px`,
        })),
        h(Row, { label: '文字颜色' }, h(ColorField, {
          value: d.greeting.color,
          onChange: (value: string) => update({ greeting: { color: value } }),
        })),
        h(Row, { label: '发光效果' }, h(Switch, {
          checked: d.greeting.glow,
          onChange: (value: boolean) => update({ greeting: { glow: value } }),
        })),
        h(Row, { label: '发光颜色' }, h(ColorField, {
          value: d.greeting.glowColor,
          onChange: (value: string) => update({ greeting: { glowColor: value } }),
        })),
        h(Row, { label: '字体' }, h(TextField, {
          value: d.greeting.fontFamily,
          onChange: (value: string) => update({ greeting: { fontFamily: value } }),
          placeholder: 'system-ui',
        })),
        h(Row, { label: '垂直位置', hint: '层级低于 Logo，可错开排布' }, h(Slider, {
          value: d.greeting.vertical,
          min: 0,
          max: 100,
          step: 1,
          onChange: (value: number) => update({ greeting: { vertical: value } }),
          format: (value: number) => `${String(value)}%`,
        })),
        h(Row, { label: '入场动画' }, h(Select, {
          value: d.greeting.animation,
          options: [
            { value: 'fade', label: '淡入上浮' },
            { value: 'typewriter', label: '打字机' },
          ],
          onChange: (value: string) => update({ greeting: { animation: value } }),
        })),
        h(Row, { label: '视频模式叠加' }, h(Switch, {
          checked: d.greeting.overlayInVideo,
          onChange: (value: boolean) => update({ greeting: { overlayInVideo: value } }),
        })),
      ),

      // 6. 进度条设置
      h(
        Section,
        { title: '进度条设置' },
        h(Row, { label: '显示进度条' }, h(Switch, {
          checked: d.progress.enabled,
          onChange: (value: boolean) => update({ progress: { enabled: value } }),
        })),
        h(Row, { label: '样式' }, h(Select, {
          value: d.progress.style,
          options: [
            { value: 'line', label: '纤细线条' },
            { value: 'capsule', label: '圆角胶囊' },
            { value: 'glow', label: '渐变光效' },
          ],
          onChange: (value: string) => update({ progress: { style: value } }),
        })),
        h(Row, { label: '前景色' }, h(ColorField, {
          value: d.progress.color,
          onChange: (value: string) => update({ progress: { color: value } }),
        })),
        h(Row, { label: '轨道色' }, h(ColorField, {
          value: d.progress.trackColor,
          onChange: (value: string) => update({ progress: { trackColor: value } }),
        })),
        h(Row, { label: '显示位置' }, h(Select, {
          value: d.progress.position,
          options: [
            { value: 'top', label: '顶部' },
            { value: 'bottom', label: '底部' },
          ],
          onChange: (value: string) => update({ progress: { position: value } }),
        })),
        h(Row, { label: '百分比数字' }, h(Switch, {
          checked: d.progress.showPercent,
          onChange: (value: boolean) => update({ progress: { showPercent: value } }),
        })),
        h(Row, { label: '真实加载进度', hint: '关闭后使用时间模拟进度' }, h(Switch, {
          checked: d.progress.realProgress,
          onChange: (value: boolean) => update({ progress: { realProgress: value } }),
        })),
      ),

      // 7. 跳过倒计时设置
      h(
        Section,
        { title: '跳过倒计时设置' },
        h(Row, { label: '启用倒计时' }, h(Switch, {
          checked: d.countdown.enabled,
          disabled: !d.allowSkip,
          onChange: (value: boolean) => update({ countdown: { enabled: value } }),
        })),
        h(Row, { label: '倒计时时长', hint: '0 秒表示立即可跳过' }, h(Slider, {
          value: d.countdown.seconds,
          min: 0,
          max: 10,
          step: 1,
          onChange: (value: number) => update({ countdown: { seconds: value } }),
          format: (value: number) => `${String(value)} 秒`,
        })),
        h(Row, { label: '显示位置' }, h(Select, {
          value: d.countdown.position,
          options: [
            { value: 'center', label: '屏幕中央' },
            { value: 'bottom-right', label: '右下角' },
            { value: 'above-progress', label: '进度条上方' },
          ],
          onChange: (value: string) => update({ countdown: { position: value } }),
        })),
        h(Row, { label: '数字大小' }, h(Slider, {
          value: d.countdown.fontSize,
          min: 8,
          max: 56,
          step: 1,
          onChange: (value: number) => update({ countdown: { fontSize: value } }),
          format: (value: number) => `${String(value)}px`,
        })),
        h(Row, { label: '数字颜色' }, h(ColorField, {
          value: d.countdown.color,
          onChange: (value: string) => update({ countdown: { color: value } }),
        })),
        h(Row, { label: '发光效果' }, h(Switch, {
          checked: d.countdown.glow,
          onChange: (value: boolean) => update({ countdown: { glow: value } }),
        })),
        h(Row, { label: '发光颜色' }, h(ColorField, {
          value: d.countdown.glowColor,
          onChange: (value: string) => update({ countdown: { glowColor: value } }),
        })),
        h(Row, { label: '提示文字', hint: '显示在数字之后，如「秒后可跳过」' }, h(TextField, {
          value: d.countdown.hintText,
          onChange: (value: string) => update({ countdown: { hintText: value } }),
        })),
        h(Row, { label: '显示提示文字' }, h(Switch, {
          checked: d.countdown.showHint,
          onChange: (value: boolean) => update({ countdown: { showHint: value } }),
        })),
      ),

      // 8. 转场效果
      h(
        Section,
        { title: '转场效果' },
        h(Row, { label: '退场转场' }, h(Select, {
          value: d.transition.style,
          options: [
            { value: 'fade', label: '平滑淡入' },
            { value: 'slide-up', label: '上滑退场' },
            { value: 'zoom', label: '缩放消散' },
            { value: 'black', label: '黑场过渡' },
            { value: 'blur', label: '模糊渐隐' },
          ],
          onChange: (value: string) => update({ transition: { style: value } }),
        })),
        h(Row, { label: '转场时长' }, h(Slider, {
          value: d.transition.duration,
          min: 0.1,
          max: 2,
          step: 0.1,
          onChange: (value: number) => update({ transition: { duration: value } }),
          format: (value: number) => `${value.toFixed(1)}s`,
        })),
      ),

      // 9. 音效设置
      h(
        Section,
        { title: '音效设置', hint: '默认关闭，避免干扰' },
        h(Row, { label: '启用音效' }, h(Switch, {
          checked: d.audio.enabled,
          onChange: (value: boolean) => update({ audio: { enabled: value } }),
        })),
        h(Row, { label: '音源' }, h(Select, {
          value: d.audio.source,
          options: [
            { value: 'video', label: '视频原音' },
            { value: 'custom', label: '自定义音效' },
          ],
          onChange: (value: string) => update({ audio: { source: value } }),
        })),
        d.audio.source === 'custom'
          ? h(
              Row,
              { label: '自定义音效', hint: 'MP3 / WAV / OGG' },
              h(
                'div',
                { className: 'dba-set-inline' },
                h(TextField, {
                  value: d.audio.file,
                  onChange: (value: string) => update({ audio: { file: value } }),
                  placeholder: '网络音频地址 / file:/// 绝对路径',
                  mono: true,
                }),
                h(Button, { onClick: () => audioInput.current?.click() }, '选择本地音频'),
                d.audio.file.length > 0
                  ? h(Button, { variant: 'danger', onClick: () => setAudioFile('') }, '清除')
                  : null,
              ),
            )
          : null,
        d.audio.source === 'custom'
          ? h(
              Row,
              { label: '音频地址' },
              h(
                'div',
                { className: 'dba-set-inline' },
                h(TextField, {
                  value: audioUrlInput,
                  onChange: setAudioUrlInput,
                  placeholder: 'https://…/boot.mp3',
                  mono: true,
                }),
                h(Button, { onClick: applyAudioUrl }, '应用地址'),
              ),
            )
          : null,
        h('input', {
          ref: audioInput,
          className: 'dba-set-hidden-input',
          type: 'file',
          accept: acceptFor('audio'),
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file !== undefined) queueFile(file, 'audio')
          },
        }),
        fileDialog('audio'),
        h(Row, { label: '音量' }, h(Slider, {
          value: d.audio.volume,
          min: 0,
          max: 100,
          step: 1,
          onChange: (value: number) => update({ audio: { volume: value } }),
          format: (value: number) => `${String(value)}%`,
        })),
        h(Row, { label: '淡入淡出' }, h(Switch, {
          checked: d.audio.fade,
          onChange: (value: boolean) => update({ audio: { fade: value } }),
        })),
        h(
          Notice,
          { tone: 'info' },
          '自定义音效在 CSS 模式（即使没有视频）下也会播放；视频音轨与画面同步播放、暂停与结束。加载失败会自动静音，不影响动画。浏览器自动播放策略可能拒绝有声播放，此时将静音降级。',
        ),
      ),

      // 10. 操作区
      h(
        Section,
        { title: '操作区', defaultOpen: true },
        notice === null ? null : h(Notice, { tone: notice.tone }, notice.text),
        h(
          'div',
          { className: 'dba-set-footer' },
          h(Button, { variant: 'primary', onClick: previewDraft }, '预览动画'),
          confirmReset
            ? h(
                React.Fragment,
                null,
                h(Button, { variant: 'danger', onClick: resetDefaults }, '确认恢复默认'),
                h(Button, { onClick: () => setConfirmReset(false) }, '取消'),
              )
            : h(Button, { onClick: () => setConfirmReset(true) }, '恢复默认'),
          typeof props.close === 'function'
            ? h(Button, { onClick: props.close }, '关闭设置')
            : null,
          h('span', { className: 'dba-set-spacer' }),
          h('span', { className: 'dba-set-count' }, '预览使用当前草稿，不写入配置。'),
        ),
      ),
    )
  }
}
