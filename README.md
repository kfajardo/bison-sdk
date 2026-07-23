# Bison Jib SDK

Embed Bison JIB onboarding and banking into your own app. Three layers, use any of
them:

- **Core** — typed async API functions over a swappable transport (browser + Node)
- **Validation** — the exact onboarding validation rules the Bison platform uses (zod)
- **Components** — unstyled onboarding + banking web components (framework-agnostic)

```sh
BISON_API_KEY=your_publishable_key npx bison-jib-sdk init
```

This installs `bison-jib-sdk` and creates `bison.setup.mjs`. Import that file once;
the production API URL, API-key header, client, and component registration are fixed
inside the SDK.

> Browser API keys are visible to users. Only use a publishable, origin-restricted
> embeddable key; never ship a server secret.

## Core

Import the generated setup, then call the exported functions directly:

```ts
import './bison.setup.mjs'
import { getOnboardingStatus } from 'bison-jib-sdk'

const status = await getOnboardingStatus(scope)
```

Without the generator, the equivalent setup is one call:

```ts
import { setupBison } from 'bison-jib-sdk'

setupBison(import.meta.env.PUBLIC_BISON_API_KEY)
```

Requests use the fixed production origin and send `X-Embeddable-Key` on every call.

### Scope

One `scope` value threads through every call and picks the API route family:

```ts
type Scope = {
  persona: 'wio' | 'operator'
  id: string          // WIO id or Operator id
  entityId?: string   // WIO sub-entity route family (ignored for operator)
}
```

- `{ persona: 'wio', id }` → `/api/wios/{id}/…`
- `{ persona: 'operator', id }` → `/api/operators/{id}/…`
- `{ persona: 'wio', id, entityId }` → `/api/wios/{id}/entities/{entityId}/…`

### Onboarding (by step)

Onboarding is five sections in canonical order — `business`, `officer`, `owners`,
`volume`, `documents`. Read status, then submit sections one at a time:

```ts
import {
  getOnboardingIndustries,
  getOnboardingSection,
  getOnboardingStatus,
  getOnboardingTermsToken,
  saveOnboardingPaymentMethods,
  submitOnboardingSection,
  uploadOnboardingDocument,
} from 'bison-jib-sdk'

const status = await getOnboardingStatus(scope)
const business = await getOnboardingSection(scope, 'business')

// Where should a returning user resume? (pure, from status alone)
import { resolveOnboardingResumeStep } from 'bison-jib-sdk'
const step = resolveOnboardingResumeStep(status)

// Submit a section — discriminated by `step`
await submitOnboardingSection(scope, { step: 'business', data: businessProfile })
await submitOnboardingSection(scope, { step: 'officer', data: officer })
await submitOnboardingSection(scope, { step: 'owners', data: owners, noOwnersAbove25: false })
await submitOnboardingSection(scope, { step: 'volume', data: volume })

// Documents (multipart) + Moov helpers
await uploadOnboardingDocument(scope, file, 'merchant_underwriting')
await getOnboardingIndustries(scope)
await getOnboardingTermsToken()
await saveOnboardingPaymentMethods(scope, ['cards', 'ach'])
```

`submitOnboardingSection` with `step: 'business'` creates the provider account on first save and
returns `moovAccountId` on the result.

### Banking

```ts
import {
  completeBankAccountVerification,
  deleteBankAccount,
  getBankAccounts,
  getPlaidLinkToken,
  initiateBankAccountVerification,
  registerBankAccount,
  setDefaultBankAccount,
} from 'bison-jib-sdk'

await getBankAccounts(scope)                                  // BankAccount[]
await registerBankAccount(scope, { method: 'manual', holderName: 'Acme LLC',
  routingNumber: '021000021', accountNumber: '1234567890' })       // -> BankAccount
await getPlaidLinkToken(scope)                                // { linkToken }
await registerBankAccount(scope, { method: 'plaid', publicToken, accountId })
await initiateBankAccountVerification(scope, bankAccountId)
await completeBankAccountVerification(scope, bankAccountId, { code: 'MV1234' })
await setDefaultBankAccount(scope, bankAccountId)
await deleteBankAccount(scope, bankAccountId)
```

Note the client-side guards the platform enforces (reproduce them in custom flows):
can't delete the **default** or the **last** account; verification is **Moov-only**
(Plaid accounts are born verified). The verify code is `MV####` — the two
micro-deposit amounts concatenated.

All failures throw `BisonApiError` with `status`, `message`, `errors[]`, and a
machine-readable `errorCode` when the API provides one (e.g. `NON_US_ADDRESS`).

### Mock transport

For custom transports and tests, `createClient()` remains as an advanced escape hatch:

```ts
import { createClient, mock } from 'bison-jib-sdk'

const bison = createClient({ transport: mock() })
```

The `demo/` pages run entirely on `mock()` — see below.

## Validation

Pure functions and zod schemas, identical to the platform app's rules. Validate your
own custom forms before calling the core functions.

```ts
import { businessProfileSchema, controlOfficerSchema, validateForm } from 'bison-jib-sdk/validation'

const errors = validateForm(businessProfileSchema, formData) // { fieldName: message } or {}
```

## Components

Light-DOM web components, **zero CSS shipped by default**. Everything renders into
regular DOM, so plain CSS reaches all depths.

```html
<script type="module">
  import './bison.setup.mjs'

  const onboarding = document.querySelector('bison-onboarding')
  const bankAccounts = document.querySelector('bison-bank-accounts')
</script>

<bison-onboarding persona="wio" scope-id="wio_123"></bison-onboarding>
<bison-bank-accounts persona="wio" scope-id="wio_123"></bison-bank-accounts>
```

- `<bison-onboarding>` — the full multi-step flow (`persona`, `scope-id`, `entity-id?`,
  optional `prefill` JSON attribute or `.prefill` property keyed by section,
  optional `labels` JSON attribute or `.labels` property to relabel section titles
  and accessible state descriptions).
- `<bison-onboarding-partial>` — an unstyled partial onboarding form
  covering contact, incorporation, leadership, beneficial ownership, and payment
  services consent. New entities submit business + embedded control officer, then
  owners; existing provider entities update the officer between those requests.
  Its built-in Banking section lets the WIO submit one manual destination account
  for the operator’s use; it never lists existing accounts. Set `terms-url` to a
  Bison-hosted disclosure URL. `bison-partial-complete` fires after onboarding succeeds.
- `<bison-bank-accounts>` — bank-account list / add / verify / set-default / delete.

Events (all bubble, payload in `detail`):
`bison-step-change`, `bison-status-checked`, `bison-already-onboarded`,
`bison-already-registered`, `bison-submit-success`, `bison-submit-error`,
`bison-partial-complete`,
`bison-bank-added`, `bison-bank-deleted`, `bison-bank-default-changed`,
`bison-bank-verified`.

## Styling

The components expose a **semver-governed styling contract** in four layers:

1. **Classes** — BEM-ish `bison-*` hooks on every node (`bison-onboarding__form`,
   `bison-field__input`, `bison-bank-accounts__row`, …).
2. **State attributes** — `data-state="active|done|locked|error"`,
   `data-step`, `data-provider`, and `data-verified` / `data-default` on bank rows.
3. **Slots** — project your own markup via `slot="header"`,
   `slot="section-intro:business"`, `slot="actions"`, `slot="done"`,
   `slot="empty-state"`.
4. **Design tokens** — `--bison-*` custom properties.

Style them from your own stylesheet, or opt into the **starter stylesheet** — a
clean, accessible, theme-aware default built entirely on the contract above:

```ts
import 'bison-jib-sdk/styles.css'
```

```css
/* Reskin the whole thing by reassigning tokens — no selectors needed. */
:root { --bison-accent: #0d7a6f; --bison-radius: 12px; }
```

The starter sheet ships **nothing** unless you import it, does light + dark
(`prefers-color-scheme` + `data-theme`), and is fully overridable. The complete
class map, data-attribute map, slot map, token list, event map, and per-item semver
policy live in **[docs/STYLING.md](docs/STYLING.md)**.

## Demo

Two pages under `demo/`, both driven by `mock()` (no backend):

- `demo/index.html` — **unstyled**, proving the zero-CSS default, with a persona
  toggle, both components, and a live `bison-*` event log.
- `demo/styled.html` — the same flow with `styles.css` linked, token overrides, and
  a `slot=` example — all four styling layers visible at once.

```sh
bun run build            # compile src -> dist (incl. dist/styles.css)
bunx serve .             # or: python3 -m http.server
# open /demo/ (index.html) and /demo/styled.html
```

## Notes

- Amount conventions: `averageMonthlyDollarVolume` is whole dollars;
  `averageIndividualTransactionSize` / `maximumIndividualTransactionSize` are dollars
  per the KYB DTO. The components collect dollars and convert for you.
- EIN / SSN are **pass-through** — sent to Moov, never stored by Bison; GETs return
  `taxIdProvided` / `birthDateProvided` booleans instead.
- Beneficial-owner minimum ownership is **25%** (frontend/Moov rule).

## Development

```sh
bun install
bun run build   # tsc -> dist/, then copies src/styles.css -> dist/styles.css
bun test
```
