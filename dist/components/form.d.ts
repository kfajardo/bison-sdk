import type { Option } from '../validation/constants.js';
export interface FieldSpec {
    name: string;
    label: string;
    type?: 'text' | 'email' | 'tel' | 'date' | 'number' | 'select' | 'textarea' | 'file';
    options?: readonly Option[];
    placeholder?: string;
    autocomplete?: string;
    multiple?: boolean;
}
/** A `<div data-bison-slot="NAME">` placeholder for consumer structural overrides. */
export declare function slotPlaceholder(name: string): HTMLElement;
/** Renders one labeled field into light DOM with stable bison-* class hooks. */
export declare function renderField(spec: FieldSpec): HTMLElement;
export declare function renderFields(container: HTMLElement, specs: FieldSpec[]): void;
/** Reads all non-file field values within root, keyed by field name. */
export declare function readFields(root: HTMLElement): Record<string, string>;
export declare function readFiles(root: HTMLElement, name: string): File[];
/** Prefill non-file controls within root from a value map (resume hydration). */
export declare function setFieldValues(root: HTMLElement, values: Record<string, string | undefined>): void;
/** Shows per-field errors and clears fields not present in the map. */
export declare function showErrors(root: HTMLElement, errors: Record<string, string>): void;
