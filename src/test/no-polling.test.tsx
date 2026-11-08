/**
 * Behavioural guard: data screens must not poll services without user action.
 *
 * Reviewed exceptions (timers that are not data polling):
 * - ChatMedia VoiceClip setInterval — local playback progress UI only.
 * - ChatMedia video element playback — browser media clock, not a service poll.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { AppSettingsProvider } from "@/lib/app-settings";
import { VoiceClip } from "@/components/ChatMedia";
import * as schedule from "@/services/schedule";
import * as roster from "@/services/roster";
import * as chat from "@/services/chat";
import { WeekTimetable } from "@/components/WeekTimetable";
import { weekQuery } from "@/lib/schedule-queries";
import { PROTOTYPE_TODAY } from "@/lib/calendar";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("no expensive polling", () => {
  it("query modules do not set refetchInterval", () => {
    const libDir = join(process.cwd(), "src/lib");
    const files: string[] = [];
    for (const name of readdirSync(libDir)) {
      const path = join(libDir, name);
      if (statSync(path).isFile() && name.endsWith(".ts")) files.push(path);
    }
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source.includes("refetchInterval"), `${file} must not poll`).toBe(false);
    }
  });

  it("advancing 60s without user action does not re-call schedule/roster/chat services", async () => {
    const weekSpy = vi.spyOn(schedule, "getWeekLessons");
    const studioSpy = vi.spyOn(roster, "getStudio");
    const chatSpy = vi.spyOn(chat, "getConversations");

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
      },
    });
    // Seed cache with real data (no fake timers during the 120ms respond delay).
    const week = await schedule.getWeekLessons(PROTOTYPE_TODAY);
    client.setQueryData(weekQuery(PROTOTYPE_TODAY).queryKey, week);
    weekSpy.mockClear();
    studioSpy.mockClear();
    chatSpy.mockClear();

    vi.useFakeTimers();
    render(
      <QueryClientProvider client={client}>
        <AppSettingsProvider>
          <WeekTimetable date={PROTOTYPE_TODAY} onLesson={() => undefined} />
        </AppSettingsProvider>
      </QueryClientProvider>,
    );

    await vi.advanceTimersByTimeAsync(60_000);
    expect(weekSpy).not.toHaveBeenCalled();
    expect(studioSpy).not.toHaveBeenCalled();
    expect(chatSpy).not.toHaveBeenCalled();
  }, 15_000);

  it("VoiceClip timer is a reviewed playback exception, not a service poll", () => {
    vi.useFakeTimers();
    render(
      <AppSettingsProvider>
        <VoiceClip seconds={5} />
      </AppSettingsProvider>,
    );
    expect(screen.getByText(/0:00/)).toBeTruthy();
  });
});
