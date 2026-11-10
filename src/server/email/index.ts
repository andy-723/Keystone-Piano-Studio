import { getServerEnv, isMockOnboarding } from "../env";
import type { EmailProvider } from "./provider";
import { outboxEmailProvider } from "./outbox";
import { createResendEmailProvider } from "./resend";

export type { EmailAttachment, EmailProvider, SendEmailInput, SendEmailResult } from "./provider";
export { getEmailOutbox, clearEmailOutbox } from "./outbox";

/** Test-only override so live-path unit tests can assert the provider is invoked. */
let providerOverride: EmailProvider | null = null;

export function setEmailProviderForTests(provider: EmailProvider | null) {
  providerOverride = provider;
}

export function getEmailProvider(): EmailProvider {
  if (providerOverride) return providerOverride;
  if (isMockOnboarding() || !getServerEnv().resendApiKey) return outboxEmailProvider;
  return createResendEmailProvider();
}
