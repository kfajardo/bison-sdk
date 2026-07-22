import type { Transport } from './transport.js';
import type { BankAccount, KybDocumentInfo, PaymentMethodKey, SectionStatus } from './types.js';
interface MockBank extends BankAccount {
    /** Full routing+account, kept only to detect duplicate re-registration. */
    _routing?: string;
    _account?: string;
}
export interface MockState {
    moovAccountId?: string;
    businessProfileStatus: SectionStatus;
    controlOfficerStatus: SectionStatus;
    beneficialOwnersStatus: SectionStatus;
    processingVolumeStatus: SectionStatus;
    /** Partial onboarding does not require the legacy volume step. */
    partialOnboarding: boolean;
    selectedPaymentMethods: PaymentMethodKey[];
    /** Capabilities start pending, flip enabled after beneficial-owners POST (§6.3). */
    capabilitiesRequested: boolean;
    documents: KybDocumentInfo[];
    isOnboarded: boolean;
    /** Redaction flags — true once the sensitive value has been submitted (§5.2). */
    taxIdProvided: boolean;
    birthDateProvided: boolean;
    governmentIdProvided: boolean;
    /** Saved section data for GET re-fetch (with sensitive fields redacted out). */
    business?: Record<string, unknown>;
    officer?: Record<string, unknown>;
    owners?: Record<string, unknown>[];
    volume?: Record<string, unknown>;
    controlOfficerRepresentativeId?: string;
    ownerRepresentativeIds: string[];
    /** Seeded US address present -> bank-account-eligible before business profile (§8.1). */
    hasUsAddress: boolean;
    banks: MockBank[];
    seq: number;
}
export declare function createMockState(seed?: Partial<MockState>): MockState;
export declare function mock(opts?: {
    seed?: MockState;
    latencyMs?: number;
}): Transport;
export {};
