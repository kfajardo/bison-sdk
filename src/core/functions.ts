// Phase 1 — standalone API functions. Each takes a Transport as first arg so
// client.ts can bind it. Routes come from kybBase(scope)/bankBase(scope). No zod
// here (validation is the /validation layer's job); these are the wire calls.

import type { Transport } from './transport.js'
import type { Scope } from './scope.js'
import { kybBase, bankBase } from './scope.js'
import type {
  BankAccount,
  BankRegister,
  CompleteVerificationPayload,
  DocumentUploadResult,
  Industry,
  MoovFilePurpose,
  OnboardingStatus,
  OnboardingSectionData,
  OnboardingStep,
  OnboardingSubmit,
  PaymentMethodKey,
  PlaidLinkToken,
  PlaidRegisterResult,
  SaveSectionResult,
  TosToken,
  UserInfo,
} from './types.js'

// ── Onboarding ──────────────────────────────────────────────────────────────

/** GET the current API-key identity. */
export function getUser(transport: Transport): Promise<UserInfo> {
  return transport<UserInfo>('api/auth/me')
}

/** Map an OnboardingStep to its per-section GET/POST path segment. */
const SECTION_PATH: Record<OnboardingStep, string> = {
  business: 'business-profile',
  officer: 'control-officer',
  owners: 'beneficial-owners',
  volume: 'processing-volume',
  documents: 'documents',
}

/** Load the full onboarding status. */
export function getOnboardingStatus(transport: Transport, scope: Scope): Promise<OnboardingStatus> {
  return transport<OnboardingStatus>(`${kybBase(scope)}/status`)
}

/** Load one saved onboarding section. */
export function getOnboardingSection<Step extends OnboardingStep>(
  transport: Transport,
  scope: Scope,
  step: Step,
): Promise<OnboardingSectionData[Step] | null> {
  return transport<OnboardingSectionData[Step] | null>(`${kybBase(scope)}/${SECTION_PATH[step]}`)
}

/** POST the matching section endpoint. Returns SaveSectionResult (business also
 *  carries moovAccountId on first save). */
export function submitOnboardingSection(
  transport: Transport,
  scope: Scope,
  submit: OnboardingSubmit,
): Promise<SaveSectionResult> {
  const base = kybBase(scope)
  switch (submit.step) {
    case 'business':
      return transport<SaveSectionResult>(`${base}/business-profile`, { method: 'POST', json: submit.data })
    case 'officer':
      return transport<SaveSectionResult>(`${base}/control-officer`, {
        method: 'POST',
        json: submit.data,
        query: submit.existingRepresentativeId
          ? { existingRepresentativeId: submit.existingRepresentativeId }
          : undefined,
      })
    case 'owners':
      // Body is the array; certification flag is a query param.
      return transport<SaveSectionResult>(`${base}/beneficial-owners`, {
        method: 'POST',
        json: submit.data,
        query: {
          ...(submit.noOwnersAbove25 ? { noOwnersAbove25: true } : {}),
          ...(submit.existingMappings?.length
            ? { existingMappingsJson: JSON.stringify(submit.existingMappings) }
            : {}),
        },
      })
    case 'volume':
      return transport<SaveSectionResult>(`${base}/processing-volume`, { method: 'POST', json: submit.data })
  }
}

/** Multipart document upload. Purpose defaults to merchant_underwriting. */
export function uploadOnboardingDocument(
  transport: Transport,
  scope: Scope,
  file: File,
  purpose: MoovFilePurpose = 'merchant_underwriting',
  metadata?: string,
): Promise<DocumentUploadResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('purpose', purpose)
  if (metadata !== undefined) form.append('metadata', metadata)
  return transport<DocumentUploadResult>(`${kybBase(scope)}/documents`, { method: 'POST', form })
}

/** GET the industry list for the scope's persona. */
export function getOnboardingIndustries(transport: Transport, scope: Scope): Promise<Industry[]> {
  const seg = scope.persona === 'operator' ? 'operators' : 'wios'
  return transport<Industry[]>(`api/${seg}/kyb/industries`)
}

/** POST for a Moov ToS token. */
export function getOnboardingTermsToken(transport: Transport): Promise<TosToken> {
  return transport<TosToken>('api/moov/tos-token', { method: 'POST' })
}

/** Persist the selected payment-method capabilities for the scope. */
export function saveOnboardingPaymentMethods(
  transport: Transport,
  scope: Scope,
  methods: PaymentMethodKey[],
): Promise<void> {
  return transport<void>(`${kybBase(scope)}/payment-method-capabilities`, {
    method: 'POST',
    json: { selectedPaymentMethods: methods },
  })
}

// ── Banking ─────────────────────────────────────────────────────────────────

/** GET the scope's bank accounts. */
export function getBankAccounts(transport: Transport, scope: Scope): Promise<BankAccount[]> {
  return transport<BankAccount[]>(bankBase(scope))
}

/** POST a Plaid link token for the scope's entity. */
export function getPlaidLinkToken(transport: Transport, scope: Scope): Promise<PlaidLinkToken> {
  return transport<PlaidLinkToken>('api/plaid/embeddable/create-token', {
    method: 'POST',
    query: { entityId: scope.entityId ?? scope.id },
  })
}

/** Register a bank account — manual entry (Moov) or Plaid link.
 *  Manual returns the created BankAccount; Plaid returns per-processor results. */
export function registerBankAccount(transport: Transport, scope: Scope, payload: Extract<BankRegister, { method: 'manual' }>): Promise<BankAccount>
export function registerBankAccount(transport: Transport, scope: Scope, payload: Extract<BankRegister, { method: 'plaid' }>): Promise<PlaidRegisterResult>
export function registerBankAccount(
  transport: Transport,
  scope: Scope,
  payload: BankRegister,
): Promise<BankAccount | PlaidRegisterResult> {
  const { method, ...body } = payload
  if (method === 'manual') {
    return transport<BankAccount>(`${bankBase(scope)}/manual`, { method: 'POST', json: body })
  }
  return transport<PlaidRegisterResult>('api/plaid/embeddable/register-bank-account', {
    method: 'POST',
    // Merge the scope's ids so the backend attaches the account to the right entity.
    json: { ...body, entityId: scope.entityId ?? scope.id, moovAccountId: scope.entityId ?? scope.id },
  })
}

/** POST to start micro-deposit verification for an account. */
export function initiateBankAccountVerification(transport: Transport, scope: Scope, bankAccountId: string): Promise<void> {
  return transport<void>(`${bankBase(scope)}/${encodeURIComponent(bankAccountId)}/initiate-verification`, {
    method: 'POST',
  })
}

/** POST the micro-deposit code (MV#### or 4 digits) to complete verification. */
export function completeBankAccountVerification(
  transport: Transport,
  scope: Scope,
  bankAccountId: string,
  payload: CompleteVerificationPayload,
): Promise<void> {
  return transport<void>(`${bankBase(scope)}/${encodeURIComponent(bankAccountId)}/complete-verification`, {
    method: 'POST',
    json: payload,
  })
}

/** PUT to make an account the single default. */
export function setDefaultBankAccount(transport: Transport, scope: Scope, bankAccountId: string): Promise<void> {
  return transport<void>(`${bankBase(scope)}/${encodeURIComponent(bankAccountId)}/set-default`, { method: 'PUT' })
}

/** DELETE an account (hard delete; client-side guards live in client.ts callers). */
export function deleteBankAccount(transport: Transport, scope: Scope, bankAccountId: string): Promise<void> {
  return transport<void>(`${bankBase(scope)}/${encodeURIComponent(bankAccountId)}`, { method: 'DELETE' })
}
