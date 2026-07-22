// Phase 1 — resume/locking rule. Pure, dependency-free (no zod). Decides which
// onboarding section a returning user should land on, from the KYB status alone.
// Rule source: ONBOARDING_SPEC §3.3 (lock/auto-open), §6.8 (status model), §8.3
// (capability requirement -> section mapping).

import type { OnboardingStatus, OnboardingStep, SectionStatus } from './types.js'
import { ONBOARDING_STEPS } from './types.js'

/** A section is "complete" only when its backend status is Completed (§6.8:
 *  InProgress is never emitted by the backend). */
function done(status: SectionStatus | undefined): boolean {
  return status === 'Completed'
}

/** OnboardingStatus carries one SectionStatus per KYB section; documents has no
 *  section-status field (it's derived from the documents list). Map step -> status. */
function sectionStatus(status: OnboardingStatus, step: OnboardingStep): SectionStatus | undefined {
  switch (step) {
    case 'business':
      return status.businessProfileStatus
    case 'officer':
      return status.controlOfficerStatus
    case 'owners':
      return status.beneficialOwnersStatus
    case 'volume':
      return status.processingVolumeStatus
    case 'documents':
      // Documents "complete" = at least one uploaded doc (WIO IsOnboarded flips on
      // upload, §7 warning 6). Mirror that as a synthetic section status.
      return status.documents && status.documents.length > 0 ? 'Completed' : 'NotStarted'
  }
}

/** True when the given section counts as finished for resume purposes. */
export function isOnboardingSectionComplete(status: OnboardingStatus, step: OnboardingStep): boolean {
  return done(sectionStatus(status, step))
}

/** Map a Moov capability requirement key to the onboarding section that owns it.
 *  Prefix rules from ONBOARDING_SPEC §8.3: document.* -> documents,
 *  underwriting.* -> volume, everything else -> business. */
function requirementToStep(requirement: string): OnboardingStep {
  if (requirement.startsWith('document.')) return 'documents'
  if (requirement.startsWith('underwriting.')) return 'volume'
  return 'business'
}

/**
 * Which step a returning user should resume at.
 *
 * Platform rule (§3.3/§6.8):
 * 1. Business always comes first; every other section is locked until business
 *    is Completed — so if business isn't done, resume there.
 * 2. Otherwise, a section whose capabilities carry `errors` is action_required and
 *    takes priority (auto-open target, §3.3). Only `errors` bump a section
 *    (§8.3 deriveEffectiveStatus) — `currentlyDue` is a warning, not a jump target.
 * 3. Otherwise, the first section (business->officer->owners->volume->documents)
 *    that is not Completed.
 * 4. If everything is complete, stay on documents (the last section).
 */
export function resolveOnboardingResumeStep(status: OnboardingStatus): OnboardingStep {
  // 1. Business gates everything else.
  if (!isOnboardingSectionComplete(status, 'business')) return 'business'

  // 2. Capability errors -> action_required section wins. Walk sections in order
  //    so the earliest action-required section is picked.
  const errored = new Set<OnboardingStep>()
  for (const cap of status.capabilities ?? []) {
    for (const err of cap.errors ?? []) {
      errored.add(requirementToStep(err.requirement))
    }
  }
  if (errored.size) {
    const target = ONBOARDING_STEPS.find((step) => errored.has(step))
    if (target) return target
  }

  // 3. First not-Completed section in canonical order.
  const next = ONBOARDING_STEPS.find((step) => !isOnboardingSectionComplete(status, step))
  if (next) return next

  // 4. All complete.
  return 'documents'
}
