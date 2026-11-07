import type { ChildAnswers, FamilyAnswers } from "@/mocks/invitations";
import { isAdultStudent } from "@/lib/enrolment";

export type FlowStudent = { id: string; firstName: string; lastName: string; birthYear: number };

export type StepDef =
  | { id: "collection"; kind: "family" }
  | { id: "filler"; kind: "family" }
  | { id: "mobile"; kind: "family" }
  | { id: `child:${string}:identity`; kind: "child"; studentId: string }
  | { id: `child:${string}:experience`; kind: "child"; studentId: string }
  | { id: `child:${string}:previousGrades`; kind: "child"; studentId: string }
  | { id: `child:${string}:theoryExams`; kind: "child"; studentId: string }
  | { id: `child:${string}:instrument`; kind: "child"; studentId: string }
  | { id: `child:${string}:goal`; kind: "child"; studentId: string }
  | { id: `child:${string}:examBoard`; kind: "child"; studentId: string }
  | { id: `child:${string}:goalOther`; kind: "child"; studentId: string }
  | { id: `child:${string}:days`; kind: "child"; studentId: string }
  | { id: `child:${string}:minutes`; kind: "child"; studentId: string }
  | { id: `child:${string}:notes`; kind: "child"; studentId: string }
  | { id: `child:${string}:emergency`; kind: "child"; studentId: string }
  | { id: `child:${string}:healthConsent`; kind: "child"; studentId: string }
  | { id: `child:${string}:media`; kind: "child"; studentId: string }
  | { id: "terms"; kind: "family" }
  | { id: "review"; kind: "family" }
  | { id: "done"; kind: "family" };

export function buildSteps(
  students: FlowStudent[],
  answers: FamilyAnswers & { children?: Record<string, ChildAnswers> },
): StepDef[] {
  const steps: StepDef[] = [
    { id: "collection", kind: "family" },
    { id: "filler", kind: "family" },
    { id: "mobile", kind: "family" },
  ];
  for (const student of students) {
    const child = answers.children?.[student.id];
    steps.push({ id: `child:${student.id}:identity`, kind: "child", studentId: student.id });
    steps.push({ id: `child:${student.id}:experience`, kind: "child", studentId: student.id });
    if (child?.experience === "transferring") {
      steps.push({
        id: `child:${student.id}:previousGrades`,
        kind: "child",
        studentId: student.id,
      });
      steps.push({ id: `child:${student.id}:theoryExams`, kind: "child", studentId: student.id });
    }
    steps.push({ id: `child:${student.id}:instrument`, kind: "child", studentId: student.id });
    steps.push({ id: `child:${student.id}:goal`, kind: "child", studentId: student.id });
    if (child?.goalKind === "exams")
      steps.push({ id: `child:${student.id}:examBoard`, kind: "child", studentId: student.id });
    if (child?.goalKind === "other")
      steps.push({ id: `child:${student.id}:goalOther`, kind: "child", studentId: student.id });
    steps.push({ id: `child:${student.id}:days`, kind: "child", studentId: student.id });
    steps.push({ id: `child:${student.id}:minutes`, kind: "child", studentId: student.id });
    steps.push({ id: `child:${student.id}:notes`, kind: "child", studentId: student.id });
    steps.push({ id: `child:${student.id}:emergency`, kind: "child", studentId: student.id });
    const notes = `${child?.healthNotes ?? ""}${child?.teacherNotes ?? ""}`.trim();
    if (notes)
      steps.push({ id: `child:${student.id}:healthConsent`, kind: "child", studentId: student.id });
    steps.push({ id: `child:${student.id}:media`, kind: "child", studentId: student.id });
  }
  steps.push(
    { id: "terms", kind: "family" },
    { id: "review", kind: "family" },
    { id: "done", kind: "family" },
  );
  return steps;
}

export function allStudentsAdult(students: FlowStudent[]) {
  return students.every((student) => isAdultStudent(student.birthYear));
}

export function goalLabel(child: ChildAnswers): string {
  if (child.goalKind === "exams") return `Exams (${child.examBoard ?? "unsure"})`;
  if (child.goalKind === "fun") return "Play for fun";
  if (child.goalKind === "school") return "School music";
  if (child.goalKind === "other") return child.goalOther?.trim() || "Other";
  return "";
}
