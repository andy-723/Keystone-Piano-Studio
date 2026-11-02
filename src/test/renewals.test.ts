import { afterEach, expect, it, vi } from "vitest";
import { renewalState } from "@/mocks/renewals";
import { conversations, messages, invoices, weeklySlots } from "@/mocks/data";
import { termInvoiceDrafts } from "@/mocks/billing";
import { getParentRenewal, getRenewals, respondToParentRenewal, sendRenewalInvitations, setRenewalSettings, simulateRenewalReminders } from "@/services/renewals";
import { prepareTerm2Invoices, sendTerm2Invoices } from "@/services/billing";

const originals = { conversations: structuredClone(conversations), messages: structuredClone(messages), invoices: structuredClone(invoices) };
vi.setConfig({ testTimeout: 20000 });
afterEach(() => {
  renewalState.active = false; renewalState.deadline = "2027-03-25"; renewalState.remindersEnabled = true; renewalState.families.clear();
  conversations.splice(0, conversations.length, ...structuredClone(originals.conversations)); messages.splice(0, messages.length, ...structuredClone(originals.messages)); invoices.splice(0, invoices.length, ...structuredClone(originals.invoices)); termInvoiceDrafts.clear();
});
it("requires an invitation and does not silently renew any family", async () => {
  expect(await getParentRenewal()).toBeNull();
  await expect(respondToParentRenewal("confirmed")).rejects.toThrow("No pending");
  expect(await sendRenewalInvitations()).toBe(22);
  expect((await getRenewals()).rows.filter((row) => row.status === "confirmed")).toHaveLength(0);
  expect(await prepareTerm2Invoices()).toHaveLength(0);
});
it("sends one invitation per family and does not duplicate on repeated or concurrent calls", async () => {
  const count = messages.length;
  await Promise.all([sendRenewalInvitations(), sendRenewalInvitations()]);
  expect(messages.length).toBe(count + 22);
  expect(await sendRenewalInvitations()).toBe(0);
});
it("the parent confirms only their own family, retaining slots and posting the response to family chat", async () => {
  await sendRenewalInvitations();
  const slots = structuredClone(weeklySlots);
  expect(await respondToParentRenewal("confirmed")).toMatchObject({ familyId: "fam-1", status: "confirmed" });
  expect(renewalState.families.get("fam-2")?.status).toBe("awaiting");
  expect(messages.at(-1)).toMatchObject({ conversationId: "conv-1", authorName: "Wei Chen", authorRole: "guardian" });
  expect(weeklySlots).toEqual(slots);
  await expect(respondToParentRenewal("confirmed")).rejects.toThrow("No pending");
});
it("change requests require a message and never count as confirmed", async () => {
  await sendRenewalInvitations();
  await expect(respondToParentRenewal("change_requested")).rejects.toThrow("what you would like");
  expect(await respondToParentRenewal("change_requested", "Could we switch to Saturday?" )).toMatchObject({ status: "change_requested", responseNote: "Could we switch to Saturday?" });
  expect(await prepareTerm2Invoices()).toHaveLength(0);
});
it("declined families receive no renewal invoice", async () => {
  await sendRenewalInvitations(); await respondToParentRenewal("declined");
  expect(await prepareTerm2Invoices()).toHaveLength(0);
  expect(await sendTerm2Invoices()).toHaveLength(0);
});
it("simulates one seven-day reminder only for non-responders, not confirmed or declined families", async () => {
  await sendRenewalInvitations(); await respondToParentRenewal("confirmed");
  const other = renewalState.families.get("fam-2"); if (other) other.status = "declined";
  expect(await simulateRenewalReminders()).toBe(20);
  expect(renewalState.families.get("fam-3")?.reminderDate).toBe("2027-03-22");
  expect(renewalState.families.get("fam-1")?.reminderDate).toBeUndefined();
  expect(await simulateRenewalReminders()).toBe(0);
});
it("disabled reminders never send and deadline settings validate dates", async () => {
  await setRenewalSettings({ deadline: "2027-03-25", remindersEnabled: false }); await sendRenewalInvitations();
  expect(await simulateRenewalReminders()).toBe(0);
  await expect(setRenewalSettings({ deadline: "2027-04-12", remindersEnabled: true })).rejects.toThrow("before Term 2");
});
it("confirmed families alone enter draft review and sending, even if old all-family drafts already exist", async () => {
  await prepareTerm2Invoices(); expect(termInvoiceDrafts.size).toBe(22);
  await sendRenewalInvitations(); await respondToParentRenewal("confirmed");
  const drafts = await prepareTerm2Invoices();
  expect(drafts).toHaveLength(1); expect(drafts[0]).toMatchObject({ familyId: "fam-1", status: "draft", totalCents: 106200, taxCents: 9655 });
  expect(invoices.some((invoice) => invoice.termKey === "2027-term-2")).toBe(false);
  const sent = await sendTerm2Invoices(); expect(sent).toHaveLength(1); expect(sent[0]?.familyId).toBe("fam-1");
  expect(await sendTerm2Invoices()).toHaveLength(0);
});