import { createServerFn } from "@tanstack/react-start";
import { requireStudioRole, forbidden, ProblemError } from "./authz";
import { getEmailProvider } from "./email";
import {
  isBillingEmailKind,
  renderBillingEmail,
  type BillingEmailKind,
  type BillingEmailParams,
} from "./email/templates/billing";
import { getServerEnv, isMockOnboarding } from "./env";
import { verifyAccessToken } from "./session";
import { createServiceSupabase } from "./supabase";

/**
 * Billing emails for real studios (invoices, receipts, credit notes, reminders, notices).
 *
 * Before this, the browser sent them through the mock outbox, so families never got them. Now the
 * browser names the kind of email, the recipient and the details; the server checks the sender is
 * staff of that studio (MFA included), checks the recipient is one of that studio's guardians,
 * renders the email itself from the shared templates and sends it through Resend from Keystone's
 * verified address with the studio's reply-to. No HTML comes from the browser.
 */

export const MAX_PDF_BYTES = 2 * 1024 * 1024;
const MAX_PARAM_LENGTH = 500;
const SENDS_PER_HOUR = 300;

export type BillingEmailRequest = {
  accessToken: string;
  studioId: string;
  kind: BillingEmailKind;
  /** Guardian email. Ignored for pay_to_changed, which goes to the studio owners. */
  to?: string;
  params: Record<string, string | number | undefined>;
  /** Invoice PDF (base64), invoice_sent only. */
  pdf?: { filename: string; base64: string };
};

const sendLog = new Map<string, number[]>();

/** Per-person cap so a stolen session can't use Keystone's sender as a mass mailer. */
export function checkBillingEmailRate(userId: string, now = Date.now()): boolean {
  const recent = (sendLog.get(userId) ?? []).filter((at) => now - at < 60 * 60 * 1000);
  if (recent.length >= SENDS_PER_HOUR) {
    sendLog.set(userId, recent);
    return false;
  }
  recent.push(now);
  sendLog.set(userId, recent);
  return true;
}

export function resetBillingEmailRateForTests() {
  sendLog.clear();
}

/** Only plain short strings and finite numbers reach a template. */
export function cleanParams(params: unknown): Record<string, string | number> {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new ProblemError(400, "Bad request", "Email details are missing.");
  }
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (key === "studioName" || value === undefined) continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string" && value.length <= MAX_PARAM_LENGTH) out[key] = value;
    else throw new ProblemError(400, "Bad request", `Email detail "${key}" is not allowed.`);
  }
  return out;
}

export function cleanPdf(pdf: BillingEmailRequest["pdf"]) {
  if (!pdf) return undefined;
  const filename = String(pdf.filename ?? "");
  if (!/^[\w.-]{1,80}\.pdf$/i.test(filename)) {
    throw new ProblemError(400, "Bad request", "Invoice PDF name is not allowed.");
  }
  const bytes = Buffer.from(String(pdf.base64 ?? ""), "base64");
  if (!bytes.length || bytes.length > MAX_PDF_BYTES) {
    throw new ProblemError(400, "Bad request", "Invoice PDF is empty or too large.");
  }
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new ProblemError(400, "Bad request", "Attachment is not a PDF.");
  }
  return { filename, content: new Uint8Array(bytes), contentType: "application/pdf" };
}

function senderAddress(emailFrom: string) {
  const match = /<([^>]+)>/.exec(emailFrom);
  return (match?.[1] ?? emailFrom).trim() || "noreply@keystonemusichq.com";
}

/** Display name for the From line: no quotes, angle brackets or line breaks. */
export function fromLine(studioName: string, emailFrom: string) {
  const name = studioName.replace(/["<>\r\n]/g, "").trim().slice(0, 80) || "Your studio";
  return `${name} via Keystone Music HQ <${senderAddress(emailFrom)}>`;
}

async function ownerEmails(studioId: string): Promise<string[]> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("studio_member")
    .select("user_id")
    .eq("studio_id", studioId)
    .eq("role", "owner");
  if (error) throw new ProblemError(500, "Owner lookup failed", error.message);
  const emails: string[] = [];
  for (const row of data ?? []) {
    const { data: user } = await supabase.auth.admin.getUserById(row.user_id as string);
    if (user?.user?.email) emails.push(user.user.email);
  }
  return emails;
}

async function isStudioGuardian(studioId: string, email: string): Promise<boolean> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("guardian")
    .select("id")
    .eq("studio_id", studioId)
    .ilike("email", email.replace(/[\\%_]/g, (char) => `\\${char}`))
    .limit(1);
  if (error) throw new ProblemError(500, "Guardian lookup failed", error.message);
  return Boolean(data?.length);
}

export async function sendBillingEmail(input: BillingEmailRequest): Promise<{ sent: number }> {
  if (isMockOnboarding()) {
    throw new ProblemError(400, "Mock mode", "Billing emails from the server need live keys.");
  }
  if (!isBillingEmailKind(input.kind)) {
    throw new ProblemError(400, "Bad request", "Unknown billing email.");
  }
  if (!input.studioId) throw forbidden("Missing studio.");

  const session = await verifyAccessToken(input.accessToken);
  await requireStudioRole(session.userId, input.studioId, ["owner", "admin", "teacher"], {
    aal: session.aal,
  });
  if (!checkBillingEmailRate(session.userId)) {
    throw new ProblemError(429, "Too many emails", "Too many billing emails this hour. Try again later.");
  }

  const params = cleanParams(input.params);
  const attachment = input.kind === "invoice_sent" ? cleanPdf(input.pdf) : undefined;

  const supabase = createServiceSupabase();
  const { data: studioRow, error } = await supabase
    .from("studio")
    .select("name, reply_to_email")
    .eq("id", input.studioId)
    .maybeSingle();
  if (error || !studioRow) throw new ProblemError(500, "Studio lookup failed", error?.message);
  const studioName = (studioRow.name as string) || "Your studio";

  let recipients: string[];
  if (input.kind === "pay_to_changed") {
    recipients = await ownerEmails(input.studioId);
    if (!recipients.length && session.email) recipients = [session.email];
  } else {
    const to = String(input.to ?? "").trim().toLowerCase();
    if (!to || !(await isStudioGuardian(input.studioId, to))) {
      throw forbidden("That email address isn't a family in this studio.");
    }
    recipients = [to];
  }

  const env = getServerEnv();
  const mail = renderBillingEmail(
    input.kind,
    studioName,
    params as unknown as BillingEmailParams<typeof input.kind>,
  );
  const replyTo = (studioRow.reply_to_email as string | null) || session.email || undefined;
  const provider = getEmailProvider();
  for (const to of recipients) {
    await provider.send({
      to,
      from: fromLine(studioName, env.emailFrom),
      ...(replyTo ? { replyTo } : {}),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tags: [{ name: "kind", value: input.kind }],
      ...(attachment ? { attachments: [attachment] } : {}),
    });
  }
  return { sent: recipients.length };
}

export const sendBillingEmailFn = createServerFn({ method: "POST" })
  .validator((data: BillingEmailRequest) => data)
  .handler(({ data }) => sendBillingEmail(data));
