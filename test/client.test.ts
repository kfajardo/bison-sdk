import { describe, expect, test } from 'bun:test'
import { createClient, mock, resolveOnboardingResumeStep } from '../src/core/client'
import { BisonApiError, BISON_API_URL, http, type RequestOptions, type Transport } from '../src/core/transport'
import { getUser, setupBison } from '../src/index'
import type { Scope } from '../src/core/scope'

// New surface: everything runs against the mock transport (executable spec).
const wio: Scope = { persona: 'wio', id: 'wio_1' }

function client() {
  return createClient({ transport: mock() })
}

const business = {
  legalBusinessName: 'Bison Energy LLC',
  ein: '12-3456789',
  businessType: 'llc',
  phone: '5551234567',
  addressLine1: '100 Main St',
  city: 'Houston',
  state: 'TX',
  zipCode: '77002',
  selectedPaymentMethods: ['ach'] as const,
}

describe('onboarding flow (mock)', () => {
  test('fresh status: sections NotStarted, resume = business', async () => {
    const c = client()
    const status = await c.getOnboardingStatus(wio)
    expect(status.businessProfileStatus).toBe('NotStarted')
    expect(status.isComplete).toBe(false)
    expect(resolveOnboardingResumeStep(status)).toBe('business')
  })

  test('business submit creates the Moov account and completes the section', async () => {
    const c = client()
    const result = await c.submitOnboardingSection(wio, {
      step: 'business',
      data: { ...business, selectedPaymentMethods: ['ach'] },
    })
    expect(result.success).toBe(true)
    expect(result.moovAccountId).toBeTruthy()
    const status = await c.getOnboardingStatus(wio)
    expect(status.businessProfileStatus).toBe('Completed')
    expect(resolveOnboardingResumeStep(status)).toBe('officer')
  })
})

describe('banking eligibility & guards (mock)', () => {
  test('adding a bank before business profile is a 422 eligibility error', async () => {
    const c = client()
    const err = await c.registerBankAccount(wio, {
        method: 'manual',
        holderName: 'Bison Energy LLC',
        routingNumber: '021000021',
        accountNumber: '1234567890',
      })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(BisonApiError)
    expect((err as BisonApiError).status).toBe(422)
    expect(['ADDRESS_NOT_SET', 'NON_US_ADDRESS']).toContain((err as BisonApiError).errorCode)
  })

  test('after business profile, first manual account is unverified and auto-default; re-add is 409', async () => {
    const c = client()
    await c.submitOnboardingSection(wio, { step: 'business', data: { ...business, selectedPaymentMethods: ['ach'] } })
    const account = await c.registerBankAccount(wio, {
      method: 'manual',
      holderName: 'Bison Energy LLC',
      routingNumber: '021000021',
      accountNumber: '1234567890',
    })
    expect(account.isVerified).toBe(false)
    expect(account.isDefault).toBe(true)
    const dup = await c.registerBankAccount(wio, {
        method: 'manual',
        holderName: 'Bison Energy LLC',
        routingNumber: '021000021',
        accountNumber: '1234567890',
      })
      .catch((e: unknown) => e)
    expect((dup as BisonApiError).status).toBe(409)
  })

  test('micro-deposit verify accepts MV1234, rejects a wrong code', async () => {
    const c = client()
    await c.submitOnboardingSection(wio, { step: 'business', data: { ...business, selectedPaymentMethods: ['ach'] } })
    const account = await c.registerBankAccount(wio, {
      method: 'manual',
      holderName: 'Bison Energy LLC',
      routingNumber: '021000021',
      accountNumber: '1234567890',
    })
    const bad = await c.completeBankAccountVerification(wio, account.id, { code: 'MV9999' }).catch((e: unknown) => e)
    expect((bad as BisonApiError).status).toBe(400)
    await c.completeBankAccountVerification(wio, account.id, { code: 'MV1234' })
    const [verified] = await c.getBankAccounts(wio)
    expect(verified.isVerified).toBe(true)
  })
})

describe('real API contract', () => {
  test('uses the fixed production URL and API-key header', async () => {
    let request: { url: string; headers: Headers } | undefined
    setupBison('  public_test_key  ', {
      fetch: async (input, init) => {
        request = { url: String(input), headers: new Headers(init?.headers) }
        return new Response('{"success":true,"data":{"id":"user_1"}}')
      },
    })

    await getUser()
    expect(request?.url).toBe(`${BISON_API_URL}/api/auth/me`)
    expect(request?.headers.get('X-Embeddable-Key')).toBe('public_test_key')
    expect(request?.headers.has('Authorization')).toBe(false)
    expect(() => http({ apiKey: ' ' })).toThrow('apiKey is required')
    expect(() => http({ apiKey: 'key', baseUrl: 'http://example.com' })).toThrow('baseUrl must use HTTPS')
  })

  test('all exported client methods use the agreed routes', async () => {
    const calls: Array<[string, RequestOptions | undefined]> = []
    const transport: Transport = async <T>(path: string, options?: RequestOptions) => {
      calls.push([path, options])
      return {} as T
    }
    const c = createClient({ transport })
    const entity: Scope = { persona: 'wio', id: 'wio/1', entityId: 'entity/1' }
    const operator: Scope = { persona: 'operator', id: 'operator/1' }

    await c.getUser()
    await c.getOnboardingStatus(entity)
    for (const step of ['business', 'officer', 'owners', 'volume', 'documents'] as const) {
      await c.getOnboardingSection(entity, step)
    }
    await c.submitOnboardingSection(entity, { step: 'business', data: {} as never })
    await c.submitOnboardingSection(entity, { step: 'officer', data: {} as never, existingRepresentativeId: 'rep/1' })
    await c.submitOnboardingSection(entity, { step: 'owners', data: [], noOwnersAbove25: true, existingMappings: [{ representativeId: 'rep/1', ownerIndex: 0 }] })
    await c.submitOnboardingSection(entity, { step: 'volume', data: {} as never })
    await c.uploadOnboardingDocument(entity, new File(['test'], 'test.txt'))
    await c.saveOnboardingPaymentMethods(entity, ['ach'])
    await c.getOnboardingIndustries(entity)
    await c.getOnboardingIndustries(operator)
    await c.getOnboardingTermsToken()
    await c.getPlaidLinkToken(entity)
    await c.registerBankAccount(entity, { method: 'manual', holderName: 'Test', routingNumber: '021000021', accountNumber: '1' })
    await c.registerBankAccount(entity, { method: 'plaid', publicToken: 'public', accountId: 'account' })
    await c.getBankAccounts(operator)
    await c.initiateBankAccountVerification(operator, 'bank/1')
    await c.completeBankAccountVerification(operator, 'bank/1', { code: 'MV1234' })
    await c.setDefaultBankAccount(operator, 'bank/1')
    await c.deleteBankAccount(operator, 'bank/1')

    expect(calls.map(([path, options]) => `${options?.method ?? 'GET'} /${path}`)).toEqual([
      'GET /api/auth/me',
      'GET /api/wios/wio%2F1/entities/entity%2F1/kyb/status',
      'GET /api/wios/wio%2F1/entities/entity%2F1/kyb/business-profile',
      'GET /api/wios/wio%2F1/entities/entity%2F1/kyb/control-officer',
      'GET /api/wios/wio%2F1/entities/entity%2F1/kyb/beneficial-owners',
      'GET /api/wios/wio%2F1/entities/entity%2F1/kyb/processing-volume',
      'GET /api/wios/wio%2F1/entities/entity%2F1/kyb/documents',
      'POST /api/wios/wio%2F1/entities/entity%2F1/kyb/business-profile',
      'POST /api/wios/wio%2F1/entities/entity%2F1/kyb/control-officer',
      'POST /api/wios/wio%2F1/entities/entity%2F1/kyb/beneficial-owners',
      'POST /api/wios/wio%2F1/entities/entity%2F1/kyb/processing-volume',
      'POST /api/wios/wio%2F1/entities/entity%2F1/kyb/documents',
      'POST /api/wios/wio%2F1/entities/entity%2F1/kyb/payment-method-capabilities',
      'GET /api/wios/kyb/industries',
      'GET /api/operators/kyb/industries',
      'POST /api/moov/tos-token',
      'POST /api/plaid/embeddable/create-token',
      'POST /api/wios/wio%2F1/entities/entity%2F1/bank-accounts/manual',
      'POST /api/plaid/embeddable/register-bank-account',
      'GET /api/operators/operator%2F1/bank-accounts',
      'POST /api/operators/operator%2F1/bank-accounts/bank%2F1/initiate-verification',
      'POST /api/operators/operator%2F1/bank-accounts/bank%2F1/complete-verification',
      'PUT /api/operators/operator%2F1/bank-accounts/bank%2F1/set-default',
      'DELETE /api/operators/operator%2F1/bank-accounts/bank%2F1',
    ])
    expect(calls[8][1]?.query).toEqual({ existingRepresentativeId: 'rep/1' })
    expect(calls[9][1]?.query).toEqual({ noOwnersAbove25: true, existingMappingsJson: '[{"representativeId":"rep/1","ownerIndex":0}]' })
    expect(calls[16][1]?.query).toEqual({ entityId: 'entity/1' })
  })
})
