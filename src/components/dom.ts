// Phase 3 — tiny light-DOM helpers. No shadow root: the product is consumer-styled,
// so every node lives in light DOM with a stable bison-* class hook.

type Child = Node | string | null | undefined | false
type Props = {
  class?: string
  text?: string
  html?: never // never inject html; use text or children
  [attr: string]: string | number | boolean | undefined | ((e: Event) => void)
}

/** Terse element factory. Function-valued props become listeners (onClick -> "click"). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue
    if (key === 'text') node.textContent = String(value)
    else if (key === 'class') node.className = String(value)
    else if (typeof value === 'function') node.addEventListener(key.replace(/^on/, '').toLowerCase(), value as EventListener)
    else if (value === true) node.setAttribute(key, '')
    else node.setAttribute(key, String(value))
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return node
}

/** Reflect a UI state onto a data-* attribute (state hook for the CSS layer). */
export function setState(node: HTMLElement, attr: string, value: string): void {
  node.setAttribute(`data-${attr}`, value)
}

/** Dispatch a bubbling CustomEvent from host. Returns false if a cancellable event was prevented. */
export function emit(host: HTMLElement, name: string, detail?: unknown, cancelable = false): boolean {
  return host.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, cancelable }))
}
