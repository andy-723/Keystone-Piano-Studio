import type {
  CourseItem,
  CourseStage,
  CourseTemplate,
  FrameworkSection,
  StudentCourse,
  TermMilestone,
} from "@/mocks/types";

/** A blank studio course template for the Library's "New course template" button. */
export function newCourseTemplate(): CourseTemplate {
  return {
    id: crypto.randomUUID(),
    name: "",
    framework: "Custom",
    grade: "",
    sections: [{ name: "", weightPct: 100, items: [] }],
    defaultMilestones: [{ termOffset: 0, targetStage: 3 }],
    supplied: false,
  };
}

export type CourseSnapshot = {
  course: StudentCourse;
  sections: FrameworkSection[];
  items: CourseItem[];
  milestones: TermMilestone[];
};

/** The term `offset` terms after `termKey` ("2027-T3" + 2 = "2028-T1"). */
export function termAfter(termKey: string, offset: number) {
  const serial = Number(termKey.slice(0, 4)) * 4 + Number(termKey.slice(-1)) - 1 + offset;
  return `${Math.floor(serial / 4)}-T${(serial % 4) + 1}`;
}

/**
 * Deep-copies a course template onto one student: course, sections, items and milestones.
 * Used by enrolment activation and by "Assign to students" so both make the same copy.
 */
export function buildCourseSnapshot(
  template: CourseTemplate,
  input: {
    studentId: string;
    targetTerm: string;
    weeklyPracticeGoalMin: number;
    gradeHoursEstimate: number;
    startingStages?: Record<string, CourseStage>;
    updatedAt: string;
  },
): CourseSnapshot {
  const course: StudentCourse = {
    id: crypto.randomUUID(),
    studentId: input.studentId,
    framework: template.framework,
    grade: template.grade,
    targetTerm: input.targetTerm,
    weeklyPracticeGoalMin: input.weeklyPracticeGoalMin,
    gradeHoursEstimate: input.gradeHoursEstimate,
    status: "active",
    templateId: template.id,
    name: template.name,
  };
  // Curriculum reads course-owned sections via this stable prefix.
  const sections: FrameworkSection[] = template.sections.map((section, index) => ({
    id: `${course.id}-section-${index}`,
    framework: template.framework,
    grade: template.grade,
    name: section.name,
    weightPct: section.weightPct,
  }));
  const items: CourseItem[] = template.sections.flatMap((section, index) =>
    section.items.map((title) => ({
      id: crypto.randomUUID(),
      studentCourseId: course.id,
      sectionId: sections[index]?.id ?? "",
      title,
      stage: input.startingStages?.[section.name] ?? (1 as CourseStage),
      updatedAt: input.updatedAt,
    })),
  );
  const milestones: TermMilestone[] = template.defaultMilestones.flatMap((milestone) =>
    items.map((item) => ({
      id: crypto.randomUUID(),
      studentCourseId: course.id,
      courseItemId: item.id,
      termKey: termAfter(input.targetTerm, milestone.termOffset),
      targetStage: milestone.targetStage,
    })),
  );
  return { course, sections, items, milestones };
}
