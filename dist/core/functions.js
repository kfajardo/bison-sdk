// Phase 1 — standalone API functions. Each takes a Transport as first arg so
// client.ts can bind it. Routes come from kybBase(scope)/bankBase(scope). No zod
// here (validation is the /validation layer's job); these are the wire calls.
import { kybBase, bankBase } from './scope.js';
// ── Onboarding ──────────────────────────────────────────────────────────────
/** GET the current user. With `email`, resolve via the moov-account-id lookup so
 *  a server can identify an entity by email; otherwise GET api/auth/me. */
export function getUser(transport, opts) {
    if (opts?.email) {
        return transport('api/embeddable/moov-account-id', { query: { email: opts.email } });
    }
    return transport('api/auth/me');
}
/** Map an OnboardingStep to its per-section GET/POST path segment. */
const SECTION_PATH = {
    business: 'business-profile',
    officer: 'control-officer',
    owners: 'beneficial-owners',
    volume: 'processing-volume',
    documents: 'documents',
};
/** Load the full onboarding status. */
export function getOnboardingStatus(transport, scope) {
    return transport(`${kybBase(scope)}/status`);
}
/** Load one saved onboarding section. */
export function getOnboardingSection(transport, scope, step) {
    return transport(`${kybBase(scope)}/${SECTION_PATH[step]}`);
}
/** POST the matching section endpoint. Returns SaveSectionResult (business also
 *  carries moovAccountId on first save). */
export function submitOnboardingSection(transport, scope, submit) {
    const base = kybBase(scope);
    switch (submit.step) {
        case 'business':
            return transport(`${base}/business-profile`, { method: 'POST', json: submit.data });
        case 'officer':
            return transport(`${base}/control-officer`, {
                method: 'POST',
                json: submit.data,
                query: submit.existingRepresentativeId
                    ? { existingRepresentativeId: submit.existingRepresentativeId }
                    : undefined,
            });
        case 'owners':
            // Body is the array; certification flag is a query param.
            return transport(`${base}/beneficial-owners`, {
                method: 'POST',
                json: submit.data,
                query: {
                    ...(submit.noOwnersAbove25 ? { noOwnersAbove25: true } : {}),
                    ...(submit.existingMappings?.length
                        ? { existingMappingsJson: JSON.stringify(submit.existingMappings) }
                        : {}),
                },
            });
        case 'volume':
            return transport(`${base}/processing-volume`, { method: 'POST', json: submit.data });
    }
}
/** Multipart document upload. Purpose defaults to merchant_underwriting. */
export function uploadOnboardingDocument(transport, scope, file, purpose = 'merchant_underwriting', metadata) {
    const form = new FormData();
    form.append('file', file);
    form.append('purpose', purpose);
    if (metadata !== undefined)
        form.append('metadata', metadata);
    return transport(`${kybBase(scope)}/documents`, { method: 'POST', form });
}
/** GET the industry list for the scope's persona. */
export function getOnboardingIndustries(transport, scope) {
    const seg = scope.persona === 'operator' ? 'operators' : 'wios';
    return transport(`api/${seg}/kyb/industries`);
}
/** POST for a Moov ToS token. */
export function getOnboardingTermsToken(transport) {
    return transport('api/moov/tos-token', { method: 'POST' });
}
/** Persist the selected payment-method capabilities for the scope. */
export function saveOnboardingPaymentMethods(transport, scope, methods) {
    return transport(`${kybBase(scope)}/payment-method-capabilities`, {
        method: 'POST',
        json: { selectedPaymentMethods: methods },
    });
}
// ── Banking ─────────────────────────────────────────────────────────────────
/** GET the scope's bank accounts. */
export function getBankAccounts(transport, scope) {
    return transport(bankBase(scope));
}
/** POST a Plaid link token for the scope's entity. */
export function getPlaidLinkToken(transport, scope) {
    return transport('api/plaid/embeddable/create-token', {
        method: 'POST',
        query: { entityId: scope.entityId ?? scope.id },
    });
}
export function registerBankAccount(transport, scope, payload) {
    const { method, ...body } = payload;
    if (method === 'manual') {
        return transport(`${bankBase(scope)}/manual`, { method: 'POST', json: body });
    }
    return transport('api/plaid/embeddable/register-bank-account', {
        method: 'POST',
        // Merge the scope's ids so the backend attaches the account to the right entity.
        json: { ...body, entityId: scope.entityId ?? scope.id, moovAccountId: scope.entityId ?? scope.id },
    });
}
/** POST to start micro-deposit verification for an account. */
export function initiateBankAccountVerification(transport, scope, bankAccountId) {
    return transport(`${bankBase(scope)}/${encodeURIComponent(bankAccountId)}/initiate-verification`, {
        method: 'POST',
    });
}
/** POST the micro-deposit code (MV#### or 4 digits) to complete verification. */
export function completeBankAccountVerification(transport, scope, bankAccountId, payload) {
    return transport(`${bankBase(scope)}/${encodeURIComponent(bankAccountId)}/complete-verification`, {
        method: 'POST',
        json: payload,
    });
}
/** PUT to make an account the single default. */
export function setDefaultBankAccount(transport, scope, bankAccountId) {
    return transport(`${bankBase(scope)}/${encodeURIComponent(bankAccountId)}/set-default`, { method: 'PUT' });
}
/** DELETE an account (hard delete; client-side guards live in client.ts callers). */
export function deleteBankAccount(transport, scope, bankAccountId) {
    return transport(`${bankBase(scope)}/${encodeURIComponent(bankAccountId)}`, { method: 'DELETE' });
}
