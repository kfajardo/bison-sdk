import type { BankRegister } from '../core/types.js';
import type { Persona, Scope } from '../core/scope.js';
import type { BisonSectionClient } from './onboarding.js';
import { type FieldSpec } from './form.js';
export declare const MANUAL_BANK_FIELDS: FieldSpec[];
export declare function validateManualBank(data: Record<string, string>): Record<string, string>;
export declare function buildManualBankRegister(data: Record<string, string>, persona: Persona): Extract<BankRegister, {
    method: 'manual';
}>;
/** Verification code (BANKING_SPEC §12.7): UI enforces MV####; strip optional MV, need 4 digits. */
export declare function normalizeVerificationCode(code: string): string | null;
/** Plaid link handoff. Overridable so tests / non-browser envs don't load Plaid.
 *  Given the link token, resolve the { publicToken, accountId } to register. */
export type PlaidLinkResult = {
    publicToken: string;
    accountId: string;
    bankName?: string;
    accountHolderName?: string;
};
export type PlaidLinkHook = (linkToken: string) => Promise<PlaidLinkResult | null>;
/**
 * Stateful bank-account renderer. Partial onboarding uses `entryOnly`; the
 * standalone element exposes account management and Plaid.
 */
export interface BankAccountsPanelOptions {
    client: () => BisonSectionClient;
    scope: () => Scope;
    persona: () => Persona;
    entryOnly?: boolean;
    headerSlot?: boolean;
    onPlaidLink?: PlaidLinkHook;
}
export declare class BankAccountsPanel {
    private host;
    private options;
    private accounts;
    private method;
    private verifyingId;
    private busy;
    private submitted;
    private listError?;
    constructor(host: HTMLElement, options: BankAccountsPanelOptions);
    refresh(): Promise<void>;
    private canDelete;
    private render;
    private renderRow;
    private renderVerifyDialog;
    private renderAddArea;
    private renderManualForm;
    private submitManual;
    private startPlaid;
    private setDefault;
    private deleteAccount;
    private completeVerify;
    private handleAddError;
    private emitError;
}
/**
 * <bison-bank-accounts persona scope-id entity-id?>
 * Set `.client` to inject a client (or share the onboarding element's). Override
 * `.onPlaidLink` to drive the real Plaid Link handoff.
 * Events (bubbling): bison-bank-added, bison-bank-verified, bison-bank-default-changed,
 * bison-bank-deleted, bison-bank-error.
 */
export declare class BisonBankAccounts extends HTMLElement {
    client?: BisonSectionClient;
    onPlaidLink: PlaidLinkHook;
    private panel?;
    get persona(): Persona;
    get scope(): Scope;
    connectedCallback(): void;
    private resolveClient;
    refresh(): Promise<void>;
}
