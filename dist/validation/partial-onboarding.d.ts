export type PartialOnboardingStep = 'contact' | 'incorporation' | 'leadership' | 'ownership';
export interface PartialOnboardingAddress {
    line1: string;
    line2: string;
    city: string;
    state: string;
    zip: string;
}
export interface PartialOnboardingSensitiveValue {
    value: string;
    provided: boolean;
}
export interface PartialOnboardingOwner {
    legalName: string;
    birthDate: PartialOnboardingSensitiveValue;
    taxId: PartialOnboardingSensitiveValue;
    ownershipPercentage: string;
    address: PartialOnboardingAddress;
}
export interface PartialOnboardingValues {
    contact: {
        corporationName: string;
        website: string;
        phone: string;
        address: PartialOnboardingAddress;
    };
    incorporation: {
        state: string;
        ein: PartialOnboardingSensitiveValue;
    };
    leadership: {
        legalName: string;
        title: string;
        birthDate: PartialOnboardingSensitiveValue;
        taxId: PartialOnboardingSensitiveValue;
        address: PartialOnboardingAddress;
        ownsQuarter: boolean;
    };
    ownership: {
        owners: PartialOnboardingOwner[];
        noOwnersAbove25: boolean;
        ownershipConfirmed: boolean;
    };
    consent: {
        termsAccepted: boolean;
    };
}
export type PartialOnboardingErrors = Record<string, string>;
export declare function validatePartialOnboardingOwner(owner: PartialOnboardingOwner): PartialOnboardingErrors;
export declare function validatePartialOnboardingStep(step: PartialOnboardingStep, values: PartialOnboardingValues): PartialOnboardingErrors;
