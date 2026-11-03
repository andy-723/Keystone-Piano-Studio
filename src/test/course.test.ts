import { afterEach, describe, expect, it } from "vitest";
import { courseReadiness, hasNoFeedbackInThreeLessons, stageAfterFeedback } from "@/lib/course-progress";
import { courseItems, courseFeedback, studentCourses, termMilestones } from "@/mocks/curriculum";
import { students } from "@/mocks/data";
import { getStudentCourse, recordCourseFeedback, saveStudentCourse, getCourseReminders } from "@/services/curriculum";
import { getParentProgress } from "@/services/parent";
import type { CourseItem, Feedback, FrameworkSection } from "@/mocks/types";

const saved = { items: structuredClone(courseItems), feedback: structuredClone(courseFeedback), courses: structuredClone(studentCourses), milestones: structuredClone(termMilestones) };
afterEach(() => {
  courseItems.splice(0, courseItems.length, ...structuredClone(saved.items));
  courseFeedback.splice(0, courseFeedback.length, ...structuredClone(saved.feedback));
  studentCourses.splice(0, studentCourses.length, ...structuredClone(saved.courses));
  termMilestones.splice(0, termMilestones.length, ...structuredClone(saved.milestones));
});
describe("Student courses", () => {
  it("weights section averages 50/15/15/20 rather than letting item counts change the weights", () => {
    const sections: FrameworkSection[] = [50, 15, 15, 20].map((weightPct, i) => ({ id: `s${i}`, framework: "AMEB", grade: "Grade 4", name: `Section ${i}`, weightPct }));
    const items: CourseItem[] = [5, 3, 2, 1].map((stage, i) => ({ id: `i${i}`, studentCourseId: "c", sectionId: `s${i}`, title: "Work", stage: stage as CourseItem["stage"], updatedAt: "2027-03-15" }));
    items.push({ ...items[0] as CourseItem, id: "another-piece" });
    expect(courseReadiness(sections, items)).toBe(69);
    expect(courseReadiness([], items)).toBe(0);
    expect(courseReadiness(sections, [])).toBe(0);
  });
  it("maps stage 1 to 20 percent and stage 5 to 100 percent", () => {
    const section: FrameworkSection = { id: "s", name: "Repertoire", grade: "4", framework: "AMEB", weightPct: 50 };
    const item: CourseItem = { id: "i", studentCourseId: "c", sectionId: "s", title: "Piece", stage: 1, updatedAt: "2027-03-15" };
    expect(courseReadiness([section], [item])).toBe(20);
    expect(courseReadiness([section], [{ ...item, stage: 5 }])).toBe(100);
  });
  it("seeds every student and Amy's exact target, practice, tempo and bars", async () => {
    expect(students.every((student) => studentCourses.some((course) => course.studentId === student.id))).toBe(true);
    const amy = students.find((student) => student.firstName === "Amy"); if (!amy) throw new Error("Amy missing");
    const data = await getStudentCourse(amy.id);
    expect(data.course).toMatchObject({ framework: "AMEB", grade: "Grade 4", targetTerm: "2027-T3", weeklyPracticeGoalMin: 125 });
    expect(data.items.find((item) => item.composer === "Friedrich Kuhlau")).toMatchObject({ stage: 3, currentBpm: 76, targetBpm: 108, barsDone: 44, barsTotal: 68 });
    expect(data.items.find((item) => item.composer === "J. S. Bach")?.stage).toBe(5);
  });
  it("pass advances one checkpoint, caps at five, carry over and needs work preserve stage", () => {
    expect(stageAfterFeedback(2, "pass")).toBe(3);
    expect(stageAfterFeedback(5, "pass")).toBe(5);
    expect(stageAfterFeedback(3, "carry_over")).toBe(3);
    expect(stageAfterFeedback(3, "needs_work")).toBe(3);
    expect(stageAfterFeedback(2, "stage_move", 4)).toBe(4);
    expect(() => stageAfterFeedback(2, "stage_move")).toThrow("1 to 5");
  });
  it("creates feedback and updates readiness when moving to stage four; rejects another student's lesson", async () => {
    const data = await getStudentCourse("stu-1"); const item = data.items[0]; if (!item) throw new Error("Missing item");
    const result = await recordCourseFeedback({ studentId: "stu-1", courseItemId: item.id, occurrenceId: "stu-1_2027-03-15", outcome: "stage_move", newStage: 5, comment: "Lovely phrasing", shared: true });
    expect(result.items[0]?.stage).toBe(5);
    expect(result.readiness).toBe(55);
    expect(result.feedback.at(-1)).toMatchObject({ courseItemId: item.id, occurrenceId: "stu-1_2027-03-15", outcome: "stage_move", newStage: 5, comment: "Lovely phrasing", shared: true });
    await expect(recordCourseFeedback({ studentId: "stu-1", courseItemId: item.id, occurrenceId: "stu-2_2027-03-15", outcome: "pass" })).rejects.toThrow("does not belong");
  });
  it("requires three attended lessons and ignores feedback outside those lessons or for another item", () => {
    const feedback: Feedback = { id: "f", courseItemId: "sight", occurrenceId: "fourth", outcome: "carry_over", createdAt: "2027-03-01" };
    expect(hasNoFeedbackInThreeLessons(["sight"], ["one", "two"], [])).toBe(false);
    expect(hasNoFeedbackInThreeLessons(["sight"], ["one", "two", "three"], [feedback])).toBe(true);
    expect(hasNoFeedbackInThreeLessons(["sight"], ["one", "two", "three"], [{ ...feedback, occurrenceId: "two" }])).toBe(false);
    expect(hasNoFeedbackInThreeLessons(["sight"], ["one", "two", "three"], [{ ...feedback, courseItemId: "other", occurrenceId: "two" }])).toBe(true);
  });
  it("reminds Lucy about sight-reading after three attended lessons", async () => {
    expect(await getCourseReminders("stu-1", "2027-03-15")).toContain("Sight-reading");
  });
  it("saves term, title, composer and slot and removes milestones for deleted items", async () => {
    const data = await getStudentCourse("stu-1");
    const items = data.items.slice(1); const first = items[0]; if (!first) throw new Error("Missing item");
    first.title = "Teacher's own choice"; first.composer = "A composer";
    const result = await saveStudentCourse("stu-1", { targetTerm: "2027-T3", items });
    expect(result.course.targetTerm).toBe("2027-T3");
    expect(result.items[0]).toMatchObject({ title: "Teacher's own choice", composer: "A composer", slotId: first.slotId });
    expect(result.milestones.some((milestone) => milestone.courseItemId === data.items[0]?.id)).toBe(false);
  });
  it("parent responses include only own courses and latest shared comments, never private feedback or numeric metrics", async () => {
    const data = await getStudentCourse("stu-1"); const item = data.items[0]; if (!item) throw new Error("Missing item");
    await recordCourseFeedback({ studentId: "stu-1", courseItemId: item.id, outcome: "carry_over", comment: "Shared phrasing", shared: true });
    await recordCourseFeedback({ studentId: "stu-1", courseItemId: item.id, outcome: "needs_work", comment: "Private concern", shared: false });
    const parent = await getParentProgress();
    expect(parent.map((child) => child.student.id)).toEqual(["stu-1", "stu-2"]);
    expect(parent[0]?.course.items[0]?.comment).toBe("Shared phrasing");
    expect(JSON.stringify(parent.map((child) => child.course))).not.toContain("Private concern");
    expect(parent[0]?.course).not.toHaveProperty("feedback");
    expect(parent[0]?.course).not.toHaveProperty("weeklyPracticeGoalMin");
    expect(parent[0]?.course.items[0]).not.toHaveProperty("targetBpm");
  });
});