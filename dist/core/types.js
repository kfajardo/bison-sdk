// Phase 0 — the wire contract. Lifted verbatim from ONBOARDING_SPEC.md and
// BANKING_SPEC.md (bison-sdk/docs). These types are the public API surface the
// http transport and the mock both satisfy; changing one is a wire change.
export const ONBOARDING_STEPS = [
    'business',
    'officer',
    'owners',
    'volume',
    'documents',
];
