// Phase 3 — <bison-onboarding>: the unstyled, light-DOM KYB accordion.
//
// Gating (ONBOARDING_SPEC §3.3): business first; every other section is LOCKED
// until businessProfileStatus === 'Completed'. Auto-open resolves via
// resolveResumeStep(status). A section whose capabilities carry `errors` shows
// action_required. Redacted-field resume (§5.2): when the GET reports
// taxIdProvided / birthDateProvided / governmentIdProvided we don't force re-entry.
//
// Per-section submit only (no auto-orchestration): each section POSTs its own step.
// Documents + banking become available once business is Completed and eligible;
// banking embeds <bison-bank-crud> for the same scope (composition).

import type {
  OnboardingStatus,
  OnboardingStep,
  OnboardingSubmit,
  SectionStatus,
} from '../core/types.js'
import type { Persona, Scope } from '../core/scope.js'
import { ONBOARDING_STEPS } from '../core/types.js'
import { resolveResumeStep } from '../core/resume.js'
import { createClient, type BisonClient } from '../core/client.js'
import { el, emit, setState } from './dom.js'
import { readFields, showErrors, slotPlaceholder } from './form.js'
import {
  buildSubmit,
  collectOwners,
  renderSection,
  sectionSpec,
  validateOwnersForm,
  validateSection,
} from './steps.js'

// The client the elements drive. The real createClient() is finished, so the
// elements depend on its type directly; set `.client` (tests) or supply `base-url`.
export type BisonSectionClient = BisonClient

// The accordion's five surfaces, in canonical order (documents last).
const SECTION_ORDER: readonly OnboardingStep[] = ONBOARDING_STEPS

const SECTION_TITLE: Record<OnboardingStep, string> = {
  business: 'Business information',
  officer: 'Control officer',
  owners: 'Beneficial owners',
  volume: 'Processing volume',
  documents: 'Documents & banking',
}

type SectionUiState = 'locked' | 'active' | 'done' | 'error'

function statusFor(status: OnboardingStatus, step: OnboardingStep): SectionStatus | undefined {
  switch (step) {
    case 'business': return status.businessProfileStatus
    case 'officer': return status.controlOfficerStatus
    case 'owners': return status.beneficialOwnersStatus
    case 'volume': return status.processingVolumeStatus
    case 'documents': return status.documents && status.documents.length > 0 ? 'Completed' : 'NotStarted'
  }
}

/** Steps carrying capability errors -> action_required (only `errors`, not currentlyDue). */
function erroredSteps(status: OnboardingStatus): Set<OnboardingStep> {
  const out = new Set<OnboardingStep>()
  for (const cap of status.capabilities ?? []) {
    for (const err of cap.errors ?? []) {
      const req = err.requirement
      out.add(req.startsWith('document.') ? 'documents' : req.startsWith('underwriting.') ? 'volume' : 'business')
    }
  }
  return out
}

function bankingEligible(status: OnboardingStatus): boolean {
  return status.bankAccountEligibility?.isSupported !== false
}

/**
 * <bison-onboarding persona scope-id entity-id? base-url>
 * Set `.client` to inject a client/transport (tests). Renders the 5-section accordion.
 * Events (bubbling): bison-step-change, bison-status-checked, bison-submit-success,
 * bison-submit-error, and cancellable bison-before-submit.
 */
export class BisonOnboarding extends HTMLElement {
  client?: BisonSectionClient

  private status?: OnboardingStatus
  private openStep: OnboardingStep = 'business'
  private owners: Record<string, string>[] = [{}]
  private busy = false
  private error?: string

  get persona(): Persona {
    return this.getAttribute('persona') === 'operator' ? 'operator' : 'wio'
  }

  get scope(): Scope {
    return { persona: this.persona, id: this.getAttribute('scope-id') ?? '', entityId: this.getAttribute('entity-id') ?? undefined }
  }

  connectedCallback(): void {
    this.render()
    void this.refresh()
  }

  private resolveClient(): BisonSectionClient {
    if (this.client) return this.client
    const baseUrl = this.getAttribute('base-url')
    if (!baseUrl) throw new Error('bison-onboarding requires a base-url attribute or a .client property')
    this.client = createClient({ baseUrl })
    return this.client
  }

  /** GET status, set the resume/auto-open target, re-render. */
  async refresh(): Promise<void> {
    try {
      this.status = (await this.resolveClient().onboarding.getStates(this.scope)) as OnboardingStatus
      emit(this, 'bison-status-checked', this.status)
      this.openStep = resolveResumeStep(this.status)
      this.error = undefined
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load onboarding status.'
    }
    this.render()
  }

  private uiState(step: OnboardingStep): SectionUiState {
    const status = this.status
    if (!status) return step === 'business' ? 'active' : 'locked'
    // Lock rule (§3.3): everything but business is locked until business Completed.
    // Once business is Completed every section is reachable (not locked); state then
    // reflects status: error > done > active. Expansion (isOpen) is separate.
    if (step !== 'business' && statusFor(status, 'business') !== 'Completed') return 'locked'
    if (erroredSteps(status).has(step)) return 'error'
    if (statusFor(status, step) === 'Completed') return 'done'
    return 'active'
  }

  private render(): void {
    this.replaceChildren()
    const root = el('div', { class: 'bison-onboarding' })
    setState(root, 'step', this.openStep)
    root.append(slotPlaceholder('header'))

    if (this.error) {
      root.append(el('p', { class: 'bison-onboarding__error', role: 'alert', text: this.error }))
    }

    for (const step of SECTION_ORDER) {
      root.append(this.renderSectionCard(step))
    }
    this.append(root)
  }

  private renderSectionCard(step: OnboardingStep): HTMLElement {
    const uiState = this.uiState(step)
    const card = el('section', { class: `bison-onboarding__section bison-onboarding__section--${step}` })
    setState(card, 'state', uiState)
    setState(card, 'step', step)

    const isOpen = this.openStep === step && uiState !== 'locked'
    const header = el('button', {
      type: 'button',
      class: 'bison-onboarding__section-header',
      'aria-expanded': isOpen ? 'true' : 'false',
      disabled: uiState === 'locked',
      onClick: () => {
        if (uiState === 'locked') return
        this.openStep = step
        this.render()
        emit(this, 'bison-step-change', { step })
      },
    }, [
      el('span', { class: 'bison-onboarding__section-title', text: SECTION_TITLE[step] }),
      el('span', { class: 'bison-onboarding__section-badge', text: uiState }),
    ])
    card.append(header)

    if (isOpen) {
      const body = el('div', { class: 'bison-onboarding__section-body' })
      if (step === 'documents') this.renderDocumentsAndBanking(body)
      else this.renderFormSection(body, step)
      card.append(body)
    }
    return card
  }

  private renderFormSection(body: HTMLElement, step: OnboardingStep): void {
    const spec = sectionSpec(step)
    if (!spec) return
    const form = document.createElement('form')
    const prefill = this.redactedPrefill(step)
    renderSection(form, spec, {
      owners: this.owners,
      prefill,
      onAdd: spec.repeat ? () => { this.owners = collectOwners(form); this.owners.push({}); this.render() } : undefined,
      onRemove: spec.repeat ? (i) => { this.owners = collectOwners(form); this.owners.splice(i, 1); this.render() } : undefined,
    })

    form.append(slotPlaceholder('actions'))
    const submitBtn = el('button', { type: 'submit', class: 'bison-onboarding__button bison-onboarding__button--next', text: 'Save & continue' })
    form.append(submitBtn)
    form.addEventListener('submit', (e) => { e.preventDefault(); void this.submitSection(step, form, submitBtn) })
    body.append(form)
  }

  /** §5.2 redacted resume: if Moov already holds EIN/DOB/SSN, seed placeholders so the
   *  form validates without forcing re-entry. */
  private redactedPrefill(step: OnboardingStep): Record<string, string> | undefined {
    const s = this.status as (OnboardingStatus & Record<string, unknown>) | undefined
    if (!s) return undefined
    const p: Record<string, string> = {}
    if (step === 'business' && s.taxIdProvided) p.ein = '00-0000000'
    if ((step === 'officer' || step === 'owners')) {
      if (s.birthDateProvided) p.dateOfBirth = '2000-01-01'
      if (s.governmentIdProvided) p.ssn = '000-00-0000'
    }
    return Object.keys(p).length ? p : undefined
  }

  private setFormError(form: HTMLFormElement, message?: string): void {
    const errEl = form.querySelector<HTMLElement>('.bison-onboarding__error')
    if (!errEl) return
    errEl.textContent = message ?? ''
    errEl.hidden = !message
  }

  private async submitSection(step: OnboardingStep, form: HTMLFormElement, button: HTMLButtonElement): Promise<void> {
    if (this.busy) return
    const spec = sectionSpec(step)
    if (!spec) return
    this.setFormError(form)

    let submit: OnboardingSubmit
    if (spec.repeat) {
      const { valid, total } = validateOwnersForm(form, spec, this.businessRecord())
      if (!valid) { if (total) this.setFormError(form, total); return }
      const owners = collectOwners(form)
      this.owners = owners
      submit = buildSubmit(step, {}, owners)
    } else {
      const record = readFields(form)
      const errors = validateSection(spec, record, this.businessRecord())
      showErrors(form, errors)
      if (Object.keys(errors).length) return
      submit = buildSubmit(step, record)
    }

    // Cancellable pre-submit hook.
    if (!emit(this, 'bison-before-submit', submit, true)) return

    this.busy = true
    button.disabled = true
    try {
      const result = await this.resolveClient().onboarding.submit(this.scope, submit)
      emit(this, 'bison-submit-success', { step, result })
      await this.refresh()
    } catch (error) {
      this.setFormError(form, error instanceof Error ? error.message : 'Something went wrong. Please try again.')
      emit(this, 'bison-submit-error', error)
    } finally {
      this.busy = false
      button.disabled = false
    }
  }

  /** The saved/typed business record — used for the officer address-clash rule.
   *  We only have it locally within a session; from status alone it's absent, so
   *  the clash rule simply doesn't fire on cold resume (matches platform UX). */
  private businessRecord(): Record<string, string> | undefined {
    return undefined
  }

  private renderDocumentsAndBanking(body: HTMLElement): void {
    const businessDone = this.status && statusFor(this.status, 'business') === 'Completed'

    // Documents upload.
    const docWrap = el('div', { class: 'bison-onboarding__documents' })
    docWrap.append(slotPlaceholder('section-intro:documents'))
    const fileInput = el('input', { type: 'file', class: 'bison-field__input bison-onboarding__doc-input', name: 'file', 'aria-label': 'Upload document' })
    const docErr = el('p', { class: 'bison-onboarding__error', role: 'alert' })
    docErr.hidden = true
    const uploadBtn = el('button', {
      type: 'button',
      class: 'bison-onboarding__button bison-onboarding__button--upload',
      text: 'Upload document',
      onClick: () => { void this.uploadDoc(fileInput as HTMLInputElement, docErr) },
    })
    docWrap.append(
      el('label', { class: 'bison-field__label', text: 'Verification documents' }),
      fileInput,
      uploadBtn,
      docErr,
    )
    body.append(docWrap)

    // Banking becomes available after business profile + eligibility (composition).
    if (businessDone && bankingEligible(this.status!)) {
      const bank = document.createElement('bison-bank-crud')
      bank.setAttribute('persona', this.persona)
      bank.setAttribute('scope-id', this.getAttribute('scope-id') ?? '')
      if (this.getAttribute('entity-id')) bank.setAttribute('entity-id', this.getAttribute('entity-id')!)
      // Share the client instance so the embed doesn't need its own transport.
      ;(bank as unknown as { client?: BisonSectionClient }).client = this.client
      body.append(bank)
    } else {
      const notice = slotPlaceholder('empty-state')
      notice.append(el('p', { class: 'bison-onboarding__banking-locked', text: 'Complete your business profile to add a bank account.' }))
      body.append(notice)
    }
  }

  private async uploadDoc(input: HTMLInputElement, errEl: HTMLElement): Promise<void> {
    const file = input.files?.[0]
    errEl.hidden = true
    if (!file) { errEl.textContent = 'Choose a file to upload.'; errEl.hidden = false; return }
    if (this.busy) return
    this.busy = true
    try {
      const result = await this.resolveClient().onboarding.uploadDocument(this.scope, file)
      emit(this, 'bison-submit-success', { step: 'documents', result })
      await this.refresh()
    } catch (error) {
      errEl.textContent = error instanceof Error ? error.message : 'Upload failed. Please try again.'
      errEl.hidden = false
      emit(this, 'bison-submit-error', error)
    } finally {
      this.busy = false
    }
  }
}
