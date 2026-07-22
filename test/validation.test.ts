import { describe, expect, test } from 'bun:test'
import {
  beneficialOwnerSchema,
  businessProfileSchema,
  controlOfficerSchema,
  isPOBox,
  operatorBusinessProfileSchema,
  processingVolumeSchema,
  validatePartialOnboardingOwner,
  validatePartialOnboardingStep,
  validateAddressNotMatchingBusiness,
  validateForm,
  validateOwnershipTotal,
} from '../src/validation'
import type { PartialOnboardingValues } from '../src/validation'

const validBusiness = {
  legalBusinessName: 'Bison Energy LLC',
  doingBusinessAs: '',
  ein: '12-3456789',
  businessType: 'llc',
  description: 'Oil and gas working interest owner',
  website: 'https://bison.example.com',
  phone: '(555) 123-4567',
  email: 'ops@bison.example.com',
  addressLine1: '100 Main St',
  addressLine2: '',
  city: 'Houston',
  state: 'TX',
  country: 'US',
  zipCode: '77002',
}

const validOfficer = {
  firstName: 'Jane',
  lastName: 'Doe',
  title: 'CFO',
  email: 'jane@bison.example.com',
  phone: '5551234567',
  dateOfBirth: '1980-01-15',
  ssn: '123-45-6789',
  addressLine1: '200 Oak Ave',
  city: 'Austin',
  state: 'TX',
  postalCode: '73301',
}

describe('businessProfileSchema (wio)', () => {
  test('accepts a valid profile', () => {
    expect(validateForm(businessProfileSchema, validBusiness)).toEqual({})
  })
  test('rejects P.O. Box address, bad EIN, bad state, short zip', () => {
    const errors = validateForm(businessProfileSchema, {
      ...validBusiness,
      addressLine1: 'PO Box 42',
      ein: '123456789',
      state: 'ZZ',
      zipCode: '123',
    })
    expect(Object.keys(errors).sort()).toEqual(['addressLine1', 'ein', 'state', 'zipCode'])
  })
  test('operator variant requires dba and website, omits type/description', () => {
    const { businessType, description, ...operatorInput } = validBusiness
    expect(validateForm(operatorBusinessProfileSchema, { ...operatorInput, doingBusinessAs: '', website: '' })).toEqual({
      doingBusinessAs: 'Required',
      website: 'Required',
    })
    expect(validateForm(operatorBusinessProfileSchema, { ...operatorInput, doingBusinessAs: 'Bison Ops' })).toEqual({})
  })
})

describe('controlOfficerSchema', () => {
  test('accepts a valid officer', () => {
    expect(validateForm(controlOfficerSchema, validOfficer)).toEqual({})
  })
  test('rejects under 18 and bad SSN format', () => {
    const thisYear = new Date().getFullYear()
    const errors = validateForm(controlOfficerSchema, {
      ...validOfficer,
      dateOfBirth: `${thisYear - 10}-01-01`,
      ssn: '123456789',
    })
    expect(errors.dateOfBirth).toContain('18')
    expect(errors.ssn).toContain('XXX-XX-XXXX')
  })
})

describe('beneficialOwnerSchema', () => {
  const owner = { ...validOfficer, title: undefined, ownershipPercentage: '25' }
  test('accepts 25 and 100, rejects 24 and decimals', () => {
    expect(validateForm(beneficialOwnerSchema, owner)).toEqual({})
    expect(validateForm(beneficialOwnerSchema, { ...owner, ownershipPercentage: '100' })).toEqual({})
    expect(validateForm(beneficialOwnerSchema, { ...owner, ownershipPercentage: '24' }).ownershipPercentage).toBeTruthy()
    expect(validateForm(beneficialOwnerSchema, { ...owner, ownershipPercentage: '33.3' }).ownershipPercentage).toBeTruthy()
  })
})

describe('processingVolumeSchema', () => {
  test('rejects max below average', () => {
    const errors = validateForm(processingVolumeSchema, {
      averageMonthlyVolume: '50000',
      averageTransactionAmount: '2000',
      maxTransactionAmount: '1000',
    })
    expect(errors.maxTransactionAmount).toBeTruthy()
    expect(errors.averageTransactionAmount).toBeTruthy()
  })
})

describe('cross-field validators', () => {
  test('validateOwnershipTotal flags totals above 100', () => {
    expect(validateOwnershipTotal([{ ownershipPercentage: '60' }, { ownershipPercentage: '50' }])).toContain('110')
    expect(validateOwnershipTotal([{ ownershipPercentage: '60' }, { ownershipPercentage: '40' }])).toBeNull()
  })
  test('person address must differ from business address', () => {
    const business = { addressLine1: '100 Main St', city: 'Houston', state: 'TX', zipCode: '77002' }
    expect(
      validateAddressNotMatchingBusiness(
        { addressLine1: '100  main st', city: 'HOUSTON', state: 'tx', postalCode: '77002-1234' },
        business,
      ),
    ).toBeTruthy()
    expect(
      validateAddressNotMatchingBusiness(
        { addressLine1: '200 Oak Ave', city: 'Austin', state: 'TX', postalCode: '73301' },
        business,
      ),
    ).toBeNull()
  })
  test('isPOBox matches common P.O. Box spellings', () => {
    for (const value of ['PO Box 1', 'P.O. Box 22', 'p o box 3', 'Post Office Box 4']) {
      expect(isPOBox(value)).toBe(true)
    }
    expect(isPOBox('100 Main St')).toBe(false)
  })
})

const partialOnboardingValues: PartialOnboardingValues = {
  contact: {
    corporationName: 'Bison Energy LLC',
    website: 'bison.example.com',
    phone: '(555) 123-4567',
    address: { line1: '100 Main St', line2: '', city: 'Houston', state: 'TX', zip: '77002' },
  },
  incorporation: { state: 'TX', ein: { value: '12-3456789', provided: false } },
  leadership: {
    legalName: 'Jane Doe',
    title: 'CEO',
    birthDate: { value: '1980-01-15', provided: false },
    taxId: { value: '123-45-6789', provided: false },
    address: { line1: '200 Oak Ave', line2: '', city: 'Austin', state: 'TX', zip: '73301' },
    ownsQuarter: false,
  },
  ownership: { owners: [], noOwnersAbove25: true, ownershipConfirmed: true },
  consent: { termsAccepted: true },
}

describe('partial onboarding validation', () => {
  test('matches contact, EIN, leadership, and sensitive-value rules', () => {
    expect(validatePartialOnboardingStep('contact', partialOnboardingValues)).toEqual({})
    expect(validatePartialOnboardingStep('incorporation', partialOnboardingValues)).toEqual({})
    expect(validatePartialOnboardingStep('leadership', partialOnboardingValues)).toEqual({})
    expect(validatePartialOnboardingStep('contact', {
      ...partialOnboardingValues,
      contact: { ...partialOnboardingValues.contact, phone: '5551234567', website: 'invalid', address: { ...partialOnboardingValues.contact.address, zip: '123' } },
    })).toMatchObject({ phone: expect.any(String), website: expect.any(String), 'address.zip': expect.any(String) })
    expect(validatePartialOnboardingStep('incorporation', {
      ...partialOnboardingValues,
      incorporation: { state: 'TX', ein: { value: '', provided: true } },
    })).toEqual({})
  })

  test('requires complete 25-100% owners and ownership certification', () => {
    const owner = {
      legalName: 'John Smith',
      birthDate: { value: '1985-03-20', provided: false },
      taxId: { value: '987-65-4321', provided: false },
      ownershipPercentage: '25',
      address: { line1: '300 Elm St', line2: '', city: 'Dallas', state: 'TX', zip: '75201' },
    }
    expect(validatePartialOnboardingOwner(owner)).toEqual({})
    expect(validatePartialOnboardingOwner({ ...owner, ownershipPercentage: '24' }).ownershipPercentage).toBeTruthy()
    expect(validatePartialOnboardingStep('ownership', {
      ...partialOnboardingValues,
      ownership: { owners: [owner], noOwnersAbove25: false, ownershipConfirmed: false },
    }).ownershipConfirmed).toBeTruthy()
  })
})
