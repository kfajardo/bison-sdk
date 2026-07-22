// Phase 3 — onboarding section definitions + renderers shared by the onboarding
// elements. onboarding.ts reuses renderSection / collectSection / the payload
// builders here.

import { z } from 'zod'
import type {
  BeneficialOwnerPayload,
  BusinessProfilePayload,
  ControlOfficerPayload,
  OnboardingStep,
  OnboardingSubmit,
  ProcessingVolumePayload,
} from '../core/types.js'
import {
  ALL_US_REGIONS,
  BUSINESS_TYPES,
  beneficialOwnerSchema,
  businessProfileSchema,
  controlOfficerSchema,
  digitsOnly,
  processingVolumeSchema,
  validateAddressNotMatchingBusiness,
  validateForm,
  validateOwnershipTotal,
  type StepErrors,
} from '../validation/index.js'
import { el } from './dom.js'
import { readFields, renderFields, setFieldValues, showErrors, slotPlaceholder, type FieldSpec } from './form.js'

export interface SectionSpec {
  step: OnboardingStep
  title: string
  fields: FieldSpec[]
  schema: z.ZodTypeAny
  /** Repeatable fieldset (beneficial owners). */
  repeat?: { itemLabel: string; addLabel: string }
}

const stateField: FieldSpec = { name: 'state', label: 'State', type: 'select', options: ALL_US_REGIONS }

const personFields: FieldSpec[] = [
  { name: 'firstName', label: 'First name', autocomplete: 'given-name' },
  { name: 'lastName', label: 'Last name', autocomplete: 'family-name' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone', type: 'tel' },
  { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
  { name: 'ssn', label: 'SSN', placeholder: 'XXX-XX-XXXX' },
  { name: 'addressLine1', label: 'Home address' },
  { name: 'city', label: 'City' },
  stateField,
  { name: 'postalCode', label: 'ZIP code' },
]

const businessFields: FieldSpec[] = [
  { name: 'legalBusinessName', label: 'Legal business name', autocomplete: 'organization' },
  { name: 'doingBusinessAs', label: 'Doing business as (optional)' },
  { name: 'ein', label: 'EIN', placeholder: 'XX-XXXXXXX' },
  { name: 'businessType', label: 'Business type', type: 'select', options: BUSINESS_TYPES },
  { name: 'description', label: 'Business description', type: 'textarea' },
  { name: 'website', label: 'Business website (optional)' },
  { name: 'phone', label: 'Business phone', type: 'tel' },
  { name: 'email', label: 'Business email', type: 'email' },
  { name: 'addressLine1', label: 'Business address' },
  { name: 'addressLine2', label: 'Address line 2 (optional)' },
  { name: 'city', label: 'City' },
  stateField,
  { name: 'zipCode', label: 'ZIP code' },
  { name: 'country', label: 'Country', type: 'select', options: [{ value: 'US', label: 'United States' }] },
]

/** The four form-backed KYB sections. `documents` is handled by onboarding.ts (upload UI). */
export const SECTIONS: Record<Exclude<OnboardingStep, 'documents'>, SectionSpec> = {
  business: { step: 'business', title: 'Business information', fields: businessFields, schema: businessProfileSchema },
  officer: {
    step: 'officer',
    title: 'Control officer',
    fields: [...personFields.slice(0, 2), { name: 'title', label: 'Job title' }, ...personFields.slice(2)],
    schema: controlOfficerSchema,
  },
  owners: {
    step: 'owners',
    title: 'Beneficial owners',
    fields: [...personFields.slice(0, 6), { name: 'ownershipPercentage', label: 'Ownership %', type: 'number' }, ...personFields.slice(6)],
    schema: beneficialOwnerSchema,
    repeat: { itemLabel: 'Owner', addLabel: 'Add another owner' },
  },
  volume: {
    step: 'volume',
    title: 'Processing volume',
    fields: [
      { name: 'averageMonthlyVolume', label: 'Average monthly volume (USD)', type: 'number' },
      { name: 'averageTransactionAmount', label: 'Average transaction amount (USD)', type: 'number' },
      { name: 'maxTransactionAmount', label: 'Maximum transaction amount (USD)', type: 'number' },
    ],
    schema: processingVolumeSchema,
  },
}

export function sectionSpec(step: OnboardingStep): SectionSpec | undefined {
  return step === 'documents' ? undefined : SECTIONS[step]
}

// ── Rendering (shared by the onboarding accordion) ────────────────────────────

/** Render a section's form body into `form`. For repeatable sections, `owners`
 *  seeds the fieldsets; onAdd/onRemove re-render. Prefill via `prefill`. */
export function renderSection(
  form: HTMLFormElement,
  spec: SectionSpec,
  opts: {
    owners?: Record<string, string>[]
    prefill?: Record<string, string>
    onAdd?: () => void
    onRemove?: (index: number) => void
  } = {},
): void {
  form.className = `bison-onboarding__form bison-onboarding__form--${spec.step}`
  form.noValidate = true
  form.append(slotPlaceholder(`section-intro:${spec.step}`))

  if (spec.repeat) {
    const owners = opts.owners?.length ? opts.owners : [{}]
    owners.forEach((owner, index) => {
      const fieldset = el('fieldset', { class: 'bison-onboarding__repeat-item', 'data-index': index })
      fieldset.append(el('legend', { class: 'bison-onboarding__repeat-legend', text: `${spec.repeat!.itemLabel} ${index + 1}` }))
      renderFields(fieldset, spec.fields)
      setFieldValues(fieldset, owner)
      if (owners.length > 1 && opts.onRemove) {
        fieldset.append(
          el('button', { type: 'button', class: 'bison-onboarding__button bison-onboarding__button--remove', text: 'Remove', onClick: () => opts.onRemove!(index) }),
        )
      }
      form.append(fieldset)
    })
    if (opts.onAdd) {
      form.append(
        el('button', { type: 'button', class: 'bison-onboarding__button bison-onboarding__button--add', text: spec.repeat.addLabel, onClick: opts.onAdd }),
      )
    }
  } else {
    renderFields(form, spec.fields)
    if (opts.prefill) setFieldValues(form, opts.prefill)
  }

  const err = el('p', { class: 'bison-onboarding__error', role: 'alert' })
  err.hidden = true
  form.append(err)
}

/** Read a repeatable section's fieldsets into owner records. */
export function collectOwners(form: HTMLElement): Record<string, string>[] {
  return Array.from(form.querySelectorAll<HTMLElement>('.bison-onboarding__repeat-item')).map(readFields)
}

// ── Validation (shared) ───────────────────────────────────────────────────────

/** Validate a single-record section; layers the officer/business-address clash rule. */
export function validateSection(spec: SectionSpec, record: Record<string, string>, business?: Record<string, string>): StepErrors {
  const errors = validateForm(spec.schema, record)
  if (spec.step === 'officer' && !errors.addressLine1 && business) {
    const clash = addressClash(record, business)
    if (clash) errors.addressLine1 = clash
  }
  return errors
}

function addressClash(record: Record<string, string>, business: Record<string, string>): string | null {
  return validateAddressNotMatchingBusiness(
    { addressLine1: record.addressLine1, city: record.city, state: record.state, postalCode: record.postalCode },
    { addressLine1: business.addressLine1, city: business.city, state: business.state, zipCode: business.zipCode },
  )
}

/** Validate every owner fieldset + the ownership-total rule. Writes errors into the DOM.
 *  Returns { valid, total } where total is the cross-fieldset ownership message (or null). */
export function validateOwnersForm(
  form: HTMLElement,
  spec: SectionSpec,
  business?: Record<string, string>,
): { valid: boolean; total: string | null } {
  let valid = true
  const fieldsets = Array.from(form.querySelectorAll<HTMLElement>('.bison-onboarding__repeat-item'))
  const records = fieldsets.map(readFields)
  fieldsets.forEach((fieldset, i) => {
    const record = records[i]
    const empty = Object.values(record).every((v) => !v)
    const errors = empty && fieldsets.length === 1 ? {} : validateForm(spec.schema, record)
    if (!errors.addressLine1 && business && !empty) {
      const clash = addressClash(record, business)
      if (clash) errors.addressLine1 = clash
    }
    showErrors(fieldset, errors)
    if (Object.keys(errors).length) valid = false
  })
  const total = validateOwnershipTotal(records.filter((r) => r.ownershipPercentage))
  if (total) valid = false
  return { valid, total }
}

// ── Payload builders (form record -> typed core payload) ──────────────────────

function splitDob(value: string): { birthYear?: number; birthMonth?: number; birthDay?: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return {}
  return { birthYear: Number(m[1]), birthMonth: Number(m[2]), birthDay: Number(m[3]) }
}

export function buildBusinessProfile(r: Record<string, string>, selectedPaymentMethods?: BusinessProfilePayload['selectedPaymentMethods'], tosToken?: string): BusinessProfilePayload {
  return {
    legalBusinessName: r.legalBusinessName,
    doingBusinessAs: r.doingBusinessAs || undefined,
    ein: r.ein || undefined,
    businessType: r.businessType,
    industry: r.industry || undefined,
    description: r.description || undefined,
    website: r.website || undefined,
    phone: digitsOnly(r.phone),
    email: r.email || undefined,
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2 || undefined,
    city: r.city,
    state: r.state,
    zipCode: digitsOnly(r.zipCode).slice(0, 5),
    selectedPaymentMethods,
    tosToken,
  }
}

function personCore(r: Record<string, string>): ControlOfficerPayload {
  return {
    firstName: r.firstName,
    lastName: r.lastName,
    jobTitle: r.title ?? r.jobTitle ?? '',
    email: r.email,
    phone: digitsOnly(r.phone),
    ...splitDob(r.dateOfBirth ?? ''),
    ssn: r.ssn || undefined,
    addressLine1: r.addressLine1,
    city: r.city,
    state: r.state,
    zipCode: digitsOnly(r.postalCode ?? '').slice(0, 5),
  }
}

export function buildControlOfficer(r: Record<string, string>): ControlOfficerPayload {
  return personCore(r)
}

export function buildBeneficialOwner(r: Record<string, string>): BeneficialOwnerPayload {
  return { ...personCore(r), ownershipPercentage: parseInt(r.ownershipPercentage, 10) }
}

export function buildProcessingVolume(r: Record<string, string>): ProcessingVolumePayload {
  const num = (v: string) => parseInt(digitsOnly(v || '0'), 10) || 0
  return {
    averageMonthlyTransactionCount: 0,
    averageMonthlyDollarVolume: num(r.averageMonthlyVolume),
    averageIndividualTransactionSize: num(r.averageTransactionAmount),
    maximumIndividualTransactionSize: num(r.maxTransactionAmount),
  }
}

/** Build the OnboardingSubmit for a form-backed section from its collected record(s). */
export function buildSubmit(step: OnboardingStep, record: Record<string, string>, owners?: Record<string, string>[]): OnboardingSubmit {
  switch (step) {
    case 'business':
      return { step, data: buildBusinessProfile(record) }
    case 'officer':
      return { step, data: buildControlOfficer(record) }
    case 'owners': {
      const filled = (owners ?? []).filter((o) => Object.values(o).some(Boolean))
      return { step, data: filled.map(buildBeneficialOwner), noOwnersAbove25: filled.length === 0 }
    }
    case 'volume':
      return { step, data: buildProcessingVolume(record) }
    default:
      throw new Error(`buildSubmit: ${step} has no form payload`)
  }
}
