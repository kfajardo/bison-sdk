import { z } from 'zod';
export * from './constants.js';
export * from './partial-onboarding.js';
export declare const PAYMENT_PROVIDER_ALLOWED_CHARS: RegExp;
export declare const PAYMENT_PROVIDER_CHAR_ERROR = "Contains characters not allowed by our payment provider. Use only letters, numbers, spaces, and common punctuation (. , ' - & # / !)";
export declare const collapseWhitespace: (value: string) => string;
export declare const digitsOnly: (value: string) => string;
export declare const US_STATE_ERROR = "State must be a valid US state.";
export declare function isValidUsState(value: string): boolean;
export declare const PO_BOX_REGEX: RegExp;
export declare const PO_BOX_ERROR = "P.O. Box addresses are not permitted. Please provide a physical street address.";
export declare function isPOBox(value: string): boolean;
export declare const DEFAULT_COUNTRY = "US";
export declare const COUNTRY_REQUIRED_ERROR = "Country is required.";
export declare const US_COUNTRY_REQUIRED_ERROR = "Country must be United States (US).";
export declare function normalizeCountryValue(country?: string | null): string;
export declare function isUnitedStatesCountry(country: string): boolean;
export interface PersonAddress {
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
}
export interface BusinessAddress {
    addressLine1: string;
    city: string;
    state: string;
    zipCode: string;
}
export declare function isMatchingBusinessAddress(person: PersonAddress, business: BusinessAddress): boolean;
export declare function validateAddressNotMatchingBusiness(person: PersonAddress, business: BusinessAddress): string | null;
/**
 * requireDbaAndWebsite: the embeddable operator registration requires both; WIO does not.
 * includeTypeAndDescription: WIO collects business type + description; the operator endpoint has no such fields.
 */
export declare function makeBusinessProfileSchema(options?: {
    requireDbaAndWebsite?: boolean;
    includeTypeAndDescription?: boolean;
}): z.ZodEffects<z.ZodObject<{
    website: z.ZodEffects<z.ZodString, string, string> | z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    phone: z.ZodEffects<z.ZodString, string, string>;
    email: z.ZodString;
    addressLine1: z.ZodEffects<z.ZodString, string, string>;
    addressLine2: z.ZodEffects<z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>, string | undefined, string | undefined>;
    city: z.ZodString;
    state: z.ZodString;
    country: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    zipCode: z.ZodString;
    legalBusinessName: z.ZodString;
    doingBusinessAs: z.ZodString | z.ZodEffects<z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>, string | undefined, string | undefined>;
    ein: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    ein: string;
    legalBusinessName: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    doingBusinessAs?: string | undefined;
    website?: string | undefined;
    addressLine2?: string | undefined;
}, {
    email: string;
    ein: string;
    legalBusinessName: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    doingBusinessAs?: string | undefined;
    website?: string | undefined;
    addressLine2?: string | undefined;
}>, {
    email: string;
    ein: string;
    legalBusinessName: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    doingBusinessAs?: string | undefined;
    website?: string | undefined;
    addressLine2?: string | undefined;
}, {
    email: string;
    ein: string;
    legalBusinessName: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    doingBusinessAs?: string | undefined;
    website?: string | undefined;
    addressLine2?: string | undefined;
}>;
export declare const businessProfileSchema: z.ZodEffects<z.ZodObject<{
    website: z.ZodEffects<z.ZodString, string, string> | z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    phone: z.ZodEffects<z.ZodString, string, string>;
    email: z.ZodString;
    addressLine1: z.ZodEffects<z.ZodString, string, string>;
    addressLine2: z.ZodEffects<z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>, string | undefined, string | undefined>;
    city: z.ZodString;
    state: z.ZodString;
    country: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    zipCode: z.ZodString;
    legalBusinessName: z.ZodString;
    doingBusinessAs: z.ZodString | z.ZodEffects<z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>, string | undefined, string | undefined>;
    ein: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    ein: string;
    legalBusinessName: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    doingBusinessAs?: string | undefined;
    website?: string | undefined;
    addressLine2?: string | undefined;
}, {
    email: string;
    ein: string;
    legalBusinessName: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    doingBusinessAs?: string | undefined;
    website?: string | undefined;
    addressLine2?: string | undefined;
}>, {
    email: string;
    ein: string;
    legalBusinessName: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    doingBusinessAs?: string | undefined;
    website?: string | undefined;
    addressLine2?: string | undefined;
}, {
    email: string;
    ein: string;
    legalBusinessName: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    doingBusinessAs?: string | undefined;
    website?: string | undefined;
    addressLine2?: string | undefined;
}>;
export declare const operatorBusinessProfileSchema: z.ZodEffects<z.ZodObject<{
    website: z.ZodEffects<z.ZodString, string, string> | z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    phone: z.ZodEffects<z.ZodString, string, string>;
    email: z.ZodString;
    addressLine1: z.ZodEffects<z.ZodString, string, string>;
    addressLine2: z.ZodEffects<z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>, string | undefined, string | undefined>;
    city: z.ZodString;
    state: z.ZodString;
    country: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    zipCode: z.ZodString;
    legalBusinessName: z.ZodString;
    doingBusinessAs: z.ZodString | z.ZodEffects<z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>, string | undefined, string | undefined>;
    ein: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    ein: string;
    legalBusinessName: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    doingBusinessAs?: string | undefined;
    website?: string | undefined;
    addressLine2?: string | undefined;
}, {
    email: string;
    ein: string;
    legalBusinessName: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    doingBusinessAs?: string | undefined;
    website?: string | undefined;
    addressLine2?: string | undefined;
}>, {
    email: string;
    ein: string;
    legalBusinessName: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    doingBusinessAs?: string | undefined;
    website?: string | undefined;
    addressLine2?: string | undefined;
}, {
    email: string;
    ein: string;
    legalBusinessName: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    doingBusinessAs?: string | undefined;
    website?: string | undefined;
    addressLine2?: string | undefined;
}>;
export declare const controlOfficerSchema: z.ZodObject<{
    addressLine1: z.ZodEffects<z.ZodString, string, string>;
    city: z.ZodString;
    state: z.ZodEffects<z.ZodString, string, string>;
    postalCode: z.ZodEffects<z.ZodString, string, string>;
    firstName: z.ZodString;
    lastName: z.ZodString;
    title: z.ZodString;
    email: z.ZodString;
    phone: z.ZodEffects<z.ZodString, string, string>;
    dateOfBirth: z.ZodEffects<z.ZodString, string, string>;
    ssn: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    ssn: string;
    firstName: string;
    lastName: string;
    title: string;
    dateOfBirth: string;
    postalCode: string;
}, {
    email: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    ssn: string;
    firstName: string;
    lastName: string;
    title: string;
    dateOfBirth: string;
    postalCode: string;
}>;
export declare const beneficialOwnerSchema: z.ZodObject<{
    addressLine1: z.ZodEffects<z.ZodString, string, string>;
    city: z.ZodString;
    state: z.ZodEffects<z.ZodString, string, string>;
    postalCode: z.ZodEffects<z.ZodString, string, string>;
    firstName: z.ZodString;
    lastName: z.ZodString;
    email: z.ZodString;
    phone: z.ZodEffects<z.ZodString, string, string>;
    dateOfBirth: z.ZodEffects<z.ZodString, string, string>;
    ssn: z.ZodString;
    ownershipPercentage: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    email: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    ssn: string;
    ownershipPercentage: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    postalCode: string;
}, {
    email: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    ssn: string;
    ownershipPercentage: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    postalCode: string;
}>;
export declare const processingVolumeSchema: z.ZodEffects<z.ZodObject<{
    averageMonthlyVolume: z.ZodEffects<z.ZodString, string, string>;
    averageTransactionAmount: z.ZodEffects<z.ZodString, string, string>;
    maxTransactionAmount: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    averageMonthlyVolume: string;
    averageTransactionAmount: string;
    maxTransactionAmount: string;
}, {
    averageMonthlyVolume: string;
    averageTransactionAmount: string;
    maxTransactionAmount: string;
}>, {
    averageMonthlyVolume: string;
    averageTransactionAmount: string;
    maxTransactionAmount: string;
}, {
    averageMonthlyVolume: string;
    averageTransactionAmount: string;
    maxTransactionAmount: string;
}>;
export declare const GEOGRAPHIC_REACH_REGEX: RegExp;
export declare const BUSINESS_PRESENCE_REGEX: RegExp;
export declare const PENDING_LITIGATION_REGEX: RegExp;
export declare const geographicReachSchema: z.ZodString;
export declare const businessPresenceSchema: z.ZodString;
export declare const pendingLitigationSchema: z.ZodString;
/** Volume share by customer type — must total exactly 100. */
export declare const volumeShareByCustomerTypeSchema: z.ZodEffects<z.ZodObject<{
    business: z.ZodNumber;
    consumer: z.ZodNumber;
    p2p: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    business: number;
    consumer: number;
    p2p: number;
}, {
    business: number;
    consumer: number;
    p2p: number;
}>, {
    business: number;
    consumer: number;
    p2p: number;
}, {
    business: number;
    consumer: number;
    p2p: number;
}>;
export declare const emailStepSchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
export * from './banking.js';
export type StepErrors = Record<string, string>;
/** Validates data against a schema; returns one message per failing field ({} when valid). */
export declare function validateForm(schema: z.ZodTypeAny, data: unknown): StepErrors;
/** Validates a single field; skips empty values so untouched fields stay quiet on blur. */
export declare function validateField(schema: z.ZodTypeAny, data: unknown, fieldName: string): string | null;
/** Returns an error when combined ownership exceeds 100%. */
export declare function validateOwnershipTotal(owners: {
    ownershipPercentage?: string;
}[]): string | null;
