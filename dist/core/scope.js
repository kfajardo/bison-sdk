// Phase 0 — the scope model. One value threads through every function and every
// component, and picks the API route family. Persona-agnostic by design: callers
// flip `persona`, the SDK resolves routes.
/** Base KYB route for a scope, e.g. `api/wios/{id}/entities/{e}/kyb` or `api/operators/{id}/kyb`. */
export function kybBase(scope) {
    if (scope.persona === 'operator')
        return `api/operators/${enc(scope.id)}/kyb`;
    return scope.entityId
        ? `api/wios/${enc(scope.id)}/entities/${enc(scope.entityId)}/kyb`
        : `api/wios/${enc(scope.id)}/kyb`;
}
/** Base bank-accounts route for a scope. */
export function bankBase(scope) {
    if (scope.persona === 'operator')
        return `api/operators/${enc(scope.id)}/bank-accounts`;
    return scope.entityId
        ? `api/wios/${enc(scope.id)}/entities/${enc(scope.entityId)}/bank-accounts`
        : `api/wios/${enc(scope.id)}/bank-accounts`;
}
const enc = encodeURIComponent;
