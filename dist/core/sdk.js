// Public singleton surface. One setup call powers both direct functions and components.
import { createClient } from './client.js';
let client;
export function setupBison(apiKey, options = {}) {
    client = createClient({ apiKey, ...options });
}
export function getBisonClient() {
    if (!client)
        throw new Error('Call setupBison(apiKey) before using the Bison SDK');
    return client;
}
export const getUser = (...args) => getBisonClient().getUser(...args);
export const getOnboardingStatus = (scope) => getBisonClient().getOnboardingStatus(scope);
export const getOnboardingSection = (scope, step) => getBisonClient().getOnboardingSection(scope, step);
export const submitOnboardingSection = (scope, submit) => getBisonClient().submitOnboardingSection(scope, submit);
export const uploadOnboardingDocument = (scope, file, purpose, metadata) => getBisonClient().uploadOnboardingDocument(scope, file, purpose, metadata);
export const getOnboardingIndustries = (scope) => getBisonClient().getOnboardingIndustries(scope);
export const getOnboardingTermsToken = () => getBisonClient().getOnboardingTermsToken();
export const saveOnboardingPaymentMethods = (scope, methods) => getBisonClient().saveOnboardingPaymentMethods(scope, methods);
export const getBankAccounts = (scope) => getBisonClient().getBankAccounts(scope);
export const getPlaidLinkToken = (scope) => getBisonClient().getPlaidLinkToken(scope);
export function registerBankAccount(scope, payload) {
    return getBisonClient().registerBankAccount(scope, payload);
}
export const initiateBankAccountVerification = (scope, bankAccountId) => getBisonClient().initiateBankAccountVerification(scope, bankAccountId);
export const completeBankAccountVerification = (scope, bankAccountId, payload) => getBisonClient().completeBankAccountVerification(scope, bankAccountId, payload);
export const setDefaultBankAccount = (scope, bankAccountId) => getBisonClient().setDefaultBankAccount(scope, bankAccountId);
export const deleteBankAccount = (scope, bankAccountId) => getBisonClient().deleteBankAccount(scope, bankAccountId);
