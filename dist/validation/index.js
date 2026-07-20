import { z } from 'zod';
import { BUSINESS_TYPES, US_STATES, US_TERRITORIES } from './constants.js';
export * from './constants.js';
// Ported from bison-jib-web-flow src/operator/components/verification/validation.ts
// and src/utils/validation/payment_provider.ts. Keep rules in sync with the platform app.
export const PAYMENT_PROVIDER_ALLOWED_CHARS = /^[a-zA-Z0-9 .,'&#/()!@+:;-]*$/;
export const PAYMENT_PROVIDER_CHAR_ERROR = "Contains characters not allowed by our payment provider. Use only letters, numbers, spaces, and common punctuation (. , ' - & # / !)";
export const collapseWhitespace = (value) => value.trim().replace(/\s+/g, ' ');
export const digitsOnly = (value) => value.replace(/\D/g, '');
const normalize = (value) => value.trim().toLowerCase().replace(/\s+/g, ' ');
const normalizeZip = (value) => {
    const digits = digitsOnly(value);
    return digits.length > 5 ? digits.slice(0, 5) : digits;
};
const US_STATE_VALUES = new Set([...US_STATES, ...US_TERRITORIES].flatMap((state) => [state.value.toUpperCase(), state.label.toUpperCase()]));
export const US_STATE_ERROR = 'State must be a valid US state.';
export function isValidUsState(value) {
    return US_STATE_VALUES.has(value.trim().toUpperCase());
}
export const PO_BOX_REGEX = /^\s*(?:p\.?\s*o\.?\s*b(?:ox)?|post\s+office\s+box)\s*\d*/i;
export const PO_BOX_ERROR = 'P.O. Box addresses are not permitted. Please provide a physical street address.';
export function isPOBox(value) {
    return PO_BOX_REGEX.test(value.trim());
}
export const DEFAULT_COUNTRY = 'US';
export const COUNTRY_REQUIRED_ERROR = 'Country is required.';
export const US_COUNTRY_REQUIRED_ERROR = 'Country must be United States (US).';
export function normalizeCountryValue(country) {
    const value = country?.trim();
    if (!value)
        return '';
    const normalized = value.toUpperCase();
    if (normalized === DEFAULT_COUNTRY ||
        normalized === 'USA' ||
        normalized === 'UNITED STATES' ||
        normalized === 'UNITED STATES OF AMERICA') {
        return DEFAULT_COUNTRY;
    }
    return value;
}
export function isUnitedStatesCountry(country) {
    return normalizeCountryValue(country) === DEFAULT_COUNTRY;
}
export function isMatchingBusinessAddress(person, business) {
    if (!person.addressLine1 && !person.city && !person.state && !person.postalCode)
        return false;
    return (normalize(person.addressLine1) === normalize(business.addressLine1) &&
        normalize(person.city) === normalize(business.city) &&
        normalize(person.state) === normalize(business.state) &&
        normalizeZip(person.postalCode) === normalizeZip(business.zipCode));
}
export function validateAddressNotMatchingBusiness(person, business) {
    return isMatchingBusinessAddress(person, business) ? 'Must use a personal address, not the business address' : null;
}
// ============================================================================
// Shared field fragments
// ============================================================================
const providerString = (max) => z
    .string()
    .trim()
    .min(1, 'Required')
    .max(max, `Must be ${max} characters or less`)
    .regex(PAYMENT_PROVIDER_ALLOWED_CHARS, PAYMENT_PROVIDER_CHAR_ERROR);
const optionalProviderString = (max) => z
    .string()
    .optional()
    .refine((val) => !val || val.length <= max, `Must be ${max} characters or less`)
    .refine((val) => !val || PAYMENT_PROVIDER_ALLOWED_CHARS.test(val), PAYMENT_PROVIDER_CHAR_ERROR);
const emailField = z.string().trim().min(1, 'Required').email('Invalid email address');
const phoneField = z
    .string()
    .trim()
    .min(1, 'Required')
    .refine((val) => digitsOnly(val).length === 10, 'Must be 10 digits');
const adultDateOfBirth = z
    .string()
    .min(1, 'Required')
    .refine((val) => {
    const dob = new Date(val);
    const today = new Date();
    const age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    const dayDiff = today.getDate() - dob.getDate();
    const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
    return actualAge >= 18;
}, 'Must be at least 18 years old');
const ssnField = z
    .string()
    .trim()
    .min(1, 'Required')
    .regex(/^\d{3}-\d{2}-\d{4}$/, 'Must be in format XXX-XX-XXXX');
const streetAddress = providerString(60).refine((val) => !isPOBox(val), PO_BOX_ERROR);
const personAddressFields = {
    addressLine1: streetAddress,
    city: providerString(32),
    state: z.string().min(1, 'Required').refine(isValidUsState, US_STATE_ERROR),
    postalCode: z
        .string()
        .trim()
        .min(1, 'Required')
        .refine((val) => digitsOnly(val).length === 5, 'Must be 5 digits'),
};
const positiveWholeAmount = z
    .string()
    .trim()
    .min(1, 'Required')
    .refine((val) => {
    const digits = val.replace(/\D/g, '');
    return digits.length > 0 && parseInt(digits, 10) > 0;
}, 'Must be a positive whole number');
// ============================================================================
// Schemas
// ============================================================================
/**
 * requireDbaAndWebsite: the embeddable operator registration requires both; WIO does not.
 * includeTypeAndDescription: WIO collects business type + description; the operator endpoint has no such fields.
 */
export function makeBusinessProfileSchema(options = {}) {
    const typeAndDescription = options.includeTypeAndDescription
        ? {
            businessType: z
                .string()
                .min(1, 'Required')
                .refine((value) => BUSINESS_TYPES.some((t) => t.value === value), 'Invalid business type'),
            description: z
                .string()
                .trim()
                .min(10, 'Must be at least 10 characters')
                .max(100, 'Must be 100 characters or less'),
        }
        : {};
    return z
        .object({
        legalBusinessName: providerString(64),
        doingBusinessAs: options.requireDbaAndWebsite ? providerString(64) : optionalProviderString(64),
        ein: z
            .string()
            .trim()
            .min(1, 'Required')
            .regex(/^\d{2}-\d{7}$/, 'Must be in format XX-XXXXXXX'),
        ...typeAndDescription,
        website: options.requireDbaAndWebsite
            ? z
                .string()
                .trim()
                .min(1, 'Required')
                .refine((val) => isHttpUrl(val), 'Must be a valid URL (http:// or https://)')
            : z
                .string()
                .trim()
                .optional()
                .refine((val) => !val || isHttpUrl(val), 'Must be a valid URL (http:// or https://) or left empty'),
        phone: phoneField,
        email: emailField,
        addressLine1: streetAddress,
        addressLine2: optionalProviderString(60),
        city: providerString(32),
        state: z.string().min(1, 'Required'),
        country: z
            .string()
            .trim()
            .min(1, COUNTRY_REQUIRED_ERROR)
            .transform(normalizeCountryValue)
            .refine(isUnitedStatesCountry, US_COUNTRY_REQUIRED_ERROR),
        zipCode: z.string().trim().min(1, 'Required'),
    })
        .superRefine((data, ctx) => {
        if (isUnitedStatesCountry(data.country) && data.state.trim() && !isValidUsState(data.state)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: US_STATE_ERROR, path: ['state'] });
        }
        if (isUnitedStatesCountry(data.country) && digitsOnly(data.zipCode).length !== 5) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be 5 digits', path: ['zipCode'] });
        }
    });
}
function isHttpUrl(value) {
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
    }
    catch {
        return false;
    }
}
export const businessProfileSchema = makeBusinessProfileSchema({ includeTypeAndDescription: true });
export const operatorBusinessProfileSchema = makeBusinessProfileSchema({ requireDbaAndWebsite: true });
export const controlOfficerSchema = z.object({
    firstName: providerString(64),
    lastName: providerString(64),
    title: providerString(64),
    email: emailField,
    phone: phoneField,
    dateOfBirth: adultDateOfBirth,
    ssn: ssnField,
    ...personAddressFields,
});
export const beneficialOwnerSchema = z.object({
    firstName: providerString(64),
    lastName: providerString(64),
    email: emailField,
    phone: phoneField,
    dateOfBirth: adultDateOfBirth,
    ssn: ssnField,
    ownershipPercentage: z
        .string()
        .trim()
        .min(1, 'Required')
        .refine((val) => {
        const num = Number(val);
        return !isNaN(num) && Number.isInteger(num) && num >= 25 && num <= 100;
    }, 'Must be a whole number between 25 and 100'),
    ...personAddressFields,
});
export const processingVolumeSchema = z
    .object({
    averageMonthlyVolume: positiveWholeAmount,
    averageTransactionAmount: positiveWholeAmount,
    maxTransactionAmount: positiveWholeAmount,
})
    .superRefine((data, ctx) => {
    const max = parseInt(data.maxTransactionAmount.replace(/\D/g, ''), 10);
    const avg = parseInt(data.averageTransactionAmount.replace(/\D/g, ''), 10);
    if (!isNaN(max) && !isNaN(avg) && max < avg) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Must be greater than or equal to average transaction amount',
            path: ['maxTransactionAmount'],
        });
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Cannot exceed maximum transaction amount',
            path: ['averageTransactionAmount'],
        });
    }
});
// ----------------------------------------------------------------------------
// §5.4 Processing volume — backend rules (KybDTOs.cs, IValidatableObject)
// ----------------------------------------------------------------------------
export const GEOGRAPHIC_REACH_REGEX = /^(us-only|us-and-international|international-only)$/;
export const BUSINESS_PRESENCE_REGEX = /^(commercial-office|home-based|mixed-presence|mobile-business|online-only|retail-storefront)$/;
export const PENDING_LITIGATION_REGEX = /^(bankruptcy-or-insolvency|consumer-protection-or-class-action|data-breach-or-privacy|employment-or-workplace-disputes|fraud-or-financial-crime|government-enforcement-or-investigation|intellectual-property|none|other|personal-injury-or-medical)$/;
export const geographicReachSchema = z.string().regex(GEOGRAPHIC_REACH_REGEX);
export const businessPresenceSchema = z.string().regex(BUSINESS_PRESENCE_REGEX);
export const pendingLitigationSchema = z.string().regex(PENDING_LITIGATION_REGEX);
const volumeShare = z.number().int().min(0).max(100);
/** Volume share by customer type — must total exactly 100. */
export const volumeShareByCustomerTypeSchema = z
    .object({
    business: volumeShare,
    consumer: volumeShare,
    p2p: volumeShare,
})
    .refine((data) => data.business + data.consumer + data.p2p === 100, 'Volume share by customer type must total 100');
export const emailStepSchema = z.object({ email: emailField });
// ----------------------------------------------------------------------------
// Banking (§4.3) — re-exported for a single validation entry point
// ----------------------------------------------------------------------------
export * from './banking.js';
/** Validates data against a schema; returns one message per failing field ({} when valid). */
export function validateForm(schema, data) {
    const result = schema.safeParse(data);
    if (result.success)
        return {};
    const errors = {};
    for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (!errors[field])
            errors[field] = issue.message;
    }
    return errors;
}
/** Validates a single field; skips empty values so untouched fields stay quiet on blur. */
export function validateField(schema, data, fieldName) {
    const value = data[fieldName];
    if (value === '' || value === undefined || value === null)
        return null;
    const result = schema.safeParse(data);
    if (result.success)
        return null;
    for (const issue of result.error.issues) {
        if (issue.path[0] === fieldName)
            return issue.message;
    }
    return null;
}
/** Returns an error when combined ownership exceeds 100%. */
export function validateOwnershipTotal(owners) {
    const total = owners.reduce((sum, owner) => {
        const pct = Number(owner.ownershipPercentage);
        return sum + (isNaN(pct) ? 0 : pct);
    }, 0);
    return total > 100 ? `Total ownership is ${total}%, which exceeds 100%. Please adjust.` : null;
}
