import { students, weeklySlots } from "./data";
import { addDays, melbourneIso, PROTOTYPE_TODAY, weekday } from "@/lib/calendar";
import type { CourseItem, CourseStage, Feedback, FrameworkSection, FrameworkSlot, Student, StudentCourse, TermMilestone } from "./types";

export const stageNames: Record<CourseStage, string> = { 1: "Notes learned", 2: "Hands together slowly", 3: "Up to speed", 4: "Polished", 5: "Exam ready" };
export const studentCourses: StudentCourse[] = [];
export const frameworkSections: FrameworkSection[] = [];
export const frameworkSlots: FrameworkSlot[] = [];
export const courseItems: CourseItem[] = [];
export const termMilestones: TermMilestone[] = [];
export const courseFeedback: Feedback[] = [];

/** Titles are teacher-entered mock examples, never a published syllabus or sheet music. */
export function seedStudentCourse(student: Student) {
  const existing = studentCourses.find((course) => course.studentId === student.id);
  if (existing) return existing;
  const index = students.findIndex((entry) => entry.id === student.id);
  const amy = student.firstName === "Amy" && student.lastName === "Liu";
  const exam = Boolean(student.examDate) || amy;
  const framework = amy ? "AMEB" : exam ? (["AMEB", "Trinity", "ABRSM"] as const)[Math.max(0, index) % 3] ?? "AMEB" : "Custom";
  const grade = amy ? "Grade 4" : exam ? weeklySlots.find((entry) => entry.studentId === student.id)?.gradeGoal.replace(/^AMEB /, "") ?? "Grade 1" : "Personal repertoire";
  const course: StudentCourse = { id: `course-${student.id}`, studentId: student.id, framework, grade, targetTerm: amy || student.targetTerm?.includes("Term 3") ? "2027-T3" : "2027-T2", weeklyPracticeGoalMin: amy ? 125 : exam ? 100 : 75, gradeHoursEstimate: amy ? 120 : exam ? 80 : 40, status: "active" };
  studentCourses.push(course);
  const groups: [string, number, [string, string, string?, CourseStage?][]][] = exam ? [
    ["Repertoire", 50, amy ? [["List A", "Prelude BWV 999", "J. S. Bach", 5], ["List B", "Sonatina Op. 55 No. 1", "Friedrich Kuhlau", 3], ["List C", "Waltz in A minor", "Frédéric Chopin", 2], ["List D", "Piece to choose", "", 1]] : [["List A", "Morning melody", "", 4], ["List B", "Little waltz", "", 3], ["List C", "Evening song", "", 2]]],
    ["Technical work", 15, Array.from({ length: 4 }, (_, i) => [`Scales group ${i + 1}`, `Scales group ${i + 1}`, "", (i < 2 ? 3 : 2) as CourseStage])],
    ["Musicianship", 15, [["Aural", "Aural", "", 3], ["Sight-reading", "Sight-reading", "", 2], ["General knowledge", "General knowledge", "", 2]]],
    ["Theory", 20, [["Theory", amy ? "Theory Grade 2: module 3 of 8" : "Theory workbook", "", 2]]],
  ] : [["Repertoire", 50, [["Own choice", "A favourite melody", "", 3], ["Duet", "Our duet", "", 2]]], ["Technical work", 15, [["Technique", "Even fingers and relaxed wrists", "", 3]]], ["Musicianship", 15, [["Listening", "Playing by ear", "", 2], ["Sight-reading", "Sight-reading", "", 2]]], ["Theory", 20, [["Theory", "Reading notes and rhythms", "", 3]]]];
  for (const [name, weightPct, entries] of groups) {
    const section: FrameworkSection = { id: `${course.id}-${name.replaceAll(" ", "-")}`, framework, grade, name, weightPct };
    frameworkSections.push(section);
    entries.forEach(([label, title, composer, stage], i) => {
      const slot = { id: `${section.id}-slot-${i}`, sectionId: section.id, label };
      frameworkSlots.push(slot);
      const item: CourseItem = { id: `${course.id}-item-${courseItems.filter((entry) => entry.studentCourseId === course.id).length}`, studentCourseId: course.id, sectionId: section.id, slotId: slot.id, title, composer: composer || undefined, stage: stage ?? 1, updatedAt: "2027-03-01T16:00:00+11:00" };
      if (amy && label === "List B") Object.assign(item, { currentBpm: 76, targetBpm: 108, barsDone: 44, barsTotal: 68 });
      courseItems.push(item);
      if (i === 0 || amy && label === "List B") termMilestones.push({ id: `milestone-${item.id}`, studentCourseId: course.id, courseItemId: item.id, termKey: "2027-T2", targetStage: 4 });
      const day = weeklySlots.find((entry) => entry.studentId === student.id)?.weekday ?? 1;
      let date = addDays(PROTOTYPE_TODAY, -1);
      while (weekday(date) !== day || date === "2027-03-08") date = addDays(date, -1);
      if (label !== "Sight-reading") courseFeedback.push({ id: `feedback-${item.id}`, courseItemId: item.id, occurrenceId: `${student.id}_${date}`, outcome: "needs_work", comment: "A lovely steady start. Keep the sound relaxed.", shared: true, createdAt: melbourneIso(date, "18:00") });
    });
  }
  return course;
}
students.forEach(seedStudentCourse);