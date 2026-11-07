import { getServerEnv, isMockOnboarding } from "../env";
import type { EmailProvider } from "./provider";
import { outboxEmailProvider } from "./outbox";
import { createResendEmailProvider } from "./resend";

export type { EmailProvider, SendEmailInput, SendEmailResult } from "./provider";
export { getEmailOutbox, clearEmailOutbox } from "./outbox";

export function getEmailProvider(): EmailProvider {
  if (isMockOnboarding() || !getServerEnv().resendApiKey) return outboxEmailProvider;
  return createResendEmailProvider();
}
