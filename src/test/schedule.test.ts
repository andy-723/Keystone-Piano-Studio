import { describe, expect, it } from "vitest";
import { melbourneIso } from "@/lib/calendar";
import { formatTime } from "@/lib/format";
import { getDayLessons } from "@/services/schedule";

describe("lesson times across daylight saving", () => {
  it("uses +11:00 during daylight saving and +10:00 after it ends on 4 April 2027", () => {
    expect(melbourneIso("2027-02-08", "15:30")).toBe("2027-02-08T15:30:00+11:00");
    expect(melbourneIso("2027-04-12", "15:30")).toBe("2027-04-12T15:30:00+10:00");
  });

  it("shows Monday 12 April 2027 at 3:30 pm as 3:30 pm", async () => {
    const day = await getDayLessons("2027-04-12");
    const first = day.lessons[0]!;
    expect(first.startsAt).toBe("2027-04-12T15:30:00+10:00");
    expect(formatTime(first.startsAt)).toBe("3:30 pm");
  });
});
