import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/services/_delay", () => ({ respond: async <T,>(value: T) => structuredClone(value) }));
import { studio, students, invoices } from "@/mocks/data";
import { newStudioSubscription } from "@/mocks/plans";
import { getStudio } from "@/services/roster";
import { getPlanBilling, setStudioPlan, proFeaturesEnabled } from "@/services/plans";
import { getAssignmentSettings, requirePro } from "@/services/assignments";
import { normalisePlan, baseStudentLimitExceeded, PUBLIC_PLANS } from "@/lib/plans";
import { connectXero, pushInvoiceToXero } from "@/services/integrations";
import { initialIntegrations, integrationState } from "@/mocks/integrations";
afterEach(() => { studio.plan = "pro"; newStudioSubscription.plan = "base"; integrationState.demo = initialIntegrations(); });
it("demo studio explicitly loads on Pro and reads never reset a chosen plan", async () => {
  expect(studio.plan).toBe("pro"); expect((await getStudio()).plan).toBe("pro"); expect((await getAssignmentSettings()).plan).toBe("pro");
  await setStudioPlan("base"); expect((await getStudio()).plan).toBe("base");
});
it("reads stored solo as base", async () => {
  expect(normalisePlan("solo")).toBe("base");
  Object.assign(studio, { plan: "solo" });
  expect((await getStudio()).plan).toBe("base"); expect((await getAssignmentSettings()).plan).toBe("base"); expect(() => requirePro()).toThrow("Pro");
});
it("switching plans disables and restores Pro capabilities without removing anything", async () => {
  const count = students.length; const invoiceCount = invoices.length;
  await connectXero(); await setStudioPlan("base"); expect(proFeaturesEnabled()).toBe(false); expect(() => requirePro()).toThrow("Pro");
  await expect(connectXero()).rejects.toThrow("Pro"); expect((await pushInvoiceToXero("inv-1")).synced).toBe(false);
  expect(integrationState.demo.xero.status).toBe("connected");
  await setStudioPlan("pro"); expect(proFeaturesEnabled()).toBe(true); expect(() => requirePro()).not.toThrow();
  expect(students.length).toBe(count); expect(invoices.length).toBe(invoiceCount);
  await setStudioPlan("academy"); expect(proFeaturesEnabled()).toBe(true);
});
it("Base includes 30 students and warns from the 31st, without limiting Pro or Academy", () => {
  expect(baseStudentLimitExceeded("base", 30)).toBe(false); expect(baseStudentLimitExceeded("base", 31)).toBe(true); expect(baseStudentLimitExceeded("base", 38)).toBe(true);
  expect(baseStudentLimitExceeded("pro", 38)).toBe(false); expect(baseStudentLimitExceeded("academy", 38)).toBe(false);
});
it("public monthly prices are A$29 Base and A$49 Pro plus GST", () => {
  expect(PUBLIC_PLANS.map(plan => plan.monthlyCents)).toEqual([2900, 4900]);
  expect(PUBLIC_PLANS.map(plan => plan.gstInclusiveCents)).toEqual([3190, 5390]);
});
it("public capacity is 30 students for Base and unlimited for Pro", () => {
  expect(PUBLIC_PLANS.map(plan => plan.studentLimit)).toEqual([30, null]);
});
it("billing keeps the supplied Pro prices and history separate from family invoices", async () => {
  const data = await getPlanBilling(); expect(data.renewal).toBe("1 Dec 2026"); expect(data.card).toBe("Visa ending 4242");
  expect(data.invoices.map(invoice => invoice.amountCents)).toEqual([5390, 5390, 5390]);
});
it("empty-studio plan switches never change the demo plan or invoice history", async () => {
  await setStudioPlan("pro", "new-studio"); expect((await getPlanBilling("new-studio")).invoices).toEqual([]); expect(studio.plan).toBe("pro");
  await setStudioPlan("base", "new-studio"); expect(studio.plan).toBe("pro");
});