import { z } from 'zod'

export type PartialOnboardingStep = 'contact' | 'incorporation' | 'leadership' | 'ownership'

export interface PartialOnboardingAddress {
  line1: string
  line2: string
  city: string
  state: string
  zip: string
}

export interface PartialOnboardingSensitiveValue {
  value: string
  provided: boolean
}

export interface PartialOnboardingOwner {
  legalName: string
  birthDate: PartialOnboardingSensitiveValue
  taxId: PartialOnboardingSensitiveValue
  ownershipPercentage: string
  address: PartialOnboardingAddress
}

export interface PartialOnboardingValues {
  contact: {
    corporationName: string
    website: string
    phone: string
    address: PartialOnboardingAddress
  }
  incorporation: {
    state: string
    ein: PartialOnboardingSensitiveValue
  }
  leadership: {
    legalName: string
    title: string
    birthDate: PartialOnboardingSensitiveValue
    taxId: PartialOnboardingSensitiveValue
    address: PartialOnboardingAddress
    ownsQuarter: boolean
  }
  ownership: {
    owners: PartialOnboardingOwner[]
    noOwnersAbove25: boolean
    ownershipConfirmed: boolean
  }
  consent: { termsAccepted: boolean }
}

export type PartialOnboardingErrors = Record<string, string>

const required = (message: string) => z.string().trim().min(1, message)
const addressSchema = z.object({
  line1: required('Street address is required'),
  line2: z.string(),
  city: required('City is required'),
  state: required('Select a state'),
  zip: required('Enter a 5-digit ZIP').regex(/^\d{5}$/, 'Enter a 5-digit ZIP'),
})
const contactSchema = z.object({
  corporationName: required('Enter the corporation name').max(100, 'Must be 100 characters or less'),
  website: z.string().trim().refine(
    (value) => !value || /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(value),
    'Enter a valid website or leave it blank',
  ),
  phone: z.string().regex(/^\(\d{3}\) \d{3}-\d{4}$/, 'Enter a 10-digit business phone number'),
  address: addressSchema,
})

function errorsFrom(result: z.SafeParseReturnType<unknown, unknown>): PartialOnboardingErrors {
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

function validateSensitive(
  provided: boolean,
  value: string,
  pattern: RegExp,
  emptyMessage: string,
  invalidMessage: string,
): string | undefined {
  if (provided && !value) return undefined
  if (!value) return emptyMessage
  return pattern.test(value) ? undefined : invalidMessage
}

function prefixAddress(errors: PartialOnboardingErrors): PartialOnboardingErrors {
  return Object.fromEntries(Object.entries(errors).map(([key, value]) => [`address.${key}`, value]))
}

export function validatePartialOnboardingOwner(owner: PartialOnboardingOwner): PartialOnboardingErrors {
  const errors: PartialOnboardingErrors = {}
  if (owner.legalName.trim().split(/\s+/).length < 2) errors.legalName = 'Enter the full legal name'
  const birthDate = validateSensitive(
    owner.birthDate.provided,
    owner.birthDate.value,
    /^\d{4}-\d{2}-\d{2}$/,
    'Enter the date of birth',
    'Enter a valid date of birth',
  )
  const taxId = validateSensitive(
    owner.taxId.provided,
    owner.taxId.value,
    /^\d{3}-\d{2}-\d{4}$/,
    'Enter the Tax ID',
    'Enter a 9-digit SSN or ITIN (XXX-XX-XXXX)',
  )
  if (birthDate) errors.birthDate = birthDate
  if (taxId) errors.taxId = taxId
  const percentage = Number(owner.ownershipPercentage)
  if (!Number.isFinite(percentage) || percentage < 25 || percentage > 100) {
    errors.ownershipPercentage = 'Enter a percentage between 25 and 100'
  }
  return { ...errors, ...prefixAddress(errorsFrom(addressSchema.safeParse(owner.address))) }
}

export function validatePartialOnboardingStep(
  step: PartialOnboardingStep,
  values: PartialOnboardingValues,
): PartialOnboardingErrors {
  if (step === 'contact') return errorsFrom(contactSchema.safeParse(values.contact))
  if (step === 'incorporation') {
    const errors: PartialOnboardingErrors = {}
    if (!values.incorporation.state) errors.state = 'Select a state'
    const ein = validateSensitive(
      values.incorporation.ein.provided,
      values.incorporation.ein.value,
      /^\d{2}-\d{7}$/,
      'Enter the corporation EIN',
      'Enter a 9-digit EIN (XX-XXXXXXX)',
    )
    if (ein) errors.ein = ein
    return errors
  }
  if (step === 'leadership') {
    const errors: PartialOnboardingErrors = {}
    if (values.leadership.legalName.trim().split(/\s+/).length < 2) errors.legalName = 'Enter the full legal name'
    if (!values.leadership.title.trim()) errors.title = 'Enter the title'
    const birthDate = validateSensitive(
      values.leadership.birthDate.provided,
      values.leadership.birthDate.value,
      /^\d{4}-\d{2}-\d{2}$/,
      'Enter the date of birth',
      'Enter a valid date of birth',
    )
    const taxId = validateSensitive(
      values.leadership.taxId.provided,
      values.leadership.taxId.value,
      /^\d{3}-\d{2}-\d{4}$/,
      'Enter the Tax ID',
      'Enter a 9-digit SSN or ITIN (XXX-XX-XXXX)',
    )
    if (birthDate) errors.birthDate = birthDate
    if (taxId) errors.taxId = taxId
    return { ...errors, ...prefixAddress(errorsFrom(addressSchema.safeParse(values.leadership.address))) }
  }

  const leadershipIsListed = values.ownership.owners.some(
    (owner) => owner.legalName.trim().toLowerCase() === values.leadership.legalName.trim().toLowerCase(),
  )
  if (values.leadership.ownsQuarter && !leadershipIsListed) {
    return { owners: 'Add the control officer as an owner and enter the exact ownership percentage' }
  }
  if (values.ownership.noOwnersAbove25) return {}
  if (!values.ownership.owners.length) {
    return { owners: 'Add each owner with at least 25% ownership, or confirm there are none' }
  }
  if (values.ownership.owners.some((owner) => Object.keys(validatePartialOnboardingOwner(owner)).length)) {
    return { owners: 'Review the details for each beneficial owner' }
  }
  return values.ownership.ownershipConfirmed
    ? {}
    : { ownershipConfirmed: 'Confirm that all qualifying owners are listed' }
}
