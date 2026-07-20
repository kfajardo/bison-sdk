// Phase 3 — tiny light-DOM helpers. No shadow root: the product is consumer-styled,
// so every node lives in light DOM with a stable bison-* class hook.
/** Terse element factory. Function-valued props become listeners (onClick -> "click"). */
export function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === false)
            continue;
        if (key === 'text')
            node.textContent = String(value);
        else if (key === 'class')
            node.className = String(value);
        else if (typeof value === 'function')
            node.addEventListener(key.replace(/^on/, '').toLowerCase(), value);
        else if (value === true)
            node.setAttribute(key, '');
        else
            node.setAttribute(key, String(value));
    }
    for (const child of children) {
        if (child === null || child === undefined || child === false)
            continue;
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
}
/** Reflect a UI state onto a data-* attribute (state hook for the CSS layer). */
export function setState(node, attr, value) {
    node.setAttribute(`data-${attr}`, value);
}
/** Dispatch a bubbling CustomEvent from host. Returns false if a cancellable event was prevented. */
export function emit(host, name, detail, cancelable = false) {
    return host.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, cancelable }));
}
