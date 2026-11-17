import { studio } from "@/mocks/data";
import { isLiveStudio, liveStudioId } from "@/lib/studio-workspace";
import type {
  BillingEmailKind,
  BillingEmailParams,
} from "@/server/email/templates/billing";
import { emailProvider } from "./_lazy";

/**
 * One way out for every billing email (invoice, receipt, credit note, reminders, notices).
 *
 * Real studio: the server renders and sends it through Resend (src/server/billing-email.ts),
 * after checking the sender is staff and the recipient is one of the studio's families.
 * Demo studio and tests: rendered here and dropped in the mock outbox, as before.
 */
export type BillingMail<K extends BillingEmailKind> = {
  kind: K;
  /** Guardian email; the server ignores it for pay_to_changed (goes to the studio owners). */
  to: string;
  /** Name shown in the demo/mock email. Real studios use the studio name from the database. */
  studioName: string;
  params: BillingEmailParams<K>;
  pdf?: { filename: string; bytes: Uint8Array };
};

/** Test seam: replaces the server call for live studios. */
let liveSenderOverride: ((input: unknown) => Promise<unknown>) | null = null;
export function setLiveBillingMailSenderForTests(sender: ((input: unknown) => Promise<unknown>) | null) {
  liveSenderOverride = sender;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function sendBillingMail<K extends BillingEmailKind>(mail: BillingMail<K>): Promise<void> {
  if (isLiveStudio()) {
    const studioId = liveStudioId();
    if (!studioId) throw new Error("Studio not loaded. Reload and try again.");
    const { getAuthClient } = await import("@/lib/auth-client");
    const session = (await getAuthClient()?.auth.getSession())?.data.session;
    if (!session?.access_token && !liveSenderOverride) {
      throw new Error("Sign in again to send this email.");
    }
    const data = {
      accessToken: session?.access_token ?? "",
      studioId,
      kind: mail.kind,
      to: mail.to,
      params: mail.params as Record<string, string | number | undefined>,
      ...(mail.pdf ? { pdf: { filename: mail.pdf.filename, base64: toBase64(mail.pdf.bytes) } } : {}),
    };
    if (liveSenderOverride) {
      await liveSenderOverride(data);
      return;
    }
    const { sendBillingEmailFn } = await import("@/server/billing-email");
    await sendBillingEmailFn({ data });
    return;
  }

  const { renderBillingEmail } = await import("@/server/email/templates/billing");
  const rendered = renderBillingEmail(mail.kind, mail.studioName, mail.params);
  await (await emailProvider()).send({
    to: mail.to,
    from: `${studio.name} via Keystone Music HQ <noreply@keystonemusichq.com>`,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    tags: [{ name: "kind", value: mail.kind }],
    ...(mail.pdf
      ? { attachments: [{ filename: mail.pdf.filename, content: mail.pdf.bytes, contentType: "application/pdf" }] }
      : {}),
  });
}
