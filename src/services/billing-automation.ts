import type { IntegrationScope } from "@/mocks/integrations";
import { respond } from "./_delay";
import { prepareTerm2Invoices, sendInvoices } from "./billing";
import { hasFeature } from "./plans";

const PRO_MESSAGE = "Available on Pro. Pro is A$49 a month + GST.";

function requireBillingAutomation(scope: IntegrationScope) {
  if (!hasFeature("billing_automation", scope)) throw new Error(PRO_MESSAGE);
}

/**
 * Pro billing automation: prepare the next term's family invoices (generalises Term 2).
 * Gated by hasFeature(..., "billing_automation").
 */
export async function billNextTerm(scope: IntegrationScope = "demo", _termKey = "2027-term-2") {
  requireBillingAutomation(scope);
  void _termKey;
  const invoices = await prepareTerm2Invoices();
  // Mark drafts reviewed so scheduled sending (when enabled) may pick them up.
  for (const invoice of invoices) {
    if (invoice.status === "draft") {
      const { updateDraft } = await import("./billing");
      await updateDraft(invoice.id, { reviewedAt: new Date().toISOString() });
    }
  }
  return respond({ ran: true as const, invoices: await prepareTerm2Invoices() });
}

export async function sendReviewedTermInvoices(scope: IntegrationScope = "demo", ids: string[]) {
  requireBillingAutomation(scope);
  return sendInvoices(ids);
}
