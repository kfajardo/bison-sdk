# bison-jib-sdk

Embed Bison JIB onboarding and banking into your own app. Three layers, use any of
them:

- **Core** — typed async API client over a swappable transport (browser + Node)
- **Validation** — the exact onboarding validation rules the Bison platform uses (zod)
- **Components** — unstyled onboarding + banking web components (framework-agnostic)

```sh
npm install bison-jib-sdk
```

## Core

The client sits on a **transport** — the single seam between your code and the API.
Use `http()` (real API, Bearer auth, envelope unwrap) or `mock()` (in-process replay,
no backend). Auth is a **token callback**: the SDK never holds a raw API key. Your
server mints a short-lived, scope-bound token (from an API-key exchange, or an Auth0
token — the SDK is neutral) and hands it back per request.

```ts
import { createClient } from 'bison-jib-sdk'

const bison = createClient({
  baseUrl: 'https://api.yourhost.com',
  auth: { getToken: async () => fetchShortLivedTokenFromYourServer() },
})
```

> **Auth changed.** There is no `X-Embeddable-Key` and no `apiKey` config. Tokens are
> short-lived and minted server-side; `auth.getToken` is called per request (cache
> inside the callback if you like).

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
// Full KYB status, or one section's saved data
const status = await bison.getOnboardingStates(scope)          // OnboardingStatus
const business = await bison.getOnboardingStates(scope, 'business')

// Where should a returning user resume? (pure, from status alone)
import { resolveResumeStep } from 'bison-jib-sdk'
const step = resolveResumeStep(status)   // 'business' | 'officer' | 'owners' | 'volume' | 'documents'

// Submit a section — discriminated by `step`
await bison.submitOnboarding(scope, { step: 'business', data: businessProfile })
await bison.submitOnboarding(scope, { step: 'officer', data: officer })
await bison.submitOnboarding(scope, { step: 'owners', data: owners, noOwnersAbove25: false })
await bison.submitOnboarding(scope, { step: 'volume', data: volume })

// Documents (multipart) + Moov helpers
await bison.uploadDocument(scope, file, 'merchant_underwriting')
await bison.getIndustries(scope)
await bison.getTosToken()
await bison.savePaymentMethodCapabilities(scope, ['cards', 'ach'])
```

`submitOnboarding` with `step: 'business'` creates the Moov account on first save and
returns `moovAccountId` on the result.

### Banking

```ts
await bison.getBankAccounts(scope)                                  // BankAccount[]
await bison.register(scope, { method: 'manual', holderName: 'Acme LLC',
  routingNumber: '021000021', accountNumber: '1234567890' })       // -> BankAccount
await bison.getPlaidToken(scope)                                    // { linkToken }
await bison.register(scope, { method: 'plaid', publicToken, accountId }) // -> PlaidRegisterResult
await bison.initiateVerification(scope, bankAccountId)
await bison.completeVerification(scope, bankAccountId, { code: 'MV1234' })
await bison.setDefaultBankAccount(scope, bankAccountId)
await bison.deleteBankAccount(scope, bankAccountId)
```

Note the client-side guards the platform enforces (reproduce them in custom flows):
can't delete the **default** or the **last** account; verification is **Moov-only**
(Plaid accounts are born verified). The verify code is `MV####` — the two
micro-deposit amounts concatenated.

All failures throw `BisonApiError` with `status`, `message`, `errors[]`, and a
machine-readable `errorCode` when the API provides one (e.g. `NON_US_ADDRESS`).

### Mock transport

For local dev, tests, or demos with no backend, swap in `mock()`. Everything above
the transport is identical against it:

```ts
import { createClient, mock } from 'bison-jib-sdk'

const bison = createClient({ transport: mock() })   // no baseUrl, no auth needed
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
  import { createClient } from 'bison-jib-sdk'
  import { defineBisonComponents } from 'bison-jib-sdk/components'
  defineBisonComponents()

  const client = createClient({ baseUrl: 'https://api.yourhost.com', auth: { getToken } })
  document.querySelector('bison-onboarding').client = client
  document.querySelector('bison-bank-crud').client = client
</script>

<bison-onboarding persona="wio" scope-id="wio_123"></bison-onboarding>
<bison-bank-crud persona="wio" scope-id="wio_123"></bison-bank-crud>
```

- `<bison-onboarding>` — the full multi-step flow (`persona`, `scope-id`, `entity-id?`).
- `<bison-onboarding-step step="business" persona="wio">` — one step standalone, with
  a `value` getter and a `validate()` method for custom flows.
- `<bison-bank-crud>` — bank-account list / add / verify / set-default / delete.

Events (all bubble, payload in `detail`):
`bison-step-change`, `bison-status-checked`, `bison-already-onboarded`,
`bison-already-registered`, `bison-submit-success`, `bison-submit-error`,
`bison-bank-added`, `bison-bank-deleted`, `bison-bank-default-changed`,
`bison-bank-verified`.

## Styling

The components expose a **semver-governed styling contract** in four layers:

1. **Classes** — BEM-ish `bison-*` hooks on every node (`bison-onboarding__form`,
   `bison-field__input`, `bison-bank-crud__row`, …).
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
