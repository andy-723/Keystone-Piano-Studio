import { describe, expect, it, beforeEach } from "vitest";
import {
  familyLessons,
  familyNews,
  familySafeCourse,
  newsVisibleToFamily,
  wallClockIso,
  type FamilyNewsRow,
} from "@/lib/family-portal";
import { familyContextForUser, loadFamilyPortal } from "@/server/family-portal";
import type { CourseDocument } from "@/services/live/course-store";
import type { LessonSeries } from "@/lib/lesson-calendar";
import { familyPortalState, loadLiveFamilyPortal } from "@/services/live/family-store";
import { newsState } from "@/mocks/news";
import { studentCourses, courseFeedback } from "@/mocks/curriculum";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** A tiny stand-in for the Supabase query builder: eq / in / lte / overlaps filters, the rest pass. */
function fake(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: any) => boolean> = [];
      const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
        in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), q),
        lte: (k: string, v: string) => (filters.push((r) => r[k] <= v), q),
        overlaps: (k: string, v: unknown[]) => (
          filters.push((r) => (r[k] ?? []).some((x: unknown) => v.includes(x))),
          q
        ),
        or: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null }),
      };
      return q;
    },
  } as never;
}

const NOW = new Date("2026-12-01T01:00:00Z"); // Tue 1 Dec 2026, 12 pm in Sydney

function post(over: Partial<FamilyNewsRow> & { id: string; studio_id?: string }): any {
  return {
    studio_id: "s-a",
    author_name: "Ms A",
    title: over.id,
    body: "Body",
    tag: "news",
    audience: { kind: "studio" },
    important: false,
    status: "published",
    publish_at: "2026-11-20T00:00:00Z",
    pinned_until: null,
    expires_at: null,
    event_date: null,
    edited_at: null,
    ...over,
  };
}

function course(id: string, studentId: string, status = "active"): any {
  const doc: CourseDocument = {
    course: {
      id,
      studentId,
      framework: "AMEB",
      grade: "Grade 2",
      targetTerm: "2027-T2",
      weeklyPracticeGoalMin: 100,
      gradeHoursEstimate: 40,
      status: "active",
    },
    sections: [],
    slots: [],
    items: [
      {
        id: `${id}-i1`,
        studentCourseId: id,
        sectionId: "x",
        title: "Minuet",
        stage: 2,
        updatedAt: "2026-11-01",
      },
    ],
    milestones: [],
    feedback: [
      {
        id: `${id}-f1`,
        courseItemId: `${id}-i1`,
        outcome: "needs_work",
        comment: "Shared: lovely tone",
        createdAt: "2026-11-01",
        shared: true,
      },
      {
        id: `${id}-f2`,
        courseItemId: `${id}-i1`,
        outcome: "needs_work",
        comment: "Private: talk to mum about fees",
        createdAt: "2026-11-02",
        shared: false,
      },
      {
        id: `${id}-f3`,
        courseItemId: `${id}-i1`,
        outcome: "pass",
        comment: "No flag means private",
        createdAt: "2026-11-03",
      },
    ],
  };
  return { id, studio_id: "s-a", student_id: studentId, status, data: doc };
}

const tables = {
  guardian: [
    { id: "g-1", studio_id: "s-a", family_id: "fam-1", user_id: "u-1", created_at: "2026-11-01" },
    { id: "g-2", studio_id: "s-a", family_id: "fam-2", user_id: "u-2", created_at: "2026-11-01" },
    // Revoked parent: 0020 clears user_id.
    { id: "g-3", studio_id: "s-a", family_id: "fam-3", user_id: null, created_at: "2026-11-01" },
  ],
  studio: [{ id: "s-a", timezone: "Australia/Sydney" }],
  student: [
    { id: "kid-1", studio_id: "s-a", family_id: "fam-1" },
    { id: "kid-2", studio_id: "s-a", family_id: "fam-2" },
  ],
  lesson_series: [
    {
      id: "ser-1",
      studio_id: "s-a",
      student_id: "kid-1",
      teacher_user_id: "t",
      repeat: "weekly",
      first_date: "2026-11-03",
      until_date: null,
      start_time: "16:00:00",
      duration_min: 30,
    },
    {
      id: "ser-2",
      studio_id: "s-a",
      student_id: "kid-2",
      teacher_user_id: "t",
      repeat: "weekly",
      first_date: "2026-11-03",
      until_date: null,
      start_time: "17:00:00",
      duration_min: 45,
    },
  ],
  lesson_exception: [
    {
      id: "ex-1",
      studio_id: "s-a",
      series_id: "ser-1",
      original_date: "2026-12-08",
      action: "cancel",
      new_date: null,
      new_start_time: null,
    },
    {
      id: "ex-2",
      studio_id: "s-a",
      series_id: "ser-1",
      original_date: "2026-12-15",
      action: "move",
      new_date: "2026-12-16",
      new_start_time: "15:30:00",
    },
  ],
  news_post: [
    post({ id: "all" }),
    post({ id: "fam-1-only", audience: { kind: "families", familyIds: ["fam-1"] } }),
    post({ id: "fam-2-only", audience: { kind: "families", familyIds: ["fam-2"] } }),
    post({ id: "my-students", audience: { kind: "my_students", familyIds: ["fam-1"] } }),
    post({ id: "group-kid-1", audience: { kind: "groups", groupIds: ["grp-1"] } }),
    post({ id: "group-kid-2", audience: { kind: "groups", groupIds: ["grp-2"] } }),
    post({
      id: "smart-group-saved",
      audience: { kind: "groups", groupIds: ["smart-grade-2"], familyIds: ["fam-1"] },
    }),
    post({ id: "draft", status: "draft" }),
    post({ id: "future", status: "scheduled", publish_at: "2026-12-05T00:00:00Z" }),
    post({ id: "expired", expires_at: "2026-11-25T00:00:00Z" }),
    post({ id: "other-studio", studio_id: "s-other" }),
  ],
  student_group: [
    { id: "grp-1", studio_id: "s-a", student_ids: ["kid-1", "kid-2"], archived: false },
    { id: "grp-2", studio_id: "s-a", student_ids: ["kid-2"], archived: false },
  ],
  student_course: [
    course("c-1", "kid-1"),
    course("c-2", "kid-2"),
    course("c-old", "kid-1", "archived"),
  ],
};

describe("family portal (server)", () => {
  it("finds the family from the verified user's own guardian row only", async () => {
    expect(await familyContextForUser(fake(tables), "u-1")).toEqual({
      studioId: "s-a",
      familyId: "fam-1",
      childIds: ["kid-1"],
      timeZone: "Australia/Sydney",
    });
    expect(await familyContextForUser(fake(tables), "nobody")).toBeNull();
  });

  it("sends only this family's lessons, news and courses", async () => {
    const ctx = (await familyContextForUser(fake(tables), "u-1"))!;
    const content = await loadFamilyPortal(fake(tables), ctx, NOW);
    expect(content.today).toBe("2026-12-01");

    expect(new Set(content.lessons.map((l) => l.studentId))).toEqual(new Set(["kid-1"]));
    expect(content.lessons.map((l) => [l.date, l.startTime, l.status])).toEqual([
      ["2026-12-01", "16:00", "scheduled"],
      ["2026-12-08", "16:00", "cancelled"],
      ["2026-12-16", "15:30", "moved"],
      ["2026-12-22", "16:00", "scheduled"],
    ]);

    expect(content.news.map((n) => n.id).sort()).toEqual(
      ["all", "fam-1-only", "group-kid-1", "my-students", "smart-group-saved"].sort(),
    );
    // Family-safe fields only.
    expect(Object.keys(content.news[0]!).sort()).toEqual(
      [
        "authorName",
        "body",
        "editedAt",
        "eventDate",
        "expiresAt",
        "id",
        "important",
        "pinnedUntil",
        "publishAt",
        "tag",
        "title",
      ].sort(),
    );

    expect(content.courses.map((c) => c.course.id)).toEqual(["c-1"]);
    expect(content.courses[0]!.feedback.map((f) => f.id)).toEqual(["c-1-f1"]);
    expect(JSON.stringify(content)).not.toContain("Private");
    expect(JSON.stringify(content)).not.toContain("kid-2");
  });
});

describe("family portal rules", () => {
  it("hides archived groups", () => {
    const row = post({ id: "g", audience: { kind: "groups", groupIds: ["grp"] } });
    expect(
      newsVisibleToFamily(
        row,
        "fam-1",
        ["kid-1"],
        [{ id: "grp", student_ids: ["kid-1"], archived: true }],
        NOW,
      ),
    ).toBe(false);
  });

  it("orders news newest first", () => {
    const rows = [
      post({ id: "old", publish_at: "2026-11-01T00:00:00Z" }),
      post({ id: "new", publish_at: "2026-11-28T00:00:00Z" }),
    ];
    expect(familyNews(rows, "fam-1", ["kid-1"], [], NOW).map((p) => p.id)).toEqual(["new", "old"]);
  });

  it("keeps only feedback marked shared", () => {
    expect(familySafeCourse(course("c", "k").data).feedback).toHaveLength(1);
  });

  it("lists 4 weeks of lessons from today", () => {
    const series: LessonSeries[] = [
      {
        id: "s",
        studioId: "x",
        studentId: "k",
        teacherUserId: "t",
        repeat: "weekly",
        firstDate: "2026-01-06",
        untilDate: null,
        startTime: "09:00",
        durationMin: 30,
        location: null,
        note: null,
        googleSyncStatus: "off",
        googleSyncError: null,
      },
    ];
    expect(familyLessons(series, [], ["k"], "2026-12-01").map((l) => l.date)).toEqual([
      "2026-12-01",
      "2026-12-08",
      "2026-12-15",
      "2026-12-22",
    ]);
    expect(familyLessons(series, [], ["other"], "2026-12-01")).toEqual([]);
  });

  it("shows the lesson's own wall-clock time", () => {
    expect(wallClockIso("2026-12-01", "16:00")).toBe("2026-12-01T16:00:00+11:00");
    expect(wallClockIso("2026-07-01", "16:00")).toBe("2026-07-01T16:00:00+10:00");
  });
});

describe("loadLiveFamilyPortal (browser)", () => {
  beforeEach(() => {
    newsState.demo.posts = [];
    studentCourses.splice(0);
    courseFeedback.splice(0);
  });
  const workspace = {
    mode: "live",
    studioId: "s-a",
    userId: "u-1",
    role: "guardian",
    guardianId: "g-1",
  } as const;

  it("puts the server's copy where the parent screens look", async () => {
    const ctx = (await familyContextForUser(fake(tables), "u-1"))!;
    const content = await loadFamilyPortal(fake(tables), ctx, NOW);
    await loadLiveFamilyPortal(workspace as never, "fam-1", async () => content);
    expect(familyPortalState.loaded).toBe(true);
    expect(familyPortalState.lessons).toHaveLength(4);
    expect(
      newsState.demo.posts.every(
        (p) => p.audience.kind === "families" && p.audience.familyIds?.[0] === "fam-1",
      ),
    ).toBe(true);
    expect(studentCourses.map((c) => c.id)).toEqual(["c-1"]);
  });

  it("does nothing for staff and survives a failed load", async () => {
    await loadLiveFamilyPortal({ ...workspace, role: "owner" } as never, "fam-1", async () => {
      throw new Error("should not be called");
    });
    expect(familyPortalState.loaded).toBe(false);
    await loadLiveFamilyPortal(workspace as never, "fam-1", async () => {
      throw new Error("network");
    });
    expect(familyPortalState.loaded).toBe(false);
  });
});
