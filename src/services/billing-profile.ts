import { billingAuditLog, billingProfileState, seedBillingExtras } from "@/mocks/billing-profile";
import type { IntegrationScope } from "@/mocks/integrations";
import { newsState } from "@/mocks/news";
import { studio, teacher } from "@/mocks/data";
import type { StudioBillingProfile, StudioPayTo } from "@/mocks/types";
import { melbourneIso, PROTOTYPE_TODAY } from "@/lib/calendar";
import { emailProvider } from "./_lazy";
import { payToChangedEmail } from "@/server/email/templates/billing";
import { integrationState } from "@/mocks/integrations";
import { respond } from "./_delay";

seedBillingExtras();

const MFA_CODE = "123456";

function profile(scope: IntegrationScope): StudioBillingProfile {
  return billingProfileState[scope];
}

/** Sync live studio identity fields onto the demo billing profile on every read. */
function syncFromStudio(
  scope: IntegrationScope,
  current: StudioBillingProfile,
): StudioBillingProfile {
  if (scope !== "demo") return { ...current, payTo: { ...current.payTo } };
  const synced: StudioBillingProfile = {
    ...current,
    legalName: studio.legalName ?? studio.name,
    tradingName: current.tradingName || studio.name,
    gstRegistered: studio.gstRegistered,
    payTo: { ...current.payTo },
  };
  if (studio.abn) synced.abn = studio.abn;
  else delete synced.abn;
  return synced;
}

export function formatBsb(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export function validateBsb(value: string): boolean {
  return /^\d{6}$/.test(value.replace(/\D/g, ""));
}

export function validateAccountNumber(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 10;
}

export function maskAccountNumber(value?: string): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "••••";
  return `••••${digits.slice(-4)}`;
}

/** Sync read used by billing services (no artificial delay). */
export function readBillingProfile(scope: IntegrationScope = "demo"): StudioBillingProfile {
  const synced = syncFromStudio(scope, profile(scope));
  billingProfileState[scope] = { ...synced, payTo: { ...synced.payTo } };
  return { ...synced, payTo: { ...synced.payTo } };
}

export async function getBillingProfile(
  scope: IntegrationScope = "demo",
): Promise<StudioBillingProfile> {
  return respond(readBillingProfile(scope));
}

export async function saveBillingProfile(
  scope: IntegrationScope,
  patch: Partial<StudioBillingProfile>,
): Promise<StudioBillingProfile> {
  const current = syncFromStudio(scope, profile(scope));
  if (current.numberingLockedAt) {
    if (
      (patch.invoicePrefix !== undefined && patch.invoicePrefix !== current.invoicePrefix) ||
      (patch.creditNotePrefix !== undefined &&
        patch.creditNotePrefix !== current.creditNotePrefix) ||
      (patch.nextInvoiceNumber !== undefined &&
        patch.nextInvoiceNumber !== current.nextInvoiceNumber) ||
      (patch.nextCreditNoteNumber !== undefined &&
        patch.nextCreditNoteNumber !== current.nextCreditNoteNumber)
    ) {
      throw new Error("Invoice numbering is locked after the first send.");
    }
  }
  const next: StudioBillingProfile = {
    ...current,
    ...patch,
    payTo: patch.payTo ? { ...current.payTo, ...patch.payTo } : { ...current.payTo },
  };
  // Never unlock via a casual patch.
  if (current.numberingLockedAt) next.numberingLockedAt = current.numberingLockedAt;
  billingProfileState[scope] = next;
  billingAuditLog.push({
    at: melbourneIso(PROTOTYPE_TODAY, "12:00"),
    kind: "billing_profile_saved",
    detail: `Billing profile updated (${scope})`,
  });
  return respond(next);
}

/** Allocate and lock the next invoice number (INV- + 6 digits). */
export function allocateInvoiceNumber(scope: IntegrationScope = "demo"): string {
  const current = profile(scope);
  const number = `${current.invoicePrefix}${String(current.nextInvoiceNumber).padStart(6, "0")}`;
  current.nextInvoiceNumber += 1;
  current.numberingLockedAt ??= melbourneIso(PROTOTYPE_TODAY, "12:00");
  return number;
}

export function allocateCreditNoteNumber(scope: IntegrationScope = "demo"): string {
  const current = profile(scope);
  const number = `${current.creditNotePrefix}${String(current.nextCreditNoteNumber).padStart(6, "0")}`;
  current.nextCreditNoteNumber += 1;
  current.numberingLockedAt ??= melbourneIso(PROTOTYPE_TODAY, "12:00");
  return number;
}

export async function savePayTo(
  scope: IntegrationScope,
  payTo: StudioPayTo,
  mfaCode: string,
): Promise<StudioBillingProfile> {
  if (mfaCode !== MFA_CODE) throw new Error("Enter the six-digit code from your authenticator.");
  const membership = newsState[scope].membership;
  if (membership.role !== "owner")
    throw new Error("Only the studio owner can change pay-to details.");
  if (payTo.bsb && !validateBsb(payTo.bsb)) throw new Error("Enter a valid 6-digit BSB.");
  if (payTo.accountNumber && !validateAccountNumber(payTo.accountNumber)) {
    throw new Error("Enter a valid account number (6–10 digits).");
  }

  const current = syncFromStudio(scope, profile(scope));
  const nextPayTo: StudioPayTo = { ...current.payTo, ...payTo };
  if (nextPayTo.bsb) nextPayTo.bsb = nextPayTo.bsb.replace(/\D/g, "");
  if (nextPayTo.accountNumber) nextPayTo.accountNumber = nextPayTo.accountNumber.replace(/\D/g, "");
  current.payTo = nextPayTo;
  billingProfileState[scope] = current;

  const masked = maskAccountNumber(nextPayTo.accountNumber);
  const bsbLabel = nextPayTo.bsb ? formatBsb(nextPayTo.bsb) : "not set";
  const detail = `Pay-to updated · BSB ${bsbLabel} · account ${masked || "not set"}`;
  billingAuditLog.push({
    at: melbourneIso(PROTOTYPE_TODAY, "12:05"),
    kind: "pay_to_updated",
    detail,
  });

  const ownerEmail =
    scope === "demo" ? (studio.email ?? teacher.name) : (studio.email ?? "owner@studio.example");
  const from = `${studio.name} <studio@keystone.example>`;
  const mail = payToChangedEmail({
    studioName: current.tradingName || current.legalName || studio.name,
    accountName: nextPayTo.accountName ?? current.legalName,
    bsb: bsbLabel,
    accountMasked: masked || "not set",
    ...(nextPayTo.payId ? { payId: nextPayTo.payId } : {}),
  });
  await (
    await emailProvider()
  ).send({
    to: ownerEmail.includes("@") ? ownerEmail : "owner@studio.example",
    from,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tags: [{ name: "kind", value: "pay_to_changed" }],
  });

  // Studio news item — never include the full account number.
  newsState[scope].posts.unshift({
    id: `news-payto-${crypto.randomUUID()}`,
    studioId: scope === "demo" ? studio.id : "new-studio",
    authorMembershipId: membership.id,
    authorName: scope === "demo" ? teacher.name : "Teacher",
    title: "Bank details updated",
    body: `Pay-to details were updated. Deposits should use BSB ${bsbLabel} and account ending ${masked || "••••"}. Full account numbers are never shown in news.`,
    tag: "reminder",
    audience: { kind: "studio" },
    important: true,
    publishAt: melbourneIso(PROTOTYPE_TODAY, "12:06"),
    status: "published",
    attachments: [],
  });

  return respond(current);
}

/** Human label for studio terms merge (`billing.paymentMethods`). */
export function paymentMethodsLabel(scope: IntegrationScope = "demo"): string {
  const current = syncFromStudio(scope, profile(scope));
  const stripeConnected = integrationState[scope].stripe.status === "connected";
  const parts: string[] = [];
  if (stripeConnected) {
    parts.push("PayTo", "BECS direct debit", "card");
  }
  if (current.payTo.bsb && current.payTo.accountNumber) parts.push("bank transfer");
  if (current.payTo.payId) parts.push("PayID");
  if (current.payTo.cashNote) parts.push("cash");
  if (parts.length === 0) return "bank transfer";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
