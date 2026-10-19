/**
 * Settings-panel control primitives.
 *
 * Plain React components built with `React.createElement` (the classic-script
 * bundle resolves `react` from the shell's platform module table). No design
 * system import: the panel uses `currentColor`-derived surfaces so it follows
 * the surrounding DSH theme in both light and dark mode.
 *
 * @module dsh-boot-custom/client/settings/controls
 */

import * as React from 'react'

const h = React.createElement

/** One collapsible settings group. */
export interface SectionProps {
  title: string
  hint?: string
  defaultOpen?: boolean
  children?: React.ReactNode
}

/** Collapsible group with a sticky-looking summary row. */
export function Section(props: SectionProps): React.ReactElement {
  return h(
    'details',
    { className: 'dba-set-section', open: props.defaultOpen },
    h(
      'summary',
      { className: 'dba-set-summary' },
      h('span', { className: 'dba-set-title' }, props.title),
      props.hint === undefined ? null : h('span', { className: 'dba-set-hint' }, props.hint),
    ),
    h('div', { className: 'dba-set-body' }, props.children),
  )
}

/** Accessible-name context shared by a {@link Row} and its control. */
interface RowA11y {
  controlId: string
  hintId?: string
  label: string
}

const RowContext = React.createContext<RowA11y | null>(null)

/** Read the surrounding row's accessible-name wiring, when present. */
function useRowA11y(): RowA11y | null {
  return React.useContext(RowContext)
}

/** One labelled row. */
export interface RowProps {
  label: string
  hint?: string
  children?: React.ReactNode
}

/** Label + control row. */
export function Row(props: RowProps): React.ReactElement {
  const controlId = React.useId()
  const hintId = props.hint === undefined ? undefined : `${controlId}-hint`
  return h(
    'div',
    { className: 'dba-set-row' },
    h(
      'div',
      { className: 'dba-set-row-label' },
      h('label', { htmlFor: controlId }, props.label),
      props.hint === undefined ? null : h('small', { id: hintId }, props.hint),
    ),
    h(
      RowContext.Provider,
      { value: { controlId, hintId, label: props.label } },
      h('div', { className: 'dba-set-row-control' }, props.children),
    ),
  )
}

/** Toggle switch. */
export interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  label?: string
  disabled?: boolean
}

/** Accessible checkbox rendered as a switch. */
export function Switch(props: SwitchProps): React.ReactElement {
  const a11y = useRowA11y()
  return h(
    'label',
    { className: 'dba-set-switch' },
    h('input', {
      type: 'checkbox',
      checked: props.checked,
      disabled: props.disabled === true,
      id: a11y?.controlId,
      'aria-describedby': a11y?.hintId,
      'aria-label': a11y === null ? props.label : undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => props.onChange(event.target.checked),
    }),
    h('span', { className: 'dba-set-switch-track', 'aria-hidden': 'true' }, h('span', { className: 'dba-set-switch-thumb' })),
    props.label === undefined ? null : h('span', { className: 'dba-set-switch-label' }, props.label),
  )
}

/** Slider with a live formatted value. */
export interface SliderProps {
  value: number
  min: number
  max: number
  step: number
  onChange: (next: number) => void
  format?: (value: number) => string
}

/** Range input plus value readout. */
export function Slider(props: SliderProps): React.ReactElement {
  const a11y = useRowA11y()
  const format = props.format ?? ((value: number) => String(value))
  return h(
    'div',
    { className: 'dba-set-slider' },
    h('input', {
      type: 'range',
      min: props.min,
      max: props.max,
      step: props.step,
      value: props.value,
      id: a11y?.controlId,
      'aria-describedby': a11y?.hintId,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => props.onChange(Number(event.target.value)),
    }),
    h('output', { className: 'dba-set-slider-value', htmlFor: a11y?.controlId }, format(props.value)),
  )
}

/** Text input. */
export interface TextFieldProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  mono?: boolean
  ariaLabel?: string
}

/** Single-line text input. */
export function TextField(props: TextFieldProps): React.ReactElement {
  const a11y = useRowA11y()
  return h('input', {
    className: props.mono === true ? 'dba-set-input dba-set-mono' : 'dba-set-input',
    type: 'text',
    value: props.value,
    placeholder: props.placeholder,
    spellCheck: false,
    id: a11y?.controlId,
    'aria-describedby': a11y?.hintId,
    'aria-label': a11y === null ? props.ariaLabel : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => props.onChange(event.target.value),
  })
}

/** Multi-line text input. */
export interface TextAreaProps {
  value: string
  onChange: (next: string) => void
  onBlur?: () => void
  rows?: number
  placeholder?: string
  mono?: boolean
}

/** Textarea. */
export function TextArea(props: TextAreaProps): React.ReactElement {
  const a11y = useRowA11y()
  return h('textarea', {
    className: props.mono === true ? 'dba-set-input dba-set-mono' : 'dba-set-input',
    rows: props.rows ?? 3,
    value: props.value,
    placeholder: props.placeholder,
    spellCheck: false,
    id: a11y?.controlId,
    'aria-describedby': a11y?.hintId,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => props.onChange(event.target.value),
    onBlur: props.onBlur,
  })
}

/** One select option. */
export interface SelectOption {
  value: string
  label: string
}

/**
 * Select input.
 *
 * Deliberately non-generic: `React.createElement` widens a generic component's
 * props, which would erase the union type anyway. The runtime normalizer is
 * the authority that keeps the stored value inside the allowed union.
 */
export interface SelectProps {
  value: string
  options: ReadonlyArray<SelectOption>
  onChange: (next: string) => void
}

/** Select control. */
export function Select(props: SelectProps): React.ReactElement {
  const a11y = useRowA11y()
  return h(
    'select',
    {
      className: 'dba-set-input dba-set-select',
      value: props.value,
      id: a11y?.controlId,
      'aria-describedby': a11y?.hintId,
      onChange: (event: React.ChangeEvent<HTMLSelectElement>) => props.onChange(event.target.value),
    },
    props.options.map((option) => h('option', { key: option.value, value: option.value }, option.label)),
  )
}

/** A color swatch plus a free-form CSS color field. */
export interface ColorFieldProps {
  value: string
  onChange: (next: string) => void
}

/** Normalize any CSS color to a `#rrggbb` value for the native picker. */
function pickerHex(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const [, r, g, b] = value
    return `#${r}${r}${g}${g}${b}${b}`
  }
  const rgb = /^rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/i.exec(value)
  if (rgb !== null) {
    const toHex = (part: string | undefined): string => {
      const value = Math.max(0, Math.min(255, Math.round(Number(part ?? '0'))))
      return value.toString(16).padStart(2, '0')
    }
    return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`
  }
  return '#000000'
}

/** Swatch + text field, so rgba() and named colors remain editable. */
export function ColorField(props: ColorFieldProps): React.ReactElement {
  const a11y = useRowA11y()
  const [text, setText] = React.useState(props.value)
  React.useEffect(() => setText(props.value), [props.value])
  const commit = (): void => {
    if (text.trim().length === 0) {
      setText(props.value)
      return
    }
    if (text !== props.value) props.onChange(text)
  }
  return h(
    'div',
    { className: 'dba-set-color' },
    h('input', {
      className: 'dba-set-swatch',
      type: 'color',
      value: pickerHex(text),
      'aria-label': a11y === null ? '颜色选择器' : `${a11y.label}：颜色选择器`,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        setText(event.target.value)
        props.onChange(event.target.value)
      },
    }),
    h('input', {
      className: 'dba-set-input dba-set-mono dba-set-color-text',
      type: 'text',
      value: text,
      spellCheck: false,
      id: a11y?.controlId,
      'aria-describedby': a11y?.hintId,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => setText(event.target.value),
      onBlur: commit,
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') commit()
      },
    }),
  )
}

/** Button variants. */
export type ButtonVariant = 'primary' | 'secondary' | 'danger'

/** Panel button. */
export interface ButtonProps {
  onClick: () => void
  children?: React.ReactNode
  variant?: ButtonVariant
  disabled?: boolean
  title?: string
  ariaLabel?: string
}

/** Button control. */
export function Button(props: ButtonProps): React.ReactElement {
  return h(
    'button',
    {
      type: 'button',
      className: `dba-set-button dba-set-button--${props.variant ?? 'secondary'}`,
      onClick: props.onClick,
      disabled: props.disabled === true,
      title: props.title,
      'aria-label': props.ariaLabel ?? props.title,
    },
    props.children,
  )
}

/** Inline notice. */
export interface NoticeProps {
  tone?: 'info' | 'warn' | 'error'
  children?: React.ReactNode
}

/** Notice block. */
export function Notice(props: NoticeProps): React.ReactElement {
  const tone = props.tone ?? 'info'
  return h(
    'div',
    {
      className: `dba-set-notice dba-set-notice--${tone}`,
      role: tone === 'error' ? 'alert' : 'status',
      'aria-live': tone === 'error' ? 'assertive' : 'polite',
      'aria-atomic': 'true',
    },
    props.children,
  )
}
