// Public singleton surface. One setup call powers both direct functions and components.

import { createClient, type BisonClient } from './client.js'
import type { HttpTransportConfig } from './transport.js'
import type { Scope } from './scope.js'
import type {
  BankAccount,
  BankRegister,
  CompleteVerificationPayload,
  MoovFilePurpose,
  OnboardingSectionData,
  OnboardingStep,
  OnboardingSubmit,
  PaymentMethodKey,
  PlaidRegisterResult,
} from './types.js'

export type BisonSetupOptions = Omit<HttpTransportConfig, 'apiKey'>

let client: BisonClient | undefined

export function setupBison(apiKey: string, options: BisonSetupOptions = {}): void {
  client = createClient({ apiKey, ...options })
}

export function getBisonClient(): BisonClient {
  if (!client) throw new Error('Call setupBison(apiKey) before using the Bison SDK')
  return client
}

export const getUser = (...args: Parameters<BisonClient['getUser']>) => getBisonClient().getUser(...args)
export const getOnboardingStatus = (scope: Scope) => getBisonClient().getOnboardingStatus(scope)
export const getOnboardingSection = <Step extends OnboardingStep>(scope: Scope, step: Step): Promise<OnboardingSectionData[Step] | null> =>
  getBisonClient().getOnboardingSection(scope, step)
export const submitOnboardingSection = (scope: Scope, submit: OnboardingSubmit) => getBisonClient().submitOnboardingSection(scope, submit)
export const uploadOnboardingDocument = (scope: Scope, file: File, purpose?: MoovFilePurpose, metadata?: string) =>
  getBisonClient().uploadOnboardingDocument(scope, file, purpose, metadata)
export const getOnboardingIndustries = (scope: Scope) => getBisonClient().getOnboardingIndustries(scope)
export const getOnboardingTermsToken = () => getBisonClient().getOnboardingTermsToken()
export const saveOnboardingPaymentMethods = (scope: Scope, methods: PaymentMethodKey[]) =>
  getBisonClient().saveOnboardingPaymentMethods(scope, methods)
export const getBankAccounts = (scope: Scope) => getBisonClient().getBankAccounts(scope)
export const getPlaidLinkToken = (scope: Scope) => getBisonClient().getPlaidLinkToken(scope)
export function registerBankAccount(scope: Scope, payload: Extract<BankRegister, { method: 'manual' }>): Promise<BankAccount>
export function registerBankAccount(scope: Scope, payload: Extract<BankRegister, { method: 'plaid' }>): Promise<PlaidRegisterResult>
export function registerBankAccount(scope: Scope, payload: BankRegister): Promise<BankAccount | PlaidRegisterResult> {
  return getBisonClient().registerBankAccount(scope, payload as never)
}
export const initiateBankAccountVerification = (scope: Scope, bankAccountId: string) =>
  getBisonClient().initiateBankAccountVerification(scope, bankAccountId)
export const completeBankAccountVerification = (scope: Scope, bankAccountId: string, payload: CompleteVerificationPayload) =>
  getBisonClient().completeBankAccountVerification(scope, bankAccountId, payload)
export const setDefaultBankAccount = (scope: Scope, bankAccountId: string) => getBisonClient().setDefaultBankAccount(scope, bankAccountId)
export const deleteBankAccount = (scope: Scope, bankAccountId: string) => getBisonClient().deleteBankAccount(scope, bankAccountId)
