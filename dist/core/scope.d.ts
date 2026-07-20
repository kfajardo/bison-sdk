export type Persona = 'wio' | 'operator';
/**
 * Which entity this call/flow targets.
 * - wio:      /api/wios/{id}/...
 * - operator: /api/operators/{id}/...
 * - wio + entityId: /api/wios/{id}/entities/{entityId}/...  (partial-onboarding /
 *   sub-entity path — a WIO acting on behalf of an operator-facing entity)
 */
export interface Scope {
    persona: Persona;
    /** WIO id or Operator id. */
    id: string;
    /** Present → entity-scoped WIO route family. Ignored for operator persona. */
    entityId?: string;
}
/** Base KYB route for a scope, e.g. `api/wios/{id}/entities/{e}/kyb` or `api/operators/{id}/kyb`. */
export declare function kybBase(scope: Scope): string;
/** Base bank-accounts route for a scope. */
export declare function bankBase(scope: Scope): string;
