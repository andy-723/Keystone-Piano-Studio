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
    ...overrides,
  } as CalendarLesson;
}

describe("Today page for a real studio", () => {
  it("uses the real date, shows only that day's calendar lessons, and has no attendance buttons", () => {
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
    expect(screen.getByText("2 lessons")).toBeTruthy();
    expect(screen.getByText("Cancelled this week.")).toBeTruthy();
    expect(screen.queryByText("Other Day")).toBeNull();
    expect(screen.queryByRole("button", { name: /attended|absent/i })).toBeNull();
  });
});
