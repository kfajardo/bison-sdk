// Phase 3 — public entry for the web components. defineBisonComponents() registers
// all custom elements (idempotent); the element classes and the shared helpers are
// re-exported for consumers composing their own UI.
export { BisonOnboarding } from './onboarding.js';
export { BisonOnboardingPartial } from './partial.js';
export { BisonBankAccounts } from './bank_accounts.js';
import { BisonOnboarding } from './onboarding.js';
import { BisonOnboardingPartial } from './partial.js';
import { BisonBankAccounts } from './bank_accounts.js';
import { setupBison } from '../core/sdk.js';
/** Registers <bison-onboarding>, <bison-onboarding-partial>, <bison-bank-accounts>.
 *  Idempotent — safe to call more than once. */
export function defineBisonComponents(apiKey) {
    if (typeof customElements === 'undefined') {
        throw new Error('bison-jib-sdk/components requires a browser environment');
    }
    if (apiKey !== undefined)
        setupBison(apiKey);
    if (!customElements.get('bison-onboarding'))
        customElements.define('bison-onboarding', BisonOnboarding);
    if (!customElements.get('bison-onboarding-partial'))
        customElements.define('bison-onboarding-partial', BisonOnboardingPartial);
    if (!customElements.get('bison-bank-accounts'))
        customElements.define('bison-bank-accounts', BisonBankAccounts);
}
