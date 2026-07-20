/** Harvest slotted children by slot name, removing them from the host. Call before render. */
export declare function harvestSlots(host: HTMLElement, names: readonly string[]): Map<string, Node[]>;
/** After building `root`, replace each `[data-bison-slot="NAME"]` placeholder with the
 *  harvested nodes for NAME (leaving the placeholder's default content when none supplied). */
export declare function applySlots(root: HTMLElement, harvested: Map<string, Node[]>): void;
/** Convenience: harvest names off host, then return an apply(root) closure. */
export declare function projectSlots(host: HTMLElement, names: readonly string[]): (root: HTMLElement) => void;
