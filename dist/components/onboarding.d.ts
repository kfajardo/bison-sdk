import type { Persona, Scope } from '../core/scope.js';
import { type BisonClient } from '../core/client.js';
export type BisonSectionClient = BisonClient;
/**
 * <bison-onboarding persona scope-id entity-id? base-url>
 * Set `.client` to inject a client/transport (tests). Renders the 5-section accordion.
 * Events (bubbling): bison-step-change, bison-status-checked, bison-submit-success,
 * bison-submit-error, and cancellable bison-before-submit.
 */
export declare class BisonOnboarding extends HTMLElement {
    client?: BisonSectionClient;
    private status?;
    private openStep;
    private owners;
    private busy;
    private error?;
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
