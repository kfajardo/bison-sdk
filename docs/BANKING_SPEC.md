# Bison Banking (Bank Account Management) — Implementation Spec

Current-state specification of bank-account CRUD across the Bison JIB Pay frontend
(`bison-jib-web-flow`) and backend (`bison-jib-pay-api`): listing, adding (Plaid + manual),
verifying (micro-deposits), setting default, updating, deleting — plus the eligibility and
approval gates that wrap it. Written so an implementer (human or AI) can rebuild, extend, or
port the flow from this document alone. File references are repo-relative; routes, enums, and
validation rules are quoted verbatim from source as of 2026-07-20.

Companion doc: `ONBOARDING_SPEC.md` (KYB/Moov onboarding — banking gates on its outputs:
section statuses, capabilities, `BankAccountEligibility`, `hasExternalAccount`).

---

## 1. Scope & core concepts

"Banking" = external bank accounts attached to a WIO (working-interest owner), a WIO's
sub-entity (Partner), or an Operator, used to fund/receive payments. One provider-agnostic
record type (`BankAccount` row / `BankAccountDto`) fronts three payment providers.

| Concept | Meaning |
|---|---|
| **Provider** | Backend-selected and opaque to SDK consumers. Full-service providers support manual entry, verification, and approval gating; direct-entry providers use Plaid with no verification step. |
| **Scope** | WIO self (`/api/wios/{id}/bank-accounts*`), entity/Partner (`/api/wios/{wioId}/entities/{entityId}/bank-accounts*`), Operator (`/api/operators/{id}/bank-accounts*`), public payer (`/api/pay/{token}/...`, unauthenticated). |
| **Add methods** | Plaid Link (instant-verified) and manual routing/account entry (Moov only; micro-deposit verify). |
| **Provider reality** | `PaymentPlatformSettings.ActiveProvider` selects the implementation; the SDK exposes provider identifiers as opaque strings. |

The Moov Drop `<wio-bank-account>` web component is loaded
(`src/hooks/use_moov_scripts.ts:10`) but **never rendered** — bank linking is Plaid + REST, not
the Moov Drop. `OperatorBankAccountEmbed` (`src/components/operators/operator_bank_account_embed.tsx`)
just wraps `usePlaidLink` despite its name. `AddBankDialog`
(`src/components/ui/add_bank_dialog.tsx`) is a mock/demo (hardcoded banks, OTP key
`bank_accounts.link_mock`) — not real CRUD.

---

## 2. Frontend surfaces

| Surface | File | Scope | Entry |
|---|---|---|---|
| WIO Banking page | `src/pages/banking.tsx` | WIO self or active entity | route `banking` (`src/routes/main_app_routes.tsx:44`); `/banking` → `/wio` (`src/App.tsx:42`) |
| Bank list/add/verify card | `src/components/banking/bank_accounts_card.tsx` | WIO + entity | inside `banking.tsx:161` |
| Shared list/empty/add section | `src/components/banking/bank_account_section.tsx` | WIO + operator | — |
| Bank row (default/delete/verify) | `src/components/banking/bank_account_row.tsx` | shared | — |
| Detail modal | `src/components/ui/bank_account_detail_modal.tsx` | shared | row click |
| Operator Banking page | `src/operator/pages/banking.tsx` (tabs: Verification / Bank Account) | operator portal | `src/routes/operator_routes.tsx:49` |
| Operator bank tab + hook | `src/operator/components/banking/bank_account_tab.tsx`, `src/operator/hooks/use_operator_banking.ts` | operator | — |
| WIO managing an operator | `src/pages/operator_detail.tsx:326` → `src/components/operators/operator_bank_accounts.tsx` | WIO admin | operator detail |
| Entity link-bank modal | `src/components/entities/link_bank_account_modal.tsx` | WIO entity mgmt | entities screen |
| Onboarding banking section | `src/components/onboarding/sections/banking_section.tsx` | WIO onboarding | KYB accordion |
| Setup guide "banking" step | `setup_guide.tsx:222` — `id:"banking"`, navigates to `/banking`, `isCompleted: hasBanking` | WIO dashboard | dashboard card |
| Add-account drawer bank step | `src/components/accounts/add_account_steps/step_bank_account.tsx` | WIO partner add | `add_account_drawer.tsx:335` |
| Public payment page | `src/components/multi_invoice_payment/add_payment_method_panel.tsx`, `src/pages/public/payment_page.tsx` | unauthenticated payer | pay link |
| Approval guard | `src/components/banking/banking_approval_guard.tsx` | WIO Moov unapproved | `banking.tsx:157` |

Method chooser: `src/components/banking/bank_connection_method_selector.tsx`
(`BankConnectionMethod = 'plaid' | 'manual'`) — rendered **only for Moov**; direct-entry
providers go straight to Plaid.

---

## 3. API contract

### 3.1 Envelope & auth

- Envelope `{ success, message, data }` everywhere. WIO/entity frontend fns use the shared
  `fetcher` (auto-unwrap); operator fns use `request()` (`@/services/api`); Plaid + public-pay
  use raw `fetch`. All bank calls attach `embeddableHeaders()` (`@/utils/embeddable_headers`).
- Backend auth per scope:
  - **WIO bank CRUD** (`api/wios/{id}/bank-accounts*`): no explicit attribute — falls to the
    global `RequireAuthenticatedUser` policy (JWT).
  - **Entity-scoped**: `[AuthorizeOrSuperAdmin]` + ownership guard
    (`IsAdmin() || currentWioId == wioId` → 403; `IsPartnerLinkedToWioAsync` → 404).
  - **Operator bank endpoints**: class `[AuthorizeOrSuperAdmin]` but each action also
    `[AllowAnonymous][EmbeddableAuth]` — reachable with `X-Embeddable-Key` alone.
  - **Plaid**: `/api/plaid/*` JWT; `/api/plaid/embeddable/*` `[AllowAnonymous][EmbeddableAuth]`.
  - **Public pay** (`/api/pay/{token}/...`): token-authenticated, no login.

### 3.2 WIO scope (frontend `src/swr/wios/api.ts`; backend `WioController.cs`)

| Method | Route | Request | Response | FE / BE |
|---|---|---|---|---|
| GET | `/api/wios/{id}/bank-accounts` (+ `?partnerId`/`enverusUserId`/`prtBaId`) | — | `BankAccountDto[]` | `api.ts:54` / `WioController.cs:697` |
| POST | `/api/wios/{id}/bank-accounts` | `CreateBankAccountRequest` | `BankAccountDto` (201) | unused by FE (Plaid covers create) / `:716` |
| PUT | `/api/wios/{id}/bank-accounts/{baId}` | `UpdateBankAccountRequest` | `BankAccountDto` | `:169` / `:748` |
| DELETE | `/api/wios/{id}/bank-accounts/{baId}` | — | `void \| OtpRequiredResponse` | `:158` / `:775` |
| PUT | `/api/wios/{id}/bank-accounts/{baId}/set-default` | — | `void \| OtpRequiredResponse` | `:147` / `:803` |
| POST | `/api/wios/{id}/bank-accounts/manual` | `ManualBankAccountRequest` | `ManualBankAccountResponse` (201; 409 duplicate) | `:206` / `:836` |
| POST | `/api/wios/{id}/bank-accounts/{baId}/initiate-verification` | — | `void` | `:226` (FE never calls) / `:991` |
| POST | `/api/wios/{id}/bank-accounts/{baId}/complete-verification` | `{ code }` | `void` | `:245` / `:1041` |
| GET | `/api/wios/payment-account-status` | — (uses current WIO) | `WioPaymentAccountStatusDto` | `:73` / `:1128` |

### 3.3 Entity (Partner) scope (frontend `src/swr/entities/api.ts`; backend `WioController.cs`)

Same verbs at `/api/wios/{wioId}/entities/{entityId}/bank-accounts*`:
GET list (`api.ts:50` / `:2535`), POST `/manual` (`:35` / `:2345`), PUT
`/{baId}/set-default` (`:63` / `:2571`), DELETE `/{baId}` (`:77` / `:2636`), POST
`/{baId}/initiate-verification` (`:91` / `:2687`), POST `/{baId}/complete-verification`
(`:105` / `:2748`). Plus `POST /api/wios/{wioId}/entities/{entityId}/link-bank-account`
(`LinkEntityBankAccountRequest` → `RegisterCounterpartyResult`, `WioController.cs:2260`).
Entity mutations invalidate **both** entity and WIO SWR caches
(`entityKeys.bankAccountsFilter` + `wioKeys.bankAccountsFilter`).

### 3.4 Operator scope (frontend `src/swr/operators/api.ts`; backend `OperatorController.cs`)

| Method | Route | Request | FE / BE |
|---|---|---|---|
| GET | `/api/operators/{opId}/bank-accounts` | — | `api.ts:160` / `:1481` |
| GET | `/api/operators/{opId}/bank-accounts/{baId}` | — | — / `:1498` |
| POST | `/api/operators/{opId}/bank-accounts` | `CreateBankAccountRequest` (audited as `OperatorBankAccount`) | `:272` / `:1515` |
| PUT | `/api/operators/{opId}/bank-accounts/{baId}` | `UpdateBankAccountRequest` | `:289` / `:1568` |
| DELETE | `/api/operators/{opId}/bank-accounts/{baId}` | — | `:256` / `:1615` |
| PUT | `/api/operators/{opId}/bank-accounts/{baId}/set-default` | — (2-step: local GUID/ExternalId → Moov payment-method lookup → auto-creates local row if missing) | `:244` / `:1655` |
| POST | `/api/operators/{opId}/bank-accounts/manual` | `ManualBankAccountRequest` | `:325` / `:1818` |
| POST | `.../{baId}/initiate-verification` | — | `:340` / `:1960` |
| POST | `.../{baId}/complete-verification` | `{ code }` | `:354` / `:2016` |

### 3.5 Plaid (frontend `src/swr/plaid/api.ts`; backend `PlaidController.cs`)

| Method | Route | Auth | Request → Response |
|---|---|---|---|
| POST | `/api/plaid/embeddable/create-token?entityId=` | EmbeddableAuth | `PlaidLinkTokenCreateRequest` → `{ linkToken }` (FE `api.ts:81` / BE `:126`) |
| POST | `/api/plaid/embeddable/register-bank-account` | EmbeddableAuth | `UnifiedBankRegistrationRequest` → `UnifiedBankRegistrationResponse` (`registrations[]`, `allSucceeded`, `isDuplicate`, `plaidItemId`) (FE `:126` / BE `:210`) |
| POST | `/api/plaid/embeddable/retry-registration` | EmbeddableAuth | `RetryRegistrationRequest` (FE `:165` / BE `:242`) |
| POST | `/api/plaid/register-bank-account`, `/retry-registration`, `/create-token`, `/moov-processor-token`, `/attach-to-moov` | JWT | authenticated equivalents (`PlaidController.cs:84,101,53,63,73`) |
| POST | `/api/plaid/embeddable/moov-processor-token`, `/attach-to-moov` | EmbeddableAuth | `:154`, `:181` |

Frontend Plaid Link: `src/hooks/use_plaid_link.ts` — imperative `window.Plaid.create` (script
`cdn.plaid.com/link/v2/stable/link-initialize.js`), `products: ['auth']`,
`countryCodes: ['US']`, `clientName: 'JibPay'`. Register payload includes exactly one scope id
of `moovAccountId` / `enverusUserId` / `prtBaId` / `partnerId`.

### 3.6 Public payment page (frontend `src/swr/pay/api.ts`, unauthenticated)

| Method | Route | FE line |
|---|---|---|
| POST | `/api/pay/plaid/link-token` (`{ paymentLinkToken }`) | `:209` |
| POST | `/api/pay/{token}/bank-account` (`{ publicToken, accountId }`) | `:244` |
| GET | `/api/pay/{token}/bank-account/latest` → `PublicLatestBankAccountDto \| null` | `:281` |
| PUT | `/api/pay/{token}/bank-accounts/{baId}/set-default` | `:321` |
| POST | `/api/pay/{token}/bank-account/manual` (`PublicManualBankAccountRequest`) | `:589` |
| POST | `/api/pay/{token}/bank-accounts/{baId}/initiate-verification` | `:628` |
| POST | `/api/pay/{token}/bank-accounts/{baId}/complete-verification` (`{ code }`) | `:660` |
| GET | `/api/operators/{opId}/bank-accounts` (payee display) | `:460` |

### 3.7 Generic counterparty & other backends

- `GET /api/payments/counterparties/{entityType}/{entityId}` (`PaymentController.cs:660`),
  `POST /api/payments/counterparties/register` (`:689`,
  `RegisterCounterpartyRequest`), `PUT /api/payments/bank-accounts/{baId}` (`:721`,
  `UpdateCounterpartyRequest` — wire/beneficiary via `WireDetails`; FE
  `src/swr/payments/api.ts:108,123`). All guarded by `AuthorizeCounterpartyEntityAccessAsync`.
- Moov passthrough (`MoovController.cs`, mostly `[Obsolete]`):
  `POST /api/moov/accounts/{accountId}/bank-accounts` (`:1148`, eligibility preflight
  `:1165-1170`, header `X-Wait-For: payment-method`), verify POST/PUT
  `.../bank-accounts/{baId}/verify` (`:1261`/`:1324`, obsolete).
- Embeddable (`EmbeddableController.cs`, `[AllowAnonymous]`+EmbeddableAuth):
  `GET /api/embeddable/payment-methods/{moovAccountId}` (`:475` — banks+cards+wallets+ApplePay),
  `DELETE /api/embeddable/bank-account/{moovAccountId}/{bankAccountId}` (`:525`),
  `DELETE /api/embeddable/credit-card/{moovAccountId}/{cardId}` (`:582`), Plaid trio
  (`:1197/:1258/:1321`), `GET /api/embeddable/moov-account-id` (`:725`).

---

## 4. DTOs & validation

### 4.1 Backend request DTOs (verbatim attributes)

`CreateBankAccountRequest` / `UpdateBankAccountRequest` (identical shape):

```
[Required][StringLength(200)] AccountName
[Required][StringLength(200)] BankName
[Required] RoutingNumber
[Required] AccountNumber
AccountType?                       // Checking=0 | Savings=1
SwiftCode?
[StringLength(127)] Description?
PaymentPlatformProviderType? Provider   // create: override; update: accepted but ignored
[StringLength(200)] AccountHolderName?
bool IsDefault = false
IdempotencyKey?                    // required by some providers
```

`ManualBankAccountRequest` (`MoovBankAccountDTOs.cs:104-139`, Moov-only):

```
[Required] HolderName
HolderType? = "business"           // "individual" | "business"
[Required][StringLength(9, MinimumLength = 9)] RoutingNumber
[Required] AccountNumber
BankAccountType? = "checking"      // "checking" | "savings"
bool? InitiateVerification = true
EnverusUserId?
int? PrtBaId?
```

`MoovCompleteBankAccountVerificationRequest` = `{ string Code }` — provider normalizes: strips
optional `MV` prefix, requires exactly 4 digits
(`MoovBankAccountService.TryNormalizeVerificationCode:394`).

`UnifiedBankRegistrationRequest` (`UnifiedBankRegistrationDTOs.cs:10`, no DataAnnotations):
`PublicToken, AccountId, EntityType, EntityId, MoovAccountId, AccountType, Description,
BankName?, AccountHolderName, EnverusUserId?, PrtBaId?, PartnerId?`,
`[JsonIgnore] IsPublicPartnerScopedRegistration`.

`RegisterCounterpartyRequest`: no DataAnnotations; notable fields `Provider?` (null →
ActiveProvider), `IsVerified?` override, `bool InitiateVerification`,
`PartnerId`/`PartnerDetailId` alias, `IdempotencyKey?`.

### 4.2 Response DTO

`BankAccountDto`: `Id, ExternalId, Provider, AccountName?, BankName?, AccountNumber?` (last-4),
`RoutingNumber?, AccountType?, IsVerified, IsDefault, CreatedAt, UpdatedAt, EnverusUserId?,
PrtBaId?`.

### 4.3 Frontend validation (verbatim, `src/utils/bank_account_validation.ts`)

```
routingNumberSchema (:26) = z.string().trim()
  .regex(/^\d{9}$/, 'Routing number must be 9 digits')
  .refine(isValidAbaRouting, 'Invalid routing number')
// ABA checksum (:16-24): (3*(d0+d3+d6) + 7*(d1+d4+d7) + 1*(d2+d5+d8)) % 10 === 0

accountNumberSchema (:32) = z.string().trim()
  .regex(/^\d+$/, 'Account number must contain digits only')
  .min(4, 'Account number is too short')
  .max(20, 'Account number is too long')
  .refine(v => !/^0+$/.test(v), 'Account number cannot be all zeros')

bankAccountFormSchema (:40): accountName ≤200, bankName ≤200, routingNumber, accountNumber,
  accountType: z.enum(['checking','savings']).optional(), isDefault: z.boolean().optional()
```

- Manual entry form (`src/components/banking/manual_bank_entry_form.tsx:104-119`): holder name
  required (`"Account holder name is required"`); routing input strips non-digits and slices to
  9; account slices to 20; live bank-name lookup via `lookupBankByRouting` (`ROUTING_TO_BANK`);
  `holderType` default per context (`'business'` for partners, `'individual'` for operators —
  `src/utils/bank_account_holder_type.ts`).
- **Divergent legacy validators** (reproduce as-is or consolidate deliberately):
  operator legacy modal (`src/components/operators/manual_bank_account_modal.tsx:170-199`) —
  account 4–17 digits, confirm-account-number must match, own checksum copy, sends
  `routingNumberType:'aba'`; entity link modal
  (`src/components/entities/link_bank_account_modal.tsx:67-78`) — routing `/^\d{9}$/` with
  **no** checksum.
- Verification dialog (`src/components/banking/bank_verification_dialog.tsx`): code must match
  `/^MV\d{4}$/i` (`:35`), uppercased and sliced to 6 chars; phases `idle → verifying → success`;
  shows attempts-remaining when ≤3.

### 4.4 Frontend enums

`PaymentProvider` is backend-selected; `BankAccountType {Checking:0, Savings:1}`
(`src/types/bank_account.ts:4,12`); `CounterpartyEntityType {WIO:0, Operator:1}`
(`src/types/plaid.ts:37`);
`BankVerificationStatus = 'new' | 'pending' | 'verified' | 'errored' | 'max-attempts-exceeded'`
(`src/types/manual_bank_account.ts:66`).

---

## 5. Domain model (backend)

**`BankAccount`** (`Features/BisonJibPay.PaymentPlatform/Domain/Entities/BankAccount.cs`) →
table **`BankAccounts`** (renamed from `PaymentCounterparties` by migration
`075_ConsolidateBankAccountsTables.sql`, which unified legacy `WioBankAccounts` +
`OperatorBankAccounts`). Extends `AuditableEntity`.

```
EntityType   CounterpartyEntityType     // Wio | Operator
EntityId     Guid                       // WIO-scoped rows store the Partner id (see §6.1)
ExternalId   string                     // provider id: Column "cpty_...", Moov bankAccountID
Provider     PaymentPlatformProviderType // opaque provider identifier
AccountType? // Checking=0 | Savings=1
IsDefault    bit    // composite index IX_BankAccounts_EntityType_EntityId_IsDefault
IsVerified   bit
Status       CounterpartyStatus = Pending   // Pending | Active | Inactive | Failed | Deleted
Metadata     string? (JSON)             // routing, last4, BankName, HolderName, moovAccountId,
                                        // plaid ids, persistent_account_id, linked_at ...
EnverusUserId string?
PrtBaId      int?
```

- **No routing/account/bank-name columns** — all display/sensitive data lives in `Metadata` JSON.
- **No soft delete** — `DeleteAsync` is a hard `DELETE` (`PaymentCounterpartyRepository.cs:404-413`).
  `CounterpartyStatus.Deleted` is set only by the provider-layer counterparty delete, never by
  the CRUD delete path.
- Unique constraint `UQ_BankAccounts_ExternalId`; per-entity-per-provider uniqueness was
  dropped (migration 075 step 1d) to allow multiple accounts per entity.
- `MoovAccount.PrimaryBankAccountId` is set during onboarding bank creation
  (`MoovAccountCreationService.cs:349,1059`), not by the CRUD paths.

---

## 6. Business logic

### 6.1 Create — three paths

**Managed create (POST `/bank-accounts`)** — `WioOrchestrator.CreateBankAccountAsync`
(`WioOrchestrator.cs:361`): resolves the WIO's single linked Partner (fails if none), maps to
`RegisterCounterpartyRequest` (`EntityType=Wio`, **`EntityId = Partner.Id`**,
`PartnerId=Partner.Id`), calls `PaymentPlatformOrchestrator.RegisterCounterpartyAsync`, honors
`IsDefault`, publishes `BankAccountLinkedEvent` (email links to
`{App:FrontendUrl}/app/{wioId}/banking`). Operator variant adds an audit log entry
(`entityType: "OperatorBankAccount"`).

**Manual create (POST `/bank-accounts/manual`, Moov only)** — controller-level
(`WioController.cs:842`, `:2353`; `OperatorController.cs:1825`):

1. Eligibility guard (§8.1) → 422 if not eligible.
2. Resolve the scoped Moov account — WIO uses `GetByEntityAsync("Partner", partner.Id)`;
   entity scope bootstraps one via
   `_entityOnboardingOrchestrator.EnsurePartnerMoovAccountAsync(markPartnerOnboarded:false)`.
3. `MoovBankAccountService.CreateBankAccountAsync` (Moov POST
   `/accounts/{acct}/bank-accounts`, `X-Wait-For: payment-method`). Backend auto-initiates
   micro-deposits (`InitiateVerification` default `true`).
4. Dedupe by `GetByExternalIdAsync` → **409 `"This bank account is already registered."`**
   (`WioController.cs:46`); SqlException 2601/2627 also → 409.
5. Persist row: `Provider=Moov, Status=Active, IsVerified=false, IsDefault=false`, metadata
   JSON gets routing/last4/BankName/HolderName/HolderType/moovAccountId.

**Plaid create (POST `/api/plaid[.../embeddable]/register-bank-account`)** —
`PlaidOrchestrationService` (`Features/BisonJibPay.Plaid/Infrastructure/Services/`):
cross-processor fan-out gated by `PlaidSettings.CrossProcessorRegistration.Enabled`
(default `false` → Moov-only legacy path). Dedupes via Plaid `persistent_account_id`
(`EnableTanDeduplication=true`). Plaid-linked accounts are created **`IsVerified=true`**
(instant verification). Response reports per-processor `registrations[]`, `allSucceeded`,
`isDuplicate`. Frontend: duplicate → toast; partial failure → warn, still treat as success.

### 6.2 Update

`WioOrchestrator.UpdateBankAccountAsync:433` (operator equivalent): updates local
`AccountType`/`IsDefault`, then provider `UpdateCounterpartyBankAccountAsync` (routing/account
change may yield a new `ExternalId`, re-stored). Column update = delete + recreate
(counterparties immutable). Only non-sensitive local fields are mutated.

### 6.3 Delete

`WioOrchestrator.DeleteBankAccountAsync:499`: if `Provider==Moov` with `ExternalId`, delete
from Moov first via `_moovPaymentMethodService.DeleteBankAccountAsync(moovAccountId,
externalId)` (**best-effort** — Moov failure only warns), then hard local delete. Entity scope
verifies `EntityType==Wio && EntityId==entityId` first (400 `"Bank account does not belong to
this entity"`).

**Backend has no default-account or last-account guard** — those rules are frontend-only:

- `bank_account_row.tsx:62`:
  `canDelete = !account.isDefault && totalCount - deletingCount > 1` (can't delete default,
  can't delete last). Operator detail blocks with toast
  `"You cannot delete your last bank account."` (`operator_bank_accounts.tsx:199`).
- **Auto Pay guard** (`bank_accounts_card.tsx:326-345`): blocks delete with
  `"Cannot delete this bank account because it is used by an active Auto Pay setting."`
  (matched against `moovBankAccountId`).
- Confirmation modal always precedes delete ("Unlink bank account?" / "Delete Bank Account").
- No archive concept for bank accounts.

### 6.4 Default account

- `PaymentCounterpartyRepository.SetDefaultAsync` (`:359`): one transaction — clear
  `IsDefault=1` for the `(EntityType, EntityId)` scope, then set it on the target. (A
  `prtBaId`-scoped overload exists but CRUD paths call the unscoped version.)
- **Auto-promote**: `CreateAsync` (`:243-257`) — first account for an entity scope becomes
  `IsDefault=true` automatically when the caller didn't specify.
- Operator set-default (`OperatorController.cs:1655`) resolves by local GUID **or**
  `ExternalId`, falls back to a Moov payment-method lookup, and auto-creates the missing local
  row before setting default.
- Frontend sorts default-first (`bank_accounts_card.tsx:393`); shows a "no default" warning
  banner when none is default (`bank_account_section.tsx:334`); mutations are optimistic
  (operators write cache with `revalidate:false` to preserve animations,
  `use_operator_banking.ts:213`).

### 6.5 Verification (Moov micro-deposit)

- **Initiate** (`MoovBankAccountService:163`): OAuth scope
  `/accounts/{id}/bank-accounts.write`, Moov POST `.../verify`, header
  `X-Wait-For: rail-response`. Deposits arrive in 1–3 business days. Auto-run on manual
  create; explicit `initiate-verification` endpoints exist per scope but the frontend never
  calls them (only complete).
- **Complete** (`:186`): normalize code (optional `MV` prefix + exactly 4 digits — the code is
  the two deposit amounts concatenated, e.g. $0.12 + $0.34 → `MV1234`), Moov PUT `.../verify`.
  A Moov conflict "verification is already successful" is treated as success. On success the
  controller sets local `IsVerified=true`.
- **Moov status classification** (`:27-38`): success = `{new, sent-credit, successful}`;
  failed = `{failed, expired, max-attempts-exceeded}`. Attempts/MaxAttempts come from Moov —
  no app-side cap.
- **Column verification is a no-op** (`ColumnPaymentPlatformProvider.cs:188,199` return
  `Succeeded(bankAccount.IsVerified)`); frontend suppresses the Verify button for non-Moov
  (`canVerifyAccounts: isMoovProvider`, `bank_accounts_card.tsx:453`).
- Badge UI (`bank_verification_badge.tsx:23`): `new`→"Awaiting Verification" (warning),
  `pending`→"Pending Verification" (+ inline Verify), `verified`→"Verified",
  `errored`→"Verification Failed", `max-attempts-exceeded`→"Max Attempts Exceeded". Rows
  derive verified/pending from the `BankAccountDto.isVerified` boolean
  (`bank_account_row.tsx:109`).

### 6.6 Webhook sync (`bankAccount.created|updated|deleted`)

`MoovWebhookService` routes all three (`:80`) →
`BankAccountEventPublisher` → `BankAccountWebhookHandler.HandleBankAccountSyncAsync`
(`Features/BisonJibPay.Sync/Infrastructure/Services/BankAccountWebhookHandler.cs:47`):

- Canonical entity type from stored `MoovAccount.EntityType` (`Partner` treated as payer).
  Payer entities (`Wio`/`Partner`) filter Moov payment-method type `ach-debit-fund`; payees
  use `ach-credit-same-day`.
- **Non-destructive upsert** against local Moov rows: existing rows update only
  `AccountType` + `Status=Active` + `UpdatedAt`, **preserving `IsVerified`, `IsDefault`,
  `Metadata`** (`:114-124`); new rows created `Status=Active, IsVerified=false,
  IsDefault=false`; local rows missing from Moov's list are **never deleted** (logged only,
  `:155-163`). Delete events do not remove local rows.
- `MapAccountType`: `"checking"→Checking, "savings"→Savings, default→Checking`.
- Handler exceptions are swallowed (non-fatal to webhook ack).

---

## 7. OTP (2FA) gating — frontend

Every mutating bank operation is OTP-gated via `requestOtp({featureKey,...})`:

- WIO/entity: `bank_accounts.set_default`, `bank_accounts.delete`,
  `bank_accounts.link_manual` (`use_banking.ts`, `bank_accounts_card.tsx`).
- Operator: `operators.bank_accounts.{set_default,delete,link_manual}`.
- Mutation endpoints may return `OtpRequiredResponse` instead of data; `extractOtpRequired`
  short-circuits cache updates. Dismissal codes `OTP_COOLDOWN`/`CANCELED` are swallowed
  silently. Scope ids are captured at invocation so a mid-OTP entity switch cannot misapply
  (`use_banking.ts:70-72`).

---

## 8. Eligibility & approval gating

### 8.1 Bank-account eligibility (US-address rule) — backend-enforced

- DTO `BankAccountEligibilityStatusDto`
  (`Common/BisonJibPay.Persistence.Domain/DTOs/`): reasons `NON_US_ADDRESS`,
  `ADDRESS_NOT_SET`. `Compute(businessProfileComplete, country)`: complete KYB business
  profile ⇒ eligible (form is US-only); else `US`/`USA` ⇒ eligible, blank ⇒
  `ADDRESS_NOT_SET`, other ⇒ `NON_US_ADDRESS`. Pessimistic — no silent US default.
- Resolver `KybEntityResolver.GetBankAccountEligibilityAsync`
  (`Features/BisonJibPay.Sync/Infrastructure/Services/KybEntityResolver.cs:128`) for
  `"Operator" | "Wio" | "Partner"`. Exposed on the KYB status response
  (`KybOnboardingDTOs.cs:108`).
- Write-path guard `BankAccountEligibilityGuard.RejectIfBankAccountIneligibleAsync`
  (`BisonJibPay.API/Extensions/BankAccountEligibilityGuard.cs`) → **422** with
  `NON_US_ADDRESS` → `"Bank accounts can only be added for U.S. addresses."` else
  `"A U.S. address must be confirmed…"`. Applied on: WIO create (`WioController.cs:722`), WIO
  manual (`:861`), entity manual (`:2373`), operator create/manual
  (`OperatorController.cs:1528,1832`), Moov passthrough create (`MoovController.cs:1167`).
- Frontend mirror: `isBankAccountAddSupported` (`src/utils/bank_account_eligibility.ts:7`) =
  `isSupported !== false`; unsupported → `UsAddressRequiredNotice` + disabled Add button
  (`US_ADDRESS_REQUIRED_MESSAGE`). Public-page advisory variant
  (`BankAccountEligibilityDto`) is optimistic (unknown ⇒ supported),
  `SupportedCountryCodes=["US"]`.

### 8.2 Onboarding/approval gates — frontend (`src/pages/banking.tsx`)

- `canManageBankAccounts` (`:54`) =
  `isDirectEntry || (entity ? isEntityBankingEligible : isWioBankingEligible)` — eligibility
  from KYB status (`isKybPaymentAccountReady`, `hasExternalAccount === true`,
  `isBackendSectionComplete(businessProfileStatus)`, `:48`).
- Gate cards (`:63-87`): Business-Profile gate → Payment-Account gate → Onboarding gate.
- **Moov approval gate**: `isBankingAccountApproved(user)`
  (`src/utils/moov/status_logic.ts:63`) = `pendingCapabilities.length === 0`. Applied only for
  Moov and only when `isPendingCapabilitiesDefined` (`banking.tsx:96-99`); direct-entry always
  approved. Unapproved non-entity WIO → `BankingApprovalGuard`
  (`banking_approval_guard.tsx:85`): `pending`/`in-review` → "Account Under Review",
  `disabled` → "Action Required", rejected/terminated → "Account Action Required". Aggregate
  priority `disabled:0 < pending:1 < in-review:2 < enabled:3` (`status_logic.ts:20`).
- Add-permission: WIO `canAddBankAccount` (`bank_accounts_card.tsx:407`) =
  `wioId && activePartnerDetail && role !== 'viewer' && isBankAddSupported`. Operator
  (`use_operator_banking.ts:596`) = `operatorId && moovAccountId && isBankAddSupported`.
  Operator-detail page: Plaid needs `moovAccountId`; manual needs
  `isDirectEntry || paymentAccountId/moovAccountId` (`operator_bank_accounts.tsx:308-309`).
- Setup guide: banking step clickable when `isOnboarded || canProceedToBanking` (KYB complete
  allows entry even while Moov review is pending, `setup_guide.tsx:268-283`).

---

## 9. Payment methods beyond bank accounts

- **Selection (cards/ach/wire/rtp)** is KYB configuration, not instrument CRUD:
  `MOOV_PAYMENT_METHODS` (cards, ach, wire, rtp) vs `COLUMN_PAYMENT_METHODS` (ach, wire)
  (`src/operator/constants/payment_methods.ts`). Status derivation
  (`src/operator/constants/banking.ts:134,151`) →
  `PaymentMethodStatus = 'available' | 'pending' | 'not-eligible'`. Selection drives which KYB
  sections appear and whether a bank is needed (`needsBank = ach||rtp||wire`,
  `use_operator_banking.ts:415-437`); methods lock once sections complete (`:461`).
- **Cards/wallets** exist only as Moov payment-method read/delete via the embeddable API
  (§3.7) — `PaymentMethodDto` covers `moov-wallet` (`WalletDto`), bank, `CardDto`,
  `ApplePayDto` (`MoovBankAccountDTOs.cs:227-449`). No local card/wallet table, no dedicated
  CRUD UI.
- `PaymentMethodController` (`api/payment-methods`) is **Auto Pay settings/logs only** — not
  instrument CRUD.

---

## 10. Refresh, errors, edge cases (frontend behaviors to reproduce)

- **No polling.** SWR with `keepPreviousData`. After mutations:
  `globalMutate(*.bankAccountsFilter(...))` + dashboard activities + `refreshSession({silent:true})`.
  Operator set-default/delete deliberately **exclude** `bank-accounts` keys from broad
  revalidation to preserve optimistic cache (`operators/hooks.ts:200-208,232-240`).
- Loading skeletons; error banner `"Failed to load bank accounts. Please try again later."`
  (`bank_accounts_card.tsx:474`); `shouldDeferErrorPresentation` hides transient revalidate
  errors (`:423`).
- Plaid: stale-closure guard via refs; imperative API avoids StrictMode double-mount;
  `plaid_exit` without error → silent.
- Account-number display: fixed 4-bullet mask, never leaks length
  (`bank_account_display.ts:76`); `displayBankName` falls back to routing lookup when provider
  returns null bank name (Column does) (`:23`).
- Deprecated shapes kept for reference: `src/types/legacy_bank.ts`, `src/types/wio.ts:72`
  (`MoovBankAccount*`), `useWioMoovBankAccounts` (`wios/hooks.ts:87`).

---

## 11. Configuration

| Key | Value / effect |
|---|---|
| `PaymentPlatform:ActiveProvider` | default `Column` (`PaymentPlatformSettings.cs:14`); per-request override via `RegisterCounterpartyRequest.Provider`. Also: `DefaultEntryClassCode="CCD"`, `DefaultCurrencyCode="USD"`, `AutoInitiateCreditOnDebitSettlement=true`, `MaxRetryAttempts=3`, `TimeoutSeconds=30` |
| `Moov` | `PublicKey/SecretKey`, `ApiBaseUrl/Origin="https://api.moov.io"`, `ApiVersion="v2026.04.00"`, `PartnerAccountId`, `TimeoutSeconds=30`, fee-plan settings (see ONBOARDING_SPEC §11) |
| `Plaid` | `ClientId/Secret`, `ApiBaseUrl="https://sandbox.plaid.com"`, `Environment="sandbox"`, `TimeoutSeconds=30`, `WebhookUrl?/WebhookSecret?`; `CrossProcessorRegistration { Enabled=false, EnabledProcessors[], EnableTanDeduplication=true, EnableWebhookReRegistration=false }` |
| `Column` | `ColumnSettings` — API keys/URL |
| Frontend | `BANKING_ACCOUNT_APPROVED` (dev-local only — simulate approval); Plaid script from `cdn.plaid.com`; Moov scripts per ONBOARDING_SPEC §4.3 |

---

## 12. Implementer warnings

1. **The critical delete/default guards live in the frontend only** (can't delete
   default/last, Auto Pay guard). Any new client must reimplement them; the backend will
   happily hard-delete a default account.
2. **Hard delete, no soft delete** — `BankAccounts` rows are gone on DELETE; only the
   provider-layer counterparty delete sets `CounterpartyStatus.Deleted`.
3. **WIO-scoped rows store `EntityId = Partner.Id`**, not the WIO id (with
   `EntityType=Wio`). Query accordingly.
4. **Sensitive/display data lives in `Metadata` JSON** — there are no routing/account/bank
   columns; `BankAccountDto.AccountNumber` is last-4 only.
5. **Operator bank endpoints are embeddable-key reachable** (`[AllowAnonymous][EmbeddableAuth]`);
   WIO bank CRUD relies on the global authenticated-user policy with no per-action attribute.
6. **Verification is Moov-only**: Column verify endpoints are no-ops; Plaid accounts are born
   verified; the frontend hides Verify for non-Moov providers.
7. **Verification code contract**: UI enforces `MV####`; backend accepts 4 digits with
   optional `MV` prefix; the code is the two micro-deposit amounts concatenated.
8. **Webhook sync is deliberately non-destructive** — it never deletes local rows and
   preserves `IsVerified`/`IsDefault`/`Metadata`; don't "fix" that without understanding the
   public-payment race it protects against.
9. **First account auto-promotes to default** server-side (`CreateAsync:243-257`).
10. **Eligibility is enforced server-side as 422** with codes
    `NON_US_ADDRESS`/`ADDRESS_NOT_SET`; the frontend gate is advisory UX.
11. **Three divergent manual-entry validators** exist in the frontend (§4.3) — the canonical
    one is `bank_account_validation.ts` (ABA checksum, 4–20 digits); the operator legacy modal
    (4–17 + confirm field) and entity link modal (no checksum) differ.
12. **Additional direct-entry provider implementations may be unavailable.** Cross-processor
    Plaid fan-out is behind `CrossProcessorRegistration.Enabled=false`.
13. **Duplicate manual add returns 409** `"This bank account is already registered."` — keyed
    on provider `ExternalId` (unique constraint), so the same real-world account re-linked via
    a different provider is not a duplicate.
14. **`initiate-verification` endpoints are currently dead from the UI** (auto-initiated on
    create); keep them — they're the retry path if deposits expire.

---

## 13. Key file index

### bison-jib-web-flow
- Pages/gates: `src/pages/banking.tsx`, `src/components/banking/banking_approval_guard.tsx`,
  `src/operator/pages/banking.tsx`, `src/pages/operator_detail.tsx`
- Components: `src/components/banking/{bank_accounts_card,bank_account_section,bank_account_row,manual_bank_entry_form,bank_connection_method_selector,bank_verification_dialog,bank_verification_badge}.tsx`,
  `src/components/operators/{operator_bank_accounts,manual_bank_account_modal,operator_bank_account_embed}.tsx`,
  `src/components/entities/link_bank_account_modal.tsx`,
  `src/operator/components/banking/bank_account_tab.tsx`
- Hooks: `src/hooks/use_plaid_link.ts`, `src/hooks/use_banking.ts` (OTP flows),
  `src/operator/hooks/use_operator_banking.ts`
- API: `src/swr/wios/{api,hooks,keys}.ts`, `src/swr/entities/{api,hooks,keys}.ts`,
  `src/swr/operators/{api,hooks}.ts`, `src/swr/plaid/{api,hooks}.ts`, `src/swr/pay/api.ts`,
  `src/swr/payments/api.ts`, `src/api/endpoints.ts`
- Validation/util: `src/utils/bank_account_validation.ts`,
  `src/utils/bank_account_eligibility.ts`, `src/utils/bank_account_holder_type.ts`,
  `src/utils/bank_account_display.ts`, `src/utils/moov/status_logic.ts`
- Types: `src/types/bank_account.ts`, `src/types/manual_bank_account.ts`,
  `src/types/plaid.ts`, `src/types/statements.ts:233-377`

### bison-jib-pay-api
- Controllers: `WioController.cs` (WIO + entity bank CRUD),
  `OperatorController.cs` (operator bank CRUD), `PlaidController.cs`,
  `PaymentController.cs` (counterparties), `MoovController.cs` (obsolete passthrough),
  `EmbeddableController.cs` (payment methods, card delete)
- Orchestration: `WioOrchestrator.cs` (`CreateBankAccountAsync:361`,
  `UpdateBankAccountAsync:433`, `DeleteBankAccountAsync:499`),
  `Features/BisonJibPay.PaymentPlatform/.../PaymentPlatformOrchestrator.cs`,
  `Features/BisonJibPay.Plaid/Infrastructure/Services/PlaidOrchestrationService.cs`
- Providers: `MoovPaymentPlatformProvider.cs`, `ColumnPaymentPlatformProvider.cs`,
  `PaymentPlatformProviderFactory.cs`,
  `Features/BisonJibPay.Moov/.../MoovBankAccountService.cs`
- Persistence: `Features/BisonJibPay.PaymentPlatform/Domain/Entities/BankAccount.cs`,
  `PaymentCounterpartyRepository.cs` (`SetDefaultAsync:359`, `CreateAsync:243`,
  `DeleteAsync:404`), migration `075_ConsolidateBankAccountsTables.sql`
- Webhooks: `MoovWebhookService.cs` (`ProcessBankWebhookAsync:346`),
  `Features/BisonJibPay.Sync/Infrastructure/Services/BankAccountWebhookHandler.cs`
- Eligibility: `Common/BisonJibPay.Persistence.Domain/DTOs/BankAccountEligibilityStatusDto.cs`,
  `Features/BisonJibPay.Sync/Infrastructure/Services/KybEntityResolver.cs:128`,
  `BisonJibPay.API/Extensions/BankAccountEligibilityGuard.cs`
- Config: `MoovSettings.cs`, `PlaidSettings.cs`, `PaymentPlatformSettings.cs`,
  `ColumnSettings.cs`
