import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resetStudioWorkspaceForTests, setStudioWorkspace } from "@/lib/studio-workspace";
import { TaskList } from "@/components/LiveLessonTasks";
import { LiveParentAssignments } from "@/components/LiveParentAssignments";
import { familyPortalState } from "@/services/live/family-store";
import { getParentSession } from "@/services/parent";
import type { LiveAssignment } from "@/lib/live-assignments";

afterEach(() => {
  cleanup();
  resetStudioWorkspaceForTests();
  familyPortalState.assignments = [];
});

const wrap = (node: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
);

const assignment = (studentId: string): LiveAssignment => ({
  id: "a-1",
  studentId,
  occurrenceKey: "ser_2026-11-24",
  lessonDate: "2026-11-24",
  dueDate: "2026-11-30",
  markedAt: null,
  createdAt: "2026-11-24T05:00:00Z",
  tasks: [
    {
      id: "t-1",
      position: 0,
      text: "C major scale",
      minutesPerDay: 10,
      daysPerWeek: 5,
      courseItemId: null,
      attachmentTitle: "Scale sheet",
      attachmentUrl: "https://example.com/s.pdf",
      doneAt: "2026-11-25T08:00:00Z",
      doneBy: "parent",
      practiceLogId: "p-1",
      mark: "done_well",
      markComment: "Lovely and even",
      markedAt: "2026-12-01T05:00:00Z",
    },
    {
      id: "t-2",
      position: 1,
      text: "Minuet bars 1-8",
      minutesPerDay: 15,
      daysPerWeek: 4,
      courseItemId: null,
      attachmentTitle: null,
      attachmentUrl: null,
      doneAt: null,
      doneBy: null,
      practiceLogId: null,
      mark: null,
      markComment: null,
      markedAt: null,
    },
  ],
});

describe("practice task screens on real studios", () => {
  it("shows the teacher each task's tick, mark and comment", () => {
    render(<TaskList assignment={assignment("kid-1")} />);
    expect(screen.getByText("C major scale")).toBeTruthy();
    expect(screen.getByText(/Done well/)).toBeTruthy();
    expect(screen.getByText("Lovely and even")).toBeTruthy();
    expect(screen.getByText(/Not ticked off yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Scale sheet" }).getAttribute("href")).toBe(
      "https://example.com/s.pdf",
    );
  });

  it("shows families their tasks with marks, and nothing when none are set", async () => {
    setStudioWorkspace({ mode: "live", studioId: "studio-1", role: "guardian" } as never);
    const { container, unmount } = render(wrap(<LiveParentAssignments />));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.innerHTML).toBe("");
    unmount();

    const { children } = await getParentSession();
    familyPortalState.assignments = [assignment(children[0]!.id)];
    render(wrap(<LiveParentAssignments />));
    expect(await screen.findByText("Practice tasks")).toBeTruthy();
    expect(screen.getByText(/Teacher’s mark: Done well/)).toBeTruthy();
    expect(screen.getByText("Lovely and even")).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes[0]!.checked).toBe(true);
    expect(boxes[0]!.disabled).toBe(true);
    expect(boxes[1]!.disabled).toBe(false);
  });
});
