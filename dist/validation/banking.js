import { z } from 'zod';
import { digitsOnly } from './index.js';
// Ported from bison-jib-web-flow src/utils/bank_account_validation.ts (BANKING_SPEC §4.3)
// and src/components/banking/bank_verification_dialog.tsx. Keep rules in sync with the platform app.
/**
 * ABA routing checksum:
 * (3*(d0+d3+d6) + 7*(d1+d4+d7) + 1*(d2+d5+d8)) % 10 === 0
 */
export function isValidAbaRouting(routing) {
    if (!/^\d{9}$/.test(routing))
        return false;
    const d = routing.split('').map(Number);
    const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + 1 * (d[2] + d[5] + d[8]);
    return sum % 10 === 0;
}
export const routingNumberSchema = z
    .string()
    .trim()
    .regex(/^\d{9}$/, 'Routing number must be 9 digits')
    .refine(isValidAbaRouting, 'Invalid routing number');
export const accountNumberSchema = z
    .string()
    .trim()
    .regex(/^\d+$/, 'Account number must contain digits only')
    .min(4, 'Account number is too short')
    .max(20, 'Account number is too long')
    .refine((v) => !/^0+$/.test(v), 'Account number cannot be all zeros');
export const bankAccountFormSchema = z.object({
    holderName: z.string().trim().min(1, 'Account holder name is required'),
    accountName: z.string().max(200).optional(),
    bankName: z.string().max(200).optional(),
    routingNumber: routingNumberSchema,
    accountNumber: accountNumberSchema,
    accountType: z.enum(['checking', 'savings']).optional(),
    isDefault: z.boolean().optional(),
});
// Verification code (§4.3): UI enforces MV#### ; backend accepts 4 digits with optional MV prefix.
export const VERIFICATION_CODE_REGEX = /^MV\d{4}$/i;
export const verificationCodeSchema = z
    .string()
    .trim()
    .regex(VERIFICATION_CODE_REGEX, 'Verification code must be in format MV####');
/** Strip optional MV prefix, returning the 4-digit code (or null when invalid). */
export function normalizeVerificationCode(code) {
    const digits = digitsOnly(code.replace(/^MV/i, ''));
    return /^\d{4}$/.test(digits) ? digits : null;
}
