import { describe, expect, it } from "vitest";
import { copyTemplate, getLibrary, saveContent, saveCourseTemplate } from "@/services/library";
import {
  assignCourseTemplate,
  getCourseAssignmentOptions,
  getStudentCourse,
} from "@/services/curriculum";
import { getParentAssignments, getAssignmentEditor, saveAssignment } from "@/services/assignments";
import { getParentSession } from "@/services/parent";
import { getTodayLessons } from "@/services/schedule";
import { buildCourseSnapshot, newCourseTemplate, termAfter } from "@/lib/course-snapshot";
import { courseItems, studentCourses } from "@/mocks/curriculum";
import { messages } from "@/mocks/data";

async function studioTemplate(name: string) {
  const template = {
    ...newCourseTemplate(),
    name,
    grade: "Grade 2",
    sections: [
      { name: "Repertoire", weightPct: 60, items: ["Minuet in G", "", "  Gavotte  "] },
      { name: "Technique", weightPct: 40, items: ["C major scale"] },
    ],
  };
  await saveCourseTemplate(template);
  return template.id;
}

describe("course templates", () => {
  it("starts a blank Custom template with one full-weight section", () => {
    const template = newCourseTemplate();
    expect(template).toMatchObject({ framework: "Custom", supplied: false, name: "" });
    expect(template.sections).toEqual([{ name: "", weightPct: 100, items: [] }]);
  });

  it("saves a new studio template, dropping blank item lines", async () => {
    const id = await studioTemplate("Grade 2 tailored");
    const saved = (await getLibrary()).courses.find((course) => course.id === id);
    expect(saved?.supplied).toBe(false);
    expect(saved?.sections[0]?.items).toEqual(["Minuet in G", "Gavotte"]);
  });

  it("still checks weights and items, and protects supplied templates", async () => {
    const bad = {
      ...newCourseTemplate(),
      name: "Uneven",
      sections: [{ name: "A", weightPct: 90, items: ["x"] }],
    };
    await expect(saveCourseTemplate(bad)).rejects.toThrow("100%");
    const empty = {
      ...newCourseTemplate(),
      name: "Empty",
      sections: [{ name: "A", weightPct: 100, items: ["  "] }],
    };
    await expect(saveCourseTemplate(empty)).rejects.toThrow("100%");
    const supplied = (await getLibrary()).courses.find((course) => course.supplied);
    if (!supplied) throw new Error("fixture");
    await expect(saveCourseTemplate({ ...supplied, name: "Mine" })).rejects.toThrow("Copy");
  });

  it("builds the same deep copy for every student", () => {
    expect(termAfter("2027-T3", 2)).toBe("2028-T1");
    const template = {
      ...newCourseTemplate(),
      name: "X",
      sections: [{ name: "A", weightPct: 100, items: ["one", "two"] }],
    };
    const snap = buildCourseSnapshot(template, {
      studentId: "s1",
      targetTerm: "2027-T4",
      weeklyPracticeGoalMin: 60,
      gradeHoursEstimate: 30,
      updatedAt: "2027-03-15T00:00:00Z",
    });
    expect(snap.course).toMatchObject({
      studentId: "s1",
      status: "active",
      templateId: template.id,
      name: "X",
    });
    expect(snap.sections[0]?.id).toBe(`${snap.course.id}-section-0`);
    expect(snap.items.map((item) => item.title)).toEqual(["one", "two"]);
    expect(snap.milestones.every((m) => m.termKey === "2027-T4")).toBe(true);
  });
});

describe("assign a course to existing students", () => {
  it("skips students on another course unless Replace is ticked, archives the old course, and is repeat-safe", async () => {
    const id = await studioTemplate("Assigned course");
    const [first, second] = await getCourseAssignmentOptions();
    if (!first || !second) throw new Error("fixture");
    expect(first.currentCourse).not.toBeNull();
    const oldCourse = (await getStudentCourse(first.studentId)).course;
    const oldItems = courseItems.filter((item) => item.studentCourseId === oldCourse.id).length;
    const before = messages.length;

    const skipped = await assignCourseTemplate({
      templateId: id,
      studentIds: [first.studentId, second.studentId],
      targetTerm: "2027-T3",
    });
    expect(skipped.assigned).toEqual([]);
    expect(skipped.skipped.map((s) => s.reason)).toEqual(["has_course", "has_course"]);

    const done = await assignCourseTemplate({
      templateId: id,
      studentIds: [first.studentId, second.studentId],
      targetTerm: "2027-T3",
      replace: [first.studentId],
    });
    expect(done.assigned).toEqual([first.studentId]);
    expect(done.skipped).toEqual([{ studentId: second.studentId, reason: "has_course" }]);

    const now = await getStudentCourse(first.studentId);
    expect(now.course.templateId).toBe(id);
    expect(now.items.map((item) => item.title)).toEqual([
      "Minuet in G",
      "Gavotte",
      "C major scale",
    ]);
    expect(now.course.weeklyPracticeGoalMin).toBe(oldCourse.weeklyPracticeGoalMin);
    const archived = studentCourses.find((course) => course.id === oldCourse.id);
    expect(archived?.status).toBe("archived");
    expect(courseItems.filter((item) => item.studentCourseId === oldCourse.id)).toHaveLength(
      oldItems,
    );
    expect(messages.length).toBe(before + 1);
    expect(messages.at(-1)?.body).toContain("has started Assigned course");

    const again = await assignCourseTemplate({
      templateId: id,
      studentIds: [first.studentId],
      targetTerm: "2027-T3",
      replace: [first.studentId],
    });
    expect(again).toEqual({
      assigned: [],
      skipped: [{ studentId: first.studentId, reason: "already_on_course" }],
    });
    expect(
      studentCourses.filter(
        (course) => course.studentId === first.studentId && course.status === "active",
      ),
    ).toHaveLength(1);
  });

  it("refuses supplied templates, unknown students and bad terms", async () => {
    const supplied = (await getLibrary()).courses.find((course) => course.supplied);
    const [option] = await getCourseAssignmentOptions();
    if (!supplied || !option) throw new Error("fixture");
    await expect(
      assignCourseTemplate({
        templateId: supplied.id,
        studentIds: [option.studentId],
        targetTerm: "2027-T3",
      }),
    ).rejects.toThrow("Copy this template");
    await copyTemplate("courses", supplied.id);
    const copy = (await getLibrary()).courses.at(-1);
    if (!copy) throw new Error("fixture");
    await expect(
      assignCourseTemplate({ templateId: copy.id, studentIds: ["nobody"], targetTerm: "2027-T3" }),
    ).rejects.toThrow("Student not found");
    await expect(
      assignCourseTemplate({
        templateId: copy.id,
        studentIds: [option.studentId],
        targetTerm: "soon",
      }),
    ).rejects.toThrow("target term");
    await expect(
      assignCourseTemplate({ templateId: copy.id, studentIds: [], targetTerm: "2027-T3" }),
    ).rejects.toThrow("at least one");
  });
});

describe("attach a score to practice", () => {
  it("lets a task point at Library content and shows families only its title, kind and link", async () => {
    await saveContent({
      id: "score-minuet",
      kind: "file",
      title: "Minuet in G score",
      body: "Henle edition",
      url: "https://example.com/minuet.pdf",
      mediaPlaceholder: "private note",
    });
    const { children } = await getParentSession();
    const lesson = (await getTodayLessons()).lessons.find(
      (entry) =>
        children.some((child) => child.id === entry.studentId) && entry.status === "scheduled",
    );
    if (!lesson) throw new Error("fixture");
    const editor = await getAssignmentEditor(lesson.id);
    expect(editor.attachable.some((item) => item.id === "score-minuet")).toBe(true);
    expect(
      editor.attachable.every((item) =>
        ["file", "link", "video", "video_link", "audio"].includes(item.kind),
      ),
    ).toBe(true);

    const task = {
      id: crypto.randomUUID(),
      text: "Hands separately",
      contentItemId: "missing",
      minutesPerDay: 10,
      daysPerWeek: 5,
      submissionRequested: "none" as const,
      done: false,
    };
    await expect(
      saveAssignment({
        studentId: lesson.studentId,
        occurrenceId: lesson.id,
        dueDate: "2027-03-21",
        tasks: [task],
      }),
    ).rejects.toThrow();
    await saveAssignment({
      studentId: lesson.studentId,
      occurrenceId: lesson.id,
      dueDate: "2027-03-21",
      tasks: [{ ...task, contentItemId: "score-minuet" }],
    });
    expect(messages.at(-1)?.body).toContain("Minuet in G score");

    const parent = await getParentAssignments();
    expect(parent.attachments).toEqual([
      {
        id: "score-minuet",
        title: "Minuet in G score",
        kind: "file",
        url: "https://example.com/minuet.pdf",
      },
    ]);
  });
});
