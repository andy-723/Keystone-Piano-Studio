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
  if (isMockOnboarding()) return outboxEmailProvider;
  // A real studio without RESEND_API_KEY used to fall back to the in-memory outbox, so invites
  // showed as "sent" while nothing left the server. Now the send fails (Resend provider throws
  // "Missing required environment variable: RESEND_API_KEY") and the teacher sees the error.
  if (!getServerEnv().resendApiKey) {
    console.error("[email] RESEND_API_KEY is not set; live emails cannot be sent");
  }
  return createResendEmailProvider();
}
