import { createClient } from '../core/client.js';
import { US_STATES, digitsOnly, validatePartialOnboardingOwner, validatePartialOnboardingStep, } from '../validation/index.js';
import { el, emit } from './dom.js';
import { readFields, renderFields, setFieldValues, showErrors } from './form.js';
import { BankAccountsPanel } from './bank_accounts.js';
const ADDRESS_FIELDS = [
    { name: 'line1', label: 'Street address', autocomplete: 'address-line1' },
    { name: 'line2', label: 'Address line 2 (optional)', autocomplete: 'address-line2' },
    { name: 'city', label: 'City', autocomplete: 'address-level2' },
    { name: 'state', label: 'State', type: 'select', options: US_STATES, autocomplete: 'address-level1' },
    { name: 'zip', label: 'ZIP code', autocomplete: 'postal-code' },
];
const CONTACT_FIELDS = [
    { name: 'corporationName', label: 'Corporation name', autocomplete: 'organization' },
    { name: 'website', label: 'Corporation website (optional)', placeholder: 'www.corporation.com' },
    { name: 'phone', label: 'Business phone', type: 'tel', autocomplete: 'tel' },
    ...ADDRESS_FIELDS,
];
const INCORPORATION_FIELDS = [
    { name: 'state', label: 'Incorporation state', type: 'select', options: US_STATES },
    { name: 'ein', label: 'Employer identification number (EIN)', placeholder: '12-3456789' },
];
const LEADERSHIP_FIELDS = [
    { name: 'legalName', label: 'Legal name', autocomplete: 'name' },
    { name: 'title', label: 'Title', autocomplete: 'organization-title' },
    { name: 'birthDate', label: 'Date of birth', type: 'date', autocomplete: 'bday' },
    { name: 'taxId', label: 'Tax ID (SSN or ITIN)', placeholder: '123-45-6789' },
    ...ADDRESS_FIELDS,
];
const OWNER_FIELDS = [
    { name: 'legalName', label: 'Legal name', autocomplete: 'name' },
    { name: 'birthDate', label: 'Date of birth', type: 'date', autocomplete: 'bday' },
    { name: 'taxId', label: 'Tax ID (SSN or ITIN)', placeholder: '123-45-6789' },
    { name: 'ownershipPercentage', label: 'Ownership percentage', type: 'number' },
    ...ADDRESS_FIELDS,
];
function checkbox(name, text) {
    const input = el('input', { type: 'checkbox', name, class: `bison-partial__checkbox bison-partial__checkbox--${name}` });
    return {
        input,
        label: el('label', { class: `bison-partial__checkbox-label bison-partial__checkbox-label--${name}` }, [input, text]),
    };
}
function address(record) {
    return { line1: record.line1, line2: record.line2, city: record.city, state: record.state, zip: record.zip };
}
function splitName(value) {
    const [firstName, ...lastName] = value.trim().split(/\s+/);
    return { firstName, lastName: lastName.join(' ') };
}
function birthDate(value) {
    const [birthYear, birthMonth, birthDay] = value.split('-').map(Number);
    return value ? { birthYear, birthMonth, birthDay } : {};
}
function formatInput(input) {
    const value = digitsOnly(input.value);
    if (input.name === 'phone') {
        const digits = value.slice(0, 10);
        input.value = digits.length <= 3
            ? digits
            : digits.length <= 6
                ? `(${digits.slice(0, 3)}) ${digits.slice(3)}`
                : `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    else if (input.name === 'ein') {
        input.value = value.length > 2 ? `${value.slice(0, 2)}-${value.slice(2, 9)}` : value;
    }
    else if (input.name === 'taxId') {
        input.value = value.length <= 3
            ? value
            : value.length <= 5
                ? `${value.slice(0, 3)}-${value.slice(3)}`
                : `${value.slice(0, 3)}-${value.slice(3, 5)}-${value.slice(5, 9)}`;
    }
    else if (input.name === 'zip') {
        input.value = value.slice(0, 5);
    }
}
export class BisonOnboardingPartial extends HTMLElement {
    client;
    busy = false;
    complete = false;
    bankAccounts;
    get persona() {
        return this.getAttribute('persona') === 'operator' ? 'operator' : 'wio';
    }
    get scope() {
        return { persona: this.persona, id: this.getAttribute('scope-id') ?? '', entityId: this.getAttribute('entity-id') ?? undefined };
    }
    connectedCallback() {
        this.render();
        queueMicrotask(() => { if (this.isConnected)
            void this.loadBanking(); });
    }
    resolveClient() {
        if (this.client)
            return this.client;
        const baseUrl = this.getAttribute('base-url');
        if (!baseUrl)
            throw new Error('bison-onboarding-partial requires a base-url attribute or a .client property');
        this.client = createClient({ baseUrl });
        return this.client;
    }
    render() {
        this.bankAccounts = undefined;
        this.replaceChildren();
        const form = el('form', { class: 'bison-partial__form', novalidate: true });
        const contact = this.section('contact', 'Contact information', CONTACT_FIELDS);
        const incorporation = this.section('incorporation', 'Incorporation details', INCORPORATION_FIELDS);
        const leadership = this.section('leadership', 'Leadership', LEADERSHIP_FIELDS);
        leadership.append(checkbox('ownsQuarter', 'This person owns 25% or more of the corporation').label);
        const ownership = el('section', { class: 'bison-partial__section bison-partial__section--ownership' });
        ownership.append(el('h2', { class: 'bison-partial__section-title', text: 'Ownership' }));
        const owners = el('div', { class: 'bison-partial__owners' });
        const addLeadership = el('button', {
            type: 'button',
            class: 'bison-partial__button bison-partial__button--add-leadership',
            text: 'Add control officer as an owner',
        });
        const addOwner = el('button', {
            type: 'button',
            class: 'bison-partial__button bison-partial__button--add-owner',
            text: 'Add a beneficial owner',
        });
        const noOwners = checkbox('noOwnersAbove25', 'No individual owns 25% or more of the corporation');
        const confirmed = checkbox('ownershipConfirmed', 'All owners with at least 25% ownership are listed');
        const ownershipError = el('p', { class: 'bison-partial__ownership-error', role: 'alert' });
        ownershipError.hidden = true;
        ownership.append(owners, addLeadership, addOwner, noOwners.label, confirmed.label, ownershipError);
        const consent = el('section', { class: 'bison-partial__section bison-partial__section--consent' });
        consent.append(el('h2', { class: 'bison-partial__section-title', text: 'Payment services terms' }));
        const terms = checkbox('termsAccepted', 'I have reviewed and agree to the ');
        const termsUrl = this.getAttribute('terms-url');
        terms.label.append(el(termsUrl ? 'a' : 'span', {
            ...(termsUrl ? { href: termsUrl, target: '_blank', rel: 'noopener noreferrer' } : {}),
            class: 'bison-partial__terms-link',
            text: 'Bison payment services terms and disclosures',
        }), '.');
        const consentError = el('p', { class: 'bison-partial__consent-error', role: 'alert' });
        consentError.hidden = true;
        consent.append(terms.label, consentError);
        const error = el('p', { class: 'bison-partial__error', role: 'alert' });
        error.hidden = true;
        const submit = el('button', {
            type: 'submit',
            class: 'bison-partial__button bison-partial__button--submit',
            text: 'Create entity',
            disabled: true,
        });
        form.append(contact, incorporation, leadership, ownership, consent, error, el('div', { class: 'bison-partial__nav' }, [submit]));
        const banking = el('section', { class: 'bison-partial__section bison-partial__section--banking' }, [
            el('h2', { class: 'bison-partial__section-title', text: 'Banking' }),
            el('div', { class: 'bison-partial__banking' }, [
                el('p', { class: 'bison-partial__banking-status', role: 'status', text: 'Complete the business information to add a bank account.' }),
            ]),
        ]);
        addOwner.addEventListener('click', () => this.addOwner(owners, form, submit));
        addLeadership.addEventListener('click', () => {
            this.addOwner(owners, form, submit, readFields(leadership));
        });
        noOwners.input.addEventListener('change', () => {
            confirmed.input.checked = noOwners.input.checked;
        });
        form.addEventListener('input', (event) => {
            if (event.target instanceof HTMLInputElement)
                formatInput(event.target);
            this.updateOwnership(form);
            this.updateSubmitState(form, submit);
            const control = event.target;
            if (control.getAttribute('aria-invalid') !== null)
                this.showFieldError(form, control);
        });
        form.addEventListener('change', () => {
            this.updateOwnership(form);
            this.updateSubmitState(form, submit);
        });
        form.addEventListener('focusout', (event) => this.showFieldError(form, event.target));
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            void this.submit(form, submit);
        });
        this.append(el('div', { class: 'bison-partial' }, [form, banking]));
        this.updateOwnership(form);
    }
    async loadBanking() {
        const target = this.querySelector('.bison-partial__banking');
        if (!target)
            return;
        try {
            const status = await this.resolveClient().getOnboardingStatus(this.scope);
            emit(this, 'bison-status-checked', status);
            if (status.businessProfileStatus === 'Completed' && status.bankAccountEligibility?.isSupported !== false) {
                await this.showBanking();
            }
        }
        catch (error) {
            target.replaceChildren(el('p', {
                class: 'bison-partial__banking-status bison-partial__banking-status--error',
                role: 'alert',
                text: error instanceof Error ? error.message : 'Bank accounts are unavailable.',
            }));
            emit(this, 'bison-bank-error', error);
        }
    }
    async showBanking() {
        const target = this.querySelector('.bison-partial__banking');
        if (!target)
            return;
        this.bankAccounts ??= new BankAccountsPanel(target, {
            client: () => this.resolveClient(),
            scope: () => this.scope,
            persona: () => this.persona,
            entryOnly: true,
        });
        await this.bankAccounts.refresh();
    }
    section(step, title, fields) {
        const section = el('section', { class: `bison-partial__section bison-partial__section--${step}` });
        section.append(el('h2', { class: 'bison-partial__section-title', text: title }));
        renderFields(section, fields);
        section.querySelectorAll('input[type="date"]').forEach((input) => {
            input.max = new Date().toISOString().slice(0, 10);
        });
        return section;
    }
    addOwner(owners, form, submit, prefill) {
        form.querySelector('[name="noOwnersAbove25"]').checked = false;
        form.querySelector('[name="ownershipConfirmed"]').checked = false;
        const owner = this.section('owner', 'Beneficial owner details', OWNER_FIELDS);
        owner.classList.add('bison-partial__owner');
        if (prefill)
            setFieldValues(owner, prefill);
        const remove = el('button', {
            type: 'button',
            class: 'bison-partial__button bison-partial__button--remove-owner',
            text: 'Remove owner',
            onClick: () => {
                owner.remove();
                this.updateOwnership(form);
                this.updateSubmitState(form, submit);
            },
        });
        owner.append(remove);
        owners.append(owner);
        this.updateOwnership(form);
        this.updateSubmitState(form, submit);
    }
    values(form) {
        const record = (step) => readFields(form.querySelector(`.bison-partial__section--${step}`));
        const contact = record('contact');
        const incorporation = record('incorporation');
        const leadership = record('leadership');
        const checked = (name) => form.querySelector(`[name="${name}"]`)?.checked ?? false;
        return {
            contact: {
                corporationName: contact.corporationName,
                website: contact.website,
                phone: contact.phone,
                address: address(contact),
            },
            incorporation: {
                state: incorporation.state,
                ein: { value: incorporation.ein, provided: false },
            },
            leadership: {
                legalName: leadership.legalName,
                title: leadership.title,
                birthDate: { value: leadership.birthDate, provided: false },
                taxId: { value: leadership.taxId, provided: false },
                address: address(leadership),
                ownsQuarter: checked('ownsQuarter'),
            },
            ownership: {
                owners: Array.from(form.querySelectorAll('.bison-partial__owner')).map((element) => {
                    const owner = readFields(element);
                    return {
                        legalName: owner.legalName,
                        birthDate: { value: owner.birthDate, provided: false },
                        taxId: { value: owner.taxId, provided: false },
                        ownershipPercentage: owner.ownershipPercentage,
                        address: address(owner),
                    };
                }),
                noOwnersAbove25: checked('noOwnersAbove25'),
                ownershipConfirmed: checked('ownershipConfirmed'),
            },
            consent: { termsAccepted: checked('termsAccepted') },
        };
    }
    validate(form) {
        const values = this.values(form);
        return {
            contact: validatePartialOnboardingStep('contact', values),
            incorporation: validatePartialOnboardingStep('incorporation', values),
            leadership: validatePartialOnboardingStep('leadership', values),
            ownership: validatePartialOnboardingStep('ownership', values),
            owners: values.ownership.owners.map(validatePartialOnboardingOwner),
            consent: values.consent.termsAccepted ? {} : { termsAccepted: 'Accept the payment services terms' },
        };
    }
    hasErrors(validation) {
        return [
            validation.contact,
            validation.incorporation,
            validation.leadership,
            validation.ownership,
            validation.consent,
            ...validation.owners,
        ].some((errors) => Object.keys(errors).length > 0);
    }
    showValidation(form, validation) {
        showErrors(form.querySelector('.bison-partial__section--contact'), validation.contact);
        showErrors(form.querySelector('.bison-partial__section--incorporation'), validation.incorporation);
        showErrors(form.querySelector('.bison-partial__section--leadership'), validation.leadership);
        form.querySelectorAll('.bison-partial__owner').forEach((owner, index) => {
            showErrors(owner, validation.owners[index] ?? {});
        });
        this.setInlineError(form, '.bison-partial__ownership-error', Object.values(validation.ownership)[0]);
        this.setInlineError(form, '.bison-partial__consent-error', validation.consent.termsAccepted);
        form.querySelector('[name="termsAccepted"]')
            ?.setAttribute('aria-invalid', validation.consent.termsAccepted ? 'true' : 'false');
    }
    showFieldError(form, control) {
        const field = control.closest('.bison-field');
        if (!field)
            return;
        const name = field.querySelector('.bison-field__input')?.name;
        if (!name)
            return;
        const validation = this.validate(form);
        const owner = field.closest('.bison-partial__owner');
        let errors;
        if (owner) {
            const index = Array.from(form.querySelectorAll('.bison-partial__owner')).indexOf(owner);
            errors = validation.owners[index] ?? {};
        }
        else if (field.closest('.bison-partial__section--contact'))
            errors = validation.contact;
        else if (field.closest('.bison-partial__section--incorporation'))
            errors = validation.incorporation;
        else
            errors = validation.leadership;
        showErrors(field, { [name]: errors[name] });
    }
    updateOwnership(form) {
        const values = this.values(form);
        const hasOwners = values.ownership.owners.length > 0;
        const leadershipListed = values.ownership.owners.some((owner) => owner.legalName.trim().toLowerCase() === values.leadership.legalName.trim().toLowerCase());
        form.querySelector('.bison-partial__checkbox-label--noOwnersAbove25').hidden = hasOwners;
        form.querySelector('.bison-partial__checkbox-label--ownershipConfirmed').hidden = !hasOwners;
        form.querySelector('.bison-partial__button--add-leadership').hidden =
            !values.leadership.ownsQuarter || leadershipListed;
    }
    updateSubmitState(form, button) {
        button.disabled = this.busy || this.complete || this.hasErrors(this.validate(form));
    }
    setInlineError(form, selector, message) {
        const element = form.querySelector(selector);
        if (!element)
            return;
        element.textContent = message ?? '';
        element.hidden = !message;
    }
    setError(message) {
        const error = this.querySelector('.bison-partial__error');
        if (!error)
            return;
        error.textContent = message ?? '';
        error.hidden = !message;
    }
    buildSubmission(values) {
        const officer = {
            ...splitName(values.leadership.legalName),
            jobTitle: values.leadership.title.trim(),
            ...birthDate(values.leadership.birthDate.value),
            ssn: digitsOnly(values.leadership.taxId.value),
            addressLine1: values.leadership.address.line1.trim(),
            addressLine2: values.leadership.address.line2.trim() || undefined,
            city: values.leadership.address.city.trim(),
            state: values.leadership.address.state,
            zipCode: values.leadership.address.zip,
        };
        const owners = values.ownership.owners.map((owner) => ({
            ...splitName(owner.legalName),
            ownershipPercentage: Number(owner.ownershipPercentage),
            ...birthDate(owner.birthDate.value),
            ssn: digitsOnly(owner.taxId.value),
            addressLine1: owner.address.line1.trim(),
            addressLine2: owner.address.line2.trim() || undefined,
            city: owner.address.city.trim(),
            state: owner.address.state,
            zipCode: owner.address.zip,
        }));
        return {
            business: {
                legalBusinessName: values.contact.corporationName.trim(),
                businessType: 'corporation',
                ein: digitsOnly(values.incorporation.ein.value),
                addressLine1: values.contact.address.line1.trim(),
                addressLine2: values.contact.address.line2.trim() || undefined,
                city: values.contact.address.city.trim(),
                state: values.contact.address.state,
                country: 'US',
                zipCode: values.contact.address.zip,
                phone: values.contact.phone,
                website: values.contact.website.trim() || undefined,
                incorporationState: values.incorporation.state,
                termsAccepted: true,
                controlOfficer: officer,
            },
            officer,
            owners,
        };
    }
    async submit(form, button) {
        if (this.busy || this.complete)
            return;
        const validation = this.validate(form);
        this.showValidation(form, validation);
        if (this.hasErrors(validation))
            return;
        this.busy = true;
        button.disabled = true;
        this.setError();
        const values = this.values(form);
        const payload = this.buildSubmission(values);
        try {
            const status = await this.resolveClient().getOnboardingStatus(this.scope);
            emit(this, 'bison-status-checked', status);
            if (!await this.submitStep('business', { step: 'business', data: payload.business }))
                return;
            if (status.hasExternalAccount && !await this.submitStep('officer', {
                step: 'officer',
                data: payload.officer,
                existingRepresentativeId: status.controlOfficerRepresentativeId,
            }))
                return;
            if (!await this.submitStep('owners', {
                step: 'owners',
                data: payload.owners,
                noOwnersAbove25: values.ownership.noOwnersAbove25,
            }))
                return;
            this.complete = true;
            button.textContent = 'Submitted';
            emit(this, 'bison-partial-complete');
            void this.showBanking();
        }
        catch (error) {
            this.setError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
            emit(this, 'bison-submit-error', error);
        }
        finally {
            this.busy = false;
            this.updateSubmitState(form, button);
        }
    }
    async submitStep(step, submit) {
        try {
            const result = await this.resolveClient().submitOnboardingSection(this.scope, submit);
            emit(this, 'bison-submit-success', { step, result });
            return true;
        }
        catch (error) {
            this.setError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
            emit(this, 'bison-submit-error', error);
            return false;
        }
    }
}
