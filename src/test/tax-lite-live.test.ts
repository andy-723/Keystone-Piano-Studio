import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveLessonFacts } from "@/services/live/tax-store";

// Real studio (0028): Tax Lite and Pro CFO read the studio's own rows. The database layer is
// faked here; supabase/tests/tax-lite.test.sql covers RLS on the tables themselves.
const facts: LiveLessonFacts = { lessons: [], credits: [] };
const saved: Record<string, unknown[]> = { expense: [], km: [], admin: [], home: [] };

vi.mock("@/services/live/tax-store", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/live/tax-store")>();
  return {
    ...real,
    loadLiveLessonFacts: vi.fn(async () => facts),
    insertLiveTaxExpense: vi.fn(async (row: unknown) => void saved["expense"]!.push(row)),
    insertLiveTaxKm: vi.fn(async (row: unknown) => void saved["km"]!.push(row)),
    insertLiveTaxAdminSession: vi.fn(async (row: unknown) => void saved["admin"]!.push(row)),
    upsertLiveHomeLessons: vi.fn(async (rows: unknown[]) => void saved["home"]!.push(...rows)),
    refreshLiveStripeFees: vi.fn(async () => false),
    reloadLiveXeroStamps: vi.fn(async () => undefined),
  };
});
vi.mock("@/services/integrations", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/integrations")>();
  return {
    ...real,
    getLiveXeroStatus: vi.fn(async () => ({
      status: "connected",
      organisationName: "Real Studio Pty Ltd",
      lastSyncedAt: "2026-11-23T10:00:00+11:00",
      live: {
        configured: true,
        needsReconnect: false,
        canConnect: true,
        lastError: null,
        salesAccountCode: "200",
        paymentAccountCode: null,
      },
    })),
    syncLiveXeroNow: vi.fn(async () => ({ invoices: 0, payments: 0 })),
  };
});
vi.mock("@/services/live/studio-store", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/live/studio-store")>();
  return { ...real, saveLiveStudioDetails: vi.fn(async () => undefined) };
});
vi.mock("@/lib/studio-clock", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/studio-clock")>();
  return { ...real, studioToday: () => "2026-11-24" };
});

import {
  families,
  invoices,
  lessonTypes,
  payments,
  practiceLogs,
  students,
  studio,
} from "@/mocks/data";
import { emptyDemoFixtures } from "@/mocks/clean-studio";
import { taxLiteExpenses, taxLiteLessonConfirmations } from "@/mocks/tax-lite";
import { resetStudioWorkspaceForTests, setStudioWorkspace } from "@/lib/studio-workspace";
import {
  addTaxLiteAdminSession,
  confirmTaxLiteLessons,
  getTaxLitePack,
  getTaxLiteStripeSummary,
  listTaxLitePendingWeeks,
  logTaxLiteExpense,
  logTaxLiteKm,
} from "@/services/tax-lite";
import { getProCfoPack, setProCfoProjectedTurnover } from "@/services/pro-cfo";
import { applyStripeFees } from "@/services/live/tax-store";
import { feeRowFrom } from "@/server/stripe-fees";

const STUDIO = "5e000000-0000-4000-8000-000000000001";
const FAM = "fa000000-0000-4000-8000-000000000001";
const KID = "ab000000-0000-4000-8000-000000000001";
const SERIES = "5a000000-0000-4000-8000-000000000001";

function lesson(date: string, mark: LiveLessonFacts["lessons"][number]["mark"], over = {}) {
  return {
    key: `${SERIES}_${date}`,
    studentId: KID,
    date,
    startTime: "16:00",
    durationMin: 30,
    calendarStatus: "scheduled" as const,
    mark,
    ...over,
  };
}

beforeEach(() => {
  emptyDemoFixtures({ studioId: STUDIO, studioName: "Real Studio" });
  for (const key of Object.keys(saved)) saved[key] = [];
  studio.plan = "pro";
  studio.gstRegistered = false;
  lessonTypes.splice(0, lessonTypes.length, {
    id: "lt-30",
    name: "30 min",
    durationMin: 30,
    priceCents: 5500,
  });
  families.push({ id: FAM, displayName: "Nguyen family", guardians: [] });
  students.push({ id: KID, familyId: FAM, firstName: "Mai", lastName: "Nguyen", birthYear: 2016 });
  invoices.push({
    id: "1e000000-0000-4000-8000-000000000001",
    number: "INV-0001",
    familyId: FAM,
    status: "partially_paid",
    issueDate: "2026-10-01",
    dueDate: "2026-10-15",
    lines: [],
    subtotalCents: 55000,
    taxCents: 0,
    totalCents: 55000,
    isTaxInvoice: false,
  } as never);
  payments.push(
    {
      id: "9a000000-0000-4000-8000-000000000001",
      invoiceId: "1e000000-0000-4000-8000-000000000001",
      familyId: FAM,
      amountCents: 22000,
      method: "bank_transfer",
      receivedOn: "2026-10-05",
      recordedBy: "owner",
    },
    {
      id: "9a000000-0000-4000-8000-000000000002",
      invoiceId: "1e000000-0000-4000-8000-000000000001",
      familyId: FAM,
      amountCents: 11000,
      method: "stripe_card",
      receivedOn: "2026-10-20",
      recordedBy: "stripe",
      stripePaymentIntentId: "pi_1",
    },
  );
  facts.lessons = [
    lesson("2026-11-02", "attended"),
    lesson("2026-11-09", "absent"),
    lesson("2026-11-16", null),
    lesson("2026-11-23", "cancelled_with_notice"),
    lesson("2026-11-30", null),
    lesson("2026-12-07", null),
    lesson("2026-12-14", null, { calendarStatus: "cancelled" }),
  ];
  facts.credits = [
    {
      id: "c1",
      studioId: STUDIO,
      studentId: KID,
      amount: 1,
      reason: "family_notice",
      occurrenceKey: `${SERIES}_2026-11-23`,
      appliesTo: null,
      makeupSeriesId: null,
      expiresOn: "2027-02-21",
      createdAt: "2026-11-22T09:00:00Z",
    },
  ];
  setStudioWorkspace({ mode: "live", studioId: STUDIO, userId: "owner-1", role: "owner" });
});

afterEach(() => {
  resetStudioWorkspaceForTests();
  for (const key of Object.keys(taxLiteLessonConfirmations)) delete taxLiteLessonConfirmations[key];
});

describe("Tax Lite on a real studio", () => {
  it("counts only Stripe payments, and only fees Stripe actually reported", async () => {
    let summary = await getTaxLiteStripeSummary("ytd");
    expect(summary.paymentCount).toBe(1);
    expect(summary).toMatchObject({
      grossTuitionCents: 11000,
      merchantFeesCents: 0,
      missingFeeCount: 1,
    });

    applyStripeFees([
      {
        payment_id: "9a000000-0000-4000-8000-000000000002",
        gross_cents: 11000,
        fee_cents: 212,
        net_cents: 10788,
      },
    ]);
    summary = await getTaxLiteStripeSummary("ytd");
    expect(summary).toMatchObject({
      merchantFeesCents: 212,
      netCents: 10788,
      missingFeeCount: 0,
      storedFeeCount: 1,
    });
  });

  it("pre-fills home hours from the real calendar and counts only confirmed lessons", async () => {
    const weeks = await listTaxLitePendingWeeks("ytd");
    // Past, not cancelled: 2 Nov, 9 Nov, 16 Nov (23 Nov family cancelled, later ones in the future).
    expect(weeks.flatMap((w) => w.lessons.map((l) => l.date)).sort()).toEqual([
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
    ]);
    expect(weeks[0]!.lessons[0]!.studentFirstName).toBe("Mai");

    await confirmTaxLiteLessons({
      taughtFromHome: [`${SERIES}_2026-11-02`, `${SERIES}_2026-11-16`],
      notFromHome: [`${SERIES}_2026-11-09`],
    });
    expect(saved["home"]).toHaveLength(3);
    await addTaxLiteAdminSession({ date: "2026-11-20", hours: 1.5, note: "Term invoices" });
    const pack = await getTaxLitePack("ytd");
    expect(pack.homeStudio).toMatchObject({
      teachingHours: 1,
      adminHours: 1.5,
      totalHours: 2.5,
      pendingLessonCount: 0,
      lessonCount: 2,
    });
    expect(pack.homeStudio.estimateCents).toBe(175);
  });

  it("refuses to confirm a lesson that isn't on the calendar yet", async () => {
    await expect(
      confirmTaxLiteLessons({ taughtFromHome: [`${SERIES}_2026-11-30`] }),
    ).rejects.toThrow(/already taught/);
    expect(saved["home"]).toHaveLength(0);
  });

  it("saves expenses and kilometres to the database with uuid ids", async () => {
    const expense = await logTaxLiteExpense({
      date: "2026-11-10",
      vendor: "Piano tuner",
      category: "Repairs & consumables",
      amountCents: 18000,
    });
    expect(expense.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved["expense"]).toHaveLength(1);
    expect(taxLiteExpenses[0]!.id).toBe(expense.id);
    const km = await logTaxLiteKm({ date: "2026-11-11", kilometres: 12.34, purpose: "Exam venue" });
    expect(saved["km"]).toEqual([km]);
    expect(km.kilometres).toBe(12.3);
  });
});

describe("Pro CFO on a real studio", () => {
  it("builds the pack from real payments, marks, credits and lesson prices", async () => {
    practiceLogs.push({
      id: "p1",
      studentId: KID,
      date: "2026-10-01",
      minutes: 30,
      loggedBy: "student",
    });
    taxLiteExpenses.push({
      id: "e1",
      date: "2026-11-10",
      vendor: "Tuner",
      category: "Repairs & consumables",
      amountCents: 18000,
      includesGst: false,
      createdAt: "2026-11-10T00:00:00Z",
    });
    const pack = await getProCfoPack("2026-11-24");
    expect(pack.live).toBe(true);
    // D6: bank and Stripe both count as collected.
    expect(pack.pulse).toMatchObject({
      grossCollectedCents: 33000,
      stripeFeesCents: 0,
      netCashCents: 33000,
      teacherPayoutCents: 0,
      marginMode: "solo",
      taxLiteExpenseCents: 18000,
      studioMarginCents: 15000,
      // 30 Nov and 7 Dec ahead (14 Dec cancelled), family has paid.
      unearnedLessonCount: 2,
      unearnedTuitionCents: 11000,
    });
    expect(pack.missingFeeCount).toBe(1);
    expect(pack.revenueChurn).toMatchObject({
      earnedLessonCount: 1,
      earnedCents: 5500,
      makeupLiabilityCents: 5500,
    });
    expect(pack.revenueChurn.makeupCredits[0]).toMatchObject({ creditBalance: 1, unitCents: 5500 });
    expect(pack.revenueChurn.atRisk[0]).toMatchObject({ studentId: KID, missedLessons: 1 });
    expect(pack.payouts).toEqual([]);
    expect(pack.unpricedLessonCount).toBe(0);
    expect(pack.xeroHealth).toMatchObject({ connected: true, mockConnected: false });
    expect(pack.xeroQueue.map((row) => row.number)).toEqual(["INV-0001"]);
    expect(pack.gstRadar).toMatchObject({
      rolling12mTurnoverCents: 33000,
      projectedNext12mCents: null,
    });
  });

  it("flags lessons whose length has no price instead of guessing one", async () => {
    lessonTypes.splice(0, lessonTypes.length, {
      id: "lt-30",
      name: "30 min",
      durationMin: 30,
      priceCents: 0,
    });
    const pack = await getProCfoPack("2026-11-24");
    expect(pack.revenueChurn.earnedCents).toBe(0);
    // 1 earned + 2 unearned + 1 make-up credit.
    expect(pack.unpricedLessonCount).toBe(4);
  });

  it("saves the owner's next-12-months GST estimate in the studio profile", async () => {
    await setProCfoProjectedTurnover(8_000_000);
    expect(studio.gstNext12mEstimateCents).toBe(8_000_000);
    const pack = await getProCfoPack("2026-11-24");
    expect(pack.gstRadar).toMatchObject({
      projectedNext12mCents: 8_000_000,
      projectedOverThreshold: true,
    });
  });
});

describe("Stripe fee rows", () => {
  it("takes Stripe's balance transaction as reported and refuses odd values", () => {
    expect(feeRowFrom("p", { id: "txn_1", amount: 11000, fee: 212, net: 10788 })).toEqual({
      paymentId: "p",
      grossCents: 11000,
      feeCents: 212,
      netCents: 10788,
    });
    expect(feeRowFrom("p", { id: "txn_2", amount: 11000, fee: -1, net: 11001 })).toBeNull();
    expect(feeRowFrom("p", { id: "txn_3", amount: 10.5, fee: 1, net: 9.5 })).toBeNull();
  });
});
