import { afterEach, describe, expect, it } from "vitest";
import { courseReadiness, itemPercent, lastSignOff, sectionProgress } from "@/lib/course-progress";
import { BENCHMARK_LEVELS, PILLARS, benchmarkLevelForGrade, repertoireSlotLabels } from "@/lib/benchmarks";
import { courseFeedback, courseItems, frameworkSections, frameworkSlots, studentCourses, termMilestones } from "@/mocks/curriculum";
import { getStudentCourse, scoreCourseItem, startBenchmarkCourse } from "@/services/curriculum";
import { getParentProgress } from "@/services/parent";
import type { CourseItem, FrameworkSection } from "@/mocks/types";

const saved = {
  items: structuredClone(courseItems),
  feedback: structuredClone(courseFeedback),
  courses: structuredClone(studentCourses),
  milestones: structuredClone(termMilestones),
  sections: structuredClone(frameworkSections),
  slots: structuredClone(frameworkSlots),
};
afterEach(() => {
  courseItems.splice(0, courseItems.length, ...structuredClone(saved.items));
  courseFeedback.splice(0, courseFeedback.length, ...structuredClone(saved.feedback));
  studentCourses.splice(0, studentCourses.length, ...structuredClone(saved.courses));
  termMilestones.splice(0, termMilestones.length, ...structuredClone(saved.milestones));
  frameworkSections.splice(0, frameworkSections.length, ...structuredClone(saved.sections));
  frameworkSlots.splice(0, frameworkSlots.length, ...structuredClone(saved.slots));
});

const base = { studentCourseId: "c", updatedAt: "2027-01-01", stage: 1 as const };

describe("Keystone grade benchmark", () => {
  it("covers Foundation to Grade 8 with all four pillars, weighted 40/20/20/20", () => {
    expect(BENCHMARK_LEVELS.map((level) => level.label)).toEqual(["Foundation", ...Array.from({ length: 8 }, (_, i) => `Grade ${i + 1}`)]);
    expect(PILLARS.map((pillar) => pillar.weightPct)).toEqual([40, 20, 20, 20]);
    for (const level of BENCHMARK_LEVELS) for (const pillar of PILLARS) expect(level.pillars[pillar.id].summary.length).toBeGreaterThan(20);
  });

  it("matches free-text grades to a level and labels slots per pathway", () => {
    expect(benchmarkLevelForGrade("AMEB Grade 2")?.id).toBe("grade-2");
    expect(benchmarkLevelForGrade("Preliminary")?.id).toBe("foundation");
    expect(benchmarkLevelForGrade("Personal repertoire")).toBeUndefined();
    expect(repertoireSlotLabels("AMEB", 3)).toEqual(["List A", "List B", "List C"]);
    expect(repertoireSlotLabels("recreational", 2)).toEqual(["Piece 1", "Piece 2"]);
  });

  it("scores pieces by stage, technical 0/50/100 and checklists 0/100", () => {
    expect(itemPercent({ stage: 3 })).toBe(60);
    expect(itemPercent({ kind: "technical", stage: 1, score: 50 })).toBe(50);
    expect(itemPercent({ kind: "checklist", stage: 1, score: 50 })).toBe(0);
    const sections: FrameworkSection[] = PILLARS.map((pillar) => ({ id: pillar.id, framework: "Custom", grade: "Grade 2", name: pillar.name, weightPct: pillar.weightPct }));
    const items: CourseItem[] = [
      { ...base, id: "p", sectionId: "repertoire", title: "Piece", stage: 5 },
      { ...base, id: "t1", sectionId: "technical", title: "C major", kind: "technical", score: 100 },
      { ...base, id: "t2", sectionId: "technical", title: "G major", kind: "technical", score: 50 },
      { ...base, id: "th", sectionId: "theory", title: "6/8 time", kind: "checklist", score: 100 },
    ];
    // 40*100 + 20*75 + 20*100 + 20*0 = 7500 / 100
    expect(courseReadiness(sections, items)).toBe(75);
    expect(sectionProgress(sections, items).find((row) => row.sectionId === "technical")).toEqual({ sectionId: "technical", done: 1, total: 2, pct: 75 });
    expect(lastSignOff([{ createdAt: "2027-01-02", outcome: "pass" }, { createdAt: "2027-03-01", outcome: "carry_over" }])).toBe("2027-01-02");
  });

  it("starts a benchmark course, archives the old one and shows the family the goal and counts", async () => {
    const before = await getStudentCourse("stu-1");
    const data = await startBenchmarkCourse("stu-1", { levelId: "grade-2", pathway: "AMEB", targetTerm: "2027-T4" });
    expect(studentCourses.find((course) => course.id === before.course.id)?.status).toBe("archived");
    expect(data.course).toMatchObject({ framework: "AMEB", grade: "Grade 2", benchmarkLevel: "grade-2", targetTerm: "2027-T4" });
    expect(data.sections.map((section) => [section.name, section.weightPct])).toEqual(PILLARS.map((pillar) => [pillar.name, pillar.weightPct]));
    expect(data.slots.map((slot) => slot.label)).toEqual(["List A", "List B", "List C"]);
    expect(data.items.every((item) => item.kind !== undefined && item.kind !== "piece")).toBe(true);
    expect(data.readiness).toBe(0);

    const scale = data.items.find((item) => item.kind === "technical")!;
    const afterScore = await scoreCourseItem({ studentId: "stu-1", courseItemId: scale.id, score: 100 });
    expect(afterScore.items.find((item) => item.id === scale.id)?.score).toBe(100);
    expect(afterScore.readiness).toBe(5); // 20% weight * (100 / 4 technical items)
    expect(afterScore.lastSignOffAt).toBeTruthy();

    const theory = data.items.find((item) => item.kind === "checklist")!;
    await expect(scoreCourseItem({ studentId: "stu-1", courseItemId: theory.id, score: 50 })).rejects.toThrow("valid score");

    const [lucy] = await getParentProgress();
    expect(lucy?.course.benchmark?.id).toBe("grade-2");
    expect(lucy?.course.targetTerm).toBe("2027-T4");
    expect(lucy?.course.sections.find((section) => section.name === "Technical work")).toMatchObject({ done: 1, total: 4 });
  });
});
