import { describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { createClient, createMockState, mock } from '../src/core/client'
import type { BisonClient, MockState } from '../src/core/client'
import type { OnboardingSubmit } from '../src/core/types'

if (typeof document === 'undefined') GlobalRegistrator.register()
const { defineBisonComponents } = await import('../src/components/index')
const { BisonOnboardingPartial } = await import('../src/components/partial')
const { setFieldValues } = await import('../src/components/form')
defineBisonComponents()

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const CONTACT = {
  corporationName: 'Bison Energy LLC',
  website: 'bison.example.com',
  phone: '(555) 123-4567',
  line1: '100 Main St',
  line2: '',
  city: 'Houston',
  state: 'TX',
  zip: '77002',
}
const INCORPORATION = { state: 'TX', ein: '12-3456789' }
const LEADERSHIP = {
  legalName: 'Jane Doe',
  title: 'CEO',
  birthDate: '1980-01-15',
  taxId: '123-45-6789',
  line1: '200 Oak Ave',
  line2: '',
  city: 'Austin',
  state: 'TX',
  zip: '73301',
}
const OWNER = {
  legalName: 'John Smith',
  birthDate: '1985-03-20',
  taxId: '987-65-4321',
  ownershipPercentage: '25',
  line1: '300 Elm St',
  line2: '',
  city: 'Dallas',
  state: 'TX',
  zip: '75201',
}

function spyClient(seed?: Partial<MockState>) {
  const client = createClient({ transport: mock({ seed: createMockState(seed) }) })
  const submits: OnboardingSubmit[] = []
  const original = client.submitOnboardingSection
  client.submitOnboardingSection = (scope, submit) => {
    submits.push(submit)
    return original(scope, submit)
  }
  return { client, submits }
}

function mount(client: BisonClient): InstanceType<typeof BisonOnboardingPartial> {
  document.body.replaceChildren()
  const host = document.createElement('bison-onboarding-partial') as InstanceType<typeof BisonOnboardingPartial>
  host.setAttribute('persona', 'wio')
  host.setAttribute('scope-id', 'wio_1')
  host.client = client
  document.body.appendChild(host)
  return host
}

function fillSection(host: HTMLElement, selector: string, values: Record<string, string>): void {
  setFieldValues(host.querySelector<HTMLElement>(selector)!, values)
  host.querySelector('form')!.dispatchEvent(new Event('input', { bubbles: true }))
}

function check(host: HTMLElement, name: string, checked = true): void {
  const input = host.querySelector<HTMLInputElement>(`[name="${name}"]`)!
  input.checked = checked
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function fillRequiredSections(host: HTMLElement): void {
  fillSection(host, '.bison-partial__section--contact', CONTACT)
  fillSection(host, '.bison-partial__section--incorporation', INCORPORATION)
  fillSection(host, '.bison-partial__section--leadership', LEADERSHIP)
}

async function submitWithoutOwners(host: HTMLElement): Promise<void> {
  fillRequiredSections(host)
  check(host, 'noOwnersAbove25')
  check(host, 'termsAccepted')
  host.querySelector<HTMLButtonElement>('.bison-partial__button--submit')!.click()
  await settle()
}

describe('bison-onboarding-partial', () => {
  test('renders the unstyled partial onboarding sections without native fieldset borders', () => {
    const host = mount(createClient({ transport: mock() }))
    expect(Array.from(host.querySelectorAll('.bison-partial__section-title')).map((item) => item.textContent)).toEqual([
      'Contact information',
      'Incorporation details',
      'Leadership',
      'Ownership',
      'Payment services terms',
      'Banking',
    ])
    expect(host.querySelector('fieldset')).toBeNull()
    expect(host.querySelector('[name="routingNumber"]')).toBeNull()
  })

  test('submits a manual bank account without listing accounts', async () => {
    const client = createClient({ transport: mock() })
    let listCalls = 0
    const list = client.getBankAccounts
    client.getBankAccounts = (...args) => {
      listCalls++
      return list(...args)
    }
    const host = mount(client)
    await submitWithoutOwners(host)
    await settle()

    expect(host.querySelector('bison-bank-accounts')).toBeNull()
    expect(host.querySelector('[name="routingNumber"]')).not.toBeNull()
    expect(host.querySelector('.bison-bank-accounts__button--plaid')).toBeNull()
    expect(listCalls).toBe(0)

    fillSection(host, '.bison-partial__section--banking', {
      holderName: 'Bison Energy LLC',
      routingNumber: '021000021',
      accountNumber: '123456789',
      bankAccountType: 'checking',
    })
    host.querySelector<HTMLButtonElement>('.bison-bank-accounts__button--add-manual')!.click()
    await settle()
    expect(host.querySelector('.bison-bank-accounts__success')?.textContent).toBe('Bank account submitted.')
    expect(host.querySelector('.bison-bank-accounts__list')).toBeNull()
    expect(listCalls).toBe(0)
  })

  test('requires every section, ownership certification, and Bison consent', () => {
    const host = mount(createClient({ transport: mock() }))
    const submit = host.querySelector<HTMLButtonElement>('.bison-partial__button--submit')!
    fillRequiredSections(host)
    expect(submit.disabled).toBe(true)
    check(host, 'noOwnersAbove25')
    expect(submit.disabled).toBe(true)
    check(host, 'termsAccepted')
    expect(submit.disabled).toBe(false)
    fillSection(host, '.bison-partial__section--incorporation', { ...INCORPORATION, ein: '123456789' })
    expect(submit.disabled).toBe(true)
  })

  test('requires valid 25-100% owner details and ownership confirmation', () => {
    const host = mount(createClient({ transport: mock() }))
    const submit = host.querySelector<HTMLButtonElement>('.bison-partial__button--submit')!
    fillRequiredSections(host)
    check(host, 'termsAccepted')
    host.querySelector<HTMLButtonElement>('.bison-partial__button--add-owner')!.click()
    fillSection(host, '.bison-partial__owner', { ...OWNER, ownershipPercentage: '24' })
    check(host, 'ownershipConfirmed')
    expect(submit.disabled).toBe(true)
    fillSection(host, '.bison-partial__owner', OWNER)
    expect(submit.disabled).toBe(false)
  })

  test('new entity submits combined business/control officer, then beneficial owners', async () => {
    const { client, submits } = spyClient()
    const host = mount(client)
    let completed = false
    host.addEventListener('bison-partial-complete', () => { completed = true })
    await submitWithoutOwners(host)

    expect(submits.map((submit) => submit.step)).toEqual(['business', 'owners'])
    expect(submits[0].step === 'business' && submits[0].data).toMatchObject({
      legalBusinessName: 'Bison Energy LLC',
      businessType: 'corporation',
      ein: '123456789',
      incorporationState: 'TX',
      termsAccepted: true,
      controlOfficer: { firstName: 'Jane', lastName: 'Doe', ssn: '123456789' },
    })
    expect(submits[1].step === 'owners' && submits[1].noOwnersAbove25).toBe(true)
    expect(completed).toBe(true)
    expect((await client.getOnboardingStatus({ persona: 'wio', id: 'wio_1' })).isKybReady).toBe(true)
  })

  test('existing provider entity updates its control officer before owners', async () => {
    const { client, submits } = spyClient({
      moovAccountId: 'provider_1',
      controlOfficerRepresentativeId: 'rep_1',
    })
    await submitWithoutOwners(mount(client))
    expect(submits.map((submit) => submit.step)).toEqual(['business', 'officer', 'owners'])
    expect(submits[1].step === 'officer' && submits[1].existingRepresentativeId).toBe('rep_1')
  })
})
