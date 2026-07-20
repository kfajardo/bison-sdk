import { z } from 'zod';
/**
 * ABA routing checksum:
 * (3*(d0+d3+d6) + 7*(d1+d4+d7) + 1*(d2+d5+d8)) % 10 === 0
 */
export declare function isValidAbaRouting(routing: string): boolean;
export declare const routingNumberSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const accountNumberSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const bankAccountFormSchema: z.ZodObject<{
    holderName: z.ZodString;
    accountName: z.ZodOptional<z.ZodString>;
    bankName: z.ZodOptional<z.ZodString>;
    routingNumber: z.ZodEffects<z.ZodString, string, string>;
    accountNumber: z.ZodEffects<z.ZodString, string, string>;
    accountType: z.ZodOptional<z.ZodEnum<["checking", "savings"]>>;
    isDefault: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    holderName: string;
    routingNumber: string;
    accountNumber: string;
    bankName?: string | undefined;
    accountType?: "checking" | "savings" | undefined;
    accountName?: string | undefined;
    isDefault?: boolean | undefined;
}, {
    holderName: string;
    routingNumber: string;
    accountNumber: string;
    bankName?: string | undefined;
    accountType?: "checking" | "savings" | undefined;
    accountName?: string | undefined;
    isDefault?: boolean | undefined;
}>;
export declare const VERIFICATION_CODE_REGEX: RegExp;
export declare const verificationCodeSchema: z.ZodString;
/** Strip optional MV prefix, returning the 4-digit code (or null when invalid). */
export declare function normalizeVerificationCode(code: string): string | null;
