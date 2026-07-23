// Binds a Transport into standalone functions. Web components call the same
// functions consumers can call directly.

import { http } from './transport.js'
import type { HttpTransportConfig, Transport } from './transport.js'
import type { Scope } from './scope.js'
import type {
  BankAccount,
  BankRegister,
  CompleteVerificationPayload,
  MoovFilePurpose,
  OnboardingStep,
  OnboardingSubmit,
  PaymentMethodKey,
  PlaidRegisterResult,
} from './types.js'
import * as fn from './functions.js'
export { resolveOnboardingResumeStep, isOnboardingSectionComplete } from './resume.js'
export { mock, createMockState, type MockState } from './mock.js'

export type ClientConfig =
  | { transport: Transport }
  | HttpTransportConfig

function resolveTransport(cfg: ClientConfig | string): Transport {
  if (typeof cfg === 'string') return http({ apiKey: cfg })
  return 'transport' in cfg ? cfg.transport : http(cfg)
}

/** Advanced escape hatch. Most consumers should call setupBison(apiKey) once. */
export function createClient(cfg: ClientConfig | string) {
  const t = resolveTransport(cfg)
  function registerBankAccount(scope: Scope, payload: Extract<BankRegister, { method: 'manual' }>): Promise<BankAccount>
  function registerBankAccount(scope: Scope, payload: Extract<BankRegister, { method: 'plaid' }>): Promise<PlaidRegisterResult>
  function registerBankAccount(scope: Scope, payload: BankRegister): Promise<BankAccount | PlaidRegisterResult> {
    return fn.registerBankAccount(t, scope, payload as never)
  }

  return {
    getUser: () => fn.getUser(t),
    getOnboardingStatus: (scope: Scope) => fn.getOnboardingStatus(t, scope),
    getOnboardingSection: <Step extends OnboardingStep>(scope: Scope, step: Step) => fn.getOnboardingSection(t, scope, step),
    submitOnboardingSection: (scope: Scope, submit: OnboardingSubmit) => fn.submitOnboardingSection(t, scope, submit),
    uploadOnboardingDocument: (scope: Scope, file: File, purpose?: MoovFilePurpose, metadata?: string) =>
      fn.uploadOnboardingDocument(t, scope, file, purpose, metadata),
    getBankAccounts: (scope: Scope) => fn.getBankAccounts(t, scope),
    getPlaidLinkToken: (scope: Scope) => fn.getPlaidLinkToken(t, scope),
    registerBankAccount,
    initiateBankAccountVerification: (scope: Scope, bankAccountId: string) => fn.initiateBankAccountVerification(t, scope, bankAccountId),
    completeBankAccountVerification: (scope: Scope, bankAccountId: string, payload: CompleteVerificationPayload) =>
      fn.completeBankAccountVerification(t, scope, bankAccountId, payload),
    setDefaultBankAccount: (scope: Scope, bankAccountId: string) => fn.setDefaultBankAccount(t, scope, bankAccountId),
    deleteBankAccount: (scope: Scope, bankAccountId: string) => fn.deleteBankAccount(t, scope, bankAccountId),
    getOnboardingIndustries: (scope: Scope) => fn.getOnboardingIndustries(t, scope),
    getOnboardingTermsToken: () => fn.getOnboardingTermsToken(t),
    saveOnboardingPaymentMethods: (scope: Scope, methods: PaymentMethodKey[]) =>
      fn.saveOnboardingPaymentMethods(t, scope, methods),
  }
}

export type BisonClient = ReturnType<typeof createClient>
