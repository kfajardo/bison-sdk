import type { Option } from '../validation/constants.js'

export interface FieldSpec {
  name: string
  label: string
  type?: 'text' | 'email' | 'tel' | 'date' | 'number' | 'select' | 'textarea' | 'file'
  options?: readonly Option[]
  placeholder?: string
  autocomplete?: string
  multiple?: boolean
}

/** A `<div data-bison-slot="NAME">` placeholder for consumer structural overrides. */
export function slotPlaceholder(name: string): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-bison-slot', name)
  el.className = `bison-slot bison-slot--${name.replace(/[^a-z0-9-]/gi, '-')}`
  return el
}

let uid = 0

/** Renders one labeled field into light DOM with stable bison-* class hooks. */
export function renderField(spec: FieldSpec): HTMLElement {
  const doc = document
  const id = `bison-field-${++uid}`

  const wrapper = doc.createElement('div')
  wrapper.className = `bison-field bison-field--${spec.name}`

  const label = doc.createElement('label')
  label.className = 'bison-field__label'
  label.htmlFor = id
  label.textContent = spec.label
  wrapper.appendChild(label)

  let control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  if (spec.type === 'select') {
    control = doc.createElement('select')
    const empty = doc.createElement('option')
    empty.value = ''
    empty.textContent = spec.placeholder ?? 'Select...'
    control.appendChild(empty)
    for (const option of spec.options ?? []) {
      const el = doc.createElement('option')
      el.value = option.value
      el.textContent = option.label
      control.appendChild(el)
    }
  } else if (spec.type === 'textarea') {
    control = doc.createElement('textarea')
  } else {
    control = doc.createElement('input')
    control.type = spec.type === 'number' ? 'number' : spec.type ?? 'text'
    if (spec.multiple) (control as HTMLInputElement).multiple = true
  }
  control.id = id
  control.name = spec.name
  control.className = 'bison-field__input'
  if (spec.placeholder && 'placeholder' in control) control.placeholder = spec.placeholder
  if (spec.autocomplete) control.autocomplete = spec.autocomplete as AutoFill
  wrapper.appendChild(control)

  const error = doc.createElement('p')
  error.className = 'bison-field__error'
  error.setAttribute('role', 'alert')
  error.hidden = true
  wrapper.appendChild(error)

  return wrapper
}

export function renderFields(container: HTMLElement, specs: FieldSpec[]): void {
  for (const spec of specs) container.appendChild(renderField(spec))
}

/** Reads all non-file field values within root, keyed by field name. */
export function readFields(root: HTMLElement): Record<string, string> {
  const data: Record<string, string> = {}
  root.querySelectorAll<HTMLInputElement>('.bison-field__input').forEach((control) => {
    if (control.type === 'file') return
    data[control.name] = control.value
  })
  return data
}

export function readFiles(root: HTMLElement, name: string): File[] {
  const input = root.querySelector<HTMLInputElement>(`.bison-field__input[name="${name}"]`)
  return input?.files ? Array.from(input.files) : []
}

/** Prefill non-file controls within root from a value map (resume hydration). */
export function setFieldValues(root: HTMLElement, values: Record<string, string | undefined>): void {
  root.querySelectorAll<HTMLInputElement>('.bison-field__input').forEach((control) => {
    if (control.type === 'file') return
    const v = values[control.name]
    if (v !== undefined) control.value = v
  })
}

/** Parse an attribute as JSON; absent or invalid JSON yields undefined. */
export function parseJsonAttribute<T>(host: HTMLElement, name: string): T | undefined {
  const raw = host.getAttribute(name)
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

/** Shows per-field errors and clears fields not present in the map. */
export function showErrors(root: HTMLElement, errors: Record<string, string>): void {
  root.querySelectorAll<HTMLElement>('.bison-field').forEach((field) => {
    const control = field.querySelector<HTMLInputElement>('.bison-field__input')
    const errorEl = field.querySelector<HTMLElement>('.bison-field__error')
    if (!control || !errorEl) return
    const message = errors[control.name]
    field.classList.toggle('bison-field--invalid', Boolean(message))
    control.setAttribute('aria-invalid', message ? 'true' : 'false')
    errorEl.textContent = message ?? ''
    errorEl.hidden = !message
  })
}
