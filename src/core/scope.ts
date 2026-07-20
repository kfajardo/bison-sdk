// Phase 0 — the scope model. One value threads through every function and every
// component, and picks the API route family. Persona-agnostic by design: callers
// flip `persona`, the SDK resolves routes.

export type Persona = 'wio' | 'operator'

/**
 * Which entity this call/flow targets.
 * - wio:      /api/wios/{id}/...
 * - operator: /api/operators/{id}/...
 * - wio + entityId: /api/wios/{id}/entities/{entityId}/...  (partial-onboarding /
 *   sub-entity path — a WIO acting on behalf of an operator-facing entity)
 */
export interface Scope {
  persona: Persona
  /** WIO id or Operator id. */
  id: string
  /** Present → entity-scoped WIO route family. Ignored for operator persona. */
  entityId?: string
}

/** Base KYB route for a scope, e.g. `api/wios/{id}/entities/{e}/kyb` or `api/operators/{id}/kyb`. */
export function kybBase(scope: Scope): string {
  if (scope.persona === 'operator') return `api/operators/${enc(scope.id)}/kyb`
  return scope.entityId
    ? `api/wios/${enc(scope.id)}/entities/${enc(scope.entityId)}/kyb`
    : `api/wios/${enc(scope.id)}/kyb`
}

/** Base bank-accounts route for a scope. */
export function bankBase(scope: Scope): string {
  if (scope.persona === 'operator') return `api/operators/${enc(scope.id)}/bank-accounts`
  return scope.entityId
    ? `api/wios/${enc(scope.id)}/entities/${enc(scope.entityId)}/bank-accounts`
    : `api/wios/${enc(scope.id)}/bank-accounts`
}

const enc = encodeURIComponent
