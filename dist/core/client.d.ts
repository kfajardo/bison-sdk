import type { HttpTransportConfig, Transport } from './transport.js';
import type { Scope } from './scope.js';
import type { BankAccount, BankRegister, CompleteVerificationPayload, MoovFilePurpose, OnboardingStep, OnboardingSubmit, PaymentMethodKey, PlaidRegisterResult } from './types.js';
export { resolveOnboardingResumeStep, isOnboardingSectionComplete } from './resume.js';
export { mock, createMockState, type MockState } from './mock.js';
export type ClientConfig = {
    transport: Transport;
} | HttpTransportConfig;
/** Advanced escape hatch. Most consumers should call setupBison(apiKey) once. */
export declare function createClient(cfg: ClientConfig | string): {
    getUser: () => Promise<import("./types.js").UserInfo>;
    getOnboardingStatus: (scope: Scope) => Promise<import("./types.js").OnboardingStatus>;
    getOnboardingSection: <Step extends OnboardingStep>(scope: Scope, step: Step) => Promise<import("./types.js").OnboardingSectionData[Step] | null>;
    submitOnboardingSection: (scope: Scope, submit: OnboardingSubmit) => Promise<import("./types.js").SaveSectionResult>;
    uploadOnboardingDocument: (scope: Scope, file: File, purpose?: MoovFilePurpose, metadata?: string) => Promise<import("./types.js").DocumentUploadResult>;
    getBankAccounts: (scope: Scope) => Promise<BankAccount[]>;
    getPlaidLinkToken: (scope: Scope) => Promise<import("./types.js").PlaidLinkToken>;
    registerBankAccount: {
        (scope: Scope, payload: Extract<BankRegister, {
            method: "manual";
        }>): Promise<BankAccount>;
        (scope: Scope, payload: Extract<BankRegister, {
            method: "plaid";
        }>): Promise<PlaidRegisterResult>;
    };
    initiateBankAccountVerification: (scope: Scope, bankAccountId: string) => Promise<void>;
    completeBankAccountVerification: (scope: Scope, bankAccountId: string, payload: CompleteVerificationPayload) => Promise<void>;
    setDefaultBankAccount: (scope: Scope, bankAccountId: string) => Promise<void>;
    deleteBankAccount: (scope: Scope, bankAccountId: string) => Promise<void>;
    getOnboardingIndustries: (scope: Scope) => Promise<import("./types.js").Industry[]>;
    getOnboardingTermsToken: () => Promise<import("./types.js").TosToken>;
    saveOnboardingPaymentMethods: (scope: Scope, methods: PaymentMethodKey[]) => Promise<void>;
};
export type BisonClient = ReturnType<typeof createClient>;
