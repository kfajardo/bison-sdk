type Child = Node | string | null | undefined | false;
type Props = {
    class?: string;
    text?: string;
    html?: never;
    [attr: string]: string | number | boolean | undefined | ((e: Event) => void);
};
/** Terse element factory. Function-valued props become listeners (onClick -> "click"). */
export declare function el<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, children?: Child[]): HTMLElementTagNameMap[K];
/** Reflect a UI state onto a data-* attribute (state hook for the CSS layer). */
export declare function setState(node: HTMLElement, attr: string, value: string): void;
/** Dispatch a bubbling CustomEvent from host. Returns false if a cancellable event was prevented. */
export declare function emit(host: HTMLElement, name: string, detail?: unknown, cancelable?: boolean): boolean;
export {};
