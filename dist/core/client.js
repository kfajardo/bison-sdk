// Binds a Transport into standalone functions. Web components call the same
// functions consumers can call directly.
import { http } from './transport.js';
import * as fn from './functions.js';
export { resolveOnboardingResumeStep, isOnboardingSectionComplete } from './resume.js';
export { mock, createMockState } from './mock.js';
function resolveTransport(cfg) {
    return 'transport' in cfg ? cfg.transport : http(cfg);
}
export function createClient(cfg) {
    const t = resolveTransport(cfg);
    function registerBankAccount(scope, payload) {
        return fn.registerBankAccount(t, scope, payload);
    }
    return {
        getUser: (opts) => fn.getUser(t, opts),
        getOnboardingStatus: (scope) => fn.getOnboardingStatus(t, scope),
        getOnboardingSection: (scope, step) => fn.getOnboardingSection(t, scope, step),
        submitOnboardingSection: (scope, submit) => fn.submitOnboardingSection(t, scope, submit),
        uploadOnboardingDocument: (scope, file, purpose, metadata) => fn.uploadOnboardingDocument(t, scope, file, purpose, metadata),
        getBankAccounts: (scope) => fn.getBankAccounts(t, scope),
        getPlaidLinkToken: (scope) => fn.getPlaidLinkToken(t, scope),
        registerBankAccount,
        initiateBankAccountVerification: (scope, bankAccountId) => fn.initiateBankAccountVerification(t, scope, bankAccountId),
        completeBankAccountVerification: (scope, bankAccountId, payload) => fn.completeBankAccountVerification(t, scope, bankAccountId, payload),
        setDefaultBankAccount: (scope, bankAccountId) => fn.setDefaultBankAccount(t, scope, bankAccountId),
        deleteBankAccount: (scope, bankAccountId) => fn.deleteBankAccount(t, scope, bankAccountId),
        getOnboardingIndustries: (scope) => fn.getOnboardingIndustries(t, scope),
        getOnboardingTermsToken: () => fn.getOnboardingTermsToken(t),
        saveOnboardingPaymentMethods: (scope, methods) => fn.saveOnboardingPaymentMethods(t, scope, methods),
    };
}
