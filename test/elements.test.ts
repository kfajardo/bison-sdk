import { describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { createClient, mock } from '../src/core/client'
import type { BisonClient } from '../src/core/client'
import type { Scope } from '../src/core/scope'

GlobalRegistrator.register()
const { defineBisonComponents } = await import('../src/components/index')
const { BisonOnboarding, BisonOnboardingStep } = await import('../src/components/elements')
defineBisonComponents()

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const wio: Scope = { persona: 'wio', id: 'wio_1' }

function mountOnboarding(client: BisonClient): InstanceType<typeof BisonOnboarding> {
  document.body.replaceChildren()
  const el = document.createElement('bison-onboarding') as InstanceType<typeof BisonOnboarding>
  el.setAttribute('persona', 'wio')
  el.setAttribute('scope-id', 'wio_1')
  el.client = client
  document.body.appendChild(el)
  return el
}

describe('bison-onboarding gating', () => {
  test('fresh account: 5 sections, business active, the rest locked', async () => {
    const el = mountOnboarding(createClient({ transport: mock() }))
    await el.refresh()
    await settle()
    const items = el.querySelectorAll('.bison-onboarding__section')
    expect(items.length).toBe(5)
    expect(el.querySelector('[data-state="active"][data-step="business"]')).toBeTruthy()
    // officer/owners/volume/documents locked until business completes
    expect(el.querySelectorAll('[data-state="locked"]').length).toBe(4)
  })

  test('after business profile is completed, later sections unlock', async () => {
    const client = createClient({ transport: mock() })
    await client.onboarding.submit(wio, {
      step: 'business',
      data: {
        legalBusinessName: 'Bison Energy LLC',
        ein: '12-3456789',
        businessType: 'llc',
        phone: '5551234567',
        addressLine1: '100 Main St',
        city: 'Houston',
        state: 'TX',
        zipCode: '77002',
        selectedPaymentMethods: ['ach'],
      },
    })
    const el = mountOnboarding(client)
    await el.refresh()
    await settle()
    expect(el.querySelectorAll('[data-state="locked"]').length).toBe(0)
    expect(el.querySelector('[data-step="business"][data-state="done"]')).toBeTruthy()
  })
})

describe('bison-onboarding-step (partial onboarding)', () => {
  test('standalone officer step validates required fields and exposes value', async () => {
    document.body.replaceChildren()
    const el = document.createElement('bison-onboarding-step') as InstanceType<typeof BisonOnboardingStep>
    el.setAttribute('step', 'officer')
    el.setAttribute('persona', 'wio')
    el.setAttribute('scope-id', 'wio_1')
    document.body.appendChild(el)
    await settle()
    expect(el.querySelector('.bison-step--officer')).toBeTruthy()
    const errors = el.validate()
    expect(errors.firstName).toBe('Required')
    const input = el.querySelector<HTMLInputElement>('.bison-field__input[name="firstName"]')!
    input.value = 'Jane'
    expect(el.value.firstName).toBe('Jane')
  })
})

describe('bison-bank-crud delete guards (frontend-only)', () => {
  test('cannot delete the only account (it is default): delete disabled', async () => {
    const client = createClient({ transport: mock() })
    await client.onboarding.submit(wio, {
      step: 'business',
      data: {
        legalBusinessName: 'Bison Energy LLC',
        ein: '12-3456789',
        businessType: 'llc',
        phone: '5551234567',
        addressLine1: '100 Main St',
        city: 'Houston',
        state: 'TX',
        zipCode: '77002',
        selectedPaymentMethods: ['ach'],
      },
    })
    await client.banking.register(wio, {
      method: 'manual',
      holderName: 'Bison Energy LLC',
      routingNumber: '021000021',
      accountNumber: '1234567890',
    })
    document.body.replaceChildren()
    const el = document.createElement('bison-bank-crud') as HTMLElement & { client?: BisonClient }
    el.setAttribute('persona', 'wio')
    el.setAttribute('scope-id', 'wio_1')
    el.client = client
    document.body.appendChild(el)
    await settle()
    await settle()
    const row = el.querySelector('.bison-bank-crud__row')
    expect(row).toBeTruthy()
    const del = el.querySelector<HTMLButtonElement>('.bison-bank-crud__button--delete')
    expect(del?.disabled).toBe(true)
  })
})
