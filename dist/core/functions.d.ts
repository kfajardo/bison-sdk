import type { Transport } from './transport.js';
import type { Scope } from './scope.js';
import type { BankAccount, BankRegister, CompleteVerificationPayload, DocumentUploadResult, Industry, MoovFilePurpose, OnboardingStatus, OnboardingSectionData, OnboardingStep, OnboardingSubmit, PaymentMethodKey, PlaidLinkToken, PlaidRegisterResult, SaveSectionResult, TosToken, UserInfo } from './types.js';
/** GET the current API-key identity. */
export declare function getUser(transport: Transport): Promise<UserInfo>;
/** Load the full onboarding status. */
export declare function getOnboardingStatus(transport: Transport, scope: Scope): Promise<OnboardingStatus>;
/** Load one saved onboarding section. */
export declare function getOnboardingSection<Step extends OnboardingStep>(transport: Transport, scope: Scope, step: Step): Promise<OnboardingSectionData[Step] | null>;
/** POST the matching section endpoint. Returns SaveSectionResult (business also
 *  carries moovAccountId on first save). */
export declare function submitOnboardingSection(transport: Transport, scope: Scope, submit: OnboardingSubmit): Promise<SaveSectionResult>;
/** Multipart document upload. Purpose defaults to merchant_underwriting. */
export declare function uploadOnboardingDocument(transport: Transport, scope: Scope, file: File, purpose?: MoovFilePurpose, metadata?: string): Promise<DocumentUploadResult>;
/** GET the industry list for the scope's persona. */
export declare function getOnboardingIndustries(transport: Transport, scope: Scope): Promise<Industry[]>;
/** POST for a Moov ToS token. */
export declare function getOnboardingTermsToken(transport: Transport): Promise<TosToken>;
/** Persist the selected payment-method capabilities for the scope. */
export declare function saveOnboardingPaymentMethods(transport: Transport, scope: Scope, methods: PaymentMethodKey[]): Promise<void>;
/** GET the scope's bank accounts. */
export declare function getBankAccounts(transport: Transport, scope: Scope): Promise<BankAccount[]>;
/** POST a Plaid link token for the scope's entity. */
export declare function getPlaidLinkToken(transport: Transport, scope: Scope): Promise<PlaidLinkToken>;
/** Register a bank account — manual entry (Moov) or Plaid link.
 *  Manual returns the created BankAccount; Plaid returns per-processor results. */
export declare function registerBankAccount(transport: Transport, scope: Scope, payload: Extract<BankRegister, {
    method: 'manual';
}>): Promise<BankAccount>;
export declare function registerBankAccount(transport: Transport, scope: Scope, payload: Extract<BankRegister, {
    method: 'plaid';
}>): Promise<PlaidRegisterResult>;
/** POST to start micro-deposit verification for an account. */
export declare function initiateBankAccountVerification(transport: Transport, scope: Scope, bankAccountId: string): Promise<void>;
/** POST the micro-deposit code (MV#### or 4 digits) to complete verification. */
export declare function completeBankAccountVerification(transport: Transport, scope: Scope, bankAccountId: string, payload: CompleteVerificationPayload): Promise<void>;
/** PUT to make an account the single default. */
export declare function setDefaultBankAccount(transport: Transport, scope: Scope, bankAccountId: string): Promise<void>;
/** DELETE an account (hard delete; client-side guards live in client.ts callers). */
export declare function deleteBankAccount(transport: Transport, scope: Scope, bankAccountId: string): Promise<void>;
