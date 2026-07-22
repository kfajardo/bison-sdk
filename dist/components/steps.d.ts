import { z } from 'zod';
import type { BeneficialOwnerPayload, BusinessProfilePayload, ControlOfficerPayload, OnboardingStep, OnboardingSubmit, ProcessingVolumePayload } from '../core/types.js';
import { type StepErrors } from '../validation/index.js';
import { type FieldSpec } from './form.js';
export interface SectionSpec {
    step: OnboardingStep;
    title: string;
    fields: FieldSpec[];
    schema: z.ZodTypeAny;
    /** Repeatable fieldset (beneficial owners). */
    repeat?: {
        itemLabel: string;
        addLabel: string;
    };
}
/** The four form-backed KYB sections. `documents` is handled by onboarding.ts (upload UI). */
export declare const SECTIONS: Record<Exclude<OnboardingStep, 'documents'>, SectionSpec>;
export declare function sectionSpec(step: OnboardingStep): SectionSpec | undefined;
/** Render a section's form body into `form`. For repeatable sections, `owners`
 *  seeds the fieldsets; onAdd/onRemove re-render. Prefill via `prefill`. */
export declare function renderSection(form: HTMLFormElement, spec: SectionSpec, opts?: {
    owners?: Record<string, string>[];
    prefill?: Record<string, string>;
    onAdd?: () => void;
    onRemove?: (index: number) => void;
}): void;
/** Read a repeatable section's fieldsets into owner records. */
export declare function collectOwners(form: HTMLElement): Record<string, string>[];
/** Validate a single-record section; layers the officer/business-address clash rule. */
export declare function validateSection(spec: SectionSpec, record: Record<string, string>, business?: Record<string, string>): StepErrors;
/** Validate every owner fieldset + the ownership-total rule. Writes errors into the DOM.
 *  Returns { valid, total } where total is the cross-fieldset ownership message (or null). */
export declare function validateOwnersForm(form: HTMLElement, spec: SectionSpec, business?: Record<string, string>): {
    valid: boolean;
    total: string | null;
};
export declare function buildBusinessProfile(r: Record<string, string>, selectedPaymentMethods?: BusinessProfilePayload['selectedPaymentMethods'], tosToken?: string): BusinessProfilePayload;
export declare function buildControlOfficer(r: Record<string, string>): ControlOfficerPayload;
export declare function buildBeneficialOwner(r: Record<string, string>): BeneficialOwnerPayload;
export declare function buildProcessingVolume(r: Record<string, string>): ProcessingVolumePayload;
/** Build the OnboardingSubmit for a form-backed section from its collected record(s). */
export declare function buildSubmit(step: OnboardingStep, record: Record<string, string>, owners?: Record<string, string>[]): OnboardingSubmit;
