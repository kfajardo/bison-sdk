import { describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { createClient, mock } from '../src/core/client'
import { setupBison } from '../src/core/sdk'
import type { BisonClient } from '../src/core/client'
import type { Scope } from '../src/core/scope'

if (typeof document === 'undefined') GlobalRegistrator.register()
const { defineBisonComponents } = await import('../src/components/index')
const { BisonOnboarding } = await import('../src/components/elements')
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
  test('uses the shared setup without assigning .client', async () => {
    let key: string | null = null
    setupBison('public_test_key', {
      baseUrl: 'https://api.test',
      fetch: async (_input, init) => {
        key = new Headers(init?.headers).get('X-Embeddable-Key')
        return new Response(JSON.stringify({
          success: true,
          data: {
            businessProfileStatus: 'NotStarted',
            controlOfficerStatus: 'NotStarted',
            beneficialOwnersStatus: 'NotStarted',
            processingVolumeStatus: 'NotStarted',
            documents: [],
            capabilities: [],
            isComplete: false,
          },
        }))
      },
    })
    document.body.replaceChildren()
    document.body.innerHTML = '<bison-onboarding persona="wio" scope-id="wio_1"></bison-onboarding>'
    await settle()
    expect(document.querySelector('bison-onboarding')).toBeTruthy()
    expect(key).toBe('public_test_key')
  })

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
    await client.submitOnboardingSection(wio, {
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

describe('prefill', () => {
  test('accordion: .prefill seeds the business form fields', async () => {
    document.body.replaceChildren()
    const el = document.createElement('bison-onboarding') as InstanceType<typeof BisonOnboarding>
    el.setAttribute('persona', 'wio')
    el.setAttribute('scope-id', 'wio_1')
    el.client = createClient({ transport: mock() })
    el.prefill = { business: { legalBusinessName: 'Bison Energy LLC', city: 'Houston' } }
    document.body.appendChild(el)
    await el.refresh()
    await settle()
    expect(el.querySelector<HTMLInputElement>('.bison-field__input[name="legalBusinessName"]')!.value).toBe('Bison Energy LLC')
    expect(el.querySelector<HTMLInputElement>('.bison-field__input[name="city"]')!.value).toBe('Houston')
  })

  test('accordion: state is accessible but not shown as a raw badge', async () => {
    document.body.replaceChildren()
    const el = document.createElement('bison-onboarding') as InstanceType<typeof BisonOnboarding>
    el.setAttribute('persona', 'wio')
    el.setAttribute('scope-id', 'wio_1')
    el.client = createClient({ transport: mock() })
    el.labels = { active: 'In progress', locked: 'Finish business first', business: 'Company details' }
    document.body.appendChild(el)
    await el.refresh()
    await settle()
    const business = el.querySelector('.bison-onboarding__section[data-step="business"]')!
    expect(business.querySelector('.bison-onboarding__section-title')!.textContent).toBe('Company details')
    expect(business.querySelector('.bison-onboarding__section-badge')).toBeNull()
    expect(business.querySelector('.bison-onboarding__section-header')!.getAttribute('aria-label')).toBe('Company details: In progress')
    expect(el.querySelector('[data-step="officer"] .bison-onboarding__section-header')!.getAttribute('aria-label')).toBe('Control officer: Finish business first')
    expect(business.getAttribute('data-state')).toBe('active')
  })
})

describe('bison-bank-accounts delete guards (frontend-only)', () => {
  test('cannot delete the only account (it is default): delete disabled', async () => {
    const client = createClient({ transport: mock() })
    await client.submitOnboardingSection(wio, {
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
    await client.registerBankAccount(wio, {
      method: 'manual',
      holderName: 'Bison Energy LLC',
      routingNumber: '021000021',
      accountNumber: '1234567890',
    })
    document.body.replaceChildren()
    const el = document.createElement('bison-bank-accounts') as HTMLElement & { client?: BisonClient }
    el.setAttribute('persona', 'wio')
    el.setAttribute('scope-id', 'wio_1')
    el.client = client
    document.body.appendChild(el)
    await settle()
    await settle()
    const row = el.querySelector('.bison-bank-accounts__row')
    expect(row).toBeTruthy()
    const del = el.querySelector<HTMLButtonElement>('.bison-bank-accounts__button--delete')
    expect(del?.disabled).toBe(true)
  })
})
