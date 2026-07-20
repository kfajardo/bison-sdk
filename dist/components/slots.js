// Phase 3 — light-DOM slot projection. Native <slot> only works inside a shadow
// root; these components are light-DOM (consumer-styled), so we project by hand.
//
// projectSlots harvests the host's slotted children BEFORE the render wipes them,
// then, after `root` is built, moves each harvested group into the placeholder that
// carries the matching data-bison-slot. This is the structural-replacement escape
// hatch: a consumer can drop `<div slot="header">…</div>` (or a variant name like
// `section-intro:business`) inside the element and own that region's markup.
/** Harvest slotted children by slot name, removing them from the host. Call before render. */
export function harvestSlots(host, names) {
    const wanted = new Set(names);
    const harvested = new Map();
    for (const child of Array.from(host.children)) {
        const name = child.getAttribute('slot');
        if (name && wanted.has(name)) {
            ;
            (harvested.get(name) ?? harvested.set(name, []).get(name)).push(child);
            host.removeChild(child);
        }
    }
    return harvested;
}
/** After building `root`, replace each `[data-bison-slot="NAME"]` placeholder with the
 *  harvested nodes for NAME (leaving the placeholder's default content when none supplied). */
export function applySlots(root, harvested) {
    for (const [name, nodes] of harvested) {
        const placeholder = root.querySelector(`[data-bison-slot="${name}"]`);
        if (!placeholder)
            continue;
        placeholder.replaceChildren(...nodes);
    }
}
/** Convenience: harvest names off host, then return an apply(root) closure. */
export function projectSlots(host, names) {
    const harvested = harvestSlots(host, names);
    return (root) => applySlots(root, harvested);
}
