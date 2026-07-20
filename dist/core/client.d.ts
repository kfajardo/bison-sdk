import type { AuthProvider, Transport } from './transport.js';
import type { Scope } from './scope.js';
import type { BankRegister, CompleteVerificationPayload, MoovFilePurpose, OnboardingStep, OnboardingSubmit, PaymentMethodKey } from './types.js';
import { resolveResumeStep } from './resume.js';
export { resolveResumeStep, isSectionComplete } from './resume.js';
export { mock, createMockState, type MockState } from './mock.js';
export type ClientConfig = {
    transport: Transport;
} | {
    baseUrl: string;
    auth?: AuthProvider;
    fetch?: typeof globalThis.fetch;
};
export declare function createClient(cfg: ClientConfig): {
    onboarding: {
        getUser: (opts?: {
            email?: string;
        }) => Promise<import("./types.js").UserInfo>;
        getStates: (scope: Scope, step?: OnboardingStep) => Promise<unknown>;
        submit: (scope: Scope, submit: OnboardingSubmit) => Promise<import("./types.js").SaveSectionResult>;
        uploadDocument: (scope: Scope, file: File, purpose?: MoovFilePurpose, metadata?: string) => Promise<import("./types.js").DocumentUploadResult>;
        getIndustries: (scope: Scope) => Promise<import("./types.js").Industry[]>;
        getTosToken: () => Promise<import("./types.js").TosToken>;
        savePaymentMethodCapabilities: (scope: Scope, methods: PaymentMethodKey[]) => Promise<unknown>;
        resolveResumeStep: typeof resolveResumeStep;
    };
    banking: {
        list: (scope: Scope) => Promise<import("./types.js").BankAccount[]>;
        getPlaidToken: (scope: Scope) => Promise<import("./types.js").PlaidLinkToken>;
        register: (scope: Scope, payload: BankRegister) => Promise<import("./types.js").BankAccount>;
        initiateVerification: (scope: Scope, bankAccountId: string) => Promise<void>;
        completeVerification: (scope: Scope, bankAccountId: string, payload: CompleteVerificationPayload) => Promise<void>;
        setDefault: (scope: Scope, bankAccountId: string) => Promise<void>;
        delete: (scope: Scope, bankAccountId: string) => Promise<void>;
    };
};
export type BisonClient = ReturnType<typeof createClient>;
