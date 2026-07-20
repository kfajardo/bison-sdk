# Styling & events — the public contract

The `bison-jib-sdk` components ship as **light-DOM custom elements with zero CSS by
default**. Everything they render is regular DOM, so your CSS reaches every depth —
no shadow-root piercing, no `::part`. This document is the authoritative reference
for the styling and event surface, and it is **semver-governed**: the class names,
data-attributes, slot names, token names, and events below are the public API.

**Custom elements**

| Element | Purpose | Key attributes |
|---|---|---|
| `<bison-onboarding>` | Full multi-step KYB onboarding flow | `persona`, `scope-id`, `entity-id?`, `base-url?` |
| `<bison-onboarding-step step="…">` | One onboarding step, standalone | `step`, `persona` |
| `<bison-bank-crud>` | Bank-account list / add / verify / default / delete | `persona`, `scope-id`, `entity-id?`, `base-url?` |

`persona` is `"wio" | "operator"`. `scope-id` is the WIO or Operator id; add
`entity-id` for the WIO sub-entity route family. `base-url` is only needed when a
component builds its own client; sharing a `createClient()` via the `.client`
property (as in the demos) needs no `base-url`.

There are **four styling layers**. Reach for the lowest-numbered one that does the
job: class + attribute cover ~90% of restyling, slots handle structural swaps,
tokens are the shortcut for a full reskin.

---

## Layer 1 — Class contract (primary)

BEM-ish `bison-*` classes on every rendered node. **This is the main styling
surface.** Target them from plain CSS.

**Semver:** renaming or removing a class is **breaking (major)**. Adding a new class
is **minor**.

### Blocks & elements

**`bison-onboarding`** (the flow)

| Class | Element |
|---|---|
| `bison-onboarding` | root wrapper |
| `bison-onboarding__steps` | the step list (`<ol>`) |
| `bison-onboarding__step-item` | one step chip (`<li>`) — state via `data-state` (Layer 2) |
| `bison-onboarding__form` | the active step's `<form>` |
| `bison-onboarding__section-intro` | slotted section intro landing spot (Layer 3) |
| `bison-onboarding__repeat-item` | one repeatable group, e.g. a beneficial owner (`<fieldset>`) |
| `bison-onboarding__repeat-legend` | that group's `<legend>` |
| `bison-onboarding__actions` | the button row |
| `bison-onboarding__button` | any button in the flow — role via modifiers below |
| `bison-onboarding__error` | form-level error (`role="alert"`, `hidden` when empty) |
| `bison-onboarding__done` | the done/complete panel |
| `bison-onboarding__done-message` | the done message text |

Button modifiers: `bison-onboarding__button--back`, `--next`, `--add`, `--remove`.

Root modifier: `bison-onboarding--done` (set on the root in the completed state).

> **Transitional note:** step chips may also carry `bison-onboarding__step-item--active`
> / `--done` modifier classes while the components move fully onto `data-state`. The
> starter stylesheet styles both. Prefer `data-state` (Layer 2) in new CSS.

**`bison-field`** (one labeled input, used throughout onboarding)

| Class | Element |
|---|---|
| `bison-field` | field wrapper (`<div>`) |
| `bison-field--<fieldName>` | per-field modifier, e.g. `bison-field--ein`, `bison-field--addressLine1` |
| `bison-field--invalid` | wrapper flag when the field has an error |
| `bison-field__label` | the `<label>` |
| `bison-field__input` | the control (`input` / `select` / `textarea` all share it) |
| `bison-field__error` | per-field error (`role="alert"`, `hidden` when empty) |

Field validity is exposed **both** as the `bison-field--invalid` class and as
`aria-invalid="true"` on the input — style off either.

**`bison-step`** (the standalone `<bison-onboarding-step>` wrapper): `bison-step`,
`bison-step--<stepId>`. Fields inside reuse the `bison-field` block.

**`bison-bank-crud`** (banking)

| Class | Element |
|---|---|
| `bison-bank-crud` | root wrapper |
| `bison-bank-crud__list` | the accounts list (`<ul>`) |
| `bison-bank-crud__row` | one account row — status via `data-verified` / `data-default` (Layer 2) |
| `bison-bank-crud__row-main` | the row's name/number stack |
| `bison-bank-crud__bank-name` | bank name text |
| `bison-bank-crud__account-number` | masked account number (last-4) |
| `bison-bank-crud__badges` | badge container |
| `bison-bank-crud__badge` | one badge; modifiers `--verified` / `--unverified` / `--default` |
| `bison-bank-crud__row-actions` | per-row action buttons |
| `bison-bank-crud__empty-state` | shown when there are no accounts (Layer 3 slot target) |
| `bison-bank-crud__form` | the add-account form |
| `bison-bank-crud__input` | an input inside the bank form |
| `bison-bank-crud__error` | form-level error |
| `bison-bank-crud__actions` | the add-form button row |
| `bison-bank-crud__button` | any button; modifiers `--cancel` / `--ghost` |
| `bison-bank-crud__dialog` | the micro-deposit verify dialog (`<dialog>`) |
| `bison-bank-crud__dialog-body` | dialog content |
| `bison-bank-crud__dialog-title` | dialog heading |
| `bison-bank-crud__dialog-intro` | dialog explanatory text |
| `bison-bank-crud__code-input` | the `MV####` verification-code input |

---

## Layer 2 — State as attributes

Transient and enumerated state lives in **`data-*` attributes, not classes** — so
`[data-state="error"]` is a clean CSS target and JS can read/set state without class
string-juggling.

**Semver:** changing an attribute name or its allowed values is **breaking (major)**;
adding a value is **minor**.

| Attribute | On | Values | Meaning |
|---|---|---|---|
| `data-state` | `bison-onboarding__step-item` | `locked` \| `active` \| `done` \| `error` | step progress / lock state |
| `data-step` | `bison-onboarding__step-item`, `bison-onboarding__form` | `business` \| `officer` \| `owners` \| `volume` \| `documents` | which onboarding step this node is |
| `data-provider` | `bison-bank-crud` | `moov` \| `column` | active banking provider (brand/behavior hook) |
| `data-verified` | `bison-bank-crud__row` | present / absent (boolean) | account passed micro-deposit verification |
| `data-default` | `bison-bank-crud__row` | present / absent (boolean) | account is the entity's default |

Example:

```css
.bison-onboarding__step-item[data-state="error"] { color: var(--bison-error); }
.bison-onboarding__step-item[data-state="locked"] { opacity: 0.6; }
.bison-bank-crud__row[data-default] { border-color: var(--bison-accent); }
.bison-bank-crud__row:not([data-verified]) .bison-bank-crud__badge--verified { display: none; }
```

---

## Layer 3 — Slots (structural replacement)

For structural swaps, project your own markup with a `slot="…"` attribute. The
component **lifts** matching light-DOM children into the named position (light-DOM
projection — a `slot` attribute on a plain child, not a shadow `<slot>`). Slot
content is **yours** — the SDK ships no CSS for it.

**Semver:** removing or renaming a slot is **breaking (major)**; adding one is
**minor**.

| Slot name | Lands | Purpose |
|---|---|---|
| `header` | above the step list in `<bison-onboarding>` | your own title / progress / branding |
| `section-intro:<step>` | above the fields of that step's form (`<step>` is `business`\|`officer`\|`owners`\|`volume`\|`documents`) | per-step explanatory copy, e.g. `section-intro:business` |
| `actions` | in place of the default button row | fully custom navigation controls |
| `done` | in place of the default completion panel | your own success screen |
| `empty-state` | inside `<bison-bank-crud>` when there are no accounts | custom "no accounts yet" content |

```html
<bison-onboarding persona="wio" scope-id="wio_1">
  <header slot="header"><h2>Set up payments</h2></header>
  <p slot="section-intro:business">Match your EIN filing exactly.</p>
</bison-onboarding>

<bison-bank-crud persona="wio" scope-id="wio_1">
  <div slot="empty-state">No accounts yet — add one to get paid.</div>
</bison-bank-crud>
```

---

## Layer 4 — Design tokens

The opt-in stylesheet (`bison-jib-sdk/styles.css`) is built entirely on `--bison-*`
custom properties. **Reassign any of them in your own `:root`** (or on a host
element) to reskin without writing a single selector. Tokens are the fast path;
Layers 1–3 are for anything a token can't express.

**Semver:** the `--bison-*` namespace is reserved. Removing/renaming a token that
the shipped stylesheet consumes is **breaking (major)**; adding one is **minor**.
These tokens only take effect if you import `styles.css` (or reference them in your
own CSS) — they are inert otherwise.

### Full token list

| Token | Default (light) | Controls |
|---|---|---|
| `--bison-font` | system UI sans stack | base font family |
| `--bison-font-mono` | system mono stack | account numbers, verify code |
| `--bison-bg` | `#ffffff` | input & page background |
| `--bison-surface` | `#f6f8fa` | recessed surfaces (step chips, repeat groups) |
| `--bison-surface-raised` | `#ffffff` | cards (form, rows, dialog) |
| `--bison-text` | `#1c2530` | primary text |
| `--bison-text-muted` | `#5b6875` | secondary text, placeholders |
| `--bison-border` | `#d8dee6` | default borders |
| `--bison-border-strong` | `#b7c0cb` | input borders |
| `--bison-accent` | `#b45309` | brand color: buttons, active state, default-account edge |
| `--bison-accent-hover` | `#92400e` | accent hover |
| `--bison-accent-contrast` | `#ffffff` | text on accent fills |
| `--bison-accent-soft` | `#fdf6ec` | accent-tinted backgrounds |
| `--bison-focus-ring` | `#d97706` | focus outline color |
| `--bison-error` | `#c62828` | error text & borders |
| `--bison-error-soft` | `#fdecea` | error field/panel fill |
| `--bison-success` | `#1b7a43` | done state, verified badge |
| `--bison-success-soft` | `#e7f4ec` | success fill |
| `--bison-warning` | `#b7791f` | unverified badge |
| `--bison-warning-soft` | `#fdf3e0` | warning fill |
| `--bison-state-active` | → `--bison-accent` | active step accent |
| `--bison-state-done` | → `--bison-success` | done step accent |
| `--bison-state-locked` | → `--bison-text-muted` | locked step color |
| `--bison-radius` | `8px` | card / dialog corner radius |
| `--bison-radius-sm` | `5px` | input / button radius |
| `--bison-radius-pill` | `999px` | chips & badges |
| `--bison-gap` | `1rem` | grid/flex gap |
| `--bison-gap-sm` | `0.5rem` | tight gap |
| `--bison-pad` | `1.25rem` | card padding |
| `--bison-field-h` | `2.6rem` | control / button min-height |
| `--bison-shadow` | (2-layer soft) | card elevation |
| `--bison-shadow-pop` | (larger) | dialog elevation |
| `--bison-ease` | `160ms cubic-bezier(...)` | transitions |

### Theming

The stylesheet ships **light + dark**. Dark values apply automatically via
`@media (prefers-color-scheme: dark)`, and an explicit `data-theme="light"` /
`data-theme="dark"` on `:root` wins over the media query in both directions — wire
your app's theme toggle to that attribute. `color-scheme` is set accordingly so
native controls match. `prefers-reduced-motion` is honored (transitions collapse).

```css
/* Reskin: teal brand, rounder corners. No selectors touched. */
:root { --bison-accent: #0d7a6f; --bison-accent-hover: #0a5c54; --bison-accent-soft: #e6f4f2; --bison-radius: 12px; }
```

---

## Event contract

All events are `CustomEvent`s that **bubble** (so a delegated listener on a common
ancestor catches them) and are **not cancelable** (they report, they don't gate).
Payload is on `event.detail`.

**Semver:** removing an event or changing its `detail` shape is **breaking (major)**;
adding an event or an optional `detail` field is **minor**.

### `<bison-onboarding>`

| Event | `detail` | Fires when |
|---|---|---|
| `bison-step-change` | `{ index: number, step: OnboardingStep }` | the active step changes (next/back) |
| `bison-status-checked` | `OnboardingStatus` | the email step resolves the account status |
| `bison-already-onboarded` | `OnboardingStatus` | the email belongs to an already-onboarded account |
| `bison-already-registered` | `OnboardingStatus` | the email exists but onboarding is incomplete |
| `bison-submit-success` | `SaveSectionResult` (final registration result) | the flow completes successfully |
| `bison-submit-error` | `BisonApiError \| Error` | any step submission fails |

### `<bison-bank-crud>`

| Event | `detail` | Fires when |
|---|---|---|
| `bison-bank-added` | `BankAccount` | an account is added (manual or Plaid) |
| `bison-bank-deleted` | `{ id: string }` | an account is deleted |
| `bison-bank-default-changed` | `{ id: string }` | the default account changes |
| `bison-bank-verified` | `{ id: string }` | micro-deposit verification completes |
| `bison-bank-error` | `{ code?: string, message: string }` | an add/verify/delete op fails (409 duplicate, 422 eligibility, guard violation) |

```js
document.addEventListener('bison-submit-success', (e) => console.log('done', e.detail))
document.addEventListener('bison-bank-verified', (e) => console.log('verified', e.detail.id))
```

Types (`OnboardingStep`, `OnboardingStatus`, `SaveSectionResult`, `BankAccount`,
`BisonApiError`) are exported from the package root — see the README.

---

## Semver policy — summary

| Change | Bump |
|---|---|
| Add a class, data-value, slot, token, or event | **minor** |
| Rename / remove a class, data-attribute (or its values), slot, token, or event | **major** |
| Change an event's `detail` shape (non-additive) | **major** |
| Restyle the opt-in `styles.css` without changing token/class names | **patch** |

---

> **Contract reconciliation note.** These names are the shared source of truth with
> the components implementation. Where the on-disk components still emit legacy
> hooks during the rebuild (the `bison-onboarding__step-item--active/--done` modifier
> classes, and step-id path segments like `business-profile`), the starter
> stylesheet styles both the legacy and the canonical forms so nothing breaks
> mid-migration. New consumer CSS should target the canonical contract above.
