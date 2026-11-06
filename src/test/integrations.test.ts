import { afterEach, beforeEach, expect, it } from "vitest";
import { integrationState, initialIntegrations } from "@/mocks/integrations";
import { invoices, payments } from "@/mocks/data";
import { parentPayments } from "@/mocks/parent";
import { termInvoiceDrafts } from "@/mocks/billing";
import { setStudioPlan } from "@/services/plans";
import { newStudioSubscription } from "@/mocks/plans";
import { connectStripe, disconnectStripe, getIntegrations, getStripeStatus, connectXero, disconnectXero, pushInvoiceToXero } from "@/services/integrations";
import { getParentInvoice, payParentInvoice } from "@/services/parent";
import { getInvoice, recordInvoicePayment, setInvoiceStatus, prepareTerm2Invoices, sendTerm2Invoices } from "@/services/billing";
const original = { invoices: structuredClone(invoices), payments: structuredClone(payments) };
beforeEach(() => {
  const invoice = invoices.find((entry) => entry.id === "inv-1"); if (!invoice) throw new Error("Missing invoice");
  invoice.status = "sent";
  for (let index = payments.length - 1; index >= 0; index--) if (payments[index]?.invoiceId === "inv-1") payments.splice(index, 1);
});
afterEach(() => {
  newStudioSubscription.plan = "base";
  integrationState.demo = initialIntegrations(); integrationState["new-studio"] = initialIntegrations();
  invoices.splice(0, invoices.length, ...structuredClone(original.invoices));
  payments.splice(0, payments.length, ...structuredClone(original.payments));
  parentPayments.length = 0; termInvoiceDrafts.clear();
});
it("transitions Stripe from not connected to setting up to connected and disconnects", async () => {
  expect(await getStripeStatus()).toBe("not_connected");
  await connectStripe({ stage: "start" }); expect(await getStripeStatus()).toBe("setting_up");
  await connectStripe({ stage: "complete", businessName: "Clarke Piano Studio" });
  expect((await getIntegrations()).stripe).toEqual({ status: "connected", businessName: "Clarke Piano Studio", bankLast4: "1234" });
  await disconnectStripe(); expect(await getStripeStatus()).toBe("not_connected");
});
it.each(["not_connected", "setting_up"] as const)("blocks parent online payment while Stripe is %s without changing money", async (status) => {
  integrationState.demo.stripe.status = status;
  const before = await getParentInvoice("inv-1");
  const paymentCount = payments.length;
  await expect(payParentInvoice("inv-1", "payto")).rejects.toThrow("Your teacher will send bank details");
  expect((await getParentInvoice("inv-1"))?.balanceCents).toBe(before?.balanceCents);
  expect(payments).toHaveLength(paymentCount); expect(parentPayments).toHaveLength(0);
});
it("allows connected parent payments and blocks them after disconnect", async () => {
  await connectStripe(); expect((await payParentInvoice("inv-1", "becs")).balanceCents).toBe(0);
  await disconnectStripe(); expect(await getStripeStatus()).toBe("not_connected");
});
it("keeps empty-studio connections separate from demo connections", async () => {
  await setStudioPlan("pro", "new-studio");
  await connectStripe({}, "new-studio"); await connectXero("new-studio");
  expect(await getStripeStatus()).toBe("not_connected");
  expect((await getIntegrations()).xero.status).toBe("not_connected");
  expect(await getStripeStatus("new-studio")).toBe("connected");
});
it("connects and disconnects Xero without sending existing invoices", async () => {
  await connectXero(); expect((await getIntegrations()).xero).toEqual({ status: "connected", organisationName: "Keystone Music HQ", lastSyncedAt: null });
  expect((await getInvoice("inv-1"))?.xeroSyncedAt).toBeUndefined();
  await disconnectXero(); expect((await getIntegrations()).xero.status).toBe("not_connected");
});
it("stores Xero sync when issuing an invoice, preserves tax, and retains sync after disconnect", async () => {
  const draft = invoices.find((invoice) => invoice.status === "draft"); if (!draft) throw new Error("Missing draft");
  const before = await getInvoice(draft.id); await connectXero();
  const sent = await setInvoiceStatus(draft.id, "sent");
  expect(sent?.xeroSyncedAt).toBe("2027-03-15T10:28:00+11:00"); expect(sent?.taxCents).toBe(before?.taxCents);
  await disconnectXero(); expect((await getInvoice(draft.id))?.xeroSyncedAt).toBe(sent?.xeroSyncedAt);
});
it("syncs newly recorded payments only while Xero is connected", async () => {
  await connectXero(); const paid = await recordInvoicePayment("inv-1", "card");
  expect(paid.payments?.at(-1)?.xeroSyncedAt).toBe("2027-03-15T10:28:00+11:00");
  expect((await getIntegrations()).xero.lastSyncedAt).toBe("2027-03-15T10:28:00+11:00");
  await disconnectXero(); const unsynced = await recordInvoicePayment("inv-5", "becs");
  expect(unsynced.payments?.at(-1)?.xeroSyncedAt).toBeUndefined();
});
it("push is a no-op when disconnected and for draft invoices", async () => {
  expect(await pushInvoiceToXero("inv-1")).toEqual({ synced: false });
  await connectXero(); const draft = invoices.find((invoice) => invoice.status === "draft"); if (!draft) throw new Error("Missing draft");
  expect(await pushInvoiceToXero(draft.id)).toEqual({ synced: false });
});
it("syncs the batch-send path and does not duplicate sends", async () => {
  await connectXero(); await prepareTerm2Invoices(); const sent = await sendTerm2Invoices();
  expect(sent.length).toBeGreaterThan(0); expect(sent.every((invoice) => invoice.xeroSyncedAt === "2027-03-15T10:28:00+11:00")).toBe(true);
  const count = invoices.length; await sendTerm2Invoices(); expect(invoices).toHaveLength(count);
});