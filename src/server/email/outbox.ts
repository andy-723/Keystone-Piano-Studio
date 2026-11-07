import type { EmailProvider, SendEmailInput, SendEmailResult } from "./provider";

export type OutboxEntry = SendEmailInput & { id: string; sentAt: string };

const outbox: OutboxEntry[] = [];

export function getEmailOutbox(): OutboxEntry[] {
  return structuredClone(outbox);
}

export function clearEmailOutbox() {
  outbox.length = 0;
}

export const outboxEmailProvider: EmailProvider = {
  async send(input) {
    const id = `outbox-${crypto.randomUUID()}`;
    outbox.push({ ...input, id, sentAt: new Date().toISOString() });
    return { id } satisfies SendEmailResult;
  },
};
