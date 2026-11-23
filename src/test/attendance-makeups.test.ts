import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  creditBalance,
  creditLots,
  earnsCredit,
  lessonRulesFrom,
  nextCreditToUse,
  type CreditEntry,
} from "@/lib/makeup-credits";
import { resetMockMemberships } from "@/server/authz";
import { resetMockSubscriptions } from "@/server/subscription-store";
import { createMemoryCalendarStore, setCalendarStoreForTests } from "@/server/calendar-store";
import { createMemoryAttendanceStore, setAttendanceStoreForTests } from "@/server/attendance-store";
import {
  addLesson,
  deleteLessons,
  endWeeklyLessons,
  getCalendarWeek,
  restoreOneLesson,
  type CalendarActor,
} from "@/server/calendar";
import {
  bookMakeUp,
  extendCredit,
  getLessonRecord,
  getStudentMakeUps,
  markDayAttended,
  markLesson,
} from "@/server/attendance";
import { familyMakeUps } from "@/server/family-portal";

const STUDIO_A = "studio-a";
const STUDIO_B = "studio-b";
const owner: CalendarActor = { userId: "owner-a", aal: "aal2" };
const outsider: CalendarActor = { userId: "owner-b", aal: "aal2" };

const entry = (patch: Partial<CreditEntry>): CreditEntry => ({
  id: crypto.randomUUID(),
  studioId: STUDIO_A,
  studentId: "stu-1",
  amount: 1,
  reason: "studio_cancel",
  occurrenceKey: "s_2026-11-10",
  appliesTo: null,
  makeupSeriesId: null,
  expiresOn: "2027-02-08",
  createdAt: "2026-11-10T05:00:00.000Z",
  ...patch,
});

describe("make-up credit rules", () => {
  it("decides credits the way the studio agreed (D2)", () => {
    expect(earnsCredit("attended", true)).toBe(false);
    expect(earnsCredit("cancelled_by_studio", false)).toBe(true);
    expect(earnsCredit("cancelled_with_notice")).toBe(true);
    expect(earnsCredit("cancelled_with_notice", false)).toBe(false);
    expect(earnsCredit("cancelled_late")).toBe(false);
    expect(earnsCredit("cancelled_late", true)).toBe(true);
    expect(earnsCredit("absent")).toBe(false);
    expect(earnsCredit("absent", true)).toBe(true);
  });

  it("folds the ledger: booked, given back, undone, expired and extended", () => {
    const a = entry({ createdAt: "2026-11-01T00:00:00.000Z", expiresOn: "2026-11-20" });
    const b = entry({ occurrenceKey: "s_2026-11-03", createdAt: "2026-11-03T00:00:00.000Z" });
    const c = entry({ occurrenceKey: "s_2026-11-05", createdAt: "2026-11-05T00:00:00.000Z" });
    const ledger: CreditEntry[] = [
      a,
      b,
      c,
      entry({
        amount: -1,
        reason: "makeup_booked",
        appliesTo: b.id,
        makeupSeriesId: "m1",
        expiresOn: null,
        occurrenceKey: null,
        createdAt: "2026-11-06T00:00:00.000Z",
      }),
      entry({
        amount: -1,
        reason: "undone",
        appliesTo: c.id,
        expiresOn: null,
        occurrenceKey: null,
        createdAt: "2026-11-07T00:00:00.000Z",
      }),
    ];
    let lots = creditLots(ledger, "2026-11-23");
    expect(lots.map((l) => l.state)).toEqual(["expired", "booked", "undone"]);
    expect(creditBalance(lots)).toBe(0);
    ledger.push(
      entry({
        amount: 0,
        reason: "extended",
        appliesTo: a.id,
        expiresOn: "2026-12-23",
        occurrenceKey: null,
        createdAt: "2026-11-23T01:00:00.000Z",
      }),
      entry({
        amount: 1,
        reason: "makeup_removed",
        appliesTo: b.id,
        expiresOn: null,
        occurrenceKey: null,
        createdAt: "2026-11-23T02:00:00.000Z",
      }),
    );
    lots = creditLots(ledger, "2026-11-23");
    expect(lots.map((l) => l.state)).toEqual(["available", "available", "undone"]);
    expect(creditBalance(lots)).toBe(2);
    // The credit that runs out first is used first.
    expect(nextCreditToUse(lots)?.id).toBe(a.id);
  });

  it("reads the studio's notice and allowance from its terms, with defaults", () => {
    expect(lessonRulesFrom(null)).toEqual({ cancelNoticeHours: 24, makeUpAllowance: "1 per term" });
    expect(
      lessonRulesFrom({
        policies: { cancelNoticeHours: 48, makeUpQuota: 2, makeUpPeriod: "year" },
      }),
    ).toEqual({ cancelNoticeHours: 48, makeUpAllowance: "2 per year" });
  });

  it("gives families only available credits and use-by dates", () => {
    const a = entry({ expiresOn: "2027-01-01" });
    const gone = entry({ occurrenceKey: "x", expiresOn: "2026-11-01" });
    expect(familyMakeUps([a, gone], ["stu-1", "stu-2"], "2026-11-23")).toEqual([
      { studentId: "stu-1", balance: 1, useBy: ["2027-01-01"] },
      { studentId: "stu-2", balance: 0, useBy: [] },
    ]);
  });
});

describe("attendance server (memory stores)", () => {
  let attendance: ReturnType<typeof createMemoryAttendanceStore>;
  let seriesId: string;
  beforeEach(async () => {
    // Monday 23 Nov 2026, 1 pm in Melbourne.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T02:00:00Z"));
    resetMockSubscriptions();
    resetMockMemberships([
      { userId: "owner-a", studioId: STUDIO_A, role: "owner" },
      { userId: "owner-b", studioId: STUDIO_B, role: "owner" },
    ]);
    setCalendarStoreForTests(
      createMemoryCalendarStore({
        students: {
          [STUDIO_A]: [
            { id: "stu-1", firstName: "Edison", lastName: "Phan", familyName: "Phan family" },
            { id: "stu-2", firstName: "Mia", lastName: "Chen", familyName: "Chen family" },
          ],
          [STUDIO_B]: [{ id: "stu-b", firstName: "Other", lastName: "Kid", familyName: null }],
        },
      }),
    );
    attendance = createMemoryAttendanceStore();
    setAttendanceStoreForTests(attendance);
    // Every Tuesday 4 pm from 3 Nov.
    seriesId = (
      await addLesson(owner, STUDIO_A, {
        studentId: "stu-1",
        date: "2026-11-03",
        startTime: "16:00",
        durationMin: 30,
        repeat: "weekly",
      })
    ).id;
  });
  afterEach(() => {
    vi.useRealTimers();
    setCalendarStoreForTests(null);
    setAttendanceStoreForTests(null);
    resetMockMemberships();
  });

  const lessonOn = async (date: string) =>
    (await getCalendarWeek(owner, STUDIO_A, date)).lessons.find((l) => l.originalDate === date);

  it("marks a past lesson attended and refuses attended for a future one", async () => {
    await markLesson(owner, STUDIO_A, { seriesId, originalDate: "2026-11-17", status: "attended" });
    expect((await lessonOn("2026-11-17"))?.attendance).toEqual({
      status: "attended",
      credit: false,
    });
    await expect(
      markLesson(owner, STUDIO_A, { seriesId, originalDate: "2026-11-24", status: "attended" }),
    ).rejects.toThrow(/only be marked as cancelled/);
  });

  it("a studio cancellation cancels the lesson and earns a credit; undoing gives it back", async () => {
    const { creditChange } = await markLesson(owner, STUDIO_A, {
      seriesId,
      originalDate: "2026-11-24",
      status: "cancelled_by_studio",
      giveCredit: false, // ignored: the studio cancelling always earns one
    });
    expect(creditChange).toBe("earn");
    const lesson = await lessonOn("2026-11-24");
    expect(lesson?.status).toBe("cancelled");
    expect(lesson?.attendance).toEqual({ status: "cancelled_by_studio", credit: true });
    const week = await getCalendarWeek(owner, STUDIO_A, "2026-11-24");
    expect(week.credits["stu-1"]).toEqual({ balance: 1, earnedRecently: 1 });
    const makeUps = await getStudentMakeUps(owner, STUDIO_A, "stu-1");
    // A future cancellation's credit lasts 90 days from the lesson.
    expect(makeUps.credits[0]?.expiresOn).toBe("2027-02-22");

    // Put back on the calendar: the mark and the unused credit go.
    await restoreOneLesson(owner, STUDIO_A, { exceptionId: lesson!.exceptionId! });
    const back = await lessonOn("2026-11-24");
    expect(back?.status).toBe("scheduled");
    expect(back?.attendance).toBeNull();
    expect((await getStudentMakeUps(owner, STUDIO_A, "stu-1")).balance).toBe(0);
  });

  it("family with notice earns a credit unless unticked; late and absent only as goodwill", async () => {
    await markLesson(owner, STUDIO_A, {
      seriesId,
      originalDate: "2026-11-03",
      status: "cancelled_with_notice",
    });
    await markLesson(owner, STUDIO_A, {
      seriesId,
      originalDate: "2026-11-10",
      status: "cancelled_with_notice",
      giveCredit: false,
    });
    await markLesson(owner, STUDIO_A, {
      seriesId,
      originalDate: "2026-11-17",
      status: "cancelled_late",
    });
    expect((await getStudentMakeUps(owner, STUDIO_A, "stu-1")).balance).toBe(1);
    await markLesson(owner, STUDIO_A, {
      seriesId,
      originalDate: "2026-11-17",
      status: "absent",
      giveCredit: true,
    });
    const data = await getStudentMakeUps(owner, STUDIO_A, "stu-1");
    expect(data.balance).toBe(2);
    expect(data.credits.map((c) => c.reason).sort()).toEqual(["family_notice", "goodwill"]);
    // Absent puts the 17 Nov lesson back on the calendar (it was cancelled as a late cancel).
    expect((await lessonOn("2026-11-17"))?.status).toBe("scheduled");
    // Changing a goodwill mark to attended undoes that credit (append-only ledger).
    await markLesson(owner, STUDIO_A, { seriesId, originalDate: "2026-11-17", status: "attended" });
    expect((await getStudentMakeUps(owner, STUDIO_A, "stu-1")).balance).toBe(1);
    expect(attendance.state.credits.map((c) => c.reason)).toEqual([
      "family_notice",
      "goodwill",
      "undone",
    ]);
  });

  it("books a make-up with the credit, blocks undoing it, and gives it back when removed", async () => {
    await markLesson(owner, STUDIO_A, {
      seriesId,
      originalDate: "2026-11-17",
      status: "cancelled_by_studio",
    });
    await expect(
      bookMakeUp(owner, STUDIO_A, {
        studentId: "stu-2",
        date: "2026-11-26",
        startTime: "16:00",
        durationMin: 30,
      }),
    ).rejects.toThrow(/no make-up credit/);
    const booked = await bookMakeUp(owner, STUDIO_A, {
      studentId: "stu-1",
      date: "2026-11-26",
      startTime: "16:00",
      durationMin: 30,
    });
    const makeUp = await lessonOn("2026-11-26");
    expect(makeUp?.makeUp).toBe(true);
    let data = await getStudentMakeUps(owner, STUDIO_A, "stu-1");
    expect(data.balance).toBe(0);
    expect(data.bookings).toEqual([
      {
        seriesId: booked.seriesId,
        creditId: booked.creditId,
        date: "2026-11-26",
        startTime: "16:00",
      },
    ]);
    // The credit is used, so the cancellation can't be undone yet.
    await expect(
      markLesson(owner, STUDIO_A, { seriesId, originalDate: "2026-11-17", status: "attended" }),
    ).rejects.toThrow(/Remove that make-up first/);
    await deleteLessons(owner, STUDIO_A, { seriesId: booked.seriesId });
    data = await getStudentMakeUps(owner, STUDIO_A, "stu-1");
    expect(data.balance).toBe(1);
    expect(data.bookings).toEqual([]);
  });

  it("extends a credit by 30 days", async () => {
    await markLesson(owner, STUDIO_A, {
      seriesId,
      originalDate: "2026-11-17",
      status: "cancelled_by_studio",
    });
    const [credit] = (await getStudentMakeUps(owner, STUDIO_A, "stu-1")).credits;
    expect(credit?.expiresOn).toBe("2027-02-21");
    expect(
      await extendCredit(owner, STUDIO_A, { studentId: "stu-1", creditId: credit!.id }),
    ).toEqual({
      expiresOn: "2027-03-23",
    });
  });

  it("marks a whole day attended and builds the lesson record", async () => {
    await addLesson(owner, STUDIO_A, {
      studentId: "stu-2",
      date: "2026-11-17",
      startTime: "17:00",
      durationMin: 30,
      repeat: "once",
    });
    expect(await markDayAttended(owner, STUDIO_A, "2026-11-17")).toEqual({ marked: 2 });
    await expect(markDayAttended(owner, STUDIO_A, "2026-11-24")).rejects.toThrow(
      /on or after the day/,
    );
    const { rows } = await getLessonRecord(owner, STUDIO_A, {
      from: "2026-11-09",
      to: "2026-11-29",
    });
    expect(rows.map((r) => [r.date, r.studentName, r.status])).toEqual([
      ["2026-11-17", "Edison Phan", "attended"],
      ["2026-11-17", "Mia Chen", "attended"],
      ["2026-11-10", "Edison Phan", "not_marked"],
    ]);
  });

  it("stopping weekly lessons clears marks on dropped cancelled weeks", async () => {
    await markLesson(owner, STUDIO_A, {
      seriesId,
      originalDate: "2026-12-01",
      status: "cancelled_by_studio",
    });
    expect((await getStudentMakeUps(owner, STUDIO_A, "stu-1")).balance).toBe(1);
    await endWeeklyLessons(owner, STUDIO_A, { seriesId, lastDate: "2026-11-24" });
    expect((await getStudentMakeUps(owner, STUDIO_A, "stu-1")).balance).toBe(0);
    expect(attendance.state.marks.size).toBe(0);
  });

  it("keeps studios apart", async () => {
    await expect(
      markLesson(outsider, STUDIO_A, { seriesId, originalDate: "2026-11-17", status: "attended" }),
    ).rejects.toThrow();
    await expect(
      markLesson(outsider, STUDIO_B, { seriesId, originalDate: "2026-11-17", status: "attended" }),
    ).rejects.toThrow(/changed or removed/);
    await expect(getStudentMakeUps(outsider, STUDIO_A, "stu-1")).rejects.toThrow();
    await expect(getStudentMakeUps(outsider, STUDIO_B, "stu-1")).rejects.toThrow(
      /not in this studio/,
    );
  });
});
