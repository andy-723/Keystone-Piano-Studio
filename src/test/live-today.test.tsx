import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LiveToday } from "@/components/LiveToday";
import { calendarWeekKey } from "@/components/LessonCalendar";
import { resetStudioWorkspaceForTests, setStudioWorkspace } from "@/lib/studio-workspace";
import { studioToday } from "@/lib/studio-clock";
import { PROTOTYPE_TODAY } from "@/lib/calendar";
import type { CalendarLesson, CalendarWeek } from "@/server/calendar";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/StudioNews", () => ({ LatestNews: () => null }));

afterEach(() => {
  cleanup();
  resetStudioWorkspaceForTests();
});

function lesson(overrides: Partial<CalendarLesson>): CalendarLesson {
  return {
    key: "s1_x",
    seriesId: "s1",
    studentId: "st1",
    teacherUserId: "t1",
    repeat: "weekly",
    originalDate: "x",
    date: "x",
    startTime: "15:30",
    durationMin: 30,
    status: "scheduled",
    exceptionId: null,
    studentName: "Ava Lee",
    location: null,
    note: null,
    untilDate: null,
    firstDate: "2026-01-01",
    googleSyncStatus: "off",
    googleSyncError: null,
    attendance: null,
    makeUp: false,
    ...overrides,
  } as CalendarLesson;
}

describe("Today page for a real studio", () => {
  it("uses the real date, shows only that day's calendar lessons, and offers attendance marks", () => {
    setStudioWorkspace({ mode: "live", studioId: "studio-1", role: "owner" } as never);
    const today = studioToday();
    expect(today).not.toBe(PROTOTYPE_TODAY);
    const week: CalendarWeek = {
      studioId: "studio-1",
      weekStart: today,
      today,
      timeZone: "Australia/Melbourne",
      students: [],
      google: {
        configured: false,
        connected: false,
        needsReconnect: false,
        email: null,
        lastSyncedAt: null,
        lastError: null,
      },
      lessonRules: { cancelNoticeHours: 24, makeUpAllowance: "1 per term" },
      credits: {},
      lessons: [
        lesson({ key: "a", date: today, startTime: "16:00", studentName: "Ben Ng" }),
        lesson({ key: "b", date: today, startTime: "15:30", studentName: "Ava Lee" }),
        lesson({ key: "c", date: "2000-01-01", studentName: "Other Day" }),
        lesson({
          key: "d",
          date: today,
          startTime: "17:00",
          studentName: "Cara Wu",
          status: "cancelled",
        }),
      ],
    };
    const client = new QueryClient();
    client.setQueryData(calendarWeekKey(today), week);
    render(
      <QueryClientProvider client={client}>
        <LiveToday />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Today")).toBeTruthy();
    const names = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual(["Ava Lee", "Ben Ng", "Cara Wu"]);
    expect(screen.getByText("2 lessons · 2 not marked")).toBeTruthy();
    expect(screen.getByText("Cancelled this week.")).toBeTruthy();
    expect(screen.queryByText("Other Day")).toBeNull();
    expect(screen.getByRole("button", { name: "Mark Ava Lee attended" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark all 2 attended" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record who cancelled" })).toBeTruthy();
  });

  it("shows a saved mark, its credit and a make-up lesson", () => {
    setStudioWorkspace({ mode: "live", studioId: "studio-1", role: "owner" } as never);
    const today = studioToday();
    const week = {
      studioId: "studio-1",
      weekStart: today,
      today,
      timeZone: "Australia/Melbourne",
      students: [],
      google: {
        configured: false,
        connected: false,
        needsReconnect: false,
        email: null,
        lastSyncedAt: null,
        lastError: null,
      },
      lessonRules: { cancelNoticeHours: 24, makeUpAllowance: "1 per term" },
      credits: {},
      lessons: [
        lesson({ key: "a", date: today, attendance: { status: "attended", credit: false } }),
        lesson({
          key: "b",
          date: today,
          studentName: "Ben Ng",
          startTime: "16:30",
          status: "cancelled",
          attendance: { status: "cancelled_by_studio", credit: true },
        }),
        lesson({ key: "c", date: today, studentName: "Cara Wu", startTime: "17:00", makeUp: true }),
      ],
    } satisfies CalendarWeek;
    const client = new QueryClient();
    client.setQueryData(calendarWeekKey(today), week);
    render(
      <QueryClientProvider client={client}>
        <LiveToday />
      </QueryClientProvider>,
    );
    expect(screen.getByText("2 lessons · 1 not marked")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Change" })).toHaveLength(2);
    expect(screen.getByText("Cancelled by studio · make-up credit")).toBeTruthy();
    expect(screen.getByText("Make-up lesson.")).toBeTruthy();
    // One unmarked lesson: no "Mark all" button.
    expect(screen.queryByRole("button", { name: /Mark all/ })).toBeNull();
  });
});

describe("Marking a lesson", () => {
  it("asks what happened and pre-ticks the credit only where the studio agreed", async () => {
    const { fireEvent } = await import("@testing-library/react");
    const { AttendanceMarker } = await import("@/components/AttendanceMarker");
    const today = studioToday();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AttendanceMarker
          lesson={lesson({ key: "a", date: today, studentName: "Ava Lee" })}
          today={today}
          rules={{ cancelNoticeHours: 48, makeUpAllowance: "2 per term" }}
          credits={{ balance: 0, earnedRecently: 1 }}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Absent or cancelled…" }));
    expect(screen.getByText("What happened?")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Family cancelled with notice/));
    const credit = () => screen.getByRole("checkbox") as HTMLInputElement;
    expect(credit().checked).toBe(true);
    expect(screen.getByText(/Ava has earned 1 make-up credit in the last 90 days/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Family cancelled late/));
    expect(credit().checked).toBe(false);
    expect(screen.getByLabelText(/goodwill/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Cancelled by studio/));
    expect(credit().checked).toBe(true);
    expect(credit().disabled).toBe(true);
  });

  it("offers only cancellations for a future lesson", async () => {
    const { fireEvent } = await import("@testing-library/react");
    const { AttendanceMarker } = await import("@/components/AttendanceMarker");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AttendanceMarker
          lesson={lesson({ key: "a", date: "2999-01-01" })}
          today={studioToday()}
          rules={{ cancelNoticeHours: 24, makeUpAllowance: "1 per term" }}
          credits={undefined}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark as cancelled" }));
    expect(screen.getByText("Who cancelled?")).toBeTruthy();
    expect(screen.queryByLabelText("Attended")).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });
});
