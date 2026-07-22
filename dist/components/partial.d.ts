import type { Persona, Scope } from '../core/scope.js';
import type { BisonSectionClient } from './onboarding.js';
export declare class BisonOnboardingPartial extends HTMLElement {
    client?: BisonSectionClient;
    private busy;
    private complete;
    private bankAccounts?;
    get persona(): Persona;
    get scope(): Scope;
    connectedCallback(): void;
    private resolveClient;
    private render;
    private loadBanking;
    private showBanking;
    private section;
    private addOwner;
    private values;
    private validate;
    private hasErrors;
    private showValidation;
    private showFieldError;
    private updateOwnership;
    private updateSubmitState;
    private setInlineError;
    private setError;
    private buildSubmission;
    private submit;
    private submitStep;
}
