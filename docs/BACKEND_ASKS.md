# Backend Coordination — bison-sdk (Onboarding + Bank accounts)

What the SDK needs from the backend to run against the real API instead of the mock.
The **mock transport** (`src/core/mock.ts`) is the executable contract: every route, DTO,
and error code below is what the SDK already calls and expects. Payments are out of scope.

Source of truth: `docs/ONBOARDING_SPEC.md`, `docs/BANKING_SPEC.md` (both derived from the
current `bison-jib-web-flow` + `bison-jib-pay-api` code).

---

## 1. Decisions we need from you (blocking)

1. **Auth model — API key exchange vs pass-through Auth0.**
   The SDK sends `Authorization: Bearer <token>` via a `getToken()` callback. It does **not**
   send `X-Embeddable-Key`. Our position: consumers get a Bison **API key**, their *server*
   exchanges it for a short-lived, scope-bound **client token** (Stripe/Plaid pattern); the
   browser only ever holds that token. This keeps Bison from having to validate each
   consumer's Auth0 JWTs (per-tenant JWKS, audience, rotation) and gives us rate limits,
   scoping, revocation, and usage attribution.
   - **We need:** a token-issuance endpoint (server-to-server, API key → short-lived JWT) and
     confirmation the KYB/bank endpoints accept that bearer token. If you insist on Auth0
     pass-through, the SDK still works (`getToken` returns whatever), but we lose the above —
     let's discuss.

2. **WIO endpoints under a non-session token.**
   Today WIO/entity KYB + WIO bank-account management are **JWT-only** and assume an app session; operator
   endpoints were `[AllowAnonymous][EmbeddableAuth]`. For an embeddable SDK we need **both**
   personas reachable with the issued client token (no cookie session). Confirm the WIO routes
   accept the bearer token and authorize by the token's scope/entity, not a session.

3. **OTP on bank mutations.**
   The platform gates set-default / delete / manual-add behind app-session OTP
   (`requestOtp`). Embeddable consumers have no such session. **Decision needed:** drop OTP
   for token-scoped SDK calls, or return a documented `OtpRequiredResponse` the SDK surfaces
   as an event? The SDK currently assumes the former (no OTP challenge on these routes).

---

## 2. Endpoints the SDK calls (must exist and match)

All responses must use the `{ success, message, data }` envelope. Routes use the scope base:
`api/wios/{id}` · `api/wios/{id}/entities/{entityId}` · `api/operators/{id}`.

### Onboarding (KYB)
| Method | Route (`{kyb}` = `<scope-base>/kyb`) | Body → `data` |
|---|---|---|
| GET | `{kyb}/status` | → `KybOnboardingStatusResponse` |
| POST | `{kyb}/business-profile` | `KybBusinessProfileRequest` → `SaveSectionResult`; partial onboarding includes `incorporationState`, `termsAccepted`, and request-scoped `controlOfficer` |
| POST | `{kyb}/control-officer` (`?existingRepresentativeId=`) | `KybRepresentativeRequest` → `SaveSectionResult`; Bison calls this only when the provider entity already exists |
| POST | `{kyb}/beneficial-owners` (`?noOwnersAbove25=&existingMappingsJson=`) | `KybBeneficialOwnerRequest[]` → `SaveSectionResult` |
| POST | `{kyb}/processing-volume` | `KybProcessingVolumeRequest` → `SaveSectionResult` |
| POST | `{kyb}/documents` (multipart) | `file`, `purpose`, `metadata?` → `DocumentUploadResult` |
| POST | `{kyb}/payment-method-capabilities` | `{ selectedPaymentMethods }` |
| GET | `api/{wios\|operators}/kyb/industries` | → `Industry[]` |
| POST | `api/moov/tos-token` | → `{ accessToken }` |

### Banking (`{bank}` = `<scope-base>/bank-accounts`)
| Method | Route | Body → `data` |
|---|---|---|
| GET | `{bank}` | → `BankAccount[]` |
| POST | `{bank}/manual` | `ManualBankAccountPayload` → `BankAccount` |
| POST | `{bank}/{id}/initiate-verification` | — |
| POST | `{bank}/{id}/complete-verification` | `{ code }` |
| PUT | `{bank}/{id}/set-default` | — |
| DELETE | `{bank}/{id}` | — |
| POST | `api/plaid/embeddable/create-token` (`?entityId=`) | → `{ linkToken }` |
| POST | `api/plaid/embeddable/register-bank-account` | `PlaidRegisterPayload` → `PlaidRegisterResult` |

### Identity
| Method | Route | Notes |
|---|---|---|
| GET | `api/auth/me` | → `UserInfo` (`isOnboarded`, `pendingCapabilities`) |
| GET | `api/embeddable/moov-account-id` (`?email=`) | resolve entity by email (server-side) |

**If any route name/shape differs from the above, tell us** — the mock encodes these exactly and the components/functions are built on them.

---

## 3. Behaviors the SDK depends on (confirm these hold)

1. **Section status flips `NotStarted → Completed`** on a successful section POST (no
   `InProgress`). Partial onboarding readiness requires business, control officer, and beneficial
   owners; it does not require the legacy processing-volume section.
2. **Capabilities are deferred**: requested only after beneficial-owners submit (so the SDK
   must submit business → officer → owners before capabilities go `pending`/`enabled`).
   Confirm the ordering constraint and that `status.capabilities[].status` reflects it.
3. **First bank account auto-promotes to default** server-side.
4. **Eligibility is enforced as `422`** with `errorCode` `NON_US_ADDRESS` or `ADDRESS_NOT_SET`
   before business profile / US address is set. The SDK branches on these codes.
5. **Duplicate manual bank add returns `409`** ("This bank account is already registered.").
6. **Verification code** accepts `MV####` or 4 digits (backend `TryNormalizeVerificationCode`).
   Wrong code → `400`.
7. **EIN / SSN are pass-through** (never stored); GETs return `taxIdProvided` /
   `birthDateProvided` / `governmentIdProvided` booleans so the SDK can skip re-entry on resume.
8. **Error envelope** carries a stable machine-readable `errorCode` on failures (not just a
   message) — the SDK relies on it for 409/422/capability branching.

---

## 4. Gaps / risks to flag (from the specs)

These are current-code realities the backend team should be aware of — some need a decision:

- **Delete guards are frontend-only.** Backend hard-deletes a bank account with no
  default/last-account guard (`BANKING_SPEC §12.1`). The SDK component re-implements the
  guards, but a raw API consumer can still hard-delete a default. **Ask:** should the backend
  add a guard, or is client-side enough for the SDK's scope?
- **WIO bank rows store `EntityId = Partner.Id`** (not the WIO id). If the token scopes by
  WIO id, confirm the lookup still resolves. (`BANKING_SPEC §12.3`)
- **Webhook sync is non-destructive** (never deletes local rows, preserves
  `IsVerified`/`IsDefault`). Fine for us — just confirming we shouldn't expect delete-webhooks
  to remove accounts. (`BANKING_SPEC §6.6`)
- **Partial onboarding is mock-backed in the SDK.** Confirm the real provider-aware KYB
  endpoints accept the combined creation payload and conditional officer-update sequence
  before switching embeddable consumers off the mock.
- **Enverus/SSO endpoints return `410`** while `EnableRcaSync=false`. Not used by this SDK
  slice, but flag if that changes.

---

## 5. What we need to publish/version

- A **staging base URL** + a test API key (or test token issuer) so we can point `http()` at a
  real environment and run the same flow the mock runs.
- A frozen list of **`errorCode` values** for the failure paths above (we'll map them in the
  SDK). We currently rely on: `NON_US_ADDRESS`, `ADDRESS_NOT_SET`, plus HTTP `409`/`400`/`404`.
- Any **rate-limit / scope** rules on the issued token so we document them for consumers.

---

## 6. Open questions from the design (Embeddable V5 diagram)

1. **How tolerant is EnergyLink (EL) to code changes** to integrate our embeddables?
2. **Auth0 tokens vs API-key provisioning** — see §1.1. We recommend API keys + server-side
   token exchange; need your buy-in on the issuance endpoint.
