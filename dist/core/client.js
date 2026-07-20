// Phase 1 — the client. Binds a Transport into the standalone functions and
// exposes them as { onboarding, banking }. Consumers pass either a ready Transport
// (e.g. mock()) or an http() config (baseUrl + auth).
import { http } from './transport.js';
import * as fn from './functions.js';
import { resolveResumeStep } from './resume.js';
export { resolveResumeStep, isSectionComplete } from './resume.js';
export { mock, createMockState } from './mock.js';
function resolveTransport(cfg) {
    return 'transport' in cfg ? cfg.transport : http(cfg);
}
export function createClient(cfg) {
    const t = resolveTransport(cfg);
    const onboarding = {
        getUser: (opts) => fn.getUser(t, opts),
        getStates: (scope, step) => fn.getOnboardingStates(t, scope, step),
        submit: (scope, submit) => fn.submitOnboarding(t, scope, submit),
        uploadDocument: (scope, file, purpose, metadata) => fn.uploadDocument(t, scope, file, purpose, metadata),
        getIndustries: (scope) => fn.getIndustries(t, scope),
        getTosToken: () => fn.getTosToken(t),
        savePaymentMethodCapabilities: (scope, methods) => fn.savePaymentMethodCapabilities(t, scope, methods),
        resolveResumeStep,
    };
    const banking = {
        list: (scope) => fn.getBankAccounts(t, scope),
        getPlaidToken: (scope) => fn.getPlaidToken(t, scope),
        register: (scope, payload) => fn.register(t, scope, payload),
        initiateVerification: (scope, bankAccountId) => fn.initiateVerification(t, scope, bankAccountId),
        completeVerification: (scope, bankAccountId, payload) => fn.completeVerification(t, scope, bankAccountId, payload),
        setDefault: (scope, bankAccountId) => fn.setDefaultBankAccount(t, scope, bankAccountId),
        delete: (scope, bankAccountId) => fn.deleteBankAccount(t, scope, bankAccountId),
    };
    return { onboarding, banking };
}
