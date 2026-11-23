import { describe, expect, it } from "vitest";
import {
  PUBLIC_HOLIDAYS_BY_STATE,
  defaultBillingTerm,
  defaultClosedDates,
  holidaysInTerm,
  priceFor,
  renewalAnswerProblem,
  renewalDeadlineProblem,
  studioStateFor,
  termDatesProblem,
  termDueDate,
  termLessons,
  termLineDescription,
  upcomingTerms,
} from "@/lib/term-billing";
import type { LessonException, LessonSeries } from "@/lib/lesson-calendar";
import { answerFamilyRenewal, listFamilyRenewals } from "@/server/family-renewals";
import type { FamilyContext } from "@/server/family-portal";
import { lessonPricesProblem } from "@/services/roster";

function series(
  over: Partial<LessonSeries> & { id: string; studentId: string; firstDate: string },
): LessonSeries {
  return {
    studioId: "s-a",
    teacherUserId: "t-1",
    repeat: "weekly",
    untilDate: null,
    startTime: "16:00",
    durationMin: 30,
    location: null,
    note: null,
    googleSyncStatus: "off",
    googleSyncError: null,
    ...over,
  };
}

// NSW Term 1 2027: Wed 3 Feb – Fri 9 Apr. Good Friday 26 Mar, Easter Monday 29 Mar.
const TERM = { start: "2027-02-03", end: "2027-04-09" };
const monday = series({ id: "ser-mon", studentId: "kid-1", firstDate: "2026-11-02" }); // Mondays
const friday = series({
  id: "ser-fri",
  studentId: "kid-2",
  firstDate: "2026-11-06",
  durationMin: 45,
});

describe("term dates and holidays", () => {
  it("offers the terms that haven't ended, and bills the next one by default", () => {
    const terms = upcomingTerms("NSW", "2026-11-23");
    expect(terms[0]).toMatchObject({ key: "2027-T1", name: "Term 1 2027", start: "2027-02-03" });
    expect(defaultBillingTerm(terms, "2026-11-23")?.key).toBe("2027-T1");
    // During Term 1, the next term is Term 2.
    expect(defaultBillingTerm(upcomingTerms("NSW", "2027-03-01"), "2027-03-01")?.key).toBe(
      "2027-T2",
    );
    expect(upcomingTerms("NSW", "2028-01-10")).toEqual([]);
  });

  it("guesses the state from the timezone when the studio hasn't saved one", () => {
    expect(studioStateFor("QLD", "Australia/Sydney")).toBe("QLD");
    expect(studioStateFor(undefined, "Australia/Perth")).toBe("WA");
    expect(studioStateFor("Narnia", undefined)).toBe("NSW");
  });

  it("checks term dates", () => {
    expect(termDatesProblem(TERM.start, TERM.end)).toBeNull();
    expect(termDatesProblem("2027-04-09", "2027-02-03")).toMatch(/end after/);
    expect(termDatesProblem("2027-02-03", "2027-12-31")).toMatch(/26 weeks/);
    expect(termDatesProblem("", "2027-02-03")).toMatch(/first and last/);
  });

  it("lists the state's holidays in the term, regional ones unticked", () => {
    const nsw = holidaysInTerm("NSW", TERM.start, TERM.end).map((h) => h.date);
    expect(nsw).toEqual(["2027-03-26", "2027-03-29"]);
    const qld = holidaysInTerm("QLD", "2027-07-12", "2027-09-17");
    expect(qld.map((h) => h.date)).toEqual(["2027-08-11"]);
    expect(defaultClosedDates(qld)).toEqual([]);
    // Every state has Good Friday and Easter Monday, and dates are sorted.
    for (const list of Object.values(PUBLIC_HOLIDAYS_BY_STATE)) {
      expect(list.map((h) => h.date)).toContain("2027-03-26");
      expect(list.map((h) => h.date)).toEqual([...list.map((h) => h.date)].sort());
    }
  });
});

describe("counting a term's lessons", () => {
  const holidays = ["2027-03-26", "2027-03-29"];

  it("skip: holidays are neither taught nor charged", () => {
    const out = termLessons([monday, friday], [], TERM, holidays, "skip");
    const mon = out.get("kid-1")!;
    expect(mon.dates.length).toBe(8); // 9 Mondays, Easter Monday skipped
    expect(mon.skipped).toEqual(["2027-03-29"]);
    expect(out.get("kid-2")!.skipped).toEqual(["2027-03-26"]);
    expect(out.get("kid-2")!.durationMin).toBe(45);
  });

  it("make_up: holidays are charged and listed as make-ups", () => {
    const mon = termLessons([monday], [], TERM, holidays, "make_up").get("kid-1")!;
    expect(mon.dates.length).toBe(9);
    expect(mon.makeUpDates).toEqual(["2027-03-29"]);
  });

  it("charge: holidays go ahead as normal", () => {
    const mon = termLessons([monday], [], TERM, holidays, "charge").get("kid-1")!;
    expect(mon.dates.length).toBe(9);
    expect(mon.makeUpDates).toEqual([]);
  });

  it("studio closures are never charged, whatever the holiday rule", () => {
    const mon = termLessons([monday], [], TERM, [], "charge", ["2027-02-08"]).get("kid-1")!;
    expect(mon.skipped).toEqual(["2027-02-08"]);
    expect(mon.dates.length).toBe(8);
  });

  it("leaves out cancelled lessons, counts a moved one once, and stops at the end date", () => {
    const exceptions: LessonException[] = [
      {
        id: "x1",
        studioId: "s-a",
        seriesId: "ser-mon",
        originalDate: "2027-02-08",
        action: "cancel",
        newDate: null,
        newStartTime: null,
      },
      {
        id: "x2",
        studioId: "s-a",
        seriesId: "ser-mon",
        originalDate: "2027-02-15",
        action: "move",
        newDate: "2027-02-17",
        newStartTime: "17:00",
      },
      // Moved out of the term: not billed in it.
      {
        id: "x3",
        studioId: "s-a",
        seriesId: "ser-mon",
        originalDate: "2027-04-05",
        action: "move",
        newDate: "2027-04-12",
        newStartTime: "17:00",
      },
    ];
    const mon = termLessons([monday], exceptions, TERM, [], "skip").get("kid-1")!;
    expect(mon.cancelled).toBe(1);
    expect(mon.dates).toContain("2027-02-17");
    expect(mon.dates).not.toContain("2027-02-15");
    expect(mon.dates).not.toContain("2027-04-05");
    expect(mon.dates.length).toBe(7);
    const ending = series({
      id: "ser-end",
      studentId: "kid-3",
      firstDate: "2026-11-02",
      untilDate: "2027-02-22",
    });
    expect(termLessons([ending], [], TERM, [], "skip").get("kid-3")!.dates).toEqual([
      "2027-02-08",
      "2027-02-15",
      "2027-02-22",
    ]);
  });

  it("ignores one-off lessons", () => {
    const once = series({
      id: "ser-once",
      studentId: "kid-4",
      firstDate: "2027-02-10",
      untilDate: "2027-02-10",
      repeat: "once",
    });
    expect(termLessons([once], [], TERM, [], "skip").get("kid-4")).toBeUndefined();
  });
});

describe("prices, lines and dates", () => {
  const types = [
    { id: "lt-30", name: "30 min lesson", durationMin: 30, priceCents: 4500 },
    { id: "lt-45", name: "45 min lesson", durationMin: 45, priceCents: 0 },
  ];

  it("prices a lesson by its length, and treats A$0 as no price", () => {
    expect(priceFor(types, 30)?.priceCents).toBe(4500);
    expect(priceFor(types, 45)).toBeNull();
    expect(priceFor(types, 60)).toBeNull();
    expect(priceFor(types, null)).toBeNull();
  });

  it("names make-up holidays on the invoice line", () => {
    expect(termLineDescription("Mia Chen", "30 min lesson", "Term 1 2027", [])).toBe(
      "Mia Chen – 30 min lesson, Term 1 2027",
    );
    expect(termLineDescription("Mia Chen", "30 min lesson", "Term 1 2027", ["2027-03-29"])).toBe(
      "Mia Chen – 30 min lesson, Term 1 2027 (incl. 29 Mar public holiday, make-up offered)",
    );
  });

  it("is due on the first day of term, or a week after sending if that's later", () => {
    expect(termDueDate("2027-02-03", "2026-12-01")).toBe("2027-02-03");
    expect(termDueDate("2027-02-03", "2027-02-01")).toBe("2027-02-08");
  });

  it("checks lesson prices", () => {
    expect(lessonPricesProblem([{ durationMin: 30, priceCents: 4500 }])).toBeNull();
    expect(lessonPricesProblem([])).toMatch(/at least one/);
    expect(lessonPricesProblem([{ durationMin: 5, priceCents: 100 }])).toMatch(/10 to 240/);
    expect(lessonPricesProblem([{ durationMin: 30, priceCents: -1 }])).toMatch(/between/);
    expect(
      lessonPricesProblem([
        { durationMin: 30, priceCents: 1 },
        { durationMin: 30, priceCents: 2 },
      ]),
    ).toMatch(/one price/);
  });

  it("checks renewal dates and answers", () => {
    expect(renewalDeadlineProblem("2027-01-20", "2026-11-23", "2027-04-09")).toBeNull();
    expect(renewalDeadlineProblem("2026-11-01", "2026-11-23", "2027-04-09")).toMatch(/past/);
    expect(renewalDeadlineProblem("2027-05-01", "2026-11-23", "2027-04-09")).toMatch(
      /before the term ends/,
    );
    expect(renewalAnswerProblem("confirmed", "")).toBeNull();
    expect(renewalAnswerProblem("change_requested", "  ")).toMatch(/change/);
    expect(renewalAnswerProblem("awaiting", "")).toMatch(/Choose/);
    expect(renewalAnswerProblem("declined", "x".repeat(1001))).toMatch(/1000/);
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
function fake(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: any) => boolean> = [];
      let patch: any = null;
      const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
      const embed = (row: any) =>
        table === "renewal_response"
          ? {
              ...row,
              renewal_campaign:
                (tables["renewal_campaign"] ?? []).find((c) => c.id === row.campaign_id) ?? null,
            }
          : row;
      const run = () => {
        const hit = rows();
        if (patch) for (const row of hit) Object.assign(row, patch);
        return hit.map(embed);
      };
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
        update: (value: any) => ((patch = value), q),
        then: (resolve: (v: unknown) => void) => resolve({ data: run(), error: null }),
      };
      return q;
    },
  } as never;
}

describe("family renewal answers", () => {
  const ctx: FamilyContext = {
    studioId: "s-a",
    familyId: "f-1",
    childIds: ["kid-1"],
    timeZone: "Australia/Sydney",
  };
  const NOW = new Date("2026-12-01T01:00:00Z");
  const tables = () => ({
    renewal_campaign: [
      {
        id: "c-1",
        studio_id: "s-a",
        term_key: "2027-T1",
        term_start: "2027-02-03",
        term_end: "2027-04-09",
        deadline: "2027-01-20",
      },
      {
        id: "c-old",
        studio_id: "s-a",
        term_key: "2026-T4",
        term_start: "2026-10-12",
        term_end: "2026-11-30",
        deadline: "2026-10-01",
      },
    ],
    renewal_response: [
      {
        id: "r-1",
        studio_id: "s-a",
        campaign_id: "c-1",
        family_id: "f-1",
        status: "awaiting",
        note: null,
      },
      {
        id: "r-old",
        studio_id: "s-a",
        campaign_id: "c-old",
        family_id: "f-1",
        status: "confirmed",
        note: null,
      },
      {
        id: "r-other",
        studio_id: "s-a",
        campaign_id: "c-1",
        family_id: "f-2",
        status: "awaiting",
        note: null,
      },
    ],
  });

  it("lists only this family's renewals for terms that haven't ended", async () => {
    const list = await listFamilyRenewals(fake(tables()), ctx, NOW);
    expect(list.map((r) => r.id)).toEqual(["r-1"]);
    expect(list[0]).toMatchObject({
      termName: "Term 1 2027",
      deadline: "2027-01-20",
      status: "awaiting",
    });
  });

  it("saves an answer once; a second tap changes nothing", async () => {
    const db = tables();
    const first = await answerFamilyRenewal(
      fake(db),
      ctx,
      "user-1",
      { responseId: "r-1", status: "confirmed", note: "" },
      NOW,
    );
    expect(first.changed).toBe(true);
    expect(first.renewal.status).toBe("confirmed");
    expect(db.renewal_response[0]).toMatchObject({
      responded_by: "family",
      responded_by_user: "user-1",
    });
    const again = await answerFamilyRenewal(
      fake(db),
      ctx,
      "user-1",
      { responseId: "r-1", status: "declined", note: "" },
      NOW,
    );
    expect(again.changed).toBe(false);
    expect(again.renewal.status).toBe("confirmed");
  });

  it("can't answer for another family, and needs a note to ask for a change", async () => {
    const db = tables();
    await expect(
      answerFamilyRenewal(
        fake(db),
        ctx,
        "user-1",
        { responseId: "r-other", status: "confirmed", note: "" },
        NOW,
      ),
    ).rejects.toThrow();
    expect(db.renewal_response[2]!.status).toBe("awaiting");
    await expect(
      answerFamilyRenewal(
        fake(db),
        ctx,
        "user-1",
        { responseId: "r-1", status: "change_requested", note: "" },
        NOW,
      ),
    ).rejects.toThrow();
  });
});
