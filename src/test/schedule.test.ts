import { describe, expect, it } from "vitest";
import { melbourneIso } from "@/lib/calendar";
import { formatTime } from "@/lib/format";
import { getDayLessons, getTodayLessons, markAttendance } from "@/services/schedule";

describe("lesson times across daylight saving", () => {
  it("uses +11:00 during daylight saving and +10:00 after it ends on 4 April 2027", () => {
    expect(melbourneIso("2027-02-08", "15:30")).toBe("2027-02-08T15:30:00+11:00");
    expect(melbourneIso("2027-04-12", "15:30")).toBe("2027-04-12T15:30:00+10:00");
  });

  it("shows Monday 12 April 2027 at 3:30 pm as 3:30 pm", async () => {
    const day = await getDayLessons("2027-04-12");
    const first = day.lessons[0];
    expect(first?.startsAt).toBe("2027-04-12T15:30:00+10:00");
    expect(formatTime(first?.startsAt ?? "")).toBe("3:30 pm");
  });
});

describe("teacher day-book", () => {
  it("gets today's sample lessons in chronological order", async () => {
    const plan = await getTodayLessons();
    expect(plan.date).toBe("2027-03-15");
    expect(plan.lessons).toHaveLength(5);
    const times = plan.lessons.map((lesson) => lesson.startsAt);
    expect(times).toEqual([...times].sort());
  });

  it.each(["attended", "absent", "cancelled_by_studio", "cancelled_late"] as const)("stores %s immediately and supports undo", async (status) => {
    const id = "stu-1_2027-03-15";
    const marking = markAttendance(id, status);
    const reading = getTodayLessons();
    expect((await reading).lessons.find((lesson) => lesson.id === id)?.status).toBe(status);
    expect(await marking).toBe(status);
    await markAttendance(id, "scheduled");
    expect((await getTodayLessons()).lessons.find((lesson) => lesson.id === id)?.status).toBe("scheduled");
  });

  it("skips public holidays", async () => {
    const plan = await getDayLessons("2027-03-08");
    expect(plan.day).toEqual({ kind: "holiday", name: "Labour Day" });
    expect(plan.lessons).toHaveLength(0);
  });

  it("skips breaks between terms", async () => {
    const plan = await getDayLessons("2027-04-05");
    expect(plan.day).toEqual({ kind: "break" });
    expect(plan.lessons).toHaveLength(0);
  });
});
