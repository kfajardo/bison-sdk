// Phase 3 — <bison-bank-crud>: unstyled, light-DOM bank-account CRUD.
//
// CRITICAL (BANKING_SPEC §6.3 / §12.1): the delete/default/last-account guards are
// FRONTEND-ONLY — the backend will happily hard-delete a default account. This
// element enforces: cannot delete the default account, cannot delete the last
// remaining account, and always confirms before deleting.
//
// Add methods: manual (routing/account, micro-deposit verify) and plaid (link token
// -> overridable onPlaidLink hook -> register). Verified/default badges from
// BankAccount.isVerified/isDefault.

import type { BankAccount, BankRegister, PlaidRegisterResult } from '../core/types.js'
import type { Persona, Scope } from '../core/scope.js'
import { createClient } from '../core/client.js'
import { BANK_ACCOUNT_TYPES } from '../validation/index.js'
import type { BisonSectionClient } from './onboarding.js'
import { el, emit, setState } from './dom.js'
import { renderField, showErrors, slotPlaceholder, type FieldSpec } from './form.js'

// ── Banking validation (rules verbatim from BANKING_SPEC §4.3; validation/* banking
//    schemas are being written in parallel — inlined here to keep the build green). ──

/** ABA checksum (BANKING_SPEC §4.3): (3(d0+d3+d6)+7(d1+d4+d7)+1(d2+d5+d8)) % 10 === 0 */
function isValidAbaRouting(v: string): boolean {
  if (!/^\d{9}$/.test(v)) return false
  const d = v.split('').map(Number)
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0
}

function validateRouting(v: string): string | null {
  const s = v.trim()
  if (!/^\d{9}$/.test(s)) return 'Routing number must be 9 digits'
  if (!isValidAbaRouting(s)) return 'Invalid routing number'
  return null
}

function validateAccount(v: string): string | null {
  const s = v.trim()
  if (!/^\d+$/.test(s)) return 'Account number must contain digits only'
  if (s.length < 4) return 'Account number is too short'
  if (s.length > 20) return 'Account number is too long'
  if (/^0+$/.test(s)) return 'Account number cannot be all zeros'
  return null
}

/** Verification code (BANKING_SPEC §12.7): UI enforces MV####; strip optional MV, need 4 digits. */
export function normalizeVerificationCode(code: string): string | null {
  const cleaned = code.trim().toUpperCase().replace(/^MV/, '')
  return /^\d{4}$/.test(cleaned) ? cleaned : null
}

function last4(account?: string): string {
  return account ? account.slice(-4) : '••••'
}

/** Plaid link handoff. Overridable so tests / non-browser envs don't load Plaid.
 *  Given the link token, resolve the { publicToken, accountId } to register. */
export type PlaidLinkResult = { publicToken: string; accountId: string; bankName?: string; accountHolderName?: string }
export type PlaidLinkHook = (linkToken: string) => Promise<PlaidLinkResult | null>

/**
 * <bison-bank-crud persona scope-id entity-id? base-url>
 * Set `.client` to inject a client (or share the onboarding element's). Override
 * `.onPlaidLink` to drive the real Plaid Link handoff.
 * Events (bubbling): bison-bank-added, bison-bank-verified, bison-bank-default-changed,
 * bison-bank-deleted, bison-bank-error.
 */
export class BisonBankCrud extends HTMLElement {
  client?: BisonSectionClient
  /** Default hook is a no-op stub (returns null) so tests don't touch Plaid. */
  onPlaidLink: PlaidLinkHook = async () => null

  private accounts: BankAccount[] = []
  private method: 'plaid' | 'manual' | null = null
  private verifyingId: string | null = null
  private busy = false
  private listError?: string

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
    if (!baseUrl) throw new Error('bison-bank-crud requires a base-url attribute or a .client property')
    this.client = createClient({ baseUrl })
    return this.client
  }

  async refresh(): Promise<void> {
    try {
      this.accounts = await this.resolveClient().banking.list(this.scope)
      this.listError = undefined
    } catch (err) {
      this.listError = err instanceof Error ? err.message : 'Failed to load bank accounts. Please try again later.'
    }
    this.render()
  }

  // ── Frontend-only delete guards (BANKING_SPEC §6.3 / §12.1) ──────────────────
  private canDelete(account: BankAccount): boolean {
    return !account.isDefault && this.accounts.length > 1
  }

  private render(): void {
    this.replaceChildren()
    const root = el('div', { class: 'bison-bank-crud' })
    root.append(slotPlaceholder('header'))

    if (this.listError) {
      root.append(el('p', { class: 'bison-bank-crud__error', role: 'alert', text: this.listError }))
    }

    // No-default warning (BANKING_SPEC §6.4).
    if (this.accounts.length && !this.accounts.some((a) => a.isDefault)) {
      root.append(el('p', { class: 'bison-bank-crud__warning', role: 'status', text: 'No default account set.' }))
    }

    if (this.accounts.length === 0 && !this.listError) {
      const empty = slotPlaceholder('empty-state')
      empty.append(el('p', { class: 'bison-bank-crud__empty', text: 'No bank accounts yet.' }))
      root.append(empty)
    } else {
      const list = el('ul', { class: 'bison-bank-crud__list' })
      // Default first.
      const sorted = [...this.accounts].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
      for (const account of sorted) list.append(this.renderRow(account))
      root.append(list)
    }

    root.append(this.renderAddArea())
    this.append(root)
  }

  private renderRow(account: BankAccount): HTMLElement {
    const row = el('li', { class: 'bison-bank-crud__row' })
    setState(row, 'verified', account.isVerified ? 'verified' : 'unverified')
    if (account.isDefault) setState(row, 'default', 'default')

    const label = el('div', { class: 'bison-bank-crud__row-label' }, [
      el('span', { class: 'bison-bank-crud__bank-name', text: account.bankName ?? 'Bank account' }),
      el('span', { class: 'bison-bank-crud__last4', text: `••••${last4(account.accountNumber)}` }),
    ])
    if (account.isVerified) label.append(el('span', { class: 'bison-bank-crud__badge bison-bank-crud__badge--verified', text: 'Verified' }))
    if (account.isDefault) label.append(el('span', { class: 'bison-bank-crud__badge bison-bank-crud__badge--default', text: 'Default' }))
    row.append(label)

    const actions = el('div', { class: 'bison-bank-crud__row-actions' })
    if (!account.isVerified) {
      actions.append(el('button', { type: 'button', class: 'bison-bank-crud__button bison-bank-crud__button--verify', text: 'Verify', onClick: () => { this.verifyingId = account.id; this.render() } }))
    }
    if (!account.isDefault) {
      actions.append(el('button', { type: 'button', class: 'bison-bank-crud__button bison-bank-crud__button--default', text: 'Make default', onClick: () => { void this.setDefault(account) } }))
    }
    const del = el('button', {
      type: 'button',
      class: 'bison-bank-crud__button bison-bank-crud__button--delete',
      text: 'Delete',
      disabled: !this.canDelete(account),
      title: account.isDefault ? 'Cannot delete the default account' : this.accounts.length <= 1 ? 'Cannot delete the last account' : undefined,
      onClick: () => { void this.deleteAccount(account) },
    })
    actions.append(del)
    row.append(actions)

    if (this.verifyingId === account.id) row.append(this.renderVerifyDialog(account))
    return row
  }

  private renderVerifyDialog(account: BankAccount): HTMLElement {
    const dialog = el('div', { class: 'bison-bank-crud__verify', role: 'group', 'aria-label': 'Verify micro-deposit' })
    const input = el('input', { type: 'text', class: 'bison-field__input bison-bank-crud__verify-input', name: 'code', placeholder: 'MV####', maxlength: 6, 'aria-label': 'Verification code' }) as HTMLInputElement
    const err = el('p', { class: 'bison-field__error', role: 'alert' })
    err.hidden = true
    dialog.append(
      el('label', { class: 'bison-field__label', text: 'Enter the code from your micro-deposits' }),
      input,
      err,
      el('div', { class: 'bison-bank-crud__verify-actions' }, [
        el('button', { type: 'button', class: 'bison-bank-crud__button bison-bank-crud__button--verify-submit', text: 'Confirm', onClick: () => { void this.completeVerify(account, input, err) } }),
        el('button', { type: 'button', class: 'bison-bank-crud__button bison-bank-crud__button--cancel', text: 'Cancel', onClick: () => { this.verifyingId = null; this.render() } }),
      ]),
    )
    return dialog
  }

  private renderAddArea(): HTMLElement {
    const add = el('div', { class: 'bison-bank-crud__add' })
    // Method chooser.
    const chooser = el('div', { class: 'bison-bank-crud__method-chooser', role: 'group', 'aria-label': 'Add a bank account' }, [
      el('button', { type: 'button', class: `bison-bank-crud__button bison-bank-crud__button--plaid${this.method === 'plaid' ? ' is-active' : ''}`, text: 'Link with Plaid', onClick: () => { this.method = 'plaid'; this.render(); void this.startPlaid() } }),
      el('button', { type: 'button', class: `bison-bank-crud__button bison-bank-crud__button--manual${this.method === 'manual' ? ' is-active' : ''}`, text: 'Enter manually', onClick: () => { this.method = 'manual'; this.render() } }),
    ])
    setState(add, 'provider', this.method ?? 'none')
    add.append(chooser)
    if (this.method === 'manual') add.append(this.renderManualForm())
    return add
  }

  private renderManualForm(): HTMLElement {
    const form = document.createElement('form')
    form.className = 'bison-bank-crud__manual-form'
    form.noValidate = true
    const fields: FieldSpec[] = [
      { name: 'holderName', label: 'Account holder name' },
      { name: 'routingNumber', label: 'Routing number', placeholder: '9 digits' },
      { name: 'accountNumber', label: 'Account number' },
      { name: 'bankAccountType', label: 'Account type', type: 'select', options: BANK_ACCOUNT_TYPES },
    ]
    for (const spec of fields) form.append(renderField(spec))
    const err = el('p', { class: 'bison-bank-crud__error', role: 'alert' })
    err.hidden = true
    form.append(err)
    form.append(el('button', { type: 'submit', class: 'bison-bank-crud__button bison-bank-crud__button--add-manual', text: 'Add account' }))
    form.addEventListener('submit', (e) => { e.preventDefault(); void this.submitManual(form, err) })
    return form
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  private read(form: HTMLElement, name: string): string {
    return form.querySelector<HTMLInputElement>(`.bison-field__input[name="${name}"]`)?.value.trim() ?? ''
  }

  private async submitManual(form: HTMLFormElement, errEl: HTMLElement): Promise<void> {
    if (this.busy) return
    errEl.hidden = true
    const holderName = this.read(form, 'holderName')
    const routingNumber = this.read(form, 'routingNumber')
    const accountNumber = this.read(form, 'accountNumber')
    const bankAccountType = (this.read(form, 'bankAccountType') || 'checking') as 'checking' | 'savings'

    const errors: Record<string, string> = {}
    if (!holderName) errors.holderName = 'Account holder name is required'
    const rErr = validateRouting(routingNumber)
    if (rErr) errors.routingNumber = rErr
    const aErr = validateAccount(accountNumber)
    if (aErr) errors.accountNumber = aErr
    showErrors(form, errors)
    if (Object.keys(errors).length) return

    const payload: Extract<BankRegister, { method: 'manual' }> = {
      method: 'manual',
      holderName,
      holderType: this.persona === 'operator' ? 'individual' : 'business',
      routingNumber,
      accountNumber,
      bankAccountType,
      initiateVerification: true,
    }
    this.busy = true
    try {
      const account = (await this.resolveClient().banking.register(this.scope, payload)) as BankAccount
      this.method = null
      emit(this, 'bison-bank-added', { method: 'manual', account })
      await this.refresh()
    } catch (error) {
      this.handleAddError(error, errEl)
    } finally {
      this.busy = false
    }
  }

  private async startPlaid(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const { linkToken } = await this.resolveClient().banking.getPlaidToken(this.scope)
      const linked = await this.onPlaidLink(linkToken)
      if (!linked) return // consumer cancelled or stub hook
      const payload: Extract<BankRegister, { method: 'plaid' }> = {
        method: 'plaid',
        publicToken: linked.publicToken,
        accountId: linked.accountId,
        bankName: linked.bankName,
        accountHolderName: linked.accountHolderName,
      }
      const result = (await this.resolveClient().banking.register(this.scope, payload)) as unknown as PlaidRegisterResult
      this.method = null
      if (result.isDuplicate) {
        emit(this, 'bison-bank-error', { code: 'DUPLICATE', message: 'This bank account is already registered.' })
      }
      emit(this, 'bison-bank-added', { method: 'plaid', result })
      await this.refresh()
    } catch (error) {
      this.emitError(error)
    } finally {
      this.busy = false
    }
  }

  private async setDefault(account: BankAccount): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      await this.resolveClient().banking.setDefault(this.scope, account.id)
      emit(this, 'bison-bank-default-changed', { id: account.id })
      await this.refresh()
    } catch (error) {
      this.emitError(error)
    } finally {
      this.busy = false
    }
  }

  private async deleteAccount(account: BankAccount): Promise<void> {
    // Guard again at the action layer, not just the disabled button.
    if (!this.canDelete(account)) {
      emit(this, 'bison-bank-error', {
        code: account.isDefault ? 'DEFAULT_ACCOUNT' : 'LAST_ACCOUNT',
        message: account.isDefault ? 'Cannot delete the default account.' : 'You cannot delete your last bank account.',
      })
      return
    }
    if (typeof confirm === 'function' && !confirm('Delete this bank account?')) return
    if (this.busy) return
    this.busy = true
    try {
      await this.resolveClient().banking.delete(this.scope, account.id)
      emit(this, 'bison-bank-deleted', { id: account.id })
      await this.refresh()
    } catch (error) {
      this.emitError(error)
    } finally {
      this.busy = false
    }
  }

  private async completeVerify(account: BankAccount, input: HTMLInputElement, errEl: HTMLElement): Promise<void> {
    if (this.busy) return
    errEl.hidden = true
    const code = normalizeVerificationCode(input.value)
    if (!code) { errEl.textContent = 'Enter the 4-digit code (MV####).'; errEl.hidden = false; return }
    this.busy = true
    try {
      await this.resolveClient().banking.completeVerification(this.scope, account.id, { code })
      this.verifyingId = null
      emit(this, 'bison-bank-verified', { id: account.id })
      await this.refresh()
    } catch (error) {
      errEl.textContent = error instanceof Error ? error.message : 'Verification failed. Please try again.'
      errEl.hidden = false
      this.emitError(error)
    } finally {
      this.busy = false
    }
  }

  // ── Error handling: 409 duplicate, 422 eligibility (BisonApiError codes) ──────
  private handleAddError(error: unknown, errEl: HTMLElement): void {
    const e = error as { status?: number; errorCode?: string; message?: string }
    let message = e?.message ?? 'Could not add the account. Please try again.'
    if (e?.status === 409) message = 'This bank account is already registered.'
    else if (e?.status === 422) {
      message = e.errorCode === 'NON_US_ADDRESS'
        ? 'Bank accounts can only be added for U.S. addresses.'
        : 'A U.S. address must be confirmed before adding a bank account.'
    }
    errEl.textContent = message
    errEl.hidden = false
    emit(this, 'bison-bank-error', { code: e?.errorCode ?? (e?.status ? String(e.status) : undefined), message })
  }

  private emitError(error: unknown): void {
    const e = error as { errorCode?: string; status?: number; message?: string }
    emit(this, 'bison-bank-error', { code: e?.errorCode ?? (e?.status ? String(e.status) : undefined), message: e?.message ?? 'Something went wrong.' })
  }
}
