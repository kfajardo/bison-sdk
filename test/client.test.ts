import { describe, expect, test } from 'bun:test'
import { createClient, mock, resolveOnboardingResumeStep } from '../src/core/client'
import { BisonApiError } from '../src/core/transport'
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
