// Phase 1 — the mock Transport: an EXECUTABLE spec of the documented onboarding +
// banking behavior, replayed in-memory per instance. Not happy-path stubs — it
// enforces the same status transitions, redaction, eligibility, and error codes
// (409/422/400/404) the real API does, so the whole SDK can be exercised offline.
//
// Determinism: ids come from a per-instance incrementing counter (moov_1, ba_1);
// no Date.now/Math.random in id or branch logic.

import { BisonApiError } from './transport.js'
import type { RequestOptions, Transport } from './transport.js'
import type {
  BankAccount,
  BeneficialOwnerPayload,
  BusinessProfilePayload,
  CapabilityStatus,
  ControlOfficerPayload,
  DocumentUploadResult,
  Industry,
  KybDocumentInfo,
  ManualBankAccountPayload,
  OnboardingStatus,
  PaymentMethodKey,
  PlaidRegisterResult,
  ProcessingVolumePayload,
  SaveSectionResult,
  SectionStatus,
} from './types.js'

// ── State ─────────────────────────────────────────────────────────────────────

interface MockBank extends BankAccount {
  /** Full routing+account, kept only to detect duplicate re-registration. */
  _routing?: string
  _account?: string
}

export interface MockState {
  // onboarding
  moovAccountId?: string
  businessProfileStatus: SectionStatus
  controlOfficerStatus: SectionStatus
  beneficialOwnersStatus: SectionStatus
  processingVolumeStatus: SectionStatus
  /** Partial onboarding does not require the legacy volume step. */
  partialOnboarding: boolean
  selectedPaymentMethods: PaymentMethodKey[]
  /** Capabilities start pending, flip enabled after beneficial-owners POST (§6.3). */
  capabilitiesRequested: boolean
  documents: KybDocumentInfo[]
  isOnboarded: boolean
  /** Redaction flags — true once the sensitive value has been submitted (§5.2). */
  taxIdProvided: boolean
  birthDateProvided: boolean
  governmentIdProvided: boolean
  /** Saved section data for GET re-fetch (with sensitive fields redacted out). */
  business?: Record<string, unknown>
  officer?: Record<string, unknown>
  owners?: Record<string, unknown>[]
  volume?: Record<string, unknown>
  controlOfficerRepresentativeId?: string
  ownerRepresentativeIds: string[]
  /** Seeded US address present -> bank-account-eligible before business profile (§8.1). */
  hasUsAddress: boolean
  // banking
  banks: MockBank[]
  // id counters
  seq: number
}

export function createMockState(seed?: Partial<MockState>): MockState {
  return {
    businessProfileStatus: 'NotStarted',
    controlOfficerStatus: 'NotStarted',
    beneficialOwnersStatus: 'NotStarted',
    processingVolumeStatus: 'NotStarted',
    partialOnboarding: false,
    selectedPaymentMethods: ['ach'],
    capabilitiesRequested: false,
    documents: [],
    isOnboarded: false,
    taxIdProvided: false,
    birthDateProvided: false,
    governmentIdProvided: false,
    ownerRepresentativeIds: [],
    hasUsAddress: false,
    banks: [],
    seq: 0,
    ...seed,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PENDING_CAPS = ['transfers', 'collect-funds', 'send-funds']

function capabilities(s: MockState): CapabilityStatus[] {
  const status = s.capabilitiesRequested ? 'enabled' : 'pending'
  return PENDING_CAPS.map((name) => ({ name, status }))
}

function buildStatus(s: MockState): OnboardingStatus {
  const isComplete =
    s.businessProfileStatus === 'Completed' &&
    s.controlOfficerStatus === 'Completed' &&
    s.beneficialOwnersStatus === 'Completed' &&
    (s.partialOnboarding || s.processingVolumeStatus === 'Completed')
  const enabled = s.capabilitiesRequested
  return {
    entityId: 'entity_mock',
    entityType: 'Wio',
    businessProfileStatus: s.businessProfileStatus,
    controlOfficerStatus: s.controlOfficerStatus,
    beneficialOwnersStatus: s.beneficialOwnersStatus,
    processingVolumeStatus: s.processingVolumeStatus,
    isComplete,
    hasExternalAccount: Boolean(s.moovAccountId),
    bankAccountEligibility: {
      isSupported: s.businessProfileStatus === 'Completed' || s.hasUsAddress,
      supportedCountryCodes: ['US'],
    },
    capabilities: capabilities(s),
    isProfileLocked: enabled,
    isKybReady: enabled && isComplete,
    verificationStatus: enabled ? 'verified' : 'pending',
    documents: s.documents,
    selectedPaymentMethods: s.selectedPaymentMethods,
    controlOfficerRepresentativeId: s.controlOfficerRepresentativeId,
    ownerRepresentativeIds: s.ownerRepresentativeIds,
    readinessState: isComplete && enabled
      ? 'Ready'
      : s.businessProfileStatus === 'NotStarted'
        ? 'MissingProfile'
        : 'MissingProviderInput',
  }
}

/** Bank-account eligibility guard (§8.1). Eligible once the business profile is
 *  Completed (form is US-only) OR a US address was seeded. */
function assertBankEligible(s: MockState): void {
  if (s.businessProfileStatus === 'Completed' || s.hasUsAddress) return
  throw new BisonApiError(
    422,
    'A U.S. address must be confirmed before adding a bank account.',
    [],
    'ADDRESS_NOT_SET',
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Transport ───────────────────────────────────────────────────────────────────

export function mock(opts?: { seed?: MockState; latencyMs?: number }): Transport {
  const s = opts?.seed ?? createMockState()
  const latency = opts?.latencyMs ?? 0

  const transport: Transport = async <T>(path: string, req: RequestOptions = {}): Promise<T> => {
    if (latency) await sleep(latency)
    const method = (req.method ?? (req.json !== undefined || req.form ? 'POST' : 'GET')).toUpperCase()
    // Strip a leading slash for consistent matching.
    const p = path.replace(/^\//, '')
    const json = req.json as any

    // ── User / identity ──────────────────────────────────────────────────────
    if (/^api\/auth\/me$/.test(p) || /^api\/embeddable\/moov-account-id$/.test(p)) {
      return {
        id: 'user_mock',
        email: (req.query?.email as string) ?? 'user@mock.test',
        moovAccountId: s.moovAccountId,
        isOnboarded: s.isOnboarded,
        pendingCapabilities: s.capabilitiesRequested ? [] : capabilities(s),
      } as T
    }

    // ── Industries / ToS (no scope) ────────────────────────────────────────────
    if (/^api\/(wios|operators)\/kyb\/industries$/.test(p)) {
      const industries: Industry[] = [
        { name: 'Petroleum Products', mcc: '5172' },
        { name: 'Oil & Gas Extraction', mcc: '1311' },
      ]
      return industries as T
    }
    if (/^api\/moov\/tos-token$/.test(p) && method === 'POST') {
      return { accessToken: `tos_${++s.seq}` } as T
    }

    // ── Plaid ──────────────────────────────────────────────────────────────────
    if (/^api\/plaid\/embeddable\/create-token$/.test(p) && method === 'POST') {
      return { linkToken: `plaid_link_${++s.seq}` } as T
    }
    if (/^api\/plaid\/embeddable\/register-bank-account$/.test(p) && method === 'POST') {
      assertBankEligible(s)
      const bank = addBank(s, {
        routing: '000000000',
        account: `plaid_${++s.seq}`,
        isVerified: true, // Plaid accounts are born verified (§6.1).
        bankName: json?.bankName,
        holderName: json?.accountHolderName,
      })
      const result: PlaidRegisterResult = {
        registrations: [{ provider: 'Moov', bankAccountId: bank.id, succeeded: true }],
        allSucceeded: true,
        isDuplicate: false,
        plaidItemId: `item_${s.seq}`,
      }
      return result as T
    }

    // ── KYB per-section (scope prefix ignored; match on the suffix) ─────────────
    const kyb = p.match(/\/kyb\/([a-z-]+)$/)
    if (kyb && /(^|\/)kyb\//.test(p)) {
      return handleKyb(s, kyb[1], method, req) as T
    }

    // ── Banking ────────────────────────────────────────────────────────────────
    const bank = p.match(/\/bank-accounts(?:\/([^/]+))?(?:\/([a-z-]+))?$/)
    if (bank && /bank-accounts/.test(p)) {
      return handleBank(s, bank[1], bank[2], method, json) as T
    }

    throw new BisonApiError(404, `mock: no route for ${method} ${p}`)
  }
  return transport
}

// ── KYB section handler ──────────────────────────────────────────────────────────

function handleKyb(s: MockState, section: string, method: string, req: RequestOptions): unknown {
  const json = req.json as any

  if (section === 'status') return buildStatus(s)

  if (section === 'business-profile') {
    if (method === 'GET') {
      if (!s.business) return null
      // EIN never returned; taxIdProvided boolean reflects prior submission (§5.2).
      return { ...s.business, taxIdProvided: s.taxIdProvided }
    }
    const data = json as BusinessProfilePayload
    const firstCall = !s.moovAccountId
    if (firstCall) s.moovAccountId = `moov_${++s.seq}` // First POST creates the Moov account (§6.1).
    if (data.selectedPaymentMethods?.length) s.selectedPaymentMethods = data.selectedPaymentMethods
    if (data.termsAccepted) s.partialOnboarding = true
    if (data.ein) s.taxIdProvided = true
    // Store a redacted copy (EIN stripped, never persisted).
    const { ein: _ein, controlOfficer, ...rest } = data
    s.business = rest as Record<string, unknown>
    if (controlOfficer) saveOfficer(s, controlOfficer)
    s.businessProfileStatus = 'Completed' // NotStarted -> Completed directly (§6.8).
    const result: SaveSectionResult = { success: true, moovAccountId: s.moovAccountId }
    return result
  }

  if (section === 'control-officer') {
    if (method === 'GET') {
      if (!s.officer) return null
      return { ...s.officer, birthDateProvided: s.birthDateProvided, governmentIdProvided: s.governmentIdProvided }
    }
    saveOfficer(s, json as ControlOfficerPayload)
    const result: SaveSectionResult = { success: true, representativeId: s.controlOfficerRepresentativeId }
    return result
  }

  if (section === 'beneficial-owners') {
    if (method === 'GET') return s.owners ?? []
    const owners = (Array.isArray(json) ? json : []) as BeneficialOwnerPayload[]
    for (const o of owners) {
      if (o.birthYear || o.birthMonth || o.birthDay) s.birthDateProvided = true
      if (o.ssn) s.governmentIdProvided = true
    }
    s.owners = owners.map(({ ssn: _ssn, ...rest }) => rest as Record<string, unknown>)
    s.ownerRepresentativeIds = owners.map(() => `rep_${++s.seq}`)
    s.beneficialOwnersStatus = 'Completed'
    // Capabilities are requested here — all representatives now exist (§6.3).
    s.capabilitiesRequested = true
    const result: SaveSectionResult = { success: true }
    return result
  }

  if (section === 'processing-volume') {
    if (method === 'GET') return s.volume ?? null
    s.volume = json as ProcessingVolumePayload as unknown as Record<string, unknown>
    s.processingVolumeStatus = 'Completed'
    const result: SaveSectionResult = { success: true }
    return result
  }

  if (section === 'documents') {
    if (method === 'GET') return s.documents
    const purpose = (req.form?.get('purpose') as string) || 'merchant_underwriting'
    const doc: KybDocumentInfo = { id: `doc_${++s.seq}`, purpose: purpose as KybDocumentInfo['purpose'], status: 'pending' }
    s.documents.push(doc)
    s.isOnboarded = true // Upload flips IsOnboarded (§7 warning 6).
    const result: DocumentUploadResult = { id: doc.id, purpose: doc.purpose, status: doc.status }
    return result
  }

  if (section === 'payment-method-capabilities') {
    if (method === 'GET') return { selectedPaymentMethods: s.selectedPaymentMethods }
    const methods = (json?.selectedPaymentMethods ?? []) as PaymentMethodKey[]
    if (methods.length) s.selectedPaymentMethods = methods
    return { selectedPaymentMethods: s.selectedPaymentMethods }
  }

  throw new BisonApiError(404, `mock: unknown kyb section ${section}`)
}

function saveOfficer(s: MockState, data: ControlOfficerPayload): void {
  if (data.birthYear || data.birthMonth || data.birthDay) s.birthDateProvided = true
  if (data.ssn) s.governmentIdProvided = true
  const { ssn: _ssn, ...rest } = data
  s.officer = rest as Record<string, unknown>
  s.controlOfficerRepresentativeId = s.controlOfficerRepresentativeId ?? `rep_${++s.seq}`
  s.controlOfficerStatus = 'Completed'
}

// ── Banking handler ──────────────────────────────────────────────────────────────

function addBank(
  s: MockState,
  init: { routing: string; account: string; isVerified: boolean; bankName?: string; holderName?: string },
): MockBank {
  const bank: MockBank = {
    id: `ba_${++s.seq}`,
    externalId: `ext_${s.seq}`,
    provider: 'Moov',
    accountName: init.holderName,
    bankName: init.bankName,
    accountNumber: init.account.slice(-4), // last-4 only.
    routingNumber: init.routing,
    accountType: 'checking',
    isVerified: init.isVerified,
    isDefault: s.banks.length === 0, // First account auto-promotes to default (§6.4).
    _routing: init.routing,
    _account: init.account,
  }
  s.banks.push(bank)
  return bank
}

function handleBank(s: MockState, id: string | undefined, action: string | undefined, method: string, json: any): unknown {
  // GET list — bankBase with no id segment.
  if (method === 'GET' && !id) return s.banks.map(strip)

  // POST /manual — id captures the literal "manual".
  if (id === 'manual' && method === 'POST') {
    assertBankEligible(s)
    const payload = json as ManualBankAccountPayload
    const dup = s.banks.find((b) => b._routing === payload.routingNumber && b._account === payload.accountNumber)
    if (dup) throw new BisonApiError(409, 'This bank account is already registered.')
    const bank = addBank(s, {
      routing: payload.routingNumber,
      account: payload.accountNumber,
      isVerified: false, // manual accounts verify via micro-deposit (§6.1).
      holderName: payload.holderName,
    })
    bank.accountType = payload.bankAccountType ?? 'checking'
    return strip(bank)
  }

  const target = s.banks.find((b) => b.id === id)

  if (action === 'complete-verification' && method === 'POST') {
    if (!target) throw new BisonApiError(404, 'Bank account not found.')
    const code = String(json?.code ?? '').toUpperCase().replace(/^MV/, '')
    if (code !== '1234') throw new BisonApiError(400, 'Invalid verification code.')
    target.isVerified = true
    return undefined
  }

  if (action === 'initiate-verification' && method === 'POST') {
    if (!target) throw new BisonApiError(404, 'Bank account not found.')
    return undefined
  }

  if (action === 'set-default' && method === 'PUT') {
    if (!target) throw new BisonApiError(404, 'Bank account not found.')
    for (const b of s.banks) b.isDefault = b.id === id // single default.
    return undefined
  }

  if (!action && method === 'DELETE') {
    if (!target) throw new BisonApiError(404, 'Bank account not found.')
    s.banks = s.banks.filter((b) => b.id !== id) // hard delete, no guard (§6.3 / §12.1).
    return undefined
  }

  throw new BisonApiError(404, `mock: no bank route for ${method} ${id ?? ''}/${action ?? ''}`)
}

/** Drop the internal full-number fields before returning a BankAccount. */
function strip(b: MockBank): BankAccount {
  const { _routing, _account, ...rest } = b
  return rest
}
