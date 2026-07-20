// Phase 0 — the wire contract. Lifted verbatim from ONBOARDING_SPEC.md and
// BANKING_SPEC.md (bison-sdk/docs). These types are the public API surface the
// http transport and the mock both satisfy; changing one is a wire change.

import type { Persona, Scope } from './scope.js'
// Persona/Scope are exported from ./scope (canonical). Imported here for local use only.

// ============================================================================
// Onboarding — section statuses & KYB status (ONBOARDING_SPEC §4.2, §6.8, §8.1)
// ============================================================================

/** Backend section status. Note: `InProgress` is never emitted by the backend
 *  (it flips NotStarted -> Completed directly); kept for completeness. */
export type SectionStatus = 'NotStarted' | 'InProgress' | 'Completed'

/** The five onboarding sections, in canonical order. */
export type OnboardingStep = 'business' | 'officer' | 'owners' | 'volume' | 'documents'

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'business',
  'officer',
  'owners',
  'volume',
  'documents',
]

export interface CapabilityError {
  requirement: string
  errorCode: string
  reason?: string
}

/** Moov capability status (ONBOARDING_SPEC §8.1). */
export interface CapabilityStatus {
  name: string
  status: 'enabled' | 'pending' | 'in-review' | 'disabled' | 'not_requested'
  disabledReason?: string
  currentlyDue?: string[]
  errors?: CapabilityError[]
}

export interface BankAccountEligibility {
  isSupported?: boolean
  wioCountryCode?: string
  /** "NON_US_ADDRESS" | "ADDRESS_NOT_SET" when unsupported. */
  unsupportedReason?: string
  supportedCountryCodes?: string[]
}

export interface KybDocumentInfo {
  id?: string
  purpose: MoovFilePurpose
  status?: string
  fileName?: string
}

/** GET .../kyb/status — the full onboarding state (ONBOARDING_SPEC §4.2). */
export interface OnboardingStatus {
  entityId: string
  entityType: string
  businessProfileStatus: SectionStatus
  controlOfficerStatus: SectionStatus
  beneficialOwnersStatus: SectionStatus
  processingVolumeStatus: SectionStatus
  isComplete: boolean
  bankAccountEligibility?: BankAccountEligibility
  hasExternalAccount?: boolean
  capabilities?: CapabilityStatus[]
  isProfileLocked?: boolean
  isKybReady?: boolean
  verificationStatus?: 'verified' | 'pending' | 'action-required' | string
  documents?: KybDocumentInfo[]
  selectedPaymentMethods?: PaymentMethodKey[]
  controlOfficerRepresentativeId?: string
  ownerRepresentativeIds?: string[]
}

export type PaymentMethodKey = 'cards' | 'ach' | 'wire' | 'rtp'

// ============================================================================
// Onboarding — per-section request payloads (ONBOARDING_SPEC §5)
// ============================================================================

export interface BusinessProfilePayload {
  legalBusinessName: string
  doingBusinessAs?: string
  /** Format XX-XXXXXXX. Pass-through; never stored server-side. */
  ein?: string
  businessType: string
  industry?: string
  industryMcc?: string
  industryNaics?: string
  industrySic?: string
  description?: string
  website?: string
  phone: string
  email?: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  zipCode: string
  selectedPaymentMethods?: PaymentMethodKey[]
  /** Moov ToS token (obtained via getTosToken / the ToS Drop). */
  tosToken?: string
}

export interface ControlOfficerPayload {
  firstName: string
  lastName: string
  jobTitle: string
  email: string
  phone: string
  /** Split date of birth per the KYB DTO. */
  birthDay?: number
  birthMonth?: number
  birthYear?: number
  /** Format XXX-XX-XXXX. Pass-through; never stored server-side. */
  ssn?: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  zipCode: string
}

export interface BeneficialOwnerPayload extends ControlOfficerPayload {
  /** Whole number 25-100. */
  ownershipPercentage: number
}

export interface ProcessingVolumePayload {
  averageMonthlyTransactionCount: number
  /** Whole dollars. */
  averageMonthlyDollarVolume: number
  averageIndividualTransactionSize: number
  maximumIndividualTransactionSize?: number
  geographicReach?: string
  businessPresence?: string
  pendingLitigation?: string
  volumeShareByCustomerType?: { business: number; consumer: number; p2p: number }
}

/** Discriminated union carried by submitOnboarding(step, payload, scope). */
export type OnboardingSubmit =
  | { step: 'business'; data: BusinessProfilePayload }
  | { step: 'officer'; data: ControlOfficerPayload; existingRepresentativeId?: string }
  | { step: 'owners'; data: BeneficialOwnerPayload[]; noOwnersAbove25?: boolean }
  | { step: 'volume'; data: ProcessingVolumePayload }

export interface SaveSectionResult {
  success: boolean
  moovAccountId?: string
  representativeId?: string
  errorMessage?: string
}

// ============================================================================
// Documents (ONBOARDING_SPEC §5.6)
// ============================================================================

export type MoovFilePurpose =
  | 'merchant_underwriting'
  | 'identity_verification'
  | 'individual_verification'
  | 'representative_verification'
  | 'account_requirement'
  | 'business_verification'

export interface DocumentUploadResult {
  id?: string
  purpose: MoovFilePurpose
  status?: string
}

// ============================================================================
// User / identity
// ============================================================================

export interface UserInfo {
  id?: string
  email?: string
  moovAccountId?: string
  isOnboarded?: boolean
  pendingCapabilities?: CapabilityStatus[]
}

export interface TosToken {
  accessToken: string
}

export interface Industry {
  name: string
  mcc?: string
  naics?: string
  sic?: string
}

// ============================================================================
// Banking (BANKING_SPEC §4)
// ============================================================================

export type BankProvider = 'Column' | 'Moov' | 'Increase'
export type BankAccountType = 'checking' | 'savings'
export type HolderType = 'individual' | 'business'

/** Micro-deposit lifecycle (BANKING_SPEC §4.4). */
export type BankVerificationStatus = 'new' | 'pending' | 'verified' | 'errored' | 'max-attempts-exceeded'

/** BankAccountDto (BANKING_SPEC §4.2). AccountNumber is last-4 only. */
export interface BankAccount {
  id: string
  externalId?: string
  provider?: BankProvider
  accountName?: string
  bankName?: string
  /** Last 4 digits only. */
  accountNumber?: string
  routingNumber?: string
  accountType?: BankAccountType
  isVerified: boolean
  isDefault: boolean
  createdAt?: string
  updatedAt?: string
  enverusUserId?: string
  prtBaId?: number
}

/** POST .../bank-accounts/manual (Moov-only). */
export interface ManualBankAccountPayload {
  holderName: string
  holderType?: HolderType
  /** Exactly 9 digits. */
  routingNumber: string
  accountNumber: string
  bankAccountType?: BankAccountType
  initiateVerification?: boolean
}

/** Plaid registration payload — POST /api/plaid/embeddable/register-bank-account. */
export interface PlaidRegisterPayload {
  publicToken: string
  accountId: string
  accountHolderName?: string
  bankName?: string
  accountType?: BankAccountType
  description?: string
}

/** register(payload) is discriminated: manual entry vs Plaid link. */
export type BankRegister =
  | ({ method: 'manual' } & ManualBankAccountPayload)
  | ({ method: 'plaid' } & PlaidRegisterPayload)

export interface PlaidLinkToken {
  linkToken: string
}

export interface PlaidRegisterResult {
  registrations?: { provider: BankProvider; bankAccountId?: string; succeeded: boolean; error?: string }[]
  allSucceeded: boolean
  isDuplicate: boolean
  plaidItemId?: string
}

/** Complete micro-deposit verification: `MV####` or 4 digits (BANKING_SPEC §6.5). */
export interface CompleteVerificationPayload {
  code: string
}

// ============================================================================
// Client config
// ============================================================================

/** Everything the resume helper needs is on OnboardingStatus. */
export type { OnboardingStatus as ResolveResumeInput }

// Re-export the scope helpers' input type for convenience at the call sites.
export type ScopedArgs = { scope: Scope; persona?: Persona }
