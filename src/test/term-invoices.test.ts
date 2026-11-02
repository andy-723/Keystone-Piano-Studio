import { afterEach, expect, it } from "vitest";
import { invoices, studio, payments } from "@/mocks/data";
import { termInvoiceDrafts } from "@/mocks/billing";
import { getInvoice, getTerm2Preview, prepareTerm2Invoices, sendTerm2Invoices, setInvoiceStatus } from "@/services/billing";
import { setGstRegistered } from "@/services/roster";
const original = structuredClone(invoices);
const originalPayments = structuredClone(payments);
afterEach(() => { payments.splice(0, payments.length, ...structuredClone(originalPayments)); invoices.splice(0, invoices.length, ...structuredClone(original)); termInvoiceDrafts.clear(); studio.gstRegistered = true; });
it("counts Term 2 from 12 April to 25 June, excluding calendar public holidays", async () => {
  const preview = await getTerm2Preview();
  expect(preview.term).toMatchObject({ start: "2027-04-12", end: "2027-06-25" });
  const lucy = preview.rows.find((row) => row.student.id === "stu-1");
  expect(lucy?.dates).toHaveLength(9);
  expect(lucy?.skipped).toEqual(["2027-04-26", "2027-06-14"]);
  expect(lucy?.totalCents).toBe(62100);
  expect(preview.rows.find((row) => row.student.id === "stu-6")?.dates).toHaveLength(11);
});
it("prepares one draft per family with child lines and GST equal to total divided by eleven", async () => {
  const drafts = await prepareTerm2Invoices();
  expect(drafts).toHaveLength(22);
  expect(new Set(drafts.map((invoice) => invoice.familyId)).size).toBe(22);
  const chen = drafts.find((invoice) => invoice.familyId === "fam-1");
  expect(chen).toMatchObject({ status: "draft", totalCents: 106200, taxCents: 9655, subtotalCents: 96545, isTaxInvoice: true });
  expect(chen?.lines.map((line) => line.qty)).toEqual([9, 9]);
  expect(chen?.lines.reduce((total, line) => total + line.taxCents, 0)).toBe(9655);
  expect((await prepareTerm2Invoices()).length).toBe(22);
});
it("Send all stores drafts as Sent without duplicating family invoices on repeat", async () => {
  await prepareTerm2Invoices();
  const sent = await sendTerm2Invoices();
  expect(sent).toHaveLength(22);
  expect(sent.every((invoice) => invoice.status === "sent")).toBe(true);
  expect((await getInvoice("inv-term2-fam-1"))?.status).toBe("sent");
  expect(await sendTerm2Invoices()).toEqual([]);
  expect(await prepareTerm2Invoices()).toEqual([]);
  expect(invoices.filter((invoice) => invoice.termKey === "2027-term-2")).toHaveLength(22);
});
it("non-registered invoices have zero GST and keep inclusive family prices", async () => {
  await setGstRegistered(false);
  const drafts = await prepareTerm2Invoices();
  expect(drafts.find((invoice) => invoice.familyId === "fam-1")).toMatchObject({ isTaxInvoice: false, taxCents: 0, totalCents: 106200, subtotalCents: 106200 });
  expect(drafts.every((invoice) => invoice.lines.every((line) => line.taxCents === 0))).toBe(true);
  await sendTerm2Invoices();
  await setGstRegistered(true);
  expect(await getInvoice("inv-term2-fam-1")).toMatchObject({ gstRegistered: false, title: "Invoice", isTaxInvoice: false, taxCents: 0, subtotalCents: 106200, totalCents: 106200 });
});
it("Mark as paid reads back as paid", async () => {
  await setInvoiceStatus("inv-4", "paid");
  expect((await getInvoice("inv-4"))?.status).toBe("paid");
});
it("freezes registered treatment and exact line GST on sending despite later Settings changes", async () => {
  await prepareTerm2Invoices(); await sendTerm2Invoices();
  const before = await getInvoice("inv-term2-fam-1");
  expect(before).toMatchObject({ gstRegistered: true, title: "Tax invoice", isTaxInvoice: true, taxCents: 9655, subtotalCents: 96545 });
  expect(before?.lines.map((line) => line.taxCents)).toEqual([5645, 4010]);
  await setGstRegistered(false);
  const after = await getInvoice("inv-term2-fam-1");
  expect(after).toEqual(before);
  await setInvoiceStatus("inv-term2-fam-1", "paid");
  expect(await getInvoice("inv-term2-fam-1")).toMatchObject({ title: "Tax invoice", gstRegistered: true, taxCents: 9655 });
});
it("only drafts follow Settings and generic draft-to-sent transitions freeze current treatment", async () => {
  expect(await getInvoice("inv-6")).toMatchObject({ status: "draft", title: "Tax invoice", taxCents: 5018 });
  await setGstRegistered(false);
  expect(await getInvoice("inv-6")).toMatchObject({ status: "draft", title: "Invoice", taxCents: 0 });
  await setInvoiceStatus("inv-6", "sent"); await setGstRegistered(true);
  expect(await getInvoice("inv-6")).toMatchObject({ status: "sent", gstRegistered: false, title: "Invoice", taxCents: 0 });
});