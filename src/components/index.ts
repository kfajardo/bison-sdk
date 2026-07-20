// Phase 3 — public entry for the web components. defineBisonComponents() registers
// all custom elements (idempotent); the element classes and the shared helpers are
// re-exported for consumers composing their own UI.

export { BisonOnboarding } from './onboarding.js'
export type { BisonSectionClient } from './onboarding.js'
export { BisonOnboardingStep } from './steps.js'
export { BisonBankCrud, normalizeVerificationCode } from './bank_crud.js'
export type { PlaidLinkHook, PlaidLinkResult } from './bank_crud.js'
export {
  SECTIONS,
  sectionSpec,
  renderSection,
  collectOwners,
  validateSection,
  validateOwnersForm,
  buildSubmit,
  buildBusinessProfile,
  buildControlOfficer,
  buildBeneficialOwner,
  buildProcessingVolume,
  type SectionSpec,
} from './steps.js'
export {
  renderField,
  renderFields,
  readFields,
  readFiles,
  setFieldValues,
  showErrors,
  slotPlaceholder,
  type FieldSpec,
} from './form.js'
export { projectSlots, harvestSlots, applySlots } from './slots.js'
export { el, setState, emit } from './dom.js'

import { BisonOnboarding } from './onboarding.js'
import { BisonOnboardingStep } from './steps.js'
import { BisonBankCrud } from './bank_crud.js'

/** Registers <bison-onboarding>, <bison-onboarding-step>, <bison-bank-crud>.
 *  Idempotent — safe to call more than once. */
export function defineBisonComponents(): void {
  if (typeof customElements === 'undefined') {
    throw new Error('bison-jib-sdk/components requires a browser environment')
  }
  if (!customElements.get('bison-onboarding')) customElements.define('bison-onboarding', BisonOnboarding)
  if (!customElements.get('bison-onboarding-step')) customElements.define('bison-onboarding-step', BisonOnboardingStep)
  if (!customElements.get('bison-bank-crud')) customElements.define('bison-bank-crud', BisonBankCrud)
}
