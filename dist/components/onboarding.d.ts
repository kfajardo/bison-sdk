import type { OnboardingStep } from '../core/types.js';
import type { Persona, Scope } from '../core/scope.js';
import type { BisonClient } from '../core/client.js';
export type BisonSectionClient = BisonClient;
export type SectionUiState = 'locked' | 'active' | 'done' | 'error';
/** Text overrides (copy / i18n), merged over defaults. State keys customize the
 *  accessible state description; step keys relabel section titles. */
export type OnboardingLabels = Partial<Record<SectionUiState | OnboardingStep, string>>;
/** Consumer-supplied initial field values, keyed by section then field name.
 *  Field names match the section's form fields (steps.ts SECTIONS). */
export interface OnboardingPrefill {
    business?: Record<string, string>;
    officer?: Record<string, string>;
    owners?: Record<string, string>[];
    volume?: Record<string, string>;
}
/**
 * <bison-onboarding persona scope-id entity-id? prefill? labels?>
 * Set `.client` to inject a client/transport (tests). Renders the 5-section accordion.
 * Prefill: set `.prefill` (OnboardingPrefill) or the `prefill` attribute (same shape,
 * JSON). Redacted-resume placeholders (§5.2) win over prefill for fields the server
 * already holds. Labels: `.labels` / `labels` attribute (OnboardingLabels JSON)
 * overrides accessible state descriptions and section titles. Events (bubbling): bison-step-change,
 * bison-status-checked, bison-submit-success, bison-submit-error, and cancellable
 * bison-before-submit.
 */
export declare class BisonOnboarding extends HTMLElement {
    client?: BisonSectionClient;
    private status?;
    private openStep;
    private owners;
    private busy;
    private error?;
    private _prefill?;
    private _labels;
    get prefill(): OnboardingPrefill | undefined;
    set prefill(value: OnboardingPrefill | undefined);
    get labels(): OnboardingLabels;
    set labels(value: OnboardingLabels | undefined);
    get persona(): Persona;
    get scope(): Scope;
    connectedCallback(): void;
    private resolveClient;
    /** GET status, set the resume/auto-open target, re-render. */
    refresh(): Promise<void>;
    private uiState;
    private render;
    private renderSectionCard;
    private renderFormSection;
    /** Consumer prefill for a single-record section (owners seed `this.owners` instead). */
    private consumerPrefill;
    /** §5.2 redacted resume: if Moov already holds EIN/DOB/SSN, seed placeholders so the
     *  form validates without forcing re-entry. */
    private redactedPrefill;
    private setFormError;
    private submitSection;
    /** The saved/typed business record — used for the officer address-clash rule.
     *  We only have it locally within a session; from status alone it's absent, so
     *  the clash rule simply doesn't fire on cold resume (matches platform UX). */
    private businessRecord;
    private renderDocumentsAndBanking;
    private uploadDoc;
}
