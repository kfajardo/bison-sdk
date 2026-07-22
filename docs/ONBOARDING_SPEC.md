# Bison Onboarding — Implementation Spec

Current-state specification of the Bison JIB Pay onboarding flow: frontend (`bison-jib-web-flow`),
backend (`bison-jib-pay-api`), and the Moov KYB provider integration between them. Written so an
implementer (human or AI) can rebuild, extend, or port the flow from this document alone. All
file references are repo-relative; enum values, routes, and validation rules are quoted verbatim
from source as of 2026-07-20.

---

## 1. What "onboarding" is here

Onboarding = **KYB/KYC verification against Moov** (Moov business account + representatives +
capabilities), plus the adjacent flows that create the users/entities being onboarded
(registration, invitations, Enverus SSO provisioning).

**Provider reality check:**

- The active KYB provider is **Moov**. `KybSettings.ActiveProvider` defaults to `"Moov"`
  (`Features/BisonJibPay.Kyb/Domain/Configuration/KybSettings.cs:5`) and no appsettings override
  exists. Only one provider is registered: `MoovKybProvider`
  (`Features/BisonJibPay.Kyb/Infrastructure/Extensions/KybServiceExtensions.cs:22`).
- There is **no Stripe Connect** integration. Moov account creation is the Stripe-Connect
  equivalent.
- `CONTEXT.md` in the API repo describes a Moov → Column migration where Column requires no
  KYB for WIOs/Operators. That is **aspirational for KYB** — the live onboarding endpoints below
  call Moov. `ProviderMigration:EnableStartupMigration` and `EnableLoginMigration` are `false`.
  Direct-entry providers already **bypass** KYB on the frontend (§4.1).
- `FRONTEND_BACKEND_ANALYSIS.md` (Finix/Stripe references) is **stale** — ignore it.
- `docs/FE_KYB_ONBOARDING_GUIDE.md` and `CAPABILITY_STATUS_FRONTEND_GUIDE.md` in the API repo
  are current and match code.

### Entities being onboarded

| Entity | Meaning | KYB surface |
|---|---|---|
| **WIO** | Working-interest owner company (the primary self-service user) | WIO dashboard accordion (v4) |
| **Entity** (sub-entity of a WIO) | Additional legal entity under a WIO | Same v4 accordion, entity-scoped endpoints |
| **Operator** | Oil & gas operator company | Operator portal verification screens |

---

## 2. Architecture overview

```
Frontend (React/Vite/TS, SWR, Zod, react-hook-form)
  └─ POST/GET /api/{wios|operators}/{id}/kyb/*  ── Bearer JWT (WIO) / JWT or X-Embeddable-Key (Operator)
       └─ .NET API  ──  KybOnboardingOrchestrator (entityType "Wio" | "Operator")
            └─ IKybProvider → MoovKybProvider → Moov REST API (v2026.04.00)
       └─ POST /api/webhooks/moov  ←  Moov capability/underwriting/bankAccount events
            └─ MoovAccountCapability rows → /kyb/status + /api/auth/me pendingCapabilities
```

- All API responses use envelope `{ success, message, data }`. The frontend client
  (`src/api/client.ts`) auto-unwraps `data` and throws `ApiError` when `success=false`.
- Frontend base URL from `VITE_API_BASE_URL_{DEV,LOCAL,QA,UAT,PRODUCTION}` keyed by
  `VITE_APP_ENV`/`MODE` (`src/api/transport.ts:4-12`).
- Auth: `Authorization: Bearer {token}` on every call (`transport.ts:35-72`). 401 →
  `handleExpiredSession()` → logout (exceptions: `/me`, `/api/saml/auth-request`). File
  uploads send auth header only, no explicit Content-Type (`client.ts:91-95`).
- Backend auth: `SmartAuth` policy scheme — JWT Bearer (HS256) if `Authorization: Bearer`
  present, else Supabase cookie session (`Program.cs:190-194`).

---

## 3. Frontend surfaces

Four implementations exist; **one is primary**. All share the same Zod schemas
(`src/operator/components/verification/validation.ts` — the single source of validation truth),
endpoints, and capability logic.

| Surface | Entry | Endpoints | Status |
|---|---|---|---|
| **v4 accordion** (`OnboardingView`, `src/components/onboarding/onboarding_v4.tsx` → `OnboardingAccordion`) | Rendered inline on WIO dashboard | `/api/wios/{id}/kyb/*` or `/api/wios/{wioId}/entities/{entityId}/kyb/*` | **ACTIVE — primary** (`src/pages/dashboard.tsx:340`) |
| v3 stepper modal (`OnboardingV3Modal`, `onboarding_v3.tsx`) | Setup guide | same wio-kyb endpoints | **Dormant** — `setup_guide.tsx:60` hardcodes `const useV3 = false`; `ENABLE_ONBOARDING_V3` flag was removed |
| v2 wizard modal (`ProfileSetupModal`, `onboarding_v2.tsx`, 9 steps) | Setup guide fallback (`setup_guide.tsx:478`) | legacy | Active fallback path when `useV3=false` |
| Operator verification (`VerificationProvider`, `src/operator/contexts/verification_context.tsx` + `src/operator/components/verification/*`) | `/operator` layout (`src/operator/layout/operator_layout.tsx:118`) | `/api/operators/{operatorId}/kyb/*` | **ACTIVE** (gated by `ENABLE_OPERATOR_PORTAL`) |

`src/components/onboarding/validation.ts` (step1–9 schemas) belongs to the dormant v2 wizard
only — do not use it for new work.

### 3.1 Routing & entry gating

- Onboarding is **not a route** — it renders inline on dashboards. Top-level routes:
  `src/app.tsx:29-48` (`/` → `/login`), `src/routes/main_app_routes.tsx:27-66`
  (`/wio` → `ProtectedRoute` → `AppLayout` → `Dashboard`), `src/routes/operator_routes.tsx:22-55`
  (`/operator` → `EnvGuard(ENABLE_OPERATOR_PORTAL)` → `OperatorProtectedRoute`).
- WIO dashboard gate (`src/pages/dashboard.tsx:305-347`): entity scope shows `<OnboardingView/>`
  while `!sectionsDone`, where
  `sectionsDone = areRequiredKybSectionsComplete(status) && hasDocuments && hasExternalAccount`.
- Setup-guide gating (`src/hooks/use_setup_guide_state.ts`):
  `isOnboarded = isDirectEntry || user.isOnboarded`. **Direct-entry providers
  skip KYB onboarding entirely** (`:18-21`); only Moov requires it (`:22`).

### 3.2 Section/step order

v4 accordion (`src/components/onboarding/onboarding_sections.ts:74-105`, `kybSections`):

1. `business` — Business Information
2. `officer` — Control Officer
3. `owners` — Beneficial Owners
4. `volume` — Processing Volume
5. `docs` — Documents

A `banking` section is defined but excluded from WIO onboarding
(`onboarding_accordion.tsx:168`: `visibleSections = kybSections`).

v3 modal used the same 5 steps (`v3_constants.ts:23-64`, `V3_TOTAL_STEPS=5`) with status fields
`businessProfileStatus / controlOfficerStatus / beneficialOwnersStatus / processingVolumeStatus`
(docs derived from document count).

### 3.3 Navigation / locking rules (v4, `onboarding_accordion.tsx`)

- **Lock rule** (`isSectionLocked`, `:162-165`): every section except `business` is locked until
  business is complete. `isBusinessComplete` (`:96-101`) = backend business status is countable
  or `action_required`, OR locally saved this session.
- **Auto-open** (`autoOpenTarget`, `:188-203`): first section with capability errors, else first
  incomplete unlocked section. On save, open next incomplete section and scroll to it
  (`handleSectionSave`, `:231-266`).
- Field counts drive `in_progress` vs `not_started` when the backend has no status yet
  (`fieldCounts`, `:103-109`; totals: business 11, officer 11, owners 0, volume 3, docs 1).
- v3 guard (dormant): steps >0 required `hasExternalAccount` unless `bypassAccountGuard`; the
  business save creates the Moov account then advances with `bypassAccountGuard=true`
  (`v3_context.tsx:140-148`, `business_profile_step.tsx:428`).
- **Lock cascade**: sections lock once beneficial owners are submitted to Moov
  (`src/utils/onboarding_status.ts:254-278`, `isSectionLockable`). Per-field editability after
  lock comes from Moov capability requirements (§8.3).

### 3.4 Frontend state management

- **v4**: `KybScopeContext` (`src/components/onboarding/kyb_scope.ts`) carries
  `{ wioId, entityId }` (falls back to `user.wioId`). Accordion holds local `statuses`,
  `localCompletedSections`, `fieldCounts`, `openIndex`. Backend truth via SWR
  `useScopedKybStatus`; status derivation in `src/utils/onboarding_status.ts`.
- **v3 drafts** (dormant): sessionStorage key `v3-draft-{wioId}-{stepKey}` auto-saved when form
  dirty, overlaid on backend hydration, cleared on complete/discard (`use_v3_draft.ts`).
- **v2 drafts**: sessionStorage `jibpay_profile_setup_data_{userId}` /
  `jibpay_profile_setup_step_{userId}` (`constants.ts:114-129`).
- **Operator**: `VerificationProvider` holds save state, `manualStatuses`, `tosToken`,
  `moovAccountId`, `isProfileLocked`; payment methods persisted to localStorage
  (`PAYMENT_METHODS_STORAGE_KEY`) AND `PUT /api/operators/{id}` (`verification_context.tsx:239-261`).
- **No polling / websockets.** Capability state refetches on mutation via SWR
  `mutate`/`refreshStatus`. Session-level pending capabilities also arrive on
  `user.pendingCapabilities` from `/api/auth/me`.

---

## 4. API contract (frontend ↔ backend)

### 4.1 KYB endpoints

WIO scope (frontend `src/swr/wio-kyb/api.ts`; backend `WioController.cs`, entityType `"Wio"`,
auth `[AuthorizeOrSuperAdmin]` = JWT only). Entity scope mirrors these at
`/api/wios/{wioId}/entities/{entityId}/kyb/*` (frontend `src/swr/entity-kyb/*`). Operator scope
mirrors them at `/api/operators/{operatorId}/kyb/*` (frontend `src/swr/operators/kyb_api.ts`;
backend `OperatorController.cs`, entityType `"Operator"`) — operator KYB endpoints are each
marked `[AllowAnonymous] [EmbeddableAuth]`, so they accept **JWT or `X-Embeddable-Key` header**
(embeddable key skipped if JWT already authenticated).

| Method | Route | Request | Response `data` | Backend handler |
|---|---|---|---|---|
| GET | `/api/wios/{id}/kyb/status` | — | `KybOnboardingStatusResponse` (§4.2) | `WioController.cs:1580` / `OperatorController.cs:2324` |
| POST | `/api/wios/{id}/kyb/business-profile` | `KybBusinessProfileRequest` (§5.1) | `KybBusinessProfileResult` | `:1593` / `:2338` |
| GET | `/api/wios/{id}/kyb/business-profile` | — | `KybBusinessProfileResult \| null` (`taxIdProvided` bool; EIN never returned) | `:1607` / `:2353` |
| POST | `/api/wios/{id}/kyb/control-officer?existingRepresentativeId=` | `KybRepresentativeRequest` (§5.2) | `KybRepresentativeResult` | `:1620` / `:2367` |
| GET | `/api/wios/{id}/kyb/control-officer` | — | `KybRepresentativeResult \| null` | `:1637` / `:2385` |
| POST | `/api/wios/{id}/kyb/beneficial-owners?noOwnersAbove25=&existingMappingsJson=` | `List<KybBeneficialOwnerRequest>` (§5.3) | `KybBeneficialOwnersResult` | `:1650` / `:2399` |
| GET | `/api/wios/{id}/kyb/beneficial-owners` | — | `List<KybRepresentativeResult>` | `:1675` / `:2425` |
| POST | `/api/wios/{id}/kyb/processing-volume` | `KybProcessingVolumeRequest` (§5.4) | `KybProcessingVolumeResult` | `:1688` / `:2439` |
| GET | `/api/wios/{id}/kyb/processing-volume` | — | `KybProcessingVolumeResult \| null` | `:1702` / `:2454` |
| POST | `/api/wios/{id}/kyb/documents` | multipart: `file`, `purpose` (default `merchant_underwriting`), `metadata?` | `KybDocumentUploadResult` | `:1715` / `:2468` |
| GET | `/api/wios/{id}/kyb/documents` | — | `List<KybDocumentInfo>` | `:1743` / `:2484` |
| POST | `/api/wios/{id}/kyb/payment-method-capabilities` | `SavePaymentMethodCapabilitiesRequest` (§5.5) | `PaymentMethodCapabilitiesResponse` | `:1757` / `:2499` |
| GET | `/api/wios/{id}/kyb/payment-method-capabilities` | — | `PaymentMethodCapabilitiesResponse` | `:1772` / `:2515` |
| GET | `/api/wios/kyb/industries` | — | `MoovIndustriesResponse` (`.industries`: `MoovIndustryDto[]`) | `:1786` / `:2530` |
| POST | `/api/wios/{id}/kyb/create-account` | `{ tosToken }` | `{ success, moovAccountId?, errorMessage? }` | wio-kyb `api.ts:438-446` |
| POST | `/api/operators/{operatorId}/moov-account` | `CreateOperatorMoovAccountRequest` (`{ TosToken }`) | `MoovAccountCreationResult` (201/400/404/409/422/500) | `OperatorController.cs:2557` (JWT only) |
| POST | `/api/operators/{operatorId}/moov-business-account` | — | Moov account creation (operator FE path) | operators `kyb_api.ts:38` |

Side effect: **WIO document upload sets `Wio.IsOnboarded = true`** on success
(`WioController.cs:1727`, `UpdateOnboardingStatusAsync`).

Entity-scoped account creation uses `entityApi.onboardEntity` (`src/swr/kyb-scope/hooks.ts:174`).

### 4.2 `KybOnboardingStatusResponse` (`Features/BisonJibPay.Operators/Domain/DTOs/KybOnboardingDTOs.cs:94`)

```
EntityId, EntityType,
BusinessProfileStatus, ControlOfficerStatus, BeneficialOwnersStatus, ProcessingVolumeStatus,
    // each: KybSectionStatus serialized as "NotStarted" | "InProgress" | "Completed"
IsComplete: bool,                       // all 4 sections Completed
BankAccountEligibility: BankAccountEligibilityStatusDto,
HasExternalAccount: bool,
Capabilities: List<KybCapabilityStatus>?,   // { name, status, disabledReason?, currentlyDue?: string[], errors?: {requirement, errorCode, reason?}[] }
IsProfileLocked: bool?,                 // all capabilities enabled
IsKybReady: bool?,                      // required caps enabled, no currentlyDue/errors
VerificationStatus: string?,            // "verified" | "pending" | "action-required"
Documents: List<KybDocumentInfo>?,
SelectedPaymentMethods: List<string>?,
ControlOfficerRepresentativeId: string?,
OwnerRepresentativeIds: List<string>?
```

### 4.3 Moov helper endpoints (frontend `src/swr/moov/api.ts`)

| Method | Route | Returns |
|---|---|---|
| POST | `/api/moov/tos-token` | `{ accessToken }` → string (Moov terms-of-service token) |
| GET | `/api/moov/enrichment/address?search=&maxResults=&…` | `AddressSuggestion[]` (autocomplete) |
| GET | `/api/moov/account` | `MoovRetrieveAccountResponse` (edit-mode prefill) |
| GET | `/api/moov/representatives` | `MoovRepresentativeResponse[]` |
| GET | `/api/moov/fee-plan-agreements` | `MoovFeePlanAgreement[]` |

ToS token flow: the Moov `<moov-terms-of-service>` Drop (loaded from
`web-components-moov@2.4.4` + `https://js.moov.io/v1`, `src/hooks/use_moov_scripts.ts:7-12`)
emits a token once the user checks the ToS checkbox
(`business_information_section.tsx:104-120`); it is sent as `tosToken` in the business-profile
POST or create-account call.

---

## 5. Validation spec

Two layers. The **frontend Zod schemas are the strict layer** (formats, cross-field rules); the
backend uses looser DataAnnotations (lengths, required). An implementer must reproduce the
frontend rules to match UX behavior, and must not rely on the backend to catch format errors.

### 5.0 Shared frontend constants (`src/utils/validation/payment_provider.ts:5-6`)

```
PAYMENT_PROVIDER_ALLOWED_CHARS = /^[a-zA-Z0-9 .,'&#/()!@+:;-]*$/
PAYMENT_PROVIDER_CHAR_ERROR = "Contains characters not allowed by our payment provider. Use only letters, numbers, spaces, and common punctuation (. , ' - & # / !)"
PO_BOX_REGEX = /^\s*(?:p\.?\s*o\.?\s*b(?:ox)?|post\s+office\s+box)\s*\d*/i   // validation.ts:45
digitsOnly(value)        = value.replace(/\D/g, '')
collapseWhitespace(value)= value.trim().replace(/\s+/g, ' ')
```

Authoritative schema file: `src/operator/components/verification/validation.ts` (shared by v3,
v4, and operator surfaces).

### 5.1 Business profile

Frontend `operatorBusinessProfileSchema` (`validation.ts:171-287`):

| Field | Req | Rule |
|---|---|---|
| `legalBusinessName` | ✔ | trim, min 1 `'Required'`, max 64, ALLOWED_CHARS |
| `doingBusinessAs` | ✖ | ≤64, ALLOWED_CHARS |
| `ein` | ✔ | `/^\d{2}-\d{7}$/` `'Must be in format XX-XXXXXXX'` |
| `businessType` | ✔ | must be in `BUSINESS_TYPES` `'Invalid business type'` |
| `industry` | ✔ | min 1 `'Required'` |
| `description` | ✔ | trim, min 10 `'Must be at least 10 characters'`, max 100 |
| `website` | ✖ | valid URL http/https, or empty |
| `phone` | ✔ | `digitsOnly` length === 10 `'Must be 10 digits'` |
| `email` | ✔ | `.email('Invalid email address')` |
| `addressLine1` | ✔ | trim, min 1, max 60, ALLOWED_CHARS, not a PO Box |
| `addressLine2` | ✖ | ≤60, ALLOWED_CHARS |
| `city` | ✔ | trim, min 1, max 32, ALLOWED_CHARS |
| `state` | ✔ | min 1; superRefine: US → must be valid US state |
| `country` | ✔ | min 1; normalized; must be United States |
| `zipCode` | ✔ | min 1; superRefine: US → `digitsOnly` === 5 `'Must be 5 digits'` |

Business type values (accepted by Moov; not enum-enforced backend-side):
`soleProprietorship, unincorporatedAssociation, trust, publicCorporation, privateCorporation,
llc, partnership, unincorporatedNonProfit, incorporatedNonProfit, governmentEntity`.

Industry defaults: MCC `5172`, industry `petroleum-products`
(`business_profile_step.tsx:139-140`); industry list from `GET /api/wios/kyb/industries`.

Backend `KybBusinessProfileRequest` (`Features/BisonJibPay.Kyb/Domain/DTOs/KybDTOs.cs:8`):
`LegalBusinessName [Required, StringLength(255)]`, `DoingBusinessAs [StringLength(200)]`,
`BusinessType [Required, StringLength(50)]`, `Ein [StringLength(20)]` (**pass-through, never
stored**), `AddressLine1 [Required, StringLength(500)]`, `AddressLine2 [StringLength(500)]`,
`City [Required, StringLength(100)]`, `State [Required, StringLength(2)]`,
`ZipCode [Required, StringLength(10)]`, `Phone [Required, StringLength(20)]`,
`Email [EmailAddress, StringLength(255)]`, `Website [StringLength(500)]`,
`Description [StringLength(1000)]`, `Industry/IndustryNaics/IndustryMcc/IndustrySic
[StringLength(100/10/10/10)]`, `SelectedPaymentMethods: List<string>?` (`cards, ach, wire, rtp`),
`TosToken: string?`.

### 5.2 Control officer

Frontend `operatorControlOfficerSchema` (`validation.ts:293-360`):

| Field | Req | Rule |
|---|---|---|
| `firstName` / `lastName` | ✔ | trim, min 1, max 64, ALLOWED_CHARS |
| `title` | ✔ | trim, min 1, max 64, ALLOWED_CHARS |
| `email` | ✔ | `.email` |
| `phone` | ✔ | digitsOnly === 10 |
| `dateOfBirth` | ✔ | min 1; age ≥ 18 `'Must be at least 18 years old'` |
| `ssn` | ✔ | `/^\d{3}-\d{2}-\d{4}$/` `'Must be in format XXX-XX-XXXX'` |
| `addressLine1` | ✔ | trim, min 1, max 60, ALLOWED_CHARS, not a PO Box |
| `city` | ✔ | trim, min 1, max 32, ALLOWED_CHARS |
| `state` | ✔ | min 1 |
| `postalCode` | ✔ | digitsOnly === 5 |

Cross-form rule: officer's personal address must **differ from the business address**
(`useBusinessAddressValidator` → `validateAddressNotMatchingBusiness`, `validation.ts:78-86`:
`'Must use a personal address, not the business address'`).

Redacted-resubmit rule: if Moov already holds DOB/SSN (`birthDateProvided` /
`governmentIdProvided` on the GET), the form allows skipping them using placeholders
`2000-01-01` / `000-00-0000` (`control_officer_step.tsx:194-199`). Same pattern for EIN
(`taxIdProvided`, `business_profile_step.tsx:378`).

Backend `KybRepresentativeRequest` (`KybDTOs.cs:78`): `FirstName/LastName [Required,
StringLength(100)]`, `Email [EmailAddress, StringLength(255)]`, `Phone [StringLength(20)]`,
address `[StringLength(500/500/100/2/10)]`, `BirthDay/BirthMonth/BirthYear int?` (no range),
`Ssn string?` (**pass-through, never stored**), `JobTitle [StringLength(100)]`.

### 5.3 Beneficial owners

Frontend `operatorBeneficialOwnerSchema` (`validation.ts:366-435`) — same person fields as
officer, plus:

- `ownershipPercentage`: integer **25–100** — `'Must be a whole number between 25 and 100'`
- `validateOwnershipTotal` (`validation.ts:538-550`): combined total > 100% → error.
- Certification checkbox required (`beneficial_owners_step.tsx:316`): either "no individual owns
  25%+" (owners list empty → POST with `?noOwnersAbove25=true`) or "I have listed all
  individuals owning ≥25%". Mutually exclusive with the opposite state.

Backend `KybBeneficialOwnerRequest` (`KybDTOs.cs:120`): extends representative request +
`OwnershipPercentage int [Range(1, 100)]`. (Note: backend allows 1–100; frontend enforces
25–100 — Moov only requires listing ≥25% owners.)

### 5.4 Processing volume

Frontend `operatorProcessingVolumeSchema` (`validation.ts:441-482`): `averageMonthlyVolume`,
`averageTransactionAmount`, `maxTransactionAmount` — each positive whole number (non-digits
stripped); superRefine: max ≥ avg. Values are **whole dollars**.

Backend `KybProcessingVolumeRequest` (`KybDTOs.cs:126`, `IValidatableObject`):

```
AverageMonthlyTransactionCount   int   [Range(0, int.MaxValue)]
AverageMonthlyDollarVolume       long  [Range(0, long.MaxValue)]      // whole dollars
AverageIndividualTransactionSize long  [Range(0, long.MaxValue)]
MaximumIndividualTransactionSize long? [Range(0, long.MaxValue)]      // default = avg × 10
HasCardPayments                  bool  // derived server-side from SelectedPaymentMethods — do not send
GeographicReach   [Required] regex ^(us-only|us-and-international|international-only)$        default "us-only"
BusinessPresence  [Required] regex ^(commercial-office|home-based|mixed-presence|mobile-business|online-only|retail-storefront)$  default "commercial-office"
PendingLitigation [Required] regex ^(bankruptcy-or-insolvency|consumer-protection-or-class-action|data-breach-or-privacy|employment-or-workplace-disputes|fraud-or-financial-crime|government-enforcement-or-investigation|intellectual-property|none|other|personal-injury-or-medical)$  default "none"
VolumeShareByCustomerType [Required]: { Business, Consumer, P2p } each [Required, Range(0,100)]
    // cross-field (Validate, KybDTOs.cs:195-213): must total exactly 100 —
    // "Volume share by customer type must total 100"
```

### 5.5 Payment method capabilities

`SavePaymentMethodCapabilitiesRequest` (`KybOnboardingDTOs.cs:13`):
`SelectedPaymentMethods List<string> [Required] [MinLength(1, "At least one payment method must
be selected.")]`. Orchestrator rejects values outside `{cards, ach, wire, rtp}`
(`KybOnboardingOrchestrator.cs:843`), normalizes lowercase + dedupes.

### 5.6 Documents (file constraints, frontend)

`src/operator/constants/upload.ts`:

```
MAX_FILE_SIZE = 20 * 1024 * 1024              // 20 MB
ACCEPTED_TYPES = ['application/pdf', 'text/csv', 'image/jpeg', 'image/png']
ACCEPTED_EXTENSIONS = '.pdf,.csv,.jpg,.jpeg,.png'
```

Purposes (`MoovFilePurpose`, `wio-kyb/api.ts:242-248`): `merchant_underwriting |
identity_verification | individual_verification | representative_verification |
account_requirement | business_verification`. Default `merchant_underwriting`.

Backend `KybDocumentUploadRequest` (`KybDTOs.cs:298`): `File IFormFile` (required),
`Purpose string = "merchant_underwriting"`, `Metadata string?`.

---

## 6. Backend logic — `KybOnboardingOrchestrator`

`Features/BisonJibPay.Operators/Infrastructure/Orchestrators/KybOnboardingOrchestrator.cs`.
Shared by WIO and Operator controllers via entityType `"Wio"` | `"Operator"`.

### 6.1 Business profile submit (`SubmitBusinessProfileAsync`, `:51`) — creates the Moov account

- Resolve entity; normalize email (Operator falls back to entity email).
- **First call (no `MoovAccount` row)** → `MoovKybProvider.InitializeAccountAsync`:
  1. ToS token: frontend-provided `TosToken` preferred, else server fetches one.
  2. Build capability list from `SelectedPaymentMethods` (`BuildCapabilities`,
     `MoovKybProvider.cs:1042`).
  3. POST Moov `CreateBusinessAccountAsync` — mode `production`, `ForeignId = operatorId`,
     metadata `tenantId`/`operatorId`. **Industry is NOT sent on create** (set via PATCH on
     later submits, `MoovKybProvider.cs:79-81`). **Capabilities are NOT requested at create** —
     requesting them before representatives exist would 409-lock the account; they are stored on
     the `MoovAccount.Capabilities` JSON column and requested after beneficial owners
     (`:138-150`).
  4. Persist `MoovAccount` row: `MoovAccountType="business"`, `AccountStatus="pending"`,
     `VerificationStatus="unverified"` (`KybOnboardingOrchestrator.cs:113-124`).
  5. Optional fee-plan auto-subscribe when `Moov:EnableAutoFeePlanSubscription=true` +
     `WioFeePlanId` set (`CreateFeePlanAgreementAsync`, non-critical, retries up to
     `FeePlanSubscriptionMaxRetries=3`).
- **Subsequent calls** → `provider.SubmitBusinessProfileAsync(moovAccountId, request)` (PATCH,
  includes industry).
- On success: `UpdateEntityFromBusinessProfileAsync` — copies legal name/phone/email/website/
  description onto the entity and sets `KybBusinessProfileStatus = Completed`.

### 6.2 Control officer (`SubmitControlOfficerAsync`, `:257`)

Requires an existing Moov account (else error `"No KYB provider account found..."`).
Auto-resolves the existing representative ID from `MoovAccount.ControlOfficerRepId` when
`existingRepresentativeId` is not passed (create vs update). On success: section → `Completed`,
persist returned `ExternalRepresentativeId`.

### 6.3 Beneficial owners (`SubmitBeneficialOwnersAsync`, `:337`)

Auto-resolves existing owner rep IDs from `MoovAccount.OwnerRepIds` (JSON). Loads the deferred
capability list from `MoovAccount.Capabilities` and passes it to
`provider.SubmitBeneficialOwnersAsync(..., noOwnersAbove25, deferredCapabilities)` — **this is
where capabilities are actually requested on Moov** (all representatives now exist). Section →
`Completed`; owner rep IDs persisted.

### 6.4 Processing volume (`SubmitProcessingVolumeAsync`, `:464`)

Derives `HasCardPayments` from entity `SelectedPaymentMethods.Contains("cards")`. Calls Moov.
Persists `AverageMonthlyDollarVolume` to the entity column (readback fidelity — Moov returns
ranges, not exact values). Section → `Completed`.

### 6.5 Payment-method capabilities (`SavePaymentMethodCapabilitiesAsync`, `:831`)

Validate ⊂ `{cards,ach,wire,rtp}` → persist JSON to entity → map methods to Moov capabilities →
if a Moov account exists, `RequestCapabilitiesAsync` (non-fatal); otherwise deferred until
account creation. Returns live per-method capability status (synthetic status
`"not_requested"` when no Moov account).

### 6.6 Documents (`UploadDocumentAsync`, `:572`)

Uploads to Moov. WIO controller variant additionally flips `Wio.IsOnboarded = true`.

### 6.7 Status (`GetKybStatusAsync`, `:624`)

- Merges DB section statuses with live Moov `GetProviderStatusAsync` (capabilities, lock,
  verification, documents).
- `IsComplete` = all 4 section statuses `Completed` (`:698`).
- `IsProfileLocked` = all capabilities `enabled`.
- `IsKybReady` = required capabilities (`transfers` + payment-method-mapped) all `enabled` with
  no `currentlyDue`/`errors`.
- Strips satisfied processing-volume requirements from `currentlyDue` when the PV section is
  completed (`:1046`).
- **Self-heal** (`:635-680`): if a `MoovAccount` exists but all 4 section statuses are 0, probes
  Moov (business profile / control officer / beneficial owners) and backfills `Completed`.
  Processing volume is deliberately NOT self-healed (Moov defaults are ambiguous, `:682-688`).

### 6.8 Section status model

`KybSectionStatus` (`Features/BisonJibPay.Kyb/Domain/Enums/KybEnums.cs`):
`NotStarted=0, InProgress=1, Completed=2`. Transitions: each successful section POST flips
`NotStarted → Completed` directly — **`InProgress` is never set by the backend** (frontend
derives "in progress" locally from field counts).

---

## 7. Domain model (backend)

| Entity | Key fields |
|---|---|
| **MoovAccount** (`Features/BisonJibPay.Payments/Domain/Entities/MoovAccount.cs`) | `EntityType` (`User\|Operator\|Wio`), `EntityId`, `MoovAccountId`, `MoovAccountType` (`individual\|business`), `AccountStatus` default `"pending"` (`active,pending,suspended,closed`), `Capabilities` (JSON array of requested capability names — the deferred list), `VerificationStatus` default `"unverified"` (`unverified,pending,verified,failed`), `PrimaryBankAccountId`, `UnderwritingStatus` (`pending,approved,rejected,requires_information`), `UnderwritingCompletedAt`, `ControlOfficerRepId`, `OwnerRepIds` (JSON array) |
| **MoovAccountCapability** | Per-capability status rows, upserted by webhook: `MoovAccountId`, `CapabilityName`, `Status`, `RequestedAt`, `DisabledAt`, `DisabledReason`, `Requirements` (JSON), `MoovEventId`, `UpdatedAt` |
| **Wio** (`Features/BisonJibPay.Sync/Domain/Entities/Wio.cs`, tenant-scoped) | `UserId`, name/email/address, `IsActive` default true, `IsOnboarded` default false, section status ints `KybBusinessProfileStatus / KybControlOfficerStatus / KybBeneficialOwnersStatus / KybProcessingVolumeStatus`, `KybProcessingVolumeAverageMonthlyDollarVolume long?`, `SelectedPaymentMethods` (JSON string). Default tenant `00000000-0000-0000-0000-000000000001` |
| **Operator** (`Features/BisonJibPay.Operators/Domain/Entities/Operator.cs`) | `CompanyName/CompanyCode/OrgNumber/OpOrgId/TaxId`, contact/address, same KYB status ints + `SelectedPaymentMethods`, `LogoUrl`, `IsActive` |
| **EnverusUserLink** (`Features/BisonJibPay.Sync/Domain/Entities/EnverusUserLink.cs`) | `EnverusUserId` (SAML nameidentifier), `ClientUserId` (EnergyLink externalClientId), `Status` default `"Pending"` (`Pending, Processed, Failed`, plus `"Linked"` set by connect-energylink), `WioId?`, `ProcessedAt`, `ErrorMessage`, `SamlCallbackResponse` |
| **User** (`Features/BisonJibPay.Authentication/Domain/Entities/User.cs`) | `PasswordResetToken`/`PasswordResetExpiry` (doubles as set-password invite token, 24 h), `SupabaseUserId` |
| **WebhookEvent** | `EventId`, `EventType`, `Source` (`"MOOV"`), `ResourceId/Type`, `RawPayload`, `Status` (`Received, Processed, Failed, Retry`), `RetryCount` |
| **WioUser** | WIO ↔ User many-to-many junction |

---

## 8. Capability & verification status model

### 8.1 Enum values

- Moov capability status: `enabled | pending | in-review | disabled`; synthetic
  `not_requested` when no Moov account exists.
- `VerificationStatus` on status response: `verified | pending | action-required`.
- `UnderwritingStatus`: `pending | approved | rejected | requires_information`.
- Frontend normalized section status (`v3_types.ts:9-15`):
  `not_started | in_progress | complete | submitted | pending_review | verified`; v4 adds
  `action_required | document_requested | not_required` (`onboarding_sections.ts:24-33`).
  `normalizeStatus` (`v3_constants.ts:73-83`) maps backend
  `notstarted/inprogress/completed/submitted/pending_review/verified`; "done" =
  `['complete','submitted','pending_review','verified']` (`:86-88`). Operator "verified" set:
  `OPERATOR_VERIFIED_SECTION_STATUSES = ['complete','verified']`
  (`verification_status.ts:5`).

### 8.2 Frontend aggregate capability logic (`src/utils/moov/status_logic.ts`)

- Priority (worst wins): `disabled:0, pending:1, in-review:2, enabled:3` →
  `getAggregateCapabilityStatus`.
- `isAwaitingApproval(user)` = `user.pendingCapabilities.length > 0` (`:59-61`).
- Aggregate → setup-guide copy (`setup_guide.tsx:184-201`): `disabled` = "Action required",
  `in-review` = "under review", `pending`/default = "awaiting approval… 1–2 business days".
- KYB-ready gate (`verification_status.ts:90-109`): required capabilities = `transfers` +
  (`collect-funds`/`send-funds` per selected payment methods, `:119-140`) — all must be
  `enabled` with zero `currentlyDue` and zero `errors`.

### 8.3 Requirement → section/field mapping (`src/utils/moov/section_mapping.ts`)

- `REQUIREMENT_SECTION_MAP` (`:128-199`): ~50 Moov requirement keys →
  `business/officer/owners/volume/bank/docs`. Prefix fallbacks
  (`getSectionForRequirement`, `:204-212`): `document.*`→docs, `underwriting.*`→volume,
  `bank-accounts.*`→bank, default business. UUID-aware representative resolution:
  `getSectionForRequirementWithReps` (`:226-245`).
- `mapCapabilitiesToSectionIssues` (`:261-312`): `currentlyDue` → warning issue, `errors` →
  error issue, `disabledReason` → error on business. Issue shape:
  `{ title: 'Action Required'|'Missing Information', body, actionLabel: 'Fix now', severity }`.
- Per-field unlock after profile lock: `getEditableBusinessFields` /
  `getEditableRepresentativeFields` (`:432-473`) — only fields named in requirement errors
  become editable. `extractRepresentativeErrors` (`:328-385`).
- Effective status overlay (`onboarding_status.ts:372-392`, `deriveEffectiveStatus`): only
  `severity==='error'` bumps a section to `action_required`; readOnly+complete → `verified`.
- Document statuses → section status (`onboarding_status.ts:196-217`, `deriveBackendStatuses`):
  all `approved` → complete; any `rejected` → `action_required`; else `pending_review`.

### 8.4 Moov webhook (`POST /api/webhooks/moov`)

`BisonJibPay.API/Controllers/WebhookController.cs:104` +
`Features/BisonJibPay.Payments/Infrastructure/Services/MoovWebhookService.cs`.

- Anonymous route. **HMAC-SHA512** signature over headers
  `X-Signature, X-Timestamp, X-Nonce, X-Webhook-ID` with secret `Moov:WebhookSigningSecret`.
  Missing signature → 401; missing timestamp/nonce/webhookId → 400. Timestamp window
  `SignatureTimeoutMinutes=5`. Validation gated by `Webhook:Moov:EnableSignatureValidation`.
- **Idempotency**: dedupe on payload `EventID` + source `MOOV`. Already `Processed` → 200
  duplicate-ack. `Failed`/`Retry` → claim-for-retry or 503. Unknown errors return 200 to
  suppress Moov retries (`:337`).
- Allowed event types (`Webhook:Moov:AllowedEventTypes`): `transfer.updated,
  underwriting.updated, capability.requested, capability.updated, bankAccount.created,
  bankAccount.updated, bankAccount.deleted`.
- Capability handler (`MoovWebhookService.cs:142`): status = `"pending"` on
  `capability.requested`, else payload `Status`. Non-enabled statuses are enriched via Moov
  `GetCapabilityAsync` → `disabledReason` + `requirements` JSON. Upserts
  `MoovAccountCapability`. On `capability.updated` for `collect-funds` →
  `UpdateUnderwritingFromCapabilityAsync`: `enabled→approved`, `pending→pending`, else
  `rejected`; sets `MoovAccount.UnderwritingStatus` (+`UnderwritingCompletedAt` on approved).
- These rows feed `/api/auth/me` → `pendingCapabilities`
  (`AuthOrchestrator.GetPendingCapabilitiesAsync`, `:1170`) and `/kyb/status.capabilities`.
- There is **no push to the frontend** — UI picks changes up on next SWR revalidation.

---

## 9. Adjacent onboarding flows

### 9.1 Registration (`POST /api/auth/register`, `AuthController.cs:198`, anonymous)

`RegisterRequest` (`AuthenticationDTOs.cs:58`): `Email [Required][EmailAddress]`,
`Password [Required][MinLength(8, "...at least 8 characters long")]`,
`ConfirmPassword [Required][Compare("Password","Passwords do not match")]`,
`FirstName/LastName [Required]`, `PhoneNumber?`, `CompanyName?` (required at runtime for
operator registration → 400 `COMPANY_REQUIRED`), `RoleId?`, `RoleName?` (e.g. `"Operator"`),
`AutoCreateUser=true`.

Logic: operator-vs-WIO decided by `RoleName`/`RoleId` → create Supabase auth user (phone →
E.164) → create SQL user (`AuthOrchestrator.RegisterAsync`; **Supabase user rolled back if SQL
create fails**) → link Supabase↔SQL, sync role (non-fatal) → **WIO registrations also create a
`Wio` entity (`IsOnboarded=false`, default tenant), non-fatal; operators do not get a Wio**.
Returns `LoginResponse`.

Related: `POST /api/auth/set-password` (`:677`, anonymous — `Token/Email/Password/
ConfirmPassword`, MinLength 8, Compare), `reset-password` (`:656`), `forgot-password` (`:643`),
`GET /api/auth/me` (`:694`, `[Authorize]`) → `UserDto` incl. `pendingCapabilities`,
`isEnergyLinkLinked`, `isOnboarded`.

### 9.2 Operator creates/invites

- `POST /api/operators` (`OperatorController.cs:1124`): WIO callers get `WioId` overridden to
  their own WIO. **Idempotent by company name** (existing → 201 with existing record). New:
  create operator, audit; if `Email` present → `GetOrCreateOperatorUserAsync`; newly created
  users get a set-password token (GUID on `PasswordResetToken`, 24 h expiry) + `UserWelcomeEvent`
  email with `SetPasswordUrl = {App:FrontendUrl}/set-password?token=&email=`.
  Notable field rule: `RoutingNumber [StringLength(9, MinimumLength=9)]
  [RegularExpression(@"^\d{9}$")]` `"Routing number must be exactly 9 digits"`.
- `POST /api/operators/wio/invite` (`:2755`): requires operator context
  (`userContext.OperatorId`, else 400). `InviteWioRequest`: `Email [Required][EmailAddress]`,
  `FirstName/LastName [Required]`, `PhoneNumber?`, `CompanyName?`. **Idempotent by email**
  (existing WIO → 201, `IsNewlyCreated=false`, no operator-level access grant — access flows
  through Partner/WioPartners links). New: create user (WIO role) → `Wio`
  (`IsOnboarded=false`) → `WioUser` junction → welcome email **gated by
  `Features:SendWioWelcomeEmail` (default `false`)**; when enabled + newly created, set-password
  token + `UserWelcomeEvent`.
- `POST /api/wios/{wioId}/operators` (`WioController.cs:1805`, `AddOperator`): combined
  operator-register + WIO-link + KYB business-profile + welcome email. 201/400/404/409/500.
- `POST /api/wios/un-onboard` (`:655`): deletes Moov account + bank accounts by email
  (SuperAdmin/permission only).

### 9.3 Enverus SSO provisioning (`EnverusController.cs`, `[AllowAnonymous][EmbeddableAuth]`)

All state-changing Enverus endpoints return **410 Gone** when `EnergyLink:EnableRcaSync=false`
(currently false in appsettings).

- `POST /api/enverus/sso-callback` (`:61`): `{ EnverusUserId [Required], ClientId [Required] }`
  (+ `X-Embeddable-Key`). Idempotent on (enverusUserId, clientUserId) → 200 "Link already
  exists"; else creates `EnverusUserLink` (Status `Pending`) and fire-and-forget enqueues
  `SsoSyncWorkItem` for background JIB sync → 201. Response: `{ LinkId: Guid, Status }`.
- `GET /api/enverus/operators/lookup?orgNumber=|opOrgId=` (`:166`) — ≥1 param required.
- `POST /api/enverus/create-wio` (`:272`): idempotent (link.WioId set → 200); else
  `SsoSyncOrchestrator.CreateWioForLinkAsync` → 201, or 422 `"EnergyLink returned no user
  data"`.
- `SsoSyncOrchestrator.CreateWioForLinkAsync`
  (`Features/BisonJibPay.Sync/Infrastructure/Orchestrators/SsoSyncOrchestrator.cs`): fetch JIB
  data by ClientUserId (agent-aware) → pick primary WIO user (prefer `Title=="Owner"`, else
  first with email) → `GetOrCreateOperatorAsync` + `GetOrCreateWioUserAsync` (WIO role) +
  `GetOrCreateWioAsync` → assign `WIO-Owner` role if newly created (viewer path:
  `WIO-Viewer`) → PartnerDetails with `IsOnboarded=false`, all KYB statuses 0.
- `POST /api/wios/me/connect-energylink` (`WioController.cs:1372`, JWT WIO): idempotent on
  (EnverusUserId, ClientUserId); creates link with Status `"Linked"` + WioId; classifies
  account type via EnergyLink (WIO vs Agent → role); 400 on EnergyLink not-found or
  classification failure.
- Phase 2 (Bison as SAML SP: `SamlController`, ACS `/api/saml/acs`, IdP
  `urn:login.auth.enverus.dev`) lives on unmerged branch `feat/multi-account-updated` —
  **paused**, do not treat as current.
- Doc drift: `ENVERUS_SSO_INTEGRATION.md` says create-wio returns `status: "Pending"`; code
  returns `"Processed"`/existing status.

### 9.4 Frontend prefill variants

- WIO onboarding prefills from `user.partnerInfo` / EnergyLink data
  (`business_profile_step.tsx:130-150`).
- Operator edit-mode prefills from live Moov account/representatives (`setup_guide.tsx:100-107`,
  `GET /api/moov/account`, `/api/moov/representatives`).
- Signup role chooser (WIO vs Operator) behind `ENABLE_SIGNUP_CHOOSER`.

---

## 10. Frontend edge cases & error handling (must-reproduce behaviors)

- **Resume**: backend GET per section is the source of truth; forms hydrate from it. v3 overlays
  sessionStorage drafts. Redacted fields (EIN/DOB/SSN previously provided) validate against
  placeholders instead of requiring re-entry (§5.2).
- **Not-dirty short-circuit**: valid + unchanged form skips the POST and just advances
  (`business_profile_step.tsx:388-391` and equivalents).
- **Close confirmation** (v3 modal, `onboarding_v3.tsx:81-126`): Save & Exit / Discard & Exit /
  Cancel when dirty.
- **Create-account retry**: v4 shows "Try again" on Moov account-creation failure
  (`onboarding_v4.tsx:157-163`).
- **Document upload**: per-file sequential loop; collects+dedupes per-file errors into one
  toast; on session/authorization error breaks the loop with "Your session has expired. Please
  log in again." (`documents_step.tsx:135-185`). Any success closes the modal → Profile
  Complete.
- **GET fallbacks**: all section GET helpers catch errors and return `null`/`[]`
  (`wio-kyb/api.ts:285-430`) — UI treats missing data as not-started, never crashes.
- **Address guards**: PO Boxes rejected; officer/owner address must differ from business
  address; changing country clears the address with an undo banner
  (`use_country_address_reset`, `AddressResetBanner`).
- **Ownership > 100% blocked**; v2/operator flows require ≥1 controller
  (`hasAtLeastOneController`, v2 `validation.ts:681`).
- **Document-section upload groups** (`documents_step.tsx:219-287`): Business documents
  (always; expects a sample JIB statement), Business Underwriting (`merchant_underwriting`,
  when required or already uploaded), Representative Verification, Account Requirement —
  required document types derived from `capabilities.currentlyDue` (`:46-80`).

---

## 11. Configuration & feature flags

### Backend (`BisonJibPay.API/appsettings.json` unless noted)

| Key | Value / effect |
|---|---|
| `Kyb:ActiveProvider` | absent → defaults `"Moov"` (`KybSettings.cs:5`) |
| `Moov:ApiVersion` | `"v2026.04.00"`; base `https://api.moov.io` |
| `Moov:EnableAutoFeePlanSubscription` | `true`; `WioFeePlanId="efbc6f5e-6573-4f8a-a93b-dd5dcce298f9"`; `FeePlanSubscriptionMaxRetries=3` |
| `Moov:WebhookSigningSecret` | required for webhook HMAC |
| `Webhook:Moov` | `Enabled=true`, `EnableSignatureValidation=true`, `SignatureTimeoutMinutes=5`, `AllowedEventTypes[...]` |
| `EnergyLink:EnableRcaSync` | `false` → all Enverus state-changing endpoints 410 |
| `EnergyLink` (others) | `UseNewResponseDataFormat=false`, `ReplaceExistingEmailsFromEnergyLink=true`, `HistoricalJibSyncStartDate="2020-01-01"`, `AllowWioFallbackOnAgentClassificationError=false` |
| `Features:SendWioWelcomeEmail` | `false` — gates WIO-invite welcome email |
| `Features:UseMockEnergyLinkService` | `false` |
| `Embeddable` | `EnableRateLimiting=true`, 100 req/min; `X-Embeddable-Key` via `EmbeddableAuthService` |
| `App:FrontendUrl` | default `https://app.bisonjibpay.com` — set-password/welcome URLs |
| `ProviderMigration` | `EnableStartupMigration=false`, `EnableLoginMigration=false` (Moov→Column, off) |
| `Saml` | nonce/callback JWT expiry 5 min; ACS capture disabled; prod IdP values empty (Phase 2 paused) |

### Frontend (`src/config/feature_flags.ts`)

| Flag | Effect |
|---|---|
| `ALLOW_PENDING_KYB_DOCUMENTS` | Non-prod (`dev-local,local,development,qa,uat`): allow completing KYB with uploaded-but-unapproved docs when no non-doc requirements remain (Moov sandbox never auto-approves docs) |
| `ENABLE_OPERATOR_PORTAL` | Gates `/operator` routes |
| `ENABLE_ADD_WIO` | `dev-local,local` only — manual WIO creation |
| `ENABLE_SIGNUP_CHOOSER` | WIO-vs-Operator signup role chooser |
| `ENABLE_INTEGRATIONS` / `ENABLE_OPERATOR_INTEGRATIONS` | EnergyLink integrations |
| `BANKING_ACCOUNT_APPROVED` | `dev-local` — simulate banking approval |

Env vars: `VITE_APP_ENV`, `VITE_API_BASE_URL_{QA,UAT,PRODUCTION,DEV,LOCAL}`, `VITE_ENABLE_2FA`.

---

## 12. Known drift / dormant code / implementer warnings

1. **v3 is dead code in practice** (`useV3=false` hardcoded); the live modal fallback is v2.
   New work should target the v4 accordion + operator verification surfaces.
2. **`InProgress` (1) is never written by the backend** — don't build logic expecting it.
3. **EIN and SSN are pass-through** — sent to Moov, never persisted in Bison DB. GETs return
   `taxIdProvided`/`birthDateProvided`/`governmentIdProvided` booleans; UI uses placeholder
   values on resubmit (`2000-01-01`, `000-00-0000`).
4. **Capability request timing matters**: request capabilities only after all representatives
   are submitted (beneficial-owners step), or Moov 409-locks the account. The deferred list
   lives on `MoovAccount.Capabilities`.
5. **Frontend owner minimum is 25%, backend `[Range(1,100)]`** — the 25% floor is a frontend/
   Moov rule; keep it in any new client.
6. **WIO `IsOnboarded` flips on document upload**, not on `IsComplete` or capability approval.
7. **Operator KYB endpoints are `[AllowAnonymous][EmbeddableAuth]`** — reachable with the
   embeddable key alone; WIO KYB endpoints require JWT.
8. **Enverus endpoints are currently 410** (`EnableRcaSync=false`); flip the flag to activate.
9. **`FRONTEND_BACKEND_ANALYSIS.md` (API repo) is stale** (Finix/Stripe); `CONTEXT.md`'s
   "no KYB on Column" is a future state, not current.
10. **Backend section validation is lenient** (StringLength only) — the frontend Zod layer is
    the real gate. A new client that skips it can push data Moov will reject; Moov errors then
    surface via capability `errors`/`currentlyDue` on `/kyb/status`.
11. **Moov sandbox never approves documents** — use `ALLOW_PENDING_KYB_DOCUMENTS` in non-prod.
12. Minor doc drift: Enverus create-wio documented as returning `"Pending"`, code returns
    `"Processed"`.

---

## 13. Key file index

### bison-jib-web-flow
- v4 (active): `src/components/onboarding/onboarding_v4.tsx`, `onboarding_accordion.tsx`,
  `onboarding_sections.ts`, `sections/*.tsx`, `kyb_scope.ts`, `src/swr/kyb-scope/hooks.ts`,
  `src/utils/onboarding_status.ts`
- Validation (authoritative): `src/operator/components/verification/validation.ts`,
  `src/utils/validation/payment_provider.ts` (v2-only: `src/components/onboarding/validation.ts`)
- API: `src/swr/wio-kyb/api.ts`, `src/swr/entity-kyb/*`, `src/swr/operators/kyb_api.ts`,
  `src/swr/moov/api.ts`, `src/api/client.ts`, `src/api/transport.ts`
- Capabilities: `src/utils/moov/section_mapping.ts`, `status_logic.ts`, `labels.ts`
- Entry/gating: `src/pages/dashboard.tsx`, `src/components/dashboard/setup_guide.tsx`,
  `src/hooks/use_setup_guide_state.ts`, `src/config/feature_flags.ts`
- Operator: `src/operator/contexts/verification_context.tsx`,
  `src/operator/components/verification/*`, `verification_status.ts`,
  `src/operator/constants/upload.ts`, `src/operator/layout/operator_layout.tsx`
- v3 (dormant): `onboarding_v3.tsx`, `v3_context.tsx`, `v3_constants.ts`, `v3_types.ts`,
  `use_v3_draft.ts`, `v3_steps/*.tsx`

### bison-jib-pay-api
- Controllers: `BisonJibPay.API/Controllers/{OperatorController,WioController,AuthController,EnverusController,WebhookController}.cs`
- Orchestration: `Features/BisonJibPay.Operators/Infrastructure/Orchestrators/KybOnboardingOrchestrator.cs`
- Provider: `Features/BisonJibPay.Kyb/Infrastructure/Providers/MoovKybProvider.cs`
- DTOs/enums: `Features/BisonJibPay.Kyb/Domain/DTOs/KybDTOs.cs`,
  `Domain/Enums/KybEnums.cs`, `Domain/Configuration/KybSettings.cs`,
  `Features/BisonJibPay.Operators/Domain/DTOs/KybOnboardingDTOs.cs`
- Webhook: `Features/BisonJibPay.Payments/Infrastructure/Services/MoovWebhookService.cs`,
  `Domain/Entities/MoovAccount.cs`, `Domain/Configuration/MoovWebhookSettings.cs`
- Sync/Enverus: `Features/BisonJibPay.Sync/Infrastructure/Orchestrators/SsoSyncOrchestrator.cs`,
  `Domain/Entities/{EnverusUserLink,Wio}.cs`
- Auth: `Features/BisonJibPay.Authentication/Infrastructure/Orchestrators/AuthOrchestrator.cs`,
  `Domain/DTOs/AuthenticationDTOs.cs`,
  `Features/BisonJibPay.Embeddable/Infrastructure/Attributes/EmbeddableAuthAttribute.cs`,
  `BisonJibPay.API/Authorization/AuthorizeOrSuperAdminAttribute.cs`
- Reference docs (current): `docs/FE_KYB_ONBOARDING_GUIDE.md`,
  `CAPABILITY_STATUS_FRONTEND_GUIDE.md`, `ENVERUS_SSO_INTEGRATION.md`,
  `docs/ENVERUS_INTEGRATION_STATUS.md`
