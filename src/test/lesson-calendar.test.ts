import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  expandLessons,
  findClashes,
  googleLessonTitle,
  googleSeriesEvent,
  googleSeriesEventId,
  mondayOf,
  zonedToUtc,
  type LessonSeries,
} from "@/lib/lesson-calendar";
import { resetMockMemberships } from "@/server/authz";
import { resetMockSubscriptions } from "@/server/subscription-store";
import {
  createDemoCalendarStore,
  createMemoryCalendarStore,
  DEMO_CALENDAR_STUDIO,
  setCalendarStoreForTests,
} from "@/server/calendar-store";
import { weeklySlots } from "@/mocks/data";
import {
  addLesson,
  cancelOneLesson,
  changeFromWeek,
  deleteLessons,
  disconnectGoogle,
  endWeeklyLessons,
  finishGoogleConnect,
  getCalendarWeek,
  moveOneLesson,
  restoreOneLesson,
  startGoogleConnect,
  DEMO_CALENDAR_ACTOR,
  type CalendarActor,
} from "@/server/calendar";
import { createOAuthState, readOAuthState, setGoogleFetchForTests } from "@/server/google-calendar";

const STUDIO_A = "studio-a";
const STUDIO_B = "studio-b";
const owner: CalendarActor = { userId: "owner-a", aal: "aal2" };
const teacher: CalendarActor = { userId: "teacher-a", aal: "aal2" };
const outsider: CalendarActor = { userId: "owner-b", aal: "aal2" };

const series = (patch: Partial<LessonSeries> = {}): LessonSeries => ({
  id: "11111111-2222-3333-4444-555555555555",
  studioId: STUDIO_A,
  studentId: "stu-1",
  teacherUserId: "owner-a",
  repeat: "weekly",
  firstDate: "2026-11-17", // Tuesday
  untilDate: null,
  startTime: "16:00",
  durationMin: 30,
  location: null,
  note: null,
  googleSyncStatus: "off",
  googleSyncError: null,
  ...patch,
});

describe("lesson rules", () => {
  it("repeats weekly from the first date and stops at the last date", () => {
    const s = series({ untilDate: "2026-12-01" });
    const dates = expandLessons([s], [], "2026-11-01", "2026-12-31").map((o) => o.date);
    expect(dates).toEqual(["2026-11-17", "2026-11-24", "2026-12-01"]);
  });

  it("shows cancelled weeks greyed and moved weeks at the new time, even across weeks", () => {
    const s = series();
    const occurrences = expandLessons(
      [s],
      [
        {
          id: "x1",
          studioId: STUDIO_A,
          seriesId: s.id,
          originalDate: "2026-11-24",
          action: "cancel",
          newDate: null,
          newStartTime: null,
        },
        {
          id: "x2",
          studioId: STUDIO_A,
          seriesId: s.id,
          originalDate: "2026-12-01",
          action: "move",
          newDate: "2026-11-28",
          newStartTime: "10:00",
        },
      ],
      "2026-11-23",
      "2026-11-29",
    );
    expect(occurrences.map((o) => [o.date, o.startTime, o.status])).toEqual([
      ["2026-11-24", "16:00", "cancelled"],
      ["2026-11-28", "10:00", "moved"],
    ]);
  });

  it("finds clashes for the same teacher only, ignoring cancelled lessons", () => {
    const occ = expandLessons(
      [series(), series({ id: "other", teacherUserId: "teacher-a" })],
      [],
      "2026-11-17",
      "2026-11-17",
    );
    expect(
      findClashes(occ, {
        teacherUserId: "owner-a",
        date: "2026-11-17",
        startTime: "16:15",
        durationMin: 30,
      }),
    ).toHaveLength(1);
    expect(
      findClashes(occ, {
        teacherUserId: "owner-a",
        date: "2026-11-17",
        startTime: "16:30",
        durationMin: 30,
      }),
    ).toHaveLength(0);
  });

  it("converts studio-local times across daylight saving", () => {
    expect(zonedToUtc("2026-07-14", "16:00", "Australia/Melbourne").toISOString()).toBe(
      "2026-07-14T06:00:00.000Z",
    );
    expect(zonedToUtc("2026-11-17", "16:00", "Australia/Melbourne").toISOString()).toBe(
      "2026-11-17T05:00:00.000Z",
    );
    expect(mondayOf("2026-11-22")).toBe("2026-11-16");
  });

  it("builds a Google recurring event with EXDATEs and a valid base32hex id", () => {
    const s = series({ untilDate: "2026-12-15", location: "Studio" });
    const event = googleSeriesEvent({
      series: s,
      exceptions: [
        {
          id: "x1",
          studioId: STUDIO_A,
          seriesId: s.id,
          originalDate: "2026-11-24",
          action: "cancel",
          newDate: null,
          newStartTime: null,
        },
      ],
      student: { firstName: "Edison", lastName: "Phan" },
      timeZone: "Australia/Melbourne",
      appUrl: "https://app.example",
    });
    expect(event.id).toBe(googleSeriesEventId(s.id));
    expect(event.id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(event.summary).toBe("Piano lesson: Edison P.");
    expect(event.start).toEqual({
      dateTime: "2026-11-17T16:00:00",
      timeZone: "Australia/Melbourne",
    });
    expect(event.end.dateTime).toBe("2026-11-17T16:30:00");
    expect(event.recurrence).toEqual([
      "RRULE:FREQ=WEEKLY;UNTIL=20261215T050000Z",
      "EXDATE;TZID=Australia/Melbourne:20261124T160000",
    ]);
    expect(googleLessonTitle({ firstName: "Mia", lastName: "" })).toBe("Piano lesson: Mia");
  });
});

describe("calendar server (memory store)", () => {
  let store: ReturnType<typeof createMemoryCalendarStore>;
  beforeEach(() => {
    process.env["GOOGLE_CALENDAR_CLIENT_ID"] = "client-id";
    process.env["GOOGLE_CALENDAR_CLIENT_SECRET"] = "client-secret";
    resetMockSubscriptions();
    resetMockMemberships([
      { userId: "owner-a", studioId: STUDIO_A, role: "owner" },
      { userId: "teacher-a", studioId: STUDIO_A, role: "teacher" },
      { userId: "owner-b", studioId: STUDIO_B, role: "owner" },
    ]);
    store = createMemoryCalendarStore({
      students: {
        [STUDIO_A]: [
          { id: "stu-1", firstName: "Edison", lastName: "Phan", familyName: "Phan family" },
          { id: "stu-2", firstName: "Mia", lastName: "Chen", familyName: "Chen family" },
        ],
        [STUDIO_B]: [{ id: "stu-b", firstName: "Other", lastName: "Kid", familyName: null }],
      },
    });
    setCalendarStoreForTests(store);
  });
  afterEach(() => {
    setCalendarStoreForTests(null);
    setGoogleFetchForTests(null);
    resetMockMemberships();
    delete process.env["GOOGLE_CALENDAR_CLIENT_ID"];
    delete process.env["GOOGLE_CALENDAR_CLIENT_SECRET"];
  });

  const weekly = {
    studentId: "stu-1",
    date: "2026-11-17",
    startTime: "16:00",
    durationMin: 30,
    repeat: "weekly" as const,
  };

  it("adds a weekly lesson and shows it every week", async () => {
    await addLesson(owner, STUDIO_A, weekly);
    const week = await getCalendarWeek(owner, STUDIO_A, "2026-12-03");
    expect(week.weekStart).toBe("2026-11-30");
    expect(week.lessons.map((l) => [l.date, l.studentName])).toEqual([
      ["2026-12-01", "Edison Phan"],
    ]);
  });

  it("refuses clashes for the same teacher unless saved anyway", async () => {
    await addLesson(owner, STUDIO_A, weekly);
    await expect(
      addLesson(owner, STUDIO_A, {
        ...weekly,
        studentId: "stu-2",
        date: "2026-12-08",
        startTime: "16:15",
      }),
    ).rejects.toThrow(/clashes with Edison Phan/);
    await expect(
      addLesson(owner, STUDIO_A, {
        ...weekly,
        studentId: "stu-2",
        date: "2026-12-08",
        startTime: "16:15",
        allowClash: true,
      }),
    ).resolves.toBeTruthy();
    // A different teacher in the same studio can teach at the same time.
    await expect(
      addLesson(teacher, STUDIO_A, { ...weekly, studentId: "stu-2" }),
    ).resolves.toBeTruthy();
  });

  it("keeps studios apart", async () => {
    await expect(addLesson(owner, STUDIO_A, { ...weekly, studentId: "stu-b" })).rejects.toThrow(
      /not in this studio/,
    );
    const created = await addLesson(owner, STUDIO_A, weekly);
    await expect(getCalendarWeek(outsider, STUDIO_A, "2026-11-17")).rejects.toThrow();
    await expect(
      cancelOneLesson(outsider, STUDIO_B, { seriesId: created.id, originalDate: "2026-11-24" }),
    ).rejects.toThrow(/changed or removed/);
  });

  it("moves, cancels and restores one week without touching the others", async () => {
    const s = await addLesson(owner, STUDIO_A, weekly);
    const moved = await moveOneLesson(owner, STUDIO_A, {
      seriesId: s.id,
      originalDate: "2026-11-24",
      newDate: "2026-11-26",
      newStartTime: "17:00",
    });
    await cancelOneLesson(owner, STUDIO_A, { seriesId: s.id, originalDate: "2026-12-01" });
    let week = await getCalendarWeek(owner, STUDIO_A, "2026-11-24");
    expect(week.lessons.map((l) => [l.date, l.startTime, l.status])).toEqual([
      ["2026-11-26", "17:00", "moved"],
    ]);
    await restoreOneLesson(owner, STUDIO_A, { exceptionId: moved.id });
    week = await getCalendarWeek(owner, STUDIO_A, "2026-11-24");
    expect(week.lessons.map((l) => [l.date, l.startTime, l.status])).toEqual([
      ["2026-11-24", "16:00", "scheduled"],
    ]);
    week = await getCalendarWeek(owner, STUDIO_A, "2026-12-01");
    expect(week.lessons[0]?.status).toBe("cancelled");
  });

  it("changes the weekly time from a given week and keeps earlier weeks", async () => {
    const s = await addLesson(owner, STUDIO_A, weekly);
    await changeFromWeek(owner, STUDIO_A, {
      seriesId: s.id,
      fromDate: "2026-12-01",
      newDate: "2026-12-03",
      startTime: "15:00",
      durationMin: 45,
    });
    const before = await getCalendarWeek(owner, STUDIO_A, "2026-11-24");
    const after = await getCalendarWeek(owner, STUDIO_A, "2026-12-08");
    expect(before.lessons.map((l) => [l.date, l.startTime])).toEqual([["2026-11-24", "16:00"]]);
    expect(after.lessons.map((l) => [l.date, l.startTime, l.durationMin])).toEqual([
      ["2026-12-10", "15:00", 45],
    ]);
  });

  it("stops weekly lessons after a date and deletes a series", async () => {
    const s = await addLesson(owner, STUDIO_A, weekly);
    await endWeeklyLessons(owner, STUDIO_A, { seriesId: s.id, lastDate: "2026-11-24" });
    expect((await getCalendarWeek(owner, STUDIO_A, "2026-12-01")).lessons).toHaveLength(0);
    expect((await getCalendarWeek(owner, STUDIO_A, "2026-11-24")).lessons).toHaveLength(1);
    await deleteLessons(owner, STUDIO_A, { seriesId: s.id });
    expect((await getCalendarWeek(owner, STUDIO_A, "2026-11-17")).lessons).toHaveLength(0);
  });

  it("signs the Google state to the Keystone user and rejects tampering", async () => {
    const state = await createOAuthState({ userId: "owner-a", studioId: STUDIO_A });
    expect(await readOAuthState(state)).toEqual({ userId: "owner-a", studioId: STUDIO_A });
    await expect(readOAuthState(`${state}x`)).rejects.toThrow(/isn't valid/);
    const [payload] = state.split(".");
    const forged = Buffer.from(
      JSON.stringify({ u: "owner-b", s: STUDIO_A, e: Date.now() + 60000 }),
    ).toString("base64url");
    await expect(readOAuthState(`${forged}.${state.split(".")[1]}`)).rejects.toThrow(/isn't valid/);
    expect(payload).toBeTruthy();
    const old = await createOAuthState(
      { userId: "owner-a", studioId: STUDIO_A },
      Date.now() - 11 * 60 * 1000,
    );
    await expect(readOAuthState(old)).rejects.toThrow(/expired/);
  });

  it("connects Google, pushes lessons one way and stops on disconnect", async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    setGoogleFetchForTests(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string" && init.body.startsWith("{")
          ? JSON.parse(init.body)
          : undefined;
      calls.push({ method, url, body });
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        const idToken = `x.${Buffer.from(JSON.stringify({ email: "teacher@gmail.com" })).toString("base64url")}.y`;
        return Response.json({
          access_token: "at",
          refresh_token: "rt",
          expires_in: 3600,
          id_token: idToken,
          scope: "openid email https://www.googleapis.com/auth/calendar.app.created",
        });
      }
      if (url.endsWith("/calendars") && method === "POST") return Response.json({ id: "cal-1" });
      if (method === "PUT") return new Response(null, { status: 404 });
      return Response.json({});
    });

    const s = await addLesson(owner, STUDIO_A, weekly);
    expect(calls).toHaveLength(0); // not connected yet: nothing leaves Keystone

    const { url } = await startGoogleConnect(owner, STUDIO_A);
    const state = new URL(url).searchParams.get("state") ?? "";
    expect(new URL(url).searchParams.get("scope")).toContain("calendar.app.created");
    await expect(finishGoogleConnect(teacher, { code: "c", state })).rejects.toThrow(
      /another Keystone sign-in/,
    );

    const done = await finishGoogleConnect(owner, { code: "c", state });
    expect(done).toMatchObject({ email: "teacher@gmail.com", synced: 1 });
    const inserted = calls.find(
      (c) => c.method === "POST" && c.url.includes("/calendars/cal-1/events"),
    );
    expect(inserted?.body).toMatchObject({
      id: googleSeriesEventId(s.id),
      summary: "Piano lesson: Edison P.",
    });

    calls.length = 0;
    await cancelOneLesson(owner, STUDIO_A, { seriesId: s.id, originalDate: "2026-11-24" });
    const put = calls.find((c) => c.method === "PUT");
    expect((put?.body as { recurrence: string[] }).recurrence).toContain(
      "EXDATE;TZID=Australia/Melbourne:20261124T160000",
    );
    expect(
      (await getCalendarWeek(owner, STUDIO_A, "2026-11-17")).lessons[0]?.googleSyncStatus,
    ).toBe("synced");

    calls.length = 0;
    await disconnectGoogle(owner, STUDIO_A);
    expect(calls.some((c) => c.url.startsWith("https://oauth2.googleapis.com/revoke"))).toBe(true);
    calls.length = 0;
    await moveOneLesson(owner, STUDIO_A, {
      seriesId: s.id,
      originalDate: "2026-12-01",
      newDate: "2026-12-02",
      newStartTime: "16:00",
    });
    expect(calls).toHaveLength(0);
  });

  it("keeps the lesson change when Google fails, and marks it for retry", async () => {
    setGoogleFetchForTests(async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://oauth2.googleapis.com/token"))
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      return init?.method === "POST" ? Response.json({ id: "cal-1" }) : Response.json({});
    });
    await store.saveConnection({
      studioId: STUDIO_A,
      userId: "owner-a",
      accountEmail: "t@gmail.com",
      calendarId: "cal-1",
      refreshToken: "rt",
    });
    await addLesson(owner, STUDIO_A, weekly);
    const week = await getCalendarWeek(owner, STUDIO_A, "2026-11-17");
    expect(week.lessons).toHaveLength(1);
    expect(week.lessons[0]?.googleSyncStatus).toBe("error");
    expect(week.google.needsReconnect).toBe(true);
  });
});

describe("demo studio calendar", () => {
  afterEach(() => setCalendarStoreForTests(null));

  it("fills the demo week from the demo timetable and lets the demo teacher add lessons", async () => {
    const store = createDemoCalendarStore("2026-11-11");
    setCalendarStoreForTests(store);
    const week = await getCalendarWeek(DEMO_CALENDAR_ACTOR, DEMO_CALENDAR_STUDIO, "2026-11-11");
    expect(week.weekStart).toBe("2026-11-09");
    expect(week.lessons.length).toBe(weeklySlots.length);
    expect(week.students.length).toBeGreaterThan(0);
    expect(week.google).toMatchObject({ demo: true, configured: false });
    const byStart = [...week.lessons].sort((a, b) =>
      `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`),
    );
    byStart.forEach((lesson, i) => {
      const next = byStart[i + 1];
      if (!next || next.date !== lesson.date) return;
      const [h, m] = lesson.startTime.split(":").map(Number);
      const end = (h ?? 0) * 60 + (m ?? 0) + lesson.durationMin;
      const [nh, nm] = next.startTime.split(":").map(Number);
      expect((nh ?? 0) * 60 + (nm ?? 0)).toBeGreaterThanOrEqual(end);
    });
    const first = week.lessons.find((l) => l.date === "2026-11-09");
    expect(first?.startTime).toBe("15:30");

    const student = week.students[0]!;
    await addLesson(DEMO_CALENDAR_ACTOR, DEMO_CALENDAR_STUDIO, {
      studentId: student.id,
      date: "2026-11-11",
      startTime: "07:00",
      durationMin: 30,
      repeat: "once",
    });
    const after = await getCalendarWeek(DEMO_CALENDAR_ACTOR, DEMO_CALENDAR_STUDIO, "2026-11-11");
    expect(after.lessons.length).toBe(weeklySlots.length + 1);
  });

  it("never lets the demo actor touch a real studio", async () => {
    setCalendarStoreForTests(createDemoCalendarStore("2026-11-11"));
    await expect(getCalendarWeek(DEMO_CALENDAR_ACTOR, STUDIO_A, "2026-11-11")).rejects.toThrow(
      /permission/,
    );
    await expect(startGoogleConnect(DEMO_CALENDAR_ACTOR, DEMO_CALENDAR_STUDIO)).rejects.toThrow(
      /signed-in studio/,
    );
  });
});
