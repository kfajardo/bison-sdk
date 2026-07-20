import type { OnboardingStatus, OnboardingStep } from './types.js';
/** True when the given section counts as finished for resume purposes. */
export declare function isSectionComplete(status: OnboardingStatus, step: OnboardingStep): boolean;
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
export declare function resolveResumeStep(status: OnboardingStatus): OnboardingStep;
