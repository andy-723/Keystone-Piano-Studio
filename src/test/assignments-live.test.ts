import { describe, expect, it } from "vitest";
import {
  assignmentChatBody,
  assignmentProblem,
  assignmentToMark,
  familyPracticeDeleteProblem,
  familySafeAssignment,
  fullyMarked,
  marksProblem,
  safeAttachmentUrl,
  toAssignment,
  type AssignmentRow,
  type LiveAssignment,
  type TaskRow,
} from "@/lib/live-assignments";
import { completeFamilyTask, deleteFamilyPractice } from "@/server/family-assignments";
import type { FamilyContext } from "@/server/family-portal";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Stand-in for the Supabase query builder with the filters and writes these functions use. */
function fake(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: any) => boolean> = [];
      let patch: any = null;
      let remove = false;
      const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
      const embed = (row: any) =>
        table === "assignment"
          ? {
              ...row,
              assignment_task: (tables["assignment_task"] ?? []).filter(
                (t) => t.assignment_id === row.id,
              ),
            }
          : row;
      const run = () => {
        const hit = rows();
        if (patch) for (const row of hit) Object.assign(row, patch);
        if (remove) tables[table] = (tables[table] ?? []).filter((row) => !hit.includes(row));
        return hit.map(embed);
      };
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
        in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), q),
        is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), q),
        gte: (k: string, v: string) => (filters.push((r) => r[k] >= v), q),
        order: () => q,
        limit: () => q,
        update: (value: any) => ((patch = value), q),
        delete: () => ((remove = true), q),
        insert: (row: any) => {
          const saved = { id: `new-${(tables[table] ?? []).length + 1}`, ...row };
          (tables[table] ??= []).push(saved);
          filters.push((r) => r === saved);
          return q;
        },
        single: async () => ({ data: run()[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: run(), error: null }),
      };
      return q;
    },
  } as never;
}

const NOW = new Date("2026-12-01T01:00:00Z"); // Tue 1 Dec 2026 in Sydney
const ctx: FamilyContext = {
  studioId: "s-a",
  familyId: "f-1",
  childIds: ["kid-1"],
  timeZone: "Australia/Sydney",
};

function task(
  over: Partial<TaskRow> & { id: string; assignment_id?: string },
): TaskRow & { assignment_id: string; studio_id: string } {
  return {
    assignment_id: "a-1",
    studio_id: "s-a",
    position: 0,
    text: "Scales",
    minutes_per_day: 10,
    days_per_week: 5,
    course_item_id: "item-1",
    attachment_title: null,
    attachment_url: null,
    done_at: null,
    done_by: null,
    practice_log_id: null,
    mark: null,
    mark_comment: null,
    marked_at: null,
    ...over,
  };
}

function db() {
  return {
    assignment: [
      {
        id: "a-1",
        studio_id: "s-a",
        student_id: "kid-1",
        occurrence_key: "ser_2026-11-24",
        lesson_date: "2026-11-24",
        due_date: "2026-11-30",
        marked_at: null,
        created_at: "2026-11-24T05:00:00Z",
      },
      {
        id: "a-2",
        studio_id: "s-a",
        student_id: "kid-2",
        occurrence_key: "ser2_2026-11-24",
        lesson_date: "2026-11-24",
        due_date: "2026-11-30",
        marked_at: null,
        created_at: "2026-11-24T05:00:00Z",
      },
    ],
    assignment_task: [task({ id: "t-1" }), task({ id: "t-2", assignment_id: "a-2" })],
    practice_log: [
      {
        id: "p-own",
        studio_id: "s-a",
        student_id: "kid-1",
        practice_date: "2026-11-28",
        minutes: 20,
        logged_by: "parent",
      },
      {
        id: "p-teacher",
        studio_id: "s-a",
        student_id: "kid-1",
        practice_date: "2026-11-28",
        minutes: 30,
        logged_by: "teacher",
      },
      {
        id: "p-old",
        studio_id: "s-a",
        student_id: "kid-1",
        practice_date: "2026-10-01",
        minutes: 10,
        logged_by: "student",
      },
      {
        id: "p-other",
        studio_id: "s-a",
        student_id: "kid-2",
        practice_date: "2026-11-28",
        minutes: 10,
        logged_by: "parent",
      },
    ],
  };
}

const sample = (over: Partial<LiveAssignment> = {}): LiveAssignment => ({
  ...toAssignment({
    ...db().assignment[0],
    assignment_task: [task({ id: "t-1" }), task({ id: "t-3", position: 1, course_item_id: null })],
  } as AssignmentRow),
  ...over,
});

describe("practice task rules", () => {
  const draft = { id: "x", text: "Scales", minutesPerDay: 10, daysPerWeek: 5 };
  it("checks tasks before saving", () => {
    const base = { lessonDate: "2026-11-24", dueDate: "2026-11-30", tasks: [draft] };
    expect(assignmentProblem(base)).toBeNull();
    expect(assignmentProblem({ ...base, tasks: [] })).toMatch(/at least one/);
    expect(assignmentProblem({ ...base, tasks: [{ ...draft, text: " " }] })).toMatch(/title/);
    expect(assignmentProblem({ ...base, tasks: [{ ...draft, daysPerWeek: 8 }] })).toMatch(
      /1 and 7/,
    );
    expect(assignmentProblem({ ...base, tasks: [{ ...draft, minutesPerDay: 0 }] })).toMatch(/240/);
    expect(assignmentProblem({ ...base, tasks: [draft, draft] })).toMatch(/own id/);
    expect(assignmentProblem({ ...base, dueDate: "2026-11-20" })).toMatch(/on or after/);
    expect(assignmentProblem({ ...base, dueDate: "2027-03-01" })).toMatch(/60 days/);
    expect(
      assignmentProblem({ ...base, tasks: [{ ...draft, courseItemId: "nope" }] }, ["item-1"]),
    ).toMatch(/course/);
  });

  it("only sends https links to families", () => {
    expect(safeAttachmentUrl("https://example.com/a.pdf")).toBe("https://example.com/a.pdf");
    expect(safeAttachmentUrl("javascript:alert(1)")).toBeNull();
    expect(safeAttachmentUrl("http://example.com")).toBeNull();
    expect(safeAttachmentUrl(undefined)).toBeNull();
  });

  it("finds last lesson's unmarked tasks to mark", () => {
    const last = sample();
    const marked = sample({
      id: "old",
      lessonDate: "2026-11-17",
      markedAt: "2026-11-24T05:00:00Z",
    });
    expect(assignmentToMark([marked, last], "2026-12-01")?.id).toBe("a-1");
    expect(assignmentToMark([last], "2026-11-24")).toBeNull();
    expect(assignmentToMark([marked], "2026-12-01")).toBeNull();
  });

  it("checks marks and knows when every task is marked", () => {
    const a = sample();
    expect(marksProblem(a, [])).toMatch(/at least one/);
    expect(marksProblem(a, [{ taskId: "zzz", mark: "done_well" }])).toMatch(/isn't in/);
    expect(marksProblem(a, [{ taskId: "t-1", mark: "great" as never }])).toMatch(/Done well/);
    expect(
      marksProblem(a, [{ taskId: "t-1", mark: "done_well", comment: "x".repeat(1001) }]),
    ).toMatch(/1,000/);
    expect(fullyMarked(a, [{ taskId: "t-1", mark: "done_well" }])).toBe(false);
    expect(
      fullyMarked(a, [
        { taskId: "t-1", mark: "done_well" },
        { taskId: "t-3", mark: "needs_work" },
      ]),
    ).toBe(true);
  });

  it("gives families no course ids, and the chat message no child's name", () => {
    const safe = familySafeAssignment(sample());
    expect(JSON.stringify(safe)).not.toContain("item-1");
    expect(safe).not.toHaveProperty("occurrenceKey");
    const body = assignmentChatBody("2026-11-30", [
      { text: "Scales", minutesPerDay: 10, daysPerWeek: 5, attachmentTitle: "Sheet" },
    ]);
    expect(body).toBe("New practice tasks · due 2026-11-30\nScales: 5 days × 10 min · Sheet");
  });

  it("lets families delete only their own recent entries", () => {
    const today = "2026-12-01";
    expect(
      familyPracticeDeleteProblem(
        { student_id: "kid-1", logged_by: "parent", practice_date: "2026-11-28" },
        ["kid-1"],
        today,
      ),
    ).toBeNull();
    expect(
      familyPracticeDeleteProblem(
        { student_id: "kid-1", logged_by: "teacher", practice_date: "2026-11-28" },
        ["kid-1"],
        today,
      ),
    ).toMatch(/teacher/);
    expect(
      familyPracticeDeleteProblem(
        { student_id: "kid-2", logged_by: "parent", practice_date: "2026-11-28" },
        ["kid-1"],
        today,
      ),
    ).toMatch(/family/);
    expect(
      familyPracticeDeleteProblem(
        { student_id: "kid-1", logged_by: "student", practice_date: "2026-10-01" },
        ["kid-1"],
        today,
      ),
    ).toMatch(/30 days/);
  });
});

describe("family tick-off and practice delete (server)", () => {
  it("ticks a task, logs today's practice once, and refuses another family's task", async () => {
    const tables = db();
    const first = await completeFamilyTask(
      fake(tables),
      ctx,
      "u-1",
      { taskId: "t-1", minutes: 15 },
      NOW,
    );
    expect(first.log).toMatchObject({
      studentId: "kid-1",
      date: "2026-12-01",
      minutes: 15,
      assignmentTaskId: "t-1",
    });
    expect(tables.practice_log.at(-1)).toMatchObject({
      logged_by: "parent",
      logged_by_user_id: "u-1",
      studio_id: "s-a",
    });
    expect(tables.assignment_task[0]).toMatchObject({
      done_by: "parent",
      practice_log_id: first.log?.id,
    });
    expect(first.assignment.tasks[0]).not.toHaveProperty("courseItemId");

    const again = await completeFamilyTask(
      fake(tables),
      ctx,
      "u-1",
      { taskId: "t-1", minutes: 15 },
      NOW,
    );
    expect(again.log).toBeNull();
    expect(tables.practice_log.filter((row) => row.minutes === 15)).toHaveLength(1);

    await expect(
      completeFamilyTask(fake(tables), ctx, "u-1", { taskId: "t-2", minutes: 15 }, NOW),
    ).rejects.toThrow(/family/);
    await expect(
      completeFamilyTask(fake(tables), ctx, "u-1", { taskId: "t-1", minutes: 0 }, NOW),
    ).rejects.toThrow(/600/);
  });

  it("deletes the family's own entry and refuses teacher, old and other-family entries", async () => {
    const tables = db();
    await deleteFamilyPractice(fake(tables), ctx, "p-own", NOW);
    expect(tables.practice_log.some((row) => row.id === "p-own")).toBe(false);
    await expect(deleteFamilyPractice(fake(tables), ctx, "p-teacher", NOW)).rejects.toThrow(
      /teacher/,
    );
    await expect(deleteFamilyPractice(fake(tables), ctx, "p-old", NOW)).rejects.toThrow(/30 days/);
    await expect(deleteFamilyPractice(fake(tables), ctx, "p-other", NOW)).rejects.toThrow(/family/);
    await expect(deleteFamilyPractice(fake(tables), ctx, "missing", NOW)).rejects.toThrow(/family/);
  });
});
