import { type BisonClient } from './client.js';
import type { HttpTransportConfig } from './transport.js';
import type { Scope } from './scope.js';
import type { BankAccount, BankRegister, CompleteVerificationPayload, MoovFilePurpose, OnboardingSectionData, OnboardingStep, OnboardingSubmit, PaymentMethodKey, PlaidRegisterResult } from './types.js';
export type BisonSetupOptions = Omit<HttpTransportConfig, 'apiKey'>;
export declare function setupBison(apiKey: string, options?: BisonSetupOptions): void;
export declare function getBisonClient(): BisonClient;
export declare const getUser: (...args: Parameters<BisonClient["getUser"]>) => Promise<import("./types.js").UserInfo>;
export declare const getOnboardingStatus: (scope: Scope) => Promise<import("./types.js").OnboardingStatus>;
export declare const getOnboardingSection: <Step extends OnboardingStep>(scope: Scope, step: Step) => Promise<OnboardingSectionData[Step] | null>;
export declare const submitOnboardingSection: (scope: Scope, submit: OnboardingSubmit) => Promise<import("./types.js").SaveSectionResult>;
export declare const uploadOnboardingDocument: (scope: Scope, file: File, purpose?: MoovFilePurpose, metadata?: string) => Promise<import("./types.js").DocumentUploadResult>;
export declare const getOnboardingIndustries: (scope: Scope) => Promise<import("./types.js").Industry[]>;
export declare const getOnboardingTermsToken: () => Promise<import("./types.js").TosToken>;
export declare const saveOnboardingPaymentMethods: (scope: Scope, methods: PaymentMethodKey[]) => Promise<void>;
export declare const getBankAccounts: (scope: Scope) => Promise<BankAccount[]>;
export declare const getPlaidLinkToken: (scope: Scope) => Promise<import("./types.js").PlaidLinkToken>;
export declare function registerBankAccount(scope: Scope, payload: Extract<BankRegister, {
    method: 'manual';
}>): Promise<BankAccount>;
export declare function registerBankAccount(scope: Scope, payload: Extract<BankRegister, {
    method: 'plaid';
}>): Promise<PlaidRegisterResult>;
export declare const initiateBankAccountVerification: (scope: Scope, bankAccountId: string) => Promise<void>;
export declare const completeBankAccountVerification: (scope: Scope, bankAccountId: string, payload: CompleteVerificationPayload) => Promise<void>;
export declare const setDefaultBankAccount: (scope: Scope, bankAccountId: string) => Promise<void>;
export declare const deleteBankAccount: (scope: Scope, bankAccountId: string) => Promise<void>;
