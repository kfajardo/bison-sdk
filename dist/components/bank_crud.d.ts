import type { Persona, Scope } from '../core/scope.js';
import type { BisonSectionClient } from './onboarding.js';
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
 * <bison-bank-crud persona scope-id entity-id? base-url>
 * Set `.client` to inject a client (or share the onboarding element's). Override
 * `.onPlaidLink` to drive the real Plaid Link handoff.
 * Events (bubbling): bison-bank-added, bison-bank-verified, bison-bank-default-changed,
 * bison-bank-deleted, bison-bank-error.
 */
export declare class BisonBankCrud extends HTMLElement {
    client?: BisonSectionClient;
    /** Default hook is a no-op stub (returns null) so tests don't touch Plaid. */
    onPlaidLink: PlaidLinkHook;
    private accounts;
    private method;
    private verifyingId;
    private busy;
    private listError?;
    get persona(): Persona;
    get scope(): Scope;
    connectedCallback(): void;
    private resolveClient;
    refresh(): Promise<void>;
    private canDelete;
    private render;
    private renderRow;
    private renderVerifyDialog;
    private renderAddArea;
    private renderManualForm;
    private read;
    private submitManual;
    private startPlaid;
    private setDefault;
    private deleteAccount;
    private completeVerify;
    private handleAddError;
    private emitError;
}
