/** A `<div data-bison-slot="NAME">` placeholder for consumer structural overrides. */
export function slotPlaceholder(name) {
    const el = document.createElement('div');
    el.setAttribute('data-bison-slot', name);
    el.className = `bison-slot bison-slot--${name.replace(/[^a-z0-9-]/gi, '-')}`;
    return el;
}
let uid = 0;
/** Renders one labeled field into light DOM with stable bison-* class hooks. */
export function renderField(spec) {
    const doc = document;
    const id = `bison-field-${++uid}`;
    const wrapper = doc.createElement('div');
    wrapper.className = `bison-field bison-field--${spec.name}`;
    const label = doc.createElement('label');
    label.className = 'bison-field__label';
    label.htmlFor = id;
    label.textContent = spec.label;
    wrapper.appendChild(label);
    let control;
    if (spec.type === 'select') {
        control = doc.createElement('select');
        const empty = doc.createElement('option');
        empty.value = '';
        empty.textContent = spec.placeholder ?? 'Select...';
        control.appendChild(empty);
        for (const option of spec.options ?? []) {
            const el = doc.createElement('option');
            el.value = option.value;
            el.textContent = option.label;
            control.appendChild(el);
        }
    }
    else if (spec.type === 'textarea') {
        control = doc.createElement('textarea');
    }
    else {
        control = doc.createElement('input');
        control.type = spec.type === 'number' ? 'number' : spec.type ?? 'text';
        if (spec.multiple)
            control.multiple = true;
    }
    control.id = id;
    control.name = spec.name;
    control.className = 'bison-field__input';
    if (spec.placeholder && 'placeholder' in control)
        control.placeholder = spec.placeholder;
    if (spec.autocomplete)
        control.autocomplete = spec.autocomplete;
    wrapper.appendChild(control);
    const error = doc.createElement('p');
    error.className = 'bison-field__error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    wrapper.appendChild(error);
    return wrapper;
}
export function renderFields(container, specs) {
    for (const spec of specs)
        container.appendChild(renderField(spec));
}
/** Reads all non-file field values within root, keyed by field name. */
export function readFields(root) {
    const data = {};
    root.querySelectorAll('.bison-field__input').forEach((control) => {
        if (control.type === 'file')
            return;
        data[control.name] = control.value;
    });
    return data;
}
export function readFiles(root, name) {
    const input = root.querySelector(`.bison-field__input[name="${name}"]`);
    return input?.files ? Array.from(input.files) : [];
}
/** Prefill non-file controls within root from a value map (resume hydration). */
export function setFieldValues(root, values) {
    root.querySelectorAll('.bison-field__input').forEach((control) => {
        if (control.type === 'file')
            return;
        const v = values[control.name];
        if (v !== undefined)
            control.value = v;
    });
}
/** Shows per-field errors and clears fields not present in the map. */
export function showErrors(root, errors) {
    root.querySelectorAll('.bison-field').forEach((field) => {
        const control = field.querySelector('.bison-field__input');
        const errorEl = field.querySelector('.bison-field__error');
        if (!control || !errorEl)
            return;
        const message = errors[control.name];
        field.classList.toggle('bison-field--invalid', Boolean(message));
        control.setAttribute('aria-invalid', message ? 'true' : 'false');
        errorEl.textContent = message ?? '';
        errorEl.hidden = !message;
    });
}
