import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { canViewStudioSnapshot } from "@/lib/app-settings";
import { messages } from "@/mocks/data";
import { initialIntegrations, integrationState } from "@/mocks/integrations";
import { GST_TURNOVER_THRESHOLD_CENTS, resetProCfoState } from "@/mocks/pro-cfo";
import { studio } from "@/mocks/data";
import {
  getProCfoPack,
  pushTeacherBillsToXero,
  setProCfoProjectedTurnover,
  retryXeroQueueItem,
  sendOverdueChase,
  teacherRemittanceCsv,
} from "@/services/pro-cfo";
import { setStudioPlan } from "@/services/plans";

beforeEach(() => {
  resetProCfoState();
  integrationState.demo = initialIntegrations();
  studio.plan = "pro";
});

afterEach(async () => {
  resetProCfoState();
  integrationState.demo = initialIntegrations();
  studio.plan = "pro";
});

describe("pro cfo access", () => {
  it("reuses the owner/admin snapshot gate", () => {
    expect(canViewStudioSnapshot("owner")).toBe(true);
    expect(canViewStudioSnapshot("admin")).toBe(true);
    expect(canViewStudioSnapshot("teacher")).toBe(false);
  });
});

describe("cfo pulse", () => {
  it("reports net cash, multi-teacher margin and unearned tuition", async () => {
    const pack = await getProCfoPack();
    expect(pack.proEnabled).toBe(true);
    expect(pack.pulse.grossCollectedCents).toBeGreaterThan(0);
    expect(pack.pulse.stripeFeesCents).toBeGreaterThan(0);
    expect(pack.pulse.netCashCents).toBe(
      pack.pulse.grossCollectedCents - pack.pulse.stripeFeesCents,
    );
    expect(pack.pulse.teacherPayoutCents).toBe(42 * 3500 + 28 * 3200);
    expect(pack.pulse.marginMode).toBe("multi_teacher");
    expect(pack.pulse.studioMarginCents).toBe(
      pack.pulse.netCashCents - pack.pulse.teacherPayoutCents,
    );
    expect(pack.pulse.unearnedTuitionCents).toBeGreaterThan(0);
    expect(pack.pulse.unearnedLessonCount).toBeGreaterThan(0);
    expect(pack.xeroHealth.connected).toBe(true);
    expect(pack.xeroHealth.mockConnected).toBe(true);
    expect(pack.xeroHealth.gstRegistered).toBe(true);
  });
});

describe("revenue churn and gst radar", () => {
  it("includes earned vs collected, make-up liability and $75k radar", async () => {
    const pack = await getProCfoPack();
    expect(pack.revenueChurn.earnedCents).toBeGreaterThan(0);
    expect(pack.revenueChurn.collectedCents).toBeGreaterThan(0);
    expect(pack.revenueChurn.makeupLiabilityCents).toBe(
      pack.revenueChurn.makeupCredits.reduce((sum, row) => sum + row.liabilityCents, 0),
    );
    expect(pack.gstRadar.thresholdCents).toBe(GST_TURNOVER_THRESHOLD_CENTS);
    expect(pack.gstRadar.rolling12mTurnoverCents).toBeGreaterThan(0);
    expect(pack.gstRadar.softPreview).toBe(false);
    expect(pack.gstRadar.projectedNext12mCents).toBeNull();
    expect(pack.xeroHealth.basis).toBe("cash");
    expect(pack.xeroQueue.some((row) => row.status === "failed")).toBe(true);
    expect(pack.overdue.length).toBeGreaterThan(0);
  });
});

describe("ops actions", () => {
  it("retries a failed Xero item, exports remittance and chases overdue in chat", async () => {
    const beforeMessages = messages.length;
    // inv-2 is sticky-fail once, then succeeds
    const first = await retryXeroQueueItem("inv-2");
    expect(first.ok).toBe(false);
    const second = await retryXeroQueueItem("inv-2");
    expect(second.ok).toBe(true);
    expect(integrationState.demo.xero.status).toBe("connected");

    const pack = await getProCfoPack();
    const file = teacherRemittanceCsv(pack);
    expect(file.filename).toContain("remittance");
    expect(file.csv).toContain("teacher_id");
    expect(file.csv).toContain("Alex Chen");
    expect(file.csv).toContain(String(pack.pulse.teacherPayoutCents));

    const bills = await pushTeacherBillsToXero();
    expect(bills.pushed).toBe(2);

    const chase = await sendOverdueChase(pack.overdue[0]!.invoiceId);
    expect(chase.payLink).toContain(pack.overdue[0]!.invoiceId);
    expect(messages.length).toBeGreaterThan(beforeMessages);
    expect(messages.at(-1)?.body).toContain("view=invoices");
    expect(messages.at(-1)?.body).toContain(pack.overdue[0]!.invoiceId);
  });

  it("soft-gates Xero retry on Starter without hard-blocking the pack", async () => {
    await setStudioPlan("base");
    const pack = await getProCfoPack();
    expect(pack.proEnabled).toBe(false);
    expect(pack.gstRadar.softPreview).toBe(true);
    expect(pack.pulse.netCashCents).toBeGreaterThan(0);
    await expect(retryXeroQueueItem("inv-1")).rejects.toThrow("Pro");
  });
});

describe("GST threshold monitor", () => {
  it("flags the projected next-12-months test as well as the past 12 months", async () => {
    await setProCfoProjectedTurnover(GST_TURNOVER_THRESHOLD_CENTS + 100);
    const pack = await getProCfoPack();
    expect(pack.gstRadar.projectedNext12mCents).toBe(GST_TURNOVER_THRESHOLD_CENTS + 100);
    expect(pack.gstRadar.projectedOverThreshold).toBe(true);
    expect(pack.gstRadar.nearThreshold).toBe(true);
    await expect(setProCfoProjectedTurnover(-1)).rejects.toThrow();
  });
});
