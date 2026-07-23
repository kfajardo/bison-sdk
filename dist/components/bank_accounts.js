// Unstyled light-DOM bank-account management shared by the standalone element
// and partial onboarding's built-in manual-entry section.
//
// CRITICAL (BANKING_SPEC §6.3 / §12.1): the delete/default/last-account guards are
// FRONTEND-ONLY — the backend will happily hard-delete a default account. This
// element enforces: cannot delete the default account, cannot delete the last
// remaining account, and always confirms before deleting.
//
// Add methods: manual (routing/account, micro-deposit verify) and plaid (link token
// -> overridable onPlaidLink hook -> register). Verified/default badges from
// BankAccount.isVerified/isDefault.
import { getBisonClient } from '../core/sdk.js';
import { BANK_ACCOUNT_TYPES } from '../validation/index.js';
import { el, emit, setState } from './dom.js';
import { readFields, renderFields, showErrors, slotPlaceholder } from './form.js';
// ── Banking validation (rules verbatim from BANKING_SPEC §4.3; validation/* banking
//    schemas are being written in parallel — inlined here to keep the build green). ──
/** ABA checksum (BANKING_SPEC §4.3): (3(d0+d3+d6)+7(d1+d4+d7)+1(d2+d5+d8)) % 10 === 0 */
function isValidAbaRouting(v) {
    if (!/^\d{9}$/.test(v))
        return false;
    const d = v.split('').map(Number);
    return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
}
function validateRouting(v) {
    const s = v.trim();
    if (!/^\d{9}$/.test(s))
        return 'Routing number must be 9 digits';
    if (!isValidAbaRouting(s))
        return 'Invalid routing number';
    return null;
}
function validateAccount(v) {
    const s = v.trim();
    if (!/^\d+$/.test(s))
        return 'Account number must contain digits only';
    if (s.length < 4)
        return 'Account number is too short';
    if (s.length > 20)
        return 'Account number is too long';
    if (/^0+$/.test(s))
        return 'Account number cannot be all zeros';
    return null;
}
export const MANUAL_BANK_FIELDS = [
    { name: 'holderName', label: 'Account holder name' },
    { name: 'routingNumber', label: 'Routing number', placeholder: '9 digits' },
    { name: 'accountNumber', label: 'Account number' },
    { name: 'bankAccountType', label: 'Account type', type: 'select', options: BANK_ACCOUNT_TYPES },
];
export function validateManualBank(data) {
    const errors = {};
    if (!data.holderName?.trim())
        errors.holderName = 'Account holder name is required';
    const routingError = validateRouting(data.routingNumber ?? '');
    if (routingError)
        errors.routingNumber = routingError;
    const accountError = validateAccount(data.accountNumber ?? '');
    if (accountError)
        errors.accountNumber = accountError;
    if (!BANK_ACCOUNT_TYPES.some(({ value }) => value === data.bankAccountType))
        errors.bankAccountType = 'Account type is required';
    return errors;
}
export function buildManualBankRegister(data, persona) {
    return {
        method: 'manual',
        holderName: data.holderName.trim(),
        holderType: persona === 'operator' ? 'individual' : 'business',
        routingNumber: data.routingNumber.trim(),
        accountNumber: data.accountNumber.trim(),
        bankAccountType: data.bankAccountType,
        initiateVerification: true,
    };
}
/** Verification code (BANKING_SPEC §12.7): UI enforces MV####; strip optional MV, need 4 digits. */
export function normalizeVerificationCode(code) {
    const cleaned = code.trim().toUpperCase().replace(/^MV/, '');
    return /^\d{4}$/.test(cleaned) ? cleaned : null;
}
function last4(account) {
    return account ? account.slice(-4) : '••••';
}
export class BankAccountsPanel {
    host;
    options;
    accounts = [];
    method = null;
    verifyingId = null;
    busy = false;
    submitted = false;
    listError;
    constructor(host, options) {
        this.host = host;
        this.options = options;
    }
    async refresh() {
        if (this.options.entryOnly) {
            this.render();
            return;
        }
        try {
            this.accounts = await this.options.client().getBankAccounts(this.options.scope());
            this.listError = undefined;
        }
        catch (err) {
            this.listError = err instanceof Error ? err.message : 'Failed to load bank accounts. Please try again later.';
        }
        this.render();
    }
    // ── Frontend-only delete guards (BANKING_SPEC §6.3 / §12.1) ──────────────────
    canDelete(account) {
        return !account.isDefault && this.accounts.length > 1;
    }
    render() {
        this.host.replaceChildren();
        const root = el('div', { class: 'bison-bank-accounts' });
        if (this.options.headerSlot)
            root.append(slotPlaceholder('header'));
        if (this.options.entryOnly) {
            root.append(this.submitted
                ? el('p', { class: 'bison-bank-accounts__success', role: 'status', text: 'Bank account submitted.' })
                : this.renderManualForm());
            this.host.append(root);
            return;
        }
        if (this.listError) {
            root.append(el('p', { class: 'bison-bank-accounts__error', role: 'alert', text: this.listError }));
        }
        if (this.accounts.length && !this.accounts.some((a) => a.isDefault)) {
            root.append(el('p', { class: 'bison-bank-accounts__warning', role: 'status', text: 'No default account set.' }));
        }
        if (this.accounts.length === 0 && !this.listError) {
            const empty = slotPlaceholder('empty-state');
            empty.classList.add('bison-bank-accounts__empty-state');
            empty.append(el('p', { class: 'bison-bank-accounts__empty', text: 'No bank accounts yet.' }));
            root.append(empty);
        }
        else {
            const list = el('ul', { class: 'bison-bank-accounts__list' });
            const sorted = [...this.accounts].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
            for (const account of sorted)
                list.append(this.renderRow(account));
            root.append(list);
        }
        root.append(this.renderAddArea());
        this.host.append(root);
    }
    renderRow(account) {
        const row = el('li', { class: 'bison-bank-accounts__row' });
        setState(row, 'verified', account.isVerified ? 'verified' : 'unverified');
        if (account.isDefault)
            setState(row, 'default', 'default');
        const label = el('div', { class: 'bison-bank-accounts__row-main' }, [
            el('span', { class: 'bison-bank-accounts__bank-name', text: account.bankName ?? 'Bank account' }),
            el('span', { class: 'bison-bank-accounts__account-number', text: `••••${last4(account.accountNumber)}` }),
        ]);
        if (account.isVerified)
            label.append(el('span', { class: 'bison-bank-accounts__badge bison-bank-accounts__badge--verified', text: 'Verified' }));
        if (account.isDefault)
            label.append(el('span', { class: 'bison-bank-accounts__badge bison-bank-accounts__badge--default', text: 'Default' }));
        row.append(label);
        const actions = el('div', { class: 'bison-bank-accounts__row-actions' });
        if (!account.isVerified) {
            actions.append(el('button', { type: 'button', class: 'bison-bank-accounts__button bison-bank-accounts__button--verify', text: 'Verify', onClick: () => { this.verifyingId = account.id; this.render(); } }));
        }
        if (!account.isDefault) {
            actions.append(el('button', { type: 'button', class: 'bison-bank-accounts__button bison-bank-accounts__button--default', text: 'Make default', onClick: () => { void this.setDefault(account); } }));
        }
        const del = el('button', {
            type: 'button',
            class: 'bison-bank-accounts__button bison-bank-accounts__button--delete',
            text: 'Delete',
            disabled: !this.canDelete(account),
            title: account.isDefault ? 'Cannot delete the default account' : this.accounts.length <= 1 ? 'Cannot delete the last account' : undefined,
            onClick: () => { void this.deleteAccount(account); },
        });
        actions.append(del);
        row.append(actions);
        if (this.verifyingId === account.id)
            row.append(this.renderVerifyDialog(account));
        return row;
    }
    renderVerifyDialog(account) {
        const dialog = el('div', { class: 'bison-bank-accounts__verify', role: 'group', 'aria-label': 'Verify micro-deposit' });
        const input = el('input', { type: 'text', class: 'bison-field__input bison-bank-accounts__verify-input', name: 'code', placeholder: 'MV####', maxlength: 6, 'aria-label': 'Verification code' });
        const err = el('p', { class: 'bison-field__error', role: 'alert' });
        err.hidden = true;
        dialog.append(el('label', { class: 'bison-field__label', text: 'Enter the code from your micro-deposits' }), input, err, el('div', { class: 'bison-bank-accounts__verify-actions' }, [
            el('button', { type: 'button', class: 'bison-bank-accounts__button bison-bank-accounts__button--verify-submit', text: 'Confirm', onClick: () => { void this.completeVerify(account, input, err); } }),
            el('button', { type: 'button', class: 'bison-bank-accounts__button bison-bank-accounts__button--cancel', text: 'Cancel', onClick: () => { this.verifyingId = null; this.render(); } }),
        ]));
        return dialog;
    }
    renderAddArea() {
        const add = el('div', { class: 'bison-bank-accounts__add' });
        const chooser = el('div', { class: 'bison-bank-accounts__method-chooser', role: 'group', 'aria-label': 'Add a bank account' }, [
            el('button', { type: 'button', class: `bison-bank-accounts__button bison-bank-accounts__button--plaid${this.method === 'plaid' ? ' is-active' : ''}`, text: 'Link with Plaid', onClick: () => { this.method = 'plaid'; this.render(); void this.startPlaid(); } }),
            el('button', { type: 'button', class: `bison-bank-accounts__button bison-bank-accounts__button--manual${this.method === 'manual' ? ' is-active' : ''}`, text: 'Enter manually', onClick: () => { this.method = 'manual'; this.render(); } }),
        ]);
        setState(add, 'provider', this.method ?? 'none');
        add.append(chooser);
        if (this.method === 'manual')
            add.append(this.renderManualForm());
        return add;
    }
    renderManualForm() {
        const form = document.createElement('form');
        form.className = 'bison-bank-accounts__form';
        form.noValidate = true;
        renderFields(form, MANUAL_BANK_FIELDS);
        const err = el('p', { class: 'bison-bank-accounts__error', role: 'alert' });
        err.hidden = true;
        form.append(err);
        form.append(el('button', { type: 'submit', class: 'bison-bank-accounts__button bison-bank-accounts__button--add-manual', text: 'Add account' }));
        form.addEventListener('submit', (event) => { event.preventDefault(); void this.submitManual(form, err); });
        return form;
    }
    async submitManual(form, errEl) {
        if (this.busy)
            return;
        errEl.hidden = true;
        const data = readFields(form);
        const errors = validateManualBank(data);
        showErrors(form, errors);
        if (Object.keys(errors).length)
            return;
        this.busy = true;
        try {
            const account = (await this.options.client().registerBankAccount(this.options.scope(), buildManualBankRegister(data, this.options.persona())));
            this.method = null;
            emit(this.host, 'bison-bank-added', { method: 'manual', account });
            if (this.options.entryOnly) {
                this.submitted = true;
                this.render();
            }
            else {
                await this.refresh();
            }
        }
        catch (error) {
            this.handleAddError(error, errEl);
        }
        finally {
            this.busy = false;
        }
    }
    async startPlaid() {
        if (this.busy)
            return;
        this.busy = true;
        try {
            const { linkToken } = await this.options.client().getPlaidLinkToken(this.options.scope());
            const linked = await this.options.onPlaidLink?.(linkToken);
            if (!linked)
                return;
            const payload = {
                method: 'plaid',
                publicToken: linked.publicToken,
                accountId: linked.accountId,
                bankName: linked.bankName,
                accountHolderName: linked.accountHolderName,
            };
            const result = (await this.options.client().registerBankAccount(this.options.scope(), payload));
            this.method = null;
            if (result.isDuplicate) {
                emit(this.host, 'bison-bank-error', { code: 'DUPLICATE', message: 'This bank account is already registered.' });
            }
            emit(this.host, 'bison-bank-added', { method: 'plaid', result });
            await this.refresh();
        }
        catch (error) {
            this.emitError(error);
        }
        finally {
            this.busy = false;
        }
    }
    async setDefault(account) {
        if (this.busy)
            return;
        this.busy = true;
        try {
            await this.options.client().setDefaultBankAccount(this.options.scope(), account.id);
            emit(this.host, 'bison-bank-default-changed', { id: account.id });
            await this.refresh();
        }
        catch (error) {
            this.emitError(error);
        }
        finally {
            this.busy = false;
        }
    }
    async deleteAccount(account) {
        if (!this.canDelete(account)) {
            emit(this.host, 'bison-bank-error', {
                code: account.isDefault ? 'DEFAULT_ACCOUNT' : 'LAST_ACCOUNT',
                message: account.isDefault ? 'Cannot delete the default account.' : 'You cannot delete your last bank account.',
            });
            return;
        }
        if (typeof confirm === 'function' && !confirm('Delete this bank account?'))
            return;
        if (this.busy)
            return;
        this.busy = true;
        try {
            await this.options.client().deleteBankAccount(this.options.scope(), account.id);
            emit(this.host, 'bison-bank-deleted', { id: account.id });
            await this.refresh();
        }
        catch (error) {
            this.emitError(error);
        }
        finally {
            this.busy = false;
        }
    }
    async completeVerify(account, input, errEl) {
        if (this.busy)
            return;
        errEl.hidden = true;
        const code = normalizeVerificationCode(input.value);
        if (!code) {
            errEl.textContent = 'Enter the 4-digit code (MV####).';
            errEl.hidden = false;
            return;
        }
        this.busy = true;
        try {
            await this.options.client().completeBankAccountVerification(this.options.scope(), account.id, { code });
            this.verifyingId = null;
            emit(this.host, 'bison-bank-verified', { id: account.id });
            await this.refresh();
        }
        catch (error) {
            errEl.textContent = error instanceof Error ? error.message : 'Verification failed. Please try again.';
            errEl.hidden = false;
            this.emitError(error);
        }
        finally {
            this.busy = false;
        }
    }
    handleAddError(error, errEl) {
        const e = error;
        let message = e?.message ?? 'Could not add the account. Please try again.';
        if (e?.status === 409)
            message = 'This bank account is already registered.';
        else if (e?.status === 422) {
            message = e.errorCode === 'NON_US_ADDRESS'
                ? 'Bank accounts can only be added for U.S. addresses.'
                : 'A U.S. address must be confirmed before adding a bank account.';
        }
        errEl.textContent = message;
        errEl.hidden = false;
        emit(this.host, 'bison-bank-error', { code: e?.errorCode ?? (e?.status ? String(e.status) : undefined), message });
    }
    emitError(error) {
        const e = error;
        emit(this.host, 'bison-bank-error', { code: e?.errorCode ?? (e?.status ? String(e.status) : undefined), message: e?.message ?? 'Something went wrong.' });
    }
}
/**
 * <bison-bank-accounts persona scope-id entity-id?>
 * Set `.client` to inject a client (or share the onboarding element's). Override
 * `.onPlaidLink` to drive the real Plaid Link handoff.
 * Events (bubbling): bison-bank-added, bison-bank-verified, bison-bank-default-changed,
 * bison-bank-deleted, bison-bank-error.
 */
export class BisonBankAccounts extends HTMLElement {
    client;
    onPlaidLink = async () => null;
    panel;
    get persona() {
        return this.getAttribute('persona') === 'operator' ? 'operator' : 'wio';
    }
    get scope() {
        return { persona: this.persona, id: this.getAttribute('scope-id') ?? '', entityId: this.getAttribute('entity-id') ?? undefined };
    }
    connectedCallback() {
        this.panel = new BankAccountsPanel(this, {
            client: () => this.resolveClient(),
            scope: () => this.scope,
            persona: () => this.persona,
            headerSlot: true,
            onPlaidLink: (token) => this.onPlaidLink(token),
        });
        void this.refresh();
    }
    resolveClient() {
        return this.client ?? getBisonClient();
    }
    async refresh() {
        await this.panel?.refresh();
    }
}
