// Phase 1 — the client. Binds a Transport into the standalone functions and
// exposes them as { onboarding, banking }. Consumers pass either a ready Transport
// (e.g. mock()) or an http() config (baseUrl + auth).

import { http } from './transport.js'
import type { AuthProvider, Transport } from './transport.js'
import type { Scope } from './scope.js'
import type {
  BankRegister,
  CompleteVerificationPayload,
  MoovFilePurpose,
  OnboardingStep,
  OnboardingSubmit,
  PaymentMethodKey,
} from './types.js'
import * as fn from './functions.js'
import { resolveResumeStep } from './resume.js'

export { resolveResumeStep, isSectionComplete } from './resume.js'
export { mock, createMockState, type MockState } from './mock.js'

export type ClientConfig =
  | { transport: Transport }
  | { baseUrl: string; auth?: AuthProvider; fetch?: typeof globalThis.fetch }

function resolveTransport(cfg: ClientConfig): Transport {
  return 'transport' in cfg ? cfg.transport : http(cfg)
}

export function createClient(cfg: ClientConfig) {
  const t = resolveTransport(cfg)

  const onboarding = {
    getUser: (opts?: { email?: string }) => fn.getUser(t, opts),
    getStates: (scope: Scope, step?: OnboardingStep) => fn.getOnboardingStates(t, scope, step as OnboardingStep),
    submit: (scope: Scope, submit: OnboardingSubmit) => fn.submitOnboarding(t, scope, submit),
    uploadDocument: (scope: Scope, file: File, purpose?: MoovFilePurpose, metadata?: string) =>
      fn.uploadDocument(t, scope, file, purpose, metadata),
    getIndustries: (scope: Scope) => fn.getIndustries(t, scope),
    getTosToken: () => fn.getTosToken(t),
    savePaymentMethodCapabilities: (scope: Scope, methods: PaymentMethodKey[]) =>
      fn.savePaymentMethodCapabilities(t, scope, methods),
    resolveResumeStep,
  }

  const banking = {
    list: (scope: Scope) => fn.getBankAccounts(t, scope),
    getPlaidToken: (scope: Scope) => fn.getPlaidToken(t, scope),
    register: (scope: Scope, payload: BankRegister) => fn.register(t, scope, payload as never),
    initiateVerification: (scope: Scope, bankAccountId: string) => fn.initiateVerification(t, scope, bankAccountId),
    completeVerification: (scope: Scope, bankAccountId: string, payload: CompleteVerificationPayload) =>
      fn.completeVerification(t, scope, bankAccountId, payload),
    setDefault: (scope: Scope, bankAccountId: string) => fn.setDefaultBankAccount(t, scope, bankAccountId),
    delete: (scope: Scope, bankAccountId: string) => fn.deleteBankAccount(t, scope, bankAccountId),
  }

  return { onboarding, banking }
}

export type BisonClient = ReturnType<typeof createClient>
