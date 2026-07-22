export { BisonOnboarding } from './onboarding.js';
export type { BisonSectionClient, OnboardingLabels, OnboardingPrefill, SectionUiState } from './onboarding.js';
export { BisonOnboardingPartial } from './partial.js';
export { BisonBankAccounts } from './bank_accounts.js';
export type { PlaidLinkHook, PlaidLinkResult } from './bank_accounts.js';
/** Registers <bison-onboarding>, <bison-onboarding-partial>, <bison-bank-accounts>.
 *  Idempotent — safe to call more than once. */
export declare function defineBisonComponents(): void;
